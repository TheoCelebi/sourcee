import {
  articles,
  type Database,
  events,
  eventThemes,
  eventZones,
  sources,
  type SummaryStatus,
  summaries,
  themes,
  zones,
} from "@sourcee/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { parisDay } from "../cluster/day";
import { refreshEvents } from "../cluster/run";
import { mapWithConcurrency } from "../util/concurrency";
import type { SummaryModel } from "./model";
import { buildUserPrompt, PROMPT_VERSION, type SourceArticle } from "./prompt";
import { validateSummary } from "./validate";

/** Nombre maximal de sources envoyées au modèle pour un événement. */
const MAX_SOURCES = 8;

export interface SummarizeOptions {
  /** null : aucune clé configurée, seuls les événements sans source ouverte sont marqués. */
  model: SummaryModel | null;
  /** Nombre de journées traitées, aujourd'hui compris. */
  days: number;
  /** Seuls les N premiers événements de chaque journée sont résumés. */
  topPerDay: number;
  concurrency?: number;
  /** Délai avant de retenter un résumé en erreur dont les sources n'ont pas changé. */
  retryErrorsAfterMinutes?: number;
  now?: Date;
}

export interface SummarizeReport {
  candidates: number;
  summarized: number;
  insufficient: number;
  unavailable: number;
  errors: number;
  skipped: number;
  inputTokens: number;
  outputTokens: number;
}

interface Job {
  eventId: number;
  status: SummaryStatus;
  sources: SourceArticle[];
  inputIds: number[];
}

export async function summarizeEvents(
  db: Database,
  options: SummarizeOptions,
): Promise<SummarizeReport> {
  const now = options.now ?? new Date();
  const report: SummarizeReport = {
    candidates: 0,
    summarized: 0,
    insufficient: 0,
    unavailable: 0,
    errors: 0,
    skipped: 0,
    inputTokens: 0,
    outputTokens: 0,
  };

  const firstDay = parisDay(new Date(now.getTime() - (options.days - 1) * 86_400_000));
  const ranked = await db.execute<{ id: number; status: SummaryStatus }>(sql`
    SELECT id, summary_status AS status FROM (
      SELECT id, summary_status,
             row_number() OVER (PARTITION BY day ORDER BY score DESC, id) AS rank
      FROM ${events} WHERE day >= ${firstDay}
    ) ranked
    WHERE rank <= ${options.topPerDay}`);
  const candidates = ranked.rows.map((row) => ({ id: Number(row.id), status: row.status }));
  report.candidates = candidates.length;
  if (candidates.length === 0) return report;
  const ids = candidates.map((candidate) => candidate.id);

  // Seules les sources « open » alimentent le modèle ; les autres n'y sont jamais envoyées.
  const sourceRows = await db
    .select({
      eventId: articles.eventId,
      articleId: articles.id,
      sourceName: sources.name,
      kind: sources.kind,
      language: articles.language,
      publishedAt: articles.publishedAt,
      title: articles.title,
      excerpt: articles.excerpt,
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(
      and(
        inArray(articles.eventId, ids),
        eq(sources.policy, "open"),
        eq(articles.contentType, "news"),
      ),
    )
    .orderBy(articles.publishedAt, articles.id);
  const openSources = new Map<number, SourceArticle[]>();
  for (const row of sourceRows) {
    if (row.eventId === null) continue;
    const list = openSources.get(row.eventId) ?? [];
    if (list.length < MAX_SOURCES) {
      list.push({ ...row, official: row.kind === "official" });
      openSources.set(row.eventId, list);
    }
  }

  const previous = new Map<
    number,
    { status: SummaryStatus; inputIds: number[]; createdAt: Date }
  >();
  const lastRows = await db.execute<{
    event_id: number;
    status: SummaryStatus;
    input_article_ids: number[] | string[];
    created_at: Date | string;
  }>(sql`
    SELECT DISTINCT ON (event_id) event_id, status, input_article_ids, created_at
    FROM ${summaries} WHERE event_id IN ${ids}
    ORDER BY event_id, created_at DESC`);
  for (const row of lastRows.rows) {
    previous.set(Number(row.event_id), {
      status: row.status,
      inputIds: row.input_article_ids.map(Number),
      createdAt: new Date(row.created_at),
    });
  }

  const jobs: Job[] = [];
  for (const candidate of candidates) {
    const list = openSources.get(candidate.id) ?? [];
    if (list.length === 0) {
      if (candidate.status !== "unavailable") {
        await db
          .update(events)
          .set({ summaryStatus: "unavailable", summary: null, titleFromSource: true })
          .where(eq(events.id, candidate.id));
      }
      report.unavailable += 1;
      continue;
    }
    const inputIds = list.map((source) => source.articleId).sort((a, b) => a - b);
    const last = previous.get(candidate.id);
    const sameInputs = last && last.inputIds.join(",") === inputIds.join(",");
    const retryAfter = (options.retryErrorsAfterMinutes ?? 60) * 60_000;
    if (
      sameInputs &&
      (last.status !== "error" || now.getTime() - last.createdAt.getTime() < retryAfter)
    ) {
      report.skipped += 1;
      continue;
    }
    jobs.push({ eventId: candidate.id, status: candidate.status, sources: list, inputIds });
  }

  const model = options.model;
  if (!model || jobs.length === 0) {
    report.skipped += jobs.length;
    return report;
  }

  const themeIds = new Map((await db.select().from(themes)).map((t) => [t.slug, t.id]));
  const zoneIds = new Map((await db.select().from(zones)).map((z) => [z.slug, z.id]));
  const done: number[] = [];

  await mapWithConcurrency(jobs, options.concurrency ?? model.concurrency ?? 3, async (job) => {
    const result = await model.summarize(buildUserPrompt(job.sources));
    const base = {
      eventId: job.eventId,
      model: model.name,
      promptVersion: PROMPT_VERSION,
      inputArticleIds: job.inputIds,
    };

    if (result.kind !== "ok") {
      await db
        .insert(summaries)
        .values({ ...base, output: { [result.kind]: result.reason }, status: "error" });
      // Un résumé valide déjà publié reste en place ; sinon l'événement passe en erreur.
      if (job.status !== "ok") {
        await db.update(events).set({ summaryStatus: "error" }).where(eq(events.id, job.eventId));
      }
      report.errors += 1;
      return;
    }

    const validated = validateSummary(result.summary, job.sources);
    report.inputTokens += result.inputTokens;
    report.outputTokens += result.outputTokens;
    await db.transaction(async (tx) => {
      await tx.insert(summaries).values({
        ...base,
        output: result.summary,
        rejectedSentences: validated.rejected,
        status: validated.status,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });

      if (validated.status !== "ok") {
        await tx
          .update(events)
          .set({
            summary: null,
            summaryStatus: "insufficient",
            summarizedAt: now,
            titleFromSource: true,
          })
          .where(eq(events.id, job.eventId));
        report.insufficient += 1;
        return;
      }

      await tx
        .update(events)
        .set({
          summary: validated.sentences,
          summaryStatus: "ok",
          summarizedAt: now,
          ...(validated.title
            ? { title: validated.title, titleFromSource: false }
            : { titleFromSource: true }),
        })
        .where(eq(events.id, job.eventId));

      const themeRows = validated.themes.flatMap((slug) => {
        const themeId = themeIds.get(slug);
        return themeId ? [{ eventId: job.eventId, themeId }] : [];
      });
      if (themeRows.length) {
        await tx.delete(eventThemes).where(eq(eventThemes.eventId, job.eventId));
        await tx.insert(eventThemes).values(themeRows);
      }
      const zoneRows = validated.zones.flatMap((slug) => {
        const zoneId = zoneIds.get(slug);
        return zoneId ? [{ eventId: job.eventId, zoneId }] : [];
      });
      if (zoneRows.length) {
        await tx.delete(eventZones).where(eq(eventZones.eventId, job.eventId));
        await tx.insert(eventZones).values(zoneRows);
      }
      report.summarized += 1;
    });
    done.push(job.eventId);
  });

  // Titre (si on revient au titre d'origine) et texte de recherche à jour.
  await refreshEvents(db, done);
  return report;
}

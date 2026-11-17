import type { ApiArticle, ApiEvent, SummaryState } from "@sourcee/shared";
import { Fragment } from "react";
import { hhmm, NBSP, plural, splitFinalPunctuation, themeLabel, zoneLabel } from "../format";

const SUMMARY_MESSAGES: Record<Exclude<SummaryState, "ok">, string> = {
  insufficient:
    "Informations insuffisantes : les sources ouvertes à l'analyse ne permettent pas un résumé fiable.",
  unavailable:
    "Informations insuffisantes pour un résumé : aucune source ouverte à l'analyse ne couvre cet événement. Seuls les titres et les liens des médias sont affichés.",
  pending: "Résumé en préparation. En attendant, voici les sources.",
  error: "Résumé momentanément indisponible. Les sources restent consultables ci-dessous.",
};

export function kicker(event: ApiEvent): string {
  return [...event.themes.map(themeLabel), ...event.zones.map(zoneLabel)].join(" · ");
}

/** Statut affiché : un résumé « ok » sans phrase affichable vaut « informations insuffisantes ». */
export function summaryState(event: ApiEvent): SummaryState {
  if (event.summary.status === "ok" && event.summary.sentences.length === 0) return "insufficient";
  return event.summary.status;
}

/** Numéros des sources du résumé, dans l'ordre de leur première citation. */
export function sourceNumbers(event: ApiEvent): Map<number, number> {
  const shown = new Set(event.articles.map((article) => article.id));
  const numbers = new Map<number, number>();
  for (const sentence of event.summary.sentences) {
    for (const id of sentence.articleIds) {
      if (shown.has(id) && !numbers.has(id)) numbers.set(id, numbers.size + 1);
    }
  }
  return numbers;
}

/** Notes de transparence : reprise d'agence, ou média d'un groupe déjà compté. */
function provenanceNotes(articles: ApiArticle[]): Map<number, string> {
  const notes = new Map<number, string>();
  const firstOfGroup = new Map<string, string>();
  for (const article of articles) {
    if (article.source.kind !== "media") continue;
    if (article.agency) {
      notes.set(article.id, `reprend une dépêche ${article.agency}`);
      continue;
    }
    const first = firstOfGroup.get(article.source.group);
    if (!first) firstOfGroup.set(article.source.group, article.source.name);
    else if (first !== article.source.name)
      notes.set(article.id, `même groupe que ${first} : compté une fois`);
  }
  return notes;
}

export function StatusPill({ event }: { event: ApiEvent }) {
  const confirmed = event.verification === "confirmed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-2 text-[12.5px] leading-none font-medium ${
        confirmed ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"
      }`}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 flex-none">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {confirmed ? (
          <path
            d="M5 8.2l2 2 4-4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <path d="M8 4.6v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="8" cy="11.3" r=".95" fill="currentColor" />
          </>
        )}
      </svg>
      {confirmed
        ? `Confirmé · ${plural(event.independentOrigins, "origine indépendante", "origines indépendantes")}`
        : "Source unique · à confirmer"}
    </span>
  );
}

function ArticleItem({
  article,
  eventId,
  number,
  note,
}: {
  article: ApiArticle;
  eventId: number;
  number?: number;
  note?: string;
}) {
  return (
    <li
      id={`e${eventId}-a${article.id}`}
      className={`src-item -mx-2 grid gap-2 rounded-md px-2 py-1.5 text-sm leading-snug ${
        number === undefined ? "grid-cols-1" : "grid-cols-[18px_minmax(0,1fr)]"
      }`}
    >
      {number !== undefined && (
        <span className="text-right text-xs leading-5 font-semibold text-accent">{number}</span>
      )}
      <div>
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold">{article.source.name}</span>
          {article.source.kind === "official" && (
            <span className="rounded bg-info-bg px-1.5 py-0.5 text-[11px] leading-none font-medium text-info">
              Officiel
            </span>
          )}
          <span className="text-[12.5px] whitespace-nowrap text-ink-3 tabular-nums">
            {article.language.toUpperCase()} · {hhmm(article.publishedAt)}
          </span>
        </span>
        <a
          className="block text-ink-2 no-underline hover:underline"
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          « {article.title} »<span aria-hidden="true">{`${NBSP}↗`}</span>
          <span className="sr-only"> (s'ouvre dans un nouvel onglet)</span>
        </a>
        {note && (
          <span className="mt-1 inline-block rounded border border-rule bg-sunk px-1.5 py-0.5 text-[11px] leading-none text-ink-2">
            {note}
          </span>
        )}
      </div>
    </li>
  );
}

export function EventCard({ event, lead = false }: { event: ApiEvent; lead?: boolean }) {
  const state = summaryState(event);
  const numbers = sourceNumbers(event);
  const notes = provenanceNotes(event.articles);
  const basis = event.articles
    .filter((article) => numbers.has(article.id))
    .sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0));
  const others = event.articles.filter((article) => !numbers.has(article.id));
  const otherNames = [...new Set(others.map((article) => article.source.name))];
  const label = kicker(event);

  return (
    <article
      id={`e${event.id}`}
      className="event grid scroll-mt-4 grid-cols-1 border-b border-rule py-6 md:grid-cols-[56px_minmax(0,1fr)] md:gap-x-4 md:py-7"
    >
      <div
        aria-hidden="true"
        className="mb-2 font-serif text-[22px] leading-none text-ink-3 italic md:mb-0 md:pt-0.5 md:text-[34px]"
      >
        {event.rank !== null ? String(event.rank).padStart(2, "0") : "·"}
      </div>
      <div className="min-w-0">
        {(lead || label) && (
          <p className="mb-2 text-[11.5px] leading-snug font-semibold tracking-[0.08em] text-accent uppercase">
            {lead && <span className="mr-2 border-r border-rule pr-2 text-ink">À la une</span>}
            {label}
          </p>
        )}

        {event.titleFromSource ? (
          <>
            <h3 className="mb-1 font-serif text-[22px] leading-tight font-medium text-balance italic md:text-[25px]">
              « {event.title} »
            </h3>
            {event.titleSourceName && (
              <p className="mb-3 text-[13px] text-ink-3">
                Titre d'origine · {event.titleSourceName}
              </p>
            )}
          </>
        ) : (
          <h3
            className={`mb-3 font-serif leading-tight font-semibold text-balance ${
              lead ? "text-[27px] md:text-[40px]" : "text-[22px] md:text-[25px]"
            }`}
          >
            {event.title}
          </h3>
        )}

        <p className="mb-3.5">
          <StatusPill event={event} />
        </p>

        {state === "ok" ? (
          <>
            <p
              className={`max-w-[66ch] font-serif leading-relaxed text-pretty ${lead ? "text-[17px] md:text-[19px]" : "text-[17px] md:text-[18px]"}`}
            >
              {event.summary.sentences.map((sentence, index) => {
                const [body, stop] = splitFinalPunctuation(sentence.text);
                const refs = sentence.articleIds.filter((id) => numbers.has(id));
                return (
                  <Fragment key={index}>
                    {index > 0 && " "}
                    {body}
                    <sup className="ml-px font-sans text-[11px] leading-none font-semibold">
                      {refs.map((id, position) => (
                        <Fragment key={id}>
                          {position > 0 && ","}
                          <a
                            className="px-px text-accent no-underline"
                            href={`#e${event.id}-a${id}`}
                            aria-label={`Source ${numbers.get(id)}`}
                          >
                            {numbers.get(id)}
                          </a>
                        </Fragment>
                      ))}
                    </sup>
                    {stop}
                  </Fragment>
                );
              })}
            </p>
            <div className="mt-4.5">
              <h4 className="label mb-2 text-[11px]">Résumé fondé sur</h4>
              <ol className="grid gap-1">
                {basis.map((article) => (
                  <ArticleItem
                    key={article.id}
                    article={article}
                    eventId={event.id}
                    number={numbers.get(article.id)}
                    note={notes.get(article.id)}
                  />
                ))}
              </ol>
            </div>
            {others.length > 0 && (
              <details className="also mt-3 text-sm">
                <summary className="cursor-pointer py-1 text-ink-2">
                  Également rapporté par {plural(otherNames.length, "média")}{" "}
                  <span className="text-ink-3">— {otherNames.join(", ")}</span>
                </summary>
                <ul className="mt-1.5 grid gap-1">
                  {others.map((article) => (
                    <ArticleItem
                      key={article.id}
                      article={article}
                      eventId={event.id}
                      note={notes.get(article.id)}
                    />
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <>
            <p className="max-w-[62ch] border-l-[3px] border-warn py-0.5 pl-3 font-serif text-[17px] leading-normal text-ink-2 italic">
              {SUMMARY_MESSAGES[state]}
            </p>
            <div className="mt-4.5">
              <h4 className="label mb-2 text-[11px]">Sources ({event.articles.length})</h4>
              <ul className="grid gap-1">
                {event.articles.map((article) => (
                  <ArticleItem
                    key={article.id}
                    article={article}
                    eventId={event.id}
                    note={notes.get(article.id)}
                  />
                ))}
              </ul>
            </div>
          </>
        )}

        {event.related.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-3">
            Même événement, regroupé à part :{" "}
            {event.related
              .map((related) => `« ${related.title} » (${plural(related.articleCount, "article")})`)
              .join(" ; ")}
          </p>
        )}
        <p className="mt-4 text-[12.5px] text-ink-3 tabular-nums">
          Première publication {hhmm(event.firstPublishedAt)}
          {event.lastPublishedAt !== event.firstPublishedAt &&
            ` · dernier article ${hhmm(event.lastPublishedAt)}`}
          {` · ${plural(event.articleCount, "article")}`}
        </p>
      </div>
    </article>
  );
}

/** Carte du mode « 1 minute » : titre, statut, première phrase et sources. */
export function MinuteCard({ event }: { event: ApiEvent }) {
  const state = summaryState(event);
  const numbers = sourceNumbers(event);
  const shown =
    state === "ok" ? event.articles.filter((article) => numbers.has(article.id)) : event.articles;
  const bySource = new Map<string, ApiArticle>();
  for (const article of shown)
    if (!bySource.has(article.source.name)) bySource.set(article.source.name, article);
  const rest = new Set(event.articles.map((article) => article.source.name)).size - bySource.size;
  const label = kicker(event);

  return (
    <article
      id={`e${event.id}`}
      className="event grid grid-cols-1 border-b border-rule py-5 md:grid-cols-[40px_minmax(0,1fr)] md:gap-x-3.5"
    >
      <div
        aria-hidden="true"
        className="mb-2 font-serif text-[22px] leading-none text-ink-3 italic md:mb-0 md:text-[28px]"
      >
        {event.rank !== null ? String(event.rank).padStart(2, "0") : "·"}
      </div>
      <div className="min-w-0">
        {label && (
          <p className="mb-2 text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">
            {label}
          </p>
        )}
        <h3
          className={`mb-2.5 font-serif text-[22px] leading-tight text-balance ${event.titleFromSource ? "font-medium italic" : "font-semibold"}`}
        >
          {event.titleFromSource ? `« ${event.title} »` : event.title}
        </h3>
        <p className="mb-3">
          <StatusPill event={event} />
        </p>
        <p className="max-w-[66ch] font-serif text-[17.5px] leading-normal">
          {state === "ok"
            ? event.summary.sentences[0]?.text
            : "Informations insuffisantes pour un résumé."}
        </p>
        <p className="mt-2.5 text-[13px] text-ink-3">
          Sources :{" "}
          {[...bySource.values()].map((article, index) => (
            <Fragment key={article.id}>
              {index > 0 && ", "}
              <a
                className="text-ink-2"
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {article.source.name}
              </a>
            </Fragment>
          ))}
          {rest > 0 && ` · et ${rest} ${rest > 1 ? "autres médias" : "autre média"}`}
        </p>
      </div>
    </article>
  );
}

import type { ApiSourceInfo } from "@sourcee/shared";
import { useQuery } from "@tanstack/react-query";
import { fetchSources } from "../api";
import { Masthead } from "../components/Layout";
import { plural } from "../format";

const LEVELS: Record<
  ApiSourceInfo["policy"],
  { title: string; description: string; tone: string }
> = {
  open: {
    title: "Ouvertes à l'analyse",
    description: "Aucune réserve constatée : ces sources alimentent les résumés.",
    tone: "bg-ok-bg text-ok",
  },
  links_only: {
    title: "Liens seulement",
    description:
      "L'éditeur bloque les robots d'IA : seuls le titre et le lien sont affichés, jamais envoyés à un modèle.",
    tone: "bg-info-bg text-info",
  },
  excluded: {
    title: "Non collectées",
    description:
      "Réserve formelle de fouille de textes, flux interdit aux robots, ou contrôle impossible.",
    tone: "bg-warn-bg text-warn",
  },
};

function evidence(source: ApiSourceInfo): string {
  const proof = source.evidence;
  if (!proof) return "Pas encore contrôlée.";
  if (proof.error) return proof.error;
  const parts: string[] = [];
  if (proof.tdmReserved) parts.push("réserve de fouille de textes (TDMRep)");
  if (!proof.feedAllowed) parts.push("flux interdit par robots.txt");
  if (proof.aiBotsBlocked.length)
    parts.push(`robots d'IA bloqués : ${proof.aiBotsBlocked.join(", ")}`);
  return parts.length ? `${parts.join(" ; ")}.` : "Aucune réserve.";
}

const DATE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "long",
  timeStyle: "short",
});

export function SourcesPage() {
  const sources = useQuery({ queryKey: ["sources"], queryFn: fetchSources });
  const lastCheck = sources.data
    ?.map((source) => source.policyCheckedAt)
    .filter((date): date is string => !!date)
    .sort()
    .at(-1);

  return (
    <>
      <Masthead
        left="Sources et conformité"
        center={
          sources.data ? plural(sources.data.length, "source suivie", "sources suivies") : undefined
        }
        right={lastCheck ? `Contrôle du ${DATE.format(new Date(lastCheck))}` : undefined}
      />
      <main id="contenu" className="pb-14">
        <p className="mt-6 max-w-[68ch] font-serif text-[17.5px] leading-relaxed text-ink-2">
          Le niveau de chaque source est recalculé chaque jour à partir de son robots.txt et de ses
          déclarations de réserve de fouille de textes : il ne dépend pas d'un choix éditorial de
          Sourcé.
        </p>
        {sources.isPending && (
          <p className="py-12 text-center font-serif text-lg text-ink-2 italic">
            Chargement des sources…
          </p>
        )}
        {sources.isError && (
          <p role="alert" className="py-12 text-center font-serif text-lg text-ink-2 italic">
            Les sources n'ont pas pu être chargées : {sources.error.message}
          </p>
        )}
        {sources.data &&
          (Object.keys(LEVELS) as ApiSourceInfo["policy"][]).map((policy) => {
            const list = sources.data.filter((source) => source.policy === policy);
            if (list.length === 0) return null;
            const level = LEVELS[policy];
            return (
              <section key={policy} className="double-rule mt-8 pt-3">
                <h2 className="font-serif text-2xl font-semibold">
                  {level.title}{" "}
                  <span className="font-sans text-base font-normal text-ink-3">
                    ({list.length})
                  </span>
                </h2>
                <p className="mt-1 mb-3 text-sm text-ink-2">{level.description}</p>
                <ul className="grid gap-px">
                  {list.map((source) => (
                    <li
                      key={source.slug}
                      className="grid gap-1 border-b border-rule py-3 md:grid-cols-[240px_minmax(0,1fr)] md:gap-4"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <a
                          href={source.homepageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold"
                        >
                          {source.name}
                        </a>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] leading-none font-medium ${source.kind === "official" ? "bg-info-bg text-info" : "bg-sunk text-ink-2"}`}
                        >
                          {source.kind === "official" ? "Institution" : "Média"}
                        </span>
                      </span>
                      <span className="text-sm text-ink-2">
                        <span
                          className={`mr-2 inline-block rounded-full px-2 py-1 text-[11.5px] leading-none font-medium ${level.tone}`}
                        >
                          {level.title}
                        </span>
                        {evidence(source)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
      </main>
    </>
  );
}

import type { ReactNode } from "react";
import { Link, Masthead, REPOSITORY_URL } from "../components/Layout";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="double-rule mt-8 pt-3">
      <h2 className="mb-3 font-serif text-2xl font-semibold">{title}</h2>
      <div className="grid max-w-[68ch] gap-3 font-serif text-[17.5px] leading-relaxed text-ink-2">
        {children}
      </div>
    </section>
  );
}

export function MethodologyPage() {
  return (
    <>
      <Masthead left="Méthodologie" center="Comment une édition est fabriquée" />
      <main id="contenu" className="pb-14">
        <Section title="La règle d'or : uniquement des faits">
          <p>
            Chaque information affichée renvoie à au moins un article cliquable : pas de source, pas
            d'affichage. Un événement n'est marqué « confirmé » que s'il est rapporté par au moins
            deux origines indépendantes ; sinon, il est signalé « source unique ».
          </p>
          <p>
            Deux médias d'un même groupe de presse comptent pour une seule origine, tout comme deux
            articles qui reprennent la même dépêche d'agence. Les institutions (Commission
            européenne, Insee…) sont affichées comme sources primaires mais ne comptent pas : une
            institution qui parle de ses propres actes n'est pas une confirmation indépendante.
          </p>
        </Section>

        <Section title="D'où viennent les articles">
          <p>
            Sourcé lit chaque heure les flux RSS publics d'institutions et de médias. Tribunes,
            éditoriaux, chroniques et contenus sponsorisés sont écartés. Seuls le titre, le lien et,
            pour les sources qui l'autorisent, le chapô du flux sont conservés ; aucun article n'est
            republié.
          </p>
          <p>
            Chaque jour, un contrôle automatique lit le fichier robots.txt et les réserves de
            fouille de textes (protocole TDMRep) de chaque éditeur. Trois niveaux en découlent :{" "}
            <strong>ouvert</strong> (la source peut alimenter les résumés),{" "}
            <strong>liens seulement</strong> (l'éditeur bloque les robots d'IA : seuls son titre et
            son lien sont affichés, jamais envoyés à un modèle) et <strong>exclu</strong> (réserve
            formelle de fouille de textes, ou flux interdit aux robots : rien n'est collecté). Le
            détail est sur la page <Link href="/sources">Sources et conformité</Link>.
          </p>
        </Section>

        <Section title="Comment les articles sont regroupés">
          <p>
            Les titres sont transformés en vecteurs par un modèle multilingue exécuté sur le serveur
            de Sourcé, sans service tiers. Les articles d'une même journée sont regroupés quand
            leurs titres se ressemblent assez en moyenne, et qu'aucune paire de titres n'est trop
            éloignée, ce qui évite de réunir des sujets seulement voisins.
          </p>
          <p>
            Limites connues : à partir des seuls titres, deux faits proches peuvent se retrouver
            ensemble, et un même événement couvert en plusieurs langues peut former deux groupes.
            Dans ce dernier cas, le second est replié sous le premier dans le classement. Le statut
            « confirmé » reste prudent : il exige deux origines indépendantes à l'intérieur d'un
            même groupe.
          </p>
        </Section>

        <Section title="Comment les résumés sont écrits et vérifiés">
          <p>
            Les résumés sont rédigés par un modèle de langue (Claude Haiku 5.5, d'Anthropic) à
            partir des seuls titres et chapôs des sources ouvertes. Consignes : neutralité, aucune
            spéculation, attribution des déclarations (« selon… »), chiffres repris tels quels.
          </p>
          <p>
            Chaque phrase est ensuite contrôlée par programme : elle doit citer des sources
            fournies, et chaque nombre comme chaque citation entre guillemets doivent figurer dans
            ces sources. Une phrase qui échoue est retirée. Sous deux phrases valides, l'événement
            affiche « informations insuffisantes » plutôt qu'un résumé incomplet.
          </p>
        </Section>

        <Section title="Transparence">
          <p>
            Le code de Sourcé est public :{" "}
            <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
              {REPOSITORY_URL.replace("https://", "")}
            </a>
            . Les titres et les liens appartiennent à leurs éditeurs.
          </p>
        </Section>
      </main>
    </>
  );
}

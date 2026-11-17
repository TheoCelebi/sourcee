import type { ApiStats } from "@sourcee/shared";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { navigate } from "../state";

export const REPOSITORY_URL = "https://github.com/TheoCelebi/sourcee";

/** Lien interne : navigation sans rechargement, sauf ouverture dans un nouvel onglet. */
export function Link({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

type Theme = "auto" | "light" | "dark";
const NEXT: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<Theme, string> = {
  auto: "Thème : auto",
  light: "Thème : clair",
  dark: "Thème : sombre",
};

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem("sourcee-theme");
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

export const toolButton =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-rule bg-transparent px-3 py-2 text-[13px] leading-none font-medium text-ink hover:border-ink-3 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("sourcee-theme", theme);
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la session.
    }
  }, [theme]);
  return (
    <button
      type="button"
      className={`${toolButton} flex-none`}
      title={LABEL[theme]}
      onClick={() => setTheme(NEXT[theme])}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[15px] flex-none">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" />
      </svg>
      {/* Sur petit écran, l'icône seule : le libellé reste lu par les lecteurs d'écran. */}
      <span className="sr-only sm:not-sr-only">{LABEL[theme]}</span>
    </button>
  );
}

const NAV = [
  { href: "/", label: "Édition" },
  { href: "/methodologie", label: "Méthodologie" },
  { href: "/sources", label: "Sources" },
];

export function TopBar({ path }: { path: string }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-3.5">
      <nav
        aria-label="Navigation principale"
        className="flex min-w-0 flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] font-semibold tracking-[0.06em] uppercase"
      >
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`no-underline ${path === item.href ? "text-ink" : "text-ink-3 hover:text-accent"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <ThemeToggle />
    </div>
  );
}

export function Masthead({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="pt-3.5 text-center">
      <Link href="/" className="no-underline hover:text-ink">
        <span className="block font-serif text-[clamp(52px,12vw,100px)] leading-[0.95] font-bold tracking-[-0.03em] [font-variation-settings:'opsz'_72]">
          Sourc<span className="text-accent">é</span>
        </span>
      </Link>
      <p className="mt-2.5 font-serif text-[clamp(16px,2.4vw,19px)] text-ink-2 italic">
        Les faits du jour, chacun avec ses sources.
      </p>
      <div className="double-rule mt-5 grid grid-cols-1 items-center gap-0.5 border-b border-b-rule-strong py-2 text-center text-[13px] text-ink-2 tabular-nums md:grid-cols-[1fr_auto_1fr] md:gap-3">
        <span className="font-semibold text-ink md:text-left">{left}</span>
        <span>{center}</span>
        <span className="md:text-right">{right}</span>
      </div>
    </header>
  );
}

export function Aside({ stats }: { stats: ApiStats | undefined }) {
  return (
    <aside className="pt-4.5 lg:sticky lg:top-4 lg:self-start">
      <section className="double-rule pt-3.5 pb-5.5">
        <h2 className="mb-3 font-serif text-[19px] leading-tight font-semibold">
          Comment lire cette édition
        </h2>
        <ul className="grid gap-3.5 text-sm leading-normal text-ink-2">
          <li>
            <span className="inline-flex rounded-full bg-ok-bg px-2.5 py-1.5 text-[12.5px] leading-none font-medium text-ok">
              Confirmé
            </span>
            <p className="mt-1.5">
              Au moins deux origines indépendantes. Deux médias d'un même groupe, ou qui reprennent
              la même dépêche d'agence, comptent pour une seule.
            </p>
          </li>
          <li>
            <span className="inline-flex rounded-full bg-warn-bg px-2.5 py-1.5 text-[12.5px] leading-none font-medium text-warn">
              Source unique
            </span>
            <p className="mt-1.5">
              Une seule origine pour l'instant : l'information reste à confirmer.
            </p>
          </li>
          <li>
            <span className="font-sans text-sm font-semibold text-accent">1, 2</span>
            <p className="mt-1.5">Chaque phrase du résumé renvoie aux articles qui l'appuient.</p>
          </li>
          <li>
            Les résumés sont reformulés automatiquement, uniquement à partir des sources ouvertes à
            l'analyse : institutions et médias qui n'excluent pas l'IA. Les autres médias
            apparaissent par leur titre et un lien.
          </li>
          <li>Tribunes, éditoriaux et contenus sponsorisés sont écartés.</li>
        </ul>
      </section>
      {stats && (
        <section className="double-rule pt-3.5 pb-5.5">
          <h2 className="mb-3 font-serif text-[19px] leading-tight font-semibold">
            Coulisses de l'édition
          </h2>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] text-sm">
            {[
              ["Articles analysés", stats.articles],
              ["Événements confirmés", stats.confirmed],
              ["Sources ouvertes à l'analyse", stats.sources.open],
              ["Médias en liens seulement", stats.sources.links_only],
              ["Sources non collectées", stats.sources.excluded],
              ["Tribunes et éditoriaux écartés", stats.excluded.opinion],
              ["Contenus sponsorisés écartés", stats.excluded.sponsored],
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="border-b border-dotted border-rule py-1.5 text-ink-2">{label}</dt>
                <dd className="border-b border-dotted border-rule py-1.5 pl-3 text-right font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section className="double-rule pt-3.5 pb-5.5">
        <h2 className="mb-3 font-serif text-[19px] leading-tight font-semibold">En savoir plus</h2>
        <ul className="grid gap-2 text-sm">
          <li>
            <Link href="/methodologie">Méthodologie</Link>
          </li>
          <li>
            <Link href="/sources">Sources et conformité</Link>
          </li>
          <li>
            <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
              Code source
            </a>
          </li>
        </ul>
      </section>
    </aside>
  );
}

export function Footer() {
  return (
    <footer className="double-rule mx-auto mt-2 flex max-w-[1180px] flex-wrap justify-between gap-x-4.5 gap-y-2 px-4 pt-4.5 pb-10 text-[13px] text-ink-3 md:px-8">
      <span>Sourcé — les faits du jour, chacun avec ses sources.</span>
      <span>
        Titres et liens appartiennent à leurs éditeurs ·{" "}
        <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
          code source
        </a>
      </span>
    </footer>
  );
}

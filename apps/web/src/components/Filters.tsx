import { addDays, THEMES, type ThemeSlug, ZONES, type ZoneSlug } from "@sourcee/shared";
import { type ReactNode, useEffect, useState } from "react";
import { type EditionState, today } from "../state";

interface Props {
  state: EditionState;
  onChange: (next: EditionState, replace?: boolean) => void;
}

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function Row({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-1.5 md:grid-cols-[92px_minmax(0,1fr)] md:gap-3">
      <span className="label" id={id}>
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={id}
        className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
        {children}
      </div>
    </div>
  );
}

const dateInput =
  "rounded-full border border-rule bg-raised px-2.5 py-1.5 text-[13px] leading-none font-medium text-ink";

export function Filters({ state, onChange }: Props) {
  const now = today();
  const [q, setQ] = useState(state.q);

  // Le mot-clé est appliqué après une courte pause de frappe.
  useEffect(() => setQ(state.q), [state.q]);
  useEffect(() => {
    if (q === state.q) return;
    const timer = window.setTimeout(() => onChange({ ...state, q }, true), 300);
    return () => window.clearTimeout(timer);
  }, [q, state, onChange]);

  const isToday = state.mode === "day" && state.day === now;
  const isYesterday = state.mode === "day" && state.day === addDays(now, -1);
  const filtered = state.themes.length > 0 || state.zones.length > 0 || state.q.trim() !== "";

  return (
    <section aria-label="Filtres" className="grid gap-3 border-b border-rule pt-5 pb-4.5">
      <Row label="Date" id="filtre-date">
        <button
          type="button"
          className="chip"
          aria-pressed={isToday}
          onClick={() => onChange({ ...state, mode: "day", day: now })}
        >
          Aujourd'hui
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={isYesterday}
          onClick={() => onChange({ ...state, mode: "day", day: addDays(now, -1) })}
        >
          Hier
        </button>
        <label>
          <span className="sr-only">Choisir une journée</span>
          <input
            type="date"
            className={dateInput}
            value={state.mode === "day" ? state.day : ""}
            max={now}
            onChange={(event) =>
              event.target.value && onChange({ ...state, mode: "day", day: event.target.value })
            }
          />
        </label>
        <button
          type="button"
          className="chip"
          aria-pressed={state.mode === "period"}
          onClick={() => onChange({ ...state, mode: "period" })}
        >
          Période
        </button>
        {state.mode === "period" && (
          <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-ink-2">
            <label>
              du{" "}
              <input
                type="date"
                className={dateInput}
                value={state.from}
                max={state.to}
                onChange={(e) => e.target.value && onChange({ ...state, from: e.target.value })}
              />
            </label>
            <label>
              au{" "}
              <input
                type="date"
                className={dateInput}
                value={state.to}
                min={state.from}
                max={now}
                onChange={(e) => e.target.value && onChange({ ...state, to: e.target.value })}
              />
            </label>
          </span>
        )}
      </Row>

      <Row label="Thèmes" id="filtre-themes">
        {THEMES.map((theme) => (
          <button
            key={theme.slug}
            type="button"
            className="chip"
            aria-pressed={state.themes.includes(theme.slug)}
            onClick={() =>
              onChange({ ...state, themes: toggle<ThemeSlug>(state.themes, theme.slug) })
            }
          >
            {theme.label}
          </button>
        ))}
      </Row>

      <Row label="Zones" id="filtre-zones">
        {ZONES.map((zone) => (
          <button
            key={zone.slug}
            type="button"
            className="chip"
            aria-pressed={state.zones.includes(zone.slug)}
            onClick={() => onChange({ ...state, zones: toggle<ZoneSlug>(state.zones, zone.slug) })}
          >
            {zone.label}
          </button>
        ))}
      </Row>

      <div className="grid grid-cols-1 items-center gap-1.5 md:grid-cols-[92px_minmax(0,1fr)] md:gap-3">
        <label className="label" htmlFor="recherche">
          Mot-clé
        </label>
        <div className="flex items-center gap-2">
          <input
            id="recherche"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="COP, IA, élections…"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-rule bg-raised px-3 py-2.5 text-[15px] leading-tight text-ink placeholder:text-ink-3 md:max-w-[420px]"
          />
          {filtered && (
            <button
              type="button"
              className="cursor-pointer px-1 py-1.5 text-[13px] font-medium text-ink-2 underline underline-offset-3"
              onClick={() => onChange({ ...state, themes: [], zones: [], q: "" })}
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

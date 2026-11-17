import type { ApiDay } from "@sourcee/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchEvents, fetchStats } from "../api";
import { EventCard, MinuteCard } from "../components/EventCard";
import { Filters } from "../components/Filters";
import { Aside, Masthead, toolButton } from "../components/Layout";
import { Timeline } from "../components/Timeline";
import { longDay, plural, shortDay } from "../format";
import { toQuery, today, useEditionState } from "../state";

const MINUTE_COUNT = 5;

/** Temps de lecture estimé, à 230 mots par minute. */
function readingMinutes(days: ApiDay[], minute: boolean): number {
  const words = days
    .flatMap((day) => (minute ? day.events.slice(0, MINUTE_COUNT) : day.events))
    .map((event) => {
      const sentences = minute ? event.summary.sentences.slice(0, 1) : event.summary.sentences;
      return `${event.title} ${sentences.map((s) => s.text).join(" ")}`;
    })
    .join(" ")
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 230));
}

export function EditionPage() {
  const [state, setState] = useEditionState();
  const query = toQuery(state);
  const single = state.mode === "day";
  const events = useQuery({
    queryKey: ["events", query],
    queryFn: () => fetchEvents(query),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({
    queryKey: ["stats", state.day],
    queryFn: () => fetchStats(state.day),
    enabled: single,
  });

  const days = events.data?.days ?? [];
  const total = days.reduce((sum, day) => sum + day.events.length, 0);
  const filtered = state.themes.length > 0 || state.zones.length > 0 || state.q.trim() !== "";
  const dateLabel = single
    ? longDay(state.day)
    : `Du ${shortDay(state.from)} au ${shortDay(state.to, true)}`;

  let summary = "";
  if (events.data && total > 0) {
    const reading = `lecture ≈ ${readingMinutes(days, state.minute)} min`;
    if (state.minute)
      summary = `L'essentiel en ${plural(Math.min(total, MINUTE_COUNT * days.length), "événement")} · ${reading}`;
    else if (filtered)
      summary = `${plural(total, "événement correspond", "événements correspondent")} à vos filtres · ${reading}`;
    else if (single)
      summary = `Les ${plural(total, "événement")} du jour, classés par nombre d'origines indépendantes · ${reading}`;
    else
      summary = `${plural(total, "événement")} sur ${plural(days.length, "journée")}, dix au plus par jour · ${reading}`;
  }

  return (
    <>
      <Masthead
        left={dateLabel}
        center={
          single && state.day === today() ? "Mise à jour toutes les heures" : "Édition archivée"
        }
        right={
          single && stats.data
            ? `${plural(stats.data.events, "événement")} · ${plural(stats.data.articles, "article")}`
            : undefined
        }
      />
      <Filters state={state} onChange={setState} />
      {single && !state.minute && days[0] && <Timeline events={days[0].events} />}

      <div
        className={`grid gap-2 pb-12 ${state.minute ? "mx-auto max-w-[760px]" : "lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12"}`}
      >
        <main id="contenu" aria-busy={events.isFetching}>
          <h2 className="sr-only">Les événements</h2>
          <div className="mt-4.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13.5px] text-ink-2" aria-live="polite">
              {summary}
            </p>
            <button
              type="button"
              className={toolButton}
              aria-pressed={state.minute}
              onClick={() => setState({ ...state, minute: !state.minute })}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[15px] flex-none">
                <circle cx="8" cy="9" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M8 9V6.3M6.3 1.8h3.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              Mode 1 minute
            </button>
          </div>

          {events.isPending && (
            <p className="py-12 text-center font-serif text-lg text-ink-2 italic">
              Chargement de l'édition…
            </p>
          )}
          {events.isError && (
            <p role="alert" className="py-12 text-center font-serif text-lg text-ink-2 italic">
              L'édition n'a pas pu être chargée : {events.error.message}
            </p>
          )}
          {events.data && total === 0 && (
            <div className="py-12 text-center text-ink-2">
              <p className="mb-3.5 font-serif text-lg italic">
                {filtered
                  ? "Aucun événement ne correspond à ces filtres."
                  : "Aucun événement pour cette période."}
              </p>
              {filtered && (
                <button
                  type="button"
                  className={toolButton}
                  onClick={() => setState({ ...state, themes: [], zones: [], q: "" })}
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          )}

          {days.map((day) => (
            <section key={day.day} aria-label={longDay(day.day)}>
              {!single && (
                <h2 className="double-rule mt-6 pt-2 font-serif text-xl font-semibold">
                  {longDay(day.day)}
                </h2>
              )}
              {(state.minute ? day.events.slice(0, MINUTE_COUNT) : day.events).map(
                (event, index) =>
                  state.minute ? (
                    <MinuteCard key={event.id} event={event} />
                  ) : (
                    <EventCard
                      key={event.id}
                      event={event}
                      lead={single && index === 0 && !filtered}
                    />
                  ),
              )}
            </section>
          ))}
        </main>
        {!state.minute && <Aside stats={single ? stats.data : undefined} />}
      </div>
    </>
  );
}

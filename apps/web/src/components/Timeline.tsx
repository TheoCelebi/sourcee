import type { ApiEvent } from "@sourcee/shared";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { hhmm, minutesOfDay } from "../format";

const MARKER = 24;
const ROW = 30;
const GAP = 28;

export interface TimelineLayout {
  height: number;
  axisY: number;
  ticks: { hour: number; pct: number }[];
  markers: { event: ApiEvent; pct: number; top: number; stem: number; align: "l" | "c" | "r" }[];
}

/** Place chaque événement à l'heure de sa première publication ; les marqueurs trop proches passent à la rangée suivante. */
export function layoutTimeline(events: readonly ApiEvent[], width: number): TimelineLayout {
  const lastX: number[] = [];
  const placed = [...events]
    .sort((a, b) => minutesOfDay(a.firstPublishedAt) - minutesOfDay(b.firstPublishedAt))
    .map((event) => {
      const x = Math.min(
        width - MARKER / 2,
        Math.max(MARKER / 2, (minutesOfDay(event.firstPublishedAt) / 1440) * width),
      );
      let row = lastX.findIndex((previous) => x - previous >= GAP);
      if (row === -1) {
        row = lastX.length;
        lastX.push(x);
      } else {
        lastX[row] = x;
      }
      return { event, x, row };
    });
  const axisY = Math.max(1, lastX.length) * ROW + 8;
  const step = width < 520 ? 6 : 3;
  const ticks = [];
  for (let hour = 0; hour <= 24; hour += step) ticks.push({ hour, pct: (hour / 24) * 100 });
  return {
    height: axisY + 28,
    axisY,
    ticks,
    markers: placed.map(({ event, x, row }) => ({
      event,
      pct: width ? (x / width) * 100 : 0,
      top: row * ROW,
      stem: axisY - row * ROW - MARKER,
      align: x < 130 ? "l" : x > width - 130 ? "r" : "c",
    })),
  };
}

export function Timeline({ events }: { events: readonly ApiEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry?.contentRect.width ?? 0)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => layoutTimeline(events, width), [events, width]);

  return (
    <section aria-labelledby="tl-title" className="border-b border-rule pt-4 pb-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h2 id="tl-title" className="label">
          La journée heure par heure
        </h2>
        <p className="flex gap-3.5 text-[12.5px] text-ink-2">
          <span>
            <i className="mr-1.5 inline-block size-[11px] rounded-full border-[1.5px] border-ink bg-ink align-[-1px]" />
            Confirmé
          </span>
          <span>
            <i className="mr-1.5 inline-block size-[11px] rounded-full border-[1.5px] border-dashed border-ink align-[-1px]" />
            Source unique
          </span>
        </p>
      </div>
      <div ref={ref} className="relative mt-3.5" style={{ height: layout.height }}>
        {width > 0 && (
          <>
            <div className="absolute inset-x-0 h-px bg-rule-strong" style={{ top: layout.axisY }} />
            {layout.ticks.map(({ hour, pct }) => (
              <span key={hour}>
                <span
                  className="absolute h-[7px] w-px bg-rule-strong"
                  style={{
                    left: `calc(${pct}% - ${hour === 24 ? 1 : 0}px)`,
                    top: layout.axisY - 3,
                  }}
                />
                <span
                  className="absolute text-[11.5px] whitespace-nowrap text-ink-3 tabular-nums"
                  style={{
                    left: `${pct}%`,
                    top: layout.axisY + 9,
                    transform:
                      hour === 0 ? "none" : hour === 24 ? "translateX(-100%)" : "translateX(-50%)",
                  }}
                >
                  {String(hour).padStart(2, "0")} h
                </span>
              </span>
            ))}
            {layout.markers.map(({ event, pct, top, stem, align }) => {
              const confirmed = event.verification === "confirmed";
              return (
                <a
                  key={event.id}
                  href={`#e${event.id}`}
                  aria-label={`${hhmm(event.firstPublishedAt)} — ${event.title}`}
                  className={`tl-marker absolute -ml-3 grid size-6 place-items-center rounded-full border-[1.5px] border-ink text-[11px] leading-none font-semibold no-underline hover:border-solid hover:border-accent hover:bg-accent hover:text-paper focus-visible:bg-accent focus-visible:text-paper ${
                    confirmed ? "bg-ink text-paper" : "border-dashed bg-paper text-ink"
                  }`}
                  style={{ left: `${pct}%`, top, "--stem": `${stem}px` } as CSSProperties}
                >
                  <span aria-hidden="true">{event.rank}</span>
                  <span
                    aria-hidden="true"
                    className={`tip pointer-events-none absolute bottom-[calc(100%+8px)] z-10 hidden w-max max-w-60 rounded-md bg-ink px-2.5 py-2 text-left text-[12.5px] leading-snug font-normal text-paper ${
                      align === "l"
                        ? "-left-1"
                        : align === "r"
                          ? "-right-1"
                          : "left-1/2 -translate-x-1/2"
                    }`}
                  >
                    <b className="mb-0.5 block font-semibold">{hhmm(event.firstPublishedAt)}</b>
                    {event.title}
                  </span>
                </a>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}

import type { ApiEvent } from "@sourcee/shared";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { hhmm, minutesOfDay } from "../format";

const MARKER = 24;
const ROW = 30;
const GAP = 28;
/** Écart minimal entre deux graduations, en pixels. */
const TICK_SPACING = 90;
/** Pas possibles entre graduations, en minutes. */
const TICK_STEPS = [15, 30, 60, 120, 180, 360];
export const MAX_ZOOM = 24;
const DAY = 1440;

export interface TimelineLayout {
  height: number;
  axisY: number;
  ticks: { minutes: number; pct: number }[];
  markers: { event: ApiEvent; x: number; pct: number; top: number; stem: number }[];
}

/**
 * Place chaque événement à l'heure de sa première publication, sur une largeur donnée
 * (celle de l'écran multipliée par le zoom) ; les marqueurs trop proches passent à la rangée suivante.
 */
export function layoutTimeline(events: readonly ApiEvent[], width: number): TimelineLayout {
  const lastX: number[] = [];
  const placed = [...events]
    .sort((a, b) => minutesOfDay(a.firstPublishedAt) - minutesOfDay(b.firstPublishedAt))
    .map((event) => {
      const x = Math.min(
        width - MARKER / 2,
        Math.max(MARKER / 2, (minutesOfDay(event.firstPublishedAt) / DAY) * width),
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
  const step =
    TICK_STEPS.find((minutes) => (minutes / DAY) * width >= TICK_SPACING) ?? TICK_STEPS.at(-1)!;
  const ticks = [];
  for (let minutes = 0; minutes <= DAY; minutes += step) {
    ticks.push({ minutes, pct: (minutes / DAY) * 100 });
  }
  return {
    height: axisY + 28,
    axisY,
    ticks,
    markers: placed.map(({ event, x, row }) => ({
      event,
      x,
      pct: width ? (x / width) * 100 : 0,
      top: row * ROW,
      stem: axisY - row * ROW - MARKER,
    })),
  };
}

/** Zoom qui fait tenir tous les événements à l'écran, avec une demi-heure de marge, et minute de départ. */
export function fitZoom(events: readonly ApiEvent[]): { zoom: number; start: number } {
  if (events.length === 0) return { zoom: 1, start: 0 };
  const minutes = events.map((event) => minutesOfDay(event.firstPublishedAt));
  let start = Math.max(0, Math.min(...minutes) - 30);
  let end = Math.min(DAY, Math.max(...minutes) + 30);
  // Une heure au moins à l'écran.
  if (end - start < 60) {
    const middle = (start + end) / 2;
    start = Math.max(0, Math.min(DAY - 60, middle - 30));
    end = start + 60;
  }
  return { zoom: Math.min(MAX_ZOOM, Math.max(1, DAY / (end - start))), start };
}

function tickLabel(minutes: number): string {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const rest = minutes % 60;
  return rest ? `${hour} h ${String(rest).padStart(2, "0")}` : `${hour} h`;
}

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(1, zoom));

const zoomButton =
  "grid size-8 cursor-pointer place-items-center rounded-full border border-rule bg-transparent text-base leading-none text-ink hover:border-ink-3 disabled:cursor-default disabled:opacity-35";

export function Timeline({ events }: { events: readonly ApiEvent[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const zoomRef = useRef(1);
  /** Point de la journée (fraction) à garder sous la même position de l'écran (offset en pixels). */
  const anchor = useRef<{ fraction: number; offset: number } | null>(null);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry?.contentRect.width ?? 0)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Change le zoom en gardant fixe le point de la journée situé à `offset` pixels du bord gauche. */
  const zoomTo = useCallback(
    (next: number, offset?: number, fraction?: number) => {
      const element = scroller.current;
      if (!element || !width) return;
      const at = offset ?? width / 2;
      const pending = anchor.current;
      const current = width * zoomRef.current;
      const point =
        fraction ??
        (pending
          ? pending.fraction + (at - pending.offset) / current
          : (element.scrollLeft + at) / current);
      anchor.current = { fraction: point, offset: at };
      zoomRef.current = clampZoom(next);
      setZoom(zoomRef.current);
    },
    [width],
  );

  useLayoutEffect(() => {
    const element = scroller.current;
    const pending = anchor.current;
    if (!element || !pending) return;
    anchor.current = null;
    element.scrollLeft = pending.fraction * width * zoom - pending.offset;
    setScrollLeft(element.scrollLeft);
  }, [zoom, width]);

  // Pincement au pavé tactile (molette + Ctrl) et à deux doigts sur écran tactile.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const offset = event.clientX - element.getBoundingClientRect().left;
      zoomTo(zoomRef.current * Math.exp(-event.deltaY * 0.01), offset);
    };
    let pinch: { distance: number; zoom: number; fraction: number } | null = null;
    const touchInfo = (touches: TouchList) => {
      const [a, b] = [touches[0]!, touches[1]!];
      const middle = (a.clientX + b.clientX) / 2 - element.getBoundingClientRect().left;
      return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), middle };
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const { distance, middle } = touchInfo(event.touches);
      pinch = {
        distance,
        zoom: zoomRef.current,
        fraction: (element.scrollLeft + middle) / (element.clientWidth * zoomRef.current),
      };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const { distance, middle } = touchInfo(event.touches);
      zoomTo((pinch.zoom * distance) / pinch.distance, middle, pinch.fraction);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchEnd);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoomTo]);

  const layout = useMemo(() => layoutTimeline(events, width * zoom), [events, width, zoom]);
  const zoomed = zoom > 1.01;

  function toggleFit() {
    if (zoomed) {
      zoomTo(1, 0, 0);
    } else {
      const fit = fitZoom(events);
      zoomTo(fit.zoom, 0, fit.start / DAY);
    }
  }

  const tip = layout.markers.find((marker) => marker.event.id === active);
  const tipX = tip ? tip.x - scrollLeft : 0;
  /** L'infobulle reste dans la largeur de la frise. */
  const tipWidth = Math.min(240, width);

  return (
    <section aria-labelledby="tl-title" className="border-b border-rule pt-4 pb-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="tl-title" className="label">
          La journée heure par heure
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
          <div role="group" aria-label="Zoom de la frise" className="flex items-center gap-1.5">
            <button
              type="button"
              className={zoomButton}
              aria-label="Dézoomer"
              disabled={!zoomed}
              onClick={() => zoomTo(zoom / 2)}
            >
              −
            </button>
            <span
              className="w-9 text-center text-[12.5px] text-ink-2 tabular-nums"
              aria-live="polite"
            >
              ×{zoom < 10 ? zoom.toFixed(1).replace(".0", "").replace(".", ",") : Math.round(zoom)}
            </span>
            <button
              type="button"
              className={zoomButton}
              aria-label="Zoomer"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => zoomTo(zoom * 2)}
            >
              +
            </button>
            <button
              type="button"
              className="ml-1 cursor-pointer rounded-full border border-rule bg-transparent px-3 py-2 text-[12.5px] leading-none font-medium text-ink hover:border-ink-3 disabled:cursor-default disabled:opacity-35"
              disabled={!zoomed && events.length === 0}
              onClick={toggleFit}
            >
              {zoomed ? "Toute la journée" : "Ajuster aux événements"}
            </button>
          </div>
        </div>
      </div>
      <div className="relative mt-3.5">
        <div
          ref={scroller}
          className="tl-scroller overflow-x-auto overflow-y-hidden"
          style={{ touchAction: "pan-x pan-y" }}
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        >
          <div
            className="relative"
            style={{ height: layout.height, width: width * zoom || "100%" }}
          >
            {width > 0 && (
              <>
                <div
                  className="absolute inset-x-0 h-px bg-rule-strong"
                  style={{ top: layout.axisY }}
                />
                {layout.ticks.map(({ minutes, pct }) => (
                  <span key={minutes}>
                    <span
                      className="absolute h-[7px] w-px bg-rule-strong"
                      style={{
                        left: `calc(${pct}% - ${minutes === DAY ? 1 : 0}px)`,
                        top: layout.axisY - 3,
                      }}
                    />
                    <span
                      className="absolute text-[11.5px] whitespace-nowrap text-ink-3 tabular-nums"
                      style={{
                        left: `${pct}%`,
                        top: layout.axisY + 9,
                        transform:
                          minutes === 0
                            ? "none"
                            : minutes === DAY
                              ? "translateX(-100%)"
                              : "translateX(-50%)",
                      }}
                    >
                      {tickLabel(minutes)}
                    </span>
                  </span>
                ))}
                {layout.markers.map(({ event, pct, top, stem }) => {
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
                      onMouseEnter={() => setActive(event.id)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(event.id)}
                      onBlur={() => setActive(null)}
                    >
                      <span aria-hidden="true">{event.rank}</span>
                    </a>
                  );
                })}
              </>
            )}
          </div>
        </div>
        {tip && tipX >= 0 && tipX <= width && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute z-10 -translate-y-full rounded-md bg-ink px-2.5 py-2 text-left text-[12.5px] leading-snug font-normal text-paper"
            style={{
              width: tipWidth,
              left: Math.min(width - tipWidth, Math.max(0, tipX - tipWidth / 2)),
              top: tip.top - 8,
            }}
          >
            <b className="mb-0.5 block font-semibold">{hhmm(tip.event.firstPublishedAt)}</b>
            {tip.event.title}
          </span>
        )}
      </div>
    </section>
  );
}

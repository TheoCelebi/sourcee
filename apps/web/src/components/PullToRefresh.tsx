import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/** Distance (après résistance) à partir de laquelle relâcher actualise. */
export const PULL_THRESHOLD = 72;
const MAX_PULL = 110;
/** Durée minimale de l'indicateur, pour qu'on voie que l'actualisation a eu lieu. */
const MIN_SPIN_MS = 600;

/** Le doigt parcourt plus de distance que l'indicateur, comme sur iOS. */
export function resist(distance: number): number {
  if (distance <= 0) return 0;
  return Math.min(MAX_PULL, distance * 0.5);
}

/**
 * Safari et Chrome proposent déjà « tirer pour actualiser » dans un onglet ;
 * l'appli installée sur l'écran d'accueil, elle, n'en a pas.
 */
export function isInstalledApp(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
}

/** Recharge les données affichées et cherche une nouvelle version de l'appli. */
async function refresh(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  const update = navigator.serviceWorker
    ?.getRegistration()
    .then((registration) => registration?.update())
    .catch(() => undefined);
  await Promise.all([
    queryClient.refetchQueries({ type: "active" }),
    update,
    new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS)),
  ]);
}

export function PullToRefresh() {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let pulling = false;

    const setDistance = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };

    const onTouchStart = (event: TouchEvent) => {
      start = null;
      pulling = false;
      if (busy.current || event.touches.length !== 1 || window.scrollY > 0) return;
      if (!isInstalledApp()) return;
      // La frise gère ses propres gestes (défilement horizontal, pincement).
      if ((event.target as Element | null)?.closest?.(".tl-scroller")) return;
      const touch = event.touches[0]!;
      start = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0]!;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!pulling) {
        // Geste vers le haut ou plutôt horizontal : ce n'est pas un « tirer pour actualiser ».
        if (dy <= 0 || Math.abs(dx) > dy) {
          if (Math.abs(dx) > 8 || dy < -8) start = null;
          return;
        }
        if (dy < 8) return;
        pulling = true;
      }
      event.preventDefault();
      setDistance(resist(dy));
    };

    const onTouchEnd = () => {
      if (!pulling) {
        start = null;
        return;
      }
      pulling = false;
      start = null;
      if (pullRef.current < PULL_THRESHOLD) {
        setDistance(0);
        return;
      }
      busy.current = true;
      setRefreshing(true);
      setDistance(PULL_THRESHOLD * 0.75);
      void refresh(queryClient).finally(() => {
        busy.current = false;
        setRefreshing(false);
        setDistance(0);
      });
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [queryClient]);

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const ready = progress >= 1;
  const visible = pull > 0 || refreshing;

  return (
    <>
      <div
        aria-hidden="true"
        className={`ptr pointer-events-none fixed left-1/2 z-30 grid size-10 place-items-center rounded-full border border-rule bg-paper text-ink shadow-md ${
          pull === 0 || refreshing ? "transition-transform duration-200" : ""
        }`}
        style={{
          top: "calc(env(safe-area-inset-top, 0px) - 44px)",
          transform: `translate(-50%, ${visible ? pull + 12 : 0}px)`,
          opacity: visible ? 1 : 0,
        }}
      >
        {refreshing ? (
          <svg viewBox="0 0 24 24" className="size-5 animate-spin">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray="40 60"
            />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className={`size-5 ${ready ? "text-accent" : ""}`}
            style={{ transform: `rotate(${progress * 180}deg)` }}
          >
            <path
              d="M12 5v13M6.5 12.5 12 18l5.5-5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <p className="sr-only" role="status">
        {refreshing ? "Actualisation de l'édition…" : ""}
      </p>
    </>
  );
}

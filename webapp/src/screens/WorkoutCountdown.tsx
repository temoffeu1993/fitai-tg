import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { workoutTheme } from "@/components/workout-session/theme";
import { fireHapticImpact } from "@/utils/haptics";

type CountdownRouteState = {
  nextPath?: string;
  nextState?: unknown;
  fallbackPath?: string;
};

const COUNTDOWN_STEPS = ["3", "2", "1", "Старт"] as const;

function resolvePrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return Boolean(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export default function WorkoutCountdown() {
  const nav = useNavigate();
  const location = useLocation();
  const routeState = (location.state || null) as CountdownRouteState | null;
  const hasPayload = Boolean(routeState && ("nextPath" in routeState || "nextState" in routeState));
  const [stepIndex, setStepIndex] = useState(0);
  const [pulseTick, setPulseTick] = useState(0);
  const reducedMotion = useMemo(resolvePrefersReducedMotion, []);

  const nextPath = typeof routeState?.nextPath === "string" && routeState.nextPath.trim()
    ? routeState.nextPath
    : "/workout/session";
  const fallbackPath = typeof routeState?.fallbackPath === "string" && routeState.fallbackPath.trim()
    ? routeState.fallbackPath
    : "/plan/one";
  const nextState = routeState?.nextState;

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const prevRootOverflow = root?.style.overflowY;
    const prevRootOverscroll = root?.style.overscrollBehaviorY;
    const prevBodyOverflow = document.body.style.overflowY;
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY;

    if (root) {
      root.style.overflowY = "hidden";
      root.style.overscrollBehaviorY = "none";
      root.scrollTop = 0;
    }
    document.body.style.overflowY = "hidden";
    document.body.style.overscrollBehaviorY = "none";
    window.scrollTo(0, 0);

    return () => {
      if (root) {
        root.style.overflowY = prevRootOverflow || "";
        root.style.overscrollBehaviorY = prevRootOverscroll || "";
      }
      document.body.style.overflowY = prevBodyOverflow || "";
      document.body.style.overscrollBehaviorY = prevBodyOverscroll || "";
    };
  }, []);

  useEffect(() => {
    if (!hasPayload) {
      nav(fallbackPath, { replace: true });
      return;
    }

    const stepDurationMs = reducedMotion ? 360 : 860;
    const settleMs = reducedMotion ? 120 : 300;
    const timers: number[] = [];

    for (let i = 1; i < COUNTDOWN_STEPS.length; i += 1) {
      timers.push(window.setTimeout(() => {
        setStepIndex(i);
      }, i * stepDurationMs));
    }

    timers.push(
      window.setTimeout(() => {
        nav(nextPath, { replace: true, state: nextState });
      }, COUNTDOWN_STEPS.length * stepDurationMs + settleMs)
    );

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [fallbackPath, hasPayload, nav, nextPath, nextState, reducedMotion]);

  useEffect(() => {
    if (!hasPayload) return;
    setPulseTick((prev) => prev + 1);
    fireHapticImpact(stepIndex >= COUNTDOWN_STEPS.length - 1 ? "medium" : "light");
  }, [hasPayload, stepIndex]);

  const value = COUNTDOWN_STEPS[stepIndex] || "3";
  const isStart = value === "Старт";

  return (
    <section style={styles.page}>
      <style>{css}</style>
      <div style={styles.backdrop} />
      <div key={pulseTick} className="wc-pulse-wrap" aria-hidden="true">
        <span className="wc-ring wc-ring-1" />
        <span className="wc-ring wc-ring-2" />
        <span className="wc-ring wc-ring-3" />
      </div>
      <div style={styles.valueWrap}>
        <div
          key={`${stepIndex}-${value}`}
          className={isStart ? "wc-value wc-value-start" : "wc-value"}
          aria-live="polite"
          aria-atomic="true"
        >
          {value}
        </div>
      </div>
    </section>
  );
}

const css = `
@keyframes wcValuePulse {
  0% { opacity: 0; transform: translateY(18px) scale(0.72); filter: blur(10px); }
  18% { opacity: 1; transform: translateY(0) scale(1.08); filter: blur(0); }
  58% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  100% { opacity: 0; transform: translateY(-14px) scale(0.9); filter: blur(6px); }
}
@keyframes wcValueStart {
  0% { opacity: 0; transform: translateY(12px) scale(0.78); filter: blur(8px); }
  26% { opacity: 1; transform: translateY(0) scale(1.03); filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes wcRingPulse {
  0% { opacity: 0.56; transform: scale(0.82); }
  75% { opacity: 0.06; transform: scale(1.28); }
  100% { opacity: 0; transform: scale(1.34); }
}
@keyframes wcGlowFlow {
  0% { transform: translate3d(-2%, 0, 0) scale(1); opacity: 0.84; }
  50% { transform: translate3d(2%, -2%, 0) scale(1.04); opacity: 1; }
  100% { transform: translate3d(-2%, 0, 0) scale(1); opacity: 0.84; }
}
.wc-pulse-wrap {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.wc-ring {
  position: absolute;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.42);
  box-shadow: 0 0 0 1px rgba(15,23,42,0.08) inset;
  animation: wcRingPulse 860ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.wc-ring-1 { width: min(56vw, 360px); height: min(56vw, 360px); }
.wc-ring-2 { width: min(68vw, 430px); height: min(68vw, 430px); animation-delay: 70ms; opacity: 0; }
.wc-ring-3 { width: min(80vw, 510px); height: min(80vw, 510px); animation-delay: 130ms; opacity: 0; }
.wc-value {
  animation: wcValuePulse 860ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.wc-value-start {
  animation: wcValueStart 860ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .wc-ring { animation-duration: 280ms !important; }
  .wc-value { animation: wcValueStart 280ms ease-out both !important; }
}
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: "relative",
    minHeight: "100dvh",
    height: "100dvh",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    padding: "max(20px, env(safe-area-inset-top, 0px)) 20px max(20px, env(safe-area-inset-bottom, 0px))",
    fontFamily: "SF Pro Display, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: workoutTheme.textPrimary,
    isolation: "isolate",
    background: "transparent",
  },
  backdrop: {
    position: "absolute",
    inset: 0,
    background: `
      radial-gradient(120% 90% at 50% 45%, rgba(255,255,255,0.56) 0%, rgba(255,255,255,0.22) 42%, rgba(255,255,255,0) 76%),
      radial-gradient(90% 70% at 50% 60%, rgba(15,23,42,0.12) 0%, rgba(15,23,42,0) 72%)
    `,
    animation: "wcGlowFlow 2400ms ease-in-out infinite",
    pointerEvents: "none",
    zIndex: 1,
  },
  valueWrap: {
    position: "relative",
    zIndex: 2,
    minWidth: "min(72vw, 420px)",
    textAlign: "center",
    fontSize: "clamp(82px, 24vw, 172px)",
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: "-0.04em",
    color: "#1e1f22",
    textShadow:
      "0 12px 28px rgba(15,23,42,0.2), 0 2px 0 rgba(255,255,255,0.82)",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
};

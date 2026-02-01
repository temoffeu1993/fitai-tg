// webapp/src/screens/onb/OnbMotivation.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import robotImg from "@/assets/robonew.webp";
import muscleRobotImg from "@/assets/morobot.webp";
import slimRobotImg from "@/assets/hudoi.webp";
import toneRobotImg from "@/assets/forma.webp";
import healthRobotImg from "@/assets/heals.webp";
import { fireHapticImpact } from "@/utils/haptics";

export type Goal = "lose_weight" | "build_muscle" | "athletic_body" | "health_wellness";

const GOALS: Array<{ value: Goal; label: string }> = [
  { value: "lose_weight", label: "🔥 Сбросить лишнее" },
  { value: "build_muscle", label: "💪🏻 Набрать мышцы" },
  { value: "athletic_body", label: "⚡️ Подтянуться и быть в форме" },
  { value: "health_wellness", label: "🧘‍♂️ Здоровье и самочувствие" },
];

const DEFAULT_BUBBLE = "Зачем вам\nтренировки?";

const GOAL_TEXT: Record<Goal, string> = {
  lose_weight: "Оставим всё лишнее в прошлом",
  build_muscle: "Футболкам придется потесниться",
  athletic_body: "Сделаем из тела шедевр",
  health_wellness: "Ваша спина скажет вам спасибо",
};

export type OnbMotivationData = {
  motivation: {
    goal: Goal;
  };
  goals: {
    primary: Goal;
  };
};

type Props = {
  initial?: Partial<OnbMotivationData>;
  loading?: boolean;
  onSubmit: (patch: OnbMotivationData) => void;
  onBack?: () => void;
};

export default function OnbMotivation({ initial, loading, onSubmit, onBack }: Props) {
  const [goal, setGoal] = useState<Goal | null>(initial?.motivation?.goal ?? null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [fadeToBlack, setFadeToBlack] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);
  const [bubbleText, setBubbleText] = useState<string>(
    initial?.motivation?.goal ? GOAL_TEXT[initial.motivation.goal] : DEFAULT_BUBBLE
  );
  const [imagesReady, setImagesReady] = useState(false);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const preload = (src: string) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        const done = () => resolve();
        const anyImg = img as any;
        if (typeof anyImg.decode === "function") {
          anyImg.decode().then(done).catch(() => {
            img.onload = done;
            img.onerror = done;
          });
        } else {
          img.onload = done;
          img.onerror = done;
        }
      });

    Promise.all([
      preload(robotImg),
      preload(muscleRobotImg),
      preload(slimRobotImg),
      preload(toneRobotImg),
      preload(healthRobotImg),
    ]).then(() => {
      if (!cancelled) setImagesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const prevOverflow = root?.style.overflowY;
    const prevOverscroll = root?.style.overscrollBehaviorY;
    const prevScrollBehavior = root?.style.scrollBehavior;
    if (root) {
      root.style.overflowY = "hidden";
      root.style.overscrollBehaviorY = "none";
      root.style.scrollBehavior = "auto";
      root.scrollTop = 0;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    return () => {
      if (root) {
        root.style.overflowY = prevOverflow || "";
        root.style.overscrollBehaviorY = prevOverscroll || "";
        root.style.scrollBehavior = prevScrollBehavior || "";
      }
    };
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const target = goal ? GOAL_TEXT[goal] : DEFAULT_BUBBLE;
    if (prefersReduced) {
      setBubbleText(target);
      return;
    }
    let index = 0;
    setBubbleText("");
    const id = window.setInterval(() => {
      index += 1;
      setBubbleText(target.slice(0, index));
      if (index >= target.length) {
        window.clearInterval(id);
      }
    }, 14);
    return () => window.clearInterval(id);
  }, [goal]);

  const handleNext = () => {
    if (loading || isLeaving || !goal) return;
    fireHapticImpact("light");
    const patch: OnbMotivationData = {
      motivation: { goal },
      goals: { primary: goal },
    };
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      onSubmit(patch);
      return;
    }
    setFadeToBlack(true);
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      onSubmit(patch);
    }, 420);
  };

  const shouldFadeOut = isLeaving && !fadeToBlack;

  return (
    <div style={s.page} className={shouldFadeOut ? "onb-leave" : undefined}>
      <style>{`
        @keyframes onbFadeUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes onbFadeDown {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(12px); }
        }
        @keyframes robotSwap {
          0% { opacity: 0; transform: translateY(8px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes blackoutIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .onb-fade {
          animation: onbFadeUp 520ms ease-out both;
        }
        .onb-fade-delay-1 { animation-delay: 80ms; }
        .onb-fade-delay-2 { animation-delay: 160ms; }
        .onb-fade-delay-3 { animation-delay: 240ms; }
        .onb-leave {
          animation: onbFadeDown 220ms ease-in both;
        }
        .goal-card {
          appearance: none;
          outline: none;
          transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
          will-change: transform, background, border-color;
          -webkit-tap-highlight-color: transparent;
        }
        .goal-card:active:not(:disabled) {
          transform: translateY(1px) scale(0.99);
          background: var(--goal-bg) !important;
          border-color: var(--goal-border) !important;
          color: var(--goal-color) !important;
        }
        .speech-bubble:before {
          content: "";
          position: absolute;
          left: -8px;
          top: 18px;
          width: 0;
          height: 0;
          border-top: 8px solid transparent;
          border-bottom: 8px solid transparent;
          border-right: 8px solid rgba(255,255,255,0.9);
          filter: drop-shadow(-1px 0 0 rgba(15, 23, 42, 0.12));
        }
        .intro-primary-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }
        .intro-primary-btn:active:not(:disabled) {
          transform: translateY(1px) scale(0.99) !important;
          background-color: #1e1f22 !important;
          border-color: #1e1f22 !important;
          box-shadow: 0 10px 22px rgba(0,0,0,0.08),
            inset 0 1px 0 rgba(255,255,255,0.7),
            inset 0 0 0 1px rgba(255,255,255,0.25) !important;
          filter: none !important;
        }
        .intro-primary-btn:disabled {
          background-color: #1e1f22 !important;
          border-color: #1e1f22 !important;
          color: #fff !important;
          box-shadow: 0 6px 10px rgba(0,0,0,0.24) !important;
          filter: none !important;
        }
        .intro-primary-btn:disabled {
          opacity: 1 !important;
        }
        @media (hover: hover) {
          .intro-primary-btn:hover:not(:disabled) {
            filter: brightness(1.03);
          }
        }
        .intro-primary-btn:focus-visible {
          outline: 3px solid rgba(15, 23, 42, 0.18);
          outline-offset: 2px;
        }
        .robot-swap {
          animation: robotSwap 240ms ease-out;
          will-change: opacity, transform;
        }
        .blackout {
          position: fixed;
          inset: 0;
          background: #000;
          opacity: 0;
          pointer-events: none;
          z-index: 40;
        }
        .blackout.blackout--on {
          animation: blackoutIn 420ms ease-in forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .onb-fade,
          .onb-fade-delay-1,
          .onb-fade-delay-2,
          .onb-fade-delay-3 { animation: none !important; }
          .onb-leave { animation: none !important; }
          .goal-card { transition: none !important; }
          .intro-primary-btn { transition: none !important; }
          .robot-swap { animation: none !important; }
          .blackout.blackout--on { animation: none !important; opacity: 1 !important; }
        }
      `}</style>

      <div style={s.progressWrap} className="onb-fade onb-fade-delay-1">
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>
        <div style={s.progressText}>Шаг 12 из 12</div>
      </div>

      <div style={s.robotRow} className="onb-fade onb-fade-delay-2">
        <img
          key={
            goal === "build_muscle"
              ? "muscle"
              : goal === "lose_weight"
              ? "slim"
              : goal === "athletic_body"
              ? "tone"
              : goal === "health_wellness"
              ? "health"
              : "base"
          }
          src={
            goal === "build_muscle"
              ? muscleRobotImg
              : goal === "lose_weight"
              ? slimRobotImg
              : goal === "athletic_body"
              ? toneRobotImg
              : goal === "health_wellness"
              ? healthRobotImg
              : robotImg
          }
          alt="Moro"
          style={{ ...s.robot, ...(imagesReady ? undefined : s.robotHidden) }}
          className="robot-swap"
        />
        <div style={s.bubble} className="speech-bubble">
          <span style={s.bubbleText}>{bubbleText}</span>
        </div>
      </div>

      <div style={s.cards} className="onb-fade onb-fade-delay-3">
        {GOALS.map((item) => {
          const isActive = goal === item.value;
          return (
            <button
              key={item.value}
              type="button"
              className="goal-card"
              style={{
                ...s.card,
                ["--goal-bg" as never]:
                  isActive
                    ? "#1e1f22"
                    : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                ["--goal-border" as never]: isActive ? "#1e1f22" : "rgba(255,255,255,0.4)",
                ["--goal-color" as never]: isActive ? "#fff" : "#1e1f22",
                ...(isActive ? s.cardActive : {}),
              }}
              onClick={() => setGoal(item.value)}
            >
              <div style={s.cardTitle}>{item.label}</div>
            </button>
          );
        })}
      </div>

      <div style={s.actions} className="onb-fade onb-fade-delay-3">
        <button
          type="button"
          style={s.primaryBtn}
          className="intro-primary-btn"
          onClick={handleNext}
          disabled={loading || isLeaving || !goal}
        >
          Далее
        </button>
        {onBack ? (
          <button
            style={s.backBtn}
            onClick={() => {
              if (isLeaving) return;
              const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
              if (prefersReduced) {
                onBack();
                return;
              }
              setIsLeaving(true);
              leaveTimerRef.current = window.setTimeout(() => {
                onBack();
              }, 220);
            }}
            type="button"
          >
            Назад
          </button>
        ) : null}
      </div>

      <div
        aria-hidden
        className={`blackout${fadeToBlack ? " blackout--on" : ""}`}
      />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 140px)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#0f172a",
  },
  progressWrap: {
    display: "grid",
    gap: 8,
    marginTop: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    background: "rgba(15, 23, 42, 0.08)",
    overflow: "hidden",
  },
  progressFill: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    background: "#1e1f22",
    boxShadow: "0 2px 6px rgba(15, 23, 42, 0.25), inset 0 1px 0 rgba(255,255,255,0.35)",
  },
  progressText: {
    fontSize: 12,
    color: "rgba(15, 23, 42, 0.55)",
    textAlign: "center",
  },
  robotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 0,
  },
  robot: {
    width: 120,
    height: "auto",
    objectFit: "contain",
  },
  robotHidden: {
    opacity: 0,
  },
  bubble: {
    position: "relative",
    padding: "12px 14px",
    borderRadius: 16,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "rgba(255,255,255,0.9)",
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 1.4,
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  bubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.3,
    color: "#0f172a",
    whiteSpace: "pre-line",
  },
  cards: {
    marginTop: 6,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
  },
  card: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.4)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
    color: "#1e1f22",
    fontSize: 18,
    fontWeight: 500,
    padding: "18px 16px",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 500,
  },
  cardActive: {
    background: "#1e1f22",
    border: "1px solid #1e1f22",
    color: "#fff",
  },
  actions: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "14px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)",
    display: "grid",
    gap: 10,
    maxWidth: "100%",
    margin: "0",
    background: "transparent",
    border: "none",
    boxShadow: "none",
    zIndex: 5,
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontWeight: 500,
    fontSize: 18,
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    outline: "none",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  backBtn: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#1e1f22",
    fontSize: 16,
    fontWeight: 600,
    padding: "14px 16px",
    cursor: "pointer",
    textAlign: "center",
  },
};

// webapp/src/screens/onb/OnbMotivation.tsx
import { useEffect, useRef, useState } from "react";

export type Goal =
  | "lose_weight"
  | "build_muscle"
  | "athletic_body"
  | "health_wellness";

const GOALS: Array<{ value: Goal; label: string }> = [
  { value: "lose_weight", label: "Снижение веса" },
  { value: "build_muscle", label: "Набор мышечной массы" },
  { value: "athletic_body", label: "Рельеф и тонус" },
  { value: "health_wellness", label: "Здоровье и самочувствие" },
];

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
  const leaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
    };
  }, []);

  const handleNext = () => {
    if (loading || isLeaving || !goal) return;
    const patch: OnbMotivationData = {
      motivation: { goal },
      goals: { primary: goal },
    };
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      onSubmit(patch);
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      onSubmit(patch);
    }, 220);
  };

  return (
    <div style={s.page} className={isLeaving ? "onb-leave" : undefined}>
      <style>{`
        @keyframes onbFadeUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes onbFadeDown {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(12px); }
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
        .intro-primary-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }
        .intro-primary-btn:active:not(:disabled) {
          transform: translateY(1px) scale(0.99) !important;
          background-color: #141619 !important;
          box-shadow: 0 6px 12px rgba(0,0,0,0.14) !important;
          filter: brightness(0.99) !important;
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
        @media (prefers-reduced-motion: reduce) {
          .onb-fade,
          .onb-fade-delay-1,
          .onb-fade-delay-2,
          .onb-fade-delay-3 { animation: none !important; }
          .onb-leave { animation: none !important; }
          .goal-card { transition: none !important; }
          .intro-primary-btn { transition: none !important; }
        }
      `}</style>

      <div style={s.progressWrap} className="onb-fade onb-fade-delay-1">
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>
        <div style={s.progressText}>Шаг 5 из 5</div>
      </div>

      <div style={s.header} className="onb-fade onb-fade-delay-2">
        <h1 style={s.title}>Какая у вас цель?</h1>
        <p style={s.subtitle}>
          От цели зависит план тренировок, питание и темп прогресса
        </p>
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
          style={{ ...s.primaryBtn, opacity: loading || !goal ? 0.6 : 1 }}
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
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
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
  },
  progressText: {
    fontSize: 12,
    color: "rgba(15, 23, 42, 0.55)",
    textAlign: "center",
  },
  header: {
    display: "grid",
    gap: 6,
    marginTop: 10,
    textAlign: "center",
  },
  title: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    fontWeight: 650,
    letterSpacing: -0.5,
  },
  subtitle: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, 0.7)",
  },
  cards: {
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
    fontSize: 16,
    fontWeight: 600,
    padding: "20px 14px",
    textAlign: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
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
    maxWidth: 720,
    margin: "0 auto",
    background:
      "linear-gradient(180deg, rgba(245,246,248,0) 0%, rgba(245,246,248,0.9) 24%, rgba(245,246,248,0.98) 100%)",
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

// webapp/src/screens/onb/OnbExperience.tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type Experience = "beginner" | "intermediate" | "advanced";

export type OnbExperienceData = {
  experience: Experience;
  schedule: { daysPerWeek: number; minutesPerSession: number };
};

type Props = {
  initial?: Partial<OnbExperienceData>;
  loading?: boolean;
  onSubmit: (patch: OnbExperienceData) => void;
  onBack?: () => void;
  onTabChange?: (tab: "home" | "workouts" | "nutrition" | "profile") => void;
};

import beginnerImg from "@/assets/novii.png";
import intermediateImg from "@/assets/sredne.png";
import advancedImg from "@/assets/profi.png";

export default function OnbExperience({ initial, loading, onSubmit, onBack }: Props) {
  const [experience, setExperience] = useState<Experience>(
    (initial?.experience as Experience) ?? "beginner"
  );
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

  const handleNext = () => {
    if (loading || isLeaving || !experience) return;
    const patch: OnbExperienceData = {
      experience,
      schedule: {
        daysPerWeek: initial?.schedule?.daysPerWeek ?? 3,
        minutesPerSession: initial?.schedule?.minutesPerSession ?? 60,
      },
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
        .exp-card {
          appearance: none;
          outline: none;
          transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
          will-change: transform, background, border-color;
          -webkit-tap-highlight-color: transparent;
        }
        .exp-card:active:not(:disabled) {
          transform: translateY(1px) scale(0.99);
          background: var(--exp-bg) !important;
          border-color: var(--exp-border) !important;
          color: var(--exp-color) !important;
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
          .exp-card { transition: none !important; }
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
        <h1 style={s.title}>Уровень подготовки</h1>
        <p style={s.subtitle}>Чтобы тренировки соответствовали вашему опыту.</p>
      </div>

      <div style={s.cards} className="onb-fade onb-fade-delay-3">
        <button
          type="button"
          className="exp-card"
          style={{
            ...s.card,
            ["--exp-bg" as never]:
              experience === "beginner"
                ? "#1e1f22"
                : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
            ["--exp-border" as never]: experience === "beginner" ? "#1e1f22" : "rgba(255,255,255,0.4)",
            ["--exp-color" as never]: experience === "beginner" ? "#fff" : "#1e1f22",
          }}
          onClick={() => setExperience("beginner")}
        >
          <div style={s.cardText}>
            <div style={s.cardTitle}>Новичек</div>
            <div style={s.cardSubtitle}>занимаешься меньше 6 мес</div>
          </div>
          <img src={beginnerImg} alt="Новичек" style={s.cardImage} />
        </button>

        <button
          type="button"
          className="exp-card"
          style={{
            ...s.card,
            ["--exp-bg" as never]:
              experience === "intermediate"
                ? "#1e1f22"
                : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
            ["--exp-border" as never]: experience === "intermediate" ? "#1e1f22" : "rgba(255,255,255,0.4)",
            ["--exp-color" as never]: experience === "intermediate" ? "#fff" : "#1e1f22",
          }}
          onClick={() => setExperience("intermediate")}
        >
          <div style={s.cardText}>
            <div style={s.cardTitle}>Средний уровень</div>
            <div style={s.cardSubtitle}>6 месяцев - 2 года регулярных тренировок</div>
          </div>
          <img src={intermediateImg} alt="Средний уровень" style={s.cardImage} />
        </button>

        <button
          type="button"
          className="exp-card"
          style={{
            ...s.card,
            ["--exp-bg" as never]:
              experience === "advanced"
                ? "#1e1f22"
                : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
            ["--exp-border" as never]: experience === "advanced" ? "#1e1f22" : "rgba(255,255,255,0.4)",
            ["--exp-color" as never]: experience === "advanced" ? "#fff" : "#1e1f22",
          }}
          onClick={() => setExperience("advanced")}
        >
          <div style={s.cardText}>
            <div style={s.cardTitle}>Продвинутый</div>
            <div style={s.cardSubtitle}>2+ года, знаю технику и принципы</div>
          </div>
          <img src={advancedImg} alt="Продвинутый" style={s.cardImage} />
        </button>
      </div>

      <div style={s.actions}>
        <button
          type="button"
          style={{ ...s.primaryBtn, opacity: loading ? 0.6 : 1 }}
          className="onb-fade onb-fade-delay-3 intro-primary-btn"
          onClick={handleNext}
          disabled={loading || isLeaving}
        >
          Далее
        </button>
        {onBack ? (
          <button
            type="button"
            style={s.backBtn}
            className="onb-fade onb-fade-delay-3"
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
    overflow: "hidden",
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
    height: "100%",
    width: "100%",
    background: "#1e1f22",
    borderRadius: 999,
  },
  progressText: {
    fontSize: 12,
    color: "rgba(15, 23, 42, 0.55)",
    textAlign: "center",
  },
  header: {
    display: "grid",
    gap: 8,
    textAlign: "center",
    alignItems: "center",
    marginTop: 16,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.1,
    fontWeight: 700,
    letterSpacing: -0.8,
  },
  subtitle: {
    margin: 0,
    fontSize: 16,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, 0.7)",
  },
  cards: {
    display: "grid",
    gap: 10,
    marginTop: 12,
    gridTemplateColumns: "1fr",
  },
  card: {
    width: "100%",
    padding: "14px 12px",
    borderRadius: 18,
    border: "1px solid var(--exp-border)",
    background: "var(--exp-bg)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
    color: "var(--exp-color)",
    textAlign: "center",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "end",
    gap: 8,
    cursor: "pointer",
    minHeight: 120,
    overflow: "visible",
  },
  cardText: {
    display: "grid",
    gap: 6,
    textAlign: "left",
    alignSelf: "end",
  },
  cardImage: {
    width: "100%",
    maxWidth: 120,
    height: "auto",
    objectFit: "contain",
    alignSelf: "end",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 500,
  },
  cardSubtitle: {
    fontSize: 16,
    lineHeight: 1.35,
    color: "inherit",
    opacity: 0.65,
    fontWeight: 400,
    maxWidth: 140,
  },
  primaryBtn: {
    marginTop: 18,
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
  actions: {
    marginTop: "auto",
    paddingTop: 18,
    display: "grid",
    gap: 10,
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

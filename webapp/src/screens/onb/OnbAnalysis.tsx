// webapp/src/screens/onb/OnbAnalysis.tsx
// ============================================================================
// ANALYSIS SCREEN - Shows personalized metrics before scheme selection
// Displays: Calories, Water, BMI, Time Investment, Timeline
// ============================================================================

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  analyzeUserProfile,
  buildUserContextFromDraft,
  type AnalysisResult,
} from "@/utils/analyzeUserProfile";

type Props = {
  draft: Record<string, any>;
  onSubmit: () => void;
  onBack?: () => void;
};

export default function OnbAnalysis({ draft, onSubmit, onBack }: Props) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  // Build user context and analyze
  const analysis = useMemo<AnalysisResult | null>(() => {
    const userContext = buildUserContextFromDraft(draft);
    if (!userContext) return null;
    try {
      return analyzeUserProfile(userContext);
    } catch (e) {
      console.error("Analysis error:", e);
      return null;
    }
  }, [draft]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  // Scroll to top and lock scroll
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const prevOverflow = root?.style.overflowY;
    const prevOverscroll = root?.style.overscrollBehaviorY;
    if (root) {
      root.style.overflowY = "auto";
      root.style.overscrollBehaviorY = "none";
      root.scrollTop = 0;
    }
    document.documentElement.scrollTop = 0;
    window.scrollTo(0, 0);
    return () => {
      if (root) {
        root.style.overflowY = prevOverflow || "";
        root.style.overscrollBehaviorY = prevOverscroll || "";
      }
    };
  }, []);

  // Staggered content reveal
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleNext = () => {
    if (isLeaving) return;
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;
    if (prefersReduced) {
      onSubmit();
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      onSubmit();
    }, 220);
  };

  const handleBack = () => {
    if (isLeaving || !onBack) return;
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;
    if (prefersReduced) {
      onBack();
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      onBack();
    }, 220);
  };

  // Fallback if no data
  if (!analysis) {
    return (
      <div style={s.page}>
        <div style={s.errorCard}>
          <p>Не удалось загрузить анализ. Попробуйте вернуться назад.</p>
          {onBack && (
            <button style={s.backBtn} onClick={onBack}>
              Назад
            </button>
          )}
        </div>
      </div>
    );
  }

  const userName = draft.ageSex?.sex === "female" ? "Твои" : "Твои";

  return (
    <div style={s.page} className={isLeaving ? "onb-leave" : undefined}>
      <style>{`
        @keyframes onbFadeUp {
          0% { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes onbFadeDown {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(12px); }
        }
        @keyframes countUp {
          0% { opacity: 0; transform: scale(0.8); }
          60% { transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        .onb-fade {
          animation: onbFadeUp 520ms ease-out both;
        }
        .onb-fade-delay-1 { animation-delay: 80ms; }
        .onb-fade-delay-2 { animation-delay: 160ms; }
        .onb-fade-delay-3 { animation-delay: 280ms; }
        .onb-fade-delay-4 { animation-delay: 400ms; }
        .onb-fade-delay-5 { animation-delay: 520ms; }
        .onb-leave {
          animation: onbFadeDown 220ms ease-in both;
        }
        .count-up {
          animation: countUp 600ms ease-out both;
          animation-delay: 300ms;
        }
        .intro-primary-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          user-select: none;
          transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
        }
        .intro-primary-btn:active:not(:disabled) {
          transform: translateY(1px) scale(0.99) !important;
          background-color: #141619 !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .onb-fade, .onb-leave, .count-up { animation: none !important; }
          .intro-primary-btn { transition: none !important; }
        }
      `}</style>

      {/* Progress */}
      <div
        style={s.progressWrap}
        className={showContent ? "onb-fade onb-fade-delay-1" : ""}
      >
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>
        <div style={s.progressText}>Анализ профиля</div>
      </div>

      {/* Header */}
      <div
        style={s.header}
        className={showContent ? "onb-fade onb-fade-delay-2" : ""}
      >
        <h1 style={s.title}>{userName} персональные метрики</h1>
        <p style={s.subtitle}>На основе твоих ответов</p>
      </div>

      {/* Cards Container */}
      <div style={s.cardsContainer}>
        {/* BLOCK 1: Calories - Main Card */}
        <div
          style={s.mainCard}
          className={showContent ? "onb-fade onb-fade-delay-3" : ""}
        >
          <div style={s.mainCardHeader}>
            <span style={s.cardIcon}>⛽️</span>
            <span style={s.cardLabel}>Топливо</span>
          </div>
          <div style={s.calorieValue} className="count-up">
            {analysis.calories.value.toLocaleString("ru-RU")}
            <span style={s.calorieUnit}> ккал</span>
          </div>
          <div style={s.calorieBadge}>
            {analysis.calories.label}
            {analysis.calories.percentChange !== 0 && (
              <span style={s.percentBadge}>
                {analysis.calories.percentChange > 0 ? "+" : ""}
                {analysis.calories.percentChange}%
              </span>
            )}
          </div>
          <p style={s.calorieDescription}>{analysis.calories.description}</p>
        </div>

        {/* BLOCK 2: Macros (Protein/Fat/Carbs) */}
        <div
          style={s.macrosCard}
          className={showContent ? "onb-fade onb-fade-delay-3" : ""}
        >
          <div style={s.macrosHeader}>
            <span style={s.cardIcon}>🍽️</span>
            <span style={s.cardLabel}>БЖУ в день</span>
          </div>
          <div style={s.macrosGrid}>
            <div style={s.macroItem}>
              <div style={s.macroValue}>{analysis.macros.protein}</div>
              <div style={s.macroLabel}>Белки</div>
              <div style={s.macroUnit}>г</div>
            </div>
            <div style={s.macroDivider} />
            <div style={s.macroItem}>
              <div style={s.macroValue}>{analysis.macros.fat}</div>
              <div style={s.macroLabel}>Жиры</div>
              <div style={s.macroUnit}>г</div>
            </div>
            <div style={s.macroDivider} />
            <div style={s.macroItem}>
              <div style={s.macroValue}>{analysis.macros.carbs}</div>
              <div style={s.macroLabel}>Углеводы</div>
              <div style={s.macroUnit}>г</div>
            </div>
          </div>
        </div>

        {/* BLOCK 3: Health Grid (Water + BMI) */}
        <div
          style={s.gridRow}
          className={showContent ? "onb-fade onb-fade-delay-4" : ""}
        >
          {/* Water Card */}
          <div style={s.smallCard}>
            <div style={s.smallCardHeader}>
              <span style={s.smallCardIcon}>💧</span>
              <span style={s.smallCardLabel}>Вода</span>
            </div>
            <div style={s.smallCardValue}>
              {analysis.water.liters}
              <span style={s.smallCardUnit}> л/день</span>
            </div>
            <p style={s.smallCardSub}>~{analysis.water.glasses} стаканов</p>
          </div>

          {/* BMI Card */}
          <div style={s.smallCard}>
            <div style={s.smallCardHeader}>
              <span style={s.smallCardIcon}>📊</span>
              <span style={s.smallCardLabel}>ИМТ</span>
            </div>
            <div style={{ ...s.smallCardValue, color: analysis.bmi.color }}>
              {analysis.bmi.value}
            </div>
            <p style={s.smallCardSub}>{analysis.bmi.title}</p>
          </div>
        </div>

        {/* BLOCK 4: Time Investment */}
        <div
          style={s.investmentCard}
          className={showContent ? "onb-fade onb-fade-delay-4" : ""}
        >
          <div style={s.investmentHeader}>
            <span style={s.cardIcon}>⏳</span>
            <span style={s.cardLabel}>Инвестиция времени</span>
          </div>
          <div style={s.investmentContent}>
            <div style={s.investmentMain}>
              <span style={s.investmentPercent}>{analysis.investment.percent}</span>
              <span style={s.investmentText}> твоей недели</span>
            </div>
            <p style={s.investmentSub}>
              {analysis.investment.hoursPerWeek} ч/нед ·{" "}
              {analysis.investment.minutesPerDay} мин/день в среднем
            </p>
          </div>
        </div>

        {/* BLOCK 5: Timeline */}
        <div
          style={s.timelineCard}
          className={showContent ? "onb-fade onb-fade-delay-5" : ""}
        >
          <div style={s.timelineHeader}>
            <span style={s.cardIcon}>🚀</span>
            <span style={s.cardLabel}>Что тебя ждёт</span>
          </div>
          <div style={s.timelineList}>
            {analysis.timeline.map((item, idx) => (
              <div key={idx} style={s.timelineItem}>
                <div style={s.timelineLeft}>
                  <div style={s.timelineIcon}>{item.icon}</div>
                  {idx < analysis.timeline.length - 1 && (
                    <div style={s.timelineLine} />
                  )}
                </div>
                <div style={s.timelineRight}>
                  <div style={s.timelineWeek}>Неделя {item.week}</div>
                  <div style={s.timelineTitle}>{item.title}</div>
                  <p style={s.timelineDesc}>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={s.actions}>
        <button
          type="button"
          style={s.primaryBtn}
          className="intro-primary-btn"
          onClick={handleNext}
          disabled={isLeaving}
        >
          Выбрать программу
        </button>
        {onBack && (
          <button type="button" style={s.backBtn} onClick={handleBack}>
            Назад
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding:
      "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 160px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#0f172a",
  },
  progressWrap: {
    display: "grid",
    gap: 8,
    marginTop: 6,
    opacity: 0,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    background: "rgba(15, 23, 42, 0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    width: "92%",
    background: "#1e1f22",
    borderRadius: 999,
    boxShadow:
      "0 2px 6px rgba(15, 23, 42, 0.25), inset 0 1px 0 rgba(255,255,255,0.35)",
  },
  progressText: {
    fontSize: 12,
    color: "rgba(15, 23, 42, 0.55)",
    textAlign: "center",
  },
  header: {
    display: "grid",
    gap: 6,
    textAlign: "center",
    marginTop: 8,
    opacity: 0,
  },
  title: {
    margin: 0,
    fontSize: 28,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  subtitle: {
    margin: 0,
    fontSize: 15,
    color: "rgba(15, 23, 42, 0.6)",
  },
  cardsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 8,
  },
  // Main Calorie Card
  mainCard: {
    borderRadius: 20,
    padding: "20px 18px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow:
      "0 12px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    opacity: 0,
  },
  mainCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.6)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  calorieValue: {
    fontSize: 48,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1,
    letterSpacing: -1,
  },
  calorieUnit: {
    fontSize: 24,
    fontWeight: 500,
    color: "rgba(15, 23, 42, 0.5)",
  },
  calorieBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
  },
  percentBadge: {
    padding: "2px 8px",
    borderRadius: 6,
    background: "rgba(15, 23, 42, 0.08)",
    fontSize: 13,
    fontWeight: 500,
  },
  calorieDescription: {
    margin: "10px 0 0",
    fontSize: 14,
    color: "rgba(15, 23, 42, 0.6)",
    lineHeight: 1.4,
  },
  // Macros Card
  macrosCard: {
    borderRadius: 16,
    padding: "16px 18px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.8) 100%)",
    border: "1px solid rgba(255,255,255,0.5)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    opacity: 0,
  },
  macrosHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  macrosGrid: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
  },
  macroItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  macroValue: {
    fontSize: 28,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.1,
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  macroUnit: {
    fontSize: 11,
    color: "rgba(15, 23, 42, 0.4)",
  },
  macroDivider: {
    width: 1,
    height: 40,
    background: "rgba(15, 23, 42, 0.1)",
    flexShrink: 0,
  },
  // Grid Row (Water + BMI)
  gridRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    opacity: 0,
  },
  smallCard: {
    borderRadius: 16,
    padding: "16px 14px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.8) 100%)",
    border: "1px solid rgba(255,255,255,0.5)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },
  smallCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  smallCardIcon: {
    fontSize: 16,
  },
  smallCardLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  smallCardValue: {
    fontSize: 28,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.1,
  },
  smallCardUnit: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(15, 23, 42, 0.5)",
  },
  smallCardSub: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "rgba(15, 23, 42, 0.5)",
  },
  // Investment Card
  investmentCard: {
    borderRadius: 16,
    padding: "16px 18px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.8) 100%)",
    border: "1px solid rgba(255,255,255,0.5)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    opacity: 0,
  },
  investmentHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  investmentContent: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  investmentMain: {
    display: "flex",
    alignItems: "baseline",
  },
  investmentPercent: {
    fontSize: 32,
    fontWeight: 700,
    color: "#0f172a",
  },
  investmentText: {
    fontSize: 16,
    fontWeight: 500,
    color: "rgba(15, 23, 42, 0.6)",
    marginLeft: 4,
  },
  investmentSub: {
    margin: 0,
    fontSize: 13,
    color: "rgba(15, 23, 42, 0.5)",
  },
  // Timeline Card
  timelineCard: {
    borderRadius: 16,
    padding: "16px 18px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.8) 100%)",
    border: "1px solid rgba(255,255,255,0.5)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    opacity: 0,
  },
  timelineHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  timelineList: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  timelineItem: {
    display: "flex",
    gap: 12,
  },
  timelineLeft: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: 32,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "rgba(15, 23, 42, 0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 20,
    background: "rgba(15, 23, 42, 0.1)",
    margin: "4px 0",
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 16,
  },
  timelineWeek: {
    fontSize: 11,
    fontWeight: 600,
    color: "rgba(15, 23, 42, 0.4)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#0f172a",
    marginTop: 2,
  },
  timelineDesc: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "rgba(15, 23, 42, 0.6)",
    lineHeight: 1.4,
  },
  // Actions
  actions: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "14px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)",
    display: "grid",
    gap: 10,
    background:
      "linear-gradient(to top, rgba(245,245,247,1) 70%, rgba(245,245,247,0))",
    zIndex: 10,
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
  errorCard: {
    padding: 24,
    textAlign: "center",
    color: "rgba(15, 23, 42, 0.7)",
  },
};

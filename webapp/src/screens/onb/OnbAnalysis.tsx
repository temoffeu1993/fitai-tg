// webapp/src/screens/onb/OnbAnalysis.tsx
// ============================================================================
// ANALYSIS SCREEN - Shows personalized metrics before scheme selection
// New structure: Profile, Strategy, Fuel, Water, Timeline, Investment
// ============================================================================

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  analyzeUserProfile,
  buildUserContextFromDraft,
  type AnalysisResult,
} from "@/utils/analyzeUserProfile";
import maleRobotImg from "@/assets/robonew.png";
import femaleRobotImg from "@/assets/zhennew.png";

type Props = {
  draft: Record<string, any>;
  onSubmit: () => void;
  onBack?: () => void;
};

export default function OnbAnalysis({ draft, onSubmit, onBack }: Props) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [reveal, setReveal] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  // Extract user data
  const sex = draft.ageSex?.sex as "male" | "female" | undefined;
  const age = draft.ageSex?.age as number | undefined;
  const weight = draft.body?.weight as number | undefined;
  const height = draft.body?.height as number | undefined;

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
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;
    if (prefersReduced) {
      setReveal(true);
      setShowContent(true);
      return;
    }
    const t1 = window.setTimeout(() => setReveal(true), 30);
    const t2 = window.setTimeout(() => setShowContent(true), 200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
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

  // Generate tempo fire icons
  const tempoFires = "🔥".repeat(analysis.strategy.tempo) + "⚪".repeat(3 - analysis.strategy.tempo);

  // Generate water glasses (max 12 to avoid overflow)
  const glassCount = Math.min(analysis.water.glasses, 12);
  const waterGlasses = "🥛".repeat(glassCount);

  // Pie chart for investment
  const investPercent = analysis.investment.percentNum;
  const pieAngle = (investPercent / 100) * 360;

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
        .onb-fade-target {
          opacity: 0;
        }
        .onb-fade {
          animation: onbFadeUp 520ms ease-out both;
        }
        .onb-fade-delay-1 { animation-delay: 80ms; }
        .onb-fade-delay-2 { animation-delay: 160ms; }
        .onb-fade-delay-3 { animation-delay: 280ms; }
        .onb-fade-delay-4 { animation-delay: 400ms; }
        .onb-fade-delay-5 { animation-delay: 520ms; }
        .onb-fade-delay-6 { animation-delay: 640ms; }
        .onb-fade-delay-7 { animation-delay: 760ms; }
        .onb-leave {
          animation: onbFadeDown 220ms ease-in both;
        }
        .count-up {
          animation: countUp 600ms ease-out both;
          animation-delay: 300ms;
        }
        .analysis-blackout {
          position: fixed;
          inset: 0;
          background: #000;
          opacity: 1;
          pointer-events: none;
          z-index: 30;
          transition: opacity 420ms ease;
        }
        .analysis-blackout.reveal {
          opacity: 0;
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
          .onb-fade-target { opacity: 1 !important; transform: none !important; }
          .analysis-blackout { transition: none !important; }
          .intro-primary-btn { transition: none !important; }
        }
      `}</style>

      {/* Header */}
      <div
        style={s.header}
        className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-1" : ""}`}
      >
        <h1 style={s.title}>Твой персональный план</h1>
        <p style={s.subtitle}>На основе твоих ответов</p>
      </div>

      {/* Cards Container */}
      <div style={s.cardsContainer}>
        {/* BLOCK 1: Profile Card (Mascot + Stats) */}
        <div
          style={s.profileCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-2" : ""}`}
        >
          <img
            src={sex === "female" ? femaleRobotImg : maleRobotImg}
            alt="Mascot"
            style={s.mascotImg}
          />
          <div style={s.profileStats}>
            <div style={s.statRow}>
              <span style={s.statLabel}>Возраст</span>
              <span style={s.statValue}>{age} лет</span>
            </div>
            <div style={s.statRow}>
              <span style={s.statLabel}>Рост</span>
              <span style={s.statValue}>{height} см</span>
            </div>
            <div style={s.statRow}>
              <span style={s.statLabel}>Вес</span>
              <span style={s.statValue}>{weight} кг</span>
            </div>
            <div style={s.statRow}>
              <span style={s.statLabel}>ИМТ</span>
              <span style={{ ...s.statValue, color: analysis.bmi.color }}>
                {analysis.bmi.value} ✓
              </span>
            </div>
          </div>
        </div>

        {/* BLOCK 2: Strategy Card */}
        <div
          style={s.strategyCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-2" : ""}`}
        >
          <div style={s.strategyHeader}>
            <span style={s.cardIcon}>🎯</span>
            <span style={s.cardLabel}>Твоя стратегия</span>
          </div>
          <div style={s.strategyInner}>
            <div style={s.strategyFocus}>{analysis.strategy.focus}</div>
            <div style={s.strategyTempo}>
              {analysis.strategy.tempoLabel} темп {tempoFires}
            </div>
          </div>
          <p style={s.strategyDesc}>{analysis.strategy.description}</p>
        </div>

        {/* BLOCK 3: Fuel Card (Calories) */}
        <div
          style={s.fuelCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}
        >
          <div style={s.fuelHeader}>
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

        {/* BLOCK 4: Macros */}
        <div
          style={s.macrosCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}
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

        {/* BLOCK 5: Water (full width with glasses) */}
        <div
          style={s.waterCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-4" : ""}`}
        >
          <div style={s.waterHeader}>
            <span style={s.cardIcon}>💧</span>
            <span style={s.cardLabel}>Вода</span>
          </div>
          <div style={s.waterValue}>
            {analysis.water.liters}
            <span style={s.waterUnit}> л/день</span>
          </div>
          <div style={s.waterGlasses}>{waterGlasses}</div>
          <p style={s.waterSub}>{analysis.water.glasses} стаканов</p>
        </div>

        {/* BLOCK 6: Timeline */}
        <div
          style={s.timelineCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-5" : ""}`}
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

        {/* BLOCK 7: Investment (Pie Chart) */}
        <div
          style={s.investmentCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-6" : ""}`}
        >
          <div style={s.investmentHeader}>
            <span style={s.cardIcon}>💰</span>
            <span style={s.cardLabel}>Цена успеха</span>
          </div>
          <div style={s.investmentContent}>
            <div style={s.pieContainer}>
              <svg viewBox="0 0 100 100" style={s.pieSvg}>
                {/* Background circle (rest of life) */}
                <circle cx="50" cy="50" r="40" fill="#e5e7eb" />
                {/* Sport slice */}
                <path
                  d={describeArc(50, 50, 40, 0, pieAngle)}
                  fill="#22c55e"
                />
                {/* Center hole for donut effect */}
                <circle cx="50" cy="50" r="25" fill="white" />
              </svg>
              <div style={s.pieCenter}>
                <span style={s.piePercent}>{analysis.investment.percent}</span>
              </div>
            </div>
            <div style={s.investmentText}>
              <div style={s.investmentMain}>
                Всего <strong>{analysis.investment.percent}</strong> твоей недели
              </div>
              <p style={s.investmentSub}>
                ≈ {analysis.investment.hoursPerWeek} часов из 168
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        style={s.actions}
        className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-7" : ""}`}
      >
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

      <div
        aria-hidden
        className={`analysis-blackout${reveal ? " reveal" : ""}`}
      />
    </div>
  );
}

// ============================================================================
// SVG ARC HELPER for Pie Chart
// ============================================================================

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", x, y,
    "L", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    "Z",
  ].join(" ");
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

  // Profile Card
  profileCard: {
    borderRadius: 20,
    padding: "16px 18px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.08)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    display: "flex",
    alignItems: "center",
    gap: 16,
    opacity: 0,
  },
  mascotImg: {
    width: 80,
    height: 80,
    objectFit: "contain",
    flexShrink: 0,
  },
  profileStats: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 14,
    color: "rgba(15, 23, 42, 0.6)",
  },
  statValue: {
    fontSize: 15,
    fontWeight: 600,
    color: "#0f172a",
  },

  // Strategy Card
  strategyCard: {
    borderRadius: 16,
    padding: "16px 18px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.08)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    opacity: 0,
  },
  strategyHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  strategyInner: {
    borderRadius: 12,
    padding: "14px 16px",
    background: "rgba(15, 23, 42, 0.04)",
    marginBottom: 12,
  },
  strategyFocus: {
    fontSize: 22,
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 6,
  },
  strategyTempo: {
    fontSize: 14,
    color: "rgba(15, 23, 42, 0.7)",
    letterSpacing: 0.3,
  },
  strategyDesc: {
    margin: 0,
    fontSize: 14,
    color: "rgba(15, 23, 42, 0.7)",
    lineHeight: 1.5,
  },

  // Fuel Card
  fuelCard: {
    borderRadius: 20,
    padding: "20px 18px",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.08)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    opacity: 0,
  },
  fuelHeader: {
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

  // Water Card
  waterCard: {
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
  waterHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  waterValue: {
    fontSize: 32,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1,
  },
  waterUnit: {
    fontSize: 18,
    fontWeight: 500,
    color: "rgba(15, 23, 42, 0.5)",
  },
  waterGlasses: {
    fontSize: 24,
    letterSpacing: 2,
    marginTop: 10,
    lineHeight: 1.4,
  },
  waterSub: {
    margin: "6px 0 0",
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

  // Investment Card (Pie Chart)
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
    marginBottom: 14,
  },
  investmentContent: {
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  pieContainer: {
    position: "relative",
    width: 90,
    height: 90,
    flexShrink: 0,
  },
  pieSvg: {
    width: "100%",
    height: "100%",
  },
  pieCenter: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  piePercent: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
  investmentText: {
    flex: 1,
  },
  investmentMain: {
    fontSize: 16,
    color: "#0f172a",
    lineHeight: 1.4,
  },
  investmentSub: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "rgba(15, 23, 42, 0.5)",
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

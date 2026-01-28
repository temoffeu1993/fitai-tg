// webapp/src/screens/onb/OnbAnalysis.tsx
// ============================================================================
// ANALYSIS SCREEN - Shows personalized metrics before scheme selection
// New structure: Mascot+Bubble, Chips, Strategy, Fuel, Macros, Water+BMI, Investment, Timeline
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

const BUBBLE_TEXT = "Я подготовил твой\nперсональный план";

export default function OnbAnalysis({ draft, onSubmit, onBack }: Props) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const leaveTimerRef = useRef<number | null>(null);

  // Extract user data
  const sex = draft.ageSex?.sex as "male" | "female" | undefined;
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
      root.style.overscrollBehaviorY = "auto";
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

  // Staggered content reveal + bubble typing effect
  useEffect(() => {
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;
    if (prefersReduced) {
      setReveal(true);
      setShowContent(true);
      setBubbleText(BUBBLE_TEXT);
      return;
    }
    const t1 = window.setTimeout(() => setReveal(true), 30);
    const t2 = window.setTimeout(() => setShowContent(true), 200);

    // Typing effect for bubble
    let index = 0;
    const typeInterval = window.setInterval(() => {
      index += 1;
      setBubbleText(BUBBLE_TEXT.slice(0, index));
      if (index >= BUBBLE_TEXT.length) {
        window.clearInterval(typeInterval);
      }
    }, 18);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(typeInterval);
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

  // Tempo level for bar indicator
  const tempoLevel = analysis.strategy.tempo;

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
        .onb-fade-delay-1 { animation-delay: 160ms; }
        .onb-fade-delay-2 { animation-delay: 760ms; }
        .onb-fade-delay-3 { animation-delay: 1360ms; }
        .onb-fade-delay-4 { animation-delay: 1960ms; }
        .onb-fade-delay-5 { animation-delay: 2560ms; }
        .onb-fade-delay-6 { animation-delay: 3160ms; }
        .onb-fade-delay-7 { animation-delay: 3760ms; }
        .onb-fade-delay-8 { animation-delay: 4360ms; }
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

      {/* BLOCK 1: Mascot with Speech Bubble */}
        <div
          style={s.mascotRow}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-1" : ""}`}
        >
        <img
          src={sex === "female" ? femaleRobotImg : maleRobotImg}
          alt="Mascot"
          style={s.mascotImg}
        />
        <div style={s.bubble} className="speech-bubble">
          <span style={s.bubbleText}>{bubbleText}</span>
        </div>
      </div>

      {/* Cards Container */}
      <div style={s.cardsContainer}>
        {/* BLOCK 3: Strategy Card (styled like Fuel) */}
        <div
          style={s.mainCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-2" : ""}`}
        >
          <div style={s.mainCardHeader}>
            <span style={s.cardIcon}>🎯</span>
            <span style={s.cardLabel}>Твоя стратегия</span>
          </div>
          <div style={s.strategyFocus}>{analysis.strategy.focus}</div>
          <div style={s.strategyTempoRow}>
            <span style={s.strategyIntensityLabel}>Интенсивность</span>
            <div style={s.tempoBars}>
              <div style={{ ...s.tempoBar, ...s.tempoBar1, background: tempoLevel >= 1 ? "#1e1f22" : "#e5e7eb" }} />
              <div style={{ ...s.tempoBar, ...s.tempoBar2, background: tempoLevel >= 2 ? "#1e1f22" : "#e5e7eb" }} />
              <div style={{ ...s.tempoBar, ...s.tempoBar3, background: tempoLevel >= 3 ? "#1e1f22" : "#e5e7eb" }} />
            </div>
          </div>
          <p style={s.strategyDesc}>{analysis.strategy.description}</p>
        </div>

        {/* BLOCK 4: Fuel Card (Calories) */}
        <div
          style={s.mainCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}
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

        {/* BLOCK 5: Macros */}
        <div
          style={s.macrosCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-4" : ""}`}
        >
          <div style={s.macrosHeader}>
            <span style={s.cardIcon}>🍽️</span>
            <span style={s.cardLabel}>БЖУ в день</span>
          </div>
          {(() => {
            const p = analysis.macros.protein;
            const f = analysis.macros.fat;
            const c = analysis.macros.carbs;
            const total = Math.max(p + f + c, 1);
            const pWidth = (p / total) * 100;
            const fWidth = (f / total) * 100;
            const cWidth = (c / total) * 100;

            return (
              <div style={s.macrosContainer}>
                <div style={s.macrosBar}>
                  <div style={{ ...s.macrosSegment, width: `${pWidth}%`, background: "#3B82F6" }} />
                  <div style={{ ...s.macrosSegment, width: `${fWidth}%`, background: "#EAB308" }} />
                  <div style={{ ...s.macrosSegment, width: `${cWidth}%`, background: "#22C55E" }} />
                </div>
                <div style={s.macrosLegend}>
                  <div style={s.legendItem}>
                    <div style={{ ...s.legendDot, background: "#3B82F6" }} />
                    <span>Белки {p}г</span>
                  </div>
                  <div style={s.legendItem}>
                    <div style={{ ...s.legendDot, background: "#EAB308" }} />
                    <span>Жиры {f}г</span>
                  </div>
                  <div style={s.legendItem}>
                    <div style={{ ...s.legendDot, background: "#22C55E" }} />
                    <span>Углеводы {c}г</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* BLOCK 6: Water + BMI Grid */}
        <div
          style={s.gridRow}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-5" : ""}`}
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

        {/* BLOCK 7: Timeline */}
        <div
          style={s.timelineCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-6" : ""}`}
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

        {/* BLOCK 8: Investment (Pie Chart) */}
        <div
          style={s.investmentCard}
          className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-7" : ""}`}
        >
          <div style={s.investmentHeader}>
            <span style={s.cardIcon}>💰</span>
            <span style={s.cardLabel}>Цена успеха</span>
          </div>
          <div style={s.investmentContent}>
            <div style={s.pieContainer}>
              <svg viewBox="0 0 100 100" style={s.pieSvg}>
                {/* Background circle (rest of life) */}
                <circle cx="50" cy="50" r="45" fill="#e5e7eb" />
                {/* Sport slice */}
                <path
                  d={describeArc(50, 50, 45, 0, pieAngle)}
                  fill="#22c55e"
                />
                {/* Center hole for donut effect */}
                <circle cx="50" cy="50" r="28" fill="white" />
              </svg>
              <div style={s.pieLabel}>
                <span style={s.pieLabelText}>спорт</span>
              </div>
            </div>
            <div style={s.investmentText}>
              <div style={s.investmentPercent}>{analysis.investment.percent}</div>
              <div style={s.investmentMain}>твоего времени в неделю</div>
              <p style={s.investmentSub}>
                Остальные {(100 - investPercent).toFixed(0)}% — на жизнь и отдых
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        style={s.actions}
        className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-8" : ""}`}
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

  // Mascot Row
  mascotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    opacity: 0,
  },
  mascotImg: {
    width: 140,
    height: "auto",
    objectFit: "contain",
  },
  bubble: {
    position: "relative",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "rgba(255,255,255,0.9)",
    color: "#0f172a",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  bubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#0f172a",
    whiteSpace: "pre-line",
  },

  cardsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 4,
  },

  // Main Card (Strategy & Fuel)
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

  // Strategy styles
  strategyFocus: {
    fontSize: 32,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.1,
    letterSpacing: -0.5,
  },
  strategyTempoRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  strategyIntensityLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1,
    paddingBottom: 2,
  },
  tempoBars: {
    display: "flex",
    alignItems: "flex-end",
    gap: 3,
  },
  tempoBar: {
    width: 6,
    borderRadius: 2,
  },
  tempoBar1: {
    height: 8,
  },
  tempoBar2: {
    height: 14,
  },
  tempoBar3: {
    height: 20,
  },
  strategyDesc: {
    margin: "10px 0 0",
    fontSize: 14,
    color: "rgba(15, 23, 42, 0.6)",
    lineHeight: 1.5,
  },

  // Calorie styles
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
  macrosContainer: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 8,
  },
  macrosBar: {
    display: "flex",
    height: 16,
    borderRadius: 10,
    overflow: "hidden",
    width: "100%",
    background: "#F1F5F9",
  },
  macrosSegment: {
    height: "100%",
    transition: "width 1s ease-out",
  },
  macrosLegend: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    color: "#64748B",
    fontWeight: 500,
    gap: 10,
    flexWrap: "wrap",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
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
    fontSize: 12,
    color: "rgba(15, 23, 42, 0.5)",
  },

  // Investment Card (Pie Chart)
  investmentCard: {
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
  investmentHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  investmentContent: {
    display: "flex",
    alignItems: "center",
    gap: 24,
  },
  pieContainer: {
    position: "relative",
    width: 120,
    height: 120,
    flexShrink: 0,
  },
  pieSvg: {
    width: "100%",
    height: "100%",
  },
  pieLabel: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  pieLabelText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#22c55e",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  investmentText: {
    flex: 1,
  },
  investmentPercent: {
    fontSize: 36,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1,
    letterSpacing: -0.5,
  },
  investmentMain: {
    marginTop: 4,
    fontSize: 15,
    color: "#0f172a",
    lineHeight: 1.3,
  },
  investmentSub: {
    margin: "8px 0 0",
    fontSize: 13,
    color: "rgba(15, 23, 42, 0.5)",
    lineHeight: 1.4,
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

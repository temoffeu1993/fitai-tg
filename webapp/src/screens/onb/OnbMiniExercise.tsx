// webapp/src/screens/onb/OnbMiniExercise.tsx
// Mini exercise picker: offers 3 quick exercises to try right away
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import breathImg from "@/assets/dihanie.webp";
import healImg from "@/assets/heals.webp";
import absImg from "@/assets/zhenzhiv.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Props = {
  onSelect: (exerciseId: string) => void;
  onSkip: () => void;
  onBack?: () => void;
};

type Exercise = {
  id: string;
  title: string;
  description: string;
  duration: string;
  image: string;
  gradient: string;
  imageOffset?: React.CSSProperties;
};

const EXERCISES: Exercise[] = [
  {
    id: "co2_test",
    title: "Выносливость",
    description: "Задержите дыхание на максимум. Узнаем, как ваши лёгкие усваивают кислород.",
    duration: "1 мин",
    image: breathImg,
    gradient:
      "radial-gradient(120% 120% at 0% 0%, rgba(142,191,255,0.45) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(111,157,255,0.3) 0%, rgba(255,255,255,0) 55%)",
    imageOffset: { bottom: -36 },
  },
  {
    id: "box_breathing",
    title: "Снятие стресса",
    description: "Дыхание по квадрату. Снижает пульс и помогает собраться с мыслями.",
    duration: "2 мин",
    image: healImg,
    gradient:
      "radial-gradient(120% 120% at 0% 0%, rgba(126,220,190,0.45) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(96,192,160,0.3) 0%, rgba(255,255,255,0) 55%)",
  },
  {
    id: "vacuum",
    title: "Тонус живота",
    description: "Упражнение \u00ABВакуум\u00BB. Работа с мышцами пресса без коврика и спортзала.",
    duration: "2 мин",
    image: absImg,
    gradient:
      "radial-gradient(120% 120% at 0% 0%, rgba(255,185,150,0.45) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(255,160,120,0.3) 0%, rgba(255,255,255,0) 55%)",
    imageOffset: { bottom: -60, height: 220, maxHeight: 220, maxWidth: 220 },
  },
];

const CARD_EXPANDED_H = 240;
const CARD_COLLAPSED_H = 96;
const CARD_PADDING = 18;
const STACK_OFFSET = 70;

export default function OnbMiniExercise({ onSelect, onSkip, onBack }: Props) {
  const [showContent, setShowContent] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [activeId, setActiveId] = useState<string>(EXERCISES[0]?.id ?? "");
  const leaveTimerRef = useRef<number | null>(null);
  const activeExercise =
    EXERCISES.find((item) => item.id === activeId) || EXERCISES[EXERCISES.length - 1];

  // Preload card images
  useEffect(() => {
    const sources = [breathImg, healImg, absImg];
    sources.forEach((src) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    });
  }, []);

  // Scroll to top
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  // Cleanup leave timer
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  // Reveal content
  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      setShowContent(true);
      return;
    }
    const t = window.setTimeout(() => setShowContent(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  const handleSkip = () => {
    if (isLeaving) return;
    fireHapticImpact("light");
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      onSkip();
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => onSkip(), 220);
  };

  return (
    <div style={st.page} className={isLeaving ? "onb-leave" : undefined}>
      <ScreenStyles />

      {/* Header */}
      <div style={st.header} className="onb-fade onb-fade-delay-2">
        <h1 style={st.title}>Настрой тело перед тренировкой</h1>
        <p style={st.subtitle}>Выбирай любое упражнение</p>
      </div>

      {/* Exercise Cards */}
      <div style={st.cardsContainer}>
        {EXERCISES.map((ex, idx) => {
          const activeIndex = Math.max(0, EXERCISES.findIndex((item) => item.id === activeId));
          const order = EXERCISES.map((_, i) => i).filter((i) => i !== activeIndex);
          order.push(activeIndex);
          const stackIndex = order.indexOf(idx);
          const top = stackIndex * STACK_OFFSET;
          const height = stackIndex === order.length - 1 ? CARD_EXPANDED_H : CARD_COLLAPSED_H;
          const zIndex = stackIndex + 1;
          return (
            <button
              key={ex.id}
              type="button"
              className={`exercise-card onb-fade-target${showContent ? ` onb-fade onb-fade-delay-${idx + 2}` : ""}`}
              style={{
                ...st.card,
                ...(stackIndex === 0 ? st.cardActive : st.cardCollapsed),
                top,
                height,
                zIndex,
                background: `linear-gradient(180deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%), ${ex.gradient}`,
              }}
              onClick={() => {
                if (activeId !== ex.id) {
                  fireHapticImpact("light");
                  setActiveId(ex.id);
                }
              }}
            >
              <div style={st.cardInner}>
                <div style={st.cardContent}>
                  <div style={st.cardTopRow}>
                    <div style={st.cardTitle}>{ex.title}</div>
                    <div style={st.playBtn}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8H11" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M9 5L12 8L9 11" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                <div style={st.cardBottomRow}>
                  <div style={st.cardDescWrap}>
                    <div style={st.timeRow}>
                      <span style={st.timeEmoji}>⏱️</span>
                      <span style={st.timeText}>{ex.duration}</span>
                    </div>
                    <div style={st.cardDesc}>{ex.description}</div>
                  </div>
                </div>
                </div>
              <img src={ex.image} alt="" style={{ ...st.cardImage, ...ex.imageOffset }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div
        style={st.actions}
        className={`onb-fade-target${showContent ? " onb-fade onb-fade-delay-3" : ""}`}
      >
        <button
          type="button"
          style={st.startBtn}
          className="intro-primary-btn"
          onClick={() => {
            if (isLeaving) return;
            fireHapticImpact("light");
            const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
            if (prefersReduced) {
              onSelect(activeExercise.id);
              return;
            }
            setIsLeaving(true);
            leaveTimerRef.current = window.setTimeout(() => onSelect(activeExercise.id), 220);
          }}
        >
          Начать
        </button>
        <button type="button" style={st.backBtn} onClick={handleSkip}>
          Сделаю в другой раз
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN STYLES (animations, bubble, cards)
// ============================================================================

function ScreenStyles() {
  return (
    <style>{`
      @keyframes onbFadeUp {
        0% { opacity: 0; transform: translateY(14px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes onbFadeDown {
        0% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(12px); }
      }
      .onb-fade-target { opacity: 0; }
      .onb-fade { animation: onbFadeUp 520ms ease-out both; }
      .onb-fade-delay-1 { animation-delay: 80ms; }
      .onb-fade-delay-2 { animation-delay: 160ms; }
      .onb-fade-delay-3 { animation-delay: 240ms; }
      .onb-fade-delay-4 { animation-delay: 320ms; }
      .onb-leave { animation: onbFadeDown 220ms ease-in both; }
      .speech-bubble:before {
        content: ""; position: absolute;
        left: -8px; top: 18px; width: 0; height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-right: 8px solid rgba(255,255,255,0.9);
        filter: drop-shadow(-1px 0 0 rgba(15, 23, 42, 0.12));
      }
      .exercise-card {
        appearance: none; outline: none; cursor: pointer;
        text-align: left;
        -webkit-tap-highlight-color: transparent;
        transition: transform 220ms ease, box-shadow 220ms ease;
        will-change: transform;
      }
      .exercise-card:active:not(:disabled) {
        transform: translateY(1px) scale(0.98);
      }
      @media (prefers-reduced-motion: reduce) {
        .onb-fade, .onb-leave { animation: none !important; }
        .onb-fade-target { opacity: 1 !important; transform: none !important; }
        .exercise-card { transition: none !important; }
      }
    `}</style>
  );
}

// ============================================================================
// INLINE STYLES
// ============================================================================

const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 160px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#1e1f22",
  },

  // Mascot Row
  mascotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  mascotImg: {
    width: 140,
    height: "auto",
    objectFit: "contain",
  },
  mascotHidden: {
    opacity: 0,
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

  // Cards Container
  cardsContainer: {
    position: "relative",
    width: "100%",
    marginTop: 6,
    height: CARD_EXPANDED_H + (EXERCISES.length - 1) * STACK_OFFSET + 8,
  },

  // Card
  card: {
    borderRadius: 20,
    padding: `${CARD_PADDING}px`,
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow:
      "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    position: "absolute",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    overflow: "hidden",
    transition: "top 320ms ease, height 320ms ease, transform 220ms ease, box-shadow 220ms ease",
    willChange: "top, height, transform",
  },
  cardActive: {},
  cardCollapsed: {
    boxShadow:
      "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
  },
  cardInner: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    height: CARD_EXPANDED_H - CARD_PADDING * 2,
    minHeight: CARD_EXPANDED_H - CARD_PADDING * 2,
    width: "100%",
    position: "relative",
    zIndex: 2,
  },
  cardContent: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    height: "100%",
    minHeight: 0,
    position: "relative",
    zIndex: 2,
  },
  cardTopRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxWidth: "100%",
  },
  cardTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.15,
    letterSpacing: -0.5,
  },
  cardDesc: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(30,31,34,0.55)",
    lineHeight: 1.45,
    maxWidth: "62%",
  },
  cardBottomRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    alignSelf: "stretch",
    marginTop: "auto",
  },
  timeRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 0,
    marginBottom: 8,
  },
  cardDescWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  timeEmoji: {
    fontSize: 20,
    lineHeight: 1,
  },
  timeText: {
    fontSize: 14,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1,
  },
  playBtn: {
    width: 34,
    height: 34,
    minWidth: 34,
    minHeight: 34,
    flexShrink: 0,
    borderRadius: 999,
    border: "none",
    background: "#1e1f22",
    boxShadow: "0 6px 12px rgba(0,0,0,0.24)",
    display: "grid",
    placeItems: "center",
  },
  cardImage: {
    position: "absolute",
    right: -24,
    bottom: -56,
    height: 240,
    width: "auto",
    maxHeight: 240,
    maxWidth: 240,
    objectFit: "contain",
    pointerEvents: "none",
    zIndex: 1,
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
    background: "linear-gradient(to top, rgba(245,245,247,1) 70%, rgba(245,245,247,0))",
    zIndex: 10,
  },
  startBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "center",
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

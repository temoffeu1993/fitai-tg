// webapp/src/screens/onb/OnbMiniExercise.tsx
// Mini exercise picker: offers 3 quick exercises to try right away
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import maleRobotImg from "@/assets/robonew.webp";
import breathImg from "@/assets/dihanie.png";
import healImg from "@/assets/heals.webp";
import absImg from "@/assets/hudoi.webp";
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
};

const EXERCISES: Exercise[] = [
  {
    id: "co2_test",
    title: "Тест на выносливость",
    description: "Задержите дыхание на максимум. Узнаем, как ваши лёгкие усваивают кислород.",
    duration: "1 мин",
    image: breathImg,
    gradient:
      "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(200,226,255,0.85) 38%, rgba(160,196,255,0.82) 70%, rgba(220,240,255,0.9) 100%)",
  },
  {
    id: "box_breathing",
    title: "Снятие стресса",
    description: "Дыхание по квадрату. Снижает пульс и помогает собраться с мыслями.",
    duration: "2 мин",
    image: healImg,
    gradient:
      "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(177,235,215,0.86) 40%, rgba(120,214,186,0.82) 70%, rgba(214,245,233,0.9) 100%)",
  },
  {
    id: "vacuum",
    title: "Тонус живота",
    description: "Упражнение \u00ABВакуум\u00BB. Работа с мышцами пресса без коврика и спортзала.",
    duration: "2 мин",
    image: absImg,
    gradient:
      "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,210,178,0.86) 40%, rgba(255,170,130,0.82) 70%, rgba(255,232,214,0.9) 100%)",
  },
];

const CARD_EXPANDED_H = 220;
const CARD_COLLAPSED_H = 96;
const STACK_OFFSET = 70;

export default function OnbMiniExercise({ onSelect, onSkip, onBack }: Props) {
  const [showContent, setShowContent] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [mascotReady, setMascotReady] = useState(false);
  const [activeId, setActiveId] = useState<string>(EXERCISES[EXERCISES.length - 1]?.id ?? "");
  const leaveTimerRef = useRef<number | null>(null);

  // Preload mascot
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = maleRobotImg;
    const done = () => { if (!cancelled) setMascotReady(true); };
    const anyImg = img as any;
    if (typeof anyImg.decode === "function") {
      anyImg.decode().then(done).catch(() => { img.onload = done; img.onerror = done; });
    } else {
      img.onload = done;
      img.onerror = done;
    }
    return () => { cancelled = true; };
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

  const handleCardTap = (exerciseId: string) => {
    if (isLeaving) return;
    fireHapticImpact("medium");
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      onSelect(exerciseId);
      return;
    }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => onSelect(exerciseId), 220);
  };

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

  const handleBack = () => {
    if (isLeaving || !onBack) return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) { onBack(); return; }
    setIsLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => onBack(), 220);
  };

  return (
    <div style={st.page} className={isLeaving ? "onb-leave" : undefined}>
      <ScreenStyles />

      {/* Mascot + Bubble */}
      <div style={st.mascotRow} className="onb-fade onb-fade-delay-2">
        <img
          src={maleRobotImg}
          alt=""
          style={{ ...st.mascotImg, ...(mascotReady ? undefined : st.mascotHidden) }}
        />
        <div style={st.bubble} className="speech-bubble">
          <span style={st.bubbleText}>
            {"Настроим тело перед тренировкой, выбирай любое упражнение"}
          </span>
        </div>
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
                background: ex.gradient,
              }}
              onClick={() => {
                if (activeId !== ex.id) {
                  fireHapticImpact("light");
                  setActiveId(ex.id);
                  return;
                }
                handleCardTap(ex.id);
              }}
            >
              <div style={st.cardInner}>
                <div style={st.cardTop}>
                  <div style={st.cardLeft}>
                    <div style={st.cardTitle}>{ex.title}</div>
                    <div style={st.cardDesc}>{ex.description}</div>
                  </div>
                  <img src={ex.image} alt="" style={st.cardImage} />
                </div>
                <div style={st.cardBottom}>
                  <div style={st.timeChip}>
                    <span style={st.timeIcon}>⏱</span>
                    <span>{ex.duration}</span>
                  </div>
                  <div style={st.playBtn}>
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M3.5 1.75L11.5 7L3.5 12.25V1.75Z" fill="#1e1f22" />
                    </svg>
                  </div>
                </div>
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
          style={st.skipBtn}
          className="intro-primary-btn"
          onClick={handleSkip}
        >
          Сделаю в другой раз
        </button>
        {onBack && (
          <button type="button" style={st.backBtn} onClick={handleBack}>
            Назад
          </button>
        )}
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
  bubble: {
    position: "relative",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    color: "#1e1f22",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  },
  bubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#1e1f22",
    whiteSpace: "pre-line",
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
    padding: "18px 18px",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
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
    boxShadow: "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
  },
  cardInner: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxWidth: "60%",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 500,
    color: "#1e1f22",
    lineHeight: 1.2,
  },
  cardDesc: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(30,31,34,0.55)",
    lineHeight: 1.45,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    overflow: "hidden",
  },
  cardBottom: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  timeChip: {
    alignSelf: "flex-start",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(245,245,250,0.6) 100%)",
    boxShadow: "0 8px 16px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: 600,
    color: "#1e1f22",
  },
  timeIcon: {
    fontSize: 13,
  },
  cardImage: {
    width: 120,
    height: "auto",
    objectFit: "contain",
    pointerEvents: "none",
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(245,245,250,0.6) 100%)",
    boxShadow: "0 8px 16px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.7)",
    display: "grid",
    placeItems: "center",
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
  skipBtn: {
    width: "100%",
    border: "1px solid #1e1f22",
    borderRadius: 16,
    padding: "16px 18px",
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

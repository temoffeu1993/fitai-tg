// Box breathing (stress relief) mini exercise: intro → square breathing → result
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import healImg from "@/assets/heals.webp";
import morobotImg from "@/assets/morobot.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Phase = "intro" | "leaving" | "box" | "result";

const SEGMENT_MS = 4000;
const CYCLE_MS = SEGMENT_MS * 4; // inhale, hold, exhale, hold
const TOTAL_CYCLES = 4;
const TOTAL_MS = CYCLE_MS * TOTAL_CYCLES;

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export default function OnbStressExercise({ onComplete, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [showContent, setShowContent] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const hapticRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      setShowContent(true);
      return;
    }
    const t = window.setTimeout(() => setShowContent(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (hapticRef.current) clearInterval(hapticRef.current);
    };
  }, []);

  const handleStart = () => {
    fireHapticImpact("medium");
    setPhase("leaving");
    setTimeout(() => {
      setPhase("box");
      setElapsed(0);
      startBox();
    }, 360);
  };

  const startBox = () => {
    const startedAt = performance.now();
    const tick = () => {
      const e = performance.now() - startedAt;
      if (e >= TOTAL_MS) {
        setElapsed(TOTAL_MS);
        setPhase("result");
        return;
      }
      setElapsed(e);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // Haptics for box breathing
  useEffect(() => {
    if (hapticRef.current) {
      clearInterval(hapticRef.current);
      hapticRef.current = null;
    }
    if (phase !== "box") return;
    hapticRef.current = window.setInterval(() => {
      const t = elapsed % CYCLE_MS;
      const step = Math.floor(t / SEGMENT_MS); // 0 inhale, 1 hold, 2 exhale, 3 hold
      const p = (t % SEGMENT_MS) / SEGMENT_MS;
      if (step === 0) {
        // inhale: ramp up
        if (p < 0.33) fireHapticImpact("light");
        else if (p < 0.66) fireHapticImpact("medium");
        else fireHapticImpact("heavy");
      } else if (step === 1 || step === 3) {
        // hold: light pulse
        fireHapticImpact("light");
      } else if (step === 2) {
        // exhale: ramp down
        if (p < 0.33) fireHapticImpact("heavy");
        else if (p < 0.66) fireHapticImpact("medium");
        else fireHapticImpact("light");
      }
    }, 450);
    return () => {
      if (hapticRef.current) clearInterval(hapticRef.current);
      hapticRef.current = null;
    };
  }, [phase, elapsed]);

  const segmentIndex = Math.min(3, Math.floor((elapsed % CYCLE_MS) / SEGMENT_MS));
  const count = Math.min(4, Math.floor((elapsed % SEGMENT_MS) / 1000) + 1);
  const label =
    segmentIndex === 0
      ? "Вдох"
      : segmentIndex === 1
        ? "Задержка"
        : segmentIndex === 2
          ? "Выдох"
          : "Задержка";

  const cyclePos = (elapsed % CYCLE_MS) / CYCLE_MS;
  const dashOffset = 100 - cyclePos * 100;
  const textScaleClass =
    segmentIndex === 0 ? "scale-up" :
    segmentIndex === 2 ? "scale-down" : "scale-steady";

  return (
    <div style={st.page} className={phase === "leaving" ? "onb-leave" : undefined}>
      <ScreenStyles />

      {(phase === "intro" || phase === "leaving") && (
        <>
          <div style={st.introHero} className={phase === "leaving" ? "onb-leave" : "onb-fade onb-fade-delay-1"}>
            <div style={st.introImageWrap}>
              <img src={healImg} alt="" style={st.introImage} />
            </div>
          </div>
          <section style={st.introFooter} className={phase === "leaving" ? "onb-leave" : "onb-fade onb-fade-delay-2"}>
            <div style={st.introTextBlock}>
              <h1 style={st.introTitle}>Снятие стресса</h1>
              <p style={st.introSubtitle}>
                Дыхание по квадрату. Снижает пульс и помогает собраться с мыслями.
              </p>
            </div>
            <button type="button" style={st.introPrimaryBtn} className="intro-primary-btn" onClick={handleStart}>
              Старт
            </button>
          </section>
        </>
      )}

      {phase === "box" && (
        <div style={st.boxStage} className="onb-success-in">
          <div style={st.boxBackdrop} />
          <div style={st.boxWrap}>
            <div style={st.svgContainer}>
              <svg width="240" height="240" viewBox="0 0 240 240" style={st.svgBox}>
                <rect
                  x="10" y="10" width="220" height="220" rx="22" ry="22"
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="4"
                />
                <rect
                  x="10" y="10" width="220" height="220" rx="22" ry="22"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="6"
                  strokeLinecap="round"
                  pathLength="100"
                  className="snake-anim"
                  style={{
                    strokeDasharray: "25 75",
                    strokeDashoffset: `${dashOffset}`,
                    filter: "drop-shadow(0 0 8px rgba(96,165,250,0.6))",
                  }}
                />
                <circle r="6" fill="#fff" className="dot-leader-anim" />
              </svg>
            </div>
            <div style={st.boxText}>
              <span className={`label-anim ${textScaleClass}`} style={st.boxLabel}>{label}</span>
              <span style={st.boxCount}>{count}</span>
            </div>
          </div>
        </div>
      )}

      {phase === "result" && (
        <div style={st.resultWrap}>
          <div style={st.successBubbleWrap} className="onb-success-in">
            <div style={st.successBubble} className="speech-bubble-bottom">
              <span style={st.successBubbleText}>
                Меньше стресса — лучше восстановление. Запомни: мышцы растут во время отдыха.
              </span>
            </div>
          </div>
          <div style={st.successMascotWrap} className="onb-success-in onb-success-in-delay">
            <img src={morobotImg} alt="" style={st.successMascotImg} />
          </div>
          <div style={st.actions} className="onb-success-in onb-success-in-delay">
            <button type="button" style={st.nextBtn} onClick={onComplete}>
              Далее
            </button>
            <button type="button" style={st.backBtn} onClick={onBack}>
              Выбрать другое упражнение
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
      .onb-leave { animation: onbFadeDown 220ms ease-in both; }
      .onb-success-in { animation: successPopIn 500ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
      .onb-success-in-delay { animation-delay: 120ms; }
      .speech-bubble-bottom:before {
        content: ""; position: absolute;
        left: 50%; bottom: -10px; top: auto;
        transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 10px solid transparent;
        border-right: 10px solid transparent;
        border-top: 10px solid rgba(255,255,255,0.9);
        filter: drop-shadow(0 1px 0 rgba(15, 23, 42, 0.08));
      }
      .intro-primary-btn {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation; user-select: none;
        transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
      }
      .intro-primary-btn:active:not(:disabled) {
        transform: translateY(1px) scale(0.99) !important;
      }
      @keyframes dotMove {
        0% { transform: translate(-50%, -50%) translate(0%, 100%); }
        25% { transform: translate(-50%, -50%) translate(0%, 0%); }
        50% { transform: translate(-50%, -50%) translate(100%, 0%); }
        75% { transform: translate(-50%, -50%) translate(100%, 100%); }
        100% { transform: translate(-50%, -50%) translate(0%, 100%); }
      }
      @keyframes dotGlow {
        0% { box-shadow: 0 0 12px rgba(56,189,248,0.3); }
        50% { box-shadow: 0 0 28px rgba(56,189,248,0.9); }
        100% { box-shadow: 0 0 12px rgba(56,189,248,0.3); }
      }
      .snake-anim {
        animation: snakeMove ${CYCLE_MS}ms linear infinite;
      }
      @keyframes snakeMove {
        0% { stroke-dashoffset: 100; }
        100% { stroke-dashoffset: 0; }
      }
      .dot-leader-anim {
        offset-path: path("M 10 220 L 10 32 A 22 22 0 0 1 32 10 L 208 10 A 22 22 0 0 1 230 32 L 230 208 A 22 22 0 0 1 208 230 L 32 230 A 22 22 0 0 1 10 208 Z");
        animation: dotFollow ${CYCLE_MS}ms linear infinite;
        offset-rotate: auto;
      }
      @keyframes dotFollow {
        0% { offset-distance: 0%; }
        100% { offset-distance: 100%; }
      }
      .label-anim { transition: transform 4s ease-in-out, color 0.3s; display: inline-block; }
      .scale-up { transform: scale(1.2); color: #60a5fa; }
      .scale-steady { transform: scale(1); color: #e2e8f0; }
      .scale-down { transform: scale(0.85); color: #94a3b8; }
      @keyframes successPopIn {
        0% { opacity: 0; transform: translateY(18px) scale(0.98); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .onb-fade, .onb-leave, .onb-success-in { animation: none !important; }
        .onb-fade-target { opacity: 1 !important; transform: none !important; }
        .snake-anim, .dot-leader-anim, .label-anim { animation: none !important; transition: none !important; }
      }
    `}</style>
  );
}

const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 120px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#1e1f22",
  },
  introHero: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    flex: "0 0 auto",
    paddingTop: 0,
  },
  introImageWrap: {
    position: "relative",
    width: "min(864px, 95vw)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  introImage: {
    width: "100%",
    height: "auto",
    maxHeight: "55vh",
    objectFit: "contain",
    transform: "translateY(36px) scale(0.95)",
    transformOrigin: "center bottom",
  },
  introFooter: {
    width: "100%",
    display: "grid",
    gap: 18,
    paddingBottom: 18,
  },
  introTextBlock: {
    width: "100%",
    textAlign: "center",
    display: "grid",
    gap: 10,
    marginTop: -14,
  },
  introTitle: {
    margin: 0,
    fontSize: 42,
    lineHeight: 1.05,
    fontWeight: 900,
    letterSpacing: -0.8,
  },
  introSubtitle: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, .65)",
    maxWidth: 340,
    marginLeft: "auto",
    marginRight: "auto",
  },
  introPrimaryBtn: {
    marginTop: 6,
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontWeight: 500,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
    WebkitTapHighlightColor: "transparent",
  },

  boxStage: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "#0b0f16",
    zIndex: 40,
    overflow: "hidden",
  },
  boxBackdrop: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(circle at 50% 35%, rgba(56,189,248,0.08) 0%, rgba(15, 23, 42, 0.65) 45%, rgba(2,6,23,0.9) 100%)",
    zIndex: 0,
  },
  boxWrap: {
    position: "relative",
    display: "grid",
    justifyItems: "center",
    gap: 18,
    zIndex: 2,
  },
  svgContainer: {
    position: "relative",
    width: 240,
    height: 240,
  },
  svgBox: {
    overflow: "visible",
    display: "block",
  },
  boxText: {
    display: "grid",
    gap: 6,
    textAlign: "center",
    color: "rgba(226, 232, 240, 0.9)",
  },
  boxLabel: {
    fontSize: 20,
    fontWeight: 500,
  },
  boxCount: {
    fontSize: 28,
    fontWeight: 700,
  },

  resultWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    minHeight: "60vh",
  },
  successBubbleWrap: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
  },
  successBubble: {
    position: "relative",
    padding: "20px 24px",
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,245,250,0.75) 100%)",
    boxShadow: "0 14px 30px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    textAlign: "center",
    maxWidth: 340,
  },
  successBubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.4,
    color: "#1e1f22",
    whiteSpace: "pre-line",
  },
  successMascotWrap: {
    display: "flex",
    justifyContent: "center",
    marginTop: -4,
  },
  successMascotImg: {
    width: 220,
    height: "auto",
    objectFit: "contain",
  },
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
  nextBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 18,
    fontWeight: 500,
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

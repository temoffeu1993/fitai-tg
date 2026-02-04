// Vacuum (abs) mini exercise: intro → breath → vacuum hold → result
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import morobotImg from "@/assets/morobot.webp";
import healthRobotImg from "@/assets/heals.webp";
import absImg from "@/assets/zhenzhiv.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Phase = "intro" | "leaving" | "breath" | "hold" | "result";
type BreathStep = "inhale" | "exhale" | "final-exhale";

const BREATH_CYCLES = 3;
const INHALE_MS = 4000;
const EXHALE_MS = 4000;
const FINAL_EXHALE_MS = 4000;
const HOLD_SECONDS = 15;

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export default function OnbAbsExercise({ onComplete, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [showContent, setShowContent] = useState(false);
  const [breathStep, setBreathStep] = useState<BreathStep>("inhale");
  const [timeLeft, setTimeLeft] = useState(HOLD_SECONDS * 1000);
  const confettiRef = useRef<HTMLDivElement>(null);
  const breathHapticRef = useRef<number | null>(null);
  const finalHapticRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);

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
      if (breathHapticRef.current) clearInterval(breathHapticRef.current);
      if (finalHapticRef.current) clearInterval(finalHapticRef.current);
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  const handleStart = () => {
    fireHapticImpact("medium");
    setPhase("leaving");
    setTimeout(() => {
      setPhase("breath");
      setBreathStep("inhale");
    }, 360);
  };

  // Breathing sequence
  useEffect(() => {
    if (phase !== "breath") return;
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < BREATH_CYCLES; i += 1) {
        if (cancelled) return;
        setBreathStep("inhale");
        await new Promise((r) => setTimeout(r, INHALE_MS));
        if (cancelled) return;
        if (i < BREATH_CYCLES - 1) {
          setBreathStep("exhale");
          await new Promise((r) => setTimeout(r, EXHALE_MS));
        } else {
          setBreathStep("final-exhale");
          // strong haptic on final exhale
          fireHapticImpact("heavy");
          setTimeout(() => fireHapticImpact("heavy"), 140);
          await new Promise((r) => setTimeout(r, FINAL_EXHALE_MS));
        }
      }
      if (cancelled) return;
      startHold();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Haptic during inhale (ramp up)
  useEffect(() => {
    if (breathHapticRef.current) {
      clearInterval(breathHapticRef.current);
      breathHapticRef.current = null;
    }
    if (phase !== "breath") return;
    if (breathStep !== "inhale") return;
    let tick = 0;
    breathHapticRef.current = window.setInterval(() => {
      tick += 1;
      if (tick <= 3) fireHapticImpact("light");
      else if (tick <= 6) fireHapticImpact("medium");
      else fireHapticImpact("heavy");
    }, 450);
    return () => {
      if (breathHapticRef.current) clearInterval(breathHapticRef.current);
      breathHapticRef.current = null;
    };
  }, [phase, breathStep]);

  // Stronger, faster haptics on final exhale (3-4s)
  useEffect(() => {
    if (finalHapticRef.current) {
      clearInterval(finalHapticRef.current);
      finalHapticRef.current = null;
    }
    if (phase !== "breath") return;
    if (breathStep !== "final-exhale") return;
    let elapsed = 0;
    finalHapticRef.current = window.setInterval(() => {
      elapsed += 1;
      // ramp: medium → heavy
      fireHapticImpact(elapsed < 6 ? "medium" : "heavy");
    }, 220);
    const stop = window.setTimeout(() => {
      if (finalHapticRef.current) clearInterval(finalHapticRef.current);
      finalHapticRef.current = null;
    }, FINAL_EXHALE_MS);
    return () => {
      clearTimeout(stop);
      if (finalHapticRef.current) clearInterval(finalHapticRef.current);
      finalHapticRef.current = null;
    };
  }, [phase, breathStep]);

  const startHold = () => {
    setPhase("hold");
    setTimeLeft(HOLD_SECONDS * 1000);
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    const startedAt = Date.now();
    holdTimerRef.current = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const leftMs = Math.max(0, HOLD_SECONDS * 1000 - elapsedMs);
      setTimeLeft(leftMs);
      if (leftMs <= 0) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        finishHold();
      }
    }, 200);
  };

  const finishHold = () => {
    setPhase("result");
    if (confettiRef.current) {
      confettiRef.current.innerHTML = "";
      spawnConfetti(confettiRef.current);
    }
  };

  const breathText =
    breathStep === "inhale"
      ? "Глубокий вдох"
      : breathStep === "exhale"
        ? "Спокойный выдох"
        : "Резко выдохни весь воздух";

  return (
    <div style={st.page} className={phase === "leaving" ? "onb-leave" : undefined}>
      <ScreenStyles />

      <div ref={confettiRef} style={st.confettiLayer} />

      {(phase === "intro" || phase === "leaving") && (
        <>
          <div style={st.introHero} className={phase === "leaving" ? "onb-leave" : "onb-fade onb-fade-delay-1"}>
            <div style={st.introImageWrap}>
              <img src={absImg} alt="" style={st.introImage} />
            </div>
          </div>
          <section style={st.introFooter} className={phase === "leaving" ? "onb-leave" : "onb-fade onb-fade-delay-2"}>
            <div style={st.introTextBlock}>
              <h1 style={st.introTitle}>Тонсу живота</h1>
              <p style={st.introSubtitle}>
                Плоский живот и узкая талия без скручиваний. Работаем с глубокими мышцами, до которых не добраться в зале.
              </p>
            </div>
            <button type="button" style={st.introPrimaryBtn} className="intro-primary-btn" onClick={handleStart}>
              Старт
            </button>
          </section>
        </>
      )}

      {(phase === "breath" || phase === "hold") && (
        <div style={st.breathStage} className="onb-success-in">
          <div style={st.breathBackdrop} />
          {phase !== "hold" && (
            <>
              <div style={st.breathTopText}>Настройка</div>
              <div style={st.breathAuraWrap} className={breathStep === "final-exhale" ? "aura-sharp" : "aura-cycle"}>
                <span style={st.auraGlow} />
                <span style={st.auraRing1} />
                <span style={st.auraRing2} />
                <span style={st.auraRing3} />
                <span style={st.auraRing4} />
              </div>
              <div style={st.breathRipplesWrap} className={breathStep === "final-exhale" ? "ripple-sharp" : "ripple-cycle"}>
                <span style={st.rippleRing1} />
                <span style={st.rippleRing2} />
                <span style={st.rippleRing3} />
              </div>
              <img
                src={healthRobotImg}
                alt=""
                style={st.breathMascot}
                className={breathStep === "final-exhale" ? "breath-sharp" : "breath-cycle"}
              />
              <div
                key={breathStep}
                style={{
                  ...st.breathText,
                  fontWeight: breathStep === "final-exhale" ? 600 : st.breathText.fontWeight,
                  fontSize: breathStep === "final-exhale" ? 20 : st.breathText.fontSize,
                }}
              >
                {breathText}
              </div>
            </>
          )}

          {phase === "hold" && (
            <div style={st.sphereStage}>
              <div style={st.sphereTextTop}>Втяни живот под рёбра</div>
              <div style={st.sphereWrap}>
                <div style={st.sphereAura} />
                <div style={st.sphere} />
                <div style={st.sphereRings}>
                  <span style={st.sphereRing1} />
                  <span style={st.sphereRing2} />
                  <span style={st.sphereRing3} />
                </div>
              </div>
              <div style={st.sphereTextBottom}>Пупок должен прилипнуть к позвоночнику</div>
              <div style={st.timerText}>{formatMs(timeLeft)}</div>
            </div>
          )}

        </div>
      )}

      {phase === "result" && (
        <div style={st.resultWrap}>
          <div style={st.successBubbleWrap} className="onb-success-in">
            <div style={st.successBubble} className="speech-bubble-bottom">
              <span style={st.successBubbleText}>
                Еее🔥 Ваша талия уже шлет благодарности, крутой старт!
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
      .onb-fade-delay-4 { animation-delay: 320ms; }
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
      .aura-cycle { animation: auraCycle 8000ms ease-in-out infinite; }
      .breath-cycle { animation: breathCycle 8000ms ease-in-out infinite; }
      .ripple-cycle { animation: rippleCycle 8000ms ease-in-out infinite; }
      .aura-sharp { animation: auraSharp 3200ms ease-out both; }
      .breath-sharp { animation: breathSharp 3200ms ease-out both; }
      .ripple-sharp { animation: rippleSharp 3200ms ease-out both; }
      @keyframes breathCycle {
        0% { transform: translateY(10px) scale(0.98); }
        50% { transform: translateY(-16px) scale(1.03); }
        100% { transform: translateY(10px) scale(0.98); }
      }
      @keyframes auraCycle {
        0% { transform: scale(0.92); opacity: 0.5; }
        50% { transform: scale(1.05); opacity: 0.78; }
        100% { transform: scale(0.92); opacity: 0.5; }
      }
      @keyframes rippleCycle {
        0% { transform: scale(0.86); opacity: 0.55; }
        50% { transform: scale(1.1); opacity: 0.9; }
        100% { transform: scale(0.86); opacity: 0.55; }
      }
      @keyframes auraSharp {
        0% { transform: scale(1.02); opacity: 0.8; }
        100% { transform: scale(0.76); opacity: 0.45; }
      }
      @keyframes breathSharp {
        0% { transform: translateY(-6px) scale(1.02); }
        100% { transform: translateY(4px) scale(0.88); }
      }
      @keyframes rippleSharp {
        0% { transform: scale(1.06); opacity: 0.9; }
        100% { transform: scale(0.78); opacity: 0.35; }
      }
      @keyframes sphereShrink {
        0% { transform: scale(1); }
        100% { transform: scale(0.8); }
      }
      @keyframes fireGlow {
        0% { opacity: 0.45; transform: scale(0.96); }
        35% { opacity: 0.9; transform: scale(1.08); }
        70% { opacity: 0.6; transform: scale(1.01); }
        100% { opacity: 0.75; transform: scale(1.04); }
      }
      @keyframes ringIn {
        0% { transform: scale(1.22); opacity: 0.0; }
        40% { opacity: 0.35; }
        100% { transform: scale(0.72); opacity: 0.05; }
      }
      @keyframes successPopIn {
        0% { opacity: 0; transform: translateY(18px) scale(0.98); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .onb-fade, .onb-leave, .onb-success-in { animation: none !important; }
        .onb-fade-target { opacity: 1 !important; transform: none !important; }
      }
    `}</style>
  );
}

function formatMs(ms: number) {
  const safe = Math.max(0, Math.floor(ms));
  const seconds = Math.floor(safe / 1000);
  const centis = Math.floor((safe % 1000) / 10);
  const secStr = String(seconds).padStart(2, "0");
  const centiStr = String(centis).padStart(2, "0");
  return `${secStr},${centiStr}`;
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

  breathStage: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "#0b0f16",
    zIndex: 40,
    overflow: "hidden",
  },
  breathBackdrop: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(circle at 50% 35%, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.65) 45%, rgba(2,6,23,0.9) 100%)",
    zIndex: 0,
  },
  breathAuraWrap: {
    position: "absolute",
    width: "min(70vw, 70vh)",
    height: "min(70vw, 70vh)",
    borderRadius: "50%",
    zIndex: 1,
  },
  auraGlow: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(120,255,230,0.28) 0%, rgba(120,255,230,0.12) 45%, rgba(120,255,230,0) 72%)",
    filter: "blur(20px)",
  },
  auraRing1: {
    position: "absolute",
    inset: "10%",
    borderRadius: "50%",
    border: "2px solid rgba(120,255,230,0.38)",
  },
  auraRing2: {
    position: "absolute",
    inset: "22%",
    borderRadius: "50%",
    border: "2px solid rgba(120,255,230,0.32)",
  },
  auraRing3: {
    position: "absolute",
    inset: "34%",
    borderRadius: "50%",
    border: "2px solid rgba(120,255,230,0.26)",
  },
  auraRing4: {
    position: "absolute",
    inset: "46%",
    borderRadius: "50%",
    border: "2px solid rgba(120,255,230,0.2)",
  },
  breathRipplesWrap: {
    position: "absolute",
    width: "min(88vw, 88vh)",
    height: "min(88vw, 88vh)",
    zIndex: 2,
  },
  rippleRing1: {
    position: "absolute",
    inset: "6%",
    borderRadius: "50%",
    border: "1px solid rgba(148,163,184,0.2)",
  },
  rippleRing2: {
    position: "absolute",
    inset: "20%",
    borderRadius: "50%",
    border: "1px solid rgba(148,163,184,0.16)",
  },
  rippleRing3: {
    position: "absolute",
    inset: "34%",
    borderRadius: "50%",
    border: "1px solid rgba(148,163,184,0.12)",
  },
  breathMascot: {
    width: 200,
    height: "auto",
    objectFit: "contain",
    zIndex: 3,
    filter: "drop-shadow(0 16px 32px rgba(0,0,0,0.55))",
  },
  breathText: {
    position: "absolute",
    bottom: "18%",
    fontSize: 18,
    fontWeight: 400,
    color: "rgba(226, 232, 240, 0.85)",
    lineHeight: 1.5,
    textShadow: "0 6px 18px rgba(0,0,0,0.45)",
    whiteSpace: "pre-line",
    maxWidth: 320,
    textAlign: "center",
    zIndex: 4,
  },
  breathTopText: {
    position: "absolute",
    top: "14%",
    fontSize: 18,
    fontWeight: 400,
    color: "rgba(226, 232, 240, 0.85)",
    lineHeight: 1.5,
    textShadow: "0 6px 18px rgba(0,0,0,0.45)",
    zIndex: 4,
  },

  sphereStage: {
    display: "grid",
    gap: 18,
    justifyItems: "center",
    textAlign: "center",
    zIndex: 4,
  },
  sphereTextTop: {
    fontSize: 22,
    fontWeight: 600,
    color: "#e2e8f0",
    marginBottom: 8,
  },
  sphereTextBottom: {
    fontSize: 16,
    fontWeight: 500,
    color: "rgba(226, 232, 240, 0.7)",
    maxWidth: 300,
    marginTop: 8,
  },
  sphereWrap: {
    position: "relative",
    width: 220,
    height: 220,
  },
  sphereAura: {
    position: "absolute",
    inset: -22,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,154,60,0.55) 0%, rgba(255,120,30,0.28) 45%, rgba(255,120,30,0) 72%)",
    filter: "blur(20px)",
    animation: "fireGlow 2.2s ease-in-out infinite",
  },
  sphere: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 30%, rgba(255,244,214,0.65) 0%, rgba(253,186,116,0.75) 35%, rgba(249,115,22,0.85) 70%)",
    boxShadow: "0 14px 40px rgba(249,115,22,0.45)",
    animation: "sphereShrink 4.8s ease-in-out forwards",
  },
  sphereRings: {
    position: "absolute",
    inset: -28,
    borderRadius: "50%",
  },
  sphereRing1: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: "1px solid rgba(253,186,116,0.45)",
    animation: "ringIn 2.4s ease-in-out infinite",
  },
  sphereRing2: {
    position: "absolute",
    inset: 22,
    borderRadius: "50%",
    border: "1px solid rgba(253,186,116,0.35)",
    animation: "ringIn 2.4s ease-in-out infinite 0.4s",
  },
  sphereRing3: {
    position: "absolute",
    inset: 44,
    borderRadius: "50%",
    border: "1px solid rgba(253,186,116,0.25)",
    animation: "ringIn 2.4s ease-in-out infinite 0.8s",
  },
  timerText: {
    fontSize: 26,
    fontWeight: 700,
    color: "#e2e8f0",
  },


  confettiLayer: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 80,
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
    display: "flex",
    justifyContent: "center",
    width: "100%",
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

function spawnConfetti(container: HTMLDivElement) {
  const colors = ["#8b5cf6", "#22c55e", "#f97316", "#3b82f6", "#f59e0b"];
  for (let i = 0; i < 40; i += 1) {
    const piece = document.createElement("div");
    piece.style.position = "absolute";
    piece.style.width = "8px";
    piece.style.height = "12px";
    piece.style.borderRadius = "2px";
    piece.style.background = colors[i % colors.length];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.top = "-10px";
    piece.style.opacity = "0.9";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    piece.style.animation = `confettiFall ${1200 + Math.random() * 900}ms ease-out forwards`;
    container.appendChild(piece);
  }
  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes confettiFall {
      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
      100% { transform: translateY(90vh) rotate(360deg); opacity: 0; }
    }
  `;
  container.appendChild(style);
  setTimeout(() => { container.innerHTML = ""; }, 2200);
}

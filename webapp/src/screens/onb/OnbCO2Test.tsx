// webapp/src/screens/onb/OnbCO2Test.tsx
// CO2 breath-hold test: instruction → flask timer → result with confetti
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import morobotImg from "@/assets/morobot.webp";
import { fireHapticImpact } from "@/utils/haptics";

type Props = {
  onComplete: () => void;
  onBack?: () => void;
};

type Phase = "intro" | "leaving" | "breath" | "hold" | "result";

const BREATH_CYCLES = 3;

// ── Result interpretation ──
function getResultText(seconds: number): { emoji: string; text: string } {
  if (seconds < 20) {
    return {
      emoji: "\uD83D\uDE24",
      text: "Честно? Слабовато. Твои мышцы голодают без кислорода. Но мы это исправим.",
    };
  }
  if (seconds <= 30) {
    return {
      emoji: "\uD83D\uDCAA",
      text: "Норма. Для обычной жизни хватит, но в спорте батарейка сядет быстро. Давай разгоним?",
    };
  }
  if (seconds <= 40) {
    return {
      emoji: "\uD83D\uDD25",
      text: "Отличная форма! Твой организм работает эффективно, как хороший гибридный двигатель.",
    };
  }
  return {
    emoji: "\uD83C\uDFC6",
    text: "Максимум! Ты вообще человек? Идеальный контроль кислорода.",
  };
}

// ── Water color by progress ──
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpColor(a: string, b: string, t: number) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    Math.round(lerp(ar, br, t)),
    Math.round(lerp(ag, bg, t)),
    Math.round(lerp(ab, bb, t))
  );
}

function getWaterColors(pct: number): [string, string] {
  const t = Math.max(0, Math.min(1, pct / 100));
  const stops: [number, string, string][] = [
    [0, "#60a5fa", "#3b82f6"],
    [0.5, "#34d399", "#10b981"],
    [1, "#22c55e", "#16a34a"],
  ];
  const idx = t <= 0.5 ? 0 : 1;
  const [t0, cTop0, cBot0] = stops[idx];
  const [t1, cTop1, cBot1] = stops[idx + 1];
  const localT = (t - t0) / (t1 - t0);
  return [lerpColor(cTop0, cTop1, localT), lerpColor(cBot0, cBot1, localT)];
}

// ── Confetti (copy from OnbFirstWorkout) ──
const FOIL_COLORS = [
  ["linear-gradient(135deg,#f5e6d0,#c9a96e 50%,#f5e6d0)", "linear-gradient(135deg,#b8956a,#e8d5b7 50%,#b8956a)"],
  ["linear-gradient(135deg,#f4f4f5,#a1a1aa 50%,#f4f4f5)", "linear-gradient(135deg,#71717a,#d4d4d8 50%,#71717a)"],
  ["linear-gradient(135deg,#fff1f2,#f9a8d4 50%,#fce7f3)", "linear-gradient(135deg,#ec4899,#fecdd3 50%,#ec4899)"],
  ["linear-gradient(135deg,#e0e7ff,#818cf8 50%,#e0e7ff)", "linear-gradient(135deg,#6366f1,#c7d2fe 50%,#6366f1)"],
  ["linear-gradient(135deg,#d1fae5,#6ee7b7 50%,#d1fae5)", "linear-gradient(135deg,#34d399,#a7f3d0 50%,#34d399)"],
  ["linear-gradient(135deg,#e0f2fe,#7dd3fc 50%,#e0f2fe)", "linear-gradient(135deg,#38bdf8,#bae6fd 50%,#38bdf8)"],
  ["linear-gradient(135deg,#fef3c7,#fbbf24 50%,#fef3c7)", "linear-gradient(135deg,#d97706,#fde68a 50%,#d97706)"],
  ["linear-gradient(135deg,#fce4ec,#f06292 50%,#fce4ec)", "linear-gradient(135deg,#c2185b,#f48fb1 50%,#c2185b)"],
];
type Particle = {
  el: HTMLSpanElement;
  x: number; y: number;
  vx: number; vy: number;
  rotX: number; rotY: number; rotZ: number;
  vRotX: number; vRotY: number; vRotZ: number;
  w: number; h: number;
  face: string; back: string;
  opacity: number;
  life: number; maxLife: number;
  wobblePhase: number; wobbleSpeed: number;
};
const GRAVITY = 0.12;
const DRAG = 0.985;
const WOBBLE_AMP = 0.6;

function spawnConfetti(container: HTMLDivElement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = vw / 2;
  const cy = vh * 0.45;
  const COUNT = 100;
  const particles: Particle[] = [];
  for (let i = 0; i < COUNT; i++) {
    const [face, back] = FOIL_COLORS[Math.floor(Math.random() * FOIL_COLORS.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 10;
    const w = 10 + Math.random() * 14;
    const h = 8 + Math.random() * 12;
    const el = document.createElement("span");
    el.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;border-radius:2px;backface-visibility:visible;will-change:transform;pointer-events:none;box-shadow:inset 0 0 3px rgba(255,255,255,0.5);`;
    container.appendChild(el);
    particles.push({
      el, x: cx, y: cy,
      vx: Math.cos(angle) * speed * (0.7 + Math.random() * 0.6),
      vy: Math.sin(angle) * speed * (0.7 + Math.random() * 0.6) - 3,
      rotX: Math.random() * 360, rotY: Math.random() * 360, rotZ: Math.random() * 360,
      vRotX: -8 + Math.random() * 16, vRotY: -8 + Math.random() * 16, vRotZ: -4 + Math.random() * 8,
      w, h, face, back, opacity: 1, life: 0, maxLife: 120 + Math.random() * 80,
      wobblePhase: Math.random() * Math.PI * 2, wobbleSpeed: 0.05 + Math.random() * 0.08,
    });
  }
  let raf: number;
  const tick = () => {
    let alive = 0;
    for (const p of particles) {
      p.life++;
      if (p.life > p.maxLife) { if (p.el.parentNode) p.el.parentNode.removeChild(p.el); continue; }
      alive++;
      p.vy += GRAVITY; p.vx *= DRAG; p.vy *= DRAG;
      p.vx += Math.sin(p.wobblePhase) * WOBBLE_AMP; p.wobblePhase += p.wobbleSpeed;
      p.x += p.vx; p.y += p.vy;
      p.rotX += p.vRotX; p.rotY += p.vRotY; p.rotZ += p.vRotZ;
      const fadeStart = p.maxLife * 0.7;
      p.opacity = p.life > fadeStart ? 1 - (p.life - fadeStart) / (p.maxLife - fadeStart) : 1;
      const showBack = (Math.abs(p.rotY % 360) > 90 && Math.abs(p.rotY % 360) < 270);
      p.el.style.background = showBack ? p.back : p.face;
      p.el.style.transform = `translate3d(${p.x}px,${p.y}px,0) rotateX(${p.rotX}deg) rotateY(${p.rotY}deg) rotate(${p.rotZ}deg)`;
      p.el.style.opacity = String(p.opacity);
    }
    if (alive > 0) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  setTimeout(() => { cancelAnimationFrame(raf); container.innerHTML = ""; }, 5000);
}

// ── Max timer seconds ──
const MAX_SECONDS = 120;

export default function OnbCO2Test({ onComplete, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [showContent, setShowContent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [smoothSeconds, setSmoothSeconds] = useState(0);
  const [resultSeconds, setResultSeconds] = useState(0);
  const [breathStep, setBreathStep] = useState<"inhale" | "exhale" | "final-exhale" | "hold">("inhale");
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const confettiRef = useRef<HTMLDivElement>(null);
  const hapticIntervalRef = useRef<number | null>(null);

  // Scroll to top & lock
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const prevOverflow = root?.style.overflowY;
    if (root) {
      root.style.overflowY = "hidden";
      root.scrollTop = 0;
    }
    document.documentElement.scrollTop = 0;
    window.scrollTo(0, 0);
    return () => { if (root) root.style.overflowY = prevOverflow || ""; };
  }, []);

  // Reveal content
  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) { setShowContent(true); return; }
    const t = window.setTimeout(() => setShowContent(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      if (hapticIntervalRef.current) clearInterval(hapticIntervalRef.current);
    };
  }, []);

  // Smooth progress update
  useEffect(() => {
    if (phase !== "timer") return;
    let raf: number;
    const tick = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setSmoothSeconds(Math.min(elapsed, MAX_SECONDS));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ── Start timer ──
  const handleStart = () => {
    fireHapticImpact("medium");
    setPhase("leaving");
    setTimeout(() => {
      setPhase("breath");
      setBreathStep("inhale");
    }, 380);
  };

  const startHold = () => {
    setPhase("hold");
    setSeconds(0);
    setSmoothSeconds(0);
    startTimeRef.current = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (elapsed >= MAX_SECONDS) {
        setSeconds(MAX_SECONDS);
        handleStop(MAX_SECONDS);
        return;
      }
      setSeconds(elapsed);
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
    // Haptic every 10 seconds
    hapticIntervalRef.current = window.setInterval(() => {
      fireHapticImpact("light");
    }, 10000);
  };

  // ── Stop timer ──
  const handleStop = (overrideSeconds?: number) => {
    if (timerRef.current) cancelAnimationFrame(timerRef.current);
    if (hapticIntervalRef.current) clearInterval(hapticIntervalRef.current);
    const final = overrideSeconds ?? Math.floor((Date.now() - startTimeRef.current) / 1000);
    setResultSeconds(final);
    // Save result
    try { localStorage.setItem("co2_test_result", String(final)); } catch {}
    fireHapticImpact("heavy");
    setPhase("result");
    if (confettiRef.current) {
      confettiRef.current.innerHTML = "";
      spawnConfetti(confettiRef.current);
    }
  };

  const progress = Math.min(1, smoothSeconds / MAX_SECONDS);
  const eased = 1 - Math.pow(1 - progress, 2);
  const pct = Math.min(100, eased * 100);
  const [waterTop, waterBottom] = getWaterColors(pct);
  const result = getResultText(resultSeconds);

  // Breathing sequence
  useEffect(() => {
    if (phase !== "breath") return;
    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < BREATH_CYCLES; i += 1) {
        if (cancelled) return;
        setBreathStep("inhale");
        await new Promise((r) => setTimeout(r, 2400));
        if (cancelled) return;
        setBreathStep("exhale");
        await new Promise((r) => setTimeout(r, 2400));
      }
      if (cancelled) return;
      setBreathStep("final-exhale");
      await new Promise((r) => setTimeout(r, 2600));
      if (cancelled) return;
      setBreathStep("hold");
      await new Promise((r) => setTimeout(r, 600));
      if (cancelled) return;
      startHold();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  return (
    <div style={st.page}>
      <ScreenStyles />

      {/* Confetti layer */}
      <div ref={confettiRef} style={st.confettiLayer} />

      {/* ── INTRO PHASE ── */}
      {(phase === "intro" || phase === "leaving") && (
        <>
          <div style={st.header} className={phase === "leaving" ? "onb-leave" : "onb-fade onb-fade-delay-2"}>
            <h1 style={st.title}>Выносливость</h1>
            <p style={st.subtitle}>
              Короткий тест запаса кислорода. Помогает понять текущий уровень.
            </p>
          </div>

          <div style={st.centerStartWrap} className={phase === "leaving" ? "onb-leave" : "onb-fade onb-fade-delay-3"}>
            <button type="button" style={st.centerStartBtn} className="intro-primary-btn" onClick={handleStart}>
              Старт
            </button>
          </div>
        </>
      )}

      {/* ── BREATH PHASE ── */}
      {phase === "breath" && (
        <div style={st.breathWrap} className="onb-success-in">
          <div style={st.breathOrb} className={breathStep === "inhale" ? "breath-in" : "breath-out"} />
          <div style={st.breathText}>
            {breathStep === "inhale" ? "Вдох" : breathStep === "exhale" ? "Выдох" : "Полный выдох"}
          </div>
        </div>
      )}

      {/* ── HOLD PHASE: flask with waves ── */}
      {phase === "hold" && (
        <div style={st.timerWrap} className="onb-success-in">
          <div style={st.holdText}>Задержи дыхание</div>
          <div style={st.flaskOuter}>
            {/* Flask glass container */}
            <div style={st.flask}>
              {/* Water fill */}
              <div
                style={{
                  ...st.waterFill,
                  height: `${pct}%`,
                  background: `linear-gradient(180deg, ${waterTop} 0%, ${waterBottom} 100%)`,
                }}
              >
                {/* Wave wrapper on top of water */}
                <div style={st.waveWrapper}>
                  <svg
                    style={{ ...st.waveSvg, animationDuration: "10s" }}
                    viewBox="0 0 5760 320"
                    preserveAspectRatio="none"
                  >
                    <path d={WAVE_PATH_BG} fill={waterTop} fillOpacity="0.55" />
                    <path d={WAVE_PATH_BG} fill={waterTop} fillOpacity="0.55" transform="translate(1440,0)" />
                    <path d={WAVE_PATH_BG} fill={waterTop} fillOpacity="0.55" transform="translate(2880,0)" />
                    <path d={WAVE_PATH_BG} fill={waterTop} fillOpacity="0.55" transform="translate(4320,0)" />
                  </svg>
                  <svg
                    style={{ ...st.waveSvg, animationDuration: "6s", animationDirection: "reverse" }}
                    viewBox="0 0 5760 320"
                    preserveAspectRatio="none"
                  >
                    <path d={WAVE_PATH_FG} fill={waterBottom} fillOpacity="0.9" />
                    <path d={WAVE_PATH_FG} fill={waterBottom} fillOpacity="0.9" transform="translate(1440,0)" />
                    <path d={WAVE_PATH_FG} fill={waterBottom} fillOpacity="0.9" transform="translate(2880,0)" />
                    <path d={WAVE_PATH_FG} fill={waterBottom} fillOpacity="0.9" transform="translate(4320,0)" />
                  </svg>
                </div>
              </div>

              {/* Flask border overlay (glass effect) */}
              <div style={st.flaskGlass} />
            </div>

            {/* Flask cap top */}
            <div style={st.flaskCap} />
          </div>

          {/* Stop button */}
          <div style={st.holdHint}>Нажми “Стоп”, когда захочешь вдохнуть</div>
          <div style={st.bottomAction}>
            <button
              type="button"
              style={st.stopBtnFull}
              className="intro-primary-btn"
              onClick={() => handleStop()}
            >
              Стоп
            </button>
          </div>
        </div>
      )}

      {/* ── RESULT PHASE ── */}
      {phase === "result" && (
        <div style={st.resultWrap}>
          {/* Big time display */}
          <div style={st.resultTimeWrap} className="onb-success-in">
            <span style={st.resultEmoji}>{result.emoji}</span>
            <span style={st.resultTime}>{resultSeconds} секунд</span>
          </div>

          {/* Mascot + bubble (same as OnbFirstWorkout success) */}
          <div style={st.successBubbleWrap} className="onb-success-in">
            <div style={st.successBubble} className="speech-bubble-bottom">
              <span style={st.successBubbleText}>
                {result.text}
              </span>
            </div>
          </div>

          <div style={st.successMascotWrap} className="onb-success-in onb-success-in-delay">
            <img src={morobotImg} alt="" style={st.successMascotImg} />
          </div>

          {/* Actions */}
          <div style={st.actions} className="onb-success-in onb-success-in-delay">
            <button
              type="button"
              style={st.primaryBtn}
              className="intro-primary-btn"
              onClick={() => {
                fireHapticImpact("medium");
                onComplete();
              }}
            >
              Далее
            </button>
            {onBack && (
              <button type="button" style={st.backBtn} onClick={onBack}>
                Назад
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// STYLES (CSS animations + wave keyframes)
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
        100% { opacity: 0; transform: translateY(12px); pointer-events: none; }
      }
      @keyframes successPopIn {
        0% { opacity: 0; transform: scale(0.85) translateY(24px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      .onb-fade-target { opacity: 0; }
      .onb-fade { animation: onbFadeUp 520ms ease-out both; }
      .onb-fade-delay-1 { animation-delay: 80ms; }
      .onb-fade-delay-2 { animation-delay: 160ms; }
      .onb-fade-delay-3 { animation-delay: 240ms; }
      .onb-leave { animation: onbFadeDown 380ms ease-in both; }
      .onb-success-in { animation: successPopIn 500ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
      .onb-success-in-delay { animation-delay: 120ms; }
      .speech-bubble:before {
        content: ""; position: absolute;
        left: -8px; top: 18px; width: 0; height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-right: 8px solid rgba(255,255,255,0.9);
        filter: drop-shadow(-1px 0 0 rgba(15, 23, 42, 0.12));
      }
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
      .speech-bubble-left:before {
        content: ""; position: absolute;
        right: -8px; top: 18px; width: 0; height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-left: 8px solid rgba(255,255,255,0.9);
        filter: drop-shadow(1px 0 0 rgba(15, 23, 42, 0.12));
      }
      .breath-in { animation: breathIn 2400ms ease-in-out infinite; }
      .breath-out { animation: breathOut 2400ms ease-in-out infinite; }
      @keyframes breathIn {
        0% { transform: scale(0.72); box-shadow: 0 0 0 rgba(96,165,250,0.0); }
        70% { transform: scale(1); box-shadow: 0 0 40px rgba(96,165,250,0.25); }
        100% { transform: scale(1); box-shadow: 0 0 50px rgba(96,165,250,0.3); }
      }
      @keyframes breathOut {
        0% { transform: scale(1); box-shadow: 0 0 40px rgba(96,165,250,0.25); }
        100% { transform: scale(0.72); box-shadow: 0 0 0 rgba(96,165,250,0.0); }
      }
      .intro-primary-btn {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation; user-select: none;
        transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
      }
      .intro-primary-btn:active:not(:disabled) {
        transform: translateY(1px) scale(0.99) !important;
      }
      @keyframes waveMove {
        0% { transform: translateX(0); }
        100% { transform: translateX(-25%); }
      }
      @keyframes flaskPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(96,165,250,0.0), inset 0 1px 2px rgba(255,255,255,0.5); }
        50% { box-shadow: 0 0 20px 4px rgba(96,165,250,0.15), inset 0 1px 2px rgba(255,255,255,0.5); }
      }
      @media (prefers-reduced-motion: reduce) {
        .onb-fade, .onb-leave, .onb-success-in { animation: none !important; }
        .onb-fade-target { opacity: 1 !important; transform: none !important; }
        .wave-bg, .wave-fg { animation: none !important; }
      }
    `}</style>
  );
}

// ============================================================================
// INLINE STYLES
// ============================================================================

// SVG wave paths (seamless)
const WAVE_PATH_BG =
  "M0,192L48,192C96,192,192,192,288,208C384,224,480,256,576,256C672,256,768,224,864,192C960,160,1056,128,1152,138.7C1248,149,1344,203,1392,229L1440,256L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z";
const WAVE_PATH_FG =
  "M0,224L48,213.3C96,203,192,181,288,181C384,181,480,213,576,229C672,245,768,245,864,229C960,213,1056,181,1152,170.7C1248,160,1344,171,1392,176L1440,181L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z";

const FLASK_W = 200;
const FLASK_H = 380;
const FLASK_R = 60;

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
    position: "relative",
  },
  confettiLayer: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 60,
  },

  // ── Mascot + Bubble ──
  header: {
    display: "grid",
    gap: 8,
    textAlign: "center",
    alignItems: "center",
    marginTop: 12,
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
  centerStartWrap: {
    display: "flex",
    justifyContent: "center",
    marginTop: 20,
  },
  centerStartBtn: {
    minWidth: 220,
    borderRadius: 16,
    padding: "16px 20px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 34,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },

  // ── Instruction tiles ──
  instructionGrid: {
    display: "grid",
    gap: 16,
    marginTop: 6,
    marginBottom: 6,
  },
  instructionRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 12,
  },
  instructionCard: {
    borderRadius: 18,
    padding: "16px 14px",
    minHeight: 104,
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    justifyContent: "center",
  },
  instructionEmoji: {
    fontSize: 22,
    lineHeight: 1,
  },
  instructionText: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(15, 23, 42, 0.6)",
    lineHeight: 1.4,
  },
  instructionArrow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Actions ──
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
  primaryBtn: {
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
  bottomAction: {
    position: "fixed",
    left: 0,
    bottom: 0,
    width: "100vw",
    height: "calc(56px + 14px + env(safe-area-inset-bottom, 0px))",
    zIndex: 10,
  },
  startBtn: {
    width: "100%",
    height: "100%",
    borderRadius: "22px 22px 0 0",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 34,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  breathWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    minHeight: "70vh",
  },
  breathOrb: {
    width: 180,
    height: 180,
    borderRadius: "50%",
    background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9) 0%, rgba(96,165,250,0.65) 35%, rgba(59,130,246,0.9) 100%)",
  },
  breathText: {
    fontSize: 24,
    fontWeight: 600,
    color: "#1e1f22",
  },
  holdText: {
    fontSize: 22,
    fontWeight: 600,
    color: "#1e1f22",
    marginBottom: 8,
  },
  holdHint: {
    fontSize: 16,
    fontWeight: 500,
    color: "rgba(15, 23, 42, 0.6)",
    marginTop: 10,
  },

  // ── Timer phase ──
  timerWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
    minHeight: "70vh",
  },
  flaskOuter: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  flaskCap: {
    width: FLASK_W * 0.5,
    height: 18,
    borderRadius: "8px 8px 0 0",
    background: "linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(220,220,230,0.7) 100%)",
    border: "1px solid rgba(255,255,255,0.6)",
    borderBottom: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
    marginBottom: -1,
    zIndex: 3,
  },
  flask: {
    position: "relative",
    width: FLASK_W,
    height: FLASK_H,
    borderRadius: FLASK_R,
    overflow: "hidden",
    background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)",
    border: "2px solid rgba(255,255,255,0.5)",
    animation: "flaskPulse 3s ease-in-out infinite",
  },
  flaskGlass: {
    position: "absolute",
    inset: 0,
    borderRadius: FLASK_R,
    background: "linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.1) 100%)",
    pointerEvents: "none",
    zIndex: 5,
  },
  waterFill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    transition: "none",
    borderRadius: `0 0 ${FLASK_R - 2}px ${FLASK_R - 2}px`,
    zIndex: 2,
  },
  waveWrapper: {
    position: "absolute",
    bottom: "calc(100% - 2px)",
    left: 0,
    right: 0,
    height: 28,
    overflow: "hidden",
  },
  waveSvg: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: "400%",
    height: "100%",
    animation: "waveMove 10s linear infinite",
    willChange: "transform",
  },
  stopBtnFull: {
    width: "100%",
    height: "100%",
    borderRadius: "22px 22px 0 0",
    border: "1px solid #dc2626",
    background: "#dc2626",
    color: "#fff",
    fontSize: 34,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
    boxShadow: "0 6px 10px rgba(220,38,38,0.3)",
  },

  // ── Result phase ──
  resultWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    minHeight: "60vh",
  },
  resultTimeWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  resultEmoji: {
    fontSize: 48,
    lineHeight: 1,
  },
  resultTime: {
    fontSize: 56,
    fontWeight: 900,
    color: "#1e1f22",
    lineHeight: 1,
    letterSpacing: -2,
  },

  // ── Success bubble + mascot (same as OnbFirstWorkout) ──
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
};

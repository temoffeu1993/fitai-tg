import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import morobotImg from "@/assets/morobot.webp";
import { fireHapticImpact } from "@/utils/haptics";

/* ── helpers ─────────────────────────────────────────────────── */

interface ResultPayload {
  title: string;
  location: string;
  durationMin: number;
  exercises: Array<{
    done: boolean;
    skipped: boolean;
    sets: Array<{ reps?: number; weight?: number; done: boolean }>;
  }>;
}

interface Pill {
  icon: string;
  value: string;
  label: string;
}

function buildPills(payload: ResultPayload): Pill[] {
  const pills: Pill[] = [];

  // 1 — Duration
  const dur = payload.durationMin;
  pills.push({
    icon: "⏱",
    value: `${dur} мин`,
    label: "активной тренировки",
  });

  // 2 — Volume (tonnage) for weighted exercises
  let totalVolume = 0;
  let totalSets = 0;
  let totalReps = 0;
  for (const ex of payload.exercises) {
    if (!ex.done && !ex.skipped) continue;
    for (const set of ex.sets) {
      if (!set.done) continue;
      totalSets++;
      const reps = set.reps ?? 0;
      const weight = set.weight ?? 0;
      totalReps += reps;
      totalVolume += reps * weight;
    }
  }

  if (totalVolume > 0) {
    const formatted =
      totalVolume >= 1000
        ? `${(totalVolume / 1000).toFixed(1).replace(/\.0$/, "")} т`
        : `${Math.round(totalVolume)} кг`;
    const analogy = getVolumeAnalogy(totalVolume);
    pills.push({
      icon: "🏋️",
      value: formatted,
      label: analogy || "общий объём",
    });
  }

  // 3 — Completion or sets
  const doneExercises = payload.exercises.filter((e) => e.done).length;
  const totalExercises = payload.exercises.length;

  if (doneExercises === totalExercises && totalExercises > 0) {
    pills.push({
      icon: "✅",
      value: `${doneExercises}/${totalExercises}`,
      label: "план выполнен полностью",
    });
  } else if (totalSets > 0) {
    pills.push({
      icon: "💪",
      value: `${totalSets}`,
      label: totalSets === 1 ? "подход" : pluralizeSets(totalSets),
    });
  }

  return pills.slice(0, 3);
}

function getVolumeAnalogy(kg: number): string {
  if (kg >= 20000) return "это масса слона 🐘";
  if (kg >= 10000) return "это масса лошади 🐎";
  if (kg >= 4000) return "это масса носорога 🦏";
  if (kg >= 1500) return "это целый автомобиль 🚗";
  if (kg >= 800) return "это масса коровы 🐄";
  if (kg >= 300) return "это масса рояля 🎹";
  if (kg >= 100) return "это масса холодильника";
  return "общий объём";
}

function pluralizeSets(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "подходов";
  if (mod10 === 1) return "подход";
  if (mod10 >= 2 && mod10 <= 4) return "подхода";
  return "подходов";
}

/* ── confetti burst ──────────────────────────────────────────── */

function fireConfetti() {
  const defaults = {
    spread: 70,
    ticks: 90,
    gravity: 1.2,
    decay: 0.92,
    startVelocity: 35,
    colors: ["#61d700", "#00d4ff", "#ff6b6b", "#ffd93d", "#c084fc", "#ffffff"],
  };

  // Two bursts from sides
  confetti({ ...defaults, particleCount: 45, origin: { x: 0.15, y: 0.55 }, angle: 60 });
  confetti({ ...defaults, particleCount: 45, origin: { x: 0.85, y: 0.55 }, angle: 120 });

  // Center burst after small delay
  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 30,
      origin: { x: 0.5, y: 0.45 },
      spread: 90,
      startVelocity: 30,
    });
  }, 200);
}

/* ── component ───────────────────────────────────────────────── */

const PILL_STAGGER = 400; // ms between each pill appearance
const AUTO_ADVANCE_DELAY = 3500; // ms after last pill before auto-advance
const EXIT_DURATION = 320; // ms for exit animation

export default function WorkoutCelebrate() {
  const location = useLocation();
  const nav = useNavigate();
  const result = (location.state as any)?.result;

  const [showMascot, setShowMascot] = useState(false);
  const [visiblePills, setVisiblePills] = useState(0);
  const [showButton, setShowButton] = useState(false);
  const [exiting, setExiting] = useState(false);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConfettied = useRef(false);
  const exitingRef = useRef(false);

  const pills = useMemo(
    () => (result?.payload ? buildPills(result.payload) : []),
    [result],
  );

  // Scroll to top
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  // Entrance sequence
  useEffect(() => {
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;

    if (prefersReduced) {
      setShowMascot(true);
      setVisiblePills(pills.length);
      setShowButton(true);
      return;
    }

    // T+100ms: mascot appears
    const t1 = setTimeout(() => {
      setShowMascot(true);
      fireHapticImpact("medium");
    }, 100);

    // T+600ms: confetti
    const t2 = setTimeout(() => {
      if (!hasConfettied.current) {
        hasConfettied.current = true;
        fireConfetti();
        fireHapticImpact("heavy");
      }
    }, 600);

    // Pills appear with stagger starting at T+900ms
    const pillTimers: ReturnType<typeof setTimeout>[] = [];
    pills.forEach((_, i) => {
      const t = setTimeout(() => {
        setVisiblePills((v) => Math.max(v, i + 1));
        fireHapticImpact("light");
      }, 900 + i * PILL_STAGGER);
      pillTimers.push(t);
    });

    // Button appears after all pills
    const btnDelay = 900 + pills.length * PILL_STAGGER + 300;
    const t3 = setTimeout(() => setShowButton(true), btnDelay);

    // Auto-advance
    const autoDelay = 900 + pills.length * PILL_STAGGER + AUTO_ADVANCE_DELAY;
    autoRef.current = setTimeout(() => {
      goNext();
    }, autoDelay);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      pillTimers.forEach(clearTimeout);
      if (autoRef.current) clearTimeout(autoRef.current);
    };
  }, [pills.length]);

  const goNext = () => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    if (autoRef.current) clearTimeout(autoRef.current);
    fireHapticImpact("light");

    setTimeout(() => {
      nav("/workout/result", { replace: true, state: { result } });
    }, EXIT_DURATION);
  };

  // Fallback: if no result, go to dashboard
  if (!result) {
    nav("/", { replace: true });
    return null;
  }

  return (
    <>
      <CelebrateStyles />
      <div
        style={s.page}
        className={exiting ? "wc-exit" : undefined}
        onClick={goNext}
      >
        {/* Mascot */}
        <div
          style={s.mascotWrap}
          className={showMascot ? "wc-mascot-in" : "wc-hidden"}
        >
          <img src={morobotImg} alt="" style={s.mascotImg} />
        </div>

        {/* Pills */}
        <div style={s.pillsWrap}>
          {pills.map((pill, i) => (
            <div
              key={i}
              style={s.pill}
              className={i < visiblePills ? "wc-pill-in" : "wc-hidden"}
            >
              <span style={s.pillIcon}>{pill.icon}</span>
              <div style={s.pillText}>
                <span style={s.pillValue}>{pill.value}</span>
                <span style={s.pillLabel}>{pill.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Button */}
        <div
          style={s.buttonWrap}
          className={showButton ? "wc-btn-in" : "wc-hidden"}
        >
          <button
            type="button"
            style={s.nextBtn}
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
          >
            Далее
          </button>
          <span style={s.skipHint}>или нажмите в любом месте</span>
        </div>
      </div>
    </>
  );
}

/* ── styles ──────────────────────────────────────────────────── */

function CelebrateStyles() {
  return (
    <style>{`
      /* Mascot entrance — drop + bounce */
      @keyframes wcMascotIn {
        0% { opacity: 0; transform: translateY(-60px) scale(0.7); }
        50% { opacity: 1; transform: translateY(12px) scale(1.05); }
        70% { transform: translateY(-6px) scale(0.98); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .wc-mascot-in {
        animation: wcMascotIn 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }

      /* Mascot subtle float after entrance */
      @keyframes wcFloat {
        0% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
        100% { transform: translateY(0); }
      }
      .wc-mascot-in img {
        animation: wcFloat 3000ms ease-in-out 800ms infinite;
      }

      /* Pill entrance — slide up + fade */
      @keyframes wcPillIn {
        0% { opacity: 0; transform: translateY(30px) scale(0.95); }
        60% { opacity: 1; transform: translateY(-4px) scale(1.01); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .wc-pill-in {
        animation: wcPillIn 450ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }

      /* Button entrance */
      @keyframes wcBtnIn {
        0% { opacity: 0; transform: translateY(20px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .wc-btn-in {
        animation: wcBtnIn 400ms ease-out both;
      }

      /* Hidden state */
      .wc-hidden {
        opacity: 0;
        pointer-events: none;
      }

      /* Exit animation */
      @keyframes wcExit {
        0% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.95); filter: blur(4px); }
      }
      .wc-exit {
        animation: wcExit ${EXIT_DURATION}ms ease-in both;
        pointer-events: none;
      }

      /* Pill glow pulse */
      @keyframes wcGlow {
        0%, 100% { box-shadow: 0 4px 20px rgba(97,215,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2); }
        50% { box-shadow: 0 4px 28px rgba(97,215,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3); }
      }
      .wc-pill-in {
        animation: wcPillIn 450ms cubic-bezier(0.34, 1.56, 0.64, 1) both,
                   wcGlow 2400ms ease-in-out 600ms infinite;
      }

      @media (prefers-reduced-motion: reduce) {
        .wc-mascot-in, .wc-pill-in, .wc-btn-in, .wc-exit {
          animation: none !important;
        }
        .wc-hidden { opacity: 1; pointer-events: auto; }
      }
    `}</style>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    padding: "24px 20px 40px",
    background:
      "radial-gradient(ellipse at 50% 30%, rgba(97,215,0,0.08) 0%, transparent 60%), " +
      "linear-gradient(180deg, #0f1118 0%, #181b24 50%, #0f1118 100%)",
    overflow: "hidden",
    cursor: "pointer",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },

  mascotWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  mascotImg: {
    width: 180,
    height: "auto",
    filter: "drop-shadow(0 16px 40px rgba(97,215,0,0.25))",
  },

  pillsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
    maxWidth: 360,
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px 20px",
    borderRadius: 20,
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
    border: "1px solid rgba(255,255,255,0.1)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },
  pillIcon: {
    fontSize: 28,
    lineHeight: 1,
    flexShrink: 0,
  },
  pillText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  pillValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#ffffff",
    letterSpacing: "-0.02em",
    fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
  },
  pillLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 1.3,
  },

  buttonWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    width: "100%",
    maxWidth: 360,
  },
  nextBtn: {
    width: "100%",
    padding: "16px 0",
    borderRadius: 16,
    border: "none",
    background: "linear-gradient(180deg, #72e800 0%, #56b800 100%)",
    color: "#0a1200",
    fontSize: 17,
    fontWeight: 700,
    fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
    cursor: "pointer",
    boxShadow:
      "0 4px 16px rgba(97,215,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
    WebkitTapHighlightColor: "transparent",
  },
  skipHint: {
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    fontWeight: 400,
  },
};

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import morobotImg from "@/assets/morobot.webp";
import { fireHapticImpact } from "@/utils/haptics";
import { useTypewriterText } from "@/hooks/useTypewriterText";
import {
  loadHistory,
  getWeekCompletedCount,
  getWeekCompletedDays,
  getSessionsPerWeek,
} from "@/lib/history";

// ─── Helpers ─────────────────────────────────────────────────────────────

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

function pluralizeMinutes(n: number): string {
  if (n >= 11 && n <= 14) return "минут";
  const mod10 = n % 10;
  if (mod10 === 1) return "минута";
  if (mod10 >= 2 && mod10 <= 4) return "минуты";
  return "минут";
}

function getPercentSubtext(p: number): string {
  if (p >= 100) return "Мышцы загружены по полной";
  if (p >= 80) return "Организм получил мощный стимул";
  if (p >= 50) return "Достаточно для прогресса";
  return "Тело уже включилось в работу";
}

function getVolumeAnalogy(kg: number): string {
  if (kg < 50) return "Как будто перенесли пару увесистых арбузов с рынка";
  if (kg < 100) return "Масса здорового сенбернара. Хороший песик!";
  if (kg < 300) return "Вы только что подняли взрослого льва. Царь зверей отдыхает";
  if (kg < 600) return "Это масса концертного рояля. Настоящая музыка для мышц!";
  if (kg < 1000) return "Вы перетаскали вес целого белого медведя. Мощно!";
  if (kg < 2000) return "Суммарно это вес легкового автомобиля хэтчбека";
  if (kg < 3500) return "Целый тяжелый внедорожник остался позади";
  if (kg < 5000) return "Вес взрослого азиатского слона. Серьезная заявочка!";
  if (kg < 10000) return "Поздравляю, вы подняли массу взрослого тираннозавра!";
  return "Огромный тоннаж, тянет на вес небольшого кита!";
}

function getCalorieAnalogy(kcal: number): string {
  if (kcal < 150) return "Как стакан свежевыжатого сока — только в расход";
  if (kcal < 250) return "Порция картошки фри испарилась ещё до стола";
  if (kcal < 350) return "Кусок торта «Наполеон» сгорел ещё до чаепития";
  if (kcal < 450) return "Целая шаурма осталась в прошлом. Тело говорит спасибо";
  if (kcal < 600) return "Как полноценный обед — только в минус, а не в плюс";
  if (kcal < 800) return "Это ужин на двоих — а сожгли вы в одиночку";
  return "Праздничный ужин — организм работал на полную мощность";
}

function readUserMeta(): { goal?: string; weightKg?: number; sex?: string; trainingLocation?: string } {
  try {
    const raw = localStorage.getItem("onb_summary");
    if (!raw) return {};
    const s = JSON.parse(raw);
    return {
      goal: s?.motivation?.goal,
      weightKg: s?.body?.weight,
      sex: s?.ageSex?.sex,
      trainingLocation: s?.trainingPlace?.place,
    };
  } catch {
    return {};
  }
}

function estimateCalories(durMin: number, weightKg: number, hasWeights: boolean): number {
  const met = hasWeights ? 5.5 : 4.5;
  return Math.round(met * weightKg * (durMin / 60));
}

// ─── Weekly Goal Panel Component ─────────────────────────────────────────

const GROOVE_BG = "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)";
const GROOVE_SHADOW =
  "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)";
const FILL_COLOR = "#1e1f22";
const FILL_SHADOW =
  "inset 0 2px 3px rgba(0,0,0,0.3), inset 0 -1px 0 rgba(255,255,255,0.15)";

const BAR_HEIGHT = 26;
const FILL_DURATION_MS = 700;
const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function WeeklyGoalPanel({
  total,
  prev,
  target,
  phase,
  oldWorkoutCount,
  newWorkoutCount,
  completedDays,
  onBarDone,
  onCountDone,
}: {
  total: number;
  prev: number;
  target: number;
  phase: "before" | "counting" | "filling" | "checked" | "done";
  oldWorkoutCount: number;
  newWorkoutCount: number;
  completedDays: Set<number>;
  onBarDone?: () => void;
  onCountDone?: () => void;
}) {
  const prevPct = prev / total;
  const targetPct = target / total;
  const prevWidth = `${prevPct * 100}%`;
  const targetWidth = `${targetPct * 100}%`;
  const isAfterCount = phase === "filling" || phase === "checked" || phase === "done";
  const fillWidth = isAfterCount ? targetWidth : prevWidth;
  const displayTarget = isAfterCount ? target : prev;

  const rightRef = useRef<HTMLDivElement>(null);
  const [dotSize, setDotSize] = useState(28);
  useEffect(() => {
    if (!rightRef.current) return;
    const w = rightRef.current.offsetWidth;
    const size = Math.min(32, Math.max(22, Math.floor((w - 6 * 6) / 7)));
    setDotSize(size);
  }, []);

  const todayIso = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();

  const onBarDoneRef = useRef(onBarDone);
  onBarDoneRef.current = onBarDone;
  useEffect(() => {
    if (phase !== "filling") return;
    const t = setTimeout(() => onBarDoneRef.current?.(), FILL_DURATION_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Fire count done callback
  const onCountDoneRef = useRef(onCountDone);
  onCountDoneRef.current = onCountDone;
  useEffect(() => {
    if (phase !== "counting") return;
    const t = setTimeout(() => onCountDoneRef.current?.(), 600);
    return () => clearTimeout(t);
  }, [phase]);

  const isCounting = phase === "counting" || phase === "filling" || phase === "checked" || phase === "done";
  const showChecked = phase === "checked" || phase === "done";

  return (
    <div style={sk.row}>
      <div style={sk.fireBlock}>
        <div style={sk.fireRow}>
          <span style={{ fontSize: 32, lineHeight: 1 }}>🔥</span>
          <div style={sk.popWrap}>
            <span
              className={isCounting ? "wc-num-out" : ""}
              style={{ ...sk.fireNumber, gridArea: "1/1" }}
            >
              {oldWorkoutCount}
            </span>
            <span
              className={isCounting ? "wc-num-in" : "wc-hidden"}
              style={{ ...sk.fireNumber, gridArea: "1/1" }}
            >
              {newWorkoutCount}
            </span>
          </div>
        </div>
        <span style={sk.fireLabel}>всего тренировок</span>
      </div>

      <div style={sk.rightCol} ref={rightRef}>
        <span style={sk.weekLabel}>Цель недели</span>

        <div style={sk.barGroove}>
          {phase === "filling" ? (
            <div
              className="streak-fill-grow"
              style={{
                height: "100%", borderRadius: BAR_HEIGHT / 2,
                background: FILL_COLOR, boxShadow: FILL_SHADOW,
                "--fill-from": prevWidth,
                "--fill-to": targetWidth,
              } as React.CSSProperties}
            />
          ) : (
            <div style={{
              height: "100%", borderRadius: BAR_HEIGHT / 2,
              background: FILL_COLOR, boxShadow: FILL_SHADOW,
              width: fillWidth,
              transition: phase === "before" ? "none" : "width 300ms ease",
            }} />
          )}
          <span style={sk.barText}>
            {displayTarget}/{total} тренировок
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
          {DAY_LABELS.map((label, i) => {
            const wasDone = completedDays.has(i) && i !== todayIso;
            const justDone = showChecked && i === todayIso;
            const isDone = wasDone || justDone;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: 1 }}>
                <div
                  style={{
                    width: dotSize, height: dotSize, borderRadius: 999,
                    background: GROOVE_BG,
                    boxShadow: GROOVE_SHADOW,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "visible",
                  }}
                >
                  <span
                    className={justDone ? "wc-check-pop" : ""}
                    style={{
                      fontWeight: 700,
                      lineHeight: 1,
                      fontSize: Math.round(dotSize * 0.55),
                      color: isDone ? "#1e1f22" : "rgba(15,23,42,0.12)",
                      textShadow: isDone
                        ? "0 1px 0 rgba(255,255,255,0.82), 0 -1px 0 rgba(15,23,42,0.15)"
                        : "0 1px 0 rgba(255,255,255,0.7)",
                      transform: "translateY(-1px)",
                    }}
                  >
                    ✓
                  </span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 500, lineHeight: 1,
                  color: isDone ? "rgba(15,23,42,0.6)" : "rgba(15,23,42,0.3)",
                }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const sk: Record<string, React.CSSProperties> = {
  row: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: 14,
    alignItems: "center",
    width: "100%",
    padding: "0 4px",
  },
  fireBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: 100,
    minHeight: 108,
    borderRadius: 20,
    background: GROOVE_BG,
    boxShadow: GROOVE_SHADOW,
    padding: "16px 8px",
  },
  fireRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  fireNumber: {
    fontSize: 36,
    fontWeight: 900,
    color: "#1e1f22",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.03em",
  },
  popWrap: {
    display: "grid",
    height: 36,
  },
  fireLabel: {
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.62)",
    lineHeight: 1.45,
    textAlign: "center",
  },
  rightCol: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  weekLabel: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.2,
    color: "#0f172a",
  },
  barGroove: {
    position: "relative",
    width: "100%",
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    background: GROOVE_BG,
    boxShadow: GROOVE_SHADOW,
    overflow: "hidden",
  },
  barText: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(160,160,160,1)",
    pointerEvents: "none",
    zIndex: 1,
  },
};

// ─── Number Counter Hook ──────────────────────────────────────────────────

function useCounter(
  target: number,
  active: boolean,
  durationMs: number = 800,
  onComplete?: () => void,
  from: number = 0,
) {
  const [value, setValue] = useState(from);
  const startTimeRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active || doneRef.current) return;
    if (target === from) {
      setValue(target);
      doneRef.current = true;
      if (onCompleteRef.current) onCompleteRef.current();
      return;
    }

    let rafId: number;
    const tick = (now: number) => {
      if (!startTimeRef.current) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      const easing = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(Math.round(from + (target - from) * easing));
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setValue(target);
        doneRef.current = true;
        if (onCompleteRef.current) onCompleteRef.current();
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, active, durationMs, from]);

  return value;
}

// ─── Confetti ─────────────────────────────────────────────────────────────

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
  const cy = vh * 0.35;
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
      vRotX: -8 + Math.random() * 16,
      vRotY: -8 + Math.random() * 16,
      vRotZ: -4 + Math.random() * 8,
      w, h, face, back,
      opacity: 1, life: 0,
      maxLife: 120 + Math.random() * 80,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.05 + Math.random() * 0.08,
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
      p.vx += Math.sin(p.wobblePhase) * WOBBLE_AMP;
      p.wobblePhase += p.wobbleSpeed;
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

// ─── Component ──────────────────────────────────────────────────────────
// Two-step flow:
//
// STEP 1: Mascot + bubble + metrics
// 0 = initial
// 1 = mascot + bubble ("Еее! Тренировка выполнена!") + confetti
// 2 = % metric
// 3 = time metric
// 4 = kg/kcal metric
// 5 = "Далее" visible
//
// STEP 2: Mascot centered + bubble + weekly goal panel
// 6 = transition to step 2, new bubble, panel appears
// 7 = goal panel animation done, "Далее" visible

export default function WorkoutCelebrate() {
  const location = useLocation();
  const nav = useNavigate();
  const result = (location.state as any)?.result;
  const payload: ResultPayload | undefined = result?.payload;

  const [stage, setStage] = useState(0);
  const [showSub1, setShowSub1] = useState(false);
  const [showSub2, setShowSub2] = useState(false);
  const [showSub3, setShowSub3] = useState(false);
  const [goalPhase, setGoalPhase] = useState<
    "before" | "counting" | "filling" | "checked" | "done"
  >("before");
  const [showPanel, setShowPanel] = useState(false);
  const confettiRef = useRef<HTMLDivElement>(null);

  // Data — prefer values passed via location.state (computed from fresh cache)
  const history = useMemo(() => loadHistory(), []);
  const stateWeekCompleted = (location.state as any)?.weekCompleted;
  const stateSessionsPerWeek = (location.state as any)?.sessionsPerWeek;
  const sessionsPerWeek = typeof stateSessionsPerWeek === "number" && stateSessionsPerWeek >= 2
    ? stateSessionsPerWeek
    : getSessionsPerWeek();
  const weekCompleted = typeof stateWeekCompleted === "number"
    ? stateWeekCompleted
    : getWeekCompletedCount(history);
  const chainCompleted = Math.min(weekCompleted, sessionsPerWeek);
  const completedDays = useMemo(() => getWeekCompletedDays(history), [history]);
  const workoutNumber = history.length;

  const isStep2 = stage >= 6;

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  // Step 1 animation
  useEffect(() => {
    if (!payload) return;
    const t1 = setTimeout(() => {
      setStage(1);
      fireHapticImpact("heavy");
      if (confettiRef.current) {
        confettiRef.current.innerHTML = "";
        spawnConfetti(confettiRef.current);
      }
    }, 400);
    const t2 = setTimeout(() => {
      setStage(2);
      fireHapticImpact("medium");
    }, 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [payload]);

  // Step 2: show panel after bubble starts typing, then start counting
  useEffect(() => {
    if (stage !== 6) return;
    const t1 = setTimeout(() => {
      setShowPanel(true);
    }, 1200);
    const t2 = setTimeout(() => {
      setGoalPhase("counting");
      fireHapticImpact("medium");
    }, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [stage]);

  // Count done → fill bar
  const onCountDone = () => {
    setGoalPhase("filling");
    fireHapticImpact("heavy");
  };

  const onBarFillDone = () => {
    setGoalPhase("checked");
    fireHapticImpact("heavy");
    setTimeout(() => {
      setGoalPhase("done");
      setStage(7);
      fireHapticImpact("light");
    }, 600);
  };

  const goToStep2 = () => {
    fireHapticImpact("medium");
    setStage(6);
  };

  const goToResult = () => {
    fireHapticImpact("medium");
    nav("/workout/result", { replace: true, state: { result } });
  };

  useEffect(() => {
    if (!payload) nav("/", { replace: true });
  }, [payload, nav]);

  if (!payload) return null;

  let totalSets = 0;
  let doneSets = 0;
  let totalVolume = 0;

  for (const ex of payload.exercises) {
    if (ex.skipped) continue;
    for (const set of ex.sets) {
      totalSets++;
      if (set.done) {
        doneSets++;
        if (set.reps && set.weight) totalVolume += set.reps * set.weight;
      }
    }
  }
  const percent = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const percentSubtext = getPercentSubtext(percent);
  const durMin = payload.durationMin || 0;
  const tonnage = Math.round(totalVolume);

  const userMeta = readUserMeta();
  const showCalories =
    userMeta.goal === "lose_weight" || userMeta.trainingLocation === "home_no_equipment";
  const bodyWeightKg = userMeta.weightKg ?? (userMeta.sex === "female" ? 60 : 70);
  const calories = durMin > 0 ? estimateCalories(durMin, bodyWeightKg, tonnage > 0) : 0;
  const thirdValue = showCalories ? calories : tonnage;

  const count1 = useCounter(percent, stage >= 2, 700, () => {
    fireHapticImpact("heavy");
    setShowSub1(true);
    setTimeout(() => { fireHapticImpact("medium"); setStage(3); }, 800);
  });

  const count2 = useCounter(durMin, stage >= 3, 700, () => {
    fireHapticImpact("heavy");
    setShowSub2(true);
    setTimeout(() => {
      if (thirdValue > 0) {
        fireHapticImpact("medium");
        setStage(4);
      } else {
        setStage(5);
        fireHapticImpact("light");
      }
    }, 800);
  });

  const count3 = useCounter(thirdValue, stage >= 4, 800, () => {
    if (thirdValue > 0) {
      fireHapticImpact("heavy");
      setShowSub3(true);
      setTimeout(() => {
        setStage(5);
        fireHapticImpact("light");
      }, 800);
    }
  });

  // Bubble text
  const step1Bubble = workoutNumber === 1
    ? "Еее, первая готова! Запомните этот день!"
    : percent >= 90
      ? "Тренировка огонь! Вот это уровень!"
      : percent >= 50
        ? "Круто позанимались! Респект!"
        : "Пришли и сделали, это главное!";

  const step2Bubble = chainCompleted >= sessionsPerWeek
    ? "Еее! Цель недели выполнена!"
    : chainCompleted === sessionsPerWeek - 1
      ? "Осталась одна тренировка до цели!"
      : workoutNumber === 1
        ? "Первый шаг самый важный!"
        : chainCompleted === 1
          ? "Старт недели!"
          : "Продолжаем в том же духе!";

  const bubbleTarget = isStep2
    ? step2Bubble
    : (stage >= 1 ? step1Bubble : "");
  const bubbleTyped = useTypewriterText(bubbleTarget, {
    charIntervalMs: 15,
    startDelayMs: 80,
  });

  const showStep1 = !isStep2;
  const showStep2 = isStep2;

  return (
    <>
      <style>{css}</style>
      <div ref={confettiRef} style={s.confettiLayer} />

      {/* ═══ STEP 1: Mascot + Bubble + Metrics ═══ */}
      {showStep1 && (
        <div style={s.page}>
          {/* Mascot + Bubble */}
          <div style={s.mascotRow} className={stage >= 1 ? "onb-fade" : "wc-hidden"}>
            <img src={morobotImg} alt="" style={s.mascotImg} loading="eager" decoding="async" />
            <div style={{ ...s.bubble, position: "relative" }} className="wc-speech-bubble">
              <span style={{ ...s.bubbleText, visibility: "hidden" }}>{step1Bubble}</span>
              <span style={{ ...s.bubbleText, position: "absolute", inset: "14px 16px" }}>{bubbleTyped || "\u00A0"}</span>
            </div>
          </div>

          {/* Metrics */}
          <div style={s.metricsWrap}>
            <div style={s.summaryCard} className={stage >= 2 ? "onb-fade" : "wc-hidden"}>
              <div style={s.valueRow}>
                <span style={s.metricEmoji}>🎯</span>
                <span style={s.valueBig}>{count1}</span>
                <span style={s.valuePercent}>%</span>
                <span style={s.valueUnit}>выполнено</span>
              </div>
              <div style={s.subtext} className={showSub1 ? "onb-fade-soft" : "wc-hidden"}>
                {percentSubtext}
              </div>
            </div>

            <div style={s.summaryCard} className={stage >= 3 ? "onb-fade" : "wc-hidden"}>
              <div style={s.valueRow}>
                <span style={s.metricEmoji}>💰</span>
                <span style={s.valueBig}>{count2}</span>
                <span style={s.valueUnit}>{pluralizeMinutes(durMin)}</span>
              </div>
              <div style={s.subtext} className={showSub2 ? "onb-fade-soft" : "wc-hidden"}>
                инвестировано в ваше здоровье
              </div>
            </div>

            {thirdValue > 0 && (
              <div style={s.summaryCard} className={stage >= 4 ? "onb-fade" : "wc-hidden"}>
                <div style={s.valueRow}>
                  {showCalories
                    ? <span style={s.metricEmoji}>🔥</span>
                    : <span style={s.metricEmoji}>💪</span>
                  }
                  {showCalories && <span style={s.valueApprox}>~</span>}
                  <span style={s.valueBig}>{count3.toLocaleString("ru-RU")}</span>
                  <span style={s.valueUnit}>{showCalories ? "ккал" : "кг"}</span>
                </div>
                <div style={s.subtext} className={showSub3 ? "onb-fade-soft" : "wc-hidden"}>
                  {showCalories ? getCalorieAnalogy(calories) : getVolumeAnalogy(tonnage)}
                </div>
              </div>
            )}
          </div>

          <div style={{ height: 120 }} />
        </div>
      )}

      {/* ═══ STEP 2: Mascot centered + Bubble above + Weekly Goal Panel ═══ */}
      {showStep2 && (
        <div style={s.page2}>
          {/* Bubble above mascot */}
          <div style={s.bubble2Wrap} className="onb-fade">
            <div style={{ ...s.bubble2, position: "relative" }} className="wc-speech-bubble-down">
              <span style={{ ...s.bubbleText, visibility: "hidden" }}>{step2Bubble}</span>
              <span style={{ ...s.bubbleText, position: "absolute", inset: "14px 20px" }}>{bubbleTyped || "\u00A0"}</span>
            </div>
          </div>

          {/* Centered mascot */}
          <div style={s.mascotCenter} className="onb-fade">
            <img src={morobotImg} alt="" style={s.mascotCenterImg} loading="eager" decoding="async" />
          </div>

          {/* Weekly Goal Panel */}
          <div className={showPanel ? "onb-fade" : "wc-hidden"} style={{ width: "100%", marginTop: 24 }}>
            <WeeklyGoalPanel
              total={sessionsPerWeek}
              prev={Math.max(0, chainCompleted - 1)}
              target={chainCompleted}
              phase={goalPhase}
              oldWorkoutCount={Math.max(0, workoutNumber - 1)}
              newWorkoutCount={workoutNumber}
              completedDays={completedDays}
              onBarDone={onBarFillDone}
              onCountDone={onCountDone}
            />
          </div>

          <div style={{ height: 120 }} />
        </div>
      )}

      {/* ═══ Footer ═══ */}
      {stage >= 1 && (
        <div style={s.footerFlow}>
          <button
            className="checkin-primary-btn"
            style={{
              ...s.primaryBtn,
              opacity: (showStep1 && stage >= 5) || (showStep2 && stage >= 7) ? 1 : 0,
              pointerEvents: (showStep1 && stage >= 5) || (showStep2 && stage >= 7) ? "auto" : "none",
            }}
            onClick={isStep2 ? goToResult : goToStep2}
          >
            <span style={s.primaryBtnText}>Далее</span>
            <span style={s.primaryBtnCircle} aria-hidden>
              <span style={{ fontSize: 20, lineHeight: 1, color: "#0f172a", fontWeight: 700 }}>→</span>
            </span>
          </button>

          <button
            className="checkin-text-btn"
            style={{
              ...s.secondaryBtn,
              opacity: stage >= 1 ? 1 : 0,
              pointerEvents: stage >= 1 ? "auto" : "none",
            }}
            onClick={goToResult}
          >
            Пропустить
          </button>
        </div>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  // ── Step 1 page ──
  page: {
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 0",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "transparent",
    color: "#1e1f22",
    minHeight: "100vh",
    margin: "0 auto",
    maxWidth: 720,
  },
  confettiLayer: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 60,
  },
  // ── Step 1: Mascot + Bubble (grid, mascot left) ──
  mascotRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  mascotImg: {
    width: 130,
    height: "auto",
    objectFit: "contain",
    flexShrink: 0,
  },
  bubble: {
    position: "relative",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  },
  bubbleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.35,
    color: "#0f172a",
    whiteSpace: "pre-line",
  },
  // ── Metrics ──
  metricsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    width: "100%",
  },
  summaryCard: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "0 10px",
  },
  valueRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  metricEmoji: {
    fontSize: 28,
    lineHeight: 1,
    flexShrink: 0,
  },
  valueBig: {
    fontSize: 36,
    fontWeight: 900,
    color: "#1e1f22",
    letterSpacing: "-0.03em",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  valuePercent: {
    fontSize: 22,
    fontWeight: 900,
    color: "#1e1f22",
  },
  valueApprox: {
    fontSize: 22,
    fontWeight: 700,
    color: "rgba(15,23,42,0.45)",
    marginRight: -4,
  },
  valueUnit: {
    fontSize: 22,
    fontWeight: 900,
    color: "#1e1f22",
  },
  subtext: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, 0.62)",
  },
  // ── Step 2 page ──
  page2: {
    padding: "calc(env(safe-area-inset-top, 0px) + 24px) 16px 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    background: "transparent",
    color: "#1e1f22",
    minHeight: "100vh",
    margin: "0 auto",
    maxWidth: 720,
  },
  bubble2Wrap: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    marginBottom: 12,
  },
  bubble2: {
    position: "relative",
    padding: "14px 20px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    maxWidth: 280,
    textAlign: "center",
  },
  mascotCenter: {
    display: "flex",
    justifyContent: "center",
  },
  mascotCenterImg: {
    width: 180,
    height: "auto",
    objectFit: "contain",
  },
  // ── Footer ──
  footerFlow: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 10px)",
    display: "grid",
    gap: 8,
  },
  primaryBtn: {
    width: "fit-content",
    maxWidth: "100%",
    justifySelf: "center",
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    height: 56,
    minHeight: 56,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
    cursor: "pointer",
    transition: "transform 160ms ease, opacity 250ms ease",
  },
  primaryBtnText: {
    whiteSpace: "nowrap",
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1,
    color: "#fff",
  },
  primaryBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -6,
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    color: "#0f172a",
    flexShrink: 0,
  },
  secondaryBtn: {
    width: "100%",
    minHeight: 40,
    border: "none",
    background: "transparent",
    borderRadius: 999,
    color: "rgba(15,23,42,0.6)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "center",
    transition: "opacity 250ms ease",
  },
};

const css = `
@keyframes onbFadeUp {
  0% { opacity: 0; transform: translateY(14px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes onbFadeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes streakNodePop {
  0% { transform: scale(1); }
  40% { transform: scale(1.55); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); }
}
@keyframes streakFirePop {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.4); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes streakCheckPop {
  0% { transform: scale(0); opacity: 0; }
  45% { transform: scale(1.6); opacity: 1; }
  70% { transform: scale(0.9); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes wcCheckPop {
  0% { transform: translateY(-1px) scale(0); opacity: 0; }
  40% { transform: translateY(-1px) scale(2.2); opacity: 1; }
  65% { transform: translateY(-1px) scale(0.85); opacity: 1; }
  80% { transform: translateY(-1px) scale(1.1); opacity: 1; }
  100% { transform: translateY(-1px) scale(1); opacity: 1; }
}
@keyframes streakFillGrow {
  0% { width: var(--fill-from); }
  100% { width: var(--fill-to); }
}
@keyframes wcNumOut {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}
@keyframes wcNumIn {
  0% { transform: scale(0); opacity: 0; }
  40% { transform: scale(1.35); opacity: 1; }
  65% { transform: scale(0.9); opacity: 1; }
  80% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.streak-fill-grow {
  animation: streakFillGrow 700ms cubic-bezier(0.22,1,0.36,1) both;
}

.onb-fade {
  animation: onbFadeUp 520ms ease-out both;
}
.onb-fade-soft {
  animation: onbFadeIn 420ms ease-out both;
}
.wc-hidden {
  opacity: 0;
  pointer-events: none;
}

.streak-node-pop {
  animation: streakNodePop 500ms cubic-bezier(0.22,1,0.36,1) both;
}
.streak-fire-pop {
  animation: streakFirePop 400ms cubic-bezier(0.22,1,0.36,1) both;
}
.streak-check-pop {
  animation: streakCheckPop 450ms cubic-bezier(0.22,1,0.36,1) both;
}
.wc-check-pop {
  animation: wcCheckPop 500ms cubic-bezier(0.22,1,0.36,1) both;
}
.wc-num-out {
  animation: wcNumOut 300ms cubic-bezier(0.4,0,0.2,1) both;
}
.wc-num-in {
  animation: wcNumIn 500ms cubic-bezier(0.22,1,0.36,1) both;
  animation-delay: 150ms;
}

.wc-speech-bubble::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 18px;
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 8px solid rgba(255,255,255,0.9);
  filter: drop-shadow(-1px 0 0 rgba(15,23,42,0.10));
}

.wc-speech-bubble-down::after {
  content: "";
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid rgba(255,255,255,0.9);
  filter: drop-shadow(0 1px 0 rgba(15,23,42,0.10));
}

.checkin-primary-btn {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.checkin-primary-btn:active {
  transform: translateY(1px) scale(0.99) !important;
  background-color: #1e1f22 !important;
}

.checkin-text-btn {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.checkin-text-btn:active {
  transform: translateY(1px) !important;
  color: rgba(17,24,39,0.72) !important;
}

@media (prefers-reduced-motion: reduce) {
  .onb-fade, .onb-fade-soft, .streak-node-pop, .streak-fire-pop,
  .streak-check-pop, .streak-fill-grow, .wc-num-out, .wc-num-in,
  .wc-check-pop {
    animation: none !important;
  }
}
`;

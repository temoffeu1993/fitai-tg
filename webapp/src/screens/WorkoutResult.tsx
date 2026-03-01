import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProgressionJob, getWorkoutSessionById } from "@/api/plan";
import { Clock3, Dumbbell, Activity, Zap, Calendar, CircleCheckBig, Flame, TrendingUp, Repeat } from "lucide-react";
import { loadHistory, type HistSession } from "@/lib/history";
import { resolveDayCopy } from "@/utils/dayLabelCopy";
import mascotImg from "@/assets/robonew.webp";

// ─── Constants ─────────────────────────────────────────────────────────────────

const LAST_RESULT_KEY = "last_workout_result_v1";
const DASH_AVATAR_SIZE = 56;

// ─── Types ─────────────────────────────────────────────────────────────────────

type ProgressionJob = { id: string; status: string; lastError?: string | null } | null;

type StoredWorkoutResult = {
  version: 1;
  createdAt: string;
  clientSessionId?: string | null;
  sessionId: string | null;
  plannedWorkoutId: string | null;
  sessionNumber?: number | null;
  payload: any;
  progression: any | null;
  progressionJob: ProgressionJob;
  coachJob?: { id: string; status: string; lastError?: string | null } | null;
  coachReport?: any | null;
  weeklyCoachJobId?: string | null;
};

// ─── Storage ───────────────────────────────────────────────────────────────────

function readStored(): StoredWorkoutResult | null {
  try {
    const raw = localStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    return parsed as StoredWorkoutResult;
  } catch {
    return null;
  }
}

function writeStored(next: StoredWorkoutResult) {
  try {
    localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(next));
  } catch { }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function median(nums: number[]): number | null {
  const sorted = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function haptic() {
  try {
    if (navigator.vibrate) navigator.vibrate(80);
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
  } catch { }
}

function pluralExercises(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "упражнение";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "упражнения";
  return "упражнений";
}

function pluralSets(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "подход";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "подхода";
  return "подходов";
}

function ordinalWorkout(n: number): string {
  // Russian ordinal for workout number
  if (n === 1) return "1-я";
  if (n === 2) return "2-я";
  if (n === 3) return "3-я";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${n}-я`;
  if (mod10 === 1) return `${n}-я`;
  if (mod10 === 2) return `${n}-я`;
  if (mod10 === 3) return `${n}-я`;
  return `${n}-я`;
}

// ─── Effort mapping ────────────────────────────────────────────────────────────

type EffortTag = "easy" | "working" | "quite_hard" | "hard" | "max";

const EFFORT_LABELS: Record<EffortTag, string> = {
  easy: "Легко",
  working: "Рабочая",
  quite_hard: "Ощутимо",
  hard: "Тяжело",
  max: "Максимум",
};

const EFFORT_NUMERIC: Record<EffortTag, number> = {
  easy: 1,
  working: 2,
  quite_hard: 3,
  hard: 4,
  max: 5,
};

function effortLabel(tag: EffortTag | string | null | undefined): string {
  if (!tag) return "";
  return EFFORT_LABELS[tag as EffortTag] || "";
}

function avgEffortLabel(exercises: any[]): string {
  const values: number[] = [];
  for (const ex of exercises) {
    const e = ex?.effort as EffortTag | undefined;
    if (e && EFFORT_NUMERIC[e]) values.push(EFFORT_NUMERIC[e]);
  }
  if (values.length === 0) return "";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg <= 1.5) return "Легко";
  if (avg <= 2.5) return "Рабочая";
  if (avg <= 3.5) return "Ощутимо";
  if (avg <= 4.5) return "Тяжело";
  return "Максимум";
}

// ─── Muscle group mapping ──────────────────────────────────────────────────────

const MUSCLE_GROUP_MAP: Record<string, string> = {
  quads: "Квадрицепсы",
  glutes: "Ягодицы",
  hamstrings: "Бицепс бедра",
  calves: "Икры",
  chest: "Грудь",
  lats: "Широчайшие",
  upper_back: "Верх спины",
  rear_delts: "Плечи",
  front_delts: "Плечи",
  side_delts: "Плечи",
  triceps: "Трицепс",
  biceps: "Бицепс",
  forearms: "Предплечья",
  core: "Пресс",
  lower_back: "Поясница",
};

const PATTERN_TO_MUSCLES: Record<string, string[]> = {
  squat: ["Квадрицепсы", "Ягодицы"],
  hinge: ["Бицепс бедра", "Ягодицы"],
  lunge: ["Квадрицепсы", "Ягодицы"],
  hip_thrust: ["Ягодицы"],
  horizontal_push: ["Грудь", "Трицепс"],
  incline_push: ["Грудь", "Плечи"],
  vertical_push: ["Плечи", "Трицепс"],
  horizontal_pull: ["Верх спины", "Бицепс"],
  vertical_pull: ["Широчайшие", "Бицепс"],
  rear_delts: ["Плечи"],
  delts_iso: ["Плечи"],
  triceps_iso: ["Трицепс"],
  biceps_iso: ["Бицепс"],
  calves: ["Икры"],
  core: ["Пресс"],
};

const MUSCLE_COLORS: Record<string, string> = {
  "Грудь": "#3B82F6",
  "Плечи": "#8B5CF6",
  "Трицепс": "#EC4899",
  "Бицепс": "#F59E0B",
  "Широчайшие": "#10B981",
  "Верх спины": "#14B8A6",
  "Квадрицепсы": "#EF4444",
  "Ягодицы": "#F97316",
  "Бицепс бедра": "#D946EF",
  "Икры": "#6366F1",
  "Пресс": "#0EA5E9",
  "Поясница": "#64748B",
  "Предплечья": "#84CC16",
};

function getMusclesForExercise(ex: any): string[] {
  // Try targetMuscles from payload
  const target: string[] = Array.isArray(ex?.targetMuscles) ? ex.targetMuscles : [];
  if (target.length > 0) {
    const mapped = target.map((m: string) => MUSCLE_GROUP_MAP[m] || m);
    return [...new Set(mapped)];
  }
  // Fallback: pattern
  const pattern = String(ex?.pattern || "");
  if (pattern && PATTERN_TO_MUSCLES[pattern]) {
    return PATTERN_TO_MUSCLES[pattern];
  }
  return [];
}

function computeMuscleDistribution(exercises: any[]): Array<{ muscle: string; percent: number; color: string }> {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const ex of exercises) {
    if (ex?.done === false || ex?.skipped === true) continue;
    const doneSets = (Array.isArray(ex?.sets) ? ex.sets : []).filter((s: any) => s?.done !== false).length;
    if (doneSets === 0) continue;
    const muscles = getMusclesForExercise(ex);
    if (muscles.length === 0) continue;
    const perMuscle = doneSets / muscles.length;
    for (const m of muscles) {
      counts[m] = (counts[m] || 0) + perMuscle;
      total += perMuscle;
    }
  }
  if (total === 0) return [];
  return Object.entries(counts)
    .map(([muscle, count]) => ({
      muscle,
      percent: Math.round((count / total) * 100),
      color: MUSCLE_COLORS[muscle] || "#94A3B8",
    }))
    .sort((a, b) => b.percent - a.percent);
}

// ─── Exercise comparison (per exercise, not per workout) ───────────────────────

type ExerciseDelta = {
  weightDelta: number | null; // kg difference
  repsDelta: number | null;   // reps difference
  effortPrev: string | null;
  curWeight: number | null;
  curReps: number | null;
  curEffort: string | null;
  isFirst: boolean;           // true = no previous data, delta from 0
};

function findPreviousExercise(
  exerciseId: string | undefined,
  history: HistSession[],
  excludeIds: Set<string>
): { medianWeight: number | null; medianReps: number | null; effort: string | null } | null {
  if (!exerciseId) return null;

  for (const session of history) {
    if (excludeIds.size > 0 && excludeIds.has(String(session?.id || ""))) continue;
    const exercises = (session as any)?.exercises ?? session?.items ?? [];
    if (!Array.isArray(exercises)) continue;
    for (const ex of exercises) {
      const exId = ex?.exerciseId || ex?.id || "";
      if (exId !== exerciseId) continue;
      const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
      const weights = sets.filter((s: any) => s?.done !== false).map((s: any) => toNumber(s?.weight)).filter((w): w is number => w != null && w > 0);
      const reps = sets.filter((s: any) => s?.done !== false).map((s: any) => toNumber(s?.reps)).filter((r): r is number => r != null && r > 0);
      return {
        medianWeight: median(weights),
        medianReps: median(reps),
        effort: ex?.effort || null,
      };
    }
  }
  return null;
}

function computeExerciseDelta(
  ex: any,
  history: HistSession[],
  excludeIds: Set<string>
): ExerciseDelta {
  const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
  const curWeights = sets.filter((s: any) => s?.done !== false).map((s: any) => toNumber(s?.weight)).filter((w): w is number => w != null && w > 0);
  const curReps = sets.filter((s: any) => s?.done !== false).map((s: any) => toNumber(s?.reps)).filter((r): r is number => r != null && r > 0);
  const curMedW = median(curWeights);
  const curMedR = median(curReps);
  const curEffort: string | null = ex?.effort || null;

  const prev = findPreviousExercise(ex?.id || ex?.exerciseId, history, excludeIds);

  if (!prev) {
    // First time — delta from 0
    return {
      weightDelta: curMedW,
      repsDelta: curMedR != null ? Math.round(curMedR) : null,
      effortPrev: null,
      curWeight: curMedW,
      curReps: curMedR != null ? Math.round(curMedR) : null,
      curEffort,
      isFirst: true,
    };
  }

  return {
    weightDelta: (curMedW != null && prev.medianWeight != null) ? Math.round((curMedW - prev.medianWeight) * 4) / 4 : null,
    repsDelta: (curMedR != null && prev.medianReps != null) ? Math.round(curMedR - prev.medianReps) : null,
    effortPrev: prev.effort,
    curWeight: curMedW,
    curReps: curMedR != null ? Math.round(curMedR) : null,
    curEffort,
    isFirst: false,
  };
}

// ─── Workout title resolution (matches PlanOne dayLabelRU) ─────────────────────

function resolveWorkoutTitle(payload: any): string {
  if (!payload) return "Тренировка";
  const raw = String(
    payload.dayLabel ||
    payload.title ||
    payload.name ||
    payload.label ||
    payload.scheme_label ||
    ""
  ).trim();
  const idxRaw = Number(payload.dayIndex);
  const idx = Number.isFinite(idxRaw) ? Math.max(0, idxRaw - 1) : 0;
  const splitType = String(payload.splitType || payload.meta?.splitType || "").trim();
  if (raw) {
    const resolved = resolveDayCopy(raw, splitType, idx).title;
    if (/^День\s+\d+/.test(resolved)) return raw;
    return resolved;
  }
  return "Тренировка";
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function WorkoutResult() {
  const nav = useNavigate();
  const location = useLocation();

  const fromState: StoredWorkoutResult | null = (location.state as any)?.result || null;
  const urlSessionId = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search || "");
      const id = sp.get("sessionId");
      return id && id.trim() ? id.trim() : null;
    } catch { return null; }
  }, [location.search]);

  const initial = useMemo(() => {
    const stored = readStored();
    if (fromState && stored) {
      // If stored has the same workout but more data (e.g. sessionId filled by server),
      // prefer it over the potentially stale fromState passed via navigate.
      const sameWorkout =
        (fromState.clientSessionId && fromState.clientSessionId === stored.clientSessionId) ||
        (fromState.createdAt && fromState.createdAt === stored.createdAt);
      if (sameWorkout && stored.sessionId && !fromState.sessionId) return stored;
    }
    return fromState || stored;
  }, [fromState]);
  const [result, setResult] = useState<StoredWorkoutResult | null>(initial);
  const [job, setJob] = useState<ProgressionJob>(initial?.progressionJob ?? null);
  const [summary, setSummary] = useState<any | null>(initial?.progression ?? null);
  const [polling, setPolling] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setContentVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onSaved = () => {
      const fresh = readStored();
      if (!fresh) return;
      setResult(fresh);
      setJob(fresh.progressionJob ?? null);
      setSummary(fresh.progression ?? null);
    };
    window.addEventListener("workout_saved", onSaved);
    return () => window.removeEventListener("workout_saved", onSaved);
  }, []);

  useEffect(() => {
    if (result) return;
    if (!urlSessionId) return;
    let canceled = false;
    void (async () => {
      try {
        const data = await getWorkoutSessionById(urlSessionId);
        if (canceled) return;
        const next: StoredWorkoutResult = {
          version: 1, createdAt: new Date().toISOString(),
          sessionId: data?.session?.id || urlSessionId, plannedWorkoutId: null,
          payload: data?.session?.payload ?? null,
          progression: data?.progressionJob?.result ?? null,
          progressionJob: data?.progressionJob?.id
            ? { id: String(data.progressionJob.id), status: String(data.progressionJob.status || "pending"), lastError: data.progressionJob.lastError ?? null }
            : null,
          coachJob: null, coachReport: null,
        };
        setResult(next); setJob(next.progressionJob ?? null); setSummary(next.progression ?? null);
      } catch { }
    })();
    return () => { canceled = true; };
  }, [result, urlSessionId]);

  useEffect(() => {
    if (!result) return;
    // Don't overwrite storage with stale data — only write if we have at least as much info
    const stored = readStored();
    if (stored?.sessionId && !result.sessionId &&
        stored.clientSessionId === result.clientSessionId) return;
    writeStored(result);
  }, [result]);

  const jobId = job?.id ? String(job.id) : null;
  const needsPoll = Boolean(jobId && (!summary || job?.status !== "done") && job?.status !== "failed");

  const pollOnce = async (): Promise<{ status?: string; result?: any | null } | null> => {
    if (!jobId) return null;
    const res = await getProgressionJob(jobId);
    const j = res?.job;
    if (j?.status) setJob({ id: jobId, status: String(j.status), lastError: j.lastError ?? null });
    if (j?.status === "done" && j?.result) setSummary(j.result);
    return j ? { status: j.status, result: j.result } : null;
  };

  useEffect(() => {
    if (!result || !needsPoll || polling) return;
    setPolling(true);
    let canceled = false;
    void (async () => {
      for (let i = 0; i < 10; i++) {
        if (canceled) break;
        await new Promise((r) => setTimeout(r, 900 + Math.round(Math.random() * 900)));
        try {
          const j = await pollOnce();
          if (String(j?.status || "").toLowerCase() === "done" || String(j?.status || "").toLowerCase() === "failed") break;
        } catch { }
      }
      if (!canceled) setPolling(false);
    })();
    return () => { canceled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, needsPoll]);

  useEffect(() => {
    if (!result) return;
    setJob(result.progressionJob ?? null);
    setSummary(result.progression ?? null);
  }, [result?.createdAt]);

  useEffect(() => {
    if (!result) return;
    setResult((prev) => {
      if (!prev) return prev;
      return { ...prev, progressionJob: job, progression: summary };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.lastError, summary]);

  if (!result) {
    return (
      <div style={page.outer}><div style={page.inner}>
        <div style={s.glassCard}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>Результат тренировки</div>
          <div style={{ fontSize: 15, color: "rgba(15,23,42,0.55)", marginTop: 8 }}>Нет данных о последней тренировке.</div>
          <button style={{ ...s.primaryBtn, marginTop: 16 }} className="result-primary-btn" onClick={() => nav("/")}>
            <span style={s.primaryBtnText}>На главную</span>
            <span style={s.primaryBtnCircle} aria-hidden><span style={{ fontSize: 20, lineHeight: 1, color: "#0f172a", fontWeight: 700 }}>→</span></span>
          </button>
        </div>
      </div></div>
    );
  }

  return (
    <ResultContent result={result} contentVisible={contentVisible} nav={nav} />
  );
}

// ─── Result Content ────────────────────────────────────────────────────────────

function ResultContent({ result, contentVisible, nav }: { result: StoredWorkoutResult; contentVisible: boolean; nav: any }) {
  const payloadExercises: Array<any> = Array.isArray(result.payload?.exercises) ? result.payload.exercises : [];
  const durationMin: number | null = toNumber(result.payload?.durationMin);
  const totalExercises = payloadExercises.length;
  const exerciseCount = payloadExercises.filter((ex: any) => ex?.done !== false && ex?.skipped !== true).length;
  const workoutTitle = resolveWorkoutTitle(result.payload);

  // Completion %
  const completionPct = useMemo(() => {
    let totalSets = 0, doneSets = 0;
    for (const ex of payloadExercises) {
      const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
      totalSets += sets.length;
      doneSets += sets.filter((s: any) => Boolean(s?.done)).length;
    }
    return totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 100;
  }, [payloadExercises]);

  // Tonnage & calories
  const { tonnage, calories, showCalories } = useMemo(() => {
    let ton = 0;
    for (const ex of payloadExercises) {
      const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
      for (const set of sets) {
        if (!set?.done) continue;
        const w = toNumber(set?.weight) ?? 0;
        const r = toNumber(set?.reps) ?? 0;
        if (w > 0 && r > 0) ton += w * r;
      }
    }
    const dur = durationMin ?? 30;
    const kcal = Math.round(dur * 6);
    return { tonnage: Math.round(ton), calories: kcal, showCalories: ton === 0 };
  }, [payloadExercises, durationMin]);

  // History
  const [history, setHistory] = useState(() => loadHistory());

  // Session number: from stored field or count from history
  const sessionNumber = useMemo(() => {
    if (typeof result.sessionNumber === "number" && result.sessionNumber > 0) return result.sessionNumber;
    // Count all sessions in history — this session is one of them
    return history.length > 0 ? history.length : 1;
  }, [result.sessionNumber, history.length]);
  useEffect(() => {
    const reload = () => setHistory(loadHistory());
    const onStorage = (e: StorageEvent) => { if (e.key === "history_sessions_v1") reload(); };
    window.addEventListener("workout_saved", reload);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("workout_saved", reload); window.removeEventListener("storage", onStorage); };
  }, []);

  // Average effort
  const avgEffort = useMemo(() => avgEffortLabel(payloadExercises), [payloadExercises]);

  // Muscle distribution
  const muscleDistribution = useMemo(() => computeMuscleDistribution(payloadExercises), [payloadExercises]);

  // RPE bar chart data
  const EFFORT_LEVEL: Record<string, number> = { easy: 1, working: 2, quite_hard: 3, hard: 4, max: 5 };
  const EFFORT_COLOR: Record<string, string> = {
    easy: "#3B82F6", working: "#10B981", quite_hard: "#F59E0B", hard: "#F97316", max: "#EF4444",
  };
  const EFFORT_LABELS: Record<string, string> = {
    easy: "Слишком легко", working: "В самый раз", quite_hard: "Тяжеловато",
    hard: "Очень тяжело", max: "На пределе",
  };
  const effortBars = useMemo(() => {
    return payloadExercises.map((ex: any) => {
      const name = String(ex?.name || ex?.exerciseName || "Упражнение");
      const shortName = name.length > 14 ? name.slice(0, 13) + "…" : name;
      const effort: string | null = ex?.effort || null;
      const level = effort ? (EFFORT_LEVEL[effort] ?? 0) : 0;
      const color = effort ? (EFFORT_COLOR[effort] ?? "#d1d5db") : "#d1d5db";
      return { name: shortName, level, color, hasEffort: level > 0 };
    });
  }, [payloadExercises]);
  const usedEffortKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const ex of payloadExercises) {
      if (ex?.effort && EFFORT_LEVEL[ex.effort]) keys.add(ex.effort);
    }
    return Array.from(keys).sort((a, b) => EFFORT_LEVEL[a] - EFFORT_LEVEL[b]);
  }, [payloadExercises]);

  // Both IDs needed: clientSessionId (before reconcile) and sessionId (after reconcile).
  const excludeIds = useMemo(() => {
    const ids = new Set<string>();
    if (result.clientSessionId) ids.add(result.clientSessionId);
    if (result.sessionId) ids.add(result.sessionId);
    return ids;
  }, [result.clientSessionId, result.sessionId]);

  // Exercise deltas (only exercises with weight or reps changes)
  const exerciseDeltas = useMemo(() => {
    return payloadExercises
      .filter((ex: any) => ex?.done !== false && ex?.skipped !== true)
      .map((ex: any) => ({
        name: String(ex?.name || ex?.exerciseName || "Упражнение"),
        delta: computeExerciseDelta(ex, history, excludeIds),
      }))
      .filter(item => {
        const d = item.delta;
        return (d.weightDelta != null && d.weightDelta !== 0) || (d.repsDelta != null && d.repsDelta !== 0);
      });
  }, [payloadExercises, history, excludeIds]);

  // Haptic on mount
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return; firedRef.current = true;
    const t = setTimeout(() => haptic(), 300);
    return () => clearTimeout(t);
  }, []);

  const fadeStyle = (delayMs: number): CSSProperties => ({
    opacity: contentVisible ? 1 : 0,
    transform: contentVisible ? "translateY(0)" : "translateY(12px)",
    transition: `opacity 420ms ease ${delayMs}ms, transform 420ms ease ${delayMs}ms`,
  });

  // Date formatting
  const dateStr = new Date(result.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  return (
    <div style={page.outer}>
      <style>{`
        .result-primary-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; transition: transform 160ms ease, box-shadow 160ms ease; }
        .result-primary-btn:active:not(:disabled) { transform: translateY(1px) scale(0.99) !important; }
        .result-secondary-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .result-secondary-btn:active { transform: translateY(1px) !important; color: rgba(17,24,39,0.72) !important; }
      `}</style>
      <div style={page.inner}>

        {/* ── 1. Header: Avatar + Title ──────────────────────────── */}
        <div style={{ ...fadeStyle(0) }}>
          <div style={s.headerRow}>
            <div style={s.headerLeft}>
              <div style={s.avatarCircle}>
                <img src={mascotImg} alt="Моро" style={s.mascotAvatarImg} loading="eager" decoding="async" draggable={false} />
              </div>
              <div style={s.headerTextBlock}>
                <div style={s.headerTitle}>
                  {workoutTitle}
                </div>
                <div style={s.headerSubRow}>
                  <span style={s.headerSubChip}>
                    <Zap size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                    <span>{sessionNumber}-я тренировка</span>
                  </span>
                  <span style={s.headerSubChip}>
                    <Calendar size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                    <span>{dateStr}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Stat Pill (dark embossed) ─────────────────────── */}
        <div style={{ ...s.statPill, ...fadeStyle(60) }}>
          <span style={s.statChip}>
            <CircleCheckBig size={15} strokeWidth={2.5} color="rgba(255,255,255,0.88)" />
            <span>{completionPct}%</span>
          </span>
          <span style={s.statChip}>
            <Clock3 size={15} strokeWidth={2.5} color="rgba(255,255,255,0.88)" />
            <span>{durationMin ?? "—"} мин</span>
          </span>
          <span style={s.statChip}>
            {showCalories
              ? <Flame size={15} strokeWidth={2.5} color="rgba(255,255,255,0.88)" />
              : <Dumbbell size={15} strokeWidth={2.5} color="rgba(255,255,255,0.88)" />}
            <span>{showCalories ? `~${calories} ккал` : `${tonnage.toLocaleString("ru-RU")} кг`}</span>
          </span>
        </div>

        {/* ── 3. Muscle Distribution ────────────────────────────── */}
        {muscleDistribution.length > 0 && (
          <div style={{ ...s.glassCard, ...fadeStyle(120) }}>
            <div style={{ ...s.muscleTitle, display: "flex", alignItems: "center", gap: 6 }}>
              <Flame size={18} strokeWidth={2.5} color="#0f172a" />
              Какие мышцы работали
            </div>
            <div style={s.muscleBar}>
              {muscleDistribution.map((m, i) => (
                <div key={i} style={{ ...s.muscleBarSegment, width: `${Math.max(m.percent, 2)}%`, background: m.color }} />
              ))}
            </div>
            <div style={s.muscleLegend}>
              {muscleDistribution.map((m, i) => (
                <div key={i} style={s.legendItem}>
                  <div style={{ ...s.legendDot, background: m.color }} />
                  <span style={s.legendText}>{m.muscle} {m.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 3.5. RPE Bar Chart ───────────────────────────── */}
        {effortBars.some(b => b.hasEffort) && (() => {
          // Calculate average effort
          const efforts = effortBars.filter(b => b.hasEffort);
          const avgLevel = efforts.reduce((sum, b) => sum + b.level, 0) / efforts.length;
          const avgPercent = avgLevel > 0 ? (avgLevel / 5) * 100 : 0;

          let avgLabelStr = "Нет данных";
          let avgColor = "#94A3B8";
          if (avgLevel > 0) {
            const nearestLevel = Math.round(avgLevel);
            const key = Object.keys(EFFORT_LEVEL).find(k => EFFORT_LEVEL[k] === nearestLevel) || "working";
            avgLabelStr = EFFORT_LABELS[key] || "Нормально";
            avgColor = EFFORT_COLOR[key] || "#10B981";
          }

          return (
            <div style={{ ...s.glassCard, ...fadeStyle(150), paddingBottom: 24, paddingTop: 18 }}>
              <div style={{ ...s.muscleTitle, display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={18} strokeWidth={2.5} color="#0f172a" />
                Как ощущалась нагрузка
              </div>
              <div style={{ position: "relative", height: 160, width: "100%", marginTop: 24 }}>

                {/* Columns Area (Left 70%) */}
                <div style={{
                  position: "absolute", left: 0, bottom: 0, top: 0, width: "70%",
                  display: "flex", alignItems: "flex-end", gap: 6
                }}>
                  {effortBars.map((bar, i) => (
                    <div key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <div style={{ ...s.progressCtaBarTrack, width: "100%" }}>
                        {bar.hasEffort && (
                          <div style={{
                            ...s.progressCtaBarFill,
                            height: `${(bar.level / 5) * 100}%`,
                          }} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Average Dashed Line */}
                <div style={{
                  position: "absolute", left: 0, right: 0, bottom: `${avgPercent}%`,
                  borderBottom: `2px dashed rgba(15, 23, 42, 0.4)`,
                  zIndex: 2,
                }} />

                {/* Average Text (Right 30%, above line) */}
                <div style={{
                  position: "absolute", left: "70%", bottom: `calc(${avgPercent}% + 8px)`,
                  width: "30%", textAlign: "left", display: "flex", flexDirection: "column", gap: 2, paddingLeft: 12,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)", lineHeight: 1.45 }}>
                    {avgLabelStr}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)", lineHeight: 1.45 }}>
                    в среднем
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

        {/* ── 3.7. Exercise Progress ──────────────────────────── */}
        {exerciseDeltas.length > 0 && (
          <div style={{ ...s.glassCard, ...fadeStyle(165), paddingBottom: 24, paddingTop: 18 }}>
            <div style={{ ...s.muscleTitle, display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingUp size={18} strokeWidth={2.5} color="#0f172a" />
              Прогресс по упражнениям
            </div>
            <div style={{ marginTop: 24 }}>
              {exerciseDeltas.map((item, idx) => {
                const d = item.delta;
                const EFFORT_SHORT: Record<string, string> = {
                  easy: "Легко", working: "В самый раз", quite_hard: "Тяжеловато", hard: "Очень тяжело", max: "На пределе",
                };
                const hasWeightDelta = d.weightDelta != null && d.weightDelta !== 0;
                const hasRepsDelta = d.repsDelta != null && d.repsDelta !== 0;

                return (
                  <div key={idx}>
                    {idx > 0 && <div style={s.exDivider} />}
                    <div style={s.exRow}>
                      <div style={s.exName}>{item.name}</div>
                      <div style={s.exChips}>
                        {/* Weight */}
                        {d.curWeight != null && (
                          <span style={s.exChip}>
                            <Dumbbell size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            <span>{d.curWeight} кг</span>
                            {hasWeightDelta && (
                              <span style={{ ...s.exDelta, color: d.weightDelta! > 0 ? "#16A34A" : "#EF4444" }}>
                                {d.weightDelta! > 0 ? "+" : ""}{d.weightDelta}
                              </span>
                            )}
                          </span>
                        )}
                        {/* Reps */}
                        {d.curReps != null && (
                          <span style={s.exChip}>
                            <Repeat size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            <span>{d.curReps}</span>
                            {hasRepsDelta && (
                              <span style={{ ...s.exDelta, color: d.repsDelta! > 0 ? "#16A34A" : "#EF4444" }}>
                                {d.repsDelta! > 0 ? "+" : ""}{d.repsDelta}
                              </span>
                            )}
                          </span>
                        )}
                        {/* RPE — always show current, no delta */}
                        {d.curEffort && (
                          <span style={s.exChip}>
                            <Activity size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            <span>{EFFORT_SHORT[d.curEffort] || d.curEffort}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* bottom spacer for sticky button */}
        <div style={{ height: 90 }} />
      </div>

      {/* ── 6. Sticky Buttons ───────────────────────────────────── */}
      <div style={s.stickyWrap}>
        <div style={s.stickyInner}>
          <button style={s.primaryBtn} className="intro-primary-btn ws-primary-btn result-primary-btn"
            onClick={() => { try { localStorage.removeItem(LAST_RESULT_KEY); } catch { } nav("/"); }}>
            <span style={s.primaryBtnText}>На главную</span>
            <span style={s.primaryBtnCircle} aria-hidden>
              <span style={{ fontSize: 20, lineHeight: 1, color: "#0f172a", fontWeight: 700 }}>→</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const page: Record<string, CSSProperties> = {
  outer: { minHeight: "100vh", width: "100%", padding: "16px 16px 0" },
  inner: {
    maxWidth: 720, margin: "0 auto",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    display: "flex", flexDirection: "column", gap: 14,
    padding: "calc(env(safe-area-inset-top, 0px)) 0 0",
  },
};

const s: Record<string, CSSProperties> = {
  // ── Header (matched to Dashboard)
  headerRow: {
    display: "flex", alignItems: "center", gap: 12,
    marginTop: 8, marginBottom: 12,
  },
  headerLeft: {
    display: "flex", alignItems: "center", gap: 12, minWidth: 0,
  },
  avatarCircle: {
    width: DASH_AVATAR_SIZE, height: DASH_AVATAR_SIZE, borderRadius: 999,
    border: "none",
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", flex: "0 0 auto", padding: 2,
  },
  mascotAvatarImg: {
    width: "100%", height: "100%",
    objectFit: "cover" as const, objectPosition: "center 10%",
    borderRadius: 999,
  },
  headerTextBlock: {
    display: "flex", flexDirection: "column", minWidth: 0,
  },
  headerTitle: {
    fontSize: 18, fontWeight: 700, color: "#1e1f22", lineHeight: 1.2,
  },
  headerSubRow: {
    display: "flex", alignItems: "center", gap: 16, marginTop: 3, flexWrap: "wrap" as const,
  },
  headerSubChip: {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)", lineHeight: 1.45,
  },
  headerSubDot: {
    fontSize: 14, color: "rgba(30,31,34,0.3)", lineHeight: 1,
  },

  // ── Stat Pill
  statPill: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    borderRadius: 24, padding: "14px 18px",
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow: "0 16px 32px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.08)",
  } as CSSProperties,
  statChip: {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 15, fontWeight: 600, lineHeight: 1.25,
    color: "rgba(255,255,255,0.88)",
  },

  // ── Glass Card
  glassCard: {
    borderRadius: 24, padding: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
  } as CSSProperties,

  // ── Muscle Distribution
  muscleTitle: {
    fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.2, marginBottom: 14,
  },
  muscleBar: {
    display: "flex", height: 16, borderRadius: 10, overflow: "hidden", width: "100%", background: "#F1F5F9",
  },
  muscleBarSegment: {
    height: "100%", transition: "width 600ms ease",
  },
  muscleLegend: {
    display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12,
  },
  legendItem: {
    display: "flex", alignItems: "center", gap: 5,
  },
  legendDot: {
    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
  },
  legendText: {
    fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)", lineHeight: 1.45,
  },

  // ── RPE Bar Chart
  rpeChartWrap: {
    display: "flex", gap: 6, alignItems: "flex-end", height: 140,
  },
  progressCtaBarTrack: {
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 4px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    position: "relative",
    overflow: "hidden",
    display: "inline-flex",
    alignItems: "flex-end",
    height: "100%",
  } as CSSProperties,
  progressCtaBarFill: {
    width: "100%",
    borderRadius: 999,
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow:
      "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
    transition: "height 600ms ease",
  } as CSSProperties,
  rpeLegend: {
    display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14,
  } as CSSProperties,
  rpeLegendItem: {
    display: "flex", alignItems: "center", gap: 5,
  },
  rpeLegendDot: {
    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
  },
  rpeLegendText: {
    fontSize: 12.5, fontWeight: 600, color: "rgba(15,23,42,0.55)", lineHeight: 1,
  },

  // ── Exercise Progress
  exDivider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    margin: "12px 0",
  },
  exRow: {
    display: "flex", flexDirection: "column", gap: 8,
  },
  exName: {
    fontSize: 15, fontWeight: 600, color: "#1e1f22", lineHeight: 1.25,
  },
  exChips: {
    display: "flex", flexWrap: "wrap", gap: 12,
  },
  exChip: {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 14, fontWeight: 400, color: "rgba(15,23,42,0.62)", lineHeight: 1.45,
  },
  exDelta: {
    fontSize: 11, fontWeight: 600, lineHeight: 1,
    position: "relative", top: -3,
  } as CSSProperties,
  // ── Buttons
  stickyWrap: {
    position: "fixed", left: 0, right: 0, bottom: 0,
    zIndex: 30,
    padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 10px)",
    background: "linear-gradient(to top, rgba(245,245,247,1) 70%, rgba(245,245,247,0))", // workoutTheme.dockFade
  } as CSSProperties,
  stickyInner: {
    width: "100%", maxWidth: 720, margin: "0 auto", display: "grid", gap: 8, boxSizing: "border-box",
  },
  primaryBtn: {
    width: "fit-content", maxWidth: "100%", justifySelf: "center",
    display: "inline-flex", alignItems: "center", gap: 12,
    height: 56, minHeight: 56, padding: "0 14px",
    borderRadius: 999, border: "1px solid #1e1f22", background: "#1e1f22", color: "#fff",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)", cursor: "pointer",
    transition: "transform 160ms ease, opacity 250ms ease",
    fontSize: 18, fontWeight: 500,
  },
  primaryBtnText: {
    whiteSpace: "nowrap" as const, fontSize: 18, fontWeight: 500, lineHeight: 1, color: "#fff",
  },
  primaryBtnCircle: {
    width: 40, height: 40, borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)", // workoutTheme.pillBg
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    marginRight: -6,
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)", // workoutTheme.pillShadow
    color: "#0f172a", flexShrink: 0,
  },
};

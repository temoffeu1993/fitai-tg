import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getProgressionJob, getWorkoutSessionById } from "@/api/plan";
import { Clock3, Dumbbell, ChevronUp, ChevronDown, Activity, Trophy, ArrowRight, Zap, Calendar, CircleCheckBig, Flame } from "lucide-react";
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

function normalizeNameKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\wа-яa-z]/g, "");
}

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

// ─── PR Detection ──────────────────────────────────────────────────────────────

type PR = { name: string; weight: number; reps: number; type: "weight" | "reps" | "first"; tonnage?: number };

function detectPRs(
  currentExercises: any[],
  history: HistSession[],
  currentSessionId: string | null
): PR[] {
  const hasHistory = history.some(s => currentSessionId ? String(s?.id || "") !== currentSessionId : true);

  if (!hasHistory || history.length <= 1) {
    // First workout — find exercise with highest tonnage as "Первый рекорд"
    let bestEx: PR | null = null;
    let bestTonnage = 0;
    for (const ex of currentExercises) {
      if (ex?.done === false || ex?.skipped === true) continue;
      const name = String(ex?.name || ex?.exerciseName || "");
      if (!name) continue;
      const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
      let tonnage = 0;
      let maxW = 0;
      let maxR = 0;
      for (const set of sets) {
        if (set?.done === false) continue;
        const w = toNumber(set?.weight) ?? 0;
        const r = toNumber(set?.reps) ?? 0;
        if (w > maxW) maxW = w;
        if (r > maxR) maxR = r;
        tonnage += w * r;
      }
      if (tonnage > bestTonnage) {
        bestTonnage = tonnage;
        bestEx = { name, weight: maxW, reps: maxR, type: "first", tonnage };
      }
    }
    return bestEx ? [bestEx] : [];
  }

  // Normal PR detection
  const prs: PR[] = [];
  const bestWeight = new Map<string, number>();
  const bestReps = new Map<string, number>();
  for (const session of history) {
    if (currentSessionId && String(session?.id || "") === currentSessionId) continue;
    const exercises = (session as any)?.exercises ?? session?.items ?? [];
    if (!Array.isArray(exercises)) continue;
    for (const ex of exercises) {
      const key = normalizeNameKey(ex?.name || ex?.exerciseName || "");
      if (!key) continue;
      const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
      for (const set of sets) {
        const w = toNumber(set?.weight);
        const r = toNumber(set?.reps);
        if (w != null && w > 0) bestWeight.set(key, Math.max(bestWeight.get(key) ?? 0, w));
        if (r != null && r > 0) bestReps.set(key, Math.max(bestReps.get(key) ?? 0, r));
      }
    }
  }
  for (const ex of currentExercises) {
    if (ex?.done === false || ex?.skipped === true) continue;
    const name = String(ex?.name || ex?.exerciseName || "");
    const key = normalizeNameKey(name);
    if (!key || !name) continue;
    const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
    let maxW = 0; let maxR = 0;
    for (const set of sets) {
      if (set?.done === false) continue;
      const w = toNumber(set?.weight) ?? 0;
      const r = toNumber(set?.reps) ?? 0;
      if (w > maxW) maxW = w;
      if (r > maxR) maxR = r;
    }
    const prevBestW = bestWeight.get(key) ?? 0;
    const prevBestR = bestReps.get(key) ?? 0;
    if (maxW > prevBestW && prevBestW > 0) {
      prs.push({ name, weight: maxW, reps: maxR, type: "weight" });
    } else if (maxR > prevBestR && prevBestR > 0 && maxW >= prevBestW) {
      prs.push({ name, weight: maxW, reps: maxR, type: "reps" });
    }
  }
  return prs.slice(0, 5);
}

// ─── Exercise comparison (per exercise, not per workout) ───────────────────────

type ExerciseDelta = {
  weightDelta: number | null; // kg difference
  repsDelta: number | null;   // reps difference
  effortPrev: string | null;
};

function findPreviousExercise(
  exerciseName: string,
  history: HistSession[],
  currentSessionId: string | null
): { medianWeight: number | null; medianReps: number | null; effort: string | null } | null {
  const key = normalizeNameKey(exerciseName);
  if (!key) return null;

  for (const session of history) {
    if (currentSessionId && String(session?.id || "") === currentSessionId) continue;
    const exercises = (session as any)?.exercises ?? session?.items ?? [];
    if (!Array.isArray(exercises)) continue;
    for (const ex of exercises) {
      const exKey = normalizeNameKey(ex?.name || ex?.exerciseName || "");
      if (exKey !== key) continue;
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
  currentSessionId: string | null
): ExerciseDelta {
  const prev = findPreviousExercise(ex?.name || ex?.exerciseName || "", history, currentSessionId);
  if (!prev) return { weightDelta: null, repsDelta: null, effortPrev: null };

  const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
  const curWeights = sets.filter((s: any) => s?.done !== false).map((s: any) => toNumber(s?.weight)).filter((w): w is number => w != null && w > 0);
  const curReps = sets.filter((s: any) => s?.done !== false).map((s: any) => toNumber(s?.reps)).filter((r): r is number => r != null && r > 0);

  const curMedW = median(curWeights);
  const curMedR = median(curReps);

  return {
    weightDelta: (curMedW != null && prev.medianWeight != null) ? Math.round((curMedW - prev.medianWeight) * 4) / 4 : null,
    repsDelta: (curMedR != null && prev.medianReps != null) ? Math.round(curMedR - prev.medianReps) : null,
    effortPrev: prev.effort,
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

  const initial = useMemo(() => fromState || readStored(), [fromState]);
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

  useEffect(() => { if (result) writeStored(result); }, [result]);

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

  // PRs
  const prs = useMemo(() => detectPRs(payloadExercises, history, result.sessionId), [payloadExercises, history, result.sessionId]);

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
                    <Zap size={13} strokeWidth={2.2} color="rgba(30,31,34,0.45)" />
                    <span>{sessionNumber}-я тренировка</span>
                  </span>
                  <span style={s.headerSubChip}>
                    <Calendar size={13} strokeWidth={2.2} color="rgba(30,31,34,0.45)" />
                    <span>{dateStr}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Stat Pill ────────────────────────────────────── */}
        <div style={{ ...s.statPill, ...fadeStyle(60) }}>
          <span style={s.statChip}>
            <CircleCheckBig size={14} strokeWidth={2.2} color="rgba(30,31,34,0.45)" />
            <span>{completionPct}%</span>
          </span>
          <span style={s.statChip}>
            <Clock3 size={14} strokeWidth={2.2} color="rgba(30,31,34,0.45)" />
            <span>{durationMin ?? "—"} мин</span>
          </span>
          <span style={s.statChip}>
            {showCalories
              ? <Flame size={14} strokeWidth={2.2} color="rgba(30,31,34,0.45)" />
              : <Dumbbell size={14} strokeWidth={2.2} color="rgba(30,31,34,0.45)" />}
            <span>{showCalories ? `~${calories} ккал` : `${tonnage.toLocaleString("ru-RU")} кг`}</span>
          </span>
        </div>

        {/* ── 3. Muscle Distribution ────────────────────────────── */}
        {muscleDistribution.length > 0 && (
          <div style={{ ...s.glassCard, ...fadeStyle(120) }}>
            <div style={s.muscleTitle}>Какие мышцы работали</div>
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
        {effortBars.some(b => b.hasEffort) && (
          <div style={{ ...s.glassCard, ...fadeStyle(150) }}>
            <div style={s.muscleTitle}>Как ощущалась нагрузка</div>
            <div style={s.rpeChartWrap}>
              {effortBars.map((bar, i) => (
                <div key={i} style={s.rpeBarCol}>
                  <div style={s.rpeBarGroove}>
                    {bar.hasEffort && (
                      <div style={{
                        ...s.rpeBarFill,
                        height: `${(bar.level / 5) * 100}%`,
                        background: bar.color,
                      }} />
                    )}
                    <span style={s.rpeBarLabel}>{bar.name}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={s.rpeLegend}>
              {usedEffortKeys.map(key => (
                <div key={key} style={s.rpeLegendItem}>
                  <div style={{ ...s.rpeLegendDot, background: EFFORT_COLOR[key] }} />
                  <span style={s.rpeLegendText}>{EFFORT_LABELS[key]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 4. Record ─────────────────────────────────────────── */}
        {prs.length > 0 && (
          <div style={{ ...s.glassCard, ...fadeStyle(180) }}>
            <div style={s.recordHeader}>
              <Trophy size={32} strokeWidth={2} color="#F59E0B" />
              <div style={s.recordHeaderText}>
                <div style={s.recordTitle}>
                  {prs[0].type === "first" ? "Первый рекорд!" : prs[0].type === "weight" ? "Новый рекорд веса!" : "Рекорд повторений!"}
                </div>
                <div style={s.recordSubtitle}>{prs[0].name}</div>
              </div>
            </div>
            <div style={s.recordValues}>
              {prs[0].weight > 0 && (
                <div style={s.recordChip}>
                  <span style={s.recordChipValue}>{prs[0].weight}</span>
                  <span style={s.recordChipUnit}>кг</span>
                </div>
              )}
              {prs[0].reps > 0 && (
                <div style={s.recordChip}>
                  <span style={s.recordChipValue}>{prs[0].reps}</span>
                  <span style={s.recordChipUnit}>повт</span>
                </div>
              )}
            </div>
            {prs.length > 1 && (
              <div style={s.recordExtra}>
                {prs.slice(1).map((pr, i) => (
                  <div key={i} style={s.recordExtraRow}>
                    <Trophy size={16} strokeWidth={2} color="#F59E0B" style={{ flexShrink: 0 }} />
                    <span style={s.recordExtraName}>{pr.name}</span>
                    <span style={s.recordExtraVal}>
                      {pr.type === "weight" ? `${pr.weight} кг` : `${pr.reps} повт`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 5. Exercise Details ────────────────────────────────── */}
        <div style={{ ...fadeStyle(240) }}>
          {payloadExercises.map((ex: any, idx: number) => {
            if (ex?.skipped === true) return null;
            const name = String(ex?.name || ex?.exerciseName || `Упражнение ${idx + 1}`);
            const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
            const doneSets = sets.filter((s: any) => s?.done !== false);
            const weights = doneSets.map((s: any) => toNumber(s?.weight)).filter((w): w is number => w != null && w > 0);
            const reps = doneSets.map((s: any) => toNumber(s?.reps)).filter((r): r is number => r != null && r > 0);
            const medW = median(weights);
            const medR = median(reps);
            const effort = effortLabel(ex?.effort);
            const delta = computeExerciseDelta(ex, history, result.sessionId);

            return (
              <div key={idx} style={s.exerciseCard}>
                <div style={s.exerciseName}>{name}</div>
                <div style={s.exerciseChipsRow}>
                  <span style={s.exerciseChip}>{doneSets.length} {pluralSets(doneSets.length)}</span>
                  {medW != null && (
                    <span style={s.exerciseChip}>
                      {medW % 1 === 0 ? medW : medW.toFixed(1)} кг
                      {delta.weightDelta != null && delta.weightDelta !== 0 && (
                        <span style={{ ...s.delta, color: delta.weightDelta > 0 ? "#16a34a" : "#dc2626" }}>
                          {delta.weightDelta > 0 ? <ChevronUp size={12} strokeWidth={3} style={{ verticalAlign: "middle", marginBottom: 1 }} /> : <ChevronDown size={12} strokeWidth={3} style={{ verticalAlign: "middle", marginBottom: 1 }} />}
                          {Math.abs(delta.weightDelta)}
                        </span>
                      )}
                    </span>
                  )}
                  {medR != null && (
                    <span style={s.exerciseChip}>
                      {Math.round(medR)} повт
                      {delta.repsDelta != null && delta.repsDelta !== 0 && (
                        <span style={{ ...s.delta, color: delta.repsDelta > 0 ? "#16a34a" : "#dc2626" }}>
                          {delta.repsDelta > 0 ? <ChevronUp size={12} strokeWidth={3} style={{ verticalAlign: "middle", marginBottom: 1 }} /> : <ChevronDown size={12} strokeWidth={3} style={{ verticalAlign: "middle", marginBottom: 1 }} />}
                          {Math.abs(delta.repsDelta)}
                        </span>
                      )}
                    </span>
                  )}
                  {effort && (
                    <span style={s.exerciseChipEffort}>
                      {effort}
                      {delta.effortPrev && delta.effortPrev !== ex?.effort && (
                        <span style={s.effortDelta}>← {effortLabel(delta.effortPrev)}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* bottom spacer */}
        <div style={{ height: 140 }} />
      </div>

      {/* ── 6. Sticky Buttons ───────────────────────────────────── */}
      <div style={s.stickyWrap}>
        <div style={s.stickyInner}>
          <button style={s.primaryBtn} className="result-primary-btn"
            onClick={() => { try { localStorage.removeItem(LAST_RESULT_KEY); } catch { } nav("/"); }}>
            <span style={s.primaryBtnText}>На главную</span>
            <span style={s.primaryBtnCircle} aria-hidden>
              <span style={{ fontSize: 20, lineHeight: 1, color: "#0f172a", fontWeight: 700 }}>→</span>
            </span>
          </button>
          <button style={s.secondaryBtn} className="result-secondary-btn" onClick={() => nav("/progress")}>
            Прогресс
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
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 14, fontWeight: 500, color: "rgba(30,31,34,0.55)", lineHeight: 1,
  },
  headerSubDot: {
    fontSize: 14, color: "rgba(30,31,34,0.3)", lineHeight: 1,
  },

  // ── Stat Pill
  statPill: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    borderRadius: 24, padding: "14px 18px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
  } as CSSProperties,
  statChip: {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 14, fontWeight: 500, color: "rgba(30,31,34,0.55)", lineHeight: 1,
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
    fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: -0.2, marginBottom: 14,
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
    fontSize: 12.5, fontWeight: 600, color: "rgba(15,23,42,0.55)", lineHeight: 1,
  },

  // ── RPE Bar Chart
  rpeChartWrap: {
    display: "flex", gap: 6, alignItems: "flex-end", height: 140,
  },
  rpeBarCol: {
    flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%",
  } as CSSProperties,
  rpeBarGroove: {
    position: "relative", width: "100%", height: "100%",
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    overflow: "hidden",
    display: "flex", flexDirection: "column", justifyContent: "flex-end",
  } as CSSProperties,
  rpeBarFill: {
    width: "100%", borderRadius: 999,
    transition: "height 600ms ease",
  },
  rpeBarLabel: {
    position: "absolute", inset: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    writingMode: "vertical-rl" as const,
    textOrientation: "mixed" as const,
    fontSize: 11, fontWeight: 700,
    color: "#ffffff",
    pointerEvents: "none", zIndex: 1,
    letterSpacing: 0.3,
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

  // ── Record
  recordHeader: {
    display: "flex", alignItems: "center", gap: 14,
  },
  recordHeaderText: {
    flex: 1, minWidth: 0,
  },
  recordTitle: {
    fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: -0.2,
  },
  recordSubtitle: {
    fontSize: 14, fontWeight: 600, color: "rgba(15,23,42,0.55)", marginTop: 2,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
  },
  recordValues: {
    display: "flex", gap: 10, marginTop: 14,
  },
  recordChip: {
    display: "flex", alignItems: "baseline", gap: 3,
    padding: "8px 14px", borderRadius: 14,
    background: "linear-gradient(180deg, rgba(253,230,138,0.35) 0%, rgba(254,243,199,0.25) 100%)",
    border: "1px solid rgba(245,158,11,0.2)",
  },
  recordChipValue: {
    fontSize: 24, fontWeight: 900, color: "#92400e", lineHeight: 1,
  },
  recordChipUnit: {
    fontSize: 14, fontWeight: 600, color: "#b45309",
  },
  recordExtra: {
    display: "flex", flexDirection: "column", gap: 8, marginTop: 14,
    borderTop: "1px solid rgba(15,23,42,0.06)", paddingTop: 12,
  },
  recordExtraRow: {
    display: "flex", alignItems: "center", gap: 8,
  },
  recordExtraName: {
    flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "#334155",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
  },
  recordExtraVal: {
    fontSize: 14, fontWeight: 800, color: "#92400e", flexShrink: 0,
  },

  // ── Exercise Details
  exerciseCard: {
    padding: "14px 0",
    borderBottom: "1px solid rgba(15,23,42,0.06)",
  },
  exerciseName: {
    fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 8,
  },
  exerciseChipsRow: {
    display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
  },
  exerciseChip: {
    display: "inline-flex", alignItems: "center", gap: 3,
    padding: "5px 10px", borderRadius: 10,
    background: "rgba(15,23,42,0.04)",
    fontSize: 13, fontWeight: 700, color: "#334155",
  },
  exerciseChipEffort: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "5px 10px", borderRadius: 10,
    background: "rgba(139,92,246,0.08)",
    fontSize: 13, fontWeight: 700, color: "#7c3aed",
  },
  delta: {
    fontSize: 12, fontWeight: 800, marginLeft: 4, display: "inline-flex", alignItems: "center", gap: 0,
  },
  effortDelta: {
    fontSize: 11, fontWeight: 500, color: "rgba(15,23,42,0.35)", marginLeft: 4,
  },

  // ── Buttons
  stickyWrap: {
    position: "fixed", left: 0, right: 0, bottom: 0,
    zIndex: 30,
    padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
    background: "linear-gradient(to top, rgba(245,245,247,1) 70%, rgba(245,245,247,0))",
  } as CSSProperties,
  stickyInner: {
    maxWidth: 720, margin: "0 auto", display: "grid", gap: 8, boxSizing: "border-box",
  },
  primaryBtn: {
    width: "fit-content", maxWidth: "100%", justifySelf: "center",
    display: "inline-flex", alignItems: "center", gap: 12,
    height: 56, minHeight: 56, padding: "0 14px",
    borderRadius: 999, border: "1px solid #1e1f22", background: "#1e1f22", color: "#fff",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)", cursor: "pointer",
    transition: "transform 160ms ease, opacity 250ms ease",
  },
  primaryBtnText: {
    whiteSpace: "nowrap" as const, fontSize: 18, fontWeight: 500, lineHeight: 1, color: "#fff",
  },
  primaryBtnCircle: {
    width: 40, height: 40, borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    marginRight: -6,
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    color: "#0f172a", flexShrink: 0,
  },
  secondaryBtn: {
    width: "100%", justifySelf: "center", minHeight: 40,
    border: "none", background: "transparent", borderRadius: 999,
    color: "rgba(15,23,42,0.6)", fontSize: 14, fontWeight: 500,
    cursor: "pointer", textAlign: "center" as const,
    transition: "opacity 250ms ease",
  },
};

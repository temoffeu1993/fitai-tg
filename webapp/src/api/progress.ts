import { apiFetch } from "@/lib/apiClient";
import type { GamificationSummary } from "@/lib/gamification";

// ─── Legacy types (still returned by backend) ────────────────────────────────

export type ProgressSummary = {
  stats: {
    currentWeightKg: number | null;
    weightDelta30d: number | null;
    workoutsTotal: number;
    workoutsDelta30d: number;
    caloriesPerDay: number | null;
    caloriesStatus: "normal" | "deficit" | "surplus" | "none";
    daysWithApp: number;
    planWeeklyGoal: number | null;
    planSeriesCurrent: number;
    planSeriesBest: number;
    dayStreakCurrent: number;
    dayStreakBest: number;
  };
  weightSeries: Array<{ date: string; weight: number }>;
  activity: {
    days: Array<{ date: string; completed: boolean }>;
    weeks: Array<{ label: string; days: Array<{ date: string; completed: boolean }> }>;
    dayStreakCurrent: number;
    dayStreakBest: number;
    planSeriesCurrent: number;
    planSeriesBest: number;
    completedThisWeek: number;
    weeklyGoal: number | null;
    completedThisMonth: number;
    daysInMonth: number;
    totalAllTime: number;
  };
  // Legacy achievements - can be array (old) or object (new)
  achievements?: any;
};

// ─── New v2 types ────────────────────────────────────────────────────────────

export type GoalMilestone = {
  id: string;
  label: string;
  emoji: string;
  completed: boolean;
  current: boolean;
  value?: string;
};

export type MuscleAccentItem = { muscle: string; percent: number };

export type PersonalRecord = {
  name: string;
  bestWeight: number;
  bestReps: number;
  estimated1RM: number;
  achievedAt: string;
  delta: number | null;
  isFirst: boolean;
};

export type BodyMeasurement = {
  recorded_at: string;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  bicep_left_cm: number | null;
  bicep_right_cm: number | null;
  neck_cm: number | null;
  thigh_cm: number | null;
  notes?: string | null;
};

export type ProgressSummaryV2 = Omit<ProgressSummary, "achievements"> & {
  // Header
  level: number;
  totalXp: number;
  daysWithApp: number;

  // Stat pill
  weekStreak: number;
  workoutsTotal: number;
  totalTonnage: number;
  totalMinutes: number;
  userGoal: string;
  tonnageDelta30d: number | null;

  // AI insight
  aiInsight: {
    text: string;
    type: "first_workout" | "early" | "personalized";
  };

  // Goal journey
  goalJourney: {
    goal: string;
    milestones: GoalMilestone[];
    nextGoalText: string;
  };

  // Muscle accent
  muscleAccent: {
    all: MuscleAccentItem[];
    last30d: MuscleAccentItem[];
    last7d: MuscleAccentItem[];
  };

  // Personal records
  personalRecords: PersonalRecord[];

  // Body transformation
  body: {
    currentWeight: number | null;
    weightSource: "metrics" | "onboarding";
    weightDelta: number | null;
    weightSeries: Array<{ date: string; weight: number }>;
    bmi: number | null;
    measurements: {
      latest: BodyMeasurement | null;
      deltaFromFirst: Partial<Omit<BodyMeasurement, "recorded_at" | "notes">> | null;
    };
  };

  // Volume trend
  volumeTrend: {
    weeks: Array<{
      weekStart: string;
      tonnage: number;
      sessions: number;
      mesoPhase: string | null;
    }>;
    avgTonnage: number | null;
    trendPercent: number | null;
  };

  // Recovery
  recovery: {
    hasEnoughData: boolean;
    avgSleep: number | null;
    avgEnergy: string | null;
    avgStress: string | null;
    sleepTrend: "improving" | "stable" | "declining" | null;
    energyTrend: "improving" | "stable" | "declining" | null;
    stressTrend: "improving" | "stable" | "declining" | null;
    insight: string | null;
    checkInCount: number;
  };

  // Achievements v2
  achievements: {
    earned: Array<{ id: string; title: string; icon: string; earnedAt: string; badge?: string }>;
    upcoming: Array<{ id: string; title: string; icon: string; current: number; target: number; percent: number }>;
  };
};

// ─── API functions ────────────────────────────────────────────────────────────

const PROGRESS_CACHE_KEY = "progress_cache_v2";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

type CacheEntry = { data: ProgressSummaryV2; fetchedAt: number };

function readCache(): ProgressSummaryV2 | null {
  try {
    const raw = localStorage.getItem(PROGRESS_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.data;
  } catch { return null; }
}

function writeCache(data: ProgressSummaryV2) {
  try { localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() })); } catch { }
}

export function readProgressCache(): ProgressSummaryV2 | null {
  try {
    const raw = localStorage.getItem(PROGRESS_CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    return entry.data;
  } catch { return null; }
}

export async function getProgressSummary(): Promise<ProgressSummaryV2> {
  const r = await apiFetch("/api/progress/summary", { credentials: "include" });
  if (!r.ok) throw new Error("failed_to_load_progress");
  const data: ProgressSummaryV2 = await r.json();
  writeCache(data);
  return data;
}

export async function getGamificationSummary(): Promise<GamificationSummary> {
  const r = await apiFetch("/api/progress/gamification", { credentials: "include" });
  if (!r.ok) throw new Error("failed_to_load_gamification");
  const data = await r.json();
  const level = (data as any)?.level;
  if (!level || !Number.isFinite(Number(level.currentLevel))) throw new Error("invalid_gamification_payload");
  return data as GamificationSummary;
}

export async function saveBodyMetric(input: {
  recordedAt?: string;
  weight?: number;
  bodyFat?: number;
  muscleMass?: number;
  notes?: string;
}) {
  const r = await apiFetch("/api/progress/body-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error("failed_to_save_body_metric");
  return r.json();
}

export async function saveMeasurements(input: {
  recordedAt?: string;
  chest_cm?: number;
  waist_cm?: number;
  hips_cm?: number;
  bicep_left_cm?: number;
  bicep_right_cm?: number;
  neck_cm?: number;
  thigh_cm?: number;
  notes?: string;
}) {
  const r = await apiFetch("/api/progress/measurements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error("failed_to_save_measurements");
  return r.json();
}

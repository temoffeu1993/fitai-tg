// plan-refactored.ts
// ============================================================================
// AI-FIRST FITNESS TRAINER
// Полный рефакторинг: простой код, умный AI
// ============================================================================

import { Router, Response } from "express";
import OpenAI from "openai";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { config } from "./config.js";
import { ensureSubscription } from "./subscription.js";
import { workoutSchemes } from "./workoutSchemes.js";

export const plan = Router();

const openai = new OpenAI({ apiKey: config.openaiApiKey! });

// ============================================================================
// TYPES
// ============================================================================

type Blueprint = {
  name: string;
  days: Array<{ label: string; focus: string }>;
  description: string;
  meta: {
    daysPerWeek: number;
    goals: string[];
    location: string;
    trainingStatus: TrainingStatus;
    createdAt: string;
  };
};

type ProgramRow = {
  id: string;
  user_id: string;
  blueprint_json: Blueprint;
  microcycle_len: number;
  week: number;
  day_idx: number;
};

type Exercise = {
  name: string;
  sets: number;
  reps: string;
  restSec: number;
  weight?: string;
  targetMuscles: string[];
  cues: string;
};

type SessionBlockRole =
  | "main_lift"
  | "secondary"
  | "accessory"
  | "isolation"
  | "core"
  | "conditioning"
  | "mobility"
  | "recovery";

type SessionBlock = {
  role: SessionBlockRole;
  focus: string; // кратко: "жимы верх", "тяги спина", "ноги/ягодицы", "кор", "общая выносливость" и т.п.
  targetMuscles: string[];
  intensity: "easy" | "moderate" | "hard";
  setsPlanned: number;
  repRange: string;
  notes: string; // зачем этот блок и как его построить
};

type SessionMode = "normal" | "light" | "recovery" | "deload";
const SESSION_MODES: SessionMode[] = ["normal", "light", "recovery", "deload"];
const isSessionMode = (mode: any): mode is SessionMode =>
  typeof mode === "string" && SESSION_MODES.includes(mode as SessionMode);

type SessionStructure = {
  dayLabel: string; // например, todayFocus из blueprint
  goalSummary: string; // 1–2 предложения, под что эта сессия
  mode: SessionMode;
  blocks: SessionBlock[];
  warmupMinutes: number;
  cooldownMinutes: number;
  expectedExercisesCount: number;
  totalPlannedSets: number;
  totalPlannedMinutes: number;
  hardTimeCap: boolean;
  priorityNotes: string; // что обязательно должно быть, что опционально
  antiRepeatNotes: string;
  historySummaryShort: string;
  weekLoadSummaryShort: string;
  progressionSummaryShort: string;
  lastSessionsCompact: Array<{
    date: string;
    title: string;
    avgRpe: number | null;
    volumeKg: number | null;
  }>;
};

type WorkoutPlan = {
  title: string;
  duration: number;
  targetDuration?: number;
  estimatedDuration?: number;
  durationBreakdown?: {
    warmup?: number;
    exercises?: number;
    cooldown?: number;
    buffer?: number;
    calculation?: string;
  };
  timeNotes?: string;
  warmup: string[];
  exercises: Exercise[];
  cooldown: string[];
  notes: string;
};

// Ежедневный чек-ин
type DailyCheckIn = {
  userId: string;
  createdAt: string;
  availableMinutes: number | null;
  injuries: string[];
  limitations: string[];
  pain: Array<{ location: string; level: number }>;
  sleepHours: number | null;
  sleepQuality: "poor" | "fair" | "good" | "excellent" | null;
  stressLevel: "low" | "medium" | "high" | "very_high" | null;
  energyLevel: "low" | "medium" | "high" | null;
  motivation: "low" | "medium" | "high" | null;
  mood: string | null;
  menstrualCycle: {
    phase: "follicular" | "ovulation" | "luteal" | "menstruation" | null;
    symptoms: string[];
  } | null;
  hydration: "poor" | "adequate" | "good" | null;
  lastMeal: string | null;
  notes: string | null;
};

type Profile = {
  age: number | null;
  weight: number | null;
  height: number | null;
  sex: "male" | "female" | "unknown";
  trainingStatus: TrainingStatus;
  trainingAgeWeeks: number | null;
  weeklyTargetSessions: number;
  recoveryScore: number | null; // 0–100
  fatigueScore: number | null; // 0–100
  goals: string[];
  daysPerWeek: number;
  minutesPerSession: number;
  location: string;
  bodyweightOnly: boolean;

  chronicLimitations: string[];
  chronicInjuries: string[];
  chronicConditions: string[];
  todayLimitations: string[];
  todayInjuries: string[];
  pain: Array<{ location: string; level: number }>;
  stressLevel: "low" | "medium" | "high" | "very_high" | null;
  sleepHours: number | null;
  sleepQuality: "poor" | "fair" | "good" | "excellent" | null;
  energyLevel: "low" | "medium" | "high" | null;
  menstrualCycle: {
    phase: "follicular" | "ovulation" | "luteal" | "menstruation" | null;
    symptoms: string[];
  } | null;
  nutritionInfo: {
    diet: string | null;
    hydration: "poor" | "adequate" | "good" | null;
  } | null;
  motivation: "low" | "medium" | "high" | null;
  mood: string | null;
};

type HistoryExerciseSet = { reps?: number; weight?: number };
type EffortTag = "easy" | "working" | "quite_hard" | "hard" | "max";
type HistoryExercise = {
  name: string;
  reps?: string | number;
  weight?: string | number | null;
  sets?: HistoryExerciseSet[];
  targetMuscles?: string[];
  effort?: EffortTag | null;
};

type HistorySession = {
  date: string;
  title?: string;
  exercises: HistoryExercise[];
  volumeKg: number;
  avgRpe?: number | null;
};

type OnboardingGoal =
  | "lose_weight" // Похудеть
  | "build_muscle" // Масса (верх+низ)
  | "athletic_body" // Рельеф/тонус
  | "lower_body_focus" // Акцент на ноги и ягодицы
  | "strength" // Стать сильнее
  | "health_wellness"; // Здоровье/самочувствие

type TrainingStatus = "beginner" | "intermediate" | "advanced";

type WeightConstraint = {
  min: number;
  max: number;
  recommended: number;
  last: number;
};

type Constraints = {
  weightGuards: Record<string, WeightConstraint>;
  weightNotes: string[];
  recovery: {
    hoursSinceLast: number | null;
  };
  lastRpe: number | null;
  plateau: boolean;
  deloadSuggested: boolean;
  historySummary: string;
};

type PlanStatus = "processing" | "ready" | "failed";

type WorkoutPlanRow = {
  id: string;
  user_id: string;
  status: PlanStatus;
  plan: WorkoutPlan | null;
  analysis: any | null;
  error_info: string | null;
  progress_stage: string | null;
  progress_percent: number | null;
  created_at: string;
  updated_at: string;
};

type WeekContext = {
  weekStartIso: string;
  sessionsThisWeek: number;
  todayIndexInWeek: number | null;
  globalWeekIndex: number;
};

type WeeklyLoadSummary = {
  totalSetsByGroup: Record<string, number>;
  totalVolumeKg: number;
  sessionsCount: number;
};

const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);

// Больше разнообразия
const TEMPERATURE = 0.7;
const TOP_P = 0.9;

const HISTORY_LIMIT = 5;
const ABSOLUTE_MAX_EXERCISES = 15;
const ABSOLUTE_MIN_EXERCISES = 3;
const DAILY_WORKOUT_LIMIT = 1;
const MIN_REAL_DURATION_MIN = 20;
// сколько «запасных» тренировок сверх онбординга можно делать в неделю (мягкий лимит)
const WEEKLY_WORKOUT_EXTRA_SOFT_CAP = 1;
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
function isAdminUser(userId: string): boolean {
  const hardcoded = ["d5d09c2c-f82b-4055-8cfa-77342b3a89f2"];
  return ADMIN_USER_IDS.includes(userId) || hardcoded.includes(userId);
}
const MOSCOW_TZ = "Europe/Moscow";
const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_SESSION_MINUTES = 60;
const DEFAULT_EXERCISES_COUNT = 8;
function mapTrainingStatus(raw: any): TrainingStatus {
  const v = String(raw || "").toLowerCase();
  // Маппинг старых значений для обратной совместимости
  if (v.includes("never") || v.includes("break") || v.includes("перерыв")) return "beginner";
  if (v.includes("begin") || v.includes("novice") || v.includes("new")) return "beginner";
  if (v.includes("experienced") || v.includes("advanced") || v.includes("1+") || v.includes("long")) {
    return "advanced";
  }
  if (v.includes("regular") || v.includes("регуляр")) return "intermediate";
  if (v.includes("intermediate")) return "intermediate";
  // Прямые значения
  if (v === "beginner") return "beginner";
  if (v === "intermediate") return "intermediate";
  if (v === "advanced") return "advanced";
  return "beginner";
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================
function logSection(title: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(title);
  console.log(`${"=".repeat(80)}`);
}

function logData(label: string, data: any, maxLength = 500) {
  const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const truncated = str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  console.log(`[${label}] ${truncated}`);
}

function logTiming(label: string, startTime: number) {
  const duration = Date.now() - startTime;
  console.log(`⏱️  ${label}: ${duration}ms`);
}

function resolveTimezone(req: any): string {
  const candidate =
    (req?.headers?.["x-user-tz"] as string) ||
    (req?.body?.timezone as string) ||
    (req?.query?.tz as string) ||
    MOSCOW_TZ;
  if (typeof candidate === "string" && candidate.trim()) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: candidate });
      return candidate;
    } catch {
      /* ignore invalid TZ and fall back */
    }
  }
  return MOSCOW_TZ;
}

function currentDateIsoInTz(tz: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function dateIsoFromTimestamp(ts: string, tz: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(ts));
}

const formatDateLabel = (date: Date, tz: string, opts?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    day: "numeric",
    month: "long",
    ...(opts || {}),
  }).format(date);

const formatDateTimeLabel = (date: Date, tz: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

async function getNextDailyResetIso(tz: string): Promise<string> {
  const rows = await q<{ boundary: string }>(
    `SELECT ((date_trunc('day', (now() AT TIME ZONE $1)) + interval '1 day')) AT TIME ZONE 'UTC' AS boundary`,
    [tz]
  );
  return rows[0]?.boundary ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

async function getNextWeeklyResetIso(tz: string): Promise<string> {
  const rows = await q<{ boundary: string }>(
    `SELECT ((date_trunc('week', (now() AT TIME ZONE $1)) + interval '7 day')) AT TIME ZONE 'UTC' AS boundary`,
    [tz]
  );
  return rows[0]?.boundary ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

const ensureUser = (req: any): string => {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
};

async function getLatestWorkoutPlan(userId: string): Promise<WorkoutPlanRow | null> {
  const rows = await q<WorkoutPlanRow>(
    `SELECT id, user_id, status, plan, analysis, error_info, progress_stage, progress_percent, created_at, updated_at
       FROM workout_plans
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getWorkoutPlanById(planId: string): Promise<WorkoutPlanRow | null> {
  const rows = await q<WorkoutPlanRow>(
    `SELECT id, user_id, status, plan, analysis, error_info, progress_stage, progress_percent, created_at, updated_at
       FROM workout_plans
      WHERE id = $1
      LIMIT 1`,
    [planId]
  );
  return rows[0] || null;
}

async function createWorkoutPlanShell(userId: string): Promise<WorkoutPlanRow> {
  const rows = await q<WorkoutPlanRow>(
    `INSERT INTO workout_plans (user_id, status, progress_stage, progress_percent)
     VALUES ($1, 'processing', 'queued', 5)
     RETURNING id, user_id, status, plan, analysis, error_info, progress_stage, progress_percent, created_at, updated_at`,
    [userId]
  );
  return rows[0];
}

async function getLastWorkoutSession(userId: string) {
  const rows = await q(
    `SELECT id, started_at, completed_at, unlock_used, created_at
       FROM workouts
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0];
}

async function setWorkoutPlanProgress(planId: string, stage: string, percent: number | null) {
  await q(
    `UPDATE workout_plans
        SET progress_stage = $2,
            progress_percent = $3,
            updated_at = now()
      WHERE id = $1`,
    [planId, stage, percent]
  );
}

async function markWorkoutPlanReady(planId: string, plan: WorkoutPlan, analysis: any) {
  await q(
    `UPDATE workout_plans
        SET status = 'ready',
            plan = $2::jsonb,
            analysis = $3::jsonb,
            error_info = NULL,
            progress_stage = 'ready',
            progress_percent = 100,
            updated_at = now()
      WHERE id = $1`,
    [planId, plan, analysis]
  );
}

async function markWorkoutPlanFailed(planId: string, message: string | null) {
  await q(
    `UPDATE workout_plans
        SET status = 'failed',
            error_info = $2,
            progress_stage = 'failed',
            progress_percent = NULL,
            updated_at = now()
      WHERE id = $1`,
    [planId, message]
  );
}

function buildWorkoutPlanResponse(row: WorkoutPlanRow | null) {
  if (!row) {
    return {
      plan: null,
      analysis: null,
      meta: {
        status: null,
        planId: null,
        error: null,
        progress: null,
        progressStage: null,
      },
    };
  }

  return {
    plan: row.plan ?? null,
    analysis: row.analysis ?? null,
    meta: {
      status: row.status,
      planId: row.id,
      error: row.error_info ?? null,
      progress: typeof row.progress_percent === "number" ? row.progress_percent : null,
      progressStage: row.progress_stage ?? null,
    },
  };
}

// ============================================================================
// UTILS
// ============================================================================

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fitDaysToCount(baseDays: string[], count: number): Array<{ label: string; focus: string }> {
  if (count <= 0) return [];
  if (!baseDays.length) {
    return Array.from({ length: count }, (_, i) => {
      const label = `День ${i + 1}`;
      return { label, focus: label };
    });
  }
  const result: Array<{ label: string; focus: string }> = [];
  let i = 0;
  while (result.length < count) {
    const label = baseDays[i % baseDays.length];
    result.push({ label, focus: label });
    i++;
  }
  return result.slice(0, count);
}

const numberFrom = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const num = Number(match[0]);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
};

const formatWeight = (value: number | null | undefined): string | null => {
  if (value == null || Number.isNaN(value)) return null;
  return `${Number(value.toFixed(1))} кг`;
};

const parseWeightValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const num = Number(match[0]);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
};

function parseRepsRange(reps: string | number | undefined): { min: number; max: number } {
  if (typeof reps === "number" && Number.isFinite(reps)) return { min: reps, max: reps };
  if (typeof reps === "string") {
    const match = reps.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (match) return { min: Number(match[1]), max: Number(match[2]) };
    const single = reps.match(/(\d+)/);
    if (single) {
      const val = Number(single[1]);
      return { min: val, max: val };
    }
  }
  return { min: 8, max: 12 };
}

function averageSetStats(ex: HistoryExercise): { weight: number | null; reps: number | null } {
  if (!Array.isArray(ex.sets) || ex.sets.length === 0) {
    return { weight: numberFrom(ex.weight), reps: numberFrom(ex.reps) };
  }
  const reps = ex.sets.map((s) => numberFrom(s.reps)).filter((n): n is number => n != null);
  const weights = ex.sets.map((s) => numberFrom(s.weight)).filter((n): n is number => n != null);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return { weight: avg(weights), reps: avg(reps) };
}

function calculateMuscleVolume(sessions: HistorySession[]): Record<string, number> {
  const muscleVolume: Record<string, number> = {};

  sessions.forEach((session) => {
    session.exercises.forEach((ex) => {
      const muscles = ex.targetMuscles || [];
      const sets =
        Array.isArray(ex.sets) && ex.sets.length > 0
          ? ex.sets.length
          : 3;

      muscles.forEach((muscle) => {
        const key = muscle.toLowerCase();
        muscleVolume[key] = (muscleVolume[key] || 0) + sets;
      });
    });
  });

  return muscleVolume;
}

function groupMuscles(muscleVolume: Record<string, number>): string {
  const groups: Record<string, string[]> = {
    "Верх тела (жим)": ["грудь", "плечи", "трицепс", "передние дельты", "средние дельты"],
    "Верх тела (тяга)": ["спина", "широчайшие", "трапеции", "бицепс", "задние дельты", "предплечья"],
    Ноги: ["квадрицепс", "бицепс бедра", "ягодицы", "икры", "ноги"],
    Кор: ["пресс", "кор", "поясница", "абс"],
  };

  const result: Record<string, number> = {};

  Object.entries(muscleVolume).forEach(([muscle, volume]) => {
    let assigned = false;
    Object.entries(groups).forEach(([groupName, keywords]) => {
      if (keywords.some((keyword) => muscle.includes(keyword))) {
        result[groupName] = (result[groupName] || 0) + volume;
        assigned = true;
      }
    });
    if (!assigned) result[muscle] = volume;
  });

  return Object.entries(result)
    .sort((a, b) => b[1] - a[1])
    .map(([group, volume]) => `- ${group}: ${volume} подходов`)
    .join("\n");
}

function calcSessionVolume(session: HistorySession): number {
  let total = 0;
  for (const ex of session.exercises) {
    const sub = (ex.sets || []).reduce((acc, set) => {
      const reps = numberFrom(set.reps) ?? numberFrom(ex.reps) ?? 0;
      const weight = numberFrom(set.weight) ?? numberFrom(ex.weight) ?? 0;
      return acc + reps * weight;
    }, 0);
    total += sub;
  }
  return Number(total.toFixed(1));
}

function buildWeeklyLoadSummary(weekSessions: HistorySession[]): WeeklyLoadSummary {
  const totalSetsByGroup: Record<string, number> = {};
  let totalVolumeKg = 0;
  for (const s of weekSessions) {
    totalVolumeKg += calcSessionVolume(s);
    for (const ex of s.exercises) {
      const groups = Array.isArray(ex.targetMuscles) && ex.targetMuscles.length > 0 ? ex.targetMuscles : ["прочее"];
      const setsCount = Array.isArray(ex.sets) ? ex.sets.length : 0;
      for (const g of groups) {
        const key = String(g || "прочее").toLowerCase();
        totalSetsByGroup[key] = (totalSetsByGroup[key] || 0) + setsCount;
      }
    }
  }
  return {
    totalSetsByGroup,
    totalVolumeKg: Number(totalVolumeKg.toFixed(1)),
    sessionsCount: weekSessions.length,
  };
}

function pickSessionMode(profile: Profile, constraints: Constraints): SessionMode {
  if (constraints.deloadSuggested) return "deload";
  const fatigue = profile.fatigueScore ?? null;
  const recovery = profile.recoveryScore ?? null;
  if ((fatigue != null && fatigue >= 60) || (recovery != null && recovery <= 40)) {
    return "recovery";
  }
  if (constraints.lastRpe != null && constraints.lastRpe >= 9) return "light";
  return "normal";
}

function buildLastSessionsCompact(history: HistorySession[]): SessionStructure["lastSessionsCompact"] {
  return history.slice(0, 3).map((s) => ({
    date: new Date(s.date).toLocaleDateString("ru-RU"),
    title: s.title || "тренировка",
    avgRpe: Number.isFinite(s.avgRpe) ? Number(s.avgRpe) : null,
    volumeKg: Number.isFinite(s.volumeKg) ? Number(s.volumeKg) : null,
  }));
}

function buildHistorySummaryShort(history: HistorySession[], weekSessions: HistorySession[]): string {
  if (!history.length) {
    return "Это первая тренировка клиента в приложении. Начни с умеренного объёма и базовых упражнений.";
  }

  const last = history[0];
  const recent = history.slice(0, 3);
  const avgRpeArr = recent.map((s) => s.avgRpe).filter((r): r is number => r != null);
  const avgRpe =
    avgRpeArr.length > 0
      ? Number((avgRpeArr.reduce((a, b) => a + b, 0) / avgRpeArr.length).toFixed(1))
      : null;
  const totalRecentVolume = recent.map((s) => s.volumeKg || 0).reduce((a, b) => a + b, 0);

  const lineLast = `Последняя тренировка: ${last.title || "без названия"} (объём ~${Math.round(
    last.volumeKg
  )} кг${last.avgRpe ? `, RPE ${last.avgRpe}/10` : ""}).`;
  const lineAvg = avgRpe != null ? `Средний RPE за последние ${recent.length} тренировок: ${avgRpe}/10.` : "";
  const lineVolume =
    totalRecentVolume > 0
      ? `Суммарный объём за последние ${recent.length} тренировок: ~${Math.round(totalRecentVolume)} кг.`
      : "";

  let weekLine = "";
  if (weekSessions.length > 0) {
    const weekSummary = buildWeeklyLoadSummary(weekSessions);
    const mainGroups = Object.entries(weekSummary.totalSetsByGroup)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g, sets]) => `${g}: ${sets} подх.`);
    weekLine = `За эту неделю: ${weekSessions.length} тренировок, объём ~${Math.round(
      weekSummary.totalVolumeKg
    )} кг. Основная нагрузка: ${mainGroups.join("; ")}.`;
  }

  return ["Краткая история тренировок:", lineLast, lineAvg, lineVolume, weekLine].filter(Boolean).join("\n");
}

function buildWeekLoadSummaryShort(
  weekSessions: HistorySession[],
  weeklyLoadSummary: WeeklyLoadSummary
): string {
  if (!weekSessions.length) {
    return "На этой неделе ещё не было тренировок — мышцы свежие.";
  }

  const topGroups = Object.entries(weeklyLoadSummary.totalSetsByGroup)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([group, sets]) => `${group}: ${sets} подходов`);
  const totalVolume = Math.round(weeklyLoadSummary.totalVolumeKg);

  return `Неделя: ${weekSessions.length} тренировки, суммарный объём ~${totalVolume} кг. Уже нагружены: ${topGroups.join(
    "; "
  )}.`;
}

function buildProgressionSummaryShort(
  history: HistorySession[],
  globalWeekIndex: number | null,
  trainingStatus: TrainingStatus
): string {
  const week = globalWeekIndex ?? 1;

  let stageNote = "";
  if (trainingStatus === "beginner") {
    stageNote =
      week <= 4
        ? `Неделя ${week} из первого месяца: фаза адаптации к нагрузкам.`
        : `Неделя ${week}: начальный период освоен, можно аккуратно повышать объём и интенсивность.`;
  } else if (trainingStatus === "intermediate") {
    stageNote = `Неделя ${week}: регулярные тренировки, допустима линейная прогрессия весов и/или объёма.`;
  } else if (trainingStatus === "advanced") {
    stageNote = `Неделя ${week}: опытный атлет, следи за чередованием тяжёлых и более лёгких сессий.`;
  }

  if (!history.length) {
    return ["Краткий контекст прогрессии:", stageNote || "Истории тренировок ещё нет, это стартовый этап."]
      .filter(Boolean)
      .join("\n");
  }

  const recent = history.slice(0, 5);
  const volumes = recent.map((s) => s.volumeKg).filter((v) => v > 0);
  const rpes = recent.map((s) => s.avgRpe).filter((r): r is number => r != null);

  let trendLine = "";
  if (volumes.length >= 2) {
    const first = volumes[volumes.length - 1];
    const last = volumes[0];
    const change = last - first;
    const pct = (change / (first || 1)) * 100;
    if (pct > 10) trendLine = "Объём тренировок растёт.";
    else if (pct < -10) trendLine = "Объём тренировок снижается.";
    else trendLine = "Объём тренировок примерно стабилен.";
  }

  let rpeLine = "";
  if (rpes.length >= 2) {
    const avgRpe = rpes.reduce((a, b) => a + b, 0) / rpes.length;
    if (avgRpe >= 9)
      rpeLine = "Последние тренировки были очень тяжёлыми — можно слегка снизить интенсивность.";
    else if (avgRpe <= 6) rpeLine = "Последние тренировки ощущались легко — можно немного увеличить нагрузку.";
    else rpeLine = "Интенсивность в целом комфортная и рабочая.";
  }

  return ["Краткий контекст прогрессии:", stageNote, trendLine, rpeLine].filter(Boolean).join("\n");
}

function buildHistorySummaryForFinal(struct: SessionStructure): string {
  const last = struct.lastSessionsCompact || [];
  const lastTwo = last.slice(0, 2);

  const lines: string[] = [];

  if (!lastTwo.length) {
    lines.push("Это первая тренировка клиента в системе. Будь особенно аккуратен с объёмом и интенсивностью.");
  } else {
    lines.push("Последние тренировки (кратко):");
    lastTwo.forEach((s, idx) => {
      const label = idx === 0 ? "Последняя" : "Предыдущая";
      const rpe = s.avgRpe != null ? `, RPE ~${s.avgRpe}` : "";
      const vol = s.volumeKg != null ? `, объём ~${Math.round(s.volumeKg)} кг` : "";
      lines.push(`- ${label}: ${s.title || "тренировка"} (${s.date}${rpe}${vol})`);
    });
  }

  if (struct.historySummaryShort) {
    lines.push("");
    lines.push(struct.historySummaryShort);
  }

  if (struct.weekLoadSummaryShort) {
    lines.push("");
    lines.push("Нагрузка по неделе (кратко):");
    lines.push(struct.weekLoadSummaryShort);
  }

  return lines.join("\n");
}

function buildProgressionSummaryForFinal(struct: SessionStructure): string {
  return struct.progressionSummaryShort || "";
}

function compressHistoryToShortSummary(
  historyBlockFull: string,
  history: HistorySession[],
  weekSessions: HistorySession[]
): string {
  const generated = buildHistorySummaryShort(history, weekSessions);
  if (generated) return generated;

  const normalized = historyBlockFull.replace(/\s+/g, " ").trim();
  return normalized.length > 500 ? `${normalized.slice(0, 500)}...` : normalized;
}

function compressWeekLoadToShortSummary(
  weekSessions: HistorySession[],
  weeklyLoadSummary: WeeklyLoadSummary
): string {
  return buildWeekLoadSummaryShort(weekSessions, weeklyLoadSummary);
}

function compressProgressionToShortSummary(
  progressionFull: string,
  history: HistorySession[],
  globalWeekIndex: number | null,
  trainingStatus: TrainingStatus
): string {
  const generated = buildProgressionSummaryShort(history, globalWeekIndex, trainingStatus);
  if (generated) return generated;

  const normalized = progressionFull.replace(/\s+/g, " ").trim();
  return normalized.length > 400 ? `${normalized.slice(0, 400)}...` : normalized;
}

function buildGoalsDescription(goalsData: any): string[] {
  if (!goalsData || !goalsData.primary) {
    return ["поддержание общей физической формы"];
  }

  const goalDescriptions: Record<OnboardingGoal | string, string[]> = {
    lose_weight: ["похудеть и улучшить композицию тела", "сбросить лишний вес, подтянуть фигуру"],
    build_muscle: ["набрать мышечную массу всего тела", "увеличить объём мышц равномерно"],
    athletic_body: ["спортивное подтянутое тело", "улучшить рельеф и тонус мышц"],
    lower_body_focus: [
      "акцент на развитие ног и ягодиц",
      "сильная и красивая нижняя часть тела в составе сбалансированных тренировок",
    ],
    strength: ["стать сильнее и выносливее", "повысить силовые показатели и функциональность"],
    health_wellness: ["улучшить здоровье и самочувствие", "больше энергии, здоровые суставы и спина"],
  };

  return goalDescriptions[goalsData.primary] || [goalsData.customText || "поддержание общей физической формы"];
}

function buildProfile(
  onboarding: any,
  minutesFallback: number,
  checkIn: DailyCheckIn | null,
  trainingAgeWeeks: number | null,
  weeklyTargetSessions: number
): Profile {
  console.log("\n  Building profile from data...");
  console.log("  Onboarding keys:", Object.keys(onboarding || {}).join(", "));
  console.log("  Check-in present:", Boolean(checkIn));

  const sexRaw = (onboarding?.ageSex?.sex || "").toLowerCase();
  const experienceRaw = onboarding?.experience || "beginner";
  const trainingStatus = mapTrainingStatus(experienceRaw);
  const sex: Profile["sex"] =
    sexRaw === "female" ? "female" : sexRaw === "male" ? "male" : "unknown";
  const chronicLimitations = normalizeList(onboarding?.health?.limitations ?? onboarding?.health?.limitsText);
  const chronicInjuries = normalizeList(onboarding?.health?.injuries);
  const chronicConditions = normalizeList(onboarding?.health?.chronicConditions);
  const profile = {
    age: numberFrom(onboarding?.ageSex?.age) ?? null,
    weight: numberFrom(onboarding?.body?.weight) ?? null,
    height: numberFrom(onboarding?.body?.height) ?? null,
    sex,
    trainingStatus,
    trainingAgeWeeks,
    weeklyTargetSessions: weeklyTargetSessions || Number(onboarding?.schedule?.daysPerWeek) || 3,
    recoveryScore: null,
    fatigueScore: null,
    goals: buildGoalsDescription(onboarding?.goals),
    daysPerWeek: Number(onboarding?.schedule?.daysPerWeek) || 3,
    minutesPerSession: minutesFallback,
    location: "gym",
    bodyweightOnly: false,
    chronicLimitations,
    chronicInjuries,
    chronicConditions,
    todayLimitations: checkIn?.limitations || [],
    todayInjuries: checkIn?.injuries || [],
    pain: checkIn?.pain || [],
    stressLevel: checkIn?.stressLevel || null,
    sleepHours: checkIn?.sleepHours ?? null,
    sleepQuality: checkIn?.sleepQuality || null,
    energyLevel: checkIn?.energyLevel || null,
    menstrualCycle: checkIn?.menstrualCycle || null,
    nutritionInfo: {
      diet: onboarding?.nutrition?.diet || null,
      hydration: checkIn?.hydration || null,
    },
    motivation: checkIn?.motivation || null,
    mood: checkIn?.mood || null,
  };

  console.log("  Profile result:", {
    hasCheckInData: Boolean(checkIn),
    trainingStatus: profile.trainingStatus,
    goals: profile.goals[0],
    hasEnergyLevel: Boolean(profile.energyLevel),
    hasSleepData: Boolean(profile.sleepHours),
    hasStressLevel: Boolean(profile.stressLevel),
  });

  return profile;
}

function computeRecoveryFatigue(profile: Profile, constraints: Constraints): {
  recoveryScore: number;
  fatigueScore: number;
} {
  let recovery = 70;
  let fatigue = 30;

  const sleep = typeof profile.sleepHours === "number" ? profile.sleepHours : null;
  const stress = profile.stressLevel;
  const energy = profile.energyLevel;
  const hoursSinceLast = constraints.recovery.hoursSinceLast;
  const lastRpe = constraints.lastRpe;

  if (sleep !== null) {
    if (sleep >= 8) {
      recovery += 10;
      fatigue -= 5;
    } else if (sleep >= 7) {
      recovery += 5;
    } else if (sleep >= 6) {
      recovery -= 5;
      fatigue += 5;
    } else {
      recovery -= 15;
      fatigue += 10;
    }
  }

  if (stress === "high" || stress === "very_high") {
    recovery -= 10;
    fatigue += 10;
  } else if (stress === "medium") {
    fatigue += 2;
  }

  if (energy === "high") {
    recovery += 5;
    fatigue -= 5;
  } else if (energy === "low") {
    recovery -= 5;
    fatigue += 5;
  }

  if (hoursSinceLast != null) {
    if (hoursSinceLast < 12) {
      recovery -= 10;
      fatigue += 8;
    } else if (hoursSinceLast < 24) {
      recovery -= 5;
      fatigue += 5;
    } else if (hoursSinceLast > 48) {
      recovery += 5;
      fatigue -= 3;
    }
  }

  if (lastRpe != null) {
    if (lastRpe >= 9) {
      recovery -= 12;
      fatigue += 10;
    } else if (lastRpe >= 8) {
      recovery -= 8;
      fatigue += 6;
    } else if (lastRpe <= 6) {
      recovery += 4;
      fatigue -= 3;
    }
  }

  return {
    recoveryScore: clampScore(recovery),
    fatigueScore: clampScore(fatigue),
  };
}

function summarizeHistory(rows: any[]): HistorySession[] {
  return rows.map((row) => ({
    ...row,
    volumeKg: calcSessionVolume(row),
    avgRpe:
      row.avgRpe != null ? Number(row.avgRpe) : numberFrom(row.payload?.feedback?.sessionRpe) ?? null,
  }));
}

function historyNarrative(history: HistorySession[]): string {
  if (!history.length) return "Это первая тренировка клиента, действуй осмотрительно.";
  return history
    .slice(0, HISTORY_LIMIT)
    .map((session, idx) => {
      const when = idx === 0 ? "Последняя" : `${idx + 1}-я назад`;
      const exercises = session.exercises
        .slice(0, 12)
        .map((ex) => {
          const stats = averageSetStats(ex);
          const repsRange = parseRepsRange(ex.reps);
          const repsText = stats.reps
            ? `${Math.round(stats.reps)} повт.`
            : `${repsRange.min}-${repsRange.max}`;
          const weightText = stats.weight ? `${stats.weight.toFixed(1)} кг` : "без веса/легкий вес";
          return `• ${ex.name}: ${repsText}, ${weightText}`;
        })
        .join("\n");
      const metaParts: string[] = [];
      if (session.avgRpe) metaParts.push(`RPE ${session.avgRpe}`);
      if (session.volumeKg) metaParts.push(`объём ~${Math.round(session.volumeKg)} кг`);
      const meta = metaParts.length ? ` — ${metaParts.join(", ")}` : "";
      return `${when} (${new Date(session.date).toLocaleDateString("ru-RU")})${meta}:\n${exercises}`;
    })
    .join("\n\n");
}

function hoursDiffFrom(dateISO?: string): number | null {
  if (!dateISO) return null;
  const ts = new Date(dateISO).getTime();
  if (Number.isNaN(ts)) return null;
  const diffMs = Date.now() - ts;
  return Math.max(0, Math.round(diffMs / 36e5));
}

function nextWeightSuggestion(ex: HistoryExercise, profile: Profile): WeightConstraint | null {
  const stats = averageSetStats(ex);
  if (!stats.weight) return null;
  const repsRange = parseRepsRange(ex.reps);
  const reps = stats.reps ?? repsRange.min;
  const increment = stats.weight < 20 ? 1 : stats.weight < 50 ? 2.5 : stats.weight < 100 ? 5 : 7.5;
  let recommended = stats.weight;
  if (reps >= repsRange.max) {
    recommended = stats.weight + increment;
  } else if (reps < repsRange.min) {
    recommended = Math.max(5, stats.weight - increment);
  }
  if (ex.effort === "easy") {
    recommended = stats.weight * 1.05;
  } else if (ex.effort === "working") {
    recommended = stats.weight + increment * 0.2;
  } else if (ex.effort === "quite_hard") {
    recommended = stats.weight;
  } else if (ex.effort === "hard") {
    recommended = Math.max(5, stats.weight - increment * 0.4);
  } else if (ex.effort === "max") {
    recommended = Math.max(5, stats.weight - increment);
  }
  const min = stats.weight * 0.95;
  const max = stats.weight * 1.08;
  const bodyCap = profile.weight ? profile.weight * 1.8 : 999;
  return {
    min: Number(Math.max(0, Math.min(min, bodyCap)).toFixed(1)),
    max: Number(Math.min(max, bodyCap).toFixed(1)),
    recommended: Number(Math.min(recommended, bodyCap).toFixed(1)),
    last: Number(stats.weight.toFixed(1)),
  };
}

function buildConstraints(profile: Profile, history: HistorySession[]): Constraints {
  const historySummary = historyNarrative(history);
  const weightGuards: Record<string, WeightConstraint> = {};
  const weightNotes: string[] = [];

  for (const session of history.slice(0, 5)) {
    for (const ex of session.exercises) {
      const suggestion = nextWeightSuggestion(ex, profile);
      if (!suggestion) continue;
      const key = slugify(ex.name);
      if (weightGuards[key]) continue;
      weightGuards[key] = suggestion;
      weightNotes.push(
        `${ex.name}: держи ${suggestion.min}-${suggestion.max} кг (прошлый раз ${suggestion.last} кг)`
      );
      if (weightNotes.length >= 5) break;
    }
    if (weightNotes.length >= 5) break;
  }

  const volumes = history.map((s) => s.volumeKg).filter((v) => v > 0);
  const avgVolume = volumes.length ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const plateau =
    volumes.length >= 3 &&
    volumes.every((v) => Math.abs(v - avgVolume) / (avgVolume || 1) < 0.05);
  const hoursSinceLast = hoursDiffFrom(history[0]?.date);
  const lastRpe = history[0]?.avgRpe ?? null;
  const deloadSuggested =
    (plateau && history.length >= 4) ||
    ((lastRpe ?? 0) >= 9 && (hoursSinceLast ?? 999) < 72);

  return {
    weightGuards,
    weightNotes,
    recovery: {
      hoursSinceLast,
    },
    lastRpe,
    plateau,
    deloadSuggested,
    historySummary,
  };
}

// Anti-repeat блок: явный список упражнений, которые не копируем 1-в-1
function buildAntiRepeatBlock(history: HistorySession[]): string {
  if (!history.length) {
    return "Недавних тренировок нет — ты создаёшь первую тренировку, начни с базовых, но без фанатизма.";
  }

  const sessions = history.slice(0, 2);
  const lines: string[] = [];

  sessions.forEach((session, idx) => {
    const label = idx === 0 ? "Последняя тренировка" : "Предыдущая до неё";
    const exLines = session.exercises.slice(0, 12).map((ex) => `- ${ex.name}`);
    if (exLines.length) {
      lines.push(`${label} — НЕ копируй эти упражнения один-в-один:\n${exLines.join("\n")}`);
    }
  });

  if (!lines.length) {
    return "Недавние тренировки без явных упражнений — можешь использовать базу, но всё равно меняй вариации.";
  }

  lines.push(
    "Используй для текущей тренировки другие углы, другое оборудование или вариации (гантели вместо штанги, машина вместо свободных весов, другой хват/наклон)."
  );

  return lines.join("\n\n");
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

async function getOnboarding(userId: string): Promise<any> {
  const rows = await q(
    `SELECT data
       FROM onboardings
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1`,
    [userId]
  );
  return rows[0]?.data || {};
}

function parseDuration(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const match = value.replace(",", ".").match(/(\d+(\.\d+)?)/);
    if (match) {
      const num = Number(match[1]);
      if (Number.isFinite(num) && num > 0) {
        return Math.round(num);
      }
    }
  }
  return null;
}

function normalizeList(value: any): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

// Автоматический подбор схемы из профессиональных схем
async function findBestSchemeForProfile(profile: Profile): Promise<Blueprint | null> {
  const daysPerWeek = profile.daysPerWeek;
  const experience = profile.trainingStatus; // beginner/intermediate/advanced
  const goal = profile.goals[0] || "health_wellness"; // первая цель как основная
  const sex = profile.sex === "male" ? "male" : profile.sex === "female" ? "female" : null;
  
  console.log(`[SCHEME AUTO-SELECT] Подбираем схему для: ${daysPerWeek} дней, ${experience}, цель: ${goal}`);
  
  // Фильтруем подходящие схемы
  const candidateSchemes = workoutSchemes.filter(scheme => {
    // 1. Точное совпадение по количеству дней
    if (scheme.daysPerWeek !== daysPerWeek) return false;
    
    // 2. Опыт должен совпадать
    if (!scheme.experienceLevels.includes(experience)) return false;
    
    // 3. Цель должна совпадать
    if (!scheme.goals.includes(goal)) return false;
    
    return true;
  });
  
  if (candidateSchemes.length === 0) {
    console.log(`[SCHEME AUTO-SELECT] ❌ Подходящих схем не найдено`);
    return null;
  }
  
  // Скоринг схем для выбора лучшей
  function scoreScheme(scheme: any): number {
    let score = 0;
    
    // Соответствие полу (вес: 15)
    if (scheme.targetSex === 'any') score += 10;
    else if (scheme.targetSex === sex) score += 15;
    
    // Соответствие интенсивности опыту (вес: 20)
    if (experience === 'beginner' && scheme.intensity === 'low') score += 20;
    else if (experience === 'intermediate' && scheme.intensity === 'moderate') score += 20;
    else if (experience === 'advanced' && scheme.intensity === 'high') score += 20;
    else if (scheme.intensity === 'moderate') score += 10; // универсальная интенсивность
    
    // Бонусы за специфические комбинации (вес: до 15)
    if (goal === 'lower_body_focus' && scheme.splitType.includes('glutes')) score += 15;
    if (goal === 'strength' && (scheme.splitType.includes('powerbuilding') || scheme.name.includes('Strength'))) score += 15;
    if (goal === 'health_wellness' && scheme.splitType === 'full_body') score += 12;
    if (goal === 'lose_weight' && (scheme.name.includes('Fat Loss') || scheme.name.includes('Metabolic'))) score += 15;
    
    return score;
  }
  
  // Сортируем и выбираем лучшую
  const scoredSchemes = candidateSchemes
    .map(s => ({ scheme: s, score: scoreScheme(s) }))
    .sort((a, b) => b.score - a.score);
  
  const bestScheme = scoredSchemes[0].scheme;
  
  console.log(`[SCHEME AUTO-SELECT] ✅ Выбрана схема: "${bestScheme.name}" (score: ${scoredSchemes[0].score})`);
  
  // Конвертируем схему в Blueprint
  const blueprint: Blueprint = {
    name: bestScheme.russianName || bestScheme.name,
    days: bestScheme.dayLabels.map(d => ({
      label: d.label,
      focus: d.focus
    })),
    description: bestScheme.description,
    meta: {
      daysPerWeek: bestScheme.daysPerWeek,
      goals: bestScheme.goals,
      location: "gym",
      trainingStatus: experience,
      createdAt: new Date().toISOString(),
    },
  };
  
  return blueprint;
}

// AI генерация blueprint + fallback
async function generateBlueprintWithAI(profile: Profile, onboarding: any): Promise<Blueprint> {
  const limitations = profile.chronicLimitations || [];
  const injuries = profile.chronicInjuries || [];

  const prompt = `Создай структуру тренировочной программы (недельный микроцикл) для клиента.

# ПРОФИЛЬ КЛИЕНТА
${JSON.stringify(
  {
    age: profile.age || "не указан",
    sex: profile.sex === "unknown" ? "не указан" : profile.sex,
    weight: profile.weight ? `${profile.weight} кг` : "не указан",
    height: profile.height ? `${profile.height} см` : "не указан",
    trainingStatus: profile.trainingStatus,
    goals: profile.goals,
    daysPerWeek: profile.daysPerWeek,
    location: profile.location,
    bodyweightOnly: profile.bodyweightOnly,
    limitations: limitations.length ? limitations : "нет данных",
    injuries: injuries.length ? injuries : "нет данных",
  },
  null,
  2
)}

# ЗАДАЧА
Создай структуру НЕДЕЛЬНОГО МИКРОЦИКЛА из ${profile.daysPerWeek} тренировок.

Дай каждому дню короткое, понятное название, которое отражает его фокус (разные акценты на части тела или тип нагрузки).

# ФОРМАТ ОТВЕТА
Ответ строго в JSON (response_format json_object), без пояснений, без markdown, без комментариев.

Только объект вида:
{
  "name": "Название программы",
  "days": ["День 1", "День 2", "День 3", ...],
  "description": "Краткое описание логики программы в 1-2 предложениях"
}

ВАЖНО: массив "days" должен содержать ровно ${profile.daysPerWeek} элементов.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Ты опытный персональный тренер, создающий структуру тренировочных программ.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = JSON.parse(completion.choices[0].message.content || "{}");

  if (!raw.name || typeof raw.name !== "string") {
    throw new Error("AI не вернул name в blueprint");
  }

  if (!Array.isArray(raw.days) || raw.days.length === 0) {
    throw new Error("AI не вернул массив days в blueprint");
  }

  if (raw.days.length !== profile.daysPerWeek) {
    throw new Error(`AI вернул ${raw.days.length} дней вместо ${profile.daysPerWeek}`);
  }

  const blueprint: Blueprint = {
    name: String(raw.name).trim(),
    days: raw.days.map((d: any) => {
      const label = String(d || "День").trim();
      // AI возвращает просто названия дней без детального focus
      // Используем label как focus для AI-генерированных программ
      return { label, focus: label };
    }),
    description: String(raw.description || "Структура недели под цели клиента").trim(),
    meta: {
      daysPerWeek: profile.daysPerWeek,
      goals: [...profile.goals],
      location: profile.location,
      trainingStatus: profile.trainingStatus,
      createdAt: new Date().toISOString(),
    },
  };

  console.log(`[PROGRAM] AI создал blueprint: "${blueprint.name}"`);
  console.log(`  Days: ${blueprint.days.map(d => d.label).join(" → ")}`);

  return blueprint;
}

function createBlueprintRuleBased(profile: Profile, onboarding: any): Blueprint {
  const goalText = JSON.stringify(onboarding?.goals ?? "").toLowerCase();
  const goalPrimary: string | null = onboarding?.goals?.primary || null;
  const isWeightLoss =
    goalPrimary === "lose_weight" ||
    goalText.includes("сброс") ||
    goalText.includes("похуд") ||
    goalText.includes("жир") ||
    goalText.includes("рельеф") ||
    goalText.includes("сушка");
  const isHypertrophy =
    goalPrimary === "build_muscle" ||
    goalPrimary === "athletic_body" ||
    goalPrimary === "strength" ||
    goalText.includes("масса") ||
    goalText.includes("мышц") ||
    goalText.includes("гипертроф") ||
    goalText.includes("спорт");
  const age = profile.age ?? null;
  const isSenior = age != null && age >= 50;
  const hasInjuries =
    (profile.chronicInjuries?.length || 0) > 0 ||
    (profile.chronicLimitations?.length || 0) > 0;
  let name: string;
  let baseDays: string[];
  let description: string;

  const isExperienced = profile.trainingStatus === "advanced";
  const isRegular = profile.trainingStatus === "intermediate";
  const isBeginner = profile.trainingStatus === "beginner";

  if (profile.daysPerWeek >= 5) {
    if (isExperienced && !isSenior && !hasInjuries) {
      name = "Push/Pull/Legs Split";
      baseDays = ["Push", "Pull", "Legs", "Push", "Pull", "Legs"];
      description = "Классический многодневный сплит для продвинутых";
    } else {
      name = "Upper/Lower + Variation";
      baseDays = ["Upper", "Lower", "Upper", "Lower", "Кардио + Кор"];
      description = "Сбалансированный сплит с днём восстановления";
    }
  } else if (profile.daysPerWeek === 4) {
    if (isWeightLoss || isSenior || hasInjuries) {
      name = "Full Body Circuit";
      baseDays = ["Full Body A", "Кардио + Кор", "Full Body B", "Активное восстановление"];
      description = "Щадящая программа с акцентом на здоровье";
    } else if (isHypertrophy && !isBeginner) {
      name = "Upper/Lower (Гипертрофия)";
      baseDays = ["Upper Heavy", "Lower Volume", "Upper Volume", "Lower Heavy"];
      description = "Силовой вариант для роста массы";
    } else {
      name = "Upper/Lower Split";
      baseDays = ["Upper", "Lower", "Upper", "Lower"];
      description = "Сбалансированное распределение нагрузки";
    }
  } else {
    const isFemaleLowerFocus =
      profile.sex === "female" &&
      (goalPrimary === "lower_body_focus" ||
        goalText.includes("ягод") ||
        goalText.includes("ног") ||
        goalText.includes("попа"));

    if (goalPrimary === "athletic_body" || goalPrimary === "lose_weight") {
      name = "Full Body Tone";
      baseDays = ["Full Body A", "Full Body B", "Full Body C"];
      description = "Тонизирующая 3-дневка: баланс ног, жимов и тяг без перегруза";
    } else if (goalPrimary === "build_muscle" || goalPrimary === "strength") {
      name = "Upper/Lower + Full Body";
      baseDays = ["Upper", "Lower", "Full Body"];
      description = "Сбалансированный микс для роста силы и массы";
    } else if (isFemaleLowerFocus && !isBeginner) {
      name = "Glutes & Lower Emphasis";
      baseDays = ["Lower + Glutes Heavy", "Upper Push/Pull", "Glutes + Core Volume"];
      description = "Акцент на нижнюю часть тела";
    } else if (isSenior || hasInjuries) {
      name = "Full Body Easy";
      baseDays = ["Full Body Light", "Кардио + Мобильность", "Full Body Moderate"];
      description = "Безопасная программа для здоровья суставов";
    } else if (isHypertrophy) {
      name = "Full Body Split";
      baseDays = ["Upper Focus", "Lower Focus", "Full Body"];
      description = "3-дневный фулбоди для набора массы";
    } else {
      name = "General Fitness";
      baseDays = ["Full Body A", "Full Body B", "Full Body C"];
      description = "Базовая программа для общей физической формы";
    }
  }

  const days = fitDaysToCount(baseDays, profile.daysPerWeek);

  return {
    name,
    days,
    description,
    meta: {
      daysPerWeek: profile.daysPerWeek,
      goals: [...profile.goals],
      location: profile.location,
      trainingStatus: profile.trainingStatus,
      createdAt: new Date().toISOString(),
    },
  };
}

async function getOrCreateProgram(
  userId: string,
  onboarding: any,
  profile: Profile
): Promise<ProgramRow> {
  const existing = await q<ProgramRow>(
    `SELECT * FROM training_programs WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  if (existing && existing[0]) {
    const stored = existing[0];
    const storedMeta = stored.blueprint_json?.meta;
    const needsRecreate =
      storedMeta?.daysPerWeek !== profile.daysPerWeek ||
      storedMeta?.trainingStatus !== profile.trainingStatus ||
      JSON.stringify((storedMeta?.goals || []).slice().sort()) !==
        JSON.stringify((profile.goals || []).slice().sort());

    if (!needsRecreate) {
      console.log(`[PROGRAM] ✅ Используем существующий blueprint для user=${userId}`);
      console.log(
        `  Program: "${stored.blueprint_json.name}", week ${stored.week}, day ${stored.day_idx + 1}`
      );
      return stored;
    }

    console.log(`[PROGRAM] 🔄 Пересоздаём blueprint: изменились ключевые параметры`);
    console.log(
      `  Старые: ${storedMeta?.daysPerWeek} дней, цели: ${(storedMeta?.goals || []).join(", ")}`
    );
    console.log(`  Новые: ${profile.daysPerWeek} дней, цели: ${profile.goals.join(", ")}`);
  }

  // ПРИОРИТЕТ 1: Пытаемся автоматически подобрать схему из профессиональных
  let blueprint: Blueprint | null = null;
  try {
    blueprint = await findBestSchemeForProfile(profile);
    if (blueprint) {
      console.log(`[PROGRAM] 🎯 Автоматически подобрана схема: "${blueprint.name}"`);
    }
  } catch (err) {
    console.error("[PROGRAM] ❌ Scheme auto-selection failed:", err);
  }

  // ПРИОРИТЕТ 2: Если схема не найдена - генерируем через AI
  if (!blueprint) {
    console.log("[PROGRAM] 🤖 Схема не найдена, генерируем через AI...");
    try {
      blueprint = await generateBlueprintWithAI(profile, onboarding);
    } catch (err) {
      console.error("[PROGRAM] ❌ AI blueprint generation failed, using rule-based fallback:", err);
      blueprint = createBlueprintRuleBased(profile, onboarding);
    }
  }

  if (existing && existing[0]) {
    const updated = await q<ProgramRow>(
      `UPDATE training_programs
          SET blueprint_json = $2::jsonb,
              microcycle_len = $3,
              day_idx = 0,
              week = 1,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [existing[0].id, JSON.stringify(blueprint), blueprint.days.length]
    );

    console.log(`[PROGRAM] ✅ Blueprint обновлён: "${blueprint.name}"`);
    return updated[0];
  }

  console.log(`[PROGRAM] 🤖 Создаём новый blueprint: "${blueprint.name}"`);

  const result = await q<ProgramRow>(
    `INSERT INTO training_programs (user_id, blueprint_json, microcycle_len, week, day_idx)
     VALUES ($1, $2::jsonb, $3, 1, 0)
     RETURNING *`,
    [userId, JSON.stringify(blueprint), blueprint.days.length]
  );

  return result[0];
}

async function getRecentSessions(userId: string, limit = 10): Promise<HistorySession[]> {
  const rows = await q<any>(
    `SELECT finished_at, payload
       FROM workout_sessions
      WHERE user_id = $1
      ORDER BY finished_at DESC
      LIMIT $2`,
    [userId, limit]
  );

  return rows.map((row) => {
    const payload = row.payload || {};
    const exercisesRaw = payload.exercises || [];

    return {
      date: row.finished_at,
      title: payload.title,
      exercises: exercisesRaw.map((ex: any) => ({
        name: ex.name,
        reps: ex.reps,
        weight: ex.weight,
        targetMuscles: ex.targetMuscles,
        effort: typeof ex.effort === "string" ? ex.effort : null,
        sets: Array.isArray(ex.sets)
          ? ex.sets.map((set: any) => ({
              reps: numberFrom(set?.reps),
              weight: numberFrom(set?.weight),
            }))
          : [],
      })),
      volumeKg: 0,
      avgRpe: numberFrom(payload?.feedback?.sessionRpe) ?? null,
    } as HistorySession;
  });
}

// Получение последнего check-in (48 часов)
async function getLatestCheckIn(userId: string): Promise<DailyCheckIn | null> {
  const rows = await q<any>(
    `SELECT *
       FROM daily_check_ins
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '48 hours'
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );

  if (!rows[0]) {
    console.log(`[CHECK-IN] No recent check-in found for user=${userId}`);
    return null;
  }

  const row = rows[0];
  console.log(
    `[CHECK-IN] Found check-in for user=${userId}, age=${
      Math.round((Date.now() - new Date(row.created_at).getTime()) / 3600000)
    }h`
  );

  let pain: Array<{ location: string; level: number }> = [];
  if (row.pain) {
    if (typeof row.pain === "string") {
      try {
        pain = JSON.parse(row.pain);
      } catch {
        pain = [{ location: row.pain, level: null as any }];
      }
    } else {
      pain = row.pain;
    }
  }

  let availableMinutes: number | null = null;
  if (row.available_minutes != null) {
    const parsed = numberFrom(row.available_minutes);
    availableMinutes = parsed != null ? parsed : null;
  }

  return {
    userId: row.user_id,
    createdAt: row.created_at,
    availableMinutes,
    injuries: row.injuries || [],
    limitations: row.limitations || [],
    pain,
    sleepHours: row.sleep_hours,
    sleepQuality: row.sleep_quality,
    stressLevel: row.stress_level,
    energyLevel: row.energy_level,
    motivation: row.motivation,
    mood: row.mood,
    menstrualCycle: row.menstrual_phase
      ? { phase: row.menstrual_phase, symptoms: row.menstrual_symptoms || [] }
      : null,
    hydration: row.hydration,
    lastMeal: row.last_meal,
    notes: row.notes,
  };
}

async function getWeekSessions(userId: string, tz: string): Promise<HistorySession[]> {
  const rows = await q<any>(
    `SELECT finished_at, payload
       FROM workout_sessions
      WHERE user_id = $1
        AND finished_at >= date_trunc('week', (now() AT TIME ZONE $2))
      ORDER BY finished_at ASC`,
    [userId, tz]
  );

  return rows.map((row) => {
    const payload = row.payload || {};
    const exercisesRaw = payload.exercises || [];

    return {
      date: row.finished_at,
      title: payload.title,
      exercises: exercisesRaw.map((ex: any) => ({
        name: ex.name,
        reps: ex.reps,
        weight: ex.weight,
        targetMuscles: ex.targetMuscles,
        effort: typeof ex.effort === "string" ? ex.effort : null,
        sets: Array.isArray(ex.sets)
          ? ex.sets.map((set: any) => ({
              reps: numberFrom(set?.reps),
              weight: numberFrom(set?.weight),
            }))
          : [],
      })),
      volumeKg: 0,
      avgRpe: numberFrom(payload?.feedback?.sessionRpe) ?? null,
    } as HistorySession;
  });
}

async function getGlobalWeekIndex(userId: string, _tz: string): Promise<number> {
  const rows = await q<{ first_date: string }>(
    `SELECT MIN(created_at) AS first_date
       FROM workouts
      WHERE user_id = $1`,
    [userId]
  );

  if (!rows[0]?.first_date) return 1;

  const first = new Date(rows[0].first_date).getTime();
  const now = Date.now();
  const diffWeeks = Math.floor((now - first) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}

async function buildWeekContext(userId: string, tz: string): Promise<WeekContext> {
  const rows = await q<{ finished_at: string }>(
    `SELECT finished_at
       FROM workout_sessions
      WHERE user_id = $1
        AND finished_at >= date_trunc('week', (now() AT TIME ZONE $2))
      ORDER BY finished_at ASC`,
    [userId, tz]
  );

  const sessionsThisWeek = rows.length;
  const weekStartRows = await q<{ week_start: string }>(
    `SELECT (date_trunc('week', (now() AT TIME ZONE $1))) AT TIME ZONE 'UTC' AS week_start`,
    [tz]
  );
  const weekStartIso = weekStartRows[0]?.week_start ?? new Date().toISOString();
  const todayIndexInWeek = sessionsThisWeek + 1;
  const globalWeekIndex = await getGlobalWeekIndex(userId, tz);

  return { weekStartIso, sessionsThisWeek, todayIndexInWeek, globalWeekIndex };
}

const TRAINER_SYSTEM = `Ты опытный персональный тренер с 15+ годами практики в работе с самыми разными людьми.

# ТВОЙ ПОДХОД

Ты работаешь с людьми на основе их ИНДИВИДУАЛЬНЫХ данных, а не стереотипов:

# ТВОИ ПРИНЦИПЫ

1. Читай ВСЕ данные клиента — возраст, пол, цели, травмы, сон, стресс, историю тренировок.
2. Адаптируйся — каждый человек уникален, даже с похожими параметрами на бумаге.
3. Думай как тренер — не как алгоритм, заполняющий шаблон по чек-листу.
4. Если указаны травмы/боли/ограничения — выбирай безопасные варианты, которые не провоцируют боль и не создают чрезмерную нагрузку на проблемные области; при необходимости смещай акцент на другие группы.

Ты создаёшь тренировки для конкретного человека в конкретный день, учитывая его полную картину.`;

type ExercisesTarget = { count: number; reason?: string };

function getTrainingStatusPrompt(status: TrainingStatus): string {
  switch (status) {
    case "beginner":
      return `
## НОВИЧОК (0-6 месяцев опыта или после перерыва)

Клиент **новичок в тренировках** или **возвращается после перерыва**.

**Что это значит для программы:**
- Начни с простых упражнений (машины, гантели лучше штанги)
- Подробные технические подсказки к каждому упражнению
- Консервативные веса (клиент должен чувствовать комфорт в первые недели)
- Если был перерыв: мышечная память работает, но сила снижена
- Первые 2-4 недели — период адаптации или ре-адаптации
- Тренировка должна вдохновлять, а не пугать объёмом
`;

    case "intermediate":
      return `
## СРЕДНИЙ УРОВЕНЬ (6 месяцев - 2 года регулярных тренировок)

Клиент **активно тренируется** последние месяцы/годы.

**Что это значит:**
- Знает базовые упражнения, но техника требует шлифовки
- Прогрессия линейная — можно добавлять веса каждую неделю
- Нужны технические подсказки, но не детальные как новичку
- Может справиться с умеренной интенсивностью
`;

    case "advanced":
      return `
## ПРОДВИНУТЫЙ (2+ года регулярных тренировок)

Клиент **тренируется давно и стабильно**, знает что делает.

**Что это значит:**
- Владеет техникой сложных упражнений
- Можно использовать продвинутые сплиты и периодизацию
- Понимает принципы прогрессии (линейная, волновая, циклы)
- Можно использовать интенсивные техники (суперсеты, дропсеты и т.д.)
`;
    default:
      return "";
  }
}

async function recommendExercisesCount(params: {
  profile: Profile;
  onboarding: any;
  checkIn: DailyCheckIn | null;
  history: HistorySession[];
  sessionMinutes: number;
  constraints: Constraints;
}): Promise<ExercisesTarget> {
  const { profile, onboarding, checkIn, history, sessionMinutes, constraints } = params;
  const recentRpes = history
    .map((h) => h.avgRpe)
    .filter((r): r is number => r != null && Number.isFinite(r));
  const avgRpe =
    recentRpes.length > 0 ? Number((recentRpes.reduce((a, b) => a + b, 0) / recentRpes.length).toFixed(2)) : null;

  const payload = {
    profile: {
      sex: profile.sex,
      age: profile.age,
      trainingStatus: profile.trainingStatus,
      daysPerWeek: profile.daysPerWeek,
      minutesPerSession: profile.minutesPerSession,
      goals: profile.goals,
      location: profile.location,
    },
    onboarding: {
      goals: onboarding?.goals ?? null,
      environment: onboarding?.environment ?? null,
      schedule: onboarding?.schedule ?? null,
    },
    checkIn: checkIn || null,
    history: {
      lastRpe: constraints.lastRpe,
      avgRpe,
      sessions: history.slice(0, 5).map((h) => ({
        date: h.date,
        avgRpe: h.avgRpe,
        exercises: h.exercises?.length ?? null,
      })),
    },
    sessionMinutes,
  };

const prompt = `Определи разумное количество упражнений для одной тренировки.
Учитывай данные профиля, чек-ина и средний RPE последних тренировок.
Разминка + заминка ВМЕСТЕ не более 15 минут. Остальное время = основная часть.
Цель: подобрать такое количество упражнений, чтобы основная часть была почти полностью заполнена (остаток < 5 минут).
Время на одно упражнение (уже включая отдых между подходами):
- базовое (многосуставное): ~12 минут
- изолирующее: ~5–6 минут
Не закладывай дополнительный буфер под отдых — он уже учтён в цифрах 12 / 5–6. Если остаётся заметный запас времени, увеличь количество упражнений.
Верни JSON {"count": число, "reason": "кратко почему"}.

Данные:
${JSON.stringify(payload, null, 2)}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Ты тренер. Выбираешь разумное количество упражнений на сессию." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const countRaw = parsed?.count;
    const count = Number.isFinite(countRaw) ? Number(countRaw) : DEFAULT_EXERCISES_COUNT;
    const clamped = Math.min(15, Math.max(4, Math.round(count)));
    return { count: clamped, reason: typeof parsed?.reason === "string" ? parsed.reason : undefined };
  } catch (err) {
    console.error("[PROGRAM] ⚠️ Exercise count AI failed, using default:", err);
    return { count: DEFAULT_EXERCISES_COUNT, reason: "fallback_default" };
  }
}

function rebalanceDurationBreakdown(
  db: WorkoutPlan["durationBreakdown"] | undefined,
  sessionMinutes: number
): { updated: WorkoutPlan["durationBreakdown"]; note: string | null } {
  const original = {
    warmup: numberFrom(db?.warmup),
    cooldown: numberFrom(db?.cooldown),
    exercises: numberFrom(db?.exercises),
    buffer: numberFrom(db?.buffer),
  };

  // Если сессия совсем короткая, даём по 1 минуте на разминку/заминку.
  if (sessionMinutes <= 35) {
    const warmup = 1;
    const cooldown = 1;
    const buffer = original.buffer ?? 0;
    const exercises = Math.max(0, sessionMinutes - warmup - cooldown - buffer);
    const changed =
      original.warmup !== warmup ||
      original.cooldown !== cooldown ||
      original.exercises !== exercises;
    return {
      updated: { warmup, cooldown, exercises, buffer: buffer || undefined, calculation: db?.calculation },
      note: changed ? "Поджали разминку/заминку до 1+1 мин для короткой сессии" : null,
    };
  }

  // Базовые значения, если AI не дал.
  let warmup = original.warmup ?? 10;
  let cooldown = original.cooldown ?? 5;
  const buffer = original.buffer ?? 0;

  // Ограничиваем сумму разминка+заминка максимум 15 мин.
  const sum = warmup + cooldown;
  if (sum > 15) {
    const ratio = 15 / sum;
    warmup = Math.max(1, Math.round(warmup * ratio));
    cooldown = Math.max(1, Math.round(cooldown * ratio));
    const adjusted = warmup + cooldown;
    if (adjusted > 15) {
      const diff = adjusted - 15;
      if (warmup >= cooldown) warmup = Math.max(1, warmup - diff);
      else cooldown = Math.max(1, cooldown - diff);
    }
  }

  // Всё оставшееся время отдаём основной части.
  const exercises = Math.max(0, sessionMinutes - warmup - cooldown - buffer);

  const changed =
    warmup !== original.warmup ||
    cooldown !== original.cooldown ||
    exercises !== original.exercises ||
    buffer !== (original.buffer ?? 0);

  return {
    updated: {
      warmup,
      cooldown,
      exercises,
      buffer: buffer || undefined,
      calculation: db?.calculation,
    },
    note: changed ? "Сбалансировали длительность: разминка+заминка ≤15 мин, остальное в основную часть" : null,
  };
}

function describeEquipment(onboarding: any) {
  return "полностью оборудованный тренажёрный зал: свободные веса (гантели, штанги, гири), силовые стойки, машины Смита, блочные тренажёры, кроссоверы, тренажёры для ног, кардиооборудование. считай что доступен весь стандартный инвентарь хорошо оснащённого зала";
}

function formatBlocksForPrompt(blocks: SessionBlock[]): string {
  return blocks
    .map(
      (b, idx) =>
        `${idx + 1}. role=${b.role}; focus="${b.focus}"; мышцы=[${b.targetMuscles.join(
          ", "
        )}]; интенсивность=${b.intensity}; объём=${b.setsPlanned} подходов (${b.repRange}); заметки: ${
          b.notes || "—"
        }`
    )
    .join("\n");
}

function buildTrainerPrompt(params: {
  profile: Profile;
  onboarding: any;
  program: ProgramRow;
  constraints: Constraints;
  targetExercises: number | null;
  sessionMinutes: number;
  historySummaryShort: string;
  progressionSummaryShort: string;
  antiRepeatBlock: string;
  weekContext: WeekContext;
  sessionStructure: SessionStructure;
  weeklyLoadSummary: WeeklyLoadSummary;
}): string {
  const {
    profile,
    onboarding,
    program,
    constraints,
    targetExercises,
    sessionMinutes,
    historySummaryShort,
    progressionSummaryShort,
    antiRepeatBlock,
    weekContext,
    sessionStructure,
    weeklyLoadSummary,
  } = params;
  const blueprint = program.blueprint_json;
  const todayDay = blueprint.days[program.day_idx];
  const todayFocus = todayDay.focus || todayDay.label; // используем focus если есть, иначе label для обратной совместимости
  const trainingStatusNotes = getTrainingStatusPrompt(profile.trainingStatus);

  const clientData = buildClientDataBlock(profile, onboarding, constraints, weekContext);
  const safetyNotes = buildSafetyGuidelines(profile, onboarding, constraints);
  const blocksFormatted = formatBlocksForPrompt(sessionStructure.blocks);
  const mainMinutes = Math.max(
    0,
    sessionStructure.totalPlannedMinutes - sessionStructure.warmupMinutes - sessionStructure.cooldownMinutes
  );

  return `# ТЫ — ПЕРСОНАЛЬНЫЙ ТРЕНЕР

Ты опытный тренер с 15+ годами практики. Твоя задача — создать тренировку для конкретного человека, учитывая ВСЕ его данные и текущее состояние.

Ты не автомат по шаблонам. Ты думающий тренер, который адаптирует программу под клиента.

${clientData}

# ИСТОРИЯ И НЕДЕЛЯ (КОРОТКО)
${historySummaryShort}

# ЧТО НЕ ПОВТОРЯТЬ (из последних тренировок)
${antiRepeatBlock}

${buildFocusRules(todayFocus)}
${buildGoalAccents(onboarding?.goals?.primary || null)}

# СТРУКТУРА СЕГОДНЯШНЕЙ СЕССИИ
- День: ${sessionStructure.dayLabel}
- Режим: ${sessionStructure.mode}${sessionStructure.hardTimeCap ? " (жёсткий таймкап по времени)" : ""}
- Цель сессии: ${sessionStructure.goalSummary}
- Ожидаемое число упражнений: ~${sessionStructure.expectedExercisesCount}
- Плановый объём: ~${sessionStructure.totalPlannedSets} подходов, ~${sessionStructure.totalPlannedMinutes} минут
- Время: разминка ~${sessionStructure.warmupMinutes} мин, основная часть ~${mainMinutes} мин, заминка ~${sessionStructure.cooldownMinutes} мин
- Приоритеты: ${sessionStructure.priorityNotes}

# БЛОКИ СЕССИИ (оставь порядок, наполни упражнениями)
${blocksFormatted}

# УРОВЕНЬ ПОДГОТОВКИ
${trainingStatusNotes}

# ПРОГРАММА
- Название: ${blueprint.name}
- Описание: ${blueprint.description || "нет описания"}
- Неделя: ${program.week}, День: ${program.day_idx + 1}/${program.microcycle_len}
- Глобальная неделя тренировок: ${weekContext.globalWeekIndex ?? program.week}
- Структура недели: ${blueprint.days.map(d => d.label).join(" → ")}
- Сегодняшний день: **${todayDay.label}**
- Фокус дня: **${todayFocus}**
${targetExercises ? `- Цель по количеству упражнений: ~${targetExercises}` : ""}
- Целевая длительность: ${sessionMinutes} минут
- Пользователь указал доступное время на эту сессию: ${sessionMinutes} минут

# НЕДЕЛЬНАЯ НАГРУЗКА (JSON)
${JSON.stringify(weeklyLoadSummary, null, 2)}

# ПРОГРЕССИЯ (КОРОТКО)
${progressionSummaryShort}

${safetyNotes}

# ТВОЯ ЗАДАЧА

Создай тренировку, которая:
- Соответствует дню "${todayFocus}" и уже заданной структуре блоков (role/focus/targetMuscles/интенсивность/объём).
- Для каждого блока подбери одно или несколько упражнений, которые логично реализуют его фокус. Не меняй порядок и не игнорируй блоки.
- Учитывает текущее состояние клиента (восстановление, стресс, сон, травмы).
- Обеспечивает прогрессию (если клиент готов) или восстановление (если нужно).
- Не копирует недавние тренировки — используй вариации упражнений.
- Безопасна для здоровья клиента.
- Разминка + заминка вместе ≤ 15 минут; всё остальное время — основная часть.
- Используй доступное время максимально эффективно: при нормальном состоянии заполняй всю сессию полноценным объёмом; если состояние слабое — укажи это в timeNotes и адаптируй объём.
- Указывай рабочий вес в кг так, чтобы последние 1–2 повтора были с усилием (RPE ~8).
- Если по упражнению нет истории весов: давай консервативный стартовый ориентир и явно подпиши, что это стартовый вес, который нужно подобрать в первом подходе без геройства. Избегай экстремальных чисел без истории.

# ФОРМАТ ОТВЕТА

JSON (response_format json_object):
{
  "title": "Короткое название (2-4 слова, по-русски, отражает фокус тренировки)",
  "targetDuration": число (сколько минут планируешь),
  "estimatedDuration": число (расчёт по пунктам ниже),
  "durationBreakdown": {
    "warmup": число,
    "exercises": число,
    "cooldown": число,
    "buffer": число,
    "calculation": "Текстовое объяснение как ты посчитал время"
  },
  "timeNotes": "как ты посчитал время: разминка X мин, упражнения/отдых Y мин, заминка Z мин",
  "warmup": ["пункт 1", "пункт 2", ...],
  "exercises": [
    {
      "name": "Название упражнения",
      "sets": <количество>,
      "reps": "<диапазон>",
      "restSec": <секунды>,
      "weight": "<вес> кг" или null,
      "targetMuscles": ["мышца1", "мышца2"],
      "cues": "Техническая подсказка"
    }
  ],
  "cooldown": ["пункт 1", "пункт 2", ...],
  "notes": "Объяснение логики тренировки в 2-3 предложениях"
}

**Важно:**
- Пиши по-русски ВСЕ поля и значения, включая title. Никаких английских слов.
- Название делай коротким (2–4 слова), только по-русски, чтобы сразу было понятно, что за тренировка и на что акцент.
- Подбирай реалистичные значения подходов/повторов/отдыха исходя из уровня клиента и длительности сессии.
- Обязательно укажи, как ты посчитал время в durationBreakdown.calculation.`.trim();
}

// Блок фактов о клиенте
function buildClientDataBlock(
  profile: Profile,
  onboarding: any,
  constraints: Constraints,
  weekContext: WeekContext
): string {
  const sections: string[] = [];

  sections.push(`## Базовые данные
- Возраст: ${profile.age || "не указан"}
- Пол: ${profile.sex === "unknown" ? "не указан" : profile.sex === "male" ? "мужской" : "женский"}
- Вес: ${profile.weight ? `${profile.weight} кг` : "не указан"}
- Рост: ${profile.height ? `${profile.height} см` : "не указан"}
- Опыт тренировок: ${profile.trainingStatus}
- Цели: ${profile.goals.join(", ")}`);

  sections.push(`## График и локация
- Тренировок в неделю: ${profile.daysPerWeek}
- Целевая длительность сессии: ${profile.minutesPerSession} минут
- Локация: ${profile.location}
- Оборудование: ${describeEquipment(onboarding)}`);

  const healthItems: string[] = [];
  if (profile.chronicInjuries.length > 0) {
    healthItems.push(`- **Хронические травмы:** ${profile.chronicInjuries.join(", ")}`);
  }
  if (profile.chronicLimitations.length > 0) {
    healthItems.push(`- **Хронические ограничения:** ${profile.chronicLimitations.join(", ")}`);
  }
  if (profile.chronicConditions.length > 0) {
    healthItems.push(`- **Хронические состояния:** ${profile.chronicConditions.join(", ")}`);
  }
  if (profile.todayInjuries.length > 0) {
    healthItems.push(`- **Травмы сегодня:** ${profile.todayInjuries.join(", ")}`);
  }
  if (profile.todayLimitations.length > 0) {
    healthItems.push(`- **Ограничения сегодня:** ${profile.todayLimitations.join(", ")}`);
  }
  if (profile.pain.length > 0) {
    const painList = profile.pain
      .map((p) => {
        const level = p.level != null ? ` (уровень ${p.level}/10)` : "";
        return `${p.location}${level}`;
      })
      .join(", ");
    healthItems.push(`- **Текущие боли:** ${painList}`);
  }
  if (!healthItems.length) {
    healthItems.push("- Ограничений и травм не указано");
  }
  sections.push(`## Здоровье\n${healthItems.join("\n")}`);

  const lifestyleItems: string[] = [];
  if (profile.stressLevel) {
    lifestyleItems.push(`- Уровень стресса: ${profile.stressLevel}`);
  }
  if (profile.sleepHours !== null) {
    lifestyleItems.push(`- Сон: ${profile.sleepHours} часов/ночь`);
  }
  if (profile.sleepQuality) {
    lifestyleItems.push(`- Качество сна: ${profile.sleepQuality}`);
  }
  if (profile.energyLevel) {
    lifestyleItems.push(`- Уровень энергии: ${profile.energyLevel}`);
  }
  if (profile.motivation) {
    lifestyleItems.push(`- Мотивация: ${profile.motivation}`);
  }
  if (profile.mood) {
    lifestyleItems.push(`- Настроение: ${profile.mood}`);
  }
  if (lifestyleItems.length) {
    sections.push(`## Образ жизни и восстановление\n${lifestyleItems.join("\n")}`);
  }

  if (profile.sex === "female" && profile.menstrualCycle) {
    const cycleItems: string[] = [];
    if (profile.menstrualCycle.phase) {
      cycleItems.push(`- Фаза цикла: ${profile.menstrualCycle.phase}`);
    }
    if (profile.menstrualCycle.symptoms.length > 0) {
      cycleItems.push(`- Симптомы: ${profile.menstrualCycle.symptoms.join(", ")}`);
    }
    if (cycleItems.length) {
      sections.push(`## Женское здоровье\n${cycleItems.join("\n")}`);
    }
  }

  if (profile.nutritionInfo?.diet || profile.nutritionInfo?.hydration) {
    const nutritionItems: string[] = [];
    if (profile.nutritionInfo.diet) {
      nutritionItems.push(`- Тип питания: ${profile.nutritionInfo.diet}`);
    }
    if (profile.nutritionInfo.hydration) {
      nutritionItems.push(`- Гидратация: ${profile.nutritionInfo.hydration}`);
    }
    if (nutritionItems.length) {
      sections.push(`## Питание\n${nutritionItems.join("\n")}`);
    }
  }

  const currentStateItems: string[] = [];
  if (constraints.recovery.hoursSinceLast !== null) {
    currentStateItems.push(`- Часов с последней тренировки: ${constraints.recovery.hoursSinceLast}`);
  }
  if (constraints.lastRpe) currentStateItems.push(`- RPE прошлой тренировки: ${constraints.lastRpe}/10`);
  if (constraints.plateau) currentStateItems.push("- Плато: объём не растёт несколько тренировок");
  if (constraints.deloadSuggested) currentStateItems.push("- Deload рекомендован: признаки перетренированности");
  if (currentStateItems.length > 0) {
    sections.push(`## Текущее состояние\n${currentStateItems.join("\n")}`);
  }

  sections.push(`## Контекст недели
- Глобальная неделя программы: ${weekContext.globalWeekIndex}
- Выполнено тренировок на этой неделе: ${weekContext.sessionsThisWeek} из ${profile.daysPerWeek}
- Текущая сессия: ${weekContext.todayIndexInWeek} по счёту`);

  return `# КЛИЕНТ\n\n${sections.join("\n\n")}`;
}

// Правила фокуса дня + баланс на неделе (мягкие направления без жёстких запретов)
function buildFocusRules(todayFocus: string): string {
  return `## Фокус дня: "${todayFocus}"

**Соблюдай фокус дня:**
- Push → акцент на толкающих движениях верхней части: грудь, передние/средние дельты, трицепс. Объём ног и тягов верхом давай так, чтобы не ломать логику недели.
- Pull → акцент на тянущих движениях: спина, задние дельты, бицепс, трапеции. Жимы могут быть вспомогательно, если это не сбивает фокус и баланс недели.
- Upper → жимы и тяги верхом в сбалансированном объёме (примерно 1:1 по подходам), с разными углами и пучками плеч.
- Lower → квадрицепсы, ягодицы, бицепс бедра, икры. На уровне недели держи сопоставимый объём квадрицепс ↔ задняя цепь.
- Full Body → сбалансируй всё тело: в каждой такой тренировке должны быть ноги, толкающее движение верхом и тянущее движение верхом.
- Legs/Glutes/специализация → акцент на указанную группу, но остальным крупным мышцам давай поддерживающий объём в течение недели.

**Принципы баланса на УРОВНЕ НЕДЕЛИ:**
- Стремись к балансу антагонистов по недельному объёму (по рабочим подходам): жимы ↔ тяги, грудь ↔ спина, квадрицепсы ↔ задняя цепь.
- Проверяй, не перегружена ли одна группа за счёт другой на протяжении недели, если пользователь не просил сделать акцент.
- Внутри одной тренировки чередуй углы и оборудование, избегай 3+ однотипных упражнений подряд на одну и ту же группу (например, несколько жимов подряд).`;
}

// Акценты по цели (мягко, без шаблонов)
function buildGoalAccents(goalPrimary: string | null): string {
  if (!goalPrimary) return "";
  const goal = String(goalPrimary);
  if (goal === "build_muscle" || goal === "strength") {
    return `## Акцент по цели
- Набор массы/сила: дай достаточный объём базовых движений, контролируй прогрессию весов, отдых 90–120 сек при необходимости.
- Следи за техникой, избегай лишнего «пампинга» в ущерб качеству движения.`;
  }
  if (goal === "athletic_body" || goal === "lose_weight") {
    return `## Акцент по цели
- Атлетичность/рельеф: держи тренировку плотной, контролируй отдых (60–90 сек), добавляй кор/стабилизацию и вариативность углов.
- Объём умеренный, без перегруза одной группы; качество движений важнее суммарного веса.`;
  }
  if (goal === "health_wellness") {
    return `## Акцент по цели
- Здоровье/самочувствие: умеренный объём, техника и контроль нагрузки важнее тяжёлых весов.
- Добавь мобилити/кор, избегай избыточной осевой нагрузки, учитывай восстановление.`;
  }
  if (goal === "lower_body_focus") {
  return `## Акцент по цели
- Акцент на нижнюю часть: приоритизируй ноги/ягодицы, но сохраняй поддерживающий объём на верх в течение недели.`;
  }
  return "";
}

// Этап 2: генерация структуры сессии (блоки, объём, акценты — без упражнений)
async function generateSessionStructure(params: {
  profile: Profile;
  onboarding: any;
  program: ProgramRow;
  constraints: Constraints;
  checkIn: DailyCheckIn | null;
  history: HistorySession[];
  weekContext: WeekContext;
  weekSessions: HistorySession[];
  sessionMinutes: number;
  exercisesTarget: ExercisesTarget;
  weeklyLoadSummary: WeeklyLoadSummary;
}): Promise<SessionStructure> {
  const {
    profile,
    onboarding,
    program,
    constraints,
    checkIn,
    history,
    weekContext,
    weekSessions,
    sessionMinutes,
    exercisesTarget,
    weeklyLoadSummary,
  } = params;

  const blueprint = program.blueprint_json;
  const todayDay = blueprint.days[program.day_idx];
  const todayFocus = todayDay.focus || todayDay.label; // используем focus если есть, иначе label для обратной совместимости

  // Тяжёлые блоки истории/прогрессии — считаем на этапе 2 и потом сжимаем
  const historyBlockFull = buildHistoryBlock(history, weekSessions);
  const progressionFull = buildProgressionContext(
    history,
    weekContext.globalWeekIndex,
    profile.trainingStatus
  );

  if (process.env.DEBUG_WORKOUT_PROMPT === "1") {
    console.log("\n=== FULL HISTORY BLOCK ===");
    console.log(historyBlockFull);
    console.log("\n=== FULL PROGRESSION CONTEXT ===");
    console.log(progressionFull);
  }

  // Подготовить компактный payload, без лишнего текста
  const payload = {
    profile: {
      sex: profile.sex,
      age: profile.age,
      trainingStatus: profile.trainingStatus,
      goals: profile.goals,
      daysPerWeek: profile.daysPerWeek,
      minutesPerSession: profile.minutesPerSession,
      trainingAgeWeeks: profile.trainingAgeWeeks,
      weeklyTargetSessions: profile.weeklyTargetSessions,
      recoveryScore: profile.recoveryScore,
      fatigueScore: profile.fatigueScore,
    },
    today: {
      focus: todayFocus,
      sessionMinutes,
      checkIn,
    },
    weekContext: {
      globalWeekIndex: weekContext.globalWeekIndex,
      sessionsThisWeek: weekContext.sessionsThisWeek,
      todayIndexInWeek: weekContext.todayIndexInWeek,
    },
    historySummary: {
      lastRpe: constraints.lastRpe,
      hoursSinceLast: constraints.recovery.hoursSinceLast,
      plateau: constraints.plateau,
      deloadSuggested: constraints.deloadSuggested,
      recentSessions: history.slice(0, 3).map((s) => ({
        date: s.date,
        avgRpe: s.avgRpe,
        exercises: s.exercises.length,
      })),
    },
    weeklyLoad: calculateMuscleVolume(weekSessions),
    weeklyLoadSummary,
    targetExercises: exercisesTarget,
  };

  const prompt = `
Сформируй СТРУКТУРУ тренировки (без перечисления конкретных упражнений).

Тебе дан клиент, его недельная программа и контекст недели. Твоя задача — разбить сегодняшнюю сессию на логичные блоки (main_lift, secondary, accessory и т.д.), распределить объём и интенсивность, учесть цели, историю и восстановление.

Не перечисляй конкретные упражнения и не давай названия упражнений. Работай на уровне блоков и мышечных групп.

Если клиентка и указаны цикл или симптомы, учитывай это при выборе интенсивности и распределении нагрузки, но принимай решение самостоятельно — нет жёстких правил, клиентка может тренироваться как обычно по самочувствию.

Верни только JSON:
{
  "dayLabel": "краткое описание фокуса дня",
  "goalSummary": "1-2 предложения, чего мы добиваемся этой сессией",
  "blocks": [
    {
      "role": "main_lift" | "secondary" | "accessory" | "isolation" | "core" | "conditioning" | "mobility" | "recovery",
      "focus": "краткое описание блока",
      "targetMuscles": ["строки"],
      "intensity": "easy" | "moderate" | "hard",
      "setsPlanned": число,
      "repRange": "строка, без примеров упражнений",
      "notes": "зачем этот блок и как он работает в контексте недели"
    }
  ],
  "warmupMinutes": число,
  "cooldownMinutes": число,
  "expectedExercisesCount": число,
  "priorityNotes": "ключевые приоритеты и компромиссы по объёму/интенсивности"
}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Ты опытный персональный тренер. На этом этапе ты НЕ придумываешь упражнения, а только структуру сессии: блоки, объём, акценты.",
      },
      { role: "user", content: `${prompt}\n\nДанные:\n${JSON.stringify(payload, null, 2)}` },
    ],
  });

  const raw = completion.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw);

  // Минимальная валидация структуры
  if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
    throw new AppError("AI не вернул структуру блоков сессии", 500);
  }

  const mappedBlocks: SessionBlock[] = parsed.blocks.map(
    (b: any): SessionBlock => ({
      role: b.role,
      focus: String(b.focus || ""),
      targetMuscles: Array.isArray(b.targetMuscles) ? b.targetMuscles.map(String) : [],
      intensity: b.intensity || "moderate",
      setsPlanned: Number.isFinite(b.setsPlanned) ? Math.round(b.setsPlanned) : 6,
      repRange: String(b.repRange || "6-12"),
      notes: String(b.notes || ""),
    })
  );

  const totalPlannedSets = mappedBlocks.reduce<number>(
    (sum, b) => sum + (Number.isFinite(b.setsPlanned) ? b.setsPlanned : 0),
    0
  );
  const totalPlannedMinutes =
    numberFrom(parsed.totalPlannedMinutes) ??
    numberFrom(parsed.targetDuration) ??
    sessionMinutes;
  const hardTimeCap = checkIn?.availableMinutes != null;
  const historySummaryShort = compressHistoryToShortSummary(historyBlockFull, history, weekSessions);
  const weekLoadSummaryShort = compressWeekLoadToShortSummary(weekSessions, weeklyLoadSummary);
  const progressionSummaryShort = compressProgressionToShortSummary(
    progressionFull,
    history,
    weekContext.globalWeekIndex,
    profile.trainingStatus
  );
  const lastSessionsCompact = buildLastSessionsCompact(history);

  const structure: SessionStructure = {
    dayLabel: String(parsed.dayLabel || program.blueprint_json.days[program.day_idx]),
    goalSummary: String(parsed.goalSummary || "Структура сессии под цели клиента"),
    mode: isSessionMode(parsed.mode) ? parsed.mode : pickSessionMode(profile, constraints),
    blocks: mappedBlocks,
    warmupMinutes: Number.isFinite(parsed.warmupMinutes) ? parsed.warmupMinutes : 8,
    cooldownMinutes: Number.isFinite(parsed.cooldownMinutes) ? parsed.cooldownMinutes : 5,
    expectedExercisesCount: numberFrom(parsed.expectedExercisesCount) ?? exercisesTarget.count,
    totalPlannedSets,
    totalPlannedMinutes,
    hardTimeCap,
    priorityNotes: String(parsed.priorityNotes || ""),
    antiRepeatNotes: buildAntiRepeatBlock(history),
    historySummaryShort,
    weekLoadSummaryShort,
    progressionSummaryShort,
    lastSessionsCompact,
  };

  return structure;
}

// Блок истории без директив анти-повтора
function buildHistoryBlock(history: HistorySession[], weekSessions: HistorySession[]): string {
  const sections: string[] = [];

  if (!history.length) {
    sections.push(`# ИСТОРИЯ ТРЕНИРОВОК

Это первая тренировка клиента. Начни осторожно, оцени его базовый уровень.`);
  } else {
    const recentHistory = history
      .slice(0, 5)
      .map((session, idx) => {
        const when = idx === 0 ? "Последняя тренировка" : `${idx + 1}-я назад`;
        const date = new Date(session.date).toLocaleDateString("ru-RU");

        const exercises = session.exercises
          .slice(0, 12)
          .map((ex) => {
            const stats = averageSetStats(ex);
            const setsCount =
              Array.isArray(ex.sets) && ex.sets.length > 0
                ? ex.sets.length
                : "?";
            const repsText = stats.reps ? `${Math.round(stats.reps)} повт.` : ex.reps || "—";
            const weightText = stats.weight ? `${stats.weight.toFixed(1)} кг` : "собств. вес";
            const effortMap: Record<string, string> = {
              easy: "легко (RPE ~6)",
              working: "рабочий (RPE ~7)",
              quite_hard: "тяжеловато (RPE ~8)",
              hard: "тяжело (RPE ~9)",
              max: "предел (RPE ~10)",
            };
            const effortTag = ex.effort ? ` [ощущение: ${effortMap[ex.effort] || ex.effort}]` : "";
            const muscles =
              ex.targetMuscles && ex.targetMuscles.length > 0 ? ` (${ex.targetMuscles.join(", ")})` : "";

            return `  • ${ex.name}${muscles}: ${setsCount} × ${repsText}, ${weightText}${effortTag}`;
          })
          .join("\n");

        const meta: string[] = [];
        if (session.avgRpe) meta.push(`RPE ${session.avgRpe}/10`);
        if (session.volumeKg) meta.push(`объём ${Math.round(session.volumeKg)} кг`);
        const metaText = meta.length ? ` — ${meta.join(", ")}` : "";

        return `${when} (${date})${metaText}:\n${exercises}`;
      })
      .join("\n\n");

    sections.push(`# ИСТОРИЯ ТРЕНИРОВОК

## Последние 5 тренировок
${recentHistory}

**Используй историю для:**
- Понимания паттернов (какие мышцы нагружались, как клиент восстанавливается)
- Прогрессии весов (не копируй один-в-один, но отталкивайся от прошлых результатов)
- Избегания повторов (меняй углы, оборудование, порядок упражнений)`);
  }

  if (weekSessions.length === 0) {
    sections.push(`# КОНТЕКСТ ТЕКУЩЕЙ НЕДЕЛИ

На этой неделе ещё не было тренировок. Это первая тренировка недели.`);
  } else {
    const weekDetails = weekSessions
      .map((session, idx) => {
        const dayNum = idx + 1;
        const date = new Date(session.date).toLocaleDateString("ru-RU");
        const title = session.title || `Тренировка ${dayNum}`;

        const exercises = session.exercises
          .slice(0, 12)
          .map((ex) => {
            const stats = averageSetStats(ex);
            const setsCount =
              Array.isArray(ex.sets) && ex.sets.length > 0
                ? ex.sets.length
                : "?";
            const repsText = stats.reps ? `${Math.round(stats.reps)}` : ex.reps || "—";
            const weightText = stats.weight ? `${stats.weight.toFixed(1)}кг` : "вес тела";
            const effortMap: Record<string, string> = {
              easy: "легко (RPE ~6)",
              working: "рабочий (RPE ~7)",
              quite_hard: "тяжеловато (RPE ~8)",
              hard: "тяжело (RPE ~9)",
              max: "предел (RPE ~10)",
            };
            const effortTag = ex.effort ? ` [ощущение: ${effortMap[ex.effort] || ex.effort}]` : "";
            const muscles =
              ex.targetMuscles && ex.targetMuscles.length > 0 ? ` [${ex.targetMuscles.join(", ")}]` : "";

            return `  • ${ex.name}${muscles}: ${setsCount}×${repsText} @${weightText}${effortTag}`;
          })
          .join("\n");

        const rpeText = session.avgRpe ? `, RPE ${session.avgRpe}/10` : "";
        const volumeText = session.volumeKg ? `, объём ${Math.round(session.volumeKg)}кг` : "";

        return `**День ${dayNum}** (${date}) — ${title}${rpeText}${volumeText}:\n${exercises}`;
      })
      .join("\n\n");

    const muscleVolume = calculateMuscleVolume(weekSessions);
    const muscleVolumeText = groupMuscles(muscleVolume);
    const totalVolume = weekSessions.reduce((sum, s) => sum + (s.volumeKg || 0), 0);
    const totalSets = Object.values(muscleVolume).reduce((a, b) => a + b, 0);

    sections.push(`# КОНТЕКСТ ТЕКУЩЕЙ НЕДЕЛИ

## Выполненные тренировки (${weekSessions.length})
${weekDetails}

## Нагрузка по мышечным группам на этой неделе
${muscleVolumeText}

## Общий объём недели
- Всего подходов: ${totalSets}
- Общий объём: ${Math.round(totalVolume)} кг

**Учитывай при планировании:**
- Какие группы уже получили достаточно нагрузки на этой неделе
- Какие группы нужно добавить или сбалансировать
- Не перегружай уже усталые мышцы без веской причины`);
  }

  return sections.join("\n\n");
}

function buildProgressionContext(
  history: HistorySession[],
  globalWeekIndex: number | null,
  trainingStatus: TrainingStatus
): string {
  const week = globalWeekIndex ?? 1;

  if (!history.length) {
    const firstTimeGuidance =
      trainingStatus === "beginner"
        ? "Начни с консервативных весов и простых движений. Приоритет — обучение технике."
        : "Первая тренировка в приложении — оцени текущую форму и адаптируй под неё нагрузку.";

    return `# КОНТЕКСТ ПРОГРЕССИИ

Это первая тренировка клиента в приложении.
${firstTimeGuidance}`;
  }

  const sections: string[] = [];

  let stageDescription = "";
  if (trainingStatus === "beginner") {
    if (week <= 4) {
      stageDescription = `Неделя ${week} из первого месяца. Ранняя стадия: адаптация к нагрузкам, изучение техники базовых движений.`;
    } else if (week <= 8) {
      stageDescription = `Неделя ${week}, второй месяц. Средняя стадия: техника закреплена, начинается постепенная прогрессия весов.`;
    } else if (week <= 12) {
      stageDescription = `Неделя ${week}, третий месяц. Поздняя стадия начального периода: активная прогрессия, можно усложнять упражнения.`;
    } else {
      stageDescription = `Неделя ${week}. Клиент вышел из начального периода — продолжай стандартную линейную прогрессию.`;
    }
  } else if (trainingStatus === "intermediate") {
    if (week <= 8) {
      stageDescription = `Неделя ${week} в приложении. Продолжай линейную прогрессию весов — клиент в активной фазе роста.`;
    } else {
      const cycleNum = Math.floor((week - 1) / 8) + 1;
      stageDescription = `Неделя ${week} в приложении (цикл ${cycleNum}). Можно начинать варьировать нагрузку для избежания плато.`;
    }
  } else {
    stageDescription = `Неделя ${week} в приложении. Опытный атлет — используй волновую периодизацию и варьируй интенсивность.`;
  }
  sections.push(`## Стадия программы\n${stageDescription}`);

  const recentSessions = history.slice(0, 5);
  const weightProgression: string[] = [];
  type WeightTrack = { name: string; weights: number[] };
  const exerciseMap = new Map<string, WeightTrack>();
  recentSessions.forEach((session) => {
    session.exercises.forEach((ex) => {
      const stats = averageSetStats(ex);
      if (stats.weight && stats.weight > 0 && ex.name) {
        const key = slugify(ex.name);
        if (!exerciseMap.has(key)) {
          exerciseMap.set(key, { name: ex.name, weights: [] });
        }
        exerciseMap.get(key)!.weights.push(stats.weight);
      }
    });
  });

  exerciseMap.forEach(({ name, weights }) => {
    if (weights.length >= 2) {
      const last = weights[0];
      const first = weights[weights.length - 1];
      const change = last - first;
      const changePercent = (change / first) * 100;
      if (Math.abs(changePercent) >= 5) {
        weightProgression.push(
          `${name}: веса ${change > 0 ? "растут" : "падают"} (${change.toFixed(1)} кг, ${changePercent.toFixed(
            0
          )}%)`
        );
      }
    }
  });

  if (weightProgression.length > 0) {
    sections.push(
      `## Прогресс весов за последние 5 тренировок\n${weightProgression.map((x) => `- ${x}`).join("\n")}`
    );
  } else {
    sections.push(`## Прогресс весов\n- Веса стабильны (нет значимых изменений ±5% за последние тренировки)`);
  }

  const volumes = recentSessions.map((s) => s.volumeKg).filter((v) => v > 0);
  if (volumes.length >= 3) {
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const last = volumes[0];
    const first = volumes[volumes.length - 1];
    let trend = "стабилен";
    if (last > first * 1.1) trend = "растёт";
    else if (last < first * 0.9) trend = "снижается";
    sections.push(
      `## Объём тренировок\n- Средний объём за последние ${volumes.length} тренировок: ${Math.round(
        avgVolume
      )} кг\n- Тренд: ${trend}`
    );
  }

  const rpes = recentSessions.map((s) => s.avgRpe).filter((r): r is number => r != null);
  if (rpes.length >= 2) {
    const avgRpe = rpes.reduce((a, b) => a + b, 0) / rpes.length;
    let rpeNote = "";
    if (avgRpe >= 9) rpeNote = "Последние тренировки были очень тяжёлыми — можно снизить интенсивность или дать восстановление";
    else if (avgRpe <= 6) rpeNote = "Последние тренировки давались легко — можно увеличить нагрузку";
    else rpeNote = "Интенсивность оптимальна";
    sections.push(
      `## Интенсивность\n- Средний RPE за последние ${rpes.length} тренировок: ${avgRpe.toFixed(
        1
      )}/10\n- ${rpeNote}`
    );
  }

  return `# КОНТЕКСТ ПРОГРЕССИИ\n\n${sections.join("\n\n")}`;
}

// Минимальные правила безопасности
function buildSafetyGuidelines(
  profile: Profile,
  onboarding: any,
  constraints: Constraints
): string {
  const guidelines: string[] = [];

  if (constraints.weightNotes.length > 0) {
    guidelines.push(`## Рекомендации по весам (на основе истории)
${constraints.weightNotes.map((note) => `- ${note}`).join("\n")}

Для новых упражнений: выбирай вес, с которым клиент сможет сделать на 2-3 повтора больше запланированного (запас прочности).`);
  } else {
    guidelines.push(`## Рекомендации по весам
Это первые тренировки клиента. Начни с консервативных весов — клиент должен освоить технику, а не гнаться за рекордами.`);
  }

  const injuries = [...(profile.chronicInjuries || []), ...(profile.todayInjuries || [])];
  const limitations = [...(profile.chronicLimitations || []), ...(profile.todayLimitations || [])];
  const pains = profile.pain || [];

  if (injuries.length > 0 || limitations.length > 0 || pains.length > 0) {
    guidelines.push(`## ⚠️ Критически важно
${injuries.length > 0 ? `- Травмы: ${injuries.join(", ")} — исключи упражнения, нагружающие эти зоны; замени на безопасные варианты` : ""}
${limitations.length > 0 ? `- Ограничения: ${limitations.join(", ")} — учитывай при выборе упражнений, убери осевые нагрузки и болезненные амплитуды` : ""}
${pains.length > 0 ? `- Текущие боли: ${pains.map((p) => p.location).join(", ")} — не нагружай эти области сегодня, выбирай щадящие движения` : ""}

Правило: если упомянута часть тела (рука/плечо/локоть/запястье/колено/спина/шея/стопа и т.д.), исключи упражнения, где эта часть — ключевой ограничитель (жимы, тяги, присед/становая, планки, подтягивания и т.п.). Замени на безболезненные варианты или перенеси акцент на другие зоны.
Если болят/травмированы руки/плечи — смести фокус на ноги/ягодицы/кор/кардио без вовлечения рук.
Если болят/травмированы ноги/стопы/колени — делай верх/кор, без прыжков и осевой нагрузки.
Если болит спина/шея — без осевой нагрузки и тяжёлых тяг/жимов стоя; больше машин, изоляций, мобилити.`);
  }

  if (profile.trainingStatus === "beginner") {
    guidelines.push(`## Новичок
- Простые движения (машины, гантели лучше штанги)
- Больше времени на разучивание техники
- Консервативные веса
- Подробные технические подсказки (cues)`);
  }

  const highStress = profile.stressLevel === "high" || profile.stressLevel === "very_high";
  const poorSleep = profile.sleepHours != null && profile.sleepHours < 6;

  if (highStress || poorSleep) {
    guidelines.push(`## Восстановление под вопросом
${highStress ? "- Высокий уровень стресса — возможно, стоит снизить интенсивность" : ""}
${poorSleep ? "- Недостаточный сон — центральная нервная система не восстановлена" : ""}

Если клиент выглядит перегруженным (по истории RPE, комментариям), лучше сделать лёгкую/среднюю тренировку, чем загнать в перетрен.`);
  }

  if (constraints.deloadSuggested) {
    guidelines.push(`## Рекомендуется разгрузка (deload)
- Снизь объём (меньше подходов/упражнений)
- Или снизь интенсивность (веса)
- Цель: дать организму восстановиться, а не добить его`);
  }

  return guidelines.length > 0
    ? `# РЕКОМЕНДАЦИИ ПО БЕЗОПАСНОСТИ\n\n${guidelines.join("\n\n")}`
    : "";
}

// ============================================================================
// ROUTE: ГЕНЕРАЦИЯ ТРЕНИРОВКИ
// ============================================================================

plan.post(
  "/generate",
  asyncHandler(async (req: any, res: Response) => {
    const tStart = Date.now();
    const userId = ensureUser(req);
    const tz = resolveTimezone(req);
    const force = Boolean(req.body?.force);
    const onboarding = await getOnboarding(userId);
    const isAdmin = isAdminUser(userId);

    logSection("🎯 WORKOUT GENERATION REQUEST");
    console.log(`User ID: ${userId}`);
    console.log(`Timezone: ${tz}`);
    console.log(`Force: ${force}`);
    logData("Request body", req.body ?? {});

    try {
      // Подписка / пробник
      await ensureSubscription(userId, "workout");
      console.log("✓ Subscription check passed");

      let existing = await getLatestWorkoutPlan(userId);
      console.log("✓ Loaded latest plan meta");

      // Лимиты по частоте
      const todaySessions = await q<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt
           FROM workouts
          WHERE user_id = $1
            AND (created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
        [userId, tz]
      );
      const todayPlans = await q<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt
           FROM workout_plans
          WHERE user_id = $1
            AND (created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
        [userId, tz]
      );
      console.log(
        `✓ Daily counters: sessions=${todaySessions[0]?.cnt ?? 0}, plans=${todayPlans[0]?.cnt ?? 0}`
      );

      if (
        !isAdmin &&
        ((todaySessions[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT ||
          (todayPlans[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT)
      ) {
        const nextIso = await getNextDailyResetIso(tz);
        const nextLabel = formatDateLabel(new Date(nextIso), tz, { weekday: "long" });

        if (existing && existing.status !== "failed" && !isAdmin) {
          const createdSameDay =
            existing.created_at &&
            dateIsoFromTimestamp(existing.created_at, tz) === currentDateIsoInTz(tz);
          if (createdSameDay) {
            throw new AppError(
              "Вы уже сгенерировали тренировку. Чтобы получить следующую, завершите текущую и сохраните результат — так мы поддерживаем прогрессию.",
              429,
              {
                code: "active_plan",
                details: { reason: "active_plan", nextDateIso: nextIso, nextDateLabel: nextLabel },
              }
            );
          }
        }

        throw new AppError(
          "Новую тренировку можно будет сгенерировать завтра — телу нужно восстановиться после нагрузки.",
          429,
          {
            code: "daily_limit",
            details: { reason: "daily_limit", nextDateIso: nextIso, nextDateLabel: nextLabel },
          }
        );
      }

      const lastSession = await getLastWorkoutSession(userId);

      if (lastSession) {
        console.log("✓ Last session found");
      }

      // Проверка валидности последней тренировки
      if (lastSession && !isAdmin) {
        if (!lastSession.completed_at) {
          throw new AppError(
            "Сначала заверши текущую тренировку, потом сгенерируем новую.",
            403
          );
        }
        if (lastSession.unlock_used) {
          throw new AppError("Следующая тренировка появится после выполнения текущей.", 403);
        }
      }

      if (lastSession) {
        console.log("✓ Last session validated");
      }

      // Недельный лимит
      if (!isAdmin && WEEKLY_WORKOUT_EXTRA_SOFT_CAP >= 0) {
        const desiredDaysPerWeek = Number(onboarding?.schedule?.daysPerWeek) || 3;
        const softCap = desiredDaysPerWeek + WEEKLY_WORKOUT_EXTRA_SOFT_CAP;
        const weeklySessions = await q<{ cnt: number }>(
          `SELECT COUNT(*)::int AS cnt
             FROM workout_sessions
            WHERE user_id = $1
              AND finished_at >= date_trunc('week', (now() AT TIME ZONE $2))`,
          [userId, tz]
        );
        console.log(`✓ Weekly sessions: ${weeklySessions[0]?.cnt ?? 0} / softCap ${softCap}`);
        if ((weeklySessions[0]?.cnt || 0) >= softCap) {
          const nextIso = await getNextWeeklyResetIso(tz);
          const nextLabel = formatDateLabel(new Date(nextIso), tz, { weekday: "long" });
          throw new AppError(
            `Вы достигли недельного лимита тренировок. Программа строится под выбранный ритм — сейчас это ${desiredDaysPerWeek} тренировки в неделю. Если хотите увеличить нагрузку, обновите настройки в анкете.`,
            429,
            {
              code: "weekly_limit",
              details: {
                reason: "weekly_limit",
                nextDateIso: nextIso,
                nextDateLabel: nextLabel,
                weeklyTarget: desiredDaysPerWeek,
              },
            }
          );
        }
      }

      console.log("\n=== GENERATING WORKOUT (async) ===");
      console.log("User ID:", userId, "force:", force);

      if (existing && !force) {
        console.log("Existing plan status:", existing.status);
        return res.json(buildWorkoutPlanResponse(existing));
      }

      const shell = await createWorkoutPlanShell(userId);
      console.log("Queued workout plan:", shell.id);

      queueWorkoutPlanGeneration({ planId: shell.id, userId, tz });

      res.json(buildWorkoutPlanResponse(shell));
    } catch (err) {
      console.error("/generate failed:", err);
      throw err;
    } finally {
      logTiming("Generate handler total", tStart);
    }
  })
);

plan.get(
  "/current",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    const current = await getLatestWorkoutPlan(userId);
    if (!current) {
      return res.status(404).json({ error: "workout_plan_not_found" });
    }
    res.json(buildWorkoutPlanResponse(current));
  })
);

plan.get(
  "/status/:planId",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    const { planId } = req.params;
    if (!isUUID(planId)) {
      throw new AppError("Invalid plan id", 400);
    }
    const row = await getWorkoutPlanById(planId);
    if (!row || row.user_id !== userId) {
      return res.status(404).json({ error: "workout_plan_not_found" });
    }
    res.json(buildWorkoutPlanResponse(row));
  })
);

// ============================================================================ 
// CHECK-IN ENDPOINTS
// ============================================================================

plan.post(
  "/check-in",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    const data = req.body || {};

    logSection("💾 CHECK-IN SAVE REQUEST");
    console.log(`User ID: ${userId}`);
    logData("Check-in data", data);

    if (data.sleepHours != null && (data.sleepHours < 0 || data.sleepHours > 24)) {
      throw new AppError("sleepHours must be between 0 and 24", 400);
    }

    if (data.availableMinutes != null) {
      const av = Number(data.availableMinutes);
      if (!Number.isFinite(av) || av < 10 || av > 240) {
        throw new AppError("availableMinutes must be between 10 and 240", 400);
      }
    }

    const validEnergy = ["low", "medium", "high"];
    if (data.energyLevel && !validEnergy.includes(data.energyLevel)) {
      throw new AppError(`energyLevel must be one of: ${validEnergy.join(", ")}`, 400);
    }

    const validStress = ["low", "medium", "high", "very_high"];
    if (data.stressLevel && !validStress.includes(data.stressLevel)) {
      throw new AppError(`stressLevel must be one of: ${validStress.join(", ")}`, 400);
    }

    const validSleepQuality = ["poor", "fair", "good", "excellent"];
    if (data.sleepQuality && !validSleepQuality.includes(data.sleepQuality)) {
      throw new AppError(`sleepQuality must be one of: ${validSleepQuality.join(", ")}`, 400);
    }

    const validMotivation = ["low", "medium", "high"];
    if (data.motivation && !validMotivation.includes(data.motivation)) {
      throw new AppError(`motivation must be one of: ${validMotivation.join(", ")}`, 400);
    }

    const validPhases = ["follicular", "ovulation", "luteal", "menstruation"];
    if (data.menstrualPhase && !validPhases.includes(data.menstrualPhase)) {
      throw new AppError(`menstrualPhase must be one of: ${validPhases.join(", ")}`, 400);
    }

    const validHydration = ["poor", "adequate", "good"];
    if (data.hydration && !validHydration.includes(data.hydration)) {
      throw new AppError(`hydration must be one of: ${validHydration.join(", ")}`, 400);
    }

    const tSave = Date.now();
    const result = await q(
      `INSERT INTO daily_check_ins (
        user_id,
        injuries, limitations, pain,
        sleep_hours, sleep_quality, stress_level, energy_level,
        motivation, mood,
        menstrual_phase, menstrual_symptoms,
        hydration, last_meal, notes,
        available_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (user_id, (DATE(created_at AT TIME ZONE 'UTC')))
      DO UPDATE SET
        injuries = EXCLUDED.injuries,
        limitations = EXCLUDED.limitations,
        pain = EXCLUDED.pain,
      sleep_hours = EXCLUDED.sleep_hours,
        sleep_quality = EXCLUDED.sleep_quality,
        stress_level = EXCLUDED.stress_level,
        energy_level = EXCLUDED.energy_level,
        motivation = EXCLUDED.motivation,
        mood = EXCLUDED.mood,
        menstrual_phase = EXCLUDED.menstrual_phase,
        menstrual_symptoms = EXCLUDED.menstrual_symptoms,
        hydration = EXCLUDED.hydration,
        last_meal = EXCLUDED.last_meal,
        notes = EXCLUDED.notes,
        available_minutes = EXCLUDED.available_minutes,
        updated_at = NOW()
      RETURNING id, created_at`,
      [
        userId,
        data.injuries || null,
        data.limitations || null,
        data.pain || null,
        data.sleepHours || null,
        data.sleepQuality || null,
        data.stressLevel || null,
        data.energyLevel || null,
        data.motivation || null,
        data.mood || null,
        data.menstrualPhase || null,
        data.menstrualSymptoms || null,
        data.hydration || null,
        data.lastMeal || null,
        data.notes || null,
        data.availableMinutes || null,
      ]
    );

    logTiming("Database save", tSave);
    console.log(`✅ Check-in saved: ${result[0].id}`);
    console.log(`   Created at: ${result[0].created_at}`);

    res.json({
      ok: true,
      checkInId: result[0].id,
      createdAt: result[0].created_at,
    });
  })
);

plan.get(
  "/check-in/latest",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    const checkIn = await getLatestCheckIn(userId);
    if (!checkIn) {
      return res.json({ found: false, message: "no_recent_check_in" });
    }
    res.json({ found: true, checkIn });
  })
);

type WorkoutGenerationJob = { planId: string; userId: string; tz: string };

function queueWorkoutPlanGeneration(job: WorkoutGenerationJob) {
  setTimeout(() => {
    generateWorkoutPlan(job).catch(async (err) => {
      console.error("Async workout generation failed:", err);
      await markWorkoutPlanFailed(
        job.planId,
        (err as any)?.message?.slice(0, 500) ?? "AI error"
      );
    });
  }, 0);
}

async function generateWorkoutPlan({ planId, userId, tz }: WorkoutGenerationJob) {
  const tTotal = Date.now();
  logSection("🤖 ASYNC WORKOUT GENERATION START");
  console.log(`Plan ID: ${planId}`);
  console.log(`User ID: ${userId}`);
  console.log(`Timezone: ${tz}`);

  try {
    await setWorkoutPlanProgress(planId, "context", 15);
    const tContext = Date.now();
    console.log("\n📦 Loading context data...");

    const onboarding = await getOnboarding(userId);
    console.log("✓ Onboarding loaded:", Object.keys(onboarding || {}).join(", "));

    const checkIn = await getLatestCheckIn(userId);
    if (checkIn) {
      console.log("✓ Check-in found:", {
        createdAt: checkIn.createdAt,
        ageHours: Math.round((Date.now() - new Date(checkIn.createdAt).getTime()) / 3600000),
        sleepHours: checkIn.sleepHours,
        energyLevel: checkIn.energyLevel,
        stressLevel: checkIn.stressLevel,
        motivation: checkIn.motivation,
        availableMinutes: checkIn.availableMinutes,
        injuries: checkIn.injuries,
        limitations: checkIn.limitations,
        pain: checkIn.pain,
      });
    } else {
      console.log("⚠️  No recent check-in found (48h window)");
    }

    const sessionMinutes =
      numberFrom(checkIn?.availableMinutes) ?? DEFAULT_SESSION_MINUTES;
    console.log(`✓ Session duration: ${sessionMinutes} minutes`);

    const trainingAgeWeeksVal = await getGlobalWeekIndex(userId, tz);
    const weeklyTargetSessions = Number(onboarding?.schedule?.daysPerWeek) || 3;

    let profile = buildProfile(onboarding, sessionMinutes, checkIn, trainingAgeWeeksVal, weeklyTargetSessions);
    console.log("✓ Profile built:", {
      age: profile.age,
      sex: profile.sex,
      trainingStatus: profile.trainingStatus,
      goals: profile.goals,
      daysPerWeek: profile.daysPerWeek,
      minutesPerSession: profile.minutesPerSession,
      location: profile.location,
      energyLevel: profile.energyLevel,
      sleepHours: profile.sleepHours,
      stressLevel: profile.stressLevel,
      painCount: profile.pain.length,
    });

    const program = await getOrCreateProgram(userId, onboarding, profile);
    console.log("✓ Program loaded:", {
      name: program.blueprint_json.name,
      week: program.week,
      dayIdx: program.day_idx,
      microcycleLen: program.microcycle_len,
      todayFocus: program.blueprint_json.days[program.day_idx],
    });

    const history = summarizeHistory(await getRecentSessions(userId, 10));
    console.log(`✓ History loaded: ${history.length} sessions`);
    if (history.length > 0) {
      console.log(`  Last session: ${new Date(history[0].date).toISOString()}`);
      console.log(`  Last RPE: ${history[0].avgRpe}`);
      console.log(`  Last volume: ${history[0].volumeKg} kg`);
    }

    const weekContext = await buildWeekContext(userId, tz);
    console.log("✓ Week context:", {
      globalWeekIndex: weekContext.globalWeekIndex,
      sessionsThisWeek: weekContext.sessionsThisWeek,
      todayIndexInWeek: weekContext.todayIndexInWeek,
    });

    const weekSessions = summarizeHistory(await getWeekSessions(userId, tz));
    console.log(`✓ Week sessions: ${weekSessions.length}`);
    const weeklyLoadSummary = buildWeeklyLoadSummary(weekSessions);
    const historySummaryShort = buildHistorySummaryShort(history, weekSessions);
    const progressionSummaryShort = buildProgressionSummaryShort(
      history,
      weekContext.globalWeekIndex,
      profile.trainingStatus
    );

    const constraints = buildConstraints(profile, history);
    const recoveryFatigue = computeRecoveryFatigue(profile, constraints);
    profile = { ...profile, ...recoveryFatigue };
    console.log("✓ Constraints built:", {
      weightGuardsCount: Object.keys(constraints.weightGuards).length,
      hoursSinceLast: constraints.recovery.hoursSinceLast,
      lastRpe: constraints.lastRpe,
      plateau: constraints.plateau,
      deloadSuggested: constraints.deloadSuggested,
      recoveryScore: profile.recoveryScore,
      fatigueScore: profile.fatigueScore,
    });

    logTiming("Context loading", tContext);

    await setWorkoutPlanProgress(planId, "prompt", 30);
    const tPrompt = Date.now();
    console.log("\n📝 Building prompt...");

    const exercisesTarget = await recommendExercisesCount({
      profile,
      onboarding,
      checkIn,
      history,
      sessionMinutes,
      constraints,
    });
    console.log("✓ Target exercises (AI):", exercisesTarget);

    const sessionStructure = await generateSessionStructure({
      profile,
      onboarding,
      program,
      constraints,
      checkIn,
      history,
      weekContext,
      weekSessions,
      sessionMinutes,
      exercisesTarget,
      weeklyLoadSummary,
    });
    console.log("✓ Session structure built:", {
      blocks: sessionStructure.blocks.length,
      expectedExercisesCount: sessionStructure.expectedExercisesCount,
      warmupMinutes: sessionStructure.warmupMinutes,
      cooldownMinutes: sessionStructure.cooldownMinutes,
    });

    const antiRepeatBlock = buildAntiRepeatBlock(history);

    const prompt = buildTrainerPrompt({
      profile,
      onboarding,
      program,
      constraints,
      targetExercises: exercisesTarget.count,
      sessionMinutes,
      historySummaryShort,
      progressionSummaryShort,
      antiRepeatBlock,
      weekContext,
      sessionStructure,
      weeklyLoadSummary,
    });

    console.log("✓ Prompt built:");
    console.log(`  Total length: ${prompt.length} chars`);
    console.log(`  Estimated tokens: ~${Math.round(prompt.length / 4)}`);
    console.log("\n--- PROMPT PREVIEW (first 1000 chars) ---");
    console.log(prompt.slice(0, 1000));
    console.log("--- END PREVIEW ---\n");

    logTiming("Prompt building", tPrompt);

    await setWorkoutPlanProgress(planId, "ai", 55);
    const tAi = Date.now();
    console.log("\n🤖 Calling OpenAI API...");
    console.log(`  Model: gpt-4o`);
    console.log(`  Temperature: ${TEMPERATURE}`);
    console.log(`  Top P: ${TOP_P}`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: TEMPERATURE,
      top_p: TOP_P,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TRAINER_SYSTEM },
        { role: "user", content: prompt },
      ],
    });
    console.log("✓ AI Response received:");
    console.log(`  Prompt tokens: ${completion.usage?.prompt_tokens ?? "?"}`);
    console.log(`  Completion tokens: ${completion.usage?.completion_tokens ?? "?"}`);
    console.log(`  Total tokens: ${completion.usage?.total_tokens ?? "?"}`);
    console.log(`  Finish reason: ${completion.choices[0].finish_reason}`);

    logTiming("OpenAI API call", tAi);

    const tParse = Date.now();
  console.log("\n🔍 Parsing AI response...");

  let plan: WorkoutPlan;
  try {
    const rawResponse = completion.choices[0].message.content || "{}";
      console.log("\n--- AI RESPONSE (raw JSON) ---");
      console.log(rawResponse);
      console.log("--- END AI RESPONSE ---\n");

      plan = JSON.parse(rawResponse);
      console.log("✓ JSON parsed successfully");
    } catch (err) {
      console.error(" JSON parse error:", err);
      throw new AppError("AI returned invalid JSON", 500);
  }

  // Консервативные веса: если нет истории — просим подобрать; с историей — в диапазоне
  const applyWeightClamp = (p: WorkoutPlan, guards: Constraints["weightGuards"]) => {
    if (!Array.isArray(p.exercises)) return;

    for (const ex of p.exercises) {
      const key = slugify(ex.name || "");
      const guard = guards[key]; // только точное совпадение
      const rawW = (ex as any).weight;
      const num = numberFrom(rawW);
      console.log("[WEIGHT_CLAMP]", {
        name: ex.name,
        key,
        hasGuard: !!guard,
        guard,
        rawWeight: rawW,
      });

      // Нет истории — просим подобрать вес руками
      if (!guard) {
        (ex as any).weight = "Подбери рабочий вес";
        if (!ex.cues) {
          ex.cues = "Стартовый вес подбирай на месте: первый подход лёгкий, техника идеальна.";
        }
        continue;
      }

      // Есть история, но AI не указал вес → ставим recommended
      if (num == null) {
        (ex as any).weight = formatWeight(guard.recommended) || undefined;
        if (!ex.cues) {
          ex.cues =
            "Ориентируйся на этот вес из прошлых тренировок; если слишком легко или тяжело — скорректируй на 2–5 кг.";
        }
        continue;
      }

      // AI дал число: зажимаем в диапазон безопасных весов
      let w = num;
      if (w < guard.min) w = guard.min;
      if (w > guard.max) w = guard.max;
      (ex as any).weight = formatWeight(w) || undefined;
    }
  };
  applyWeightClamp(plan, constraints.weightGuards);

  const targetDurationCandidate = numberFrom((plan as any).targetDuration);
  const estimatedDurationCandidate = numberFrom((plan as any).estimatedDuration);
  const sessionMinutesFinal =
    estimatedDurationCandidate ??
      targetDurationCandidate ??
      DEFAULT_SESSION_MINUTES;

    const targetDuration = targetDurationCandidate ?? sessionMinutesFinal;
    const estimatedDuration = estimatedDurationCandidate ?? sessionMinutesFinal;

    // Ужимаем разминку/заминку и перераспределяем на основную часть
    const clamped = rebalanceDurationBreakdown(plan.durationBreakdown, sessionMinutesFinal);
    if (clamped.note) {
      console.warn(`  ⚠️  ${clamped.note}`);
      if (plan.timeNotes) {
        plan.timeNotes = `${plan.timeNotes} | ${clamped.note}`;
      } else {
        plan.timeNotes = clamped.note;
      }
    }
    plan.durationBreakdown = clamped.updated;

    console.log("✓ Plan structure:", {
      title: plan.title,
      exercisesCount: plan.exercises?.length ?? 0,
      warmupItems: plan.warmup?.length ?? 0,
      cooldownItems: plan.cooldown?.length ?? 0,
      hasNotes: Boolean(plan.notes),
      targetDuration,
      estimatedDuration,
      timeUsage:
        estimatedDuration && targetDuration
          ? `${Math.round((estimatedDuration / targetDuration) * 100)}%`
          : "N/A",
    });

    if ((plan as any).timeNotes) {
      console.log("\n⏱  AI Time Calculation:");
      console.log(`  "${(plan as any).timeNotes}"`);
    }

    if ((plan as any).durationBreakdown) {
      const db = (plan as any).durationBreakdown as any;
      const sum =
        (numberFrom(db.warmup) ?? 0) +
        (numberFrom(db.exercises) ?? 0) +
        (numberFrom(db.cooldown) ?? 0) +
        (numberFrom(db.buffer) ?? 0);
      console.log("\n⏱️  Duration Breakdown:");
      console.log(`  Warmup: ${db.warmup ?? "?"} min`);
      console.log(`  Exercises: ${db.exercises ?? "?"} min`);
      console.log(`  Cooldown: ${db.cooldown ?? "?"} min`);
      console.log(`  Buffer: ${db.buffer ?? "?"} min`);
      if (db.calculation) {
        console.log(`  Calculation: "${db.calculation}"`);
      }
      console.log(`  Sum: ${sum} min (expected: ${(plan as any).estimatedDuration ?? "?"})`);
      if ((plan as any).estimatedDuration != null && Math.abs(sum - (plan as any).estimatedDuration) > 5) {
        console.warn(`    Mismatch! Sum (${sum}) != estimated (${(plan as any).estimatedDuration})`);
      }
    } else {
      console.log("\n  No duration breakdown provided by AI");
    }

    if (plan.exercises && plan.exercises.length > 0) {
      console.log("\n Exercises list:");
      plan.exercises.forEach((ex, idx) => {
        console.log(`  ${idx + 1}. ${ex.name}`);
        console.log(
          `     Sets: ${ex.sets}, Reps: ${ex.reps}, Rest: ${ex.restSec}s, Weight: ${ex.weight || "bodyweight"}`
        );
        console.log(`     Muscles: ${(ex.targetMuscles || []).join(", ")}`);
      });
    }

    plan.duration = sessionMinutesFinal;
    await setWorkoutPlanProgress(planId, "validation", 80);

    console.log("\n Validating plan structure...");
  const validation = validatePlanStructure(plan, constraints, sessionMinutesFinal, sessionStructure);
  plan = validation.plan;

  if (validation.warnings.length) {
    console.log("  Validation warnings:");
      validation.warnings.forEach((w) => console.log(`  - ${w}`));
    } else {
      console.log("✓ No validation warnings");
    }

  console.log("\n✓ Final plan:", {
    exercisesCount: plan.exercises.length,
    totalSets: plan.exercises.reduce((sum, ex) => sum + ex.sets, 0),
    estimatedDuration: plan.duration,
  });

    logTiming("Parsing & validation", tParse);

    const tSave = Date.now();
    console.log("\n Saving to database...");

    const analysis = {
      historySummary: constraints.historySummary,
      recovery: "no_interpretation",
      hoursSinceLast: constraints.recovery.hoursSinceLast,
      lastRpe: constraints.lastRpe,
      plateau: constraints.plateau,
      deloadSuggested: constraints.deloadSuggested,
      weightNotes: constraints.weightNotes,
      warnings: validation.warnings,
    };

    await markWorkoutPlanReady(planId, plan, analysis);
    console.log(`✓ Plan saved: ${planId}`);

    logTiming("Database save", tSave);
    logTiming("TOTAL GENERATION TIME", tTotal);

    const lastSession = await getLastWorkoutSession(userId);
    if (lastSession?.completed_at && !lastSession.unlock_used) {
      await q(`UPDATE workouts SET unlock_used = true WHERE id = $1`, [lastSession.id]);
      console.log("✓ Previous session marked as used");
    }

    logSection(" WORKOUT GENERATION COMPLETE");
  } catch (err) {
    console.error("\n GENERATION FAILED:");
    console.error(err);
    await markWorkoutPlanFailed(planId, (err as any)?.message?.slice(0, 500) ?? "AI error");
    throw err;
  }
}

function validatePlanStructure(
  plan: WorkoutPlan,
  constraints: Constraints,
  sessionMinutes: number,
  sessionStructure?: SessionStructure
) {
  const normalized: WorkoutPlan = {
    title: plan.title || "Персональная тренировка",
    duration: sessionMinutes,
    targetDuration: plan.targetDuration ?? sessionMinutes,
    estimatedDuration:
      numberFrom((plan as any).estimatedDuration ?? (plan as any).duration) ??
      sessionMinutes,
    durationBreakdown: plan.durationBreakdown
      ? (() => {
          const db = (plan as any).durationBreakdown ?? {};
          const numOrUndef = (v: any) => {
            const n = numberFrom(v);
            return n != null ? n : undefined;
          };
          const mapped = {
            warmup: numOrUndef(db.warmup),
            exercises: numOrUndef(db.exercises),
            cooldown: numOrUndef(db.cooldown),
            buffer: numOrUndef(db.buffer),
            calculation: typeof db.calculation === "string" ? db.calculation : undefined,
          };
          return mapped;
        })()
      : undefined,
    timeNotes: (plan as any).timeNotes,
    warmup: Array.isArray(plan.warmup) ? plan.warmup : [],
    exercises: Array.isArray(plan.exercises) ? plan.exercises : [],
    cooldown: Array.isArray(plan.cooldown) ? plan.cooldown : [],
    notes: plan.notes || "",
  };

  const warnings: string[] = [];

  if (!normalized.exercises.length) {
    throw new AppError("AI не создал ни одного упражнения", 500);
  }

  if (normalized.exercises.length > ABSOLUTE_MAX_EXERCISES) {
    warnings.push(
      `AI создал ${normalized.exercises.length} упражнений — урезали до ${ABSOLUTE_MAX_EXERCISES} для UI`
    );
    normalized.exercises = normalized.exercises.slice(0, ABSOLUTE_MAX_EXERCISES);
  }

  if (normalized.exercises.length < ABSOLUTE_MIN_EXERCISES && sessionMinutes >= 30) {
    warnings.push(
      `AI создал только ${normalized.exercises.length} упражнения — возможно, это легкий/делоад день`
    );
  }

  normalized.exercises = normalized.exercises.map((ex) => {
    const updated = { ...ex } as any;

    // sets
    let sets = Number(ex.sets);
    if (!Number.isFinite(sets) || sets <= 0) {
      sets = 3;
      warnings.push(`${ex.name}: AI не указал подходы, поставили 3`);
    } else if (sets > 10) {
      sets = 10;
      warnings.push(`${ex.name}: слишком много подходов (${ex.sets}), ограничили до 10`);
    }
    updated.sets = Math.round(sets);

    // reps
    if (!updated.reps || (typeof updated.reps === "string" && !/\d/.test(updated.reps))) {
      updated.reps = "8-12";
      warnings.push(`${ex.name}: не указаны повторы, поставили 8-12`);
    }

    // rest
    let restSec = Number(ex.restSec);
    if (!Number.isFinite(restSec) || restSec <= 0) {
      restSec = 90;
      warnings.push(`${ex.name}: не указан отдых, поставили 90 сек`);
    } else if (restSec < 15) {
      restSec = 30;
      warnings.push(`${ex.name}: отдых ${ex.restSec} сек слишком мал, подняли до 30`);
    } else if (restSec > 300) {
      restSec = 300;
      warnings.push(`${ex.name}: отдых ${ex.restSec} сек слишком велик, ограничили 300`);
    }
    updated.restSec = Math.round(restSec);

    // weight safety (повторная проверка на всякий случай)
    const guard = constraints.weightGuards[slugify(updated.name)];
    const numericWeight =
      numberFrom(updated.weight ?? ex.weight ?? null);
    if (guard && numericWeight != null) {
      let w = numericWeight;
      if (w < guard.min) {
        w = guard.min;
        updated.weight = formatWeight(w) || undefined;
        warnings.push(
          `${updated.name}: вес ${numericWeight} кг ниже безопасного минимума, подняли до ${updated.weight}`
        );
      } else if (w > guard.max) {
        w = guard.max;
        updated.weight = formatWeight(w) || undefined;
        warnings.push(
          `${updated.name}: вес ${numericWeight} кг выше безопасного, снизили до ${updated.weight}`
        );
      } else {
        updated.weight = formatWeight(w) || undefined;
      }
    }

    // targetMuscles/cues defaults
    updated.targetMuscles = Array.isArray(ex.targetMuscles) ? ex.targetMuscles : [];
    updated.cues = ex.cues || "Держи технику и контролируй движение";

    return updated as Exercise;
  });

  // Согласованность с SessionStructure
  if (sessionStructure) {
    const expected = sessionStructure.expectedExercisesCount;
    if (expected != null) {
      const diff = Math.abs(normalized.exercises.length - expected);
      if (diff > 3) {
        warnings.push(
          `Количество упражнений (${normalized.exercises.length}) заметно отличается от структуры (${expected})`
        );
      }
    }

    const targetGroups = new Set<string>();
    sessionStructure.blocks.forEach((b) => b.targetMuscles.forEach((m) => targetGroups.add(m.toLowerCase())));
    const hitGroups = new Set<string>();
    normalized.exercises.forEach((ex) =>
      (ex.targetMuscles || []).forEach((m) => hitGroups.add(String(m).toLowerCase()))
    );
    const missing = Array.from(targetGroups).filter((g) => !hitGroups.has(g));
    if (missing.length) {
      warnings.push(`Не покрыты целевые группы из структуры: ${missing.join(", ")}`);
    }
  }

  if (!normalized.warmup.length) {
    warnings.push("AI не создал разминку — добавь 3–5 пунктов");
  }
  if (!normalized.cooldown.length) {
    warnings.push("AI не создал заминку — восстановление может пострадать");
  }

  return { plan: normalized, warnings };
}

// ============================================================================
// ROUTE: СОХРАНЕНИЕ ЗАВЕРШЁННОЙ ТРЕНИРОВКИ
// ============================================================================

plan.post(
  "/save-session",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);

    const payload = req.body?.payload;
    const startedAtInput = req.body?.startedAt; // ISO date string
    const durationMinInput = req.body?.durationMin; // number

    if (!payload || !Array.isArray(payload.exercises)) {
      throw new AppError("Invalid payload: exercises array required", 400);
    }

    if (payload.exercises.length === 0) {
      throw new AppError("Cannot save empty workout", 400);
    }

    const plannedRaw = req.body?.plannedWorkoutId;
    const plannedWorkoutId = isUUID(plannedRaw) ? plannedRaw : null;

    logSection("💪 WORKOUT SESSION SAVE");
    console.log("User ID:", userId);
    console.log("Exercises:", payload.exercises.length);
    console.log("Title:", payload.title);
    if (payload?.feedback?.sessionRpe) {
      console.log(`Session RPE: ${payload.feedback.sessionRpe}/10`);
    }

    // Сохраняем в транзакции
    await q("BEGIN");

    try {
      // 1. Сохраняем тренировку КАК ЕСТЬ (не модифицируем!)
      const nowIso = new Date();
      let startedAt: Date | null = null;
      let completedAt: Date | null = null;

      if (startedAtInput && Number.isFinite(Number(durationMinInput))) {
        startedAt = new Date(startedAtInput);
        const durMin = Math.max(1, Number(durationMinInput));
        completedAt = new Date(startedAt.getTime() + durMin * 60000);
      } else {
        startedAt = nowIso;
        // если не дали длительность — ставим минимально реалистичную
        completedAt = new Date(nowIso.getTime() + MIN_REAL_DURATION_MIN * 60000);
      }

      const result = await q(
        `INSERT INTO workout_sessions (user_id, payload, finished_at)
         VALUES ($1, $2::jsonb, $3)
         RETURNING id, finished_at`,
        [userId, payload, completedAt]
      );

      // дублируем в workouts таблицу ключевые поля
      await q(
        `INSERT INTO workouts (user_id, plan, result, created_at, started_at, completed_at, unlock_used)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, false)`,
        [userId, payload, payload, completedAt, startedAt, completedAt]
      );

      console.log("✓ Saved session:", result[0].id);

      if (plannedWorkoutId) {
        await q(
          `UPDATE planned_workouts
              SET status = 'completed',
                  result_session_id = $3,
                  updated_at = NOW()
            WHERE id = $1 AND user_id = $2`,
          [plannedWorkoutId, userId, result[0].id]
        );
        console.log("✓ Planned workout completed:", plannedWorkoutId);
      } else {
        const finishedAt: string = result[0].finished_at;
        await q(
          `INSERT INTO planned_workouts (user_id, plan, scheduled_for, status, result_session_id)
           VALUES ($1, $2::jsonb, $3, 'completed', $4)`,
          [userId, payload, finishedAt, result[0].id]
        );
        console.log("✓ Created completed planned workout entry");
      }

      // 2. Двигаем программу на следующий день
    await q(
      `UPDATE training_programs
         SET day_idx = (day_idx + 1) % microcycle_len,
             week = CASE 
               WHEN (day_idx + 1) % microcycle_len = 0 THEN week + 1 
               ELSE week 
             END,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      console.log("✓ Program advanced");

      await q("COMMIT");

      res.json({
        ok: true,
        sessionId: result[0].id,
        finishedAt: result[0].finished_at,
      });
    } catch (err) {
      await q("ROLLBACK");
      console.error("Save failed:", err);
      throw err;
    }
  })
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

plan.get("/ping", (_req, res) => {
  res.json({ ok: true, version: "2.0-ai-first" });
});

export default plan;

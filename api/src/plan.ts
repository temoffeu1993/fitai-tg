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

export const plan = Router();

const openai = new OpenAI({ apiKey: config.openaiApiKey! });

// ============================================================================
// TYPES
// ============================================================================

type ProgramRow = {
  id: string;
  user_id: string;
  blueprint_json: {
    name: string;
    days: string[];
    description: string;
  };
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

type WorkoutPlan = {
  title: string;
  duration: number;
  warmup: string[];
  exercises: Exercise[];
  cooldown: string[];
  notes: string;
};

type Profile = {
  age: number | null;
  weight: number | null;
  height: number | null;
  sex: "male" | "female" | "unknown";
  experience: "beginner" | "intermediate" | "advanced";
  goals: string[];
  daysPerWeek: number;
  minutesPerSession: number;
  location: string;
  bodyweightOnly: boolean;
};

type HistoryExerciseSet = { reps?: number; weight?: number };
type EffortTag = "easy" | "normal" | "hard";
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
    label: string;
  };
  lastRpe: number | null;
  phase: {
    label: string;
    repScheme: string;
    notes: string;
  };
  plateau: boolean;
  deloadSuggested: boolean;
  volumeHint: string;
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

const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);

// Больше разнообразия
const TEMPERATURE = 0.7;
const TOP_P = 0.9;

const HISTORY_LIMIT = 5;
const MAX_EXERCISES = 10;
const MIN_EXERCISES = 5;
const DAILY_WORKOUT_LIMIT = 1;
const MIN_REAL_DURATION_MIN = 20;
const WEEKLY_WORKOUT_SOFT_LIMIT = 1; // включено: сверяем с онбордингом (+1 запас)
const MOSCOW_TZ = "Europe/Moscow";
const MS_PER_HOUR = 60 * 60 * 1000;

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

function minExercisesForDuration(duration: number) {
  if (duration >= 85) return 6;
  if (duration >= 70) return 6;
  if (duration >= 50) return 5;
  return 5;
}

function dynamicMinExercises(duration: number) {
  if (duration >= 85) return 6;
  if (duration >= 70) return 6;
  if (duration >= 50) return 5;
  return 5;
}

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

const PHASES = [
  { label: "Гипертрофия", repScheme: "8-12 повторов", notes: "умеренный вес, контролируемый темп" },
  { label: "Сила", repScheme: "4-6 повторов", notes: "более тяжёлые веса, отдых до 3 мин" },
  { label: "Выносливость", repScheme: "12-15 повторов", notes: "легче вес, короче отдых" },
];

const DAY_VOLUME_HINT: Record<string, string> = {
  Push: "7-9 подходов на грудь, 5-7 на плечи и трицепс",
  Pull: "8-10 подходов на спину, 4-6 на бицепс и задние дельты",
  Legs: "10-12 подходов на ноги + 3-4 на ягодицы/кор",
  "Upper Focus": "6-8 подходов на грудь и спину, по 3-4 на руки",
  "Lower Focus": "8-10 подходов на квадрицепс и бёдра, 4-6 на ягодицы",
  "Full Body": "по 3-4 подхода на каждую крупную группу без перегруза",
  "Upper": "6-8 подходов на грудь и спину, по 3-4 на руки",
  "Lower": "8-10 подходов на ноги и ягодицы",
  "Upper Circuit": "умеренный объём с более короткими паузами, упражнения по кругу",
  "Lower + Core": "ноги + кора, умеренный объём без фанатизма",
  "Upper Heavy": "чуть больше акцент на силовые подходы для верха",
  "Lower Volume": "чуть больше объёма по ногам",
  "Full Body Machine": "упор на тренажёры и безопасные вариации",
  "Full Body + Cardio": "фулбоди + низкоударное кардио",
  "Full Body Light": "лёгкая тренировка для восстановления",
  "Lower + Glutes": "много объёма на ноги и ягодицы",
  "Upper Push/Pull": "баланс груди/спины и рук",
  "Glutes + Core": "ягодицы и корпус",
  "Cardio + Core": "акцент на сердце и корпус",
};

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

function buildProfile(onboarding: any, minutesFallback: number): Profile {
  const sexRaw = (onboarding?.ageSex?.sex || "").toLowerCase();
  const experienceRaw = (onboarding?.experience || "intermediate").toLowerCase();
  return {
    age: numberFrom(onboarding?.ageSex?.age) ?? null,
    weight: numberFrom(onboarding?.body?.weight) ?? null,
    height: numberFrom(onboarding?.body?.height) ?? null,
    sex: sexRaw === "female" ? "female" : sexRaw === "male" ? "male" : "unknown",
    experience:
      experienceRaw.includes("novice") || experienceRaw.includes("begin")
        ? "beginner"
        : experienceRaw.includes("adv")
        ? "advanced"
        : "intermediate",
    goals: Array.isArray(onboarding?.goals)
      ? onboarding.goals
      : onboarding?.goals
      ? [onboarding.goals]
      : ["поддержание формы"],
    daysPerWeek: Number(onboarding?.schedule?.daysPerWeek) || 3,
    minutesPerSession: minutesFallback,
    location: onboarding?.environment?.location || "unknown",
    bodyweightOnly: Boolean(onboarding?.environment?.bodyweightOnly),
  };
}

function summarizeHistory(rows: any[]): HistorySession[] {
  return rows.map((row) => ({
    ...row,
    volumeKg: calcSessionVolume(row),
    avgRpe: numberFrom(row.payload?.feedback?.sessionRpe) ?? null,
  }));
}

function historyNarrative(history: HistorySession[]): string {
  if (!history.length) return "Это первая тренировка клиента, действуй осмотрительно.";
  return history
    .slice(0, HISTORY_LIMIT)
    .map((session, idx) => {
      const when = idx === 0 ? "Последняя" : `${idx + 1}-я назад`;
      const exercises = session.exercises
        .slice(0, 3)
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

function determinePhase(week: number) {
  if (!Number.isFinite(week) || week <= 0) return PHASES[0];
  const idx = Math.floor((week - 1) / 4) % PHASES.length;
  return PHASES[idx];
}

function hoursDiffFrom(dateISO?: string): number | null {
  if (!dateISO) return null;
  const ts = new Date(dateISO).getTime();
  if (Number.isNaN(ts)) return null;
  const diffMs = Date.now() - ts;
  return Math.max(0, Math.round(diffMs / 36e5));
}

function describeRecovery(hours: number | null, rpe: number | null): string {
  let base: string;
  if (hours == null) {
    base = "нет данных по отдыху";
  } else if (hours < 36) {
    base = "ещё не восстановился полностью — не перегружай";
  } else if (hours < 72) {
    base = "оптимально восстановлен";
  } else {
    base = "можно слегка увеличить нагрузку — отдых был долгим";
  }

  if (rpe != null) {
    if (rpe >= 9) return `${base}. Прошлая тренировка была очень тяжёлой (RPE ${rpe}).`;
    if (rpe <= 6) return `${base}. Прошлая тренировка далась легко (RPE ${rpe}).`;
    return `${base}. RPE прошлой тренировки: ${rpe}.`;
  }

  return base;
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
    recommended = stats.weight + increment;
  } else if (ex.effort === "hard") {
    recommended = Math.max(5, stats.weight - increment);
  }
  const min = stats.weight * 0.95;
  const max = stats.weight * 1.08;
  const bodyCap = profile.weight ? profile.weight * 2 : 999;
  return {
    min: Number(Math.max(0, Math.min(min, bodyCap)).toFixed(1)),
    max: Number(Math.min(max, bodyCap).toFixed(1)),
    recommended: Number(Math.min(recommended, bodyCap).toFixed(1)),
    last: Number(stats.weight.toFixed(1)),
  };
}

function buildConstraints(
  profile: Profile,
  history: HistorySession[],
  program: ProgramRow,
  sessionMinutes: number
): Constraints {
  const phase = determinePhase(program.week || 1);
  const historySummary = historyNarrative(history);
  const weightGuards: Record<string, WeightConstraint> = {};
  const weightNotes: string[] = [];

  for (const session of history.slice(0, 3)) {
    for (const ex of session.exercises.slice(0, 3)) {
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
      label: describeRecovery(hoursSinceLast, lastRpe),
    },
    lastRpe,
    phase,
    plateau,
    deloadSuggested,
    volumeHint:
      DAY_VOLUME_HINT[program.blueprint_json?.days[program.day_idx]] ||
      "Держи баланс по группам мышц",
    historySummary,
  };
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

function resolveSessionLength(onboarding: any): number {
  const raw = onboarding?.schedule || {};
  const candidates = [
    raw.minutesPerSession,
    raw.sessionLength,
    raw.duration,
    raw.length,
    raw.minutes,
    raw.timePerSession,
    onboarding?.preferences?.workoutDuration,
    onboarding?.profile?.sessionMinutes,
    onboarding?.profile?.workoutDuration,
  ];

  for (const value of candidates) {
    const parsed = parseDuration(value);
    if (parsed) return parsed;
  }

  return 60;
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

// Чуть более умный blueprint: зависит от целей/возраста/пола, а не только от daysPerWeek
async function getOrCreateProgram(
  userId: string,
  onboarding: any,
  profile: Profile
): Promise<ProgramRow> {
  const desiredDaysPerWeek = Number(onboarding?.schedule?.daysPerWeek) || 3;
  const desiredBlueprint = createBlueprint(desiredDaysPerWeek, profile, onboarding);

  const existing = await q<ProgramRow>(
    `SELECT * FROM training_programs WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  if (existing && existing[0]) {
    const stored = existing[0];
    const storedDays = stored.blueprint_json?.days || [];
    const desiredDays = desiredBlueprint.days;
    const sameBlueprint =
      Array.isArray(storedDays) &&
      storedDays.length === desiredDays.length &&
      storedDays.every((day: string, idx: number) => day === desiredDays[idx]);

    if (!sameBlueprint) {
      const updated = await q<ProgramRow>(
        `UPDATE training_programs
            SET blueprint_json = $2,
                microcycle_len = $3,
                day_idx = 0,
                week = 1,
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [stored.id, JSON.stringify(desiredBlueprint), desiredBlueprint.days.length]
      );
      return updated[0];
    }

    return stored;
  }

  const result = await q<ProgramRow>(
    `INSERT INTO training_programs (user_id, blueprint_json, microcycle_len, week, day_idx)
     VALUES ($1, $2, $3, 1, 0)
     RETURNING *`,
    [userId, JSON.stringify(desiredBlueprint), desiredBlueprint.days.length]
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

  return rows.map((row) => ({
    date: row.finished_at,
    title: row.payload?.title,
    exercises: (row.payload?.exercises || []).map((ex: any) => ({
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
  }));
}

// ============================================================================
// BLUEPRINT CREATION (базовая, но персонализированная логика)
// ============================================================================

function createBlueprint(daysPerWeek: number, profile: Profile, onboarding: any) {
  const goalText = JSON.stringify(onboarding?.goals ?? "").toLowerCase();
  const isWeightLoss =
    goalText.includes("сброс") ||
    goalText.includes("похуд") ||
    goalText.includes("жир") ||
    goalText.includes("weight loss");
  const isHypertrophy =
    goalText.includes("масса") ||
    goalText.includes("мышц") ||
    goalText.includes("гипертроф") ||
    goalText.includes("mass") ||
    goalText.includes("muscle");
  const age = profile.age ?? null;
  const isSenior = age != null && age >= 50;

  // 5+ дней — оставим классический PPL
  if (daysPerWeek >= 5) {
    return {
      name: "Push/Pull/Legs Split",
      days: ["Push", "Pull", "Legs", "Push", "Pull"],
      description: "Классический 5-дневный сплит по движениям",
    };
  }

  // 4 дня — Upper/Lower, но с разной философией
  if (daysPerWeek === 4) {
    if (isWeightLoss || isSenior || profile.experience === "beginner") {
      return {
        name: "Upper/Lower Circuit",
        days: ["Upper Circuit", "Lower + Core", "Upper Circuit", "Lower + Cardio"],
        description: "4-дневный сплит с круговыми сессиями и упором на безопасность и кардио",
      };
    }
    return {
      name: "Upper/Lower Split",
      days: ["Upper", "Lower", "Upper Heavy", "Lower Volume"],
      description: "Силовой 4-дневный сплит для прогрессии по весам и объёму",
    };
  }

  // ≤3 дней — разные варианты под цель и профиль
  if (isWeightLoss || isSenior) {
    return {
      name: "Full Body Easy",
      days: ["Full Body Machine", "Full Body + Cardio", "Full Body Light"],
      description:
        "3-дневный фулбоди с упором на здоровье суставов, машинами и низкоударным кардио",
    };
  }

  if (isHypertrophy && profile.sex === "female") {
    return {
      name: "Lower & Glutes Emphasis",
      days: ["Lower + Glutes", "Upper Push/Pull", "Glutes + Core"],
      description:
        "3-дневная программа с повышенным объёмом для ног и ягодиц, сбалансированная работой на верх тела",
    };
  }

  if (isHypertrophy) {
    return {
      name: "Full Body Split",
      days: ["Upper Focus", "Lower Focus", "Full Body"],
      description: "3-дневный фулбоди с вариацией акцентов для набора мышечной массы",
    };
  }

  // дефолт: общая физуха
  return {
    name: "General Fitness",
    days: ["Full Body", "Cardio + Core", "Full Body"],
    description: "Базовый 3-дневный план для общей физической формы и здоровья",
  };
}

// ============================================================================
// AI TRAINER PROMPT
// ============================================================================

const TRAINER_SYSTEM = `You are an expert personal trainer with 15+ years of experience in strength training, hypertrophy, and athletic performance.

Your approach:
- You understand periodization, progressive overload, and recovery
- You vary exercises to prevent plateaus and boredom
- You consider individual limitations and preferences
- You write detailed, helpful technique cues
- You think holistically about the client's journey

You are NOT a rigid algorithm. You are a thinking, adaptive coach.`;

function describeEquipment(onboarding: any) {
  const env = onboarding.environment || {};
  if (env.bodyweightOnly === true) {
    return "только вес собственного тела. нет штанги, нет тренажёров, нет станка для жима ногами, нет блочных машин";
  }

  const location = (env.location || "").toLowerCase();
  if (location === "gym" || location.includes("зал")) {
    return "полностью оборудованный тренажёрный зал: свободные веса (гантели, штанги, гири), силовые стойки, машины Смита, блочные тренажёры, кроссоверы, тренажёры для ног, кардиооборудование. считай что доступен весь стандартный инвентарь хорошо оснащённого зала";
  }

  if (location === "outdoor" || location.includes("street") || location.includes("улиц")) {
    return "уличная площадка: турник, брусья, петли TRX/эспандеры, скакалка, набивные мячи, лёгкие гантели. нет полноценных штанг и станков, упражнения адаптируй под площадку";
  }

  if (location === "home" || location.includes("дом")) {
    return "домашние условия: коврик, свободное пространство, стул/лавка, лёгкие гантели или резинки. нет больших тренажёров, но можно использовать мебель и подручный инвентарь";
  }

  return "простой инвентарь: коврик, резинки, лёгкие гантели, турник/брусья при наличии. если требуются тренажёры — замени на вариации с собственным весом.";
}

// Текстовый «портрет клиента» для явной персонализации
function buildClientPersona(profile: Profile, onboarding: any): string {
  const parts: string[] = [];

  const age = profile.age ?? null;
  const bmi =
    profile.height && profile.weight
      ? profile.weight / Math.pow(profile.height / 100, 2)
      : null;

  if (profile.sex === "female") {
    parts.push(
      "клиентка, ориентируйся на комфорт, технику и эстетические цели тела (ноги, ягодицы, осанка) без фанатизма по весам"
    );
  } else if (profile.sex === "male") {
    parts.push(
      "клиент-мужчина, обычно терпит чуть более высокую интенсивность, но техника важнее эго и рекордов"
    );
  } else {
    parts.push("пол не указан, опирайся прежде всего на цели и уровень подготовки");
  }

  if (age && age >= 50) {
    parts.push(
      "возраст 50+, приоритет — безопасность суставов, контроль техники, избегай резких плиометрик и экстремально тяжёлых базовых упражнений со штангой на спине в начале программы"
    );
  } else if (age && age < 25) {
    parts.push(
      "молодой возраст, можно немного выше объём и интенсивность, но не в ущерб технике и восстановлению"
    );
  }

  if (profile.experience === "beginner") {
    parts.push(
      "новичок — больше простых движений, машины/гантели, минимум сложной координации и мало упражнений «через голову»"
    );
  } else if (profile.experience === "advanced") {
    parts.push(
      "продвинутый — можно сложные многосуставные упражнения, вариации сплита и прогрессию нагрузки обязательна"
    );
  } else {
    parts.push("средний уровень — баланс между базой и изоляцией, аккуратная прогрессия веса");
  }

  if (bmi && bmi >= 30) {
    parts.push(
      "есть лишний вес (по ИМТ), избегай прыжков и ударной нагрузки, больше ходьбы и тренировок с низким ударным воздействием"
    );
  }

  const goalsRaw = onboarding?.goals;
  if (goalsRaw) {
    parts.push(
      `клиент так формулирует свои цели: "${JSON.stringify(
        goalsRaw
      )}" — учитывай формулировку, а не только общую категорию`
    );
  }

  return parts.join(";\n- ");
}

function buildTrainerPrompt(params: {
  profile: Profile;
  onboarding: any;
  program: ProgramRow;
  constraints: Constraints;
  sessionMinutes: number;
}): string {
  const { profile, onboarding, program, constraints, sessionMinutes } = params;
  const blueprint = program.blueprint_json;
  const todayFocus = blueprint.days[program.day_idx];

  const goalsText =
    profile.goals.map((g) => `- ${g}`).join("\n") || "- поддержание формы";
  const weightGuidance = constraints.weightNotes.length
    ? constraints.weightNotes.map((x) => `- ${x}`).join("\n")
    : "- Новые упражнения: выбирай вес на уровне 6/10 по ощущению и оставляй запас 2 повтора";

  const minExercises = minExercisesForDuration(sessionMinutes);
  const persona = buildClientPersona(profile, onboarding);

  return `# РОЛЬ
Ты персональный тренер с опытом 15+ лет. Безопасность важнее эго. Говори тоном живого тренера.

# ПРОФИЛЬ
- Возраст: ${profile.age ?? "?"}, пол: ${profile.sex}, опыт: ${profile.experience}
- Вес: ${profile.weight ?? "?"} кг, рост: ${profile.height ?? "?"} см
- Цели:
${goalsText}
- График: ${profile.daysPerWeek} тренировок в неделю, ${sessionMinutes} мин каждая
- Оборудование: ${describeEquipment(onboarding)}

# ПОРТРЕТ КЛИЕНТА
- ${persona}

# ПРОГРАММА
- Программа: ${blueprint.name}, неделя ${program.week}, день ${program.day_idx + 1}/${
    program.microcycle_len
  }
- Сегодня: ${todayFocus}
- Фаза: ${constraints.phase.label} (${constraints.phase.repScheme}) — ${
    constraints.phase.notes
  }
- План по объёму: ${constraints.volumeHint}

# СОСТОЯНИЕ
- Восстановление: ${constraints.recovery.label}
- Плато: ${constraints.plateau ? "обнаружено (держи объём под контролем)" : "нет признаков"}
- Deload рекомендуем? ${constraints.deloadSuggested ? "да, снизь объём/вес на 15%" : "не требуется"}

# ИСТОРИЯ (последние тренировки)
${constraints.historySummary}

# РЕКОМЕНДАЦИИ ПО ВЕСАМ
${weightGuidance}

# ПЕРСОНАЛИЗАЦИЯ (ОБЯЗАТЕЛЬНО)
- Тренировки для клиентов разного пола, возраста и опыта должны заметно отличаться по выбору упражнений, объёму и расстановке акцентов.
- Для более возрастных и/или менее подготовленных клиентов снижай сложность движений, больше используй машины и гантели, избегай высоких осевых нагрузок на позвоночник.
- Для клиентов с целью "снижение веса" добавляй больше низкоударного кардио и круговых тренировок; для "набора мышечной массы" — приоритет силовым упражнениям и прогрессии веса.
- Смотри на историю именно этого клиента: не повторяй дословно прошлую тренировку, меняй углы, снаряды, вариации упражнений.
- Два разных клиента с разными профилями не должны получать идентичные шаблоны тренировок — используй разные упражнения, акценты и объём.

# ЖЁСТКИЕ ПРАВИЛА
1. Продолжительность строго ${sessionMinutes} минут.
2. Кол-во упражнений ${minExercises}-${MAX_EXERCISES}. У тяжёлых базовых 3–4 подхода, у изоляции 2–3.
3. Меняй углы/оборудование, не повторяй точь-в-точь прошлую тренировку.
4. Не превышай диапазоны весов. Если данных нет — выбирай умеренно и оставляй запас 1–2 повтора.
5. Учитывай цели и фазу программы. Если рекомендован deload — снизь вес/подходы.
6. Warmup 3–5 пунктов под конкретные мышцы дня. Cooldown 2–4 пункта.
7. Пиши cues простым языком без академических терминов.
8. Все названия, подсказки и комментарии — строго на русском языке, без английских слов.

# ВЫХОД
Верни JSON (response_format json_object) вида:
{
  "title": "...",
  "duration": ${sessionMinutes},
  "warmup": ["..."],
  "exercises": [
     {"name":"...","sets":3,"reps":"8-12","restSec":90,"weight":"...","targetMuscles":["..."],"cues":"..."}
  ],
  "cooldown": ["..."],
  "notes": "3-4 предложения, объясняющие логику"
}

Будь творческим тренером, но следуй правилам безопасности.`.trim();
}

// ============================================================================
// ROUTE: ГЕНЕРАЦИЯ ТРЕНИРОВКИ
// ============================================================================

plan.post(
  "/generate",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    const tz = resolveTimezone(req);
    const force = Boolean(req.body?.force);
    const onboarding = await getOnboarding(userId);

    // Подписка / пробник
    await ensureSubscription(userId, "workout");

    let existing = await getLatestWorkoutPlan(userId);

    // Лимиты по частоте
    // 1) по фактическим сохранённым сессиям
    const todaySessions = await q<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
         FROM workouts
        WHERE user_id = $1
          AND (created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
      [userId, tz]
    );
    // 2) по сгенерированным планам (чтобы не кликали много до сохранения)
    const todayPlans = await q<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
         FROM workout_plans
        WHERE user_id = $1
          AND (created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
      [userId, tz]
    );

    if (
      (todaySessions[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT ||
      (todayPlans[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT
    ) {
      const nextIso = await getNextDailyResetIso(tz);
      const nextLabel = formatDateLabel(new Date(nextIso), tz, { weekday: "long" });

      if (existing && existing.status !== "failed") {
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

    // Проверка валидности последней тренировки
    if (lastSession) {
      // если ещё не завершена — запрет
      if (!lastSession.completed_at) {
        throw new AppError(
          "Сначала заверши текущую тренировку, потом сгенерируем новую.",
          403
        );
      }
      // если уже использована как ключ для следующей — запрет
      if (lastSession.unlock_used) {
        throw new AppError("Следующая тренировка появится после выполнения текущей.", 403);
      }
    }

    // Недельный лимит по онбордингу (мягкий +1 запас)
    if (WEEKLY_WORKOUT_SOFT_LIMIT > 0) {
      const desiredDaysPerWeek = Number(onboarding?.schedule?.daysPerWeek) || 3;
      const softCap = desiredDaysPerWeek + 1;
      const weeklySessions = await q<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt
           FROM workouts
          WHERE user_id = $1
            AND created_at >= date_trunc('week', (now() AT TIME ZONE $2))`,
        [userId, tz]
      );
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

    queueWorkoutPlanGeneration({ planId: shell.id, userId });

    res.json(buildWorkoutPlanResponse(shell));
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

type WorkoutGenerationJob = { planId: string; userId: string };

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

async function generateWorkoutPlan({ planId, userId }: WorkoutGenerationJob) {
  console.log(`[WORKOUT] ▶️ start async generation planId=${planId}`);
  await setWorkoutPlanProgress(planId, "context", 15);

  const onboarding = await getOnboarding(userId);
  const sessionMinutes = resolveSessionLength(onboarding);
  const profile = buildProfile(onboarding, sessionMinutes);
  const program = await getOrCreateProgram(userId, onboarding, profile);
  const history = summarizeHistory(await getRecentSessions(userId, 10));
  const constraints = buildConstraints(profile, history, program, sessionMinutes);

  console.log(
    `[WORKOUT] context user=${userId} program=${program.blueprint_json.name} week=${
      program.week
    } day=${program.day_idx + 1}`
  );

  await setWorkoutPlanProgress(planId, "prompt", 30);
  const prompt = buildTrainerPrompt({
    profile,
    onboarding,
    program,
    constraints,
    sessionMinutes,
  });

  if (process.env.DEBUG_AI === "1") {
    console.log("\n=== WORKOUT PROMPT ===");
    console.log(prompt.slice(0, 500) + "...\n");
  }

  await setWorkoutPlanProgress(planId, "ai", 55);
  const tAi = Date.now();
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
  console.log(
    `[WORKOUT] openai.chat ${Date.now() - tAi}ms prompt=${
      completion.usage?.prompt_tokens ?? "?"
    } completion=${completion.usage?.completion_tokens ?? "?"} total=${
      completion.usage?.total_tokens ?? "?"
    }`
  );

  let plan: WorkoutPlan;
  try {
    plan = JSON.parse(completion.choices[0].message.content || "{}");
  } catch (err) {
    console.error("Failed to parse AI response:", err);
    throw new AppError("AI returned invalid JSON", 500);
  }

  if (!plan.exercises || !Array.isArray(plan.exercises) || plan.exercises.length === 0) {
    console.error("Invalid plan structure:", plan);
    throw new AppError("AI generated invalid workout plan", 500);
  }

  for (const ex of plan.exercises) {
    if (!ex.name || !ex.sets || !ex.reps || !ex.restSec) {
      console.error("Invalid exercise:", ex);
      throw new AppError("AI generated exercise with missing fields", 500);
    }
  }

  plan.duration = sessionMinutes;
  await setWorkoutPlanProgress(planId, "validation", 80);

  const validation = validatePlanStructure(plan, constraints, sessionMinutes);
  plan = validation.plan;

  if (validation.warnings.length) {
    console.warn("Plan warnings:", validation.warnings);
  }

  const analysis = {
    historySummary: constraints.historySummary,
    recovery: constraints.recovery.label,
    hoursSinceLast: constraints.recovery.hoursSinceLast,
    lastRpe: constraints.lastRpe,
    phase: constraints.phase.label,
    phaseNotes: constraints.phase.notes,
    plateau: constraints.plateau,
    deloadSuggested: constraints.deloadSuggested,
    volumeHint: constraints.volumeHint,
    weightNotes: constraints.weightNotes,
    warnings: validation.warnings,
  };

  await markWorkoutPlanReady(planId, plan, analysis);
  console.log(`[WORKOUT] ✅ plan ready ${planId}`);

  // Помечаем предыдущую валидную сессию как использованную для разблокировки
  const lastSession = await getLastWorkoutSession(userId);
  if (lastSession?.completed_at && !lastSession.unlock_used) {
    await q(`UPDATE workouts SET unlock_used = true WHERE id = $1`, [lastSession.id]);
  }
}

function validatePlanStructure(
  plan: WorkoutPlan,
  constraints: Constraints,
  sessionMinutes: number
) {
  const normalized: WorkoutPlan = {
    title: plan.title || "Персональная тренировка",
    duration: sessionMinutes,
    warmup: Array.isArray(plan.warmup) ? plan.warmup.slice(0, 5) : [],
    exercises: Array.isArray(plan.exercises) ? plan.exercises.slice(0, MAX_EXERCISES) : [],
    cooldown: Array.isArray(plan.cooldown) ? plan.cooldown.slice(0, 4) : [],
    notes: plan.notes || "",
  };

  const warnings: string[] = [];

  const minRequired = minExercisesForDuration(sessionMinutes);
  if (normalized.exercises.length < minRequired) {
    warnings.push(
      `Мало упражнений (${normalized.exercises.length}) — нужно минимум ${minRequired}`
    );
  }

  normalized.exercises = normalized.exercises.map((ex) => {
    const baseWeight =
      typeof ex.weight === "string"
        ? ex.weight
        : typeof ex.weight === "number" && Number.isFinite(ex.weight)
        ? formatWeight(ex.weight)
        : undefined;

    const updated: Exercise = {
      name: ex.name || "Упражнение",
      sets: Math.min(5, Math.max(2, Number(ex.sets) || 3)),
      reps: ex.reps || constraints.phase.repScheme,
      restSec: Number(ex.restSec) || 90,
      targetMuscles: Array.isArray(ex.targetMuscles) ? ex.targetMuscles : [],
      cues: ex.cues || "Держи технику и контролируй движение",
      weight: baseWeight,
    } as Exercise;

    const guard = constraints.weightGuards[slugify(updated.name)];
    const numericWeight = numberFrom(ex.weight ?? null);
    if (guard) {
      if (numericWeight == null) {
        updated.weight = formatWeight(guard.recommended) || undefined;
        warnings.push(`${updated.name}: добавил рекомендуемый вес ${updated.weight}`);
      } else if (numericWeight < guard.min) {
        updated.weight = formatWeight(guard.min) || undefined;
        warnings.push(
          `${updated.name}: поднял вес до безопасного минимума ${updated.weight}`
        );
      } else if (numericWeight > guard.max) {
        updated.weight = formatWeight(guard.max) || undefined;
        warnings.push(
          `${updated.name}: снизил вес до ${updated.weight}, чтобы не превысить лимит`
        );
      }
    }

    return updated;
  });

  if (!normalized.warmup.length) {
    warnings.push("Добавь разминку из 3-5 простых пунктов");
  }
  if (!normalized.cooldown.length) {
    warnings.push("Добавь заминку для восстановление");
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

    console.log("\n=== SAVING WORKOUT ===");
    console.log("User ID:", userId);
    console.log("Exercises:", payload.exercises.length);
    console.log("Title:", payload.title);

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
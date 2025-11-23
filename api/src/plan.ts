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

type ProgramBlueprint = {
  name: string;
  days: string[];
  description?: string;
  guidelines?: string[];
};

type ProgramRow = {
  id: string;
  user_id: string;
  blueprint_json: ProgramBlueprint;
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

// ============================================================================
// CONSTANTS
// ============================================================================

const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);
const TEMPERATURE = 0.35;
const HISTORY_LIMIT = 5;
const MAX_EXERCISES = 10;
const MIN_EXERCISES = 5;
const DAILY_WORKOUT_LIMIT = 1;
const MIN_REAL_DURATION_MIN = 20;
const WEEKLY_WORKOUT_SOFT_LIMIT = 1; // сверяем с онбордингом (+1 запас)
const MOSCOW_TZ = "Europe/Moscow";
const MS_PER_HOUR = 60 * 60 * 1000;

// ============================================================================
// TIME / TZ HELPERS
// ============================================================================

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

// ============================================================================
// AUTH
// ============================================================================

const ensureUser = (req: any): string => {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
};

// ============================================================================
// GENERAL HELPERS
// ============================================================================

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

// ============================================================================
// PROFILE / HISTORY / CONSTRAINTS
// ============================================================================

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
  return rows.map((row) => {
    const session: HistorySession = {
      date: row.date,
      title: row.title,
      exercises: row.exercises,
      volumeKg: 0,
      avgRpe: row.avgRpe ?? null,
    };
    return {
      ...session,
      volumeKg: calcSessionVolume(session),
    };
  });
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
          const repsText = stats.reps ? `${Math.round(stats.reps)} повт.` : `${repsRange.min}-${repsRange.max}`;
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

const PHASES = [
  { label: "Гипертрофия", repScheme: "8-12 повторов", notes: "умеренный вес, контролируемый темп" },
  { label: "Сила", repScheme: "4-6 повторов", notes: "более тяжёлые веса, отдых до 3 мин" },
  { label: "Выносливость", repScheme: "12-15 повторов", notes: "легче вес, короче отдых" },
];

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

const DAY_VOLUME_HINT: Record<string, string> = {
  Push: "7-9 подходов на грудь, 5-7 на плечи и трицепс",
  Pull: "8-10 подходов на спину, 4-6 на бицепс и задние дельты",
  Legs: "10-12 подходов на ноги + 3-4 на ягодицы/кор",
  "Upper Focus": "6-8 подходов на грудь и спину, по 3-4 на руки",
  "Lower Focus": "8-10 подходов на квадрицепс и бёдра, 4-6 на ягодицы",
  "Full Body": "по 3-4 подхода на каждую крупную группу без перегруза",
};

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
      weightNotes.push(`${ex.name}: держи ${suggestion.min}-${suggestion.max} кг (прошлый раз ${suggestion.last} кг)`);
      if (weightNotes.length >= 5) break;
    }
    if (weightNotes.length >= 5) break;
  }

  const volumes = history.map((s) => s.volumeKg).filter((v) => v > 0);
  const avgVolume = volumes.length ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const plateau =
    volumes.length >= 3 && volumes.every((v) => Math.abs(v - avgVolume) / (avgVolume || 1) < 0.05);
  const hoursSinceLast = hoursDiffFrom(history[0]?.date);
  const lastRpe = history[0]?.avgRpe ?? null;
  const deloadSuggested =
    (plateau && history.length >= 4) ||
    ((lastRpe ?? 0) >= 9 && (hoursSinceLast ?? 999) < 72);

  const dayKey = program.blueprint_json?.days?.[program.day_idx];
  const volumeHint =
    (dayKey && DAY_VOLUME_HINT[dayKey]) ||
    "Держи баланс по группам мышц: жим, тяга, ноги, кор.";

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
    volumeHint,
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

// ГИБРИДНЫЙ BLUEPRINT: дни абстрактные, принципы — через guidelines
function createBlueprint(daysPerWeek: number): ProgramBlueprint {
  if (daysPerWeek >= 5) {
    return {
      name: "Гибкий сплит Push/Pull/Legs",
      days: ["День 1", "День 2", "День 3", "День 4", "День 5"],
      description:
        "5 тренировок в неделю с акцентом на чередование толкающих, тянущих движений и ног.",
      guidelines: [
        "Чередуй толкающие, тянущие движения и ноги.",
        "Не нагружай одну и ту же крупную группу мышц 2 дня подряд.",
        "Каждая крупная группа (грудь, спина, ноги) должна получать нагрузку примерно 2 раза в неделю.",
      ],
    };
  }

  if (daysPerWeek === 4) {
    return {
      name: "Гибкий Upper/Lower сплит",
      days: ["День 1", "День 2", "День 3", "День 4"],
      description: "4 тренировки в неделю, чередуем верх и низ тела.",
      guidelines: [
        "Чередуй тренировки, где больше акцент на верх, и тренировки, где больше акцент на низ.",
        "В течение недели дважды нагрузи верх и дважды низ.",
        "Следи, чтобы плечи и поясница не перегружались подряд несколькими тяжёлыми днями.",
      ],
    };
  }

  // 3 дня или меньше
  return {
    name: "Full Body 2–3 раза в неделю",
    days: ["День 1", "День 2", "День 3"],
    description: "2–3 full body-тренировки в неделю с разным акцентом.",
    guidelines: [
      "Каждая тренировка должна включать хотя бы одно упражнение на верх, одно на низ и одно на кор.",
      "Варьируй упражнения и углы — не делай три одинаковых full body подряд.",
      "Старайся закрывать базовые движения: жим, тяга, присед, шарнир (тяга/становая) и упражнения на кор.",
    ],
  };
}

async function getOrCreateProgram(userId: string, onboarding: any): Promise<ProgramRow> {
  const desiredDaysPerWeek = Number(onboarding?.schedule?.daysPerWeek) || 3;
  const desiredBlueprint = createBlueprint(desiredDaysPerWeek);

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
    avgRpe: numberFrom(row.payload?.feedback?.sessionRpe) ?? null,
  }));
}

// ============================================================================
// PROMPT SETUP
// ============================================================================

const TRAINER_SYSTEM = `You are an expert personal trainer with 15+ years of experience in strength training, hypertrophy, and athletic performance.

Your approach:
- You understand periodization, progressive overload, and recovery
- You vary exercises to prevent plateaus and boredom
- You consider individual limitations and preferences
- You write detailed, helpful technique cues
- You think holistically about the client's journey

You are NOT a rigid algorithm. You are a thinking, adaptive coach.`;

// Оборудование описываем словами
function describeEquipment(onboarding: any) {
  const env = onboarding.environment || {};
  if (env.bodyweightOnly === true) {
    return "только вес собственного тела. нет штанги, нет тренажёров, нет станка для жима ногами, нет блочных машин.";
  }

  const location = (env.location || "").toLowerCase();
  if (location === "gym" || location.includes("зал")) {
    return "полностью оборудованный тренажёрный зал: свободные веса (гантели, штанги, гири), силовые стойки, машины Смита, блочные тренажёры, кроссоверы, тренажёры для ног, кардиооборудование.";
  }

  if (location === "outdoor" || location.includes("street") || location.includes("улиц")) {
    return "уличная площадка: турник, брусья, петли TRX/эспандеры, скакалка, набивные мячи, лёгкие гантели. нет полноценных штанг и станков, упражнения адаптируй под площадку.";
  }

  if (location === "home" || location.includes("дом")) {
    return "домашние условия: коврик, свободное пространство, стул/лавка, лёгкие гантели или резинки. нет больших тренажёров, но можно использовать мебель и подручный инвентарь.";
  }

  return "простой инвентарь: коврик, резинки, лёгкие гантели, турник/брусья при наличии. если требуются тренажёры — замени на вариации с собственным весом.";
}

const FEW_SHOT_EXAMPLES = `
ПРИМЕР 1:
{
  "title": "Грудь и плечи с акцентом на технику",
  "duration": 60,
  "warmup": ["5 минут на эллипсе", "Круговые движения плеч", "Отжимания с паузой 2×10"],
  "exercises": [
    {"name":"Жим штанги лёжа","sets":4,"reps":"8-10","restSec":120,"weight":"60 кг","targetMuscles":["грудь","трицепс"],"cues":"Сведение лопаток, пауза внизу"},
    {"name":"Жим гантелей на наклоне","sets":3,"reps":"10-12","restSec":90,"weight":"22.5 кг","targetMuscles":["верх груди"],"cues":"Контроль на негативе"},
    {"name":"Жим штанги стоя","sets":3,"reps":"8-10","restSec":120,"weight":"32.5 кг","targetMuscles":["плечи"],"cues":"Не прогибай поясницу"},
    {"name":"Разведения в тренажёре","sets":3,"reps":"12-15","restSec":60,"weight":"35 кг","targetMuscles":["грудь"],"cues":"Пауза в пик-концентрации"},
    {"name":"Французский жим","sets":3,"reps":"10-12","restSec":75,"weight":"20 кг","targetMuscles":["трицепс"],"cues":"Локти смотрят вверх"}
  ],
  "cooldown": ["Растяжка груди у стены", "Разведение рук с эластичной лентой", "Глубокое дыхание 1 минуту"],
  "notes": "Сначала тяжёлый базовый жим, затем вариации под углом и изоляция. Отдых после тяжёлых подходов 2 минуты, чтобы сохранять качество."
}

ПРИМЕР 2:
{
  "title": "Сила ног и стабилизация",
  "duration": 70,
  "warmup": ["5 минут велотренажёр", "Приседания с весом тела 2×15", "Выпады назад 2×10 на ногу"],
  "exercises": [
    {"name":"Приседания со штангой","sets":4,"reps":"6-8","restSec":150,"weight":"80 кг","targetMuscles":["квадрицепс","ягодицы"],"cues":"Нейтральная спина, колени следуют за носками"},
    {"name":"Жим ногами","sets":3,"reps":"10-12","restSec":120,"weight":"160 кг","targetMuscles":["ноги"],"cues":"Полный контроль хода"},
    {"name":"Румынская тяга","sets":3,"reps":"8-10","restSec":120,"weight":"70 кг","targetMuscles":["задняя поверхность","ягодицы"],"cues":"Держи спину ровной"},
    {"name":"Выпады с гантелями","sets":3,"reps":"10 на ногу","restSec":90,"weight":"18 кг","targetMuscles":["ягодицы","квадрицепс"],"cues":"Шаг назад, толчок пяткой"},
    {"name":"Подъём на носки стоя","sets":3,"reps":"12-15","restSec":60,"weight":"40 кг","targetMuscles":["икры"],"cues":"Пауза в верхней точке"}
  ],
  "cooldown": ["Растяжка квадрицепса", "Скрутка для поясницы", "Диафрагмальное дыхание"],
  "notes": "Базу ставим первой, затем добиваем объёмом и работаем над балансом."
}`.trim();

// Контекст прогрессии: как старший тренер объясняет ассистенту, что делать
function buildProgressionContext(
  profile: Profile,
  history: HistorySession[],
  program: ProgramRow,
  constraints: Constraints
): string {
  if (!history.length) {
    return "Это первая тренировка клиента. Начни с умеренных весов, оставляя запас 2–3 повтора в подходе. Делай акцент на технику.";
  }

  const lines: string[] = [];
  const lastSession = history[0];

  if (constraints.lastRpe != null) {
    if (constraints.lastRpe >= 9) {
      lines.push(
        `Последняя тренировка была очень тяжёлой (RPE ${constraints.lastRpe}). Сегодня снизь интенсивность или объём примерно на 10–15% и больше следи за техникой.`
      );
    } else if (constraints.lastRpe <= 6) {
      lines.push(
        `Последняя тренировка далась легко (RPE ${constraints.lastRpe}). Клиент готов к прогрессии — можно слегка увеличить веса или добавить по 1–2 повтора в основных упражнениях.`
      );
    } else {
      lines.push(
        `Последняя тренировка была средней по нагрузке (RPE ${constraints.lastRpe}). Продолжай прогрессию без резких скачков.`
      );
    }
  }

  const progressionNotes: string[] = [];
  for (const ex of lastSession.exercises.slice(0, 3)) {
    const stats = averageSetStats(ex);
    const repsRange = parseRepsRange(ex.reps);
    if (stats.weight && stats.reps) {
      if (stats.reps >= repsRange.max && ex.effort !== "hard") {
        progressionNotes.push(
          `${ex.name}: в прошлый раз ${Math.round(stats.reps)} повт. × ${stats.weight.toFixed(
            1
          )} кг — клиент у верхней границы диапазона. Увеличь вес на 2.5–5 кг или оставь вес и добавь сложности (контроль на негативе, пауза).`
        );
      } else if (stats.reps < repsRange.min || ex.effort === "hard") {
        progressionNotes.push(
          `${ex.name}: прошлый подход был тяжёлым. Сохрани вес около ${stats.weight.toFixed(
            1
          )} кг или чуть снизь, поработай над техникой и контролем движения.`
        );
      } else {
        progressionNotes.push(
          `${ex.name}: сохраняй вес около ${stats.weight.toFixed(
            1
          )} кг, прогрессируй аккуратно — можно добавить один подход или 1–2 повтора в некоторых сетах.`
        );
      }
    }
  }

  if (progressionNotes.length) {
    lines.push("Прогрессия по ключевым упражнениям:\n" + progressionNotes.join("\n"));
  }

  const recentExercises = history
    .slice(0, 3)
    .flatMap((s) => s.exercises.map((e) => e.name.toLowerCase()));
  const repeatedNames = new Set<string>();
  const seen = new Set<string>();
  for (const name of recentExercises) {
    if (seen.has(name)) repeatedNames.add(name);
    else seen.add(name);
  }

  if (repeatedNames.size > 2) {
    const first = Array.from(repeatedNames)[0];
    lines.push(
      `Последние тренировки часто повторяли одни и те же упражнения. Сегодня добавь вариативности: замени, например, "${first}" на похожее движение под другим углом или с другим оборудованием.`
    );
  }

  const phase = constraints.phase;
  lines.push(
    `Текущая фаза программы: ${phase.label} (неделя ${program.week}). Схема повторений: ${phase.repScheme}. ${phase.notes}`
  );

  if (constraints.plateau) {
    lines.push(
      "По объёму видно плато. Следи за качеством движений, не гонись за лишними подходами. При необходимости уменьшай объём и добавляй фокус на технику."
    );
  }

  if (constraints.deloadSuggested) {
    lines.push(
      "Рекомендуется лёгкий deload: снизь рабочие веса и/или количество подходов примерно на 15%, чтобы дать телу восстановиться."
    );
  }

  return lines.join("\n");
}

// Новый промпт: естественное описание клиента + программа + прогрессия
function buildTrainerPrompt(params: {
  profile: Profile;
  onboarding: any;
  program: ProgramRow;
  constraints: Constraints;
  sessionMinutes: number;
  history: HistorySession[];
}): string {
  const { profile, onboarding, program, constraints, sessionMinutes, history } = params;
  const blueprint = program.blueprint_json;

  const sexStr =
    profile.sex === "female" ? "женщина" : profile.sex === "male" ? "мужчина" : "клиент";
  const expStr =
    profile.experience === "beginner"
      ? "новичок"
      : profile.experience === "advanced"
      ? "продвинутый"
      : "средний уровень";

  const goalsText = profile.goals.length ? profile.goals.join(", ") : "поддержание формы";

  const clientDescription = `
Передо мной ${sexStr} ${profile.age ?? "неизвестного"} лет.
Рост: ${profile.height ?? "не указан"} см, вес: ${profile.weight ?? "не указан"} кг.
Опыт тренировок: ${expStr}.
Цели: ${goalsText}.

Клиент тренируется ${profile.daysPerWeek} раз(а) в неделю по ${sessionMinutes} минут.
Место и оборудование: ${describeEquipment(onboarding)}

${constraints.historySummary ? `Кратко по последним тренировкам:\n${constraints.historySummary}` : "Это первая тренировка клиента."}

Восстановление: ${constraints.recovery.label}.
`.trim();

  const guidelines = (blueprint.guidelines || []).map((g) => `- ${g}`).join("\n");

  const programContext = `
Клиент идёт по программе "${blueprint.name}".
Неделя: ${program.week}, тренировка ${program.day_idx + 1} из ${program.microcycle_len} в микропериоде.

Принципы программы:
${guidelines || "- Программа гибкая, распределяй нагрузку по неделе логично."}

Рекомендации по объёму на сегодня:
- ${constraints.volumeHint}
`.trim();

  const progressionContext = buildProgressionContext(profile, history, program, constraints);

  const weightGuidance =
    constraints.weightNotes.length > 0
      ? constraints.weightNotes.map((x) => `- ${x}`).join("\n")
      : "- Новые упражнения: выбери вес примерно на уровне 6/10 по ощущениям и оставляй запас 2 повтора.";

  const minExercises = minExercisesForDuration(sessionMinutes);

  // Разные правила структуры для 2–3 и для 4–5 тренировок в неделю
  let structureRules: string;
  if (profile.daysPerWeek <= 3) {
    structureRules = `
3. В каждой тренировке должны быть:
   - хотя бы одно упражнение на ноги,
   - хотя бы одно тяговое упражнение для спины,
   - хотя бы одно жимовое упражнение для груди или плеч,
   - хотя бы одно упражнение на кор.
4. Не копируй полностью состав прошлой тренировки: меняй углы, инвентарь или порядок упражнений.
`;
  } else {
    structureRules = `
3. Смотри на распределение нагрузки за неделю:
   - за неделю каждая крупная группа (ноги, спина, грудь/плечи) должна получать нагрузку как минимум 2 раза,
   - не ставь тяжёлые дни на одну и ту же крупную группу подряд,
   - в одной тренировке делай акцент на 1–2 крупных группах,
   - упражнения на кор добавляй в большинство тренировок, но не обязательно в каждую.
4. Не копируй полностью состав прошлой тренировки: меняй углы, инвентарь или порядок упражнений.
`;
  }

  return `
Ты опытный персональный тренер. К тебе пришёл клиент, и тебе нужно составить для него конкретную тренировку под текущую фазу и прогрессию, а не абстрактный план.

# О КЛИЕНТЕ
${clientDescription}

# ПРОГРАММА И СТРУКТУРА НЕДЕЛИ
${programContext}

# ПРОГРЕССИЯ
${progressionContext}

# РУКОВОДСТВО ПО ВЕСАМ
${weightGuidance}

# ЖЁСТКИЕ ПРАВИЛА
1. Продолжительность тренировки строго около ${sessionMinutes} минут.
2. Количество упражнений: ${minExercises}-${MAX_EXERCISES} (для ${sessionMinutes} минут).
${structureRules}
5. Если рекомендован deload — снизь вес или количество подходов на ~15%.
6. Warmup: 3–5 конкретных пунктов под сегодняшний день. Cooldown: 2–4 простых пункта.
7. Пиши cues простым разговорным русским языком, без академических терминов и англицизмов.
8. Все названия, подсказки и комментарии — строго на русском языке, без английских слов.

# ВЫХОДНОЙ ФОРМАТ
Верни строго JSON (response_format json_object) вида:
{
  "title": "название тренировки",
  "duration": ${sessionMinutes},
  "warmup": ["пункт разминки 1", "пункт 2", "..."],
  "exercises": [
    {
      "name": "название упражнения",
      "sets": количество_подходов_числом,
      "reps": "диапазон повторений, например 8-10",
      "restSec": секунд_отдыха_числом,
      "weight": "вес в кг, например 40 кг, если применимо",
      "targetMuscles": ["основные группы мышц"],
      "cues": "техническая подсказка простым языком"
    }
  ],
  "cooldown": ["пункт заминки 1", "..."],
  "notes": "3-4 предложения, объясняющие логику тренировки и на что обратить внимание."
}

${FEW_SHOT_EXAMPLES}

Составь тренировку как живой тренер, но строго соблюдай формат и правила безопасности.
  `.trim();
}

// ============================================================================
// WORKOUT PLAN DB HELPERS
// ============================================================================

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
// GENERATION PIPELINE
// ============================================================================

type WorkoutGenerationJob = { planId: string; userId: string };

function queueWorkoutPlanGeneration(job: WorkoutGenerationJob) {
  setTimeout(() => {
    generateWorkoutPlan(job).catch(async (err) => {
      console.error("Async workout generation failed:", err);
      await markWorkoutPlanFailed(job.planId, (err as any)?.message?.slice(0, 500) ?? "AI error");
    });
  }, 0);
}

async function generateWorkoutPlan({ planId, userId }: WorkoutGenerationJob) {
  console.log(`[WORKOUT] ▶️ start async generation planId=${planId}`);
  await setWorkoutPlanProgress(planId, "context", 15);

  const onboarding = await getOnboarding(userId);
  const sessionMinutes = resolveSessionLength(onboarding);
  const profile = buildProfile(onboarding, sessionMinutes);
  const program = await getOrCreateProgram(userId, onboarding);
  const history = summarizeHistory(await getRecentSessions(userId, 10));
  const constraints = buildConstraints(profile, history, program, sessionMinutes);

  console.log(
    `[WORKOUT] context user=${userId} program=${program.blueprint_json.name} week=${program.week} day=${
      program.day_idx + 1
    }`
  );

  await setWorkoutPlanProgress(planId, "prompt", 30);
  const prompt = buildTrainerPrompt({
    profile,
    onboarding,
    program,
    constraints,
    sessionMinutes,
    history,
  });

  if (process.env.DEBUG_AI === "1") {
    console.log("\n=== WORKOUT PROMPT ===");
    console.log(prompt.slice(0, 1200) + "...\n");
  }

  await setWorkoutPlanProgress(planId, "ai", 55);
  const tAi = Date.now();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: TEMPERATURE,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: TRAINER_SYSTEM },
      { role: "user", content: prompt },
    ],
  });
  console.log(
    `[WORKOUT] openai.chat ${Date.now() - tAi}ms prompt=${completion.usage?.prompt_tokens ?? "?"} completion=${completion.usage?.completion_tokens ?? "?"} total=${completion.usage?.total_tokens ?? "?"}`
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
      `Мало упражнений (${normalized.exercises.length}) — нужно минимум ${minRequired} для такой длительности.`
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
      cues: ex.cues || "Держи технику и контролируй движение.",
      weight: baseWeight,
    } as Exercise;

    const guard = constraints.weightGuards[slugify(updated.name)];
    const numericWeight = numberFrom(ex.weight ?? null);
    if (guard) {
      if (numericWeight == null) {
        updated.weight = formatWeight(guard.recommended) || undefined;
        warnings.push(`${updated.name}: добавлен рекомендуемый вес ${updated.weight}.`);
      } else if (numericWeight < guard.min) {
        updated.weight = formatWeight(guard.min) || undefined;
        warnings.push(`${updated.name}: поднял вес до безопасного минимума ${updated.weight}.`);
      } else if (numericWeight > guard.max) {
        updated.weight = formatWeight(guard.max) || undefined;
        warnings.push(
          `${updated.name}: снизил вес до ${updated.weight}, чтобы не превысить лимит по безопасности.`
        );
      }
    }

    return updated;
  });

  if (!normalized.warmup.length) {
    warnings.push("Добавь разминку из 3–5 простых пунктов.");
  }
  if (!normalized.cooldown.length) {
    warnings.push("Добавь заминку для восстановления.");
  }

  return { plan: normalized, warnings };
}

// ============================================================================
// ROUTES
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
    // 2) по сгенерированным планам
    const todayPlans = await q<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
         FROM workout_plans
        WHERE user_id = $1
          AND (created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
      [userId, tz]
    );

    if ((todaySessions[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT || (todayPlans[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT) {
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
      if (!lastSession.completed_at) {
        throw new AppError("Сначала заверши текущую тренировку, потом сгенерируем новую.", 403);
      }
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

    await q("BEGIN");

    try {
      const nowIso = new Date();
      let startedAt: Date | null = null;
      let completedAt: Date | null = null;

      if (startedAtInput && Number.isFinite(Number(durationMinInput))) {
        startedAt = new Date(startedAtInput);
        const durMin = Math.max(1, Number(durationMinInput));
        completedAt = new Date(startedAt.getTime() + durMin * 60000);
      } else {
        startedAt = nowIso;
        completedAt = new Date(nowIso.getTime() + MIN_REAL_DURATION_MIN * 60000);
      }

      const result = await q(
        `INSERT INTO workout_sessions (user_id, payload, finished_at)
         VALUES ($1, $2::jsonb, $3)
         RETURNING id, finished_at`,
        [userId, payload, completedAt]
      );

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
  res.json({ ok: true, version: "2.0-ai-first-hybrid-blueprint" });
});

export default plan;

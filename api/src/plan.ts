// plan-refactored.ts
// ============================================================================
// AI-FIRST FITNESS TRAINER
// Персональный тренер: одна сессия за раз, минимум жёстких правил
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

  // НОВЫЕ ПОЛЯ ДЛЯ БЛОКОВ
  block_cycle?: number | null;
  block_index?: number | null;
};

// ============================================================================
// CONSTANTS / UTILS
// ============================================================================

const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);

// Для генерации JSON-плана держим температуру пониже
const TEMPERATURE_JSON = 0.25; // второй шаг (строгий JSON)
// Для свободного текста даём больше "человечности"
const TEMPERATURE_FREE = 0.9; // первый шаг (как в чате)

const HISTORY_LIMIT = 5;
const MAX_EXERCISES = 10;
const DAILY_WORKOUT_LIMIT = 1;
const MIN_REAL_DURATION_MIN = 20;
const WEEKLY_WORKOUT_SOFT_LIMIT = 1; // сверяем с онбордингом (+1 запас)
const MOSCOW_TZ = "Europe/Moscow";
const MS_PER_HOUR = 60 * 60 * 1000;

const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);
const isAdminUser = (userId: string) => ADMIN_IDS.has(userId);

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

// Для валидации (AI про это не знает)
function minExercisesForDuration(duration: number) {
  if (duration >= 85) return 6;
  if (duration >= 70) return 6;
  if (duration >= 50) return 5;
  return 5;
}

async function getLatestWorkoutPlan(userId: string): Promise<WorkoutPlanRow | null> {
  const rows = await q<WorkoutPlanRow>(
    `SELECT id,
            user_id,
            status,
            plan,
            analysis,
            error_info,
            progress_stage,
            progress_percent,
            created_at,
            updated_at,
            block_cycle,
            block_index
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
    `SELECT id,
            user_id,
            status,
            plan,
            analysis,
            error_info,
            progress_stage,
            progress_percent,
            created_at,
            updated_at,
            block_cycle,
            block_index
      FROM workout_plans
      WHERE id = $1
      LIMIT 1`,
    [planId]
  );
  return rows[0] || null;
}

async function getNextBlockCycle(userId: string): Promise<number> {
  const rows = await q<{ max_cycle: number | null }>(
    `SELECT MAX(block_cycle)::int AS max_cycle
       FROM workout_plans
      WHERE user_id = $1`,
    [userId]
  );
  const current = rows[0]?.max_cycle ?? 0;
  return current + 1;
}

async function createWorkoutPlanShell(userId: string): Promise<WorkoutPlanRow> {
  const rows = await q<WorkoutPlanRow>(
    `INSERT INTO workout_plans (user_id, status, progress_stage, progress_percent)
     VALUES ($1, 'processing', 'queued', 5)
     RETURNING id,
               user_id,
               status,
               plan,
               analysis,
               error_info,
               progress_stage,
               progress_percent,
               created_at,
               updated_at,
               block_cycle,
               block_index`,
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
        blockCycle: null,
        blockIndex: null,
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
      blockCycle: row.block_cycle ?? null,
      blockIndex: row.block_index ?? null,
    },
  };
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

function historyNarrative(history: HistorySession[]): string {
  if (!history.length)
    return "Это первая тренировка, я только начинаю — сделай осторожную, но осмысленную сессию.";
  return history
    .slice(0, HISTORY_LIMIT)
    .map((session, idx) => {
      const when = idx === 0 ? "Последняя тренировка" : `${idx + 1}-я тренировка назад`;
      const exercises = session.exercises
        .slice(0, 3)
        .map((ex) => {
          const stats = averageSetStats(ex);
          const repsRange = parseRepsRange(ex.reps);
          const repsText = stats.reps ? `${Math.round(stats.reps)} повт.` : `${repsRange.min}-${repsRange.max} повт.`;
          const weightText = stats.weight ? `${stats.weight.toFixed(1)} кг` : "без веса или лёгкий вес";
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

function describeRecovery(hours: number | null, rpe: number | null): string {
  let base: string;
  if (hours == null) {
    base = "нет точных данных по отдыху";
  } else if (hours < 36) {
    base = "прошло не так много времени после прошлой тренировки — не перегружай чрезмерно";
  } else if (hours < 72) {
    base = "по времени восстановления всё примерно оптимально";
  } else {
    base = "отдых был довольно долгим — можно немного усилить нагрузку, если чувствуешь себя нормально";
  }

  if (rpe != null) {
    if (rpe >= 9) return `${base}. Прошлая тренировка была очень тяжёлой (RPE ${rpe}).`;
    if (rpe <= 6) return `${base}. Прошлая тренировка ощущалась относительно лёгкой (RPE ${rpe}).`;
    return `${base}. RPE прошлой тренировки: ${rpe}.`;
  }

  return base;
}

// ============================================================================
// НОВЫЕ ХЕЛПЕРЫ ДЛЯ "ДУМАНИЯ" ТРЕНЕРА
// ============================================================================

function formatUserDataShort(
  profile: Profile,
  onboarding: any,
  sessionMinutes: number
): string {
  const parts: string[] = [];

  if (profile.sex !== "unknown") {
    parts.push(profile.sex === "male" ? "Мужчина" : "Женщина");
  }
  if (profile.age) parts.push(`${profile.age} лет`);
  if (profile.height && profile.weight) {
    parts.push(`${profile.height} см, ${profile.weight} кг`);
  }

  const userData = parts.length ? parts.join(", ") : "данные частично не указаны";

  const expMap: Record<Profile["experience"], string> = {
    beginner: "новичок",
    intermediate: "средний уровень",
    advanced: "продвинутый",
  };
  const experience = expMap[profile.experience] || "средний уровень";

  const goals = profile.goals?.length ? profile.goals.join(", ") : "поддержание формы";
  const equipment = describeEquipment(onboarding);

  return `
${userData}
Опыт: ${experience}
Цель: ${goals}
Тренировок в неделю: ${profile.daysPerWeek}
Длительность одной сессии: примерно ${sessionMinutes} минут
Оборудование / условия: ${equipment}
`.trim();
}

function describeEquipment(onboarding: any) {
  const env = onboarding.environment || {};
  if (env.bodyweightOnly === true) {
    return "тренируюсь только с весом собственного тела, без штанги и без больших тренажёров. Если предлагаешь упражнения со штангой/машинами — предложи вариант с собственным весом или резинками.";
  }

  const location = (env.location || "").toLowerCase();
  if (location === "gym" || location.includes("зал")) {
    return "занимаюсь в полноценном тренажёрном зале: свободные веса (гантели, штанги), стойки, блочные тренажёры, кроссовер, тренажёры для ног, скамьи и базовое кардиооборудование.";
  }

  if (location === "outdoor" || location.includes("street") || location.includes("улиц")) {
    return "занимаюсь на уличной площадке: турник, брусья, возможно петли/TRX и резинки. Нет полноценных тренажёров и штанги.";
  }

  if (location === "home" || location.includes("дом")) {
    return "занимаюсь дома: коврик, свободное пространство, стул/скамья, возможно лёгкие гантели или резинки. Нет больших тренажёров.";
  }

  return "условия средние: можно делать упражнения с собственным весом, с гантелями/резинками и подручным инвентарём, но без полноценных крупных тренажёров.";
}

/**
 * Шаг 1. Свободный запрос к GPT-4o "как в чате" — одна следующая тренировка.
 * Никакого JSON, обычный человеческий текст.
 */
function buildFreeFormWorkoutRequest(
  profile: Profile,
  onboarding: any,
  program: ProgramRow,
  constraints: Constraints,
  sessionMinutes: number
): string {
  const userData = formatUserDataShort(profile, onboarding, sessionMinutes);
  const historyText = constraints.historySummary;
  const recoveryLine = constraints.recovery.label;

  const programLine = `Сейчас это ${program.week}-я неделя моей программы и ${program.day_idx + 1}-я тренировка в этой неделе. Это ориентир по хронологии, сплит не жёсткий.`;

  const deloadHint = constraints.deloadSuggested
    ? "Если по твоему опыту нужен более лёгкий день или делoad, учти это в объёме и интенсивности."
    : "Если по твоему опыту можно слегка усилить нагрузку, сделай это аккуратно, без резких скачков.";

  return `
Составь, пожалуйста, подробный план ОДНОЙ следующей тренировки "на сегодня" специально под меня.

Кто я:
${userData}

Контекст программы:
${programLine}

Восстановление и ощущения:
${recoveryLine}

Мои недавние тренировки (для понимания уровня и логики прогрессии, а не как жёсткий шаблон):
${historyText}

Пожелания к формату ответа:
- Дай короткое и понятное название тренировки.
- Опиши разминку (3–6 конкретных пунктов, что сделать в начале).
- Затем опиши основную часть: список упражнений с подходами, повторами и примерным отдыхом, можно в виде списка.
- В конце опиши заминку/растяжку и пару рекомендаций, как по ощущениям должна заходить эта тренировка.
- Пиши обычным живым текстом, как в чате с человеком, без JSON и без технических схем.

Важно:
- Тренировка должна по ощущениям укладываться примерно в ${sessionMinutes} минут.
- Учитывай мой пол, возраст, цель, опыт, частоту тренировок и доступное оборудование.
- Структура, акценты и конкретные упражнения полностью на твоё усмотрение.
- ${deloadHint}
`.trim();
}

/**
 * Шаг 2. Промпт: из готового текстового плана → строгий JSON по схеме WorkoutPlan.
 */
function buildJsonConversionPrompt(freeTextPlan: string, sessionMinutes: number): string {
  return `
Ниже дан готовый текстовый план одной тренировки (разминка, основная часть с упражнениями, заминка, пояснения).

ТВОЯ ЗАДАЧА:
аккуратно конвертировать этот план в один JSON-объект по следующей схеме, не меняя смысл, порядок и общую логику тренировки.

Текст плана:

"""
${freeTextPlan}
"""

Нужный формат JSON (это ТОЛЬКО формат, не придумывай новую структуру тренировки):

{
  "title": "Название тренировки (2–6 слов)",
  "duration": ${sessionMinutes},             // ориентировочная длительность сессии в минутах
  "warmup": [
    "Короткий пункт разминки 1",
    "Короткий пункт разминки 2"
  ],
  "exercises": [
    {
      "name": "Название упражнения по-русски",
      "sets": 3,                             // количество подходов (целое число)
      "reps": "8-10",                        // повторения: одно число "10" или диапазон "8-10"
      "restSec": 90,                         // отдых между подходами в секундах
      "weight": "текстовое описание веса",   // "рабочий вес", "собственный вес", "10-12 кг" и т.п.
      "targetMuscles": ["Целевая мышца 1", "Целевая мышца 2"],
      "cues": "очень короткая подсказка по технике"
    }
  ],
  "cooldown": [
    "Короткий пункт заминки 1",
    "Короткий пункт заминки 2"
  ],
  "notes": "1–3 предложения: зачем такая структура и как её чувствовать по нагрузке"
}

Правила конвертации:
- Основа — текстовый план. НЕ выдумывай других упражнений и не меняй их порядок без необходимости.
- Если в тексте нет явного деления на warmup / основную часть / заминку, аккуратно разнеси элементы по этим блокам по смыслу.
- Если какие-то параметры не указаны (restSec, точные повторения), заполни разумными типичными значениями, не противоречащими плану.
- Массивы "warmup" и "cooldown" — это просто короткие текстовые пункты (по 2–5 штук), извлекай их из плана.
- "targetMuscles" можно выводить по здравому смыслу, даже если в тексте они не названы явно.
- "duration" поставь в районе ${sessionMinutes}, это именно время всей тренировки.
- Верни СТРОГО один JSON-объект по этой схеме, без markdown, без комментариев и без дополнительного текста вокруг.
`.trim();
}

// НОВЫЙ ПРОМПТ ДЛЯ БЛОКА ИЗ N ТРЕНИРОВОК (МИКРОЦИКЛ)

function buildBlockGenerationPrompt(params: {
  profile: Profile;
  onboarding: any;
  constraints: Constraints;
  sessionMinutes: number;
  daysInBlock: number; // обычно 3
}): string {
  const { profile, onboarding, constraints, sessionMinutes, daysInBlock } = params;
  const userData = formatUserDataShort(profile, onboarding, sessionMinutes);
  const historyText = constraints.historySummary;
  const recoveryLine = constraints.recovery.label;

  const freq = profile.daysPerWeek || 3;

  return `
Составь, пожалуйста, ПЛАН ИЗ ${daysInBlock} ПОСЛЕДОВАТЕЛЬНЫХ ТРЕНИРОВОК ДЛЯ ОДНОГО ЧЕЛОВЕКА.

Важно:
- Это НЕ недельная схема и НЕ жёсткий сплит "верх/низ/фулбади".
- Это просто три СЛЕДУЮЩИЕ друг за другом тренировки (Тренировка 1 → Тренировка 2 → Тренировка 3),
  которые будут выполняться по мере того, как человек приходит в зал.
- Обычно человек тренируется примерно ${freq} раз в неделю, но это только ориентир по объёму и восстановлению,
  а не жёсткая привязка к дням недели.

Кто это:
${userData}

Восстановление и ощущения сейчас:
${recoveryLine}

Моя недавняя история тренировок (это контекст для прогрессии, а не жёсткий шаблон):
${historyText}

Требования:
- Нужно ровно ${daysInBlock} ОТДЕЛЬНЫХ тренировок: "Тренировка 1", "Тренировка 2", "Тренировка 3".
- Они должны быть логично связаны по нагрузке и мышечным группам, как последовательность сессий:
  можно чередовать акценты (пример: общая фулбоди → больше ноги/ягодицы → больше верх/руки),
  но НЕ нужно строить жёсткий недельный сплит.
- Каждая тренировка по ощущениям должна занимать около ${sessionMinutes} минут.
- Учитывай цель, опыт, частоту тренировок и доступное оборудование.
- Следи за тем, чтобы суммарная нагрузка за эти три сессии была разумной для человека с такими данными.

Верни СТРОГО один JSON-объект:

{
  "workouts": [
    { ...WorkoutPlan для Тренировки 1 },
    { ...WorkoutPlan для Тренировки 2 },
    { ...WorkoutPlan для Тренировки 3 }
  ]
}

Где каждый элемент массива "workouts" имеет структуру:

{
  "title": "Название тренировки (2–6 слов)",
  "duration": ${sessionMinutes},
  "warmup": ["пункты разминки"],
  "exercises": [
    {
      "name": "Название упражнения по-русски",
      "sets": 3,
      "reps": "8-10",
      "restSec": 90,
      "weight": "рабочий вес или 'собственный вес'",
      "targetMuscles": ["Целевая мышца 1", "Целевая мышца 2"],
      "cues": "короткая подсказка по технике"
    }
  ],
  "cooldown": ["пункты заминки"],
  "notes": "1–3 предложения: логика и ощущения этой конкретной тренировки"
}

Без какого-либо текста вне этого JSON-объекта.
`.trim();
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

function buildConstraints(profile: Profile, history: HistorySession[]): Constraints {
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
        `${ex.name}: в прошлый раз ~${suggestion.last} кг, комфортный коридор примерно ${suggestion.min}–${suggestion.max} кг`
      );
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
    (plateau && history.length >= 4) || ((lastRpe ?? 0) >= 9 && (hoursSinceLast ?? 999) < 72);

  return {
    weightGuards,
    weightNotes,
    recovery: {
      hoursSinceLast,
      label: describeRecovery(hoursSinceLast, lastRpe),
    },
    lastRpe,
    plateau,
    deloadSuggested,
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

async function getRecentSessions(userId: string, limit = 10): Promise<any[]> {
  const rows = await q<any>(
    `SELECT finished_at, payload
       FROM workout_sessions
      WHERE user_id = $1
      ORDER BY finished_at DESC
      LIMIT $2`,
    [userId, limit]
  );

  return rows;
}

// ============================================================================
// BLUEPRINT CREATION (минимально нейтральная логика)
// ============================================================================

function createBlueprint(daysPerWeek: number) {
  const n = Math.max(1, daysPerWeek || 3);
  return {
    name: "Гибкая персональная программа",
    days: Array.from({ length: n }, (_, i) => `День ${i + 1}`),
    description:
      "Без жёсткого фиксированного сплита — тренер сам решает структуру каждой тренировки под пользователя.",
  };
}

// ============================================================================
// ROUTES: ГЕНЕРАЦИЯ/СТАТУС/СОХРАНЕНИЕ
// ============================================================================

plan.post(
  "/generate",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    const tz = resolveTimezone(req);
    const force = Boolean(req.body?.force);
    const onboarding = await getOnboarding(userId);
    const isAdmin = isAdminUser(userId);

    // Подписка / пробник
    await ensureSubscription(userId, "workout");

    let existing = await getLatestWorkoutPlan(userId);

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

    if (!isAdmin) {
      if ((todaySessions[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT || (todayPlans[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT) {
        const nextIso = await getNextDailyResetIso(tz);
        const nextLabel = formatDateLabel(new Date(nextIso), tz, { weekday: "long" });

        if (existing && existing.status !== "failed") {
          const createdSameDay =
            existing.created_at &&
            dateIsoFromTimestamp(existing.created_at, tz) === currentDateIsoInTz(tz);
          if (createdSameDay) {
            throw new AppError(
              "Вы уже сгенерировали тренировку. Чтобы получить следующую, завершите текущую и сохраните результат — так мы держим прогрессию под контролем.",
              429,
              {
                code: "active_plan",
                details: { reason: "active_plan", nextDateIso: nextIso, nextDateLabel: nextLabel },
              }
            );
          }
        }

        throw new AppError(
          "Новую тренировку можно будет сгенерировать завтра — телу тоже нужен разумный отдых.",
          429,
          {
            code: "daily_limit",
            details: { reason: "daily_limit", nextDateIso: nextIso, nextDateLabel: nextLabel },
          }
        );
      }
    } else {
      console.log("[WORKOUT] admin bypass daily limit for user", userId);
    }

    const lastSession = await getLastWorkoutSession(userId);

    if (!isAdmin) {
      if (lastSession) {
        if (!lastSession.completed_at) {
          throw new AppError("Сначала заверши текущую тренировку, потом сгенерируем новую.", 403);
        }
        if (lastSession.unlock_used) {
          throw new AppError("Следующая тренировка появится после выполнения текущей.", 403);
        }
      }
    } else {
      console.log("[WORKOUT] admin bypass last-session checks for user", userId);
    }

    // Недельный лимит по онбордингу (мягкий +1 запас)
    if (!isAdmin && WEEKLY_WORKOUT_SOFT_LIMIT > 0) {
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
    } else if (isAdmin) {
      console.log("[WORKOUT] admin bypass weekly limit for user", userId);
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

// НОВЫЙ РОУТ: генерация блока из N тренировок (микроцикл)

plan.post(
  "/generate-block",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    const tz = resolveTimezone(req);
    const onboarding = await getOnboarding(userId);
    const isAdmin = isAdminUser(userId);
    const daysInBlock = Number(req.body?.daysInBlock) || 3;

    // Подписка / пробник
    await ensureSubscription(userId, "workout");

    // Мягкий недельный лимит — можно переиспользовать логику
    if (!isAdmin && WEEKLY_WORKOUT_SOFT_LIMIT > 0) {
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

    console.log("\n=== GENERATING WORKOUT BLOCK (sync) ===");
    console.log("User ID:", userId, "daysInBlock:", daysInBlock);

    const { blockCycle, plans } = await generateWorkoutBlockNow(userId, daysInBlock);

    res.json({
      blockCycle,
      count: plans.length,
      plans: plans.map((row) => buildWorkoutPlanResponse(row)),
    });
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
      await markWorkoutPlanFailed(job.planId, (err as any)?.message?.slice(0, 500) ?? "AI error");
    });
  }, 0);
}

// ============================================================================
// ДВУХШАГОВАЯ ГЕНЕРАЦИЯ ТРЕНИРОВКИ (СВОБОДНЫЙ ТЕКСТ → JSON) — ОДНА СЕССИЯ
// ============================================================================

async function generateWorkoutPlan({ planId, userId }: WorkoutGenerationJob) {
  console.log(`[WORKOUT] ▶️ start two-step free-form generation planId=${planId}`);
  try {
    await setWorkoutPlanProgress(planId, "context", 15);

    const onboarding = await getOnboarding(userId);
    const sessionMinutes = resolveSessionLength(onboarding);
    const profile = buildProfile(onboarding, sessionMinutes);
    const program = await getOrCreateProgram(userId, onboarding);
    const history = summarizeHistory(await getRecentSessions(userId, 10));
    const constraints = buildConstraints(profile, history);

    console.log(
      `[WORKOUT] context user=${userId} program=${program.blueprint_json.name} week=${program.week} day=${
        program.day_idx + 1
      }, exp=${profile.experience}, goals=${profile.goals.join(", ")}`
    );

    // ШАГ 1: свободный «человеческий» план тренировки (как в чате GPT-4o)
    await setWorkoutPlanProgress(planId, "analysis", 35);
    const freeFormPrompt = buildFreeFormWorkoutRequest(
      profile,
      onboarding,
      program,
      constraints,
      sessionMinutes
    );

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== FREE-FORM PROMPT (first 600 chars) ===");
      console.log(freeFormPrompt.slice(0, 600) + "...\n");
    }

    const tFree = Date.now();
    const freeCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: TEMPERATURE_FREE,
      messages: [
        {
          role: "system",
          content:
            "Ты — персональный фитнес-тренер мирового уровня. Думай и пиши так же умно, развернуто и разнообразно, как в обычном чате GPT-4o. Структура, логика и содержание тренировки полностью на твоё усмотрение. Ты сам выбираешь упражнения, объём, порядок, диапазоны и акценты.",
        },
        { role: "user", content: freeFormPrompt },
      ],
    });

    const freeTextPlan = freeCompletion.choices[0].message.content || "";
    console.log(
      `[WORKOUT] free-form plan done in ${Date.now() - tFree}ms, tokens prompt=${
        freeCompletion.usage?.prompt_tokens ?? "?"
      } completion=${freeCompletion.usage?.completion_tokens ?? "?"}`
    );
    console.log(
      `[WORKOUT] free-form preview="${freeTextPlan.replace(/\s+/g, " ").slice(0, 240)}..."`
    );

    // ШАГ 2: конвертация этого текста → JSON по нашей схеме
    await setWorkoutPlanProgress(planId, "ai", 60);
    const jsonPrompt = buildJsonConversionPrompt(freeTextPlan, sessionMinutes);

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== JSON CONVERSION PROMPT (first 600 chars) ===");
      console.log(jsonPrompt.slice(0, 600) + "...\n");
    }

    const tGen = Date.now();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: TEMPERATURE_JSON,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Ты помощник, который берёт готовый текстовый план тренировки и аккуратно переводит его в строгий JSON по заданной схеме. Ты не меняешь смысл тренировки и не придумываешь новые блоки без необходимости.",
        },
        { role: "user", content: jsonPrompt },
      ],
    });
    console.log(
      `[WORKOUT] json conversion done in ${Date.now() - tGen}ms prompt=${
        completion.usage?.prompt_tokens ?? "?"
      } completion=${completion.usage?.completion_tokens ?? "?"} total=${
        completion.usage?.total_tokens ?? "?"
      }`
    );

    let plan: WorkoutPlan;
    try {
      plan = JSON.parse(completion.choices[0].message.content || "{}");
    } catch (err) {
      console.error("Failed to parse AI plan JSON:", err);
      console.error("Raw content:", completion.choices[0].message.content);
      throw new AppError("AI вернул невалидный JSON", 500);
    }

    if (!plan.exercises || !Array.isArray(plan.exercises) || plan.exercises.length === 0) {
      console.error("Invalid plan structure (no exercises):", plan);
      throw new AppError("AI сгенерировал некорректный план тренировки", 500);
    }

    await setWorkoutPlanProgress(planId, "validation", 80);

    // нормализация + проверки
    const validation = validatePlanStructure(plan, constraints, sessionMinutes);
    plan = validation.plan;

    if (validation.warnings.length) {
      console.warn("Plan warnings:", validation.warnings);
    }

    const analysis = {
      trainerAnalysis: freeTextPlan,
      trainerPlanText: freeTextPlan,
      historySummary: constraints.historySummary,
      recovery: constraints.recovery.label,
      hoursSinceLast: constraints.recovery.hoursSinceLast,
      lastRpe: constraints.lastRpe,
      plateau: constraints.plateau,
      deloadSuggested: constraints.deloadSuggested,
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
  } catch (err) {
    console.error("Async workout generation failed:", err);
    await markWorkoutPlanFailed(planId, (err as any)?.message?.slice(0, 500) ?? "AI error");
    throw err;
  }
}

// ============================================================================
// СИНХРОННАЯ ГЕНЕРАЦИЯ БЛОКА ИЗ N ТРЕНИРОВОК (МИКРОЦИКЛ)
// ============================================================================

type WorkoutBlockGenerationResult = {
  blockCycle: number;
  plans: WorkoutPlanRow[];
};

async function generateWorkoutBlockNow(
  userId: string,
  daysInBlock = 3
): Promise<WorkoutBlockGenerationResult> {
  console.log(`[WORKOUT] ▶️ start block generation user=${userId}, days=${daysInBlock}`);

  const onboarding = await getOnboarding(userId);
  const sessionMinutes = resolveSessionLength(onboarding);
  const profile = buildProfile(onboarding, sessionMinutes);
  const program = await getOrCreateProgram(userId, onboarding);
  const historyRows = await getRecentSessions(userId, 10);
  const history = summarizeHistory(historyRows);
  const constraints = buildConstraints(profile, history);

  console.log(
    `[WORKOUT] block context user=${userId} program=${program.blueprint_json.name} week=${program.week} day=${
      program.day_idx + 1
    }, exp=${profile.experience}, goals=${profile.goals.join(", ")}`
  );

  const blockCycle = await getNextBlockCycle(userId);

  const prompt = buildBlockGenerationPrompt({
    profile,
    onboarding,
    constraints,
    sessionMinutes,
    daysInBlock,
  });

  if (process.env.DEBUG_AI === "1") {
    console.log("\n=== BLOCK PROMPT (first 600 chars) ===");
    console.log(prompt.slice(0, 600) + "...\n");
  }

  const tGen = Date.now();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Ты опытный персональный тренер. Составляешь связанный микроцикл из нескольких тренировок. Возвращаешь строго JSON-объект с массивом тренировок по заданной схеме.",
      },
      { role: "user", content: prompt },
    ],
  });

  console.log(
    `[WORKOUT] block generation done in ${Date.now() - tGen}ms prompt=${
      completion.usage?.prompt_tokens ?? "?"
    } completion=${completion.usage?.completion_tokens ?? "?"} total=${
      completion.usage?.total_tokens ?? "?"
    }`
  );

  let parsed: { workouts: WorkoutPlan[] };
  try {
    parsed = JSON.parse(completion.choices[0].message.content || "{}");
  } catch (err) {
    console.error("Failed to parse AI block JSON:", err);
    console.error("Raw content:", completion.choices[0].message.content);
    throw new AppError("AI вернул невалидный JSON-блок тренировок", 500);
  }

  const workouts = Array.isArray(parsed.workouts) ? parsed.workouts : [];
  if (!workouts.length) {
    console.error("Block JSON has no workouts:", parsed);
    throw new AppError("AI сгенерировал пустой блок тренировок", 500);
  }

  const inserted: WorkoutPlanRow[] = [];

  for (let i = 0; i < workouts.length; i++) {
    const rawPlan = workouts[i];

    const validation = validatePlanStructure(rawPlan, constraints, sessionMinutes);
    const plan = validation.plan;

    if (validation.warnings.length) {
      console.warn(`Block plan[${i}] warnings:`, validation.warnings);
    }

    const analysis = {
      historySummary: constraints.historySummary,
      recovery: constraints.recovery.label,
      hoursSinceLast: constraints.recovery.hoursSinceLast,
      lastRpe: constraints.lastRpe,
      plateau: constraints.plateau,
      deloadSuggested: constraints.deloadSuggested,
      weightNotes: constraints.weightNotes,
      warnings: validation.warnings,
    };

    const rows = await q<WorkoutPlanRow>(
      `INSERT INTO workout_plans
         (user_id, status, plan, analysis, error_info, progress_stage, progress_percent, block_cycle, block_index)
       VALUES ($1, 'ready', $2::jsonb, $3::jsonb, NULL, 'ready', 100, $4, $5)
       RETURNING id,
                 user_id,
                 status,
                 plan,
                 analysis,
                 error_info,
                 progress_stage,
                 progress_percent,
                 created_at,
                 updated_at,
                 block_cycle,
                 block_index`,
      [userId, plan, analysis, blockCycle, i + 1]
    );

    inserted.push(rows[0]);
  }

  console.log(
    `[WORKOUT] ✅ block ready user=${userId}, block_cycle=${blockCycle}, workouts=${inserted.length}`
  );

  return { blockCycle, plans: inserted };
}

// ============================================================================
// ВАЛИДАЦИЯ И НОРМАЛИЗАЦИЯ ПЛАНА
// ============================================================================

function validatePlanStructure(
  plan: WorkoutPlan,
  constraints: Constraints,
  sessionMinutes: number
): { plan: WorkoutPlan; warnings: string[] } {
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
      `Мало упражнений (${normalized.exercises.length}) — ожидается хотя бы ${minRequired} для такой длительности.`
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
      reps: ex.reps || "8-12 повторов",
      restSec: Number(ex.restSec) || 90,
      targetMuscles: Array.isArray(ex.targetMuscles) ? ex.targetMuscles : [],
      cues: ex.cues || "Следи за техникой и контролируй движение",
      weight: baseWeight,
    } as Exercise;

    const guard = constraints.weightGuards[slugify(updated.name)];
    const numericWeight = numberFrom(ex.weight ?? null);
    if (guard) {
      if (numericWeight == null) {
        updated.weight = formatWeight(guard.recommended) || undefined;
        warnings.push(`${updated.name}: добавлен рекомендуемый вес ${updated.weight}`);
      } else if (numericWeight < guard.min) {
        updated.weight = formatWeight(guard.min) || undefined;
        warnings.push(`${updated.name}: поднят вес до безопасного минимума ${updated.weight}`);
      } else if (numericWeight > guard.max) {
        updated.weight = formatWeight(guard.max) || undefined;
        warnings.push(
          `${updated.name}: снижен вес до ${updated.weight}, чтобы не превышать разумный диапазон`
        );
      }
    }

    return updated;
  });

  if (!normalized.warmup.length) {
    warnings.push("В плане нет разминки — добавь 3–5 простых пунктов разминки под мышцы дня.");
  }
  if (!normalized.cooldown.length) {
    warnings.push("В плане нет заминки — добавь несколько пунктов лёгкой растяжки/дыхания.");
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
  res.json({ ok: true, version: "2.1-ai-first-user-style-two-step-free-form-with-blocks" });
});

export default plan;

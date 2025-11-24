// plan-refactored.ts
// ============================================================================
// AI-FIRST FITNESS TRAINER - BLOCK GENERATION
// Генерация блоков из 3 тренировок с прогрессией
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
type HistoryExercise = {
  name: string;
  reps?: string | number;
  weight?: string | number | null;
  sets?: HistoryExerciseSet[];
};

type HistorySession = {
  date: string;
  title?: string;
  exercises: HistoryExercise[];
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
  block_cycle?: number | null;
  block_index?: number | null;
};

type BlockGenerationJob = {
  userId: string;
  blockCycle: number;
  planIds: string[];
};

// ============================================================================
// CONSTANTS / UTILS
// ============================================================================

const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);

const TEMPERATURE_FREE = 0.9;
const TEMPERATURE_JSON = 0.25;

const HISTORY_LIMIT = 6; // всегда берём 6 последних тренировок
const MIN_REAL_DURATION_MIN = 20;
const MOSCOW_TZ = "Europe/Moscow";

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

async function getNextDailyResetIso(tz: string): Promise<string> {
  const rows = await q<{ boundary: string }>(
    `SELECT ((date_trunc('day', (now() AT TIME ZONE $1)) + interval '1 day')) AT TIME ZONE 'UTC' AS boundary`,
    [tz]
  );
  return rows[0]?.boundary ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

const ensureUser = (req: any): string => {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
};

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

async function createWorkoutPlanShells(
  userId: string,
  blockCycle: number,
  count: number
): Promise<WorkoutPlanRow[]> {
  const shells: WorkoutPlanRow[] = [];
  
  for (let i = 0; i < count; i++) {
    const rows = await q<WorkoutPlanRow>(
      `INSERT INTO workout_plans (user_id, status, progress_stage, progress_percent, block_cycle, block_index)
       VALUES ($1, 'processing', 'queued', 5, $2, $3)
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
      [userId, blockCycle, i + 1]
    );
    shells.push(rows[0]);
  }
  
  return shells;
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

async function setBlockProgress(planIds: string[], stage: string, percent: number | null) {
  if (!planIds.length) return;
  await q(
    `UPDATE workout_plans
        SET progress_stage = $2,
            progress_percent = $3,
            updated_at = now()
      WHERE id = ANY($1::uuid[])`,
    [planIds, stage, percent]
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

async function markWorkoutPlansFailed(planIds: string[], message: string | null) {
  if (!planIds.length) return;
  await q(
    `UPDATE workout_plans
        SET status = 'failed',
            error_info = $2,
            progress_stage = 'failed',
            progress_percent = NULL,
            updated_at = now()
      WHERE id = ANY($1::uuid[])`,
    [planIds, message]
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
      sets: Array.isArray(ex.sets)
        ? ex.sets.map((set: any) => ({
            reps: numberFrom(set?.reps),
            weight: numberFrom(set?.weight),
          }))
        : [],
    })),
  }));
}

function formatHistorySimple(history: HistorySession[]): string {
  if (!history.length) {
    return "В истории тренировок пока ничего нет. Это первый блок из 3 тренировок.";
  }

  return history
    .slice(0, HISTORY_LIMIT)
    .map((session, idx) => {
      const exercises = session.exercises
        .slice(0, 5)
        .map((ex) => {
          const sets = ex.sets || [];
          if (sets.length > 0) {
            const avgReps = sets.reduce((sum, s) => sum + (s.reps || 0), 0) / sets.length;
            const avgWeight = sets.reduce((sum, s) => sum + (s.weight || 0), 0) / sets.length;
            return `${ex.name} ${sets.length}х${Math.round(avgReps)} ${avgWeight > 0 ? avgWeight.toFixed(1) + "кг" : ""}`;
          }
          return `${ex.name} ${ex.reps || ""} ${ex.weight || ""}`;
        })
        .join(", ");

      const dateStr = new Date(session.date).toLocaleDateString("ru-RU");
      return `Тренировка ${idx + 1} (${dateStr}): ${exercises}`;
    })
    .join("\n");
}

function describeEquipment(onboarding: any): string {
  const env = onboarding.environment || {};
  if (env.bodyweightOnly === true) {
    return "тренируюсь только с весом собственного тела";
  }

  const location = (env.location || "").toLowerCase();
  if (location === "gym" || location.includes("зал")) {
    return "занимаюсь в полноценном тренажёрном зале со свободными весами и тренажёрами";
  }

  if (location === "outdoor" || location.includes("street") || location.includes("улиц")) {
    return "занимаюсь на уличной площадке с турником и брусьями";
  }

  if (location === "home" || location.includes("дом")) {
    return "занимаюсь дома с минимальным оборудованием";
  }

  return "занимаюсь с доступным оборудованием";
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
// ПРОМПТЫ ДЛЯ ГЕНЕРАЦИИ БЛОКА
// ============================================================================

function buildBlockPrompt(params: {
  profile: Profile;
  onboarding: any;
  historyText: string;
  sessionMinutes: number;
}): string {
  const { profile, onboarding, historyText, sessionMinutes } = params;

  const sexText = profile.sex === "male" ? "мужчина" : profile.sex === "female" ? "женщина" : "";
  const ageText = profile.age ? `${profile.age} лет` : "";
  const bodyText =
    profile.height && profile.weight ? `рост ${profile.height} см вес ${profile.weight} кг` : "";

  const expMap: Record<Profile["experience"], string> = {
    beginner: "новичок",
    intermediate: "средний уровень",
    advanced: "продвинутый",
  };
  const experience = expMap[profile.experience] || "средний уровень";

  const goals = profile.goals?.length ? profile.goals.join(", ") : "поддержание формы";
  const equipment = describeEquipment(onboarding);

  return `
Сгенерируй 3 тренировки для ${sexText} ${ageText} ${bodyText}, цель: ${goals}, опыт: ${experience}, готов тренироваться ${profile.daysPerWeek} раза в неделю по ${sessionMinutes} минут. ${equipment}.

${historyText}

Формат ответа:
Напиши текстом, как в обычном чате. Я хочу увидеть чётко разделённые блоки:

Тренировка 1
Название: ...
Разминка:
- ...
Основная часть:
1) Упражнение (подходы х повторения, отдых, вес)
2) ...
Заминка:
- ...
Краткий комментарий.

Тренировка 2
...

Тренировка 3
...

Важно:
- Учитывай мой пол, возраст, цель, опыт и оборудование
- Каждая тренировка примерно ${sessionMinutes} минут
- Если есть история тренировок, делай прогрессию по весам и повторениям
- Структуру и упражнения выбираешь сам
`.trim();
}

function buildBlockJsonConversionPrompt(freeTextBlock: string, sessionMinutes: number): string {
  return `
Ниже дан текстовый план из 3 тренировок.

ТВОЯ ЗАДАЧА:
Извлечь тренировки и вернуть один JSON-объект:

{
  "workouts": [
    {
      "title": "Название тренировки",
      "duration": ${sessionMinutes},
      "warmup": ["Пункт разминки 1", "Пункт разминки 2"],
      "exercises": [
        {
          "name": "Название упражнения",
          "sets": 3,
          "reps": "8-10",
          "restSec": 90,
          "weight": "текстовое описание веса",
          "targetMuscles": ["Мышца 1", "Мышца 2"],
          "cues": "короткая подсказка по технике"
        }
      ],
      "cooldown": ["Пункт заминки 1"],
      "notes": "краткий комментарий"
    }
  ]
}

Исходный текст:

"""
${freeTextBlock}
"""

Требования:
- Основа — этот текст, не придумывай другие тренировки
- Распознай границы между тренировками
- Если полей нет, заполни по смыслу
- Верни СТРОГО один JSON-объект, без markdown и комментариев
`.trim();
}

// ============================================================================
// ГЕНЕРАЦИЯ БЛОКА (ASYNC)
// ============================================================================

async function generateWorkoutBlock(job: BlockGenerationJob) {
  const { userId, blockCycle, planIds } = job;
  console.log(`[WORKOUT BLOCK] ▶️ start generation user=${userId} cycle=${blockCycle}`);

  try {
    await setBlockProgress(planIds, "context", 15);

    const onboarding = await getOnboarding(userId);
    const sessionMinutes = resolveSessionLength(onboarding);
    const profile = buildProfile(onboarding, sessionMinutes);
    const historyRows = await getRecentSessions(userId, HISTORY_LIMIT);
    const history = summarizeHistory(historyRows);
    const historyText = formatHistorySimple(history);

    console.log(
      `[WORKOUT BLOCK] context user=${userId} exp=${profile.experience} goals=${profile.goals.join(", ")} history=${history.length} sessions`
    );

    // ШАГ 1: свободный текст
    await setBlockProgress(planIds, "analysis", 35);
    const freeFormPrompt = buildBlockPrompt({
      profile,
      onboarding,
      historyText,
      sessionMinutes,
    });

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== BLOCK FREE-FORM PROMPT ===");
      console.log(freeFormPrompt.slice(0, 800) + "...\n");
    }

    const tFree = Date.now();
    const freeCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: TEMPERATURE_FREE,
      messages: [
        {
          role: "system",
          content:
            "Ты персональный фитнес-тренер. Пишешь живым текстом, как в чате. Структуру и упражнения выбираешь сам на основе данных пользователя.",
        },
        { role: "user", content: freeFormPrompt },
      ],
    });

    const freeTextBlock = freeCompletion.choices[0].message.content || "";
    console.log(
      `[WORKOUT BLOCK] free-form done in ${Date.now() - tFree}ms, tokens: ${
        freeCompletion.usage?.total_tokens ?? "?"
      }`
    );

    // ШАГ 2: конвертация в JSON
    await setBlockProgress(planIds, "ai", 60);
    const jsonPrompt = buildBlockJsonConversionPrompt(freeTextBlock, sessionMinutes);

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== BLOCK JSON CONVERSION PROMPT ===");
      console.log(jsonPrompt.slice(0, 800) + "...\n");
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
            "Ты помощник, который конвертирует текстовый план тренировок в строгий JSON без изменения смысла.",
        },
        { role: "user", content: jsonPrompt },
      ],
    });

    console.log(
      `[WORKOUT BLOCK] json conversion done in ${Date.now() - tGen}ms, tokens: ${
        completion.usage?.total_tokens ?? "?"
      }`
    );

    let parsed: { workouts: WorkoutPlan[] };
    try {
      parsed = JSON.parse(completion.choices[0].message.content || "{}");
    } catch (err) {
      console.error("Failed to parse AI block JSON:", err);
      throw new AppError("AI вернул невалидный JSON", 500);
    }

    const workouts = Array.isArray(parsed.workouts) ? parsed.workouts : [];
    if (workouts.length !== 3) {
      console.error("Block JSON has wrong number of workouts:", workouts.length);
      throw new AppError("AI сгенерировал неверное количество тренировок", 500);
    }

    await setBlockProgress(planIds, "validation", 80);

    // Сохраняем каждую тренировку
    for (let i = 0; i < workouts.length; i++) {
      const plan = normalizeWorkoutPlan(workouts[i], sessionMinutes);
      const analysis = {
        freeTextBlock,
        historyCount: history.length,
      };

      await markWorkoutPlanReady(planIds[i], plan, analysis);
    }

    console.log(`[WORKOUT BLOCK] ✅ block ready user=${userId} cycle=${blockCycle}`);
  } catch (err) {
    console.error("Block generation failed:", err);
    await markWorkoutPlansFailed(planIds, (err as any)?.message?.slice(0, 500) ?? "AI error");
    throw err;
  }
}

function normalizeWorkoutPlan(plan: WorkoutPlan, sessionMinutes: number): WorkoutPlan {
  return {
    title: plan.title || "Персональная тренировка",
    duration: plan.duration || sessionMinutes || 60,
    warmup: Array.isArray(plan.warmup) ? plan.warmup : [],
    exercises: Array.isArray(plan.exercises)
      ? plan.exercises.map((ex) => ({
          name: ex.name || "Упражнение",
          sets: ex.sets || 3,
          reps: ex.reps || "8-12",
          restSec: ex.restSec || 90,
          weight: ex.weight,
          targetMuscles: Array.isArray(ex.targetMuscles) ? ex.targetMuscles : [],
          cues: ex.cues || "",
        }))
      : [],
    cooldown: Array.isArray(plan.cooldown) ? plan.cooldown : [],
    notes: plan.notes || "",
  };
}

function queueBlockGeneration(job: BlockGenerationJob) {
  setTimeout(() => {
    generateWorkoutBlock(job).catch(async (err) => {
      console.error("Async block generation failed:", err);
      await markWorkoutPlansFailed(job.planIds, (err as any)?.message?.slice(0, 500) ?? "AI error");
    });
  }, 0);
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
    const isAdmin = isAdminUser(userId);

    await ensureSubscription(userId, "workout");

    let existing = await getLatestWorkoutPlan(userId);

    // Проверка: если есть незавершённая генерация
    if (existing && existing.status === "processing" && !force) {
      console.log("Existing processing plan:", existing.id);
      return res.json(buildWorkoutPlanResponse(existing));
    }

    // Проверка: если есть готовый план за сегодня
    if (existing && existing.status === "ready" && !force) {
      const createdSameDay =
        existing.created_at &&
        dateIsoFromTimestamp(existing.created_at, tz) === currentDateIsoInTz(tz);
      
      if (createdSameDay && !isAdmin) {
        const nextIso = await getNextDailyResetIso(tz);
        const nextLabel = formatDateLabel(new Date(nextIso), tz, { weekday: "long" });
        
        throw new AppError(
          "Вы уже сгенерировали блок тренировок сегодня. Чтобы получить следующий блок, завершите текущие тренировки.",
          429,
          {
            code: "active_plan",
            details: { reason: "active_plan", nextDateIso: nextIso, nextDateLabel: nextLabel },
          }
        );
      }
    }

    // Проверка последней сессии
    const lastSession = await getLastWorkoutSession(userId);
    if (!isAdmin && lastSession) {
      if (!lastSession.completed_at) {
        throw new AppError("Сначала заверши текущую тренировку, потом сгенерируем новую.", 403);
      }
    }

    console.log("\n=== GENERATING WORKOUT BLOCK (async) ===");
    console.log("User ID:", userId, "force:", force);

    const blockCycle = await getNextBlockCycle(userId);
    const shells = await createWorkoutPlanShells(userId, blockCycle, 3);
    const planIds = shells.map((s) => s.id);

    console.log("Queued workout block:", blockCycle, "plans:", planIds);

    queueBlockGeneration({ userId, blockCycle, planIds });

    // Возвращаем первую тренировку из блока
    res.json(buildWorkoutPlanResponse(shells[0]));
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

// Получить все тренировки текущего блока
plan.get(
  "/block/current",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    
    const latest = await getLatestWorkoutPlan(userId);
    if (!latest?.block_cycle) {
      return res.status(404).json({ error: "no_block_found" });
    }

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
        WHERE user_id = $1 AND block_cycle = $2
        ORDER BY block_index ASC`,
      [userId, latest.block_cycle]
    );

    res.json({
      blockCycle: latest.block_cycle,
      workouts: rows.map(buildWorkoutPlanResponse),
    });
  })
);

// ============================================================================
// СОХРАНЕНИЕ ТРЕНИРОВКИ
// ============================================================================

plan.post(
  "/save-session",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);

    const payload = req.body?.payload;
    const startedAtInput = req.body?.startedAt;
    const durationMinInput = req.body?.durationMin;

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
      }

      // Помечаем предыдущую сессию как использованную
      const lastSession = await getLastWorkoutSession(userId);
      if (lastSession?.completed_at && !lastSession.unlock_used) {
        await q(`UPDATE workouts SET unlock_used = true WHERE id = $1`, [lastSession.id]);
      }

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
  res.json({ ok: true, version: "3.0-block-generation-simple-history" });
});

export default plan;
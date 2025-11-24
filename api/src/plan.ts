// plan-refactored.ts
// ============================================================================
// AI-FIRST FITNESS TRAINER — УПРОЩЁННАЯ ВЕРСИЯ
// Генерация блоков тренировок как обычный чат-запрос + конвертация в JSON
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
  weight?: string | null;
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

type WorkoutPlanRow = {
  id: string;
  user_id: string;
  status: "ready" | "processing" | "failed";
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

// ============================================================================
// CONSTANTS / UTILS
// ============================================================================

const TEMPERATURE_FREE = 0.9; // шаг 1: живой текст
const TEMPERATURE_JSON = 0.25; // шаг 2: строгий JSON

const HISTORY_LIMIT = 6; // последние 6 тренировок для прогрессии
const MIN_REAL_DURATION_MIN = 20;

const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);

const ensureUser = (req: any): string => {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
};

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const num = Number(match[0]);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

// ============================================================================
// DB HELPERS
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

async function getRecentSessions(userId: string, limit = HISTORY_LIMIT): Promise<HistorySession[]> {
  const rows = await q<any>(
    `SELECT finished_at, payload
       FROM workout_sessions
      WHERE user_id = $1
      ORDER BY finished_at DESC
      LIMIT $2`,
    [userId, limit]
  );

  return rows.map((row: any) => ({
    date: row.finished_at,
    title: row.payload?.title,
    exercises: Array.isArray(row.payload?.exercises)
      ? row.payload.exercises.map((ex: any) => ({
          name: ex.name,
          reps: ex.reps,
          weight: ex.weight,
          sets: Array.isArray(ex.sets)
            ? ex.sets.map((s: any) => ({
                reps: numberFrom(s?.reps) ?? undefined,
                weight: numberFrom(s?.weight) ?? undefined,
              }))
            : [],
        }))
      : [],
  }));
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

// ============================================================================
// PROFILE / HISTORY TEXT
// ============================================================================

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
    if (typeof value === "number" && value > 0) return Math.round(value);
    if (typeof value === "string") {
      const match = value.replace(",", ".").match(/(\d+(\.\d+)?)/);
      if (match) {
        const num = Number(match[1]);
        if (Number.isFinite(num) && num > 0) return Math.round(num);
      }
    }
  }

  return 90; // дефолт как в примере
}

function buildHumanProfileLine(onboarding: any, sessionMinutes: number): string {
  const age = numberFrom(onboarding?.ageSex?.age);
  const sexRaw = (onboarding?.ageSex?.sex || "").toLowerCase();
  const weight = numberFrom(onboarding?.body?.weight);
  const height = numberFrom(onboarding?.body?.height);
  const daysPerWeek = Number(onboarding?.schedule?.daysPerWeek) || 3;

  const sex =
    sexRaw === "male" || sexRaw === "м" || sexRaw === "мужчина"
      ? "мужчины"
      : sexRaw === "female" || sexRaw === "ж" || sexRaw === "женщина"
      ? "женщины"
      : "человека";

  const parts: string[] = [];

  parts.push(sex);

  if (age) parts.push(`${age} лет`);
  if (height) parts.push(`рост ${height} см`);
  if (weight) parts.push(`вес ${weight} кг`);

  const goalsArray = Array.isArray(onboarding?.goals)
    ? onboarding.goals
    : onboarding?.goals
    ? [onboarding.goals]
    : [];
  const goalsText = goalsArray.length ? goalsArray.join(", ") : "поддержание формы";

  const lineBase = parts.join(", ");
  const freq = `готов тренироваться ${daysPerWeek} раз в неделю по ${sessionMinutes} минут`;

  return `${lineBase}, цель: ${goalsText}, ${freq}`;
}

function describeEquipment(onboarding: any): string {
  const env = onboarding.environment || {};
  const location = (env.location || "").toLowerCase();

  if (env.bodyweightOnly === true) {
    return "тренируется только с весом собственного тела, без штанги и без больших тренажёров";
  }

  if (location.includes("зал") || location === "gym") {
    return "занимается в полноценном тренажёрном зале";
  }

  if (location.includes("дом") || location === "home") {
    return "занимается дома с базовым инвентарём";
  }

  if (location.includes("улиц") || location.includes("street") || location === "outdoor") {
    return "занимается на уличной площадке";
  }

  return "условия тренировок средние (есть базовый инвентарь)";
}

function summarizeHistoryText(history: HistorySession[]): string {
  if (!history.length) {
    return "В истории тренировок пока ничего нет — это первый блок.";
  }

  const lines: string[] = [];
  history.forEach((session, idx) => {
    const label = idx === 0 ? "Последняя тренировка" : `${idx + 1}-я тренировка назад`;
    const dateStr = new Date(session.date).toLocaleDateString("ru-RU");
    const firstExercises = session.exercises.slice(0, 3);
    const exLines = firstExercises
      .map((ex) => {
        const reps = ex.reps ? String(ex.reps) : "";
        const weight = ex.weight ? String(ex.weight) : "";
        const setsCount = Array.isArray(ex.sets) ? ex.sets.length : 0;
        const setsText = setsCount ? `${setsCount} подхода(ов)` : "";
        const weightText = weight ? `, вес ~${weight}` : "";
        const repsText = reps ? `, повторы ${reps}` : "";
        return `• ${ex.name}${setsText || repsText || weightText ? " —" : ""}${setsText}${repsText}${weightText}`;
      })
      .join("\n");

    lines.push(`${label} (${dateStr}):\n${exLines || "• упражнения без деталей"}`);
  });

  return lines.join("\n\n");
}

// ============================================================================
// ПРИВЯЗКА К ФРОНТУ
// ============================================================================

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

// ============================================================================
// ПРОМПТЫ
// ============================================================================

function buildFreeFormBlockPrompt(params: {
  profileLine: string;
  equipmentLine: string;
  historyText: string;
  daysInBlock: number;
  sessionMinutes: number;
  isFirstBlock: boolean;
}): string {
  const { profileLine, equipmentLine, historyText, daysInBlock, sessionMinutes, isFirstBlock } =
    params;

  const firstLine = isFirstBlock
    ? `Сгенерируй, пожалуйста, ${daysInBlock} тренировок для ${profileLine}. В истории тренировок пока ничего нет. Это первый блок из ${daysInBlock} тренировок.`
    : `Сгенерируй, пожалуйста, следующий блок из ${daysInBlock} тренировок для ${profileLine}. Ниже история последних тренировок — используй её для прогрессии по весам и по повторениям.`;

  const historyBlock = isFirstBlock
    ? "История тренировок: в истории тренировок пока ничего нет."
    : `История последних тренировок (максимум ${HISTORY_LIMIT}):\n${historyText}`;

  return `
${firstLine}
Этот человек ${equipmentLine}.

${historyBlock}

Формат ответа (живая речь, как в обычном чате с GPT):
- Тренировка 1: название, затем блок "Разминка" списком, затем блок "Основная часть" списком упражнений, затем "Заминка" и короткий комментарий тренера.
- Тренировка 2: аналогично.
- Тренировка ${daysInBlock}: аналогично.

Важно:
- Каждая тренировка должна по ощущениям занимать около ${sessionMinutes} минут.
- Прогрессия: если это не первый блок, аккуратно продвигайся по весам и/или по повторениям на базовых упражнениях, но без резких прыжков. Если где-то нагрузка высоковата — можно оставить прежний вес и немного поработать над техникой.
- Упражнения, подходы и повторы подбирай сам, исходя из описания человека.
- Не думай о JSON, просто напиши понятный структурированный текст.
`.trim();
}

function buildBlockJsonConversionPrompt(
  freeTextBlock: string,
  sessionMinutes: number,
  daysInBlock: number
): string {
  return `
Ниже дан текстовый план из нескольких тренировок ("Тренировка 1", "Тренировка 2", ...).

ТВОЯ ЗАДАЧА:
аккуратно разобрать этот текст и вернуть один JSON-объект формата:

{
  "workouts": [
    {
      "title": string,
      "duration": number,
      "warmup": string[],
      "exercises": [
        {
          "name": string,
          "sets": number,
          "reps": string,
          "restSec": number,
          "weight": string | null,
          "targetMuscles": string[],
          "cues": string
        }
      ],
      "cooldown": string[],
      "notes": string
    }
  ]
}

Где:
- "workouts" — массив из ${daysInBlock} тренировок в том же порядке, что и в тексте.
- "duration" — ориентировочно около ${sessionMinutes} минут, если нет других подсказок.
- "warmup"/"cooldown" — списки коротких пунктов.
- "exercises" — упражнения основной части.
- "notes" — краткий комментарий тренера (1–3 предложения).

Исходный текст:

"""
${freeTextBlock}
"""

Правила:
- Основа — этот текст. Не придумывай новые тренировки и не меняй их порядок без необходимости.
- Если чего-то явно нет (например, заминка или notes), можно заполнить по здравому смыслу.
- Верни СТРОГО один JSON-объект указанного формата, без markdown, без комментариев и без лишнего текста вокруг.
`.trim();
}

// ============================================================================
// НОРМАЛИЗАЦИЯ ПЛАНА
// ============================================================================

function normalizeWorkoutPlan(raw: any, sessionMinutes: number): WorkoutPlan {
  const warmup = Array.isArray(raw.warmup)
    ? raw.warmup.map((s: any) => String(s)).filter((s: string) => s.trim().length > 0)
    : [];

  const exercisesRaw = Array.isArray(raw.exercises) ? raw.exercises : [];

  const exercises: Exercise[] = exercisesRaw.map((ex: any) => ({
    name: ex.name ? String(ex.name) : "Упражнение",
    sets: typeof ex.sets === "number" && ex.sets > 0 ? ex.sets : 3,
    reps: ex.reps ? String(ex.reps) : "8-12",
    restSec: typeof ex.restSec === "number" && ex.restSec > 0 ? ex.restSec : 90,
    weight: ex.weight != null ? String(ex.weight) : null,
    targetMuscles: Array.isArray(ex.targetMuscles)
      ? ex.targetMuscles.map((m: any) => String(m))
      : [],
    cues: ex.cues ? String(ex.cues) : "",
  }));

  const cooldown = Array.isArray(raw.cooldown)
    ? raw.cooldown.map((s: any) => String(s)).filter((s: string) => s.trim().length > 0)
    : [];

  return {
    title: raw.title ? String(raw.title) : "Персональная тренировка",
    duration:
      typeof raw.duration === "number" && raw.duration > 0 ? raw.duration : sessionMinutes || 60,
    warmup,
    exercises,
    cooldown,
    notes: raw.notes ? String(raw.notes) : "",
  };
}

// ============================================================================
// ЯДРО: ГЕНЕРАЦИЯ БЛОКА СЕЙЧАС
// ============================================================================

type WorkoutBlockGenerationResult = {
  blockCycle: number;
  plans: WorkoutPlanRow[];
};

async function generateWorkoutBlockNow(
  userId: string,
  daysInBlock: number
): Promise<WorkoutBlockGenerationResult> {
  console.log(`[WORKOUT] ▶️ start block generation user=${userId}, days=${daysInBlock}`);

  const onboarding = await getOnboarding(userId);
  const sessionMinutes = resolveSessionLength(onboarding);
  const history = await getRecentSessions(userId, HISTORY_LIMIT);

  const profileLine = buildHumanProfileLine(onboarding, sessionMinutes);
  const equipmentLine = describeEquipment(onboarding);
  const historyText = summarizeHistoryText(history);
  const isFirstBlock = history.length === 0;

  const freeFormPrompt = buildFreeFormBlockPrompt({
    profileLine,
    equipmentLine,
    historyText,
    daysInBlock,
    sessionMinutes,
    isFirstBlock,
  });

  if (process.env.DEBUG_AI === "1") {
    console.log("\n=== BLOCK FREE-FORM PROMPT (first 600 chars) ===");
    console.log(freeFormPrompt.slice(0, 600) + "...\n");
  }

  // Шаг 1: обычный "чатовый" ответ — живой текст с 3 тренировками
  const tFree = Date.now();
  const freeCompletion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: TEMPERATURE_FREE,
    messages: [
      {
        role: "system",
        content:
          "Ты — персональный фитнес-тренер мирового уровня. Пишешь живым, понятным текстом, как в обычном чате с человеком.",
      },
      { role: "user", content: freeFormPrompt },
    ],
  });

  const freeTextBlock = freeCompletion.choices[0].message.content || "";
  console.log(
    `[WORKOUT] block free-form done in ${Date.now() - tFree}ms; preview="${freeTextBlock
      .replace(/\s+/g, " ")
      .slice(0, 240)}..."`
  );

  // Шаг 2: этот текст → JSON { workouts: [...] }
  const jsonPrompt = buildBlockJsonConversionPrompt(
    freeTextBlock,
    sessionMinutes,
    daysInBlock
  );

  if (process.env.DEBUG_AI === "1") {
    console.log("\n=== BLOCK JSON CONVERSION PROMPT (first 600 chars) ===");
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
          "Ты помощник, который берёт готовый текстовый план из нескольких тренировок и переводит его в строгий JSON по заданной схеме, не меняя смысла.",
      },
      { role: "user", content: jsonPrompt },
    ],
  });

  console.log(
    `[WORKOUT] block json conversion done in ${Date.now() - tGen}ms; tokens=${
      completion.usage?.total_tokens ?? "?"
    }`
  );

  let parsed: { workouts: any[] };
  try {
    parsed = JSON.parse(completion.choices[0].message.content || "{}");
  } catch (err) {
    console.error("Failed to parse AI block JSON:", err);
    console.error("Raw content:", completion.choices[0].message.content);
    throw new AppError("AI вернул невалидный JSON-блок тренировок", 500);
  }

  const workoutsRaw = Array.isArray(parsed.workouts) ? parsed.workouts : [];
  if (!workoutsRaw.length) {
    console.error("Block JSON has no workouts:", parsed);
    throw new AppError("AI сгенерировал пустой блок тренировок", 500);
  }

  const blockCycle = await getNextBlockCycle(userId);
  const inserted: WorkoutPlanRow[] = [];

  for (let i = 0; i < workoutsRaw.length; i++) {
    const plan = normalizeWorkoutPlan(workoutsRaw[i], sessionMinutes);

    const analysis = {
      freeText: freeTextBlock,
      profileLine,
      equipmentLine,
      historyText,
      isFirstBlock,
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
// ROUTES: ГЕНЕРАЦИЯ БЛОКА / ОДНОЙ ТРЕНИРОВКИ / СТАТУС / СОХРАНЕНИЕ
// ============================================================================

// Генерация БЛОКА (основной сценарий)
plan.post(
  "/generate-block",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    const daysInBlock = Number(req.body?.daysInBlock) || 3;

    // Подписка / пробник
    await ensureSubscription(userId, "workout");

    const { blockCycle, plans } = await generateWorkoutBlockNow(userId, daysInBlock);

    res.json({
      blockCycle,
      count: plans.length,
      plans: plans.map((row) => buildWorkoutPlanResponse(row)),
    });
  })
);

// Генерация одной тренировки (просто блок из 1 тренировки)
plan.post(
  "/generate",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);

    await ensureSubscription(userId, "workout");

    const { blockCycle, plans } = await generateWorkoutBlockNow(userId, 1);
    const first = plans[0];

    res.json({
      blockCycle,
      plan: buildWorkoutPlanResponse(first),
    });
  })
);

// Текущий последний план
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

// Статус конкретного плана
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
// СОХРАНЕНИЕ ФАКТИЧЕСКОЙ ТРЕНИРОВКИ (ЧТОБЫ БЫЛА ИСТОРИЯ ДЛЯ ПРОГРЕССИИ)
// ============================================================================

plan.post(
  "/save-session",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);

    const payload = req.body?.payload;
    const startedAtInput = req.body?.startedAt; // ISO string
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
      const now = new Date();
      let startedAt: Date;
      let completedAt: Date;

      if (startedAtInput && Number.isFinite(Number(durationMinInput))) {
        startedAt = new Date(startedAtInput);
        const durMin = Math.max(1, Number(durationMinInput));
        completedAt = new Date(startedAt.getTime() + durMin * 60000);
      } else {
        startedAt = now;
        completedAt = new Date(now.getTime() + MIN_REAL_DURATION_MIN * 60000);
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
  res.json({ ok: true, version: "4.0-simple-blocks-history-6" });
});

export default plan;

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

const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);

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

async function getRecentSessions(userId: string, limit = 10) {
  const rows = await q<any>(
    `SELECT finished_at, payload
     FROM workout_sessions
     WHERE user_id = $1
     ORDER BY finished_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return rows.map(row => ({
    date: row.finished_at,
    title: row.payload?.title,
    duration: row.payload?.duration || row.payload?.durationMin,
    exercises: (row.payload?.exercises || []).map((ex: any) => ({
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      weight: ex.weight,
      targetMuscles: ex.targetMuscles
    }))
  }));
}

// ============================================================================
// BLUEPRINT CREATION (простая логика)
// ============================================================================

function createBlueprint(daysPerWeek: number) {
  if (daysPerWeek >= 5) {
    return {
      name: "Push/Pull/Legs Split",
      days: ["Push", "Pull", "Legs", "Push", "Pull"],
      description: "Classic 5-day split focusing on movement patterns"
    };
  }

  if (daysPerWeek === 4) {
    return {
      name: "Upper/Lower Split",
      days: ["Upper", "Lower", "Upper", "Lower"],
      description: "Balanced 4-day split alternating upper and lower body"
    };
  }

  // 3 дня или меньше
  return {
    name: "Full Body Split",
    days: ["Upper Focus", "Lower Focus", "Full Body"],
    description: "3-day full body with varied emphasis"
  };
}

// ============================================================================
// AI TRAINER PROMPT (главное отличие от старого кода!)
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
  const list = Array.isArray(onboarding.equipmentItems)
    ? onboarding.equipmentItems.filter(Boolean)
    : [];

  const bodyOnly = onboarding.environment?.bodyweightOnly === true;

  if (bodyOnly || list.length === 0) {
    return "только вес собственного тела. нет штанги, нет тренажёров, нет станка для жима ногами, нет блоковых машин";
  }

  return (
    list.join(", ") +
    ". другого оборудования нет: нет штанги, нет тренажёров, нет станка для жима ногами, нет блочных машин, если это явно не указано"
  );
}

function buildTrainerPrompt(context: {
  onboarding: any;
  program: ProgramRow;
  history: any[];
}): string {
  const { onboarding, program, history } = context;
  const sessionMinutes = resolveSessionLength(onboarding);
  const blueprint = program.blueprint_json;
  const todayFocus = blueprint.days[program.day_idx];

  // Форматируем историю для читаемости
  const historyText = history.length > 0
    ? history.map((session, idx) => {
        const daysAgo = idx === 0 ? "последняя тренировка" : `${idx} тренировок назад`;
        const exercises = session.exercises
          .slice(0, 5)
          .map((ex: any) => `  - ${ex.name}: ${ex.sets} подходов х ${ex.reps} повторов${ex.weight ? ', вес: ' + ex.weight : ''}`)
          .join('\n');
        return `${daysAgo}:\n${exercises}`;
      }).join('\n\n')
    : "Это первая тренировка клиента";

  return `
# КЛИЕНТ

**Профиль:**
- Имя: ${onboarding.profile?.name || 'Клиент'}
- Пол: ${onboarding.ageSex?.sex || 'не указан'}, Возраст: ${onboarding.ageSex?.age || 'не указан'}
- Рост: ${onboarding.body?.height || '?'} см, Вес: ${onboarding.body?.weight || '?'} кг
- Опыт: ${onboarding.experience || 'не указан'}

**Цели:**
${JSON.stringify(onboarding.goals || ['поддержание формы'], null, 2)}

**График:**
- Дней в неделю: ${onboarding.schedule?.daysPerWeek || 3}
- Длительность тренировки: ${sessionMinutes} минут (ОБЯЗАТЕЛЬНО выдерживай именно это время!)

**Локация и оборудование:**
- Место: ${onboarding.environment?.location || 'unknown'}
- Доступное оборудование: ${describeEquipment(onboarding)}

**Здоровье и ограничения:**
${onboarding.health?.limitsText || 'Без ограничений'}

**Образ жизни:**
- Работа: ${onboarding.lifestyle?.workStyle || 'не указано'}
- Сон: ${onboarding.lifestyle?.sleep || 'не указано'} часов
- Стресс: ${onboarding.lifestyle?.stress || 'средний'}

---

# ТЕКУЩАЯ ПРОГРАММА

**Программа:** ${blueprint.name}
**Неделя:** ${program.week}
**День цикла:** ${program.day_idx + 1} из ${program.microcycle_len}
**Сегодняшний фокус:** ${todayFocus}

**Описание программы:** ${blueprint.description}

---

# ИСТОРИЯ ТРЕНИРОВОК

${historyText}

---

# ТВОЯ ЗАДАЧА

Создай **следующую тренировку** для этого клиента.

**Думай как настоящий тренер:**
1. Что он делал на последней тренировке? Как прогрессировать?
2. Какой сегодня день программы (${todayFocus})? Что нужно проработать?
3. Как его цели (${(onboarding.goals || []).join(', ')}) влияют на выбор упражнений?
4. Достаточно ли он восстановился? (смотри на дату последней тренировки)
5. Как добавить вариативности, чтобы не было скучно?
6. Есть ли ограничения по здоровью?

**Важные принципы:**
- Прогрессия: оцени предыдущие выполнения упражнения. Повышай нагрузку только если предыдущие сессия показали стабильное выполнение целевых повторов без снижения веса. При недовыполнении — сохрани или слегка снизь вес, чтобы поддержать качество движений.
- Не ставь одно и то же тяжёлое базовое упражнение (типа жим ногами, присед, становая, жим) два тренировочных дня подряд без перерыва. Замени вариантом полегче или другой плоскостью нагрузки.
- Вариативность упражнений: меняй углы, хваты, оборудование
- Вариативность подходов: НЕ делай везде одинаково! Базовые: 3-5 подходов. Вспомогательные: 2-4. Изоляция: 2-3.

- Баланс: не перегружай одни группы мышц, забывая другие
- Реализм: учитывай время тренировки (${sessionMinutes} мин)

**Разминка и заминка:**
- Делай warmup и cooldown конкретными под тренировку.
- Не используй общий шаблон.
- Warmup — 3–5 простых пунктов, готовящих мышцы и суставы дня (без научных терминов).
- Cooldown — 2–4 коротких пункта про расслабление и растяжку именно проработанных групп.
- Пиши простым языком, чтобы понял новичок.

**Формат ответа:**
Верни JSON объект (без markdown, только JSON):

{
  "title": "Краткое название тренировки (например: Грудь и Трицепс)",
  "duration": ${sessionMinutes},
"warmup": [
  "3–5 простых упражнений для разогрева мышц и суставов сегодняшней тренировки",
  "Без сложных терминов — просто, понятно, с акцентом на нужные зоны"
],
  "exercises": [
    {
      "name": "Название упражнения на русском",
      "sets": 3,
      "reps": "8-12",
      "restSec": 90,
      "weight": "40 кг" или null если без веса,
      "targetMuscles": ["грудь", "трицепс"],
      "cues": "Подробная техника: как выполнять, на что обратить внимание, частые ошибки, дыхание"
    }
  ],
"cooldown": [
  "2–4 коротких действия для расслабления и растяжки после тренировки",
  "Фокус на проработанные группы, простыми словами"
],
 "notes": "ОБЯЗАТЕЛЬНО объясни логику простым языком от лица тренера к клиенту (3-4 предложения): Почему я выбрал именно эти упражнения? Почему такой порядок (от тяжёлых к лёгким)? Почему такое время отдыха? Как это поможет достичь твоей цели? БЕЗ терминов (база, изоляция, гипертрофия) — объясняй понятными словами. Пример: 'Я начал с жима штанги — это главное упражнение для роста груди. Жим на наклоне добавляю чтобы проработать верхнюю часть груди. Разводка в конце максимально растягивает мышцы, это запускает их рост. Отдыхай 2 минуты после жимов — мышцам нужно время восстановить энергию для следующего подхода.'"
}

**Количество упражнений:**
- 30-45 мин: 5-6 основных упражнений
- 45-70 мин: 6-8 упражнений
- 70-90 мин: 8-10 упражнений

⚠️ Длительность тренировки должна строго равняться ${sessionMinutes} минут. Не сокращай и не увеличивай это время.

Будь креативным тренером, а не роботом!
`.trim();
}

// ============================================================================
// ROUTE: ГЕНЕРАЦИЯ ТРЕНИРОВКИ
// ============================================================================

plan.post(
  "/generate",
  asyncHandler(async (req: any, res: Response) => {
    // 1. Получаем пользователя
const bodyUserId = req.body?.userId;
const userId = bodyUserId || req.user?.uid || (await (async () => {
  const r = await q(
    `INSERT INTO users (tg_id, first_name, username)
     VALUES (0, 'Dev', 'local')
     ON CONFLICT (tg_id) DO UPDATE SET username = excluded.username
     RETURNING id`
  );
  return r[0].id;
})());

    console.log("\n=== GENERATING WORKOUT ===");
    console.log("User ID:", userId);

    // 2. Загружаем контекст
    const onboarding = await getOnboarding(userId);
    const sessionMinutes = resolveSessionLength(onboarding);
    const program = await getOrCreateProgram(userId, onboarding);
    const history = await getRecentSessions(userId, 10);

    console.log("Program:", program.blueprint_json.name);
    console.log("Week:", program.week, "Day:", program.day_idx + 1);
    console.log("Today's focus:", program.blueprint_json.days[program.day_idx]);
    console.log("History:", history.length, "sessions");

    // 3. Строим промпт
    const prompt = buildTrainerPrompt({ onboarding, program, history });

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== PROMPT PREVIEW ===");
      console.log(prompt.slice(0, 500) + "...\n");
    }

    // 4. ОДИН запрос к AI (вся магия здесь!)
    console.log("Calling OpenAI...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8, // даём креативность!
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TRAINER_SYSTEM },
        { role: "user", content: prompt }
      ]
    });

    // 5. Парсим ответ
    let plan: WorkoutPlan;
    try {
      plan = JSON.parse(completion.choices[0].message.content || "{}");
    } catch (err) {
      console.error("Failed to parse AI response:", err);
      throw new AppError("AI returned invalid JSON", 500);
    }

    // 6. Минимальная валидация (только структура!)
    if (!plan.exercises || !Array.isArray(plan.exercises) || plan.exercises.length === 0) {
      console.error("Invalid plan structure:", plan);
      throw new AppError("AI generated invalid workout plan", 500);
    }

    // Проверяем обязательные поля в упражнениях
    for (const ex of plan.exercises) {
      if (!ex.name || !ex.sets || !ex.reps || !ex.restSec) {
        console.error("Invalid exercise:", ex);
        throw new AppError("AI generated exercise with missing fields", 500);
      }
    }

    console.log("✓ Generated:", plan.exercises.length, "exercises");
    console.log("✓ Title:", plan.title);
    plan.duration = sessionMinutes;

    console.log("✓ Duration:", plan.duration, "min");

console.log("=== AI RAW PLAN ===");
console.dir(plan, { depth: null });

    // 7. Возвращаем КАК ЕСТЬ (без обработки!)
    res.json({
      plan,
      meta: {
        program: program.blueprint_json.name,
        week: program.week,
        day: program.day_idx + 1,
        focus: program.blueprint_json.days[program.day_idx]
      }
    });
  })
);

// ============================================================================
// ROUTE: СОХРАНЕНИЕ ЗАВЕРШЁННОЙ ТРЕНИРОВКИ
// ============================================================================

plan.post(
  "/save-session",
  asyncHandler(async (req: any, res: Response) => {
    const userId = req.user?.uid || (await (async () => {
      const r = await q(
        `INSERT INTO users (tg_id, first_name, username)
         VALUES (0, 'Dev', 'local')
         ON CONFLICT (tg_id) DO UPDATE SET username = excluded.username
         RETURNING id`
      );
      return r[0].id;
    })());

    const payload = req.body?.payload;

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
    await q('BEGIN');

    try {
      // 1. Сохраняем тренировку КАК ЕСТЬ (не модифицируем!)
      const result = await q(
        `INSERT INTO workout_sessions (user_id, payload, finished_at)
         VALUES ($1, $2::jsonb, NOW())
         RETURNING id, finished_at`,
        [userId, payload]
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

      await q('COMMIT');

      res.json({
        ok: true,
        sessionId: result[0].id,
        finishedAt: result[0].finished_at
      });
    } catch (err) {
      await q('ROLLBACK');
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

// plan.ts
// ============================================================================
// PROFESSIONAL AI FITNESS TRAINER v3.0
// Hybrid подход: лёгкие правила + умный AI = как настоящий тренер
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
// SMART WEIGHT HELPERS (простая логика прогрессии)
// ============================================================================

function parseWeight(weightStr: string | null | undefined): number | null {
  if (!weightStr) return null;
  const match = String(weightStr).match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  let weight = parseFloat(match[1]);
  // Конвертируем фунты в кг если есть
  if (String(weightStr).toLowerCase().includes('lb')) {
    weight = weight * 0.453592;
  }
  return weight;
}

function formatWeight(kg: number): string {
  return `${Math.round(kg * 2) / 2} кг`;
}

function parseReps(repsStr: string): number {
  const match = repsStr.match(/(\d+)(?:-(\d+))?/);
  if (!match) return 10;
  const min = parseInt(match[1]);
  const max = match[2] ? parseInt(match[2]) : min;
  return (min + max) / 2;
}

function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Умный расчёт следующего веса на основе истории
 * Возвращает рекомендацию или null если нет данных
 */
function calculateNextWeight(exerciseName: string, history: any[]): number | null {
  // Ищем это упражнение в истории
  const exerciseHistory = history
    .flatMap(session => 
      session.exercises
        .filter((ex: any) => normalizeExerciseName(ex.name) === normalizeExerciseName(exerciseName))
        .map((ex: any) => ({
          date: session.date,
          weight: parseWeight(ex.weight),
          reps: parseReps(ex.reps),
          sets: ex.sets
        }))
    )
    .filter(ex => ex.weight && ex.weight > 0)
    .slice(0, 3); // Последние 3 раза

  if (exerciseHistory.length === 0) return null;

  const last = exerciseHistory[0];
  
  // Простая логика: если делал хорошо - добавляем 2.5-5 кг
  // Если делал < 8 повторов - уменьшаем или оставляем
  if (last.reps >= 10) {
    const increment = last.weight! < 50 ? 2.5 : 5;
    return last.weight! + increment;
  }
  
  if (last.reps < 8) {
    return Math.max(last.weight! - 2.5, last.weight! * 0.9);
  }

  return last.weight!;
}

/**
 * Собираем рекомендации по весам для промпта
 */
function buildWeightGuidance(history: any[], todayFocus: string): string {
  if (history.length === 0) return "";

  const recommendations: string[] = [];
  const recentExercises = new Set<string>();
  
  // Собираем уникальные упражнения из последних 2 тренировок
  history.slice(0, 2).forEach(session => {
    session.exercises.forEach((ex: any) => {
      const normalized = normalizeExerciseName(ex.name);
      if (!recentExercises.has(normalized) && ex.weight) {
        recentExercises.add(normalized);
        const nextWeight = calculateNextWeight(ex.name, history);
        if (nextWeight) {
          recommendations.push(`- ${ex.name}: ${formatWeight(nextWeight)}`);
        }
      }
    });
  });

  if (recommendations.length === 0) return "";

  return `\n\n🎯 РЕКОМЕНДАЦИИ ПО ВЕСАМ (на основе истории):
${recommendations.slice(0, 6).join('\n')}

Это ориентиры на основе предыдущих тренировок. Можешь использовать эти веса или скорректировать ±5 кг если видишь причину.`;
}

// ============================================================================
// VARIETY PRINCIPLES (принципы вариативности - без жёстких списков!)
// ============================================================================

function getVarietyGuidance(todayFocus: string, history: any[]): string {
  // Собираем упражнения которые были недавно
  const recentExercises = history
    .slice(0, 2)
    .flatMap(s => s.exercises.map((e: any) => normalizeExerciseName(e.name)))
    .filter((name, idx, arr) => arr.indexOf(name) === idx)
    .slice(0, 8);

  let guidance = `\n\n🎨 ПРИНЦИПЫ ВАРИАТИВНОСТИ:

**КРИТИЧЕСКИ ВАЖНО: НЕ ПОВТОРЯЙ упражнения из списка ниже!**
`;

  if (recentExercises.length > 0) {
    guidance += `\n📋 Недавно были:\n${recentExercises.map(ex => `- ${ex}`).join('\n')}\n`;
  }

  guidance += `
**КАК ВАРЬИРОВАТЬ (примеры паттернов):**

1️⃣ МЕНЯЙ ОБОРУДОВАНИЕ:
   Жим → варианты: штанга / гантели / тренажер / кроссовер / брусья
   Тяга → варианты: штанга / гантели / блок / тренажер / турник
   
2️⃣ МЕНЯЙ УГЛЫ И ПОЛОЖЕНИЕ:
   Горизонтально / Наклон вверх 30° / Наклон вниз / Стоя / Сидя / Лёжа
   
3️⃣ МЕНЯЙ ХВАТЫ:
   Широкий / Средний / Узкий / Прямой / Обратный / Нейтральный / Молотковый
   
4️⃣ МЕНЯЙ ВАРИАЦИИ ДВИЖЕНИЯ:
   Жим: классический / с паузой / на одной руке / асимметричный
   Тяга: к груди / к поясу / одной рукой / с упором

**ПРИМЕРЫ КАК ДУМАТЬ:**
- Вместо "Жим лёжа" → "Жим гантелей на наклонной 30°"
- Вместо "Тяга штанги" → "Тяга горизонтального блока к поясу"
- Вместо "Приседания" → "Фронтальные приседания" или "Жим ногами"
- Вместо "Подъём на бицепс" → "Молотковые сгибания" или "Подъём на скамье Скотта"

У тебя в зале КУЧА оборудования - используй ВСЁ! Будь креативным!`;

  return guidance;
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

  return {
    name: "Full Body Split",
    days: ["Upper Focus", "Lower Focus", "Full Body"],
    description: "3-day full body with varied emphasis"
  };
}

// ============================================================================
// IMPROVED AI TRAINER PROMPT
// ============================================================================

const TRAINER_SYSTEM = `Ты опытный персональный тренер с 15+ лет практики в силовых тренировках, гипертрофии и спортивной подготовке.

ТВОЙ ПОДХОД:
- Понимаешь периодизацию, прогрессивную перегрузку и восстановление
- Варьируешь упражнения (углы, хваты, оборудование) для предотвращения плато
- Учитываешь индивидуальные ограничения и предпочтения
- Пишешь детальные технические подсказки
- Думаешь холистически о пути клиента к цели

ТЫ НЕ РОБОТ. Ты думающий, адаптивный тренер с интуицией.`;

function describeEquipment(onboarding: any) {
  const env = onboarding.environment || {};
  const equipmentItems = onboarding.equipmentItems || [];
  
  if (env.bodyweightOnly === true) {
    return "только вес собственного тела (без оборудования)";
  }

  const location = (env.location || "").toLowerCase();
  
  if (location === "gym" || location.includes("зал")) {
    if (equipmentItems.length > 5) {
      return `полностью оборудованный тренажёрный зал с: ${equipmentItems.join(', ')}. Используй разнообразное оборудование!`;
    }
    return "полностью оборудованный тренажёрный зал: штанги, гантели, тренажёры, блочные системы, станки";
  }

  if (location === "outdoor" || location.includes("street") || location.includes("улиц")) {
    return "уличная площадка: турник, брусья, петли TRX, резинки";
  }

  if (location === "home" || location.includes("дом")) {
    if (equipmentItems.length > 0) {
      return `домашний зал с: ${equipmentItems.join(', ')}`;
    }
    return "домашние условия: коврик, гантели, резинки";
  }

  return "базовое оборудование: гантели, коврик, резинки, турник";
}

function formatHistoryForAI(history: any[]): string {
  if (history.length === 0) {
    return "Это первая тренировка клиента. Начни консервативно с весами.";
  }

  let formatted = "📊 ПОСЛЕДНИЕ ТРЕНИРОВКИ:\n\n";
  
  history.slice(0, 2).forEach((session, idx) => {
    const label = idx === 0 ? "Последняя тренировка" : "2 тренировки назад";
    formatted += `${label} (${session.title || 'Без названия'}):\n`;
    
    session.exercises.slice(0, 5).forEach((ex: any) => {
      const weightStr = ex.weight ? `, ${ex.weight}` : '';
      formatted += `  • ${ex.name}: ${ex.sets}×${ex.reps}${weightStr}\n`;
    });
    
    formatted += '\n';
  });

  return formatted.trim();
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

  const historyText = formatHistoryForAI(history);
  const weightGuidance = buildWeightGuidance(history, todayFocus);
  const varietyGuidance = getVarietyGuidance(todayFocus, history);

  return `
# ПРОФИЛЬ КЛИЕНТА

**Базовая информация:**
- Имя: ${onboarding.profile?.name || 'Клиент'}
- Пол: ${onboarding.ageSex?.sex || 'не указан'}, Возраст: ${onboarding.ageSex?.age || 'не указан'}
- Рост: ${onboarding.body?.height || '?'} см, Вес: ${onboarding.body?.weight || '?'} кг
- Опыт: ${onboarding.experience || 'не указан'}

**Цели:**
${(onboarding.goals || ['поддержание формы']).map((g: string) => `- ${g}`).join('\n')}

**Параметры тренировки:**
- Дней в неделю: ${onboarding.schedule?.daysPerWeek || 3}
- Длительность: ${sessionMinutes} минут (СТРОГО соблюдай!)
- Локация: ${describeEquipment(onboarding)}

**Здоровье:**
${onboarding.health?.limitsText || 'Без ограничений'}

**Образ жизни:**
- Работа: ${onboarding.lifestyle?.workStyle || 'не указано'}
- Сон: ${onboarding.lifestyle?.sleep || '?'} ч

---

# ТЕКУЩАЯ ПРОГРАММА

**Программа:** ${blueprint.name}
**Неделя:** ${program.week} | **День:** ${program.day_idx + 1}/${program.microcycle_len}
**Сегодняшний фокус:** ${todayFocus}

${blueprint.description}

---

# ИСТОРИЯ ТРЕНИРОВОК

${historyText}

${weightGuidance}

${varietyGuidance}

---

# ТВОЯ ЗАДАЧА

Создай следующую тренировку для этого клиента на день: **${todayFocus}**

## КАК ДУМАТЬ:

1. **Прогрессия:** Смотри на веса из истории выше. Если делал хорошо (10+ повторов) - добавь 2.5-5 кг. Если с трудом (меньше 8) - уменьши или оставь тот же.

2. **Вариативность:** НЕ ПОВТОРЯЙ одно и то же! Если в прошлый раз был "Жим штанги лёжа" - сделай "Жим гантелей" или "Жим на наклонной". Меняй углы, хваты, оборудование.

3. **Баланс:** ${todayFocus} - это приоритет, но не забывай про вспомогательные группы.

4. **Время:** ${sessionMinutes} мин = правильное количество упражнений:
   - 30-45 мин: 5-6 упражнений
   - 45-70 мин: 6-8 упражнений
   - 70-90 мин: 8-10 упражнений

## ВАЖНЫЕ ПРАВИЛА:

### О ВЕСАХ:
⚠️ Смотри рекомендации выше - они рассчитаны на основе истории
⚠️ Для новичков без истории: консервативные веса (лучше недооценить)
⚠️ Для изоляции: веса ВСЕГДА ниже чем для базовых (обычно 10-25 кг)
⚠️ Если сомневаешься - поставь null вместо веса

### О СТРУКТУРЕ:
- Порядок: тяжёлые базовые → вспомогательные → изоляция
- НЕ ставь одно упражнение два дня подряд
- Варьируй подходы: база 3-5, вспомогательные 2-4, изоляция 2-3
- Отдых: база 120-180 сек, вспомогательные 90-120, изоляция 60-90

### О ВАРИАТИВНОСТИ:
- Смотри список выше "Недавно были" - НЕ повторяй эти упражнения!
- Используй разное оборудование каждую тренировку
- Меняй углы, хваты, положения тела
- Будь креативным - у клиента куча оборудования!

### РАЗМИНКА/ЗАМИНКА:
- Warmup: 3-5 действий специфично под сегодняшнюю тренировку
- Cooldown: 2-4 действия для растяжки проработанных мышц
- Пиши простым языком без терминологии

## ФОРМАТ ОТВЕТА

Верни ТОЛЬКО JSON (без markdown):

{
  "title": "Название тренировки",
  "duration": ${sessionMinutes},
  "warmup": [
    "Разминочное действие 1",
    "Разминочное действие 2",
    "Разминочное действие 3"
  ],
  "exercises": [
    {
      "name": "Название упражнения",
      "sets": 4,
      "reps": "8-12",
      "restSec": 120,
      "weight": "50 кг" ИЛИ null,
      "targetMuscles": ["грудь", "трицепс"],
      "cues": "Техника выполнения, дыхание, частые ошибки"
    }
  ],
  "cooldown": [
    "Растяжка 1",
    "Растяжка 2"
  ],
  "notes": "Объясни логику простым языком (3-4 предложения): почему эти упражнения, почему такой порядок, как это поможет цели. БЕЗ терминов."
}

Будь профессиональным тренером! Безопасность и прогресс - твои приоритеты.
`.trim();
}

// ============================================================================
// SIMPLE VALIDATION
// ============================================================================

function validatePlan(plan: WorkoutPlan): string[] {
  const warnings: string[] = [];

  if (plan.exercises.length < 4 || plan.exercises.length > 12) {
    warnings.push(`Необычное количество упражнений: ${plan.exercises.length}`);
  }

  plan.exercises.forEach((ex, idx) => {
    if (!ex.name || !ex.sets || !ex.reps) {
      warnings.push(`Упражнение ${idx + 1}: пропущены обязательные поля`);
    }

    if (ex.weight) {
      const weight = parseWeight(ex.weight);
      if (weight && weight > 200) {
        warnings.push(`${ex.name}: подозрительно большой вес ${ex.weight}`);
      }
    }
  });

  return warnings;
}

// ============================================================================
// ROUTE: ГЕНЕРАЦИЯ ТРЕНИРОВКИ
// ============================================================================

plan.post(
  "/generate",
  asyncHandler(async (req: any, res: Response) => {
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

    console.log("\n🚀 === GENERATING WORKOUT (v3.0) ===");
    console.log("User ID:", userId);

    // Загружаем контекст
    const onboarding = await getOnboarding(userId);
    const sessionMinutes = resolveSessionLength(onboarding);
    const program = await getOrCreateProgram(userId, onboarding);
    const history = await getRecentSessions(userId, 10);

    console.log("📋 Program:", program.blueprint_json.name);
    console.log("📅 Week:", program.week, "| Day:", program.day_idx + 1);
    console.log("🎯 Focus:", program.blueprint_json.days[program.day_idx]);
    console.log("📊 History:", history.length, "sessions");

    // Строим промпт
    const prompt = buildTrainerPrompt({ onboarding, program, history });

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== PROMPT PREVIEW ===");
      console.log(prompt.slice(0, 800) + "...\n");
    }

    // Вызываем AI
    console.log("🤖 Calling OpenAI...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4, // Снижено для стабильности весов!
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TRAINER_SYSTEM },
        { role: "user", content: prompt }
      ]
    });

    // Парсим ответ
    let plan: WorkoutPlan;
    try {
      plan = JSON.parse(completion.choices[0].message.content || "{}");
    } catch (err) {
      console.error("❌ Failed to parse AI response:", err);
      throw new AppError("AI returned invalid JSON", 500);
    }

    // Базовая валидация
    if (!plan.exercises || !Array.isArray(plan.exercises) || plan.exercises.length === 0) {
      console.error("❌ Invalid plan structure:", plan);
      throw new AppError("AI generated invalid workout plan", 500);
    }

    for (const ex of plan.exercises) {
      if (!ex.name || !ex.sets || !ex.reps || !ex.restSec) {
        console.error("❌ Invalid exercise:", ex);
        throw new AppError("AI generated exercise with missing fields", 500);
      }
    }

    // Проверка качества
    const warnings = validatePlan(plan);
    if (warnings.length > 0) {
      console.warn("⚠️  Validation warnings:");
      warnings.forEach(w => console.warn("   -", w));
    }

    plan.duration = sessionMinutes;

    console.log("✅ Generated:", plan.exercises.length, "exercises");
    console.log("✅ Title:", plan.title);
    console.log("✅ Duration:", plan.duration, "min");
    console.log("✅ Validation:", warnings.length === 0 ? "PASSED" : `${warnings.length} warnings`);

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== GENERATED PLAN ===");
      console.dir(plan, { depth: null });
    }

    res.json({
      plan,
      meta: {
        program: program.blueprint_json.name,
        week: program.week,
        day: program.day_idx + 1,
        focus: program.blueprint_json.days[program.day_idx],
        warnings: warnings.length
      }
    });
  })
);

// ============================================================================
// ROUTE: СОХРАНЕНИЕ ТРЕНИРОВКИ
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

    console.log("\n💾 === SAVING WORKOUT ===");
    console.log("User ID:", userId);
    console.log("Exercises:", payload.exercises.length);
    console.log("Title:", payload.title);

    await q('BEGIN');

    try {
      const result = await q(
        `INSERT INTO workout_sessions (user_id, payload, finished_at)
         VALUES ($1, $2::jsonb, NOW())
         RETURNING id, finished_at`,
        [userId, payload]
      );

      console.log("✅ Saved session:", result[0].id);

      if (plannedWorkoutId) {
        await q(
          `UPDATE planned_workouts
              SET status = 'completed',
                  result_session_id = $3,
                  updated_at = NOW()
            WHERE id = $1 AND user_id = $2`,
          [plannedWorkoutId, userId, result[0].id]
        );
        console.log("✅ Planned workout completed:", plannedWorkoutId);
      } else {
        const finishedAt: string = result[0].finished_at;
        await q(
          `INSERT INTO planned_workouts (user_id, plan, scheduled_for, status, result_session_id)
           VALUES ($1, $2::jsonb, $3, 'completed', $4)`,
          [userId, payload, finishedAt, result[0].id]
        );
        console.log("✅ Created completed planned workout entry");
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

      console.log("✅ Program advanced");

      await q('COMMIT');

      res.json({
        ok: true,
        sessionId: result[0].id,
        finishedAt: result[0].finished_at
      });
    } catch (err) {
      await q('ROLLBACK');
      console.error("❌ Save failed:", err);
      throw err;
    }
  })
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

plan.get("/ping", (_req, res) => {
  res.json({ 
    ok: true, 
    version: "3.0-professional",
    features: [
      "smart-weight-progression",
      "exercise-variety-system",
      "improved-prompts",
      "validation"
    ]
  });
});

export default plan;
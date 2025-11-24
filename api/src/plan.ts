// plan.ts
// ============================================================================
// AI-FIRST FITNESS TRAINER - FREE GENERATION ARCHITECTURE
// Двухэтапная генерация: свободный GPT-4o как в чате → конвертация в JSON
// ============================================================================

import { Router, Response } from "express";
import OpenAI from "openai";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { config } from "./config.js";
import { ensureSubscription } from "./subscription.js";
import { isUUID } from "./utils/validation.js";
import { resolveTimezone, currentDateIsoInTz, dateIsoFromTimestamp, getNextDailyResetIso, formatDateLabel } from "./utils/timezone.js";

export const plan = Router();

const openai = new OpenAI({ apiKey: config.openaiApiKey! });

// ============================================================================
// КОНСТАНТЫ И НАСТРОЙКИ
// ============================================================================

const CREATIVE_TEMPERATURE = 0.85; // Высокая для свободной генерации
const JSON_TEMPERATURE = 0.1;      // Низкая для точной конвертации
const DAILY_WORKOUT_LIMIT = 3;

// ============================================================================
// ТИПЫ (упрощенные, без лишних ограничений)
// ============================================================================

type WorkoutPlan = {
  title: string;
  duration: number;
  warmup: string[];
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    restSec: number;
    weight?: string;
    targetMuscles: string[];
    cues: string;
  }>;
  cooldown: string[];
  notes: string;
};

type UserProfile = {
  age: number | null;
  weight: number | null;
  height: number | null;
  sex: "male" | "female" | "unknown";
  experience: string;
  goals: string[];
  daysPerWeek: number;
  minutesPerSession: number;
  location: string;
  recentWorkouts?: string;
  injuries?: string;
  preferences?: string;
};

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ - НОВАЯ АРХИТЕКТУРА
// ============================================================================

async function generateWorkoutPlan({ planId, userId }: { planId: string; userId: string }) {
  console.log(`[WORKOUT] ▶️ Starting FREE AI generation for planId=${planId}`);
  
  try {
    // 1. Получаем данные пользователя
    await setWorkoutPlanProgress(planId, "context", 10);
    const userProfile = await buildUserProfile(userId);
    const recentHistory = await getRecentWorkoutsContext(userId);
    
    // 2. ЭТАП 1: СВОБОДНАЯ ГЕНЕРАЦИЯ (как в чате GPT-4o)
    await setWorkoutPlanProgress(planId, "ai_thinking", 30);
    console.log(`[WORKOUT] Phase 1: Free generation starting...`);
    
    const freeGeneration = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: CREATIVE_TEMPERATURE,
      max_tokens: 3000,
      // БЕЗ response_format! Полная свобода!
      messages: [
        {
          role: "system",
          content: getFreeSystemPrompt()
        },
        {
          role: "user", 
          content: buildNaturalUserRequest(userProfile, recentHistory)
        }
      ],
    });

    const richPlanContent = freeGeneration.choices[0].message.content || "";
    console.log(`[WORKOUT] Phase 1 complete: Generated ${richPlanContent.length} chars of rich content`);
    
    // Сохраняем оригинальный текст для анализа
    const originalThinking = richPlanContent;
    
    // 3. ЭТАП 2: КОНВЕРТАЦИЯ В JSON (только структурирование)
    await setWorkoutPlanProgress(planId, "structuring", 60);
    console.log(`[WORKOUT] Phase 2: Converting to JSON...`);
    
    const jsonConversion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: JSON_TEMPERATURE,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: getJsonConversionPrompt()
        },
        {
          role: "user",
          content: buildJsonConversionRequest(richPlanContent)
        }
      ],
    });

    // 4. Парсим и валидируем JSON
    await setWorkoutPlanProgress(planId, "validation", 80);
    
    let plan: WorkoutPlan;
    try {
      plan = JSON.parse(jsonConversion.choices[0].message.content || "{}");
    } catch (err) {
      console.error("JSON parse failed:", err);
      throw new AppError("Failed to structure workout plan", 500);
    }

    // Минимальная валидация (без жестких ограничений)
    plan = ensureMinimalStructure(plan);
    
    // 5. Сохраняем результат
    await setWorkoutPlanProgress(planId, "saving", 95);
    
    const metadata = {
      originalContent: originalThinking,
      generationModel: "gpt-4o-free-architecture",
      creativeTemp: CREATIVE_TEMPERATURE,
      profile: userProfile,
      timestamp: new Date().toISOString()
    };
    
    await markWorkoutPlanReady(planId, plan, metadata);
    console.log(`[WORKOUT] ✅ Plan ready: ${plan.title}`);
    
    // Помечаем использование для разблокировки
    await markLastSessionUsed(userId);
    
  } catch (err) {
    console.error("Workout generation failed:", err);
    await markWorkoutPlanFailed(planId, (err as any)?.message || "Generation failed");
    throw err;
  }
}

// ============================================================================
// ПРОМПТЫ - МИНИМАЛИСТИЧНЫЕ И СВОБОДНЫЕ
// ============================================================================

function getFreeSystemPrompt(): string {
  return `Ты — персональный фитнес-тренер мирового уровня с 20-летним опытом.

Твоя суперсила — создавать идеально персонализированные тренировки, которые:
- Точно соответствуют целям, полу, возрасту и опыту человека
- Учитывают особенности и ограничения
- Прогрессивны и разнообразны
- Основаны на научных принципах тренинга

Создавай тренировки так же умно, детально и творчески, как ты делаешь это в обычном чате.
Не ограничивай себя в структуре, количестве упражнений или подходе.
Думай как настоящий тренер, который видит человека перед собой.`;
}

function buildNaturalUserRequest(profile: UserProfile, recentHistory: string): string {
  // Строим запрос ТОЧНО как пользователь написал бы в чате
  const parts: string[] = [];
  
  // Основной запрос
  parts.push(`Составь мне план тренировки в тренажерном зале на ${profile.minutesPerSession} минут.`);
  parts.push("");
  
  // Данные о человеке (естественным языком)
  const sex = profile.sex === "female" ? "Женщина" : profile.sex === "male" ? "Мужчина" : "Пол не указан";
  const age = profile.age ? `${profile.age} лет` : "возраст не указан";
  const params = [];
  if (profile.height) params.push(`${profile.height} см`);
  if (profile.weight) params.push(`${profile.weight} кг`);
  
  parts.push(`${sex}, ${age}${params.length ? ", " + params.join(", ") : ""}.`);
  
  // Цели
  if (profile.goals && profile.goals.length > 0) {
    const goalsText = profile.goals.length === 1 
      ? `Цель: ${profile.goals[0]}`
      : `Цели: ${profile.goals.join(", ")}`;
    parts.push(goalsText);
  }
  
  // Опыт
  const expMap: Record<string, string> = {
    beginner: "Я новичок в тренировках",
    intermediate: "У меня средний уровень подготовки", 
    advanced: "Я продвинутый атлет"
  };
  if (profile.experience && expMap[profile.experience]) {
    parts.push(expMap[profile.experience]);
  }
  
  // Частота тренировок
  parts.push(`Тренируюсь ${profile.daysPerWeek} ${getDaysWord(profile.daysPerWeek)} в неделю.`);
  
  // История (если есть)
  if (recentHistory) {
    parts.push("");
    parts.push("Мои последние тренировки:");
    parts.push(recentHistory);
  }
  
  // Особые пожелания
  if (profile.injuries) {
    parts.push("");
    parts.push(`Важно: ${profile.injuries}`);
  }
  
  if (profile.preferences) {
    parts.push(profile.preferences);
  }
  
  // Финальная просьба
  parts.push("");
  parts.push("Составь умную, эффективную и интересную тренировку с учетом всех моих особенностей.");
  
  return parts.join("\n");
}

function getJsonConversionPrompt(): string {
  return `Ты — технический ассистент, который преобразует текстовые планы тренировок в структурированный JSON.
Сохраняй всё содержание без изменений, только структурируй в нужный формат.
Не упрощай, не сокращай, не меняй смысл.`;
}

function buildJsonConversionRequest(richContent: string): string {
  return `Преобразуй этот детальный план тренировки в JSON формат.
Сохрани ВСЁ содержание, все упражнения, все детали.

План тренировки:
${richContent}

Целевой JSON формат:
{
  "title": "название тренировки из плана",
  "duration": число минут,
  "warmup": ["каждый пункт разминки отдельно"],
  "exercises": [
    {
      "name": "точное название упражнения",
      "sets": число подходов,
      "reps": "диапазон повторений как в тексте",
      "restSec": секунды отдыха,
      "weight": "вес если указан или рекомендация",
      "targetMuscles": ["все упомянутые мышцы"],
      "cues": "техника и советы из описания"
    }
  ],
  "cooldown": ["каждый пункт заминки/растяжки"],
  "notes": "все дополнительные рекомендации и объяснения тренера"
}

ВАЖНО:
- Включи ВСЕ упражнения из плана (не ограничивай количество)
- Сохрани все подробности и нюансы
- Если в плане 10+ упражнений — включи все 10+
- Верни ТОЛЬКО валидный JSON без markdown блоков`;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

async function buildUserProfile(userId: string): Promise<UserProfile> {
  const onboarding = await getOnboarding(userId);
  
  // Извлекаем все данные без ограничений
  return {
    age: onboarding.age || null,
    weight: onboarding.weight || null,
    height: onboarding.height || null,
    sex: onboarding.sex || "unknown",
    experience: onboarding.experience || "intermediate",
    goals: extractGoals(onboarding),
    daysPerWeek: onboarding.daysPerWeek || 3,
    minutesPerSession: resolveSessionLength(onboarding),
    location: onboarding.environment?.location || "gym",
    injuries: onboarding.injuries || null,
    preferences: onboarding.preferences || null
  };
}

function extractGoals(onboarding: any): string[] {
  const goals = [];
  
  if (onboarding.goals?.muscle) goals.push("набор мышечной массы");
  if (onboarding.goals?.strength) goals.push("увеличение силы");
  if (onboarding.goals?.endurance) goals.push("выносливость");
  if (onboarding.goals?.weight_loss) goals.push("снижение веса");
  if (onboarding.goals?.health) goals.push("общее здоровье");
  if (onboarding.goals?.flexibility) goals.push("гибкость");
  
  // Если целей нет, добавляем дефолтную
  if (goals.length === 0) {
    goals.push("поддержание формы");
  }
  
  return goals;
}

async function getRecentWorkoutsContext(userId: string, limit: number = 5): Promise<string> {
  // Получаем последние тренировки для контекста
  const sessions = await q<any>(
    `SELECT 
      wp.json_data->>'title' as title,
      ws.finished_at::date as date,
      ws.payload
     FROM workout_sessions ws
     LEFT JOIN workout_plans wp ON ws.plan_id = wp.id
     WHERE ws.user_id = $1 
       AND ws.completed_at IS NOT NULL
     ORDER BY ws.finished_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  
  if (!sessions || sessions.length === 0) {
    return "";
  }
  
  // Форматируем историю естественным языком
  const history = sessions.map((s: any) => {
    const date = new Date(s.date).toLocaleDateString("ru-RU", { 
      day: "numeric", 
      month: "short" 
    });
    const exercises = s.payload?.exercises || [];
    const exerciseNames = exercises
      .slice(0, 3)
      .map((e: any) => e.name)
      .filter(Boolean);
    
    if (exerciseNames.length > 0) {
      return `${date}: ${s.title || "Тренировка"} (${exerciseNames.join(", ")}${exercises.length > 3 ? "..." : ""})`;
    }
    return `${date}: ${s.title || "Тренировка"}`;
  });
  
  return history.join("\n");
}

function ensureMinimalStructure(plan: any): WorkoutPlan {
  // Минимальная нормализация без жестких ограничений
  return {
    title: plan.title || "Персональная тренировка",
    duration: Number(plan.duration) || 60,
    warmup: Array.isArray(plan.warmup) ? plan.warmup : [],
    exercises: Array.isArray(plan.exercises) ? plan.exercises.map((ex: any) => ({
      name: ex.name || "Упражнение",
      sets: Number(ex.sets) || 3,
      reps: String(ex.reps || "10"),
      restSec: Number(ex.restSec) || 90,
      weight: ex.weight,
      targetMuscles: Array.isArray(ex.targetMuscles) ? ex.targetMuscles : [],
      cues: ex.cues || ""
    })) : [],
    cooldown: Array.isArray(plan.cooldown) ? plan.cooldown : [],
    notes: plan.notes || ""
  };
}

function getDaysWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "раз";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "раза";
  return "раз";
}

// ============================================================================
// ФУНКЦИИ РАБОТЫ С БД
// ============================================================================

async function getOnboarding(userId: string): Promise<any> {
  const rows = await q(
    `SELECT onboarding FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0]?.onboarding || {};
}

function resolveSessionLength(onboarding: any): number {
  const duration = onboarding?.sessionDuration;
  if (!duration) return 60;
  
  const durationMap: Record<string, number> = {
    "30": 30,
    "45": 45, 
    "60": 60,
    "90": 90,
    "120": 120
  };
  
  return durationMap[duration] || 60;
}

async function setWorkoutPlanProgress(
  planId: string,
  status: string,
  progress: number
): Promise<void> {
  await q(
    `UPDATE workout_plans 
     SET status = $2, progress = $3, updated_at = NOW()
     WHERE id = $1`,
    [planId, status, progress]
  );
}

async function markWorkoutPlanReady(
  planId: string,
  plan: WorkoutPlan,
  metadata: any
): Promise<void> {
  await q(
    `UPDATE workout_plans 
     SET status = 'ready',
         progress = 100,
         json_data = $2,
         analysis = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [planId, JSON.stringify(plan), JSON.stringify(metadata)]
  );
}

async function markWorkoutPlanFailed(
  planId: string,
  error: string
): Promise<void> {
  await q(
    `UPDATE workout_plans 
     SET status = 'failed',
         error = $2,
         updated_at = NOW()  
     WHERE id = $1`,
    [planId, error]
  );
}

async function markLastSessionUsed(userId: string): Promise<void> {
  await q(
    `UPDATE workouts 
     SET unlock_used = true 
     WHERE id = (
       SELECT id FROM workouts 
       WHERE user_id = $1 
         AND completed_at IS NOT NULL
         AND unlock_used = false
       ORDER BY completed_at DESC
       LIMIT 1
     )`,
    [userId]
  );
}

async function getLatestWorkoutPlan(userId: string): Promise<any> {
  const rows = await q(
    `SELECT * FROM workout_plans 
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0];
}

async function createWorkoutPlanShell(userId: string): Promise<any> {
  const rows = await q(
    `INSERT INTO workout_plans (user_id, status, progress)
     VALUES ($1, 'pending', 0)
     RETURNING *`,
    [userId]
  );
  return rows[0];
}

async function getLastWorkoutSession(userId: string): Promise<any> {
  const rows = await q(
    `SELECT * FROM workouts 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [userId]
  );
  return rows[0];
}

async function getWorkoutPlanById(planId: string): Promise<any> {
  const rows = await q(
    `SELECT * FROM workout_plans WHERE id = $1`,
    [planId]
  );
  return rows[0];
}

function ensureUser(req: any): string {
  if (!req.user?.id) throw new AppError("Unauthorized", 401);
  return req.user.id;
}

async function isAdminUser(userId: string): Promise<boolean> {
  // Проверяем через переменные окружения
  const adminIds = process.env.ADMIN_USER_IDS?.split(',') || [];
  if (adminIds.includes(userId)) return true;
  
  // Альтернативно проверяем в БД
  const rows = await q(
    `SELECT is_admin FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0]?.is_admin || false;
}

// ============================================================================
// МАРШРУТЫ API
// ============================================================================

plan.post(
  "/generate",
  asyncHandler(async (req: any, res: Response) => {
    const userId = ensureUser(req);
    const tz = resolveTimezone(req);
    const force = Boolean(req.body?.force);
    
    // Проверка подписки
    await ensureSubscription(userId, "workout");
    
    // Проверка лимитов
    const isAdmin = await isAdminUser(userId);
    
    if (!isAdmin) {
      // Проверяем дневной лимит
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

      if ((todaySessions[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT || 
          (todayPlans[0]?.cnt || 0) >= DAILY_WORKOUT_LIMIT) {
        const nextIso = await getNextDailyResetIso(tz);
        const nextLabel = formatDateLabel(new Date(nextIso), tz, { weekday: "long" });
        
        throw new AppError(
          "Новую тренировку можно будет сгенерировать завтра — телу тоже нужен разумный отдых.",
          429,
          {
            code: "daily_limit",
            details: { reason: "daily_limit", nextDateIso: nextIso, nextDateLabel: nextLabel },
          }
        );
      }
      
      // Проверяем существующий активный план
      const existing = await getLatestWorkoutPlan(userId);
      if (existing && existing.status !== "failed" && !force) {
        const createdSameDay = existing.created_at &&
          dateIsoFromTimestamp(existing.created_at, tz) === currentDateIsoInTz(tz);
          
        if (createdSameDay) {
          throw new AppError(
            "Вы уже сгенерировали тренировку. Чтобы получить следующую, завершите текущую и сохраните результат.",
            429,
            { code: "active_plan" }
          );
        }
      }
      
      // Проверяем последнюю сессию
      const lastSession = await getLastWorkoutSession(userId);
      if (lastSession) {
        if (!lastSession.completed_at) {
          throw new AppError("Сначала заверши текущую тренировку, потом сгенерируем новую.", 403);
        }
      }
    }
    
    // Проверяем существующий план
    const existing = await getLatestWorkoutPlan(userId);
    if (existing && !force && existing.status !== "failed") {
      return res.json(buildWorkoutPlanResponse(existing));
    }
    
    // Создаем новый план
    const shell = await createWorkoutPlanShell(userId);
    console.log("Created workout plan shell:", shell.id);
    
    // Запускаем асинхронную генерацию
    setTimeout(() => {
      generateWorkoutPlan({ planId: shell.id, userId }).catch(err => {
        console.error("Async generation failed:", err);
      });
    }, 0);
    
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

function buildWorkoutPlanResponse(plan: any): any {
  return {
    id: plan.id,
    status: plan.status,
    progress: plan.progress,
    plan: plan.json_data,
    analysis: plan.analysis,
    error: plan.error,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at
  };
}

export default plan;
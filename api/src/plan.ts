import { Router, Response } from "express";
import { q } from "./db.js";
import { requireAuth } from "./auth.js";
import { asyncHandler } from "./middleware/errorHandler.js";
import { AuthRequest, OnboardingData, WorkoutPlan, DatabaseOnboarding, DatabaseWorkout } from "./types.js";
import { config } from "./config.js";
import { AppError } from "./middleware/errorHandler.js";
import OpenAI from "openai";

export const plan = Router();

// Инициализация OpenAI только если есть ключ
const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

// Типы для генерации
interface WorkoutContext {
  onboarding: OnboardingData;
  recentWorkouts: Array<{
    plan: WorkoutPlan;
    result?: any;
    created_at: Date;
  }>;
}

// Функция для создания промпта
function createWorkoutPrompt(context: WorkoutContext): string {
  const { onboarding, recentWorkouts } = context;
  
  return `Ты профессиональный фитнес-тренер. Создай персонализированную тренировку для клиента.

ДАННЫЕ КЛИЕНТА:
- Возраст: ${onboarding.age || 'не указан'}
- Пол: ${onboarding.sex === 'm' ? 'мужской' : onboarding.sex === 'f' ? 'женский' : 'не указан'}
- Рост: ${onboarding.height || 'не указан'} см
- Вес: ${onboarding.weight || 'не указан'} кг
- Цель: ${onboarding.goal || 'общее здоровье'}
- Опыт: ${onboarding.experience || 'novice'}
- Частота тренировок: ${onboarding.freq || 3} раз в неделю
- Длительность: ${onboarding.duration || 60} минут
- Место: ${onboarding.location || 'тренажёрный зал'}
- Оборудование: ${onboarding.equipment?.join(', ') || 'стандартное'}
- Ограничения: ${onboarding.limitations?.join(', ') || 'нет'}

ПОСЛЕДНИЕ ТРЕНИРОВКИ:
${recentWorkouts.length > 0 ? 
  recentWorkouts.map((w, i) => `${i+1}. ${w.plan.title} (${new Date(w.created_at).toLocaleDateString()})`).join('\n') : 
  'Нет предыдущих тренировок'}

ТРЕБОВАНИЯ:
1. Создай разнообразную тренировку, отличающуюся от последних
2. Учти уровень подготовки и цели клиента
3. Включи 4-8 упражнений в зависимости от опыта
4. Для новичков - базовые упражнения, для продвинутых - более сложные
5. Учти доступное оборудование и ограничения

Верни ТОЛЬКО JSON в следующем формате:
{
  "title": "Название тренировки (например: Тренировка А - Верх тела)",
  "items": [
    {
      "name": "Название упражнения",
      "sets": число_подходов,
      "reps": "диапазон_повторений (например: 8-12)"
    }
  ],
  "cues": "Краткие рекомендации по тренировке (разминка, техника, отдых между подходами)"
}`;
}

// Резервная функция генерации без AI
function generateFallbackWorkout(onboarding: OnboardingData, workoutCount: number): WorkoutPlan {
  const experience = onboarding.experience || 'novice';
  const goal = onboarding.goal || 'general';
  
  // Различные шаблоны тренировок
  const templates: WorkoutPlan[] = [
    // Тренировка A - Ноги и плечи
    {
      title: "Тренировка A - Ноги и плечи",
      items: [
        { name: "Приседания со штангой", sets: experience === 'novice' ? 3 : 4, reps: "8-12" },
        { name: "Румынская тяга", sets: 3, reps: "10-12" },
        { name: "Выпады с гантелями", sets: 3, reps: "10-12 на каждую ногу" },
        { name: "Жим гантелей стоя", sets: 3, reps: "8-12" },
        { name: "Разведение гантелей в стороны", sets: 3, reps: "12-15" },
        { name: "Подъём ног в висе", sets: 3, reps: "10-15" }
      ],
      cues: "Разминка: 5-10 минут кардио + динамическая растяжка. Отдых между подходами: 1.5-2 минуты для базовых, 1 минута для изолирующих упражнений."
    },
    // Тренировка B - Грудь и спина
    {
      title: "Тренировка B - Грудь и спина",
      items: [
        { name: "Жим штанги лёжа", sets: experience === 'novice' ? 3 : 4, reps: "6-10" },
        { name: "Подтягивания или тяга верхнего блока", sets: 4, reps: "8-12" },
        { name: "Жим гантелей на наклонной скамье", sets: 3, reps: "8-12" },
        { name: "Тяга штанги в наклоне", sets: 3, reps: "8-12" },
        { name: "Сведение рук в кроссовере", sets: 3, reps: "12-15" },
        { name: "Тяга к лицу", sets: 3, reps: "15-20" }
      ],
      cues: "Разминка: лёгкое кардио + разминочные подходы. Чередуйте упражнения на грудь и спину для лучшего восстановления. Отдых 1.5-2 минуты."
    },
    // Тренировка C - Руки и корпус
    {
      title: "Тренировка C - Руки и корпус",
      items: [
        { name: "Подъём штанги на бицепс", sets: 3, reps: "8-12" },
        { name: "Французский жим лёжа", sets: 3, reps: "8-12" },
        { name: "Молотковые сгибания", sets: 3, reps: "10-12" },
        { name: "Отжимания на брусьях", sets: 3, reps: "8-12" },
        { name: "Подъём гантелей на бицепс сидя", sets: 3, reps: "10-12" },
        { name: "Планка", sets: 3, reps: "30-60 сек" }
      ],
      cues: "Фокус на технике выполнения. Контролируйте негативную фазу движения. Отдых 1-1.5 минуты между подходами."
    },
    // Full Body для новичков
    {
      title: "Full Body тренировка",
      items: [
        { name: "Приседания со штангой или гоблет-приседания", sets: 3, reps: "10-12" },
        { name: "Жим гантелей лёжа", sets: 3, reps: "10-12" },
        { name: "Тяга горизонтального блока", sets: 3, reps: "10-12" },
        { name: "Жим гантелей стоя", sets: 3, reps: "10-12" },
        { name: "Румынская тяга с гантелями", sets: 3, reps: "10-12" },
        { name: "Скручивания", sets: 3, reps: "15-20" }
      ],
      cues: "Идеально для новичков. Разминка обязательна. Следите за техникой, вес увеличивайте постепенно."
    }
  ];
  
  // Выбираем тренировку на основе номера последней
  const index = workoutCount % templates.length;
  const template = templates[index];
  
  // Адаптируем под уровень
  if (experience === 'advanced') {
    template.items = template.items.map(item => ({
      ...item,
      sets: item.sets + 1
    }));
    template.cues += " Используйте прогрессию нагрузки и продвинутые техники (дроп-сеты, суперсеты).";
  }
  
  // Адаптируем под цель
  if (goal?.toLowerCase().includes('похудение') || goal?.toLowerCase().includes('жиросжигание')) {
    template.items.push({ 
      name: "Интервальное кардио (HIIT)", 
      sets: 1, 
      reps: "10-15 минут" 
    });
    template.cues += " Сократите отдых до 30-45 секунд для повышения интенсивности.";
  }
  
  if (goal?.toLowerCase().includes('масса') || goal?.toLowerCase().includes('сила')) {
    template.items = template.items.map(item => ({
      ...item,
      reps: item.reps.includes('-') ? 
        `${parseInt(item.reps.split('-')[0]) - 2}-${parseInt(item.reps.split('-')[1]) - 2}` : 
        item.reps
    }));
    template.cues += " Отдых между подходами увеличен до 2-3 минут. Фокус на прогрессии весов.";
  }
  
  return template;
}

plan.post("/plan/generate", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const uid = req.user!.uid;
  
  // Получаем данные онбординга
  const onboardingRows = await q<DatabaseOnboarding>(
    `SELECT data FROM onboardings 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [uid]
  );
  
  if (onboardingRows.length === 0) {
    throw new AppError("Please complete onboarding first", 400);
  }
  
  const onboarding = onboardingRows[0].data;
  
  // Получаем историю тренировок
  const workoutHistory = await q<DatabaseWorkout>(
    `SELECT plan, result, created_at 
     FROM workouts 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT 5`,
    [uid]
  );
  
  let workoutPlan: WorkoutPlan;
  
  try {
    if (openai && config.openaiApiKey) {
      // Генерация через OpenAI
      const prompt = createWorkoutPrompt({
        onboarding,
        recentWorkouts: workoutHistory
      });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Ты опытный фитнес-тренер. Отвечай только валидным JSON без дополнительного текста."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" }
      });
      
      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error("Empty response from AI");
      }
      
      workoutPlan = JSON.parse(response) as WorkoutPlan;
      
      // Валидация структуры
      if (!workoutPlan.title || !Array.isArray(workoutPlan.items) || workoutPlan.items.length === 0) {
        throw new Error("Invalid workout structure");
      }
    } else {
      // Fallback генерация без AI
      console.log("OpenAI not configured, using fallback generation");
      workoutPlan = generateFallbackWorkout(onboarding, workoutHistory.length);
    }
  } catch (error) {
    console.error("AI generation failed, using fallback:", error);
    // При ошибке AI используем fallback
    workoutPlan = generateFallbackWorkout(onboarding, workoutHistory.length);
  }
  
  // Сохраняем тренировку в БД
  const rows = await q<{ id: string }>(
    `INSERT INTO workouts(user_id, plan) 
     VALUES($1, $2) 
     RETURNING id`,
    [uid, JSON.stringify(workoutPlan)]
  );
  
  if (rows.length === 0) {
    throw new AppError("Failed to save workout", 500);
  }
  
  res.json({ 
    workoutId: rows[0].id, 
    plan: workoutPlan,
    aiGenerated: !!openai && !!config.openaiApiKey
  });
}));

// Получение истории тренировок
plan.get("/plan/history", requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const uid = req.user!.uid;
  const limit = parseInt(req.query.limit as string) || 10;
  
  const workouts = await q<DatabaseWorkout>(
    `SELECT id, plan, result, created_at 
     FROM workouts 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [uid, limit]
  );
  
  res.json({ workouts });
}));

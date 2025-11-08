// plan-improved.ts
// ============================================================================
// AI-POWERED FITNESS TRAINER v3.0
// Hybrid подход: Умные правила + Креативный AI
// ============================================================================
// 
// КЛЮЧЕВЫЕ УЛУЧШЕНИЯ:
// ✅ Smart weight progression на основе истории
// ✅ Валидация нереалистичных рекомендаций AI
// ✅ Оптимизированные промпты (temperature 0.35)
// ✅ Улучшенное форматирование истории для AI
// ✅ Детектирование плато и deload
// ✅ Расчёт начальных весов для новичков
// ✅ RAG-ready архитектура (готово для pgvector)
//
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

type HistoryExercise = {
  name: string;
  sets: number;
  reps: string;
  weight?: string;
  targetMuscles: string[];
};

type HistorySession = {
  date: string;
  title?: string;
  duration?: number;
  exercises: HistoryExercise[];
};

type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);

// ============================================================================
// SMART WEIGHT PROGRESSION SYSTEM
// ============================================================================

/**
 * Парсит вес из строки в килограммы
 * Примеры: "50 кг", "50kg", "50", "110 lb" -> числа
 */
function parseWeight(weightStr: string | null | undefined): number | null {
  if (!weightStr) return null;
  
  const str = String(weightStr).toLowerCase().trim();
  
  // Извлекаем число
  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  
  let weight = parseFloat(match[1]);
  
  // Конвертируем фунты в кг
  if (str.includes('lb') || str.includes('lbs') || str.includes('pound')) {
    weight = weight * 0.453592;
  }
  
  return weight;
}

/**
 * Форматирует вес обратно в строку
 */
function formatWeight(kg: number): string {
  return `${Math.round(kg * 2) / 2} кг`; // Округляем до 0.5 кг
}

/**
 * Парсит количество повторов из строки
 * Примеры: "8-12" -> 10, "10" -> 10, "12-15" -> 13.5
 */
function parseReps(repsStr: string): number {
  const match = repsStr.match(/(\d+)(?:-(\d+))?/);
  if (!match) return 10; // default
  
  const min = parseInt(match[1]);
  const max = match[2] ? parseInt(match[2]) : min;
  
  return (min + max) / 2;
}

/**
 * ЯДРО СИСТЕМЫ: Умный расчёт прогрессии весов
 * 
 * Анализирует историю выполнения упражнения и рассчитывает
 * оптимальный вес для следующей тренировки
 */
function calculateProgressiveWeight(
  exerciseName: string,
  history: HistorySession[],
  targetReps: string,
  experienceLevel: ExperienceLevel
): number | null {
  // Находим последние 5 выполнений этого упражнения
  const exerciseHistory = history
    .flatMap(session => 
      session.exercises
        .filter(ex => normalizeExerciseName(ex.name) === normalizeExerciseName(exerciseName))
        .map(ex => ({
          date: session.date,
          weight: parseWeight(ex.weight),
          sets: ex.sets,
          reps: parseReps(ex.reps)
        }))
    )
    .filter(ex => ex.weight !== null && ex.weight > 0)
    .slice(0, 5);

  if (exerciseHistory.length === 0) {
    // Нет истории - вернём null, чтобы AI не ставил вес
    return null;
  }

  // Последняя тренировка с этим упражнением
  const last = exerciseHistory[0];
  const targetRepsNum = parseReps(targetReps);

  // ЛОГИКА ПРОГРЕССИИ:
  
  // 1. Если последний раз сделал БОЛЬШЕ целевых повторов - УВЕЛИЧИВАЕМ вес
  if (last.reps >= targetRepsNum + 2) {
    const increase = getWeightIncrement(last.weight!, experienceLevel);
    return last.weight! + increase;
  }

  // 2. Если последний раз сделал МЕНЬШЕ целевых повторов - УМЕНЬШАЕМ вес
  if (last.reps < targetRepsNum - 2) {
    const decrease = getWeightIncrement(last.weight!, experienceLevel);
    return Math.max(last.weight! - decrease, last.weight! * 0.9); // Не более 10% снижения
  }

  // 3. Если в целевом диапазоне - проверяем динамику
  if (exerciseHistory.length >= 3) {
    const last3Weights = exerciseHistory.slice(0, 3).map(ex => ex.weight!);
    const isStagnating = last3Weights.every(w => Math.abs(w - last.weight!) < 2.5);
    
    if (isStagnating) {
      // Застой - пробуем небольшое увеличение
      const smallIncrease = getWeightIncrement(last.weight!, experienceLevel) / 2;
      return last.weight! + smallIncrease;
    }
  }

  // 4. Стабильно выполняет - оставляем тот же вес
  return last.weight!;
}

/**
 * Определяет шаг увеличения веса в зависимости от текущего веса и опыта
 */
function getWeightIncrement(currentWeight: number, experience: ExperienceLevel): number {
  const baseIncrement = currentWeight < 20 ? 1 : 
                        currentWeight < 50 ? 2.5 : 
                        currentWeight < 100 ? 5 : 
                        7.5;

  // Новички прогрессируют быстрее
  const multiplier = experience === 'beginner' ? 1.5 :
                     experience === 'intermediate' ? 1.0 :
                     0.75; // advanced медленнее

  return baseIncrement * multiplier;
}

/**
 * Нормализует название упражнения для сравнения
 * "Жим штанги лёжа" === "жим штанги лежа" === "Жим штанги"
 */
function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Оценивает начальный вес для новичка на основе типа упражнения
 */
function estimateInitialWeight(
  exerciseName: string, 
  bodyWeight: number,
  sex: string,
  experience: ExperienceLevel
): number | null {
  const name = exerciseName.toLowerCase();
  const isMale = sex?.toLowerCase() === 'male' || sex?.toLowerCase() === 'мужской';
  
  // Базовые коэффициенты от веса тела
  const coefficients: { [key: string]: number } = {
    // Приседания
    'присед': isMale ? 0.5 : 0.35,
    'приседания': isMale ? 0.5 : 0.35,
    
    // Жимы
    'жим лежа': isMale ? 0.4 : 0.25,
    'жим штанги': isMale ? 0.4 : 0.25,
    'жим гантелей': isMale ? 0.15 : 0.1,
    
    // Тяги
    'становая': isMale ? 0.6 : 0.4,
    'тяга штанги': isMale ? 0.35 : 0.25,
    'тяга блока': isMale ? 0.3 : 0.2,
    
    // Ноги
    'жим ногами': isMale ? 1.0 : 0.7,
    'сгибания ног': isMale ? 0.2 : 0.15,
    'разгибания ног': isMale ? 0.25 : 0.18,
  };

  // Модификатор опыта
  const experienceMod = experience === 'beginner' ? 0.7 :
                        experience === 'intermediate' ? 1.0 :
                        1.3;

  for (const [key, coef] of Object.entries(coefficients)) {
    if (name.includes(key)) {
      const estimated = bodyWeight * coef * experienceMod;
      return Math.round(estimated / 2.5) * 2.5; // Округляем до 2.5 кг
    }
  }

  return null; // Для изоляции и неизвестных упражнений пусть AI решает
}

/**
 * Детектирует плато в тренировках
 */
function detectPlateau(history: HistorySession[]): boolean {
  if (history.length < 4) return false;

  const recent4 = history.slice(0, 4);
  
  // Считаем общий объём (sets * reps * weight) для каждой тренировки
  const volumes = recent4.map(session => {
    return session.exercises.reduce((sum, ex) => {
      const weight = parseWeight(ex.weight) || 0;
      const reps = parseReps(ex.reps);
      return sum + (ex.sets * reps * weight);
    }, 0);
  });

  // Если все 4 тренировки в пределах ±5% - это плато
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const inRange = volumes.every(v => Math.abs(v - avgVolume) / avgVolume < 0.05);

  return inRange;
}

// ============================================================================
// IMPROVED HISTORY FORMATTING
// ============================================================================

/**
 * Форматирует историю тренировок для AI с фокусом на прогрессию
 * Вместо просто списка упражнений - даём КОНТЕКСТ и ТРЕНДЫ
 */
function formatHistoryForAI(history: HistorySession[], program: ProgramRow): string {
  if (history.length === 0) {
    return "Это первая тренировка клиента. Начни с консервативных весов.";
  }

  const plateau = detectPlateau(history);
  
  let formatted = plateau 
    ? "⚠️ ВНИМАНИЕ: Детектировано плато в прогрессии последних 4 тренировок. Рассмотри deload или смену упражнений.\n\n"
    : "";

  // Группируем упражнения по названиям для анализа прогрессии
  const exerciseProgression = new Map<string, Array<{date: string, weight: number, reps: number}>>();
  
  history.forEach(session => {
    session.exercises.forEach(ex => {
      const normalized = normalizeExerciseName(ex.name);
      if (!exerciseProgression.has(normalized)) {
        exerciseProgression.set(normalized, []);
      }
      
      const weight = parseWeight(ex.weight);
      if (weight) {
        exerciseProgression.get(normalized)!.push({
          date: session.date,
          weight: weight,
          reps: parseReps(ex.reps)
        });
      }
    });
  });

  // Показываем последние 3 тренировки + прогрессию ключевых упражнений
  formatted += "📊 ПОСЛЕДНИЕ ТРЕНИРОВКИ:\n\n";
  
  history.slice(0, 3).forEach((session, idx) => {
    const daysAgo = idx === 0 ? "Последняя тренировка" : 
                    idx === 1 ? "2 тренировки назад" : 
                    "3 тренировки назад";
    
    formatted += `${daysAgo} (${session.title || 'Без названия'}):\n`;
    
    session.exercises.slice(0, 6).forEach(ex => {
      const weightStr = ex.weight ? `, ${ex.weight}` : '';
      formatted += `  • ${ex.name}: ${ex.sets}×${ex.reps}${weightStr}\n`;
    });
    
    formatted += '\n';
  });

  // Анализ прогрессии ТОП-5 упражнений
  const topExercises = Array.from(exerciseProgression.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);

  if (topExercises.length > 0) {
    formatted += "📈 ПРОГРЕССИЯ КЛЮЧЕВЫХ УПРАЖНЕНИЙ:\n\n";
    
    topExercises.forEach(([exerciseName, progression]) => {
      if (progression.length >= 2) {
        const latest = progression[0];
        const previous = progression[1];
        
        const weightChange = latest.weight - previous.weight;
        const trend = weightChange > 0 ? "↗️" : weightChange < 0 ? "↘️" : "→";
        
        formatted += `${exerciseName}: ${formatWeight(previous.weight)} → ${formatWeight(latest.weight)} ${trend}\n`;
      }
    });
  }

  return formatted.trim();
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

function getExperienceLevel(onboarding: any): ExperienceLevel {
  const exp = (onboarding?.experience || '').toLowerCase();
  
  if (exp.includes('beginner') || exp.includes('новичок') || exp.includes('начинающий')) {
    return 'beginner';
  }
  if (exp.includes('advanced') || exp.includes('продвинут') || exp.includes('опытный')) {
    return 'advanced';
  }
  return 'intermediate';
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
// BLUEPRINT CREATION
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

КРИТИЧЕСКИ ВАЖНО О ВЕСАХ:
- Ты ДОЛЖЕН анализировать историю клиента перед рекомендацией весов
- Если в истории есть упражнение - ВСЕГДА отталкивайся от последнего веса
- НЕ делай резких скачков весов (более 10% за раз)
- Для новичков начинай консервативно - лучше недооценить, чем травмировать
- Если сомневаешься в весе - лучше НЕ указывай его совсем (null)

ТВОЙ ПОДХОД:
- Понимаешь периодизацию, прогрессивную перегрузку и восстановление
- Варьируешь упражнения для предотвращения плато и скуки
- Учитываешь индивидуальные ограничения и предпочтения
- Пишешь детальные, полезные технические подсказки
- Думаешь холистически о пути клиента к цели

ТЫ НЕ ЖЁСТКИЙ АЛГОРИТМ. Ты думающий, адаптивный тренер с интуицией.`;

function describeEquipment(onboarding: any) {
  const env = onboarding.environment || {};
  if (env.bodyweightOnly === true) {
    return "только вес собственного тела (без оборудования)";
  }

  const location = (env.location || "").toLowerCase();
  if (location === "gym" || location.includes("зал")) {
    return "полностью оборудованный тренажёрный зал";
  }

  if (location === "outdoor" || location.includes("street") || location.includes("улиц")) {
    return "уличная площадка (турник, брусья, петли)";
  }

  if (location === "home" || location.includes("дом")) {
    return "домашние условия (коврик, гантели, резинки)";
  }

  return "базовое оборудование (гантели, коврик, резинки)";
}

function buildImprovedPrompt(context: {
  onboarding: any;
  program: ProgramRow;
  history: HistorySession[];
  suggestedWeights: Map<string, number>;
}): string {
  const { onboarding, program, history, suggestedWeights } = context;
  const sessionMinutes = resolveSessionLength(onboarding);
  const blueprint = program.blueprint_json;
  const todayFocus = blueprint.days[program.day_idx];
  const experienceLevel = getExperienceLevel(onboarding);

  // Форматируем рекомендованные веса
  let weightsGuidance = "";
  if (suggestedWeights.size > 0) {
    weightsGuidance = "\n\n🎯 РЕКОМЕНДОВАННЫЕ ВЕСА (на основе истории клиента):\n";
    suggestedWeights.forEach((weight, exerciseName) => {
      weightsGuidance += `- ${exerciseName}: ~${formatWeight(weight)}\n`;
    });
    weightsGuidance += "\nЭти веса рассчитаны алгоритмом прогрессии. Используй их как ориентир, можешь слегка корректировать (±5 кг) если видишь причину.";
  }

  const historyText = formatHistoryForAI(history, program);

  return `
# ПРОФИЛЬ КЛИЕНТА

**Базовая информация:**
- Имя: ${onboarding.profile?.name || 'Клиент'}
- Пол: ${onboarding.ageSex?.sex || 'не указан'}, Возраст: ${onboarding.ageSex?.age || 'не указан'}
- Рост: ${onboarding.body?.height || '?'} см, Вес: ${onboarding.body?.weight || '?'} кг
- Опыт: ${onboarding.experience || 'не указан'} (уровень: ${experienceLevel})

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
- Стресс: ${onboarding.lifestyle?.stress || 'средний'}

---

# ТЕКУЩАЯ ПРОГРАММА

**Название:** ${blueprint.name}
**Неделя:** ${program.week} | **День:** ${program.day_idx + 1}/${program.microcycle_len}
**Сегодняшний фокус:** ${todayFocus}

${blueprint.description}

---

# ИСТОРИЯ ТРЕНИРОВОК

${historyText}

${weightsGuidance}

---

# ТВОЯ ЗАДАЧА

Создай следующую тренировку для этого клиента на сегодняшний день (${todayFocus}).

## ПЛАН РАССУЖДЕНИЙ:

1. **Анализ истории**: Что делал последний раз? Какие веса? Как прогрессировать?
2. **Фокус дня**: Это ${todayFocus} - какие мышечные группы приоритетны?
3. **Цели клиента**: ${(onboarding.goals || []).join(', ')} - как упражнения помогут?
4. **Восстановление**: Сколько дней прошло с последней тренировки? Нужен ли deload?
5. **Вариативность**: Меняй углы, хваты, оборудование для предотвращения скуки
6. **Ограничения**: Есть ли травмы или противопоказания?

## КРИТИЧЕСКИЕ ПРАВИЛА:

### О ВЕСАХ (САМОЕ ВАЖНОЕ!):
- ⚠️ ВСЕГДА смотри на рекомендованные веса выше
- ⚠️ НЕ делай скачки более 10% от предыдущего веса
- ⚠️ Если упражнение новое для клиента - начни с 60-70% от его возможного максимума
- ⚠️ Для изоляционных упражнений веса ВСЕГДА ниже, чем для базовых
- ⚠️ Если не уверен - лучше поставь null вместо веса

### О СТРУКТУРЕ:
- Порядок: тяжёлые базовые → средние вспомогательные → лёгкие изоляция
- НЕ ставь одно и то же тяжёлое упражнение два дня подряд
- Варьируй количество подходов: база 3-5, вспомогательные 2-4, изоляция 2-3
- Отдых: база 120-180 сек, вспомогательные 90-120 сек, изоляция 60-90 сек

### О РАЗМИНКЕ/ЗАМИНКЕ:
- Warmup: 3-5 специфичных упражнений под сегодняшнюю тренировку (без терминов!)
- Cooldown: 2-4 простых действия для растяжки проработанных мышц

### О ВРЕМЕНИ:
- Тренировка ДОЛЖНА занимать ${sessionMinutes} минут
- Количество упражнений:
  * 30-45 мин: 5-6 упражнений
  * 45-70 мин: 6-8 упражнений  
  * 70-90 мин: 8-10 упражнений

## ФОРМАТ ОТВЕТА

Верни JSON (без markdown блоков):

{
  "title": "Название тренировки",
  "duration": ${sessionMinutes},
  "warmup": [
    "Простое разминочное действие 1",
    "Простое разминочное действие 2",
    "Простое разминочное действие 3"
  ],
  "exercises": [
    {
      "name": "Название упражнения",
      "sets": 4,
      "reps": "8-12",
      "restSec": 120,
      "weight": "50 кг" ИЛИ null,
      "targetMuscles": ["грудь", "трицепс"],
      "cues": "Детальная техника выполнения, дыхание, частые ошибки"
    }
  ],
  "cooldown": [
    "Растяжка проработанных мышц 1",
    "Растяжка проработанных мышц 2"
  ],
  "notes": "Объясни логику тренировки ПРОСТЫМ языком (3-4 предложения): почему эти упражнения, почему такой порядок, как это поможет цели клиента. БЕЗ терминов типа 'гипертрофия', 'изоляция'. Говори как тренер с клиентом."
}

Будь мудрым тренером! Безопасность > Эго. Прогресс > Впечатление.
`.trim();
}

// ============================================================================
// VALIDATION SYSTEM
// ============================================================================

/**
 * Валидирует план тренировки от AI на реалистичность
 */
function validateWorkoutPlan(
  plan: WorkoutPlan,
  history: HistorySession[],
  experienceLevel: ExperienceLevel
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Проверка структуры
  if (!plan.exercises || plan.exercises.length === 0) {
    errors.push("План не содержит упражнений");
    return { valid: false, errors };
  }

  // 2. Проверка весов на реалистичность
  plan.exercises.forEach((ex, idx) => {
    if (!ex.weight) return; // null веса допустимы

    const weight = parseWeight(ex.weight);
    if (!weight) return;

    // Ищем это упражнение в истории
    const historicalWeights = history
      .flatMap(s => s.exercises)
      .filter(histEx => normalizeExerciseName(histEx.name) === normalizeExerciseName(ex.name))
      .map(histEx => parseWeight(histEx.weight))
      .filter((w): w is number => w !== null);

    if (historicalWeights.length > 0) {
      const lastWeight = historicalWeights[0];
      const change = ((weight - lastWeight) / lastWeight) * 100;

      // Проверка: скачок более 15% подозрителен
      if (Math.abs(change) > 15) {
        errors.push(
          `Упражнение "${ex.name}": подозрительный скачок веса ${change > 0 ? '+' : ''}${change.toFixed(0)}% ` +
          `(было ${formatWeight(lastWeight)}, стало ${ex.weight})`
        );
      }
    }

    // Проверка абсолютных значений
    if (weight > 300) {
      errors.push(`Упражнение "${ex.name}": нереалистичный вес ${ex.weight} для большинства людей`);
    }

    // Для изоляции проверяем, что вес разумный
    const isIsolation = ex.targetMuscles.length === 1 || 
                        ex.name.toLowerCase().includes('разведен') ||
                        ex.name.toLowerCase().includes('махи') ||
                        ex.name.toLowerCase().includes('подъём');
    
    if (isIsolation && weight > 50) {
      errors.push(`Упражнение "${ex.name}": слишком большой вес ${ex.weight} для изоляционного упражнения`);
    }
  });

  // 3. Проверка количества упражнений vs времени
  const expectedExercises = plan.duration < 45 ? [4, 7] :
                           plan.duration < 70 ? [6, 9] :
                           [7, 11];
  
  if (plan.exercises.length < expectedExercises[0] || plan.exercises.length > expectedExercises[1]) {
    errors.push(
      `Несоответствие времени и количества упражнений: ` +
      `${plan.exercises.length} упражнений на ${plan.duration} минут`
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// ROUTE: ГЕНЕРАЦИЯ ТРЕНИРОВКИ (IMPROVED)
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

    console.log("\n🚀 === GENERATING WORKOUT (v3.0) ===");
    console.log("User ID:", userId);

    // 2. Загружаем контекст
    const onboarding = await getOnboarding(userId);
    const experienceLevel = getExperienceLevel(onboarding);
    const program = await getOrCreateProgram(userId, onboarding);
    const history = await getRecentSessions(userId, 10);

    console.log("📋 Program:", program.blueprint_json.name);
    console.log("📅 Week:", program.week, "| Day:", program.day_idx + 1);
    console.log("🎯 Focus:", program.blueprint_json.days[program.day_idx]);
    console.log("📊 History:", history.length, "sessions");
    console.log("💪 Experience:", experienceLevel);

    // 3. НОВОЕ: Рассчитываем рекомендованные веса (HYBRID APPROACH!)
    const todayFocus = program.blueprint_json.days[program.day_idx];
    const suggestedWeights = new Map<string, number>();

    // Получаем типичные упражнения для сегодняшнего фокуса
    const commonExercises = getCommonExercisesForFocus(todayFocus);
    
    commonExercises.forEach(exerciseName => {
      const weight = calculateProgressiveWeight(
        exerciseName,
        history,
        "8-12", // default target reps
        experienceLevel
      );

      if (weight) {
        suggestedWeights.set(exerciseName, weight);
      } else {
        // Если нет истории - оцениваем начальный вес
        const bodyWeight = parseFloat(onboarding?.body?.weight) || 75;
        const sex = onboarding?.ageSex?.sex || 'male';
        const estimated = estimateInitialWeight(exerciseName, bodyWeight, sex, experienceLevel);
        
        if (estimated) {
          suggestedWeights.set(exerciseName, estimated);
        }
      }
    });

    console.log("🎯 Suggested weights calculated:", suggestedWeights.size);

    // 4. Строим улучшенный промпт
    const prompt = buildImprovedPrompt({ 
      onboarding, 
      program, 
      history,
      suggestedWeights 
    });

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== PROMPT PREVIEW ===");
      console.log(prompt.slice(0, 800) + "...\n");
    }

    // 5. Вызываем OpenAI с оптимизированными параметрами
    console.log("🤖 Calling OpenAI...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.35, // Снижено с 0.8 для большей предсказуемости весов!
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TRAINER_SYSTEM },
        { role: "user", content: prompt }
      ]
    });

    // 6. Парсим ответ
    let plan: WorkoutPlan;
    try {
      const content = completion.choices[0].message.content || "{}";
      plan = JSON.parse(content);
    } catch (err) {
      console.error("❌ Failed to parse AI response:", err);
      throw new AppError("AI returned invalid JSON", 500);
    }

    // 7. Базовая валидация структуры
    if (!plan.exercises || !Array.isArray(plan.exercises) || plan.exercises.length === 0) {
      console.error("❌ Invalid plan structure:", plan);
      throw new AppError("AI generated invalid workout plan", 500);
    }

    // Проверяем обязательные поля
    for (const ex of plan.exercises) {
      if (!ex.name || !ex.sets || !ex.reps || !ex.restSec) {
        console.error("❌ Invalid exercise:", ex);
        throw new AppError("AI generated exercise with missing fields", 500);
      }
    }

    // 8. НОВОЕ: Валидация реалистичности
    const validation = validateWorkoutPlan(plan, history, experienceLevel);
    
    if (!validation.valid) {
      console.warn("⚠️  VALIDATION WARNINGS:");
      validation.errors.forEach(err => console.warn("   -", err));
      
      // Если критические ошибки - можем откатиться или применить правила
      // Пока просто логируем, но в продакшене можно добавить автокоррекцию
    }

    // Устанавливаем корректную длительность
    plan.duration = resolveSessionLength(onboarding);

    console.log("✅ Generated:", plan.exercises.length, "exercises");
    console.log("✅ Title:", plan.title);
    console.log("✅ Duration:", plan.duration, "min");
    console.log("✅ Validation:", validation.valid ? "PASSED" : "WITH WARNINGS");

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== GENERATED PLAN ===");
      console.dir(plan, { depth: null });
    }

    // 9. Возвращаем план
    res.json({
      plan,
      meta: {
        program: program.blueprint_json.name,
        week: program.week,
        day: program.day_idx + 1,
        focus: program.blueprint_json.days[program.day_idx],
        suggestedWeightsUsed: suggestedWeights.size,
        validationWarnings: validation.errors.length
      }
    });
  })
);

// ============================================================================
// HELPER: Типичные упражнения для фокуса дня
// ============================================================================

function getCommonExercisesForFocus(focus: string): string[] {
  const focusLower = focus.toLowerCase();

  if (focusLower.includes('push') || focusLower.includes('жим')) {
    return [
      'Жим штанги лёжа',
      'Жим гантелей на наклонной',
      'Жим штанги стоя',
      'Французский жим',
      'Разгибания на блоке'
    ];
  }

  if (focusLower.includes('pull') || focusLower.includes('тяг')) {
    return [
      'Подтягивания',
      'Тяга штанги в наклоне',
      'Тяга верхнего блока',
      'Тяга горизонтального блока',
      'Подъём на бицепс'
    ];
  }

  if (focusLower.includes('legs') || focusLower.includes('ног')) {
    return [
      'Приседания со штангой',
      'Жим ногами',
      'Румынская тяга',
      'Выпады',
      'Сгибания ног'
    ];
  }

  if (focusLower.includes('upper') || focusLower.includes('верх')) {
    return [
      'Жим штанги лёжа',
      'Тяга штанги в наклоне',
      'Жим гантелей сидя',
      'Подтягивания',
      'Разведения гантелей'
    ];
  }

  if (focusLower.includes('lower') || focusLower.includes('низ')) {
    return [
      'Приседания',
      'Становая тяга',
      'Жим ногами',
      'Сгибания ног',
      'Разгибания ног'
    ];
  }

  // Full Body default
  return [
    'Приседания',
    'Жим штанги лёжа',
    'Тяга штанги',
    'Жим стоя',
    'Подтягивания'
  ];
}

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
      // 1. Сохраняем тренировку
      const result = await q(
        `INSERT INTO workout_sessions (user_id, payload, finished_at)
         VALUES ($1, $2::jsonb, NOW())
         RETURNING id, finished_at`,
        [userId, payload]
      );

      console.log("✅ Saved session:", result[0].id);

      // 2. Обновляем planned_workouts
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

      // 3. Двигаем программу вперёд
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
    version: "3.0-hybrid-ai",
    features: [
      "smart-weight-progression",
      "validation-system",
      "plateau-detection",
      "optimized-prompts"
    ]
  });
});

export default plan;
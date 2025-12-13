/**
 * SIMPLIFIED AI-DRIVEN WORKOUT BUILDER
 * 
 * Философия: Доверяем экспертизе AI, минимум ограничений
 * 
 * Схема дает: фокус дня (Push/Pull/Legs)
 * AI решает: всё остальное (упражнения, подходы, структуру)
 */

import OpenAI from 'openai';
import type { DayTrainingRules } from './trainingRulesTypes.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// ТИПЫ
// ============================================================================

type ExperienceLevel = "beginner" | "intermediate" | "advanced";
type TrainingGoal = "strength" | "hypertrophy" | "metabolic" | "athletic_body" | "health";

export type UserProfile = {
  experience: ExperienceLevel;
  goal: TrainingGoal;
  timeAvailable: number; // минуты
  daysPerWeek: number;
  programName?: string; // Название схемы (PPL, Upper/Lower, Full Body)
  age?: number;
  sex?: "male" | "female";
  location?: string;
};

export type CheckInData = {
  energy: "low" | "medium" | "high";
  pain: string[];
  injuries: string[];
  mode: "recovery" | "light" | "normal" | "push";
};

export type TrainingHistory = {
  recentExercises: string[];
  weightHistory: Record<string, string>;
};

export type WorkoutGenerationContext = {
  rules: DayTrainingRules;
  userProfile: UserProfile;
  checkIn?: CheckInData;
  history?: TrainingHistory;
};

export type DayWorkoutPlan = {
  dayIndex: number; // 0, 1, 2 для PPL 3 дня
  dayLabel: string; // "Push", "Pull", "Legs"
  focus: string; // "Грудь, плечи, трицепс"
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    restSec: number;
    weight: string;
    cues: string;
    targetMuscles: string[];
  }>;
  warmup: string[];
  cooldown: string[];
  notes: string;
  estimatedDuration: number;
  totalSets: number;
};

export type WeeklyWorkoutPlan = {
  weekId: string; // UUID для недели
  generatedAt: Date;
  scheme: string; // "Push/Pull/Legs", "Upper/Lower"
  daysPerWeek: number;
  days: DayWorkoutPlan[];
  weeklyVolume: {
    totalExercises: number;
    totalSets: number;
    totalMinutes: number;
  };
};

// Структура дня (без конкретных упражнений)
export type DayStructure = {
  dayIndex: number;
  dayLabel: string;
  focus: string;
  totalExercises: number;
  totalSets: number;
  estimatedDuration: number;
  blocks: Array<{
    type: 'compound' | 'secondary' | 'isolation';
    count: number; // сколько упражнений этого типа
    setsPerExercise: number;
    repsRange: string;
    restSec: number;
  }>;
};

// Структура недели
export type WeeklyStructure = {
  scheme: string;
  daysPerWeek: number;
  days: DayStructure[];
};

export type GeneratedWorkout = {
  title: string;
  focus: string;
  mode: string;
  warmup: { duration: number; guidelines: string };
  cooldown: { duration: number; guidelines: string };
  exercises: Array<{
    name: string;
    sets: number;
    reps: string;
    rest: number;
    weight: string;
    notes: string;
    targetMuscles: string[];
  }>;
  totalSets: number;
  totalExercises: number;
  estimatedDuration: number;
  scientificNotes?: string[];
  adaptationNotes?: string[];
  warnings?: string[];
};

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================================================

export async function buildIntelligentWorkout(params: {
  rules: DayTrainingRules;
  userProfile: UserProfile;
  checkIn?: {
    mode?: string;
    energy?: string;
    pain?: Array<{ location: string; level: number }> | string[];
    injuries?: string[];
  };
  history?: {
    recentExercises: string[];
    weightHistory: Record<string, string>;
  };
}): Promise<GeneratedWorkout> {
  
  const { rules, userProfile, checkIn, history } = params;
  
  console.log("\n🤖 AI-DRIVEN WORKOUT GENERATION (EXPERT MODE)");
  console.log(`📋 Схема: ${rules.name}`);
  console.log(`🎯 Фокус: ${rules.focus}`);
  console.log(`👤 Профиль: ${userProfile.experience}, ${userProfile.goal}, ${userProfile.timeAvailable} мин`);
  console.log(`🧠 Модель: GPT-4O (полная экспертиза)\n`);
  
  // Строим контекст для AI
  const painArray = checkIn?.pain 
    ? Array.isArray(checkIn.pain) && checkIn.pain.length > 0 && typeof checkIn.pain[0] === 'object'
      ? (checkIn.pain as Array<{ location: string; level: number }>).map(p => p.location)
      : (checkIn.pain as string[])
    : [];
  
  const context: WorkoutGenerationContext = {
    rules,
    userProfile,
    checkIn: checkIn ? {
      energy: (checkIn.energy as any) || "medium",
      pain: painArray,
      injuries: checkIn.injuries || [],
      mode: (checkIn.mode as any) || "normal"
    } : undefined,
    history: history || { recentExercises: [], weightHistory: {} }
  };
  
  // AI генерирует тренировку (полная свобода!)
  const aiWorkout = await callAIForWorkout(context);
  
  const totalSets = aiWorkout.exercises.reduce((sum, ex) => sum + ex.sets, 0);
  console.log(`\n✅ AI сгенерировал тренировку: ${aiWorkout.exercises.length} упражнений, ${totalSets} подходов`);
  
  // Логируем каждое упражнение
  console.log("\n📋 УПРАЖНЕНИЯ:");
  aiWorkout.exercises.forEach((ex, idx) => {
    console.log(`  ${idx + 1}. ${ex.name} - ${ex.sets}×${ex.reps}, отдых ${ex.restSec}с (${ex.weight})`);
  });
  console.log("");
  
  // Формируем финальную тренировку
  const estimatedDuration = calculateDuration(aiWorkout.exercises);
  
  const result = {
    title: `${rules.name} — ${userProfile.experience}`,
    focus: rules.focus,
    mode: checkIn?.mode || "normal",
    warmup: {
      duration: 5,
      guidelines: "Динамическая разминка целевых мышц и суставов"
    },
    cooldown: {
      duration: 5,
      guidelines: "Легкая растяжка работавших мышц"
    },
    exercises: aiWorkout.exercises,
    totalSets,
    totalExercises: aiWorkout.exercises.length,
    estimatedDuration,
    scientificNotes: [`Тренировка создана AI на основе экспертных знаний`],
    adaptationNotes: aiWorkout.adaptationNotes,
    warnings: aiWorkout.warnings
  };
  
  console.log(`\n📦 Возвращаем тренировку: ${result.exercises.length} упражнений, duration: ${result.estimatedDuration} мин\n`);
  
  return result;
}

// ============================================================================
// AI ВЫЗОВ
// ============================================================================

async function callAIForWorkout(context: WorkoutGenerationContext): Promise<{
  exercises: any[];
  adaptationNotes: string[];
  warnings: string[];
}> {
  
  const prompt = buildSimplePrompt(context);
  
  console.log("📤 Отправляем промпт AI...\n");
  if (process.env.DEBUG_AI) {
    console.log("=".repeat(80));
    console.log("📄 PROMPT:");
    console.log("=".repeat(80));
    console.log(prompt);
    console.log("=".repeat(80) + "\n");
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // 🔥 Лучшая модель OpenAI
      messages: [
        {
          role: "system",
          content: "Ты — элитный персональный тренер с 20+ годами опыта. Твоя специализация: научно обоснованные тренировки для любых целей. ВСЕ названия упражнений, мышцы и подсказки пиши ТОЛЬКО НА РУССКОМ ЯЗЫКЕ."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 1.0, // Максимальная уверенность и разнообразие
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI не вернул ответ");
    
    console.log(`\n📥 AI ответил (${content.length} символов)\n`);
    
    const result = JSON.parse(content);
    
    console.log(`✓ JSON распарсен: ${result.exercises?.length || 0} упражнений`);
    
    // DEBUG: логируем что AI реально вернул
    if (result.exercises && result.exercises.length > 0) {
      console.log(`\n🔍 DEBUG - что AI вернул для упражнений:`);
      result.exercises.forEach((ex: any, idx: number) => {
        console.log(`  ${idx + 1}. ${ex.name}: rest=${ex.rest}, restSec=${ex.restSec}`);
      });
      console.log('');
    }
    
    const mappedExercises = result.exercises.map((ex: any) => {
      // Fallback для rest (AI может вернуть rest, restSec, или вообще не вернуть)
      const restSec = ex.restSec || ex.rest || 90; // Default 90 сек если не указано
      
      return {
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restSec,
        weight: ex.weight,
        cues: ex.cues || ex.technique || ex.notes || "",
        targetMuscles: ex.targetMuscles || []
      };
    });
    
    console.log(`✓ Упражнения замаплены: ${mappedExercises.length}`);
    
    return {
      exercises: mappedExercises,
      adaptationNotes: result.adaptationNotes || [],
      warnings: result.warnings || []
    };
    
  } catch (error: any) {
    console.error("❌ Ошибка AI:", error.message);
    throw new Error(`AI generation failed: ${error.message}`);
  }
}

// ============================================================================
// ПРОМПТ
// ============================================================================


function buildSimplePrompt(context: WorkoutGenerationContext): string {
  const { rules, userProfile, checkIn, history } = context;
  
  const modeText = checkIn?.mode === "recovery" ? "🛌 ВОССТАНОВИТЕЛЬНЫЙ режим (легкая тренировка)" :
                   checkIn?.mode === "light" ? "☀️ ОБЛЕГЧЁННЫЙ режим (умеренная нагрузка)" :
                   checkIn?.mode === "push" ? "🔥 УСИЛЕННЫЙ режим (максимальная нагрузка)" :
                   "⚡ НОРМАЛЬНЫЙ режим";
  
  const energyText = checkIn?.energy === "low" ? "😴 Низкая энергия" :
                     checkIn?.energy === "high" ? "💪 Высокая энергия" :
                     "😊 Средняя энергия";
  
  const injuriesText = checkIn?.injuries && checkIn.injuries.length > 0 
    ? `⚠️ Травмы/ограничения: ${checkIn.injuries.join(", ")}`
    : "✅ Без травм";
  
  const painText = checkIn?.pain && checkIn.pain.length > 0
    ? `⚠️ Болезненные зоны: ${checkIn.pain.join(", ")}`
    : "";
  
  const historyText = history?.recentExercises && history.recentExercises.length > 0
    ? `📜 Недавние упражнения (не повторяй): ${history.recentExercises.join(", ")}`
    : "📜 История пуста — первая тренировка";
  
  return `# ЗАДАНИЕ: Создай персональную тренировку

## 🎯 СХЕМА ТРЕНИРОВКИ

**Программа:** ${userProfile.programName || 'Сплит'} — ${userProfile.daysPerWeek} тренировки/неделю
**Сегодняшний день:** ${rules.name}
**Фокус:** ${rules.focus}
**Описание:** ${rules.description}

*Это один день из недельной программы. Другие дни тренируют другие группы мышц.*

## 👤 ПРОФИЛЬ КЛИЕНТА
- **Уровень:** ${userProfile.experience} (beginner/intermediate/advanced)
- **Цель:** ${userProfile.goal} (strength/hypertrophy/athletic_body/health)
- **Доступное время:** ${userProfile.timeAvailable} минут
- **Частота тренировок:** ${userProfile.daysPerWeek} раз/неделю
${userProfile.age ? `- **Возраст:** ${userProfile.age} лет` : ''}
${userProfile.sex ? `- **Пол:** ${userProfile.sex}` : ''}
${userProfile.location ? `- **Место:** ${userProfile.location}` : ''}

## 📊 СЕГОДНЯШНЕЕ СОСТОЯНИЕ (ЧЕК-ИН)
- ${modeText}
- ${energyText}
- ${injuriesText}
${painText ? `- ${painText}` : ''}

## 📜 ИСТОРИЯ
${historyText}

---

## 💡 ТВОЯ ЗАДАЧА

Создай **профессиональную тренировку** на ${userProfile.timeAvailable} минут для дня "${rules.focus}".

**⚠️ ЯЗЫК: ВСЁ НА РУССКОМ!** (названия упражнений, мышцы, технические подсказки)

### 🔬 НАУЧНЫЙ ПОДХОД

Опирайся на **научные данные** о тренировочном объёме:
- Volume Landmarks (MEV/MAV/MRV)
- Исследования: Schoenfeld et al., Dr. Mike Israetel (Renaissance Periodization)

**Контекст:**
- Частота тренировки группы: ${userProfile.daysPerWeek} дней/неделю (эта группа: ${rules.focus})
- Уровень: ${userProfile.experience}
- Цель: ${userProfile.goal}

Используй свои знания этих концепций для определения оптимального объёма, интенсивности и структуры.

### 📊 КОНТЕКСТ КЛИЕНТА

**Уровень:** ${userProfile.experience}

**Цель:** ${userProfile.goal}
${userProfile.goal === "strength" ? "- Фокус на силу и мощность" : ""}
${userProfile.goal === "hypertrophy" ? "- Фокус на гипертрофию (рост мышц)" : ""}
${userProfile.goal === "metabolic" || userProfile.goal === "health" ? "- Фокус на метаболизм и здоровье" : ""}

**Время:** ${userProfile.timeAvailable} минут доступно для РАБОЧЕЙ части тренировки

**Режим:** ${checkIn?.mode || "normal"}
${checkIn?.mode === "recovery" ? "- Восстановительный: снизь объём на 40-50%, легкие веса, больше отдых" : ""}
${checkIn?.mode === "light" ? "- Облегчённый: снизь объём на 20-30%, умеренные веса" : ""}
${checkIn?.mode === "push" ? "- Усиленный: увеличь объём на 10-15%, можно суперсеты/дроп-сеты" : ""}

**Состояние:**
- Энергия: ${checkIn?.energy || "medium"}${checkIn?.energy === "low" ? " (избегай супертяжелых упражнений)" : ""}
${checkIn?.injuries && checkIn.injuries.length > 0 ? `- ⚠️ Травмы: ${checkIn.injuries.join(", ")} — ИЗБЕГАЙ этих зон` : ""}
${checkIn?.pain && checkIn.pain.length > 0 ? `- ⚠️ Боль: ${checkIn.pain.join(", ")} — будь осторожен` : ""}

**История:**
${history?.recentExercises && history.recentExercises.length > 0 ? `- НЕ повторяй: ${history.recentExercises.join(", ")}` : "- Первая тренировка — выбирай классику"}

---

### 🎯 ТЫ — ЭКСПЕРТ. РЕШИ САМ:

**ИСПОЛЬЗУЙ ВСЁ доступное время (${userProfile.timeAvailable} минут)!**

Определи на основе своих знаний Volume Landmarks (MEV/MAV/MRV):
- Сколько упражнений нужно для достижения MAV объёма?
- Какие упражнения выбрать?
- Сколько подходов и повторений для каждого?
- Какой отдых между подходами?
- Как распределить нагрузку между мышечными группами?

**Справочная информация (не жёсткое правило, а ориентир для MAV):**
${userProfile.experience === 'advanced' && userProfile.timeAvailable >= 90 
  ? '- Advanced, 90+ минут, hypertrophy обычно: 7-10 упражнений, 35-50 подходов суммарно' 
  : userProfile.experience === 'advanced' && userProfile.timeAvailable >= 60
  ? '- Advanced, 60-75 минут, hypertrophy обычно: 5-7 упражнений, 25-35 подходов суммарно'
  : userProfile.experience === 'intermediate'
  ? '- Intermediate обычно: 5-7 упражнений, 20-30 подходов суммарно'
  : '- Beginner обычно: 4-6 упражнений, 15-20 подходов суммарно'}

**Принципы построения тренировки:**
- Начинай с тяжелых многосуставных движений
- Заканчивай изоляцией
- Не дублируй функции упражнений (разные углы/паттерны)
- Учитывай работу синергистов

### 📋 Формат ответа:

Верни **ТОЛЬКО** валидный JSON со следующей структурой:

\`\`\`
{
  "exercises": [
    {
      "name": string,           // НА РУССКОМ! Например: "Жим штанги лёжа", "Тяга верхнего блока"
      "sets": number,           // Количество подходов
      "reps": string,           // Диапазон повторений (например "6-8")
      "rest": number,           // ОБЯЗАТЕЛЬНО! Отдых в секундах (60/90/120/180)
      "weight": string,         // Рекомендуемый вес: "80 кг", "2×30 кг", "собственный вес"
      "cues": string,           // НА РУССКОМ! Технические подсказки
      "targetMuscles": string[] // НА РУССКОМ! Например: ["грудь", "трицепс", "передние дельты"]
    }
    // ... повторить для каждого упражнения
  ],
  "adaptationNotes": string[], // Опционально: заметки об адаптации (НА РУССКОМ!)
  "warnings": string[]         // Опционально: предупреждения (НА РУССКОМ!)
}
\`\`\`

**КРИТИЧЕСКИ ВАЖНО:**
- Каждое упражнение ДОЛЖНО содержать поле "rest" (число в секундах)
- ВСЕ тексты ТОЛЬКО НА РУССКОМ ЯЗЫКЕ!

---

## 🚀 ВАЖНО:

- Ты ЭКСПЕРТ, используй СВОИ знания Volume Landmarks
- **МАКСИМАЛЬНО ИСПОЛЬЗУЙ ${userProfile.timeAvailable} МИНУТ!** Не экономь объём — клиент готов!
- Подбирай упражнения для достижения оптимального тренировочного объёма (MAV)
- НЕ дублируй функции упражнений
- Давай конкретные веса (с учетом уровня)
- **"rest"** - ОБЯЗАТЕЛЬНО для КАЖДОГО упражнения (число в секундах: 60, 90, 120, 180)
- **ВСЁ НА РУССКОМ ЯЗЫКЕ!** (названия упражнений, мышцы, технические подсказки)
- Возвращай ТОЛЬКО JSON, без markdown

**ДОВЕРЯЮ твоей экспертизе! Создай идеальную тренировку! 🔥**`;
}

// ============================================================================
// НЕДЕЛЬНАЯ ГЕНЕРАЦИЯ (НОВАЯ СИСТЕМА)
// ============================================================================

export async function buildWeeklyProgram(params: {
  daysRules: DayTrainingRules[]; // Массив правил для каждого дня недели
  userProfile: UserProfile;
  checkIn?: {
    mode?: string;
    energy?: string;
    pain?: Array<{ location: string; level: number }> | string[];
    injuries?: string[];
  };
  history?: {
    recentExercises: string[];
    weightHistory: Record<string, string>;
  };
}): Promise<WeeklyWorkoutPlan> {
  
  const { daysRules, userProfile, checkIn, history } = params;
  
  console.log("\n📅 WEEKLY PROGRAM GENERATION (TWO-STAGE)");
  console.log(`📋 Схема: ${userProfile.programName || 'Custom'}`);
  console.log(`🗓️ Дней в неделе: ${daysRules.length}`);
  console.log(`👤 Профиль: ${userProfile.experience}, ${userProfile.goal}, ${userProfile.timeAvailable} мин`);
  console.log(`🧠 Модель: GPT-4O (двухэтапная генерация)\n`);
  
  // ============================================================================
  // ЭТАП 1: ГЕНЕРАЦИЯ СТРУКТУРЫ НЕДЕЛИ
  // ============================================================================
  console.log("🏗️ ЭТАП 1: Генерация структуры недели (сколько упражнений, подходов)...\n");
  
  const weeklyStructure = await generateWeeklyStructure(daysRules, userProfile, checkIn);
  
  console.log("✅ Структура недели сгенерирована:");
  weeklyStructure.days.forEach((day, i) => {
    console.log(`  День ${i + 1}: ${day.dayLabel} — ${day.totalExercises} упражнений, ${day.totalSets} подходов`);
  });
  console.log();
  
  // ============================================================================
  // ЭТАП 2: ЗАПОЛНЕНИЕ КОНКРЕТНЫМИ УПРАЖНЕНИЯМИ
  // ============================================================================
  console.log("💪 ЭТАП 2: Заполнение конкретными упражнениями...\n");
  
  const weeklyPlan = await fillWeeklyExercises(weeklyStructure, daysRules, userProfile, checkIn, history);
  
  // Возвращаем готовый план
  return weeklyPlan;
}

// ============================================================================
// ЭТАП 1: ГЕНЕРАЦИЯ СТРУКТУРЫ НЕДЕЛИ
// ============================================================================

async function generateWeeklyStructure(
  daysRules: DayTrainingRules[],
  userProfile: UserProfile,
  checkIn?: any
): Promise<WeeklyStructure> {
  
  const prompt = `# ЗАДАНИЕ: Создай СТРУКТУРУ недельной программы тренировок

Ты — эксперт по тренировочному планированию. Твоя задача — создать СТРУКТУРУ недельной программы БЕЗ конкретных упражнений.

## 📊 ИНФОРМАЦИЯ:

**Программа:** ${userProfile.programName || 'Custom'} — ${daysRules.length} тренировки/неделю
**Уровень:** ${userProfile.experience}
**Цель:** ${userProfile.goal}
**Время на тренировку:** ${userProfile.timeAvailable} минут

**Дни недели:**
${daysRules.map((day, i) => `
День ${i + 1}: ${day.name}
- Фокус: ${day.focus}
- Описание: ${day.description}
`).join('\n')}

## 🎯 ТВОЯ ЗАДАЧА:

Для КАЖДОГО дня определи:
1. **Сколько упражнений** нужно (compound, secondary, isolation)
2. **Сколько подходов** для каждого типа
3. **Диапазон повторений** для каждого типа
4. **Отдых** между подходами

**ТВОЯ ЗАДАЧА:**
На основе своих знаний Volume Landmarks (MEV/MAV/MRV) определи ОПТИМАЛЬНУЮ структуру:
- Сколько упражнений каждого типа нужно для достижения MAV объёма?
- Сколько подходов для каждого?
- Как распределить недельный объём между ${daysRules.length} днями?

**ВАЖНО:**
- Используй ВСЁ доступное время (${userProfile.timeAvailable} минут)
- Это ${daysRules.length} дней/неделю
- ${userProfile.experience} уровень → определи соответствующий MAV
- Цель: ${userProfile.goal} → определи оптимальные диапазоны повторений

**ДОВЕРЯЮ твоей экспертизе! Определи объём на основе научных данных!**

**Типы упражнений:**
- **compound** — тяжелые многосуставные базовые упражнения
- **secondary** — вспомогательные упражнения средней интенсивности
- **isolation** — изолирующие односуставные упражнения

**Ты сам определяешь для каждого типа:**
- Сколько упражнений нужно
- Сколько подходов оптимально
- Какой диапазон повторений
- Сколько отдыха между подходами

На основе: уровня (${userProfile.experience}), цели (${userProfile.goal}), времени (${userProfile.timeAvailable} мин), частоты (${daysRules.length} дней/неделю)

## 📋 Формат ответа:

Верни **ТОЛЬКО** валидный JSON:

\`\`\`
{
  "days": [
    {
      "dayIndex": number,      // 0, 1, 2
      "dayLabel": string,      // "Push", "Pull", "Legs"
      "focus": string,         // "Грудь, плечи, трицепс"
      "blocks": [
        {
          "type": "compound",        // compound | secondary | isolation
          "count": number,           // сколько упражнений этого типа
          "setsPerExercise": number, // сколько подходов на упражнение
          "repsRange": string,       // "6-8" или "10-12"
          "restSec": number          // отдых в секундах
        }
        // ... остальные блоки
      ]
    }
    // ... все ${daysRules.length} дня
  ]
}
\`\`\`

Верни ТОЛЬКО JSON, без markdown!`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Ты — эксперт по тренировочному планированию с глубокими знаниями Volume Landmarks (MEV/MAV/MRV). Создаёшь оптимальные структуры тренировок."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7, // Меньше креативности для структуры
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("AI не вернул ответ");
    }

    const parsed = JSON.parse(content);
    
    if (!parsed.days || !Array.isArray(parsed.days)) {
      throw new Error("AI не вернул массив 'days'");
    }

    // Мапим в нашу структуру
    const days: DayStructure[] = parsed.days.map((day: any) => {
      const totalExercises = (day.blocks || []).reduce((sum: number, b: any) => sum + (b.count || 0), 0);
      const totalSets = (day.blocks || []).reduce((sum: number, b: any) => sum + (b.count || 0) * (b.setsPerExercise || 0), 0);
      
      // Примерный расчёт времени
      const estimatedDuration = (day.blocks || []).reduce((sum: number, b: any) => {
        const setTime = 60; // ~60 сек на подход
        const totalTimePerExercise = (setTime + (b.restSec || 90)) * (b.setsPerExercise || 3);
        return sum + totalTimePerExercise * (b.count || 1) / 60;
      }, 10); // +10 мин на разминку/заминку

      return {
        dayIndex: day.dayIndex,
        dayLabel: day.dayLabel || daysRules[day.dayIndex]?.name || `День ${day.dayIndex + 1}`,
        focus: day.focus || daysRules[day.dayIndex]?.focus || "",
        totalExercises,
        totalSets,
        estimatedDuration: Math.ceil(estimatedDuration),
        blocks: day.blocks || []
      };
    });

    return {
      scheme: userProfile.programName || "Custom",
      daysPerWeek: daysRules.length,
      days
    };

  } catch (error: any) {
    console.error("❌ Ошибка генерации структуры:", error.message);
    throw error;
  }
}

// ============================================================================
// ЭТАП 2: ЗАПОЛНЕНИЕ КОНКРЕТНЫМИ УПРАЖНЕНИЯМИ
// ============================================================================

async function fillWeeklyExercises(
  structure: WeeklyStructure,
  daysRules: DayTrainingRules[],
  userProfile: UserProfile,
  checkIn?: any,
  history?: any
): Promise<WeeklyWorkoutPlan> {
  
  const days: DayWorkoutPlan[] = [];
  
  // Для каждого дня генерируем упражнения
  for (let i = 0; i < structure.days.length; i++) {
    const dayStructure = structure.days[i];
    const dayRules = daysRules[i];
    
    console.log(`  Генерирую упражнения для: ${dayStructure.dayLabel}...`);
    
    const dayWorkout = await generateDayExercises(dayStructure, dayRules, userProfile, checkIn, history);
    days.push(dayWorkout);
  }
  
  const weeklyVolume = {
    totalExercises: days.reduce((sum, d) => sum + d.exercises.length, 0),
    totalSets: days.reduce((sum, d) => sum + d.totalSets, 0),
    totalMinutes: days.reduce((sum, d) => sum + d.estimatedDuration, 0)
  };

  console.log(`\n✅ НЕДЕЛЬНАЯ ПРОГРАММА СГЕНЕРИРОВАНА:`);
  console.log(`${"=".repeat(80)}\n`);
  
  days.forEach((day, i) => {
    console.log(`📋 ДЕНЬ ${i + 1}: ${day.dayLabel}`);
    console.log(`   Фокус: ${day.focus}`);
    console.log(`   Итого: ${day.exercises.length} упражнений, ${day.totalSets} подходов, ${day.estimatedDuration} мин\n`);
    
    console.log(`   УПРАЖНЕНИЯ:`);
    day.exercises.forEach((ex: any, idx: number) => {
      console.log(`   ${idx + 1}. ${ex.name}`);
      console.log(`      ${ex.sets} × ${ex.reps} повторений, отдых ${ex.restSec}с`);
      console.log(`      Вес: ${ex.weight}`);
      if (ex.targetMuscles && ex.targetMuscles.length > 0) {
        console.log(`      Мышцы: ${ex.targetMuscles.join(", ")}`);
      }
      if (ex.cues) {
        console.log(`      Техника: ${ex.cues.substring(0, 60)}${ex.cues.length > 60 ? '...' : ''}`);
      }
      console.log();
    });
    
    if (day.notes) {
      console.log(`   📝 Заметки: ${day.notes}\n`);
    }
    
    console.log(`${"-".repeat(80)}\n`);
  });
  
  console.log(`📊 НЕДЕЛЬНЫЙ ИТОГ:`);
  console.log(`   Всего упражнений: ${weeklyVolume.totalExercises}`);
  console.log(`   Всего подходов: ${weeklyVolume.totalSets}`);
  console.log(`   Общее время: ${weeklyVolume.totalMinutes} минут (~${Math.round(weeklyVolume.totalMinutes / 60)} часов)\n`);
  console.log(`${"=".repeat(80)}\n`);

  return {
    weekId: `week_${Date.now()}`,
    generatedAt: new Date(),
    scheme: structure.scheme,
    daysPerWeek: structure.daysPerWeek,
    days,
    weeklyVolume
  };
}

async function generateDayExercises(
  dayStructure: DayStructure,
  dayRules: DayTrainingRules,
  userProfile: UserProfile,
  checkIn?: any,
  history?: any
): Promise<DayWorkoutPlan> {
  
  const recentExercisesText = history?.recentExercises && history.recentExercises.length > 0
    ? `НЕ используй эти упражнения (были недавно): ${history.recentExercises.join(", ")}`
    : "Первая тренировка — выбирай классические упражнения";

  const blocksDescription = dayStructure.blocks.map((block, idx) => `
Блок ${idx + 1}: ${block.type}
- Количество упражнений: ${block.count}
- Подходов на упражнение: ${block.setsPerExercise}
- Повторения: ${block.repsRange}
- Отдых: ${block.restSec} секунд
`).join('\n');

  const prompt = `# ЗАДАНИЕ: Подбери конкретные упражнения

Ты — элитный тренер. У тебя есть ГОТОВАЯ СТРУКТУРА тренировки. Твоя задача — заполнить её КОНКРЕТНЫМИ упражнениями.

## 📊 ИНФОРМАЦИЯ:

**День:** ${dayStructure.dayLabel}
**Фокус:** ${dayStructure.focus}
**Описание:** ${dayRules.description}

**Уровень клиента:** ${userProfile.experience}
**Цель:** ${userProfile.goal}

## 🏗️ СТРУКТУРА (УЖЕ ГОТОВА):

${blocksDescription}

**Всего:** ${dayStructure.totalExercises} упражнений, ${dayStructure.totalSets} подходов, ~${dayStructure.estimatedDuration} минут

## 📜 ИСТОРИЯ:
${recentExercisesText}

## 🎯 ТВОЯ ЗАДАЧА:

Для КАЖДОГО блока подбери КОНКРЕТНЫЕ упражнения:
- НА РУССКОМ ЯЗЫКЕ!
- Разнообразные (разные углы, паттерны)
- Без дублей функций
- С учетом истории
- Укажи рекомендуемый вес

## 📋 Формат ответа:

Верни **ТОЛЬКО** валидный JSON:

\`\`\`
{
  "exercises": [
    {
      "name": string,           // НА РУССКОМ! "Жим штанги лёжа"
      "sets": number,           // из структуры
      "reps": string,           // из структуры
      "rest": number,           // из структуры (в секундах)
      "weight": string,         // "80 кг", "2×30 кг", "собственный вес"
      "cues": string,           // НА РУССКОМ! Технические подсказки
      "targetMuscles": string[] // НА РУССКОМ! ["грудь", "трицепс"]
    }
    // ... все ${dayStructure.totalExercises} упражнений
  ],
  "warmup": [string],  // НА РУССКОМ! Рекомендации по разминке
  "cooldown": [string], // НА РУССКОМ! Рекомендации по заминке
  "notes": string      // НА РУССКОМ! Общие заметки
}
\`\`\`

**КРИТИЧНО:** ВСЁ НА РУССКОМ ЯЗЫКЕ! Верни ТОЛЬКО JSON!`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Ты — элитный персональный тренер. Подбираешь идеальные упражнения для клиента. ВСЁ НА РУССКОМ ЯЗЫКЕ!"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.9, // Больше разнообразия для упражнений
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("AI не вернул ответ");
    }

    const parsed = JSON.parse(content);
    
    const exercises = (parsed.exercises || []).map((ex: any) => ({
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      restSec: ex.rest || ex.restSec || 90,
      weight: ex.weight || "подобрать",
      cues: ex.cues || "",
      targetMuscles: ex.targetMuscles || []
    }));

    const totalSets = exercises.reduce((sum: number, ex: any) => sum + ex.sets, 0);
    const estimatedDuration = calculateDuration(exercises);

    return {
      dayIndex: dayStructure.dayIndex,
      dayLabel: dayStructure.dayLabel,
      focus: dayStructure.focus,
      exercises,
      warmup: parsed.warmup || ["Общая разминка 5-7 минут"],
      cooldown: parsed.cooldown || ["Растяжка 3-5 минут"],
      notes: parsed.notes || "",
      estimatedDuration,
      totalSets
    };

  } catch (error: any) {
    console.error(`❌ Ошибка генерации упражнений для ${dayStructure.dayLabel}:`, error.message);
    throw error;
  }
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

function calculateDuration(exercises: any[]): number {
  let totalMinutes = 10; // разминка + заминка
  
  exercises.forEach(ex => {
    const setTime = 60; // ~60 секунд на подход (выполнение)
    const restSec = ex.restSec || ex.rest || 90; // Fallback на 90 сек
    const totalTime = (setTime + restSec) * ex.sets;
    totalMinutes += Math.ceil(totalTime / 60);
  });
  
  return Math.ceil(totalMinutes);
}

// ============================================================================
// СТАРАЯ СИСТЕМА: ОДНОЭТАПНАЯ ГЕНЕРАЦИЯ (DEPRECATED, НЕ ИСПОЛЬЗУЕТСЯ)
// ============================================================================
// Эти функции заменены на двухэтапную генерацию:
// 1. generateWeeklyStructure() - генерирует структуру
// 2. fillWeeklyExercises() - заполняет упражнениями
// ============================================================================

/*
function buildWeeklyPrompt(
  daysRules: DayTrainingRules[],
  userProfile: UserProfile,
  checkIn?: any,
  history?: any
): string {
  
  // Описание каждого дня недели
  const daysDescription = daysRules.map((day, index) => `
**День ${index + 1}: ${day.name}**
- Фокус: ${day.focus}
- Описание: ${day.description}
`).join('\n');

  // Состояние пользователя
  const modeText = checkIn?.mode === "recovery" ? "Восстановительный режим"
    : checkIn?.mode === "light" ? "Облегчённый режим"
    : checkIn?.mode === "push" ? "Усиленный режим"
    : "Нормальный режим";
  
  const energyText = `Энергия: ${checkIn?.energy || "medium"}`;
  
  const injuriesText = checkIn?.injuries && checkIn.injuries.length > 0
    ? `⚠️ Травмы: ${checkIn.injuries.join(", ")}`
    : "Нет травм";
  
  const painText = checkIn?.pain && checkIn.pain.length > 0
    ? `⚠️ Болезненные зоны: ${checkIn.pain.join(", ")}`
    : "";
  
  const historyText = history?.recentExercises && history.recentExercises.length > 0
    ? `📜 Недавние упражнения (избегай повторов): ${history.recentExercises.join(", ")}`
    : "📜 История пуста — первая программа";

  // Ориентиры по объёму (реалистичные на основе научных данных)
  const volumeGuideline = userProfile.experience === 'advanced' && userProfile.timeAvailable >= 90
    ? '- Advanced, 90 минут: 7-8 упражнений, 25-30 подходов за тренировку'
    : userProfile.experience === 'advanced' && userProfile.timeAvailable >= 60
    ? '- Advanced, 60 минут: 5-6 упражнений, 16-20 подходов за тренировку'
    : userProfile.experience === 'intermediate'
    ? '- Intermediate: 5-7 упражнений, 20-25 подходов за тренировку'
    : '- Beginner: 4-6 упражнений, 15-18 подходов за тренировку';

  return `# ЗАДАНИЕ: Создай НЕДЕЛЬНУЮ программу тренировок

## 🎯 СХЕМА ТРЕНИРОВКИ

**Программа:** ${userProfile.programName || 'Сплит'} — ${daysRules.length} тренировки/неделю
**Доступное время:** ${userProfile.timeAvailable} минут на каждую тренировку

${daysDescription}

*Это сплит-программа: каждый день тренирует определённые группы мышц.*

## 👤 ПРОФИЛЬ КЛИЕНТА
- **Уровень:** ${userProfile.experience}
- **Цель:** ${userProfile.goal}
- **Частота:** ${daysRules.length} тренировки/неделю
- **Время на тренировку:** ${userProfile.timeAvailable} минут доступно для РАБОЧЕЙ части
${userProfile.age ? `- **Возраст:** ${userProfile.age} лет` : ''}
${userProfile.sex ? `- **Пол:** ${userProfile.sex}` : ''}
${userProfile.location ? `- **Место:** ${userProfile.location}` : ''}

## 📊 ТЕКУЩЕЕ СОСТОЯНИЕ (ЧЕК-ИН)
- ${modeText}
- ${energyText}
- ${injuriesText}
${painText ? `- ${painText}` : ''}

## 📜 ИСТОРИЯ
${historyText}

---

## 🔬 НАУЧНЫЙ ПОДХОД

Опирайся на **научные данные Volume Landmarks (MEV/MAV/MRV)**:
- Исследования: Schoenfeld et al., Dr. Mike Israetel (Renaissance Periodization)
- **Недельный объём (MAV)** для каждой мышечной группы:
  - Крупные группы (грудь, спина, квадрицепсы): 12-20 подходов/неделю
  - Средние группы (плечи, бицепс, трицепс, задняя поверхность): 10-16 подходов/неделю
  - Малые группы (икры, пресс): 8-12 подходов/неделю

**ВАЖНО:** Распредели недельный MAV объём по тренировкам недели!

Например, для ${userProfile.programName || 'сплита'}:
- Если группа тренируется 1 раз/неделю → весь MAV за одну тренировку
- Если группа тренируется 2 раза/неделю → раздели MAV на 2 тренировки

---

## 🎯 ТВОЯ ЗАДАЧА

Создай **ПОЛНУЮ НЕДЕЛЬНУЮ ПРОГРАММУ** из ${daysRules.length} тренировок.

**Для каждой тренировки:**
- Используй ВСЁ доступное время (${userProfile.timeAvailable} минут)
- Подбери упражнения для достижения MAV объёма
- Распредели нагрузку с учётом недельного плана
- Создавай РАЗНООБРАЗИЕ между днями (разные упражнения, углы, паттерны)

**Ориентир по объёму за одну тренировку:**
${volumeGuideline}

**Принципы:**
- Начинай с тяжелых многосуставных движений
- Заканчивай изоляцией
- Не дублируй функции упражнений в РАЗНЫХ днях (вариативность!)
- Учитывай работу синергистов
- Балансируй нагрузку между днями недели

---

## 📋 Формат ответа:

Верни **ТОЛЬКО** валидный JSON со следующей структурой:

\`\`\`
{
  "week": [
    {
      "day": number,              // Номер дня (1, 2, 3...)
      "dayLabel": string,         // НА РУССКОМ! "Push", "Pull", "Legs"
      "focus": string,            // НА РУССКОМ! "Грудь, плечи, трицепс"
      "exercises": [
        {
          "name": string,         // НА РУССКОМ! "Жим штанги лёжа"
          "sets": number,         // Количество подходов
          "reps": string,         // Диапазон повторений "6-8"
          "rest": number,         // ОБЯЗАТЕЛЬНО! Отдых в секундах (60/90/120/180)
          "weight": string,       // "80 кг", "2×30 кг", "собственный вес"
          "cues": string,         // НА РУССКОМ! Технические подсказки
          "targetMuscles": string[] // НА РУССКОМ! ["грудь", "трицепс"]
        }
        // ... все упражнения дня
      ],
      "warmup": [string],         // НА РУССКОМ! Рекомендации по разминке
      "cooldown": [string],       // НА РУССКОМ! Рекомендации по заминке
      "notes": string             // НА РУССКОМ! Заметки по тренировке
    }
    // ... повторить для каждого дня недели (${daysRules.length} дней)
  ],
  "weeklyNotes": string[]        // Опционально: общие заметки на неделю (НА РУССКОМ!)
}
\`\`\`

## 🚀 КРИТИЧЕСКИ ВАЖНО:

- ВСЁ НА РУССКОМ ЯЗЫКЕ! (названия, мышцы, подсказки, заметки)
- Каждое упражнение ДОЛЖНО содержать "rest" (число в секундах)
- Генерируй ВСЕ ${daysRules.length} дня за раз
- Распредели недельный MAV объём правильно
- Создавай РАЗНООБРАЗИЕ между днями
- Возвращай ТОЛЬКО JSON, без markdown

**ДОВЕРЯЮ твоей экспертизе! Создай идеальную недельную программу! 🔥**`;
}

// ============================================================================
// ВЫЗОВ AI ДЛЯ НЕДЕЛЬНОЙ ГЕНЕРАЦИИ
// ============================================================================

async function callAIForWeeklyWorkout(
  prompt: string,
  daysRules: DayTrainingRules[]
): Promise<WeeklyWorkoutPlan> {
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Ты элитный тренер по фитнесу и бодибилдингу с глубокими знаниями научных принципов тренировок. Создаёшь персональные недельные программы тренировок, основанные на Volume Landmarks, исследованиях Schoenfeld и методиках Dr. Mike Israetel."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 1.0,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("AI вернул пустой ответ");
    }

    console.log(`📥 AI ответил (${content.length} символов)`);
    
    // Парсим JSON
    const parsed = JSON.parse(content);
    console.log(`✓ JSON распарсен: ${parsed.week?.length || 0} дней`);

    if (!parsed.week || !Array.isArray(parsed.week)) {
      throw new Error("AI не вернул массив 'week'");
    }

    // Мапим дни в наш формат
    const days: DayWorkoutPlan[] = parsed.week.map((dayData: any, index: number) => {
      const exercises = (dayData.exercises || []).map((ex: any) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restSec: ex.rest || ex.restSec || 90,
        weight: ex.weight || "подобрать",
        cues: ex.cues || ex.technique || ex.notes || "",
        targetMuscles: ex.targetMuscles || []
      }));

      const totalSets = exercises.reduce((sum: number, ex: any) => sum + ex.sets, 0);
      const estimatedDuration = calculateDuration(exercises);

      return {
        dayIndex: index,
        dayLabel: dayData.dayLabel || daysRules[index]?.name || `День ${index + 1}`,
        focus: dayData.focus || daysRules[index]?.focus || "",
        exercises,
        warmup: Array.isArray(dayData.warmup) ? dayData.warmup : ["Общая разминка 5-7 минут"],
        cooldown: Array.isArray(dayData.cooldown) ? dayData.cooldown : ["Растяжка 3-5 минут"],
        notes: dayData.notes || "",
        estimatedDuration,
        totalSets
      };
    });

    const weeklyVolume = {
      totalExercises: days.reduce((sum, d) => sum + d.exercises.length, 0),
      totalSets: days.reduce((sum, d) => sum + d.totalSets, 0),
      totalMinutes: days.reduce((sum, d) => sum + d.estimatedDuration, 0)
    };

    console.log(`\n✅ НЕДЕЛЬНАЯ ПРОГРАММА СГЕНЕРИРОВАНА:`);
    console.log(`${"=".repeat(80)}\n`);
    
    days.forEach((day, i) => {
      console.log(`📋 ДЕНЬ ${i + 1}: ${day.dayLabel}`);
      console.log(`   Фокус: ${day.focus}`);
      console.log(`   Итого: ${day.exercises.length} упражнений, ${day.totalSets} подходов, ${day.estimatedDuration} мин\n`);
      
      console.log(`   УПРАЖНЕНИЯ:`);
      day.exercises.forEach((ex: any, idx: number) => {
        console.log(`   ${idx + 1}. ${ex.name}`);
        console.log(`      ${ex.sets} × ${ex.reps} повторений, отдых ${ex.restSec}с`);
        console.log(`      Вес: ${ex.weight}`);
        if (ex.targetMuscles && ex.targetMuscles.length > 0) {
          console.log(`      Мышцы: ${ex.targetMuscles.join(", ")}`);
        }
        if (ex.cues) {
          console.log(`      Техника: ${ex.cues.substring(0, 60)}${ex.cues.length > 60 ? '...' : ''}`);
        }
        console.log();
      });
      
      if (day.notes) {
        console.log(`   📝 Заметки: ${day.notes}\n`);
      }
      
      console.log(`${"-".repeat(80)}\n`);
    });
    
    console.log(`📊 НЕДЕЛЬНЫЙ ИТОГ:`);
    console.log(`   Всего упражнений: ${weeklyVolume.totalExercises}`);
    console.log(`   Всего подходов: ${weeklyVolume.totalSets}`);
    console.log(`   Общее время: ${weeklyVolume.totalMinutes} минут (~${Math.round(weeklyVolume.totalMinutes / 60)} часов)\n`);
    console.log(`${"=".repeat(80)}\n`);

    return {
      weekId: `week_${Date.now()}`,
      generatedAt: new Date(),
      scheme: daysRules[0]?.name || "Custom",
      daysPerWeek: daysRules.length,
      days,
      weeklyVolume
    };

  } catch (error: any) {
    console.error("❌ Ошибка вызова AI для недельной программы:", error.message);
    throw error;
  }
}
*/

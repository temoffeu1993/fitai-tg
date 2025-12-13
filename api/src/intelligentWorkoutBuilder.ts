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
  
  console.log("\n📅 WEEKLY PROGRAM GENERATION");
  console.log(`📋 Схема: ${userProfile.programName || 'Custom'}`);
  console.log(`🗓️ Дней в неделе: ${daysRules.length}`);
  console.log(`👤 Профиль: ${userProfile.experience}, ${userProfile.goal}, ${userProfile.timeAvailable} мин`);
  console.log(`🧠 Модель: GPT-4O (генерация ВСЕЙ недели)\n`);
  
  // Строим промпт для ВСЕЙ недели
  const prompt = buildWeeklyPrompt(daysRules, userProfile, checkIn, history);
  
  console.log("📤 Отправляем промпт AI для генерации недельной программы...\n");
  
  // Вызываем AI
  const weeklyPlan = await callAIForWeeklyWorkout(prompt, daysRules);
  
  // Возвращаем готовый план
  return weeklyPlan;
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
// ПРОМПТ ДЛЯ НЕДЕЛЬНОЙ ГЕНЕРАЦИИ
// ============================================================================

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
    days.forEach((day, i) => {
      console.log(`  День ${i + 1}: ${day.dayLabel} — ${day.exercises.length} упражнений, ${day.totalSets} подходов, ${day.estimatedDuration} мин`);
    });
    console.log(`📊 Итого: ${weeklyVolume.totalExercises} упражнений, ${weeklyVolume.totalSets} подходов, ${weeklyVolume.totalMinutes} минут\n`);

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

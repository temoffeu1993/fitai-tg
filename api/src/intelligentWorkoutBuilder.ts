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
    console.log(`  ${idx + 1}. ${ex.name} - ${ex.sets}×${ex.reps}, отдых ${ex.rest}с (${ex.weight})`);
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
          content: "Ты — элитный персональный тренер с 20+ годами опыта. Твоя специализация: научно обоснованные тренировки для любых целей."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7, // Баланс между креативностью и точностью
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
**Название:** ${rules.name}
**Фокус:** ${rules.focus}
**Описание:** ${rules.description}

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

### 🔬 НАУЧНЫЕ ПРИНЦИПЫ

Используй свои знания **Volume Landmarks** (MEV/MAV/MRV):

**Частота тренировки этой группы:** ${userProfile.daysPerWeek} дней/неделю
**Эта конкретная тренировка:** ${rules.focus}

→ Если эта группа мышц тренируется **1 раз/неделю**, планируй **весь недельный MAV** за эту сессию.
→ Если эта группа тренируется **2+ раза/неделю**, раздели недельный MAV между сессиями.

**Уровень клиента:** ${userProfile.experience}
→ Применяй соответствующий диапазон объёма (MEV/MAV/MRV) для этого уровня.

**Цель:** ${userProfile.goal}
→ Используй принципы тренировок для этой цели (объём, интенсивность, отдых).

### 📊 КОНТЕКСТ КЛИЕНТА

**Уровень:** ${userProfile.experience}
${userProfile.experience === "beginner" ? "- Новичок или после перерыва\n- Фокус на технику и базу\n- Используй тренажеры и простые движения" : ""}
${userProfile.experience === "intermediate" ? "- Средний опыт (6-24 месяца)\n- Баланс техники и интенсивности\n- Свободные веса + тренажеры" : ""}
${userProfile.experience === "advanced" ? "- Опытный атлет (2+ года)\n- Фокус на интенсивность и объём\n- Продвинутая техника, свободные веса" : ""}

**Цель:** ${userProfile.goal}
${userProfile.goal === "strength" ? "- Сила и мощность\n- Принципы: низкие повторения (1-6), долгий отдых (3-5 мин), высокая интенсивность (85-95% 1RM)" : ""}
${userProfile.goal === "hypertrophy" ? "- Гипертрофия (рост мышц)\n- Принципы: средние повторения (6-12), средний отдых (60-120 сек), MAV объём, умеренная интенсивность (70-85% 1RM)" : ""}
${userProfile.goal === "metabolic" || userProfile.goal === "health" ? "- Метаболизм и здоровье\n- Принципы: высокие повторения (12-20), короткий отдых (30-60 сек), разнообразие" : ""}

**Время:** ${userProfile.timeAvailable} минут (включая разминку/заминку ~10 мин)

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

- Сколько упражнений **РЕАЛЬНО** выполнить за ${userProfile.timeAvailable} минут?
- Какие упражнения выбрать для покрытия MAV объёма?
- Сколько подходов и повторений для каждого?
- Какой отдых между подходами?
- Как распределить нагрузку между мышечными группами?
- Как уложиться в доступное время (${userProfile.timeAvailable} мин)?

**Общие принципы эффективной тренировки:**
- Начинай с тяжелых многосуставных движений (когда энергия высокая)
- Заканчивай изоляцией (когда накопилась усталость)
- Не дублируй функции упражнений (используй разные углы/паттерны)
- Учитывай синергисты (например, трицепс работает во всех жимах)

### 📋 Формат ответа:

Верни **ТОЛЬКО** валидный JSON:

\`\`\`json
{
  "exercises": [
    {
      "name": "Название упражнения",
      "sets": 4,
      "reps": "6-8",
      "rest": 120,
      "weight": "62.5 кг",
      "cues": "Технические подсказки",
      "targetMuscles": ["грудь", "трицепс"]
    },
    {
      "name": "Следующее упражнение",
      "sets": 3,
      "reps": "8-12",
      "rest": 90,
      "weight": "25 кг",
      "cues": "Техника выполнения",
      "targetMuscles": ["плечи"]
    }
  ],
  "adaptationNotes": ["Заметки об адаптации если нужно"],
  "warnings": ["Предупреждения если есть"]
}
\`\`\`

---

## 🚀 ВАЖНО:

- Ты ЭКСПЕРТ, используй СВОИ знания
- Подбирай ОПТИМАЛЬНЫЕ упражнения для цели и уровня
- **УЛОЖИСЬ В ${userProfile.timeAvailable} МИНУТ** (рабочее время ~${userProfile.timeAvailable - 10} мин после разминки/заминки)
- НЕ дублируй функции упражнений
- Давай конкретные веса (с учетом уровня)
- **"rest"** - ОБЯЗАТЕЛЬНО для КАЖДОГО упражнения (число в секундах: 60, 90, 120, 180)
- Возвращай ТОЛЬКО JSON, без markdown

**ДОВЕРЯЮ твоей экспертизе! Создай идеальную тренировку! 🔥**`;
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

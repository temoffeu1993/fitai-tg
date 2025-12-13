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
    
    const mappedExercises = result.exercises.map((ex: any) => ({
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      restSec: ex.rest, // Фронтенд ожидает restSec, а не rest
      weight: ex.weight,
      cues: ex.cues || ex.technique || ex.notes || "", // Фронтенд ожидает cues, а не notes
      targetMuscles: ex.targetMuscles || []
    }));
    
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

/**
 * Возвращает научные Volume Landmarks для конкретного фокуса дня
 */
function getVolumeLandmarksText(focus: string, experience: ExperienceLevel): string {
  // Определяем какие мышцы тренируются
  const isPush = focus.toLowerCase().includes('грудь') || focus.toLowerCase().includes('плеч') || focus.toLowerCase().includes('толка');
  const isPull = focus.toLowerCase().includes('спин') || focus.toLowerCase().includes('тяга');
  const isLegs = focus.toLowerCase().includes('ног') || focus.toLowerCase().includes('бедр') || focus.toLowerCase().includes('ягод');
  
  if (isPush) {
    return `
**Для Push Day (грудь, плечи, трицепс):**

Научные объёмы (MAV - Maximum Adaptive Volume):
- **Грудь:** ${experience === 'beginner' ? '10-14' : experience === 'intermediate' ? '12-16' : '12-20'} подходов/неделю
- **Плечи:** ${experience === 'beginner' ? '8-12' : experience === 'intermediate' ? '10-14' : '12-18'} подходов/неделю
- **Трицепс:** ${experience === 'beginner' ? '6-10' : experience === 'intermediate' ? '8-12' : '10-14'} подходов/неделю

*Примечание:* Плечи и трицепс работают синергистами во всех жимах, учитывай это при выборе объёма изоляции.`;
  } else if (isPull) {
    return `
**Для Pull Day (спина, бицепс):**

Научные объёмы (MAV - Maximum Adaptive Volume):
- **Широчайшие:** ${experience === 'beginner' ? '10-14' : experience === 'intermediate' ? '12-16' : '12-20'} подходов/неделю
- **Середина спины:** ${experience === 'beginner' ? '8-12' : experience === 'intermediate' ? '10-14' : '12-18'} подходов/неделю
- **Бицепс:** ${experience === 'beginner' ? '6-10' : experience === 'intermediate' ? '8-12' : '10-14'} подходов/неделю
- **Задние дельты:** ${experience === 'beginner' ? '4-8' : experience === 'intermediate' ? '6-10' : '8-12'} подходов/неделю

*Примечание:* Бицепс работает синергистом во всех тягах, задние дельты тоже.`;
  } else if (isLegs) {
    return `
**Для Legs Day (ноги):**

Научные объёмы (MAV - Maximum Adaptive Volume):
- **Квадрицепсы:** ${experience === 'beginner' ? '12-16' : experience === 'intermediate' ? '14-18' : '15-22'} подходов/неделю
- **Ягодицы:** ${experience === 'beginner' ? '10-14' : experience === 'intermediate' ? '12-16' : '12-20'} подходов/неделю
- **Бицепс бедра:** ${experience === 'beginner' ? '8-12' : experience === 'intermediate' ? '10-14' : '10-16'} подходов/неделю
- **Икры:** ${experience === 'beginner' ? '6-10' : experience === 'intermediate' ? '8-12' : '8-14'} подходов/неделю

*Примечание:* Ноги — самая большая мышечная группа, переносят больший объём.`;
  } else {
    // Для других типов (Upper, Lower, Full Body)
    return `
**Научные объёмы (MAV):**

Для ${experience === 'beginner' ? 'новичка' : experience === 'intermediate' ? 'среднего' : 'продвинутого'} уровня:
- Крупные группы (грудь, спина, ноги): ${experience === 'beginner' ? '10-14' : experience === 'intermediate' ? '12-16' : '12-20'} подходов/неделю
- Средние группы (плечи, бицепс, трицепс): ${experience === 'beginner' ? '6-10' : experience === 'intermediate' ? '8-12' : '10-14'} подходов/неделю
- Малые группы (пресс, икры, предплечья): ${experience === 'beginner' ? '4-8' : experience === 'intermediate' ? '6-10' : '8-12'} подходов/неделю`;
  }
}

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

### 🔬 НАУЧНЫЕ ПРИНЦИПЫ (Volume Landmarks)

Используй концепции тренировочного объёма:
- **MEV** (Minimum Effective Volume): минимум для роста
- **MAV** (Maximum Adaptive Volume): оптимальный диапазон для прогресса
- **MRV** (Maximum Recoverable Volume): потолок восстановления

${getVolumeLandmarksText(rules.focus, userProfile.experience)}

**Важно:** Это НЕДЕЛЬНЫЙ объём для тренировки 1 раз/неделю (${rules.focus}). 
Поскольку эта группа тренируется 1 раз/неделю → весь недельный объём за одну тренировку.

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

- Сколько упражнений нужно для покрытия MAV объёма?
- Какие упражнения выбрать (базовые, вторичные, изоляция)?
- Сколько подходов и повторений для каждого?
- Какой отдых между подходами?
- Как распределить нагрузку между мышечными группами?

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
- Соблюдай баланс между объемом и временем
- НЕ дублируй функции упражнений
- Давай конкретные веса (с учетом уровня)
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
    const totalTime = (setTime + ex.rest) * ex.sets;
    totalMinutes += Math.ceil(totalTime / 60);
  });
  
  return Math.ceil(totalMinutes);
}

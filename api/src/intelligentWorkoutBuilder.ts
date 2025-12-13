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
  console.log(`\n✅ AI сгенерировал тренировку: ${aiWorkout.exercises.length} упражнений, ${totalSets} подходов\n`);
  
  // Формируем финальную тренировку
  const estimatedDuration = calculateDuration(aiWorkout.exercises);
  
  return {
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
    
    const result = JSON.parse(content);
    
    return {
      exercises: result.exercises.map((ex: any) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        weight: ex.weight,
        notes: ex.cues || ex.technique || ex.notes || "",
        targetMuscles: ex.targetMuscles || []
      })),
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

### ✅ Что учесть:

1. **Фокус дня**: ${rules.focus}
   - Выбирай упражнения для этих мышечных групп
   - Распредели нагрузку сбалансированно

2. **Уровень клиента**: ${userProfile.experience}
   ${userProfile.experience === "beginner" ? "- Простые упражнения (тренажеры, базовые движения)\n   - Акцент на технику, а не вес\n   - 4-6 упражнений" : ""}
   ${userProfile.experience === "intermediate" ? "- Умеренно сложные упражнения (гантели, штанги, тренажеры)\n   - Баланс техника/вес\n   - 5-7 упражнений" : ""}
   ${userProfile.experience === "advanced" ? "- Сложные упражнения (свободные веса, продвинутая техника)\n   - Акцент на интенсивность и вес\n   - 6-9 упражнений" : ""}

3. **Цель клиента**: ${userProfile.goal}
   ${userProfile.goal === "strength" ? "- Меньше повторений (3-6), больше отдых (180-240 сек)\n   - Фокус на базовые многосуставные\n   - Высокие веса (80-90% от 1RM)" : ""}
   ${userProfile.goal === "hypertrophy" ? "- Средние повторения (6-12), средний отдых (60-120 сек)\n   - Баланс базовых и изоляции\n   - Умеренные веса (70-85% от 1RM)" : ""}
   ${userProfile.goal === "metabolic" || userProfile.goal === "health" ? "- Больше повторений (12-20), короткий отдых (30-60 сек)\n   - Разнообразие упражнений\n   - Умеренные веса (60-70% от 1RM)" : ""}

4. **Режим тренировки**: ${checkIn?.mode || "normal"}
   ${checkIn?.mode === "recovery" ? "- Снизь объём на 40-50%\n   - Легкие веса (50-60%)\n   - Больше отдых\n   - Меньше упражнений" : ""}
   ${checkIn?.mode === "light" ? "- Снизь объём на 20-30%\n   - Умеренные веса (60-70%)\n   - Стандартный отдых" : ""}
   ${checkIn?.mode === "push" ? "- Увеличь объём на 10-15%\n   - Высокие веса (75-90%)\n   - Можно добавить дроп-сеты/суперсеты" : ""}

5. **Энергия и травмы**:
   ${checkIn?.energy === "low" ? "- Избегай супертяжелых упражнений\n   - Больше изоляции, меньше базовых" : ""}
   ${checkIn?.injuries && checkIn.injuries.length > 0 ? `- ИЗБЕГАЙ упражнений на: ${checkIn.injuries.join(", ")}` : ""}
   ${checkIn?.pain && checkIn.pain.length > 0 ? `- Будь осторожен с зонами: ${checkIn.pain.join(", ")}` : ""}

6. **Разнообразие**:
   ${history?.recentExercises && history.recentExercises.length > 0 ? `- НЕ повторяй эти упражнения: ${history.recentExercises.join(", ")}` : "- Выбирай классические эффективные упражнения"}

7. **Время**:
   - Уложись в ${userProfile.timeAvailable} минут (включая разминку 5 мин + заминку 5 мин)
   - Рабочее время: ~${userProfile.timeAvailable - 10} минут

### 🎯 Структура тренировки:

1. **Начинай с базовых** (многосуставных) упражнений
2. **Переходи к вторичным** (акцентированные движения)
3. **Заканчивай изоляцией** (односуставные)

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

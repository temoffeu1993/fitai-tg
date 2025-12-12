// Новая упрощенная генерация тренировок на основе templates
// ============================================================================

import OpenAI from "openai";
import { config } from "./config.js";
import { DayTemplate, MOVEMENT_PATTERNS_DB, MovementPattern } from "./workoutTemplates.js";
import { analyzeCheckIn, adaptDayTemplate, CheckInData, CheckInAnalysis } from "./checkInAdapter.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey! });

// ============================================================================
// TYPES
// ============================================================================

export type Exercise = {
  name: string;                    // Название упражнения
  movementPattern: MovementPattern; // Тип движения
  sets: number;                    // Подходы
  reps: string;                    // Повторения (диапазон)
  rest: number;                    // Отдых в секундах
  weight?: string;                 // Рекомендуемый вес
  targetMuscles: string[];         // Целевые мышцы
  intensity: string;               // Интенсивность
  tempo?: string;                  // Темп
  cues: string;                    // Подсказки по технике
  notes?: string;                  // Дополнительные заметки
};

export type GeneratedWorkout = {
  title: string;                   // Название тренировки
  dayLabel: string;                // Метка дня (Push A, Full Body и т.п.)
  focus: string;                   // Фокус дня
  mode: string;                    // Режим (normal/light/recovery)
  warmup: {
    duration: number;
    guidelines: string;
  };
  exercises: Exercise[];
  cooldown: {
    duration: number;
    guidelines: string;
  };
  totalExercises: number;
  totalSets: number;
  estimatedDuration: number;
  adaptationNotes?: string;        // Заметки об адаптации
  warnings?: string[];             // Предупреждения
};

type WorkoutHistory = {
  recentExercises: string[];       // Последние упражнения (для избегания повторов)
  weightHistory: Record<string, string>; // История весов по упражнениям
};

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ
// ============================================================================

/**
 * Генерирует тренировку на основе шаблона дня и чекина
 * 
 * ШАГ 1: Анализ чекина и адаптация template
 * ШАГ 2: AI подбирает конкретные упражнения из базы движений
 */
export async function generateWorkoutFromTemplate(params: {
  dayTemplate: DayTemplate;
  dayLabel: string;
  dayFocus: string;
  checkIn?: CheckInData;
  history: WorkoutHistory;
  userProfile: {
    experience: ExperienceLevel;
    injuries?: string[];
    preferences?: string[];
  };
}): Promise<GeneratedWorkout> {
  
  const { dayTemplate, dayLabel, dayFocus, checkIn, history, userProfile } = params;
  
  console.log("\n🎯 ГЕНЕРАЦИЯ ТРЕНИРОВКИ (НОВЫЙ ПОДХОД)");
  console.log(`Day: ${dayLabel} - ${dayFocus}`);
  console.log(`Template: ${dayTemplate.totalExercises} упражнений, ${dayTemplate.totalSets} подходов`);
  
  // ========== ШАГ 1: АНАЛИЗ ЧЕКИНА И АДАПТАЦИЯ ==========
  
  let analysis: CheckInAnalysis | null = null;
  let adaptedTemplate = dayTemplate;
  
  if (checkIn) {
    console.log("\n📋 Анализ чекина...");
    analysis = analyzeCheckIn(checkIn, dayTemplate);
    console.log(`✓ Режим: ${analysis.mode.toUpperCase()}`);
    console.log(`✓ Рекомендация: ${analysis.recommendation}`);
    
    if (analysis.shouldSkip) {
      return {
        title: "Отдых",
        dayLabel,
        focus: dayFocus,
        mode: "skip",
        warmup: { duration: 0, guidelines: "" },
        exercises: [],
        cooldown: { duration: 0, guidelines: "" },
        totalExercises: 0,
        totalSets: 0,
        estimatedDuration: 0,
        adaptationNotes: analysis.recommendation,
        warnings: analysis.warnings
      };
    }
    
    if (analysis.shouldSwitchDay) {
      console.log("⚠️  Рекомендуется переключить день тренировки");
      // TODO: переключение на fallbackFocus
    }
    
    // Адаптируем template
    adaptedTemplate = adaptDayTemplate(dayTemplate, analysis);
    console.log(`✓ Template адаптирован: ${adaptedTemplate.totalExercises} упражнений, ${adaptedTemplate.totalSets} подходов`);
    
    if (analysis.warnings.length > 0) {
      console.log(`⚠️  Предупреждения: ${analysis.warnings.join(", ")}`);
    }
  }
  
  // ========== ШАГ 2: AI ПОДБИРАЕТ УПРАЖНЕНИЯ ==========
  
  console.log("\n🤖 AI подбор упражнений...");
  
  const exercises = await selectExercisesWithAI({
    template: adaptedTemplate,
    history,
    userProfile,
    analysis
  });
  
  console.log(`✓ Упражнения подобраны: ${exercises.length} шт.`);
  
  // ========== ФИНАЛЬНАЯ СБОРКА ==========
  
  const totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);
  
  return {
    title: `${dayLabel}`,
    dayLabel,
    focus: dayFocus,
    mode: analysis?.mode || "normal",
    warmup: adaptedTemplate.warmup,
    exercises,
    cooldown: adaptedTemplate.cooldown,
    totalExercises: exercises.length,
    totalSets,
    estimatedDuration: adaptedTemplate.estimatedDuration,
    adaptationNotes: analysis?.recommendation,
    warnings: analysis?.warnings
  };
}

// ============================================================================
// AI SELECTION
// ============================================================================

/**
 * AI подбирает конкретные упражнения из базы движений
 */
async function selectExercisesWithAI(params: {
  template: DayTemplate;
  history: WorkoutHistory;
  userProfile: {
    experience: ExperienceLevel;
    injuries?: string[];
    preferences?: string[];
  };
  analysis: CheckInAnalysis | null;
}): Promise<Exercise[]> {
  
  const { template, history, userProfile, analysis } = params;
  
  // Строим промпт
  const prompt = buildExerciseSelectionPrompt(template, history, userProfile, analysis);
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Ты профессиональный тренер. Твоя задача - подобрать конкретные упражнения из доступной базы для структурированной тренировки.

ВАЖНО:
- Выбирай упражнения ТОЛЬКО из предоставленной базы движений
- Не повторяй упражнения из последних 2 тренировок
- Учитывай опыт клиента (для новичков проще упражнения)
- Подбирай веса на основе истории (если есть)
- Учитывай травмы и ограничения
- Давай технические подсказки (cues) для каждого упражнения

Возвращай ТОЛЬКО валидный JSON, без дополнительного текста.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("AI не вернул ответ");
    }
    
    const result = JSON.parse(content);
    
    if (!result.exercises || !Array.isArray(result.exercises)) {
      throw new Error("AI вернул некорректный формат (нет массива exercises)");
    }
    
    // Преобразуем в наш формат
    const exercises: Exercise[] = result.exercises.map((ex: any, idx: number) => {
      const block = template.exerciseBlocks[idx];
      if (!block) {
        throw new Error(`AI вернул больше упражнений чем блоков в template`);
      }
      
      return {
        name: ex.name,
        movementPattern: block.movementPattern,
        sets: block.sets,
        reps: block.reps,
        rest: block.rest,
        weight: ex.weight || undefined,
        targetMuscles: block.targetMuscles,
        intensity: block.intensity,
        tempo: block.tempo,
        cues: ex.cues || ex.technique || "",
        notes: block.notes
      };
    });
    
    return exercises;
    
  } catch (error) {
    console.error("❌ Ошибка AI подбора упражнений:", error);
    
    // Fallback: простой подбор без AI
    console.log("⚠️  Используем fallback - простой подбор без AI");
    return selectExercisesFallback(template, history);
  }
}

/**
 * Строит промпт для AI подбора упражнений
 */
function buildExerciseSelectionPrompt(
  template: DayTemplate,
  history: WorkoutHistory,
  userProfile: any,
  analysis: CheckInAnalysis | null
): string {
  
  // Создаем список доступных упражнений для каждого блока
  const blocksInfo = template.exerciseBlocks.map((block, idx) => {
    const availableExercises = MOVEMENT_PATTERNS_DB[block.movementPattern] || [];
    
    return {
      blockIndex: idx + 1,
      name: block.name,
      movementPattern: block.movementPattern,
      targetMuscles: block.targetMuscles.join(", "),
      exerciseType: block.exerciseType,
      sets: block.sets,
      reps: block.reps,
      rest: block.rest,
      intensity: block.intensity,
      notes: block.notes,
      availableExercises
    };
  });
  
  return `
# ЗАДАЧА
Подбери конкретные упражнения для тренировки по заданной структуре.

# СТРУКТУРА ТРЕНИРОВКИ
${JSON.stringify(blocksInfo, null, 2)}

# ИСТОРИЯ ПОСЛЕДНИХ ТРЕНИРОВОК
Недавние упражнения (НЕ ПОВТОРЯТЬ):
${history.recentExercises.slice(0, 15).join("\n")}

История весов:
${JSON.stringify(history.weightHistory, null, 2)}

# ПРОФИЛЬ КЛИЕНТА
- Опыт: ${userProfile.experience}
- Травмы: ${userProfile.injuries?.join(", ") || "нет"}
- Предпочтения: ${userProfile.preferences?.join(", ") || "нет"}

${analysis ? `# АДАПТАЦИЯ ПОД ЧЕКИН
- Режим: ${analysis.mode}
- Избегать зон: ${analysis.excludedZones.join(", ") || "нет"}
- Избегать движений: ${analysis.avoidExercises.join(", ") || "нет"}
- Заметки: ${analysis.recommendation}
` : ""}

# ПРАВИЛА ПОДБОРА
1. Для КАЖДОГО блока выбери ОДНО упражнение из списка доступных
2. НЕ повторяй упражнения из последних 2 тренировок
3. Для новичков (beginner): предпочитай машины и гантели вместо штанги
4. Для intermediate/advanced: можно свободные веса
5. При травмах: избегай проблемных движений
6. Подбери веса на основе истории (если есть), иначе дай рекомендацию
7. Для каждого упражнения дай 1-2 коротких технических подсказки (cues)

# ФОРМАТ ОТВЕТА
Верни JSON в точности таком формате:

{
  "exercises": [
    {
      "blockIndex": 1,
      "name": "Жим лёжа",
      "weight": "60 кг",
      "cues": "Лопатки сведены, ноги в пол, локти под 45°",
      "reasoning": "Главное базовое, есть история с этим весом"
    },
    {
      "blockIndex": 2,
      "name": "Жим гантелей на наклонной 30°",
      "weight": "2×20 кг",
      "cues": "Полная амплитуда, контролируй негативную фазу",
      "reasoning": "Верх груди, безопасно для плеч"
    }
  ]
}

ВАЖНО: Возвращай ТОЛЬКО JSON, без дополнительного текста или markdown форматирования!
`.trim();
}

/**
 * Fallback: простой подбор без AI
 */
function selectExercisesFallback(
  template: DayTemplate,
  history: WorkoutHistory
): Exercise[] {
  
  const recentSet = new Set(history.recentExercises.map(e => e.toLowerCase()));
  
  return template.exerciseBlocks.map(block => {
    const availableExercises = MOVEMENT_PATTERNS_DB[block.movementPattern] || [];
    
    // Выбираем первое упражнение, которого не было недавно
    let selectedExercise = availableExercises[0];
    for (const ex of availableExercises) {
      if (!recentSet.has(ex.name.toLowerCase())) {
        selectedExercise = ex;
        break;
      }
    }
    
    const historicalWeight = history.weightHistory[selectedExercise.name];
    
    return {
      name: selectedExercise.name,
      movementPattern: block.movementPattern,
      sets: block.sets,
      reps: block.reps,
      rest: block.rest,
      weight: historicalWeight,
      targetMuscles: block.targetMuscles,
      intensity: block.intensity,
      tempo: block.tempo,
      cues: "Техника, контроль, дыхание",
      notes: block.notes
    };
  });
}


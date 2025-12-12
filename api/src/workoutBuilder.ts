// Сборка конкретной тренировки из гибких правил + профиль пользователя
// ============================================================================

import OpenAI from "openai";
import { config } from "./config.js";
import { DayTemplateRules, ExerciseBlockRule } from "./flexibleTemplates.js";
import { 
  generateWorkoutRules, 
  WorkoutRules,
  ExperienceLevel, 
  TrainingGoal,
  ExerciseBlockAllocation
} from "./trainingRulesEngine.js";
import { CheckInData, CheckInAnalysis, analyzeCheckIn } from "./checkInAdapter.js";
import { DayTemplate, ExerciseBlock, MOVEMENT_PATTERNS_DB } from "./workoutTemplates.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey! });

// ============================================================================
// ТИПЫ
// ============================================================================

export type UserProfile = {
  experience: ExperienceLevel;
  goal: TrainingGoal;
  timeAvailable: number;      // Минуты
  daysPerWeek: number;
  injuries?: string[];
  preferences?: string[];
};

export type ConcreteWorkoutPlan = {
  title: string;
  focus: string;
  mode: "skip" | "recovery" | "light" | "normal" | "push";
  
  warmup: {
    duration: number;           // Минуты
    guidelines: string;
  };
  
  exercises: ConcreteExercise[];
  
  cooldown: {
    duration: number;
    guidelines: string;
  };
  
  totalExercises: number;
  totalSets: number;
  estimatedDuration: number;
  
  scientificNotes: string[];    // Научное обоснование
  adaptationNotes?: string[];   // Заметки об адаптации
  warnings?: string[];          // Предупреждения
};

export type ConcreteExercise = {
  priority: number;
  role: string;
  name: string;                 // Конкретное упражнение (подобрано AI)
  movementPattern: string;
  targetMuscles: string[];
  sets: number;
  reps: string;
  rest: number;
  notes?: string;
  weight?: string;              // Рекомендуемый вес (подобран AI на основе истории)
};

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ: СБОРКА ТРЕНИРОВКИ
// ============================================================================

/**
 * Собирает конкретный план тренировки из гибких правил
 * 
 * Алгоритм:
 * 1. Анализирует чекин (если есть) → режим тренировки
 * 2. Применяет научные формулы → целевой объем
 * 3. Фильтрует блоки по приоритетам → подходящие упражнения
 * 4. AI подбирает конкретные упражнения (с учётом истории, травм, прогресса)
 * 5. Возвращает готовый план
 */
export async function buildWorkoutFromRules(params: {
  templateRules: DayTemplateRules;
  userProfile: UserProfile;
  checkIn?: CheckInData;
  history?: {
    recentExercises: string[];
    weightHistory: Record<string, string>;
  };
}): Promise<ConcreteWorkoutPlan> {
  
  const { templateRules, userProfile, checkIn, history } = params;
  
  console.log("\n🏗️  СБОРКА ТРЕНИРОВКИ ИЗ НАУЧНЫХ ПРАВИЛ");
  console.log(`Template: ${templateRules.name}`);
  console.log(`Профиль: ${userProfile.experience}, ${userProfile.goal}, ${userProfile.timeAvailable} мин`);
  
  // ========== ШАГ 1: АНАЛИЗ ЧЕКИНА ==========
  
  let checkInAnalysis: CheckInAnalysis | null = null;
  let mode: "skip" | "recovery" | "light" | "normal" | "push" = "normal";
  
  if (checkIn) {
    console.log("\n📋 Анализ чекина...");
    // Создаем временный DayTemplate для анализа чекина (нужен для adaptationRules)
    const tempTemplate = convertRulesToTemplate(templateRules, userProfile);
    checkInAnalysis = analyzeCheckIn(checkIn, tempTemplate);
    mode = checkInAnalysis.mode as any;
    
    console.log(`✓ Режим: ${mode.toUpperCase()}`);
    console.log(`✓ Рекомендация: ${checkInAnalysis.recommendation}`);
    
    if (checkInAnalysis.shouldSkip) {
      return {
        title: templateRules.name,
        focus: templateRules.focus,
        mode: "skip",
        warmup: { duration: 0, guidelines: "" },
        exercises: [],
        cooldown: { duration: 0, guidelines: "" },
        totalExercises: 0,
        totalSets: 0,
        estimatedDuration: 0,
        scientificNotes: [],
        adaptationNotes: [checkInAnalysis.recommendation],
        warnings: checkInAnalysis.warnings
      };
    }
  }
  
  // ========== ШАГ 2: НАУЧНЫЕ РАСЧЕТЫ ==========
  
  console.log("\n🔬 Применение научных формул...");
  
  // Корректируем время под режим чекина
  let adjustedTime = userProfile.timeAvailable;
  if (checkInAnalysis && mode !== "skip") {
    // recovery/light режим = меньше времени нужно
    const timeMultipliers: Record<"recovery" | "light" | "normal" | "push", number> = {
      recovery: 0.6,
      light: 0.75,
      normal: 1.0,
      push: 1.1
    };
    adjustedTime = Math.round(userProfile.timeAvailable * timeMultipliers[mode]);
  }
  
  const workoutRules: WorkoutRules = generateWorkoutRules({
    experience: userProfile.experience,
    goal: userProfile.goal,
    timeAvailable: adjustedTime,
    daysPerWeek: userProfile.daysPerWeek
  });
  
  console.log(`✓ Целевой объем: ${workoutRules.totalSets} подходов`);
  console.log(`✓ Макс упражнений: ${workoutRules.maxExercises}`);
  console.log(`✓ Диапазон повторений: ${workoutRules.goalParameters.repsRange[0]}-${workoutRules.goalParameters.repsRange[1]}`);
  
  // ========== ШАГ 3: ФИЛЬТРАЦИЯ БЛОКОВ ==========
  
  console.log("\n🔍 Фильтрация блоков упражнений...");
  
  const filteredBlocks = filterExerciseBlocks({
    blocks: templateRules.exerciseBlocks,
    maxExercises: workoutRules.maxExercises,
    timeAvailable: adjustedTime,
    userProfile,
    checkInAnalysis
  });
  
  console.log(`✓ Отобрано блоков: ${filteredBlocks.length}`);
  
  // ========== ШАГ 4: РАСПРЕДЕЛЕНИЕ ОБЪЕМА ==========
  
  console.log("\n📊 Распределение объема между упражнениями...");
  
  const concreteExercises = await selectExercisesWithAI({
    blocks: filteredBlocks,
    allocations: workoutRules.exerciseAllocations,
    goalParameters: workoutRules.goalParameters,
    checkInAnalysis,
    userProfile,
    history: history || { recentExercises: [], weightHistory: {} }
  });
  
  console.log(`✓ Сгенерировано упражнений: ${concreteExercises.length}`);
  
  // ========== ШАГ 5: РАЗМИНКА/ЗАМИНКА ==========
  
  const warmupDuration = Math.max(
    templateRules.warmup.minMinutes,
    Math.min(
      workoutRules.warmupMinutes,
      templateRules.warmup.maxMinutes
    )
  );
  
  const cooldownDuration = Math.max(
    templateRules.cooldown.minMinutes,
    Math.min(
      workoutRules.cooldownMinutes,
      templateRules.cooldown.maxMinutes
    )
  );
  
  // ========== ФИНАЛЬНАЯ СБОРКА ==========
  
  const totalSets = concreteExercises.reduce((sum, ex) => sum + ex.sets, 0);
  
  const plan: ConcreteWorkoutPlan = {
    title: templateRules.name,
    focus: templateRules.focus,
    mode,
    
    warmup: {
      duration: warmupDuration,
      guidelines: templateRules.warmup.guidelines
    },
    
    exercises: concreteExercises,
    
    cooldown: {
      duration: cooldownDuration,
      guidelines: templateRules.cooldown.guidelines
    },
    
    totalExercises: concreteExercises.length,
    totalSets,
    estimatedDuration: warmupDuration + workoutRules.estimatedDuration + cooldownDuration,
    
    scientificNotes: workoutRules.notes,
    adaptationNotes: checkInAnalysis ? [checkInAnalysis.recommendation] : undefined,
    warnings: checkInAnalysis?.warnings
  };
  
  console.log("\n✅ Тренировка собрана!");
  console.log(`   ${plan.totalExercises} упражнений, ${plan.totalSets} подходов, ~${plan.estimatedDuration} минут`);
  
  return plan;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Фильтрует блоки упражнений по приоритетам и условиям пропуска
 */
function filterExerciseBlocks(params: {
  blocks: ExerciseBlockRule[];
  maxExercises: number;
  timeAvailable: number;
  userProfile: UserProfile;
  checkInAnalysis: CheckInAnalysis | null;
}): ExerciseBlockRule[] {
  
  const { blocks, maxExercises, timeAvailable, userProfile, checkInAnalysis } = params;
  
  const filtered: ExerciseBlockRule[] = [];
  
  for (const block of blocks.sort((a, b) => a.priority - b.priority)) {
    
    // Проверяем условия пропуска
    if (block.canSkipIf) {
      // Пропускаем если мало времени
      if (block.canSkipIf.timeMinutes && timeAvailable < block.canSkipIf.timeMinutes) {
        console.log(`  ⏭️  Пропущен блок "${block.name}" (мало времени: ${timeAvailable} < ${block.canSkipIf.timeMinutes})`);
        continue;
      }
      
      // Пропускаем для определенных уровней опыта
      if (block.canSkipIf.experience && block.canSkipIf.experience.includes(userProfile.experience)) {
        console.log(`  ⏭️  Пропущен блок "${block.name}" (опыт: ${userProfile.experience})`);
        continue;
      }
      
      // Пропускаем для определенных целей
      if (block.canSkipIf.goals && block.canSkipIf.goals.includes(userProfile.goal)) {
        console.log(`  ⏭️  Пропущен блок "${block.name}" (цель: ${userProfile.goal})`);
        continue;
      }
    }
    
    // Проверяем исключения по чекину
    if (checkInAnalysis) {
      // Если паттерн движения в списке избегаемых
      if (checkInAnalysis.avoidExercises.includes(block.movementPattern)) {
        // Проверяем альтернативы
        if (block.alternatives) {
          const safeAlternative = block.alternatives.find(
            alt => !checkInAnalysis.avoidExercises.includes(alt)
          );
          if (safeAlternative) {
            console.log(`  🔄 Блок "${block.name}" заменен на альтернативу (${safeAlternative})`);
            filtered.push({
              ...block,
              movementPattern: safeAlternative
            });
            continue;
          }
        }
        console.log(`  ⛔ Пропущен блок "${block.name}" (нельзя по чекину)`);
        continue;
      }
      
      // Если целевые мышцы в исключенных зонах
      const touchesExcludedZone = block.targetMuscles.some(muscle =>
        checkInAnalysis.excludedZones.some(zone => 
          muscle.toLowerCase().includes(zone.toLowerCase())
        )
      );
      
      if (touchesExcludedZone) {
        console.log(`  ⛔ Пропущен блок "${block.name}" (исключенная зона)`);
        continue;
      }
    }
    
    // Блок прошел все проверки
    filtered.push(block);
    
    // Достигли максимума
    if (filtered.length >= maxExercises) {
      break;
    }
  }
  
  return filtered;
}

/**
 * AI подбирает конкретные упражнения с учётом истории, травм и научных параметров
 */
async function selectExercisesWithAI(params: {
  blocks: ExerciseBlockRule[];
  allocations: ExerciseBlockAllocation[];
  goalParameters: any;
  checkInAnalysis: CheckInAnalysis | null;
  userProfile: UserProfile;
  history: {
    recentExercises: string[];
    weightHistory: Record<string, string>;
  };
}): Promise<ConcreteExercise[]> {
  
  const { blocks, allocations, goalParameters, checkInAnalysis, userProfile, history } = params;
  
  console.log("\n🤖 AI подбор упражнений (профессиональный подход)...");
  
  // Собираем информацию для каждого блока
  const blocksInfo = blocks.map((block, idx) => {
    const allocation = allocations[idx];
    if (!allocation) return null;
    
    // Применяем адаптацию чекина
    let sets = allocation.sets;
    let reps = allocation.reps;
    let rest = allocation.rest;
    
    if (checkInAnalysis && checkInAnalysis.mode !== "normal") {
      sets = Math.max(1, Math.round(sets * checkInAnalysis.volumeMultiplier));
      rest = Math.round(rest * checkInAnalysis.restMultiplier);
    }
    
    // Список доступных упражнений из базы движений
    const availableExercises = MOVEMENT_PATTERNS_DB[block.movementPattern] || [];
    
    return {
      blockIndex: idx + 1,
      role: block.role,
      name: block.name,
      movementPattern: block.movementPattern,
      targetMuscles: block.targetMuscles,
      sets,
      reps,
      rest,
      notes: block.notes,
      availableExercises: availableExercises.slice(0, 15), // Ограничим для промпта
      priority: block.priority
    };
  }).filter(Boolean);
  
  // Строим промпт
  const prompt = buildProfessionalPrompt(blocksInfo, userProfile, history, checkInAnalysis);
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Ты элитный персональный тренер с 15+ годами опыта работы с профессиональными спортсменами и обычными людьми.

ТВОЯ ЗАДАЧА: Подобрать конкретные упражнения для научно обоснованной тренировки.

ПРИНЦИПЫ РАБОТЫ:
1. ПРОФЕССИОНАЛИЗМ: Это реальная тренировка, а не щадящая зарядка. Нагрузка должна быть адекватной целям.
2. ПЕРСОНАЛИЗАЦИЯ: Учитывай историю, прогресс, травмы, текущее состояние.
3. РАЗНООБРАЗИЕ: Не повторяй упражнения из последних 2-3 тренировок.
4. ПРОГРЕССИЯ: Постепенно усложняй нагрузку (больше вес, сложнее упражнения).
5. БЕЗОПАСНОСТЬ: Учитывай травмы и ограничения, но не делай тренировку бесполезной.
6. НАУЧНОСТЬ: Подбирай веса на основе истории, давай конкретные технические указания.

ВАЖНО:
- Выбирай упражнения ТОЛЬКО из предоставленного списка доступных
- Для каждого упражнения дай 1-2 ключевых технических момента (cues)
- Подбери вес на основе истории (если есть) или дай рекомендацию
- Не бойся давать нагрузку - люди приходят за результатом, а не за имитацией

Возвращай ТОЛЬКО валидный JSON, без markdown и пояснений.`
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
      throw new Error("AI вернул некорректный формат");
    }
    
    // Преобразуем в наш формат
    const exercises: ConcreteExercise[] = result.exercises.map((ex: any) => {
      const blockInfo = blocksInfo.find((b: any) => b.blockIndex === ex.blockIndex);
      if (!blockInfo) {
        throw new Error(`AI вернул блок ${ex.blockIndex}, которого нет в списке`);
      }
      
      console.log(`  ✓ Блок ${ex.blockIndex} "${blockInfo.name}" → "${ex.name}" (${ex.weight || 'без веса'})`);
      
      return {
        priority: blockInfo.priority,
        role: blockInfo.role,
        name: ex.name,
        movementPattern: blockInfo.movementPattern,
        targetMuscles: blockInfo.targetMuscles,
        sets: blockInfo.sets,
        reps: blockInfo.reps,
        rest: blockInfo.rest,
        notes: ex.cues || ex.technique || blockInfo.notes,
        weight: ex.weight
      };
    });
    
    return exercises;
    
  } catch (error) {
    console.error("❌ Ошибка AI подбора:", error);
    console.log("⚠️  Используем fallback - простой подбор");
    
    // Fallback: простой подбор первых доступных упражнений
    return blocksInfo.map((blockInfo: any) => ({
      priority: blockInfo.priority,
      role: blockInfo.role,
      name: blockInfo.availableExercises[0] || `Упражнение на ${blockInfo.movementPattern}`,
      movementPattern: blockInfo.movementPattern,
      targetMuscles: blockInfo.targetMuscles,
      sets: blockInfo.sets,
      reps: blockInfo.reps,
      rest: blockInfo.rest,
      notes: blockInfo.notes
    }));
  }
}

/**
 * Строит профессиональный промпт для AI с учётом всех данных
 */
function buildProfessionalPrompt(
  blocksInfo: any[],
  userProfile: UserProfile,
  history: { recentExercises: string[]; weightHistory: Record<string, string> },
  checkInAnalysis: CheckInAnalysis | null
): string {
  
  return `
# СТРУКТУРА ТРЕНИРОВКИ

${blocksInfo.map(b => `
## БЛОК ${b.blockIndex}: ${b.name}
- Роль: ${b.role} (приоритет ${b.priority})
- Паттерн движения: ${b.movementPattern}
- Целевые мышцы: ${b.targetMuscles.join(", ")}
- Параметры: ${b.sets} подходов × ${b.reps} повторений, отдых ${b.rest} сек
- Заметки тренера: ${b.notes || "нет"}

ДОСТУПНЫЕ УПРАЖНЕНИЯ:
${b.availableExercises.map((ex: string, idx: number) => `${idx + 1}. ${ex}`).join("\n")}
`).join("\n")}

---

# ПРОФИЛЬ КЛИЕНТА

- Уровень: ${userProfile.experience} (beginner/intermediate/advanced)
- Цель: ${userProfile.goal}
- Время на тренировку: ${userProfile.timeAvailable} минут
- Частота тренировок: ${userProfile.daysPerWeek} раз/нед
${userProfile.injuries?.length ? `- ⚠️ ТРАВМЫ/ОГРАНИЧЕНИЯ: ${userProfile.injuries.join(", ")}` : "- Травм нет"}
${userProfile.preferences?.length ? `- Предпочтения: ${userProfile.preferences.join(", ")}` : ""}

---

# ИСТОРИЯ ТРЕНИРОВОК

## Недавние упражнения (НЕ ПОВТОРЯТЬ!):
${history.recentExercises.length > 0 
  ? history.recentExercises.slice(0, 15).map((ex, i) => `${i + 1}. ${ex}`).join("\n")
  : "История пуста - первая тренировка"
}

## История весов:
${Object.keys(history.weightHistory).length > 0
  ? Object.entries(history.weightHistory)
      .slice(0, 10)
      .map(([ex, weight]) => `- ${ex}: ${weight}`)
      .join("\n")
  : "Весов в истории нет - подбери стартовые рекомендации"
}

---

${checkInAnalysis ? `
# АДАПТАЦИЯ ПОД ЧЕКИН

- Режим: ${checkInAnalysis.mode.toUpperCase()} (normal/light/recovery/push)
${checkInAnalysis.mode === "recovery" ? `
  ⚠️ ВОССТАНОВИТЕЛЬНЫЙ РЕЖИМ:
  - Снижен объём на 50%
  - Снижена интенсивность
  - Увеличен отдых
  - ВАЖНО: Тренировка должна быть ЛЁГКОЙ, но не бесполезной
` : checkInAnalysis.mode === "light" ? `
  ⚠️ ОБЛЕГЧЁННЫЙ РЕЖИМ:
  - Снижен объём на 30%
  - Немного снижена интенсивность
  - Фокус на технику и контроль
` : checkInAnalysis.mode === "push" ? `
  💪 УСИЛЕННЫЙ РЕЖИМ:
  - Отличное состояние клиента
  - Можно дать немного больше нагрузки
  - Время попробовать что-то новое или увеличить вес
` : ""}

${checkInAnalysis.excludedZones.length > 0 ? `- ⛔ ИСКЛЮЧИТЬ ЗОНЫ: ${checkInAnalysis.excludedZones.join(", ")}` : ""}
${checkInAnalysis.avoidExercises.length > 0 ? `- ⛔ ИЗБЕГАТЬ ДВИЖЕНИЙ: ${checkInAnalysis.avoidExercises.join(", ")}` : ""}
${checkInAnalysis.warnings.length > 0 ? `- ⚠️ ПРЕДУПРЕЖДЕНИЯ:\n${checkInAnalysis.warnings.map(w => `  - ${w}`).join("\n")}` : ""}

Рекомендация: ${checkInAnalysis.recommendation}
` : "Чекин не пройден - стандартная нагрузка"}

---

# ЗАДАЧА

Для КАЖДОГО блока подбери ОДНО конкретное упражнение из списка доступных.

## ПРАВИЛА ПОДБОРА:

1. **РАЗНООБРАЗИЕ**: Не повторяй упражнения из последних 2-3 тренировок
2. **ПРОГРЕССИЯ**: 
   - Если есть история с весом → предложи тот же вес или чуть больше (+2.5-5кг)
   - Если истории нет → дай рекомендацию стартового веса
3. **БЕЗОПАСНОСТЬ**: 
   - Учитывай травмы и исключенные зоны
   - Для новичков (beginner): проще упражнения (машины, гантели)
   - Для intermediate/advanced: свободные веса приветствуются
4. **ПРОФЕССИОНАЛИЗМ**: 
   - Это не щадящая зарядка - нагрузка должна быть ощутимой
   - Восстановительный режим ≠ бесполезная тренировка
   - Даже в light режиме упражнения должны быть эффективными
5. **ТЕХНИКА**: 
   - Для каждого упражнения дай 1-2 ключевых технических момента
   - Будь конкретным: "лопатки сведены", "локти под 45°", а не "следи за техникой"

---

# ФОРМАТ ОТВЕТА

Верни JSON в точно таком формате:

{
  "exercises": [
    {
      "blockIndex": 1,
      "name": "Жим штанги лёжа",
      "weight": "60 кг",
      "cues": "Лопатки сведены и прижаты, ноги упираются в пол, локти под 45° к корпусу",
      "reasoning": "Есть история 57.5 кг → можно +2.5 кг"
    },
    {
      "blockIndex": 2,
      "name": "Жим гантелей на наклонной 30°",
      "weight": "2×20 кг",
      "cues": "Полная амплитуда, контролируй негативную фазу (3 сек вниз)",
      "reasoning": "Верх груди, не было в последних тренировках"
    }
  ]
}

**ВАЖНО**: 
- Возвращай ТОЛЬКО JSON
- Количество exercises = ${blocksInfo.length} (по одному на каждый блок)
- blockIndex должен совпадать с номерами блоков выше
- НЕ добавляй markdown форматирование
`.trim();
}

/**
 * Конвертирует гибкие правила во временный жесткий template
 * (для совместимости с analyzeCheckIn)
 */
function convertRulesToTemplate(rules: DayTemplateRules, profile: UserProfile): DayTemplate {
  
  // Используем средние значения для temporary template
  const blocks: ExerciseBlock[] = rules.exerciseBlocks
    .filter(b => !b.canSkipIf) // Только обязательные
    .slice(0, 3) // Первые 3 для анализа
    .map(b => ({
      name: b.name,
      movementPattern: b.movementPattern,
      targetMuscles: b.targetMuscles,
      exerciseType: b.role === "main_lift" || b.role === "secondary" ? "compound" : "isolation",
      sets: 3,
      reps: "8-12",
      rest: 90,
      intensity: "moderate" as const,
      notes: b.notes
    }));
  
  return {
    warmup: {
      duration: rules.warmup.minMinutes,
      guidelines: rules.warmup.guidelines
    },
    exerciseBlocks: blocks,
    cooldown: {
      duration: rules.cooldown.minMinutes,
      guidelines: rules.cooldown.guidelines
    },
    totalExercises: blocks.length,
    totalSets: blocks.length * 3,
    estimatedDuration: profile.timeAvailable,
    trainingStyle: {
      tempo: "controlled",
      circuit: false
    },
    adaptationRules: rules.adaptationRules
  };
}


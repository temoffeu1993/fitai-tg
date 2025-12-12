// Сборка конкретной тренировки из гибких правил + профиль пользователя
// ============================================================================

import { DayTemplateRules, ExerciseBlockRule } from "./flexibleTemplates.js";
import { 
  generateWorkoutRules, 
  WorkoutRules,
  ExperienceLevel, 
  TrainingGoal,
  ExerciseBlockAllocation
} from "./trainingRulesEngine.js";
import { CheckInData, CheckInAnalysis, analyzeCheckIn } from "./checkInAdapter.js";
import { DayTemplate, ExerciseBlock } from "./workoutTemplates.js";

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
  name: string;                 // Название блока (будет заменено AI на конкретное упражнение)
  movementPattern: string;
  targetMuscles: string[];
  sets: number;
  reps: string;
  rest: number;
  notes?: string;
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
 * 4. Распределяет объем → конкретные подходы/повторения
 * 5. Возвращает готовый план
 */
export function buildWorkoutFromRules(params: {
  templateRules: DayTemplateRules;
  userProfile: UserProfile;
  checkIn?: CheckInData;
}): ConcreteWorkoutPlan {
  
  const { templateRules, userProfile, checkIn } = params;
  
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
  
  const concreteExercises = distributeVolumeToBlocks({
    blocks: filteredBlocks,
    allocations: workoutRules.exerciseAllocations,
    goalParameters: workoutRules.goalParameters,
    checkInAnalysis
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
 * Распределяет объем (подходы, повторения, отдых) между блоками
 */
function distributeVolumeToBlocks(params: {
  blocks: ExerciseBlockRule[];
  allocations: ExerciseBlockAllocation[];
  goalParameters: any;
  checkInAnalysis: CheckInAnalysis | null;
}): ConcreteExercise[] {
  
  const { blocks, allocations, goalParameters, checkInAnalysis } = params;
  
  const exercises: ConcreteExercise[] = [];
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const allocation = allocations[i];
    
    if (!allocation) {
      console.warn(`  ⚠️  Нет allocation для блока ${i}`);
      continue;
    }
    
    // Базовые параметры из allocation
    let sets = allocation.sets;
    let reps = allocation.reps;
    let rest = allocation.rest;
    
    // Корректировка под чекин
    if (checkInAnalysis && checkInAnalysis.mode !== "normal") {
      sets = Math.max(1, Math.round(sets * checkInAnalysis.volumeMultiplier));
      rest = Math.round(rest * checkInAnalysis.restMultiplier);
    }
    
    exercises.push({
      priority: block.priority,
      role: block.role,
      name: block.name,
      movementPattern: block.movementPattern,
      targetMuscles: block.targetMuscles,
      sets,
      reps,
      rest,
      notes: block.notes
    });
  }
  
  return exercises;
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


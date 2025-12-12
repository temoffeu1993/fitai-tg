// Научно обоснованный движок для расчета тренировочных параметров
// Основан на: ACSM, периодизация Матвеева, современные исследования гипертрофии
// ============================================================================

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type TrainingGoal = "strength" | "hypertrophy" | "metabolic" | "athletic";

// ============================================================================
// 1. ОБЪЕМ ТРЕНИРОВОК (научные данные)
// ============================================================================

/**
 * Максимальный восстанавливаемый объем (подходов) за тренировку
 * Источник: мета-анализы по гипертрофии, ACSM рекомендации
 */
export const MAX_RECOVERABLE_VOLUME = {
  beginner: {
    perSession: 12,              // Не более 12 подходов за тренировку
    perMusclePerWeek: 10,        // 6-10 подходов на группу мышц в неделю
    exercisesPerSession: 5       // Максимум 5 упражнений
  },
  intermediate: {
    perSession: 18,              // До 18 подходов
    perMusclePerWeek: 15,        // 10-15 подходов на группу в неделю
    exercisesPerSession: 6
  },
  advanced: {
    perSession: 22,              // До 22 подходов (больше = перетренированность)
    perMusclePerWeek: 20,        // 15-20 подходов на группу в неделю
    exercisesPerSession: 8
  }
} as const;

/**
 * Модификаторы объема в зависимости от уровня подготовки
 */
export const EXPERIENCE_VOLUME_MODIFIERS = {
  beginner: 0.7,      // 70% от стандартного объема
  intermediate: 1.0,  // 100% стандарт
  advanced: 1.3       // 130% от стандарта
} as const;

// ============================================================================
// 2. ИНТЕНСИВНОСТЬ И ПОВТОРЕНИЯ ПО ЦЕЛЯМ
// ============================================================================

export type GoalParameters = {
  repsRange: [number, number];    // Диапазон повторений
  intensity: string;               // % от 1ПМ
  setsPerExercise: [number, number]; // Подходов на упражнение
  tempo: string;                   // Темп выполнения
  restBetweenSets: [number, number]; // Отдых в секундах
  focus: string;                   // На что направлена тренировка
  TUT?: [number, number];          // Time Under Tension (секунды)
};

/**
 * Параметры тренировок по целям (научно обоснованные)
 * Источник: ACSM, исследования по гипертрофии/силе
 */
export const GOAL_PARAMETERS: Record<TrainingGoal, GoalParameters> = {
  strength: {
    repsRange: [3, 6],
    intensity: "85-95% от 1ПМ",
    setsPerExercise: [4, 6],
    tempo: "explosive",
    restBetweenSets: [180, 240],  // 3-4 минуты
    focus: "Нейромышечная адаптация"
  },
  
  hypertrophy: {
    repsRange: [6, 12],
    intensity: "65-85% от 1ПМ",
    setsPerExercise: [3, 5],
    tempo: "controlled (3-1-1-0)",
    restBetweenSets: [60, 120],   // 1-2 минуты
    focus: "Механическое напряжение + метаболический стресс",
    TUT: [40, 70]                 // 40-70 секунд под нагрузкой
  },
  
  metabolic: {
    repsRange: [12, 20],
    intensity: "50-65% от 1ПМ",
    setsPerExercise: [2, 4],
    tempo: "fast",
    restBetweenSets: [30, 60],    // 30-60 секунд
    focus: "Метаболический стресс + калорийный расход"
  },
  
  athletic: {
    repsRange: [8, 12],
    intensity: "70-80% от 1ПМ",
    setsPerExercise: [3, 4],
    tempo: "mixed",
    restBetweenSets: [60, 90],
    focus: "Баланс силы, скорости, выносливости"
  }
} as const;

// ============================================================================
// 3. РАСПРЕДЕЛЕНИЕ ОБЪЕМА ПО ТИПАМ УПРАЖНЕНИЙ
// ============================================================================

export type ExerciseRatio = {
  main_lift: number;      // % от общего объема
  secondary: number;
  accessory: number;
  isolation: number;
};

/**
 * Как распределять объем (подходы) между типами упражнений
 */
export const EXERCISE_RATIOS: Record<TrainingGoal, ExerciseRatio> = {
  strength: {
    main_lift: 70,      // 70% на главное базовое
    secondary: 20,      // 20% на вторичное
    accessory: 10,      // 10% на вспомогательные
    isolation: 0        // Изоляция не нужна для силы
  },
  
  hypertrophy: {
    main_lift: 35,      // 35% на главное базовое
    secondary: 30,      // 30% на вторичное базовое
    accessory: 20,      // 20% на изоляцию крупных мышц
    isolation: 15       // 15% на мелкую изоляцию
  },
  
  metabolic: {
    main_lift: 40,      // 40% на многосуставные
    secondary: 30,      // 30% на вторичные
    accessory: 20,      // 20% на изоляцию
    isolation: 10       // 10% на мелкие мышцы
  },
  
  athletic: {
    main_lift: 40,
    secondary: 35,
    accessory: 15,
    isolation: 10
  }
} as const;

// ============================================================================
// 4. ВРЕМЯ ОТДЫХА В ЗАВИСИМОСТИ ОТ ТИПА УПРАЖНЕНИЯ
// ============================================================================

type RestByExerciseType = {
  main_lift: number;
  secondary: number;
  accessory: number;
  isolation: number;
};

/**
 * Время отдыха (секунды) для разных типов упражнений и целей
 * Источник: исследования восстановления АТФ-КФ системы
 */
export const REST_BY_EXERCISE_TYPE: Record<TrainingGoal, RestByExerciseType> = {
  strength: {
    main_lift: 240,     // 4 минуты для тяжелых базовых
    secondary: 180,     // 3 минуты
    accessory: 120,     // 2 минуты
    isolation: 90       // Изоляция редко используется для силы
  },
  
  hypertrophy: {
    main_lift: 120,     // 2 минуты
    secondary: 90,      // 1.5 минуты
    accessory: 75,      // 1.25 минуты
    isolation: 60       // 1 минута
  },
  
  metabolic: {
    main_lift: 90,      // 1.5 минуты
    secondary: 60,      // 1 минута
    accessory: 45,      // 45 секунд
    isolation: 30       // 30 секунд
  },
  
  athletic: {
    main_lift: 90,
    secondary: 75,
    accessory: 60,
    isolation: 45
  }
} as const;

/**
 * Модификаторы времени отдыха по уровню подготовки
 */
export const REST_MODIFIERS = {
  beginner: 1.2,      // +20% отдыха (нужно больше времени)
  intermediate: 1.0,  // Стандарт
  advanced: 0.9       // -10% отдыха (быстрее восстанавливаются)
} as const;

// ============================================================================
// 5. РАСЧЕТ КОЛИЧЕСТВА УПРАЖНЕНИЙ ПОД ВРЕМЯ
// ============================================================================

/**
 * Структура распределения времени тренировки
 */
type SessionTimeBreakdown = {
  warmup: number;      // % времени на разминку
  working: number;     // % времени на рабочие подходы
  cooldown: number;    // % времени на заминку
};

/**
 * Распределение времени (научно обоснованное)
 */
const TIME_BREAKDOWN: SessionTimeBreakdown = {
  warmup: 0.11,    // 11% на разминку
  working: 0.78,   // 78% на рабочую часть
  cooldown: 0.11   // 11% на заминку
};

/**
 * Среднее время на одно упражнение (зависит от цели)
 */
const TIME_PER_EXERCISE_MINUTES: Record<TrainingGoal, number> = {
  strength: 12,      // Тяжелые подходы с длинным отдыхом
  hypertrophy: 8,    // Средние подходы с умеренным отдыхом
  metabolic: 6,      // Короткий отдых, быстрый темп
  athletic: 7        // Средне-быстро
};

/**
 * Рассчитывает максимальное количество упражнений под доступное время
 */
export function calculateMaxExercises(params: {
  totalMinutes: number;
  goal: TrainingGoal;
  experience: ExperienceLevel;
}): number {
  const { totalMinutes, goal, experience } = params;
  
  // Время на разминку и заминку
  const warmupCooldownTime = totalMinutes * (TIME_BREAKDOWN.warmup + TIME_BREAKDOWN.cooldown);
  
  // Рабочее время
  const workingTime = totalMinutes * TIME_BREAKDOWN.working;
  
  // Базовое количество упражнений
  const timePerExercise = TIME_PER_EXERCISE_MINUTES[goal];
  const baseExercises = Math.floor(workingTime / timePerExercise);
  
  // Корректировка под опыт
  const experienceModifier = EXPERIENCE_VOLUME_MODIFIERS[experience];
  const adjustedExercises = baseExercises * experienceModifier;
  
  // Ограничение по максимуму для уровня
  const maxAllowed = MAX_RECOVERABLE_VOLUME[experience].exercisesPerSession;
  
  return Math.min(Math.round(adjustedExercises), maxAllowed);
}

/**
 * Рассчитывает целевое количество подходов за тренировку
 */
export function calculateTargetSets(params: {
  totalMinutes: number;
  goal: TrainingGoal;
  experience: ExperienceLevel;
}): number {
  const { goal, experience } = params;
  
  // Базовое количество подходов (зависит от цели)
  const baseSetsMap = {
    strength: 14,      // Меньше подходов, больше интенсивность
    hypertrophy: 16,   // Оптимум для роста
    metabolic: 18,     // Больше объем, меньше интенсивность
    athletic: 15
  };
  
  const baseSets = baseSetsMap[goal];
  
  // Корректировка под опыт
  const modifier = EXPERIENCE_VOLUME_MODIFIERS[experience];
  const targetSets = Math.round(baseSets * modifier);
  
  // Ограничение по максимуму
  const maxSets = MAX_RECOVERABLE_VOLUME[experience].perSession;
  
  return Math.min(targetSets, maxSets);
}

// ============================================================================
// 6. РАСПРЕДЕЛЕНИЕ ПОДХОДОВ ПО ПРИОРИТЕТАМ
// ============================================================================

export type ExerciseBlockAllocation = {
  priority: 1 | 2 | 3 | 4 | 5;
  role: "main_lift" | "secondary" | "accessory" | "isolation" | "optional";
  sets: number;
  reps: string;
  rest: number;
  mandatory: boolean;
};

/**
 * Распределяет общее количество подходов между упражнениями
 */
export function distributeVolume(params: {
  totalSets: number;
  numberOfExercises: number;
  goal: TrainingGoal;
  experience: ExperienceLevel;
}): ExerciseBlockAllocation[] {
  
  const { totalSets, numberOfExercises, goal, experience } = params;
  const ratio = EXERCISE_RATIOS[goal];
  const goalParams = GOAL_PARAMETERS[goal];
  const restTimes = REST_BY_EXERCISE_TYPE[goal];
  const restModifier = REST_MODIFIERS[experience];
  
  const allocations: ExerciseBlockAllocation[] = [];
  
  // Определяем роли упражнений по приоритетам
  const roles: Array<keyof ExerciseRatio> = ["main_lift", "secondary", "accessory", "isolation"];
  
  let remainingSets = totalSets;
  let exerciseIndex = 0;
  
  for (const role of roles) {
    if (exerciseIndex >= numberOfExercises) break;
    if (ratio[role] === 0) continue; // Пропускаем если для цели не нужно
    
    // Сколько подходов выделяем на эту роль
    const setsForRole = Math.round(totalSets * (ratio[role] / 100));
    
    if (setsForRole === 0) continue;
    
    // Сколько упражнений этой роли можем добавить
    const avgSetsPerExercise = Math.round(
      (goalParams.setsPerExercise[0] + goalParams.setsPerExercise[1]) / 2
    );
    
    const exercisesForRole = Math.max(1, Math.floor(setsForRole / avgSetsPerExercise));
    const actualExercisesForRole = Math.min(
      exercisesForRole,
      numberOfExercises - exerciseIndex
    );
    
    // Распределяем подходы между упражнениями этой роли
    const setsPerExercise = Math.max(
      goalParams.setsPerExercise[0],
      Math.floor(setsForRole / actualExercisesForRole)
    );
    
    for (let i = 0; i < actualExercisesForRole; i++) {
      const priority = (exerciseIndex + 1) as 1 | 2 | 3 | 4 | 5;
      const sets = Math.min(setsPerExercise, goalParams.setsPerExercise[1]);
      
      allocations.push({
        priority,
        role,
        sets,
        reps: `${goalParams.repsRange[0]}-${goalParams.repsRange[1]}`,
        rest: Math.round(restTimes[role] * restModifier),
        mandatory: priority <= 2 // Первые 2 упражнения обязательны
      });
      
      remainingSets -= sets;
      exerciseIndex++;
    }
  }
  
  // Если остались подходы, добавляем к главным упражнениям
  if (remainingSets > 0 && allocations.length > 0) {
    allocations[0].sets += remainingSets;
  }
  
  return allocations;
}

// ============================================================================
// 7. ПРОГРЕССИВНАЯ ПЕРЕГРУЗКА
// ============================================================================

export type ProgressionRules = {
  increaseFrequency: string;
  weightIncrease: string;
  volumeIncrease: string;
  reasoning: string;
};

/**
 * Правила прогрессии по уровню подготовки
 */
export const PROGRESSION_RULES: Record<ExperienceLevel, ProgressionRules> = {
  beginner: {
    increaseFrequency: "каждые 2 недели",
    weightIncrease: "2.5-5%",
    volumeIncrease: "1 подход или 2 повторения",
    reasoning: "Медленная адаптация, риск травм при быстром росте"
  },
  
  intermediate: {
    increaseFrequency: "каждые 1-2 недели",
    weightIncrease: "2.5-5%",
    volumeIncrease: "1-2 подхода или 2-3 повторения",
    reasoning: "Быстрая адаптация, но нужен баланс"
  },
  
  advanced: {
    increaseFrequency: "еженедельно",
    weightIncrease: "2.5-5% или использовать периодизацию",
    volumeIncrease: "переменный (зависит от фазы)",
    reasoning: "Требуется периодизация для преодоления плато"
  }
};

/**
 * Правило 2-2-2: Когда увеличивать вес
 * Если выполнил ВСЕ подходы с ВЕРХНЕЙ границей повторений
 * на 2 тренировках подряд → увеличивай вес на 2.5-5%
 */
export function shouldIncreaseWeight(params: {
  targetReps: number;          // Верхняя граница (например, 8 в диапазоне 6-8)
  completedReps: number[][];   // Массив подходов за последние 2 тренировки
}): boolean {
  const { targetReps, completedReps } = params;
  
  if (completedReps.length < 2) return false;
  
  // Проверяем последние 2 тренировки
  for (const session of completedReps.slice(-2)) {
    // Все подходы должны достичь целевых повторений
    const allSetsComplete = session.every(reps => reps >= targetReps);
    if (!allSetsComplete) return false;
  }
  
  return true;
}

// ============================================================================
// 8. ГЛАВНАЯ ФУНКЦИЯ: ГЕНЕРАЦИЯ ПРАВИЛ ДЛЯ ТРЕНИРОВКИ
// ============================================================================

export type WorkoutRules = {
  totalSets: number;
  maxExercises: number;
  exerciseAllocations: ExerciseBlockAllocation[];
  goalParameters: GoalParameters;
  estimatedDuration: number;
  warmupMinutes: number;
  cooldownMinutes: number;
  notes: string[];
};

/**
 * Генерирует научно обоснованные правила для тренировки
 */
export function generateWorkoutRules(params: {
  experience: ExperienceLevel;
  goal: TrainingGoal;
  timeAvailable: number;
  daysPerWeek: number;
}): WorkoutRules {
  
  const { experience, goal, timeAvailable, daysPerWeek } = params;
  
  const notes: string[] = [];
  
  // 1. Целевое количество подходов
  let targetSets = calculateTargetSets({ totalMinutes: timeAvailable, goal, experience });
  
  // 2. Максимальное количество упражнений
  const maxExercises = calculateMaxExercises({ totalMinutes: timeAvailable, goal, experience });
  
  // 3. Проверка на перетренированность
  const maxRecoverable = MAX_RECOVERABLE_VOLUME[experience].perSession;
  if (targetSets > maxRecoverable) {
    notes.push(`⚠️ Объем снижен с ${targetSets} до ${maxRecoverable} подходов (максимум для ${experience})`);
    targetSets = maxRecoverable;
  }
  
  // 4. Проверка частоты тренировок
  if (daysPerWeek > 6) {
    notes.push(`⚠️ ${daysPerWeek} тренировок в неделю - высокий риск перетренированности`);
  }
  
  // 5. Распределение объема
  const exerciseAllocations = distributeVolume({
    totalSets: targetSets,
    numberOfExercises: maxExercises,
    goal,
    experience
  });
  
  // 6. Параметры цели
  const goalParameters = GOAL_PARAMETERS[goal];
  
  // 7. Расчет времени
  const warmupMinutes = Math.round(timeAvailable * TIME_BREAKDOWN.warmup);
  const cooldownMinutes = Math.round(timeAvailable * TIME_BREAKDOWN.cooldown);
  
  // 8. Добавляем полезные заметки
  notes.push(`📊 Уровень: ${experience} → ${targetSets} подходов, ${maxExercises} упражнений`);
  notes.push(`🎯 Цель: ${goal} → ${goalParameters.repsRange[0]}-${goalParameters.repsRange[1]} повторений`);
  notes.push(`⏱️ Время: ${warmupMinutes} мин разминка + ${Math.round(timeAvailable * TIME_BREAKDOWN.working)} мин работа + ${cooldownMinutes} мин заминка`);
  
  // Предупреждения для новичков
  if (experience === "beginner") {
    notes.push(`💡 Фокус на технике! Не гонись за весами первые 6 месяцев`);
  }
  
  // Советы для продвинутых
  if (experience === "advanced" && goal === "hypertrophy") {
    notes.push(`💪 Можешь использовать суперсеты на изоляции для экономии времени`);
  }
  
  return {
    totalSets: targetSets,
    maxExercises,
    exerciseAllocations,
    goalParameters,
    estimatedDuration: timeAvailable,
    warmupMinutes,
    cooldownMinutes,
    notes
  };
}


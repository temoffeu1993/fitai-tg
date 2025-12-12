// Гибкие шаблоны тренировок с правилами (вместо жестких цифр)
// ============================================================================

import { MovementPattern } from "./workoutTemplates.js";
import { TrainingGoal, ExperienceLevel } from "./trainingRulesEngine.js";

// ============================================================================
// ТИПЫ
// ============================================================================

/**
 * Правило для одного блока упражнений
 * Не содержит жестких цифр - все рассчитывается динамически
 */
export type ExerciseBlockRule = {
  priority: 1 | 2 | 3 | 4 | 5;  // Чем меньше - тем важнее
  role: "main_lift" | "secondary" | "accessory" | "isolation" | "optional";
  name: string;                  // Название блока (для понимания)
  movementPattern: MovementPattern; // Тип движения
  targetMuscles: string[];       // Целевые мышцы
  notes?: string;                // Заметки тренеру/AI
  
  // Условия пропуска (опционально)
  canSkipIf?: {
    timeMinutes?: number;        // Пропустить если < X минут
    experience?: ExperienceLevel[]; // Пропустить для определенных уровней
    goals?: TrainingGoal[];      // Пропустить для определенных целей
  };
  
  // Альтернативные паттерны (если основной нельзя)
  alternatives?: MovementPattern[];
  
  // Для продвинутых: можно в суперсете с...
  supersetWith?: number;  // Индекс другого блока
};

/**
 * Правила разминки/заминки
 */
export type WarmupCooldownRule = {
  durationPercent: number;       // % от общего времени
  minMinutes: number;            // Минимум минут
  maxMinutes: number;            // Максимум минут
  guidelines: string;            // Описание что делать
};

/**
 * Правила адаптации (из checkInAdapter)
 */
export type AdaptationRules = {
  canReduce: {
    minExercises: number;        // Минимум упражнений при облегчении
    minSets: number;             // Минимум подходов
    minIntensity: "light" | "moderate" | "heavy"; // Минимальная интенсивность
  };
  skipConditions: {
    painLevel: number;           // Боль X+ → пропуск
    sleepHours: number;          // Сон < X → пропуск
    multipleIssues: boolean;     // Несколько проблем → пропуск
  };
  fallbackFocus?: string;        // Альтернативный фокус (если основной нельзя)
  requiredRecoveryHours?: number; // Минимум часов восстановления
};

/**
 * Полный шаблон дня с ГИБКИМИ правилами
 */
export type DayTemplateRules = {
  name: string;
  focus: string;
  description: string;
  
  // Разминка
  warmup: WarmupCooldownRule;
  
  // Блоки упражнений (по приоритетам)
  exerciseBlocks: ExerciseBlockRule[];
  
  // Заминка
  cooldown: WarmupCooldownRule;
  
  // Правила адаптации
  adaptationRules: AdaptationRules;
  
  // Метаданные (для фильтрации схем)
  meta: {
    targetMuscleGroups: string[]; // Какие группы тренируем
    difficulty: "beginner_friendly" | "intermediate" | "advanced_only";
    estimatedDurationRange: [number, number]; // Для какого времени подходит
  };
};

// ============================================================================
// ПРИМЕРЫ ГИБКИХ ШАБЛОНОВ
// ============================================================================

/**
 * PPL - PUSH DAY (с гибкими правилами)
 */
export const PPL_PUSH_RULES: DayTemplateRules = {
  name: "Push Day",
  focus: "Грудь, плечи, трицепс — все толкающие движения",
  description: "Классический Push день из схемы Push/Pull/Legs. Адаптируется под время, опыт и цели.",
  
  warmup: {
    durationPercent: 0.11,
    minMinutes: 5,
    maxMinutes: 10,
    guidelines: "5-10 минут легкого кардио + динамическая растяжка верха тела (круги руками, разминка плеч и груди)"
  },
  
  exerciseBlocks: [
    {
      priority: 1,
      role: "main_lift",
      name: "Главное базовое - горизонтальный жим",
      movementPattern: "horizontal_press",
      targetMuscles: ["грудь", "трицепс", "передние дельты"],
      notes: "Фундамент тренировки. Тяжелое базовое для максимальной отдачи. Прогрессия: +2.5кг когда выполнил цель 2 раза подряд.",
      alternatives: ["incline_press"], // Если горизонтальный жим болит плечо
      canSkipIf: undefined // Никогда не пропускаем
    },
    
    {
      priority: 2,
      role: "secondary",
      name: "Вторичное базовое - наклонный жим",
      movementPattern: "incline_press",
      targetMuscles: ["верх груди", "передние дельты", "трицепс"],
      notes: "Проработка верха груди под другим углом. Важно для баланса развития.",
      alternatives: ["horizontal_press"],
      canSkipIf: {
        timeMinutes: 50,      // Можно пропустить если < 50 минут
        experience: ["beginner"] // Новички могут пропустить
      }
    },
    
    {
      priority: 3,
      role: "accessory",
      name: "Жим на плечи",
      movementPattern: "overhead_press",
      targetMuscles: ["средние дельты", "передние дельты", "трицепс"],
      notes: "Дополнительный объем на плечи. Хорошо дополняет жимы.",
      alternatives: ["lateral_raise", "front_raise"], // Если жим болит - можно махи
      canSkipIf: {
        timeMinutes: 60,
        experience: ["beginner"]
      }
    },
    
    {
      priority: 4,
      role: "isolation",
      name: "Изоляция средних дельт",
      movementPattern: "lateral_raise",
      targetMuscles: ["средние дельты"],
      notes: "Изолированная работа на ширину плеч. Контролируемый темп.",
      canSkipIf: {
        timeMinutes: 70,
        experience: ["beginner"],
        goals: ["strength"] // Для силы изоляция не критична
      },
      supersetWith: 5 // Можно в суперсете с трицепсом (для advanced)
    },
    
    {
      priority: 5,
      role: "isolation",
      name: "Изоляция трицепса",
      movementPattern: "triceps_pushdown",
      targetMuscles: ["трицепс"],
      notes: "Завершающая работа на трицепс. Пампинг.",
      canSkipIf: {
        timeMinutes: 60,
        goals: ["strength"]
      },
      supersetWith: 4 // Можно в суперсете с дельтами
    }
  ],
  
  cooldown: {
    durationPercent: 0.11,
    minMinutes: 5,
    maxMinutes: 10,
    guidelines: "Статическая растяжка груди, плеч, трицепса (по 30 сек каждая). Дыхательные упражнения."
  },
  
  adaptationRules: {
    canReduce: {
      minExercises: 2,  // Минимум: главное + вторичное базовое
      minSets: 8,       // Минимум 8 подходов даже в recovery режиме
      minIntensity: "light"
    },
    skipConditions: {
      painLevel: 7,     // Боль 7+ в верхе → пропуск
      sleepHours: 4,    // Сон < 4ч → пропуск
      multipleIssues: true
    },
    fallbackFocus: "legs" // Если верх нельзя → переключить на ноги
  },
  
  meta: {
    targetMuscleGroups: ["грудь", "плечи", "трицепс"],
    difficulty: "intermediate", // Подходит всем, но лучше для intermediate+
    estimatedDurationRange: [45, 90]
  }
};

/**
 * PPL - PULL DAY (с гибкими правилами)
 */
export const PPL_PULL_RULES: DayTemplateRules = {
  name: "Pull Day",
  focus: "Спина, задние дельты, бицепс — все тянущие движения",
  description: "Классический Pull день. Вертикальные и горизонтальные тяги.",
  
  warmup: {
    durationPercent: 0.11,
    minMinutes: 5,
    maxMinutes: 10,
    guidelines: "5-10 минут легкого кардио + динамическая растяжка спины, рук, вращения в плечах"
  },
  
  exerciseBlocks: [
    {
      priority: 1,
      role: "main_lift",
      name: "Главное базовое - вертикальная тяга",
      movementPattern: "vertical_pull",
      targetMuscles: ["широчайшие", "бицепс", "задние дельты"],
      notes: "Подтягивания или тяга верхнего блока. Фундамент для спины.",
      alternatives: ["horizontal_pull"]
    },
    
    {
      priority: 2,
      role: "secondary",
      name: "Горизонтальная тяга",
      movementPattern: "horizontal_pull",
      targetMuscles: ["середина спины", "ромбовидные", "бицепс"],
      notes: "Проработка толщины спины. Тяга к поясу.",
      alternatives: ["row"],
      canSkipIf: {
        timeMinutes: 50,
        experience: ["beginner"]
      }
    },
    
    {
      priority: 3,
      role: "accessory",
      name: "Дополнительная тяга",
      movementPattern: "row",
      targetMuscles: ["спина", "задние дельты"],
      notes: "Еще один угол нагрузки на спину.",
      canSkipIf: {
        timeMinutes: 65,
        experience: ["beginner"]
      }
    },
    
    {
      priority: 4,
      role: "isolation",
      name: "Изоляция задних дельт",
      movementPattern: "rear_delt_fly",
      targetMuscles: ["задние дельты", "верх спины"],
      notes: "Важно для баланса плеч и осанки.",
      canSkipIf: {
        timeMinutes: 70,
        goals: ["strength"]
      },
      supersetWith: 5
    },
    
    {
      priority: 5,
      role: "isolation",
      name: "Изоляция бицепса",
      movementPattern: "biceps_curl",
      targetMuscles: ["бицепс"],
      notes: "Завершающая работа на бицепс.",
      canSkipIf: {
        timeMinutes: 60,
        goals: ["strength"]
      },
      supersetWith: 4
    }
  ],
  
  cooldown: {
    durationPercent: 0.11,
    minMinutes: 5,
    maxMinutes: 10,
    guidelines: "Растяжка спины, бицепса, плеч. Висы на турнике 20-30 сек для декомпрессии."
  },
  
  adaptationRules: {
    canReduce: {
      minExercises: 2,
      minSets: 8,
      minIntensity: "light"
    },
    skipConditions: {
      painLevel: 7,
      sleepHours: 4,
      multipleIssues: true
    },
    fallbackFocus: "legs"
  },
  
  meta: {
    targetMuscleGroups: ["спина", "бицепс", "задние дельты"],
    difficulty: "intermediate",
    estimatedDurationRange: [45, 90]
  }
};

/**
 * PPL - LEGS DAY (с гибкими правилами)
 */
export const PPL_LEGS_RULES: DayTemplateRules = {
  name: "Legs Day",
  focus: "Квадрицепсы, ягодицы, бицепс бедра, икры",
  description: "Тяжелый день ног. Приседания, тазовые шарниры, выпады.",
  
  warmup: {
    durationPercent: 0.12,  // Чуть больше для ног
    minMinutes: 7,
    maxMinutes: 12,
    guidelines: "5-10 минут кардио + динамическая разминка ног (выпады с весом тела, круги в коленях и тазу, приседания без веса)"
  },
  
  exerciseBlocks: [
    {
      priority: 1,
      role: "main_lift",
      name: "Главное базовое - приседания",
      movementPattern: "squat_pattern",
      targetMuscles: ["квадрицепсы", "ягодицы", "кор"],
      notes: "Король упражнений на ноги. Прогрессия: +5кг каждую неделю (для ног можно быстрее).",
      alternatives: ["leg_extension", "lunge_pattern"] // Если колени/спина болит
    },
    
    {
      priority: 2,
      role: "secondary",
      name: "Тазовый шарнир - румынка или становая",
      movementPattern: "hip_hinge",
      targetMuscles: ["бицепс бедра", "ягодицы", "низ спины"],
      notes: "Задняя поверхность и ягодицы. Румынская тяга или становая.",
      alternatives: ["hip_thrust"],
      canSkipIf: {
        timeMinutes: 55,
        experience: ["beginner"]
      }
    },
    
    {
      priority: 3,
      role: "accessory",
      name: "Выпады или сплиты",
      movementPattern: "lunge_pattern",
      targetMuscles: ["квадрицепсы", "ягодицы", "баланс"],
      notes: "Односторонняя работа для баланса и формы ног.",
      canSkipIf: {
        timeMinutes: 65,
        experience: ["beginner"]
      }
    },
    
    {
      priority: 4,
      role: "isolation",
      name: "Изоляция квадрицепсов",
      movementPattern: "leg_extension",
      targetMuscles: ["квадрицепсы"],
      notes: "Дополнительный объем на переднюю поверхность.",
      canSkipIf: {
        timeMinutes: 75,
        goals: ["strength"]
      }
    },
    
    {
      priority: 5,
      role: "isolation",
      name: "Изоляция бицепса бедра",
      movementPattern: "leg_curl",
      targetMuscles: ["бицепс бедра"],
      notes: "Изоляция задней поверхности.",
      canSkipIf: {
        timeMinutes: 70,
        goals: ["strength"]
      }
    }
  ],
  
  cooldown: {
    durationPercent: 0.12,
    minMinutes: 7,
    maxMinutes: 12,
    guidelines: "Растяжка квадрицепсов, бицепса бедра, ягодиц, икр. Раскатка на foam roller."
  },
  
  adaptationRules: {
    canReduce: {
      minExercises: 2,
      minSets: 8,
      minIntensity: "light"
    },
    skipConditions: {
      painLevel: 8,    // Для ног порог выше (они выносливее)
      sleepHours: 4,
      multipleIssues: true
    },
    fallbackFocus: "upper"
  },
  
  meta: {
    targetMuscleGroups: ["ноги", "ягодицы"],
    difficulty: "intermediate",
    estimatedDurationRange: [50, 95] // Ноги нужно чуть больше времени
  }
};

/**
 * FULL BODY (новичкам)
 */
export const FULL_BODY_RULES: DayTemplateRules = {
  name: "Full Body",
  focus: "Все тело - приседания, жимы, тяги",
  description: "Базовая тренировка всего тела. Идеально для новичков и 3 дня в неделю.",
  
  warmup: {
    durationPercent: 0.11,
    minMinutes: 5,
    maxMinutes: 10,
    guidelines: "5-10 минут легкого кардио + динамическая растяжка всего тела"
  },
  
  exerciseBlocks: [
    {
      priority: 1,
      role: "main_lift",
      name: "Базовое на ноги",
      movementPattern: "squat_pattern",
      targetMuscles: ["квадрицепсы", "ягодицы"],
      notes: "Начинаем с ног - самая большая группа мышц. Фокус на технике для новичков."
    },
    
    {
      priority: 2,
      role: "secondary",
      name: "Горизонтальный жим",
      movementPattern: "horizontal_press",
      targetMuscles: ["грудь", "трицепс", "плечи"],
      notes: "Жим лёжа или гантелями - основа для верха тела."
    },
    
    {
      priority: 3,
      role: "secondary",
      name: "Вертикальная или горизонтальная тяга",
      movementPattern: "vertical_pull",
      targetMuscles: ["спина", "бицепс"],
      notes: "Тяга для спины - баланс с жимом.",
      alternatives: ["horizontal_pull"]
    },
    
    {
      priority: 4,
      role: "accessory",
      name: "Задняя цепь",
      movementPattern: "hip_hinge",
      targetMuscles: ["бицепс бедра", "ягодицы", "низ спины"],
      notes: "Румынка - задняя поверхность важна для баланса.",
      canSkipIf: {
        timeMinutes: 55,
        experience: ["beginner"]
      }
    },
    
    {
      priority: 5,
      role: "optional",
      name: "Кор / Пресс",
      movementPattern: "core_anti_extension",
      targetMuscles: ["пресс", "кор"],
      notes: "Планка или другие упражнения на кор.",
      canSkipIf: {
        timeMinutes: 60
      }
    }
  ],
  
  cooldown: {
    durationPercent: 0.11,
    minMinutes: 5,
    maxMinutes: 10,
    guidelines: "Легкая растяжка всех групп мышц"
  },
  
  adaptationRules: {
    canReduce: {
      minExercises: 3,  // Минимум: ноги, жим, тяга
      minSets: 8,
      minIntensity: "light"
    },
    skipConditions: {
      painLevel: 7,
      sleepHours: 5,    // Для новичков порог чуть выше
      multipleIssues: true
    }
  },
  
  meta: {
    targetMuscleGroups: ["все тело"],
    difficulty: "beginner_friendly",
    estimatedDurationRange: [40, 75]
  }
};


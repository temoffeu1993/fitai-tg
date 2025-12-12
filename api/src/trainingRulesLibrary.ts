// Библиотека правил тренировок (правильный подход)
// ============================================================================

import { DayTrainingRules } from "./trainingRulesTypes.js";

/**
 * PPL PUSH DAY - Правила для дня толкающих движений
 * 
 * ФИЛОСОФИЯ:
 * - AI получает ПРАВИЛА, а не готовую структуру
 * - AI САМ выбирает упражнения из доступных паттернов
 * - AI решает точное количество упражнений в рамках диапазона
 * - AI учитывает историю, веса, травмы, прогресс
 */
export const PPL_PUSH_DAY_RULES: DayTrainingRules = {
  name: "Push Day",
  focus: "Грудь, плечи, трицепс — все толкающие движения",
  description: "Классический Push день. Начинаем с тяжелых базовых жимов, заканчиваем изоляцией. Объём зависит от уровня и времени.",
  
  structure: {
    // Гибкий диапазон упражнений для покрытия целевых объёмов
    totalExercisesRange: [6, 12],
    
    // БАЗОВЫЕ (compound) - тяжелые многосуставные
    compound: {
      count: [2, 4],  // 2-4 базовых упражнения (гибкость!)
      sets: 4,
      reps: "6-8",
      rest: 120,      // 2 минуты
      priority: 1,
      notes: "Тяжелые базовые жимы - фундамент тренировки. Фокус на прогрессии веса. RPE 8-9."
    },
    
    // ВТОРИЧНЫЕ (secondary) - среднетяжелые
    secondary: {
      count: [2, 4],  // 2-4 вторичных (гибкость!)
      sets: 3,
      reps: "8-12",
      rest: 90,       // 1.5 минуты
      priority: 2,
      notes: "Проработка под другими углами. Контролируемый темп, связь мозг-мышца. RPE 7-8."
    },
    
    // ИЗОЛЯЦИЯ (isolation) - лёгкие односуставные
    isolation: {
      count: [2, 4],  // 2-4 изоляции (гибкость!)
      sets: 3,
      reps: "12-15",
      rest: 60,       // 1 минута
      priority: 3,
      notes: "Изоляция мелких мышц. Чистая техника, пиковое сокращение. RPE 7-8."
    }
  },
  
  targetAreas: {
    primary: ["грудь", "передние дельты"],
    secondary: ["трицепс", "средние дельты"]
  },
  
  // Научные целевые объёмы (MEV-MAV-MRV)
  targetMuscleVolume: {
    chest: {
      beginner: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } },
      intermediate: { 60: { min: 10, max: 12 }, 75: { min: 12, max: 14 }, 90: { min: 14, max: 16 } },
      advanced: { 60: { min: 12, max: 14 }, 75: { min: 14, max: 16 }, 90: { min: 16, max: 18 } }
    },
    shoulders: {
      beginner: { 60: { min: 6, max: 8 }, 75: { min: 8, max: 10 }, 90: { min: 10, max: 12 } },
      intermediate: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } },
      advanced: { 60: { min: 10, max: 12 }, 75: { min: 12, max: 14 }, 90: { min: 14, max: 16 } }
    },
    triceps: {
      beginner: { 60: { min: 6, max: 8 }, 75: { min: 8, max: 10 }, 90: { min: 10, max: 12 } },
      intermediate: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } },
      advanced: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } }
    }
  },
  
  // Все доступные паттерны для Push Day
  // AI сам выбирает по type, difficulty и primaryMuscle
  recommendedPatterns: [
    "horizontal_press",   // Жим лёжа (грудь) - compound
    "incline_press",      // Жим на наклонной (грудь верхняя) - compound/secondary
    "decline_press",      // Жим под углом (грудь нижняя) - compound
    "overhead_press",     // Жим над головой (плечи) - compound
    "dips",               // Отжимания на брусьях (грудь/трицепс) - secondary
    "chest_fly",          // Разводки (грудь) - isolation
    "lateral_raise",      // Махи в стороны (средние дельты) - isolation
    "front_raise",        // Махи вперёд (передние дельты) - isolation
    "rear_delt_fly",      // Задние дельты - isolation
    "triceps_extension",  // Французский жим (трицепс) - isolation
    "triceps_pushdown"    // Разгибания на блоке (трицепс) - isolation
  ],
  
  format: {
    type: "standard",  // Упражнение → все подходы → следующее
    notes: "Стандартный формат для максимальной интенсивности. Суперсеты можно на изоляции если мало времени."
  },
  
  warmup: {
    durationMinutes: 5,
    guidelines: "5 минут лёгкого кардио + динамическая растяжка верха тела (круги руками, разминка плеч и груди)"
  },
  
  cooldown: {
    durationMinutes: 5,
    guidelines: "Статическая растяжка груди, плеч, трицепса. Каждое растяжение 30 сек."
  },
  
  adaptationRules: {
    canReduce: true,
    minExercises: 3,  // Минимум 3 даже в recovery
    fallbackFocus: "Lower Body",  // Если плечи/грудь травмированы
    avoidIfInjured: ["плечи", "грудь", "локти", "запястья"]
  },
  
  scientificNotes: [
    "Начинаем с тяжелых базовых для максимального нейромышечного стимула",
    "Базовые выполняем свежими (в начале) для прогрессии веса",
    "Изоляция в конце для добора объёма без риска травм",
    "Отдых 2 мин на базовых критичен для восстановления креатинфосфата",
    "6-9 упражнений для advanced/hypertrophy обеспечивает 15-22 подхода"
  ]
};

/**
 * PPL PULL DAY - Правила для дня тянущих движений
 */
export const PPL_PULL_DAY_RULES: DayTrainingRules = {
  name: "Pull Day",
  focus: "Спина, задние дельты, бицепс — все тянущие движения",
  description: "Классический Pull день. Подтягивания/тяги для широчайших, тяги к поясу для толщины спины, изоляция бицепса.",
  
  structure: {
    totalExercisesRange: [6, 12],
    
    compound: {
      count: [2, 4],
      sets: 4,
      reps: "6-8",
      rest: 120,
      priority: 1,
      notes: "Вертикальные и горизонтальные тяги. Фокус на широчайшие и середину спины."
    },
    
    secondary: {
      count: [2, 4],
      sets: 3,
      reps: "8-12",
      rest: 90,
      priority: 2,
      notes: "Тяги под углами, вариации хватов. Проработка глубины и деталей."
    },
    
    isolation: {
      count: [2, 4],
      sets: 3,
      reps: "12-15",
      rest: 60,
      priority: 3,
      notes: "Бицепс, задние дельты, трапеции. Изолированная работа."
    }
  },
  
  targetAreas: {
    primary: ["широчайшие", "середина спины"],
    secondary: ["бицепс", "задние дельты", "трапеции"]
  },
  
  // Научные целевые объёмы (MEV-MAV-MRV)
  targetMuscleVolume: {
    lats: {
      beginner: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } },
      intermediate: { 60: { min: 10, max: 12 }, 75: { min: 12, max: 14 }, 90: { min: 14, max: 16 } },
      advanced: { 60: { min: 12, max: 14 }, 75: { min: 14, max: 16 }, 90: { min: 16, max: 18 } }
    },
    mid_back: {
      beginner: { 60: { min: 6, max: 8 }, 75: { min: 8, max: 10 }, 90: { min: 10, max: 12 } },
      intermediate: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } },
      advanced: { 60: { min: 10, max: 12 }, 75: { min: 12, max: 14 }, 90: { min: 14, max: 16 } }
    },
    biceps: {
      beginner: { 60: { min: 6, max: 8 }, 75: { min: 8, max: 10 }, 90: { min: 10, max: 12 } },
      intermediate: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } },
      advanced: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } }
    },
    rear_delts: {
      beginner: { 60: { min: 4, max: 6 }, 75: { min: 6, max: 8 }, 90: { min: 8, max: 10 } },
      intermediate: { 60: { min: 6, max: 8 }, 75: { min: 8, max: 10 }, 90: { min: 10, max: 12 } },
      advanced: { 60: { min: 6, max: 8 }, 75: { min: 8, max: 10 }, 90: { min: 10, max: 12 } }
    }
  },
  
  // Все доступные паттерны для Pull Day
  recommendedPatterns: [
    "vertical_pull",     // Подтягивания, тяга верхнего блока - compound
    "horizontal_pull",   // Тяга штанги/гантелей в наклоне - compound
    "row",               // Тяга к поясу - compound/secondary
    "deadlift",          // Становая (если позволяет опыт) - compound
    "biceps_curl",       // Подъём на бицепс - isolation
    "hammer_curl",       // Молотковые подъёмы - isolation
    "rear_delt_fly"      // Задние дельты - isolation
  ],
  
  format: {
    type: "standard",
    notes: "Стандартный формат. Вертикальные тяги первыми (самые тяжелые)."
  },
  
  warmup: {
    durationMinutes: 5,
    guidelines: "5 минут кардио + разминка плеч, локтей. Лёгкие подтягивания или тяги с резинкой."
  },
  
  cooldown: {
    durationMinutes: 5,
    guidelines: "Растяжка широчайших, бицепса, задних дельт. Вис на турнике 30 сек."
  },
  
  adaptationRules: {
    canReduce: true,
    minExercises: 3,
    fallbackFocus: "Lower Body",
    avoidIfInjured: ["спина", "плечи", "локти"]
  },
  
  scientificNotes: [
    "Вертикальные тяги развивают ширину спины",
    "Горизонтальные тяги дают толщину",
    "Бицепс в конце т.к. уже утомлён тягами",
    "Становая только для advanced и если нет проблем со спиной"
  ]
};

/**
 * PPL LEGS DAY - Правила для дня ног
 */
export const PPL_LEGS_DAY_RULES: DayTrainingRules = {
  name: "Legs Day",
  focus: "Квадрицепсы, ягодицы, бицепс бедра, икры",
  description: "Полная тренировка ног. Приседания для квадрицепсов, тазовый шарнир для задней цепи, изоляция икр.",
  
  structure: {
    totalExercisesRange: [6, 12],
    
    compound: {
      count: [2, 4],
      sets: 4,
      reps: "6-10",  // Чуть больше повторений для ног
      rest: 150,     // 2.5 минуты (ноги требуют больше отдыха)
      priority: 1,
      notes: "Приседания и тазовые шарниры. Самые энергозатратные упражнения."
    },
    
    secondary: {
      count: [2, 4],
      sets: 3,
      reps: "10-15",
      rest: 90,
      priority: 2,
      notes: "Выпады, жим ногами, вариации. Проработка под углами."
    },
    
    isolation: {
      count: [2, 4],
      sets: 3,
      reps: "12-20",  // Икры любят больше повторений
      rest: 60,
      priority: 3,
      notes: "Сгибания, разгибания, икры. Доработка деталей."
    }
  },
  
  targetAreas: {
    primary: ["квадрицепсы", "ягодицы", "бицепс бедра"],
    secondary: ["икры", "приводящие"]
  },
  
  // Научные целевые объёмы (MEV-MAV-MRV)
  targetMuscleVolume: {
    quads: {
      beginner: { 60: { min: 10, max: 12 }, 75: { min: 12, max: 14 }, 90: { min: 14, max: 16 } },
      intermediate: { 60: { min: 12, max: 14 }, 75: { min: 14, max: 16 }, 90: { min: 16, max: 18 } },
      advanced: { 60: { min: 14, max: 16 }, 75: { min: 16, max: 18 }, 90: { min: 18, max: 20 } }
    },
    glutes: {
      beginner: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } },
      intermediate: { 60: { min: 10, max: 12 }, 75: { min: 12, max: 14 }, 90: { min: 14, max: 16 } },
      advanced: { 60: { min: 12, max: 14 }, 75: { min: 14, max: 16 }, 90: { min: 16, max: 18 } }
    },
    hamstrings: {
      beginner: { 60: { min: 6, max: 8 }, 75: { min: 8, max: 10 }, 90: { min: 10, max: 12 } },
      intermediate: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } },
      advanced: { 60: { min: 10, max: 12 }, 75: { min: 12, max: 14 }, 90: { min: 14, max: 16 } }
    },
    calves: {
      beginner: { 60: { min: 6, max: 8 }, 75: { min: 8, max: 10 }, 90: { min: 10, max: 12 } },
      intermediate: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } },
      advanced: { 60: { min: 8, max: 10 }, 75: { min: 10, max: 12 }, 90: { min: 12, max: 14 } }
    }
  },
  
  // Все доступные паттерны для Legs Day
  recommendedPatterns: [
    "squat_pattern",     // Приседания - compound
    "hip_hinge",         // Румынская тяга, становая - compound
    "lunge_pattern",     // Выпады, сплиты - compound/secondary
    "hip_thrust",        // Ягодичный мост - secondary
    "leg_extension",     // Разгибание ног - isolation
    "leg_curl",          // Сгибание ног - isolation
    "calf_raise",        // Икры - isolation
    "glute_isolation"    // Изоляция ягодиц - isolation
  ],
  
  format: {
    type: "standard",
    notes: "Только стандартный формат. Ноги слишком тяжелые для суперсетов."
  },
  
  warmup: {
    durationMinutes: 7,  // Ноги требуют больше разминки
    guidelines: "7 минут кардио + динамическая разминка ног (выпады с весом тела, приседания без веса, махи ногами)"
  },
  
  cooldown: {
    durationMinutes: 5,
    guidelines: "Растяжка квадрицепсов, бицепса бедра, ягодиц. Лёгкое кардио для вывода молочной кислоты."
  },
  
  adaptationRules: {
    canReduce: true,
    minExercises: 3,
    fallbackFocus: "Upper Body",
    avoidIfInjured: ["колени", "спина", "тазобедренный сустав"]
  },
  
  scientificNotes: [
    "Ноги - самые большие мышцы, требуют больше времени на восстановление",
    "Приседания первыми т.к. технически сложные",
    "Тазовые шарниры развивают заднюю цепь (ягодицы, бицепс бедра)",
    "Икры в конце т.к. быстро восстанавливаются"
  ]
};

// Экспорт всех правил
export const TRAINING_RULES_LIBRARY = {
  "Push Day": PPL_PUSH_DAY_RULES,
  "Pull Day": PPL_PULL_DAY_RULES,
  "Legs Day": PPL_LEGS_DAY_RULES
};


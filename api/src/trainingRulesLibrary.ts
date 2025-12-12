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
    // Для advanced + hypertrophy + 90 минут = 6-9 упражнений
    totalExercisesRange: [5, 9],
    
    // БАЗОВЫЕ (compound) - тяжелые многосуставные
    compound: {
      count: [2, 3],  // 2-3 базовых упражнения
      sets: 4,
      reps: "6-8",
      rest: 120,      // 2 минуты
      priority: 1,
      notes: "Тяжелые базовые жимы - фундамент тренировки. Фокус на прогрессии веса. RPE 8-9."
    },
    
    // ВТОРИЧНЫЕ (secondary) - среднетяжелые
    secondary: {
      count: [2, 3],  // 2-3 вторичных
      sets: 3,
      reps: "8-12",
      rest: 90,       // 1.5 минуты
      priority: 2,
      notes: "Проработка под другими углами. Контролируемый темп, связь мозг-мышца. RPE 7-8."
    },
    
    // ИЗОЛЯЦИЯ (isolation) - лёгкие односуставные
    isolation: {
      count: [2, 3],  // 2-3 изоляции
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
  
  recommendedPatterns: {
    // БАЗОВЫЕ: горизонтальные, наклонные, жимы вверх
    compound: [
      "horizontal_press",  // Жим лёжа, жим гантелей
      "incline_press",     // Жим на наклонной
      "overhead_press",    // Жим над головой
      "decline_press",     // Жим под отрицательным углом
      "dips"               // Отжимания на брусьях
    ],
    
    // ВТОРИЧНЫЕ: жимы под углами, разводки
    secondary: [
      "incline_press",
      "overhead_press",
      "chest_fly",         // Разводки на грудь
      "dips"
    ],
    
    // ИЗОЛЯЦИЯ: махи, разгибания, разводки
    isolation: [
      "lateral_raise",     // Махи в стороны
      "front_raise",       // Махи вперёд
      "triceps_extension", // Французский жим
      "triceps_pushdown",  // Разгибания вниз
      "chest_fly",
      "rear_delt_fly"      // Задние дельты
    ]
  },
  
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
    totalExercisesRange: [5, 9],
    
    compound: {
      count: [2, 3],
      sets: 4,
      reps: "6-8",
      rest: 120,
      priority: 1,
      notes: "Вертикальные и горизонтальные тяги. Фокус на широчайшие и середину спины."
    },
    
    secondary: {
      count: [2, 3],
      sets: 3,
      reps: "8-12",
      rest: 90,
      priority: 2,
      notes: "Тяги под углами, вариации хватов. Проработка глубины и деталей."
    },
    
    isolation: {
      count: [2, 3],
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
  
  recommendedPatterns: {
    compound: [
      "vertical_pull",     // Подтягивания, тяга верхнего блока
      "horizontal_pull",   // Тяга штанги/гантелей в наклоне
      "row",               // Тяга к поясу
      "deadlift"           // Становая (если позволяет опыт)
    ],
    
    secondary: [
      "horizontal_pull",
      "row",
      "vertical_pull"
    ],
    
    isolation: [
      "biceps_curl",       // Подъём на бицепс
      "hammer_curl",       // Молотковые подъёмы
      "rear_delt_fly"      // Задние дельты
    ]
  },
  
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
    totalExercisesRange: [5, 8],  // Ноги восстанавливаются дольше
    
    compound: {
      count: [2, 3],
      sets: 4,
      reps: "6-10",  // Чуть больше повторений для ног
      rest: 150,     // 2.5 минуты (ноги требуют больше отдыха)
      priority: 1,
      notes: "Приседания и тазовые шарниры. Самые энергозатратные упражнения."
    },
    
    secondary: {
      count: [2, 3],
      sets: 3,
      reps: "10-15",
      rest: 90,
      priority: 2,
      notes: "Выпады, жим ногами, вариации. Проработка под углами."
    },
    
    isolation: {
      count: [1, 2],  // Меньше изоляции на ногах
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
  
  recommendedPatterns: {
    compound: [
      "squat_pattern",     // Приседания
      "hip_hinge",         // Румынская тяга, становая
      "lunge_pattern",     // Выпады
      "hip_thrust"         // Ягодичный мост
    ],
    
    secondary: [
      "lunge_pattern",
      "squat_pattern",
      "hip_thrust"
    ],
    
    isolation: [
      "leg_extension",     // Разгибание ног
      "leg_curl",          // Сгибание ног
      "calf_raise",        // Икры
      "glute_isolation"    // Изоляция ягодиц
    ]
  },
  
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


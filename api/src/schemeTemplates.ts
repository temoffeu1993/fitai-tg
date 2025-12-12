// Готовые templates для популярных схем тренировок

import { DayTemplate } from "./workoutTemplates.js";

// ============================================================================
// PUSH/PULL/LEGS 5 ДНЕЙ
// ============================================================================

export const PPL_PUSH_A_TEMPLATE: DayTemplate = {
  warmup: {
    duration: 5,
    guidelines: "5 минут кардио низкой интенсивности (дорожка, велик) + динамическая растяжка верха тела (круги руками, разминка плеч и груди)"
  },
  
  exerciseBlocks: [
    {
      name: "Главное базовое упражнение дня",
      movementPattern: "horizontal_press",
      targetMuscles: ["грудь", "трицепс", "передние дельты"],
      exerciseType: "compound",
      sets: 4,
      reps: "6-8",
      rest: 180,
      intensity: "heavy",
      notes: "Тяжёлое базовое - фундамент тренировки. RPE 8-9 на последних подходах. Прогрессия: +2.5кг каждую неделю если выполнил все подходы с хорошей техникой.",
      alternatives: ["incline_press"] // если плечо болит
    },
    {
      name: "Вторичное базовое на верх груди",
      movementPattern: "incline_press",
      targetMuscles: ["верх груди", "передние дельты", "трицепс"],
      exerciseType: "compound",
      sets: 3,
      reps: "8-12",
      rest: 120,
      intensity: "moderate",
      notes: "Проработка верха груди под другим углом. RPE 7-8.",
      alternatives: ["horizontal_press"]
    },
    {
      name: "Жим на плечи",
      movementPattern: "overhead_press",
      targetMuscles: ["средние дельты", "передние дельты", "трицепс"],
      exerciseType: "compound",
      sets: 3,
      reps: "10-12",
      rest: 90,
      intensity: "moderate",
      notes: "Дополнительный объём на плечи и трицепс.",
      alternatives: ["lateral_raise", "front_raise"]
    },
    {
      name: "Изоляция на средние дельты",
      movementPattern: "lateral_raise",
      targetMuscles: ["средние дельты"],
      exerciseType: "isolation",
      sets: 3,
      reps: "12-15",
      rest: 60,
      intensity: "light",
      notes: "Изолированная работа на ширину плеч. Контролируемый темп."
    },
    {
      name: "Изоляция на трицепс",
      movementPattern: "triceps_pushdown",
      targetMuscles: ["трицепс"],
      exerciseType: "isolation",
      sets: 3,
      reps: "12-15",
      rest: 60,
      intensity: "light",
      notes: "Завершающая изоляция на трицепс для пампинга."
    }
  ],
  
  cooldown: {
    duration: 5,
    guidelines: "Статическая растяжка груди (30 сек), плеч (30 сек), трицепса (30 сек). Дыхательные упражнения."
  },
  
  totalExercises: 5,
  totalSets: 16,
  estimatedDuration: 60,
  
  trainingStyle: {
    tempo: "controlled",
    restBetweenExercises: 60,
    supersets: undefined,
    circuit: false,
    dropsets: undefined,
    pyramids: undefined
  },
  
  adaptationRules: {
    canReduce: {
      minExercises: 3,      // Можно убрать 2 изоляции
      minSets: 10,          // Минимум 10 подходов
      minIntensity: "light"
    },
    skipConditions: {
      painLevel: 7,         // Боль 7+ в верхе тела → пропуск
      sleepHours: 4,        // Сон < 4 часов → пропуск
      multipleIssues: true  // Несколько проблем → пропуск
    },
    fallbackFocus: "legs", // Если верх нельзя → ноги
    requiredRecoveryHours: 36 // Минимум 36 часов от предыдущего "Push"
  }
};

export const PPL_PULL_A_TEMPLATE: DayTemplate = {
  warmup: {
    duration: 5,
    guidelines: "5 минут кардио + динамическая растяжка спины, рук, вращения в плечах"
  },
  
  exerciseBlocks: [
    {
      name: "Главное базовое на спину",
      movementPattern: "vertical_pull",
      targetMuscles: ["широчайшие", "бицепс", "задние дельты"],
      exerciseType: "compound",
      sets: 4,
      reps: "6-10",
      rest: 180,
      intensity: "heavy",
      notes: "Тяжёлая вертикальная тяга - фундамент спины. Если подтягивания тяжело - тяга верхнего блока.",
      alternatives: ["horizontal_pull"]
    },
    {
      name: "Горизонтальная тяга",
      movementPattern: "horizontal_pull",
      targetMuscles: ["середина спины", "ромбовидные", "бицепс"],
      exerciseType: "compound",
      sets: 3,
      reps: "8-12",
      rest: 120,
      intensity: "moderate",
      notes: "Проработка толщины спины. RPE 7-8."
    },
    {
      name: "Дополнительная тяга или становая",
      movementPattern: "row",
      targetMuscles: ["спина", "задние дельты", "бицепс"],
      exerciseType: "compound",
      sets: 3,
      reps: "10-12",
      rest: 90,
      intensity: "moderate",
      notes: "Ещё один угол нагрузки на спину."
    },
    {
      name: "Изоляция задних дельт",
      movementPattern: "rear_delt_fly",
      targetMuscles: ["задние дельты", "верх спины"],
      exerciseType: "isolation",
      sets: 3,
      reps: "12-15",
      rest: 60,
      intensity: "light",
      notes: "Важно для баланса плеч и здоровья."
    },
    {
      name: "Изоляция бицепса",
      movementPattern: "biceps_curl",
      targetMuscles: ["бицепс"],
      exerciseType: "isolation",
      sets: 3,
      reps: "10-12",
      rest: 60,
      intensity: "light",
      notes: "Завершающая работа на бицепс."
    }
  ],
  
  cooldown: {
    duration: 5,
    guidelines: "Растяжка спины, бицепса, плеч. Висы на турнике 20-30 сек для декомпрессии позвоночника."
  },
  
  totalExercises: 5,
  totalSets: 16,
  estimatedDuration: 60,
  
  trainingStyle: {
    tempo: "controlled",
    restBetweenExercises: 60,
    supersets: undefined,
    circuit: false,
    dropsets: undefined
  },
  
  adaptationRules: {
    canReduce: {
      minExercises: 3,
      minSets: 10,
      minIntensity: "light"
    },
    skipConditions: {
      painLevel: 7,
      sleepHours: 4,
      multipleIssues: true
    },
    fallbackFocus: "legs",
    requiredRecoveryHours: 36
  }
};

export const PPL_LEGS_A_TEMPLATE: DayTemplate = {
  warmup: {
    duration: 7,
    guidelines: "5 минут кардио + динамическая разминка ног (выпады с весом тела, круги в коленях и тазу, приседания без веса)"
  },
  
  exerciseBlocks: [
    {
      name: "Главное базовое на ноги",
      movementPattern: "squat_pattern",
      targetMuscles: ["квадрицепсы", "ягодицы", "кор"],
      exerciseType: "compound",
      sets: 4,
      reps: "6-10",
      rest: 210,
      intensity: "heavy",
      notes: "Тяжёлые приседания - король упражнений на ноги. Прогрессия: +5кг каждую неделю.",
      alternatives: ["leg_extension", "lunge_pattern"] // если колени/спина болит
    },
    {
      name: "Тазовый шарнир (задняя цепь)",
      movementPattern: "hip_hinge",
      targetMuscles: ["бицепс бедра", "ягодицы", "низ спины"],
      exerciseType: "compound",
      sets: 3,
      reps: "8-12",
      rest: 150,
      intensity: "moderate",
      notes: "Румынка или становая - задняя поверхность и ягодицы."
    },
    {
      name: "Выпады или сплиты",
      movementPattern: "lunge_pattern",
      targetMuscles: ["квадрицепсы", "ягодицы", "баланс"],
      exerciseType: "compound",
      sets: 3,
      reps: "10-12",
      rest: 90,
      intensity: "moderate",
      notes: "Односторонняя работа для баланса и формы ног."
    },
    {
      name: "Изоляция квадрицепсов",
      movementPattern: "leg_extension",
      targetMuscles: ["квадрицепсы"],
      exerciseType: "isolation",
      sets: 3,
      reps: "12-15",
      rest: 60,
      intensity: "light",
      notes: "Дополнительный объём на переднюю поверхность."
    },
    {
      name: "Изоляция бицепса бедра",
      movementPattern: "leg_curl",
      targetMuscles: ["бицепс бедра"],
      exerciseType: "isolation",
      sets: 3,
      reps: "12-15",
      rest: 60,
      intensity: "light",
      notes: "Изоляция задней поверхности."
    }
  ],
  
  cooldown: {
    duration: 5,
    guidelines: "Растяжка квадрицепсов, бицепса бедра, ягодиц, икр. Раскатка на foam roller."
  },
  
  totalExercises: 5,
  totalSets: 16,
  estimatedDuration: 65,
  
  trainingStyle: {
    tempo: "controlled",
    restBetweenExercises: 90,
    supersets: undefined,
    circuit: false,
    dropsets: undefined
  },
  
  adaptationRules: {
    canReduce: {
      minExercises: 3,
      minSets: 9,
      minIntensity: "light"
    },
    skipConditions: {
      painLevel: 8,
      sleepHours: 4,
      multipleIssues: true
    },
    fallbackFocus: "upper", // Если ноги нельзя → верх
    requiredRecoveryHours: 48 // Ноги нужно больше времени
  }
};

// ============================================================================
// FULL BODY 3 ДНЯNEWBIE-FRIENDLY
// ============================================================================

export const FULL_BODY_A_TEMPLATE: DayTemplate = {
  warmup: {
    duration: 5,
    guidelines: "5 минут легкого кардио + динамическая растяжка всего тела"
  },
  
  exerciseBlocks: [
    {
      name: "Базовое на ноги",
      movementPattern: "squat_pattern",
      targetMuscles: ["квадрицепсы", "ягодицы"],
      exerciseType: "compound",
      sets: 3,
      reps: "8-12",
      rest: 150,
      intensity: "moderate",
      notes: "Начинаем с ног - самая большая группа мышц. Для новичков - консервативные веса, фокус на технике."
    },
    {
      name: "Горизонтальный жим",
      movementPattern: "horizontal_press",
      targetMuscles: ["грудь", "трицепс", "плечи"],
      exerciseType: "compound",
      sets: 3,
      reps: "8-12",
      rest: 120,
      intensity: "moderate",
      notes: "Жим лёжа или гантелями - основа для верха тела."
    },
    {
      name: "Вертикальная или горизонтальная тяга",
      movementPattern: "vertical_pull",
      targetMuscles: ["спина", "бицепс"],
      exerciseType: "compound",
      sets: 3,
      reps: "8-12",
      rest: 120,
      intensity: "moderate",
      notes: "Тяга для спины - баланс с жимом.",
      alternatives: ["horizontal_pull"]
    },
    {
      name: "Задняя цепь",
      movementPattern: "hip_hinge",
      targetMuscles: ["бицепс бедра", "ягодицы", "низ спины"],
      exerciseType: "compound",
      sets: 2,
      reps: "10-12",
      rest: 90,
      intensity: "light",
      notes: "Румынка - задняя поверхность важна для баланса."
    },
    {
      name: "Кор / Пресс",
      movementPattern: "core_anti_extension",
      targetMuscles: ["пресс", "кор"],
      exerciseType: "isolation",
      sets: 2,
      reps: "30-60 сек",
      rest: 60,
      intensity: "light",
      notes: "Планка или другие упражнения на кор."
    }
  ],
  
  cooldown: {
    duration: 5,
    guidelines: "Легкая растяжка всех групп мышц"
  },
  
  totalExercises: 5,
  totalSets: 13,
  estimatedDuration: 50,
  
  trainingStyle: {
    tempo: "controlled",
    restBetweenExercises: 60,
    supersets: undefined,
    circuit: false,
    dropsets: undefined
  },
  
  adaptationRules: {
    canReduce: {
      minExercises: 3,
      minSets: 8,
      minIntensity: "light"
    },
    skipConditions: {
      painLevel: 7,
      sleepHours: 5,
      multipleIssues: true
    },
    requiredRecoveryHours: 48
  }
};


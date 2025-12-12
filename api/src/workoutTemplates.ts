// Типы движений и шаблоны тренировок

// Типы движений для подбора упражнений
export type MovementPattern =
  // ТОЛКАЮЩИЕ (PUSH)
  | "horizontal_press"      // Горизонтальный жим (грудь)
  | "incline_press"         // Наклонный жим (верх груди)
  | "decline_press"         // Жим под отрицательным углом
  | "overhead_press"        // Жим вверх (плечи)
  | "dips"                  // Отжимания на брусьях
  
  // ТЯНУЩИЕ (PULL)
  | "horizontal_pull"       // Горизонтальная тяга (середина спины)
  | "vertical_pull"         // Вертикальная тяга (широчайшие)
  | "deadlift"             // Становая тяга
  | "row"                  // Тяга к поясу
  
  // НОГИ
  | "squat_pattern"        // Приседания
  | "hip_hinge"            // Тазовый шарнир (румынка, становая)
  | "lunge_pattern"        // Выпады
  | "hip_thrust"           // Толчки бедром (ягодицы)
  | "leg_extension"        // Разгибание ног
  | "leg_curl"             // Сгибание ног
  | "calf_raise"           // Подъем на носки
  
  // ИЗОЛЯЦИЯ ВЕРХ
  | "lateral_raise"        // Махи в стороны (плечи)
  | "front_raise"          // Махи вперед (плечи)
  | "rear_delt_fly"        // Разводки на задние дельты
  | "chest_fly"            // Разводки на грудь
  | "triceps_extension"    // Разгибания на трицепс
  | "triceps_pushdown"     // Жим вниз на трицепс
  | "biceps_curl"          // Подъем на бицепс
  | "hammer_curl"          // Молотковые подъемы
  
  // ИЗОЛЯЦИЯ НИЗ
  | "glute_isolation"      // Изоляция ягодиц (отведения и т.п.)
  | "adductor"             // Приведение бедра
  | "abductor"             // Отведение бедра
  
  // КОР И ФУНКЦИОНАЛЬНЫЕ
  | "core_anti_extension"  // Планки, rollouts
  | "core_anti_rotation"   // Боковые планки, паллоф-пресс
  | "core_flexion"         // Скручивания
  | "carry"                // Переноски (farmer's walk и т.п.)
  
  // КАРДИО/CONDITIONING
  | "cardio_steady"        // Ровное кардио
  | "cardio_intervals"     // Интервальное кардио
  | "metabolic_circuit";   // Метаболические круги

export type ExerciseType = "compound" | "secondary" | "isolation" | "cardio";
export type IntensityLevel = "light" | "moderate" | "heavy";
export type TrainingTempo = "controlled" | "explosive" | "slow" | "mixed";

// Целевые группы мышц для подсчёта объёма
export type MuscleGroup = 
  | "chest"           // Грудь
  | "shoulders"       // Плечи (все пучки)
  | "front_delts"     // Передние дельты
  | "side_delts"      // Средние дельты
  | "rear_delts"      // Задние дельты
  | "triceps"         // Трицепс
  | "back"            // Спина (общее)
  | "lats"            // Широчайшие
  | "mid_back"        // Середина спины
  | "lower_back"      // Поясница
  | "traps"           // Трапеции
  | "biceps"          // Бицепс
  | "forearms"        // Предплечья
  | "quads"           // Квадрицепсы
  | "hamstrings"      // Бицепс бедра
  | "glutes"          // Ягодицы
  | "calves"          // Икры
  | "abs"             // Пресс
  | "obliques"        // Косые мышцы
  | "core";           // Кор (общее)

// Упражнение с полными метаданными
export type Exercise = {
  name: string;                    // Название упражнения
  pattern: MovementPattern;        // Паттерн движения
  primaryMuscle: MuscleGroup;      // ОСНОВНАЯ целевая группа (для подсчёта объёма)
  type: ExerciseType;              // Тип: compound/secondary/isolation
  difficulty?: "beginner" | "intermediate" | "advanced";  // Уровень сложности
};

// Структура одного блока упражнений в тренировке
export type ExerciseBlock = {
  name: string;                    // Название блока (для понимания)
  movementPattern: MovementPattern; // Тип движения
  targetMuscles: string[];         // Целевые мышцы
  exerciseType: ExerciseType;      // Тип упражнения
  sets: number;                    // Количество подходов
  reps: string;                    // Диапазон повторений (например "6-8")
  rest: number;                    // Отдых в секундах
  intensity: IntensityLevel;       // Интенсивность
  tempo?: string;                  // Темп (например "3010")
  notes?: string;                  // Заметки для AI
  alternatives?: MovementPattern[]; // Альтернативные паттерны на случай травмы
};

// Особенности стиля тренировки
export type TrainingStyle = {
  tempo: TrainingTempo;            // Общий темп тренировки
  restBetweenExercises?: number;   // Отдых между упражнениями (если отличается)
  supersets?: number[][];          // Массив пар индексов для суперсетов [[0,1], [2,3]]
  circuit?: boolean;               // Круговая тренировка
  dropsets?: number[];             // Индексы упражнений с дропсетами
  pyramids?: number[];             // Индексы упражнений с пирамидами
  restPause?: number[];            // Индексы упражнений с rest-pause
};

// Правила адаптации тренировки
export type AdaptationRules = {
  canReduce: {
    minExercises: number;          // Минимум упражнений при облегчении
    minSets: number;               // Минимум подходов при облегчении
    minIntensity: IntensityLevel;  // Минимальная интенсивность
  };
  skipConditions: {
    painLevel: number;             // Уровень боли для пропуска (1-10)
    sleepHours: number;            // Минимум часов сна (меньше = пропуск)
    multipleIssues: boolean;       // Пропускать если несколько проблем
  };
  fallbackFocus?: string;          // Альтернативный фокус (например "legs" если верх нельзя)
  requiredRecoveryHours?: number;  // Минимум часов восстановления
};

// Полный шаблон дня тренировки
export type DayTemplate = {
  warmup: {
    duration: number;              // Длительность разминки (минуты)
    guidelines: string;            // Описание разминки
  };
  exerciseBlocks: ExerciseBlock[];
  cooldown: {
    duration: number;              // Длительность заминки (минуты)
    guidelines: string;            // Описание заминки
  };
  totalExercises: number;          // Всего упражнений
  totalSets: number;               // Всего подходов
  estimatedDuration: number;       // Ожидаемая длительность (минуты)
  trainingStyle: TrainingStyle;
  adaptationRules: AdaptationRules;
};

// База упражнений по типам движений (с метаданными)
export const MOVEMENT_PATTERNS_DB: Record<MovementPattern, Exercise[]> = {
  // ========== ТОЛКАЮЩИЕ (PUSH) ==========
  
  horizontal_press: [
    { name: "Жим штанги лёжа", pattern: "horizontal_press", primaryMuscle: "chest", type: "compound", difficulty: "intermediate" },
    { name: "Жим гантелей горизонтально", pattern: "horizontal_press", primaryMuscle: "chest", type: "compound", difficulty: "beginner" },
    { name: "Жим в машине Смита горизонтально", pattern: "horizontal_press", primaryMuscle: "chest", type: "secondary", difficulty: "beginner" },
    { name: "Отжимания с весом", pattern: "horizontal_press", primaryMuscle: "chest", type: "compound", difficulty: "advanced" },
    { name: "Жим в тренажере на грудь", pattern: "horizontal_press", primaryMuscle: "chest", type: "secondary", difficulty: "beginner" }
  ],
  
  incline_press: [
    { name: "Жим штанги на наклонной 30°", pattern: "incline_press", primaryMuscle: "chest", type: "compound", difficulty: "intermediate" },
    { name: "Жим гантелей на наклонной", pattern: "incline_press", primaryMuscle: "chest", type: "compound", difficulty: "beginner" },
    { name: "Жим в машине Смита на наклонной", pattern: "incline_press", primaryMuscle: "chest", type: "secondary", difficulty: "beginner" },
    { name: "Жим в тренажере наклон", pattern: "incline_press", primaryMuscle: "chest", type: "secondary", difficulty: "beginner" }
  ],
  
  decline_press: [
    { name: "Жим штанги на отрицательном наклоне", pattern: "decline_press", primaryMuscle: "chest", type: "compound", difficulty: "intermediate" },
    { name: "Жим гантелей на отрицательном наклоне", pattern: "decline_press", primaryMuscle: "chest", type: "compound", difficulty: "beginner" }
  ],
  
  overhead_press: [
    { name: "Армейский жим стоя", pattern: "overhead_press", primaryMuscle: "shoulders", type: "compound", difficulty: "intermediate" },
    { name: "Жим штанги сидя", pattern: "overhead_press", primaryMuscle: "shoulders", type: "compound", difficulty: "beginner" },
    { name: "Жим гантелей вверх", pattern: "overhead_press", primaryMuscle: "shoulders", type: "compound", difficulty: "beginner" },
    { name: "Жим в машине Смита вертикально", pattern: "overhead_press", primaryMuscle: "shoulders", type: "secondary", difficulty: "beginner" }
  ],
  
  dips: [
    { name: "Отжимания на брусьях", pattern: "dips", primaryMuscle: "chest", type: "secondary", difficulty: "intermediate" },
    { name: "Отжимания на брусьях в тренажере", pattern: "dips", primaryMuscle: "chest", type: "secondary", difficulty: "beginner" },
    { name: "Отжимания от скамьи на трицепс", pattern: "dips", primaryMuscle: "triceps", type: "secondary", difficulty: "beginner" }
  ],
  
  // ========== ТЯНУЩИЕ (PULL) ==========
  
  horizontal_pull: [
    { name: "Тяга штанги к поясу", pattern: "horizontal_pull", primaryMuscle: "mid_back", type: "compound", difficulty: "intermediate" },
    { name: "Тяга гантелей к поясу", pattern: "horizontal_pull", primaryMuscle: "mid_back", type: "compound", difficulty: "beginner" },
    { name: "Тяга блока к поясу сидя", pattern: "horizontal_pull", primaryMuscle: "mid_back", type: "compound", difficulty: "beginner" },
    { name: "Тяга Т-грифа", pattern: "horizontal_pull", primaryMuscle: "mid_back", type: "compound", difficulty: "intermediate" },
    { name: "Тяга в тренажере Хаммер", pattern: "horizontal_pull", primaryMuscle: "mid_back", type: "secondary", difficulty: "beginner" }
  ],
  
  vertical_pull: [
    { name: "Подтягивания широким хватом", pattern: "vertical_pull", primaryMuscle: "lats", type: "compound", difficulty: "intermediate" },
    { name: "Подтягивания нейтральным хватом", pattern: "vertical_pull", primaryMuscle: "lats", type: "compound", difficulty: "intermediate" },
    { name: "Тяга верхнего блока широким хватом", pattern: "vertical_pull", primaryMuscle: "lats", type: "compound", difficulty: "beginner" },
    { name: "Подтягивания с резинкой", pattern: "vertical_pull", primaryMuscle: "lats", type: "compound", difficulty: "beginner" },
    { name: "Тяга верхнего блока узким хватом", pattern: "vertical_pull", primaryMuscle: "lats", type: "compound", difficulty: "beginner" }
  ],
  
  deadlift: [
    { name: "Становая тяга классическая", pattern: "deadlift", primaryMuscle: "lower_back", type: "compound", difficulty: "advanced" },
    { name: "Становая тяга сумо", pattern: "deadlift", primaryMuscle: "lower_back", type: "compound", difficulty: "advanced" },
    { name: "Становая тяга с плинтов", pattern: "deadlift", primaryMuscle: "lower_back", type: "compound", difficulty: "intermediate" }
  ],
  
  row: [
    { name: "Тяга штанги в наклоне", pattern: "row", primaryMuscle: "mid_back", type: "compound", difficulty: "intermediate" },
    { name: "Тяга гантелей в наклоне", pattern: "row", primaryMuscle: "mid_back", type: "compound", difficulty: "beginner" },
    { name: "Тяга блока к поясу сидя", pattern: "row", primaryMuscle: "mid_back", type: "compound", difficulty: "beginner" }
  ],
  
  // ========== НОГИ (LEGS) ==========
  
  squat_pattern: [
    { name: "Приседания со штангой на спине", pattern: "squat_pattern", primaryMuscle: "quads", type: "compound", difficulty: "intermediate" },
    { name: "Фронтальные приседания", pattern: "squat_pattern", primaryMuscle: "quads", type: "compound", difficulty: "advanced" },
    { name: "Приседания с гантелями", pattern: "squat_pattern", primaryMuscle: "quads", type: "compound", difficulty: "beginner" },
    { name: "Приседания в машине Смита", pattern: "squat_pattern", primaryMuscle: "quads", type: "secondary", difficulty: "beginner" },
    { name: "Гоблет-приседания", pattern: "squat_pattern", primaryMuscle: "quads", type: "compound", difficulty: "beginner" },
    { name: "Жим ногами", pattern: "squat_pattern", primaryMuscle: "quads", type: "secondary", difficulty: "beginner" }
  ],
  
  hip_hinge: [
    { name: "Румынская тяга со штангой", pattern: "hip_hinge", primaryMuscle: "hamstrings", type: "compound", difficulty: "intermediate" },
    { name: "Румынская тяга с гантелями", pattern: "hip_hinge", primaryMuscle: "hamstrings", type: "compound", difficulty: "beginner" },
    { name: "Гудморнинг", pattern: "hip_hinge", primaryMuscle: "hamstrings", type: "compound", difficulty: "advanced" },
    { name: "Тяга с гирей", pattern: "hip_hinge", primaryMuscle: "hamstrings", type: "compound", difficulty: "beginner" },
    { name: "Наклоны со штангой", pattern: "hip_hinge", primaryMuscle: "lower_back", type: "compound", difficulty: "intermediate" }
  ],
  
  lunge_pattern: [
    { name: "Выпады вперед со штангой", pattern: "lunge_pattern", primaryMuscle: "quads", type: "compound", difficulty: "intermediate" },
    { name: "Болгарские сплит-приседания", pattern: "lunge_pattern", primaryMuscle: "quads", type: "compound", difficulty: "intermediate" },
    { name: "Обратные выпады", pattern: "lunge_pattern", primaryMuscle: "quads", type: "compound", difficulty: "beginner" },
    { name: "Выпады в ходьбе", pattern: "lunge_pattern", primaryMuscle: "quads", type: "compound", difficulty: "intermediate" },
    { name: "Выпады с гантелями", pattern: "lunge_pattern", primaryMuscle: "quads", type: "compound", difficulty: "beginner" }
  ],
  
  hip_thrust: [
    { name: "Ягодичный мост со штангой", pattern: "hip_thrust", primaryMuscle: "glutes", type: "compound", difficulty: "beginner" },
    { name: "Толчки бедром в тренажере", pattern: "hip_thrust", primaryMuscle: "glutes", type: "secondary", difficulty: "beginner" },
    { name: "Ягодичный мост с гантелей", pattern: "hip_thrust", primaryMuscle: "glutes", type: "compound", difficulty: "beginner" },
    { name: "Ягодичный мост одной ногой", pattern: "hip_thrust", primaryMuscle: "glutes", type: "compound", difficulty: "intermediate" }
  ],
  
  leg_extension: [
    { name: "Разгибание ног в тренажере", pattern: "leg_extension", primaryMuscle: "quads", type: "isolation", difficulty: "beginner" },
    { name: "Разгибание одной ноги", pattern: "leg_extension", primaryMuscle: "quads", type: "isolation", difficulty: "beginner" }
  ],
  
  leg_curl: [
    { name: "Сгибание ног лежа", pattern: "leg_curl", primaryMuscle: "hamstrings", type: "isolation", difficulty: "beginner" },
    { name: "Сгибание ног сидя", pattern: "leg_curl", primaryMuscle: "hamstrings", type: "isolation", difficulty: "beginner" },
    { name: "Сгибание одной ноги стоя", pattern: "leg_curl", primaryMuscle: "hamstrings", type: "isolation", difficulty: "beginner" }
  ],
  
  calf_raise: [
    { name: "Подъем на носки стоя", pattern: "calf_raise", primaryMuscle: "calves", type: "isolation", difficulty: "beginner" },
    { name: "Подъем на носки сидя", pattern: "calf_raise", primaryMuscle: "calves", type: "isolation", difficulty: "beginner" },
    { name: "Подъем на носки в тренажере", pattern: "calf_raise", primaryMuscle: "calves", type: "isolation", difficulty: "beginner" }
  ],
  
  // ========== ИЗОЛЯЦИЯ ВЕРХ ==========
  
  lateral_raise: [
    { name: "Махи гантелями в стороны", pattern: "lateral_raise", primaryMuscle: "side_delts", type: "isolation", difficulty: "beginner" },
    { name: "Махи в кроссовере в стороны", pattern: "lateral_raise", primaryMuscle: "side_delts", type: "isolation", difficulty: "beginner" },
    { name: "Махи с резиной в стороны", pattern: "lateral_raise", primaryMuscle: "side_delts", type: "isolation", difficulty: "beginner" },
    { name: "Махи на тренажере для дельт", pattern: "lateral_raise", primaryMuscle: "side_delts", type: "isolation", difficulty: "beginner" }
  ],
  
  front_raise: [
    { name: "Махи гантелями вперед", pattern: "front_raise", primaryMuscle: "front_delts", type: "isolation", difficulty: "beginner" },
    { name: "Махи штангой вперед", pattern: "front_raise", primaryMuscle: "front_delts", type: "isolation", difficulty: "intermediate" },
    { name: "Махи в кроссовере вперед", pattern: "front_raise", primaryMuscle: "front_delts", type: "isolation", difficulty: "beginner" }
  ],
  
  rear_delt_fly: [
    { name: "Разводки на заднюю дельту с гантелями", pattern: "rear_delt_fly", primaryMuscle: "rear_delts", type: "isolation", difficulty: "beginner" },
    { name: "Обратные разводки в тренажере", pattern: "rear_delt_fly", primaryMuscle: "rear_delts", type: "isolation", difficulty: "beginner" },
    { name: "Тяга канатной рукояти к лицу", pattern: "rear_delt_fly", primaryMuscle: "rear_delts", type: "isolation", difficulty: "intermediate" }
  ],
  
  chest_fly: [
    { name: "Разводки гантелей лежа", pattern: "chest_fly", primaryMuscle: "chest", type: "isolation", difficulty: "beginner" },
    { name: "Разводки в кроссовере", pattern: "chest_fly", primaryMuscle: "chest", type: "isolation", difficulty: "beginner" },
    { name: "Разводки в тренажере бабочка", pattern: "chest_fly", primaryMuscle: "chest", type: "isolation", difficulty: "beginner" }
  ],
  
  triceps_extension: [
    { name: "Французский жим лежа", pattern: "triceps_extension", primaryMuscle: "triceps", type: "isolation", difficulty: "intermediate" },
    { name: "Французский жим с гантелей", pattern: "triceps_extension", primaryMuscle: "triceps", type: "isolation", difficulty: "beginner" },
    { name: "Разгибания над головой с гантелей", pattern: "triceps_extension", primaryMuscle: "triceps", type: "isolation", difficulty: "beginner" }
  ],
  
  triceps_pushdown: [
    { name: "Разгибания на блоке прямой рукоятью", pattern: "triceps_pushdown", primaryMuscle: "triceps", type: "isolation", difficulty: "beginner" },
    { name: "Разгибания с канатом", pattern: "triceps_pushdown", primaryMuscle: "triceps", type: "isolation", difficulty: "beginner" },
    { name: "Разгибания обратным хватом", pattern: "triceps_pushdown", primaryMuscle: "triceps", type: "isolation", difficulty: "intermediate" }
  ],
  
  biceps_curl: [
    { name: "Подъем штанги на бицепс", pattern: "biceps_curl", primaryMuscle: "biceps", type: "isolation", difficulty: "beginner" },
    { name: "Подъем гантелей на бицепс", pattern: "biceps_curl", primaryMuscle: "biceps", type: "isolation", difficulty: "beginner" },
    { name: "Подъем на бицепс в тренажере", pattern: "biceps_curl", primaryMuscle: "biceps", type: "isolation", difficulty: "beginner" },
    { name: "Концентрированные подъемы", pattern: "biceps_curl", primaryMuscle: "biceps", type: "isolation", difficulty: "intermediate" }
  ],
  
  hammer_curl: [
    { name: "Молотковые подъемы с гантелями", pattern: "hammer_curl", primaryMuscle: "biceps", type: "isolation", difficulty: "beginner" },
    { name: "Молотковые подъемы с канатом", pattern: "hammer_curl", primaryMuscle: "biceps", type: "isolation", difficulty: "beginner" }
  ],
  
  // ========== ИЗОЛЯЦИЯ НИЗ ==========
  
  glute_isolation: [
    { name: "Отведения в тренажере", pattern: "glute_isolation", primaryMuscle: "glutes", type: "isolation", difficulty: "beginner" },
    { name: "Ягодичные отведения стоя на блоке", pattern: "glute_isolation", primaryMuscle: "glutes", type: "isolation", difficulty: "beginner" },
    { name: "Пожарный гидрант", pattern: "glute_isolation", primaryMuscle: "glutes", type: "isolation", difficulty: "beginner" },
    { name: "Kick-backs на блоке", pattern: "glute_isolation", primaryMuscle: "glutes", type: "isolation", difficulty: "beginner" }
  ],
  
  adductor: [
    { name: "Приведение бедра в тренажере", pattern: "adductor", primaryMuscle: "quads", type: "isolation", difficulty: "beginner" },
    { name: "Приседания с резиной между ног", pattern: "adductor", primaryMuscle: "quads", type: "isolation", difficulty: "beginner" }
  ],
  
  abductor: [
    { name: "Отведение бедра в тренажере", pattern: "abductor", primaryMuscle: "glutes", type: "isolation", difficulty: "beginner" },
    { name: "Отведения с резиной", pattern: "abductor", primaryMuscle: "glutes", type: "isolation", difficulty: "beginner" }
  ],
  
  // ========== КОР ==========
  
  core_anti_extension: [
    { name: "Планка классическая", pattern: "core_anti_extension", primaryMuscle: "abs", type: "isolation", difficulty: "beginner" },
    { name: "Планка на предплечьях", pattern: "core_anti_extension", primaryMuscle: "abs", type: "isolation", difficulty: "beginner" },
    { name: "Rollout с роликом", pattern: "core_anti_extension", primaryMuscle: "abs", type: "isolation", difficulty: "advanced" },
    { name: "Планка на фитболе", pattern: "core_anti_extension", primaryMuscle: "abs", type: "isolation", difficulty: "intermediate" }
  ],
  
  core_anti_rotation: [
    { name: "Боковая планка", pattern: "core_anti_rotation", primaryMuscle: "obliques", type: "isolation", difficulty: "beginner" },
    { name: "Паллоф-пресс", pattern: "core_anti_rotation", primaryMuscle: "obliques", type: "isolation", difficulty: "intermediate" },
    { name: "Дровосек на блоке", pattern: "core_anti_rotation", primaryMuscle: "obliques", type: "isolation", difficulty: "intermediate" }
  ],
  
  core_flexion: [
    { name: "Скручивания на полу", pattern: "core_flexion", primaryMuscle: "abs", type: "isolation", difficulty: "beginner" },
    { name: "Скручивания на блоке", pattern: "core_flexion", primaryMuscle: "abs", type: "isolation", difficulty: "beginner" },
    { name: "Подъемы ног в висе", pattern: "core_flexion", primaryMuscle: "abs", type: "isolation", difficulty: "intermediate" }
  ],
  
  carry: [
    { name: "Прогулка фермера с гантелями", pattern: "carry", primaryMuscle: "core", type: "compound", difficulty: "beginner" },
    { name: "Прогулка с гирями", pattern: "carry", primaryMuscle: "core", type: "compound", difficulty: "beginner" },
    { name: "Прогулка с одной гантелей (офсет)", pattern: "carry", primaryMuscle: "core", type: "compound", difficulty: "intermediate" }
  ],
  
  // ========== КАРДИО ==========
  
  cardio_steady: [
    { name: "Беговая дорожка ровный темп", pattern: "cardio_steady", primaryMuscle: "quads", type: "cardio", difficulty: "beginner" },
    { name: "Велотренажер", pattern: "cardio_steady", primaryMuscle: "quads", type: "cardio", difficulty: "beginner" },
    { name: "Эллиптический тренажер", pattern: "cardio_steady", primaryMuscle: "quads", type: "cardio", difficulty: "beginner" },
    { name: "Гребной тренажер", pattern: "cardio_steady", primaryMuscle: "back", type: "cardio", difficulty: "intermediate" }
  ],
  
  cardio_intervals: [
    { name: "Спринты на беговой дорожке", pattern: "cardio_intervals", primaryMuscle: "quads", type: "cardio", difficulty: "intermediate" },
    { name: "Интервалы на велотренажере", pattern: "cardio_intervals", primaryMuscle: "quads", type: "cardio", difficulty: "beginner" },
    { name: "Интервалы на эллипсе", pattern: "cardio_intervals", primaryMuscle: "quads", type: "cardio", difficulty: "beginner" }
  ],
  
  metabolic_circuit: [
    { name: "Бёрпи", pattern: "metabolic_circuit", primaryMuscle: "core", type: "cardio", difficulty: "intermediate" },
    { name: "Jumping jacks", pattern: "metabolic_circuit", primaryMuscle: "core", type: "cardio", difficulty: "beginner" },
    { name: "Маунтин-клаймберы", pattern: "metabolic_circuit", primaryMuscle: "core", type: "cardio", difficulty: "intermediate" },
    { name: "Прыжки на скакалке", pattern: "metabolic_circuit", primaryMuscle: "calves", type: "cardio", difficulty: "beginner" }
  ]
};


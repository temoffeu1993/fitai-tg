// exerciseLibrary.ts
// ============================================================================
// Очищенная база упражнений (GYM-only, ~92 уникальных упражнений).
// Generator selects exercises ONLY from this list.
//
// Includes coach-like metadata:
// - setupCost: 1..5          (setup complexity / transitions)
// - stabilityDemand: 1..5    (coordination/stability requirement)
// - tags: selection hints    (circuits, supersets, bias, joint-friendly, etc.)
//
// Adds:
// - historyAvoidance: avoid repeating exercises from last N sessions
// - muscleBias: optionally bias selection toward weak/priority muscles
// ============================================================================

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "smith"
  | "bodyweight"
  | "kettlebell"
  | "bands"
  | "bench"
  | "pullup_bar"
  | "trx"
  | "sled"
  | "cardio_machine"
  | "landmine";

export type Experience = "beginner" | "intermediate" | "advanced";

export type Pattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "hip_thrust"
  | "horizontal_push"
  | "incline_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "rear_delts"
  | "delts_iso"
  | "arms_iso"
  | "calves"
  | "core"
  | "carry"
  | "conditioning_low_impact"
  | "conditioning_intervals";

export type MuscleGroup =
  | "quads"
  | "glutes"
  | "hamstrings"
  | "calves"
  | "chest"
  | "lats"
  | "upper_back"
  | "rear_delts"
  | "front_delts"
  | "side_delts"
  | "triceps"
  | "biceps"
  | "forearms"
  | "core"
  | "lower_back";

export type JointFlag =
  | "knee_sensitive"
  | "low_back_sensitive"
  | "shoulder_sensitive"
  | "wrist_sensitive"
  | "hip_sensitive"
  | "elbow_sensitive";

export type ExerciseKind = "compound" | "isolation" | "conditioning" | "carry" | "core";

export type Exercise = {
  id: string;

  name: string; // RU
  nameEn?: string;
  aliases?: string[];

  patterns: Pattern[]; // 1..2
  primaryMuscles: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];

  equipment: Equipment[];
  minLevel: Experience;
  difficulty: 1 | 2 | 3 | 4 | 5;

  setupCost: 1 | 2 | 3 | 4 | 5;
  stabilityDemand: 1 | 2 | 3 | 4 | 5;
  tags?: string[];

  kind: ExerciseKind;
  repRangeDefault: { min: number; max: number };
  restSecDefault: number;

  jointFlags?: JointFlag[];
  contraindications?: string[];

  unilateral?: boolean;
  plane?: "sagittal" | "frontal" | "transverse" | "mixed";

  cues?: string[];

  technique?: {
    setup: string;
    execution: string;
    commonMistakes: string[];
  };
};

function lvRank(lv: Experience) {
  return lv === "beginner" ? 1 : lv === "intermediate" ? 2 : 3;
}

export type UserConstraints = {
  experience: Experience;
  equipmentAvailable?: Equipment[];
  avoid?: JointFlag[];
};

export type CheckinIntent = "light" | "normal" | "hard";

export type MuscleBias = Partial<Record<MuscleGroup, number>>;

export type HistoryAvoidance = {
  mode: "soft" | "hard";
  recentExerciseIds: string[];
};

export type CheckinContext = {
  intent: CheckinIntent;
  timeBucket: 45 | 60 | 90;
  goal?: "strength" | "hypertrophy" | "fat_loss" | "general_fitness";
  preferCircuits?: boolean;
  avoidHighSetupWhenTired?: boolean;

  muscleBias?: MuscleBias;
  historyAvoidance?: HistoryAvoidance;
};

// ----------------------------------------------------------------------------
// Library (200)
// ----------------------------------------------------------------------------
export const EXERCISE_LIBRARY: Exercise[] = [
{
  id: "sq_back_squat",
  name: "Приседания со штангой на спине",
  nameEn: "Back Squat",
  patterns: ["squat"],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["core", "lower_back"],
  equipment: ["barbell"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 4,
  stabilityDemand: 4,
  tags: ["strength_bias", "barbell_skill", "not_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 4,
    max: 8,
  },

  technique: {
    setup: "Штанга на стойках на уровне плеч. Встань под штангу, положи её на верх трапеций (не на шею!). Хват чуть шире плеч, локти назад-вниз.",
    execution: "Отойди на шаг назад. Ноги на ширине плеч, носки слегка в стороны. Вдох - садись, отводя таз назад, как будто садишься на стул. Колени идут по направлению носков. Опустись до параллели бёдер с полом (или ниже, если позволяет подвижность). Выдох - вставай, отталкиваясь пятками и серединой стопы.",
    commonMistakes: ["Округление поясницы", "Колени уходят внутрь", "Отрыв пяток от пола", "Наклон вперёд"],
  },

  restSecDefault: 150,
  jointFlags: ["knee_sensitive", "low_back_sensitive"],
  plane: "sagittal",
  cues: ["Колени по носкам", "Не округляй поясницу", "Дави всей стопой"],
},
,
{
  id: "sq_front_squat",
  name: "Приседания со штангой на груди",
  nameEn: "Front Squat",
  patterns: ["squat"],
  primaryMuscles: ["quads"],
  secondaryMuscles: ["glutes", "core", "upper_back"],
  equipment: ["barbell"],
  minLevel: "advanced",
  difficulty: 5,
  setupCost: 4,
  stabilityDemand: 5,
  tags: ["strength_bias", "quad_bias", "barbell_skill"],
  kind: "compound",
  repRangeDefault: {
    min: 3,
    max: 6,
  },

  technique: {
    setup: "Штанга на стойках на уровне ключиц. Возьми гриф скрещенными руками или классическим хватом (пальцы под грифом, локти высоко вперёд). Гриф лежит на передних дельтах.",
    execution: "Отойди назад. Локти держи высоко вперёд! Вдох - садись вертикально вниз, не наклоняясь вперёд. Таз опускается между ног. Выдох - вставай, отталкиваясь всей стопой. Держи корпус вертикально.",
    commonMistakes: ["Падающие локти", "Наклон корпуса вперёд", "Потеря штанги", "Недостаточная глубина"],
  },

  restSecDefault: 160,
  jointFlags: ["knee_sensitive", "wrist_sensitive"],
  plane: "sagittal",
  cues: ["Дави всей стопой", "Корпус собран", "Колени по носкам"],
},
,
{
  id: "sq_goblet_squat",
  name: "Приседания с гантелей у груди",
  nameEn: "Goblet Squat",
  patterns: ["squat"],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["core"],
  equipment: ["dumbbell", "kettlebell"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 2,
  tags: ["good_for_circuit", "easy_superset", "beginner_friendly"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Возьми гантель обеими руками за верхний блин, прижми к груди на уровне ключиц. Локти направлены вниз.",
    execution: "Ноги чуть шире плеч, носки в стороны. Вдох - садись глубоко, разводя колени в стороны (локти проходят между коленей). Грудь вперёд, спина прямая. Выдох - вставай, толкаясь пятками.",
    commonMistakes: ["Округление спины", "Отрыв пяток", "Гантель опускается", "Колени внутрь"],
  },

  restSecDefault: 75,
  jointFlags: ["knee_sensitive"],
  plane: "sagittal",
  cues: ["Корпус собран", "Колени по носкам", "Дави всей стопой"],
},
,
{
  id: "sq_leg_press",
  name: "Жим ногами",
  nameEn: "Leg Press",
  patterns: ["squat"],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["hamstrings"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["stable_choice", "quad_bias", "knee_careful"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Сядь в тренажёр, плотно прижми поясницу и таз к спинке. Ступни на платформе на ширине плеч.",
    execution: "Сними блокировку. Вдох - опускай платформу, колени к груди и в стороны. Опускай до 90° (поясница НЕ отрывается!). Выдох - выжми вверх, НЕ разгибая колени полностью. Поясница прижата всегда.",
    commonMistakes: ["Отрыв поясницы", "Полное разгибание коленей", "Колени внутрь", "Узкая постановка"],
  },

  restSecDefault: 120,
  jointFlags: ["knee_sensitive"],
  plane: "sagittal",
  cues: ["Не округляй поясницу", "Колени по носкам", "Дави всей стопой"],
},
,
{
  id: "sq_hack_squat",
  name: "Приседания в Хак-машине",
  nameEn: "Hack Squat",
  patterns: ["squat"],
  primaryMuscles: ["quads"],
  secondaryMuscles: ["glutes"],
  equipment: ["machine"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["stable_choice", "quad_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Встань в тренажёр, спина прижата к подушкам. Ноги на платформе на ширине плеч.",
    execution: "Сними блокировку. Вдох - опускайся, сгибая ноги. Таз вниз и назад. Колени по носкам. Опустись до 90° или глубже. Выдох - выжми себя вверх, отталкиваясь пятками.",
    commonMistakes: ["Отрыв спины", "Колени за носки слишком сильно", "Неполная амплитуда"],
  },

  restSecDefault: 120,
  jointFlags: ["knee_sensitive"],
  plane: "sagittal",
  cues: ["Контроль вниз", "Колени по носкам", "Не округляй поясницу"],
},
,
{
  id: "sq_smith_squat",
  name: "Приседания в тренажере Смита",
  nameEn: "Smith Squat",
  patterns: ["squat"],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["core"],
  equipment: ["smith"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 3,
  stabilityDemand: 1,
  tags: ["stable_choice", "beginner_friendly", "easy_superset"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Встань под гриф в Смите, гриф на трапеции. Ноги выведи чуть вперёд (10-20 см от проекции грифа).",
    execution: "Сними блокировку поворотом. Вдох - садись, отводя таз назад. Гриф движется вертикально. Опустись до параллели. Выдох - вставай, толкаясь пятками.",
    commonMistakes: ["Ноги слишком близко к грифу", "Наклон вперёд", "Колени внутрь"],
  },

  restSecDefault: 90,
  jointFlags: ["knee_sensitive"],
  plane: "sagittal",
  cues: ["Колени по носкам", "Корпус собран", "Не округляй поясницу"],
},
,
{
  id: "sq_sissy_squat_machine",
  name: "Сисси-приседания в тренажере",
  nameEn: "Sissy Squat Machine",
  patterns: ["squat"],
  primaryMuscles: ["quads"],
  secondaryMuscles: ["core"],
  equipment: ["machine"],
  minLevel: "advanced",
  difficulty: 4,
  setupCost: 2,
  stabilityDemand: 3,
  tags: ["quad_bias", "hypertrophy_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань в тренажёр, зафиксируй ноги валиками. Корпус прямой.",
    execution: "Вдох - отклоняйся назад всем корпусом, сгибая колени. Бёдра, корпус и голова - прямая линия. Колени выходят вперёд - это нормально. Опустись низко. Выдох - выпрями ноги.",
    commonMistakes: ["Сгибание в пояснице", "Недостаточная глубина", "Быстрое выполнение"],
  },

  restSecDefault: 90,
  jointFlags: ["knee_sensitive"],
  plane: "sagittal",
  cues: ["Не округляй поясницу", "Колени по носкам", "Дави всей стопой"],
},
,
{
  id: "sq_single_leg_press",
  name: "Жим ногами одной ногой",
  nameEn: "Single-Leg Press",
  patterns: ["squat"],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["core"],
  equipment: ["machine"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["unilateral", "hypertrophy_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Сядь в жим ногами, прижми спину. Одна нога на платформе, вторая на полу.",
    execution: "Сними блокировку. Вдох - опускай платформу одной ногой. Контролируй баланс. Опусти до 90°. Выдох - выжми платформу. Не разгибай колено полностью.",
    commonMistakes: ["Поворот таза", "Помощь второй ногой", "Потеря баланса"],
  },

  restSecDefault: 90,
  jointFlags: ["knee_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Корпус собран", "Контроль вниз", "Колени по носкам"],
},
,
{
  id: "sq_smith_squat_heels_elevated",
  name: "Приседания в Смите с подставкой под пятки",
  nameEn: "Smith Squat Heels Elevated",
  patterns: ["squat"],
  primaryMuscles: ["quads"],
  secondaryMuscles: ["glutes"],
  equipment: ["smith"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 3,
  stabilityDemand: 2,
  tags: ["quad_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Подставка под пятки (блины 5-10 кг). Встань под гриф в Смите. Ноги уже обычного, стопы прямо.",
    execution: "Сними блокировку. Вдох - садись вертикально вниз, колени вперёд по носкам. Благодаря подъёму пяток садись очень глубоко. Выдох - вставай, напрягая квадрицепсы.",
    commonMistakes: ["Отрыв пяток от подставки", "Наклон вперёд", "Колени в стороны"],
  },

  restSecDefault: 105,
  jointFlags: ["knee_sensitive"],
  plane: "sagittal",
  cues: ["Контроль вниз", "Дави всей стопой", "Колени по носкам"],
},
,
{
  id: "sq_leg_press_narrow",
  name: "Жим ногами узкой постановкой",
  nameEn: "Leg Press Narrow",
  patterns: ["squat"],
  primaryMuscles: ["quads"],
  secondaryMuscles: ["glutes"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["quad_bias", "easy_superset"],
  kind: "compound",
  repRangeDefault: {
    min: 12,
    max: 18,
  },
  restSecDefault: 90,
  jointFlags: ["knee_sensitive"],
  plane: "sagittal",
  cues: ["Корпус собран", "Контроль вниз", "Не округляй поясницу"],
},
,
{
  id: "hi_barbell_rdl",
  name: "Румынская тяга со штангой",
  nameEn: "Barbell RDL",
  patterns: ["hinge"],
  primaryMuscles: ["hamstrings", "glutes"],
  secondaryMuscles: ["lower_back", "core"],
  equipment: ["barbell"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 3,
  stabilityDemand: 4,
  tags: ["hamstring_bias", "strength_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 6,
    max: 10,
  },

  technique: {
    setup: "Штанга на стойках ниже паха. Хват на ширине плеч. Встань, ноги на ширине плеч, колени слегка согнуты.",
    execution: "Вдох - наклоняйся, отводя таз назад. Штанга скользит по ногам. Спина ПРЯМАЯ. Колени почти не сгибаются. Опускай до середины голени. Выдох - вставай, толкая таз вперёд, напрягая ягодицы.",
    commonMistakes: ["Округление поясницы", "Сгибание коленей", "Штанга уходит вперёд", "Неполное распрямление"],
  },

  restSecDefault: 150,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Таз назад", "Спина нейтрально", "Снаряд близко"],
},
,
{
  id: "hi_db_rdl",
  name: "Румынская тяга с гантелями",
  nameEn: "DB RDL",
  patterns: ["hinge"],
  primaryMuscles: ["hamstrings", "glutes"],
  secondaryMuscles: ["core"],
  equipment: ["dumbbell", "kettlebell"],
  minLevel: "beginner",
  difficulty: 3,
  setupCost: 1,
  stabilityDemand: 3,
  tags: ["hamstring_bias", "good_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Возьми гантели, встань прямо. Ноги на ширине плеч, колени слегка согнуты.",
    execution: "Вдох - наклоняйся, отводя таз назад. Гантели близко к ногам. Спина прямая. Почувствуй растяжение задней поверхности. Выдох - выпрямись, напрягая ягодицы.",
    commonMistakes: ["Округление спины", "Гантели далеко от тела", "Сгибание коленей"],
  },

  restSecDefault: 120,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Снаряд близко", "Спина нейтрально", "Не рви движение"],
},
,
{
  id: "hi_conventional_deadlift",
  name: "Становая тяга классическая",
  nameEn: "Conventional Deadlift",
  patterns: ["hinge"],
  primaryMuscles: ["glutes", "hamstrings", "lower_back"],
  secondaryMuscles: ["core", "upper_back"],
  equipment: ["barbell"],
  minLevel: "advanced",
  difficulty: 5,
  setupCost: 4,
  stabilityDemand: 5,
  tags: ["strength_bias", "barbell_skill", "not_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 3,
    max: 6,
  },

  technique: {
    setup: "Штанга на полу над шнуровкой. Ноги на ширине плеч, носки в стороны. Хват на ширине плеч.",
    execution: "Опустись: таз выше коленей, голени касаются грифа, спина ПРЯМАЯ, грудь вперёд. Вдох - мощно выпрями ноги и встань. Штанга близко к телу. Наверху полностью выпрямись. Выдох.",
    commonMistakes: ["Округление поясницы", "Рывок спиной", "Штанга вперёд", "Неполное выпрямление", "Отбив от пола"],
  },

  restSecDefault: 180,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Натяжение в бицепсе бедра", "Не рви движение", "Снаряд близко"],
},
,
{
  id: "hi_sumo_deadlift",
  name: "Тяга штанги сумо",
  nameEn: "Sumo Deadlift",
  patterns: ["hinge"],
  primaryMuscles: ["glutes", "quads"],
  secondaryMuscles: ["hamstrings", "core"],
  equipment: ["barbell"],
  minLevel: "advanced",
  difficulty: 5,
  setupCost: 4,
  stabilityDemand: 4,
  tags: ["strength_bias", "glute_bias", "barbell_skill"],
  kind: "compound",
  repRangeDefault: {
    min: 3,
    max: 6,
  },

  technique: {
    setup: "Штанга на полу. Ноги ШИРОКО, носки сильно в стороны. Хват УЖЕ плеч (руки между ног).",
    execution: "Присядь глубже. Спина вертикальная, прямая. Голени вертикально. Вдох - встань, разгибая ноги и корпус. Гриф вертикально вверх между ног. Выдох наверху.",
    commonMistakes: ["Узкая постановка ног", "Округление спины", "Отрыв пяток", "Колени не разведены"],
  },

  restSecDefault: 180,
  jointFlags: ["hip_sensitive"],
  plane: "sagittal",
  cues: ["Натяжение в бицепсе бедра", "Спина нейтрально", "Не рви движение"],
},
,
{
  id: "hi_back_extension",
  name: "Гиперэкстензия",
  nameEn: "Back Extension",
  patterns: ["hinge"],
  primaryMuscles: ["glutes", "hamstrings"],
  secondaryMuscles: ["lower_back"],
  equipment: ["machine", "bodyweight"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["low_setup", "good_for_circuit", "easy_superset"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Ляг в тренажёр. Бёдра на подушке (край на уровне паха, НЕ на животе). Пятки под валики.",
    execution: "Опустись вниз, округляя спину. Затем поднимись, разгибая корпус до прямой линии. НЕ перегибайся назад! Работают ягодицы и разгибатели спины.",
    commonMistakes: ["Переразгибание наверху", "Быстрое выполнение", "Подушка на животе", "Рывки"],
  },

  restSecDefault: 75,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Спина нейтрально", "Не рви движение", "Снаряд близко"],
},
,
{
  id: "hi_cable_pull_through",
  name: "Протяжка через ноги на блоке",
  nameEn: "Cable Pull-Through",
  patterns: ["hinge"],
  primaryMuscles: ["glutes", "hamstrings"],
  secondaryMuscles: ["core"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["glute_bias", "low_back_friendly", "good_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань спиной к нижнему блоку. Возьми канатную рукоять между ног. Отойди на 1-2 шага, трос натянут.",
    execution: "Колени слегка согнуты. Вдох - наклонись, отводя таз назад, рукоять между ног назад. Выдох - мощно выпрямись, толкая таз вперёд, напрягая ягодицы. Корпус вертикально.",
    commonMistakes: ["Тяга руками", "Недостаточный наклон", "Отклонение назад", "Сгибание коленей"],
  },

  restSecDefault: 75,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Не рви движение", "Снаряд близко", "Натяжение в бицепсе бедра"],
},
,
{
  id: "hi_smith_rdl",
  name: "Румынская тяга в Смите",
  nameEn: "Smith RDL",
  patterns: ["hinge"],
  primaryMuscles: ["hamstrings", "glutes"],
  secondaryMuscles: ["core"],
  equipment: ["smith"],
  minLevel: "beginner",
  difficulty: 3,
  setupCost: 3,
  stabilityDemand: 3,
  tags: ["hamstring_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Гриф в Смите на уровне бёдер. Возьми гриф, встань, колени мягкие. Отойди на полшага вперёд.",
    execution: "Вдох - наклоняйся, отводя таз назад. Гриф скользит по ногам вниз по вертикали. Спина прямая. Выдох - вставай, напрягая ягодицы.",
    commonMistakes: ["Округление спины", "Сгибание коленей", "Далеко от грифа"],
  },

  restSecDefault: 120,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Не рви движение", "Натяжение в бицепсе бедра", "Снаряд близко"],
},
,
{
  id: "hi_good_morning",
  name: "Наклоны со штангой на плечах",
  nameEn: "Good Morning",
  patterns: ["hinge"],
  primaryMuscles: ["hamstrings", "lower_back"],
  secondaryMuscles: ["glutes", "core"],
  equipment: ["barbell"],
  minLevel: "advanced",
  difficulty: 5,
  setupCost: 3,
  stabilityDemand: 5,
  tags: ["posterior_chain", "barbell_skill"],
  kind: "compound",
  repRangeDefault: {
    min: 6,
    max: 10,
  },

  technique: {
    setup: "Штанга на трапециях (как в приседе). Отойди назад, ноги на ширине плеч, колени СЛЕГКА согнуты.",
    execution: "Вдох - наклоняйся вперёд, отводя таз назад. Корпус до параллели. Спина ЖЁСТКО прямая! Колени почти не сгибаются. Выдох - поднимайся, напрягая ягодицы. СЛОЖНОЕ упражнение - начинай с малого веса!",
    commonMistakes: ["Округление поясницы (ОПАСНО!)", "Сгибание коленей", "Слишком большой вес", "Низкий наклон"],
  },

  restSecDefault: 150,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Натяжение в бицепсе бедра", "Снаряд близко", "Таз назад"],
},
,
{
  id: "hi_leg_curl_lying",
  name: "Сгибания ног лёжа",
  nameEn: "Leg Curl (Lying)",
  patterns: ["hinge"],
  primaryMuscles: ["hamstrings"],
  secondaryMuscles: ["calves"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["hamstring_bias", "hypertrophy_bias", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 10,
    max: 15,
  },
  restSecDefault: 75,
  plane: "sagittal",
  cues: ["Спина нейтрально", "Натяжение в бицепсе бедра", "Таз назад"],
},
,
{
  id: "hi_leg_curl_seated",
  name: "Сгибания ног сидя",
  nameEn: "Leg Curl (Seated)",
  patterns: ["hinge"],
  primaryMuscles: ["hamstrings"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["hamstring_bias", "hypertrophy_bias", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 10,
    max: 15,
  },
  restSecDefault: 75,
  plane: "sagittal",
  cues: ["Таз назад", "Не рви движение", "Натяжение в бицепсе бедра"],
},
,
{
  id: "lu_bulgarian_split_squat",
  name: "Болгарские сплит-приседания",
  nameEn: "Bulgarian Split Squat",
  patterns: ["lunge"],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["core"],
  equipment: ["dumbbell", "bench", "bodyweight"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 2,
  stabilityDemand: 4,
  tags: ["unilateral", "hypertrophy_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Встань спиной к скамье на расстоянии большого шага. Одна нога носком на скамье сзади. Гантели по бокам.",
    execution: "Вдох - опустись вниз, сгибая переднюю ногу. Колено не выходит сильно за носок. Опускайся до 90° или ниже. Корпус чуть наклонён вперёд. Выдох - встань передней ногой.",
    commonMistakes: ["Колено внутрь", "Отталкивание задней ногой", "Недостаточная глубина", "Потеря равновесия"],
  },

  restSecDefault: 120,
  jointFlags: ["knee_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Контроль шага", "Опорная стопа стабильна", "Не заваливайся"],
},
,
{
  id: "lu_db_reverse_lunge",
  name: "Выпады назад с гантелями",
  nameEn: "DB Reverse Lunge",
  patterns: ["lunge"],
  primaryMuscles: ["glutes", "quads"],
  secondaryMuscles: ["core"],
  equipment: ["dumbbell", "bodyweight"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 3,
  tags: ["good_for_circuit", "unilateral", "knee_friendly"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 14,
  },

  technique: {
    setup: "Встань прямо, ноги вместе. Гантели в руках по бокам.",
    execution: "Вдох - шаг назад одной ногой, поставь на носок. Опустись, сгибая обе ноги, заднее колено почти касается пола. Переднее колено над стопой. Выдох - оттолкнись передней ногой, вернись в исходное.",
    commonMistakes: ["Короткий шаг назад", "Наклон вперёд", "Колено передней ноги уходит вперёд", "Падение"],
  },

  restSecDefault: 75,
  jointFlags: ["knee_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Контроль шага", "Опорная стопа стабильна", "Не заваливайся"],
},
,
{
  id: "lu_step_up",
  name: "Зашагивания на тумбу",
  nameEn: "Step-Up",
  patterns: ["lunge"],
  primaryMuscles: ["glutes", "quads"],
  secondaryMuscles: ["core"],
  equipment: ["dumbbell", "bench"],
  minLevel: "beginner",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 3,
  tags: ["good_for_circuit", "unilateral"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Встань перед тумбой высотой до колена. Гантели в руках.",
    execution: "Поставь одну ногу полностью на тумбу. Вдох - поднимись, отталкиваясь этой ногой (не прыгай второй!). Выпрямись наверху. Выдох - опустись той же ногой контролируемо.",
    commonMistakes: ["Прыжок нижней ногой", "Наклон вперёд", "Слишком высокая тумба", "Падение вниз"],
  },

  restSecDefault: 75,
  jointFlags: ["knee_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Опорная стопа стабильна", "Корпус ровно", "Не заваливайся"],
},
,
{
  id: "lu_walking_lunge",
  name: "Выпады в ходьбе",
  nameEn: "Walking Lunge",
  patterns: ["lunge"],
  primaryMuscles: ["glutes", "quads"],
  secondaryMuscles: ["core"],
  equipment: ["dumbbell", "bodyweight"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 1,
  stabilityDemand: 4,
  tags: ["conditioning_like", "good_for_circuit", "unilateral"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 16,
  },

  technique: {
    setup: "Встань прямо, ноги вместе. Гантели в руках. Нужно пространство для ходьбы.",
    execution: "Вдох - шагни вперёд одной ногой. Опустись, сгибая обе ноги до 90°. Выдох - оттолкнись задней, подтяни вперёд и сразу шагни в следующий выпад. Двигайся вперёд, чередуя ноги.",
    commonMistakes: ["Короткие шаги", "Наклон корпуса", "Удар коленом о пол", "Потеря равновесия"],
  },

  restSecDefault: 60,
  jointFlags: ["knee_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Колено стабильно", "Корпус ровно", "Не заваливайся"],
},
,
{
  id: "lu_forward_lunge",
  name: "Выпады вперёд",
  nameEn: "Forward Lunge",
  patterns: ["lunge"],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["core"],
  equipment: ["dumbbell", "bodyweight"],
  minLevel: "beginner",
  difficulty: 3,
  setupCost: 1,
  stabilityDemand: 3,
  tags: ["unilateral"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Встань прямо, ноги на ширине плеч. Гантели в руках.",
    execution: "Вдох - шагни вперёд. Опустись, сгибая обе ноги. Заднее колено почти касается пола. Выдох - оттолкнись передней ногой, вернись назад.",
    commonMistakes: ["Короткий шаг", "Колено передней ноги сильно вперёд", "Наклон вперёд", "Рывок назад"],
  },

  restSecDefault: 75,
  jointFlags: ["knee_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Корпус ровно", "Колено стабильно", "Контроль шага"],
},
,
{
  id: "lu_lateral_lunge",
  name: "Выпады в сторону",
  nameEn: "Lateral Lunge",
  patterns: ["lunge"],
  primaryMuscles: ["glutes", "quads"],
  secondaryMuscles: ["core"],
  equipment: ["dumbbell", "bodyweight"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 1,
  stabilityDemand: 4,
  tags: ["frontal_plane", "unilateral"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Встань прямо, ноги вместе. Гантели в руках.",
    execution: "Вдох - шагни широко в сторону. Присядь на эту ногу, вторая прямая. Таз назад. Корпус чуть вперёд. Выдох - оттолкнись рабочей ногой, вернись в центр.",
    commonMistakes: ["Недостаточно широкий шаг", "Сгибание прямой ноги", "Колено внутрь", "Потеря равновесия"],
  },

  restSecDefault: 90,
  jointFlags: ["knee_sensitive", "hip_sensitive"],
  unilateral: true,
  plane: "frontal",
  cues: ["Колено стабильно", "Корпус ровно", "Опорная стопа стабильна"],
},
,
{
  id: "lu_cable_lunge",
  name: "Выпады на блоке",
  nameEn: "Cable Lunge",
  patterns: ["lunge"],
  primaryMuscles: ["glutes", "quads"],
  secondaryMuscles: ["core"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 3,
  tags: ["good_for_circuit", "unilateral"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань лицом к нижнему блоку. Возьми рукоять двумя руками. Отойди на 2-3 шага, трос натянут.",
    execution: "Вдох - шагни назад в выпад. Опустись. Выдох - встань, подтягивая ногу вперёд. Трос создаёт сопротивление и включает корпус. Держи корпус вертикально.",
    commonMistakes: ["Наклон вперёд от троса", "Слишком близко к блоку", "Потеря равновесия"],
  },

  restSecDefault: 60,
  jointFlags: ["knee_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Корпус ровно", "Колено стабильно", "Не заваливайся"],
},
,
{
  id: "hi_barbell_hip_thrust",
  name: "Ягодичный мост со штангой",
  nameEn: "Barbell Hip Thrust",
  patterns: ["hip_thrust"],
  primaryMuscles: ["glutes"],
  secondaryMuscles: ["hamstrings", "core"],
  equipment: ["barbell", "bench"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 4,
  stabilityDemand: 2,
  tags: ["glute_bias", "hypertrophy_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Сядь спиной к скамье. Штанга на бёдрах (используй подкладку!). Лопатками на край скамьи. Ноги на полу на ширине плеч.",
    execution: "Вдох - подними таз вверх, отталкиваясь пятками. Поднимайся до прямой линии от коленей до плеч. Наверху сильно напряги ягодицы, задержись. Выдох - опусти таз, не касаясь пола.",
    commonMistakes: ["Переразгибание в пояснице", "Отрыв стоп", "Слишком высокий подъём", "Недостаточное напряжение ягодиц"],
  },

  restSecDefault: 120,
  jointFlags: ["hip_sensitive", "low_back_sensitive"],
  plane: "sagittal",
  cues: ["Подбородок чуть вниз", "Сожми ягодицы", "Пауза вверху"],
},
,
{
  id: "hi_machine_hip_thrust",
  name: "Ягодичный мост в тренажёре",
  nameEn: "Machine Hip Thrust",
  patterns: ["hip_thrust"],
  primaryMuscles: ["glutes"],
  secondaryMuscles: ["hamstrings"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["glute_bias", "stable_choice"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Сядь в тренажёр. Спина прижата к спинке, валик на бёдрах. Стопы на платформе.",
    execution: "Вдох - выжми валик вверх, разгибая бёдра. Поднимайся до полного выпрямления. Сильно напряги ягодицы наверху. Выдох - опусти контролируемо.",
    commonMistakes: ["Отрыв спины", "Толчок ногами вместо ягодиц", "Неполная амплитуда"],
  },

  restSecDefault: 90,
  jointFlags: ["hip_sensitive"],
  plane: "sagittal",
  cues: ["Сожми ягодицы", "Подбородок чуть вниз", "Не прогибай поясницу"],
},
,
{
  id: "hi_glute_bridge",
  name: "Ягодичный мост на полу",
  nameEn: "Glute Bridge",
  patterns: ["hip_thrust"],
  primaryMuscles: ["glutes"],
  secondaryMuscles: ["hamstrings", "core"],
  equipment: ["bodyweight", "dumbbell", "bands"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 1,
  stabilityDemand: 1,
  tags: ["good_for_circuit", "easy_superset", "glute_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 12,
    max: 18,
  },

  technique: {
    setup: "Ляг на спину. Ноги согни, стопы на полу на ширине плеч близко к ягодицам. Руки вдоль тела. Можно положить вес на бёдра.",
    execution: "Вдох - подними таз вверх, отталкиваясь пятками. Поднимайся до прямой линии. Сильно сожми ягодицы вверху. Выдох - опусти таз на пол. НЕ выгибайся в пояснице!",
    commonMistakes: ["Перегиб в пояснице", "Отрыв стоп", "Недостаточное напряжение ягодиц", "Опора на носки"],
  },

  restSecDefault: 60,
  plane: "sagittal",
  cues: ["Не прогибай поясницу", "Подбородок чуть вниз", "Рёбра вниз"],
},
,
{
  id: "hi_smith_hip_thrust",
  name: "Ягодичный мост в Смите",
  nameEn: "Smith Hip Thrust",
  patterns: ["hip_thrust"],
  primaryMuscles: ["glutes"],
  secondaryMuscles: ["hamstrings"],
  equipment: ["smith", "bench"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 3,
  stabilityDemand: 1,
  tags: ["glute_bias", "stable_choice"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Сядь спиной к скамье. Гриф в Смите на бёдрах (подкладка). Лопатки на скамье. Стопы под грифом.",
    execution: "Сними блокировку. Вдох - подними таз, выжимая гриф вверх. Поднимайся до прямой линии. Напряги ягодицы. Выдох - опусти.",
    commonMistakes: ["Переразгибание поясницы", "Стопы далеко от грифа"],
  },

  restSecDefault: 90,
  jointFlags: ["hip_sensitive"],
  plane: "sagittal",
  cues: ["Пауза вверху", "Сожми ягодицы", "Рёбра вниз"],
},
,
{
  id: "hi_cable_glute_kickback",
  name: "Отведение ноги назад на блоке",
  nameEn: "Cable Glute Kickback",
  patterns: ["hip_thrust"],
  primaryMuscles: ["glutes"],
  secondaryMuscles: ["hamstrings"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["glute_bias", "easy_superset", "good_for_circuit"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 20,
  },

  technique: {
    setup: "Встань лицом к нижнему блоку. Манжета на одной лодыжке, пристегни к тросу. Отойди на шаг, держись за стойку.",
    execution: "Встань на опорную ногу. Вдох - отведи рабочую ногу назад и вверх, разгибая бедро. Работают ягодицы. Не прогибайся в пояснице! Нога назад, колено почти прямое. Выдох - верни.",
    commonMistakes: ["Прогиб в пояснице", "Сгибание ноги в колене", "Раскачивание корпусом", "Быстрое выполнение"],
  },

  restSecDefault: 60,
  jointFlags: ["hip_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Рёбра вниз", "Не прогибай поясницу", "Сожми ягодицы"],
},
,
{
  id: "ho_barbell_bench_press",
  name: "Жим штанги лёжа",
  nameEn: "Barbell Bench Press",
  patterns: ["horizontal_push"],
  primaryMuscles: ["chest", "triceps", "front_delts"],
  secondaryMuscles: ["core"],
  equipment: ["barbell", "bench"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 4,
  stabilityDemand: 3,
  tags: ["strength_bias", "not_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 5,
    max: 8,
  },

  technique: {
    setup: "Ляг на скамью. Штанга над глазами. Хват чуть шире плеч. Ноги на полу. Лопатки сведены, грудь вперёд, прогиб в пояснице.",
    execution: "Сними штангу, выведи над грудью. Вдох - опускай на грудь (линия сосков), локти под 45°. Коснись груди. Выдох - выжми вверх. Ноги упираются, лопатки сведены.",
    commonMistakes: ["Локти в стороны 90°", "Отбив от груди", "Подъём ягодиц", "Неполная амплитуда"],
  },

  restSecDefault: 150,
  jointFlags: ["shoulder_sensitive", "wrist_sensitive"],
  plane: "sagittal",
  cues: ["Лопатки собраны", "Контроль эксцентрики", "Запястья ровно"],
},
,
{
  id: "ho_db_bench_press",
  name: "Жим гантелей лёжа",
  nameEn: "DB Bench Press",
  patterns: ["horizontal_push"],
  primaryMuscles: ["chest", "triceps", "front_delts"],
  equipment: ["dumbbell", "bench"],
  minLevel: "beginner",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 3,
  tags: ["hypertrophy_bias", "easy_superset"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Сядь с гантелями на бёдрах. Откинься, закидывая гантели к плечам. Ляг, гантели по бокам груди. Лопатки сведены.",
    execution: "Вдох - опусти гантели по бокам груди, локти под 45°. Опускай до растяжения. Выдох - выжми вверх и чуть друг к другу (не ударяй!). Руки почти прямые наверху.",
    commonMistakes: ["Удар гантелей наверху", "Локти широко", "Недостаточная глубина", "Раскачивание"],
  },

  restSecDefault: 120,
  jointFlags: ["shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Не выталкивай плечи вперёд", "Лопатки собраны", "Контроль эксцентрики"],
},
,
{
  id: "ho_machine_chest_press",
  name: "Жим в тренажере для груди",
  nameEn: "Machine Chest Press",
  patterns: ["horizontal_push"],
  primaryMuscles: ["chest", "triceps"],
  secondaryMuscles: ["front_delts"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["stable_choice", "good_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Сядь в тренажёр. Рукоятки на уровне середины груди. Спина прижата, лопатки сведены. Ноги на полу.",
    execution: "Вдох - выжми рукоятки вперёд, почти полностью разгибая руки. Выдох - верни назад контролируемо, пока локти на уровне корпуса. Чувствуй растяжение грудных.",
    commonMistakes: ["Отрыв спины", "Полное разгибание с щелчком", "Рывки", "Неполная амплитуда"],
  },

  restSecDefault: 90,
  jointFlags: ["shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Не выталкивай плечи вперёд", "Локти ~45°", "Запястья ровно"],
},
,
{
  id: "ho_cable_chest_press",
  name: "Жим на блоках стоя",
  nameEn: "Cable Chest Press",
  patterns: ["horizontal_push"],
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps", "front_delts", "core"],
  equipment: ["cable"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 3,
  tags: ["good_for_circuit", "constant_tension"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань между стойками кроссовера, блоки на уровне плеч. Возьми рукоятки, отойди вперёд. Одна нога впереди.",
    execution: "Вдох - выжми рукоятки вперёд, выпрямляя руки. Руки сходятся перед грудью. Выдох - верни назад, чувствуя растяжение. Корпус стабилен.",
    commonMistakes: ["Раскачивание корпусом", "Наклон вперёд", "Рывки", "Далеко от блоков"],
  },

  restSecDefault: 75,
  jointFlags: ["shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Запястья ровно", "Локти ~45°", "Контроль эксцентрики"],
},
,
{
  id: "ho_push_up",
  name: "Отжимания",
  nameEn: "Push-up",
  patterns: ["horizontal_push"],
  primaryMuscles: ["chest", "triceps", "front_delts"],
  secondaryMuscles: ["core"],
  equipment: ["bodyweight"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 3,
  tags: ["good_for_circuit", "low_setup", "easy_superset"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 15,
  },

  technique: {
    setup: "Упор лёжа. Руки на ширине плеч, под плечами. Тело прямое от головы до пяток (не прогибайся!).",
    execution: "Вдох - согни руки, опустись грудью к полу. Локти под 45°. Опустись максимально низко. Выдох - оттолкнись, выпрямляя руки. Тело всегда прямое.",
    commonMistakes: ["Провисание поясницы", "Ягодицы вверх", "Локти широко", "Неполная амплитуда"],
  },

  restSecDefault: 60,
  jointFlags: ["wrist_sensitive", "shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Лопатки собраны", "Локти ~45°", "Контроль эксцентрики"],
},
,
{
  id: "ho_smith_bench_press",
  name: "Жим в Смите лёжа",
  nameEn: "Smith Bench Press",
  patterns: ["horizontal_push"],
  primaryMuscles: ["chest", "triceps"],
  secondaryMuscles: ["front_delts"],
  equipment: ["smith", "bench"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 3,
  stabilityDemand: 1,
  tags: ["stable_choice"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Ляг под гриф в Смите. Гриф над грудью. Хват чуть шире плеч. Лопатки сведены.",
    execution: "Сними блокировку. Вдох - опусти гриф на грудь, локти под 45°. Коснись. Выдох - выжми вверх. Гриф вертикально по направляющим.",
    commonMistakes: ["Отбив от груди", "Подъём ягодиц", "Неправильная позиция под грифом"],
  },

  restSecDefault: 105,
  jointFlags: ["shoulder_sensitive", "wrist_sensitive"],
  plane: "sagittal",
  cues: ["Запястья ровно", "Локти ~45°", "Контроль эксцентрики"],
},
,
{
  id: "ho_pec_deck_fly",
  name: "Сведения рук в тренажере",
  nameEn: "Pec Deck Fly",
  patterns: ["horizontal_push"],
  primaryMuscles: ["chest"],
  secondaryMuscles: ["front_delts"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["hypertrophy_bias", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 18,
  },
  restSecDefault: 60,
  jointFlags: ["shoulder_sensitive"],
  plane: "transverse",
  cues: ["Не выталкивай плечи вперёд", "Запястья ровно", "Контроль эксцентрики"],
},
,
{
  id: "in_incline_db_press",
  name: "Жим гантелей на наклонной",
  nameEn: "Incline DB Press",
  patterns: ["incline_push"],
  primaryMuscles: ["chest", "front_delts", "triceps"],
  equipment: ["dumbbell", "bench"],
  minLevel: "beginner",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 3,
  tags: ["upper_chest_bias", "hypertrophy_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Скамья под 30-45°. Сядь, гантели на бёдрах. Откинься, закидывая к плечам. Лопатки сведены.",
    execution: "Вдох - опусти гантели по бокам верхней части груди, локти под 45°. Выдох - выжми вверх, сводя над грудью (не над головой!). Акцент на верх грудных.",
    commonMistakes: ["Слишком большой угол (больше 45°)", "Жим над головой", "Удар гантелей", "Отрыв поясницы"],
  },

  restSecDefault: 120,
  jointFlags: ["shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Запястья ровно", "Не выталкивай плечи вперёд", "Лопатки собраны"],
},
,
{
  id: "in_incline_barbell_press",
  name: "Жим штанги на наклонной",
  nameEn: "Incline Barbell Press",
  patterns: ["incline_push"],
  primaryMuscles: ["chest", "front_delts", "triceps"],
  equipment: ["barbell", "bench"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 4,
  stabilityDemand: 3,
  tags: ["strength_bias", "upper_chest_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 6,
    max: 10,
  },

  technique: {
    setup: "Скамья под 30-45°. Ляг, штанга над верхом груди. Хват чуть шире плеч. Лопатки сведены.",
    execution: "Сними штангу. Вдох - опусти на верх груди (ключицы). Локти под 45°. Выдох - выжми вверх над верхом груди. Траектория немного к голове.",
    commonMistakes: ["Опускание на низ груди", "Слишком вертикальный жим", "Отрыв ягодиц"],
  },

  restSecDefault: 150,
  jointFlags: ["shoulder_sensitive", "wrist_sensitive"],
  plane: "sagittal",
  cues: ["Локти ~45°", "Лопатки собраны", "Запястья ровно"],
},
,
{
  id: "in_incline_machine_press",
  name: "Наклонный жим в тренажёре",
  nameEn: "Incline Machine Press",
  patterns: ["incline_push"],
  primaryMuscles: ["chest"],
  secondaryMuscles: ["front_delts", "triceps"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["stable_choice", "upper_chest_bias", "good_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Сядь в тренажёр для наклонного жима. Рукоятки на уровне верхней части груди. Спина прижата.",
    execution: "Вдох - выжми рукоятки вверх-вперёд, почти выпрямляя руки. Выдох - верни. Траектория наклонная, акцент на верх груди.",
    commonMistakes: ["Отрыв спины", "Рывки", "Неполная амплитуда"],
  },

  restSecDefault: 90,
  jointFlags: ["shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Локти ~45°", "Контроль эксцентрики", "Не выталкивай плечи вперёд"],
},
,
{
  id: "in_low_to_high_cable_fly",
  name: "Кроссовер снизу вверх",
  nameEn: "Low-to-High Cable Fly",
  patterns: ["incline_push"],
  primaryMuscles: ["chest"],
  secondaryMuscles: ["front_delts"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["upper_chest_bias", "constant_tension", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 18,
  },

  technique: {
    setup: "Встань между стойками, блоки внизу. Возьми рукоятки, отойди вперёд. Одна нога впереди. Руки внизу.",
    execution: "Вдох - подними руки дугой вверх и вперёд, сводя перед грудью на уровне лица. Локти чуть согнуты. Напряги верх грудных. Выдох - опусти вниз.",
    commonMistakes: ["Сгибание рук", "Раскачивание", "Слишком высоко вверх", "Рывки"],
  },

  restSecDefault: 60,
  jointFlags: ["shoulder_sensitive"],
  plane: "transverse",
  cues: ["Запястья ровно", "Лопатки собраны", "Локти ~45°"],
},
,
{
  id: "ve_seated_db_shoulder_press",
  name: "Жим гантелей сидя",
  nameEn: "Seated DB Shoulder Press",
  patterns: ["vertical_push"],
  primaryMuscles: ["front_delts", "side_delts", "triceps"],
  secondaryMuscles: ["core"],
  equipment: ["dumbbell", "bench"],
  minLevel: "beginner",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 3,
  tags: ["shoulder_bias", "hypertrophy_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Сядь на скамью с вертикальной спинкой. Подними гантели к плечам. Локти в стороны, предплечья вертикально.",
    execution: "Вдох - выжми гантели вверх над головой, слегка сводя наверху (не ударяй!). Полностью выпрями руки. Выдох - опусти к плечам. Голову не выдвигай вперёд.",
    commonMistakes: ["Удар гантелей", "Отрыв поясницы от спинки", "Неполная амплитуда вниз", "Выдвижение головы"],
  },

  restSecDefault: 120,
  jointFlags: ["shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Контроль эксцентрики", "Не выталкивай плечи вперёд", "Запястья ровно"],
},
,
{
  id: "ve_standing_overhead_press",
  name: "Жим штанги стоя",
  nameEn: "Standing Overhead Press",
  patterns: ["vertical_push"],
  primaryMuscles: ["front_delts", "triceps"],
  secondaryMuscles: ["core", "upper_back"],
  equipment: ["barbell"],
  minLevel: "advanced",
  difficulty: 5,
  setupCost: 4,
  stabilityDemand: 5,
  tags: ["strength_bias", "barbell_skill", "not_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 4,
    max: 8,
  },

  technique: {
    setup: "Сними штангу со стоек на уровне плеч. Хват чуть шире плеч. Штанга на дельтах, локти вперёд. Ноги на ширине плеч.",
    execution: "Вдох - выжми вверх над головой. Когда штанга проходит голову, подай голову вперёд. Полностью выпрями руки. Выдох - опусти на дельты. Не отклоняйся назад!",
    commonMistakes: ["Отклонение корпуса назад", "Жим перед собой", "Прогиб в пояснице", "Неполная амплитуда"],
  },

  restSecDefault: 150,
  jointFlags: ["shoulder_sensitive", "low_back_sensitive"],
  plane: "sagittal",
  cues: ["Локти ~45°", "Запястья ровно", "Не выталкивай плечи вперёд"],
},
,
{
  id: "ve_machine_shoulder_press",
  name: "Жим в тренажере для плеч",
  nameEn: "Machine Shoulder Press",
  patterns: ["vertical_push"],
  primaryMuscles: ["front_delts", "side_delts"],
  secondaryMuscles: ["triceps"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["stable_choice", "good_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Сядь в тренажёр. Рукоятки на уровне плеч. Спина прижата.",
    execution: "Вдох - выжми рукоятки вверх, почти выпрямляя руки. Выдох - опусти к плечам. Тренажёр стабилизирует движение.",
    commonMistakes: ["Отрыв спины", "Полное разгибание с щелчком", "Рывки"],
  },

  restSecDefault: 90,
  jointFlags: ["shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Не выталкивай плечи вперёд", "Лопатки собраны", "Локти ~45°"],
},
,
{
  id: "ve_landmine_press",
  name: "Жим одной рукой с упором штанги",
  nameEn: "Landmine Press",
  patterns: ["vertical_push"],
  primaryMuscles: ["front_delts", "chest"],
  secondaryMuscles: ["triceps", "core"],
  equipment: ["landmine", "barbell"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 3,
  stabilityDemand: 3,
  tags: ["shoulder_friendly", "good_for_circuit", "unilateral"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Один конец штанги закреплён. Возьми другой конец двумя руками или одной. Подними к плечу. Встань или стань на колено.",
    execution: "Вдох - выжми штангу вверх-вперёд по дуге. Выдох - опусти к плечу. Дуговая траектория снижает нагрузку на плечевой сустав.",
    commonMistakes: ["Слишком вертикальный жим", "Потеря равновесия", "Неполная амплитуда"],
  },

  restSecDefault: 75,
  jointFlags: ["shoulder_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Запястья ровно", "Локти ~45°", "Контроль эксцентрики"],
},
,
{
  id: "ve_arnold_press",
  name: "Жим Арнольда",
  nameEn: "Arnold Press",
  patterns: ["vertical_push"],
  primaryMuscles: ["front_delts", "side_delts"],
  secondaryMuscles: ["triceps"],
  equipment: ["dumbbell", "bench"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 2,
  stabilityDemand: 4,
  tags: ["hypertrophy_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Сядь на скамью. Гантели перед собой на уровне лица, локти вперёд, ладони к себе.",
    execution: "Вдох - жми гантели вверх, одновременно разворачивая ладони от себя. Наверху ладони вперёд, руки над головой. Выдох - опускай, разворачивая ладони к себе.",
    commonMistakes: ["Удар гантелей", "Слишком быстро", "Отрыв поясницы", "Неполный разворот"],
  },

  restSecDefault: 120,
  jointFlags: ["shoulder_sensitive"],
  plane: "mixed",
  cues: ["Не выталкивай плечи вперёд", "Запястья ровно", "Локти ~45°"],
},
,
{
  id: "ho_seated_cable_row",
  name: "Тяга горизонтального блока",
  nameEn: "Seated Cable Row",
  patterns: ["horizontal_pull"],
  primaryMuscles: ["upper_back", "lats"],
  secondaryMuscles: ["biceps", "rear_delts"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["upper_back_bias", "stable_choice", "good_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 14,
  },

  technique: {
    setup: "Сядь в тренажёр. Стопы на платформе, колени слегка согнуты. Возьми рукоять, откинься до вертикали. Руки вытянуты.",
    execution: "Грудь вперёд, спина прямая. Вдох - притяни к животу (уровень пупка), сводя лопатки. Локти назад вдоль корпуса. Задержись. Выдох - выпрями руки. Корпус вертикально.",
    commonMistakes: ["Раскачивание", "Тяга руками без спины", "Округление спины", "Недостаточное сведение лопаток"],
  },

  restSecDefault: 90,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Пауза в конце", "Контроль возврата", "Плечи вниз"],
},
,
{
  id: "ho_one_arm_db_row",
  name: "Тяга гантели одной рукой",
  nameEn: "One-Arm DB Row",
  patterns: ["horizontal_pull"],
  primaryMuscles: ["lats", "upper_back"],
  secondaryMuscles: ["biceps", "core"],
  equipment: ["dumbbell", "bench"],
  minLevel: "beginner",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 3,
  tags: ["lat_bias", "unilateral", "easy_superset"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Встань боком к скамье. Колено и ладонь с одной стороны на скамье. Вторая нога на полу, гантель в свободной руке. Корпус параллельно полу.",
    execution: "Гантель висит вниз. Вдох - подтяни к поясу, локоть назад-вверх вдоль корпуса. Тяни лопаткой! Задержись. Выдох - опусти. Корпус стабилен.",
    commonMistakes: ["Скручивание корпуса", "Тяга бицепсом", "Подъём плеча без спины", "Раскачивание"],
  },

  restSecDefault: 90,
  jointFlags: ["low_back_sensitive"],
  unilateral: true,
  plane: "sagittal",
  cues: ["Контроль возврата", "Тяни локтями", "Не раскачивайся"],
},
,
{
  id: "ho_chest_supported_row",
  name: "Тяга с упором грудью",
  nameEn: "Chest Supported Row",
  patterns: ["horizontal_pull"],
  primaryMuscles: ["upper_back", "lats"],
  secondaryMuscles: ["biceps", "rear_delts"],
  equipment: ["machine", "dumbbell", "bench"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["low_back_friendly", "upper_back_bias", "stable_choice"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 14,
  },

  technique: {
    setup: "Ляг животом на наклонную скамью (30-45°). Гантели в руках внизу. Грудь прижата, ноги упираются.",
    execution: "Руки висят. Вдох - подтяни гантели к поясу/рёбрам, локти назад. Сведи лопатки. Выдох - опусти. Грудь всегда прижата - убирает читинг.",
    commonMistakes: ["Отрыв груди", "Разведение локтей в стороны", "Неполная амплитуда", "Рывки"],
  },

  restSecDefault: 90,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Плечи вниз", "Контроль возврата", "Не раскачивайся"],
},
,
{
  id: "ho_machine_row",
  name: "Тяга в рычажном тренажере",
  nameEn: "Machine Row",
  patterns: ["horizontal_pull"],
  primaryMuscles: ["upper_back", "lats"],
  secondaryMuscles: ["biceps"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["stable_choice", "good_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Сядь в тренажёр. Грудь прижми к подушке, возьми рукоятки. Руки вытянуты, лопатки разведены.",
    execution: "Вдох - притяни рукоятки к себе, локти назад. Сведи лопатки. Задержись. Выдох - выпрями руки. Тренажёр фиксирует корпус.",
    commonMistakes: ["Отрыв груди от подушки", "Тяга руками", "Недостаточное сведение лопаток"],
  },

  restSecDefault: 75,
  plane: "sagittal",
  cues: ["Плечи вниз", "Контроль возврата", "Тяни локтями"],
},
,
{
  id: "ho_barbell_row",
  name: "Тяга штанги в наклоне",
  nameEn: "Barbell Row",
  patterns: ["horizontal_pull"],
  primaryMuscles: ["upper_back", "lats"],
  secondaryMuscles: ["biceps", "lower_back"],
  equipment: ["barbell"],
  minLevel: "advanced",
  difficulty: 5,
  setupCost: 3,
  stabilityDemand: 5,
  tags: ["strength_bias", "barbell_skill"],
  kind: "compound",
  repRangeDefault: {
    min: 6,
    max: 10,
  },

  technique: {
    setup: "Встань, ноги на ширине плеч. Возьми штангу чуть шире плеч. Наклонись до 45° (или ниже). Колени слегка согнуты, спина прямая.",
    execution: "Вдох - подтяни к низу живота, локти назад-вверх вдоль корпуса. Сведи лопатки. НЕ поднимай корпус! Выдох - опусти, сохраняя наклон.",
    commonMistakes: ["Подъём корпуса при тяге", "Округление спины", "Тяга к груди", "Рывки", "Локти в стороны"],
  },

  restSecDefault: 150,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Не раскачивайся", "Контроль возврата", "Плечи вниз"],
},
,
{
  id: "ho_t_bar_row",
  name: "Тяга Т-грифа",
  nameEn: "T-Bar Row",
  patterns: ["horizontal_pull"],
  primaryMuscles: ["upper_back", "lats"],
  secondaryMuscles: ["biceps"],
  equipment: ["machine", "barbell"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 3,
  stabilityDemand: 4,
  tags: ["upper_back_bias", "hypertrophy_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Встань над Т-грифом. Возьми рукоять обеими руками. Ноги по бокам грифа, наклонись, спина прямая.",
    execution: "Вдох - подтяни гриф к груди/животу, локти назад. Сведи лопатки. Выдох - опусти. Узкий хват тянет локти ближе к корпусу.",
    commonMistakes: ["Округление спины", "Подъём корпуса", "Недостаточная амплитуда"],
  },

  restSecDefault: 135,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Контроль возврата", "Не раскачивайся", "Плечи вниз"],
},
,
{
  id: "ho_smith_row",
  name: "Тяга в Смите в наклоне",
  nameEn: "Smith Row",
  patterns: ["horizontal_pull"],
  primaryMuscles: ["upper_back", "lats"],
  secondaryMuscles: ["biceps"],
  equipment: ["smith"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 3,
  stabilityDemand: 3,
  tags: ["stable_choice"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Гриф в Смите на уровне колен. Возьми гриф, отойди на шаг, наклонись. Спина прямая, угол 45° или параллель.",
    execution: "Вдох - подтяни гриф к животу, локти назад. Сведи лопатки. Выдох - опусти. Смит стабилизирует траекторию.",
    commonMistakes: ["Округление спины", "Подъём корпуса", "Тяга не к животу"],
  },

  restSecDefault: 120,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Тяни локтями", "Плечи вниз", "Не раскачивайся"],
},
,
{
  id: "ve_lat_pulldown",
  name: "Тяга верхнего блока к груди",
  nameEn: "Lat Pulldown",
  patterns: ["vertical_pull"],
  primaryMuscles: ["lats"],
  secondaryMuscles: ["biceps", "upper_back"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["lat_bias", "stable_choice", "good_for_circuit"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Сядь в тренажёр. Возьми широкую рукоять шире плеч, ладони от себя. Бёдра зафиксированы валиками. Откинься чуть назад (10-15°).",
    execution: "Руки вытянуты вверх. Вдох - подтяни рукоять к верху груди (ключицам), сводя лопатки вниз и вместе. Локти вниз и назад. Выдох - выпрями руки вверх. НЕ тяни к животу!",
    commonMistakes: ["Тяга за голову", "Тяга к животу", "Раскачивание", "Тяга руками без спины"],
  },

  restSecDefault: 90,
  plane: "sagittal",
  cues: ["Плечи вниз", "Тяни локтями", "Пауза в конце"],
},
,
{
  id: "ve_assisted_pull_up",
  name: "Подтягивания в гравитроне",
  nameEn: "Assisted Pull-up",
  patterns: ["vertical_pull"],
  primaryMuscles: ["lats"],
  secondaryMuscles: ["biceps", "upper_back"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["lat_bias", "progression_ready"],
  kind: "compound",
  repRangeDefault: {
    min: 6,
    max: 10,
  },

  technique: {
    setup: "Встань на платформу гравитрона, выбери противовес. Возьмись за турник чуть шире плеч, ладони от себя. Колени на подушке.",
    execution: "Вдох - подтянись вверх, сводя лопатки, грудь к турнику. Локти вниз и назад. Подбородок над турником. Выдох - опустись вниз. Гравитрон помогает.",
    commonMistakes: ["Раскачивание", "Неполная амплитуда", "Рывком", "Слишком большой противовес"],
  },

  restSecDefault: 90,
  plane: "sagittal",
  cues: ["Плечи вниз", "Тяни локтями", "Пауза в конце"],
},
,
{
  id: "ve_pull_up",
  name: "Подтягивания",
  nameEn: "Pull-up",
  patterns: ["vertical_pull"],
  primaryMuscles: ["lats", "upper_back"],
  secondaryMuscles: ["biceps", "core"],
  equipment: ["pullup_bar", "bodyweight"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 1,
  stabilityDemand: 4,
  tags: ["strength_bias", "lat_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 5,
    max: 10,
  },

  technique: {
    setup: "Возьмись за турник чуть шире плеч, ладони от себя. Вись на прямых руках, ноги можно скрестить.",
    execution: "Вдох - подтянись вверх, сводя лопатки, грудь к турнику. Смотри на турник. Подбородок выше турника. Выдох - опустись, полностью выпрямляя руки.",
    commonMistakes: ["Раскачивание (киппинг)", "Неполная амплитуда вниз", "Рывком", "Подъём подбородка без спины"],
  },

  restSecDefault: 120,
  plane: "sagittal",
  cues: ["Пауза в конце", "Тяни локтями", "Контроль возврата"],
},
,
{
  id: "ve_close_grip_pulldown",
  name: "Тяга верхнего блока узким хватом",
  nameEn: "Close-Grip Pulldown",
  patterns: ["vertical_pull"],
  primaryMuscles: ["lats"],
  secondaryMuscles: ["biceps"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["lat_bias", "easy_superset"],
  kind: "compound",
  repRangeDefault: {
    min: 10,
    max: 14,
  },

  technique: {
    setup: "Сядь в тренажёр. Возьми узкую рукоять (параллельные ручки), хват на ширине плеч, ладони друг к другу.",
    execution: "Вдох - подтяни рукоять к верху груди, локти вниз вдоль корпуса. Сведи лопатки. Корпус почти вертикально. Выдох - выпрями руки. Узкий хват больше низ широчайших.",
    commonMistakes: ["Раскачивание", "Тяга к животу", "Недостаточное сведение лопаток"],
  },

  restSecDefault: 90,
  plane: "sagittal",
  cues: ["Тяни локтями", "Пауза в конце", "Не раскачивайся"],
},
,
{
  id: "ve_underhand_pulldown",
  name: "Тяга верхнего блока обратным хватом",
  nameEn: "Underhand Pulldown",
  patterns: ["vertical_pull"],
  primaryMuscles: ["lats"],
  secondaryMuscles: ["biceps"],
  equipment: ["cable"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["lat_bias", "biceps_bias"],
  kind: "compound",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Сядь в тренажёр. Возьми прямую рукоять на ширине плеч, ладони К СЕБЕ (обратный хват).",
    execution: "Вдох - подтяни рукоять к верху груди, локти вниз и чуть назад. Обратный хват больше включает бицепс и низ широчайших. Выдох - выпрями руки.",
    commonMistakes: ["Тяга только бицепсами", "Раскачивание", "Неполная амплитуда"],
  },

  restSecDefault: 90,
  plane: "sagittal",
  cues: ["Не раскачивайся", "Пауза в конце", "Тяни локтями"],
},
,
{
  id: "re_face_pull",
  name: "Протяжка к лицу на блоке",
  nameEn: "Face Pull",
  patterns: ["rear_delts"],
  primaryMuscles: ["rear_delts", "upper_back"],
  secondaryMuscles: ["forearms"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["upper_back_bias", "easy_superset", "good_for_circuit", "shoulder_health"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 20,
  },

  technique: {
    setup: "Встань лицом к верхнему блоку. Канатная рукоять. Возьми за концы, отойди на шаг. Руки вытянуты на уровне лица.",
    execution: "Вдох - потяни рукоять к лицу, разводя руки в стороны. Концы каната по бокам головы. Локти высоко, выше кистей. Задержись. Выдох - выпрями руки.",
    commonMistakes: ["Тяга к груди (спина)", "Опущенные локти", "Тяга руками без разведения", "Недостаточное разведение"],
  },

  restSecDefault: 60,
  jointFlags: ["shoulder_sensitive"],
  plane: "transverse",
  cues: ["Постоянное натяжение", "Не махай", "Локоть чуть выше кисти"],
},
,
{
  id: "re_reverse_pec_deck",
  name: "Разведения в тренажере на задние дельты",
  nameEn: "Reverse Pec Deck",
  patterns: ["rear_delts"],
  primaryMuscles: ["rear_delts"],
  secondaryMuscles: ["upper_back"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["stable_choice", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 18,
  },

  technique: {
    setup: "Сядь в бабочку лицом К подушке. Грудь прижата. Возьми рукоятки, руки вытянуты вперёд параллельно полу.",
    execution: "Вдох - разведи руки назад дугой. Сведи лопатки. Задержись. Выдох - верни вперёд. Локти чуть согнуты. Работают задние дельты и верх спины.",
    commonMistakes: ["Сгибание рук (спина)", "Отрыв груди", "Неполная амплитуда назад", "Рывки"],
  },

  restSecDefault: 60,
  plane: "transverse",
  cues: ["Не махай", "Локоть чуть выше кисти", "Плечи вниз"],
},
,
{
  id: "re_db_reverse_fly",
  name: "Разведения гантелей в наклоне",
  nameEn: "DB Reverse Fly",
  patterns: ["rear_delts"],
  primaryMuscles: ["rear_delts"],
  secondaryMuscles: ["upper_back"],
  equipment: ["dumbbell"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 3,
  tags: ["good_for_circuit", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 20,
  },

  technique: {
    setup: "Возьми гантели. Наклонись до параллели (или сядь, наклонившись). Руки висят с гантелями, локти слегка согнуты.",
    execution: "Вдох - подними гантели в стороны дугой, как крылья. Локти чуть согнуты. Поднимай до уровня спины. Сведи лопатки. Выдох - опусти. Голову не поднимай.",
    commonMistakes: ["Подъём корпуса", "Сгибание рук (спина)", "Рывки", "Округление спины"],
  },

  restSecDefault: 60,
  jointFlags: ["shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Локоть чуть выше кисти", "Не махай", "Плечи вниз"],
},
,
{
  id: "re_seated_rope_face_pull",
  name: "Тяга каната к лицу сидя",
  nameEn: "Seated Rope Face Pull",
  patterns: ["rear_delts"],
  primaryMuscles: ["rear_delts"],
  secondaryMuscles: ["upper_back"],
  equipment: ["cable"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["shoulder_health", "constant_tension"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 20,
  },
  restSecDefault: 60,
  plane: "transverse",
  cues: ["Контроль амплитуды", "Локоть чуть выше кисти", "Плечи вниз"],
},
,
{
  id: "de_db_lateral_raise",
  name: "Подъёмы гантелей в стороны",
  nameEn: "DB Lateral Raise",
  patterns: ["delts_iso"],
  primaryMuscles: ["side_delts"],
  secondaryMuscles: ["front_delts"],
  equipment: ["dumbbell"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 2,
  tags: ["easy_superset", "good_for_circuit", "shoulder_bias"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 20,
  },

  technique: {
    setup: "Встань прямо, ноги на ширине плеч. Гантели по бокам. Локти слегка согнуты.",
    execution: "Вдох - подними гантели в стороны дугой до уровня плеч. Локти чуть согнуты. Мизинцы чуть выше больших пальцев. Выдох - опусти медленно. Работают средние дельты.",
    commonMistakes: ["Читинг корпусом", "Подъём трапециями", "Слишком тяжёлые гантели", "Прямые руки", "Выше ушей"],
  },

  restSecDefault: 60,
  jointFlags: ["shoulder_sensitive"],
  plane: "frontal",
  cues: ["Плечи вниз", "Не махай", "Локоть чуть выше кисти"],
},
,
{
  id: "de_cable_lateral_raise",
  name: "Подъём руки в сторону на блоке",
  nameEn: "Cable Lateral Raise",
  patterns: ["delts_iso"],
  primaryMuscles: ["side_delts"],
  equipment: ["cable"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["constant_tension", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 20,
  },

  technique: {
    setup: "Встань боком к нижнему блоку. Возьми рукоять дальней рукой. Рука перед телом, локоть слегка согнут.",
    execution: "Вдох - подними руку в сторону дугой до плеча. Мизинец выше большого пальца. Выдох - опусти. Трос создаёт постоянное натяжение.",
    commonMistakes: ["Раскачивание", "Подъём плечом", "Быстро", "Тяга вверх вместо подъёма"],
  },

  restSecDefault: 60,
  plane: "frontal",
  cues: ["Плечи вниз", "Контроль амплитуды", "Локоть чуть выше кисти"],
},
,
{
  id: "de_machine_lateral_raise",
  name: "Подъёмы в стороны в тренажере",
  nameEn: "Machine Lateral Raise",
  patterns: ["delts_iso"],
  primaryMuscles: ["side_delts"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["stable_choice", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 18,
  },

  technique: {
    setup: "Сядь в тренажёр для махов. Локти на уровне плеч. Предплечья на подушках.",
    execution: "Вдох - подними руки в стороны, разводя подушки до плеч. Выдох - опусти. Тренажёр изолирует средние дельты.",
    commonMistakes: ["Подъём плечами", "Слишком высокий подъём", "Рывки"],
  },

  restSecDefault: 60,
  plane: "frontal",
  cues: ["Постоянное натяжение", "Плечи вниз", "Не махай"],
},
,
{
  id: "de_front_raise",
  name: "Подъёмы гантелей перед собой",
  nameEn: "Front Raise",
  patterns: ["delts_iso"],
  primaryMuscles: ["front_delts"],
  equipment: ["dumbbell", "cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 2,
  tags: ["easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань прямо, гантели (или штанга) перед бёдрами. Руки прямые или слегка согнуты.",
    execution: "Вдох - подними гантели перед собой до глаз (или чуть выше). Руки параллельны. Выдох - опусти медленно. Работают передние дельты.",
    commonMistakes: ["Читинг спиной", "Подъём выше головы", "Быстро", "Раскачивание"],
  },

  restSecDefault: 60,
  jointFlags: ["shoulder_sensitive"],
  plane: "sagittal",
  cues: ["Плечи вниз", "Локоть чуть выше кисти", "Контроль амплитуды"],
},
,
{
  id: "ar_triceps_pushdown",
  name: "Разгибания на трицепс на блоке",
  nameEn: "Triceps Pushdown",
  patterns: ["arms_iso"],
  primaryMuscles: ["triceps"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["easy_superset", "good_for_circuit"],
  kind: "isolation",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань лицом к верхнему блоку. Возьми прямую рукоять хватом сверху. Локти прижми к корпусу, предплечья параллельно полу.",
    execution: "Вдох - разогни руки вниз к бёдрам. Разгибай полностью. Локти неподвижны! Выдох - верни вверх до 90°. Работают трицепсы.",
    commonMistakes: ["Отведение локтей", "Наклон корпуса вперёд", "Неполное разгибание", "Слишком большой вес"],
  },

  restSecDefault: 60,
  jointFlags: ["wrist_sensitive", "elbow_sensitive"],
  plane: "sagittal",
  cues: ["Локти фиксированы", "Полная амплитуда", "Без раскачки"],
},
,
{
  id: "ar_db_curl",
  name: "Сгибания рук с гантелями",
  nameEn: "DB Curl",
  patterns: ["arms_iso"],
  primaryMuscles: ["biceps"],
  secondaryMuscles: ["forearms"],
  equipment: ["dumbbell"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 1,
  stabilityDemand: 2,
  tags: ["easy_superset", "good_for_circuit"],
  kind: "isolation",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань прямо или сядь. Гантели в руках по бокам, ладони вперёд. Локти прижаты к корпусу.",
    execution: "Вдох - согни руки, поднимая к плечам. Локти неподвижны! Только предплечья. Можно одновременно или поочерёдно. Напряги бицепс наверху. Выдох - опусти медленно.",
    commonMistakes: ["Отведение локтей назад", "Читинг спиной", "Раскачивание", "Неполная амплитуда вниз"],
  },

  restSecDefault: 60,
  jointFlags: ["wrist_sensitive", "elbow_sensitive"],
  plane: "sagittal",
  cues: ["Сожми в конце", "Полная амплитуда", "Без раскачки"],
},
,
{
  id: "ar_incline_db_curl",
  name: "Сгибания рук с гантелями на наклонной скамье",
  nameEn: "Incline DB Curl",
  patterns: ["arms_iso"],
  primaryMuscles: ["biceps"],
  equipment: ["dumbbell", "bench"],
  minLevel: "intermediate",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["hypertrophy_bias", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 10,
    max: 14,
  },

  technique: {
    setup: "Скамья под 45-60°. Сядь, прижми спину. Гантели в руках, руки висят вниз по бокам. Ладони вперёд.",
    execution: "Локти немного позади корпуса - растягивает бицепс. Вдох - согни руки к плечам. Локти неподвижны! Выдох - опусти, полностью выпрямляя. Наклон даёт сильную растяжку.",
    commonMistakes: ["Отрыв локтей", "Раскачивание", "Отрыв спины", "Неполное выпрямление"],
  },

  restSecDefault: 60,
  jointFlags: ["elbow_sensitive"],
  plane: "sagittal",
  cues: ["Локти фиксированы", "Без раскачки", "Полная амплитуда"],
},
,
{
  id: "ar_overhead_cable_triceps_ext",
  name: "Французский жим на блоке стоя",
  nameEn: "Overhead Cable Triceps Ext",
  patterns: ["arms_iso"],
  primaryMuscles: ["triceps"],
  equipment: ["cable"],
  minLevel: "intermediate",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["long_head_bias", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань спиной к верхнему блоку. Возьми канатную рукоять, подними над головой (локти вверх). Отойди на шаг.",
    execution: "Локти вперёд-вверх, неподвижны. Предплечья назад. Вдох - разогни руки вверх-вперёд. Выдох - согни назад. Трицепсы, акцент на длинную головку.",
    commonMistakes: ["Движение локтей в стороны", "Наклон корпуса", "Неполное разгибание"],
  },

  restSecDefault: 60,
  jointFlags: ["shoulder_sensitive", "elbow_sensitive"],
  plane: "sagittal",
  cues: ["Контроль вниз", "Полная амплитуда", "Локти фиксированы"],
},
,
{
  id: "ar_cable_curl",
  name: "Сгибания на блоке",
  nameEn: "Cable Curl",
  patterns: ["arms_iso"],
  primaryMuscles: ["biceps"],
  secondaryMuscles: ["forearms"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["constant_tension", "easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань лицом к нижнему блоку. Возьми прямую рукоять хватом снизу. Отойди на шаг, локти у корпуса.",
    execution: "Вдох - согни руки к плечам. Локти неподвижны. Трос создаёт постоянное натяжение. Выдох - выпрями руки.",
    commonMistakes: ["Отведение локтей", "Наклон корпуса", "Читинг"],
  },

  restSecDefault: 60,
  jointFlags: ["elbow_sensitive"],
  plane: "sagittal",
  cues: ["Без раскачки", "Контроль вниз", "Полная амплитуда"],
},
,
{
  id: "ar_ez_skullcrusher",
  name: "Французский жим EZ-штанги лёжа",
  nameEn: "EZ Skullcrusher",
  patterns: ["arms_iso"],
  primaryMuscles: ["triceps"],
  equipment: ["barbell", "bench"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 3,
  stabilityDemand: 2,
  tags: ["strength_bias", "hypertrophy_bias"],
  kind: "isolation",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Ляг на скамью. Возьми EZ-гриф, подними над грудью. Руки почти прямые, немного к голове (не строго вертикально). Локти уже плеч.",
    execution: "Локти неподвижны! Вдох - согни руки, опуская гриф ко лбу (или за голову). Опускай медленно. Выдох - разогни руки вверх. Трицепсы.",
    commonMistakes: ["Движение локтей", "Разведение локтей", "Быстрое опускание", "Удар в лоб"],
  },

  restSecDefault: 75,
  jointFlags: ["elbow_sensitive", "wrist_sensitive"],
  plane: "sagittal",
  cues: ["Сожми в конце", "Без раскачки", "Полная амплитуда"],
},
,
{
  id: "ar_ez_bar_curl",
  name: "Сгибания рук с EZ-штангой",
  nameEn: "EZ Bar Curl",
  patterns: ["arms_iso"],
  primaryMuscles: ["biceps"],
  secondaryMuscles: ["forearms"],
  equipment: ["barbell"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["strength_bias"],
  kind: "isolation",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Встань прямо. Возьми EZ-гриф хватом снизу, руки на изогнутых частях. Гриф перед бёдрами.",
    execution: "Вдох - согни руки, поднимая к плечам. Локти неподвижны у корпуса. Напряги бицепс наверху. Выдох - опусти медленно. EZ-гриф снижает нагрузку на запястья.",
    commonMistakes: ["Отведение локтей", "Читинг спиной", "Неполное опускание", "Быстро"],
  },

  restSecDefault: 75,
  jointFlags: ["wrist_sensitive", "elbow_sensitive"],
  plane: "sagittal",
  cues: ["Локти фиксированы", "Без раскачки", "Контроль вниз"],
},
,
{
  id: "ca_standing_calf_raise",
  name: "Подъёмы на носки стоя",
  nameEn: "Standing Calf Raise",
  patterns: ["calves"],
  primaryMuscles: ["calves"],
  equipment: ["machine", "smith", "bodyweight"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["easy_superset", "good_for_circuit"],
  kind: "isolation",
  repRangeDefault: {
    min: 10,
    max: 20,
  },

  technique: {
    setup: "Встань в тренажёр для икр стоя. Плечи под подушками, носки на платформе, пятки в воздухе. Ноги прямые.",
    execution: "Опусти пятки максимально вниз, растягивая икры. Вдох - поднимись на носки максимально высоко. Задержись, напрягая. Выдох - опусти вниз. Икроножная мышца.",
    commonMistakes: ["Сгибание коленей", "Неполная амплитуда вниз", "Рывки", "Быстро"],
  },

  restSecDefault: 60,
  plane: "sagittal",
  cues: ["Не пружинь", "Пауза вверху", "Растяжение внизу"],
},
,
{
  id: "ca_seated_calf_raise",
  name: "Подъёмы на носки сидя",
  nameEn: "Seated Calf Raise",
  patterns: ["calves"],
  primaryMuscles: ["calves"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["easy_superset", "stable_choice"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 20,
  },

  technique: {
    setup: "Сядь в тренажёр для икр сидя. Носки на платформе, пятки в воздухе. Колени под валиками.",
    execution: "Опусти пятки максимально вниз. Вдох - поднимись на носки высоко. Задержись. Выдох - опусти. Сидячая позиция акцентирует камбаловидную мышцу.",
    commonMistakes: ["Неполная амплитуда", "Отрыв носков", "Быстро"],
  },

  restSecDefault: 60,
  plane: "sagittal",
  cues: ["Пауза вверху", "Контроль", "Растяжение внизу"],
},
,
{
  id: "ca_calf_press_on_leg_press",
  name: "Подъёмы на носки в жиме ногами",
  nameEn: "Calf Press on Leg Press",
  patterns: ["calves"],
  primaryMuscles: ["calves"],
  equipment: ["machine"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 2,
  stabilityDemand: 1,
  tags: ["easy_superset"],
  kind: "isolation",
  repRangeDefault: {
    min: 12,
    max: 20,
  },

  technique: {
    setup: "Сядь в жим ногами. Только носки на нижний край платформы, пятки в воздухе. Ноги почти прямые (колени слегка согнуты).",
    execution: "Опусти пятки вниз, сгибая стопы на себя. Растяни икры. Вдох - выжми платформу носками, поднимая пятки максимально высоко. Выдох - опусти.",
    commonMistakes: ["Сгибание коленей сильно", "Неполная амплитуда", "Отрыв стоп"],
  },

  restSecDefault: 60,
  plane: "sagittal",
  cues: ["Контроль", "Пауза вверху", "Растяжение внизу"],
},
,
{
  id: "co_plank",
  name: "Планка",
  nameEn: "Plank",
  patterns: ["core"],
  primaryMuscles: ["core"],
  equipment: ["bodyweight"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 1,
  stabilityDemand: 2,
  tags: ["low_setup", "good_for_circuit", "spine_friendly"],
  kind: "core",
  repRangeDefault: {
    min: 20,
    max: 60,
  },

  technique: {
    setup: "Упор на предплечья (локти под плечами) и носки ног. Тело прямое от головы до пяток - одна линия.",
    execution: "Держи позицию, напрягая пресс и ягодицы. Дыши ровно. Не прогибайся! Не поднимай ягодицы! Держи 20-60+ секунд.",
    commonMistakes: ["Провисание поясницы", "Ягодицы вверх", "Задержка дыхания", "Подъём головы"],
  },

  restSecDefault: 45,
  plane: "sagittal",
  cues: ["Таз нейтрально", "Контроль", "Дыши"],
},
,
{
  id: "co_dead_bug",
  name: "Мёртвый жук",
  nameEn: "Dead Bug",
  patterns: ["core"],
  primaryMuscles: ["core"],
  equipment: ["bodyweight"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 3,
  tags: ["spine_friendly", "good_for_circuit"],
  kind: "core",
  repRangeDefault: {
    min: 8,
    max: 14,
  },

  technique: {
    setup: "Ляг на спину. Подними руки вертикально. Подними ноги, согни колени 90°. Поясница прижата к полу.",
    execution: "Вдох - медленно опусти правую руку за голову, одновременно выпрямляя левую ногу вперёд (почти до пола). Поясница НЕ отрывается! Выдох - верни. Повтори на другую сторону.",
    commonMistakes: ["Отрыв поясницы", "Быстро", "Касание ногой пола", "Задержка дыхания"],
  },

  restSecDefault: 45,
  plane: "sagittal",
  cues: ["Дыши", "Не прогибайся", "Таз нейтрально"],
},
,
{
  id: "co_cable_crunch",
  name: "Скручивания на блоке",
  nameEn: "Cable Crunch",
  patterns: ["core"],
  primaryMuscles: ["core"],
  equipment: ["cable"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["hypertrophy_bias", "easy_superset"],
  kind: "core",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань на колени лицом к верхнему блоку. Возьми канатную рукоять, опусти к затылку. Держи у головы.",
    execution: "Вдох - скрутись вниз, грудь к тазу. Округляй спину (здесь можно!). Тяни прессом, не руками! Выдох - разогнись наверх, но не полностью. Держи напряжение.",
    commonMistakes: ["Тяга руками", "Полное разгибание наверху", "Движение бёдрами", "Слишком большой вес"],
  },

  restSecDefault: 60,
  plane: "sagittal",
  cues: ["Контроль", "Не прогибайся", "Рёбра вниз"],
},
,
{
  id: "co_hanging_knee_raise",
  name: "Подъём коленей в висе",
  nameEn: "Hanging Knee Raise",
  patterns: ["core"],
  primaryMuscles: ["core"],
  secondaryMuscles: ["forearms"],
  equipment: ["pullup_bar"],
  minLevel: "intermediate",
  difficulty: 4,
  setupCost: 1,
  stabilityDemand: 4,
  tags: ["hard_day_ok"],
  kind: "core",
  repRangeDefault: {
    min: 8,
    max: 12,
  },

  technique: {
    setup: "Повисни на турнике прямым хватом. Ноги прямые или слегка согнуты. Плечи активны.",
    execution: "Вдох - подними колени к груди, скручивая таз вверх. Не раскачивайся! Наверху таз подкручен. Выдох - опусти ноги контролируемо.",
    commonMistakes: ["Раскачивание", "Подъём ног без скручивания таза", "Быстро", "Расслабленные плечи"],
  },

  restSecDefault: 75,
  plane: "sagittal",
  cues: ["Контроль", "Таз нейтрально", "Не прогибайся"],
},
,
{
  id: "co_pallof_press",
  name: "Паллоф-пресс",
  nameEn: "Pallof Press",
  patterns: ["core"],
  primaryMuscles: ["core"],
  equipment: ["cable", "bands"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 2,
  stabilityDemand: 2,
  tags: ["anti_rotation", "spine_friendly", "easy_superset"],
  kind: "core",
  repRangeDefault: {
    min: 10,
    max: 15,
  },

  technique: {
    setup: "Встань боком к среднему блоку. Возьми рукоять обеими руками, прижми к груди. Отойди в сторону, трос натянут.",
    execution: "Вдох - выпрями руки вперёд, не поворачивая корпус! Трос пытается развернуть - сопротивляйся прессом. Задержись. Выдох - верни к груди. Смени сторону.",
    commonMistakes: ["Поворот корпуса", "Далеко от блока", "Слишком большой вес", "Наклон в сторону"],
  },

  restSecDefault: 45,
  plane: "transverse",
  cues: ["Таз нейтрально", "Не прогибайся", "Рёбра вниз"],
},
,
{
  id: "ca_farmer_s_walk",
  name: "Прогулка фермера",
  nameEn: "Farmer’s Walk",
  patterns: ["carry"],
  primaryMuscles: ["core", "forearms"],
  secondaryMuscles: ["upper_back", "glutes"],
  equipment: ["dumbbell", "kettlebell"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 2,
  tags: ["good_for_circuit", "low_setup", "grip"],
  kind: "carry",
  repRangeDefault: {
    min: 20,
    max: 60,
  },

  technique: {
    setup: "Возьми тяжёлые гантели в обе руки. Встань прямо, гантели по бокам. Плечи назад, грудь вперёд.",
    execution: "Иди вперёд ровными шагами. Корпус прямой, не наклоняйся в стороны! Плечи вниз и назад. Дыши ровно. Иди 20-60 сек. Функциональное упражнение для всего тела.",
    commonMistakes: ["Наклон в сторону", "Подъём плеч к ушам", "Округление спины", "Семенящие шаги"],
  },

  restSecDefault: 60,
  plane: "mixed",
  cues: ["Не заваливайся", "Шаг ровный", "Плечи вниз"],
},
,
{
  id: "ca_suitcase_carry",
  name: "Переноска чемодана",
  nameEn: "Suitcase Carry",
  patterns: ["carry"],
  primaryMuscles: ["core"],
  secondaryMuscles: ["forearms", "upper_back", "glutes"],
  equipment: ["dumbbell", "kettlebell"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 3,
  tags: ["anti_lateral_flexion", "good_for_circuit"],
  kind: "carry",
  repRangeDefault: {
    min: 20,
    max: 50,
  },

  technique: {
    setup: "Возьми тяжёлую гантель ОДНОЙ рукой (как чемодан). Вторая рука свободна. Встань прямо.",
    execution: "Иди вперёд с гантелью в одной руке. НЕ наклоняйся в сторону! Корпус вертикально, пресс напряжён. После подхода смени руку.",
    commonMistakes: ["Наклон в сторону гантели", "Подъём плеча", "Скручивание корпуса", "Слишком тяжёлая"],
  },

  restSecDefault: 60,
  unilateral: true,
  plane: "mixed",
  cues: ["Дыши", "Плечи вниз", "Шаг ровный"],
},
,
{
  id: "ca_front_rack_carry",
  name: "Переноска в положении фронтального приседа",
  nameEn: "Front Rack Carry",
  patterns: ["carry"],
  primaryMuscles: ["core"],
  secondaryMuscles: ["upper_back", "front_delts"],
  equipment: ["kettlebell", "dumbbell"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 1,
  stabilityDemand: 3,
  tags: ["posture", "good_for_circuit"],
  kind: "carry",
  repRangeDefault: {
    min: 20,
    max: 50,
  },
  restSecDefault: 60,
  plane: "mixed",
  cues: ["Дыши", "Плечи вниз", "Шаг ровный"],
},
,
{
  id: "co_incline_treadmill_walk",
  name: "Ходьба на дорожке в горку",
  nameEn: "Incline Treadmill Walk",
  patterns: ["conditioning_low_impact"],
  primaryMuscles: ["glutes", "core"],
  secondaryMuscles: ["calves"],
  equipment: ["cardio_machine"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 1,
  stabilityDemand: 1,
  tags: ["zone2", "recovery_friendly", "fat_loss_friendly"],
  kind: "conditioning",
  repRangeDefault: {
    min: 8,
    max: 20,
  },

  technique: {
    setup: "Встань на беговую дорожку. Установи наклон 5-15% (в горку). Скорость 5-7 км/ч (быстрая ходьба).",
    execution: "Иди ровным темпом в горку 15-45 минут. Пульс в зоне 2 (60-70% от макс) - легко разговаривать. Грудь вперёд, руки двигаются естественно. НЕ держись за поручни!",
    commonMistakes: ["Держание за поручни", "Слишком высокая скорость", "Неровный ритм", "Наклон вперёд"],
  },

  restSecDefault: 0,
  plane: "sagittal",
  cues: ["Следи за пульсом", "Ровный темп", "Не теряй технику"],
},
,
{
  id: "co_bike_easy",
  name: "Велотренажёр лёгкий темп",
  nameEn: "Bike Easy",
  patterns: ["conditioning_low_impact"],
  primaryMuscles: ["quads", "glutes"],
  equipment: ["cardio_machine"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 1,
  stabilityDemand: 1,
  tags: ["zone2", "knee_friendly", "fat_loss_friendly"],
  kind: "conditioning",
  repRangeDefault: {
    min: 8,
    max: 20,
  },

  technique: {
    setup: "Сядь на велотренажёр. Отрегулируй сиденье - нога почти прямая в нижней точке педали.",
    execution: "Крути педали в лёгком-среднем темпе 20-45 минут. Пульс в зоне 2 (легко дышишь). Держи ровный каденс 60-80 об/мин. Низко-ударное кардио.",
    commonMistakes: ["Слишком высокое сиденье", "Слишком быстрый темп", "Неровный каденс"],
  },

  restSecDefault: 0,
  plane: "sagittal",
  cues: ["Ровный темп", "Контроль дыхания", "Не теряй технику"],
},
,
{
  id: "co_elliptical_easy",
  name: "Эллипсоид лёгкий темп",
  nameEn: "Elliptical Easy",
  patterns: ["conditioning_low_impact"],
  primaryMuscles: ["quads", "glutes"],
  secondaryMuscles: ["core"],
  equipment: ["cardio_machine"],
  minLevel: "beginner",
  difficulty: 1,
  setupCost: 1,
  stabilityDemand: 1,
  tags: ["zone2", "low_impact", "fat_loss_friendly"],
  kind: "conditioning",
  repRangeDefault: {
    min: 8,
    max: 20,
  },

  technique: {
    setup: "Встань на эллипсоид. Возьмись за движущиеся рукоятки (для всего тела) или за неподвижные.",
    execution: "Двигайся в ровном темпе 20-45 минут. Пульс в зоне 2. Давай ногами в обе стороны. Корпус прямо. Полностью опускай пятки на педали.",
    commonMistakes: ["Слишком быстрый темп", "Отрыв пяток", "Наклон вперёд", "Давление только носками"],
  },

  restSecDefault: 0,
  plane: "sagittal",
  cues: ["Не теряй технику", "Контроль дыхания", "Держи ритм"],
},
,
{
  id: "co_bike_intervals",
  name: "Интервалы на велотренажёре",
  nameEn: "Bike Intervals",
  patterns: ["conditioning_intervals"],
  primaryMuscles: ["quads", "glutes"],
  equipment: ["cardio_machine"],
  minLevel: "beginner",
  difficulty: 2,
  setupCost: 1,
  stabilityDemand: 1,
  tags: ["intervals", "fat_loss_friendly"],
  kind: "conditioning",
  repRangeDefault: {
    min: 8,
    max: 16,
  },

  technique: {
    setup: "Сядь на велотренажёр. Разомнись 5 минут в лёгком темпе.",
    execution: "Интервалы: 30 сек МАКСИМАЛЬНОГО усилия (педали максимально быстро, высокое сопротивление) → 90-120 сек лёгкого восстановления. Повтори 6-10 раз. Заминка 5 мин.",
    commonMistakes: ["Недостаточно интенсивные интервалы", "Короткое восстановление", "Нет разминки", "Слишком много интервалов"],
  },

  restSecDefault: 0,
  plane: "sagittal",
  cues: ["Не теряй технику", "Следи за пульсом", "Ровный темп"],
},
,
{
  id: "co_row_erg_intervals",
  name: "Интервалы на гребле",
  nameEn: "Row Erg Intervals",
  patterns: ["conditioning_intervals"],
  primaryMuscles: ["upper_back", "glutes"],
  secondaryMuscles: ["core"],
  equipment: ["cardio_machine"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 1,
  stabilityDemand: 2,
  tags: ["intervals", "full_body_cardio", "fat_loss_friendly"],
  kind: "conditioning",
  repRangeDefault: {
    min: 8,
    max: 14,
  },

  technique: {
    setup: "Сядь на гребной тренажёр. Разомнись 5 минут в лёгком темпе.",
    execution: "Интервалы: 60 сек МОЩНОЙ гребли (80-90% усилий) → 90-120 сек лёгкой для восстановления. Повтори 5-8 раз. Следи за техникой даже в интервалах! Заминка 5 мин.",
    commonMistakes: ["Потеря техники в интервалах", "Короткое восстановление", "Слишком много интервалов"],
  },

  restSecDefault: 0,
  jointFlags: ["low_back_sensitive"],
  plane: "sagittal",
  cues: ["Контроль дыхания", "Следи за пульсом", "Не теряй технику"],
},
,
{
  id: "co_treadmill_run_walk_intervals",
  name: "Интервалы на дорожке (бег/ходьба)",
  nameEn: "Treadmill Run/Walk Intervals",
  patterns: ["conditioning_intervals"],
  primaryMuscles: ["quads", "calves"],
  secondaryMuscles: ["core"],
  equipment: ["cardio_machine"],
  minLevel: "intermediate",
  difficulty: 3,
  setupCost: 1,
  stabilityDemand: 2,
  tags: ["intervals", "fat_loss_friendly"],
  kind: "conditioning",
  repRangeDefault: {
    min: 10,
    max: 18,
  },
  restSecDefault: 0,
  jointFlags: ["knee_sensitive"],
  plane: "sagittal",
  cues: ["Контроль дыхания", "Держи ритм", "Ровный темп"],
}
];

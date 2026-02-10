// normalizedSchemes.ts
// ============================================================================
// NORMALIZED WORKOUT SCHEMES (replace your current workoutSchemes file)
// Philosophy:
// - Keep a compact set of archetypes (20–35), not 150+ duplicates
// - Personalization happens via: days/time/goal/experience/location/constraints
// - Each day has required movement patterns; code fills exercises inside those slots
// - Chronic/medical: do NOT model as "schemes per disease". Use constraint tags.
// ============================================================================

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type Goal =
  | "build_muscle"
  | "lose_weight"
  | "athletic_body"
  | "health_wellness";

export type Location = "gym" | "home_no_equipment" | "home_with_gear";

export type TimeBucket = 45 | 60 | 90; // 90 means "90+"

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
  | "triceps_iso"
  | "biceps_iso"
  | "arms_iso" // Deprecated: use triceps_iso or biceps_iso
  | "calves"
  | "core"
  | "carry"
  | "conditioning_low_impact"
  | "conditioning_intervals";

export type ConstraintTag =
  | "avoid_overhead_press"
  | "avoid_deep_knee_flexion"
  | "avoid_heavy_spinal_loading"
  | "avoid_heavy_hip_hinge"
  | "avoid_high_impact"
  | "beginner_simplicity"
  | "medical_clearance_required";

export type DayBlueprint = {
  day: number; // 1..N
  label: string; // e.g. "Push", "Full Body A"
  focus: string; // human readable
  templateRulesId?: string; // must exist in TRAINING_RULES_LIBRARY (your file)
  requiredPatterns: Pattern[];
  // NOTE: optionalPatterns is NOT used by the generator.
  // Optional slots come from TRAINING_RULES_LIBRARY[templateRulesId].optional.
  // This field is kept for documentation / future use only.
  optionalPatterns?: Pattern[];
};

export type NormalizedWorkoutScheme = {
  id: string;
  name: string; // internal
  russianName: string; // UI title
  description: string; // UI summary
  splitType:
    | "full_body"
    | "upper_lower"
    | "push_pull_legs"
    | "strength_focus"
    | "lower_focus"
    | "conditioning"
    | "bro_split";
  daysPerWeek: number;
  
  // Which durations this archetype is designed for
  timeBuckets: TimeBucket[];
  
  // Targeting
  goals: Goal[];
  experienceLevels: ExperienceLevel[];
  locations: Location[];
  intensity: "low" | "moderate" | "high";
  targetSex?: "male" | "female" | "any";
  
  // Structure
  days: DayBlueprint[];
  
  // Hard "do not recommend" when these tags exist in user constraints
  contraindications?: ConstraintTag[];
  
  // Used by your recommender to justify: "why this scheme"
  benefits: string[];
  notes?: string;
};

// ============================================================================
// RECOMMENDED: keep user constraints in tags (not diagnoses).
// Example mapping UI -> tags:
// - shoulder pain on overhead: avoid_overhead_press
// - knee pain/deep squat pain: avoid_deep_knee_flexion
// - low back pain: avoid_heavy_spinal_loading, maybe avoid_heavy_hip_hinge
// - high BMI/joint pain: avoid_high_impact
// - any serious medical: medical_clearance_required
// ============================================================================

export const NORMALIZED_SCHEMES: NormalizedWorkoutScheme[] = [
  // ==========================================================================
  // 2 DAYS / WEEK
  // ==========================================================================
  {
    id: "fb_2x_beginner_base",
    name: "Full Body 2x Base",
    russianName: "Новичок: всё тело 2 раза",
    description:
      "Две тренировки на всё тело — безопасный и эффективный старт для формы и похудения.",
    splitType: "full_body",
    daysPerWeek: 2,
    timeBuckets: [45, 60, 90],
    goals: ["lose_weight", "health_wellness", "athletic_body", "build_muscle"],
    experienceLevels: ["beginner", "intermediate"],
    locations: ["gym", "home_with_gear", "home_no_equipment"],
    intensity: "low",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Full Body A",
        focus:
          "База на всё тело: присед/тяга/жим + простые аксессуары, без перегруза.",
        templateRulesId: "Full Body A",
        requiredPatterns: ["squat", "horizontal_push", "horizontal_pull", "core"],
        optionalPatterns: ["lunge", "calves", "carry", "conditioning_low_impact"],
      },
      {
        day: 2,
        label: "Full Body B",
        focus:
          "Вариативность углов: другой вариант ног/тяги/жима + акцент на технику.",
        templateRulesId: "Full Body B",
        requiredPatterns: ["hinge", "incline_push", "vertical_pull", "core"],
        optionalPatterns: ["lunge", "rear_delts", "calves", "conditioning_low_impact"],
      },
    ],
    benefits: [
      "Лучший вариант для новичка при 2 тренировках в неделю.",
      "Частая практика основных движений без перегруза суставов.",
      "Хорошо работает и на похудение, и на тонус/мышцы.",
    ],
    notes:
      "Для похудения добавляй шаги/кардио отдельно; силовые держи стабильными.",
  },
  {
    id: "fb_2x_recovery_gentle",
    name: "Full Body 2x Gentle",
    russianName: "Мягкое начало 2 дня",
    description:
      "Щадящий вариант для после перерыва/низкой готовности: техника, умеренный объём, контроль.",
    splitType: "full_body",
    daysPerWeek: 2,
    timeBuckets: [45, 60],
    goals: ["lose_weight", "health_wellness", "athletic_body"],
    experienceLevels: ["beginner"],
    locations: ["gym", "home_with_gear", "home_no_equipment"],
    intensity: "low",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Full Body A",
        focus: "Техника и контроль: лёгкая база + мобилити/кор.",
        templateRulesId: "Full Body A",
        requiredPatterns: ["squat", "horizontal_pull", "core"],
        optionalPatterns: ["horizontal_push", "lunge", "conditioning_low_impact"],
      },
      {
        day: 2,
        label: "Full Body C",
        focus: "Сбалансированный лёгкий день: без тяжёлых осевых нагрузок.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["hinge", "incline_push", "vertical_pull", "core"],
        optionalPatterns: ["rear_delts", "calves", "conditioning_low_impact"],
      },
    ],
    benefits: [
      "Минимальный риск перегруза.",
      "Хорошо для восстановления привычки тренироваться.",
      "Повышает выносливость и самочувствие.",
    ],
    notes:
      "Если есть постоянная боль/симптомы — включай ограничения через constraint tags и смещай тренировки в low-impact.",
  },
  {
    id: "maintenance_2x_advanced",
    name: "Maintenance 2x Advanced",
    russianName: "Поддержка формы 2 дня (продвинутые)",
    description:
      "Минималистичная программа для поддержки силы и массы при занятом графике или в период восстановления.",
    splitType: "full_body",
    daysPerWeek: 2,
    timeBuckets: [45, 60, 90],
    goals: ["health_wellness", "build_muscle", "lose_weight", "athletic_body"],
    experienceLevels: ["advanced", "intermediate"],
    locations: ["gym", "home_with_gear", "home_no_equipment"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Full Body A",
        focus: "Эффективная база: присед/жим/тяга + кор (контролируемый объём).",
        templateRulesId: "Full Body A",
        requiredPatterns: ["squat", "horizontal_push", "horizontal_pull", "core"],
        optionalPatterns: ["calves"],
      },
      {
        day: 2,
        label: "Full Body B",
        focus: "Вариативность: хиндж/жим под углом/тяга сверху + задние дельты.",
        templateRulesId: "Full Body B",
        requiredPatterns: ["hinge", "incline_push", "vertical_pull", "core"],
        optionalPatterns: ["rear_delts", "lunge"],
      },
    ],
    benefits: [
      "Минимум времени — максимум эффективности.",
      "Поддерживает силу и мышечную массу при занятом графике.",
      "Подходит для продвинутых в периоды высокой нагрузки на работе/жизни.",
    ],
    notes:
      "Не для роста массы — только поддержка. При наличии времени лучше вернуться к 3-4 дням.",
  },

  // ==========================================================================
  // 3 DAYS / WEEK
  // ==========================================================================
  {
    id: "fb_3x_classic",
    name: "Full Body 3x Classic",
    russianName: "Классика: всё тело 3 раза",
    description:
      "Три тренировки на всё тело (A/B/C) — лучший универсальный вариант для новичка и большинства людей.",
    splitType: "full_body",
    daysPerWeek: 3,
    timeBuckets: [45, 60, 90],
    goals: ["lose_weight", "health_wellness", "athletic_body", "build_muscle"],
    experienceLevels: ["beginner", "intermediate", "advanced"],
    locations: ["gym", "home_with_gear", "home_no_equipment"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Full Body A",
        focus: "Передняя цепь + база: присед/жим/тяга + кор.",
        templateRulesId: "Full Body A",
        requiredPatterns: ["squat", "horizontal_push", "horizontal_pull", "core"],
        optionalPatterns: ["calves"],
      },
      {
        day: 2,
        label: "Full Body B",
        focus: "Задняя цепь + вертикаль: хиндж/тяга сверху/наклонный жим + кор.",
        templateRulesId: "Full Body B",
        requiredPatterns: ["hinge", "vertical_pull", "incline_push", "core"],
        optionalPatterns: ["rear_delts", "calves"],
      },
      {
        day: 3,
        label: "Full Body C",
        focus: "Сбалансированно + односторонка: выпады/тяга/жим вариации + кор.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["lunge", "horizontal_pull", "horizontal_push", "core"],
        optionalPatterns: ["delts_iso", "calves", "carry"],
      },
    ],
    benefits: [
      "Высокая частота стимулов без перегруза.",
      "Лучше всего учит технике базовых паттернов.",
      "Стабильно даёт прогресс и на похудение, и на форму.",
    ],
  },
  {
    id: "ul_fb_3x_hybrid",
    name: "Upper/Lower + Full Body 3x",
    russianName: "Верх/низ + всё тело (3 дня)",
    description:
      "Два дня с фокусом (верх/низ) и один день всё тело — гибкая схема для формы и массы.",
    splitType: "upper_lower",
    daysPerWeek: 3,
    timeBuckets: [45, 60, 90],
    goals: ["build_muscle", "athletic_body", "lose_weight"],
    experienceLevels: ["beginner", "intermediate", "advanced"],
    locations: ["gym", "home_with_gear"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Upper Body",
        focus: "Верх тела: жимы + тяги + плечи/руки дозировано.",
        templateRulesId: "Upper Body",
        requiredPatterns: ["horizontal_push", "horizontal_pull", "vertical_pull"],
        optionalPatterns: ["incline_push", "delts_iso", "rear_delts", "core"],
      },
      {
        day: 2,
        label: "Lower Body",
        focus: "Низ тела: присед/хиндж/выпады + икры/кор.",
        templateRulesId: "Lower Body",
        requiredPatterns: ["squat", "hinge", "lunge", "core"],
        optionalPatterns: ["calves", "hip_thrust"],
      },
      {
        day: 3,
        label: "Full Body C",
        focus: "Всё тело: баланс + слабые места (по ощущениям).",
        templateRulesId: "Full Body C",
        requiredPatterns: ["horizontal_push", "vertical_pull", "lunge", "core"],
        optionalPatterns: ["rear_delts", "calves"],
      },
    ],
    benefits: [
      "Психологически проще, чем Full Body 3× для некоторых людей.",
      "Даёт место для слабых зон и восстановления.",
      "Гибко подстраивается под чек-ин.",
    ],
  },
  {
    id: "ppl_3x_condensed",
    name: "PPL 3x Condensed",
    russianName: "Жим–тяга–ноги (3 дня)",
    description:
      "Классический PPL в 3 дня — плотные тренировки для тех, кто хочет массу/силу при 3 посещениях.",
    splitType: "push_pull_legs",
    daysPerWeek: 3,
    timeBuckets: [60, 90],
    goals: ["build_muscle", "athletic_body"],
    experienceLevels: ["intermediate", "advanced"],
    locations: ["gym"],
    intensity: "high",
    targetSex: "any",
    contraindications: ["medical_clearance_required", "beginner_simplicity"],
    days: [
      {
        day: 1,
        label: "Push",
        focus: "Грудь/плечи/трицепс — все толкающие движения.",
        templateRulesId: "Push Day",
        requiredPatterns: ["horizontal_push", "incline_push", "delts_iso", "triceps_iso"],
        optionalPatterns: ["vertical_push"],
      },
      {
        day: 2,
        label: "Pull",
        focus: "Спина/задние дельты/бицепс — тяги и подтягивания.",
        templateRulesId: "Pull Day",
        requiredPatterns: ["vertical_pull", "horizontal_pull", "rear_delts", "biceps_iso"],
        optionalPatterns: ["horizontal_pull", "vertical_pull", "core"], // ИЗМЕНЕНО: добавлены дополнительные тяговые
      },
      {
        day: 3,
        label: "Legs",
        focus: "Ноги/ягодицы/икры — колено + таз + односторонка.",
        templateRulesId: "Legs Day",
        requiredPatterns: ["squat", "hinge", "lunge", "calves", "core"],
        optionalPatterns: ["hip_thrust"],
      },
    ],
    benefits: [
      "Очень понятная логика тренировок.",
      "Хорошо ощущается «плотность» и работа на массу.",
      "Подходит, если есть 60–90 минут на тренировку.",
    ],
    notes:
      "Для новичка PPL 3× показывай только если время 60–90 и нет ограничений; иначе лучше Full Body 3×.",
  },
  {
    id: "fat_loss_3x_beginner",
    name: "Fat Loss 3x Beginner",
    russianName: "Похудение: 3 дня (безопасно)",
    description:
      "Силовая база + низкоударная кондиция. Без прыжков и «убийства» — устойчиво для новичка.",
    splitType: "conditioning",
    daysPerWeek: 3,
    timeBuckets: [45, 60],
    goals: ["lose_weight", "health_wellness", "athletic_body"],
    experienceLevels: ["beginner", "intermediate"],
    locations: ["gym", "home_with_gear", "home_no_equipment"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Strength Full Body",
        focus: "Силовые на всё тело + короткая low-impact концовка.",
        templateRulesId: "Full Body A",
        requiredPatterns: ["squat", "horizontal_pull", "horizontal_push", "core", "conditioning_low_impact"],
        optionalPatterns: ["carry"],
      },
      {
        day: 2,
        label: "Circuit Full Body",
        focus: "Круговая силовая (контролируемая техника) + кор.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["lunge", "horizontal_pull", "incline_push", "core", "conditioning_low_impact"],
        optionalPatterns: ["rear_delts"],
      },
      {
        day: 3,
        label: "Intervals Low Impact",
        focus: "Интервалы низкого удара + лёгкая силовая поддержка.",
        templateRulesId: "Full Body B",
        requiredPatterns: ["hinge", "vertical_pull", "core", "conditioning_intervals"],
        optionalPatterns: ["delts_iso"],
      },
    ],
    benefits: [
      "Похудение без травмоопасного HIIT.",
      "Пульс растёт, мышцы сохраняются.",
      "Легко адаптировать под чек-ин.",
    ],
    notes:
      "Если есть ограничения по суставам/весу — ставь constraint avoid_high_impact и держи conditioning low-impact.",
  },

  // ==========================================================================
  // 4 DAYS / WEEK
  // ==========================================================================
  {
    id: "ul_4x_classic_ab",
    name: "Upper/Lower 4x Classic",
    russianName: "Верх/низ 4 дня (классика)",
    description:
      "Два раза верх, два раза низ — золотой стандарт для массы/формы и прогресса.",
    splitType: "upper_lower",
    daysPerWeek: 4,
    timeBuckets: [45, 60, 90],
    goals: ["build_muscle", "athletic_body", "lose_weight"],
    experienceLevels: ["beginner", "intermediate", "advanced"],
    locations: ["gym", "home_with_gear"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Upper A",
        focus: "Грудь/горизонталь + тяги для баланса.",
        templateRulesId: "Upper A",
        requiredPatterns: ["horizontal_push", "horizontal_pull", "vertical_pull"],
        optionalPatterns: ["incline_push", "delts_iso", "rear_delts", "core"],
      },
      {
        day: 2,
        label: "Lower A",
        focus: "Квадрицепсы/колено-доминанта + кор/икры.",
        templateRulesId: "Lower A",
        requiredPatterns: ["squat", "lunge", "core"],
        optionalPatterns: ["calves", "hinge"],
      },
      {
        day: 3,
        label: "Upper B",
        focus: "Спина/вертикаль + жимы под другим углом.",
        templateRulesId: "Upper B",
        requiredPatterns: ["vertical_pull", "horizontal_pull", "incline_push"],
        optionalPatterns: ["horizontal_push", "rear_delts", "delts_iso", "core"],
      },
      {
        day: 4,
        label: "Lower B",
        focus: "Ягодицы/задняя цепь + односторонка.",
        templateRulesId: "Lower B",
        requiredPatterns: ["hinge", "hip_thrust", "lunge", "core"],
        optionalPatterns: ["calves", "squat"],
      },
    ],
    benefits: [
      "Каждая группа 2 раза/нед — оптимально для роста.",
      "Легко планировать прогрессию и объём.",
      "Нормально живёт при 45–60 минут (с правильной плотностью).",
    ],
  },
  {
    id: "ul_4x_powerbuilding",
    name: "Upper/Lower 4x Powerbuilding",
    russianName: "Сила + масса (4 дня)",
    description:
      "2 силовых дня + 2 объёмных дня. Для тех, кто хочет и рост мышц, и рост силовых.",
    splitType: "upper_lower",
    daysPerWeek: 4,
    timeBuckets: [60, 90],
    goals: ["build_muscle", "athletic_body"],
    experienceLevels: ["intermediate", "advanced"],
    locations: ["gym"],
    intensity: "high",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Upper Power",
        focus: "Тяжёлые жим/тяга + минимум аксессуаров.",
        templateRulesId: "Upper A",
        requiredPatterns: ["horizontal_push", "horizontal_pull"],
        optionalPatterns: ["vertical_pull", "rear_delts"],
      },
      {
        day: 2,
        label: "Lower Power",
        focus: "Тяжёлые присед/хиндж + кор.",
        templateRulesId: "Lower A",
        requiredPatterns: ["squat", "hinge", "core"],
        optionalPatterns: ["calves"],
      },
      {
        day: 3,
        label: "Upper Hypertrophy",
        focus: "Объём на грудь/спину/плечи/руки.",
        templateRulesId: "Upper B",
        requiredPatterns: ["incline_push", "vertical_pull", "horizontal_pull", "delts_iso", "biceps_iso"],
        optionalPatterns: ["rear_delts"],
      },
      {
        day: 4,
        label: "Lower Hypertrophy",
        focus: "Объём на ноги/ягодицы: односторонка + изоляция.",
        templateRulesId: "Lower B",
        requiredPatterns: ["lunge", "hip_thrust", "hinge", "core"],
        optionalPatterns: ["calves", "squat"],
      },
    ],
    benefits: [
      "Разные типы стимула — меньше плато.",
      "Силовые растут и объективно измеримы.",
      "Хорошо для intermediate/advanced с нормальным восстановлением.",
    ],
  },
  {
    id: "fat_loss_4x_strength_conditioning",
    name: "Fat Loss 4x Hybrid",
    russianName: "Похудение: силовые + кондиция (4 дня)",
    description:
      "Два силовых дня + два дня low-impact интервалов/кругов. Для устойчивого похудения.",
    splitType: "conditioning",
    daysPerWeek: 4,
    timeBuckets: [45, 60, 90],
    goals: ["lose_weight", "athletic_body", "health_wellness"],
    experienceLevels: ["beginner", "intermediate", "advanced"],
    locations: ["gym", "home_with_gear", "home_no_equipment"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Strength Upper",
        focus: "Силовой верх + короткая low-impact концовка.",
        templateRulesId: "Upper A",
        requiredPatterns: ["horizontal_push", "horizontal_pull", "vertical_pull", "conditioning_low_impact"],
        optionalPatterns: ["rear_delts"],
      },
      {
        day: 2,
        label: "Strength Lower",
        focus: "Силовой низ + кор.",
        templateRulesId: "Lower A",
        requiredPatterns: ["squat", "lunge", "core"],
        optionalPatterns: ["calves"],
      },
      {
        day: 3,
        label: "Intervals Low Impact",
        focus: "Интервалы/круги низкого удара.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["conditioning_intervals", "core"],
        optionalPatterns: ["carry", "horizontal_pull", "incline_push"],
      },
      {
        day: 4,
        label: "Full Body Circuit",
        focus: "Круговая силовая на всё тело (контроль техники).",
        templateRulesId: "Full Body B",
        requiredPatterns: ["lunge", "vertical_pull", "incline_push", "conditioning_low_impact", "core"],
        optionalPatterns: ["rear_delts"],
      },
    ],
    benefits: [
      "Пульс растёт, а мышцы сохраняются — лучше для состава тела.",
      "Чёткая структура недели, легко держать регулярность.",
      "Безопаснее, чем ежедневный HIIT.",
    ],
  },

  // ==========================================================================
  // 5 DAYS / WEEK
  // ==========================================================================
  {
    id: "ppl_5x_classic_ab",
    name: "PPL 5x Classic",
    russianName: "Жим–тяга–ноги 5 дней (классика)",
    description:
      "Большой объём для роста: Push A / Pull A / Legs A / Push B / Pull B.",
    splitType: "push_pull_legs",
    daysPerWeek: 5,
    timeBuckets: [45, 60, 90],
    goals: ["build_muscle", "athletic_body"],
    experienceLevels: ["intermediate", "advanced"],
    locations: ["gym"],
    intensity: "high",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Push A",
        focus: "Тяжёлые жимы, акцент грудь.",
        templateRulesId: "Push A",
        requiredPatterns: ["horizontal_push", "incline_push", "triceps_iso"],
        optionalPatterns: ["delts_iso", "vertical_push"],
      },
      {
        day: 2,
        label: "Pull A",
        focus: "Ширина спины: вертикальные тяги + бицепс.",
        templateRulesId: "Pull A",
        requiredPatterns: ["vertical_pull", "horizontal_pull", "rear_delts", "biceps_iso"], // ИЗМЕНЕНО: horizontal_pull required
        optionalPatterns: ["vertical_pull", "core"],
      },
      {
        day: 3,
        label: "Legs A",
        focus: "Квадрицепсы/силовые приседания.",
        templateRulesId: "Legs A",
        requiredPatterns: ["squat", "lunge", "core"],
        optionalPatterns: ["calves", "hinge"],
      },
      {
        day: 4,
        label: "Push B",
        focus: "Объём: плечи + добивка груди/трицепса.",
        templateRulesId: "Push B",
        requiredPatterns: ["delts_iso", "incline_push", "triceps_iso"],
        optionalPatterns: ["horizontal_push", "vertical_push"], // УБРАНО: rear_delts (это Pull движение!)
      },
      {
        day: 5,
        label: "Pull B",
        focus: "Толщина спины: горизонтальные тяги + задняя дельта.",
        templateRulesId: "Pull B",
        requiredPatterns: ["horizontal_pull", "vertical_pull", "rear_delts", "biceps_iso"],
        optionalPatterns: ["horizontal_pull", "core"], // ИЗМЕНЕНО: добавлен horizontal_pull для большего объема
      },
    ],
    benefits: [
      "Отличный стимул для роста мышц за счёт объёма.",
      "Разные акценты A/B уменьшают дублирование углов.",
      "Хорошо ложится на прогрессию недель/мезоциклов.",
    ],
    notes:
      "Для 45 минут важна плотность: суперсеты допускаются, но без ухудшения техники.",
  },
  {
    id: "athletic_5x",
    name: "Athletic 5x",
    russianName: "Атлетизм 5 дней",
    description:
      "Сила + мощность + гипертрофия + кондиция + восстановление. Для общего атлетического тела.",
    splitType: "full_body",
    daysPerWeek: 5,
    timeBuckets: [45, 60, 90],
    goals: ["athletic_body", "health_wellness", "lose_weight"],
    experienceLevels: ["beginner", "intermediate", "advanced"],
    locations: ["gym", "home_with_gear", "home_no_equipment"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Strength",
        focus: "Силовая база на всё тело (контролируемо).",
        templateRulesId: "Full Body A",
        requiredPatterns: ["squat", "horizontal_pull", "horizontal_push", "core"],
        optionalPatterns: ["carry"],
      },
      {
        day: 2,
        label: "Power/Speed",
        focus: "Мощность и скорость (low-impact варианты).",
        templateRulesId: "Full Body C",
        requiredPatterns: ["hinge", "core", "conditioning_low_impact"],
        optionalPatterns: ["carry"],
      },
      {
        day: 3,
        label: "Hypertrophy",
        focus: "Средний диапазон повторений: форма/мышцы.",
        templateRulesId: "Full Body B",
        requiredPatterns: ["lunge", "vertical_pull", "incline_push", "core"],
        optionalPatterns: ["delts_iso"],
      },
      {
        day: 4,
        label: "Conditioning",
        focus: "Кондиция: интервалы низкого удара + кор.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["conditioning_intervals", "core"],
        optionalPatterns: ["carry"],
      },
      {
        day: 5,
        label: "Recovery",
        focus: "Восстановление: лёгкая силовая/мобилити/кор.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["core", "conditioning_low_impact"],
        optionalPatterns: ["horizontal_pull", "lunge"],
      },
    ],
    benefits: [
      "Разносторонняя адаптация: сила, форма, выносливость.",
      "Лучше переносится, чем «мясорубка» 5× бодибилдинг.",
      "Отлично для похудения без потери мышц.",
    ],
  },

  // ==========================================================================
  // 6 DAYS / WEEK
  // ==========================================================================
  {
    id: "ppl_6x_classic_ab",
    name: "PPL 6x Classic",
    russianName: "Жим–тяга–ноги 6 дней (A/B)",
    description:
      "Два круга PPL за неделю: максимальная частота для роста (только при хорошем восстановлении).",
    splitType: "push_pull_legs",
    daysPerWeek: 6,
    timeBuckets: [45, 60, 90],
    goals: ["build_muscle"],
    experienceLevels: ["intermediate", "advanced"],
    locations: ["gym"],
    intensity: "high",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      { day: 1, label: "Push A", focus: "Грудь/силовые жимы.", templateRulesId: "Push A", requiredPatterns: ["horizontal_push", "incline_push", "triceps_iso"], optionalPatterns: ["delts_iso"] },
      { day: 2, label: "Pull A", focus: "Ширина спины.", templateRulesId: "Pull A", requiredPatterns: ["vertical_pull", "horizontal_pull", "biceps_iso", "rear_delts"], optionalPatterns: ["vertical_pull", "horizontal_pull"] }, // ИЗМЕНЕНО: добавлен horizontal_pull для баланса
      { day: 3, label: "Legs A", focus: "Квадрицепсы/приседы.", templateRulesId: "Legs A", requiredPatterns: ["squat", "lunge", "core"], optionalPatterns: ["calves"] },
      { day: 4, label: "Push B", focus: "Плечи/объём.", templateRulesId: "Push B", requiredPatterns: ["delts_iso", "incline_push", "triceps_iso"], optionalPatterns: ["horizontal_push"] }, // УБРАНО: rear_delts (это Pull движение!)
      { day: 5, label: "Pull B", focus: "Толщина спины.", templateRulesId: "Pull B", requiredPatterns: ["horizontal_pull", "vertical_pull", "rear_delts", "biceps_iso"], optionalPatterns: ["horizontal_pull", "core"] }, // ИЗМЕНЕНО: добавлен horizontal_pull в optional для большего объема
      { day: 6, label: "Legs B", focus: "Ягодицы/задняя цепь.", templateRulesId: "Legs B", requiredPatterns: ["hinge", "hip_thrust", "lunge", "core"], optionalPatterns: ["calves"] },
    ],
    benefits: [
      "Высокая частота: каждая группа 2×/нед — сильный стимул.",
      "A/B акценты дают разнообразие углов и ощущений.",
      "Хорошо ложится на периодизацию 4-недельными блоками.",
    ],
    notes:
      "Если чек-ин показывает усталость — автоматически снижать объём/интенсивность (mode light/recovery).",
  },
  {
    id: "ul_6x_intensive",
    name: "Upper/Lower 6x Intensive",
    russianName: "Верх/низ 6 дней (интенсив)",
    description:
      "Heavy / Volume / Pump распределение по верху и низу — для продвинутых, кто любит структуру.",
    splitType: "upper_lower",
    daysPerWeek: 6,
    timeBuckets: [45, 60],
    goals: ["build_muscle"],
    experienceLevels: ["advanced", "intermediate"],
    locations: ["gym"],
    intensity: "high",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      { day: 1, label: "Upper Heavy", focus: "Тяжёлые жим/тяга.", templateRulesId: "Upper A", requiredPatterns: ["horizontal_push", "horizontal_pull"], optionalPatterns: ["vertical_pull"] },
      { day: 2, label: "Lower Heavy", focus: "Тяжёлые ноги (контроль техники).", templateRulesId: "Lower A", requiredPatterns: ["squat", "hinge", "core"], optionalPatterns: ["calves"] },
      { day: 3, label: "Upper Volume", focus: "Объём на верх.", templateRulesId: "Upper B", requiredPatterns: ["incline_push", "vertical_pull", "horizontal_pull", "delts_iso"], optionalPatterns: ["rear_delts"] },
      { day: 4, label: "Lower Volume", focus: "Объём на низ.", templateRulesId: "Lower B", requiredPatterns: ["lunge", "hip_thrust", "hinge", "core"], optionalPatterns: ["calves"] },
      { day: 5, label: "Upper Pump", focus: "Пампинг/изоляция верха.", templateRulesId: "Upper Body", requiredPatterns: ["rear_delts", "biceps_iso", "triceps_iso", "horizontal_pull"], optionalPatterns: ["incline_push"] },
      { day: 6, label: "Lower Pump", focus: "Пампинг ног: односторонка + изоляция.", templateRulesId: "Lower Body", requiredPatterns: ["lunge", "core"], optionalPatterns: ["calves", "hip_thrust"] },
    ],
    benefits: [
      "Периодизация внутри недели уменьшает плато.",
      "Легче управлять усталостью по чек-ину (heavy/volume/pump).",
      "Очень «профессионально» ощущается пользователю.",
    ],
  },
  {
    id: "bro_split_6x",
    name: "Bro Split 6x",
    russianName: "Бро-сплит 6 дней",
    description:
      "Каждый день — своя группа. Только для продвинутых и любителей классики бодибилдинга.",
    splitType: "bro_split",
    daysPerWeek: 6,
    timeBuckets: [60, 90],
    goals: ["build_muscle"],
    experienceLevels: ["advanced", "intermediate"],
    locations: ["gym"],
    intensity: "high",
    targetSex: "any",
    contraindications: ["medical_clearance_required", "beginner_simplicity"],
    days: [
      { day: 1, label: "Chest", focus: "Грудь: жимы под разными углами + изоляция.", templateRulesId: "Push A", requiredPatterns: ["horizontal_push", "incline_push"], optionalPatterns: ["triceps_iso"] },
      { day: 2, label: "Back", focus: "Спина: вертикаль + горизонталь.", templateRulesId: "Pull Day", requiredPatterns: ["vertical_pull", "horizontal_pull"], optionalPatterns: ["rear_delts", "biceps_iso"] },
      { day: 3, label: "Shoulders", focus: "Плечи: дельты + задняя дельта.", templateRulesId: "Shoulders Day", requiredPatterns: ["delts_iso", "rear_delts"], optionalPatterns: ["vertical_push"] }, // ИЗМЕНЕНО: templateRulesId (rear_delts допустимы в день плеч bro-split)
      { day: 4, label: "Legs", focus: "Ноги: квадры + задняя + икры.", templateRulesId: "Legs Day", requiredPatterns: ["squat", "hinge", "calves"], optionalPatterns: ["lunge", "core"] },
      { day: 5, label: "Arms", focus: "Руки: суперсеты бицепс/трицепс + добивка груди/спины.", templateRulesId: "Upper Body", requiredPatterns: ["biceps_iso", "triceps_iso", "horizontal_push", "horizontal_pull"], optionalPatterns: ["rear_delts"] },
      { day: 6, label: "Weak Points", focus: "Слабые места + кондиция + кор/икры.", templateRulesId: "Full Body C", requiredPatterns: ["core", "conditioning_low_impact"], optionalPatterns: ["calves", "rear_delts", "delts_iso"] },
    ],
    benefits: [
      "Психологически «кайфовый» формат для бодибилдинга.",
      "Большой объём на выбранную группу в день.",
      "Хорош для специализации, если восстановление отличное.",
    ],
    notes:
      "Если пользователь не «в теме» — лучше предлагать PPL/Upper-Lower как более научный вариант.",
  },

  // ==========================================================================
  // 6 DAYS / WEEK — ATHLETIC / FAT LOSS
  // ==========================================================================
  {
    id: "athletic_conditioning_6x",
    name: "Athletic Conditioning 6x",
    russianName: "Атлетик: сила + кондиция 6 дней",
    description:
      "3 силовых дня (верх/низ/всё тело) + 2 кондиции + 1 восстановление. Для похудения, формы и выносливости.",
    splitType: "conditioning",
    daysPerWeek: 6,
    timeBuckets: [45, 60, 90],
    goals: ["lose_weight", "athletic_body", "health_wellness"],
    experienceLevels: ["intermediate", "advanced"],
    locations: ["gym"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Upper Strength",
        focus: "Силовой верх: жимы/тяги + плечи.",
        templateRulesId: "Upper A",
        requiredPatterns: ["horizontal_push", "horizontal_pull", "vertical_pull", "core"],
        optionalPatterns: ["delts_iso", "rear_delts"],
      },
      {
        day: 2,
        label: "Conditioning A",
        focus: "Интервалы низкого удара: круговая с акцентом на жиросжигание.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["conditioning_intervals", "core"],
        optionalPatterns: ["carry", "lunge"],
      },
      {
        day: 3,
        label: "Lower Strength",
        focus: "Силовой низ: приседания/хиндж/выпады.",
        templateRulesId: "Lower A",
        requiredPatterns: ["squat", "hinge", "lunge", "core"],
        optionalPatterns: ["calves", "hip_thrust"],
      },
      {
        day: 4,
        label: "Conditioning B",
        focus: "Кондиция: энергозатратные комплексы без ударной нагрузки.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["conditioning_low_impact", "hinge", "core"],
        optionalPatterns: ["carry", "horizontal_pull"],
      },
      {
        day: 5,
        label: "Full Body",
        focus: "Всё тело: умеренная силовая для баланса и слабых зон.",
        templateRulesId: "Full Body B",
        requiredPatterns: ["horizontal_push", "vertical_pull", "lunge", "core"],
        optionalPatterns: ["rear_delts"],
      },
      {
        day: 6,
        label: "Recovery",
        focus: "Активное восстановление: мобильность + лёгкое кардио + кор.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["core", "conditioning_low_impact"],
        optionalPatterns: ["hinge"],
      },
    ],
    benefits: [
      "Оптимальный баланс силовых и кардио для похудения.",
      "Мышцы сохраняются за счёт 3 силовых дней.",
      "Активное восстановление предотвращает перетренированность.",
    ],
    notes:
      "Для BMI 30+ заменять conditioning_intervals на conditioning_low_impact через constraint.",
  },
  {
    id: "fb_6x_athletic_gym",
    name: "Full Body Athletic 6x Gym",
    russianName: "Атлетизм 6 дней (зал)",
    description:
      "Ежедневные разнообразные тренировки: сила, гипертрофия, кондиция, мощность. Для тех, кто живёт в зале.",
    splitType: "full_body",
    daysPerWeek: 6,
    timeBuckets: [45, 60, 90],
    goals: ["athletic_body", "lose_weight", "health_wellness"],
    experienceLevels: ["beginner", "intermediate"],
    locations: ["gym", "home_with_gear"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Strength A",
        focus: "Силовая база: присед/жим/тяга.",
        templateRulesId: "Full Body A",
        requiredPatterns: ["squat", "horizontal_push", "horizontal_pull", "core"],
        optionalPatterns: ["calves"],
      },
      {
        day: 2,
        label: "Conditioning",
        focus: "Кондиция: интервалы низкого удара + кор.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["conditioning_intervals", "core"],
        optionalPatterns: ["carry"],
      },
      {
        day: 3,
        label: "Strength B",
        focus: "Задняя цепь + вертикальные тяги.",
        templateRulesId: "Full Body B",
        requiredPatterns: ["hinge", "vertical_pull", "incline_push", "core"],
        optionalPatterns: ["rear_delts"],
      },
      {
        day: 4,
        label: "Active Recovery",
        focus: "Мобильность + лёгкое кардио + дыхание.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["core", "conditioning_low_impact"],
        optionalPatterns: ["lunge"],
      },
      {
        day: 5,
        label: "Strength C",
        focus: "Односторонняя работа + баланс.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["lunge", "horizontal_pull", "horizontal_push", "core"],
        optionalPatterns: ["delts_iso"],
      },
      {
        day: 6,
        label: "Light Pump",
        focus: "Лёгкий пампинг: изоляция + кор + слабые зоны.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["core", "conditioning_low_impact"],
        optionalPatterns: ["rear_delts", "calves"],
      },
    ],
    benefits: [
      "Ежедневная привычка без перегруза — чередование нагрузки и восстановления.",
      "Разнообразие стимулов: сила, кондиция, мобильность.",
      "Подходит для активных людей, которые хотят тренироваться каждый день.",
    ],
    notes:
      "Чередование тяжёлых и лёгких дней критично. Если чек-ин показывает усталость — пропускать кондицию или менять на восстановление.",
  },

  // ==========================================================================
  // LOWER-FOCUS SCHEMES (popular with women / glute-focused goals)
  // ==========================================================================
  {
    id: "lower_focus_3x",
    name: "Lower Focus 3x",
    russianName: "Акцент на ноги и ягодицы (3 дня)",
    description:
      "2 дня низ + 1 день верх. Для тех, кто хочет подтянуть ноги/ягодицы, не забывая про верх тела.",
    splitType: "lower_focus",
    daysPerWeek: 3,
    timeBuckets: [45, 60, 90],
    goals: ["build_muscle", "athletic_body", "lose_weight"],
    experienceLevels: ["beginner", "intermediate", "advanced"],
    locations: ["gym", "home_with_gear"],
    intensity: "moderate",
    targetSex: "female",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Lower A (Glutes)",
        focus: "Ягодицы: хип-траст/хиндж/выпады + кор.",
        templateRulesId: "Lower A",
        requiredPatterns: ["hip_thrust", "hinge", "lunge", "core"],
        optionalPatterns: ["calves", "conditioning_low_impact"],
      },
      {
        day: 2,
        label: "Upper Body",
        focus: "Верх тела: жимы/тяги для баланса и осанки.",
        templateRulesId: "Upper Body",
        requiredPatterns: ["horizontal_push", "horizontal_pull", "vertical_pull", "core"],
        optionalPatterns: ["rear_delts", "delts_iso"],
      },
      {
        day: 3,
        label: "Lower B (Quads)",
        focus: "Квадрицепсы: приседания/выпады/ягодичный мост + кор.",
        templateRulesId: "Lower B",
        requiredPatterns: ["squat", "lunge", "hip_thrust", "core"],
        optionalPatterns: ["calves", "hinge"],
      },
    ],
    benefits: [
      "Ноги/ягодицы получают 2 стимула в неделю — оптимально для роста.",
      "Верх тела поддерживается для баланса и осанки.",
      "Подходит для любого уровня подготовки.",
    ],
    notes:
      "Hip thrust — ключевое движение. Для дома заменяется на ягодичный мост с гантелей.",
  },
  {
    id: "lower_focus_4x",
    name: "Lower Bias Upper/Lower 4x",
    russianName: "Акцент на ноги и ягодицы (4 дня)",
    description:
      "3 дня низ + 1 день верх. Максимальный фокус на ноги/ягодицы при полном покрытии верха.",
    splitType: "lower_focus",
    daysPerWeek: 4,
    timeBuckets: [45, 60, 90],
    goals: ["build_muscle", "athletic_body", "lose_weight"],
    experienceLevels: ["beginner", "intermediate", "advanced"],
    locations: ["gym", "home_with_gear"],
    intensity: "moderate",
    targetSex: "female",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Lower A (Glutes)",
        focus: "Ягодицы: хип-траст/хиндж/выпады — объём и активация.",
        templateRulesId: "Lower A",
        requiredPatterns: ["hip_thrust", "hinge", "lunge", "core"],
        optionalPatterns: ["calves"],
      },
      {
        day: 2,
        label: "Upper Body",
        focus: "Верх тела: полноценная тренировка жим/тяга/плечи.",
        templateRulesId: "Upper Body",
        requiredPatterns: ["horizontal_push", "horizontal_pull", "vertical_pull", "rear_delts"],
        optionalPatterns: ["delts_iso", "core"],
      },
      {
        day: 3,
        label: "Lower B (Quads)",
        focus: "Квадрицепсы: приседания/жим ногами/выпады + ягодичный мост.",
        templateRulesId: "Lower B",
        requiredPatterns: ["squat", "lunge", "hip_thrust", "core"],
        optionalPatterns: ["calves", "hinge"],
      },
      {
        day: 4,
        label: "Lower C (Power)",
        focus: "Силовой низ: тяжёлые хинджи/приседы + односторонка.",
        templateRulesId: "Lower A",
        requiredPatterns: ["hinge", "squat", "lunge", "core"],
        optionalPatterns: ["hip_thrust", "calves", "conditioning_low_impact"],
      },
    ],
    benefits: [
      "Максимальная частота ног/ягодиц — 3 раза в неделю.",
      "Разные акценты (ягодицы/квадры/сила) для полного развития.",
      "Верх тела не забыт — полноценный день для осанки и баланса.",
    ],
    notes:
      "Для мужчин тоже может работать при отставании ног. Но по умолчанию показываем женщинам.",
  },

  // ==========================================================================
  // ADDITIONAL SCHEMES FOR 100% COVERAGE (Home users)
  // ==========================================================================

  {
    id: "home_db_split_4x",
    name: "Home Dumbbell Split 4x",
    russianName: "Домашний сплит с гантелями (4 дня)",
    description:
      "Полноценная сплит-программа для дома с гантелями/резинками. Верх/низ чередование для максимального роста.",
    splitType: "upper_lower",
    daysPerWeek: 4,
    timeBuckets: [45, 60, 90],
    goals: ["build_muscle", "athletic_body", "lose_weight", "health_wellness"],
    experienceLevels: ["intermediate", "advanced"],
    locations: ["home_with_gear"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Upper A",
        focus: "Верх: жимы гантелями + тяги + плечи.",
        templateRulesId: "Upper A",
        requiredPatterns: ["horizontal_push", "horizontal_pull", "vertical_pull"],
        optionalPatterns: ["delts_iso", "rear_delts"],
      },
      {
        day: 2,
        label: "Lower A",
        focus: "Низ: приседания/выпады с гантелями + ягодицы.",
        templateRulesId: "Lower A",
        requiredPatterns: ["squat", "lunge", "hip_thrust", "core"],
        optionalPatterns: ["calves"],
      },
      {
        day: 3,
        label: "Upper B",
        focus: "Верх: тяги в приоритете + жимы под углом.",
        templateRulesId: "Upper B",
        requiredPatterns: ["vertical_pull", "horizontal_pull", "incline_push"],
        optionalPatterns: ["rear_delts", "core"],
      },
      {
        day: 4,
        label: "Lower B",
        focus: "Низ: хиндж/румынка + односторонние + ягодичный мост.",
        templateRulesId: "Lower B",
        requiredPatterns: ["hinge", "lunge", "hip_thrust", "core"],
        optionalPatterns: ["calves", "squat"],
      },
    ],
    benefits: [
      "Превращает пару гантелей в полноценный тренажёрный зал.",
      "Каждая группа мышц работает 2 раза в неделю.",
      "Отлично подходит для набора массы и силы дома.",
    ],
    notes:
      "Требуются гантели с возможностью менять вес или набор разных весов. Резинки — отличное дополнение.",
  },

  {
    id: "home_calisthenics_adv",
    name: "Advanced Calisthenics 4x",
    russianName: "Продвинутая калистеника (4 дня)",
    description:
      "Программа для опытных с собственным весом: отжимания, подтягивания, приседания и их вариации.",
    splitType: "upper_lower",
    daysPerWeek: 4,
    timeBuckets: [45, 60, 90],
    goals: ["athletic_body", "build_muscle", "lose_weight", "health_wellness"],
    experienceLevels: ["intermediate", "advanced"],
    locations: ["home_no_equipment", "home_with_gear"],
    intensity: "moderate",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Upper Push",
        focus: "Толкающие: отжимания (вариации), pike push-ups, dips.",
        templateRulesId: "Upper A",
        requiredPatterns: ["horizontal_push", "incline_push", "core"],
        optionalPatterns: ["triceps_iso", "vertical_push"],
      },
      {
        day: 2,
        label: "Lower A",
        focus: "Ноги: приседания на одной ноге, выпады, болгарские сплиты.",
        templateRulesId: "Lower A",
        requiredPatterns: ["squat", "lunge", "core"],
        optionalPatterns: ["hip_thrust", "calves"],
      },
      {
        day: 3,
        label: "Upper Pull",
        focus: "Тянущие: подтягивания (вариации), австралийские, face pulls.",
        templateRulesId: "Upper B",
        requiredPatterns: ["vertical_pull", "horizontal_pull", "rear_delts"],
        optionalPatterns: ["biceps_iso", "core"],
      },
      {
        day: 4,
        label: "Lower B",
        focus: "Задняя цепь: мосты, nordic curls, single-leg deadlifts.",
        templateRulesId: "Lower B",
        requiredPatterns: ["hinge", "hip_thrust", "lunge", "core"],
        optionalPatterns: ["calves"],
      },
    ],
    benefits: [
      "Не требует никакого оборудования — только тело и пол.",
      "Развивает функциональную силу и контроль тела.",
      "Продвинутые вариации дают серьёзную нагрузку.",
    ],
    notes:
      "Турник крайне желателен для тяговых движений. Без турника заменяем на полотенце в дверном проёме или резинки.",
  },

  {
    id: "home_daily_6x",
    name: "Home Daily Movement 6x",
    russianName: "Ежедневное движение дома (6 дней)",
    description:
      "Короткие ежедневные тренировки для формирования привычки. Чередование силовых и активного восстановления.",
    splitType: "full_body",
    daysPerWeek: 6,
    timeBuckets: [45, 60, 90],
    goals: ["lose_weight", "health_wellness", "athletic_body"],
    experienceLevels: ["beginner", "intermediate", "advanced"],
    locations: ["home_no_equipment", "home_with_gear"],
    intensity: "low",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Full Body A",
        focus: "Базовые движения: приседания/отжимания/тяги + кор.",
        templateRulesId: "Full Body A",
        requiredPatterns: ["squat", "horizontal_push", "horizontal_pull", "core"],
        optionalPatterns: ["conditioning_low_impact"],
      },
      {
        day: 2,
        label: "Active Recovery",
        focus: "Лёгкое кардио + мобильность + дыхание.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["core", "conditioning_low_impact"],
        optionalPatterns: ["lunge"],
      },
      {
        day: 3,
        label: "Full Body B",
        focus: "Задняя цепь + вертикальные движения.",
        templateRulesId: "Full Body B",
        requiredPatterns: ["hinge", "vertical_pull", "incline_push", "core"],
        optionalPatterns: ["rear_delts"],
      },
      {
        day: 4,
        label: "Conditioning",
        focus: "Интервалы низкого удара: круговая без прыжков.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["conditioning_intervals", "core"],
        optionalPatterns: ["carry"],
      },
      {
        day: 5,
        label: "Full Body C",
        focus: "Односторонняя работа + баланс.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["lunge", "horizontal_pull", "horizontal_push", "core"],
        optionalPatterns: ["calves"],
      },
      {
        day: 6,
        label: "Light Movement",
        focus: "Очень лёгкий день: растяжка + кор + дыхание.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["core", "conditioning_low_impact"],
        optionalPatterns: ["hinge"],
      },
    ],
    benefits: [
      "Формирует привычку ежедневных тренировок.",
      "Низкая интенсивность = минимальный риск перегруза.",
      "Отлично для похудения и общего самочувствия.",
    ],
    notes:
      "Идеально для тех, кто хочет тренироваться каждый день, но не готов к высокой нагрузке.",
  },

  {
    id: "fb_6x_beginner_light",
    name: "Full Body 6x Light",
    russianName: "Лёгкий старт 6 дней",
    description:
      "Ежедневные короткие тренировки для новичков: формируем привычку без перегрузки.",
    splitType: "full_body",
    daysPerWeek: 6,
    timeBuckets: [45, 60, 90],
    goals: ["lose_weight", "health_wellness", "athletic_body"],
    experienceLevels: ["beginner"],
    locations: ["gym", "home_with_gear", "home_no_equipment"],
    intensity: "low",
    targetSex: "any",
    contraindications: ["medical_clearance_required"],
    days: [
      {
        day: 1,
        label: "Full Body A",
        focus: "Освоение базы: присед/жим/тяга с акцентом на технику.",
        templateRulesId: "Full Body A",
        requiredPatterns: ["squat", "horizontal_push", "horizontal_pull", "core"],
        optionalPatterns: ["conditioning_low_impact"],
      },
      {
        day: 2,
        label: "Light Day",
        focus: "Лёгкий день: мобильность + кор + низкоударное кардио.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["core", "conditioning_low_impact"],
        optionalPatterns: ["lunge"],
      },
      {
        day: 3,
        label: "Full Body B",
        focus: "Задняя цепь + вертикаль: хиндж/тяга сверху/жим под углом.",
        templateRulesId: "Full Body B",
        requiredPatterns: ["hinge", "vertical_pull", "incline_push", "core"],
        optionalPatterns: [],
      },
      {
        day: 4,
        label: "Active Recovery",
        focus: "Активное восстановление: ходьба + растяжка + дыхание.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["core", "conditioning_low_impact"],
        optionalPatterns: [],
      },
      {
        day: 5,
        label: "Full Body C",
        focus: "Односторонняя работа: выпады/тяга/жим вариации.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["lunge", "horizontal_pull", "horizontal_push", "core"],
        optionalPatterns: [],
      },
      {
        day: 6,
        label: "Mobility",
        focus: "Мобильность и гибкость: подготовка к следующей неделе.",
        templateRulesId: "Full Body C",
        requiredPatterns: ["core", "conditioning_low_impact"],
        optionalPatterns: [],
      },
    ],
    benefits: [
      "Идеально для формирования привычки тренироваться.",
      "Чередование нагрузки и восстановления защищает от выгорания.",
      "Безопасный вход в фитнес для абсолютных новичков.",
    ],
    notes:
      "Через 4-6 недель можно переходить на более интенсивную программу на 3-4 дня.",
  },
];

// ============================================================================
// OPTIONAL helper: basic filtering & scoring (use or ignore)
// ============================================================================

export type SchemeUser = {
  experience: ExperienceLevel;
  goal: Goal;
  daysPerWeek: number;
  timeBucket: TimeBucket; // 45/60/90
  location: Location;
  constraints?: ConstraintTag[];
  sex?: "male" | "female";
  age?: number; // used for scheme ranking (50+ avoid high intensity)
  bmi?: number; // used for filtering conditioning schemes (>30 avoid high impact)
};

export function getCandidateSchemes(user: SchemeUser): NormalizedWorkoutScheme[] {
  const constraints = user.constraints ?? [];

  return NORMALIZED_SCHEMES
    .filter(s => s.daysPerWeek === user.daysPerWeek)
    .filter(s => s.timeBuckets.includes(user.timeBucket))
    .filter(s => s.goals.includes(user.goal))
    .filter(s => s.experienceLevels.includes(user.experience))
    .filter(s => {
      if (s.locations.includes(user.location)) return true;
      return user.location === "home_with_gear" && s.locations.includes("home_no_equipment");
    })
    .filter(s => !(s.contraindications ?? []).some(tag => constraints.includes(tag)))
    .filter(s => {
      if (!s.targetSex || s.targetSex === "any" || !user.sex) return true;
      return s.targetSex === user.sex;
    });
}

// Very simple scoring: picks 1 recommended + others as alternatives
export function rankSchemes(user: SchemeUser, candidates: NormalizedWorkoutScheme[]) {
  const constraints = user.constraints ?? [];
  const age = user.age ?? 30;
  const bmi = user.bmi ?? 22;

  const scored = candidates.map(s => {
    let score = 0;

    // prefer lower intensity for beginners losing weight
    if (user.experience === "beginner" && user.goal === "lose_weight") {
      if (s.intensity === "low") score += 4;
      if (s.intensity === "moderate") score += 2;
      if (s.intensity === "high") score -= 3;
    }

    // prefer full body for 2–3 days beginners
    if (user.experience === "beginner" && (user.daysPerWeek === 2 || user.daysPerWeek === 3)) {
      if (s.splitType === "full_body") score += 3;
    }

    // AGE-BASED LOGIC
    // 50+ years: avoid high intensity, prefer moderate/low
    if (age >= 50) {
      if (s.intensity === "high") score -= 5;
      if (s.intensity === "moderate") score += 2;
      if (s.intensity === "low") score += 3;
    }
    // 35-50 years: slightly prefer moderate intensity
    else if (age >= 35) {
      if (s.intensity === "moderate") score += 1;
      if (s.intensity === "high") score -= 1;
    }
    // 18-35 years: can handle high intensity
    else {
      if (s.intensity === "high") score += 1;
    }

    // BMI-BASED LOGIC
    // BMI > 30: penalize high intensity, NOT conditioning per se
    // Conditioning + moderate/low intensity is GOOD for fat loss (preserves muscle + cardio)
    if (bmi >= 30) {
      if (s.intensity === "high") score -= 4;
      if (s.splitType === "conditioning" && s.intensity === "high") score -= 2; // extra penalty for high-impact conditioning
      if (s.splitType === "conditioning" && s.intensity !== "high") score += 2; // moderate/low conditioning is ideal for fat loss
      if (s.splitType === "full_body" || s.splitType === "upper_lower") score += 1;
    }
    // BMI 25-30: slight preference for structured training
    else if (bmi >= 25) {
      if (s.intensity === "high") score -= 1;
    }

    // constraints should bias towards lower impact / less axial loading
    if (constraints.includes("avoid_high_impact")) {
      if (s.splitType === "conditioning") score -= 4; // updated: was +1, now -4
      if (s.intensity === "high") score -= 2;
    }

    if (constraints.includes("avoid_heavy_spinal_loading")) {
      if (s.splitType === "strength_focus") score -= 2;
    }

    // time: 45 tends to work better with full body / upper-lower than dense PPL
    if (user.timeBucket === 45) {
      if (s.splitType === "push_pull_legs" && s.daysPerWeek <= 3) score -= 1;
      if (s.splitType === "full_body") score += 1;
    }

    return { scheme: s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map(x => x.scheme);
}

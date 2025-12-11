// Готовые схемы тренировок - БОЕВАЯ ВЕРСИЯ

export type WorkoutScheme = {
  id: string;
  name: string;
  russianName: string; // понятное название на русском
  description: string;
  daysPerWeek: number;
  minMinutes: number; // минимальная рекомендуемая длительность
  maxMinutes: number; // максимальная рекомендуемая длительность
  splitType: string;
  experienceLevels: string[];
  goals: string[];
  equipmentRequired: string[];
  dayLabels: Array<{ day: number; label: string; focus: string }>;
  benefits: string[];
  notes?: string;
  intensity: "low" | "moderate" | "high"; // интенсивность
  targetSex?: "male" | "female" | "any"; // для кого больше подходит
};

export const workoutSchemes: WorkoutScheme[] = [
  // ============= 2 ДНЯ В НЕДЕЛЮ =============
  {
    id: "full_body_2x_beginner",
    name: "Full Body Starter",
    russianName: "Новичок — всё тело 2 раза",
    description: "Две простые тренировки на всё тело в неделю — мягкий и понятный старт.",
    daysPerWeek: 2,
    minMinutes: 30,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate"],
    goals: ["health_wellness", "lose_weight", "athletic_body"],
    equipmentRequired: ["gym_full", "dumbbells", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Full Body A",
        focus: "Простые упражнения на всё тело: приседания, жимы, тяги — базовый фундамент.",
      },
      {
        day: 2,
        label: "Full Body B",
        focus: "Похожий набор движений, но с другими вариантами и углами, чтобы включать больше мышц.",
      },
    ],
    benefits: [
      "Очень простая структура — легко понять и запомнить.",
      "Между тренировками 2–3 дня отдыха — тело успевает восстановиться.",
      "Все основные мышцы работают 2 раза в неделю — хороший темп для прогресса новичка.",
    ],
    notes: "Подходит тем, кто только начинает и не хочет перегружаться сразу.",
    intensity: "low",
    targetSex: "any",
  },
  {
    id: "full_body_2x_recovery",
    name: "Full Body Recovery",
    russianName: "Мягкое возвращение после перерыва",
    description: "Осторожная программа, чтобы безопасно вернуться к тренировкам после паузы.",
    daysPerWeek: 2,
    minMinutes: 30,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["health_wellness", "lose_weight", "athletic_body"],
    equipmentRequired: ["gym_full", "dumbbells"],
    dayLabels: [
      {
        day: 1,
        label: "Full Body Gentle",
        focus: "Аккуратная нагрузка на всё тело — вспоминаем движения без перегруза.",
      },
      {
        day: 2,
        label: "Full Body Rebuild",
        focus: "Чуть сложнее, чем в первый день: понемногу добавляем вес и повторения.",
      },
    ],
    benefits: [
      "Щадящая нагрузка для тех, кто давно не тренировался.",
      "Фокус на аккуратной технике и ощущениях мышц.",
      "Минимальный риск травм и перетренированности.",
    ],
    intensity: "low",
    targetSex: "any",
  },

  // ============= 3 ДНЯ В НЕДЕЛЮ =============
  {
    id: "full_body_3x_classic",
    name: "Full Body Classic",
    russianName: "Классика: всё тело 3 раза",
    description: "Три тренировки на всё тело в неделю — универсальная рабочая классика.",
    daysPerWeek: 3,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["build_muscle", "athletic_body", "lose_weight", "health_wellness"],
    equipmentRequired: ["gym_full", "dumbbells"],
    dayLabels: [
      {
        day: 1,
        label: "Full Body A",
        focus: "Главные упражнения: приседания, жим лёжа, тяга — крепкий фундамент для всего тела.",
      },
      {
        day: 2,
        label: "Full Body B",
        focus: "Упор на спину и плечи: тяги, жим над головой, подтягивания и их варианты.",
      },
      {
        day: 3,
        label: "Full Body C",
        focus: "Выпады, наклонные жимы, тяги к поясу и дополнительные упражнения для баланса.",
      },
    ],
    benefits: [
      "Все основные мышцы получают нагрузку 3 раза в неделю — частый и эффективный стимул.",
      "Удобный режим «через день» — легко встроить в рабочий график.",
      "Подходит и для набора, и для сушки, и просто для хорошей формы.",
    ],
    intensity: "moderate",
    targetSex: "any",
  },
  {
    id: "push_pull_legs_3x_condensed",
    name: "Push/Pull/Legs Condensed",
    russianName: "Жим–тяга–ноги за 3 тренировки",
    description: "Классическая схема «жим–тяга–ноги», сжатая в 3 плотные тренировки в неделю.",
    daysPerWeek: 3,
    minMinutes: 60,
    maxMinutes: 90,
    splitType: "push_pull_legs",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["build_muscle", "strength", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Push",
        focus: "Грудь, плечи, трицепс — все упражнения, где вы толкаете вес от себя.",
      },
      {
        day: 2,
        label: "Pull",
        focus: "Спина, задняя часть плеч, бицепс — упражнения, где вы тянете вес к себе.",
      },
      {
        day: 3,
        label: "Legs",
        focus: "Бёдра, ягодицы, икры — полная тренировка ног за один раз.",
      },
    ],
    benefits: [
      "Каждая группа мышц получает плотную, «концентрированную» нагрузку за одну тренировку.",
      "Между днями для одной и той же группы проходит 6–7 дней — мышцы успевают восстановиться и расти.",
      "Подходит тем, кто хочет набрать массу, но готов тренироваться только 3 раза в неделю.",
    ],
    intensity: "high",
    targetSex: "any",
  },
  {
    id: "upper_lower_3x_hybrid",
    name: "Upper/Lower + Full Body",
    russianName: "Верх, низ и день «всё тело»",
    description: "Две тренировки с акцентом и один день — мягкая проработка всего тела.",
    daysPerWeek: 3,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "upper_lower",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["build_muscle", "strength", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Upper Focus",
        focus: "Акцент на верх тела: грудь, спина, плечи и руки в одном дне.",
      },
      {
        day: 2,
        label: "Lower Focus",
        focus: "Акцент на низ: бёдра, ягодицы, задняя поверхность бедра.",
      },
      {
        day: 3,
        label: "Full Body",
        focus: "Лёгкая тренировка на всё тело или отдельные отстающие зоны.",
      },
    ],
    benefits: [
      "Можно дать больше внимания каждой зоне, чем в обычном «всё тело».",
      "Третий день можно настроить: лёгкая тренировка или прицельно добить слабые места.",
      "Гибкая схема для тех, кто хочет и развиваться, и не перегореть.",
    ],
    intensity: "moderate",
    targetSex: "any",
  },
  {
    id: "full_body_3x_glutes_focus",
    name: "Full Body + Glutes Focus",
    russianName: "Всё тело с акцентом на ягодицы",
    description: "Три тренировки на всё тело, где ягодицы получают особое внимание.",
    daysPerWeek: 3,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lower_body_focus", "athletic_body", "build_muscle"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Full Body + Glutes A",
        focus: "Основные упражнения + ягодичный мост, отведения и другие движения на ягодицы.",
      },
      {
        day: 2,
        label: "Full Body General",
        focus: "Упор на верх тела и базовые упражнения на ноги без перегруза.",
      },
      {
        day: 3,
        label: "Full Body + Glutes B",
        focus: "Основные упражнения + выпады, румынская тяга и другие движения для ягодиц.",
      },
    ],
    benefits: [
      "Ягодицы и ноги получают усиленную нагрузку без потери баланса по всему телу.",
      "Фигура развивается гармонично: и верх, и низ, но с приоритетом на ягодицы.",
      "Отличный выбор для тех, кто хочет выразительные ягодицы и при этом спортивное тело.",
    ],
    intensity: "moderate",
    targetSex: "female",
  },

  // ============= 4 ДНЯ В НЕДЕЛЮ =============
  {
    id: "upper_lower_4x_classic",
    name: "Upper/Lower Classic",
    russianName: "Классический верх/низ 4 дня",
    description: "Четыре тренировки: два раза верх, два раза низ — «золотой стандарт».",
    daysPerWeek: 4,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "upper_lower",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["build_muscle", "strength", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Upper A",
        focus: "Грудь, спина, плечи, руки — жимы от себя и тяги к себе.",
      },
      {
        day: 2,
        label: "Lower A",
        focus: "Приседания, наклоны, упражнения на икры — основа для сильных ног.",
      },
      {
        day: 3,
        label: "Upper B",
        focus: "Жимы вверх, подтягивания и упражнения на руки для других углов нагрузки.",
      },
      {
        day: 4,
        label: "Lower B",
        focus: "Выпады, варианты приседаний и ягодичный мост — акцент на форме ног и ягодиц.",
      },
    ],
    benefits: [
      "Удобный баланс: каждая часть тела тренируется 2 раза в неделю.",
      "Идеальный сплит для набора мышц и роста силовых показателей.",
      "Понятная логика: дни «верх», дни «низ» — легко ориентироваться даже без опыта.",
    ],
    intensity: "moderate",
    targetSex: "any",
  },
  {
    id: "upper_lower_4x_powerbuilding",
    name: "Powerbuilding 4x",
    russianName: "Сила + масса за 4 тренировки",
    description: "Два тяжёлых дня на силу и два «объёмных» дня для набора мышц.",
    daysPerWeek: 4,
    minMinutes: 60,
    maxMinutes: 90,
    splitType: "upper_lower",
    experienceLevels: ["intermediate", "advanced"],
    goals: ["strength", "build_muscle"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Upper Power",
        focus: "Тяжёлые жимы и тяги на верх тела в небольшом количестве повторений.",
      },
      {
        day: 2,
        label: "Lower Power",
        focus: "Тяжёлые приседания и тяги для развития силы ног.",
      },
      {
        day: 3,
        label: "Upper Hypertrophy",
        focus: "Больше подходов и повторений на грудь, спину, плечи и руки.",
      },
      {
        day: 4,
        label: "Lower Hypertrophy",
        focus: "Объёмная работа на ноги и ягодицы для роста.",
      },
    ],
    benefits: [
      "Сила растёт за счёт тяжёлых упражнений, мышцы — за счёт объёма.",
      "Разные форматы нагрузки — тренировки не успевают надоесть.",
      "Подходит опытным, кто хочет и веса в штанге, и визуальный прогресс.",
    ],
    intensity: "high",
    targetSex: "any",
  },
  {
    id: "full_body_4x_advanced",
    name: "Full Body Advanced",
    russianName: "Всё тело 4 раза — продвинутая",
    description: "Четыре тренировки на всё тело, но каждая с разным акцентом.",
    daysPerWeek: 4,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "full_body",
    experienceLevels: ["intermediate", "advanced"],
    goals: ["strength", "athletic_body", "build_muscle"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Strength",
        focus: "Тяжёлые базовые упражнения с малым числом повторений.",
      },
      {
        day: 2,
        label: "Hypertrophy",
        focus: "Средний диапазон повторений — работа на объём и форму.",
      },
      {
        day: 3,
        label: "Power",
        focus: "Взрывные движения и прыжки — скорость и мощность.",
      },
      {
        day: 4,
        label: "Volume",
        focus: "Больше подходов и повторений — долгое и плотное «забивание» мышц.",
      },
    ],
    benefits: [
      "Организм получает разные типы нагрузки — это стимулирует максимум роста.",
      "Частая практика базовых движений улучшает технику и контроль.",
      "Подходит тем, кто хочет выглядеть и двигаться как спортсмен.",
    ],
    intensity: "high",
    targetSex: "any",
  },
  {
    id: "upper_lower_4x_glutes",
    name: "Upper/Lower + Glutes",
    russianName: "Верх/низ с акцентом на ягодицы",
    description: "Классический верх/низ, где низ тела и ягодицы получают больше внимания.",
    daysPerWeek: 4,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "upper_lower",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lower_body_focus", "athletic_body", "build_muscle"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Upper Body",
        focus: "Грудь, спина, плечи, руки — полный верх тела.",
      },
      {
        day: 2,
        label: "Lower + Glutes A",
        focus: "Приседы, ягодичный мост и отведения — акцент на форму ног и ягодиц.",
      },
      {
        day: 3,
        label: "Upper Body",
        focus: "Другие углы и упражнения для верха, чтобы проработать мышцы с разных сторон.",
      },
      {
        day: 4,
        label: "Lower + Glutes B",
        focus: "Выпады, наклоны, изолирующие упражнения — дополнительный фокус на ягодицы.",
      },
    ],
    benefits: [
      "Ягодицы и ноги прорабатываются чаще и тщательнее, чем в обычном сплите.",
      "Нижняя часть тела получает приоритет, но верх не остаётся без внимания.",
      "Отличный выбор для тех, кто хочет «ноги и ягодицы — визитную карточку».",
    ],
    intensity: "moderate",
    targetSex: "female",
  },

  // ============= 5 ДНЕЙ В НЕДЕЛЮ =============
  {
    id: "push_pull_legs_5x_classic",
    name: "Push/Pull/Legs",
    russianName: "Жим–тяга–ноги 5 дней",
    description: "Классическая схема для серьёзного роста мышц при 5 тренировках в неделю.",
    daysPerWeek: 5,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "push_pull_legs",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["build_muscle", "strength", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Push A",
        focus: "Грудь, передняя часть плеч и трицепс — классические жимы.",
      },
      {
        day: 2,
        label: "Pull A",
        focus: "Спина, задняя часть плеч и бицепс — базовые тяги и подтягивания.",
      },
      {
        day: 3,
        label: "Legs A",
        focus: "Квадрицепсы, ягодицы, икры — основные упражнения на ноги.",
      },
      {
        day: 4,
        label: "Push B",
        focus: "Жимы под другими углами и дополнительные упражнения на плечи и трицепс.",
      },
      {
        day: 5,
        label: "Pull B",
        focus: "Другие варианты тяг и упражнений на спину и бицепс.",
      },
    ],
    benefits: [
      "Большой объём работы для каждой группы мышц — отличный стимул для роста.",
      "Каждая зона отдыхается 2–3 дня, успевая восстановиться.",
      "Хороший вариант для тех, кто готов тренироваться почти каждый день.",
    ],
    notes: "Важно высыпаться и нормально есть — без восстановления схема будет слишком тяжёлой.",
    intensity: "high",
    targetSex: "any",
  },
  {
    id: "upper_lower_legs_5x",
    name: "Upper/Lower/Legs Focus",
    russianName: "Верх, низ и отдельный день ног",
    description: "Верх, низ и дополнительный день, полностью посвящённый ногам и ягодицам.",
    daysPerWeek: 5,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "upper_lower",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lower_body_focus", "build_muscle", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Upper A",
        focus: "Жимы и тяги на верх тела — базовые упражнения.",
      },
      {
        day: 2,
        label: "Lower A",
        focus: "Приседания и наклоны — основа для сильных ног.",
      },
      {
        day: 3,
        label: "Upper B",
        focus: "Другие варианты жимов и тяг для верха тела.",
      },
      {
        day: 4,
        label: "Lower B",
        focus: "Выпады, ягодичный мост и другие движения на нижнюю часть тела.",
      },
      {
        day: 5,
        label: "Glutes & Legs",
        focus: "День, полностью посвящённый ягодицам и ногам — фокус на форме и деталях.",
      },
    ],
    benefits: [
      "Нижняя часть тела и ягодицы получают приоритет — 3 полноценных дня в неделю.",
      "Максимальный стимул для роста и изменения формы ног.",
      "Отлично для тех, кто хочет «ножки и попу мечты».",
    ],
    intensity: "high",
    targetSex: "female",
  },
  {
    id: "push_pull_legs_5x_strength",
    name: "PPL Strength Focus",
    russianName: "Жим–тяга–ноги с упором на силу",
    description: "Push/Pull/Legs с разделением на тяжёлые силовые дни и объёмную работу.",
    daysPerWeek: 5,
    minMinutes: 60,
    maxMinutes: 90,
    splitType: "push_pull_legs",
    experienceLevels: ["intermediate", "advanced"],
    goals: ["strength", "build_muscle"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Push Heavy",
        focus: "Тяжёлые жимы на грудь и плечи с небольшим числом повторений.",
      },
      {
        day: 2,
        label: "Pull Heavy",
        focus: "Тяжёлые тяги и подтягивания для спины.",
      },
      {
        day: 3,
        label: "Legs Heavy",
        focus: "Тяжёлые приседания и тяги для ног.",
      },
      {
        day: 4,
        label: "Push Volume",
        focus: "Объёмная работа на грудь и плечи: больше подходов и повторений.",
      },
      {
        day: 5,
        label: "Pull Volume",
        focus: "Объёмная работа на спину и бицепс.",
      },
    ],
    benefits: [
      "Силовые показатели растут за счёт тяжёлых подходов.",
      "Мышцы растут за счёт дополнительных объёмных тренировок.",
      "Подходит тем, кто хочет «и сильнее, и больше».",
    ],
    intensity: "high",
    targetSex: "any",
  },
  {
    id: "full_body_5x_athlete",
    name: "Athletic Performance",
    russianName: "Подготовка как у спортсменов",
    description: "Пять тренировок в неделю для силы, скорости, выносливости и общего атлетизма.",
    daysPerWeek: 5,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["athletic_body", "strength", "health_wellness"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Strength",
        focus: "Силовые упражнения для развития общей мощности.",
      },
      {
        day: 2,
        label: "Power",
        focus: "Взрывные движения и прыжки — скорость и реакция.",
      },
      {
        day: 3,
        label: "Hypertrophy",
        focus: "Работа на мышцы и форму — средний диапазон повторений.",
      },
      {
        day: 4,
        label: "Conditioning",
        focus: "Выносливость, дыхание, ощущение «готовности» к нагрузке.",
      },
      {
        day: 5,
        label: "Recovery",
        focus: "Лёгкая активность, подвижность и растяжка — чтобы тело успевало восстанавливаться.",
      },
    ],
    benefits: [
      "Развитие не только внешнего вида, но и физических качеств: сила, скорость, выносливость.",
      "Тело становится «функциональным» — легче в спорте и повседневной жизни.",
      "Подходит тем, кто хочет чувствовать себя как атлет, а не просто «качать мышцы».",
    ],
    intensity: "high",
    targetSex: "any",
  },

  // ============= 6 ДНЕЙ В НЕДЕЛЮ =============
  {
    id: "push_pull_legs_6x_classic",
    name: "PPL 6x Classic",
    russianName: "Жим–тяга–ноги 6 дней",
    description: "Два полных круга «жим–тяга–ноги» за неделю — для тех, кто живёт залом.",
    daysPerWeek: 6,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "push_pull_legs",
    experienceLevels: ["intermediate", "advanced"],
    goals: ["build_muscle", "strength"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Push A",
        focus: "Тяжёлые жимы с акцентом на грудь.",
      },
      {
        day: 2,
        label: "Pull A",
        focus: "Тяжёлые тяги с акцентом на спину.",
      },
      {
        day: 3,
        label: "Legs A",
        focus: "Приседания, наклоны и другие базовые упражнения на ноги.",
      },
      {
        day: 4,
        label: "Push B",
        focus: "Более объёмная работа на грудь и плечи.",
      },
      {
        day: 5,
        label: "Pull B",
        focus: "Больше повторений и вариаций тяг на спину.",
      },
      {
        day: 6,
        label: "Legs B",
        focus: "Другие варианты приседаний и выпадов для ног.",
      },
    ],
    benefits: [
      "Каждая группа мышц тренируется 2 раза в неделю — высокая частота.",
      "Очень большой объём работы — максимум стимула для роста.",
      "Даёт быстрый прогресс при условии нормального сна и питания.",
    ],
    notes: "Подходит только тем, кто уже давно тренируется и хорошо восстанавливается.",
    intensity: "high",
    targetSex: "any",
  },
  {
    id: "bro_split_6x",
    name: "Bro Split",
    russianName: "Каждый день — своя мышца",
    description: "Классический бодибилдерский подход: отдельный день под каждую группу.",
    daysPerWeek: 6,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "bro_split",
    experienceLevels: ["intermediate", "advanced"],
    goals: ["build_muscle"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Chest",
        focus: "Полностью грудь — разные жимы и разведения.",
      },
      {
        day: 2,
        label: "Back",
        focus: "Полностью спина — тяги, подтягивания, тяги к поясу.",
      },
      {
        day: 3,
        label: "Shoulders",
        focus: "Полностью плечи — передняя, средняя и задняя дельта.",
      },
      {
        day: 4,
        label: "Legs",
        focus: "Полностью ноги — бёдра, ягодицы, икры.",
      },
      {
        day: 5,
        label: "Arms",
        focus: "Бицепс и трицепс — жимы, подъёмы, разгибания.",
      },
      {
        day: 6,
        label: "Glutes & Accessories",
        focus: "Ягодицы и дополнительная работа на мелкие мышцы.",
      },
    ],
    benefits: [
      "Можно сфокусироваться на одной группе и «проработать её до конца».",
      "Высокий объём работы на каждую зону.",
      "Классика бодибилдинга для любителей «качать по старой школе».",
    ],
    notes: "Нужна дисциплина, восстановление и стабильный график.",
    intensity: "high",
    targetSex: "any",
  },
  {
    id: "upper_lower_6x_intensive",
    name: "Upper/Lower Intensive",
    russianName: "Верх/низ 6 дней — интенсив",
    description: "Три раза верх, три раза низ — максимум частоты для продвинутых.",
    daysPerWeek: 6,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "upper_lower",
    experienceLevels: ["intermediate", "advanced"],
    goals: ["build_muscle", "strength"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Upper Heavy",
        focus: "Тяжёлые жимы и тяги на верх тела.",
      },
      {
        day: 2,
        label: "Lower Heavy",
        focus: "Тяжёлые приседания и тяги для ног.",
      },
      {
        day: 3,
        label: "Upper Volume",
        focus: "Больше подходов и повторений на грудь, спину, плечи и руки.",
      },
      {
        day: 4,
        label: "Lower Volume",
        focus: "Объёмная работа на бёдра и ягодицы.",
      },
      {
        day: 5,
        label: "Upper Pump",
        focus: "Более лёгкий день — «забивка» и изоляция верха.",
      },
      {
        day: 6,
        label: "Lower Pump",
        focus: "Лёгкий день на ноги — пампинг и изолирующие упражнения.",
      },
    ],
    benefits: [
      "Очень высокая частота стимулов — мышцы не «засыпают» между тренировками.",
      "Разные типы нагрузки: тяжёлые, объёмные и «памп»-дни.",
      "Подходит для тех, кто любит много тренироваться и умеет восстанавливаться.",
    ],
    intensity: "high",
    targetSex: "any",
  },
  {
    id: "push_pull_legs_6x_glutes",
    name: "PPL + Glutes Focus",
    russianName: "Жим–тяга–ноги + ягодицы",
    description: "Классический PPL с дополнительным днём под ягодицы и заднюю часть ног.",
    daysPerWeek: 6,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "push_pull_legs",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lower_body_focus", "build_muscle"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Push",
        focus: "Грудь, плечи, трицепс — классические жимы.",
      },
      {
        day: 2,
        label: "Pull",
        focus: "Спина и бицепс — тяги и подтягивания.",
      },
      {
        day: 3,
        label: "Legs + Glutes A",
        focus: "Квадрицепсы и ягодицы — приседы и базовые упражнения на низ тела.",
      },
      {
        day: 4,
        label: "Push",
        focus: "Другие углы жимов и упражнения на плечи.",
      },
      {
        day: 5,
        label: "Pull",
        focus: "Разные вариации тяг и упражнений на спину.",
      },
      {
        day: 6,
        label: "Glutes + Hamstrings",
        focus: "Ягодицы, задняя часть бедра и изолирующие упражнения для ног.",
      },
    ],
    benefits: [
      "Ягодицы тренируются 2 раза в неделю, плюс хороший объём на всю нижнюю часть.",
      "Сохраняется баланс по всему телу, но низ получает приоритет.",
      "Подходит тем, кто хочет ярко выражённые ягодицы и спортивную фигуру.",
    ],
    intensity: "high",
    targetSex: "female",
  },

  // ============= ДОПОЛНИТЕЛЬНЫЕ СПЕЦИАЛИЗИРОВАННЫЕ СХЕМЫ =============
  // Для похудения
  {
    id: "metabolic_conditioning_4x",
    name: "Metabolic Conditioning",
    russianName: "Разгон метаболизма",
    description: "Короткие, интенсивные тренировки для активного жиросжигания.",
    daysPerWeek: 4,
    minMinutes: 30,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lose_weight", "athletic_body"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Full Body HIIT",
        focus: "Интервальные тренировки на всё тело — чередуем усилие и отдых.",
      },
      {
        day: 2,
        label: "Full Body Circuits",
        focus: "Круговая тренировка: несколько упражнений подряд почти без пауз.",
      },
      {
        day: 3,
        label: "Full Body Strength",
        focus: "Силовые упражнения с короткими перерывами — и мышцы, и пульс работают.",
      },
      {
        day: 4,
        label: "Full Body Endurance",
        focus: "Тренировка на выносливость и общую «кондицию» тела.",
      },
    ],
    benefits: [
      "Помогает активно сжигать жир и ускорять обмен веществ.",
      "Небольшая длительность, но высокая плотность тренировки.",
      "Подходит тем, кто хочет и подтянуться, и почувствовать, что «хорошо поработал».",
    ],
    intensity: "high",
    targetSex: "any",
  },

  // Для минимального времени
  {
    id: "express_4x",
    name: "Express 4x",
    russianName: "Экспресс 4 дня",
    description: "Короткие, но эффективные тренировки для тех, у кого мало времени.",
    daysPerWeek: 4,
    minMinutes: 30,
    maxMinutes: 45,
    splitType: "upper_lower",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["health_wellness", "athletic_body", "build_muscle"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Upper Compound",
        focus: "Только самые эффективные упражнения на верх тела.",
      },
      {
        day: 2,
        label: "Lower Compound",
        focus: "Только базовые упражнения на ноги.",
      },
      {
        day: 3,
        label: "Upper Compound",
        focus: "Другие базовые движения на верх тела.",
      },
      {
        day: 4,
        label: "Lower Compound",
        focus: "Другие базовые движения на низ тела.",
      },
    ],
    benefits: [
      "Максимум результата при минимальном времени в зале.",
      "Без лишних упражнений — только то, что реально работает.",
      "Подходит занятым людям, которые всё равно хотят быть в форме.",
    ],
    intensity: "moderate",
    targetSex: "any",
  },

  // Для здоровья и долголетия
  {
    id: "longevity_3x",
    name: "Longevity Program",
    russianName: "Здоровье и долголетие",
    description: "Спокойная программа для крепкого тела, подвижности и самочувствия.",
    daysPerWeek: 3,
    minMinutes: 45,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["health_wellness"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Strength & Mobility",
        focus: "Простые силовые упражнения + лёгкая растяжка и подвижность суставов.",
      },
      {
        day: 2,
        label: "Functional Fitness",
        focus: "Движения, которые помогают в повседневной жизни: наклоны, подъемы, переносы.",
      },
      {
        day: 3,
        label: "Balance & Core",
        focus: "Упражнения на баланс, координацию и мышцы кора (пресс и поясница).",
      },
    ],
    benefits: [
      "Забота о суставах, спине и общем самочувствии.",
      "Помогает легче двигаться и чувствовать себя бодрее в быту.",
      "Подходит тем, для кого в приоритете здоровье, а не рекорды.",
    ],
    intensity: "low",
    targetSex: "any",
  },

  // ============= ДОПОЛНИТЕЛЬНЫЕ СХЕМЫ ДЛЯ ПОЛНОГО ПОКРЫТИЯ =============
  // Новичкам на 4 дня
  {
    id: "full_body_4x_beginner",
    name: "Full Body Beginner 4x",
    russianName: "Новичок: всё тело 4 дня",
    description: "Четыре простые тренировки на всё тело с плавным ростом нагрузки.",
    daysPerWeek: 4,
    minMinutes: 40,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate"],
    goals: ["build_muscle", "athletic_body", "health_wellness"],
    equipmentRequired: ["gym_full", "dumbbells"],
    dayLabels: [
      {
        day: 1,
        label: "Full Body A",
        focus: "Приседания, жим, тяга — базовый набор на всё тело.",
      },
      {
        day: 2,
        label: "Full Body B",
        focus: "Выпады, жим под углом, тяга к поясу — те же зоны, но под другими углами.",
      },
      {
        day: 3,
        label: "Full Body C",
        focus: "Более лёгкий день: пресс, спина, мышцы-стабилизаторы.",
      },
      {
        day: 4,
        label: "Full Body D",
        focus: "Повторение базы с чуть меньшими весами и акцентом на технику.",
      },
    ],
    benefits: [
      "Частая практика движений помогает быстро освоить технику.",
      "Нагрузка растёт постепенно — комфортно для новичка.",
      "Достаточно дней отдыха, чтобы не чувствовать постоянную усталость.",
    ],
    intensity: "low",
    targetSex: "any",
  },

  // Жиросжигание для новичков на 3 дня
  {
    id: "fat_loss_3x_beginner",
    name: "Fat Loss Beginner",
    russianName: "Новичок: сжигание жира",
    description: "Простая программа для похудения и улучшения формы без жёстких нагрузок.",
    daysPerWeek: 3,
    minMinutes: 40,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lose_weight", "health_wellness", "athletic_body"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Strength + Cardio",
        focus: "Несколько силовых упражнений + лёгкое кардио в конце.",
      },
      {
        day: 2,
        label: "Circuit Training",
        focus: "Круговая тренировка на всё тело с короткими паузами.",
      },
      {
        day: 3,
        label: "Full Body Conditioning",
        focus: "Функциональные упражнения, которые помогают сжигать калории и чувствовать лёгкость.",
      },
    ],
    benefits: [
      "Помогает сжигать жир без слишком жёсткого стресса.",
      "Улучшает выносливость и общее самочувствие.",
      "Безопасна для тех, кто только начинает путь к похудению.",
    ],
    intensity: "moderate",
    targetSex: "any",
  },

  // Жиросжигание для intermediate на 5 дней
  {
    id: "fat_loss_5x_intermediate",
    name: "Fat Loss Intensive",
    russianName: "Интенсивное сжигание жира",
    description: "Пять более интенсивных тренировок для заметного снижения жира.",
    daysPerWeek: 5,
    minMinutes: 40,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lose_weight", "athletic_body"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "HIIT Upper",
        focus: "Интенсивные интервалы на верх тела.",
      },
      {
        day: 2,
        label: "HIIT Lower",
        focus: "Интенсивные интервалы на ноги и ягодицы.",
      },
      {
        day: 3,
        label: "Metabolic Circuits",
        focus: "Круговые тренировки, которые сильно разгоняют пульс и расход калорий.",
      },
      {
        day: 4,
        label: "Strength Endurance",
        focus: "Силовые упражнения с упором на выносливость.",
      },
      {
        day: 5,
        label: "Active Recovery",
        focus: "Более лёгкая тренировка: движение + кардио для восстановления.",
      },
    ],
    benefits: [
      "Максимальный упор на жиросжигание — тренировки почти каждый день.",
      "Разные форматы — не скучно и тело получает разнообразный стимул.",
      "Быстрый визуальный эффект при нормальном питании.",
    ],
    intensity: "high",
    targetSex: "any",
  },

  // PPL для intermediate на 6 дней
  {
    id: "push_pull_legs_6x_intermediate",
    name: "PPL 6x Intermediate",
    russianName: "Жим–тяга–ноги 6 дней (средний уровень)",
    description: "Шесть тренировок в неделю по схеме «жим–тяга–ноги» для уверенно занимающихся.",
    daysPerWeek: 6,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "push_pull_legs",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["build_muscle", "strength", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Push A",
        focus: "Грудь и передние плечи, умеренная нагрузка.",
      },
      {
        day: 2,
        label: "Pull A",
        focus: "Спина и бицепс, умеренная нагрузка.",
      },
      {
        day: 3,
        label: "Legs A",
        focus: "Квадрицепсы и ягодицы — базовые упражнения.",
      },
      {
        day: 4,
        label: "Push B",
        focus: "Плечи и трицепс с большим количеством изолирующих упражнений.",
      },
      {
        day: 5,
        label: "Pull B",
        focus: "Спина и задние дельты с упором на детали и форму.",
      },
      {
        day: 6,
        label: "Legs B",
        focus: "Задняя поверхность бедра и икры.",
      },
    ],
    benefits: [
      "Каждая мышечная группа тренируется 2 раза в неделю — хороший стимул для роста.",
      "Подходит тем, кто уже уверенно чувствует себя в зале и хочет ускорить прогресс.",
      "Разнообразие упражнений и углов — мышцы работают по-разному и развиваются гармонично.",
    ],
    notes: "Важно следить за сном и питанием, иначе нагрузка может быть чрезмерной.",
    intensity: "high",
    targetSex: "any",
  },

  // Strength для новичков на 3 дня
  {
    id: "strength_3x_beginner",
    name: "Strength Basics",
    russianName: "Основы силы 3 дня",
    description: "Три тренировки в неделю, чтобы освоить базовые силовые движения.",
    daysPerWeek: 3,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["strength", "build_muscle", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Squat Focus",
        focus: "День вокруг приседаний + упражнения на верх тела.",
      },
      {
        day: 2,
        label: "Deadlift Focus",
        focus: "День вокруг становой тяги + подтягивания и тяги на спину.",
      },
      {
        day: 3,
        label: "Bench Focus",
        focus: "День вокруг жима лёжа + работа на ноги.",
      },
    ],
    benefits: [
      "Фокус на трёх главных движениях: присед, становая, жим лёжа.",
      "Помогает быстро набрать базовую силу и уверенность со штангой.",
      "Простая схема, понятная даже тем, кто только знакомится с силовыми.",
    ],
    intensity: "moderate",
    targetSex: "any",
  },

  // ============= ДОПОЛНИТЕЛЬНЫЕ СХЕМЫ ДЛЯ ПОЛНОГО ПОКРЫТИЯ =============
  
  // build_muscle + 2 дня
  {
    id: "heavy_full_body_2x",
    name: "Heavy Full Body 2x",
    russianName: "Тяжёлая база 2 дня",
    description: "Два интенсивных дня с тяжёлыми базовыми упражнениями для набора массы.",
    daysPerWeek: 2,
    minMinutes: 60,
    maxMinutes: 90,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["build_muscle", "strength", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Full Body Heavy A",
        focus: "Приседания, жим лёжа, тяга штанги — тяжёлые веса для максимального роста.",
      },
      {
        day: 2,
        label: "Full Body Heavy B",
        focus: "Становая тяга, жим над головой, подтягивания — вторая тяжёлая сессия.",
      },
    ],
    benefits: [
      "Два мощных дня дают достаточный стимул для роста мышц даже при минимальной частоте.",
      "Много времени на восстановление — мышцы растут между тренировками.",
      "Подходит тем, кто может тренироваться только 2 раза, но хочет серьёзного прогресса.",
    ],
    notes: "Основано на принципах HIT (High Intensity Training) — меньше тренировок, но каждая максимально эффективна.",
    intensity: "high",
    targetSex: "any",
  },

  // strength + 2 дня
  {
    id: "strength_foundation_2x",
    name: "Strength Foundation 2x",
    russianName: "Силовая база 2 дня",
    description: "Два силовых дня для развития максимальной силы в базовых движениях.",
    daysPerWeek: 2,
    minMinutes: 60,
    maxMinutes: 90,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["strength", "build_muscle", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Lower Body Strength",
        focus: "Тяжёлые приседания и становая тяга — основа для сильных ног и спины.",
      },
      {
        day: 2,
        label: "Upper Body Strength",
        focus: "Тяжёлый жим лёжа и жим стоя — мощный верх тела.",
      },
    ],
    benefits: [
      "Фокус на главных силовых движениях — присед, тяга, жим.",
      "Малое количество повторений с большими весами — растёт именно сила.",
      "Подходит для тех, кто хочет стать сильнее при минимальной частоте тренировок.",
    ],
    notes: "Основано на методах пауэрлифтинга — акцент на нейромышечную адаптацию и рост силы.",
    intensity: "high",
    targetSex: "any",
  },

  // lose_weight + 6 дней
  {
    id: "daily_burn_6x",
    name: "Daily Burn 6x",
    russianName: "Ежедневное жиросжигание",
    description: "Шесть разнообразных тренировок для максимального расхода калорий и ускорения метаболизма.",
    daysPerWeek: 6,
    minMinutes: 30,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lose_weight", "athletic_body"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "HIIT Full Body",
        focus: "Высокоинтенсивные интервалы на всё тело — сжигаем максимум калорий.",
      },
      {
        day: 2,
        label: "Strength Circuits",
        focus: "Круговая силовая тренировка — мышцы и жиросжигание одновременно.",
      },
      {
        day: 3,
        label: "Cardio + Core",
        focus: "Кардио и мышцы кора — выносливость и рельеф.",
      },
      {
        day: 4,
        label: "Upper Body Burn",
        focus: "Интенсивная работа на верх тела с высоким пульсом.",
      },
      {
        day: 5,
        label: "Lower Body Burn",
        focus: "Упражнения на ноги и ягодицы — самые энергозатратные мышцы.",
      },
      {
        day: 6,
        label: "Active Recovery",
        focus: "Лёгкая активность и растяжка — восстановление без полного отдыха.",
      },
    ],
    benefits: [
      "Ежедневная активность держит метаболизм на высоком уровне всю неделю.",
      "Разнообразие тренировок не даёт телу адаптироваться — жир продолжает уходить.",
      "Быстрые видимые результаты при правильном питании.",
    ],
    notes: "Основано на принципах NEAT (Non-Exercise Activity Thermogenesis) — постоянная активность для максимального расхода энергии.",
    intensity: "high",
    targetSex: "any",
  },

  // health_wellness + 6 дней
  {
    id: "active_lifestyle_6x",
    name: "Active Lifestyle 6x",
    russianName: "Активный образ жизни",
    description: "Шесть дней сбалансированной активности для здоровья, энергии и хорошего самочувствия.",
    daysPerWeek: 6,
    minMinutes: 30,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["health_wellness", "athletic_body"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Strength & Mobility",
        focus: "Силовые упражнения + растяжка для гибкости и крепкого тела.",
      },
      {
        day: 2,
        label: "Cardio Health",
        focus: "Кардио для сердца и лёгких — основа долголетия.",
      },
      {
        day: 3,
        label: "Balance & Core",
        focus: "Упражнения на баланс и мышцы кора — профилактика травм.",
      },
      {
        day: 4,
        label: "Functional Fitness",
        focus: "Функциональные движения для повседневной жизни.",
      },
      {
        day: 5,
        label: "Light Strength",
        focus: "Лёгкая силовая работа — поддержание мышечного тонуса.",
      },
      {
        day: 6,
        label: "Yoga & Stretch",
        focus: "Йога и растяжка — восстановление и подвижность суставов.",
      },
    ],
    benefits: [
      "Ежедневное движение улучшает настроение и уровень энергии.",
      "Разносторонняя нагрузка развивает все аспекты здоровья.",
      "Профилактика болезней сердца, диабета и других возрастных проблем.",
    ],
    notes: "Основано на рекомендациях ВОЗ и исследованиях Blue Zones — регионов с наибольшей продолжительностью жизни.",
    intensity: "low",
    targetSex: "any",
  },

  // lower_body_focus + 2 дня
  {
    id: "glutes_legs_2x",
    name: "Glutes & Legs Focus 2x",
    russianName: "Акцент на ягодицы и ноги 2 дня",
    description: "Два мощных дня для развития ног и ягодиц с минимальной частотой.",
    daysPerWeek: 2,
    minMinutes: 60,
    maxMinutes: 90,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lower_body_focus", "build_muscle", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Glutes & Quads",
        focus: "Приседания, выпады, ягодичный мост — передняя часть ног и ягодицы.",
      },
      {
        day: 2,
        label: "Hamstrings & Glutes",
        focus: "Румынская тяга, сгибания ног, отведения — задняя часть и ягодицы.",
      },
    ],
    benefits: [
      "Концентрированная работа на нижнюю часть тела — максимальный эффект за минимум дней.",
      "Достаточно времени на восстановление — ягодицам нужно 48-72 часа между нагрузками.",
      "Подходит тем, кто хочет сильные ноги и выразительные ягодицы при минимальной частоте.",
    ],
    notes: "Основано на принципе Bret Contreras (\"Glute Guy\") — акцент на ягодицы требует качества, а не количества тренировок.",
    intensity: "moderate",
    targetSex: "female",
  },

  // ============= ДОПОЛНИТЕЛЬНЫЕ СХЕМЫ ДЛЯ РАЗНООБРАЗИЯ =============
  
  // Похудение + 4 дня (альтернатива metabolic_conditioning)
  {
    id: "strength_cardio_hybrid_4x",
    name: "Strength + Cardio Hybrid",
    russianName: "Силовые + кардио микс",
    description: "Четыре тренировки, где силовые упражнения чередуются с кардио для жиросжигания.",
    daysPerWeek: 4,
    minMinutes: 45,
    maxMinutes: 75,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lose_weight", "athletic_body", "health_wellness"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Strength Upper",
        focus: "Силовые упражнения на верх тела — строим мышцы, которые сжигают калории.",
      },
      {
        day: 2,
        label: "Cardio + Core",
        focus: "Кардио и мышцы кора — высокий пульс и укрепление центра тела.",
      },
      {
        day: 3,
        label: "Strength Lower",
        focus: "Силовые на ноги и ягодицы — самые энергозатратные мышцы.",
      },
      {
        day: 4,
        label: "HIIT Full Body",
        focus: "Интервальная тренировка на всё тело — максимум калорий за короткое время.",
      },
    ],
    benefits: [
      "Силовые тренировки ускоряют метаболизм на сутки вперёд.",
      "Кардио дожигает жир, а силовые сохраняют мышцы при похудении.",
      "Разнообразие не даёт телу адаптироваться — жир продолжает уходить.",
    ],
    notes: "Основано на исследованиях EPOC (избыточное потребление кислорода после нагрузки) — сочетание силовых и кардио даёт максимальный эффект.",
    intensity: "high",
    targetSex: "any",
  },

  // Похудение + 5 дней (альтернатива fat_loss_5x)
  {
    id: "daily_movement_5x",
    name: "Daily Movement 5x",
    russianName: "Ежедневное движение 5 дней",
    description: "Пять дней разнообразной активности для похудения без перегрузок.",
    daysPerWeek: 5,
    minMinutes: 40,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lose_weight", "health_wellness", "athletic_body"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Strength Full Body",
        focus: "Силовая работа на всё тело — поддерживаем мышцы при похудении.",
      },
      {
        day: 2,
        label: "Walk + Stretch",
        focus: "Лёгкое кардио и растяжка — восстановление без полного отдыха.",
      },
      {
        day: 3,
        label: "Circuit Training",
        focus: "Круговая тренировка — много движений, высокий расход энергии.",
      },
      {
        day: 4,
        label: "Lower Body Focus",
        focus: "Упор на ноги — они сжигают больше всего калорий.",
      },
      {
        day: 5,
        label: "Active Recovery",
        focus: "Лёгкая активность, йога или плавание — движение без стресса.",
      },
    ],
    benefits: [
      "Ежедневная активность держит метаболизм высоким всю неделю.",
      "Есть и силовые, и лёгкие дни — не перегорите.",
      "Подходит тем, кто хочет худеть комфортно и без стресса.",
    ],
    notes: "Основано на концепции NEAT (термогенез нетренировочной активности) — регулярное движение важнее одной изнурительной тренировки.",
    intensity: "moderate",
    targetSex: "any",
  },

  // Акцент на низ + 3 дня (альтернатива full_body_3x_glutes_focus)
  {
    id: "glutes_builder_3x",
    name: "Glutes Builder 3x",
    russianName: "Строитель ягодиц 3 дня",
    description: "Три тренировки полностью посвящены ягодицам и ногам с научным подходом.",
    daysPerWeek: 3,
    minMinutes: 60,
    maxMinutes: 75,
    splitType: "lower_focus",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lower_body_focus", "build_muscle", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Glute Activation",
        focus: "Активация ягодиц: мосты, отведения, изоляция — учим мышцы работать правильно.",
      },
      {
        day: 2,
        label: "Heavy Compound",
        focus: "Тяжёлые базовые: приседания, выпады, становая — строим размер и силу.",
      },
      {
        day: 3,
        label: "Volume & Shape",
        focus: "Объёмная работа: много повторений для формы, пампинг и детализация.",
      },
    ],
    benefits: [
      "Разные типы нагрузки: активация, тяжёлая работа, объём — комплексный рост.",
      "Научный подход: сначала учимся чувствовать мышцы, потом нагружаем их.",
      "Результат уже через 4-6 недель — форма меняется заметно.",
    ],
    notes: "Основано на методике Bret Contreras: 3 типа стимула (активация, тяжесть, объём) для максимального роста ягодиц.",
    intensity: "moderate",
    targetSex: "female",
  },

  // Акцент на низ + 4 дня (альтернатива upper_lower_4x_glutes)
  {
    id: "legs_priority_4x",
    name: "Legs Priority 4x",
    russianName: "Ноги в приоритете 4 дня",
    description: "Четыре дня с максимальным упором на ноги и ягодицы, верх — поддерживающий.",
    daysPerWeek: 4,
    minMinutes: 60,
    maxMinutes: 75,
    splitType: "lower_focus",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lower_body_focus", "athletic_body", "build_muscle"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Legs Heavy",
        focus: "Тяжёлые ноги: приседы, становые — максимальная нагрузка для роста.",
      },
      {
        day: 2,
        label: "Upper Maintenance",
        focus: "Поддержка верха: лёгкая работа, чтобы не потерять баланс фигуры.",
      },
      {
        day: 3,
        label: "Glutes & Hamstrings",
        focus: "Ягодицы и задняя поверхность: мосты, сгибания, румынская тяга.",
      },
      {
        day: 4,
        label: "Legs Volume",
        focus: "Объёмная работа на ноги: выпады, разгибания, много повторений для формы.",
      },
    ],
    benefits: [
      "Три дня на ноги, один на верх — ноги растут максимально быстро.",
      "Есть и тяжёлые, и объёмные дни — разносторонний стимул.",
      "Верх остаётся в тонусе, но не отнимает энергию у ног.",
    ],
    notes: "Приоритетная схема: когда одна часть тела получает больше внимания, она растёт быстрее — принцип специализации.",
    intensity: "high",
    targetSex: "female",
  },

  // Акцент на низ + 5 дней (альтернатива upper_lower_legs_5x)
  {
    id: "booty_sculpt_5x",
    name: "Booty Sculpt 5x",
    russianName: "Лепим ягодицы 5 дней",
    description: "Пять тренировок с разными углами нагрузки для идеальной формы ног и ягодиц.",
    daysPerWeek: 5,
    minMinutes: 45,
    maxMinutes: 60,
    splitType: "lower_focus",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lower_body_focus", "athletic_body"],
    equipmentRequired: ["gym_full"],
    dayLabels: [
      {
        day: 1,
        label: "Glute Focus",
        focus: "Полностью ягодицы: мосты, толчки бедром, отведения — изоляция.",
      },
      {
        day: 2,
        label: "Quad Focus",
        focus: "Передняя часть ног: приседания, выпады, разгибания — бёдра.",
      },
      {
        day: 3,
        label: "Upper Body",
        focus: "Верх тела — лёгкий день для баланса фигуры.",
      },
      {
        day: 4,
        label: "Hamstrings Focus",
        focus: "Задняя поверхность: румынская тяга, сгибания — детализация.",
      },
      {
        day: 5,
        label: "Full Legs Pump",
        focus: "Все мышцы ног: пампинг, много повторений, лёгкие веса — форма и рельеф.",
      },
    ],
    benefits: [
      "Каждая зона ног получает отдельный день — максимальная проработка.",
      "Разные типы нагрузки: тяжёлая, изоляция, пампинг — комплексный подход.",
      "За 8-12 недель форма ног меняется кардинально.",
    ],
    notes: "Схема «скульптора»: работаем над каждой мышцей отдельно, как художник лепит детали статуи.",
    intensity: "moderate",
    targetSex: "female",
  },

  // Здоровье + 5 дней (альтернатива full_body_5x_athlete)
  {
    id: "wellness_balance_5x",
    name: "Wellness Balance 5x",
    russianName: "Баланс и здоровье 5 дней",
    description: "Пять сбалансированных тренировок для здоровья, энергии и хорошего самочувствия.",
    daysPerWeek: 5,
    minMinutes: 40,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["health_wellness", "athletic_body"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Strength Basics",
        focus: "Базовые силовые — укрепляем мышцы и кости.",
      },
      {
        day: 2,
        label: "Cardio Health",
        focus: "Кардио для сердца — здоровье сосудов и лёгких.",
      },
      {
        day: 3,
        label: "Mobility & Flexibility",
        focus: "Растяжка и подвижность — профилактика травм и боли в спине.",
      },
      {
        day: 4,
        label: "Functional Training",
        focus: "Функциональные движения — тренируем тело для повседневной жизни.",
      },
      {
        day: 5,
        label: "Mind-Body Connection",
        focus: "Йога, пилатес или лёгкое кардио — баланс тела и разума.",
      },
    ],
    benefits: [
      "Развитие всех аспектов здоровья: сила, выносливость, гибкость, баланс.",
      "Профилактика болезней: сердце, диабет, остеопороз, проблемы со спиной.",
      "Больше энергии в повседневной жизни, лучше настроение и сон.",
    ],
    notes: "Основано на концепции «функциональной молодости» — быть здоровым значит двигаться легко и чувствовать себя бодро.",
    intensity: "low",
    targetSex: "any",
  },

  // Похудение + 6 дней (альтернатива daily_burn_6x)
  {
    id: "lean_body_protocol_6x",
    name: "Lean Body Protocol 6x",
    russianName: "Протокол стройности 6 дней",
    description: "Шесть дней системной работы над жиросжиганием и построением стройного тела.",
    daysPerWeek: 6,
    minMinutes: 45,
    maxMinutes: 60,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["lose_weight", "athletic_body"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Strength Upper",
        focus: "Силовые на верх — мышцы сжигают калории даже в покое.",
      },
      {
        day: 2,
        label: "Cardio Intervals",
        focus: "Интервальное кардио — высокий расход калорий за короткое время.",
      },
      {
        day: 3,
        label: "Strength Lower",
        focus: "Силовые на ноги — самые энергозатратные мышцы.",
      },
      {
        day: 4,
        label: "Active Recovery",
        focus: "Лёгкая активность — движение без перегрузок.",
      },
      {
        day: 5,
        label: "Full Body Circuits",
        focus: "Круговая тренировка на всё тело — много движений, высокий пульс.",
      },
      {
        day: 6,
        label: "Steady State Cardio",
        focus: "Ровное кардио — жиросжигание без стресса для организма.",
      },
    ],
    benefits: [
      "Сочетание силовых и кардио — жир уходит, мышцы остаются.",
      "Есть день восстановления — не выгорите от нагрузок.",
      "Системный подход: разные типы тренировок для максимального эффекта.",
    ],
    notes: "Протокол построения стройного тела: не просто похудеть, а создать подтянутую спортивную фигуру.",
    intensity: "moderate",
    targetSex: "any",
  },

  // Здоровье + 6 дней (альтернатива active_lifestyle_6x)
  {
    id: "vitality_routine_6x",
    name: "Vitality Routine 6x",
    russianName: "Рутина бодрости 6 дней",
    description: "Шесть дней разнообразной активности для энергии, здоровья и долголетия.",
    daysPerWeek: 6,
    minMinutes: 30,
    maxMinutes: 50,
    splitType: "full_body",
    experienceLevels: ["beginner", "intermediate", "advanced"],
    goals: ["health_wellness", "athletic_body"],
    equipmentRequired: ["gym_full", "bodyweight"],
    dayLabels: [
      {
        day: 1,
        label: "Morning Movement",
        focus: "Утренняя зарядка: лёгкие упражнения для пробуждения тела.",
      },
      {
        day: 2,
        label: "Strength Light",
        focus: "Лёгкие силовые — поддерживаем мышечный тонус.",
      },
      {
        day: 3,
        label: "Walk & Breathe",
        focus: "Прогулка или лёгкое кардио — дыхание и свежий воздух.",
      },
      {
        day: 4,
        label: "Core & Balance",
        focus: "Мышцы кора и баланс — стабильность и координация.",
      },
      {
        day: 5,
        label: "Stretch & Flow",
        focus: "Растяжка и потоки движений — гибкость и подвижность.",
      },
      {
        day: 6,
        label: "Nature Activity",
        focus: "Активность на природе: велосипед, плавание, туризм — удовольствие от движения.",
      },
    ],
    benefits: [
      "Каждый день в движении — это и есть секрет долголетия.",
      "Лёгкая нагрузка не истощает, а даёт энергию на весь день.",
      "Разнообразие не даёт заскучать — каждый день что-то новое.",
    ],
    notes: "Философия Blue Zones: в регионах с наибольшей продолжительностью жизни люди двигаются каждый день, но умеренно.",
    intensity: "low",
    targetSex: "any",
  },
];
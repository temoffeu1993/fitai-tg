// getSchemeDisplayData.ts
// ============================================================================
// MARKETING LAYER - "Smart Partner" style titles and descriptions
// Transforms technical scheme data into user-friendly marketing copy
// ============================================================================

export type UserGoal =
  | "lose_weight"
  | "build_muscle"
  | "athletic_body"
  | "health_wellness"
  | "lower_body_focus"
  | "strength";

export type SplitType =
  | "full_body"
  | "upper_lower"
  | "push_pull_legs"
  | "strength_focus"
  | "lower_focus"
  | "conditioning"
  | "bro_split";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type Location = "gym" | "home_no_equipment" | "home_with_gear";

export interface SchemeDisplayData {
  title: string;
  description: string;
  badge: string;
  reason: string;
}

export interface SchemeInput {
  id: string;
  splitType: SplitType;
  intensity: "low" | "moderate" | "high";
  daysPerWeek: number;
  locations: Location[];
  targetSex?: "male" | "female" | "any";
}

export interface UserContext {
  goal: UserGoal;
  experience: ExperienceLevel;
  location: Location;
  sex?: "male" | "female";
  age?: number;
  bmi?: number;
}

// ============================================================================
// MARKETING COPY BY GOAL + SPLIT TYPE
// ============================================================================

const COPY_LOSE_WEIGHT: Record<string, { title: string; description: string; badge: string }> = {
  full_body: {
    title: "Активное сжигание",
    description: "Включим в работу всё тело. Лучший способ разогнать обмен веществ, чтобы калории сгорали и после тренировки.",
    badge: "Лучше для похудения",
  },
  upper_lower: {
    title: "Рельеф и Стройность",
    description: "Высокий темп уберёт лишнее, а силовые упражнения сделают тело подтянутым и спортивным.",
    badge: "Баланс силы и формы",
  },
  push_pull_legs: {
    title: "Рельеф и Стройность",
    description: "Высокий темп уберёт лишнее, а силовые упражнения сделают тело подтянутым и спортивным.",
    badge: "Для продвинутых",
  },
  conditioning: {
    title: "Фитнес-Драйв",
    description: "Динамичная программа. Пульс будет выше, объёмы — меньше, а выносливость — на высоте.",
    badge: "Максимум энергии",
  },
  lower_focus: {
    title: "Стройные ноги",
    description: "Акцент на нижнюю часть тела. Подтянутые ноги и ягодицы при общем снижении веса.",
    badge: "Акцент на низ",
  },
  strength_focus: {
    title: "Сила для похудения",
    description: "Тяжёлые веса + правильное питание = ускоренный метаболизм и сохранение мышц.",
    badge: "Силовой подход",
  },
  bro_split: {
    title: "Детальная проработка",
    description: "Каждая мышца получает свой день. Высокий объём работы для максимального сжигания.",
    badge: "Классика",
  },
};

const COPY_BUILD_MUSCLE: Record<string, { title: string; description: string; badge: string }> = {
  full_body: {
    title: "Силовой фундамент",
    description: "Классика роста. Нагружаем мышцы каждую тренировку — мощный сигнал организму становиться сильнее.",
    badge: "Проверенная классика",
  },
  upper_lower: {
    title: "Атлетичная форма",
    description: "Детальная работа над каждой мышцей. Фокус на пропорциях и объёмах.",
    badge: "Золотой стандарт",
  },
  push_pull_legs: {
    title: "Максимальный рост",
    description: "Высокая частота и объём. Каждая мышечная группа получает оптимальную нагрузку.",
    badge: "Для серьёзного роста",
  },
  conditioning: {
    title: "Функциональная масса",
    description: "Рост мышц + выносливость. Не просто большой, а ещё и выносливый.",
    badge: "Атлетизм",
  },
  lower_focus: {
    title: "Мощные ноги",
    description: "Акцент на самые большие мышцы тела. Ноги — фундамент силы и массы.",
    badge: "Приоритет низа",
  },
  strength_focus: {
    title: "Чистая сила",
    description: "Тяжёлые базовые движения. Растут и сила, и мышечная масса.",
    badge: "Силовая база",
  },
  bro_split: {
    title: "Бодибилдинг",
    description: "Классический подход к росту мышц. Каждый день — своя группа мышц.",
    badge: "Классика бодибилдинга",
  },
};

const COPY_ATHLETIC_BODY: Record<string, { title: string; description: string; badge: string }> = {
  full_body: {
    title: "Качество тела",
    description: "Уберём дряблость и добавим упругости. Цель — сделать тело плотным и спортивным.",
    badge: "Универсальный выбор",
  },
  upper_lower: {
    title: "Спортивная форма",
    description: "Баланс силы и эстетики. Подтянутое тело с хорошими пропорциями.",
    badge: "Сбалансированно",
  },
  push_pull_legs: {
    title: "Атлетичный силуэт",
    description: "Чёткое разделение мышечных групп для спортивного внешнего вида.",
    badge: "Продвинутый уровень",
  },
  conditioning: {
    title: "Драйв и Форма",
    description: "Сочетание силы и выносливости. Тело, которое не только выглядит, но и работает.",
    badge: "Функциональность",
  },
  lower_focus: {
    title: "Ягодицы и Формы",
    description: "Сделаем красивый акцент там, где нужно. Укрепим низ и подтянем ягодицы.",
    badge: "Женский приоритет",
  },
  strength_focus: {
    title: "Сильное тело",
    description: "Сила — основа атлетизма. Крепкие мышцы и уверенные движения.",
    badge: "Силовая база",
  },
  bro_split: {
    title: "Скульптура тела",
    description: "Детальная работа над каждой мышцей для идеальных пропорций.",
    badge: "Детализация",
  },
};

const COPY_HEALTH_WELLNESS: Record<string, { title: string; description: string; badge: string }> = {
  full_body: {
    title: "Здоровая спина и Тонус",
    description: "Вернём лёгкость движений. Укрепим мышечный корсет, чтобы спина не ныла, а энергии хватало на весь день.",
    badge: "Для здоровья",
  },
  upper_lower: {
    title: "Баланс и Сила",
    description: "Укрепление всего тела без перегрузок. Профилактика болей и травм.",
    badge: "Безопасно",
  },
  push_pull_legs: {
    title: "Структурированное здоровье",
    description: "Грамотное распределение нагрузки. Каждая часть тела получает внимание.",
    badge: "Системный подход",
  },
  conditioning: {
    title: "Заряд бодрости",
    description: "Комфортные тренировки. Помогут размять тело после сидячей работы и снять стресс.",
    badge: "Энергия и тонус",
  },
  lower_focus: {
    title: "Крепкий фундамент",
    description: "Сильные ноги — здоровые колени и спина. Профилактика возрастных проблем.",
    badge: "Здоровье ног",
  },
  strength_focus: {
    title: "Сила для жизни",
    description: "Крепкие мышцы защищают суставы и позвоночник. Инвестиция в долголетие.",
    badge: "Долгосрочно",
  },
  bro_split: {
    title: "Активное долголетие",
    description: "Умеренная нагрузка на все группы мышц. Поддержание формы без стресса.",
    badge: "Поддержание",
  },
};

const COPY_LOWER_FOCUS: Record<string, { title: string; description: string; badge: string }> = {
  full_body: {
    title: "Всё тело + Ягодицы",
    description: "Базовая проработка всего тела с дополнительным акцентом на ноги и ягодицы.",
    badge: "Сбалансированно",
  },
  upper_lower: {
    title: "Приоритет низа",
    description: "Больше дней на ноги и ягодицы при поддержке верха. Идеальные пропорции.",
    badge: "Акцент на низ",
  },
  push_pull_legs: {
    title: "PPL с акцентом на ноги",
    description: "Классический сплит с усиленным днём ног. Ягодицы получат максимум внимания.",
    badge: "Усиленные ноги",
  },
  conditioning: {
    title: "Динамичные ноги",
    description: "Круговые тренировки с акцентом на нижнюю часть. Стройные и подтянутые ноги.",
    badge: "Кардио + Ноги",
  },
  lower_focus: {
    title: "Ягодицы и Формы",
    description: "Максимальный фокус на ягодицы и бёдра. Сделаем красивый акцент там, где нужно.",
    badge: "Лучший выбор",
  },
  strength_focus: {
    title: "Сильные ноги",
    description: "Тяжёлые приседания и тяги. Мощный низ — основа красивой фигуры.",
    badge: "Силовой акцент",
  },
  bro_split: {
    title: "Детальная работа",
    description: "Отдельные дни для квадрицепсов, ягодиц и задней поверхности.",
    badge: "Детализация",
  },
};

const COPY_STRENGTH: Record<string, { title: string; description: string; badge: string }> = {
  full_body: {
    title: "Силовая база",
    description: "Тяжёлые базовые движения каждую тренировку. Становись сильнее день за днём.",
    badge: "Фундамент силы",
  },
  upper_lower: {
    title: "Силовой сплит",
    description: "Чередование верха и низа для максимального восстановления и роста силы.",
    badge: "Проверенный метод",
  },
  push_pull_legs: {
    title: "Силовой PPL",
    description: "Классический сплит с акцентом на базовые движения и прогрессию весов.",
    badge: "Для силовиков",
  },
  conditioning: {
    title: "Силовая выносливость",
    description: "Сила + кондиция. Не просто сильный, но и выносливый.",
    badge: "Функциональная сила",
  },
  lower_focus: {
    title: "Присед и Тяга",
    description: "Акцент на самые мощные движения. Ноги — источник силы всего тела.",
    badge: "База силы",
  },
  strength_focus: {
    title: "Чистая сила",
    description: "Максимальные веса в базовых движениях. Присед, жим, тяга — три кита силы.",
    badge: "Лучший выбор",
  },
  bro_split: {
    title: "Силовой бро-сплит",
    description: "Тяжёлая работа на каждую группу мышц. Объём и сила.",
    badge: "Классика",
  },
};

// ============================================================================
// REASON GENERATOR - "The Lamp" (insight box)
// ============================================================================

function generateReason(scheme: SchemeInput, user: UserContext): string {
  const reasons: string[] = [];

  // Experience-based reasons
  if (user.experience === "beginner") {
    if (scheme.splitType === "full_body") {
      reasons.push("Для новичка тренировка всего тела — самый эффективный и безопасный старт.");
    }
    if (user.goal === "lose_weight") {
      reasons.push("Начинающим важно не перегружаться, поэтому я подобрал программу с умеренной интенсивностью.");
    }
    if (scheme.daysPerWeek >= 5) {
      reasons.push("Много дней — значит, каждая тренировка будет короче и легче. Так проще войти в ритм.");
    }
  }

  if (user.experience === "intermediate" || user.experience === "advanced") {
    if (scheme.splitType === "push_pull_legs" || scheme.splitType === "upper_lower") {
      reasons.push("С твоим опытом раздельные тренировки дадут мышцам новый стресс для роста.");
    }
    if (user.goal === "build_muscle" && scheme.intensity === "high") {
      reasons.push("Высокая интенсивность — то, что нужно для продолжения прогресса.");
    }
  }

  // Location-based reasons
  if (user.location === "home_no_equipment") {
    reasons.push("Ты указал, что инвентаря нет — я подобрал программу с весом тела. Это бесплатно и эффективно.");
  }
  if (user.location === "home_with_gear") {
    reasons.push("Дома с гантелями можно добиться отличных результатов — главное, регулярность.");
  }

  // Age-based reasons
  if (user.age && user.age >= 50) {
    reasons.push("Я убрал рискованные нагрузки на позвоночник и добавил упражнения для осанки.");
  }
  if (user.age && user.age >= 35 && user.age < 50) {
    reasons.push("Умеренная интенсивность — оптимально для восстановления и долгосрочного прогресса.");
  }

  // BMI-based reasons
  if (user.bmi && user.bmi >= 30) {
    reasons.push("Я исключил прыжки и ударные нагрузки — это безопаснее для суставов.");
  }

  // Goal-based reasons
  if (user.goal === "health_wellness") {
    reasons.push("Главное — не навредить. Программа направлена на укрепление без перегрузок.");
  }
  if (user.goal === "lower_body_focus" && user.sex === "female") {
    reasons.push("Акцент на ягодицы и бёдра — именно то, что ты искала.");
  }

  // Days per week reasons
  if (scheme.daysPerWeek === 2) {
    reasons.push("Две тренировки в неделю — минимум для результата, но достаточно для старта.");
  }
  if (scheme.daysPerWeek >= 5) {
    reasons.push("Высокая частота = быстрее результат, если восстановление в порядке.");
  }

  // Default fallback
  if (reasons.length === 0) {
    reasons.push("Эта программа оптимально подходит под твои цели и возможности.");
  }

  return reasons[0]; // Return the most relevant reason
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export function getSchemeDisplayData(
  scheme: SchemeInput,
  user: UserContext
): SchemeDisplayData {
  // Select copy based on goal
  let copyMap: Record<string, { title: string; description: string; badge: string }>;

  switch (user.goal) {
    case "lose_weight":
      copyMap = COPY_LOSE_WEIGHT;
      break;
    case "build_muscle":
      copyMap = COPY_BUILD_MUSCLE;
      break;
    case "athletic_body":
      copyMap = COPY_ATHLETIC_BODY;
      break;
    case "health_wellness":
      copyMap = COPY_HEALTH_WELLNESS;
      break;
    case "lower_body_focus":
      copyMap = COPY_LOWER_FOCUS;
      break;
    case "strength":
      copyMap = COPY_STRENGTH;
      break;
    default:
      copyMap = COPY_ATHLETIC_BODY; // fallback
  }

  // Get copy for this split type
  const copy = copyMap[scheme.splitType] || copyMap.full_body;

  // Special case: home with dumbbells + build_muscle
  if (
    user.goal === "build_muscle" &&
    (user.location === "home_with_gear" || scheme.locations.includes("home_with_gear")) &&
    !scheme.locations.includes("gym")
  ) {
    return {
      title: "Домашняя сила",
      description: "Превратим пару гантелей в инструмент для построения крепкого тела.",
      badge: "Эффективно дома",
      reason: generateReason(scheme, user),
    };
  }

  // Special case: female + athletic_body/lower_focus + lower_focus split
  if (
    user.sex === "female" &&
    (user.goal === "athletic_body" || user.goal === "lower_body_focus") &&
    scheme.splitType === "lower_focus"
  ) {
    return {
      title: "Ягодицы и Формы",
      description: "Сделаем красивый акцент там, где нужно. Укрепим низ и подтянем ягодицы, сохранив изящный верх.",
      badge: "Идеально для тебя",
      reason: generateReason(scheme, user),
    };
  }

  // Special case: health + home
  if (
    user.goal === "health_wellness" &&
    (user.location === "home_no_equipment" || user.location === "home_with_gear")
  ) {
    return {
      title: "Заряд бодрости",
      description: "Комфортные тренировки дома. Помогут размять тело после сидячей работы и снять стресс.",
      badge: "Удобно дома",
      reason: generateReason(scheme, user),
    };
  }

  return {
    title: copy.title,
    description: copy.description,
    badge: copy.badge,
    reason: generateReason(scheme, user),
  };
}

// ============================================================================
// HELPER: Get display data for scheme card
// ============================================================================

export interface SchemeCardData {
  marketingTitle: string;
  marketingDescription: string;
  badge: string;
  reason: string;
  technicalName: string;
  daysPerWeek: number;
  splitType: SplitType;
}

export function getSchemeCardData(
  scheme: {
    id: string;
    russianName: string;
    splitType: SplitType;
    intensity: "low" | "moderate" | "high";
    daysPerWeek: number;
    locations: Location[];
    targetSex?: "male" | "female" | "any";
  },
  user: UserContext
): SchemeCardData {
  const displayData = getSchemeDisplayData(scheme, user);

  return {
    marketingTitle: displayData.title,
    marketingDescription: displayData.description,
    badge: displayData.badge,
    reason: displayData.reason,
    technicalName: scheme.russianName,
    daysPerWeek: scheme.daysPerWeek,
    splitType: scheme.splitType,
  };
}

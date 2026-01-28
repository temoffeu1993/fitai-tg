// webapp/src/utils/analyzeUserProfile.ts
// ============================================================================
// USER PROFILE ANALYSIS - Calculates calories, BMI, water, timeline
// Synced with actual onboarding data types
// ============================================================================

// ============================================================================
// 1. TYPES - Synced with OnbMotivation.tsx, OnbWorkday.tsx, OnbExperience.tsx
// ============================================================================

/** Goals from OnbMotivation.tsx */
export type GoalType = 'lose_weight' | 'build_muscle' | 'athletic_body' | 'health_wellness';

/** Activity levels from OnbWorkday.tsx (lifestyle.workStyle) */
export type ActivityLevel = 'sedentary' | 'balanced' | 'on_feet' | 'heavy_work';

/** Experience from OnbExperience.tsx */
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/** Sex from OnbAgeSex.tsx */
export type SexType = 'male' | 'female';

/**
 * User context built from onboarding draft
 * Maps to:
 * - sex: draft.ageSex.sex
 * - age: draft.ageSex.age
 * - weight: draft.body.weight
 * - height: draft.body.height
 * - goal: draft.motivation.goal
 * - activityLevel: draft.lifestyle.workStyle
 * - workoutDays: draft.schedule.daysPerWeek
 * - minutesPerSession: draft.schedule.minutesPerSession
 */
export interface UserContext {
  sex: SexType;
  age: number;
  weight: number;        // kg
  height: number;        // cm
  goal: GoalType;
  activityLevel: ActivityLevel;
  workoutDays: number;   // 2-6
  minutesPerSession?: number; // 45, 60, 90
  experience?: ExperienceLevel;
}

/** Analysis result returned to UI */
export interface AnalysisResult {
  calories: {
    value: number;
    tdee: number;         // Base TDEE before adjustment
    type: 'deficit' | 'surplus' | 'maintenance';
    label: string;
    description: string;
    percentChange: number; // e.g., -15 or +10
  };
  macros: {
    protein: number;      // grams
    fat: number;          // grams
    carbs: number;        // grams
  };
  water: {
    liters: number;
    glasses: number;      // ~250ml glasses
  };
  bmi: {
    value: number;
    status: 'underweight' | 'normal' | 'overweight' | 'obese';
    title: string;
    color: string;        // For UI indicator
  };
  investment: {
    percent: string;
    percentNum: number;   // For pie chart (e.g., 2.1)
    hoursPerWeek: number;
    minutesPerDay: number;
  };
  strategy: {
    focus: string;        // e.g., "Фундамент силы"
    tempo: 1 | 2 | 3;     // For fire icons
    tempoLabel: string;   // e.g., "Уверенный"
    description: string;  // Gender-aware description
  };
  timeline: TimelineItem[];
}

export interface TimelineItem {
  week: number;
  icon: string;
  title: string;
  description: string;
}

// ============================================================================
// 2. CONSTANTS - Activity multipliers (Harris-Benedict / Mifflin)
// ============================================================================

/**
 * Activity multipliers mapped to OnbWorkday options:
 * - sedentary: "Работаю головой" (desk job, minimal movement)
 * - balanced: "Много хожу пешком" (desk job + walking)
 * - on_feet: "Весь день на ногах" (standing job, active)
 * - heavy_work: "Тяжёлая работа" (physical labor)
 */
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  balanced: 1.375,
  on_feet: 1.55,
  heavy_work: 1.725,
};

/** Calories burned per workout session (average strength training) */
const CALORIES_PER_WORKOUT: Record<number, number> = {
  45: 280,
  60: 350,
  90: 480,
};

/** BMI thresholds (WHO standards) */
const BMI_THRESHOLDS = {
  underweight: 18.5,
  normal: 25,
  overweight: 30,
};

// ============================================================================
// 3. VALIDATION
// ============================================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateUserContext(user: Partial<UserContext>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!user.sex || !['male', 'female'].includes(user.sex)) {
    errors.push('Invalid sex');
  }
  if (!user.age || user.age < 14 || user.age > 100) {
    errors.push('Age must be between 14 and 100');
  }
  if (!user.weight || user.weight < 30 || user.weight > 300) {
    errors.push('Weight must be between 30 and 300 kg');
  }
  if (!user.height || user.height < 100 || user.height > 250) {
    errors.push('Height must be between 100 and 250 cm');
  }
  if (!user.goal) {
    errors.push('Goal is required');
  }
  if (!user.activityLevel) {
    errors.push('Activity level is required');
  }
  if (!user.workoutDays || user.workoutDays < 2 || user.workoutDays > 6) {
    errors.push('Workout days must be between 2 and 6');
  }

  // Warnings (non-blocking)
  if (user.age && user.age >= 65) {
    warnings.push('User is 65+, consider lower intensity recommendations');
  }
  if (user.weight && user.height) {
    const bmi = user.weight / Math.pow(user.height / 100, 2);
    if (bmi >= 35) {
      warnings.push('BMI >= 35, prioritize safety in recommendations');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// 4. CALCULATIONS
// ============================================================================

/**
 * Calculate BMR using Mifflin-St Jeor equation
 * Most accurate for general population
 */
function calculateBMR(sex: SexType, weight: number, height: number, age: number): number {
  // BMR = 10 * weight(kg) + 6.25 * height(cm) - 5 * age + s
  // s = +5 for males, -161 for females
  const s = sex === 'male' ? 5 : -161;
  return Math.round((10 * weight) + (6.25 * height) - (5 * age) + s);
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 * Includes base activity + training effect
 */
function calculateTDEE(
  bmr: number,
  activityLevel: ActivityLevel,
  workoutDays: number,
  minutesPerSession: number = 60
): number {
  // Base TDEE from lifestyle
  const baseMultiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  const baseTDEE = bmr * baseMultiplier;

  // Add training calories (spread over week)
  const caloriesPerSession = CALORIES_PER_WORKOUT[minutesPerSession] || 350;
  const weeklyTrainingCalories = workoutDays * caloriesPerSession;
  const dailyTrainingCalories = weeklyTrainingCalories / 7;

  return Math.round(baseTDEE + dailyTrainingCalories);
}

/**
 * Calculate target calories based on goal and BMI
 * Adaptive deficit/surplus based on body composition
 */
function calculateTargetCalories(
  tdee: number,
  goal: GoalType,
  bmi: number
): { value: number; type: 'deficit' | 'surplus' | 'maintenance'; percentChange: number } {

  if (goal === 'lose_weight') {
    // Adaptive deficit based on BMI
    // Higher BMI = can handle larger deficit safely
    let deficitPercent: number;
    if (bmi >= 35) {
      deficitPercent = 25; // Aggressive but safe for high BMI
    } else if (bmi >= 30) {
      deficitPercent = 22;
    } else if (bmi >= 27) {
      deficitPercent = 20;
    } else if (bmi >= 25) {
      deficitPercent = 18;
    } else {
      deficitPercent = 15; // Conservative for normal BMI
    }

    // Minimum floor to prevent metabolic slowdown
    const targetCalories = Math.round(tdee * (1 - deficitPercent / 100));
    const minimumCalories = bmi >= 25 ? 1400 : 1200;
    const finalCalories = Math.max(targetCalories, minimumCalories);

    // Recalculate actual percent change if floor was applied
    const actualPercentChange = Math.round(((finalCalories - tdee) / tdee) * 100);

    return {
      value: finalCalories,
      type: 'deficit',
      percentChange: actualPercentChange,
    };
  }

  if (goal === 'build_muscle') {
    // Surplus for muscle building
    // Smaller surplus for beginners to minimize fat gain
    const surplusPercent = bmi >= 25 ? 8 : 12;
    return {
      value: Math.round(tdee * (1 + surplusPercent / 100)),
      type: 'surplus',
      percentChange: surplusPercent,
    };
  }

  // athletic_body, health_wellness - maintenance or slight recomp
  if (goal === 'athletic_body') {
    // Slight deficit for body recomposition if overweight
    if (bmi >= 25) {
      return {
        value: Math.round(tdee * 0.95),
        type: 'deficit',
        percentChange: -5,
      };
    }
  }

  // Default: maintenance
  return {
    value: tdee,
    type: 'maintenance',
    percentChange: 0,
  };
}

/**
 * Calculate macros (protein, fat, carbs)
 * Uses effective weight for protein calculation (prevents overestimation at high BMI)
 */
function calculateMacros(
  targetCalories: number,
  weight: number,
  height: number,
  goal: GoalType,
  bmi: number
): AnalysisResult['macros'] {
  // Calculate effective weight for protein
  // For high BMI users, we use adjusted weight to avoid excessive protein targets
  // Formula: idealWeight + (currentWeight - idealWeight) * 0.25
  let effectiveWeight: number;
  if (bmi >= 30) {
    const idealWeight = Math.round(height - 100); // Simplified ideal weight
    effectiveWeight = idealWeight + (weight - idealWeight) * 0.25;
  } else if (bmi >= 27) {
    const idealWeight = Math.round(height - 100);
    effectiveWeight = idealWeight + (weight - idealWeight) * 0.5;
  } else {
    effectiveWeight = weight;
  }

  // Protein: 1.8-2.2g per kg depending on goal
  let proteinPerKg: number;
  if (goal === 'build_muscle') {
    proteinPerKg = 2.2; // Maximum for muscle growth
  } else if (goal === 'lose_weight') {
    proteinPerKg = 2.0; // High to preserve muscle during deficit
  } else if (goal === 'athletic_body') {
    proteinPerKg = 1.8; // Moderate-high for recomp
  } else {
    proteinPerKg = 1.6; // Adequate for health
  }

  const protein = Math.round(effectiveWeight * proteinPerKg);

  // Fat: 0.8-1.0g per kg (minimum for hormones, ~25-30% of calories)
  // Slightly higher for women (hormonal health)
  const fatPerKg = goal === 'lose_weight' ? 0.8 : 1.0;
  const fat = Math.round(effectiveWeight * fatPerKg);

  // Carbs: remaining calories
  // Protein = 4 cal/g, Fat = 9 cal/g, Carbs = 4 cal/g
  const proteinCalories = protein * 4;
  const fatCalories = fat * 9;
  const remainingCalories = targetCalories - proteinCalories - fatCalories;
  const carbs = Math.max(50, Math.round(remainingCalories / 4)); // Minimum 50g for brain function

  return { protein, fat, carbs };
}

/**
 * Calculate water intake
 * Base: 33ml per kg, adjusted for activity, goal, and workout duration
 */
function calculateWater(
  weight: number,
  activityLevel: ActivityLevel,
  goal: GoalType,
  workoutDays: number,
  minutesPerSession: number = 60
): { liters: number; glasses: number } {
  // Base: 33ml per kg
  let baseWater = weight * 0.033;

  // Add for active lifestyle
  if (activityLevel === 'on_feet' || activityLevel === 'heavy_work') {
    baseWater += 0.3; // +300ml
  }

  // Add for fat loss (helps metabolism)
  if (goal === 'lose_weight') {
    baseWater += 0.2; // +200ml
  }

  // Add for workout duration (spread over week)
  // ~250ml per 30 min of training, averaged daily
  const trainingWaterPerDay = (workoutDays * minutesPerSession * (250 / 30)) / 7;
  baseWater += trainingWaterPerDay / 1000; // convert ml to liters

  // Cap at reasonable maximum (4L)
  const liters = Math.min(4.0, Math.round(baseWater * 10) / 10);
  const glasses = Math.round(liters / 0.25); // 250ml glasses

  return { liters, glasses };
}

/**
 * Calculate BMI with status and UI color
 */
function calculateBMI(weight: number, height: number): AnalysisResult['bmi'] {
  const value = weight / Math.pow(height / 100, 2);
  const rounded = Math.round(value * 10) / 10;

  if (value < BMI_THRESHOLDS.underweight) {
    return {
      value: rounded,
      status: 'underweight',
      title: 'Дефицит массы',
      color: '#f59e0b', // amber
    };
  }
  if (value < BMI_THRESHOLDS.normal) {
    return {
      value: rounded,
      status: 'normal',
      title: 'Оптимальный вес',
      color: '#22c55e', // green
    };
  }
  if (value < BMI_THRESHOLDS.overweight) {
    return {
      value: rounded,
      status: 'overweight',
      title: 'Есть потенциал',
      color: '#f59e0b', // amber
    };
  }
  return {
    value: rounded,
    status: 'obese',
    title: 'Требует внимания',
    color: '#ef4444', // red
  };
}

/**
 * Calculate time investment
 */
function calculateInvestment(
  workoutDays: number,
  minutesPerSession: number = 60
): AnalysisResult['investment'] {
  const minutesPerWeek = workoutDays * minutesPerSession;
  const totalMinutesInWeek = 24 * 7 * 60; // 10080
  const percentNum = Math.round((minutesPerWeek / totalMinutesInWeek) * 1000) / 10; // e.g., 2.1
  const percent = percentNum.toFixed(1) + '%';
  const hoursPerWeek = Math.round((minutesPerWeek / 60) * 10) / 10;
  const minutesPerDay = Math.round(minutesPerWeek / 7);

  return { percent, percentNum, hoursPerWeek, minutesPerDay };
}

// ============================================================================
// TIMELINE GENERATION - Professional personalized timeline
// Matrix: 4 goals × 3 experience × 3 age groups + modifiers
// ============================================================================

type AgeGroup = 'young' | 'middle' | 'senior';
type FrequencyLevel = 'low' | 'medium' | 'high';

interface TimelineConfig {
  goal: GoalType;
  experience: ExperienceLevel;
  ageGroup: AgeGroup;
  sex: SexType;
  frequency: FrequencyLevel;
  bmiStatus: 'underweight' | 'normal' | 'overweight' | 'obese';
}

function getAgeGroup(age: number): AgeGroup {
  if (age < 35) return 'young';
  if (age < 50) return 'middle';
  return 'senior';
}

function getFrequencyLevel(workoutDays: number): FrequencyLevel {
  if (workoutDays <= 3) return 'low';
  if (workoutDays === 4) return 'medium';
  return 'high';
}

// ============================================================================
// TIMELINE DATA - All 72 variants (4 goals × 3 exp × 3 age × 2 sex)
// Deep personalization: gender-specific copy hitting core desires
// ============================================================================

const TIMELINE_DATA: Record<
  GoalType,
  Record<ExperienceLevel, Record<AgeGroup, Record<SexType, TimelineItem[]>>>
> = {
  // =========================================================================
  // LOSE_WEIGHT
  // Male: control, respect, "looking solid", confidence
  // Female: freedom in clothes, lightness, "loving the mirror"
  // =========================================================================
  lose_weight: {
    beginner: {
      young: {
        male: [
          { week: 1, icon: '💧', title: 'Сброс воды', description: 'Лицо острее, челюсть чётче. Первый звоночек — ты на верном пути.' },
          { week: 4, icon: '👕', title: 'Футболка села', description: 'Живот не торчит, грудь видно. Зеркало начинает радовать.' },
          { week: 12, icon: '🔥', title: 'Другой человек', description: 'Ловишь взгляды. На пляж? Без майки. Уверенность — твоя.' },
        ],
        female: [
          { week: 1, icon: '💧', title: 'Лёгкость', description: 'Отёки уходят, лицо свежее, кольца не жмут. Тело говорит "спасибо"!' },
          { week: 4, icon: '👗', title: 'Платье с полки', description: 'То самое, которое "когда-нибудь". Когда-нибудь — сейчас.' },
          { week: 12, icon: '✨', title: 'Новая ты', description: 'Любая одежда — твоя. Фото без фильтров. Это ты, и ты прекрасна.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '⚡', title: 'Перезапуск', description: 'Утром встаёшь бодрым, вечером силы остались. Тело вспоминает молодость.' },
          { week: 4, icon: '👔', title: 'Рубашка в брюки', description: 'Живот не мешает. Ремень на новой дырке. Коллеги заметят.' },
          { week: 12, icon: '🚀', title: 'Форма 2.0', description: 'Выглядишь лучше чем в 30. Жена смотрит по-другому. Факт.' },
        ],
        female: [
          { week: 1, icon: '⚡', title: 'Энергия', description: 'Просыпаешься легче, день длиннее. Откуда силы? От тебя.' },
          { week: 4, icon: '👠', title: 'Комплименты', description: '"Отлично выглядишь!" — и это искренне. Одежда сидит как надо.' },
          { week: 12, icon: '🌟', title: 'Перезагрузка', description: 'Чувствуешь себя на 10 лет моложе. И выглядишь так же.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🔋', title: 'Заряд', description: 'Лестница — не испытание. День на ногах — не проблема. Силы есть.' },
          { week: 4, icon: '📉', title: 'Минус кг', description: 'Весы радуют, колени благодарят. Каждый шаг легче.' },
          { week: 12, icon: '👑', title: 'Пример', description: 'Внуки не угонятся. Врачи удивляются. Возраст — просто цифра.' },
        ],
        female: [
          { week: 1, icon: '🔋', title: 'Бодрость', description: 'Энергии больше, движения легче. Тело благодарит за заботу.' },
          { week: 4, icon: '✨', title: 'Лёгкость', description: 'Одежда сидит свободнее, отражение нравится. Прогресс!' },
          { week: 12, icon: '💐', title: 'Цветение', description: 'Комплименты от подруг, удивление врачей. Ты — вдохновение.' },
        ],
      },
    },
    intermediate: {
      young: {
        male: [
          { week: 1, icon: '🚀', title: 'Разгон', description: 'Метаболизм ускоряется, тело вспоминает — ты создан быть поджарым.' },
          { week: 4, icon: '📐', title: 'Рельеф', description: 'Пресс проступает, руки очерчены. Тело становится оружием.' },
          { week: 12, icon: '💎', title: 'Машина', description: 'Пляж без стресса. Взгляды — на тебе. Ты это заслужил.' },
        ],
        female: [
          { week: 1, icon: '🚀', title: 'Ускорение', description: 'Тело вспоминает, как быть лёгким. Метаболизм на твоей стороне.' },
          { week: 4, icon: '📐', title: 'Силуэт', description: 'Талия тоньше, бёдра чётче. Отражение начинает нравиться.' },
          { week: 12, icon: '💃', title: 'Свобода', description: 'Открытый топ? Облегающее платье? Всё — да. Ты сияешь.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '🔄', title: 'Возврат', description: 'Тело помнит, как быть в форме. Напоминаем ему!' },
          { week: 4, icon: '📸', title: 'Фото без стыда', description: 'Ракурс? Любой. Камера — друг. Удаляешь меньше.' },
          { week: 12, icon: '🏆', title: 'Та самая форма', description: 'Как в лучшие годы, только умнее. Опыт + результат.' },
        ],
        female: [
          { week: 1, icon: '🔄', title: 'Новый старт', description: 'Тело откликается быстро. Оно ждало этого!' },
          { week: 4, icon: '📸', title: 'Камера — друг', description: 'Фото нравятся. Углы? Любые. Уверенность растёт.' },
          { week: 12, icon: '🌟', title: 'Лучшая версия', description: 'Выглядишь свежее, чувствуешь себя на миллион.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '💪', title: 'Тонус', description: 'Энергия с утра до вечера. Тело вспоминает силу.' },
          { week: 4, icon: '🎯', title: 'Прогресс', description: 'Ремень на новой дырке, брюки свободнее. Победа за победой.' },
          { week: 12, icon: '⭐', title: 'Авторитет', description: 'На тебя равняются. "Как ты это делаешь?" — частый вопрос.' },
        ],
        female: [
          { week: 1, icon: '💪', title: 'Сила', description: 'Бодрость весь день. Тело работает на тебя.' },
          { week: 4, icon: '🎯', title: 'Результат', description: 'Одежда свободнее, шаг легче. Каждый день — маленькая победа.' },
          { week: 12, icon: '👑', title: 'Королева', description: 'Подруги спрашивают секрет. Секрет — ты и твоя работа.' },
        ],
      },
    },
    advanced: {
      young: {
        male: [
          { week: 1, icon: '⚡', title: 'Сушка', description: 'Дефицит работает точно. Мышцы остаются, жир уходит.' },
          { week: 4, icon: '🎨', title: 'Детали', description: 'Вены на руках, сепарация мышц. Это уже искусство.' },
          { week: 12, icon: '🏛️', title: 'Скульптура', description: 'Каждая мышца читается. Ты — ходячий мотиватор.' },
        ],
        female: [
          { week: 1, icon: '⚡', title: 'Точность', description: 'Тело откликается мгновенно. Ты знаешь, что делаешь.' },
          { week: 4, icon: '🎨', title: 'Линии', description: 'Мышцы видны, но женственность на месте. Баланс.' },
          { week: 12, icon: '💎', title: 'Бриллиант', description: 'Отточенное тело. Сила + грация. Ты — эталон.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '🎯', title: 'Снайпер', description: 'Точечная работа: убираем лишнее, сохраняем нужное.' },
          { week: 4, icon: '📉', title: 'Чистка', description: 'Зеркало не врёт. Каждую неделю — прогресс.' },
          { week: 12, icon: '🏅', title: 'Элита', description: 'Форма лучше чем у большинства 25-летних. Опыт решает.' },
        ],
        female: [
          { week: 1, icon: '🎯', title: 'Контроль', description: 'Знаешь своё тело идеально. Каждый шаг — осознанный.' },
          { week: 4, icon: '📉', title: 'Шлифовка', description: 'Детали проявляются. Силуэт всё чётче.' },
          { week: 12, icon: '🌟', title: 'Мастерство', description: 'Тело как произведение. Ты — сама себе скульптор.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🧠', title: 'Опыт', description: 'Никакой спешки, только результат. Ты знаешь своё тело.' },
          { week: 4, icon: '⚖️', title: 'Баланс', description: 'Сила не падает, лишнее уходит. Идеальная формула.' },
          { week: 12, icon: '🎖️', title: 'Легенда', description: 'Доказал всем: возраст — это опыт, а не ограничение.' },
        ],
        female: [
          { week: 1, icon: '🧠', title: 'Мудрость', description: 'Тело слушаешь, сигналы понимаешь. Это твоя сила.' },
          { week: 4, icon: '⚖️', title: 'Гармония', description: 'Всё на месте: энергия, форма, настроение.' },
          { week: 12, icon: '👑', title: 'Икона', description: 'Вдохновляешь других. Доказала: красота — без срока годности.' },
        ],
      },
    },
  },

  // =========================================================================
  // BUILD_MUSCLE
  // Male: size, power, respect, "filling out shirts"
  // Female: shape, tone, strength without bulk, "looking fit"
  // =========================================================================
  build_muscle: {
    beginner: {
      young: {
        male: [
          { week: 1, icon: '🧠', title: 'Пробуждение', description: 'Мышцы: "О, нас качают!" Крепатура — значит, растём.' },
          { week: 4, icon: '📈', title: 'Первые рекорды', description: 'Веса растут каждую неделю. Руки уже другие.' },
          { week: 12, icon: '🦸', title: 'Трансформация', description: 'Футболки жмут в плечах. Лучшая проблема в жизни.' },
        ],
        female: [
          { week: 1, icon: '🌱', title: 'Старт', description: 'Мышцы просыпаются. Приятная усталость = прогресс!' },
          { week: 4, icon: '📈', title: 'Первый рельеф', description: 'Руки подтянулись, спина ровнее. Уже видно!' },
          { week: 12, icon: '✨', title: 'Новые формы', description: 'Подтянуто, женственно, сильно. Ты это сделала.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '🔌', title: 'Запуск', description: 'Мышцы вспоминают работу. Приятная усталость — хороший знак.' },
          { week: 4, icon: '💪', title: 'Сила', description: 'Хват крепче, осанка прямее. Уже чувствуется.' },
          { week: 12, icon: '🔥', title: 'Результат', description: '"Ты качаешься?" — новый FAQ в твоей жизни.' },
        ],
        female: [
          { week: 1, icon: '🔌', title: 'Включение', description: 'Тело откликается. Мышцы — твои союзники.' },
          { week: 4, icon: '💪', title: 'Тонус', description: 'Руки подтянуты, осанка королевская.' },
          { week: 12, icon: '🌟', title: 'Преображение', description: 'Сильная, подтянутая, женственная. Комплименты — каждый день.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🌱', title: 'Фундамент', description: 'Техника прежде весов. Делаем правильно.' },
          { week: 4, icon: '🔧', title: 'Крепость', description: 'Хват сильнее, мышцы твёрже. Прогресс!' },
          { week: 12, icon: '🛡️', title: 'Сила', description: 'Функциональная мощь. Сумки, лестницы — легко.' },
        ],
        female: [
          { week: 1, icon: '🌱', title: 'Начало', description: 'Мягко, безопасно, эффективно. Техника — основа.' },
          { week: 4, icon: '🔧', title: 'Укрепление', description: 'Спина крепче, руки сильнее. Осанка — загляденье.' },
          { week: 12, icon: '💐', title: 'Сила', description: 'Независимость в движениях. Ты можешь всё сама.' },
        ],
      },
    },
    intermediate: {
      young: {
        male: [
          { week: 1, icon: '🔄', title: 'Встряска', description: 'Новая программа = новый стресс для мышц. Растём!' },
          { week: 4, icon: '📊', title: 'Прорыв', description: 'Плато? Забудь. Веса и объёмы идут вверх.' },
          { week: 12, icon: '🦍', title: 'Мощь', description: 'Сила ↑, объём ↑, уверенность ↑↑↑' },
        ],
        female: [
          { week: 1, icon: '🔄', title: 'Новый вызов', description: 'Тело адаптируется, мышцы отвечают.' },
          { week: 4, icon: '📊', title: 'Прогресс', description: 'Формы чётче, силы больше. Отражение радует.' },
          { week: 12, icon: '💪', title: 'Атлетка', description: 'Сильная и женственная. Идеальный баланс.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '⚙️', title: 'Настройка', description: 'Новые углы, новые стимулы. Мышцы в шоке!' },
          { week: 4, icon: '📈', title: 'Рост', description: 'Стабильный прогресс. Техника — на автомате.' },
          { week: 12, icon: '🏆', title: 'Топ-форма', description: 'Выглядишь мощнее чем в 30. Это не комплимент — факт.' },
        ],
        female: [
          { week: 1, icon: '⚙️', title: 'Перенастройка', description: 'Тело получает новые сигналы. Работает!' },
          { week: 4, icon: '📈', title: 'Чёткость', description: 'Мышцы прорисовываются. Сила + грация.' },
          { week: 12, icon: '🌟', title: 'Лучшая форма', description: 'Сильнее и стройнее чем в 25. Это реально.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🎯', title: 'Качество', description: 'Каждое повторение — осознанно. Качество важнее.' },
          { week: 4, icon: '💎', title: 'Плотность', description: 'Мышцы плотнее, силуэт чётче. Видно.' },
          { week: 12, icon: '🎖️', title: 'Мощь', description: 'Сильнее большинства молодых. Без преувеличений.' },
        ],
        female: [
          { week: 1, icon: '🎯', title: 'Точность', description: 'Каждое движение — с пользой. Умный подход.' },
          { week: 4, icon: '💎', title: 'Тонус', description: 'Подтянуто, крепко, красиво.' },
          { week: 12, icon: '👑', title: 'Сила', description: 'Независимость и уверенность. Возраст — не помеха.' },
        ],
      },
    },
    advanced: {
      young: {
        male: [
          { week: 1, icon: '💥', title: 'Шок', description: 'Новая периодизация, мышцы в замешательстве. Идеально!' },
          { week: 4, icon: '🔬', title: 'Точность', description: 'Каждый грамм — чистая масса. Никакой воды.' },
          { week: 12, icon: '👑', title: 'Элита', description: 'Новички просят совет. Ты — эталон в зале.' },
        ],
        female: [
          { week: 1, icon: '💥', title: 'Вызов', description: 'Новый уровень нагрузки. Тело готово!' },
          { week: 4, icon: '🔬', title: 'Детализация', description: 'Каждая мышца на месте. Скульптура.' },
          { week: 12, icon: '🏆', title: 'Чемпионка', description: 'Сила, которой гордишься. Форма мечты.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '🧪', title: 'Эксперимент', description: 'Новые техники, углы, темп. Прогресс гарантирован.' },
          { week: 4, icon: '📐', title: 'Скульптура', description: 'Пропорции улучшаются, детали проявляются.' },
          { week: 12, icon: '🏛️', title: 'Монумент', description: 'Генетический потолок? Пробиваем его.' },
        ],
        female: [
          { week: 1, icon: '🧪', title: 'Новые методы', description: 'Тело получает новые стимулы.' },
          { week: 4, icon: '📐', title: 'Пропорции', description: 'Всё на месте. Гармония силы и формы.' },
          { week: 12, icon: '🌟', title: 'Совершенство', description: 'Лучшая версия себя. Ты это создала.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🧠', title: 'Опыт', description: 'Тело знаешь лучше всех. Это преимущество.' },
          { week: 4, icon: '⚖️', title: 'Баланс', description: 'Сила держится, масса растёт. Победа!' },
          { week: 12, icon: '🎖️', title: 'Легенда', description: 'В твоём возрасте так выглядят единицы.' },
        ],
        female: [
          { week: 1, icon: '🧠', title: 'Мудрость', description: 'Опыт — твоя суперсила. Используем!' },
          { week: 4, icon: '⚖️', title: 'Стабильность', description: 'Сила растёт, форма держится.' },
          { week: 12, icon: '👑', title: 'Эталон', description: 'Вдохновляешь поколения. Сила без возраста.' },
        ],
      },
    },
  },

  // =========================================================================
  // ATHLETIC_BODY
  // Male: functional strength, looking athletic, "ready for anything"
  // Female: toned, lean, confidence in any outfit
  // =========================================================================
  athletic_body: {
    beginner: {
      young: {
        male: [
          { week: 1, icon: '🎬', title: 'Старт', description: 'Тело включается: "О, мы теперь спортсмены?" Да!' },
          { week: 4, icon: '📐', title: 'Контуры', description: 'Осанка ровнее, плечи шире. Уже видно.' },
          { week: 12, icon: '⭐', title: 'Атлет', description: 'Подтянуто, функционально, мощно. Готов ко всему.' },
        ],
        female: [
          { week: 1, icon: '🎬', title: 'Включение', description: 'Тело просыпается. Энергия появляется!' },
          { week: 4, icon: '📐', title: 'Силуэт', description: 'Осанка ровнее, линии чётче. Заметно!' },
          { week: 12, icon: '✨', title: 'Вау', description: 'Подтянуто, уверенно, стильно. Любой наряд — твой.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '🔋', title: 'Энергия', description: 'Сил больше, сон лучше. Тело благодарит.' },
          { week: 4, icon: '👔', title: 'Посадка', description: 'Пиджак сидит идеально. Плечи расправлены.' },
          { week: 12, icon: '🌟', title: 'Обновление', description: 'Выглядишь свежее, двигаешься увереннее. Минус годы.' },
        ],
        female: [
          { week: 1, icon: '🔋', title: 'Заряд', description: 'Энергии больше, настроение лучше.' },
          { week: 4, icon: '👗', title: 'Посадка', description: 'Любая одежда сидит лучше. Осанка!' },
          { week: 12, icon: '🌟', title: 'Свежесть', description: 'Выглядишь моложе, чувствуешь себя легче.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🌿', title: 'Движение', description: 'Тело благодарит за активность. Бодрость!' },
          { week: 4, icon: '🚶', title: 'Уверенность', description: 'Походка твёрже, спина прямее.' },
          { week: 12, icon: '☀️', title: 'Энергия', description: 'Весь день активен. Возраст? Какой возраст?' },
        ],
        female: [
          { week: 1, icon: '🌿', title: 'Лёгкость', description: 'Движения свободнее, энергии больше.' },
          { week: 4, icon: '🚶', title: 'Грация', description: 'Походка уверенная, осанка прямая.' },
          { week: 12, icon: '☀️', title: 'Сияние', description: 'Бодрость и лёгкость. Вдохновляешь!' },
        ],
      },
    },
    intermediate: {
      young: {
        male: [
          { week: 1, icon: '🔥', title: 'Разгон', description: 'Тело откликается мгновенно. Помнит, умеет, делает.' },
          { week: 4, icon: '🎨', title: 'V-силуэт', description: 'Плечи шире, талия уже. Пропорции атлета.' },
          { week: 12, icon: '🏖️', title: 'Готов', description: 'Пляж, бассейн, что угодно — без стресса. Уверенность.' },
        ],
        female: [
          { week: 1, icon: '🔥', title: 'Ускорение', description: 'Тело откликается быстро. Всё получается!' },
          { week: 4, icon: '🎨', title: 'Геометрия', description: 'Талия уже, бёдра подтянуты. Пропорции!' },
          { week: 12, icon: '💃', title: 'Свобода', description: 'Бикини, топ, платье — всё твоё. Без сомнений.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '⚡', title: 'Импульс', description: 'Новая программа — новый тонус. В деле!' },
          { week: 4, icon: '📸', title: 'Фотогеничность', description: 'Камера — друг. Ракурс? Любой.' },
          { week: 12, icon: '🏆', title: 'Форма', description: 'Лучше чем в 30. Спорт — стиль жизни.' },
        ],
        female: [
          { week: 1, icon: '⚡', title: 'Энергия', description: 'Новая программа — новые ощущения!' },
          { week: 4, icon: '📸', title: 'Камера-друг', description: 'Фото нравятся. Углы? Любые.' },
          { week: 12, icon: '🌟', title: 'Лучшая версия', description: 'Спортивная, подтянутая, уверенная.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🎯', title: 'Тонус', description: 'Мышцы в работе, тело откликается.' },
          { week: 4, icon: '💪', title: 'Сила', description: 'Функциональная мощь. Всё по плечу.' },
          { week: 12, icon: '👑', title: 'Класс', description: 'Отлично выглядишь и чувствуешь себя.' },
        ],
        female: [
          { week: 1, icon: '🎯', title: 'Тонус', description: 'Мышцы работают, тело отвечает.' },
          { week: 4, icon: '🧘', title: 'Гармония', description: 'Сила и гибкость. Баланс!' },
          { week: 12, icon: '👑', title: 'Элегантность', description: 'Красота в любом возрасте. Это ты.' },
        ],
      },
    },
    advanced: {
      young: {
        male: [
          { week: 1, icon: '💎', title: 'Шлифовка', description: 'База идеальна, работаем над деталями.' },
          { week: 4, icon: '🎯', title: 'Симметрия', description: 'Каждая мышца на месте. Эстетика!' },
          { week: 12, icon: '🏛️', title: 'Шедевр', description: 'Функционал + внешний вид. Полный пакет.' },
        ],
        female: [
          { week: 1, icon: '💎', title: 'Детали', description: 'Доводим до совершенства каждую линию.' },
          { week: 4, icon: '🎯', title: 'Точность', description: 'Всё на месте. Пропорции идеальны.' },
          { week: 12, icon: '✨', title: 'Совершенство', description: 'Атлетичная, женственная, сильная.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '🔧', title: 'Настройка', description: 'Слабые зоны? Усиливаем. Дисбалансы? Убираем.' },
          { week: 4, icon: '⚖️', title: 'Баланс', description: 'Всё подтянуто, ничего лишнего.' },
          { week: 12, icon: '🌟', title: 'Пик', description: 'Лучше чем 10 лет назад. Проверено.' },
        ],
        female: [
          { week: 1, icon: '🔧', title: 'Точность', description: 'Работаем над деталями.' },
          { week: 4, icon: '⚖️', title: 'Гармония', description: 'Сила, гибкость, форма — всё в балансе.' },
          { week: 12, icon: '🌟', title: 'Идеал', description: 'Лучшая форма в жизни. Это ты.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🧠', title: 'Мастерство', description: 'Каждое движение — с умом и пользой.' },
          { week: 4, icon: '💪', title: 'Функционал', description: 'Сильное, подвижное, своё.' },
          { week: 12, icon: '🎖️', title: 'Легенда', description: 'Доказываешь: возраст — не про тело.' },
        ],
        female: [
          { week: 1, icon: '🧠', title: 'Осознанность', description: 'Умный фитнес. Каждое движение ценно.' },
          { week: 4, icon: '💪', title: 'Сила', description: 'Гибкость, баланс, энергия.' },
          { week: 12, icon: '👑', title: 'Вдохновение', description: 'Пример для всех: красота вне времени.' },
        ],
      },
    },
  },

  // =========================================================================
  // HEALTH_WELLNESS
  // Male: energy, productivity, "body that works", longevity
  // Female: glow, mood, sleep, "feeling amazing", anti-stress
  // =========================================================================
  health_wellness: {
    beginner: {
      young: {
        male: [
          { week: 1, icon: '😴', title: 'Сон', description: 'Засыпаешь за 5 минут, встаёшь бодрым. Магия? Нет, спорт.' },
          { week: 4, icon: '⚡', title: 'Энергия', description: 'Кофе — опционально. Сил хватает до вечера.' },
          { week: 12, icon: '🛡️', title: 'Иммунитет', description: 'Простуды обходят стороной. Тело — крепость.' },
        ],
        female: [
          { week: 1, icon: '😴', title: 'Сон', description: 'Засыпаешь легко, просыпаешься свежей. Кайф!' },
          { week: 4, icon: '⚡', title: 'Энергия', description: 'Сил на всё: работу, друзей, себя.' },
          { week: 12, icon: '✨', title: 'Сияние', description: 'Кожа лучше, глаза ярче. Здоровье видно.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '🌅', title: 'Утро', description: 'Будильник — не враг. Встаёшь готовым к бою.' },
          { week: 4, icon: '🧘', title: 'Стресс', description: 'Работа бесит меньше. Спорт = терапия.' },
          { week: 12, icon: '💚', title: 'Здоровье', description: 'Инвестиция, которая окупается каждый день.' },
        ],
        female: [
          { week: 1, icon: '🌅', title: 'Утро', description: 'Просыпаешься с улыбкой. День начинается легко.' },
          { week: 4, icon: '🧘', title: 'Антистресс', description: 'Тревога уходит. Спорт лечит лучше таблеток.' },
          { week: 12, icon: '💚', title: 'Баланс', description: 'Гормоны в норме, настроение стабильно. Гармония.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🔋', title: 'Заряд', description: 'Энергии больше, день длиннее.' },
          { week: 4, icon: '⚡', title: 'Бодрость', description: 'Весь день на ногах — легко.' },
          { week: 12, icon: '🚀', title: 'Молодость', description: 'Энергии как в 30. Возраст — число.' },
        ],
        female: [
          { week: 1, icon: '🔋', title: 'Энергия', description: 'Бодрость с утра до вечера.' },
          { week: 4, icon: '⚡', title: 'Лёгкость', description: 'Движения свободные, настроение светлое.' },
          { week: 12, icon: '🌸', title: 'Цветение', description: 'Здоровье изнутри. Это видно и чувствуется.' },
        ],
      },
    },
    intermediate: {
      young: {
        male: [
          { week: 1, icon: '🔄', title: 'Апгрейд', description: 'Организм: "Ого, мы снова в деле!" Кайф.' },
          { week: 4, icon: '🧠', title: 'Фокус', description: 'Концентрация лучше, голова яснее.' },
          { week: 12, icon: '🚀', title: 'Машина', description: 'Тело работает как часы. Без сбоев.' },
        ],
        female: [
          { week: 1, icon: '🔄', title: 'Перезагрузка', description: 'Тело вспоминает, как быть на пике.' },
          { week: 4, icon: '🧠', title: 'Ясность', description: 'Голова работает лучше, тревога ушла.' },
          { week: 12, icon: '✨', title: 'Расцвет', description: 'Энергия, красота, здоровье — всё вместе.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '⚙️', title: 'Настройка', description: 'Организм помнит пик формы. Возвращаемся!' },
          { week: 4, icon: '📊', title: 'Показатели', description: 'Всё в зелёной зоне. Врач доволен.' },
          { week: 12, icon: '🏆', title: 'Профилактика', description: 'Лучшее лекарство — движение.' },
        ],
        female: [
          { week: 1, icon: '⚙️', title: 'Перенастройка', description: 'Тело откликается, гормоны балансируются.' },
          { week: 4, icon: '📊', title: 'Норма', description: 'Анализы радуют. Здоровье в порядке.' },
          { week: 12, icon: '💚', title: 'Гармония', description: 'Тело и разум в балансе. Это и есть счастье.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🎯', title: 'Приоритет', description: 'Здоровье — главная ценность. Инвестируем.' },
          { week: 4, icon: '💪', title: 'Свобода', description: 'Делаешь что хочешь, сил хватает.' },
          { week: 12, icon: '🌟', title: 'Качество', description: 'Каждый день — в удовольствие.' },
        ],
        female: [
          { week: 1, icon: '🎯', title: 'Забота', description: 'Время для себя. Тело благодарит.' },
          { week: 4, icon: '💪', title: 'Независимость', description: 'Сил на всё. Ни в ком не нуждаешься.' },
          { week: 12, icon: '🌸', title: 'Радость', description: 'Здоровье = свобода. Каждый день — подарок.' },
        ],
      },
    },
    advanced: {
      young: {
        male: [
          { week: 1, icon: '🔬', title: 'Биохакинг', description: 'Сон, стресс, восстановление — всё под контролем.' },
          { week: 4, icon: '⚡', title: 'Пик', description: 'Энергия на максимуме. Болезни? Что это?' },
          { week: 12, icon: '🧬', title: 'Эволюция', description: 'Прокачанная версия себя. Научный подход.' },
        ],
        female: [
          { week: 1, icon: '🔬', title: 'Тонкая настройка', description: 'Гормоны, сон, питание — всё в системе.' },
          { week: 4, icon: '⚡', title: 'Максимум', description: 'Энергия бьёт через край. Болеть некогда!' },
          { week: 12, icon: '✨', title: 'Биохакинг', description: 'Красота и здоровье изнутри. Наука работает.' },
        ],
      },
      middle: {
        male: [
          { week: 1, icon: '🎛️', title: 'Контроль', description: 'Знаешь тело, слышишь сигналы.' },
          { week: 4, icon: '⚖️', title: 'Баланс', description: 'Энергия, сон, гормоны — всё в гармонии.' },
          { week: 12, icon: '🏅', title: 'Антиэйдж', description: 'Минус 10 лет биологически. Проверено.' },
        ],
        female: [
          { week: 1, icon: '🎛️', title: 'Управление', description: 'Полный контроль над здоровьем.' },
          { week: 4, icon: '⚖️', title: 'Гармония', description: 'Гормоны в балансе, кожа сияет.' },
          { week: 12, icon: '🌟', title: 'Молодость', description: 'Антиэйдж изнутри. Ты светишься.' },
        ],
      },
      senior: {
        male: [
          { week: 1, icon: '🧠', title: 'Мудрость', description: 'Опыт + знания = результат.' },
          { week: 4, icon: '🛡️', title: 'Защита', description: 'Иммунитет крепкий, энергия стабильная.' },
          { week: 12, icon: '👑', title: 'Пример', description: 'Активная жизнь в любом возрасте.' },
        ],
        female: [
          { week: 1, icon: '🧠', title: 'Опыт', description: 'Знаешь своё тело лучше всех.' },
          { week: 4, icon: '🛡️', title: 'Здоровье', description: 'Иммунитет, энергия, настроение — всё работает.' },
          { week: 12, icon: '👑', title: 'Вдохновение', description: 'Доказываешь: возраст — это мудрость, не ограничение.' },
        ],
      },
    },
  },
};

// ============================================================================
// MODIFIERS - Apply frequency and BMI adjustments
// ============================================================================

function applyFrequencyModifier(
  items: TimelineItem[],
  frequency: FrequencyLevel
): TimelineItem[] {
  if (frequency === 'medium') return items;

  return items.map((item, idx) => {
    if (idx === 0) return item; // Don't modify week 1

    let suffix = '';
    if (frequency === 'low') {
      suffix = ' Даже при 2-3 тренировках — это работает!';
    } else if (frequency === 'high') {
      suffix = ' Твоя целеустремлённость окупается!';
    }

    // Only add to last item
    if (idx === items.length - 1) {
      return {
        ...item,
        description: item.description + suffix,
      };
    }
    return item;
  });
}

function applyBmiModifier(
  items: TimelineItem[],
  goal: GoalType,
  bmiStatus: 'underweight' | 'normal' | 'overweight' | 'obese'
): TimelineItem[] {
  // Only modify for lose_weight goal
  if (goal !== 'lose_weight') return items;

  if (bmiStatus === 'obese') {
    // Emphasis on safety and each step being a win
    return items.map((item, idx) => {
      if (idx === 0) {
        return {
          ...item,
          description: 'Каждый шаг — победа. Тело уже благодарит за заботу!',
        };
      }
      return item;
    });
  }

  if (bmiStatus === 'normal' || bmiStatus === 'underweight') {
    // Emphasis on definition, not weight loss
    return items.map((item, idx) => {
      if (idx === items.length - 1) {
        return {
          ...item,
          title: 'Рельеф',
          description: 'Не про вес, а про качество. Мышцы видны, силуэт чёткий!',
        };
      }
      return item;
    });
  }

  return items;
}

/**
 * Generate personalized timeline based on all user factors
 */
function generateTimeline(
  goal: GoalType,
  sex: SexType,
  age: number = 30,
  experience: ExperienceLevel = 'beginner',
  workoutDays: number = 3,
  bmiStatus: 'underweight' | 'normal' | 'overweight' | 'obese' = 'normal'
): TimelineItem[] {
  const ageGroup = getAgeGroup(age);
  const frequency = getFrequencyLevel(workoutDays);

  // Get gender-specific timeline from new structure
  let timeline = TIMELINE_DATA[goal]?.[experience]?.[ageGroup]?.[sex];

  if (!timeline) {
    // Fallback to male beginner young if somehow not found
    timeline = TIMELINE_DATA[goal]?.beginner?.young?.male || [
      { week: 1, icon: '🚀', title: 'Старт', description: 'Начало пути!' },
      { week: 4, icon: '📈', title: 'Прогресс', description: 'Первые результаты!' },
      { week: 12, icon: '🏆', title: 'Результат', description: 'Цель достигнута!' },
    ];
  }

  // Deep clone to avoid mutating original
  timeline = timeline.map(item => ({ ...item }));

  // Apply modifiers
  timeline = applyFrequencyModifier(timeline, frequency);
  timeline = applyBmiModifier(timeline, goal, bmiStatus);

  return timeline;
}

// ============================================================================
// STRATEGY GENERATION - Training focus, tempo, description
// ============================================================================

const STRATEGY_FOCUS: Record<GoalType, Record<ExperienceLevel, string>> = {
  lose_weight: {
    beginner: 'Много движений, мало отдыха',
    intermediate: 'Темп выше, паузы короче',
    advanced: 'Максимум интенсивности, минимум простоя',
  },
  build_muscle: {
    beginner: 'Техника важнее веса',
    intermediate: 'Меньше повторений, больше нагрузки',
    advanced: 'Каждый подход — на пределе',
  },
  athletic_body: {
    beginner: 'Сила + кардио: мягкий микс',
    intermediate: 'Баланс силы и формы',
    advanced: 'Точная настройка тела',
  },
  health_wellness: {
    beginner: 'Плавно, регулярно, без надрыва',
    intermediate: 'Стабильный ритм, растущая нагрузка',
    advanced: 'Тело как часы, тренировки как привычка',
  },
};

const STRATEGY_DESCRIPTIONS: Record<
  GoalType,
  Record<ExperienceLevel, Record<SexType, string>>
> = {
  lose_weight: {
    beginner: {
      male: 'Жир уходит, мышцы остаются. Через месяц — другой человек в зеркале.',
      female: 'Жир уходит, формы остаются. Через месяц — платье на размер меньше.',
    },
    intermediate: {
      male: 'Метаболизм разгоняется. Тело начнёт сжигать жир даже во сне.',
      female: 'Метаболизм разгоняется. Тело работает на тебя 24/7.',
    },
    advanced: {
      male: 'Финишная прямая. Рельеф, который видно без напряга.',
      female: 'Финишная прямая. Тело, которое не хочется прятать.',
    },
  },
  build_muscle: {
    beginner: {
      male: 'Фундамент на годы. Через 8 недель футболки станут тесными.',
      female: 'Фундамент на годы. Через 8 недель появится рельеф, которого раньше не было.',
    },
    intermediate: {
      male: 'Объёмы растут. Скоро спросят "Ты качаешься?"',
      female: 'Формы становятся чётче. Скоро спросят "Что ты делаешь?"',
    },
    advanced: {
      male: 'Детализация. Каждая мышца на своём месте.',
      female: 'Скульптура. Каждая линия проработана.',
    },
  },
  athletic_body: {
    beginner: {
      male: 'Лёгкость в теле, сила в движениях. Лестница — не проблема.',
      female: 'Лёгкость в теле, уверенность в движениях. Лестница на 5 этаж? Легко.',
    },
    intermediate: {
      male: 'Выносливость + внешний вид. Спорт становится стилем жизни.',
      female: 'Выносливость + внешний вид. Спортивный силуэт без "перекача".',
    },
    advanced: {
      male: 'Атлет, который умеет всё. Сила, скорость, контроль.',
      female: 'Тело, которое слушается. Хочешь бежать — бежишь, хочешь тянуть — тянешь.',
    },
  },
  health_wellness: {
    beginner: {
      male: 'Спина не болит, энергии хватает. Это только начало.',
      female: 'Спина не болит, настроение стабильно. Это только начало.',
    },
    intermediate: {
      male: 'Тело откликается. Просыпаешься бодрым, засыпаешь быстро.',
      female: 'Тело благодарит. Кожа лучше, сон крепче, голова яснее.',
    },
    advanced: {
      male: 'Биохакинг без таблеток. Ты — своя лучшая инвестиция.',
      female: 'Антистресс и антиэйдж в одном. Ты — своя лучшая инвестиция.',
    },
  },
};

const TEMPO_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Размеренный',
  2: 'Уверенный',
  3: 'Интенсивный',
};

/**
 * Calculate training tempo based on workout frequency, duration, and age
 */
function calculateTempo(
  workoutDays: number,
  minutesPerSession: number,
  age: number
): { level: 1 | 2 | 3; label: string } {
  // Base tempo from frequency
  let tempo: number;
  if (workoutDays <= 2) tempo = 1;
  else if (workoutDays <= 3) tempo = 1.5;
  else if (workoutDays === 4) tempo = 2;
  else tempo = 2.5; // 5-6 days

  // Modifier from session duration
  if (minutesPerSession >= 90) tempo += 0.5;
  if (minutesPerSession <= 45) tempo -= 0.5;

  // Modifier from age
  if (age >= 50) tempo -= 0.5;

  // Clamp to 1-3
  const level = Math.max(1, Math.min(3, Math.round(tempo))) as 1 | 2 | 3;

  return { level, label: TEMPO_LABELS[level] };
}

/**
 * Generate training strategy based on user profile
 */
function generateStrategy(
  goal: GoalType,
  sex: SexType,
  experience: ExperienceLevel,
  workoutDays: number,
  minutesPerSession: number,
  age: number
): AnalysisResult['strategy'] {
  const focus = STRATEGY_FOCUS[goal]?.[experience] || 'Твой путь';
  const description =
    STRATEGY_DESCRIPTIONS[goal]?.[experience]?.[sex] ||
    'Персональная программа под твои цели.';
  const { level: tempo, label: tempoLabel } = calculateTempo(
    workoutDays,
    minutesPerSession,
    age
  );

  return { focus, tempo, tempoLabel, description };
}

// ============================================================================
// 5. MAIN FUNCTION
// ============================================================================

/**
 * Analyze user profile and return comprehensive health metrics
 *
 * @param user - User context from onboarding
 * @returns Analysis result with calories, water, BMI, investment, timeline
 * @throws Error if validation fails
 */
export function analyzeUserProfile(user: UserContext): AnalysisResult {
  // 1. Validate input
  const validation = validateUserContext(user);
  if (!validation.valid) {
    throw new Error(`Invalid user data: ${validation.errors.join(', ')}`);
  }

  // Log warnings (non-blocking)
  if (validation.warnings.length > 0) {
    console.warn('analyzeUserProfile warnings:', validation.warnings);
  }

  // 2. Calculate BMR
  const bmr = calculateBMR(user.sex, user.weight, user.height, user.age);

  // 3. Calculate TDEE
  const minutesPerSession = user.minutesPerSession || 60;
  const tdee = calculateTDEE(bmr, user.activityLevel, user.workoutDays, minutesPerSession);

  // 4. Calculate BMI (needed for adaptive calorie calculation)
  const bmi = calculateBMI(user.weight, user.height);

  // 5. Calculate target calories
  const calorieResult = calculateTargetCalories(tdee, user.goal, bmi.value);

  // 6. Generate calorie labels
  let calorieLabel: string;
  let calorieDescription: string;

  switch (calorieResult.type) {
    case 'deficit':
      calorieLabel = 'Твой дефицит';
      calorieDescription = bmi.status === 'obese' || bmi.status === 'overweight'
        ? 'Безопасный темп: 0.5-1 кг в неделю'
        : 'Мягкий дефицит для сохранения мышц';
      break;
    case 'surplus':
      calorieLabel = 'Ваш профицит';
      calorieDescription = 'Энергия для строительства мышц';
      break;
    default:
      calorieLabel = 'Твоя норма';
      calorieDescription = 'Баланс для поддержания формы';
  }

  // 7. Calculate macros
  const macros = calculateMacros(
    calorieResult.value,
    user.weight,
    user.height,
    user.goal,
    bmi.value
  );

  // 8. Calculate water (now includes minutesPerSession)
  const water = calculateWater(
    user.weight,
    user.activityLevel,
    user.goal,
    user.workoutDays,
    minutesPerSession
  );

  // 9. Calculate investment
  const investment = calculateInvestment(user.workoutDays, minutesPerSession);

  // 10. Generate strategy
  const strategy = generateStrategy(
    user.goal,
    user.sex,
    user.experience || 'beginner',
    user.workoutDays,
    minutesPerSession,
    user.age
  );

  // 11. Generate timeline (now uses all user factors)
  const timeline = generateTimeline(
    user.goal,
    user.sex,
    user.age,
    user.experience || 'beginner',
    user.workoutDays,
    bmi.status
  );

  return {
    calories: {
      value: calorieResult.value,
      tdee,
      type: calorieResult.type,
      label: calorieLabel,
      description: calorieDescription,
      percentChange: calorieResult.percentChange,
    },
    macros,
    water,
    bmi,
    investment,
    strategy,
    timeline,
  };
}

// ============================================================================
// 6. HELPER: Build UserContext from onboarding draft
// ============================================================================

/**
 * Build UserContext from raw onboarding draft
 * Handles missing/partial data gracefully
 */
export function buildUserContextFromDraft(draft: Record<string, any>): UserContext | null {
  try {
    const sex = draft.ageSex?.sex;
    const age = draft.ageSex?.age;
    const weight = draft.body?.weight;
    const height = draft.body?.height;
    const goal = draft.motivation?.goal;
    const activityLevel = draft.lifestyle?.workStyle;
    const workoutDays = draft.schedule?.daysPerWeek;
    const minutesPerSession = draft.schedule?.minutesPerSession;
    const experience = draft.experience;

    // Check required fields
    if (!sex || !age || !weight || !height || !goal || !activityLevel || !workoutDays) {
      console.warn('buildUserContextFromDraft: Missing required fields', {
        sex: !!sex,
        age: !!age,
        weight: !!weight,
        height: !!height,
        goal: !!goal,
        activityLevel: !!activityLevel,
        workoutDays: !!workoutDays,
      });
      return null;
    }

    return {
      sex,
      age,
      weight,
      height,
      goal,
      activityLevel,
      workoutDays,
      minutesPerSession,
      experience,
    };
  } catch (e) {
    console.error('buildUserContextFromDraft error:', e);
    return null;
  }
}

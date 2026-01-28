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
// TIMELINE DATA - All 36 base variants + modifiers
// ============================================================================

const TIMELINE_DATA: Record<
  GoalType,
  Record<ExperienceLevel, Record<AgeGroup, TimelineItem[]>>
> = {
  // =========================================================================
  // LOSE_WEIGHT
  // =========================================================================
  lose_weight: {
    beginner: {
      young: [
        { week: 1, icon: '💧', title: 'Детокс', description: 'Лишняя вода уходит, лицо свежее, кольца не жмут. Это только начало!' },
        { week: 4, icon: '👖', title: 'Джинсы с полки', description: 'Те самые, которые "когда-нибудь". Когда-нибудь = сейчас.' },
        { week: 12, icon: '🔥', title: 'Зеркало в шоке', description: 'Ловишь взгляды, одежда — любая. Кто это там такой?' },
      ],
      middle: [
        { week: 1, icon: '⚡', title: 'Перезагрузка', description: 'Утром бодрость без кофе, вечером силы остались. Магия? Нет, ты!' },
        { week: 4, icon: '👔', title: 'Комплименты', description: '"Отлично выглядишь!" — и это искренне. Одежда сидит как влитая.' },
        { week: 12, icon: '🚀', title: 'Вторая молодость', description: 'Энергии больше чем в 25. Серьёзно.' },
      ],
      senior: [
        { week: 1, icon: '🔋', title: 'Энергия', description: 'Подъём по лестнице? Легко. День на ногах? Без проблем.' },
        { week: 4, icon: '✨', title: 'Лёгкость', description: 'Тело слушается, движения свободнее. Это кайф!' },
        { week: 12, icon: '👑', title: 'Новый уровень', description: 'Молодые не угонятся. И это факт, а не комплимент.' },
      ],
    },
    intermediate: {
      young: [
        { week: 1, icon: '🚀', title: 'Турбо-режим', description: 'Метаболизм разгоняется, тело вспоминает как это — быть лёгким.' },
        { week: 4, icon: '📐', title: 'Рельеф', description: 'Талия тоньше, рельеф проступает. Пресс, ты там?' },
        { week: 12, icon: '💎', title: 'Огонь', description: 'Пляж? Без стресса. Любая одежда — твоя. Уверенность ×100.' },
      ],
      middle: [
        { week: 1, icon: '🔄', title: 'Новый старт', description: 'Тело помнит, как быть в форме. Напоминаем ему!' },
        { week: 4, icon: '📸', title: 'Фотогеничность', description: 'Камера больше не враг. Ракурс? Любой!' },
        { week: 12, icon: '🏆', title: 'Лучшая версия', description: 'Выглядишь свежее, двигаешься легче, чувствуешь себя на миллион.' },
      ],
      senior: [
        { week: 1, icon: '💪', title: 'Бодрость', description: 'Энергия с утра до вечера. Откуда? От тренировок!' },
        { week: 4, icon: '🎯', title: 'Результат', description: 'Ремень на новой дырочке. Мелочь? Нет, победа!' },
        { week: 12, icon: '⭐', title: 'Вдохновение', description: 'На тебя равняются. "Как ты это делаешь?" — частый вопрос.' },
      ],
    },
    advanced: {
      young: [
        { week: 1, icon: '⚡', title: 'Сушка ON', description: 'Дефицит работает, мышцы остаются. Жир? Пока-пока!' },
        { week: 4, icon: '🎨', title: 'Детализация', description: 'Вены видны, мышцы читаются. Это уже искусство.' },
        { week: 12, icon: '💎', title: 'Скульптура', description: 'Каждая мышца на месте. Инстаграм? Он к этому не готов.' },
      ],
      middle: [
        { week: 1, icon: '🎯', title: 'Снайпер', description: 'Точечная работа: убираем только лишнее, сохраняем нужное.' },
        { week: 4, icon: '📉', title: 'Прогресс', description: 'Зеркало не врёт. Ты и правда меняешься.' },
        { week: 12, icon: '🏅', title: 'Элита', description: 'Форма лучше чем у большинства 25-летних. Опыт решает!' },
      ],
      senior: [
        { week: 1, icon: '🧠', title: 'Умный подход', description: 'Никакой спешки, только результат. Ты знаешь своё тело.' },
        { week: 4, icon: '⚖️', title: 'Баланс', description: 'Сила не падает, лишнее уходит. Идеально!' },
        { week: 12, icon: '🎖️', title: 'Мастер', description: 'Доказал: возраст — просто цифра. Респект!' },
      ],
    },
  },

  // =========================================================================
  // BUILD_MUSCLE
  // =========================================================================
  build_muscle: {
    beginner: {
      young: [
        { week: 1, icon: '🧠', title: 'Пробуждение', description: 'Мышцы: "О, нас тут тренируют!" Крепатура — знак роста!' },
        { week: 4, icon: '📈', title: 'Рекорды', description: 'Веса растут каждую неделю. Новичок? Уже нет!' },
        { week: 12, icon: '🦸', title: 'Трансформация', description: 'Футболки жмут в плечах. Проблема? Лучшая в жизни!' },
      ],
      middle: [
        { week: 1, icon: '🔌', title: 'Запуск', description: 'Мышцы вспоминают, как это — работать. Приятная усталость!' },
        { week: 4, icon: '💪', title: 'Прогресс', description: 'Сила растёт, техника всё лучше. Ты на пути!' },
        { week: 12, icon: '🔥', title: 'Результат', description: 'Ловишь взгляды. "Ты качаешься?" — новый FAQ в твоей жизни.' },
      ],
      senior: [
        { week: 1, icon: '🌱', title: 'Фундамент', description: 'Техника важнее весов. Делаем правильно с первого дня!' },
        { week: 4, icon: '🔧', title: 'Сила', description: 'Хват крепче, мышцы твёрже. Чувствуется!' },
        { week: 12, icon: '🛡️', title: 'Мощь', description: 'Сумки не тяжёлые, лестницы не страшны. Функциональная сила!' },
      ],
    },
    intermediate: {
      young: [
        { week: 1, icon: '🔄', title: 'Встряска', description: 'Новая программа = новый стресс для мышц. Растём!' },
        { week: 4, icon: '📊', title: 'Плато? Нет!', description: 'Веса идут вверх, объёмы тоже. Плато осталось позади.' },
        { week: 12, icon: '🦍', title: 'Зверь', description: 'Сила ↑, объём ↑, уверенность ↑↑↑. Качалка — твой второй дом.' },
      ],
      middle: [
        { week: 1, icon: '⚙️', title: 'Перенастройка', description: 'Новые углы, новые стимулы. Мышцы отвечают!' },
        { week: 4, icon: '📈', title: 'Рост', description: 'Стабильный прогресс, техника на автомате.' },
        { week: 12, icon: '🏆', title: 'Топ-форма', description: 'Выглядишь сильнее чем в 30. Это не шутка!' },
      ],
      senior: [
        { week: 1, icon: '🎯', title: 'Качество', description: 'Каждое повторение — осознанно. Качество > количество.' },
        { week: 4, icon: '💎', title: 'Плотность', description: 'Мышцы твёрже, силуэт чётче. Видно!' },
        { week: 12, icon: '🎖️', title: 'Сила', description: 'Сильнее чем большинство молодых. И это правда!' },
      ],
    },
    advanced: {
      young: [
        { week: 1, icon: '💥', title: 'Шок', description: 'Новая периодизация, мышцы в недоумении. Идеально!' },
        { week: 4, icon: '🔬', title: 'Прецизионность', description: 'Каждый грамм — чистая масса. Никакой воды.' },
        { week: 12, icon: '👑', title: 'Элита', description: 'Уважение в зале. Новички просят совет. Ты — эталон!' },
      ],
      middle: [
        { week: 1, icon: '🧪', title: 'Эксперимент', description: 'Новые техники, углы, темп. Тело адаптируется!' },
        { week: 4, icon: '📐', title: 'Скульптура', description: 'Пропорции улучшаются, детали проявляются.' },
        { week: 12, icon: '🏛️', title: 'Монумент', description: 'Генетический максимум? Близко как никогда!' },
      ],
      senior: [
        { week: 1, icon: '🧠', title: 'Мудрость', description: 'Тело знаешь лучше всех. Используем это!' },
        { week: 4, icon: '⚖️', title: 'Стабильность', description: 'Сила держится, объём растёт. Это победа!' },
        { week: 12, icon: '🎖️', title: 'Легенда', description: 'В твоём возрасте так выглядеть? Аплодисменты!' },
      ],
    },
  },

  // =========================================================================
  // ATHLETIC_BODY
  // =========================================================================
  athletic_body: {
    beginner: {
      young: [
        { week: 1, icon: '🎬', title: 'Включение', description: 'Тело просыпается: "О, мы теперь спортсмены?" Да!' },
        { week: 4, icon: '📐', title: 'Контуры', description: 'Осанка ровнее, силуэт чётче. Уже заметно!' },
        { week: 12, icon: '⭐', title: 'Вау-эффект', description: 'Подтянуто, уверенно, стильно. Зеркало — друг!' },
      ],
      middle: [
        { week: 1, icon: '🔋', title: 'Батарейка', description: 'Энергии больше, сон лучше. Тело говорит "спасибо"!' },
        { week: 4, icon: '👗', title: 'Посадка', description: 'Любая одежда сидит лучше. Плечи расправлены!' },
        { week: 12, icon: '🌟', title: 'Обновление', description: 'Выглядишь свежее, двигаешься легче. Минус годы, плюс энергия!' },
      ],
      senior: [
        { week: 1, icon: '🌿', title: 'Движение', description: 'Тело благодарит за активность. Лёгкость!' },
        { week: 4, icon: '🚶', title: 'Уверенность', description: 'Походка твёрже, спина прямее. Чувствуешь силу!' },
        { week: 12, icon: '☀️', title: 'Энергия', description: 'Бодрость весь день. Кто сказал "возраст"?' },
      ],
    },
    intermediate: {
      young: [
        { week: 1, icon: '🔥', title: 'Ускорение', description: 'Тело откликается быстро. Помнит, умеет, делает!' },
        { week: 4, icon: '🎨', title: 'Геометрия', description: 'Талия уже, плечи шире, всё на месте. Пропорции!' },
        { week: 12, icon: '💃', title: 'Уверенность', description: 'Любая одежда — твоя. Пляж? Без стресса!' },
      ],
      middle: [
        { week: 1, icon: '⚡', title: 'Импульс', description: 'Новая программа — новый тонус. Тело в деле!' },
        { week: 4, icon: '📸', title: 'Камера-друг', description: 'Углы? Любые! Фотографии нравятся.' },
        { week: 12, icon: '🏆', title: 'Лучшая версия', description: 'Подтянуто, пропорционально, здорово. Цель!' },
      ],
      senior: [
        { week: 1, icon: '🎯', title: 'Тонус', description: 'Мышцы в работе, тело откликается. Кайф!' },
        { week: 4, icon: '🧘', title: 'Гармония', description: 'Движения плавные, сила есть. Баланс!' },
        { week: 12, icon: '👑', title: 'Класс', description: 'Выглядишь отлично в любом возрасте. Это стиль!' },
      ],
    },
    advanced: {
      young: [
        { week: 1, icon: '💎', title: 'Шлифовка', description: 'База есть, теперь детали. Доводим до идеала!' },
        { week: 4, icon: '🎯', title: 'Симметрия', description: 'Каждая мышца знает своё место. Красота!' },
        { week: 12, icon: '🏛️', title: 'Искусство', description: 'Тело — произведение. Инстаграм рухнет от лайков!' },
      ],
      middle: [
        { week: 1, icon: '🔧', title: 'Точность', description: 'Слабые зоны? Усиливаем. Пропорции? Идеальны!' },
        { week: 4, icon: '⚖️', title: 'Гармония', description: 'Всё подтянуто, ничего лишнего. Баланс!' },
        { week: 12, icon: '🌟', title: 'Форма года', description: 'Лучше чем 10 лет назад. Это факт!' },
      ],
      senior: [
        { week: 1, icon: '🧠', title: 'Осознанность', description: 'Каждое движение с пользой. Умный фитнес!' },
        { week: 4, icon: '💪', title: 'Функционал', description: 'Сильное, подвижное, своё. Это и есть цель!' },
        { week: 12, icon: '🎖️', title: 'Пример', description: 'Доказываешь всем: возраст — не про тело!' },
      ],
    },
  },

  // =========================================================================
  // HEALTH_WELLNESS
  // =========================================================================
  health_wellness: {
    beginner: {
      young: [
        { week: 1, icon: '😴', title: 'Сон 2.0', description: 'Засыпаешь за 5 минут, просыпаешься как в рекламе. Чудо? Спорт!' },
        { week: 4, icon: '⚡', title: 'Энерджайзер', description: 'Кофе? Выкинь. Энергия своя, бесплатная, бесконечная!' },
        { week: 12, icon: '🦸', title: 'Неуязвимость', description: 'Простуды обходят, стресс не цепляет. Суперсила!' },
      ],
      middle: [
        { week: 1, icon: '🌅', title: 'Утро', description: 'Будильник — не враг. Встаёшь легко, день начинается круто!' },
        { week: 4, icon: '🧘', title: 'Антистресс', description: 'Работа бесит меньше. Спорт = терапия, только дешевле.' },
        { week: 12, icon: '💚', title: 'Инвестиция', description: 'Здоровье — новая валюта. Ты богат!' },
      ],
      senior: [
        { week: 1, icon: '🔋', title: 'Заряд', description: 'Энергии больше, день длиннее. Движение — сила!' },
        { week: 4, icon: '⚡', title: 'Бодрость', description: 'Весь день на ногах? Легко. Это новая норма!' },
        { week: 12, icon: '🚀', title: 'Полёт', description: 'Энергии как в 30. Кто сказал "возраст"?' },
      ],
    },
    intermediate: {
      young: [
        { week: 1, icon: '🔄', title: 'Апгрейд', description: 'Организм: "О, мы снова это делаем? Класс!"' },
        { week: 4, icon: '🧠', title: 'Фокус', description: 'Концентрация ×2, настроение стабильно. Мозг благодарит!' },
        { week: 12, icon: '🚀', title: 'Машина', description: 'Тело работает как швейцарские часы. Тик-так, идеально!' },
      ],
      middle: [
        { week: 1, icon: '⚙️', title: 'Настройка', description: 'Организм помнит, как быть на пике. Вспоминаем!' },
        { week: 4, icon: '📊', title: 'Норма', description: 'Все показатели в зелёной зоне. Тело в порядке!' },
        { week: 12, icon: '🏆', title: 'Профилактика', description: 'Лучшее лекарство — движение. Ты это знаешь!' },
      ],
      senior: [
        { week: 1, icon: '🎯', title: 'Приоритет', description: 'Здоровье важнее всего. И ты на верном пути!' },
        { week: 4, icon: '💪', title: 'Свобода', description: 'Делаешь что хочешь, когда хочешь. Сила есть!' },
        { week: 12, icon: '🌟', title: 'Качество', description: 'Каждый день в удовольствие. Это и есть жизнь!' },
      ],
    },
    advanced: {
      young: [
        { week: 1, icon: '🔬', title: 'Биохакинг', description: 'Сон, восстановление, стресс — всё под контролем. Наука!' },
        { week: 4, icon: '⚡', title: 'Пик', description: 'Энергия на максимуме, болезни — что это?' },
        { week: 12, icon: '🧬', title: 'Эволюция', description: 'Организм работает идеально. Ты — прокачанная версия себя!' },
      ],
      middle: [
        { week: 1, icon: '🎛️', title: 'Контроль', description: 'Знаешь своё тело, слышишь сигналы. Полный контроль!' },
        { week: 4, icon: '⚖️', title: 'Баланс', description: 'Гормоны, энергия, сон — всё в гармонии.' },
        { week: 12, icon: '🏅', title: 'Чемпион', description: 'Биологический возраст? Минус 10 лет. Проверено!' },
      ],
      senior: [
        { week: 1, icon: '🧠', title: 'Опыт', description: 'Тело слушаешь, сигналы понимаешь. Мудрость!' },
        { week: 4, icon: '🛡️', title: 'Иммунитет', description: 'Простуды? Мимо. Энергия? Стабильно.' },
        { week: 12, icon: '👑', title: 'Вдохновение', description: 'Доказываешь: жить активно можно в любом возрасте!' },
      ],
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

  // Get base timeline
  let timeline = TIMELINE_DATA[goal]?.[experience]?.[ageGroup];

  if (!timeline) {
    // Fallback to beginner young if somehow not found
    timeline = TIMELINE_DATA[goal]?.beginner?.young || [
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
    beginner: 'Минус лишнее',
    intermediate: 'Тело проявляется',
    advanced: 'Финальная огранка',
  },
  build_muscle: {
    beginner: 'Фундамент силы',
    intermediate: 'Рост и мощь',
    advanced: 'Скульптура',
  },
  athletic_body: {
    beginner: 'Тело в тонусе',
    intermediate: 'Спортивный силуэт',
    advanced: 'Атлет',
  },
  health_wellness: {
    beginner: 'Бодрость и сила',
    intermediate: 'Энергия ×2',
    advanced: 'Тело-машина',
  },
};

const STRATEGY_DESCRIPTIONS: Record<
  GoalType,
  Record<ExperienceLevel, Record<SexType, string>>
> = {
  lose_weight: {
    beginner: {
      male: 'Убираем лишнее, оставляем мужское. Рельеф уже близко!',
      female: 'Убираем лишнее, сохраняем формы. Лёгкость уже близко!',
    },
    intermediate: {
      male: 'Тело проявляется. Скоро зеркало станет другом.',
      female: 'Силуэт проявляется. Скоро любая одежда — твоя.',
    },
    advanced: {
      male: 'Последние штрихи. Ты знаешь, как это работает!',
      female: 'Последние штрихи. Ты знаешь своё тело!',
    },
  },
  build_muscle: {
    beginner: {
      male: 'Строим тело, которое уважают. Сила видна с первого взгляда.',
      female: 'Строим формы, которые хочется показать. Сила + женственность.',
    },
    intermediate: {
      male: 'Добавляем объём и мощь. Футболки будут жать!',
      female: 'Добавляем форму и упругость. Тело скажет "вау"!',
    },
    advanced: {
      male: 'Доводим до совершенства. Каждый грамм на месте.',
      female: 'Доводим до совершенства. Точёные линии.',
    },
  },
  athletic_body: {
    beginner: {
      male: 'Спортивное тело без лишнего. Двигайся легко, выгляди мощно.',
      female: 'Спортивное тело без лишнего. Двигайся легко, выгляди круто.',
    },
    intermediate: {
      male: 'Баланс силы и формы. Атлет в зеркале!',
      female: 'Баланс формы и грации. Спортивная красота!',
    },
    advanced: {
      male: 'Функционал + эстетика. Лучшая версия себя.',
      female: 'Функционал + эстетика. Лучшая версия себя.',
    },
  },
  health_wellness: {
    beginner: {
      male: 'Тело, которое служит. Сила для жизни, не для понтов.',
      female: 'Тело, которое радует. Энергия на всё, осанка королевы.',
    },
    intermediate: {
      male: 'Выносливость + энергия. Готов к любому дню!',
      female: 'Выносливость + лёгкость. Готова к любому дню!',
    },
    advanced: {
      male: 'Машина, которая не ломается. Инвестиция в себя.',
      female: 'Тело мечты для жизни. Сила без компромиссов.',
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
        ? 'Безопасный темп: 0.5-1 кг в неделю.'
        : 'Мягкий дефицит для сохранения мышц.';
      break;
    case 'surplus':
      calorieLabel = 'Твой профицит';
      calorieDescription = 'Энергия для строительства мышц.';
      break;
    default:
      calorieLabel = 'Твоя норма';
      calorieDescription = 'Баланс для поддержания формы.';
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

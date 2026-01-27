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
    hoursPerWeek: number;
    minutesPerDay: number;
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

    return {
      value: Math.max(targetCalories, minimumCalories),
      type: 'deficit',
      percentChange: -deficitPercent,
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
  const percent = ((minutesPerWeek / totalMinutesInWeek) * 100).toFixed(1) + '%';
  const hoursPerWeek = Math.round((minutesPerWeek / 60) * 10) / 10;
  const minutesPerDay = Math.round(minutesPerWeek / 7);

  return { percent, hoursPerWeek, minutesPerDay };
}

/**
 * Generate physiological timeline based on goal and sex
 */
function generateTimeline(goal: GoalType, sex: SexType): TimelineItem[] {
  if (goal === 'lose_weight') {
    return [
      {
        week: 1,
        icon: '💧',
        title: 'Слив воды',
        description: sex === 'female'
          ? 'Уходят отеки (−1-2 кг), улучшается сон. Возможны колебания из-за цикла.'
          : 'Уходят отеки (−1-3 кг), улучшается качество сна.',
      },
      {
        week: 4,
        icon: '👖',
        title: 'Метаболизм',
        description: 'Одежда сидит свободнее, энергии больше к вечеру.',
      },
      {
        week: 12,
        icon: '🔥',
        title: 'Трансформация',
        description: 'Видимое уменьшение объёмов, появляется рельеф.',
      },
    ];
  }

  if (goal === 'build_muscle') {
    return [
      {
        week: 1,
        icon: '⚡️',
        title: 'Нейроадаптация',
        description: 'Мышцы "просыпаются", уходит скованность, растёт сила.',
      },
      {
        week: 4,
        icon: '💪',
        title: 'Гипертрофия',
        description: sex === 'female'
          ? 'Мышцы плотнее на ощупь, тело становится упругим.'
          : 'Мышцы плотнее, футболки теснее в плечах и груди.',
      },
      {
        week: 12,
        icon: '🦍',
        title: 'Видимый рост',
        description: 'Рост рабочих весов на 20-40%, заметный объём мышц.',
      },
    ];
  }

  if (goal === 'athletic_body') {
    return [
      {
        week: 1,
        icon: '✨',
        title: 'Тонус',
        description: 'Тело становится более "собранным", уходит дряблость.',
      },
      {
        week: 4,
        icon: '📐',
        title: 'Пропорции',
        description: sex === 'female'
          ? 'Подтягиваются проблемные зоны, улучшается осанка.'
          : 'Плечи шире, талия уже, осанка увереннее.',
      },
      {
        week: 12,
        icon: '🎯',
        title: 'Атлетичность',
        description: 'Спортивный силуэт, тело работает как единый механизм.',
      },
    ];
  }

  // health_wellness
  return [
    {
      week: 1,
      icon: '🔋',
      title: 'Энергия',
      description: 'Больше сил к вечеру, легче просыпаться утром.',
    },
    {
      week: 4,
      icon: '🧘',
      title: 'Осанка',
      description: 'Спина держится ровно, уходят зажимы и боли.',
    },
    {
      week: 12,
      icon: '🚀',
      title: 'Новый уровень',
      description: 'Спорт стал привычкой, тело работает как часы.',
    },
  ];
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

  // 10. Generate timeline
  const timeline = generateTimeline(user.goal, user.sex);

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

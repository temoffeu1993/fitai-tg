// workoutDayGenerator.ts
// ============================================================================
// DETERMINISTIC WORKOUT DAY GENERATOR
// 
// Integrates:
// - normalizedSchemes.ts (scheme selection)
// - dayPatternMap.ts (day structure)
// - exerciseSelector.ts (exercise selection)
// - exerciseLibrary.ts (200 exercises)
// 
// NO AI INVOLVED - Pure code logic
// ============================================================================

import type { Exercise, JointFlag, Pattern } from "./exerciseLibrary.js";
import type { NormalizedWorkoutScheme, Goal, ExperienceLevel, Equipment, TimeBucket } from "./normalizedSchemes.js";
import { NORMALIZED_SCHEMES, getCandidateSchemes, rankSchemes } from "./normalizedSchemes.js";
import { buildDaySlots, type Slot } from "./dayPatternMap.js";
import {
  selectExercisesForDay,
  type SelectedExercise,
  type UserConstraints,
  type CheckinContext,
  type Intent,
  type SlotRole,
} from "./exerciseSelector.js";
import {
  calculateSetsForSlot,
  getRepsRange,
  getRestTime,
  validateWorkoutVolume,
} from "./volumeEngine.js";
import {
  getWeekPlan,
  getTodayIntensity,
  type Mesocycle,
  type DUPIntensity,
} from "./mesocycleEngine.js";

// ============================================================================
// TYPES
// ============================================================================

export type UserProfile = {
  experience: ExperienceLevel;
  goal: Goal;
  daysPerWeek: number;
  timeBucket: TimeBucket;
  equipment: Equipment;
  sex?: "male" | "female";
  constraints?: string[]; // constraint tags from user
};

export type CheckInData = {
  energy: "low" | "medium" | "high";
  sleep: "poor" | "ok" | "good";
  stress: "high" | "medium" | "low";
  pain?: string[]; // body parts with pain
  soreness?: string[]; // muscles that are sore
};

export type WorkoutHistory = {
  recentExerciseIds: string[]; // Last 10-20 exercise IDs
  lastWorkoutDate?: string;
};

export type GeneratedWorkoutDay = {
  schemeId: string;
  schemeName: string;
  dayIndex: number;
  dayLabel: string;
  dayFocus: string;
  intent: Intent;
  warmup?: string[];
  exercises: Array<{
    exercise: Exercise;
    sets: number;
    repsRange: [number, number];
    restSec: number;
    notes: string;
    role: SlotRole; // КРИТИЧНО: добавлен для type safety
  }>;
  cooldown?: string[];
  totalExercises: number;
  totalSets: number;
  estimatedDuration: number;
  adaptationNotes?: string[];
  warnings?: string[];
};

// ============================================================================
// HELPER: Map pain/injuries to JointFlag avoidances
// ============================================================================

// ИСПРАВЛЕНО: buildAvoidFlags теперь работает ТОЛЬКО с JointFlag из checkin.pain
// ConstraintTag (например avoid_overhead_press) НЕ должны попадать сюда
function buildAvoidFlags(checkin?: CheckInData): JointFlag[] {
  const avoid: JointFlag[] = [];

  // Map from pain body parts to jointFlags
  const painMap: Record<string, JointFlag> = {
    knee: "knee_sensitive",
    knees: "knee_sensitive",
    колено: "knee_sensitive",
    колени: "knee_sensitive",
    
    back: "low_back_sensitive",
    "lower back": "low_back_sensitive",
    спина: "low_back_sensitive",
    поясница: "low_back_sensitive",
    
    shoulder: "shoulder_sensitive",
    shoulders: "shoulder_sensitive",
    плечо: "shoulder_sensitive",
    плечи: "shoulder_sensitive",
    
    wrist: "wrist_sensitive",
    wrists: "wrist_sensitive",
    запястье: "wrist_sensitive",
    кисть: "wrist_sensitive",
    
    hip: "hip_sensitive",
    hips: "hip_sensitive",
    таз: "hip_sensitive",
    бедро: "hip_sensitive",
    
    elbow: "elbow_sensitive",
    elbows: "elbow_sensitive",
    локоть: "elbow_sensitive",
    локти: "elbow_sensitive",
  };

  // Add from checkin pain
  if (checkin?.pain) {
    for (const painArea of checkin.pain) {
      const normalized = painArea.toLowerCase().trim();
      const flag = painMap[normalized];
      if (flag && !avoid.includes(flag)) {
        avoid.push(flag);
      }
    }
  }

  return avoid;
}

// ============================================================================
// HELPER: Map checkin to intent
// ============================================================================

function calculateIntent(checkin?: CheckInData): Intent {
  if (!checkin) return "normal";

  let score = 0;

  // Energy
  if (checkin.energy === "low") score -= 2;
  if (checkin.energy === "high") score += 2;

  // Sleep
  if (checkin.sleep === "poor") score -= 2;
  if (checkin.sleep === "good") score += 1;

  // Stress
  if (checkin.stress === "high") score -= 1;
  if (checkin.stress === "low") score += 1;

  // Pain
  if (checkin.pain && checkin.pain.length > 0) score -= 2;

  // Soreness
  if (checkin.soreness && checkin.soreness.length > 2) score -= 1;

  if (score <= -3) return "light";
  if (score >= 2) return "hard";
  return "normal";
}

// ============================================================================
// HELPER: Calculate sets/reps using Volume Engine
// ============================================================================

function calculateSetsReps(args: {
  role: "main" | "secondary" | "accessory" | "pump" | "conditioning";
  experience: ExperienceLevel;
  goal: Goal;
  daysPerWeek: number;
  intent: Intent;
}): {
  sets: number;
  repsRange: [number, number];
  restSec: number;
} {
  const { role, experience, goal, daysPerWeek, intent } = args;

  // Use Volume Engine for professional calculation
  const sets = calculateSetsForSlot({
    role,
    experience,
    goal,
    daysPerWeek,
    intent,
  });

  const repsRange = getRepsRange({ role, goal, intent });
  const restSec = getRestTime({ role, goal, experience, intent });

  return { sets, repsRange, restSec };
}

// ============================================================================
// MAIN GENERATOR: Generate a workout day
// ============================================================================

export function generateWorkoutDay(args: {
  scheme: NormalizedWorkoutScheme;
  dayIndex: number; // 0-based (0 = first day of scheme)
  userProfile: UserProfile;
  checkin?: CheckInData;
  history?: WorkoutHistory;
  dupIntensity?: DUPIntensity; // НОВОЕ: DUP интенсивность
  weekPlanData?: any; // НОВОЕ: план недели
}): GeneratedWorkoutDay {
  const { scheme, dayIndex, userProfile, checkin, history, dupIntensity, weekPlanData } = args;

  // Get the day blueprint from scheme
  const dayBlueprint = scheme.days[dayIndex];
  if (!dayBlueprint) {
    throw new Error(`Day index ${dayIndex} not found in scheme ${scheme.id}`);
  }

  // Calculate intent from checkin
  let intent = calculateIntent(checkin);
  
  // НОВОЕ: Override intent if deload week
  if (weekPlanData?.isDeloadWeek) {
    intent = "light";
  }

  // КРИТИЧНО: map equipment правильно (dumbbells → dumbbell + bench, etc.)
  // ВАЖНО: строки должны совпадать с Equipment в exerciseLibrary.ts
  function mapEquipmentToAvailable(equipment: string): any[] {
    if (equipment === "gym_full") return ["gym_full"];
    if (equipment === "dumbbells") return ["dumbbell", "bench", "bodyweight"];
    if (equipment === "bodyweight") return ["bodyweight", "pullup_bar", "bands"]; // ИСПРАВЛЕНО: bands, не resistance_band
    if (equipment === "limited") return ["dumbbell", "kettlebell", "bands", "bodyweight", "bench"]; // ИСПРАВЛЕНО: bands
    // Fallback: если не распознали, считаем gym_full
    return ["gym_full"];
  }

  // Build constraints
  const constraints: UserConstraints = {
    experience: userProfile.experience,
    equipmentAvailable: mapEquipmentToAvailable(userProfile.equipment),
    avoid: buildAvoidFlags(checkin), // ИСПРАВЛЕНО: убрал userProfile.constraints (это не JointFlag[])
  };

  // Build checkin context
  const ctx: CheckinContext = {
    intent,
    timeBucket: userProfile.timeBucket,
    goal: userProfile.goal as any, // Type mapping handled at runtime
    preferCircuits: userProfile.goal === "lose_weight",
    avoidHighSetupWhenTired: intent === "light",
    historyAvoidance: history?.recentExerciseIds
      ? {
          recentExerciseIds: history.recentExerciseIds,
          mode: "soft",
        }
      : undefined,
  };

  // -------------------------------------------------------------------------
  // STEP 1: Build day slots
  // -------------------------------------------------------------------------
  
  const slots = buildDaySlots({
    templateRulesId: dayBlueprint.templateRulesId ?? dayBlueprint.label,
    timeBucket: userProfile.timeBucket,
    intent,
  });

  // -------------------------------------------------------------------------
  // STEP 2: Select exercises for slots
  // -------------------------------------------------------------------------
  
  const selectedExercises = selectExercisesForDay({
    slots,
    ctx,
    constraints,
    excludeIds: history?.recentExerciseIds,
  });

  // -------------------------------------------------------------------------
  // STEP 3: Assign sets/reps/rest to each exercise using Volume Engine
  // -------------------------------------------------------------------------
  
  const exercises = selectedExercises.map(({ ex, pattern, role }, idx) => {
    // КРИТИЧНО: используем role из селектора (он уже правильно рассчитан с downgrade)

    let { sets, repsRange, restSec } = calculateSetsReps({
      role,
      experience: userProfile.experience,
      goal: userProfile.goal,
      daysPerWeek: userProfile.daysPerWeek,
      intent,
    });

    // НОВОЕ: Применить volumeMultiplier из мезоцикла
    if (weekPlanData?.volumeMultiplier) {
      sets = Math.max(1, Math.round(sets * weekPlanData.volumeMultiplier));
    }

    // НОВОЕ: Применить DUP reps ranges ТОЛЬКО для main/secondary И ТОЛЬКО для strength/athletic_body
    // Для build_muscle НЕ ТРОГАЕМ диапазоны - остаются гипертрофийные 6-10, 8-12
    if (dupIntensity && (role === "main" || role === "secondary")) {
      // DUP применяется только для силовых целей
      if (userProfile.goal === "strength" || userProfile.goal === "athletic_body") {
        const dupReps: Record<DUPIntensity, [number, number]> = {
          heavy: [4, 6],     // Силовой день
          medium: [6, 10],   // Средний день  
          light: [10, 15],   // Лёгкий день (пампинг)
        };
        repsRange = dupReps[dupIntensity];
      }
      // Для build_muscle, lose_weight, health_wellness - DUP НЕ применяется
    }

    return {
      exercise: ex, // КРИТИЧНО: ex уже Exercise (из selected.ex)
      sets,
      repsRange,
      restSec,
      notes: Array.isArray(ex.cues) ? ex.cues.join(". ") : (ex.cues || ""),
      role, // Role из селектора (правильно downgraded для doubles)
    };
  });

  // -------------------------------------------------------------------------
  // STEP 4: Calculate totals and validate volume using Volume Engine
  // -------------------------------------------------------------------------
  
  let totalExercises = exercises.length;
  let totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);

  // Validate volume using Volume Engine
  const validation = validateWorkoutVolume({
    totalSets,
    totalExercises,
    experience: userProfile.experience,
  });

  // If volume is too high, reduce from the end (accessories first)
  // ИСПРАВЛЕНО: удаляем упражнения по приоритету роли (не слепо с конца)
  // conditioning/pump → accessory → secondary → main (в последнюю очередь)
  if (!validation.valid) {
    const rolePriority: Record<SlotRole, number> = {
      conditioning: 0,
      pump: 1,
      accessory: 2,
      secondary: 3,
      main: 4,
    };

    while (
      exercises.length > 0 &&
      (totalSets > validation.maxSets || exercises.length > validation.maxExercises)
    ) {
      // Найти упражнение с самым низким приоритетом
      const idx = exercises
        .map((e, i) => ({ i, p: rolePriority[e.role] ?? 99 }))
        .sort((a, b) => a.p - b.p)[0]?.i;
      
      if (idx == null) break;
      
      const [removed] = exercises.splice(idx, 1);
      if (removed) {
        totalSets -= removed.sets;
        totalExercises--;
      }
    }
  }
  
  // Recalculate after potential volume reduction
  totalExercises = exercises.length;
  totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);

  // Estimate duration: warmup (10) + exercises + cooldown (5)
  const exerciseDuration = exercises.reduce((sum, e) => {
    // ИСПРАВЛЕНО: 3-4 сек/повтор (темп) + rest + setup между подходами
    const avgReps = (e.repsRange[0] + e.repsRange[1]) / 2;
    const repTime = avgReps * 3.5; // секунды на подход (темп)
    const setupTime = 20; // секунды на подготовку/смену веса между подходами
    const setTime = repTime + e.restSec + setupTime;
    return sum + setTime * e.sets;
  }, 0);
  
  const estimatedDuration = Math.ceil((10 + exerciseDuration / 60 + 5));

  // -------------------------------------------------------------------------
  // STEP 5: Generate adaptation notes and warnings
  // -------------------------------------------------------------------------
  
  const adaptationNotes: string[] = [];
  const warnings: string[] = [];

  // Track if volume was reduced
  const originalSetCount = selectedExercises.reduce((sum: number, { role }, idx: number) => {
    const { sets } = calculateSetsReps({
      role,
      experience: userProfile.experience,
      goal: userProfile.goal,
      daysPerWeek: userProfile.daysPerWeek,
      intent,
    });
    return sum + sets;
  }, 0);

  if (originalSetCount > totalSets || selectedExercises.length > totalExercises) {
    adaptationNotes.push(
      `Объём скорректирован до безопасного уровня (${totalSets} подходов, ${totalExercises} упражнений) для вашего опыта.`
    );
  }

  if (weekPlanData?.isDeloadWeek) {
    adaptationNotes.push("🛌 DELOAD НЕДЕЛЯ: объём снижен на 40% для восстановления.");
  } else if (intent === "light") {
    adaptationNotes.push("Тренировка облегчена из-за низкой энергии/сна. Фокус на технике.");
  }

  if (intent === "hard") {
    adaptationNotes.push("Высокая готовность — целимся в верхний диапазон повторений.");
  }

  if (dupIntensity) {
    const dupLabels = { heavy: "Heavy (силовой)", medium: "Medium (средний)", light: "Light (лёгкий)" };
    adaptationNotes.push(`DUP: ${dupLabels[dupIntensity]} день`);
  }

  if (checkin?.pain && checkin.pain.length > 0) {
    warnings.push(`Боль в: ${checkin.pain.join(", ")}. Избегай дискомфорта, снижай веса при необходимости.`);
  }

  // -------------------------------------------------------------------------
  // STEP 6: Generate warmup and cooldown
  // -------------------------------------------------------------------------
  
  const warmup = generateWarmup(exercises.map(e => e.exercise), dayBlueprint.focus);
  const cooldown = generateCooldown(exercises.map(e => e.exercise), dayBlueprint.focus);

  return {
    schemeId: scheme.id,
    schemeName: scheme.russianName,
    dayIndex,
    dayLabel: dayBlueprint.label,
    dayFocus: dayBlueprint.focus,
    intent,
    warmup,
    exercises,
    cooldown,
    totalExercises,
    totalSets,
    estimatedDuration,
    adaptationNotes: adaptationNotes.length > 0 ? adaptationNotes : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ============================================================================
// HELPER: Generate warmup
// ============================================================================

function generateWarmup(exercises: Exercise[], dayFocus: string): string[] {
  const warmupItems: string[] = [];
  
  // Базовая разминка (всегда)
  warmupItems.push("5 минут лёгкого кардио (велотренажёр, эллипс или ходьба)");
  
  // Специфическая разминка по паттернам
  const patterns = [...new Set(exercises.flatMap(ex => ex.patterns))];
  
  if (patterns.some(p => ["squat", "hinge", "lunge"].includes(p))) {
    warmupItems.push("Приседания с собственным весом × 15");
    warmupItems.push("Выпады назад × 10 на каждую ногу");
    warmupItems.push("Ягодичный мост × 15");
  }
  
  if (patterns.some(p => ["horizontal_push", "incline_push", "vertical_push"].includes(p))) {
    warmupItems.push("Вращения рук × 10 вперёд и назад");
    warmupItems.push("Отжимания от стены × 10");
    warmupItems.push("Разведения рук в стороны × 15");
  }
  
  if (patterns.some(p => ["horizontal_pull", "vertical_pull"].includes(p))) {
    warmupItems.push("Вращения плечами × 15");
    warmupItems.push("Подтягивание лопаток на турнике (висы) × 10 сек");
    warmupItems.push("Тяга резинки к груди × 15");
  }
  
  warmupItems.push("Лёгкие подходы первого упражнения (50% веса × 12, 70% веса × 8)");
  
  return warmupItems.slice(0, 6); // Max 6 items
}

// ============================================================================
// HELPER: Generate cooldown
// ============================================================================

function generateCooldown(exercises: Exercise[], dayFocus: string): string[] {
  const cooldownItems: string[] = [];
  
  // Растяжка по группам мышц
  const muscles = [...new Set(exercises.flatMap(ex => ex.primaryMuscles))];
  
  if (muscles.some(m => ["quads", "glutes", "hamstrings"].includes(m))) {
    cooldownItems.push("Растяжка квадрицепса (стоя на одной ноге) — 30 сек каждая");
    cooldownItems.push("Растяжка задней поверхности бедра (наклон к ногам) — 30 сек");
    cooldownItems.push("Растяжка ягодиц (лёжа на спине, колено к груди) — 30 сек каждая");
  }
  
  if (muscles.some(m => ["chest", "front_delts"].includes(m))) {
    cooldownItems.push("Растяжка грудных (руки за спину в дверном проёме) — 30 сек");
    cooldownItems.push("Растяжка передних дельт (рука за спину) — 30 сек каждая");
  }
  
  if (muscles.some(m => ["lats", "traps", "rear_delts"].includes(m))) {
    cooldownItems.push("Растяжка широчайших (вис на турнике) — 20 сек");
    cooldownItems.push("Растяжка задних дельт (рука через грудь) — 30 сек каждая");
  }
  
  cooldownItems.push("Глубокое дыхание 5-10 циклов (вдох 4 сек, выдох 6 сек)");
  
  return cooldownItems.slice(0, 6); // Max 6 items
}

// ============================================================================
// HELPER: Recommend scheme for user
// ============================================================================

export function recommendScheme(userProfile: UserProfile): {
  recommended: NormalizedWorkoutScheme;
  alternatives: NormalizedWorkoutScheme[];
} {
  const candidates = getCandidateSchemes({
    experience: userProfile.experience,
    goal: userProfile.goal,
    daysPerWeek: userProfile.daysPerWeek,
    timeBucket: userProfile.timeBucket,
    equipment: userProfile.equipment,
    sex: userProfile.sex,
    constraints: [], // TODO: map from userProfile.constraints
  });

  if (candidates.length === 0) {
    throw new Error("No suitable schemes found for this user profile");
  }

  const ranked = rankSchemes(
    {
      experience: userProfile.experience,
      goal: userProfile.goal,
      daysPerWeek: userProfile.daysPerWeek,
      timeBucket: userProfile.timeBucket,
      equipment: userProfile.equipment,
      sex: userProfile.sex,
    },
    candidates
  );

  return {
    recommended: ranked[0],
    alternatives: ranked.slice(1, 4), // Top 3 alternatives
  };
}

// ============================================================================
// HELPER: Generate full week
// ============================================================================

export function generateWeekPlan(args: {
  scheme: NormalizedWorkoutScheme;
  userProfile: UserProfile;
  mesocycle?: Mesocycle; // НОВОЕ: мезоцикл для периодизации
  checkins?: CheckInData[]; // One per day
  history?: WorkoutHistory;
}): GeneratedWorkoutDay[] {
  const { scheme, userProfile, mesocycle, checkins, history } = args;

  // НОВОЕ: Получить план недели из мезоцикла
  let weekPlanData = null;
  if (mesocycle) {
    weekPlanData = getWeekPlan({
      mesocycle,
      weekNumber: mesocycle.currentWeek,
      daysPerWeek: scheme.daysPerWeek,
    });
  }

  const weekPlan: GeneratedWorkoutDay[] = [];
  
  // НОВОЕ: Собираем все использованные упражнения за неделю
  // чтобы избежать дублей между днями
  const usedExerciseIds: string[] = [];

  for (let dayIndex = 0; dayIndex < scheme.daysPerWeek; dayIndex++) {
    const checkin = checkins?.[dayIndex];
    
    // НОВОЕ: Получить DUP интенсивность для этого дня
    const dupIntensity = weekPlanData?.dupPattern?.[dayIndex];
    
    // НОВОЕ: Передаем историю с учётом упражнений из предыдущих дней недели
    const historyWithWeekExclusions = history ? {
      ...history,
      recentExerciseIds: [...(history.recentExerciseIds || []), ...usedExerciseIds],
    } : {
      recentExerciseIds: usedExerciseIds,
    };
    
    const dayPlan = generateWorkoutDay({
      scheme,
      dayIndex,
      userProfile,
      checkin,
      history: historyWithWeekExclusions, // ИЗМЕНЕНО: передаём обновлённую историю
      dupIntensity,
      weekPlanData,
    });

    weekPlan.push(dayPlan);
    
    // НОВОЕ: Собираем ID упражнений этого дня
    dayPlan.exercises.forEach(ex => {
      usedExerciseIds.push(ex.exercise.id);
    });
  }

  return weekPlan;
}

// workoutDayGenerator.ts
// ============================================================================
// DETERMINISTIC WORKOUT DAY GENERATOR
// 
// Integrates:
// - normalizedSchemes.ts (scheme selection)
// - dayPatternMap.ts (day structure)
// - exerciseSelector.ts (exercise selection)
// - exerciseLibrary.ts (200 exercises)
// - readiness.ts (НОВОЕ: единая оценка готовности)
// 
// NO AI INVOLVED - Pure code logic
// ============================================================================

import type { Exercise, JointFlag, Equipment as LibraryEquipment, Experience, ExerciseKind, Pattern, MuscleGroup } from "./exerciseLibrary.js";
import type { NormalizedWorkoutScheme, Goal, ExperienceLevel, Equipment, TimeBucket } from "./normalizedSchemes.js";
import { getCandidateSchemes, rankSchemes } from "./normalizedSchemes.js";
import { buildDaySlots } from "./dayPatternMap.js";
import {
  selectExercisesForDay,
  type UserConstraints,
  type CheckinContext,
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
  type Mesocycle,
  type DUPIntensity,
} from "./mesocycleEngine.js";
import { computeReadiness, type Intent, type Readiness } from "./readiness.js";

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

export type PainEntry = {
  location: string;      // e.g. "shoulder", "knee", "low_back"
  level: number;         // 1-10 intensity (required)
};

export type CheckInData = {
  energy: "low" | "medium" | "high";
  sleep: "poor" | "fair" | "ok" | "good" | "excellent"; // 5 вариантов
  stress: "high" | "medium" | "low" | "very_high";
  pain?: PainEntry[];    // структурированная боль
  soreness?: string[];   // muscles that are sore (не используется пока)
  availableMinutes?: number; // доступное время для тренировки
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

// buildAvoidFlags() УДАЛЕНА - теперь используем readiness.avoidFlags
// calculateIntent() УДАЛЕНА - теперь используем readiness.intent

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
// RECOVERY SESSION GENERATOR
// ============================================================================

export function generateRecoverySession(args: {
  userProfile: UserProfile;
  painAreas?: string[];
  availableMinutes?: number;
}): GeneratedWorkoutDay {
  const { userProfile, painAreas = [], availableMinutes = 30 } = args;
  
  // Base recovery exercises (mobility + stretching)
  const baseRecovery = [
    {
      sets: 2,
      repsRange: [10, 15] as [number, number],
      restSec: 30,
      notes: "Плавные движения позвоночником. Вдох - прогиб, выдох - округление спины.",
      role: "accessory" as SlotRole,
      exercise: {
        id: "recovery_cat_cow",
        name: "Кошка-Корова (Cat-Cow)",
        patterns: ["core" as Pattern],
        primaryMuscles: ["core" as MuscleGroup, "lower_back" as MuscleGroup],
        equipment: ["bodyweight" as LibraryEquipment],
        minLevel: "beginner" as Experience,
        difficulty: 1 as 1,
        setupCost: 1 as 1,
        stabilityDemand: 1 as 1,
        kind: "core" as ExerciseKind,
        repRangeDefault: { min: 8, max: 15 },
        restSecDefault: 30,
        cues: ["Медленно и плавно", "Синхронизируй с дыханием"],
      },
    },
    {
      sets: 2,
      repsRange: [10, 15] as [number, number],
      restSec: 30,
      notes: "Круговые движения руками вперёд и назад. Увеличивай амплитуду постепенно.",
      role: "accessory" as SlotRole,
      exercise: {
        id: "recovery_shoulder_circles",
        name: "Подвижность плеч (Shoulder Circles)",
        patterns: ["delts_iso" as Pattern],
        primaryMuscles: ["front_delts" as MuscleGroup, "side_delts" as MuscleGroup],
        equipment: ["bodyweight" as LibraryEquipment],
        minLevel: "beginner" as Experience,
        difficulty: 1 as 1,
        setupCost: 1 as 1,
        stabilityDemand: 1 as 1,
        kind: "isolation" as ExerciseKind,
        repRangeDefault: { min: 10, max: 15 },
        restSecDefault: 30,
        cues: ["Контролируй движение", "Без боли"],
      },
    },
    {
      sets: 3,
      repsRange: [20, 30] as [number, number],
      restSec: 45,
      notes: "Опустись в глубокий присед и держи позицию. Улучшает мобильность бёдер и голеностопа.",
      role: "accessory" as SlotRole,
      exercise: {
        id: "recovery_deep_squat",
        name: "Глубокий присед с удержанием",
        patterns: ["squat" as Pattern],
        primaryMuscles: ["quads" as MuscleGroup, "glutes" as MuscleGroup],
        equipment: ["bodyweight" as LibraryEquipment],
        minLevel: "beginner" as Experience,
        difficulty: 2 as 2,
        setupCost: 1 as 1,
        stabilityDemand: 2 as 2,
        kind: "compound" as ExerciseKind,
        repRangeDefault: { min: 20, max: 30 },
        restSecDefault: 45,
        cues: ["Пятки на полу", "Спина прямая"],
      },
    },
    {
      sets: 2,
      repsRange: [30, 45] as [number, number],
      restSec: 30,
      notes: "Встань в дверном проёме, руки на косяк. Шаг вперёд для растяжки груди.",
      role: "accessory" as SlotRole,
      exercise: {
        id: "recovery_chest_stretch",
        name: "Растяжка грудных",
        patterns: ["horizontal_push" as Pattern],
        primaryMuscles: ["chest" as MuscleGroup],
        equipment: ["bodyweight" as LibraryEquipment],
        minLevel: "beginner" as Experience,
        difficulty: 1 as 1,
        setupCost: 1 as 1,
        stabilityDemand: 1 as 1,
        kind: "isolation" as ExerciseKind,
        repRangeDefault: { min: 30, max: 45 },
        restSecDefault: 30,
        cues: ["Дыши глубоко", "Без боли"],
      },
    },
    {
      sets: 2,
      repsRange: [30, 45] as [number, number],
      restSec: 30,
      notes: "Сидя, наклонись к прямым ногам. Тянись грудью к коленям.",
      role: "accessory" as SlotRole,
      exercise: {
        id: "recovery_hamstring_stretch",
        name: "Растяжка задней поверхности",
        patterns: ["hinge" as Pattern],
        primaryMuscles: ["hamstrings" as MuscleGroup, "lower_back" as MuscleGroup],
        equipment: ["bodyweight" as LibraryEquipment],
        minLevel: "beginner" as Experience,
        difficulty: 1 as 1,
        setupCost: 1 as 1,
        stabilityDemand: 1 as 1,
        kind: "isolation" as ExerciseKind,
        repRangeDefault: { min: 30, max: 45 },
        restSecDefault: 30,
        cues: ["Не сгибай колени", "Медленно"],
      },
    },
    {
      sets: 2,
      repsRange: [20, 30] as [number, number],
      restSec: 60,
      notes: "Лёгкая активация кора. Фокус на дыхании и статике.",
      role: "accessory" as SlotRole,
      exercise: {
        id: "recovery_plank",
        name: "Планка статика",
        patterns: ["core" as Pattern],
        primaryMuscles: ["core" as MuscleGroup],
        equipment: ["bodyweight" as LibraryEquipment],
        minLevel: "beginner" as Experience,
        difficulty: 2 as 2,
        setupCost: 1 as 1,
        stabilityDemand: 3 as 3,
        kind: "core" as ExerciseKind,
        repRangeDefault: { min: 20, max: 40 },
        restSecDefault: 60,
        cues: ["Тело прямое", "Дыши ровно"],
      },
    },
  ];
  
  // Adjust duration if needed
  let exercises = [...baseRecovery];
  const estimatedDuration = Math.ceil(exercises.length * 3); // ~3 min per exercise
  
  if (availableMinutes < estimatedDuration && exercises.length > 3) {
    exercises = exercises.slice(0, Math.max(3, Math.floor(availableMinutes / 3)));
  }
  
  const totalExercises = exercises.length;
  const totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);
  
  const adaptationNotes = [
    "🛌 ВОССТАНОВИТЕЛЬНАЯ СЕССИЯ: фокус на мобильности и расслаблении.",
    "Все движения выполняй медленно и подконтрольно.",
    "Если появляется боль — останови упражнение.",
  ];
  
  if (painAreas.length > 0) {
    const painLocationNames: Record<string, string> = {
      shoulder: "плечо",
      elbow: "локоть",
      wrist: "запястье / кисть",
      neck: "шея",
      lower_back: "поясница",
      hip: "тазобедренный сустав",
      knee: "колено",
      ankle: "голеностоп / стопа",
    };
    const names = painAreas.map(p => painLocationNames[p] || p).join(", ");
    adaptationNotes.push(`⚠️ Избегай нагрузки на: ${names}.`);
  }
  
  const warmup = [
    "5 минут лёгкой ходьбы или суставной гимнастики",
    "Концентрируйся на дыхании и осознанных движениях",
  ];
  
  const cooldown = [
    "5 минут медленной растяжки всего тела",
    "Глубокое дыхание, расслабление",
  ];
  
  return {
    schemeId: "recovery",
    schemeName: "Восстановительная сессия",
    dayIndex: 0,
    dayLabel: "Recovery",
    dayFocus: "Мобильность и растяжка",
    intent: "light" as Intent,
    warmup,
    exercises,
    cooldown,
    totalExercises,
    totalSets,
    estimatedDuration: availableMinutes,
    adaptationNotes,
    warnings: [],
  };
}

// ============================================================================
// MAIN GENERATOR: Generate a workout day
// ============================================================================

export function generateWorkoutDay(args: {
  scheme: NormalizedWorkoutScheme;
  dayIndex: number; // 0-based (0 = first day of scheme)
  userProfile: UserProfile;
  readiness: Readiness; // ИЗМЕНЕНО: принимаем готовый readiness
  history?: WorkoutHistory;
  dupIntensity?: DUPIntensity; // НОВОЕ: DUP интенсивность
  weekPlanData?: any; // НОВОЕ: план недели
}): GeneratedWorkoutDay {
  const { scheme, dayIndex, userProfile, readiness, history, dupIntensity, weekPlanData } = args;

  console.log("\n🏋️ [WORKOUT GENERATOR] ==============================");
  console.log(`  User: ${userProfile.experience} | ${userProfile.goal} | ${userProfile.daysPerWeek}d/w`);
  console.log(`  Scheme: ${scheme.id} | Day ${dayIndex}: ${scheme.days[dayIndex]?.label || 'N/A'}`);
  
  // Mesocycle & DUP info
  if (weekPlanData) {
    const weekType = weekPlanData.isDeloadWeek ? 'DELOAD' : 'NORMAL';
    const dupInfo = dupIntensity ? `DUP: ${dupIntensity}` : 'no DUP';
    console.log(`  Mesocycle: ${weekType} week | ${dupInfo}`);
  }

  // Get the day blueprint from scheme
  const dayBlueprint = scheme.days[dayIndex];
  if (!dayBlueprint) {
    throw new Error(`Day index ${dayIndex} not found in scheme ${scheme.id}`);
  }
  
  let intent = readiness.intent;
  
  // Override intent if deload week
  if (weekPlanData?.isDeloadWeek) {
    intent = "light";
    console.log(`  → Intent overridden to 'light' (deload week)`);
  }
  
  // Используем timeBucket из readiness (учитывает availableMinutes)
  const effectiveTimeBucket = readiness.timeBucket;

  // КРИТИЧНО: map equipment правильно (dumbbells → dumbbell + bench, etc.)
  // ВАЖНО: строки типизированы Equipment → LibraryEquipment[], TypeScript проверит совпадение
  // Без as - если имя не совпадёт, TypeScript упадёт на компиляции
  function mapEquipmentToAvailable(equipment: Equipment): LibraryEquipment[] {
    if (equipment === "gym_full") return ["gym_full"];
    if (equipment === "dumbbells") return ["dumbbell", "bench", "bodyweight"];
    if (equipment === "bodyweight") return ["bodyweight", "pullup_bar", "bands"];
    if (equipment === "limited") return ["dumbbell", "kettlebell", "bands", "bodyweight", "bench"];
    // Fallback: если не распознали, считаем gym_full
    return ["gym_full"];
  }

  // Build constraints
  const constraints: UserConstraints = {
    experience: userProfile.experience,
    equipmentAvailable: mapEquipmentToAvailable(userProfile.equipment),
    avoid: readiness.avoidFlags, // НОВОЕ: используем из readiness
  };

  // Build checkin context
  const ctx: CheckinContext = {
    intent,
    timeBucket: effectiveTimeBucket, // ИСПРАВЛЕНО: используем из readiness
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
    timeBucket: effectiveTimeBucket, // ИСПРАВЛЕНО: используем из readiness
    intent,
  });

  console.log(`  Slots: ${slots.length} | Intent: ${intent} | TimeBucket: ${effectiveTimeBucket}min`);

  // -------------------------------------------------------------------------
  // STEP 2: Select exercises for slots
  // -------------------------------------------------------------------------
  
  const excludedCount = history?.recentExerciseIds?.length || 0;
  console.log(`  History exclusion: ${excludedCount} exercises from recent workouts`);
  
  const selectedExercises = selectExercisesForDay({
    slots,
    ctx,
    constraints,
    excludeIds: history?.recentExerciseIds,
  });

  console.log(`  Selected ${selectedExercises.length} exercises (rotation for variety)`);
  console.log(`     Names: ${selectedExercises.map(s => s.ex.name).join(', ')}`);

  // -------------------------------------------------------------------------
  // STEP 3: Assign sets/reps/rest to each exercise using Volume Engine
  // -------------------------------------------------------------------------
  
  const exercises = selectedExercises.map(({ ex, role }) => {
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
  const calculateDuration = (exs: typeof exercises) => {
    // ПРАВИЛЬНЫЙ расчёт: setup ОДИН РАЗ на упражнение (не в reduce!)
    const workTime = exs.reduce((sum, e) => {
      const avgReps = (e.repsRange[0] + e.repsRange[1]) / 2;
      const repTime = avgReps * 3.5; // секунды на подход (темп execution)
      
      // Rest только между подходами (не после последнего)
      const totalWorkTime = e.sets * repTime;
      const totalRestTime = (e.sets - 1) * e.restSec;
      
      return sum + totalWorkTime + totalRestTime;
    }, 0);
    
    // Setup time между упражнениями (переход станции/оборудования)
    const setupTime = exs.length * 30; // 30 сек на каждое упражнение
    
    // Total: Warmup (10 min) + work + setup + Cooldown (5 min)
    const totalMinutes = 10 + (workTime + setupTime) / 60 + 5;
    
    return Math.ceil(totalMinutes);
  };
  
  let estimatedDuration = calculateDuration(exercises);
  
  console.log(`  Initial duration: ${estimatedDuration} min (${exercises.length} exercises, ${totalSets} sets)`);
  
  // NEW: Reduce exercises/sets if availableMinutes is less than estimated duration
  // ИСПРАВЛЕНО: используем readiness.effectiveMinutes (единый источник)
  let wasReducedForTime = false;
  if (readiness.effectiveMinutes && readiness.effectiveMinutes < estimatedDuration) {
    console.log(`  ⏱️  TIME REDUCTION: ${estimatedDuration}min > ${readiness.effectiveMinutes}min available`);
    const rolePriority: Record<SlotRole, number> = {
      conditioning: 0,
      pump: 1,
      accessory: 2,
      secondary: 3,
      main: 4,
    };
    
    // Add buffer: target 90% of available time to be safe
    const targetDuration = readiness.effectiveMinutes * 0.9;
    
    let iterations = 0;
    const maxIterations = 10; // Safety limit
    
    // Aggressive reduction for very limited time (< 30 min)
    const isVeryLimitedTime = readiness.effectiveMinutes < 30;
    const minExercises = isVeryLimitedTime ? 2 : 3;
    
    // First try: remove low-priority exercises
    while (exercises.length > minExercises && estimatedDuration > targetDuration && iterations < maxIterations) {
      // Find exercise with lowest priority
      const idx = exercises
        .map((e, i) => ({ i, p: rolePriority[e.role] ?? 99 }))
        .sort((a, b) => a.p - b.p)[0]?.i;
      
      if (idx == null) break;
      
      const [removed] = exercises.splice(idx, 1);
      if (removed) {
        totalSets -= removed.sets;
        totalExercises--;
        wasReducedForTime = true;
      }
      
      estimatedDuration = calculateDuration(exercises);
      iterations++;
    }
    
    // Second try: reduce sets if still too long
    let setsReductionPasses = 0;
    while (estimatedDuration > targetDuration && setsReductionPasses < 2) {
      let didReduce = false;
      for (const ex of exercises) {
        const minSets = isVeryLimitedTime ? 2 : 3;
        if (ex.sets > minSets) {
          ex.sets = Math.max(minSets, ex.sets - 1);
          totalSets--;
          wasReducedForTime = true;
          didReduce = true;
        }
      }
      if (!didReduce) break;
      estimatedDuration = calculateDuration(exercises);
      setsReductionPasses++;
    }
    
    // Third try: reduce rest times if STILL too long and very limited time
    if (isVeryLimitedTime && estimatedDuration > targetDuration) {
      for (const ex of exercises) {
        if (ex.restSec > 60) {
          ex.restSec = Math.max(60, Math.floor(ex.restSec * 0.75)); // Reduce by 25%
          wasReducedForTime = true;
        }
      }
      estimatedDuration = calculateDuration(exercises);
    }
    
    // Recalculate after time-based reduction
    totalExercises = exercises.length;
    totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Generate adaptation notes and warnings
  // -------------------------------------------------------------------------
  
  const adaptationNotes: string[] = [];
  const warnings: string[] = [];
  
  // НОВОЕ: Используем warnings из readiness (единый источник правды)
  warnings.push(...readiness.warnings);

  // Track if volume was reduced
  const originalSetCount = selectedExercises.reduce((sum: number, { role }) => {
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
  }
  
  // Используем notes из readiness (без технических деталей типа DUP)
  adaptationNotes.push(...readiness.notes);

  // УДАЛЕНО: дублирование warnings про стресс/боль
  // Теперь используем только из readiness (единый источник правды)
  
  // NEW: Note if workout was shortened due to time constraints
  // ИСПРАВЛЕНО: используем readiness.effectiveMinutes
  if (wasReducedForTime && readiness.effectiveMinutes) {
    adaptationNotes.push(
      `⏱️ Тренировка сокращена под доступное время (${readiness.effectiveMinutes} мин). Убраны менее приоритетные упражнения.`
    );
  }

  // -------------------------------------------------------------------------
  // STEP 6: Generate warmup and cooldown
  // -------------------------------------------------------------------------
  
  const warmup = generateWarmup(exercises.map(e => e.exercise), dayBlueprint.focus);
  const cooldown = generateCooldown(exercises.map(e => e.exercise), dayBlueprint.focus);

  console.log(`\n  ✅ FINAL WORKOUT:`);
  console.log(`     Total: ${totalExercises} exercises, ${totalSets} sets, ${estimatedDuration} min`);
  
  if (dupIntensity) {
    const dupLabels = { heavy: "Heavy (силовой)", medium: "Medium (средний)", light: "Light (лёгкий)" };
    console.log(`     DUP Pattern: ${dupLabels[dupIntensity]} день`);
  }
  
  console.log(`\n  📋 EXERCISES:`);
  exercises.forEach((ex, i) => {
    console.log(`     ${i + 1}. ${ex.exercise.name}`);
    console.log(`        Sets: ${ex.sets} | Reps: ${ex.repsRange[0]}-${ex.repsRange[1]} | Rest: ${ex.restSec}s | Role: ${ex.role}`);
  });
  
  console.log(`\n  📝 USER MESSAGES:`);
  if (warnings.length > 0) {
    console.log(`     ⚠️  WARNINGS:`);
    warnings.forEach(w => console.log(`        - ${w}`));
  }
  if (adaptationNotes.length > 0) {
    console.log(`     📝 NOTES:`);
    adaptationNotes.forEach(n => console.log(`        - ${n}`));
  }
  if (warnings.length === 0 && adaptationNotes.length === 0) {
    console.log(`     No special messages (normal workout)`);
  }
  
  console.log("=====================================================\n");

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
    
    // Создаём readiness для каждого дня (без чек-ина при week generation)
    const readiness = computeReadiness({
      checkin: undefined,
      fallbackTimeBucket: userProfile.timeBucket,
    });

    const dayPlan = generateWorkoutDay({
      scheme,
      dayIndex,
      userProfile,
      readiness,
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

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
import type { ProgressionRecommendation } from "./progressionEngine.js";
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
  getSessionCaps,
  MAX_RECOVERABLE_VOLUME,
} from "./volumeEngine.js";
import {
  getWeekPlan,
  type Mesocycle,
  type DUPIntensity,
} from "./mesocycleEngine.js";
import { computeReadiness, normalizeBlockedPatterns, type Intent, type Readiness } from "./readiness.js";

// ============================================================================
// TYPES
// ============================================================================

export type UserProfile = {
  userId?: string; // NEW: для системы прогрессии
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

/**
 * DayExercise: Упражнение в контексте дня тренировки
 * 
 * НОВОЕ: coversPatterns для coverage-aware trimming
 * - Позволяет проверять "можно ли удалить упражнение без нарушения required patterns"
 * - Используется в fitSession() для интеллектуального урезания
 */
export type DayExercise = {
  exercise: Exercise;
  sets: number;
  repsRange: [number, number];
  restSec: number;
  notes: string;
  role: SlotRole;
  
  // NEW: Coverage tracking для required patterns
  coversPatterns: Pattern[]; // = exercise.patterns (копия для быстрого доступа)
  
  // NEW: Progression system
  suggestedWeight?: number; // Рекомендуемый вес от системы прогрессии
  progressionNote?: string; // Заметка о прогрессии (прогресс/deload/история)

  // NEW: UI load type (avoid name-based heuristics on frontend)
  loadType?: "bodyweight" | "external" | "assisted";
  requiresWeightInput?: boolean; // for completion gate (e.g. assisted machines)
  weightLabel?: string; // e.g. "Вес (кг)" or "Помощь (кг)"
};

export type GeneratedWorkoutDay = {
  schemeId: string;
  schemeName: string;
  dayIndex: number;
  dayLabel: string;
  dayFocus: string;
  intent: Intent;
  warmup?: string[];
  exercises: DayExercise[]; // ОБНОВЛЕНО: используем DayExercise с coversPatterns
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

function inferLoadInfo(exercise: Exercise): {
  loadType: "bodyweight" | "external" | "assisted";
  requiresWeightInput: boolean;
  weightLabel: string;
} {
  const id = String((exercise as any).id || "").toLowerCase();
  const name = String((exercise as any).name || "").toLowerCase();
  const nameEn = String((exercise as any).nameEn || "").toLowerCase();
  const equipment = Array.isArray((exercise as any).equipment) ? (exercise as any).equipment : [];

  const isAssisted =
    id.includes("assisted") || name.includes("гравитрон") || nameEn.includes("assisted");
  if (isAssisted) {
    return { loadType: "assisted", requiresWeightInput: true, weightLabel: "Помощь (кг)" };
  }

  const loadable = new Set(["barbell", "dumbbell", "machine", "cable", "smith", "kettlebell", "landmine"]);
  const hasExternal = equipment.some((eq: string) => loadable.has(eq));
  const hasBodyweight = equipment.includes("bodyweight") || equipment.includes("pullup_bar") || equipment.includes("trx");

  if (!hasExternal) {
    return { loadType: "bodyweight", requiresWeightInput: false, weightLabel: "" };
  }

  // Some exercises can be done either with BW or added load (e.g. glute bridge).
  // Show weight input, but don't force it for completion if BW is a valid variant.
  return {
    loadType: "external",
    requiresWeightInput: !hasBodyweight,
    weightLabel: "Вес (кг)",
  };
}

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
// COVERAGE-AWARE TRIMMING: fitSession helpers
// ============================================================================

/**
 * Compute which patterns are covered by current exercises
 */
function computeCoverage(exercises: DayExercise[]): Set<string> {
  const covered = new Set<string>();
  for (const ex of exercises) {
    for (const pattern of ex.coversPatterns ?? []) {
      covered.add(String(pattern));
    }
  }
  return covered;
}

/**
 * Check if all required patterns are covered
 */
function coversAllRequired(exercises: DayExercise[], required: Pattern[]): boolean {
  if (required.length === 0) return true;
  const covered = computeCoverage(exercises);
  return required.every(p => covered.has(String(p)));
}

/**
 * Check if we can remove exercise at index without breaking required coverage
 */
function canRemove(
  exercises: DayExercise[],
  idx: number,
  required: Pattern[],
  corePolicy: "required" | "optional"
): boolean {
  const ex = exercises[idx];
  
  // Create hypothetical array without this exercise
  const remaining = exercises.filter((_, i) => i !== idx);
  
  // Check 1: Required patterns coverage
  if (!coversAllRequired(remaining, required)) {
    return false;
  }
  
  // Check 2: corePolicy (если это последнее core упражнение и core required)
  if (corePolicy === "required" && ex.coversPatterns.includes("core")) {
    const hasCoreLeft = remaining.some(e => e.coversPatterns.includes("core"));
    if (!hasCoreLeft) {
      return false; // Нельзя удалить последнее core!
    }
  }
  
  return true;
}

/**
 * Минимальные сеты для роли (зависит от DUP + intent)
 */
function minSetsForRole(
  role: SlotRole,
  dupIntensity: DUPIntensity | undefined,
  intent: Intent
): number {
  if (role === "conditioning" || role === "pump") return 0; // Можно удалить полностью
  
  if (role === "main") {
    // Для main: зависит от DUP и intent
    if (intent === "light") return 3;
    if (dupIntensity === "heavy") return 4; // Силовой день - не меньше 4!
    return 3;
  }
  
  if (role === "secondary") {
    if (intent === "light") return 1;
    return 2; // Обычно не режем ниже 2
  }
  
  if (role === "accessory") {
    // ПРОФЕССИОНАЛЬНО: accessory минимум 2 подхода (или удалить)
    // Исключение: light intent может быть 1
    if (intent === "light") return 1;
    return 2; // Минимум 2 подхода для изоляции
  }
  
  return 1;
}

/**
 * Reduce sets by 1 for one exercise of given role (if above minSets)
 * Returns true if reduction happened
 */
function reduceSetsOnce(
  exercises: DayExercise[],
  role: SlotRole,
  minSets: number
): boolean {
  // Находим кандидатов: данной роли, с sets > minSets
  const candidates = exercises
    .map((e, i) => ({ e, i }))
    .filter(x => x.e.role === role && x.e.sets > minSets);
  
  if (candidates.length === 0) return false;
  
  // Берём первого кандидата (можно добавить приоритизацию)
  candidates[0].e.sets -= 1;
  return true;
}

/**
 * Remove one exercise (coverage-safe, from end of array)
 * Returns true if removal happened
 */
function removeOneExercise(
  exercises: DayExercise[],
  required: Pattern[],
  corePolicy: "required" | "optional"
): boolean {
  const roleOrder: SlotRole[] = ["conditioning", "pump", "accessory", "secondary", "main"];
  
  for (const role of roleOrder) {
    // Iterate from end (to avoid index shift issues)
    for (let i = exercises.length - 1; i >= 0; i--) {
      const ex = exercises[i];
      if (ex.role !== role) continue;
      
      // Check if we can remove without breaking coverage
      if (canRemove(exercises, i, required, corePolicy)) {
        console.log(`       → Removing ${ex.exercise.name} (${ex.role})`);
        exercises.splice(i, 1);
        return true;
      }
    }
  }
  
  return false; // Не смогли удалить ни одного упражнения безопасно
}

/**
 * Calculate estimated duration (simplified)
 */
function estimateDuration(exercises: DayExercise[]): number {
  let total = 0;
  for (const ex of exercises) {
    // each set: ~60s work + rest
    const setDuration = 60 + ex.restSec;
    total += ex.sets * setDuration;
  }
  return Math.ceil(total / 60); // minutes
}

/**
 * MAIN: Fit session to time and caps constraints
 * 
 * Algorithm:
 * 1. Check if over time/caps
 * 2. Try sets-first trimming (conditioning → pump → accessory → secondary → main)
 * 3. Try exercise removal (only if coverage-safe)
 * 4. Repeat until fit or cannot trim further
 */
function fitSession(args: {
  exercises: DayExercise[];
  required: Pattern[];
  corePolicy: "required" | "optional";
  maxMinutes: number | null;
  caps: { maxExercises: number; maxSets: number; minExercises: number };
  dupIntensity?: DUPIntensity;
  intent: Intent;
}): { trimmed: boolean; logs: string[] } {
  const { exercises, required, corePolicy, maxMinutes, caps, dupIntensity, intent } = args;
  
  const logs: string[] = [];
  let trimmed = false;
  
  // Time buffer: 8% of maxMinutes (or 5 min for null)
  const bufferMin = maxMinutes !== null ? Math.ceil(maxMinutes * 0.08) : 5;
  
  let iteration = 0;
  const MAX_ITERATIONS = 50; // Safety против бесконечного цикла
  
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    
    const totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);
    const totalExercises = exercises.length;
    const est = estimateDuration(exercises);
    
    const overTime = maxMinutes !== null ? est > maxMinutes + bufferMin : false;
    const overSets = totalSets > caps.maxSets;
    const overEx = totalExercises > caps.maxExercises;
    
    // If all good, exit
    if (!overTime && !overSets && !overEx) {
      if (trimmed) {
        logs.push(`✅ Fit achieved: ${totalExercises} ex, ${totalSets} sets, ~${est}min`);
      }
      break;
    }
    
    logs.push(`   Iteration ${iteration}: ${totalExercises} ex, ${totalSets} sets, ~${est}min (over: time=${overTime}, sets=${overSets}, ex=${overEx})`);
    
    let changed = false;
    
    // Phase 1: Sets-first trimming (ВСЕГДА пробуем, даже при overEx!)
    if (overTime || overSets || overEx) {
      const rolesOrder: SlotRole[] = ["conditioning", "pump", "accessory", "secondary", "main"];
      
      for (const role of rolesOrder) {
        const minSets = minSetsForRole(role, dupIntensity, intent);
        if (reduceSetsOnce(exercises, role, minSets)) {
          logs.push(`       → Reduced sets: ${role} role`);
          changed = true;
          trimmed = true;
          break; // Go to next iteration
        }
      }
    }
    
    // Phase 2: Exercise removal (только если sets-first не помог)
    if (!changed && (overTime || overEx || overSets)) {
      if (removeOneExercise(exercises, required, corePolicy)) {
        logs.push(`       → Removed exercise (coverage-safe)`);
        changed = true;
        trimmed = true;
      } else {
        logs.push(`       ⚠️  Cannot remove more exercises without breaking required coverage`);
        break; // Не можем урезать дальше
      }
    }
    
    // If nothing changed, we're stuck
    if (!changed) {
      logs.push(`       ⚠️  Cannot trim further (stuck)`);
      break;
    }
  }
  
  if (iteration >= MAX_ITERATIONS) {
    logs.push(`⚠️  Max iterations reached (${MAX_ITERATIONS}), stopping trim`);
  }
  
  // ФИНАЛЬНАЯ ОЧИСТКА: Удаляем accessory упражнения с 1 сетом (если не critical)
  // 1 сет изоляции = непрофессионально, лучше удалить
  if (intent !== "light") { // Для light intent 1 сет accessory = ок
    const toRemove: number[] = [];
    
    exercises.forEach((ex, idx) => {
      if (ex.role === "accessory" && ex.sets === 1) {
        // Проверяем можно ли удалить без нарушения required
        if (canRemove(exercises, idx, required, corePolicy)) {
          toRemove.push(idx);
        }
      }
    });
    
    if (toRemove.length > 0) {
      // Удаляем в обратном порядке (чтобы индексы не сбивались)
      for (let i = toRemove.length - 1; i >= 0; i--) {
        exercises.splice(toRemove[i], 1);
      }
      logs.push(`🧹 Cleanup: Removed ${toRemove.length} accessory exercise(s) with only 1 set`);
      trimmed = true;
    }
  }

  return { trimmed, logs };
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
	  // NEW: добавляем coversPatterns для совместимости с DayExercise type
	  let exercises: DayExercise[] = baseRecovery.map(ex => ({
	    ...ex,
	    coversPatterns: ex.exercise.patterns,
	    ...inferLoadInfo(ex.exercise),
	  }));
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
// HELPER: Generate user-friendly explanations for missed patterns
// ============================================================================

/**
 * Генерирует понятные пользователю объяснения почему некоторые упражнения пропущены
 */
function generateMissedPatternExplanations(
  missedPatterns: Pattern[],
  pain: Array<{ location: string; level: number }>,
  corePolicy?: "required" | "optional"
): string[] {
  const explanations: string[] = [];
  
  // Маппинг: pattern → информация о боли и user-friendly название
  const patternInfo: Record<Pattern, {
    friendlyName: string;
    painLocations: string[];
    advice: string;
  }> = {
    // Push patterns
    "horizontal_push": {
      friendlyName: "жимовые упражнения (грудь)",
      painLocations: ["shoulder", "elbow", "wrist"],
      advice: "Жимы вернутся когда плечо восстановится"
    },
    "incline_push": {
      friendlyName: "жимы под углом",
      painLocations: ["shoulder"],
      advice: "Наклонные жимы вернутся когда плечо восстановится"
    },
    "vertical_push": {
      friendlyName: "жимы над головой",
      painLocations: ["shoulder"],
      advice: "Жимы над головой требуют здорового плеча"
    },
    
    // Pull patterns
    "horizontal_pull": {
      friendlyName: "тяговые упражнения (спина)",
      painLocations: ["shoulder", "lower_back", "elbow"],
      advice: "Тяги вернутся после восстановления"
    },
    "vertical_pull": {
      friendlyName: "подтягивания и вертикальные тяги",
      painLocations: ["shoulder", "elbow"],
      advice: "Вертикальные тяги вернутся когда плечо восстановится"
    },
    
    // Leg patterns
    "squat": {
      friendlyName: "приседания",
      painLocations: ["knee", "lower_back", "hip"],
      advice: "Приседания вернутся когда колено/спина восстановится"
    },
    "hinge": {
      friendlyName: "тяговые на ноги (румынская тяга, гиперэкстензии)",
      painLocations: ["lower_back", "hamstring"],
      advice: "Тяговые на ноги вернутся когда поясница восстановится"
    },
    "lunge": {
      friendlyName: "выпады",
      painLocations: ["knee", "hip"],
      advice: "Выпады вернутся когда колено восстановится"
    },
    "hip_thrust": {
      friendlyName: "ягодичный мост и тазовые тяги",
      painLocations: ["lower_back", "hip"],
      advice: "Ягодичные упражнения вернутся после восстановления"
    },
    
    // Isolation
    "rear_delts": {
      friendlyName: "упражнения на задние дельты",
      painLocations: ["shoulder"],
      advice: "Изоляция дельт вернётся после восстановления плеча"
    },
    "delts_iso": {
      friendlyName: "изоляция дельт (махи)",
      painLocations: ["shoulder"],
      advice: "Махи вернутся когда плечо восстановится"
    },
    "triceps_iso": {
      friendlyName: "изоляция трицепса",
      painLocations: ["elbow", "shoulder"],
      advice: "Изоляция трицепса вернётся после восстановления"
    },
    "biceps_iso": {
      friendlyName: "изоляция бицепса",
      painLocations: ["elbow"],
      advice: "Изоляция бицепса вернётся после восстановления локтя"
    },
    
    // Core
    "core": {
      friendlyName: "упражнения на пресс/кор",
      painLocations: ["lower_back", "hip"],
      advice: "Кор-тренировки вернутся после восстановления"
    },
    
    // Other
    "carry": {
      friendlyName: "переноски (farmer's walk)",
      painLocations: ["lower_back", "shoulder"],
      advice: "Переноски вернутся после восстановления"
    },
    "calves": {
      friendlyName: "икры",
      painLocations: ["ankle", "knee"],
      advice: "Икры вернутся после восстановления"
    },
    "conditioning_low_impact": {
      friendlyName: "низкоинтенсивное кардио",
      painLocations: [],
      advice: "Кардио адаптировано под текущее состояние"
    },
    "conditioning_intervals": {
      friendlyName: "интервальные тренировки",
      painLocations: [],
      advice: "HIIT вернётся когда состояние улучшится"
    },
  };
  
  for (const pattern of missedPatterns) {
    const info = patternInfo[pattern];
    if (!info) continue;
    
    // Найти соответствующую боль
    const relevantPain = pain.find(p => info.painLocations.includes(p.location));
    
    if (relevantPain) {
      const painNames: Record<string, string> = {
        shoulder: "плече",
        elbow: "локте",
        wrist: "запястье",
        lower_back: "пояснице",
        knee: "колене",
        hip: "бедре",
        ankle: "голеностопе",
        hamstring: "задней поверхности бедра",
      };
      
      const painName = painNames[relevantPain.location] || relevantPain.location;
      const painLevel = relevantPain.level;
      
      let message = `⚠️ ${info.friendlyName} пропущены из-за боли в ${painName} (${painLevel}/10). ${info.advice}.`;
      
      // Добавить совет при сильной боли
      if (painLevel >= 6) {
        message += `\n   💡 Совет: Боль ${painLevel}/10 - это серьёзно. Если не проходит 3+ дней — обратись к врачу.`;
      }
      
      explanations.push(message);
    }
  }
  
  return explanations;
}

// ============================================================================
// MAIN GENERATOR: Generate a workout day
// ============================================================================

export async function generateWorkoutDay(args: {
  scheme: NormalizedWorkoutScheme;
  dayIndex: number; // 0-based (0 = first day of scheme)
  userProfile: UserProfile;
  readiness: Readiness; // ИЗМЕНЕНО: принимаем готовый readiness
  history?: WorkoutHistory;
  dupIntensity?: DUPIntensity; // НОВОЕ: DUP интенсивность
  weekPlanData?: any; // НОВОЕ: план недели
}): Promise<GeneratedWorkoutDay> {
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
  
  // -------------------------------------------------------------------------
  // E1: Вычисляем effectiveRequired (scheme required - blocked + corePolicy)
  // -------------------------------------------------------------------------
  
  // Схемные required patterns
  const schemeRequired = dayBlueprint.requiredPatterns || [];
  
  // Нормализуем заблокированные паттерны
  const blockedSet = normalizeBlockedPatterns(readiness.blockedPatterns);
  
  // effectiveRequired = required - blocked (фильтруем deprecated patterns)
  let effectiveRequired = schemeRequired
    .filter(p => p !== "arms_iso") // Deprecated: use triceps_iso or biceps_iso
    .filter(p => !blockedSet.has(String(p))) as Pattern[];
  
  // Применяем corePolicy: если core = optional, удаляем core из effectiveRequired
  if (readiness.corePolicy === "optional") {
    effectiveRequired = effectiveRequired.filter(p => p !== "core");
  }
  
  // Важный edge case: если слишком много required заблокировано
  if (effectiveRequired.length === 0 && schemeRequired.length > 0) {
    console.warn(`⚠️  ALL required patterns blocked! Day structure may be broken.`);
  } else if (effectiveRequired.length < schemeRequired.length * 0.3 && schemeRequired.length >= 3) {
    console.warn(`⚠️  Too many required patterns blocked (${effectiveRequired.length}/${schemeRequired.length}), consider day swap`);
  }
  
  console.log(`  Required: ${schemeRequired.length} total → ${effectiveRequired.length} effective (after blocked + corePolicy)`);
  
  // Собираем информацию о пропущенных паттернах для user messages
  let missedPatternExplanations: string[] = [];
  
  if (effectiveRequired.length < schemeRequired.length) {
    const effectiveSet = new Set(effectiveRequired.map(String));
    const removed = schemeRequired.filter(p => !effectiveSet.has(String(p)));
    console.log(`     Removed: ${removed.join(', ')}`);
    
    // Генерируем user-friendly объяснения для пропущенных паттернов
    // Конвертируем Map в массив для функции
    const painArray = Array.from(readiness.painByLocation.entries()).map(([location, level]) => ({
      location,
      level
    }));
    
    // Фильтруем только паттерны заблокированные болью (не core policy)
    const removedByPain = (removed as Pattern[]).filter(p => {
      // core удалён из-за policy, не боли
      if (p === "core" && readiness.corePolicy === "optional") {
        return false;
      }
      return blockedSet.has(String(p));
    });
    
    missedPatternExplanations = generateMissedPatternExplanations(
      removedByPain,
      painArray,
      readiness.corePolicy
    );
    
    // Добавим объяснение для core если удалён из-за policy
    if (removed.includes("core" as any) && readiness.corePolicy === "optional") {
      missedPatternExplanations.push(
        `ℹ️ Упражнения на пресс пропущены из-за нехватки времени. Это нормально - кор работает во всех базовых упражнениях.`
      );
    }
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
    experience: userProfile.experience, // NEW: влияет на slot budget (advanced = больше слотов)
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
    requiredPatterns: effectiveRequired, // NEW: priority boost + relaxation for required
  });

  console.log(`  Selected ${selectedExercises.length} exercises (rotation for variety)`);
  console.log(`     Names: ${selectedExercises.map(s => s.ex.name).join(', ')}`);
  
  // НОВОЕ: Проверяем фактическое покрытие effectiveRequired
  const actualCoverage = new Set<string>();
  for (const sel of selectedExercises) {
    for (const pattern of sel.ex.patterns) {
      actualCoverage.add(String(pattern));
    }
  }
  
  const uncoveredRequired = effectiveRequired.filter(p => !actualCoverage.has(String(p)));
  if (uncoveredRequired.length > 0) {
    console.warn(`⚠️  Uncovered required patterns: ${uncoveredRequired.join(', ')}`);
    
    // Добавляем объяснения для НЕ покрытых паттернов
    const painArray = Array.from(readiness.painByLocation.entries()).map(([location, level]) => ({
      location,
      level
    }));
    
    const uncoveredExplanations = generateMissedPatternExplanations(
      uncoveredRequired,
      painArray,
      readiness.corePolicy
    );
    
    if (uncoveredExplanations.length > 0) {
      missedPatternExplanations.push(...uncoveredExplanations);
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2.5: НОВОЕ - Get progression recommendations
  // -------------------------------------------------------------------------
  let progressionRecommendations = new Map<string, ProgressionRecommendation>();
  
  if (userProfile.userId) {
    try {
      const { getNextWorkoutRecommendations } = await import("./progressionService.js");
      const exercisesForProgression = selectedExercises.map(s => s.ex);
      
      progressionRecommendations = await getNextWorkoutRecommendations({
        userId: userProfile.userId,
        exercises: exercisesForProgression,
        goal: userProfile.goal,
        experience: userProfile.experience,
      });
      
      console.log(`  [Progression] Got recommendations for ${progressionRecommendations.size} exercises`);
    } catch (err) {
      console.warn(`  [Progression] Failed to get recommendations:`, err);
      // Continue without progression data
    }
  }

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

    // НОВОЕ: Get progression recommendation for this exercise
    const recommendation = progressionRecommendations.get(ex.id);
    let suggestedWeight: number | undefined;
    let progressionNote: string | undefined;
    
	    if (recommendation) {
	      if (recommendation.newWeight !== undefined && recommendation.newWeight > 0) {
	        suggestedWeight = recommendation.newWeight;
	      }

        const emojiByAction: Record<ProgressionRecommendation["action"], string> = {
          increase_weight: "💪",
          increase_reps: "💪",
          deload: "🛌",
          decrease_weight: "📉",
          maintain: "➡️",
          rotate_exercise: "🔄",
        };

        const emoji = emojiByAction[recommendation.action];

	      progressionNote = (emoji ? `${emoji} ` : "") + String(recommendation.reason || "").trim();
	    }

	    return {
	      ...inferLoadInfo(ex),
	      exercise: ex, // КРИТИЧНО: ex уже Exercise (из selected.ex)
	      sets,
	      repsRange,
	      restSec,
	      notes: Array.isArray(ex.cues) ? ex.cues.join(". ") : (ex.cues || ""),
      role, // Role из селектора (правильно downgraded для doubles)
      coversPatterns: ex.patterns, // NEW: для coverage-aware trimming
      suggestedWeight, // NEW: Рекомендуемый вес от прогрессии
      progressionNote, // NEW: Заметка о прогрессии
    } as DayExercise;
  });

  // -------------------------------------------------------------------------
  // STEP 4: NEW - Coverage-aware fitSession (заменяет старую логику урезания)
  // -------------------------------------------------------------------------
  
  console.log(`  Selected ${exercises.length} exercises, ${exercises.reduce((s, e) => s + e.sets, 0)} sets total`);
  
  // Get session caps from Volume Engine
  const sessionCaps = getSessionCaps(
    userProfile.experience,
    effectiveTimeBucket as TimeBucket,
    intent
  );
  
  console.log(`  Session caps: ${sessionCaps.minExercises}-${sessionCaps.maxExercises} exercises, max ${sessionCaps.maxSets} sets`);
  
  // Fit session to time and caps (coverage-aware, sets-first)
  const fitResult = fitSession({
    exercises,
    required: effectiveRequired,
    corePolicy: readiness.corePolicy,
    maxMinutes: readiness.effectiveMinutes,
    caps: sessionCaps,
    dupIntensity,
    intent,
  });
  
  if (fitResult.trimmed) {
    console.log(`\n  ⚙️  TRIM APPLIED:`);
    fitResult.logs.forEach(log => console.log(log));
  }
  
  // Recalculate after trimming
  const totalExercises = exercises.length;
  const totalSets = exercises.reduce((sum, e) => sum + e.sets, 0);
  const estimatedDuration = estimateDuration(exercises);
  
  console.log(`\n  ✅ FINAL WORKOUT:`);
  console.log(`     Total: ${totalExercises} exercises, ${totalSets} sets, ${estimatedDuration} min`);
  
  // Final validation (только для отладки/логов)
  const finalValidation = validateWorkoutVolume({
    totalSets,
    totalExercises,
    experience: userProfile.experience,
    timeBucket: effectiveTimeBucket as TimeBucket,
    intent,
  });
  
  if (!finalValidation.valid) {
    console.warn(`  ⚠️  Final validation warnings:`);
    finalValidation.warnings.forEach(w => console.warn(`     ${w}`));
  }

  // OLD wasReducedForTime logic REMOVED - now handled by fitSession above
  const wasReducedForTime = fitResult.trimmed; // For compatibility with adaptation notes below

  // -------------------------------------------------------------------------
  // STEP 5: Generate adaptation notes and warnings
  // -------------------------------------------------------------------------
  
  const adaptationNotes: string[] = [];
  const warnings: string[] = [];

  // НОВОЕ: Используем warnings из readiness (единый источник правды)
  warnings.push(...readiness.warnings);
  
  // НОВОЕ: Добавляем объяснения пропущенных паттернов
  if (missedPatternExplanations.length > 0) {
    warnings.push(...missedPatternExplanations);
  }

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

export async function generateWeekPlan(args: {
  scheme: NormalizedWorkoutScheme;
  userProfile: UserProfile;
  mesocycle?: Mesocycle; // НОВОЕ: мезоцикл для периодизации
  checkins?: CheckInData[]; // One per day
  history?: WorkoutHistory;
}): Promise<GeneratedWorkoutDay[]> {
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
  
  // NEW H: Weekly volume tracking for muscle balance
  const weeklyProgress = new Map<string, number>(); // muscle -> sets accumulated
  const targetPerWeek = MAX_RECOVERABLE_VOLUME[userProfile.experience].perMusclePerWeek;

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

    const dayPlan = await generateWorkoutDay({
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
      
      // NEW H: Update weekly volume progress
      for (const muscle of ex.exercise.primaryMuscles) {
        const current = weeklyProgress.get(muscle) || 0;
        weeklyProgress.set(muscle, current + ex.sets);
      }
    });
  }

  return weekPlan;
}

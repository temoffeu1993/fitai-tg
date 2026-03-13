// periodization/dayPrescription.ts
// ============================================================================
// DAY PRESCRIPTION — THE CENTRAL OBJECT
//
// Assembles all upper-layer contexts into one prescription for today:
//   Calibration + WeekContext + SplitContext + ReadinessConstraints
//   + goal + experience → DayPrescription
//
// Owner: Day Prescription layer
// Forbidden: cannot choose specific exercises, cannot change progression state
//
// KEY RULES:
// 1. repProfile is ALWAYS per-role (main, secondary, accessory, pump, conditioning)
// 2. Accessories ALWAYS stay in hypertrophy-safe ranges (≥8 reps)
// 3. Deload → cannot be strength_biased
// 4. Calibration → uncalibrated exercises get safe mid-range (per-exercise override)
// 5. DUP shifts main/secondary rep ranges, NOT accessories
// ============================================================================

import type {
  DayPrescription,
  DayStyle,
  DUPIntensity,
  RoleRepProfile,
  RoleSetProfile,
  RoleRestProfile,
  CalibrationContext,
  WeekContext,
  SplitContext,
  ReadinessConstraints,
  ExperienceLevel,
} from "./periodizationTypes.js";
import type { Goal } from "../normalizedSchemes.js";

// ============================================================================
// BASE PROFILES — goal-standard rep/rest ranges (from volumeEngine.ts)
// ============================================================================

const BASE_REPS: Record<Goal, { main: [number, number]; secondary: [number, number]; accessory: [number, number] }> = {
  build_muscle:    { main: [6, 10],  secondary: [8, 12],  accessory: [10, 15] },
  lose_weight:     { main: [12, 15], secondary: [12, 18], accessory: [15, 20] },
  athletic_body:   { main: [8, 12],  secondary: [10, 15], accessory: [12, 18] },
  health_wellness: { main: [8, 12],  secondary: [10, 15], accessory: [12, 18] },
};

const BASE_REST: Record<Goal, { main: number; secondary: number; accessory: number }> = {
  build_muscle:    { main: 120, secondary: 90, accessory: 60 },
  lose_weight:     { main: 90,  secondary: 60, accessory: 45 },
  athletic_body:   { main: 90,  secondary: 75, accessory: 60 },
  health_wellness: { main: 90,  secondary: 75, accessory: 60 },
};

// ============================================================================
// DUP PROFILES — rep range shifts for DUP intensity
// These replace DUP_REPS from workoutDayGenerator.ts, but are per-role.
//
// KEY CHANGE: accessories are NEVER affected by DUP.
// Previous code had all exercises at [4,6] on heavy day — WRONG.
// ============================================================================

/** DUP-adjusted rep ranges by goal + intensity. Only for main/secondary. */
const DUP_REPS_BY_GOAL: Record<Goal, Record<DUPIntensity, { main: [number, number]; secondary: [number, number] }>> = {
  build_muscle: {
    heavy:  { main: [4, 6],   secondary: [6, 8]   },
    medium: { main: [6, 10],  secondary: [8, 12]  },
    light:  { main: [10, 15], secondary: [12, 15] },
  },
  lose_weight: {
    heavy:  { main: [10, 12], secondary: [10, 12] },
    medium: { main: [12, 15], secondary: [12, 18] },
    light:  { main: [15, 20], secondary: [15, 20] },
  },
  athletic_body: {
    heavy:  { main: [4, 6],   secondary: [6, 8]   },
    medium: { main: [8, 12],  secondary: [10, 15] },
    light:  { main: [12, 18], secondary: [12, 18] },
  },
  health_wellness: {
    heavy:  { main: [8, 10],  secondary: [8, 10]  },
    medium: { main: [10, 15], secondary: [10, 15] },
    light:  { main: [12, 18], secondary: [12, 18] },
  },
};

/** DUP set multipliers */
const DUP_SET_MULT: Record<DUPIntensity, number> = {
  heavy: 1.0,
  medium: 1.0,
  light: 0.85,
};

/** DUP rest multipliers */
const DUP_REST_MULT: Record<DUPIntensity, number> = {
  heavy: 1.2,
  medium: 1.0,
  light: 0.8,
};

// ============================================================================
// DAY STYLE DETERMINATION
// ============================================================================

function determineDayStyle(args: {
  dupIntensity: DUPIntensity | null;
  weekContext: WeekContext;
  readiness: ReadinessConstraints;
  calibration: CalibrationContext;
}): { dayStyle: DayStyle; reason: string } {
  const { dupIntensity, weekContext, readiness, calibration } = args;

  // Priority 1: Recovery required
  if (readiness.recoveryRequired) {
    return { dayStyle: "recovery", reason: "Восстановительная тренировка по самочувствию" };
  }

  // Priority 2: Deload week
  if (weekContext.isDeloadWeek) {
    return { dayStyle: "deload", reason: "Разгрузочная неделя" };
  }

  // Priority 3: Low readiness
  if (readiness.allowedAggressiveness === "light") {
    return { dayStyle: "recovery", reason: "Лёгкая тренировка по самочувствию" };
  }

  // Priority 4: Global calibration (all exercises new)
  if (calibration.globalCalibrationMode) {
    return { dayStyle: "balanced", reason: "Подбор рабочих весов" };
  }

  // Priority 5: DUP-based style
  if (dupIntensity) {
    switch (dupIntensity) {
      case "heavy":
        return { dayStyle: "strength_biased", reason: "Силовой день: меньше повторов, больше вес" };
      case "light":
        return { dayStyle: "hypertrophy_biased", reason: "Объёмный день: больше повторов, легче вес" };
      case "medium":
        return { dayStyle: "balanced", reason: "Сбалансированный день" };
    }
  }

  // Default: balanced
  return { dayStyle: "balanced", reason: "Стандартная тренировка" };
}

// ============================================================================
// MAIN: Build DayPrescription
// ============================================================================

export function buildDayPrescription(args: {
  dayIndex: number;
  goal: Goal;
  experience: ExperienceLevel;
  calibration: CalibrationContext;
  week: WeekContext;
  split: SplitContext;
  readiness: ReadinessConstraints;
}): DayPrescription {
  const { dayIndex, goal, experience, calibration, week, split, readiness } = args;

  // ── Resolve DUP intensity for this day ──
  let dupIntensity: DUPIntensity | null = null;

  if (split.periodizationScope !== "off" && week.periodizationMode !== "off") {
    dupIntensity = split.dayWaveAssignment[dayIndex] ?? null;
  }

  // Calibration can further suppress DUP for the day (global mode only)
  if (calibration.globalCalibrationMode) {
    dupIntensity = null;
  }

  // ── Determine day style ──
  const { dayStyle, reason: dayStyleReason } = determineDayStyle({
    dupIntensity,
    weekContext: week,
    readiness,
    calibration,
  });

  // ── Build rep profile ──
  const repProfile = buildRepProfile(goal, experience, dupIntensity, dayStyle, calibration);

  // ── Build set profile ──
  const setProfile = buildSetProfile(dupIntensity, week, dayStyle);

  // ── Build rest profile ──
  const restProfile = buildRestProfile(dupIntensity, dayStyle);

  // ── Fatigue target ──
  const fatigueTarget = dayStyle === "recovery" || dayStyle === "deload"
    ? "low"
    : dupIntensity === "heavy"
      ? "high"
      : dupIntensity === "light"
        ? "low"
        : "moderate";

  // ── Allow DUP for main/secondary? ──
  // Only if DUP is active AND exercise is calibrated (checked per-exercise later)
  const allowDUPForMainSecondary = dupIntensity !== null;

  return {
    dayStyle,
    repProfile,
    setProfile,
    restProfile,
    fatigueTarget,
    dupIntensity,
    allowDUPForMainSecondary,
    accessoryPolicy: "hypertrophy_safe",
    dayStyleReason,
    calibration,
    week,
    split,
    readiness,
  };
}

// ============================================================================
// PROFILE BUILDERS
// ============================================================================

function buildRepProfile(
  goal: Goal,
  experience: ExperienceLevel,
  dupIntensity: DUPIntensity | null,
  dayStyle: DayStyle,
  calibration: CalibrationContext,
): RoleRepProfile {
  const base = BASE_REPS[goal];

  // Start with goal-standard ranges
  let mainReps: [number, number] = [...base.main] as [number, number];
  let secondaryReps: [number, number] = [...base.secondary] as [number, number];
  const accessoryReps: [number, number] = [...base.accessory] as [number, number];

  // Apply DUP shift for main/secondary (NOT accessories)
  if (dupIntensity && dayStyle !== "recovery" && dayStyle !== "deload") {
    const dupReps = DUP_REPS_BY_GOAL[goal][dupIntensity];
    mainReps = [...dupReps.main] as [number, number];
    secondaryReps = [...dupReps.secondary] as [number, number];
  }

  // Deload: widen ranges toward hypertrophy
  if (dayStyle === "deload") {
    mainReps = [...base.main] as [number, number]; // goal-standard, no DUP
    secondaryReps = [...base.secondary] as [number, number];
  }

  // Recovery: safe mid-ranges
  if (dayStyle === "recovery") {
    mainReps = [...base.accessory] as [number, number]; // use accessory ranges (higher reps, safer)
    secondaryReps = [...base.accessory] as [number, number];
  }

  // Enforce safe rep floor (calibration + experience)
  // This is a global floor — per-exercise override happens in Exercise Prescription
  const floor = calibration.safeRepFloor;
  if (mainReps[0] < floor && calibration.globalCalibrationMode) {
    mainReps = [floor, Math.max(mainReps[1], floor + 4)];
  }
  if (secondaryReps[0] < floor && calibration.globalCalibrationMode) {
    secondaryReps = [floor, Math.max(secondaryReps[1], floor + 4)];
  }

  return {
    main: mainReps,
    secondary: secondaryReps,
    accessory: accessoryReps,
    pump: accessoryReps, // pump uses same as accessory
    conditioning: [15, 25], // conditioning always high rep
  };
}

function buildSetProfile(
  dupIntensity: DUPIntensity | null,
  week: WeekContext,
  dayStyle: DayStyle,
): RoleSetProfile {
  const baseMult = week.weeklyVolumeMultiplier;
  const dupMult = dupIntensity ? DUP_SET_MULT[dupIntensity] : 1.0;

  let dayMult = baseMult * dupMult;

  // Recovery/deload: reduce volume
  if (dayStyle === "recovery") dayMult *= 0.6;
  if (dayStyle === "deload") dayMult *= 0.6;

  return {
    main: dayMult,
    secondary: dayMult,
    accessory: dayMult,
    pump: dayMult,
    conditioning: dayMult,
  };
}

function buildRestProfile(
  dupIntensity: DUPIntensity | null,
  dayStyle: DayStyle,
): RoleRestProfile {
  const dupMult = dupIntensity ? DUP_REST_MULT[dupIntensity] : 1.0;

  let restMult = dupMult;

  // Recovery: more rest
  if (dayStyle === "recovery") restMult *= 1.3;

  return {
    main: restMult,
    secondary: restMult,
    accessory: 1.0, // accessories keep standard rest regardless of DUP
    pump: 0.8,      // pump exercises get shorter rest
    conditioning: 0.5,
  };
}

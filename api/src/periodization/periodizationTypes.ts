// periodization/periodizationTypes.ts
// ============================================================================
// CANONICAL DTOs for the 10-layer periodization architecture.
//
// Rules:
//  - Each DTO has ONE owner layer (noted in comments).
//  - Lower layers MUST NOT overwrite fields owned by upper layers.
//  - DayPrescription is the CENTRAL object.
//  - repProfile is ALWAYS per-role, never a single range.
//  - Calibration is per-exercise, not per-day.
// ============================================================================

import type { Goal } from "../normalizedSchemes.js";
import type { SlotRole } from "../patternRoles.js";

// ============================================================================
// ENUMS & BASIC TYPES
// ============================================================================

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

/** Weekly periodization mode */
export type WeekMode =
  | "accumulation"      // Weeks 1-2: normal volume, adaptation
  | "intensification"   // Weeks 3-4: increased load (+10%)
  | "deload"            // Recovery week (-40% volume)
  | "realization"       // Peak/solidify gains
  | "normal";           // Default when no mesocycle active

/** How DUP periodization is applied */
export type PeriodizationMode =
  | "off"               // No DUP (PPL 3x, bro split, beginner 2x, etc.)
  | "mild_dup"          // Reserved for future: gentle variation
  | "full_dup";         // Full heavy/medium/light wave

/** Day training style */
export type DayStyle =
  | "strength_biased"   // Low reps on main, longer rest
  | "hypertrophy_biased" // Moderate/high reps, moderate rest
  | "balanced"          // Goal-standard profile
  | "recovery"          // Reduced sets, safe ranges
  | "deload";           // Scheduled deload — minimal volume

/** DUP intensity level (per exposure) */
export type DUPIntensity = "heavy" | "medium" | "light";

/** Load bucket for rep-bucket progression (Этап 8A) */
export type LoadBucket = "calibration" | "low_rep" | "moderate_rep" | "high_rep";

// ============================================================================
// LAYER 0: CalibrationContext
// Owner: Calibration layer
// Forbidden: cannot change split, week plan, exercise list
// ============================================================================

export interface CalibrationContext {
  /** Global calibration mode (true if ALL main exercises lack history) */
  globalCalibrationMode: boolean;

  /**
   * Per-exercise calibration status.
   * Key = exerciseId, value = true if that exercise is uncalibrated.
   * Used for exercise-level DUP override (NOT day-level DUP kill).
   */
  calibrationByExercise: Map<string, boolean>;

  /**
   * Per-pattern calibration status.
   * Key = pattern, value = true if NO exercise in that pattern has history.
   * Fallback when specific exercise has no data but pattern does.
   */
  calibrationByPattern: Map<string, boolean>;

  /** Is periodization allowed based on calibration state? */
  periodizationAllowed: boolean;

  /** Safe rep floor for uncalibrated exercises */
  safeRepFloor: number; // e.g. 6 for build_muscle beginner

  /** Load guidance mode for exercises without history */
  starterLoadMode: "none" | "starter" | "progression";
}

// ============================================================================
// LAYER 1: WeekContext
// Owner: Week Policy layer
// Forbidden: cannot assign reps/rest/weights per exercise
// ============================================================================

export interface WeekContext {
  /** Current mesocycle week number (1-8) */
  weekNumber: number;

  /** Weekly training mode */
  weekMode: WeekMode;

  /** Volume scaling factor (1.0 = normal, 0.6 = deload, 1.1 = intensification) */
  weeklyVolumeMultiplier: number;

  /** Is this a scheduled deload week? */
  isDeloadWeek: boolean;

  /** Is periodization (DUP) allowed this week? (deload → off) */
  periodizationMode: PeriodizationMode;

  /** Overall intensity bias for the week */
  intensityBias: "low" | "medium" | "high";
}

// ============================================================================
// LAYER 2: SplitContext
// Owner: Split Policy layer
// Forbidden: cannot assign volume, weights, readiness
// ============================================================================

/** Which exposure group a day belongs to (for DUP wave assignment) */
export interface ExposureGroup {
  /** Group name, e.g. "upper", "lower", "push", "pull", "legs", "full_body" */
  groupName: string;

  /** Which days (by index) belong to this group */
  dayIndices: number[];
}

export interface SplitContext {
  /** Scheme ID (e.g. "ul_4x_classic_ab") */
  schemeId: string;

  /** Split family for policy decisions */
  splitFamily: "full_body" | "upper_lower" | "push_pull_legs" | "bro_split" | "conditioning" | "other";

  /** Is DUP allowed for this split? */
  periodizationScope: PeriodizationMode;

  /**
   * Exposure groups for DUP wave assignment.
   * DUP waves across days WITHIN the same group (same muscles), not across groups.
   *
   * Example UL 4x:
   *   [{ groupName: "upper", dayIndices: [0, 2] },
   *    { groupName: "lower", dayIndices: [1, 3] }]
   *
   * Example PPL 6x:
   *   [{ groupName: "push", dayIndices: [0, 3] },
   *    { groupName: "pull", dayIndices: [1, 4] },
   *    { groupName: "legs", dayIndices: [2, 5] }]
   */
  exposureGroups: ExposureGroup[];

  /**
   * DUP wave assignment per day index.
   * Derived from exposure groups. null = no DUP for this day.
   *
   * Example UL 4x: [heavy, null, light, null]
   *   Upper A = heavy, Lower A = no DUP, Upper B = light, Lower B = no DUP
   *   (Lower gets its own wave: Lower A = heavy, Lower B = light)
   *
   * Actually stored as the final resolved intensity per day.
   */
  dayWaveAssignment: Array<DUPIntensity | null>;
}

// ============================================================================
// LAYER 3: ReadinessConstraints
// Owner: Readiness Constraints layer (pre-exercise-selection)
// Forbidden: cannot assign reps/sets/weights, cannot change periodization
// ============================================================================

export interface ReadinessConstraints {
  /** Movement patterns that are blocked today (e.g. "squat" due to knee pain) */
  blockedPatterns: string[];

  /** Available training time in minutes */
  availableMinutes: number;

  /** Maximum allowed day aggressiveness */
  allowedAggressiveness: "full" | "moderate" | "light" | "recovery_only";

  /** Pain flags by location */
  painFlags: Array<{ location: string; level: number }>;

  /** Is this a forced recovery day? */
  recoveryRequired: boolean;

  /** Intent derived from readiness (normal / light / hard) */
  readinessIntent: "normal" | "light" | "hard";

  /** Reason for any readiness modification */
  readinessReason?: string;
}

// ============================================================================
// LAYER 4: DayPrescription — THE CENTRAL OBJECT
// Owner: Day Prescription layer
// Forbidden: cannot choose specific exercises, cannot change progression state
//
// IMPORTANT: repProfile is ALWAYS per-role.
// A "strength_biased" day has:
//   main: [4, 6], secondary: [6, 10], accessory: [10, 15]
// NOT all exercises at [4, 6].
// ============================================================================

/** Rep range per exercise role */
export interface RoleRepProfile {
  main: [number, number];
  secondary: [number, number];
  accessory: [number, number];
  pump: [number, number];
  conditioning: [number, number];
}

/** Sets multiplier per exercise role */
export interface RoleSetProfile {
  main: number;       // multiplier applied to base sets
  secondary: number;
  accessory: number;
  pump: number;
  conditioning: number;
}

/** Rest multiplier per exercise role */
export interface RoleRestProfile {
  main: number;       // multiplier applied to base rest
  secondary: number;
  accessory: number;
  pump: number;
  conditioning: number;
}

export interface DayPrescription {
  /** Training style for this day */
  dayStyle: DayStyle;

  /** Per-role rep ranges */
  repProfile: RoleRepProfile;

  /** Per-role set multipliers (1.0 = normal) */
  setProfile: RoleSetProfile;

  /** Per-role rest multipliers (1.0 = normal) */
  restProfile: RoleRestProfile;

  /** Target fatigue level */
  fatigueTarget: "low" | "moderate" | "high";

  /** DUP intensity for this day (null if DUP off) */
  dupIntensity: DUPIntensity | null;

  /** Are main/secondary exercises allowed to get periodized profiles? */
  allowDUPForMainSecondary: boolean;

  /** Policy for accessory exercises (always hypertrophy-safe) */
  accessoryPolicy: "hypertrophy_safe"; // never low-rep for accessories

  /** Why this day style was chosen (for user-facing explanations) */
  dayStyleReason: string;

  // --- Source context (for downstream layers) ---
  /** Calibration context (for exercise-level overrides) */
  calibration: CalibrationContext;
  /** Week context */
  week: WeekContext;
  /** Split context */
  split: SplitContext;
  /** Readiness constraints */
  readiness: ReadinessConstraints;
}

// ============================================================================
// LAYER 8: LoadContext
// Owner: Load Prescription layer
// Forbidden: cannot change reps/rest/sets/exercise choice
// ============================================================================

export interface LoadContext {
  /** Which rep bucket this exercise falls into today */
  loadBucket: LoadBucket;

  /** Suggested weight for today */
  suggestedWeightToday: number | null;

  /** Progression action */
  progressionAction: "increase_weight" | "increase_reps" | "maintain" | "decrease_weight" | "deload" | "calibrate";

  /** Human-readable reason */
  progressionReason: string;
}

// ============================================================================
// BACKWARD COMPATIBILITY DEFAULTS
// For plans saved before DayPrescription was introduced (Этап 7)
// ============================================================================

export const FALLBACK_DEFAULTS = {
  dayStyle: "balanced" as DayStyle,
  weekMode: "normal" as WeekMode,
  loadBucket: "moderate_rep" as LoadBucket,
  calibrationApplied: false,
  periodizationMode: "off" as PeriodizationMode,
} as const;

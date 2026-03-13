// periodization/readinessAdaptation.ts
// ============================================================================
// POST-ASSIGNMENT READINESS ADAPTATION (Layer 8 in 10-layer architecture)
//
// Runs AFTER exercises are selected and assigned their base sets/reps/rest.
// Applies per-exercise modifications based on pain proximity, soreness, etc.
//
// Owner: Readiness Adaptation layer
// Forbidden: cannot change exercise list (that's pre-selection),
//   cannot change progression state
//
// KEY RULES:
// 1. Only REDUCES — never increases volume, weight, or intensity
// 2. Per-exercise: checks if exercise's jointFlags match user's pain locations
// 3. Accessories near pain zones get larger reductions than compounds
// 4. Always explains what was changed and why (adaptationNotes)
// ============================================================================

import type { JointFlag } from "../exerciseLibrary.js";
import type { ReadinessConstraints } from "./periodizationTypes.js";

// ============================================================================
// TYPES
// ============================================================================

/** Describes one exercise to be adapted */
export interface ExerciseToAdapt {
  exerciseId: string;
  exerciseName: string;
  role: "main" | "secondary" | "accessory" | "pump" | "conditioning";
  sets: number;
  repsRange: [number, number];
  restSec: number;
  suggestedWeight?: number;
  jointFlags: JointFlag[];
  patterns: string[];
}

/** Result of adaptation for one exercise */
export interface AdaptedExercise {
  exerciseId: string;
  sets: number;
  repsRange: [number, number];
  restSec: number;
  weightMultiplier: number; // 1.0 = no change, 0.85 = -15%
  adaptationApplied: boolean;
  adaptationReason?: string;
}

/** Result of the full adaptation pass */
export interface AdaptationResult {
  exercises: AdaptedExercise[];
  adaptationNotes: string[];
  totalSetsReduced: number;
  anyAdaptation: boolean;
}

// ============================================================================
// PAIN → JOINT FLAG MAPPING
// (mirrors readiness.ts mapPainToBlocks but for post-assignment adaptation)
// ============================================================================

/** Which JointFlags are affected by pain at a given location */
const PAIN_LOCATION_TO_FLAGS: Record<string, JointFlag[]> = {
  shoulder: ["shoulder_sensitive"],
  elbow: ["elbow_sensitive"],
  wrist: ["wrist_sensitive"],
  neck: ["neck_sensitive", "shoulder_sensitive"], // neck pain affects overhead too
  lower_back: ["low_back_sensitive"],
  hip: ["hip_sensitive"],
  knee: ["knee_sensitive"],
  ankle: ["knee_sensitive"], // ankle pain affects knee-loaded movements
};

/** Pain level thresholds for adaptation */
const ADAPTATION_THRESHOLDS = {
  /** Level at which we start reducing weight (-10%) */
  weightReduction: 4,
  /** Level at which we reduce sets by 1 */
  setsReduction: 5,
  /** Level at which we increase rest (+20%) */
  restIncrease: 4,
  /** Level at which accessories get aggressive reduction */
  accessoryAggressiveReduction: 6,
} as const;

// ============================================================================
// MAIN: Apply readiness adaptation
// ============================================================================

/**
 * Apply post-assignment readiness adaptation to exercises.
 *
 * This runs AFTER DayPrescription sets/reps/rest are applied.
 * It further adjusts per-exercise based on pain proximity.
 *
 * @param exercises - Exercises with their assigned sets/reps/rest
 * @param readiness - ReadinessConstraints from the periodization pipeline
 * @returns Adapted exercises with notes
 */
export function applyReadinessAdaptation(args: {
  exercises: ExerciseToAdapt[];
  readiness: ReadinessConstraints;
}): AdaptationResult {
  const { exercises, readiness } = args;

  // Build a map of active pain flags → pain level
  const activePainByFlag = new Map<JointFlag, number>();
  for (const pain of readiness.painFlags) {
    const flags = PAIN_LOCATION_TO_FLAGS[pain.location] ?? [];
    for (const flag of flags) {
      const existing = activePainByFlag.get(flag) ?? 0;
      activePainByFlag.set(flag, Math.max(existing, pain.level));
    }
  }

  // If no pain flags, nothing to adapt
  if (activePainByFlag.size === 0 && readiness.allowedAggressiveness === "full") {
    return {
      exercises: exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        sets: ex.sets,
        repsRange: ex.repsRange,
        restSec: ex.restSec,
        weightMultiplier: 1.0,
        adaptationApplied: false,
      })),
      adaptationNotes: [],
      totalSetsReduced: 0,
      anyAdaptation: false,
    };
  }

  const adaptedExercises: AdaptedExercise[] = [];
  const adaptationNotes: string[] = [];
  let totalSetsReduced = 0;
  let anyAdaptation = false;

  for (const ex of exercises) {
    let adapted = false;
    let reason = "";
    let sets = ex.sets;
    let repsRange: [number, number] = [...ex.repsRange];
    let restSec = ex.restSec;
    let weightMultiplier = 1.0;

    // Check if this exercise's jointFlags overlap with active pain
    let maxPainForExercise = 0;
    let painLocation = "";
    for (const flag of ex.jointFlags) {
      const painLevel = activePainByFlag.get(flag);
      if (painLevel && painLevel > maxPainForExercise) {
        maxPainForExercise = painLevel;
        // Reverse lookup for user-facing message
        for (const [loc, flags] of Object.entries(PAIN_LOCATION_TO_FLAGS)) {
          if (flags.includes(flag)) {
            painLocation = loc;
            break;
          }
        }
      }
    }

    if (maxPainForExercise >= ADAPTATION_THRESHOLDS.weightReduction) {
      adapted = true;

      // Weight reduction
      if (maxPainForExercise >= 7) {
        weightMultiplier = 0.75; // -25% for severe pain
      } else if (maxPainForExercise >= 5) {
        weightMultiplier = 0.85; // -15% for moderate pain
      } else {
        weightMultiplier = 0.90; // -10% for mild pain
      }

      // Rest increase
      if (maxPainForExercise >= ADAPTATION_THRESHOLDS.restIncrease) {
        restSec = Math.round(restSec * 1.2); // +20% rest
      }

      // Sets reduction for accessories/pump near pain zones
      if (
        (ex.role === "accessory" || ex.role === "pump") &&
        maxPainForExercise >= ADAPTATION_THRESHOLDS.accessoryAggressiveReduction
      ) {
        const reduction = maxPainForExercise >= 7 ? 2 : 1;
        const newSets = Math.max(1, sets - reduction);
        if (newSets < sets) {
          totalSetsReduced += sets - newSets;
          sets = newSets;
        }
      } else if (
        (ex.role === "main" || ex.role === "secondary") &&
        maxPainForExercise >= ADAPTATION_THRESHOLDS.setsReduction
      ) {
        // Main/secondary: reduce by 1 set max for moderate pain
        const newSets = Math.max(2, sets - 1);
        if (newSets < sets) {
          totalSetsReduced += sets - newSets;
          sets = newSets;
        }
      }

      // Build reason
      const reductionPct = Math.round((1 - weightMultiplier) * 100);
      reason = `Боль ${painLocation} ${maxPainForExercise}/10 → вес -${reductionPct}%`;
      if (sets < ex.sets) {
        reason += `, подходы ${ex.sets}→${sets}`;
      }
    }

    // Global aggressiveness reduction (even if no direct pain match)
    if (readiness.allowedAggressiveness === "moderate" && !adapted) {
      // Moderate readiness: slight weight reduction for everything
      weightMultiplier = 0.95; // -5%
      adapted = true;
      reason = "Умеренное самочувствие → вес -5%";
    }

    if (adapted) {
      anyAdaptation = true;
      adaptationNotes.push(`${ex.exerciseName}: ${reason}`);
    }

    adaptedExercises.push({
      exerciseId: ex.exerciseId,
      sets,
      repsRange,
      restSec,
      weightMultiplier,
      adaptationApplied: adapted,
      adaptationReason: adapted ? reason : undefined,
    });
  }

  return {
    exercises: adaptedExercises,
    adaptationNotes,
    totalSetsReduced,
    anyAdaptation,
  };
}

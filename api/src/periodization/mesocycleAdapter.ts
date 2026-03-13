// periodization/mesocycleAdapter.ts
// ============================================================================
// ADAPTER: Wraps existing mesocycleEngine output into canonical WeekContext DTO.
//
// This adapter allows the old mesocycleEngine to continue working while
// the new periodization system reads from WeekContext.
//
// Owner: Week Policy layer
// ============================================================================

import type { WeekContext, WeekMode, PeriodizationMode } from "./periodizationTypes.js";
import type { DUPIntensity, Mesocycle } from "../mesocycleEngine.js";
import { getWeekPlan } from "../mesocycleEngine.js";
import type { Goal } from "../normalizedSchemes.js";

/**
 * Convert mesocycleEngine.getWeekPlan() output into canonical WeekContext.
 *
 * The key change: mesocycleEngine used to return `dupPattern[]` and the generator
 * would blindly apply it by calendar day index. Now we ONLY return the week-level
 * policy (is DUP allowed? what's the volume?). The actual DUP day assignment
 * is handled by SplitPolicy, not here.
 */
export function buildWeekContext(args: {
  mesocycle: Mesocycle | null;
  weekNumber: number;
  daysPerWeek: number;
  goal: Goal;
}): WeekContext {
  const { mesocycle, weekNumber, daysPerWeek, goal } = args;

  // No active mesocycle → neutral defaults
  if (!mesocycle) {
    return {
      weekNumber: 1,
      weekMode: "normal",
      weeklyVolumeMultiplier: 1.0,
      isDeloadWeek: false,
      periodizationMode: "off",
      intensityBias: "medium",
    };
  }

  // Get week plan from existing engine
  const weekPlan = getWeekPlan({ mesocycle, weekNumber, daysPerWeek });

  // Map phase to WeekMode
  const weekMode: WeekMode = weekPlan.phase as WeekMode;

  // Deload week forces DUP off
  const periodizationMode: PeriodizationMode = weekPlan.isDeloadWeek
    ? "off"
    : "full_dup"; // SplitPolicy will further refine this

  // Map intensity target (mesocycle uses "light", we use "low")
  const intensityBias: WeekContext["intensityBias"] =
    weekPlan.intensityTarget === "light" ? "low" : weekPlan.intensityTarget;

  return {
    weekNumber: weekPlan.weekNumber,
    weekMode,
    weeklyVolumeMultiplier: weekPlan.volumeMultiplier,
    isDeloadWeek: weekPlan.isDeloadWeek,
    periodizationMode,
    intensityBias,
  };
}

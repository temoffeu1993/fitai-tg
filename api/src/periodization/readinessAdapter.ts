// periodization/readinessAdapter.ts
// ============================================================================
// ADAPTER: Wraps existing readiness.ts output into canonical ReadinessConstraints DTO.
//
// This adapter converts the existing Readiness object (from computeReadiness)
// into the ReadinessConstraints format used by the new periodization pipeline.
//
// Owner: Readiness Constraints layer (pre-exercise-selection)
// ============================================================================

import type { ReadinessConstraints } from "./periodizationTypes.js";
import type { Readiness } from "../readiness.js";

/**
 * Convert Readiness (from readiness.ts) → canonical ReadinessConstraints DTO.
 *
 * This runs BEFORE exercise selection.
 * It tells the system what's blocked, how much time is available,
 * and how aggressive the day can be.
 */
export function buildReadinessConstraints(args: {
  readiness: Readiness;
  defaultMinutes: number;
}): ReadinessConstraints {
  const { readiness, defaultMinutes } = args;

  // Map severity to allowed aggressiveness
  let allowedAggressiveness: ReadinessConstraints["allowedAggressiveness"];
  switch (readiness.severity) {
    case "critical":
      allowedAggressiveness = "recovery_only";
      break;
    case "high":
      allowedAggressiveness = "light";
      break;
    case "medium":
      allowedAggressiveness = "moderate";
      break;
    default:
      allowedAggressiveness = "full";
  }

  // Map pain data
  const painFlags: Array<{ location: string; level: number }> = [];
  readiness.painByLocation.forEach((level, location) => {
    painFlags.push({ location, level });
  });

  return {
    blockedPatterns: [...readiness.blockedPatterns],
    availableMinutes: readiness.effectiveMinutes ?? defaultMinutes,
    allowedAggressiveness,
    painFlags,
    recoveryRequired: readiness.severity === "critical",
    readinessIntent: readiness.intent,
    readinessReason: readiness.reasons.length > 0 ? readiness.reasons.join("; ") : undefined,
  };
}

// periodization/splitPolicy.ts
// ============================================================================
// SPLIT POLICY: Determines WHERE and HOW DUP periodization applies
// based on the program structure (split type + day labels).
//
// Owner: Split Policy layer
// Forbidden: cannot assign volume, weights, readiness
//
// KEY RULE: DUP waves across repeated EXPOSURES of the same muscle group,
// NOT across calendar days. For PPL 3x (each group once/week), DUP is off.
// For UL 4x, the wave is Upper A↔Upper B and Lower A↔Lower B.
//
// SAFE DEFAULT: unknown splits → DUP off.
// ============================================================================

import type {
  SplitContext,
  ExposureGroup,
  DUPIntensity,
  PeriodizationMode,
  WeekContext,
} from "./periodizationTypes.js";
import type { ExperienceLevel } from "./periodizationTypes.js";

// ============================================================================
// DUP WAVE SEQUENCES — applied within each exposure group
// ============================================================================

/** Wave patterns by group size (number of repeated exposures) */
const WAVE_BY_GROUP_SIZE: Record<number, DUPIntensity[]> = {
  1: [],                              // single exposure → no wave
  2: ["heavy", "light"],              // A/B → heavy/light
  3: ["heavy", "light", "medium"],    // A/B/C → heavy/light/medium
};

// ============================================================================
// SPLIT FAMILY DETECTION
// ============================================================================

type SplitFamily = SplitContext["splitFamily"];

/**
 * Detect split family from scheme metadata.
 * Uses splitType field from normalizedSchemes if available,
 * with fallback heuristics for safety.
 */
export function detectSplitFamily(schemeId: string, splitType?: string): SplitFamily {
  // Direct mapping from normalizedSchemes splitType
  if (splitType) {
    const mapping: Record<string, SplitFamily> = {
      full_body: "full_body",
      upper_lower: "upper_lower",
      push_pull_legs: "push_pull_legs",
      bro_split: "bro_split",
      conditioning: "conditioning",
      lower_focus: "upper_lower", // lower_focus is structurally upper/lower
      strength_focus: "other",
    };
    return mapping[splitType] ?? "other";
  }

  // Fallback: detect from schemeId
  if (schemeId.startsWith("fb_") || schemeId.includes("full_body")) return "full_body";
  if (schemeId.startsWith("ul_") || schemeId.includes("upper_lower")) return "upper_lower";
  if (schemeId.startsWith("ppl_")) return "push_pull_legs";
  if (schemeId.includes("bro_split")) return "bro_split";
  if (schemeId.includes("conditioning") || schemeId.includes("fat_loss")) return "conditioning";
  if (schemeId.includes("lower_focus")) return "upper_lower";

  return "other"; // safe default
}

// ============================================================================
// EXPOSURE GROUP DETECTION
// ============================================================================

/**
 * Build exposure groups from day labels.
 * Groups days that train the same muscle groups.
 */
function buildExposureGroups(
  dayLabels: string[],
  splitFamily: SplitFamily
): ExposureGroup[] {
  switch (splitFamily) {
    case "full_body":
      return buildFullBodyGroups(dayLabels);
    case "upper_lower":
      return buildUpperLowerGroups(dayLabels);
    case "push_pull_legs":
      return buildPPLGroups(dayLabels);
    case "bro_split":
      return buildBroSplitGroups(dayLabels);
    case "conditioning":
      return buildConditioningGroups(dayLabels);
    default:
      return []; // unknown → no groups → DUP off
  }
}

function buildFullBodyGroups(dayLabels: string[]): ExposureGroup[] {
  // Full body: all training days are one group (same muscles each day)
  // Filter out recovery/conditioning/mobility days
  const trainingDayIndices = dayLabels
    .map((label, idx) => ({ label: label.toLowerCase(), idx }))
    .filter(d =>
      !d.label.includes("recovery") &&
      !d.label.includes("conditioning") &&
      !d.label.includes("mobility") &&
      !d.label.includes("light day") &&
      !d.label.includes("light movement") &&
      !d.label.includes("active recovery")
    )
    .map(d => d.idx);

  if (trainingDayIndices.length < 2) return [];

  return [{ groupName: "full_body", dayIndices: trainingDayIndices }];
}

function buildUpperLowerGroups(dayLabels: string[]): ExposureGroup[] {
  const upper: number[] = [];
  const lower: number[] = [];

  dayLabels.forEach((label, idx) => {
    const l = label.toLowerCase();
    if (l.includes("upper") || l.includes("верх") || l.includes("push") || l.includes("pull")) {
      upper.push(idx);
    } else if (l.includes("lower") || l.includes("низ") || l.includes("ноги") || l.includes("legs") || l.includes("glutes") || l.includes("quads")) {
      lower.push(idx);
    } else if (l.includes("full body") || l.includes("full_body")) {
      // Hybrid schemes (ul_fb_3x_hybrid): full body day is its own group
      // Don't add to upper or lower
    }
  });

  const groups: ExposureGroup[] = [];
  if (upper.length >= 2) groups.push({ groupName: "upper", dayIndices: upper });
  if (lower.length >= 2) groups.push({ groupName: "lower", dayIndices: lower });

  return groups;
}

function buildPPLGroups(dayLabels: string[]): ExposureGroup[] {
  const push: number[] = [];
  const pull: number[] = [];
  const legs: number[] = [];

  dayLabels.forEach((label, idx) => {
    const l = label.toLowerCase();
    if (l.includes("push") || l.includes("жим")) push.push(idx);
    else if (l.includes("pull") || l.includes("тяга")) pull.push(idx);
    else if (l.includes("legs") || l.includes("ноги")) legs.push(idx);
  });

  const groups: ExposureGroup[] = [];
  if (push.length >= 2) groups.push({ groupName: "push", dayIndices: push });
  if (pull.length >= 2) groups.push({ groupName: "pull", dayIndices: pull });
  if (legs.length >= 2) groups.push({ groupName: "legs", dayIndices: legs });

  return groups;
}

function buildBroSplitGroups(_dayLabels: string[]): ExposureGroup[] {
  // Bro split: each day trains different muscles → no repeated exposures → DUP off
  return [];
}

function buildConditioningGroups(_dayLabels: string[]): ExposureGroup[] {
  // Conditioning splits: mixed modalities → DUP off
  return [];
}

// ============================================================================
// DUP WAVE ASSIGNMENT
// ============================================================================

/**
 * Assign DUP intensity to each day based on exposure groups.
 * Days that don't belong to any group get null (no DUP).
 */
function assignDayWaves(
  totalDays: number,
  groups: ExposureGroup[]
): Array<DUPIntensity | null> {
  const result: Array<DUPIntensity | null> = new Array(totalDays).fill(null);

  for (const group of groups) {
    const wave = WAVE_BY_GROUP_SIZE[group.dayIndices.length];
    if (!wave || wave.length === 0) continue;

    for (let i = 0; i < group.dayIndices.length; i++) {
      const dayIdx = group.dayIndices[i];
      result[dayIdx] = wave[i % wave.length];
    }
  }

  return result;
}

// ============================================================================
// MAIN: Build SplitContext
// ============================================================================

export function buildSplitContext(args: {
  schemeId: string;
  splitType?: string;   // from normalizedSchemes.splitType
  dayLabels: string[];
  daysPerWeek: number;
  experience: ExperienceLevel;
  weekContext: WeekContext;
}): SplitContext {
  const { schemeId, splitType, dayLabels, daysPerWeek, experience, weekContext } = args;

  const splitFamily = detectSplitFamily(schemeId, splitType);

  // ── Rule: Week Policy can disable periodization ──
  if (weekContext.periodizationMode === "off") {
    return {
      schemeId,
      splitFamily,
      periodizationScope: "off",
      exposureGroups: [],
      dayWaveAssignment: new Array(daysPerWeek).fill(null),
    };
  }

  // ── Rule: Beginner with ≤2 days → DUP off ──
  if (experience === "beginner" && daysPerWeek <= 2) {
    return {
      schemeId,
      splitFamily,
      periodizationScope: "off",
      exposureGroups: [],
      dayWaveAssignment: new Array(daysPerWeek).fill(null),
    };
  }

  // ── Build exposure groups ──
  const exposureGroups = buildExposureGroups(dayLabels, splitFamily);

  // ── Rule: No repeated exposures → DUP off (safe default) ──
  if (exposureGroups.length === 0) {
    return {
      schemeId,
      splitFamily,
      periodizationScope: "off",
      exposureGroups: [],
      dayWaveAssignment: new Array(daysPerWeek).fill(null),
    };
  }

  // ── Assign DUP waves by exposure group ──
  const dayWaveAssignment = assignDayWaves(daysPerWeek, exposureGroups);

  // Determine scope
  const periodizationScope: PeriodizationMode = "full_dup";

  return {
    schemeId,
    splitFamily,
    periodizationScope,
    exposureGroups,
    dayWaveAssignment,
  };
}

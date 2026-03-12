// patternRoles.ts — Single source of truth: pattern → role mapping
// Both exerciseSelector and dayPatternMap MUST import from here.

import type { Pattern } from "./exerciseLibrary.js";

export type SlotRole = "main" | "secondary" | "accessory" | "pump" | "conditioning";

// Canonical default role for each pattern.
// dayPatternMap may contextually promote/demote (e.g. isFirst compound → main).
const PATTERN_ROLE: Partial<Record<Pattern, SlotRole>> = {
  // COMPOUND → main
  squat: "main",
  hinge: "main",
  horizontal_push: "main",
  incline_push: "main",
  vertical_push: "main",
  horizontal_pull: "main",
  vertical_pull: "main",

  // COMPOUND (secondary tier) — these support the main lift
  lunge: "secondary",
  hip_thrust: "secondary",

  // LARGE ISOLATION → secondary
  rear_delts: "secondary",
  delts_iso: "secondary",

  // SMALL ISOLATION / CORE → accessory
  triceps_iso: "accessory",
  biceps_iso: "accessory",
  calves: "accessory",
  core: "accessory",
  carry: "accessory",

  // CONDITIONING
  conditioning_low_impact: "conditioning",
  conditioning_intervals: "conditioning",
};

export function getPatternRole(pattern: Pattern | string): SlotRole {
  return PATTERN_ROLE[pattern as Pattern] ?? "secondary";
}

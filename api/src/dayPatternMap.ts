// dayPatternMap.ts
// ============================================================================
// DAY PATTERN MAP: Structure builder for workout days
// 
// Converts: templateRulesId + timeBucket + intent -> Slots[]
// 
// Philosophy:
// - Each templateRulesId defines required/optional patterns
// - timeBucket (45/60/90) controls total slot count
// - intent (light/normal/hard) adjusts volume within slots
// - Roles (main/secondary/accessory) guide exercise selection
// ============================================================================

import type { Pattern } from "./exerciseLibrary.js";
import type { SlotRole } from "./exerciseSelector.js";

export type Intent = "light" | "normal" | "hard";
export type TimeBucket = 45 | 60 | 90;

export type Slot = {
  pattern: Pattern;
  count: number;
  role?: SlotRole;
};

export type DayPatternRules = {
  required: Pattern[];
  optional?: Pattern[];
  preferredDoubles?: Pattern[]; // Patterns that benefit from 2 exercises
};

// ============================================================================
// SLOT RANGES BY TIME BUCKET AND INTENT
// ============================================================================

// Total exercise slots available based on time and readiness
const SLOT_RANGE: Record<TimeBucket, Record<Intent, { min: number; max: number }>> = {
  45: {
    light: { min: 4, max: 5 },
    normal: { min: 5, max: 6 },
    hard: { min: 6, max: 7 },
  },
  60: {
    light: { min: 5, max: 6 },
    normal: { min: 6, max: 7 },
    hard: { min: 7, max: 8 },
  },
  90: {
    light: { min: 6, max: 7 },
    normal: { min: 7, max: 9 },
    hard: { min: 9, max: 10 },
  },
};

// ============================================================================
// TEMPLATE RULES LIBRARY
// ============================================================================

export const TRAINING_RULES_LIBRARY: Record<string, DayPatternRules> = {
  // --------------------------------------------------------------------------
  // FULL BODY DAYS
  // --------------------------------------------------------------------------
  "Full Body A": {
    required: ["squat", "horizontal_push", "horizontal_pull", "core"],
    optional: ["arms_iso", "calves", "carry"],
    preferredDoubles: ["horizontal_pull"], // Can do 2 different pulling exercises
  },
  "Full Body B": {
    required: ["hinge", "vertical_pull", "incline_push", "core"],
    optional: ["rear_delts", "arms_iso", "calves", "carry"],
    preferredDoubles: ["vertical_pull"],
  },
  "Full Body C": {
    required: ["lunge", "horizontal_pull", "horizontal_push", "core"],
    optional: ["delts_iso", "arms_iso", "calves", "carry"],
    preferredDoubles: ["lunge"],
  },

  // --------------------------------------------------------------------------
  // UPPER BODY DAYS
  // --------------------------------------------------------------------------
  "Upper Body": {
    required: ["horizontal_push", "horizontal_pull", "vertical_pull"],
    optional: ["incline_push", "delts_iso", "arms_iso", "rear_delts", "core"],
    preferredDoubles: ["horizontal_pull", "arms_iso"],
  },
  "Upper A": {
    required: ["horizontal_push", "horizontal_pull", "vertical_pull"],
    optional: ["incline_push", "delts_iso", "arms_iso", "rear_delts", "core"],
    preferredDoubles: ["horizontal_push", "horizontal_pull"],
  },
  "Upper B": {
    required: ["vertical_pull", "horizontal_pull", "incline_push"],
    optional: ["horizontal_push", "rear_delts", "arms_iso", "delts_iso", "core"],
    preferredDoubles: ["vertical_pull", "arms_iso"],
  },

  // --------------------------------------------------------------------------
  // LOWER BODY DAYS
  // --------------------------------------------------------------------------
  "Lower Body": {
    required: ["squat", "hinge", "lunge", "core"],
    optional: ["calves", "hip_thrust"],
    preferredDoubles: ["lunge"],
  },
  "Lower A": {
    required: ["squat", "lunge", "core"],
    optional: ["calves", "hinge", "hip_thrust"],
    preferredDoubles: ["squat"],
  },
  "Lower B": {
    required: ["hinge", "hip_thrust", "lunge", "core"],
    optional: ["calves", "squat"],
    preferredDoubles: ["hip_thrust", "lunge"],
  },

  // --------------------------------------------------------------------------
  // PUSH/PULL/LEGS DAYS
  // --------------------------------------------------------------------------
  "Push Day": {
    required: ["horizontal_push", "incline_push", "delts_iso", "triceps_iso"],
    optional: ["vertical_push"], // УБРАНО: rear_delts (это Pull движение!)
    preferredDoubles: ["horizontal_push", "triceps_iso"],
  },
  "Push A": {
    required: ["horizontal_push", "incline_push", "triceps_iso"],
    optional: ["delts_iso", "vertical_push"],
    preferredDoubles: ["horizontal_push"],
  },
  "Push B": {
    required: ["delts_iso", "incline_push", "triceps_iso"],
    optional: ["horizontal_push", "vertical_push"], // УБРАНО: rear_delts (это Pull движение!)
    preferredDoubles: ["delts_iso", "triceps_iso"],
  },
  "Pull Day": {
    required: ["vertical_pull", "horizontal_pull", "rear_delts", "arms_iso"],
    optional: ["core"],
    preferredDoubles: ["horizontal_pull", "arms_iso"],
  },
  "Pull A": {
    required: ["vertical_pull", "rear_delts", "arms_iso"],
    optional: ["horizontal_pull", "core"],
    preferredDoubles: ["vertical_pull"],
  },
  "Pull B": {
    required: ["horizontal_pull", "vertical_pull", "rear_delts", "arms_iso"],
    optional: ["core"],
    preferredDoubles: ["horizontal_pull", "arms_iso"],
  },
  "Legs Day": {
    required: ["squat", "hinge", "lunge", "calves", "core"],
    optional: ["hip_thrust"],
    preferredDoubles: ["lunge"],
  },
  "Legs A": {
    required: ["squat", "lunge", "core"],
    optional: ["calves", "hinge", "hip_thrust"],
    preferredDoubles: ["squat"],
  },
  "Legs B": {
    required: ["hinge", "hip_thrust", "lunge", "core"],
    optional: ["calves", "squat"],
    preferredDoubles: ["hip_thrust"],
  },
};

// ============================================================================
// ROLE ASSIGNMENT LOGIC
// ============================================================================

function assignRole(pattern: Pattern, isFirst: boolean, isDouble: boolean): SlotRole {
  // First compound exercises are typically "main"
  const compoundPatterns: Pattern[] = [
    "squat",
    "hinge",
    "horizontal_push",
    "incline_push",
    "horizontal_pull",
    "vertical_pull",
  ];

  const isolationPatterns: Pattern[] = [
    "triceps_iso",
    "biceps_iso",
    "delts_iso",
    "rear_delts",
    "calves",
  ];

  const coreConditioningPatterns: Pattern[] = [
    "core",
    "carry",
    "conditioning_low_impact",
    "conditioning_intervals",
  ];

  if (compoundPatterns.includes(pattern)) {
    if (isFirst) return "main";
    return "secondary";
  }

  if (isolationPatterns.includes(pattern)) {
    return isDouble ? "accessory" : "accessory";
  }

  if (pattern === "lunge" || pattern === "hip_thrust") {
    return isFirst ? "secondary" : "accessory";
  }

  if (coreConditioningPatterns.includes(pattern)) {
    return "conditioning";
  }

  return "secondary";
}

// ============================================================================
// BUILD DAY SLOTS
// ============================================================================

export function buildDaySlots(args: {
  templateRulesId: string;
  timeBucket: TimeBucket;
  intent: Intent;
  availableMinutes?: number; // Optional fine-tuning
}): Slot[] {
  const { templateRulesId, timeBucket, intent, availableMinutes } = args;

  const rules = TRAINING_RULES_LIBRARY[templateRulesId];
  if (!rules) {
    throw new Error(`Unknown templateRulesId: ${templateRulesId}`);
  }

  // Determine total slot budget
  const range = SLOT_RANGE[timeBucket][intent];
  let slotBudget = Math.floor((range.min + range.max) / 2);

  // Fine-tune based on exact minutes if provided
  if (availableMinutes) {
    if (timeBucket === 45 && availableMinutes < 40) slotBudget = range.min;
    if (timeBucket === 45 && availableMinutes > 50) slotBudget = range.max;
    if (timeBucket === 60 && availableMinutes < 50) slotBudget = range.min;
    if (timeBucket === 60 && availableMinutes > 70) slotBudget = range.max;
    if (timeBucket === 90 && availableMinutes < 75) slotBudget = range.min;
    if (timeBucket === 90 && availableMinutes > 95) slotBudget = range.max;
  }

  const slots: Slot[] = [];
  const usedPatterns = new Set<Pattern>();

  // -------------------------------------------------------------------------
  // STEP 1: Fill required patterns
  // -------------------------------------------------------------------------
  
  let isFirstCompound = true;

  for (const pattern of rules.required) {
    if (slots.length >= slotBudget) break;

    const isDouble =
      (rules.preferredDoubles?.includes(pattern) && slots.length < slotBudget - 1) ?? false;

    const count = isDouble ? 2 : 1;
    const role = assignRole(pattern, isFirstCompound, isDouble);

    slots.push({ pattern, count, role });
    usedPatterns.add(pattern);

    if (
      ["squat", "hinge", "horizontal_push", "incline_push", "horizontal_pull", "vertical_pull"].includes(
        pattern
      )
    ) {
      isFirstCompound = false;
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2: Fill optional patterns (if budget allows)
  // -------------------------------------------------------------------------
  
  if (rules.optional && slots.length < slotBudget) {
    const remainingBudget = slotBudget - slots.length;

    // Prioritize optionals that fill gaps
    const priorityOptionals = rules.optional.filter(p => !usedPatterns.has(p));

    for (const pattern of priorityOptionals) {
      if (slots.length >= slotBudget) break;

      const role = assignRole(pattern, false, false);
      slots.push({ pattern, count: 1, role });
      usedPatterns.add(pattern);
    }
  }

  // -------------------------------------------------------------------------
  // STEP 3: Adjust for light intent (reduce volume)
  // -------------------------------------------------------------------------
  
  if (intent === "light" && slots.length > range.min) {
    // Remove last accessory/isolation slots
    while (slots.length > range.min) {
      const lastSlot = slots[slots.length - 1];
      if (lastSlot.role === "accessory" || lastSlot.pattern === "arms_iso" || lastSlot.pattern === "calves") {
        slots.pop();
      } else {
        break;
      }
    }
  }

  return slots;
}

// ============================================================================
// HELPER: Get all available template rules IDs
// ============================================================================

export function getAllTemplateRuleIds(): string[] {
  return Object.keys(TRAINING_RULES_LIBRARY);
}

// ============================================================================
// HELPER: Validate that a scheme's templateRulesId exists
// ============================================================================

export function validateTemplateRulesId(id: string): boolean {
  return id in TRAINING_RULES_LIBRARY;
}

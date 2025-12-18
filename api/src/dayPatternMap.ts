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
    optional: ["biceps_iso", "calves", "carry"], // Только бицепс (трицепс в других днях)
    preferredDoubles: ["horizontal_pull"],
  },
  "Full Body B": {
    required: ["hinge", "vertical_pull", "incline_push", "core"],
    optional: ["rear_delts", "triceps_iso", "calves", "carry"], // Только трицепс (бицепс в других днях)
    preferredDoubles: ["vertical_pull"],
  },
  "Full Body C": {
    required: ["lunge", "horizontal_pull", "horizontal_push", "core"],
    optional: ["delts_iso", "biceps_iso", "calves", "carry"], // Только бицепс для баланса
    preferredDoubles: ["lunge"],
  },

  // --------------------------------------------------------------------------
  // UPPER BODY DAYS
  // --------------------------------------------------------------------------
  "Upper Body": {
    required: ["horizontal_push", "horizontal_pull", "vertical_pull"],
    optional: ["incline_push", "delts_iso", "biceps_iso", "triceps_iso", "rear_delts", "core"], // Оба могут попасть при большом бюджете
    preferredDoubles: ["horizontal_pull"], // УБРАНО: biceps_iso из doubles (doubles только для базы)
  },
  "Upper A": {
    required: ["horizontal_push", "horizontal_pull", "vertical_pull"],
    optional: ["incline_push", "delts_iso", "triceps_iso", "rear_delts", "core"], // ТОЛЬКО triceps_iso (день жимов)
    preferredDoubles: ["horizontal_push", "horizontal_pull"],
  },
  "Upper B": {
    required: ["vertical_pull", "horizontal_pull", "incline_push"],
    optional: ["horizontal_push", "rear_delts", "biceps_iso", "delts_iso", "core"], // ТОЛЬКО biceps_iso (день тяг)
    preferredDoubles: ["vertical_pull"],
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
    required: ["vertical_pull", "horizontal_pull", "rear_delts", "biceps_iso"], // Pull = бицепс
    optional: ["core"],
    preferredDoubles: ["horizontal_pull"], // УБРАНО: biceps_iso из doubles (doubles только для базы)
  },
  "Pull A": {
    required: ["vertical_pull", "rear_delts", "biceps_iso"],
    optional: ["horizontal_pull", "core"],
    preferredDoubles: ["vertical_pull"], // Doubles только для базы
  },
  "Pull B": {
    required: ["horizontal_pull", "vertical_pull", "rear_delts", "biceps_iso"],
    optional: ["core"],
    preferredDoubles: ["horizontal_pull"], // УБРАНО: biceps_iso из doubles (doubles только для базы)
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

// HELPER: Check if pattern is compound
function isCompoundPattern(pattern: Pattern): boolean {
  return [
    "squat",
    "hinge",
    "horizontal_push",
    "incline_push",
    "vertical_push",
    "horizontal_pull",
    "vertical_pull",
  ].includes(pattern);
}

function assignRole(pattern: Pattern, isFirst: boolean, isDouble: boolean): SlotRole {
  // First compound exercises are typically "main"
  const compoundPatterns: Pattern[] = [
    "squat",
    "hinge",
    "horizontal_push",
    "incline_push",
    "vertical_push", // ИСПРАВЛЕНО: добавлен (был в isCompoundPattern, но не здесь)
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

  // ИСПРАВЛЕНО: core отдельно (не conditioning), conditioning = кардио
  if (pattern === "core") {
    return "accessory"; // Кор - это вспомогательное, не кардио
  }

  const conditioningPatterns: Pattern[] = [
    "carry",
    "conditioning_low_impact",
    "conditioning_intervals",
  ];

  if (compoundPatterns.includes(pattern)) {
    if (isFirst) return "main";
    return "secondary";
  }

  if (isolationPatterns.includes(pattern)) {
    return "accessory"; // ИСПРАВЛЕНО: убран бессмысленный isDouble
  }

  if (pattern === "lunge" || pattern === "hip_thrust") {
    return isFirst ? "secondary" : "accessory";
  }

  if (conditioningPatterns.includes(pattern)) {
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
  experience?: "beginner" | "intermediate" | "advanced"; // NEW: влияет на slot budget
}): Slot[] {
  const { templateRulesId, timeBucket, intent, availableMinutes, experience } = args;

  const rules = TRAINING_RULES_LIBRARY[templateRulesId];
  if (!rules) {
    throw new Error(`Unknown templateRulesId: ${templateRulesId}`);
  }

  // Determine total slot budget
  // NEW: для advanced берём ближе к max, для beginner - ближе к min
  const range = SLOT_RANGE[timeBucket][intent];
  let slotBudget: number;
  
  if (experience === "advanced") {
    // Advanced: используй 90% от диапазона (почти max для профи)
    slotBudget = Math.round(range.min + (range.max - range.min) * 0.9);
  } else if (experience === "beginner") {
    // Beginner: используй 35% от диапазона (консервативно)
    slotBudget = Math.round(range.min + (range.max - range.min) * 0.35);
  } else {
    // Intermediate: 65% (выше среднего)
    slotBudget = Math.round(range.min + (range.max - range.min) * 0.65);
  }
  
  // Debug log removed for cleaner output


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
  let usedBudget = 0; // КРИТИЧНО: считаем сумму count, а не slots.length

  // -------------------------------------------------------------------------
  // STEP 1: Fill required patterns
  // -------------------------------------------------------------------------
  
  let isFirstCompound = true;

  for (const pattern of rules.required) {
    if (usedBudget >= slotBudget) break; // ИСПРАВЛЕНО: usedBudget вместо slots.length

    const canDouble =
      !!rules.preferredDoubles?.includes(pattern) && (usedBudget <= slotBudget - 2); // ИСПРАВЛЕНО: проверяем достаточно ли места для double

    const count = canDouble ? 2 : 1;
    const role = assignRole(pattern, isFirstCompound, canDouble);

    slots.push({ pattern, count, role });
    usedPatterns.add(pattern);
    usedBudget += count; // ИСПРАВЛЕНО: увеличиваем на count

    if (isCompoundPattern(pattern)) {
      isFirstCompound = false;
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2: Fill optional patterns (if budget allows)
  // -------------------------------------------------------------------------
  
  if (rules.optional && usedBudget < slotBudget) { // ИСПРАВЛЕНО: usedBudget

    // Prioritize optionals that fill gaps
    const priorityOptionals = rules.optional.filter(p => !usedPatterns.has(p));

    for (const pattern of priorityOptionals) {
      if (usedBudget >= slotBudget) break; // ИСПРАВЛЕНО: usedBudget

      const role = assignRole(pattern, false, false);
      slots.push({ pattern, count: 1, role });
      usedPatterns.add(pattern);
      usedBudget += 1; // ИСПРАВЛЕНО: увеличиваем usedBudget
    }
  }

  // -------------------------------------------------------------------------
  // NEW STEP 2.5: Add filler slots if budget allows (for advanced/long sessions)
  // -------------------------------------------------------------------------
  
  // Если бюджет позволяет больше упражнений, добавляем "filler" patterns
  // Это важно для advanced 90min где rules дают только 5-6 паттернов, а нужно 9-10
  // -------------------------------------------------------------------------
  // CRITICAL: Всегда достигаем slotBudget (для правильной утилизации времени!)
  // -------------------------------------------------------------------------
  
  if (usedBudget < slotBudget) {
    // Приоритет filler patterns (помогают балансу, не критичны)
    const fillerPatterns: Pattern[] = [];
    
    // Для Push days: добавить rear_delts (задние дельты помогают балансу)
    if (templateRulesId.toLowerCase().includes("push")) {
      if (!usedPatterns.has("rear_delts")) fillerPatterns.push("rear_delts");
      if (!usedPatterns.has("core")) fillerPatterns.push("core");
      if (!usedPatterns.has("calves")) fillerPatterns.push("calves");
    }
    
    // Для Pull days: добавить core
    if (templateRulesId.toLowerCase().includes("pull")) {
      if (!usedPatterns.has("core")) fillerPatterns.push("core");
      if (!usedPatterns.has("calves")) fillerPatterns.push("calves");
    }
    
    // Для Legs days: calves, core
    if (templateRulesId.toLowerCase().includes("leg")) {
      if (!usedPatterns.has("calves")) fillerPatterns.push("calves");
      if (!usedPatterns.has("core")) fillerPatterns.push("core");
    }
    
    // Для Upper days: core, biceps/triceps iso, calves
    if (templateRulesId.toLowerCase().includes("upper")) {
      if (!usedPatterns.has("core")) fillerPatterns.push("core");
      if (!usedPatterns.has("calves")) fillerPatterns.push("calves");
      if (!usedPatterns.has("biceps_iso")) fillerPatterns.push("biceps_iso");
      if (!usedPatterns.has("triceps_iso")) fillerPatterns.push("triceps_iso");
      if (!usedPatterns.has("rear_delts")) fillerPatterns.push("rear_delts");
    }
    
    // Для Full Body: calves, biceps/triceps
    if (templateRulesId.toLowerCase().includes("full")) {
      if (!usedPatterns.has("calves")) fillerPatterns.push("calves");
      if (!usedPatterns.has("biceps_iso")) fillerPatterns.push("biceps_iso");
      if (!usedPatterns.has("triceps_iso")) fillerPatterns.push("triceps_iso");
    }
    
    // Fallback: core если ещё не добавлен
    if (!usedPatterns.has("core")) fillerPatterns.push("core");
    
    // Добавляем filler patterns до достижения budget
    for (const pattern of fillerPatterns) {
      if (usedBudget >= slotBudget) break;
      if (usedPatterns.has(pattern)) continue;
      
      slots.push({ pattern, count: 1, role: "accessory" });
      usedPatterns.add(pattern);
      usedBudget += 1;
    }
    
    // КРИТИЧНО: ВСЕГДА достигаем budget через дубликаты
    // Это гарантирует правильную утилизацию времени (90min → 9 упражнений)
    while (usedBudget < slotBudget && usedPatterns.size > 0) {
      const existingPatterns = Array.from(usedPatterns);
      
      // Приоритет для дубликатов: compound patterns > isolation
      const compoundPatterns = existingPatterns.filter(p => 
        ["squat", "hinge", "lunge", "horizontal_push", "incline_push", "vertical_push", 
         "horizontal_pull", "vertical_pull", "hip_thrust"].includes(p)
      );
      
      const patternToDouble = compoundPatterns[0] || existingPatterns[0];
      
      slots.push({ pattern: patternToDouble, count: 1, role: "accessory" });
      usedBudget += 1;
    }
  }

  // -------------------------------------------------------------------------
  // STEP 3: Adjust for light intent (reduce volume)
  // -------------------------------------------------------------------------

  if (intent === "light" && usedBudget > range.min) {
    // ИСПРАВЛЕНО: мягко режем doubles поштучно (не целиком)
    while (usedBudget > range.min && slots.length > 0) {
      const lastSlot = slots[slots.length - 1];
      
      if (lastSlot.role === "accessory" || lastSlot.role === "pump" || lastSlot.role === "conditioning") {
        if (lastSlot.count > 1) {
          // Если double-slot, сначала уменьшаем count
          lastSlot.count -= 1;
          usedBudget -= 1;
        } else {
          // Если single-slot, удаляем целиком
          slots.pop();
          usedBudget -= 1;
        }
      } else {
        break; // Не трогаем main/secondary
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

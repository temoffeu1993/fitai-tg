// mesocycleEngine.ts
// ============================================================================
// MESOCYCLE ENGINE: Professional periodization system
//
// ПЕРИОДИЗАЦИЯ (научно обоснованная):
// 1. Мезоциклы 6 недель (Mike Israetel, Greg Nuckols)
// 2. Фазы: Accumulation → Overreach → Deload → Realization
// 3. Планируемый deload (не реактивный!)
// 4. DUP (Daily Undulating Periodization) - волны H/M/L
// 5. Автоматическое продление/завершение мезоциклов
//
// ИСТОЧНИКИ: Mike Israetel (RP), Chad Wesley Smith (Juggernaut), Greg Nuckols
// ============================================================================

import type { Goal, ExperienceLevel } from "./normalizedSchemes.js";

// ============================================================================
// TYPES
// ============================================================================

export type MesocyclePhase =
  | "accumulation"    // Недели 1-2: нормальный объём, адаптация
  | "intensification" // Недели 3-4: увеличение нагрузки (+10%)
  | "deload"          // Неделя 5: восстановление (-40% объём)
  | "realization";    // Неделя 6: закрепление прогресса

export type DUPIntensity = "heavy" | "medium" | "light";

export type Mesocycle = {
  id: string;
  userId: string;
  goal: Goal;
  startDate: string;            // ISO date
  endDate?: string;             // Завершён если есть endDate
  currentWeek: number;          // 1-6
  currentPhase: MesocyclePhase;
  totalWeeks: number;           // Обычно 6
  isActive: boolean;
  notes?: string[];
};

export type WeekPlan = {
  weekNumber: number;
  phase: MesocyclePhase;
  volumeMultiplier: number;    // 1.0 = normal, 0.6 = deload, 1.1 = overreach
  intensityTarget: "light" | "medium" | "high";
  isDeloadWeek: boolean;
  dupPattern?: DUPIntensity[]; // Для 3-6 дней: [heavy, light, medium, ...]
};

// ============================================================================
// CONSTANTS: Mesocycle templates by goal
// ============================================================================

type MesocycleTemplate = {
  durationWeeks: number;
  deloadWeek: number;
  phases: Array<{
    startWeek: number;
    endWeek: number;
    phase: MesocyclePhase;
    volumeMultiplier: number;
    intensityTarget: "light" | "medium" | "high";
  }>;
};

export const MESOCYCLE_TEMPLATES: Record<Goal, MesocycleTemplate> = {
  build_muscle: {
    durationWeeks: 6,
    deloadWeek: 5,
    phases: [
      { startWeek: 1, endWeek: 2, phase: "accumulation", volumeMultiplier: 1.0, intensityTarget: "medium" },
      { startWeek: 3, endWeek: 4, phase: "intensification", volumeMultiplier: 1.1, intensityTarget: "high" },
      { startWeek: 5, endWeek: 5, phase: "deload", volumeMultiplier: 0.6, intensityTarget: "light" },
      { startWeek: 6, endWeek: 6, phase: "realization", volumeMultiplier: 1.0, intensityTarget: "medium" },
    ],
  },
  lose_weight: {
    durationWeeks: 6,
    deloadWeek: 5,
    phases: [
      { startWeek: 1, endWeek: 2, phase: "accumulation", volumeMultiplier: 1.0, intensityTarget: "medium" },
      { startWeek: 3, endWeek: 4, phase: "intensification", volumeMultiplier: 1.05, intensityTarget: "medium" },
      { startWeek: 5, endWeek: 5, phase: "deload", volumeMultiplier: 0.65, intensityTarget: "light" },
      { startWeek: 6, endWeek: 6, phase: "realization", volumeMultiplier: 1.0, intensityTarget: "medium" },
    ],
  },
  athletic_body: {
    durationWeeks: 6,
    deloadWeek: 5,
    phases: [
      { startWeek: 1, endWeek: 2, phase: "accumulation", volumeMultiplier: 1.0, intensityTarget: "medium" },
      { startWeek: 3, endWeek: 4, phase: "intensification", volumeMultiplier: 1.1, intensityTarget: "high" },
      { startWeek: 5, endWeek: 5, phase: "deload", volumeMultiplier: 0.6, intensityTarget: "light" },
      { startWeek: 6, endWeek: 6, phase: "realization", volumeMultiplier: 1.0, intensityTarget: "medium" },
    ],
  },
  health_wellness: {
    durationWeeks: 8, // Длиннее для здоровья (меньше стресса)
    deloadWeek: 7,
    phases: [
      { startWeek: 1, endWeek: 3, phase: "accumulation", volumeMultiplier: 1.0, intensityTarget: "light" },
      { startWeek: 4, endWeek: 6, phase: "intensification", volumeMultiplier: 1.05, intensityTarget: "medium" },
      { startWeek: 7, endWeek: 7, phase: "deload", volumeMultiplier: 0.7, intensityTarget: "light" },
      { startWeek: 8, endWeek: 8, phase: "realization", volumeMultiplier: 1.0, intensityTarget: "light" },
    ],
  },
};

// ============================================================================
// CONSTANTS: DUP patterns by days per week
// ============================================================================

export const DUP_PATTERNS: Record<number, DUPIntensity[]> = {
  2: ["heavy", "light"],
  3: ["heavy", "light", "medium"],
  4: ["heavy", "medium", "light", "medium"],
  5: ["heavy", "medium", "light", "medium", "heavy"],
  6: ["heavy", "medium", "light", "medium", "heavy", "light"],
};

// ============================================================================
// HELPER: Create new mesocycle
// ============================================================================

export function createMesocycle(args: {
  userId: string;
  goal: Goal;
  startDate?: string;
}): Mesocycle {
  const { userId, goal, startDate } = args;

  const template = MESOCYCLE_TEMPLATES[goal];
  const start = startDate || new Date().toISOString();

  return {
    id: `meso_${userId}_${Date.now()}`,
    userId,
    goal,
    startDate: start,
    currentWeek: 1,
    currentPhase: "accumulation",
    totalWeeks: template.durationWeeks,
    isActive: true,
    notes: [`Мезоцикл для ${goal}: ${template.durationWeeks} недель`],
  };
}

// ============================================================================
// HELPER: Get week plan from mesocycle
// ============================================================================

export function getWeekPlan(args: {
  mesocycle: Mesocycle;
  weekNumber: number;
  daysPerWeek: number;
}): WeekPlan {
  const { mesocycle, weekNumber, daysPerWeek } = args;

  const template = MESOCYCLE_TEMPLATES[mesocycle.goal];
  
  // Find phase for this week
  const phaseConfig = template.phases.find(
    p => weekNumber >= p.startWeek && weekNumber <= p.endWeek
  );

  if (!phaseConfig) {
    // Fallback to accumulation if week out of range
    return {
      weekNumber,
      phase: "accumulation",
      volumeMultiplier: 1.0,
      intensityTarget: "medium",
      isDeloadWeek: false,
      dupPattern: DUP_PATTERNS[daysPerWeek] || ["medium", "medium", "medium"],
    };
  }

  return {
    weekNumber,
    phase: phaseConfig.phase,
    volumeMultiplier: phaseConfig.volumeMultiplier,
    intensityTarget: phaseConfig.intensityTarget,
    isDeloadWeek: weekNumber === template.deloadWeek,
    dupPattern: DUP_PATTERNS[daysPerWeek] || ["medium", "medium", "medium"],
  };
}

// ============================================================================
// HELPER: Get today's intensity from DUP pattern
// ============================================================================

export function getTodayIntensity(args: {
  weekPlan: WeekPlan;
  dayOfWeek: number; // 0-6 (0 = Monday)
  daysPerWeek: number;
}): DUPIntensity {
  const { weekPlan, dayOfWeek, daysPerWeek } = args;

  if (!weekPlan.dupPattern) {
    return "medium";
  }

  // Map dayOfWeek to training day index
  // Assuming training days are evenly distributed
  const trainingDayIndex = Math.floor((dayOfWeek / 7) * daysPerWeek);
  const index = Math.min(trainingDayIndex, weekPlan.dupPattern.length - 1);

  return weekPlan.dupPattern[index];
}

// ============================================================================
// HELPER: Advance mesocycle to next week
// ============================================================================

export function advanceMesocycle(mesocycle: Mesocycle): Mesocycle {
  const newWeek = mesocycle.currentWeek + 1;

  // Check if mesocycle is complete
  if (newWeek > mesocycle.totalWeeks) {
    return {
      ...mesocycle,
      endDate: new Date().toISOString(),
      isActive: false,
      notes: [...(mesocycle.notes || []), "Мезоцикл завершён"],
    };
  }

  // Update phase for new week
  const template = MESOCYCLE_TEMPLATES[mesocycle.goal];
  const phaseConfig = template.phases.find(
    p => newWeek >= p.startWeek && newWeek <= p.endWeek
  );

  return {
    ...mesocycle,
    currentWeek: newWeek,
    currentPhase: phaseConfig?.phase || mesocycle.currentPhase,
  };
}

// ============================================================================
// HELPER: Check if deload week
// ============================================================================

export function isDeloadWeek(mesocycle: Mesocycle): boolean {
  const template = MESOCYCLE_TEMPLATES[mesocycle.goal];
  return mesocycle.currentWeek === template.deloadWeek;
}

// ============================================================================
// HELPER: Get volume adjustment for current week
// ============================================================================

export function getVolumeAdjustment(args: {
  mesocycle: Mesocycle;
  baseVolume: number; // Base sets from volumeEngine
}): number {
  const { mesocycle, baseVolume } = args;

  const weekPlan = getWeekPlan({
    mesocycle,
    weekNumber: mesocycle.currentWeek,
    daysPerWeek: 3, // Placeholder, should come from user profile
  });

  return Math.round(baseVolume * weekPlan.volumeMultiplier);
}

// ============================================================================
// HELPER: Should start new mesocycle?
// ============================================================================

export function shouldStartNewMesocycle(mesocycle: Mesocycle | null): boolean {
  if (!mesocycle) return true;
  if (!mesocycle.isActive) return true;
  
  // Check if mesocycle is stale (more than totalWeeks + 2 weeks passed)
  const startDate = new Date(mesocycle.startDate);
  const weeksSinceStart = Math.floor(
    (Date.now() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  return weeksSinceStart > mesocycle.totalWeeks + 2;
}

// ============================================================================
// HELPER: Get mesocycle summary for UI
// ============================================================================

export function getMesocycleSummary(mesocycle: Mesocycle): {
  currentWeek: string;
  phase: string;
  phaseDescription: string;
  weeksRemaining: number;
  isDeload: boolean;
  progressPercentage: number;
} {
  const template = MESOCYCLE_TEMPLATES[mesocycle.goal];
  const weekPlan = getWeekPlan({
    mesocycle,
    weekNumber: mesocycle.currentWeek,
    daysPerWeek: 3,
  });

  const phaseDescriptions: Record<MesocyclePhase, string> = {
    accumulation: "Адаптация: нормальная нагрузка",
    intensification: "Интенсификация: повышенная нагрузка (+10%)",
    deload: "Восстановление: снижение объёма (-40%)",
    realization: "Реализация: закрепление прогресса",
  };

  return {
    currentWeek: `Неделя ${mesocycle.currentWeek} из ${mesocycle.totalWeeks}`,
    phase: mesocycle.currentPhase,
    phaseDescription: phaseDescriptions[mesocycle.currentPhase],
    weeksRemaining: mesocycle.totalWeeks - mesocycle.currentWeek,
    isDeload: mesocycle.currentWeek === template.deloadWeek,
    progressPercentage: Math.round((mesocycle.currentWeek / mesocycle.totalWeeks) * 100),
  };
}

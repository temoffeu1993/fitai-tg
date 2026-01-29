// test30UserVariations.ts
// ============================================================================
// Реальный прогон 30 вариаций пользователей (онбординг → выбор схемы → неделя → чек-ин → тренировка)
//
// Запуск (без tsx):
// 1) ./api/node_modules/.bin/tsc -p api/tsconfig.variations.json
// 2) node api/dist-variations/test30UserVariations.js
// ============================================================================

import fs from "node:fs";
import path from "node:path";

import {
  getCandidateSchemes,
  rankSchemes,
  type ConstraintTag,
  type Location,
  type ExperienceLevel,
  type Goal,
  type NormalizedWorkoutScheme,
  type SchemeUser,
  type TimeBucket,
} from "./normalizedSchemes.js";

import {
  generateWeekPlan,
  generateWorkoutDay,
  generateRecoverySession,
  type CheckInData,
  type UserProfile,
} from "./workoutDayGenerator.js";

import { computeReadiness } from "./readiness.js";
import { decideStartAction } from "./checkinPolicy.js";

type RawExperience =
  | "never_trained"
  | "long_break"
  | "novice"
  | "training_regularly"
  | "training_experienced"
  | "beginner"
  | "intermediate"
  | "advanced";

type RawGoal =
  | "lose_weight"
  | "build_muscle"
  | "athletic_body"
  | "health_wellness";

type OnboardingVariation = {
  name: string;
  age: number;
  sex: "male" | "female";
  heightCm: number;
  weightKg: number;
  experienceRaw: RawExperience;
  goalRaw: RawGoal;
  daysPerWeek: number;
  minutesPerSession: number;
  location: "gym" | "home";
  equipmentList: string[];
};

type CaseResult = {
  variation: OnboardingVariation;
  bmi: number;
  mapped: {
    experience: ExperienceLevel;
    goal: Goal;
    location: Location;
    timeBucket: TimeBucket;
    constraints: ConstraintTag[];
  };
  scheme: {
    recommended: Pick<NormalizedWorkoutScheme, "id" | "russianName" | "splitType" | "intensity" | "daysPerWeek" | "timeBuckets">;
    alternatives: Array<Pick<NormalizedWorkoutScheme, "id" | "russianName" | "splitType" | "intensity">>;
    candidatesCount: number;
  };
  week: {
    days: Array<{
      dayIndex: number;
      label: string;
      focus: string;
      requiredPatternsOk: boolean;
      missingRequiredPatterns: string[];
      totalExercises: number;
      totalSets: number;
      estimatedDuration: number;
    }>;
    stats: {
      totalSets: number;
      totalExercises: number;
      totalMinutes: number;
      avgSetsPerDay: number;
      avgExercisesPerDay: number;
    };
    warnings: string[];
    issues: string[];
  };
  checkins: Array<{
    name: string;
    input: CheckInData;
    readiness: {
      severity: string;
      intent: string;
      timeBucket: number;
      maxPainLevel: number;
      blockedPatterns: string[];
      blockedDayTypes: string[];
      avoidFlags: string[];
      warnings: string[];
      notes: string[];
      reasons: string[];
    };
    decision: { action: string; notes?: string[]; targetDayIndex?: number; targetDayLabel?: string };
    workout: {
      kind: "skip" | "recovery" | "regular";
      dayIndexUsed?: number;
      dayLabel?: string;
      totalExercises: number;
      totalSets: number;
      estimatedDuration: number;
      intent?: string;
      blockedPatternsRespected?: boolean;
      blockedPatternsViolations?: string[];
      avoidFlagsRespected?: boolean;
      avoidFlagsViolations?: string[];
      timeOk?: boolean;
      timeNote?: string;
      requiredPatternsOk?: boolean;
      missingRequiredPatterns?: string[];
    };
    issues: string[];
    warnings: string[];
  }>;
};

function mapGoalToNew(oldGoal: RawGoal): Goal {
  return oldGoal;
}

function mapExperience(raw: RawExperience): ExperienceLevel {
  const expMap: Record<string, ExperienceLevel> = {
    never_trained: "beginner",
    long_break: "beginner",
    novice: "beginner",
    training_regularly: "intermediate",
    training_experienced: "advanced",
    beginner: "beginner",
    intermediate: "intermediate",
    advanced: "advanced",
  };
  return expMap[raw] ?? "beginner";
}

function mapLocationFromInputs(location: "gym" | "home", equipmentList: string[]): Location {
  if (location === "gym" || equipmentList.includes("barbell") || equipmentList.includes("machines")) {
    return "gym";
  }
  if (equipmentList.includes("dumbbells") || equipmentList.includes("bands")) {
    return "home_with_gear";
  }
  return "home_no_equipment";
}

function calculateTimeBucket(minutes: number): TimeBucket {
  if (minutes <= 50) return 45;
  if (minutes <= 75) return 60;
  return 90;
}

function calcBmi(heightCm: number, weightKg: number): number {
  const hM = heightCm / 100;
  return Math.round((weightKg / (hM * hM)) * 10) / 10;
}

function buildConstraintsFromAgeBmi(age: number, bmi: number): ConstraintTag[] {
  const constraints: ConstraintTag[] = [];
  if (age >= 50) {
    constraints.push("avoid_high_impact");
    constraints.push("avoid_heavy_spinal_loading");
  }
  if (bmi >= 30) {
    constraints.push("avoid_high_impact");
  }
  return [...new Set(constraints)];
}

function requiredPatternsForDay(scheme: NormalizedWorkoutScheme, dayIndex: number): string[] {
  return scheme.days[dayIndex]?.requiredPatterns ? [...scheme.days[dayIndex].requiredPatterns] : [];
}

function patternsInWorkoutDay(day: any): Set<string> {
  const s = new Set<string>();
  for (const ex of day.exercises ?? []) {
    for (const p of ex.exercise?.patterns ?? []) s.add(String(p));
  }
  return s;
}

function validateRequiredPatterns(args: { scheme: NormalizedWorkoutScheme; dayIndex: number; day: any }) {
  const required = requiredPatternsForDay(args.scheme, args.dayIndex);
  if (required.length === 0) return { ok: true, missing: [] as string[] };
  const present = patternsInWorkoutDay(args.day);
  const missing = required.filter(p => !present.has(p));
  return { ok: missing.length === 0, missing };
}

function pickCheckinsForUser(i: number): Array<{ name: string; input: CheckInData }> {
  const alwaysOk = {
    name: "Чекин: норм/готовность",
    input: { energy: "medium", sleep: "good", stress: "low", pain: [], soreness: [] } satisfies CheckInData,
  };

  const variants: Array<{ name: string; input: CheckInData }> = [
    {
      name: "Чекин: плохой сон + низкая энергия + стресс",
      input: { energy: "low", sleep: "poor", stress: "high", pain: [], soreness: [] },
    },
    {
      name: "Чекин: мало времени (30 мин)",
      input: { energy: "medium", sleep: "good", stress: "low", pain: [], soreness: [], availableMinutes: 30 },
    },
    {
      name: "Чекин: плечо 7/10",
      input: { energy: "medium", sleep: "ok", stress: "medium", pain: [{ location: "shoulder", level: 7 }], soreness: [] },
    },
    {
      name: "Чекин: колено 7/10",
      input: { energy: "medium", sleep: "ok", stress: "low", pain: [{ location: "knee", level: 7 }], soreness: [] },
    },
    {
      name: "Чекин: поясница 7/10 + very_high stress",
      input: {
        energy: "low",
        sleep: "fair",
        stress: "very_high",
        pain: [{ location: "lower_back", level: 7 }],
        soreness: [],
      },
    },
    {
      name: "Чекин: критический (множественная боль 8/10)",
      input: {
        energy: "low",
        sleep: "poor",
        stress: "very_high",
        pain: [
          { location: "knee", level: 8 },
          { location: "shoulder", level: 8 },
        ],
        soreness: [],
      },
    },
  ];

  // 2 чек-ина на пользователя: один нормальный + один "стрессовый" по циклу
  const chosen = variants[i % variants.length];
  return [alwaysOk, chosen];
}

function normalizeBlockedPatterns(blocked: string[]): string[] {
  const set = new Set(blocked);
  // readiness.ts иногда добавляет "overhead_press" как смысловой алиас — в exerciseLibrary это "vertical_push"
  if (set.has("overhead_press")) set.add("vertical_push");
  return [...set];
}

function validateAdaptationAgainstReadiness(args: {
  day: any;
  readinessBlockedPatterns: string[];
  readinessAvoidFlags: string[];
  availableMinutes?: number;
}): {
  blockedPatternsRespected: boolean;
  blockedPatternsViolations: string[];
  avoidFlagsRespected: boolean;
  avoidFlagsViolations: string[];
  timeOk: boolean;
  timeNote?: string;
} {
  const presentPatterns = patternsInWorkoutDay(args.day);
  const blocked = normalizeBlockedPatterns(args.readinessBlockedPatterns);

  const blockedViolations = blocked.filter(p => presentPatterns.has(p));

  const avoid = new Set(args.readinessAvoidFlags);
  const avoidViolations: string[] = [];
  for (const ex of args.day.exercises ?? []) {
    const flags: string[] = ex.exercise?.jointFlags ?? [];
    if (flags.some(f => avoid.has(String(f)))) {
      avoidViolations.push(String(ex.exercise?.name ?? ex.exercise?.id ?? "unknown_exercise"));
    }
  }

  let timeOk = true;
  let timeNote: string | undefined;

  if (typeof args.availableMinutes === "number") {
    timeOk = (args.day.estimatedDuration ?? 9999) <= args.availableMinutes + 10;
    timeNote = `estimated=${args.day.estimatedDuration} available=${args.availableMinutes} (+10 буфер)`;
  }

  return {
    blockedPatternsRespected: blockedViolations.length === 0,
    blockedPatternsViolations: blockedViolations,
    avoidFlagsRespected: avoidViolations.length === 0,
    avoidFlagsViolations: avoidViolations,
    timeOk,
    timeNote,
  };
}

function analyzeWeekBasics(args: { scheme: NormalizedWorkoutScheme; userProfile: UserProfile; weekPlan: any[] }) {
  const issues: string[] = [];
  const warnings: string[] = [];

  const allExerciseIds = new Map<string, number>();
  for (const day of args.weekPlan) {
    for (const ex of day.exercises ?? []) {
      const id = String(ex.exercise?.id ?? "");
      if (!id) continue;
      allExerciseIds.set(id, (allExerciseIds.get(id) ?? 0) + 1);
    }
  }

  for (const [id, count] of allExerciseIds.entries()) {
    if (count > 2 && args.userProfile.daysPerWeek >= 4) {
      warnings.push(`Частый повтор упражнения id=${id}: ${count} раз/нед`);
    }
  }

  // Простейший баланс push/pull по паттернам
  let pushSets = 0;
  let pullSets = 0;
  for (const day of args.weekPlan) {
    for (const ex of day.exercises ?? []) {
      const patterns: string[] = ex.exercise?.patterns ?? [];
      if (patterns.some(p => String(p).includes("push"))) pushSets += ex.sets ?? 0;
      if (patterns.some(p => String(p).includes("pull"))) pullSets += ex.sets ?? 0;
    }
  }
  if (pushSets > 0 && pullSets > 0) {
    const ratio = pushSets / pullSets;
    if (ratio > 1.35) warnings.push(`Дисбаланс Push/Pull: push=${pushSets} pull=${pullSets} ratio=${ratio.toFixed(2)}`);
  }

  // Проверка времени vs timeBucket (+30 мин допуск на реальную логистику/разминку)
  for (const day of args.weekPlan) {
    if ((day.estimatedDuration ?? 0) > args.userProfile.timeBucket + 30) {
      warnings.push(`День "${day.dayLabel}" слишком длинный: ${day.estimatedDuration} мин при bucket=${args.userProfile.timeBucket}`);
    }
    if ((day.totalExercises ?? 0) === 0) issues.push(`День "${day.dayLabel}" без упражнений`);
  }

  return { issues, warnings };
}

function buildOnboardingPool(): OnboardingVariation[] {
  // Большой пул (мы возьмём первые 30, которые реально имеют candidates в коде)
  return [
    // Lose weight
    { name: "U01", age: 19, sex: "female", heightCm: 165, weightKg: 58, experienceRaw: "never_trained", goalRaw: "lose_weight", daysPerWeek: 3, minutesPerSession: 45, location: "home", equipmentList: ["bodyweight"] },
    { name: "U02", age: 28, sex: "male", heightCm: 178, weightKg: 92, experienceRaw: "long_break", goalRaw: "lose_weight", daysPerWeek: 3, minutesPerSession: 60, location: "gym", equipmentList: ["machines", "barbell"] },
    { name: "U03", age: 41, sex: "female", heightCm: 160, weightKg: 82, experienceRaw: "beginner", goalRaw: "lose_weight", daysPerWeek: 2, minutesPerSession: 60, location: "home", equipmentList: ["dumbbells", "bands"] },
    { name: "U04", age: 55, sex: "male", heightCm: 175, weightKg: 108, experienceRaw: "training_regularly", goalRaw: "lose_weight", daysPerWeek: 2, minutesPerSession: 45, location: "home", equipmentList: ["bands"] },
    { name: "U05", age: 33, sex: "female", heightCm: 170, weightKg: 68, experienceRaw: "training_regularly", goalRaw: "lose_weight", daysPerWeek: 4, minutesPerSession: 45, location: "gym", equipmentList: ["machines"] },

    // Health / wellness
    { name: "U06", age: 62, sex: "female", heightCm: 158, weightKg: 74, experienceRaw: "long_break", goalRaw: "health_wellness", daysPerWeek: 2, minutesPerSession: 45, location: "home", equipmentList: ["bodyweight"] },
    { name: "U07", age: 47, sex: "male", heightCm: 182, weightKg: 95, experienceRaw: "novice", goalRaw: "health_wellness", daysPerWeek: 3, minutesPerSession: 60, location: "gym", equipmentList: ["dumbbells", "machines"] },
    { name: "U08", age: 36, sex: "female", heightCm: 168, weightKg: 76, experienceRaw: "beginner", goalRaw: "health_wellness", daysPerWeek: 3, minutesPerSession: 45, location: "home", equipmentList: ["dumbbells"] },
    { name: "U09", age: 29, sex: "male", heightCm: 175, weightKg: 70, experienceRaw: "training_regularly", goalRaw: "health_wellness", daysPerWeek: 4, minutesPerSession: 60, location: "home", equipmentList: ["bands", "dumbbells"] },

    // Athletic body
    { name: "U10", age: 22, sex: "female", heightCm: 167, weightKg: 60, experienceRaw: "novice", goalRaw: "athletic_body", daysPerWeek: 3, minutesPerSession: 60, location: "gym", equipmentList: ["machines"] },
    { name: "U11", age: 31, sex: "male", heightCm: 180, weightKg: 84, experienceRaw: "training_regularly", goalRaw: "athletic_body", daysPerWeek: 4, minutesPerSession: 60, location: "gym", equipmentList: ["barbell", "machines"] },
    { name: "U12", age: 44, sex: "female", heightCm: 164, weightKg: 72, experienceRaw: "training_regularly", goalRaw: "athletic_body", daysPerWeek: 3, minutesPerSession: 45, location: "home", equipmentList: ["dumbbells"] },
    { name: "U13", age: 39, sex: "male", heightCm: 176, weightKg: 102, experienceRaw: "beginner", goalRaw: "athletic_body", daysPerWeek: 2, minutesPerSession: 60, location: "home", equipmentList: ["bands"] },

    // Build muscle
    { name: "U14", age: 18, sex: "male", heightCm: 176, weightKg: 62, experienceRaw: "never_trained", goalRaw: "build_muscle", daysPerWeek: 3, minutesPerSession: 60, location: "gym", equipmentList: ["barbell", "machines"] },
    { name: "U15", age: 27, sex: "female", heightCm: 170, weightKg: 59, experienceRaw: "training_regularly", goalRaw: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, location: "gym", equipmentList: ["dumbbells", "machines"] },
    { name: "U16", age: 34, sex: "male", heightCm: 183, weightKg: 89, experienceRaw: "training_regularly", goalRaw: "build_muscle", daysPerWeek: 5, minutesPerSession: 60, location: "gym", equipmentList: ["barbell", "machines"] },
    { name: "U17", age: 46, sex: "male", heightCm: 178, weightKg: 86, experienceRaw: "training_regularly", goalRaw: "build_muscle", daysPerWeek: 3, minutesPerSession: 90, location: "gym", equipmentList: ["barbell", "machines"] },
    { name: "U18", age: 52, sex: "female", heightCm: 162, weightKg: 79, experienceRaw: "training_regularly", goalRaw: "build_muscle", daysPerWeek: 2, minutesPerSession: 60, location: "home", equipmentList: ["dumbbells"] },
    { name: "U19", age: 24, sex: "male", heightCm: 179, weightKg: 76, experienceRaw: "training_experienced", goalRaw: "build_muscle", daysPerWeek: 6, minutesPerSession: 90, location: "gym", equipmentList: ["barbell", "machines"] },

    // Strength
    { name: "U20", age: 26, sex: "male", heightCm: 182, weightKg: 88, experienceRaw: "training_experienced", goalRaw: "build_muscle", daysPerWeek: 4, minutesPerSession: 90, location: "gym", equipmentList: ["barbell"] },
    { name: "U21", age: 37, sex: "female", heightCm: 171, weightKg: 67, experienceRaw: "training_regularly", goalRaw: "build_muscle", daysPerWeek: 3, minutesPerSession: 90, location: "gym", equipmentList: ["barbell", "machines"] },
    { name: "U22", age: 58, sex: "male", heightCm: 173, weightKg: 85, experienceRaw: "training_regularly", goalRaw: "build_muscle", daysPerWeek: 2, minutesPerSession: 90, location: "gym", equipmentList: ["barbell"] },

    // Lower body focus
    { name: "U23", age: 23, sex: "female", heightCm: 168, weightKg: 63, experienceRaw: "novice", goalRaw: "athletic_body", daysPerWeek: 2, minutesPerSession: 60, location: "gym", equipmentList: ["machines", "dumbbells"] },
    { name: "U24", age: 30, sex: "female", heightCm: 165, weightKg: 75, experienceRaw: "training_regularly", goalRaw: "athletic_body", daysPerWeek: 4, minutesPerSession: 60, location: "gym", equipmentList: ["barbell", "machines"] },
    { name: "U25", age: 42, sex: "female", heightCm: 160, weightKg: 70, experienceRaw: "training_experienced", goalRaw: "athletic_body", daysPerWeek: 5, minutesPerSession: 60, location: "gym", equipmentList: ["barbell", "machines"] },

    // Equipment edge cases
    { name: "U26", age: 29, sex: "male", heightCm: 177, weightKg: 79, experienceRaw: "training_regularly", goalRaw: "athletic_body", daysPerWeek: 3, minutesPerSession: 45, location: "home", equipmentList: ["bodyweight", "pullup_bar"] },
    { name: "U27", age: 35, sex: "male", heightCm: 185, weightKg: 115, experienceRaw: "novice", goalRaw: "health_wellness", daysPerWeek: 2, minutesPerSession: 60, location: "home", equipmentList: ["bodyweight"] },
    { name: "U28", age: 50, sex: "female", heightCm: 166, weightKg: 92, experienceRaw: "long_break", goalRaw: "lose_weight", daysPerWeek: 3, minutesPerSession: 45, location: "home", equipmentList: ["dumbbells", "bands"] },
    { name: "U29", age: 32, sex: "male", heightCm: 174, weightKg: 68, experienceRaw: "never_trained", goalRaw: "health_wellness", daysPerWeek: 4, minutesPerSession: 45, location: "home", equipmentList: ["bands"] },
    { name: "U30", age: 45, sex: "female", heightCm: 169, weightKg: 64, experienceRaw: "training_regularly", goalRaw: "athletic_body", daysPerWeek: 5, minutesPerSession: 60, location: "gym", equipmentList: ["machines", "dumbbells"] },

    // Доп. запас, если какие-то комбинации не найдут схемы
    { name: "U31", age: 21, sex: "male", heightCm: 178, weightKg: 83, experienceRaw: "novice", goalRaw: "athletic_body", daysPerWeek: 3, minutesPerSession: 45, location: "gym", equipmentList: ["machines"] },
    { name: "U32", age: 57, sex: "female", heightCm: 160, weightKg: 80, experienceRaw: "beginner", goalRaw: "health_wellness", daysPerWeek: 2, minutesPerSession: 60, location: "home", equipmentList: ["dumbbells"] },
    { name: "U33", age: 40, sex: "male", heightCm: 181, weightKg: 90, experienceRaw: "training_regularly", goalRaw: "build_muscle", daysPerWeek: 3, minutesPerSession: 60, location: "gym", equipmentList: ["barbell"] },
    { name: "U34", age: 48, sex: "male", heightCm: 176, weightKg: 78, experienceRaw: "training_regularly", goalRaw: "build_muscle", daysPerWeek: 4, minutesPerSession: 45, location: "gym", equipmentList: ["machines"] },
    { name: "U35", age: 27, sex: "female", heightCm: 166, weightKg: 70, experienceRaw: "training_regularly", goalRaw: "lose_weight", daysPerWeek: 5, minutesPerSession: 45, location: "gym", equipmentList: ["machines"] },
  ];
}

function selectFirstNWithCandidates(pool: OnboardingVariation[], n: number): OnboardingVariation[] {
  const chosen: OnboardingVariation[] = [];
  for (const v of pool) {
    const mappedExperience = mapExperience(v.experienceRaw);
    const mappedGoal = mapGoalToNew(v.goalRaw);
    const location = mapLocationFromInputs(v.location, v.equipmentList);
    const timeBucket = calculateTimeBucket(v.minutesPerSession);
    const bmi = calcBmi(v.heightCm, v.weightKg);
    const constraints = buildConstraintsFromAgeBmi(v.age, bmi);
    const userProfile: SchemeUser = {
      experience: mappedExperience,
      goal: mappedGoal,
      daysPerWeek: v.daysPerWeek,
      timeBucket,
      location,
      sex: v.sex,
      constraints,
      age: v.age,
      bmi,
    };
    const candidates = getCandidateSchemes(userProfile);
    if (candidates.length === 0) continue;
    chosen.push(v);
    if (chosen.length >= n) break;
  }
  return chosen;
}

function main() {
  const pool = buildOnboardingPool();
  const selected = selectFirstNWithCandidates(pool, 30);

  if (selected.length < 30) {
    console.warn(`⚠️ Не набралось 30 вариаций с подходящими схемами: получилось ${selected.length}. Увеличь пул в buildOnboardingPool().`);
  }

  const results: CaseResult[] = [];

  let globalIssues = 0;
  let globalWarnings = 0;

  for (let i = 0; i < selected.length; i++) {
    const variation = selected[i];

    const bmi = calcBmi(variation.heightCm, variation.weightKg);
    const experience = mapExperience(variation.experienceRaw);
    const goal = mapGoalToNew(variation.goalRaw);
    const location = mapLocationFromInputs(variation.location, variation.equipmentList);
    const timeBucket = calculateTimeBucket(variation.minutesPerSession);
    const constraints = buildConstraintsFromAgeBmi(variation.age, bmi);

    const schemeUser: SchemeUser = {
      experience,
      goal,
      daysPerWeek: variation.daysPerWeek,
      timeBucket,
      location,
      sex: variation.sex,
      constraints,
      age: variation.age,
      bmi,
    };

    const candidates = getCandidateSchemes(schemeUser);
    const ranked = rankSchemes(schemeUser, candidates);
    const recommended = ranked[0];

    const userProfile: UserProfile = {
      experience,
      goal,
      daysPerWeek: variation.daysPerWeek,
      timeBucket,
      location,
      sex: variation.sex,
      constraints: [], // TODO: маппинг health/injuries в constraint tags
    };

    const weekPlan = generateWeekPlan({
      scheme: recommended,
      userProfile,
      history: { recentExerciseIds: [] },
    });

    const weekDays = weekPlan.map((d, dayIndex) => {
      const req = validateRequiredPatterns({ scheme: recommended, dayIndex, day: d });
      return {
        dayIndex,
        label: String(d.dayLabel),
        focus: String(d.dayFocus),
        requiredPatternsOk: req.ok,
        missingRequiredPatterns: req.missing,
        totalExercises: Number(d.totalExercises),
        totalSets: Number(d.totalSets),
        estimatedDuration: Number(d.estimatedDuration),
      };
    });

    const totalSets = weekPlan.reduce((sum, d) => sum + (d.totalSets ?? 0), 0);
    const totalExercises = weekPlan.reduce((sum, d) => sum + (d.totalExercises ?? 0), 0);
    const totalMinutes = weekPlan.reduce((sum, d) => sum + (d.estimatedDuration ?? 0), 0);

    const weekAnalysis = analyzeWeekBasics({ scheme: recommended, userProfile, weekPlan });

    const weekIssues = [...weekAnalysis.issues];
    const weekWarnings = [...weekAnalysis.warnings];

    for (const d of weekDays) {
      if (!d.requiredPatternsOk) {
        weekWarnings.push(`День ${d.dayIndex} "${d.label}": не закрыты requiredPatterns: ${d.missingRequiredPatterns.join(", ")}`);
      }
    }

    // Грубая sanity-проверка адекватности рекомендации по возрасту/BMI
    if (variation.age >= 50 && recommended.intensity === "high") {
      weekWarnings.push(`Возраст ${variation.age}: рекомендована high-intensity схема "${recommended.russianName}"`);
    }
    if (bmi >= 30 && recommended.splitType === "conditioning") {
      weekIssues.push(`BMI ${bmi}: рекомендована conditioning схема "${recommended.russianName}" (ожидалось избегать high impact)`);
    }

    const checkins = pickCheckinsForUser(i);
    const checkinResults: CaseResult["checkins"] = [];

    for (const { name, input } of checkins) {
      const warnings: string[] = [];
      const issues: string[] = [];

      const readiness = computeReadiness({
        checkin: input,
        fallbackTimeBucket: userProfile.timeBucket,
      });

      const decision = decideStartAction({
        scheme: recommended,
        dayIndex: 0,
        readiness,
      });

      // Базовый день для сравнения volume (тот день, который реально будем делать)
      const dayIndexUsed =
        decision.action === "swap_day" && "targetDayIndex" in decision ? decision.targetDayIndex : 0;
      const baselineDay = weekPlan[dayIndexUsed];

      let workoutDay: any | null = null;
      let workoutKind: "skip" | "recovery" | "regular" = "regular";

      if (decision.action === "skip") {
        workoutKind = "skip";
        workoutDay = {
          estimatedDuration: 0,
          totalExercises: 0,
          totalSets: 0,
          exercises: [],
          dayLabel: "Skip",
          intent: readiness.intent,
        };
      } else if (decision.action === "recovery") {
        workoutKind = "recovery";
        const painAreas = (input.pain ?? []).map(p => p.location);
        workoutDay = generateRecoverySession({
          userProfile,
          painAreas,
          availableMinutes: input.availableMinutes,
        });
      } else {
        workoutKind = "regular";
        workoutDay = generateWorkoutDay({
          scheme: recommended,
          dayIndex: dayIndexUsed,
          userProfile,
          readiness,
          history: { recentExerciseIds: [] },
        });
      }

      const req = validateRequiredPatterns({ scheme: recommended, dayIndex: dayIndexUsed, day: workoutDay });
      const adaptation = validateAdaptationAgainstReadiness({
        day: workoutDay,
        readinessBlockedPatterns: readiness.blockedPatterns as any,
        readinessAvoidFlags: readiness.avoidFlags as any,
        availableMinutes: input.availableMinutes,
      });

      // Volume intent check: light должен снижать объём vs baseline (не строго всегда, но это ожидаемо)
      if (workoutKind === "regular" && readiness.intent === "light") {
        if ((workoutDay.totalSets ?? 999) >= (baselineDay?.totalSets ?? 0)) {
          warnings.push(`Intent=light, но totalSets не ниже baseline (${workoutDay.totalSets} vs ${baselineDay?.totalSets})`);
        }
      }

      if (!adaptation.timeOk) {
        issues.push(`По времени не влезает: ${adaptation.timeNote}`);
      }

      if (!adaptation.blockedPatternsRespected) {
        issues.push(`Нарушены blockedPatterns: ${adaptation.blockedPatternsViolations.join(", ")}`);
      }

      if (!adaptation.avoidFlagsRespected) {
        issues.push(`Выбраны упражнения с avoidFlags: ${adaptation.avoidFlagsViolations.join(", ")}`);
      }

      if (!req.ok) {
        // Для recovery/skip это нормально; для regular — подозрительно
        if (workoutKind === "regular") {
          warnings.push(`Не закрыты requiredPatterns дня (${req.missing.join(", ")})`);
        }
      }

      if (decision.action !== "skip" && (workoutDay.totalExercises ?? 0) === 0) {
        issues.push(`Пустая тренировка при action=${decision.action}`);
      }

      globalIssues += issues.length;
      globalWarnings += warnings.length;

      checkinResults.push({
        name,
        input,
        readiness: {
          severity: readiness.severity,
          intent: readiness.intent,
          timeBucket: readiness.timeBucket,
          maxPainLevel: readiness.maxPainLevel,
          blockedPatterns: readiness.blockedPatterns as any,
          blockedDayTypes: readiness.blockedDayTypes as any,
          avoidFlags: readiness.avoidFlags as any,
          warnings: readiness.warnings,
          notes: readiness.notes,
          reasons: readiness.reasons,
        },
        decision: decision as any,
        workout: {
          kind: workoutKind,
          dayIndexUsed,
          dayLabel: String(workoutDay.dayLabel ?? ""),
          totalExercises: Number(workoutDay.totalExercises ?? 0),
          totalSets: Number(workoutDay.totalSets ?? 0),
          estimatedDuration: Number(workoutDay.estimatedDuration ?? 0),
          intent: String(workoutDay.intent ?? readiness.intent),
          blockedPatternsRespected: adaptation.blockedPatternsRespected,
          blockedPatternsViolations: adaptation.blockedPatternsViolations,
          avoidFlagsRespected: adaptation.avoidFlagsRespected,
          avoidFlagsViolations: adaptation.avoidFlagsViolations,
          timeOk: adaptation.timeOk,
          timeNote: adaptation.timeNote,
          requiredPatternsOk: req.ok,
          missingRequiredPatterns: req.missing,
        },
        issues,
        warnings,
      });
    }

    results.push({
      variation,
      bmi,
      mapped: { experience, goal, location, timeBucket, constraints },
      scheme: {
        recommended: {
          id: recommended.id,
          russianName: recommended.russianName,
          splitType: recommended.splitType,
          intensity: recommended.intensity,
          daysPerWeek: recommended.daysPerWeek,
          timeBuckets: recommended.timeBuckets,
        },
        alternatives: ranked.slice(1, 3).map(s => ({
          id: s.id,
          russianName: s.russianName,
          splitType: s.splitType,
          intensity: s.intensity,
        })),
        candidatesCount: candidates.length,
      },
      week: {
        days: weekDays,
        stats: {
          totalSets,
          totalExercises,
          totalMinutes,
          avgSetsPerDay: Math.round((totalSets / weekPlan.length) * 10) / 10,
          avgExercisesPerDay: Math.round((totalExercises / weekPlan.length) * 10) / 10,
        },
        warnings: weekWarnings,
        issues: weekIssues,
      },
      checkins: checkinResults,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalUsers: results.length,
    totalWorkoutsSimulated: results.reduce((sum, r) => sum + r.checkins.length, 0),
    global: { issues: globalIssues, warnings: globalWarnings },
    results,
  };

  const outDir = path.join(process.cwd(), "api", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "test30UserVariations.report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`\n✅ Report written: ${outPath}`);
  console.log(`Users: ${report.totalUsers} | Workouts simulated: ${report.totalWorkoutsSimulated}`);
  console.log(`Issues: ${report.global.issues} | Warnings: ${report.global.warnings}`);
}

main();

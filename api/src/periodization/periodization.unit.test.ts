// periodization/periodization.unit.test.ts
// ============================================================================
// Unit tests for the periodization pipeline (no API server needed)
// ============================================================================

import {
  buildWeekContext,
  buildReadinessConstraints,
  buildSplitContext,
  buildCalibrationContext,
  buildDayPrescription,
  isExerciseCalibrated,
  applyReadinessAdaptation,
  buildLoadContext,
  classifyLoadBucket,
  buildPeriodizationLabels,
} from "./index.js";
import type { Readiness } from "../readiness.js";

// ── Helper: neutral readiness ──
function neutralReadiness(): Readiness {
  return {
    intent: "normal",
    severity: "low",
    severityScore: 0,
    maxPainLevel: 0,
    effectiveMinutes: 60,
    timeBucket: 60 as any,
    blockedPatterns: [],
    blockedDayTypes: [],
    avoidFlags: [],
    painByLocation: new Map(),
    reasons: [],
    warnings: [],
    notes: [],
    corePolicy: "required",
  };
}

describe("Periodization Pipeline — unit tests", () => {
  // ══════════════════════════════════════════════════════════════════════
  // 1. UL 4x intermediate: DUP should be on, exposure-based
  // ══════════════════════════════════════════════════════════════════════
  describe("UL 4x intermediate", () => {
    const week = buildWeekContext({
      mesocycle: null,
      weekNumber: 1,
      daysPerWeek: 4,
      goal: "build_muscle",
    });
    const split = buildSplitContext({
      schemeId: "ul_4x_classic_ab",
      splitType: "upper_lower",
      dayLabels: ["Upper A", "Lower A", "Upper B", "Lower B"],
      daysPerWeek: 4,
      experience: "intermediate",
      weekContext: week,
    });
    const readinessConstraints = buildReadinessConstraints({
      readiness: neutralReadiness(),
      defaultMinutes: 60,
    });
    const calibration = buildCalibrationContext({
      exerciseSummaries: [],
      plannedExerciseIds: [],
      plannedPatterns: [],
      experience: "intermediate",
      goal: "build_muscle",
    });

    it("should have exposure groups for upper and lower", () => {
      expect(split.exposureGroups.length).toBe(2);
      expect(split.exposureGroups.map((g) => g.groupName).sort()).toEqual(["lower", "upper"]);
    });

    it("should assign DUP waves: heavy/light for each group", () => {
      // Upper A = heavy, Lower A = heavy, Upper B = light, Lower B = light
      expect(split.dayWaveAssignment[0]).toBe("heavy"); // Upper A
      expect(split.dayWaveAssignment[2]).toBe("light"); // Upper B
      expect(split.dayWaveAssignment[1]).toBe("heavy"); // Lower A
      expect(split.dayWaveAssignment[3]).toBe("light"); // Lower B
    });

    it("heavy day: main gets strength reps [4,6]", () => {
      const rx = buildDayPrescription({
        dayIndex: 0, // Upper A = heavy
        goal: "build_muscle",
        experience: "intermediate",
        calibration,
        week,
        split,
        readiness: readinessConstraints,
      });
      expect(rx.dupIntensity).toBe("heavy");
      expect(rx.dayStyle).toBe("strength_biased");
      expect(rx.repProfile.main).toEqual([4, 6]);
      expect(rx.repProfile.secondary).toEqual([6, 8]);
    });

    it("light day: main gets hypertrophy reps [10,15]", () => {
      const rx = buildDayPrescription({
        dayIndex: 2, // Upper B = light
        goal: "build_muscle",
        experience: "intermediate",
        calibration,
        week,
        split,
        readiness: readinessConstraints,
      });
      expect(rx.dupIntensity).toBe("light");
      expect(rx.dayStyle).toBe("hypertrophy_biased");
      expect(rx.repProfile.main).toEqual([10, 15]);
      expect(rx.repProfile.secondary).toEqual([12, 15]);
    });

    it("accessories always stay in hypertrophy range regardless of DUP", () => {
      const heavy = buildDayPrescription({
        dayIndex: 0,
        goal: "build_muscle",
        experience: "intermediate",
        calibration,
        week,
        split,
        readiness: readinessConstraints,
      });
      const light = buildDayPrescription({
        dayIndex: 2,
        goal: "build_muscle",
        experience: "intermediate",
        calibration,
        week,
        split,
        readiness: readinessConstraints,
      });
      // Accessories should be same for both days
      expect(heavy.repProfile.accessory).toEqual([10, 15]);
      expect(light.repProfile.accessory).toEqual([10, 15]);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 2. PPL 3x: DUP should be OFF (no repeated exposures)
  // ══════════════════════════════════════════════════════════════════════
  describe("PPL 3x (no DUP)", () => {
    const week = buildWeekContext({
      mesocycle: null,
      weekNumber: 1,
      daysPerWeek: 3,
      goal: "build_muscle",
    });
    const split = buildSplitContext({
      schemeId: "ppl_3x_condensed",
      splitType: "push_pull_legs",
      dayLabels: ["Push", "Pull", "Legs"],
      daysPerWeek: 3,
      experience: "intermediate",
      weekContext: week,
    });

    it("should have DUP off (no repeated exposures)", () => {
      expect(split.periodizationScope).toBe("off");
      expect(split.dayWaveAssignment).toEqual([null, null, null]);
    });

    it("all days should be balanced style", () => {
      const calibration = buildCalibrationContext({
        exerciseSummaries: [],
        plannedExerciseIds: [],
        plannedPatterns: [],
        experience: "intermediate",
        goal: "build_muscle",
      });
      const readinessConstraints = buildReadinessConstraints({
        readiness: neutralReadiness(),
        defaultMinutes: 60,
      });

      for (let d = 0; d < 3; d++) {
        const rx = buildDayPrescription({
          dayIndex: d,
          goal: "build_muscle",
          experience: "intermediate",
          calibration,
          week,
          split,
          readiness: readinessConstraints,
        });
        expect(rx.dupIntensity).toBeNull();
        expect(rx.dayStyle).toBe("balanced");
        expect(rx.repProfile.main).toEqual([6, 10]); // goal-standard
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 3. Beginner 2x: DUP should be OFF
  // ══════════════════════════════════════════════════════════════════════
  describe("Beginner 2x (DUP off)", () => {
    const week = buildWeekContext({
      mesocycle: null,
      weekNumber: 1,
      daysPerWeek: 2,
      goal: "health_wellness",
    });
    const split = buildSplitContext({
      schemeId: "fb_2x_starter",
      splitType: "full_body",
      dayLabels: ["Full Body A", "Full Body B"],
      daysPerWeek: 2,
      experience: "beginner",
      weekContext: week,
    });

    it("should have DUP off for beginner ≤2 days", () => {
      expect(split.periodizationScope).toBe("off");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 4. Calibration: uncalibrated exercises get safe floor
  // ══════════════════════════════════════════════════════════════════════
  describe("Calibration per-exercise", () => {
    it("globalCalibrationMode when all exercises uncalibrated", () => {
      const cal = buildCalibrationContext({
        exerciseSummaries: [],
        plannedExerciseIds: ["bench_press", "squat"],
        plannedPatterns: ["horizontal_push", "squat"],
        experience: "beginner",
        goal: "build_muscle",
      });
      expect(cal.globalCalibrationMode).toBe(true);
      expect(cal.safeRepFloor).toBe(8);
      expect(isExerciseCalibrated(cal, "bench_press", "horizontal_push")).toBe(false);
    });

    it("mixed calibration: some calibrated, some not", () => {
      const cal = buildCalibrationContext({
        exerciseSummaries: [
          { exerciseId: "bench_press", pattern: "horizontal_push", validExposures: 5, hasRecordedWeights: true },
        ],
        plannedExerciseIds: ["bench_press", "squat"],
        plannedPatterns: ["horizontal_push", "squat"],
        experience: "intermediate",
        goal: "build_muscle",
      });
      expect(cal.globalCalibrationMode).toBe(false);
      expect(isExerciseCalibrated(cal, "bench_press", "horizontal_push")).toBe(true);
      expect(isExerciseCalibrated(cal, "squat", "squat")).toBe(false);
    });

    it("global calibration suppresses DUP for the day", () => {
      const week = buildWeekContext({
        mesocycle: null,
        weekNumber: 1,
        daysPerWeek: 4,
        goal: "build_muscle",
      });
      const split = buildSplitContext({
        schemeId: "ul_4x_classic_ab",
        splitType: "upper_lower",
        dayLabels: ["Upper A", "Lower A", "Upper B", "Lower B"],
        daysPerWeek: 4,
        experience: "intermediate",
        weekContext: week,
      });
      const cal = buildCalibrationContext({
        exerciseSummaries: [],
        plannedExerciseIds: ["bench", "squat", "rows"],
        plannedPatterns: ["horizontal_push", "squat", "horizontal_pull"],
        experience: "intermediate",
        goal: "build_muscle",
      });
      const readinessConstraints = buildReadinessConstraints({
        readiness: neutralReadiness(),
        defaultMinutes: 60,
      });

      const rx = buildDayPrescription({
        dayIndex: 0,
        goal: "build_muscle",
        experience: "intermediate",
        calibration: cal,
        week,
        split,
        readiness: readinessConstraints,
      });

      // DUP suppressed because all exercises are uncalibrated
      expect(rx.dupIntensity).toBeNull();
      expect(rx.dayStyle).toBe("balanced");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 5. Readiness: recovery / light
  // ══════════════════════════════════════════════════════════════════════
  describe("Readiness constraints", () => {
    it("critical severity → recovery_only", () => {
      const r: Readiness = {
        ...neutralReadiness(),
        severity: "critical",
        intent: "light",
      };
      const rc = buildReadinessConstraints({ readiness: r, defaultMinutes: 60 });
      expect(rc.allowedAggressiveness).toBe("recovery_only");
      expect(rc.recoveryRequired).toBe(true);
    });

    it("critical readiness → recovery dayStyle", () => {
      const r: Readiness = {
        ...neutralReadiness(),
        severity: "critical",
        intent: "light",
      };
      const rc = buildReadinessConstraints({ readiness: r, defaultMinutes: 60 });
      const week = buildWeekContext({
        mesocycle: null,
        weekNumber: 1,
        daysPerWeek: 3,
        goal: "build_muscle",
      });
      const split = buildSplitContext({
        schemeId: "fb_3x_classic",
        splitType: "full_body",
        dayLabels: ["A", "B", "C"],
        daysPerWeek: 3,
        experience: "intermediate",
        weekContext: week,
      });
      const cal = buildCalibrationContext({
        exerciseSummaries: [],
        plannedExerciseIds: [],
        plannedPatterns: [],
        experience: "intermediate",
        goal: "build_muscle",
      });

      const rx = buildDayPrescription({
        dayIndex: 0,
        goal: "build_muscle",
        experience: "intermediate",
        calibration: cal,
        week,
        split,
        readiness: rc,
      });

      expect(rx.dayStyle).toBe("recovery");
      expect(rx.dupIntensity).toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 6. PPL 6x: DUP should be ON (2 exposures per group)
  // ══════════════════════════════════════════════════════════════════════
  describe("PPL 6x (DUP by exposure)", () => {
    const week = buildWeekContext({
      mesocycle: null,
      weekNumber: 1,
      daysPerWeek: 6,
      goal: "build_muscle",
    });
    const split = buildSplitContext({
      schemeId: "ppl_6x_classic",
      splitType: "push_pull_legs",
      dayLabels: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"],
      daysPerWeek: 6,
      experience: "advanced",
      weekContext: week,
    });

    it("should have 3 exposure groups with 2 days each", () => {
      expect(split.exposureGroups.length).toBe(3);
      expect(split.periodizationScope).toBe("full_dup");
    });

    it("push days get heavy/light wave", () => {
      expect(split.dayWaveAssignment[0]).toBe("heavy"); // Push A
      expect(split.dayWaveAssignment[3]).toBe("light"); // Push B
    });

    it("different day styles for heavy vs light", () => {
      const cal = buildCalibrationContext({
        exerciseSummaries: [],
        plannedExerciseIds: [],
        plannedPatterns: [],
        experience: "advanced",
        goal: "build_muscle",
      });
      const rc = buildReadinessConstraints({
        readiness: neutralReadiness(),
        defaultMinutes: 60,
      });

      const heavy = buildDayPrescription({
        dayIndex: 0,
        goal: "build_muscle",
        experience: "advanced",
        calibration: cal,
        week,
        split,
        readiness: rc,
      });
      const light = buildDayPrescription({
        dayIndex: 3,
        goal: "build_muscle",
        experience: "advanced",
        calibration: cal,
        week,
        split,
        readiness: rc,
      });

      expect(heavy.dayStyle).toBe("strength_biased");
      expect(light.dayStyle).toBe("hypertrophy_biased");
      expect(heavy.repProfile.main[0]).toBeLessThan(light.repProfile.main[0]);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 7. Full Body 3x beginner: DUP should be ON (3 exposures)
  // ══════════════════════════════════════════════════════════════════════
  describe("FB 3x beginner (DUP on)", () => {
    const week = buildWeekContext({
      mesocycle: null,
      weekNumber: 1,
      daysPerWeek: 3,
      goal: "build_muscle",
    });
    const split = buildSplitContext({
      schemeId: "fb_3x_classic",
      splitType: "full_body",
      dayLabels: ["Full Body A", "Full Body B", "Full Body C"],
      daysPerWeek: 3,
      experience: "beginner",
      weekContext: week,
    });

    it("should have DUP on with 3-day wave", () => {
      expect(split.periodizationScope).toBe("full_dup");
      expect(split.dayWaveAssignment).toEqual(["heavy", "light", "medium"]);
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 8. Readiness Adaptation (post-assignment, per-exercise)
  // ══════════════════════════════════════════════════════════════════════
  describe("Readiness Adaptation (post-assignment)", () => {
    type Role = "main" | "secondary" | "accessory" | "pump" | "conditioning";
    const makeExercise = (overrides: {
      exerciseId?: string;
      exerciseName?: string;
      role?: Role;
      sets?: number;
      repsRange?: [number, number];
      restSec?: number;
      jointFlags?: any[];
      patterns?: string[];
    } = {}) => ({
      exerciseId: overrides.exerciseId ?? "bench_press",
      exerciseName: overrides.exerciseName ?? "Жим штанги",
      role: (overrides.role ?? "main") as Role,
      sets: overrides.sets ?? 4,
      repsRange: (overrides.repsRange ?? [6, 10]) as [number, number],
      restSec: overrides.restSec ?? 120,
      jointFlags: overrides.jointFlags ?? [],
      patterns: overrides.patterns ?? ["horizontal_push"],
    });

    it("no pain → no adaptation", () => {
      const result = applyReadinessAdaptation({
        exercises: [makeExercise()],
        readiness: {
          blockedPatterns: [],
          availableMinutes: 60,
          allowedAggressiveness: "full",
          painFlags: [],
          recoveryRequired: false,
          readinessIntent: "normal",
        },
      });
      expect(result.anyAdaptation).toBe(false);
      expect(result.exercises[0].weightMultiplier).toBe(1.0);
    });

    it("shoulder pain 5/10 → reduces weight for shoulder_sensitive exercise", () => {
      const result = applyReadinessAdaptation({
        exercises: [
          makeExercise({ jointFlags: ["shoulder_sensitive"], exerciseName: "Жим стоя" }),
          makeExercise({ exerciseId: "squat", exerciseName: "Присед", jointFlags: ["knee_sensitive"], patterns: ["squat"] }),
        ],
        readiness: {
          blockedPatterns: [],
          availableMinutes: 60,
          allowedAggressiveness: "full",
          painFlags: [{ location: "shoulder", level: 5 }],
          recoveryRequired: false,
          readinessIntent: "normal",
        },
      });
      expect(result.anyAdaptation).toBe(true);
      // Shoulder exercise adapted
      expect(result.exercises[0].weightMultiplier).toBe(0.85);
      expect(result.exercises[0].adaptationApplied).toBe(true);
      // Squat NOT adapted (no shoulder involvement)
      expect(result.exercises[1].weightMultiplier).toBe(1.0);
      expect(result.exercises[1].adaptationApplied).toBe(false);
    });

    it("severe pain 8/10 → aggressive reduction for accessories", () => {
      const result = applyReadinessAdaptation({
        exercises: [
          makeExercise({
            exerciseId: "lateral_raise",
            exerciseName: "Махи в стороны",
            role: "accessory",
            sets: 3,
            jointFlags: ["shoulder_sensitive"],
          }),
        ],
        readiness: {
          blockedPatterns: [],
          availableMinutes: 60,
          allowedAggressiveness: "full",
          painFlags: [{ location: "shoulder", level: 8 }],
          recoveryRequired: false,
          readinessIntent: "normal",
        },
      });
      expect(result.exercises[0].weightMultiplier).toBe(0.75); // -25%
      expect(result.exercises[0].sets).toBe(1); // 3 - 2 = 1
      expect(result.totalSetsReduced).toBe(2);
    });

    it("knee pain affects squat exercises", () => {
      const result = applyReadinessAdaptation({
        exercises: [
          makeExercise({
            exerciseId: "squat",
            exerciseName: "Присед",
            role: "main",
            sets: 4,
            jointFlags: ["knee_sensitive"],
            patterns: ["squat"],
          }),
        ],
        readiness: {
          blockedPatterns: [],
          availableMinutes: 60,
          allowedAggressiveness: "full",
          painFlags: [{ location: "knee", level: 5 }],
          recoveryRequired: false,
          readinessIntent: "normal",
        },
      });
      expect(result.exercises[0].adaptationApplied).toBe(true);
      expect(result.exercises[0].weightMultiplier).toBe(0.85);
      expect(result.exercises[0].sets).toBe(3); // 4 - 1 = 3
    });

    it("moderate aggressiveness → slight weight reduction for all", () => {
      const result = applyReadinessAdaptation({
        exercises: [
          makeExercise({ jointFlags: [] }), // No joint flags, but moderate readiness
        ],
        readiness: {
          blockedPatterns: [],
          availableMinutes: 60,
          allowedAggressiveness: "moderate",
          painFlags: [],
          recoveryRequired: false,
          readinessIntent: "normal",
        },
      });
      expect(result.anyAdaptation).toBe(true);
      expect(result.exercises[0].weightMultiplier).toBe(0.95); // -5%
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 9. Load Prescription (rep-bucket classification + weight scaling)
  // ══════════════════════════════════════════════════════════════════════
  describe("Load Prescription", () => {
    it("classifyLoadBucket: low reps → low_rep", () => {
      expect(classifyLoadBucket([4, 6])).toBe("low_rep");
      expect(classifyLoadBucket([1, 3])).toBe("low_rep");
    });

    it("classifyLoadBucket: moderate reps → moderate_rep", () => {
      expect(classifyLoadBucket([6, 10])).toBe("moderate_rep");
      expect(classifyLoadBucket([8, 12])).toBe("moderate_rep");
    });

    it("classifyLoadBucket: high reps → high_rep", () => {
      expect(classifyLoadBucket([10, 15])).toBe("high_rep");
      expect(classifyLoadBucket([15, 20])).toBe("high_rep");
    });

    it("heavy day (low_rep): weight = tracked weight for this bucket", () => {
      const ctx = buildLoadContext({
        repsRange: [4, 6],
        trackedWeight: 100,
        isCalibrating: false,
      });
      expect(ctx.loadBucket).toBe("low_rep");
      expect(ctx.suggestedWeightToday).toBe(100); // DB stores per-bucket weight
      expect(ctx.progressionAction).toBe("maintain");
    });

    it("moderate day: weight = tracked weight for this bucket", () => {
      const ctx = buildLoadContext({
        repsRange: [6, 10],
        trackedWeight: 80,
        isCalibrating: false,
      });
      expect(ctx.loadBucket).toBe("moderate_rep");
      expect(ctx.suggestedWeightToday).toBe(80); // DB stores per-bucket weight
    });

    it("light day (high_rep): weight = tracked weight for this bucket", () => {
      const ctx = buildLoadContext({
        repsRange: [10, 15],
        trackedWeight: 60,
        isCalibrating: false,
      });
      expect(ctx.loadBucket).toBe("high_rep");
      expect(ctx.suggestedWeightToday).toBe(60); // DB stores per-bucket weight
    });

    it("calibrating exercise: tracked weight + calibrate action", () => {
      const ctx = buildLoadContext({
        repsRange: [8, 12],
        trackedWeight: 50,
        isCalibrating: true,
      });
      expect(ctx.loadBucket).toBe("calibration");
      expect(ctx.suggestedWeightToday).toBe(50); // DB stores per-bucket weight
      expect(ctx.progressionAction).toBe("calibrate");
    });

    it("no tracked weight → null suggested weight", () => {
      const ctx = buildLoadContext({
        repsRange: [6, 10],
        trackedWeight: null,
        isCalibrating: true,
      });
      expect(ctx.suggestedWeightToday).toBeNull();
    });

    it("passes through progression action from engine", () => {
      const ctx = buildLoadContext({
        repsRange: [6, 10],
        trackedWeight: 80,
        isCalibrating: false,
        progressionAction: "increase_weight",
        progressionReason: "Прогресс: +2.5 кг",
      });
      expect(ctx.progressionAction).toBe("increase_weight");
      expect(ctx.progressionReason).toBe("Прогресс: +2.5 кг");
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 10. User-facing Labels
  // ══════════════════════════════════════════════════════════════════════
  describe("User-facing Labels", () => {
    it("null summary → balanced defaults", () => {
      const labels = buildPeriodizationLabels(null);
      expect(labels.dayStyleLabel).toBe("Сбалансированная тренировка");
      expect(labels.periodizationNote).toBeNull();
    });

    it("strength_biased day with DUP heavy", () => {
      const labels = buildPeriodizationLabels({
        dayStyle: "strength_biased",
        dayStyleReason: "Силовой день: меньше повторов, больше вес",
        dupIntensity: "heavy",
        periodizationScope: "full_dup",
        weekMode: "accumulation",
      });
      expect(labels.dayStyleLabel).toBe("Силовой день");
      expect(labels.periodizationNote).toContain("Тяжёлый");
      expect(labels.weekModeNote).toContain("накопления");
      expect(labels.adaptationReason).toBe("Силовой день: меньше повторов, больше вес");
    });

    it("deload week", () => {
      const labels = buildPeriodizationLabels({
        dayStyle: "deload",
        weekMode: "deload",
        isDeloadWeek: true,
      });
      expect(labels.dayStyleLabel).toBe("Разгрузочная тренировка");
      expect(labels.weekModeNote).toContain("Разгрузочная");
    });

    it("global calibration mode → load guidance", () => {
      const labels = buildPeriodizationLabels({
        dayStyle: "balanced",
        globalCalibrationMode: true,
      });
      expect(labels.loadGuidance).toContain("Подбор веса");
    });

    it("DUP off → no periodization note", () => {
      const labels = buildPeriodizationLabels({
        dayStyle: "balanced",
        dupIntensity: null,
        periodizationScope: "off",
      });
      expect(labels.periodizationNote).toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // 9. Calibration wiring regression — resolved calibration after exercise selection
  // Tests the scenario where buildCalibrationContext is called with real
  // exercise data (post-selection) and buildDayPrescription reflects it.
  // ══════════════════════════════════════════════════════════════════════
  describe("Calibration wiring regression", () => {
    // Shared contexts for all 3 cases: UL 4x intermediate, heavy day (dayIndex 0)
    const week = buildWeekContext({
      mesocycle: null,
      weekNumber: 1,
      daysPerWeek: 4,
      goal: "build_muscle",
    });
    const split = buildSplitContext({
      schemeId: "ul_4x_classic_ab",
      splitType: "upper_lower",
      dayLabels: ["Upper A", "Lower A", "Upper B", "Lower B"],
      daysPerWeek: 4,
      experience: "intermediate",
      weekContext: week,
    });
    const readinessConstraints = buildReadinessConstraints({
      readiness: neutralReadiness(),
      defaultMinutes: 60,
    });

    it("heavy day + all main/secondary calibrated → DUP strength_biased, reps [4,6]", () => {
      // All exercises have enough history
      const cal = buildCalibrationContext({
        exerciseSummaries: [
          { exerciseId: "bench_press", pattern: "horizontal_push", validExposures: 5, hasRecordedWeights: true },
          { exerciseId: "overhead_press", pattern: "vertical_push", validExposures: 3, hasRecordedWeights: true },
          { exerciseId: "bicep_curl", pattern: "biceps", validExposures: 4, hasRecordedWeights: true },
        ],
        plannedExerciseIds: ["bench_press", "overhead_press", "bicep_curl"],
        globalLogicExerciseIds: ["bench_press", "overhead_press"],
        plannedPatterns: ["horizontal_push", "vertical_push", "biceps"],
        experience: "intermediate",
        goal: "build_muscle",
      });

      expect(cal.globalCalibrationMode).toBe(false);
      expect(isExerciseCalibrated(cal, "bench_press", "horizontal_push")).toBe(true);

      const rx = buildDayPrescription({
        dayIndex: 0, // heavy day in UL 4x
        goal: "build_muscle",
        experience: "intermediate",
        calibration: cal,
        week,
        split,
        readiness: readinessConstraints,
      });

      expect(rx.dayStyle).toBe("strength_biased");
      expect(rx.dupIntensity).toBe("heavy");
      expect(rx.repProfile.main).toEqual([4, 6]);
      expect(rx.repProfile.secondary).toEqual([6, 8]);
    });

    it("heavy day + all main/secondary uncalibrated → balanced, safe mid-range", () => {
      // All main/secondary exercises are new (no history)
      const cal = buildCalibrationContext({
        exerciseSummaries: [
          // Only the accessory has history
          { exerciseId: "bicep_curl", pattern: "biceps", validExposures: 4, hasRecordedWeights: true },
        ],
        plannedExerciseIds: ["bench_press", "overhead_press", "bicep_curl"],
        globalLogicExerciseIds: ["bench_press", "overhead_press"],
        plannedPatterns: ["horizontal_push", "vertical_push", "biceps"],
        experience: "intermediate",
        goal: "build_muscle",
      });

      // globalCalibrationMode based on main/secondary only
      expect(cal.globalCalibrationMode).toBe(true);
      // But accessory is calibrated
      expect(isExerciseCalibrated(cal, "bicep_curl", "biceps")).toBe(true);
      // starterLoadMode considers ALL exercises (accessory is calibrated but main/secondary aren't)
      expect(cal.starterLoadMode).toBe("starter");

      const rx = buildDayPrescription({
        dayIndex: 0,
        goal: "build_muscle",
        experience: "intermediate",
        calibration: cal,
        week,
        split,
        readiness: readinessConstraints,
      });

      // DUP suppressed, balanced day
      expect(rx.dupIntensity).toBeNull();
      expect(rx.dayStyle).toBe("balanced");
      expect(rx.dayStyleReason).toContain("Подбор");
      // Rep profile: safe mid-range, not heavy [4,6]
      expect(rx.repProfile.main[0]).toBeGreaterThanOrEqual(6);
    });

    it("mixed: 1 calibrated + 1 uncalibrated main → DUP active, per-exercise override", () => {
      const cal = buildCalibrationContext({
        exerciseSummaries: [
          { exerciseId: "bench_press", pattern: "horizontal_push", validExposures: 5, hasRecordedWeights: true },
          // overhead_press is new
        ],
        plannedExerciseIds: ["bench_press", "overhead_press", "bicep_curl"],
        globalLogicExerciseIds: ["bench_press", "overhead_press"],
        plannedPatterns: ["horizontal_push", "vertical_push", "biceps"],
        experience: "intermediate",
        goal: "build_muscle",
      });

      // Not global calibration (bench_press is calibrated)
      expect(cal.globalCalibrationMode).toBe(false);
      expect(cal.periodizationAllowed).toBe(true);
      // Per-exercise: bench calibrated, overhead_press not
      expect(isExerciseCalibrated(cal, "bench_press", "horizontal_push")).toBe(true);
      expect(isExerciseCalibrated(cal, "overhead_press", "vertical_push")).toBe(false);

      const rx = buildDayPrescription({
        dayIndex: 0,
        goal: "build_muscle",
        experience: "intermediate",
        calibration: cal,
        week,
        split,
        readiness: readinessConstraints,
      });

      // DUP active → strength_biased heavy day
      expect(rx.dayStyle).toBe("strength_biased");
      expect(rx.dupIntensity).toBe("heavy");
      // Rep profile reflects DUP (bench_press gets [4,6])
      expect(rx.repProfile.main).toEqual([4, 6]);
      // The per-exercise override for overhead_press happens in the generator (STEP 3),
      // not in DayPrescription. DayPrescription gives the DUP profile;
      // uncalibrated exercises get overridden at exercise-level.
    });
  });
});

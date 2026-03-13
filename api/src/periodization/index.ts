// periodization/index.ts — barrel export
export * from "./periodizationTypes.js";
export { buildWeekContext } from "./mesocycleAdapter.js";
export { buildReadinessConstraints } from "./readinessAdapter.js";
export { buildSplitContext, detectSplitFamily } from "./splitPolicy.js";
export { buildCalibrationContext, isExerciseCalibrated } from "./calibration.js";
export type { ExerciseExposureSummary } from "./calibration.js";
export { getExerciseExposureSummaries } from "./calibrationDb.js";
export { buildDayPrescription } from "./dayPrescription.js";
export { applyReadinessAdaptation } from "./readinessAdaptation.js";
export { buildLoadContext, buildLoadContextFromPrescription, classifyLoadBucket } from "./loadPrescription.js";
export type { ExerciseToAdapt, AdaptedExercise, AdaptationResult } from "./readinessAdaptation.js";
export { buildPeriodizationLabels } from "./userFacingLabels.js";
export type { PeriodizationLabels } from "./userFacingLabels.js";

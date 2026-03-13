// periodization/index.ts — barrel export
export * from "./periodizationTypes.js";
export { buildWeekContext } from "./mesocycleAdapter.js";
export { buildReadinessConstraints } from "./readinessAdapter.js";
export { buildSplitContext, detectSplitFamily } from "./splitPolicy.js";
export { buildCalibrationContext, isExerciseCalibrated } from "./calibration.js";
export type { ExerciseExposureSummary } from "./calibration.js";
export { buildDayPrescription } from "./dayPrescription.js";

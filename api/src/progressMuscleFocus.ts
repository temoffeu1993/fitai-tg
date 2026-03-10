import { EXERCISE_LIBRARY, type Exercise, type MuscleGroup } from "./exerciseLibrary.js";
import { deriveWorkingHistory, type ExerciseHistory } from "./progressionEngine.js";

export type MuscleFocusItem = { muscle: string; percent: number };

export type MuscleFocusSummary = {
  items: MuscleFocusItem[];
  totalEffectiveSets: number;
  mappedEffectiveSets: number;
  coveragePercent: number;
  totalExercises: number;
  mappedExercises: number;
};

type FocusGroup =
  | "Грудь"
  | "Спина"
  | "Ноги"
  | "Ягодицы"
  | "Плечи"
  | "Руки"
  | "Пресс";

type WeightedGroup = { muscle: FocusGroup; weight: number };

const EXERCISE_BY_ID = new Map<string, Exercise>(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]));

const PRIMARY_WEIGHTS = [1, 0.55, 0.35, 0.25];
const MIN_EFFECTIVE_SETS = 4;
const MIN_COVERAGE = 0.55;

const MUSCLE_TO_FOCUS_GROUP: Record<MuscleGroup, FocusGroup> = {
  quads: "Ноги",
  glutes: "Ягодицы",
  hamstrings: "Ноги",
  calves: "Ноги",
  chest: "Грудь",
  lats: "Спина",
  upper_back: "Спина",
  rear_delts: "Плечи",
  front_delts: "Плечи",
  side_delts: "Плечи",
  triceps: "Руки",
  biceps: "Руки",
  forearms: "Руки",
  core: "Пресс",
  lower_back: "Спина",
};

const PATTERN_FALLBACK_WEIGHTS: Record<string, WeightedGroup[]> = {
  horizontal_push: [
    { muscle: "Грудь", weight: 0.55 },
    { muscle: "Руки", weight: 0.25 },
    { muscle: "Плечи", weight: 0.2 },
  ],
  incline_push: [
    { muscle: "Грудь", weight: 0.45 },
    { muscle: "Плечи", weight: 0.3 },
    { muscle: "Руки", weight: 0.25 },
  ],
  vertical_push: [
    { muscle: "Плечи", weight: 0.55 },
    { muscle: "Руки", weight: 0.35 },
    { muscle: "Грудь", weight: 0.1 },
  ],
  horizontal_pull: [
    { muscle: "Спина", weight: 0.8 },
    { muscle: "Руки", weight: 0.12 },
    { muscle: "Плечи", weight: 0.08 },
  ],
  vertical_pull: [
    { muscle: "Спина", weight: 0.78 },
    { muscle: "Руки", weight: 0.22 },
  ],
  squat: [
    { muscle: "Ноги", weight: 0.62 },
    { muscle: "Ягодицы", weight: 0.3 },
    { muscle: "Пресс", weight: 0.08 },
  ],
  hinge: [
    { muscle: "Ягодицы", weight: 0.42 },
    { muscle: "Ноги", weight: 0.38 },
    { muscle: "Спина", weight: 0.2 },
  ],
  lunge: [
    { muscle: "Ноги", weight: 0.58 },
    { muscle: "Ягодицы", weight: 0.34 },
    { muscle: "Пресс", weight: 0.08 },
  ],
  hip_thrust: [
    { muscle: "Ягодицы", weight: 0.72 },
    { muscle: "Ноги", weight: 0.2 },
    { muscle: "Пресс", weight: 0.08 },
  ],
  rear_delts: [
    { muscle: "Плечи", weight: 0.62 },
    { muscle: "Спина", weight: 0.38 },
  ],
  delts_iso: [{ muscle: "Плечи", weight: 1 }],
  triceps_iso: [{ muscle: "Руки", weight: 1 }],
  biceps_iso: [{ muscle: "Руки", weight: 1 }],
  calves: [{ muscle: "Ноги", weight: 1 }],
  core: [{ muscle: "Пресс", weight: 1 }],
  carry: [
    { muscle: "Пресс", weight: 0.65 },
    { muscle: "Руки", weight: 0.2 },
    { muscle: "Спина", weight: 0.15 },
  ],
};

const SECONDARY_WEIGHTS: Partial<Record<MuscleGroup, number>> = {
  biceps: 0.25,
  triceps: 0.25,
  front_delts: 0.22,
  side_delts: 0.22,
  rear_delts: 0.22,
  forearms: 0.12,
  core: 0.1,
  lower_back: 0.1,
};
const DEFAULT_SECONDARY_WEIGHT = 0.18;

function toNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) ? num : null;
}

function isExercisePerformed(exercise: any): boolean {
  return exercise?.done !== false && exercise?.skipped !== true;
}

function getPerformedSets(exercise: any): any[] {
  return Array.isArray(exercise?.sets) ? exercise.sets.filter((set: any) => set?.done !== false) : [];
}

function normalizeWeights(entries: Iterable<[FocusGroup, number]>): WeightedGroup[] {
  const items = Array.from(entries)
    .filter((entry): entry is [FocusGroup, number] => Boolean(entry[0]) && Number.isFinite(entry[1]) && entry[1] > 0);
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  if (!(total > 0)) return [];
  return items.map(([muscle, weight]) => ({ muscle, weight: weight / total }));
}

function buildLibraryWeights(exercise: Exercise): WeightedGroup[] {
  const groupWeights = new Map<FocusGroup, number>();

  exercise.primaryMuscles.forEach((muscle, index) => {
    const group = MUSCLE_TO_FOCUS_GROUP[muscle];
    if (!group) return;
    const weight = PRIMARY_WEIGHTS[index] ?? PRIMARY_WEIGHTS[PRIMARY_WEIGHTS.length - 1] ?? 0.4;
    groupWeights.set(group, (groupWeights.get(group) ?? 0) + weight);
  });

  for (const muscle of exercise.secondaryMuscles ?? []) {
    const group = MUSCLE_TO_FOCUS_GROUP[muscle];
    if (!group) continue;
    const weight = SECONDARY_WEIGHTS[muscle] ?? DEFAULT_SECONDARY_WEIGHT;
    groupWeights.set(group, (groupWeights.get(group) ?? 0) + weight);
  }

  return normalizeWeights(groupWeights.entries());
}

function buildTargetMuscleWeights(targetMuscles: unknown[]): WeightedGroup[] {
  const groupWeights = new Map<FocusGroup, number>();
  targetMuscles.forEach((raw, index) => {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key) return;
    const group = MUSCLE_TO_FOCUS_GROUP[key as MuscleGroup];
    if (!group) return;
    const weight = PRIMARY_WEIGHTS[index] ?? PRIMARY_WEIGHTS[PRIMARY_WEIGHTS.length - 1] ?? 0.4;
    groupWeights.set(group, (groupWeights.get(group) ?? 0) + weight);
  });
  return normalizeWeights(groupWeights.entries());
}

function getFocusWeights(exercise: any): WeightedGroup[] {
  const exerciseId = typeof exercise?.id === "string" ? exercise.id : "";
  const libraryExercise = exerciseId ? EXERCISE_BY_ID.get(exerciseId) : undefined;
  if (libraryExercise) {
    const weights = buildLibraryWeights(libraryExercise);
    if (weights.length > 0) return weights;
  }

  const targetMuscles = Array.isArray(exercise?.targetMuscles) ? exercise.targetMuscles : [];
  const targetWeights = buildTargetMuscleWeights(targetMuscles);
  if (targetWeights.length > 0) return targetWeights;

  const pattern = String(exercise?.pattern || "");
  const fallback = PATTERN_FALLBACK_WEIGHTS[pattern];
  return Array.isArray(fallback) ? fallback : [];
}

function getEffectiveSetCount(exercise: any): number {
  const performedSets = getPerformedSets(exercise);
  if (performedSets.length === 0) return 0;

  const exerciseId = typeof exercise?.id === "string" ? exercise.id : "unknown";
  const libraryExercise = EXERCISE_BY_ID.get(exerciseId);

  const history: ExerciseHistory = {
    exerciseId,
    workoutDate: "1970-01-01",
    sets: performedSets.map((set) => {
      const reps = toNumber(set?.reps);
      const actualReps = reps != null && reps > 0 ? Math.round(reps) : 1;
      const weight = toNumber(set?.weight);
      return {
        targetReps: actualReps,
        actualReps,
        weight: weight != null && weight > 0 ? weight : 0,
        completed: true,
      };
    }),
  };

  const workingHistory = deriveWorkingHistory(history, Boolean(libraryExercise?.weightInverted));
  return workingHistory.sets.length;
}

function roundPercentages(items: Array<{ muscle: FocusGroup; value: number }>): MuscleFocusItem[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!(total > 0)) return [];

  const base = items.map((item) => {
    const raw = (item.value / total) * 100;
    const floor = Math.floor(raw);
    return {
      muscle: item.muscle,
      raw,
      floor,
      remainder: raw - floor,
    };
  });

  let remaining = 100 - base.reduce((sum, item) => sum + item.floor, 0);
  base.sort((a, b) => b.remainder - a.remainder || b.raw - a.raw);
  for (let index = 0; index < base.length && remaining > 0; index += 1, remaining -= 1) {
    base[index].floor += 1;
  }

  return [...base]
    .sort((a, b) => b.raw - a.raw)
    .map((item) => ({ muscle: item.muscle, percent: item.floor }))
    .filter((item) => item.percent > 0);
}

export function computeMuscleFocusSummary(sessionPayloads: any[]): MuscleFocusSummary {
  const counts = new Map<FocusGroup, number>();
  let totalEffectiveSets = 0;
  let mappedEffectiveSets = 0;
  let totalExercises = 0;
  let mappedExercises = 0;

  for (const payload of sessionPayloads) {
    const exercises: any[] = Array.isArray(payload?.exercises) ? payload.exercises : [];
    for (const exercise of exercises) {
      if (!isExercisePerformed(exercise)) continue;
      const pattern = String(exercise?.pattern || "");
      if (pattern.startsWith("conditioning")) continue;

      const effectiveSets = getEffectiveSetCount(exercise);
      if (effectiveSets <= 0) continue;

      totalExercises += 1;
      totalEffectiveSets += effectiveSets;

      const weights = getFocusWeights(exercise);
      if (weights.length === 0) continue;

      mappedExercises += 1;
      mappedEffectiveSets += effectiveSets;
      for (const { muscle, weight } of weights) {
        counts.set(muscle, (counts.get(muscle) ?? 0) + effectiveSets * weight);
      }
    }
  }

  const coveragePercent = totalEffectiveSets > 0 ? mappedEffectiveSets / totalEffectiveSets : 0;
  const items = roundPercentages(
    [...counts.entries()]
      .map(([muscle, value]) => ({ muscle, value }))
      .filter((item) => item.value > 0)
  );

  if (mappedEffectiveSets < MIN_EFFECTIVE_SETS || coveragePercent < MIN_COVERAGE) {
    return {
      items: [],
      totalEffectiveSets,
      mappedEffectiveSets,
      coveragePercent,
      totalExercises,
      mappedExercises,
    };
  }

  return {
    items,
    totalEffectiveSets,
    mappedEffectiveSets,
    coveragePercent,
    totalExercises,
    mappedExercises,
  };
}

export function computeMuscleFocus(sessionPayloads: any[]): MuscleFocusItem[] {
  return computeMuscleFocusSummary(sessionPayloads).items;
}

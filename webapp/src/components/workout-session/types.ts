export type PlanExercise = {
  exerciseId?: string;
  name: string;
  sets: number;
  reps?: string | number;
  restSec?: number;
  pattern?: string;
  weight?: string | number | null;
  loadType?: "bodyweight" | "external" | "assisted";
  requiresWeightInput?: boolean;
  weightLabel?: string;
  tagline?: string;
  technique?: {
    setup: string;
    execution: string;
    commonMistakes: string[];
  };
  proTip?: string;
};

export type SessionPlan = {
  title: string;
  location: string;
  duration: number;
  exercises: PlanExercise[];
};

export type SetEntry = {
  reps?: number;
  weight?: number;
  done?: boolean;
};

export type EffortTag = "easy" | "working" | "quite_hard" | "hard" | "max" | null;

export type SessionItem = {
  id?: string;
  name: string;
  pattern?: string;
  targetMuscles?: string[];
  targetReps?: string | number;
  targetWeight?: string | null;
  restSec?: number;
  loadType?: "bodyweight" | "external" | "assisted";
  requiresWeightInput?: boolean;
  weightLabel?: string;
  sets: SetEntry[];
  done?: boolean;
  skipped?: boolean;
  effort?: EffortTag;
  tagline?: string;
  technique?: {
    setup: string;
    execution: string;
    commonMistakes: string[];
  };
  proTip?: string;
};

export type ChangeEvent = {
  action: "replace" | "remove" | "skip" | "exclude";
  fromExerciseId?: string | null;
  toExerciseId?: string | null;
  reason?: string | null;
  source?: string | null;
  at: string;
  meta?: Record<string, unknown>;
};

export type ExerciseMenuState =
  | { index: number; mode: "menu" }
  | { index: number; mode: "replace" }
  | { index: number; mode: "confirm_skip" }
  | { index: number; mode: "confirm_remove" }
  | { index: number; mode: "confirm_ban" };


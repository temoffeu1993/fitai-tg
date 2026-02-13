export type SessionPlanExercise = {
  exerciseId?: string;
  name: string;
  sets: number;
  reps?: string | number;
  restSec?: number;
  pattern?: string;
  weight?: string | number | null;
  loadType?: any;
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
  exercises: Array<SessionPlanExercise>;
};

export function toSessionPlan(workout: any): SessionPlan {
  const w = workout && typeof workout === "object" ? workout : {};
  const exercises = Array.isArray(w.exercises) ? w.exercises : [];
  const sets = exercises.reduce((acc: number, ex: any) => acc + Number(ex?.sets || 0), 0);
  const duration = Number(w.estimatedDuration) || Math.max(25, Math.min(90, Math.round(sets * 3.5)));
  const title = String(w.dayLabel || w.schemeName || w.title || "Тренировка");
  const location = String(w.schemeName || "Тренировка");

  return {
    title,
    location,
    duration,
    exercises: exercises.map((ex: any) => ({
      exerciseId: ex?.exerciseId || ex?.id || undefined,
      name: String(ex?.name || ex?.exerciseName || "Упражнение"),
      sets: Number(ex?.sets) || 1,
      reps: ex?.reps || ex?.repsRange || "",
      restSec: ex?.restSec != null ? Number(ex.restSec) : undefined,
      pattern: ex?.pattern,
      weight: ex?.weight ?? null,
      loadType: ex?.loadType,
      requiresWeightInput: ex?.requiresWeightInput,
      weightLabel: ex?.weightLabel,
      tagline: ex?.tagline || undefined,
      technique: ex?.technique || undefined,
      proTip: ex?.proTip || undefined,
    })),
  };
}


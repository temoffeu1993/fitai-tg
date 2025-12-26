import { apiFetch } from "@/lib/apiClient";

// webapp/src/api/schedule.ts

export type WorkoutSchedule = {
  dow?: {
    [dow: string]: { enabled: boolean; time: string };
  };
  dates?: {
    [iso: string]: { time: string };
  };
};

export type ScheduleByDate = Record<string, { time: string }>;

export type PlannedWorkout = {
  id: string;
  plan: any;
  scheduledFor: string;
  status: "scheduled" | "pending" | "completed" | "cancelled";
  createdAt?: string | null;
  updatedAt?: string | null;
  resultSessionId?: string | null;
};

export async function getScheduleOverview(): Promise<{
  schedule: WorkoutSchedule;
  plannedWorkouts: PlannedWorkout[];
}> {
  const r = await apiFetch("/api/workout-schedule", { credentials: "include" });
  if (!r.ok) throw new Error("failed_to_load_schedule");
  const data = await r.json();
  return {
    schedule: (data?.schedule ?? {}) as WorkoutSchedule,
    plannedWorkouts: Array.isArray(data?.plannedWorkouts) ? data.plannedWorkouts : [],
  };
}

export async function getPlannedWorkouts(): Promise<PlannedWorkout[]> {
  const r = await apiFetch("/api/planned-workouts", { credentials: "include" });
  if (!r.ok) throw new Error("failed_to_load_planned_workouts");
  const data = await r.json();
  return Array.isArray(data?.plannedWorkouts) ? (data.plannedWorkouts as PlannedWorkout[]) : [];
}

export async function createPlannedWorkout(input: {
  plan: any;
  scheduledFor: string;
  scheduledTime?: string;
}): Promise<PlannedWorkout> {
  const r = await apiFetch("/api/planned-workouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "failed_to_create_planned_workout");
  }
  const data = await r.json();
  return data?.plannedWorkout;
}

export async function updatePlannedWorkout(
  id: string,
  input: { scheduledFor?: string; scheduledTime?: string; plan?: any; status?: PlannedWorkout["status"] }
): Promise<PlannedWorkout> {
  const r = await apiFetch(`/api/planned-workouts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "failed_to_update_planned_workout");
  }
  const data = await r.json();
  return data?.plannedWorkout;
}

export async function cancelPlannedWorkout(id: string): Promise<PlannedWorkout> {
  const r = await apiFetch(`/api/planned-workouts/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "failed_to_cancel_planned_workout");
  }
  const data = await r.json();
  return data?.plannedWorkout;
}

export async function replacePlannedWorkoutExercise(args: {
  plannedWorkoutId: string;
  index: number;
  newExerciseId: string;
  reason?: string;
  source?: string;
}): Promise<PlannedWorkout> {
  const r = await apiFetch(`/api/planned-workouts/${args.plannedWorkoutId}/exercises/${args.index}/replace`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      newExerciseId: args.newExerciseId,
      reason: args.reason || null,
      source: args.source || "user",
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "failed_to_replace_exercise");
  }
  const data = await r.json();
  return data?.plannedWorkout;
}

export async function removePlannedWorkoutExercise(args: {
  plannedWorkoutId: string;
  index: number;
  reason?: string;
  source?: string;
}): Promise<PlannedWorkout> {
  const r = await apiFetch(`/api/planned-workouts/${args.plannedWorkoutId}/exercises/${args.index}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason: args.reason || null, source: args.source || "user" }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "failed_to_remove_exercise");
  }
  const data = await r.json();
  return data?.plannedWorkout;
}

export async function skipPlannedWorkoutExercise(args: {
  plannedWorkoutId: string;
  index: number;
  reason?: string;
  source?: string;
}): Promise<PlannedWorkout> {
  const r = await apiFetch(`/api/planned-workouts/${args.plannedWorkoutId}/exercises/${args.index}/skip`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason: args.reason || null, source: args.source || "user" }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "failed_to_skip_exercise");
  }
  const data = await r.json();
  return data?.plannedWorkout;
}

export async function saveScheduleDates(dates: ScheduleByDate): Promise<void> {
  const r = await apiFetch("/api/workout-schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ schedule: { dates } }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || "failed_to_save_schedule");
  }
}

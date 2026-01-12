export type ActiveWorkoutDraft = {
  plannedWorkoutId: string;
  title?: string | null;
  plan?: any | null;
  items?: any[] | null;
  activeIndex?: number | null;
  elapsed?: number | null;
  running?: boolean | null;
  checkin?: any | null;
  checkinSummary?: any | null;
  updatedAt?: string | null;
};

const KEY = "session_draft";
const ID_KEY = "planned_workout_id";

export function readSessionDraft(): ActiveWorkoutDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== "object") return null;
    const plannedWorkoutId = draft.plannedWorkoutId || localStorage.getItem(ID_KEY) || null;
    if (typeof plannedWorkoutId !== "string" || !plannedWorkoutId.trim()) return null;
    return { ...draft, plannedWorkoutId: plannedWorkoutId.trim() } as ActiveWorkoutDraft;
  } catch {
    return null;
  }
}

export function hasActiveWorkout(): boolean {
  return Boolean(readSessionDraft());
}

export function clearActiveWorkout() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("current_plan");
    localStorage.removeItem(ID_KEY);
  } catch {}
}


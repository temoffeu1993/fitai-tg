import { apiFetch } from "@/lib/apiClient";

export type PlanStatus = "processing" | "ready" | "failed";

export type WorkoutPlanResponse<TPlan = any> = {
  plan: TPlan | null;
  analysis?: any | null;
  meta?: {
    status?: PlanStatus | null;
    planId?: string | null;
    error?: string | null;
    progress?: number | null;
    progressStage?: string | null;
  };
};

async function parseJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error: any = new Error(`${label}_failed`);
    error.status = res.status;
    if (body) {
      try {
        error.body = JSON.parse(body);
      } catch {
        error.body = body;
      }
    }
    throw error;
  }
  return res.json();
}

export async function getCurrentPlan<T = any>(): Promise<WorkoutPlanResponse<T>> {
  const res = await apiFetch("/plan/current");
  return parseJson(res, "current_plan");
}

export async function generatePlan<T = any>(
  opts: { force?: boolean } = {}
): Promise<WorkoutPlanResponse<T>> {
  const res = await apiFetch("/plan/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: Boolean(opts.force) }),
  });
  return parseJson(res, "generate_plan");
}

export async function checkPlanStatus<T = any>(planId: string): Promise<WorkoutPlanResponse<T>> {
  const res = await apiFetch(`/plan/status/${planId}`);
  return parseJson(res, "plan_status");
}

export type CheckInPayload = {
  sleepHours?: number;
  energyLevel?: "low" | "medium" | "high";
  stressLevel?: "low" | "medium" | "high" | "very_high";
  sleepQuality?: "poor" | "fair" | "good" | "excellent";
  injuries?: string[];
  limitations?: string[];
  motivation?: "low" | "medium" | "high";
  mood?: string;
  menstrualPhase?: "follicular" | "ovulation" | "luteal" | "menstruation";
  menstrualSymptoms?: string[];
  hydration?: "poor" | "adequate" | "good";
  lastMeal?: string;
  notes?: string;
};

export async function submitCheckIn(payload: CheckInPayload) {
  const res = await apiFetch("/plan/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<{ ok: boolean; checkInId: string; createdAt: string }>(res, "check_in");
}

export async function getLatestCheckIn() {
  const res = await apiFetch("/plan/check-in/latest");
  return parseJson(res, "latest_check_in");
}

export async function saveSession(
  payload: any,
  opts: { plannedWorkoutId?: string; startedAt?: string; durationMin?: number } = {}
) {
  const body: Record<string, any> = { payload };
  if (opts.plannedWorkoutId) body.plannedWorkoutId = opts.plannedWorkoutId;
  if (opts.startedAt) body.startedAt = opts.startedAt;
  if (opts.durationMin) body.durationMin = opts.durationMin;

  const res = await apiFetch("/plan/save-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res, "save_session");
}

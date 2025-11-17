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

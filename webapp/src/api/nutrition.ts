import { apiFetch } from "@/lib/apiClient";

export type PlanStatus = "processing" | "ready" | "failed";

export type NutritionPlanResponse<TPlan = any> = {
  plan: TPlan;
  meta?: {
    status?: PlanStatus;
    planId?: string;
    error?: string | null;
    cached?: boolean;
    queued?: boolean;
    progress?: number;
    progressStage?: string | null;
    created?: boolean;
  };
};

async function parseJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error: any = new Error(`${label}_failed`);
    error.status = res.status;
    if (body) error.body = body;
    throw error;
  }
  return res.json();
}

export async function getCurrentWeek<T = any>(): Promise<NutritionPlanResponse<T>> {
  const res = await apiFetch("/api/nutrition/current-week");
  return parseJson(res, "current-week");
}

export async function generateWeek<T = any>(
  opts: { force?: boolean } = {}
): Promise<NutritionPlanResponse<T>> {
  const res = await apiFetch("/api/nutrition/generate-week", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: Boolean(opts.force) }),
  });
  return parseJson(res, "generate-week");
}

export async function checkPlanStatus<T = any>(planId: string): Promise<NutritionPlanResponse<T>> {
  const res = await apiFetch(`/api/nutrition/status/${planId}`);
  return parseJson(res, "check-status");
}

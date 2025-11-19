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
  };
};

async function parseJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    let text = "";
    let parsed: any = null;
    try {
      text = await res.text();
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* ignore */
    }
    const message =
      parsed?.message ||
      parsed?.error ||
      text ||
      `${label}_failed`;
    const error: any = new Error(message);
    error.status = res.status;
    error.body = text;
    error.userMessage = message;
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

export type NutritionFeedPlan<TPlan = any> = {
  plan: TPlan;
  status: PlanStatus;
  planId: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isUpcoming: boolean;
};

export type NutritionAvailability = {
  canGenerate: boolean;
  reason: string | null;
  nextDateIso: string | null;
  nextDateLabel: string | null;
  reasonCode: "active" | null;
};

export type NutritionFeedResponse<TPlan = any> = {
  plans: NutritionFeedPlan<TPlan>[];
  availability: NutritionAvailability;
};

export async function getNutritionFeed<T = any>(): Promise<NutritionFeedResponse<T>> {
  const res = await apiFetch("/api/nutrition/feed");
  return parseJson(res, "nutrition-feed");
}

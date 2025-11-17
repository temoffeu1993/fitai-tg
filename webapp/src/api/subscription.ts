import { apiFetch } from "@/lib/apiClient";

export type SubscriptionStatus = "none" | "active" | "trial";

export type SubscriptionInfo = {
  status: SubscriptionStatus;
  until: string | null;
  trialWorkoutUsed: boolean;
  trialNutritionUsed: boolean;
};

export async function getSubscriptionStatus(): Promise<SubscriptionInfo> {
  const res = await apiFetch("/subscription/status");
  if (!res.ok) {
    const msg = await res.text().catch(() => "subscription_failed");
    const err: any = new Error("subscription_failed");
    err.status = res.status;
    err.body = msg;
    throw err;
  }
  return res.json();
}

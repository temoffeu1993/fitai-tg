export type SubscriptionStatus = "none" | "active" | "trial";

export async function ensureSubscription(_userId: string, _scope: "workout" | "nutrition") {
  // Пока доступ открыт для всех без оплаты
  return { status: "active" as SubscriptionStatus };
}

export async function getSubscriptionStatus(_userId: string) {
  return {
    status: "active" as SubscriptionStatus,
    until: null,
    trialWorkoutUsed: true,
    trialNutritionUsed: true,
  };
}

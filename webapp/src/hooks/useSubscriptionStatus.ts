// Временная заглушка: подписка всегда активна
export function useSubscriptionStatus() {
  return {
    data: { status: "active", until: null, trialWorkoutUsed: true, trialNutritionUsed: true },
    loading: false,
    error: null,
    locked: false,
    reason: null,
  };
}

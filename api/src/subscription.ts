import { q } from "./db.js";
import { AppError } from "./middleware/errorHandler.js";

export type SubscriptionStatus = "none" | "active" | "trial";
type Scope = "workout" | "nutrition";

async function fetchUserSubscription(userId: string) {
  const rows = await q(
    `SELECT subscription_status, subscription_until, trial_workout_used, trial_nutrition_used
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );
  return rows[0];
}

export async function ensureSubscription(userId: string, scope: Scope) {
  // Пока доступ открыт для всех без оплаты
  return { status: "active" as SubscriptionStatus };
}

export async function getSubscriptionStatus(userId: string) {
  return {
    status: "active" as SubscriptionStatus,
    until: null,
    trialWorkoutUsed: true,
    trialNutritionUsed: true,
  };
}

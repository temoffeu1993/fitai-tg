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
  const u = await fetchUserSubscription(userId);
  if (!u) {
    throw new AppError("Профиль не найден", 401);
  }

  const now = new Date();
  const activeUntil = u.subscription_until ? new Date(u.subscription_until) : null;
  const isActive = u.subscription_status === "active" && activeUntil && activeUntil > now;

  // 1) Активная подписка
  if (isActive) return { status: "active" as SubscriptionStatus };

  // 2) Проба — по одной бесплатной генерации на тренировки и питание
  const trialField = scope === "workout" ? "trial_workout_used" : "trial_nutrition_used";
  const alreadyTrialed = Boolean(u[trialField]);

  if (!alreadyTrialed) {
    // помечаем пробник использованным
    await q(`UPDATE users SET ${trialField} = true WHERE id = $1`, [userId]);
    return { status: "trial" as SubscriptionStatus };
  }

  // 3) Нет доступа
  throw new AppError(
    "Доступ к генерации по подписке. Оформи премиум, чтобы продолжить.",
    403
  );
}

export async function getSubscriptionStatus(userId: string) {
  const u = await fetchUserSubscription(userId);
  if (!u) throw new AppError("Профиль не найден", 401);
  const now = new Date();
  const activeUntil = u.subscription_until ? new Date(u.subscription_until) : null;
  const isActive = u.subscription_status === "active" && activeUntil && activeUntil > now;

  let status: SubscriptionStatus = "none";
  if (isActive) status = "active";
  else if (!u.trial_workout_used || !u.trial_nutrition_used) status = "trial";

  return {
    status,
    until: activeUntil,
    trialWorkoutUsed: Boolean(u.trial_workout_used),
    trialNutritionUsed: Boolean(u.trial_nutrition_used),
  };
}

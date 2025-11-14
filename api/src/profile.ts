import { Router, Response } from "express";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";

export const profile = Router();

async function wipeNutrition(userId: string) {
  await q(
    `
    DELETE FROM nutrition_items
    WHERE meal_id IN (
      SELECT nm.id
      FROM nutrition_meals nm
      JOIN nutrition_days nd ON nd.id = nm.day_id
      JOIN nutrition_plans np ON np.id = nd.plan_id
      WHERE np.user_id = $1
    )
  `,
    [userId]
  );

  await q(
    `
    DELETE FROM nutrition_meals
    WHERE day_id IN (
      SELECT nd.id
      FROM nutrition_days nd
      JOIN nutrition_plans np ON np.id = nd.plan_id
      WHERE np.user_id = $1
    )
  `,
    [userId]
  );

  await q(
    `
    DELETE FROM nutrition_days
    WHERE plan_id IN (
      SELECT id FROM nutrition_plans WHERE user_id = $1
    )
  `,
    [userId]
  );

  await q(`DELETE FROM nutrition_plans WHERE user_id = $1`, [userId]);
}

profile.post(
  "/profile/reset",
  asyncHandler(async (req: any, res: Response) => {
    const userId: string | undefined = req.user?.uid;
    if (!userId) throw new AppError("Unauthorized", 401);

    await q("BEGIN");
    try {
      await q(`DELETE FROM planned_workouts WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM workout_sessions WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM workout_plans WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM workouts WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM workout_schedules WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM training_programs WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM body_metrics WHERE user_id = $1`, [userId]);

      await wipeNutrition(userId);

      await q(`DELETE FROM onboardings WHERE user_id = $1`, [userId]);

      await q("COMMIT");
    } catch (err) {
      await q("ROLLBACK");
      throw err;
    }

    res.json({ ok: true });
  })
);

export default profile;

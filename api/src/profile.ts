import { Router, Response } from "express";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { getExerciseById } from "./exerciseAlternatives.js";
import { logExerciseChangeEvent } from "./exerciseChangeEvents.js";

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
      // Coach chat (messages FK-cascade from threads)
      await q(`DELETE FROM coach_chat_messages WHERE thread_id IN (SELECT id FROM coach_chat_threads WHERE user_id = $1::uuid)`, [userId]);
      await q(`DELETE FROM coach_chat_threads WHERE user_id = $1::uuid`, [userId]);

      // Jobs
      await q(`DELETE FROM coach_jobs WHERE user_id = $1::uuid`, [userId]);
      await q(`DELETE FROM progression_jobs WHERE user_id = $1::uuid`, [userId]);

      // Exercise history & progression (TEXT user_id)
      await q(`DELETE FROM exercise_history WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM exercise_progression WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM exercise_change_events WHERE user_id = $1::uuid`, [userId]);

      // Periodization
      await q(`DELETE FROM weekly_plans WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM mesocycles WHERE user_id = $1`, [userId]);

      // Check-ins
      await q(`DELETE FROM daily_check_ins WHERE user_id = $1`, [userId]);

      // Core workout data
      await q(`DELETE FROM planned_workouts WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM workout_sessions WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM workout_plans WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM workouts WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM workout_schedules WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM training_programs WHERE user_id = $1`, [userId]);
      await q(`DELETE FROM body_metrics WHERE user_id = $1`, [userId]);

      // Scheme & counters
      await q(`DELETE FROM user_workout_schemes WHERE user_id = $1::uuid`, [userId]);
      await q(`DELETE FROM user_session_counters WHERE user_id = $1::uuid`, [userId]);

      // Nutrition
      await wipeNutrition(userId);

      // Onboarding
      await q(`DELETE FROM onboardings WHERE user_id = $1`, [userId]);

      // Reset user record (created_at + excluded exercises)
      await q(`UPDATE users SET created_at = NOW(), excluded_exercise_ids = '{}' WHERE id = $1::uuid`, [userId]);

      await q("COMMIT");
    } catch (err) {
      await q("ROLLBACK");
      throw err;
    }

    res.json({ ok: true });
  })
);

profile.get(
  "/profile/excluded-exercises",
  asyncHandler(async (req: any, res: Response) => {
    const userId: string | undefined = req.user?.uid;
    if (!userId) throw new AppError("Unauthorized", 401);

    const rows = await q<{ excluded_exercise_ids: string[] | null }>(
      `SELECT excluded_exercise_ids FROM users WHERE id = $1::uuid LIMIT 1`,
      [userId]
    );
    const list = Array.isArray(rows[0]?.excluded_exercise_ids) ? rows[0]!.excluded_exercise_ids : [];
    res.json({ ok: true, excludedExerciseIds: list });
  })
);

profile.get(
  "/profile/excluded-exercises/details",
  asyncHandler(async (req: any, res: Response) => {
    const userId: string | undefined = req.user?.uid;
    if (!userId) throw new AppError("Unauthorized", 401);

    const rows = await q<{ excluded_exercise_ids: string[] | null }>(
      `SELECT excluded_exercise_ids FROM users WHERE id = $1::uuid LIMIT 1`,
      [userId]
    );
    const ids = Array.isArray(rows[0]?.excluded_exercise_ids) ? rows[0]!.excluded_exercise_ids : [];
    const items = ids
      .map((id) => {
        const ex = getExerciseById(id);
        return ex ? { exerciseId: ex.id, name: ex.name } : { exerciseId: id, name: id };
      })
      .slice(0, 200);
    res.json({ ok: true, excluded: items });
  })
);

profile.post(
  "/profile/excluded-exercises",
  asyncHandler(async (req: any, res: Response) => {
    const userId: string | undefined = req.user?.uid;
    if (!userId) throw new AppError("Unauthorized", 401);

    const exerciseId = String(req.body?.exerciseId || "").trim();
    if (!exerciseId) return res.status(400).json({ error: "missing_exercise_id" });
    if (!getExerciseById(exerciseId)) return res.status(400).json({ error: "unknown_exercise_id" });

    const rows = await q<{ excluded_exercise_ids: string[] }>(
      `
      UPDATE users
         SET excluded_exercise_ids = (
           SELECT ARRAY(
             SELECT DISTINCT e
               FROM unnest(coalesce(excluded_exercise_ids, '{}'::text[]) || ARRAY[$2]::text[]) AS e
           )
         ),
             updated_at = now()
       WHERE id = $1::uuid
       RETURNING excluded_exercise_ids
      `,
      [userId, exerciseId]
    );

    await logExerciseChangeEvent({
      userId,
      action: "exclude",
      fromExerciseId: exerciseId,
      source: String(req.body?.source || "user"),
      reason: String(req.body?.reason || "user_excluded"),
      meta: { at: new Date().toISOString() },
    });

    res.json({ ok: true, excludedExerciseIds: rows[0]?.excluded_exercise_ids ?? [] });
  })
);

profile.delete(
  "/profile/excluded-exercises/:exerciseId",
  asyncHandler(async (req: any, res: Response) => {
    const userId: string | undefined = req.user?.uid;
    if (!userId) throw new AppError("Unauthorized", 401);

    const exerciseId = String(req.params?.exerciseId || "").trim();
    if (!exerciseId) return res.status(400).json({ error: "missing_exercise_id" });

    const rows = await q<{ excluded_exercise_ids: string[] }>(
      `
      UPDATE users
         SET excluded_exercise_ids = array_remove(coalesce(excluded_exercise_ids, '{}'::text[]), $2::text),
             updated_at = now()
       WHERE id = $1::uuid
       RETURNING excluded_exercise_ids
      `,
      [userId, exerciseId]
    );

    await logExerciseChangeEvent({
      userId,
      action: "include",
      fromExerciseId: exerciseId,
      source: "user",
      reason: "user_included_back",
      meta: { at: new Date().toISOString() },
    });

    res.json({ ok: true, excludedExerciseIds: rows[0]?.excluded_exercise_ids ?? [] });
  })
);

export default profile;

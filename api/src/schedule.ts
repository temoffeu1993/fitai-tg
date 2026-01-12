// api/src/schedule.ts
import { Router, Request, Response } from "express";
import { q, withTransaction } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import type { WorkoutSchedulePayload } from "./types.js";
import { loadScheduleData, saveScheduleData, upsertScheduleDate } from "./utils/scheduleStore.js";
import { getExerciseById, isReplacementAllowed } from "./exerciseAlternatives.js";
import { logExerciseChangeEvent } from "./exerciseChangeEvents.js";
import { buildUserProfile } from "./userProfile.js";
import type { TimeBucket } from "./normalizedSchemes.js";
import { estimateTotalMinutesFromStoredPlanExercises, estimateWarmupCooldownMinutes } from "./workoutTime.js";

function getUserId(req: any) {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
}

const isHHMM = (s: unknown) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
const isISODate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);

type PlannedWorkoutRow = {
  id: string;
  plan: any;
  scheduled_for: string;
  workout_date?: string;
  status: string;
  result_session_id: string | null;
  created_at: string;
  updated_at: string;
};

const toIsoString = (value: any) => {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
};

const isoDateString = (value: string | Date) => {
  const dt = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

const timeFromDate = (value: Date) => value.toISOString().slice(11, 16);

const resolveTime = (scheduledFor: Date, preferred?: string) => {
  if (preferred && isHHMM(preferred)) return preferred;
  return timeFromDate(scheduledFor);
};

const parsePlan = (value: any) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
};

const serializePlannedWorkout = (row: PlannedWorkoutRow, timeBucket?: TimeBucket) => {
  const plan = parsePlan(row.plan);
  if (timeBucket) {
    const { warmupMin, cooldownMin } = estimateWarmupCooldownMinutes(timeBucket);
    const est = estimateTotalMinutesFromStoredPlanExercises(plan?.exercises, { warmupMin, cooldownMin });
    if (typeof est === "number" && Number.isFinite(est) && est > 0) {
      plan.estimatedDuration = est;
    }
  }
  return {
    id: row.id,
    plan,
  scheduledFor: toIsoString(row.scheduled_for),
  status: row.status,
  resultSessionId: row.result_session_id,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  };
};

function resolveExerciseIdFromPlanItem(ex: any): string | null {
  const id = ex?.exerciseId || ex?.id || ex?.exercise?.id || null;
  return typeof id === "string" && id.trim() ? id : null;
}

function resolveExerciseNameFromPlanItem(ex: any): string | null {
  const name = ex?.exerciseName || ex?.name || ex?.exercise?.name || null;
  return typeof name === "string" && name.trim() ? name : null;
}

function ensureExercisesArray(plan: any): any[] {
  const p = plan && typeof plan === "object" ? plan : {};
  const arr = Array.isArray((p as any).exercises) ? (p as any).exercises : [];
  return arr;
}

// GET: получить расписание
export const schedule = Router();
schedule.get(
  "/workout-schedule",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const data = await loadScheduleData(userId);
    const userProfile = await buildUserProfile(userId);

    const planned = await q<PlannedWorkoutRow>(
      `SELECT id, plan, scheduled_for, status, result_session_id, created_at, updated_at
         FROM planned_workouts
        WHERE user_id = $1
          AND status <> 'cancelled'
        ORDER BY scheduled_for ASC`,
      [userId]
    );

    return res.json({ schedule: data, plannedWorkouts: planned.map((row) => serializePlannedWorkout(row, userProfile.timeBucket)) });
  })
);

// POST: сохранить расписание
schedule.post(
  "/workout-schedule",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);

    // Поддерживаем старое тело { schedule: DowSchedule } и новое { schedule: { dow, dates } }
    const body = req.body?.schedule;
    let payload: WorkoutSchedulePayload;

    if (body && (body.dow || body.dates)) {
      payload = { dow: body.dow ?? {}, dates: body.dates ?? {} };
    } else {
      // старый формат — только dow
      payload = { dow: body ?? {} };
    }

    // Лёгкая валидация времени
    if (payload.dow) {
      for (const k of Object.keys(payload.dow)) {
        const v = payload.dow[k];
        if (!v || typeof v.enabled !== "boolean" || !isHHMM(v.time)) {
          return res.status(400).json({ error: "bad_dow", key: k });
        }
      }
    }
    if (payload.dates) {
      for (const d of Object.keys(payload.dates)) {
        if (!isISODate(d) || !isHHMM(payload.dates[d].time)) {
          return res.status(400).json({ error: "bad_date", date: d });
        }
      }
    }

    await saveScheduleData(userId, payload);

    return res.json({ ok: true });
  })
);

schedule.get(
  "/planned-workouts",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const userProfile = await buildUserProfile(userId);
    const planned = await q<PlannedWorkoutRow>(
      `SELECT id, plan, scheduled_for, status, result_session_id, created_at, updated_at
         FROM planned_workouts
        WHERE user_id = $1
          AND status <> 'cancelled'
          AND status <> 'completed'
          AND scheduled_for >= CURRENT_DATE
          AND scheduled_for < CURRENT_DATE + INTERVAL '14 days'
        ORDER BY scheduled_for ASC`,
      [userId]
    );

    res.json({ plannedWorkouts: planned.map((row) => serializePlannedWorkout(row, userProfile.timeBucket)) });
  })
);

schedule.post(
  "/planned-workouts/:id/reset",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const { id } = req.params;

    if (!isUUID(id)) {
      return res.status(400).json({ error: "invalid_id" });
    }

    const rows = await q<PlannedWorkoutRow>(
      `UPDATE planned_workouts
          SET plan = COALESCE(base_plan, plan),
              data = COALESCE(base_plan, plan),
              updated_at = now()
        WHERE user_id = $1 AND id = $2
        RETURNING id, plan, scheduled_for, status, result_session_id, created_at, updated_at`,
      [userId, id]
    );

    const updated = rows[0];
    if (!updated) {
      return res.status(404).json({ error: "not_found" });
    }

    const userProfile = await buildUserProfile(userId);
    res.json({ plannedWorkout: serializePlannedWorkout(updated, userProfile.timeBucket) });
  })
);

schedule.post(
  "/planned-workouts",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const body = req.body ?? {};
    const plan = body.plan;
    const scheduledForRaw = body.scheduledFor;

    if (!plan || typeof plan !== "object") {
      return res.status(400).json({ error: "invalid_plan" });
    }

    if (typeof scheduledForRaw !== "string" || !scheduledForRaw.trim()) {
      return res.status(400).json({ error: "invalid_scheduled_for" });
    }

    const scheduledFor = new Date(scheduledForRaw);
    if (!Number.isFinite(scheduledFor.getTime())) {
      return res.status(400).json({ error: "invalid_datetime" });
    }

    const preferredTime = typeof body.scheduledTime === "string" ? body.scheduledTime : undefined;
    const slotTime = resolveTime(scheduledFor, preferredTime);

    const [row] = await q<PlannedWorkoutRow>(
      `INSERT INTO planned_workouts (user_id, plan, scheduled_for)
       VALUES ($1, $2::jsonb, $3)
       RETURNING id, plan, scheduled_for, status, result_session_id, created_at, updated_at`,
      [userId, JSON.stringify(plan), scheduledFor.toISOString()]
    );

    const isoDate = isoDateString(scheduledFor);
    if (isoDate) {
      await upsertScheduleDate(userId, isoDate, slotTime);
    }

    const userProfile = await buildUserProfile(userId);
    res.status(201).json({ plannedWorkout: serializePlannedWorkout(row, userProfile.timeBucket) });
  })
);

schedule.patch(
  "/planned-workouts/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const { id } = req.params;

    if (!isUUID(id)) {
      return res.status(400).json({ error: "invalid_id" });
    }

    const existingRows = await q<PlannedWorkoutRow>(
      `SELECT id, plan, scheduled_for, workout_date, status, result_session_id, created_at, updated_at
         FROM planned_workouts
        WHERE user_id = $1 AND id = $2
        LIMIT 1`,
      [userId, id]
    );

    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ error: "not_found" });
    }

    const body = req.body ?? {};
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    let scheduledDate: Date | null = null;
    const nextStatusRaw = body.status;

    if (typeof body.scheduledFor === "string" && body.scheduledFor.trim()) {
      const dt = new Date(body.scheduledFor);
      if (!Number.isFinite(dt.getTime())) {
        return res.status(400).json({ error: "invalid_datetime" });
      }
      scheduledDate = dt;
      fields.push(`scheduled_for = $${idx++}`);
      values.push(dt.toISOString());
    }

    if (typeof body.plan === "object" && body.plan) {
      fields.push(`plan = $${idx++}::jsonb`);
      values.push(JSON.stringify(body.plan));
    }

    if (typeof nextStatusRaw === "string" && nextStatusRaw.trim()) {
      const nextStatus = nextStatusRaw.trim();
      const allowed = new Set(["scheduled", "pending", "cancelled", "completed"]);
      if (!allowed.has(nextStatus)) {
        return res.status(400).json({ error: "invalid_status" });
      }
      fields.push(`status = $${idx++}`);
      values.push(nextStatus);

      // When unscheduling back to pending, reset scheduled_for to the original generated day
      // (workout_date at 00:00) so it stays visible in PlanOne (which filters by scheduled_for range).
      if (nextStatus === "pending" && !scheduledDate) {
        fields.push(`scheduled_for = workout_date::timestamp`);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "nothing_to_update" });
    }

    values.push(userId);
    values.push(id);

    const rows = await q<PlannedWorkoutRow>(
      `UPDATE planned_workouts
          SET ${fields.join(", ")}, updated_at = now()
        WHERE user_id = $${idx++} AND id = $${idx}
        RETURNING id, plan, scheduled_for, status, result_session_id, created_at, updated_at`,
      values
    );

    const updated = rows[0];
    if (!updated) {
      return res.status(404).json({ error: "not_found" });
    }

    const effectiveDate = scheduledDate ?? new Date(updated.scheduled_for);
    const preferredTime = typeof body.scheduledTime === "string" ? body.scheduledTime : undefined;
    const slotTime = resolveTime(effectiveDate, preferredTime);
    const isoDate = isoDateString(effectiveDate);

    if (isoDate) {
      await upsertScheduleDate(userId, isoDate, slotTime);
    }

    const userProfile = await buildUserProfile(userId);
    res.json({ plannedWorkout: serializePlannedWorkout(updated, userProfile.timeBucket) });
  })
);

// ============================================================================
// Planned workout exercise operations (replace/remove/skip)
// ============================================================================

schedule.patch(
  "/planned-workouts/:id/exercises/:index/replace",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const { id } = req.params;
    const index = Number(req.params?.index);
    if (!isUUID(id)) return res.status(400).json({ error: "invalid_id" });
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: "invalid_index" });

    const newExerciseId = String(req.body?.newExerciseId || "").trim();
    if (!newExerciseId) return res.status(400).json({ error: "missing_new_exercise_id" });
    if (!getExerciseById(newExerciseId)) return res.status(400).json({ error: "unknown_new_exercise_id" });

    const reason = typeof req.body?.reason === "string" ? String(req.body.reason) : null;
    const source = typeof req.body?.source === "string" ? String(req.body.source) : "user";

    const userProfile = await buildUserProfile(userId);

    const updated = await withTransaction(async () => {
      const existingRows = await q<PlannedWorkoutRow>(
        `SELECT id, plan, scheduled_for, status, result_session_id, created_at, updated_at
           FROM planned_workouts
          WHERE user_id = $1 AND id = $2
          LIMIT 1`,
        [userId, id]
      );
      const existing = existingRows[0];
      if (!existing) throw new AppError("not_found", 404);
      if (existing.status === "cancelled") throw new AppError("planned_workout_cancelled", 409);

      const plan = parsePlan(existing.plan);
      const exercises = ensureExercisesArray(plan);
      if (!exercises.length) throw new AppError("no_exercises_in_plan", 400);
      if (index >= exercises.length) throw new AppError("index_out_of_range", 400);

      const prev = exercises[index];
      const fromExerciseId = resolveExerciseIdFromPlanItem(prev);
      if (!fromExerciseId) throw new AppError("missing_original_exercise_id", 400);

      // Ensure replacement stays consistent for this user (level/equipment + blacklist).
      const equipmentAvailable =
        userProfile.equipment === "gym_full"
          ? (["gym_full"] as any)
          : userProfile.equipment === "dumbbells"
            ? (["dumbbell", "bench", "bodyweight"] as any)
            : userProfile.equipment === "bodyweight"
              ? (["bodyweight", "pullup_bar", "bands"] as any)
              : (["gym_full"] as any);
      const ok = isReplacementAllowed({
        fromExerciseId,
        toExerciseId: newExerciseId,
        ctx: {
          userExperience: userProfile.experience as any,
          equipmentAvailable,
          excludedExerciseIds: userProfile.excludedExerciseIds ?? [],
          reason: reason as any,
        },
      });
      if (!ok) throw new AppError("replacement_not_allowed", 400);

      const lib = getExerciseById(newExerciseId);
      if (!lib) throw new AppError("unknown_new_exercise_id", 400);

      const at = new Date().toISOString();
      const nextItem: any = {
        ...prev,
        exerciseId: lib.id,
        exerciseName: lib.name,
        name: typeof prev?.name === "string" ? lib.name : prev?.name,
        // Never keep old weight when switching exercises.
        // The correct suggestion will be attached later by /plan/workout/start based on progression.
        weight: null,
        replacedFromExerciseId: fromExerciseId,
        replacedFromExerciseName: resolveExerciseNameFromPlanItem(prev),
        replacedAt: at,
        replaceReason: reason,
        replaceSource: source,
      };
      // Force fresh load metadata to be re-inferred for the new exercise.
      delete nextItem.loadType;
      delete nextItem.requiresWeightInput;
      delete nextItem.weightLabel;
      exercises[index] = nextItem;
      const nextPlan = { ...plan, exercises };

      const [row] = await q<PlannedWorkoutRow>(
        `
        UPDATE planned_workouts
           SET plan = $3::jsonb,
               data = $3::jsonb,
               base_plan = $3::jsonb,
               updated_at = now()
         WHERE user_id = $1 AND id = $2
         RETURNING id, plan, scheduled_for, status, result_session_id, created_at, updated_at
        `,
        [userId, id, JSON.stringify(nextPlan)]
      );
      if (!row) throw new AppError("not_found", 404);

      await logExerciseChangeEvent({
        userId,
        plannedWorkoutId: id,
        action: "replace",
        fromExerciseId,
        toExerciseId: lib.id,
        reason,
        source,
        meta: { index, at },
      });

      return row;
    });

    res.json({ plannedWorkout: serializePlannedWorkout(updated, userProfile.timeBucket) });
  })
);

schedule.delete(
  "/planned-workouts/:id/exercises/:index",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const { id } = req.params;
    const index = Number(req.params?.index);
    if (!isUUID(id)) return res.status(400).json({ error: "invalid_id" });
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: "invalid_index" });

    const reason = typeof (req as any).body?.reason === "string" ? String((req as any).body.reason) : null;
    const source = typeof (req as any).body?.source === "string" ? String((req as any).body.source) : "user";

    const updated = await withTransaction(async () => {
      const existingRows = await q<PlannedWorkoutRow>(
        `SELECT id, plan, scheduled_for, status, result_session_id, created_at, updated_at
           FROM planned_workouts
          WHERE user_id = $1 AND id = $2
          LIMIT 1`,
        [userId, id]
      );
      const existing = existingRows[0];
      if (!existing) throw new AppError("not_found", 404);
      if (existing.status === "cancelled") throw new AppError("planned_workout_cancelled", 409);

      const plan = parsePlan(existing.plan);
      const exercises = ensureExercisesArray(plan);
      if (!exercises.length) throw new AppError("no_exercises_in_plan", 400);
      if (index >= exercises.length) throw new AppError("index_out_of_range", 400);

      const removed = exercises[index];
      const fromExerciseId = resolveExerciseIdFromPlanItem(removed);
      const at = new Date().toISOString();

      exercises.splice(index, 1);
      const nextPlan = { ...plan, exercises };

      const [row] = await q<PlannedWorkoutRow>(
        `
        UPDATE planned_workouts
           SET plan = $3::jsonb,
               data = $3::jsonb,
               base_plan = $3::jsonb,
               updated_at = now()
         WHERE user_id = $1 AND id = $2
         RETURNING id, plan, scheduled_for, status, result_session_id, created_at, updated_at
        `,
        [userId, id, JSON.stringify(nextPlan)]
      );
      if (!row) throw new AppError("not_found", 404);

      await logExerciseChangeEvent({
        userId,
        plannedWorkoutId: id,
        action: "remove",
        fromExerciseId,
        reason,
        source,
        meta: { index, at },
      });

      return row;
    });

    const userProfile = await buildUserProfile(userId);
    res.json({ plannedWorkout: serializePlannedWorkout(updated, userProfile.timeBucket) });
  })
);

schedule.patch(
  "/planned-workouts/:id/exercises/:index/skip",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const { id } = req.params;
    const index = Number(req.params?.index);
    if (!isUUID(id)) return res.status(400).json({ error: "invalid_id" });
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: "invalid_index" });

    const reason = typeof req.body?.reason === "string" ? String(req.body.reason) : null;
    const source = typeof req.body?.source === "string" ? String(req.body.source) : "user";

    const updated = await withTransaction(async () => {
      const existingRows = await q<PlannedWorkoutRow>(
        `SELECT id, plan, scheduled_for, status, result_session_id, created_at, updated_at
           FROM planned_workouts
          WHERE user_id = $1 AND id = $2
          LIMIT 1`,
        [userId, id]
      );
      const existing = existingRows[0];
      if (!existing) throw new AppError("not_found", 404);
      if (existing.status === "cancelled") throw new AppError("planned_workout_cancelled", 409);

      const plan = parsePlan(existing.plan);
      const exercises = ensureExercisesArray(plan);
      if (!exercises.length) throw new AppError("no_exercises_in_plan", 400);
      if (index >= exercises.length) throw new AppError("index_out_of_range", 400);

      const cur = exercises[index];
      const fromExerciseId = resolveExerciseIdFromPlanItem(cur);
      const at = new Date().toISOString();

      exercises[index] = {
        ...cur,
        skipped: true,
        skippedAt: at,
        skipReason: reason,
        skipSource: source,
      };

      const nextPlan = { ...plan, exercises };

      const [row] = await q<PlannedWorkoutRow>(
        `
        UPDATE planned_workouts
           SET plan = $3::jsonb,
               data = $3::jsonb,
               base_plan = $3::jsonb,
               updated_at = now()
         WHERE user_id = $1 AND id = $2
         RETURNING id, plan, scheduled_for, status, result_session_id, created_at, updated_at
        `,
        [userId, id, JSON.stringify(nextPlan)]
      );
      if (!row) throw new AppError("not_found", 404);

      await logExerciseChangeEvent({
        userId,
        plannedWorkoutId: id,
        action: "skip",
        fromExerciseId,
        reason,
        source,
        meta: { index, at },
      });

      return row;
    });

    const userProfile = await buildUserProfile(userId);
    res.json({ plannedWorkout: serializePlannedWorkout(updated, userProfile.timeBucket) });
  })
);

schedule.delete(
  "/planned-workouts/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const { id } = req.params;

    if (!isUUID(id)) {
      return res.status(400).json({ error: "invalid_id" });
    }

    const rows = await q<PlannedWorkoutRow>(
      `UPDATE planned_workouts
          SET status = 'cancelled', updated_at = now()
        WHERE user_id = $1 AND id = $2
        RETURNING id, plan, scheduled_for, status, result_session_id, created_at, updated_at`,
      [userId, id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "not_found" });
    }

    const userProfile = await buildUserProfile(userId);
    res.json({ plannedWorkout: serializePlannedWorkout(rows[0], userProfile.timeBucket) });
  })
);

export default schedule;

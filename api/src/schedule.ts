// api/src/schedule.ts
import { Router, Request, Response } from "express";
import { q } from "./db.js";
import { asyncHandler } from "./middleware/errorHandler.js";
import type { WorkoutSchedulePayload } from "./types.js";
import { loadScheduleData, saveScheduleData, upsertScheduleDate } from "./utils/scheduleStore.js";

async function getUserId(req: any) {
  const bodyUserId = req.body?.userId;
  if (bodyUserId) return bodyUserId;
  if (req.user?.uid) return req.user.uid;
  const r = await q(
    `INSERT INTO users (tg_id, first_name, username)
     VALUES (0, 'Dev', 'local')
     ON CONFLICT (tg_id) DO UPDATE SET username = excluded.username
     RETURNING id`
  );
  return r[0].id;
}

const isHHMM = (s: unknown) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
const isISODate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUUID = (s: unknown) => typeof s === "string" && /^[0-9a-fA-F-]{32,36}$/.test(s);

type PlannedWorkoutRow = {
  id: string;
  plan: any;
  scheduled_for: string;
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

const serializePlannedWorkout = (row: PlannedWorkoutRow) => ({
  id: row.id,
  plan: parsePlan(row.plan),
  scheduledFor: toIsoString(row.scheduled_for),
  status: row.status,
  resultSessionId: row.result_session_id,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
});

// GET: получить расписание
export const schedule = Router();
schedule.get(
  "/workout-schedule",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const data = await loadScheduleData(userId);

    const planned = await q<PlannedWorkoutRow>(
      `SELECT id, plan, scheduled_for, status, result_session_id, created_at, updated_at
         FROM planned_workouts
        WHERE user_id = $1
          AND status <> 'cancelled'
        ORDER BY scheduled_for ASC`,
      [userId]
    );

    return res.json({ schedule: data, plannedWorkouts: planned.map(serializePlannedWorkout) });
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
    const planned = await q<PlannedWorkoutRow>(
      `SELECT id, plan, scheduled_for, status, result_session_id, created_at, updated_at
         FROM planned_workouts
        WHERE user_id = $1
          AND status <> 'cancelled'
        ORDER BY scheduled_for ASC`,
      [userId]
    );

    res.json({ plannedWorkouts: planned.map(serializePlannedWorkout) });
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

    res.status(201).json({ plannedWorkout: serializePlannedWorkout(row) });
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
      `SELECT id, plan, scheduled_for, status, result_session_id, created_at, updated_at
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

    res.json({ plannedWorkout: serializePlannedWorkout(updated) });
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

    res.json({ plannedWorkout: serializePlannedWorkout(rows[0]) });
  })
);

export default schedule;

import { q } from "../db.js";
import type { WorkoutSchedulePayload, DateSchedule } from "../types.js";

function normalizeSchedule(raw: any): WorkoutSchedulePayload {
  if (!raw) return { dow: {}, dates: {} };
  if (raw.dow || raw.dates) {
    return {
      dow: raw.dow ?? {},
      dates: raw.dates ?? {},
    };
  }
  return { dow: raw ?? {}, dates: {} };
}

export async function loadScheduleData(userId: string): Promise<WorkoutSchedulePayload> {
  const rows = await q(`SELECT data FROM workout_schedules WHERE user_id = $1 LIMIT 1`, [userId]);
  return normalizeSchedule(rows[0]?.data ?? {});
}

export async function saveScheduleData(userId: string, payload: WorkoutSchedulePayload): Promise<void> {
  const body: WorkoutSchedulePayload = {
    dow: payload.dow ?? {},
    dates: payload.dates ?? {},
  };

  await q(
    `INSERT INTO workout_schedules (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [userId, body]
  );
}

export async function upsertScheduleDate(userId: string, isoDate: string, time: string): Promise<void> {
  const current = await loadScheduleData(userId);
  const nextDates: DateSchedule = { ...(current.dates ?? {}) };
  nextDates[isoDate] = { time };
  await saveScheduleData(userId, { dow: current.dow ?? {}, dates: nextDates });
}

export async function removeScheduleDate(userId: string, isoDate: string): Promise<void> {
  const current = await loadScheduleData(userId);
  if (!current.dates || !current.dates[isoDate]) return;
  const nextDates: DateSchedule = { ...current.dates };
  delete nextDates[isoDate];
  await saveScheduleData(userId, { dow: current.dow ?? {}, dates: nextDates });
}

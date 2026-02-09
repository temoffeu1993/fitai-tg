import { q } from "../db.js";
import type { WorkoutSchedulePayload, DateSchedule } from "../types.js";

const isHHMM = (s: unknown) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);

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

function hasSameDates(a: DateSchedule, b: DateSchedule): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!b[key]) return false;
    if (a[key]?.time !== b[key]?.time) return false;
  }
  return true;
}

export async function syncScheduleDatesWithPlannedWorkouts(userId: string): Promise<void> {
  const current = await loadScheduleData(userId);
  const rows = await q<{ scheduled_for: string }>(
    `SELECT scheduled_for
       FROM planned_workouts
      WHERE user_id = $1
        AND status = 'scheduled'
      ORDER BY scheduled_for ASC`,
    [userId]
  );

  const activeDates = new Set<string>();
  const fallbackTimes = new Map<string, string>();

  for (const row of rows) {
    const dt = new Date(row.scheduled_for);
    if (!Number.isFinite(dt.getTime())) continue;
    const isoDate = dt.toISOString().slice(0, 10);
    const isoTime = dt.toISOString().slice(11, 16);
    activeDates.add(isoDate);
    if (!fallbackTimes.has(isoDate)) {
      fallbackTimes.set(isoDate, isoTime);
    }
  }

  const currentDates: DateSchedule = { ...(current.dates ?? {}) };
  const nextDates: DateSchedule = {};

  activeDates.forEach((isoDate) => {
    const existingTime = currentDates[isoDate]?.time;
    const fallbackTime = fallbackTimes.get(isoDate) ?? "00:00";
    nextDates[isoDate] = { time: isHHMM(existingTime) ? existingTime : fallbackTime };
  });

  if (hasSameDates(currentDates, nextDates)) return;
  await saveScheduleData(userId, { dow: current.dow ?? {}, dates: nextDates });
}

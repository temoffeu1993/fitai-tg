// mesocycleDb.ts
// БД функции для мезоциклов и недельных планов

import { q } from "./db.js";
import type { Mesocycle } from "./mesocycleEngine.js";
import type { GeneratedWorkoutDay } from "./workoutDayGenerator.js";

// ============================================================================
// MESOCYCLES
// ============================================================================

export async function getMesocycle(userId: string): Promise<Mesocycle | null> {
  const rows = await q<{ cycle_data: Mesocycle }>(
    `SELECT cycle_data FROM mesocycles WHERE user_id = $1`,
    [userId]
  );

  return rows.length > 0 ? rows[0].cycle_data : null;
}

export async function saveMesocycle(userId: string, mesocycle: Mesocycle): Promise<void> {
  await q(
    `INSERT INTO mesocycles (user_id, cycle_data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) 
     DO UPDATE SET cycle_data = $2, updated_at = NOW()`,
    [userId, JSON.stringify(mesocycle)]
  );
}

// ============================================================================
// WEEKLY PLANS
// ============================================================================

export async function getWeeklyPlan(
  userId: string,
  weekStartDate: string
): Promise<{ workouts: GeneratedWorkoutDay[]; mesoWeek: number } | null> {
  const rows = await q<{ workouts: any; meso_week: number }>(
    `SELECT workouts, meso_week FROM weekly_plans 
     WHERE user_id = $1 AND week_start_date = $2`,
    [userId, weekStartDate]
  );

  return rows.length > 0 
    ? { workouts: rows[0].workouts, mesoWeek: rows[0].meso_week }
    : null;
}

export async function saveWeeklyPlan(args: {
  userId: string;
  weekStartDate: string;
  mesoWeek: number;
  schemeId: string;
  workouts: GeneratedWorkoutDay[];
}): Promise<void> {
  const { userId, weekStartDate, mesoWeek, schemeId, workouts } = args;

  await q(
    `INSERT INTO weekly_plans (user_id, week_start_date, meso_week, scheme_id, workouts)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, week_start_date)
     DO UPDATE SET 
       meso_week = $3,
       scheme_id = $4,
       workouts = $5`,
    [userId, weekStartDate, mesoWeek, schemeId, JSON.stringify(workouts)]
  );
}

export async function getCurrentWeekStart(): Promise<string> {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

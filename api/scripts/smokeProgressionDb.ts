// api/scripts/smokeProgressionDb.ts
// DB-backed smoke test for progression logic (safe: uses a random test user id)

import { randomUUID } from "node:crypto";
import { q, withTransaction } from "../src/db.js";
import { applyProgressionFromSession } from "../src/progressionService.js";

type ProgressionRow = {
  current_weight: number | string;
  stall_count: number | string;
};

async function getProg(userId: string, exerciseId: string) {
  const rows = await q<ProgressionRow>(
    `SELECT current_weight, stall_count
       FROM exercise_progression
      WHERE user_id = $1::uuid AND exercise_id = $2
      LIMIT 1`,
    [userId, exerciseId]
  );
  return rows[0] || null;
}

async function getLastHistory(userId: string, exerciseId: string) {
  const rows = await q<{ sets: any }>(
    `SELECT sets
       FROM exercise_history
      WHERE user_id = $1::uuid AND exercise_id = $2
      ORDER BY workout_date DESC
      LIMIT 1`,
    [userId, exerciseId]
  );
  return rows[0]?.sets ?? null;
}

function assert(condition: any, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function approxEqual(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

async function ensureTestUser(userId: string) {
  // Some schemas have FK from progression/history → users, so create a user row if needed.
  // If your schema doesn't have this table/constraint, it will fail loudly (which is good for debugging).
  await q(
    `INSERT INTO users (id, tg_id, created_at)
     VALUES ($1::uuid, $2, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, String(Math.floor(9e8 + Math.random() * 1e8))]
  );
}

async function cleanup(userId: string) {
  await q(`DELETE FROM exercise_history WHERE user_id = $1::uuid`, [userId]);
  await q(`DELETE FROM exercise_progression WHERE user_id = $1::uuid`, [userId]);
  await q(`DELETE FROM daily_check_ins WHERE user_id = $1::uuid`, [userId]);
  await q(`DELETE FROM planned_workouts WHERE user_id = $1::uuid`, [userId]);
  await q(`DELETE FROM users WHERE id = $1::uuid`, [userId]);
}

async function insertPlannedWorkout(args: {
  userId: string;
  intent: "light" | "normal" | "hard";
  exerciseId: string;
  exerciseName: string;
  plannedSets: number;
}) {
  const { userId, intent, exerciseId, exerciseName, plannedSets } = args;
  const plan = {
    intent,
    exercises: [{ exerciseId, name: exerciseName, sets: plannedSets }],
  };
  const [row] = await q<{ id: string }>(
    `INSERT INTO planned_workouts (user_id, plan, scheduled_for)
     VALUES ($1::uuid, $2::jsonb, NOW())
     RETURNING id`,
    [userId, JSON.stringify(plan)]
  );
  return row?.id as string;
}

async function insertBadCheckin(userId: string) {
  await q(
    `INSERT INTO daily_check_ins (user_id, pain, sleep_quality, stress_level, energy_level, notes, available_minutes)
     VALUES ($1::uuid, $2::jsonb, $3, $4, $5, $6, $7)`,
    [
      userId,
      JSON.stringify([{ location: "lower_back", level: 7 }]),
      "poor",
      "very_high",
      "low",
      "smoke test",
      40,
    ]
  );
}

async function run() {
  const userId = randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  const bench = { id: "ho_barbell_bench_press", name: "Жим штанги лёжа" };
  const squat = { id: "sq_back_squat", name: "Присед со штангой" };

  console.log("DB smoke progression test user:", userId);

  await withTransaction(async () => {
    await ensureTestUser(userId);
    await cleanup(userId);
    await ensureTestUser(userId);
  });

  // CASE A: First workout should progress; warmups excluded from working sets; currentWeight synced from performed weight.
  console.log("\nCASE A: first workout, warmups excluded, should +weight");
  const a = await applyProgressionFromSession({
    userId,
    goal: "build_muscle",
    experience: "intermediate",
    workoutDate: today,
    payload: {
      title: "A",
      durationMin: 60,
      exercises: [
        {
          id: bench.id,
          name: bench.name,
          reps: "8-12",
          effort: "working",
          done: true,
          sets: [
            { reps: 10, weight: 40 }, // warmup
            { reps: 12, weight: 60 }, // working
            { reps: 12, weight: 60 }, // working
            { reps: 12, weight: 60 }, // working
          ],
        },
      ],
      feedback: { sessionRpe: 7 },
    },
  });

  assert(a.details[0]?.recommendation?.action === "increase_weight", "CASE A expected increase_weight");
  assert(approxEqual(a.details[0]?.recommendation?.newWeight, 62.5), "CASE A expected newWeight 62.5");
  const progA = await getProg(userId, bench.id);
  assert(progA, "CASE A progression row missing");
  assert(approxEqual(Number(progA!.current_weight), 62.5), "CASE A DB current_weight should be 62.5");
  assert(Number(progA!.stall_count) === 0, "CASE A stall_count should be 0");
  const histA = await getLastHistory(userId, bench.id);
  const histASets = typeof histA === "string" ? JSON.parse(histA) : histA;
  assert(Array.isArray(histASets) && histASets.length === 4, "CASE A history should store all reps-based sets (incl warmup)");

  // CASE B: Anti-overreach blocks increases (high sessionRpe).
  console.log("\nCASE B: anti-overreach, should maintain even if top reps hit");
  const b = await applyProgressionFromSession({
    userId,
    goal: "build_muscle",
    experience: "intermediate",
    workoutDate: today,
    payload: {
      title: "B",
      durationMin: 60,
      exercises: [
        {
          id: bench.id,
          name: bench.name,
          reps: "8-12",
          effort: "hard",
          done: true,
          sets: [
            { reps: 12, weight: 62.5 },
            { reps: 12, weight: 62.5 },
            { reps: 12, weight: 62.5 },
          ],
        },
      ],
      feedback: { sessionRpe: 9 },
    },
  });
  assert(b.details[0]?.recommendation?.action === "maintain", "CASE B expected maintain");
  const progB = await getProg(userId, bench.id);
  assert(progB, "CASE B progression row missing");
  assert(approxEqual(Number(progB!.current_weight), 62.5), "CASE B DB current_weight should remain 62.5");
  assert(Number(progB!.stall_count) === 0, "CASE B stall_count should remain 0");

  // CASE C: do-not-penalize via planned intent light (should not increase stallCount on failure).
  console.log("\nCASE C: do-not-penalize via planned intent=light, should maintain and no stall");
  const plannedLightId = await insertPlannedWorkout({
    userId,
    intent: "light",
    exerciseId: bench.id,
    exerciseName: bench.name,
    plannedSets: 3,
  });
  const c = await applyProgressionFromSession({
    userId,
    goal: "build_muscle",
    experience: "intermediate",
    workoutDate: today,
    plannedWorkoutId: plannedLightId,
    payload: {
      title: "C",
      durationMin: 40,
      exercises: [
        {
          id: bench.id,
          name: bench.name,
          reps: "8-12",
          effort: "working",
          done: true,
          sets: [
            { reps: 6, weight: 62.5 },
            { reps: 6, weight: 62.5 },
            { reps: 6, weight: 62.5 },
          ],
        },
      ],
      feedback: { sessionRpe: 7 },
    },
  });
  assert(c.details[0]?.recommendation?.action === "maintain", "CASE C expected maintain");
  assert(Boolean(c.details[0]?.recommendation?.reason?.includes("Recovery")), "CASE C expected Recovery reason");
  const progC = await getProg(userId, bench.id);
  assert(progC, "CASE C progression row missing");
  assert(Number(progC!.stall_count) === 0, "CASE C stall_count should stay 0 (no-penalty)");

  // CASE D: do-not-penalize via bad check-in signals (sleep/pain/stress).
  console.log("\nCASE D: do-not-penalize via bad check-in, should maintain and no stall");
  await insertBadCheckin(userId);
  const d = await applyProgressionFromSession({
    userId,
    goal: "build_muscle",
    experience: "intermediate",
    workoutDate: today,
    payload: {
      title: "D",
      durationMin: 50,
      exercises: [
        {
          id: bench.id,
          name: bench.name,
          reps: "8-12",
          effort: "working",
          done: true,
          sets: [
            { reps: 6, weight: 62.5 },
            { reps: 6, weight: 62.5 },
            { reps: 6, weight: 62.5 },
          ],
        },
      ],
      feedback: { sessionRpe: 7 },
    },
  });
  assert(d.details[0]?.recommendation?.action === "maintain", "CASE D expected maintain");
  assert(Boolean(d.details[0]?.recommendation?.reason?.includes("чек-ин")), "CASE D expected check-in reason");
  const progD = await getProg(userId, bench.id);
  assert(progD, "CASE D progression row missing");
  assert(Number(progD!.stall_count) === 0, "CASE D stall_count should stay 0 (no-penalty)");

  // Clear check-ins so the next case tests the shortened-workout trigger specifically.
  await q(`DELETE FROM daily_check_ins WHERE user_id = $1::uuid`, [userId]);

  // CASE E: do-not-penalize via shortened workout (performed/planned < 0.75)
  console.log("\nCASE E: do-not-penalize via shortened workout, should maintain and no stall");
  const plannedNormalId = await insertPlannedWorkout({
    userId,
    intent: "normal",
    exerciseId: bench.id,
    exerciseName: bench.name,
    plannedSets: 4,
  });
  const e = await applyProgressionFromSession({
    userId,
    goal: "build_muscle",
    experience: "intermediate",
    workoutDate: today,
    plannedWorkoutId: plannedNormalId,
    payload: {
      title: "E",
      durationMin: 25,
      exercises: [
        {
          id: bench.id,
          name: bench.name,
          reps: "8-12",
          effort: "working",
          done: true,
          sets: [
            { reps: 6, weight: 62.5 },
            { reps: 6, weight: 62.5 },
          ],
        },
      ],
      feedback: { sessionRpe: 7 },
    },
  });
  assert(e.details[0]?.recommendation?.action === "maintain", "CASE E expected maintain");
  assert(Boolean(e.details[0]?.recommendation?.reason?.includes("сокращ")), "CASE E expected shortened reason");
  const progE = await getProg(userId, bench.id);
  assert(progE, "CASE E progression row missing");
  assert(Number(progE!.stall_count) === 0, "CASE E stall_count should stay 0 (no-penalty)");

  // CASE F: discrete failure logic (3 sets with 2 fails => stall; 4 sets with 2 fails => no additional stall)
  console.log("\nCASE F: discrete failure logic (no 3-sets stricter artifact)");
  const f1 = await applyProgressionFromSession({
    userId,
    goal: "build_muscle",
    experience: "intermediate",
    workoutDate: today,
    payload: {
      title: "F1",
      durationMin: 60,
      exercises: [
        {
          id: squat.id,
          name: squat.name,
          reps: "8-12",
          effort: "working",
          done: true,
          sets: [
            { reps: 7, weight: 100 },
            { reps: 7, weight: 100 },
            { reps: 8, weight: 100 },
          ],
        },
      ],
      feedback: { sessionRpe: 7 },
    },
  });
  assert(Boolean(f1.details[0]?.recommendation?.failedLowerBound), "CASE F1 should flag failedLowerBound");
  const progF1 = await getProg(userId, squat.id);
  assert(progF1, "CASE F1 progression row missing");
  assert(Number(progF1!.stall_count) === 1, "CASE F1 stall_count should be 1");

  const f2 = await applyProgressionFromSession({
    userId,
    goal: "build_muscle",
    experience: "intermediate",
    workoutDate: today,
    payload: {
      title: "F2",
      durationMin: 60,
      exercises: [
        {
          id: squat.id,
          name: squat.name,
          reps: "8-12",
          effort: "working",
          done: true,
          sets: [
            { reps: 7, weight: 100 },
            { reps: 7, weight: 100 },
            { reps: 8, weight: 100 },
            { reps: 8, weight: 100 },
          ],
        },
      ],
      feedback: { sessionRpe: 7 },
    },
  });
  assert(!Boolean(f2.details[0]?.recommendation?.failedLowerBound), "CASE F2 should not flag failedLowerBound");
  const progF2 = await getProg(userId, squat.id);
  assert(progF2, "CASE F2 progression row missing");
  assert(Number(progF2!.stall_count) === 1, "CASE F2 stall_count should remain 1");

  console.log("\n✅ All smoke checks passed.");

  await withTransaction(async () => {
    await cleanup(userId);
  });
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

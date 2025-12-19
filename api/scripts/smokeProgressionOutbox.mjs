// api/scripts/smokeProgressionOutbox.mjs
// Smoke-test the progression outbox (jobs) without running the HTTP server.
//
// Run:
//   cd api
//   npm run build
//   npx dotenv -e .env -- node scripts/smokeProgressionOutbox.mjs

import { randomUUID } from "node:crypto";
import { q, withTransaction } from "../dist/db.js";
import { enqueueProgressionJob, processProgressionJob } from "../dist/progressionJobs.js";

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function ensureUser(userId) {
  await q(
    `INSERT INTO users (id, tg_id, created_at)
     VALUES ($1::uuid, $2, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, String(Math.floor(9e8 + Math.random() * 1e8))]
  );
}

async function cleanup(userId) {
  await q(`DELETE FROM progression_jobs WHERE user_id = $1::uuid`, [userId]);
  await q(`DELETE FROM exercise_history WHERE user_id = $1::uuid`, [userId]);
  await q(`DELETE FROM exercise_progression WHERE user_id = $1::uuid`, [userId]);
  await q(`DELETE FROM workout_sessions WHERE user_id = $1::uuid`, [userId]);
  await q(`DELETE FROM planned_workouts WHERE user_id = $1::uuid`, [userId]);
  await q(`DELETE FROM users WHERE id = $1::uuid`, [userId]);
}

async function run() {
  const userId = randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  console.log("Outbox smoke user:", userId);

  await withTransaction(async () => {
    await ensureUser(userId);
    await cleanup(userId);
    await ensureUser(userId);
  });

  const payload = {
    title: "Outbox test",
    durationMin: 60,
    exercises: [
      {
        id: "ho_barbell_bench_press",
        name: "Жим штанги лёжа",
        reps: "8-12",
        effort: "working",
        done: true,
        sets: [
          { reps: 12, weight: 60 },
          { reps: 12, weight: 60 },
          { reps: 12, weight: 60 },
        ],
      },
    ],
    feedback: { sessionRpe: 7 },
  };

  const finishedAt = new Date();

  const { sessionId, jobId } = await withTransaction(async () => {
    const rows = await q(
      `INSERT INTO workout_sessions (user_id, payload, finished_at)
       VALUES ($1::uuid, $2::jsonb, $3)
       RETURNING id`,
      [userId, JSON.stringify(payload), finishedAt.toISOString()]
    );
    const sessionId = rows[0]?.id;
    assert(sessionId, "workout_sessions insert failed");

    const { jobId } = await enqueueProgressionJob({
      userId,
      sessionId,
      plannedWorkoutId: null,
      workoutDate: today,
    });

    return { sessionId, jobId };
  });

  console.log("Created session:", sessionId);
  console.log("Enqueued job:", jobId);

  const r = await processProgressionJob({ jobId });
  assert(r.status === "done", "job should finish as done");
  assert(r.progression && r.progression.totalExercises === 1, "progression summary should exist");

  const jobs = await q(
    `SELECT status, result
       FROM progression_jobs
      WHERE id = $1::uuid
      LIMIT 1`,
    [jobId]
  );
  assert(jobs[0]?.status === "done", "job status in DB should be done");

  const prog = await q(
    `SELECT current_weight
       FROM exercise_progression
      WHERE user_id = $1::uuid AND exercise_id = $2
      LIMIT 1`,
    [userId, "ho_barbell_bench_press"]
  );
  assert(prog.length === 1, "exercise_progression should be updated");

  console.log("✅ Outbox smoke test passed.");

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


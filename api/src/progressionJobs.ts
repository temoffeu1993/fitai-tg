// api/src/progressionJobs.ts
// Outbox-style progression jobs (eventual consistency)

import { randomUUID } from "node:crypto";
import { q, withTransaction } from "./db.js";
import { AppError } from "./middleware/errorHandler.js";
import { applyProgressionFromSession, type ProgressionSummary } from "./progressionService.js";

export type ProgressionJobStatus = "pending" | "processing" | "done";

type ProgressionJobRow = {
  id: string;
  user_id: string;
  session_id: string;
  planned_workout_id: string | null;
  workout_date: string | Date;
  status: ProgressionJobStatus;
  attempts: number;
  next_run_at: string | Date;
  last_error: string | null;
  result: any | null;
};

function normalizeDate(value: any): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const d = new Date(value);
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function backoffSeconds(attempts: number): number {
  const a = Math.max(1, Math.min(10, attempts));
  const sec = 30 * Math.pow(2, a - 1); // 30s, 60s, 120s, ...
  return Math.min(sec, 60 * 60); // cap 1h
}

export async function enqueueProgressionJob(args: {
  userId: string;
  sessionId: string;
  plannedWorkoutId?: string | null;
  workoutDate: string;
}): Promise<{ jobId: string }> {
  const jobId = randomUUID();
  const { userId, sessionId, plannedWorkoutId, workoutDate } = args;

  const rows = await q<{ id: string }>(
    `INSERT INTO progression_jobs (
      id, user_id, session_id, planned_workout_id, workout_date, status, attempts, next_run_at, created_at, updated_at
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, 'pending', 0, now(), now(), now()
    )
    ON CONFLICT (session_id)
    DO UPDATE SET updated_at = now()
    RETURNING id`,
    [jobId, userId, sessionId, plannedWorkoutId ?? null, workoutDate]
  );

  return { jobId: rows[0]?.id || jobId };
}

async function getUserGoalExperience(userId: string): Promise<{ goal: any; experience: any }> {
  const [onboardingRow] = await q<{ data: any; summary: any }>(
    `SELECT data, summary FROM onboardings WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const goal = onboardingRow?.data?.goal || onboardingRow?.summary?.goal || "build_muscle";
  const experience = onboardingRow?.data?.experience || onboardingRow?.summary?.experience || "intermediate";
  return { goal, experience };
}

async function getSessionPayload(args: { userId: string; sessionId: string }): Promise<any> {
  const rows = await q<{ payload: any }>(
    `SELECT payload
       FROM workout_sessions
      WHERE id = $1::uuid AND user_id = $2::uuid
      LIMIT 1`,
    [args.sessionId, args.userId]
  );
  const payload = rows[0]?.payload;
  if (!payload) throw new AppError("progression_job_missing_session_payload", 500);
  return payload;
}

export async function processProgressionJob(args: {
  jobId: string;
}): Promise<{ status: ProgressionJobStatus; progression: ProgressionSummary | null }> {
  const { jobId } = args;

  return withTransaction(async () => {
    const rows = await q<ProgressionJobRow>(
      `SELECT *
         FROM progression_jobs
        WHERE id = $1::uuid
        FOR UPDATE`,
      [jobId]
    );

    const job = rows[0];
    if (!job) throw new AppError("progression_job_not_found", 404);

    return processLockedJob(job);
  });
}

export async function processNextProgressionJob(): Promise<boolean> {
  const processed = await withTransaction(async () => {
    const rows = await q<ProgressionJobRow>(
      `SELECT *
         FROM progression_jobs
        WHERE status = 'pending'
          AND next_run_at <= now()
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`
    );
    const job = rows[0];
    if (!job) return false;
    await processLockedJob(job);
    return true;
  }).catch((e) => {
    console.warn("[ProgressionJobs] processNextProgressionJob failed:", (e as any)?.message || e);
    return true; // keep worker moving
  });

  return processed;
}

export function startProgressionJobWorker(args?: { intervalMs?: number; maxPerTick?: number }) {
  const intervalMs = args?.intervalMs ?? 20_000;
  const maxPerTick = args?.maxPerTick ?? 3;

  const tick = async () => {
    for (let i = 0; i < maxPerTick; i++) {
      const did = await processNextProgressionJob();
      if (!did) return;
    }
  };

  setInterval(() => {
    tick().catch((e) => console.warn("[ProgressionJobs] worker tick failed:", (e as any)?.message || e));
  }, intervalMs);

  // kick once on start
  tick().catch((e) => console.warn("[ProgressionJobs] initial tick failed:", (e as any)?.message || e));
}

async function processLockedJob(job: ProgressionJobRow): Promise<{ status: ProgressionJobStatus; progression: ProgressionSummary | null }> {
  if (job.status === "done") {
    return { status: "done", progression: (job.result as any) ?? null };
  }

  const jobId = job.id;
  const attempts = Number(job.attempts || 0) + 1;

  await q(
    `UPDATE progression_jobs
        SET status = 'processing',
            attempts = $2,
            updated_at = now()
      WHERE id = $1::uuid`,
    [jobId, attempts]
  );

  try {
    const payload = await getSessionPayload({ userId: job.user_id, sessionId: job.session_id });
    const { goal, experience } = await getUserGoalExperience(job.user_id);
    const workoutDate = normalizeDate(job.workout_date);

    const progression = await applyProgressionFromSession({
      userId: job.user_id,
      payload: payload as any,
      goal,
      experience,
      workoutDate,
      plannedWorkoutId: job.planned_workout_id,
    });

    await q(
      `UPDATE progression_jobs
          SET status = 'done',
              result = $2::jsonb,
              last_error = NULL,
              completed_at = now(),
              updated_at = now()
        WHERE id = $1::uuid`,
      [jobId, JSON.stringify(progression)]
    );

    return { status: "done", progression };
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 2000);
    const delay = backoffSeconds(attempts);

    await q(
      `UPDATE progression_jobs
          SET status = 'pending',
              last_error = $2,
              next_run_at = now() + ($3::int * interval '1 second'),
              updated_at = now()
        WHERE id = $1::uuid`,
      [jobId, msg, delay]
    );

    return { status: "pending", progression: null };
  }
}

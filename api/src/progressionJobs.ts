// api/src/progressionJobs.ts
// Outbox-style progression jobs (eventual consistency)

import { randomUUID } from "node:crypto";
import { q, withTransaction } from "./db.js";
import { AppError } from "./middleware/errorHandler.js";
import { applyProgressionFromSession, type ProgressionSummary } from "./progressionService.js";

export type ProgressionJobStatus = "pending" | "processing" | "done" | "failed";

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
  updated_at?: string | Date;
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

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function readEnvFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  const v = raw != null ? Number(raw) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

function formatError(e: any): string {
  const cause = typeof e?.causeMessage === "string" && e.causeMessage.trim() ? e.causeMessage : "";
  const code = typeof e?.causeCode === "string" && e.causeCode.trim() ? ` (${e.causeCode})` : "";
  const constraint = typeof e?.causeConstraint === "string" && e.causeConstraint.trim() ? ` [${e.causeConstraint}]` : "";
  const msg = String(e?.message || e);
  const full = cause ? `${msg}: ${cause}${code}${constraint}` : `${msg}${code}${constraint}`;
  return full.slice(0, 2000);
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
  const job = await claimJobById(args.jobId, { force: true });
  if (!job) return { status: "pending", progression: null };
  if (typeof (job as any).status === "string" && !("session_id" in (job as any))) {
    return job as any;
  }

  return runJob(job as ProgressionJobRow);
}

export async function processNextProgressionJob(): Promise<boolean> {
  const job = await claimNextJob().catch((e) => {
    console.warn("[ProgressionJobs] claimNextJob failed:", (e as any)?.message || e);
    return null;
  });
  if (!job) return false;

  await runJob(job).catch((e) => {
    console.warn("[ProgressionJobs] runJob failed:", (e as any)?.message || e);
  });
  return true;
}

export function startProgressionJobWorker(args?: { intervalMs?: number; maxPerTick?: number }) {
  const intervalMs = args?.intervalMs ?? readEnvInt("PROGRESSION_JOB_INTERVAL_MS", 20_000);
  const maxPerTick = args?.maxPerTick ?? readEnvInt("PROGRESSION_JOB_MAX_PER_TICK", 3);
  const jitterPct = readEnvFloat("PROGRESSION_JOB_JITTER_PCT", 0.2);

  const tick = async () => {
    for (let i = 0; i < maxPerTick; i++) {
      const did = await processNextProgressionJob();
      if (!did) return;
    }
  };

  const scheduleNext = () => {
    const jitter = intervalMs * jitterPct * (Math.random() * 2 - 1);
    const delay = Math.max(1_000, Math.round(intervalMs + jitter));
    setTimeout(() => {
      tick()
        .catch((e) => console.warn("[ProgressionJobs] worker tick failed:", (e as any)?.message || e))
        .finally(scheduleNext);
    }, delay);
  };

  // kick once on start, then schedule loop with jitter
  tick()
    .catch((e) => console.warn("[ProgressionJobs] initial tick failed:", (e as any)?.message || e))
    .finally(scheduleNext);
}

async function claimJobById(
  jobId: string,
  opts?: { force?: boolean }
): Promise<
  | ProgressionJobRow
  | { status: ProgressionJobStatus; progression: ProgressionSummary | null }
  | null
> {
  const maxAttempts = readEnvInt("PROGRESSION_JOB_MAX_ATTEMPTS", 12);
  const staleMs = readEnvInt("PROGRESSION_JOB_STALE_MS", 10 * 60_000);

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

    if (job.status === "done") return { status: "done", progression: (job.result as any) ?? null };
    if (job.status === "failed") return { status: "failed", progression: (job.result as any) ?? null };

    const updatedAt = job.updated_at ? new Date(job.updated_at as any).getTime() : Date.now();
    const isStaleProcessing = job.status === "processing" && Date.now() - updatedAt > staleMs;

    if (job.status === "processing" && !isStaleProcessing) {
      return { status: "processing", progression: null };
    }

    const nextRunAt = job.next_run_at ? new Date(job.next_run_at as any).getTime() : Date.now();
    if (!opts?.force && job.status === "pending" && nextRunAt > Date.now()) {
      return { status: "pending", progression: null };
    }

    const attempts = Number(job.attempts || 0) + 1;
    // Allow processing up to maxAttempts; mark failed only after the final attempt fails.
    const boundedAttempts = Math.min(attempts, maxAttempts);

    await q(
      `UPDATE progression_jobs
          SET status = 'processing',
              attempts = $2,
              updated_at = now()
        WHERE id = $1::uuid`,
      [jobId, boundedAttempts]
    );

    return { ...job, status: "processing", attempts: boundedAttempts };
  });
}

async function claimNextJob(): Promise<ProgressionJobRow | null> {
  const maxAttempts = readEnvInt("PROGRESSION_JOB_MAX_ATTEMPTS", 12);
  const staleMs = readEnvInt("PROGRESSION_JOB_STALE_MS", 10 * 60_000);

  return withTransaction(async () => {
    const rows = await q<ProgressionJobRow>(
      `SELECT *
         FROM progression_jobs
        WHERE (
          status = 'pending' AND next_run_at <= now()
        ) OR (
          status = 'processing' AND updated_at <= now() - ($1::int * interval '1 millisecond')
        )
        ORDER BY (status = 'pending') DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [staleMs]
    );
    const job = rows[0];
    if (!job) return null;

    const attempts = Number(job.attempts || 0) + 1;
    // Allow processing up to maxAttempts; mark failed only after the final attempt fails.
    const boundedAttempts = Math.min(attempts, maxAttempts);

    await q(
      `UPDATE progression_jobs
          SET status = 'processing',
              attempts = $2,
              updated_at = now()
        WHERE id = $1::uuid`,
      [job.id, boundedAttempts]
    );

    return { ...job, status: "processing", attempts: boundedAttempts };
  });
}

async function runJob(job: ProgressionJobRow): Promise<{ status: ProgressionJobStatus; progression: ProgressionSummary | null }> {
  if (job.status === "failed") return { status: "failed", progression: null };

  try {
    const payload = await getSessionPayload({ userId: job.user_id, sessionId: job.session_id });
    const { goal, experience } = await getUserGoalExperience(job.user_id);
    const workoutDate = normalizeDate(job.workout_date);

    // Apply progression atomically (separate transaction from job claim)
    const progression = await withTransaction(async () =>
      applyProgressionFromSession({
        userId: job.user_id,
        sessionId: job.session_id,
        payload: payload as any,
        goal,
        experience,
        workoutDate,
        plannedWorkoutId: job.planned_workout_id,
      })
    );

    await withTransaction(async () => {
      await q(
        `UPDATE progression_jobs
            SET status = 'done',
                result = $2::jsonb,
                last_error = NULL,
                completed_at = now(),
                updated_at = now()
          WHERE id = $1::uuid`,
        [job.id, JSON.stringify(progression)]
      );
    });

    return { status: "done", progression };
  } catch (e: any) {
    const maxAttempts = readEnvInt("PROGRESSION_JOB_MAX_ATTEMPTS", 12);
    const attempts = Number(job.attempts || 0);
    const msg = formatError(e);

    await withTransaction(async () => {
      if (attempts >= maxAttempts) {
        await q(
          `UPDATE progression_jobs
              SET status = 'failed',
              last_error = $2,
              completed_at = now(),
              updated_at = now()
            WHERE id = $1::uuid`,
          [job.id, msg]
        );
        return;
      }

      const delay = backoffSeconds(attempts);
      await q(
        `UPDATE progression_jobs
            SET status = 'pending',
                last_error = $2,
                next_run_at = now() + ($3::int * interval '1 second'),
                updated_at = now()
          WHERE id = $1::uuid`,
        [job.id, msg, delay]
      );
    });

    return { status: attempts >= maxAttempts ? "failed" : "pending", progression: null };
  }
}

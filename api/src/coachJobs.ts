// api/src/coachJobs.ts
// Outbox-style AI coach feedback jobs (eventual consistency)

import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { q, withTransaction } from "./db.js";
import { config } from "./config.js";

export type CoachJobKind = "session" | "week";
export type CoachJobStatus = "pending" | "processing" | "done" | "failed";

type CoachJobRow = {
  id: string;
  user_id: string;
  kind: CoachJobKind;
  session_id: string | null;
  period_start: string | Date | null;
  period_end: string | Date | null;
  status: CoachJobStatus;
  attempts: number;
  next_run_at: string | Date;
  last_error: string | null;
  result: any | null;
  telegram_sent: boolean;
  telegram_message_id: string | null;
  created_at?: string | Date;
  updated_at?: string | Date;
};

type CheckInSnapshot = {
  createdAt?: string | null;
  sleepQuality?: "poor" | "fair" | "ok" | "good" | "excellent" | null;
  energyLevel?: "low" | "medium" | "high" | null;
  stressLevel?: "low" | "medium" | "high" | "very_high" | null;
  availableMinutes?: number | null;
  pain?: Array<{ location: string; level: number }> | null;
};

type SessionSnapshot = {
  sessionId: string;
  finishedAt: string;
  payload: any;
  summary: any;
};

type CoachResult = {
  kind: CoachJobKind;
  createdAt: string;
  telegram: {
    bullets: string[];
  };
  detail: {
    title: string;
    bullets: string[];
    actions: Array<{ title: string; how: string; why: string }>;
  };
  meta?: any;
};

function getOpenAI(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return new OpenAI({ apiKey: config.openaiApiKey });
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

function backoffSeconds(attempts: number): number {
  const a = Math.max(1, Math.min(10, attempts));
  const sec = 45 * Math.pow(2, a - 1); // 45s, 90s, 180s, ...
  return Math.min(sec, 60 * 60); // cap 1h
}

function isCoachDebug(): boolean {
  const v = process.env.DEBUG_COACH || process.env.DEBUG_AI || "";
  if (v === "1" || v === "true") return true;
  return String(v).toLowerCase().includes("coach");
}

function coachLog(...args: any[]) {
  if (!isCoachDebug()) return;
  console.log(...args);
}

function formatError(e: any): string {
  const msg = String(e?.message || e);
  const cause = typeof e?.causeMessage === "string" && e.causeMessage.trim() ? e.causeMessage : "";
  const code = typeof e?.causeCode === "string" && e.causeCode.trim() ? ` (${e.causeCode})` : "";
  const full = cause ? `${msg}: ${cause}${code}` : `${msg}${code}`;
  return full.slice(0, 2000);
}

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeJsonParse(raw: string): any {
  const clean = String(raw || "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(clean || "{}");
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function normalizeBullets(input: any, min: number, max: number): string[] {
  const arr = Array.isArray(input) ? input : [];
  const cleaned = arr
    .map((s) => String(s || "").trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/\s+/g, " "))
    .map((s) => s.replace(/\?+/g, "")) // no questions in Telegram
    .map((s) => (s.length > 240 ? s.slice(0, 237).trimEnd() + "…" : s));
  const uniq: string[] = [];
  for (const b of cleaned) {
    const key = b.toLowerCase();
    if (uniq.some((x) => x.toLowerCase() === key)) continue;
    uniq.push(b);
  }
  if (uniq.length < min) return uniq.slice(0, max);
  return uniq.slice(0, max);
}

function summarizeWorkoutPayload(payload: any): any {
  const exercises = Array.isArray(payload?.exercises) ? payload.exercises : [];
  const summaryExercises = exercises.map((ex: any) => {
    const sets = Array.isArray(ex?.sets) ? ex.sets : [];
    const reps = sets.map((s: any) => (Number.isFinite(Number(s?.reps)) ? Number(s.reps) : null)).filter((x: any) => x != null);
    const weights = sets
      .map((s: any) => (Number.isFinite(Number(s?.weight)) ? Number(s.weight) : null))
      .filter((x: any) => x != null);
    const totalReps = reps.reduce((a: number, b: number) => a + b, 0);
    const totalVolumeKg = sets.reduce((sum: number, s: any) => {
      const r = Number(s?.reps);
      const w = Number(s?.weight);
      if (!Number.isFinite(r) || r <= 0) return sum;
      if (!Number.isFinite(w) || w <= 0) return sum;
      return sum + r * w;
    }, 0);
    return {
      name: String(ex?.name || "").trim(),
      effort: ex?.effort ?? null,
      done: Boolean(ex?.done),
      setCount: sets.length,
      reps,
      weights,
      totalReps,
      totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    };
  });

  const totalSets = summaryExercises.reduce((sum: number, e: any) => sum + (e.setCount || 0), 0);
  const totalReps = summaryExercises.reduce((sum: number, e: any) => sum + (e.totalReps || 0), 0);
  const totalVolumeKg = summaryExercises.reduce((sum: number, e: any) => sum + (e.totalVolumeKg || 0), 0);
  const sessionRpe = payload?.feedback?.sessionRpe ?? null;

  return {
    title: payload?.title ?? null,
    location: payload?.location ?? null,
    durationMin: payload?.durationMin ?? null,
    sessionDifficulty: Number.isFinite(Number(sessionRpe)) ? Number(sessionRpe) : null,
    totals: {
      totalExercises: summaryExercises.length,
      totalSets,
      totalReps,
      totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    },
    exercises: summaryExercises,
  };
}

async function getUserProfileSnapshot(userId: string): Promise<any> {
  const [row] = await q<{ data: any; summary: any }>(
    `SELECT data, summary FROM onboardings WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const data = row?.data || {};
  const summary = row?.summary || {};
  const goal = data?.goal ?? summary?.goal ?? null;
  const experience = data?.experience ?? summary?.experience ?? null;
  const daysPerWeek = data?.schedule?.daysPerWeek ?? summary?.schedule?.daysPerWeek ?? summary?.freq ?? null;
  return {
    goal,
    experience,
    daysPerWeek,
  };
}

async function getLatestCheckInSnapshot(userId: string): Promise<CheckInSnapshot | null> {
  const rows = await q<{
    created_at: string;
    sleep_quality: any;
    energy_level: any;
    stress_level: any;
    available_minutes: any;
    pain: any;
  }>(
    `SELECT created_at, sleep_quality, energy_level, stress_level, available_minutes, pain
       FROM daily_check_ins
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;

  let pain: any = row.pain;
  if (typeof pain === "string") {
    try {
      pain = JSON.parse(pain);
    } catch {
      pain = null;
    }
  }
  const painArray = Array.isArray(pain)
    ? pain
        .map((p: any) => ({
          location: String(p?.location || "").trim(),
          level: clampInt(p?.level, 1, 10, 5),
        }))
        .filter((p: any) => p.location)
    : null;

  return {
    createdAt: row.created_at ?? null,
    sleepQuality: row.sleep_quality ?? null,
    energyLevel: row.energy_level ?? null,
    stressLevel: row.stress_level ?? null,
    availableMinutes: Number.isFinite(Number(row.available_minutes)) ? Number(row.available_minutes) : null,
    pain: painArray && painArray.length ? painArray : null,
  };
}

async function getSessionSnapshot(userId: string, sessionId: string): Promise<SessionSnapshot | null> {
  const rows = await q<{ finished_at: string; payload: any }>(
    `SELECT finished_at, payload
       FROM workout_sessions
      WHERE user_id = $1 AND id = $2::uuid
      LIMIT 1`,
    [userId, sessionId]
  );
  const row = rows[0];
  if (!row?.payload) return null;
  const finishedAt = new Date(row.finished_at as any);
  const iso = Number.isFinite(finishedAt.getTime()) ? finishedAt.toISOString() : String(row.finished_at);
  const summary = summarizeWorkoutPayload(row.payload);
  return { sessionId, finishedAt: iso, payload: row.payload, summary };
}

async function getRecentSessionHistory(userId: string, beforeIso: string, limit: number): Promise<SessionSnapshot[]> {
  const before = new Date(beforeIso);
  const beforeTs = Number.isFinite(before.getTime()) ? before.toISOString() : beforeIso;
  const rows = await q<{ id: string; finished_at: string; payload: any }>(
    `SELECT id, finished_at, payload
       FROM workout_sessions
      WHERE user_id = $1
        AND finished_at < $2::timestamptz
      ORDER BY finished_at DESC
      LIMIT $3`,
    [userId, beforeTs, Math.max(0, Math.min(20, limit))]
  );
  return rows
    .filter((r) => r?.id && r?.payload)
    .map((r) => ({
      sessionId: r.id,
      finishedAt: new Date(r.finished_at as any).toISOString(),
      payload: r.payload,
      summary: summarizeWorkoutPayload(r.payload),
    }));
}

async function getSessionsInPeriod(userId: string, startIso: string, endIso: string, limit: number): Promise<SessionSnapshot[]> {
  const rows = await q<{ id: string; finished_at: string; payload: any }>(
    `SELECT id, finished_at, payload
       FROM workout_sessions
      WHERE user_id = $1
        AND finished_at >= $2::timestamptz
        AND finished_at <= $3::timestamptz
      ORDER BY finished_at ASC
      LIMIT $4`,
    [userId, startIso, endIso, Math.max(1, Math.min(80, limit))]
  );
  return rows
    .filter((r) => r?.id && r?.payload)
    .map((r) => ({
      sessionId: r.id,
      finishedAt: new Date(r.finished_at as any).toISOString(),
      payload: r.payload,
      summary: summarizeWorkoutPayload(r.payload),
    }));
}

async function getUserTelegramId(userId: string): Promise<string | null> {
  const rows = await q<{ tg_id: any }>(`SELECT tg_id FROM users WHERE id = $1 LIMIT 1`, [userId]);
  const tg = rows[0]?.tg_id;
  if (tg == null) return null;
  const s = String(tg).trim();
  return s ? s : null;
}

async function sendTelegramMessage(args: {
  tgId: string;
  text: string;
  webappUrl?: string;
  sessionId?: string | null;
  kind: CoachJobKind;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const { tgId, text, webappUrl, sessionId, kind } = args;
  if (!config.botToken) return { ok: false, error: "missing_bot_token" };

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const cleanWebapp = typeof webappUrl === "string" && webappUrl.trim() ? webappUrl.trim().replace(/\/+$/, "") : null;
  const deepLink =
    cleanWebapp && sessionId
      ? `${cleanWebapp}/workout/result?sessionId=${encodeURIComponent(sessionId)}`
      : cleanWebapp
        ? cleanWebapp
        : null;

  const reply_markup =
    deepLink
      ? {
          inline_keyboard: [
            [
              {
                text: kind === "week" ? "Открыть итоги" : "Открыть разбор",
                web_app: { url: deepLink },
              },
            ],
          ],
        }
      : undefined;

  const body: any = {
    chat_id: tgId,
    text,
    ...(reply_markup ? { reply_markup } : {}),
    disable_web_page_preview: true,
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String((e as any)?.message || e) }) }) as any);

  if (!r?.ok) {
    let errText = `telegram_http_${r?.status || 0}`;
    try {
      const j = await r.json();
      if (j?.description) errText = String(j.description);
      else if (j?.error) errText = String(j.error);
    } catch {}
    return { ok: false, error: errText.slice(0, 500) };
  }

  try {
    const j = await r.json();
    const mid = j?.result?.message_id != null ? String(j.result.message_id) : undefined;
    return { ok: true, messageId: mid };
  } catch {
    return { ok: true };
  }
}

function buildSessionCoachPrompt(args: {
  profile: any;
  checkIn: CheckInSnapshot | null;
  session: SessionSnapshot;
  recent: SessionSnapshot[];
}) {
  const { profile, checkIn, session, recent } = args;

  const input = {
    user: profile,
    checkIn,
    session: {
      id: session.sessionId,
      finishedAt: session.finishedAt,
      summary: session.summary,
      exercises: Array.isArray(session.payload?.exercises)
        ? session.payload.exercises.map((e: any) => ({
            name: e?.name,
            effort: e?.effort ?? null,
            sets: Array.isArray(e?.sets) ? e.sets.slice(0, 12).map((s: any) => ({ reps: s?.reps ?? null, weight: s?.weight ?? null })) : [],
          }))
        : [],
      sessionDifficulty: session.payload?.feedback?.sessionRpe ?? null,
      durationMin: session.payload?.durationMin ?? null,
    },
    recentSessions: recent.slice(0, 8).map((s) => ({
      id: s.sessionId,
      finishedAt: s.finishedAt,
      summary: s.summary,
    })),
  };

  return `
Входные данные (JSON): ${JSON.stringify(input)}

Задача:
Ты опытный фитнес‑тренер. Проанализируй тренировку и контекст.
Напиши:
1) Telegram-разбор: 3–5 коротких пунктов, понятным языком, на "ты", без терминов и без вопросов.
2) Детали для экрана в приложении: заголовок + те же пункты + 2–3 конкретных действия (что делать в следующий раз, как именно и зачем).

Ограничения:
- Не используй RPE/RIR/1RM/проценты/тоннаж и т.п.
- Не придумывай факты, которых нет в данных. Причины формулируй как аккуратные гипотезы ("похоже", "возможно").
- Если есть боль/дискомфорт по check-in — будь осторожен, предложи безопаснее, не ставь диагнозы.
- Не используй эмодзи.
- Не задавай вопросов.

Верни СТРОГО JSON со структурой:
{
  "telegram": { "bullets": string[] },
  "detail": {
    "title": string,
    "bullets": string[],
    "actions": [{ "title": string, "how": string, "why": string }]
  }
}`.trim();
}

function buildWeeklyCoachPrompt(args: {
  profile: any;
  checkIn: CheckInSnapshot | null;
  startIso: string;
  endIso: string;
  sessions: SessionSnapshot[];
}) {
  const { profile, checkIn, startIso, endIso, sessions } = args;
  const input = {
    user: profile,
    checkInLatest: checkIn,
    period: { start: startIso.slice(0, 10), end: endIso.slice(0, 10) },
    sessions: sessions.map((s) => ({
      id: s.sessionId,
      finishedAt: s.finishedAt,
      summary: s.summary,
      sessionDifficulty: s.payload?.feedback?.sessionRpe ?? null,
      durationMin: s.payload?.durationMin ?? null,
    })),
  };

  return `
Входные данные (JSON): ${JSON.stringify(input)}

Задача:
Ты опытный фитнес‑тренер. Подведи итоги за последние 7 дней по тренировкам и самочувствию.
Напиши:
1) Telegram-итоги: 3–5 коротких пунктов, понятным языком, на "ты", без терминов и без вопросов.
2) Детали для экрана в приложении: заголовок + те же пункты + 2–3 конкретных действия на следующую неделю (что делать и зачем).

Ограничения:
- Не используй RPE/RIR/1RM/проценты/тоннаж и т.п.
- Не придумывай факты, которых нет в данных.
- Если встречается боль/дискомфорт — осторожные советы, без диагнозов.
- Не используй эмодзи.
- Не задавай вопросов.

Верни СТРОГО JSON со структурой:
{
  "telegram": { "bullets": string[] },
  "detail": {
    "title": string,
    "bullets": string[],
    "actions": [{ "title": string, "how": string, "why": string }]
  }
}`.trim();
}

async function generateCoachResult(kind: CoachJobKind, prompt: string): Promise<Omit<CoachResult, "kind" | "createdAt">> {
  const t0 = Date.now();
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.85,
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Ты опытный фитнес‑тренер (10+ лет). Пиши по-русски, на "ты". Пиши как живой тренер: по делу, без канцелярита и без шаблонов. Не упоминай, что ты ИИ. Не используй эмодзи. Не задавай вопросов.',
      },
      { role: "user", content: prompt },
    ],
  });
  coachLog(`[COACH] openai.chat ${Date.now() - t0}ms kind=${kind} prompt=${completion.usage?.prompt_tokens ?? "?"} completion=${completion.usage?.completion_tokens ?? "?"}`);

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = safeJsonParse(raw);
  const telegramBullets = normalizeBullets(parsed?.telegram?.bullets ?? parsed?.bullets, 3, 5);
  const detailBullets = normalizeBullets(parsed?.detail?.bullets ?? parsed?.bullets, 3, 7);
  const actionsRaw = Array.isArray(parsed?.detail?.actions) ? parsed.detail.actions : [];
  const actions = actionsRaw
    .map((a: any) => ({
      title: String(a?.title || "").trim(),
      how: String(a?.how || "").trim(),
      why: String(a?.why || "").trim(),
    }))
    .filter((a: any) => a.title && a.how)
    .slice(0, 3);

  return {
    telegram: { bullets: telegramBullets },
    detail: {
      title: String(parsed?.detail?.title || (kind === "week" ? "Итоги недели" : "Разбор тренировки")).trim(),
      bullets: detailBullets.length ? detailBullets : telegramBullets,
      actions,
    },
    meta: isCoachDebug() ? { raw } : undefined,
  };
}

export async function enqueueCoachJob(args: {
  userId: string;
  kind: CoachJobKind;
  sessionId?: string | null;
  periodStart?: string | null; // YYYY-MM-DD
  periodEnd?: string | null; // YYYY-MM-DD
}): Promise<{ jobId: string }> {
  const { userId, kind, sessionId, periodStart, periodEnd } = args;
  const jobId = randomUUID();

  coachLog("[CoachJobs][debug] enqueue", {
    jobId,
    userId: userId.slice(0, 8),
    kind,
    sessionId: sessionId ? String(sessionId).slice(0, 8) : null,
    periodEnd,
  });

  if (kind === "session") {
    if (!sessionId) throw new Error("coach_enqueue_missing_session_id");
    const rows = await q<{ id: string }>(
      `INSERT INTO coach_jobs (
        id, user_id, kind, session_id, period_start, period_end,
        status, attempts, next_run_at, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::text, $4::uuid, $5::date, $6::date,
        'pending', 0, now(), now(), now()
      )
      ON CONFLICT (session_id)
      DO UPDATE SET updated_at = now()
      RETURNING id`,
      [jobId, userId, kind, sessionId, periodStart ?? null, periodEnd ?? null]
    );
    return { jobId: rows[0]?.id || jobId };
  }

  // kind === "week": enforce "one per period_end" via preselect (unique index)
  const periodEndKey = periodEnd ? String(periodEnd).slice(0, 10) : null;
  if (!periodEndKey) throw new Error("coach_enqueue_missing_period_end");

  const existing = await q<{ id: string }>(
    `SELECT id
       FROM coach_jobs
      WHERE user_id = $1::uuid
        AND kind = 'week'
        AND period_end = $2::date
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, periodEndKey]
  );
  if (existing[0]?.id) return { jobId: existing[0].id };

  try {
    const rows = await q<{ id: string }>(
      `INSERT INTO coach_jobs (
        id, user_id, kind, session_id, period_start, period_end,
        status, attempts, next_run_at, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::text, NULL, $4::date, $5::date,
        'pending', 0, now(), now(), now()
      )
      RETURNING id`,
      [jobId, userId, kind, periodStart ?? null, periodEndKey]
    );
    return { jobId: rows[0]?.id || jobId };
  } catch (e) {
    // In case of race (unique index), return the existing id.
    const again = await q<{ id: string }>(
      `SELECT id
         FROM coach_jobs
        WHERE user_id = $1::uuid
          AND kind = 'week'
          AND period_end = $2::date
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, periodEndKey]
    );
    if (again[0]?.id) return { jobId: again[0].id };
    throw e;
  }
}

export async function maybeEnqueueWeeklyCoachJob(args: {
  userId: string;
  nowIso: string;
}): Promise<{ jobId: string } | null> {
  const { userId, nowIso } = args;
  const now = new Date(nowIso);
  if (!Number.isFinite(now.getTime())) return null;

  // Throttle: at most once per ~6 days
  const recent = await q<{ id: string }>(
    `SELECT id
       FROM coach_jobs
      WHERE user_id = $1
        AND kind = 'week'
        AND created_at >= now() - INTERVAL '6 days'
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  if (recent.length) return null;

  // Require some activity to make the report meaningful.
  const [{ cnt }] = await q<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt
       FROM workout_sessions
      WHERE user_id = $1
        AND finished_at >= ($2::timestamptz - INTERVAL '7 days')
        AND finished_at <= $2::timestamptz`,
    [userId, now.toISOString()]
  );
  if ((cnt || 0) < 2) return null;

  const end = toISODate(now);
  const start = toISODate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  return enqueueCoachJob({ userId, kind: "week", periodStart: start, periodEnd: end });
}

export async function getCoachJob(userId: string, jobId: string): Promise<any | null> {
  const rows = await q<CoachJobRow>(
    `SELECT *
       FROM coach_jobs
      WHERE id = $1::uuid AND user_id = $2::uuid
      LIMIT 1`,
    [jobId, userId]
  );
  const j = rows[0];
  if (!j) return null;
  return {
    id: j.id,
    kind: j.kind,
    status: j.status,
    attempts: j.attempts,
    lastError: j.last_error,
    result: j.result,
    telegramSent: j.telegram_sent,
    telegramMessageId: j.telegram_message_id,
    updatedAt: j.updated_at,
  };
}

export async function getCoachReportBySession(userId: string, sessionId: string): Promise<any | null> {
  const rows = await q<CoachJobRow>(
    `SELECT *
       FROM coach_jobs
      WHERE user_id = $1::uuid
        AND session_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, sessionId]
  );
  const j = rows[0];
  if (!j) return null;
  return {
    jobId: j.id,
    kind: j.kind,
    status: j.status,
    lastError: j.last_error,
    result: j.result,
    telegramSent: j.telegram_sent,
    updatedAt: j.updated_at,
  };
}

export async function getLatestWeeklyCoachReport(userId: string): Promise<any | null> {
  const rows = await q<CoachJobRow>(
    `SELECT *
       FROM coach_jobs
      WHERE user_id = $1::uuid
        AND kind = 'week'
        AND status = 'done'
      ORDER BY period_end DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [userId]
  );
  const j = rows[0];
  if (!j) return null;
  return {
    jobId: j.id,
    kind: j.kind,
    status: j.status,
    result: j.result,
    periodStart: j.period_start,
    periodEnd: j.period_end,
    updatedAt: j.updated_at,
  };
}

export async function processCoachJob(args: { jobId: string }): Promise<{ status: CoachJobStatus; result: any | null }> {
  const job = await claimJobById(args.jobId, { force: true });
  if (!job) return { status: "pending", result: null };
  if (typeof (job as any).status === "string" && !("user_id" in (job as any))) {
    return job as any;
  }
  const res = await runJob(job as CoachJobRow);
  return res;
}

export async function processNextCoachJob(): Promise<boolean> {
  const job = await claimNextJob().catch((e) => {
    console.warn("[CoachJobs] claimNextJob failed:", (e as any)?.message || e);
    return null;
  });
  if (!job) return false;
  await runJob(job).catch((e) => console.warn("[CoachJobs] runJob failed:", (e as any)?.message || e));
  return true;
}

export function startCoachJobWorker(args?: { intervalMs?: number; maxPerTick?: number }) {
  const intervalMs = args?.intervalMs ?? readEnvInt("COACH_JOB_INTERVAL_MS", 25_000);
  const maxPerTick = args?.maxPerTick ?? readEnvInt("COACH_JOB_MAX_PER_TICK", 2);
  const jitterPct = readEnvFloat("COACH_JOB_JITTER_PCT", 0.2);

  const tick = async () => {
    // if OpenAI key is missing, don't spin uselessly
    if (!config.openaiApiKey) return;
    for (let i = 0; i < maxPerTick; i++) {
      const did = await processNextCoachJob();
      if (!did) return;
    }
  };

  const scheduleNext = () => {
    const jitter = intervalMs * jitterPct * (Math.random() * 2 - 1);
    const delay = Math.max(2_000, Math.round(intervalMs + jitter));
    setTimeout(() => {
      tick()
        .catch((e) => console.warn("[CoachJobs] worker tick failed:", (e as any)?.message || e))
        .finally(scheduleNext);
    }, delay);
  };

  tick()
    .catch((e) => console.warn("[CoachJobs] initial tick failed:", (e as any)?.message || e))
    .finally(scheduleNext);
}

async function claimJobById(
  jobId: string,
  opts?: { force?: boolean }
): Promise<
  | CoachJobRow
  | { status: CoachJobStatus; result: any | null }
  | null
> {
  const maxAttempts = readEnvInt("COACH_JOB_MAX_ATTEMPTS", 10);
  const staleMs = readEnvInt("COACH_JOB_STALE_MS", 10 * 60_000);

  return withTransaction(async () => {
    const rows = await q<CoachJobRow>(
      `SELECT *
         FROM coach_jobs
        WHERE id = $1::uuid
        FOR UPDATE`,
      [jobId]
    );
    const job = rows[0];
    if (!job) return null;

    if (job.status === "done") return { status: "done", result: (job.result as any) ?? null };
    if (job.status === "failed") return { status: "failed", result: (job.result as any) ?? null };

    const updatedAt = job.updated_at ? new Date(job.updated_at as any).getTime() : Date.now();
    const isStaleProcessing = job.status === "processing" && Date.now() - updatedAt > staleMs;
    if (job.status === "processing" && !isStaleProcessing) return { status: "processing", result: null };

    const nextRunAt = job.next_run_at ? new Date(job.next_run_at as any).getTime() : Date.now();
    if (!opts?.force && job.status === "pending" && nextRunAt > Date.now()) return { status: "pending", result: null };

    const attempts = Number(job.attempts || 0) + 1;
    const boundedAttempts = Math.min(attempts, maxAttempts);

    await q(
      `UPDATE coach_jobs
          SET status = 'processing',
              attempts = $2,
              updated_at = now()
        WHERE id = $1::uuid`,
      [jobId, boundedAttempts]
    );

    return { ...job, status: "processing", attempts: boundedAttempts };
  });
}

async function claimNextJob(): Promise<CoachJobRow | null> {
  const staleMs = readEnvInt("COACH_JOB_STALE_MS", 10 * 60_000);
  const rows = await withTransaction(async () => {
    const locked = await q<CoachJobRow>(
      `SELECT *
         FROM coach_jobs
        WHERE (
          status = 'pending' AND next_run_at <= now()
        ) OR (
          status = 'processing' AND updated_at < now() - ($1::int * interval '1 millisecond')
        )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [staleMs]
    );
    const job = locked[0];
    if (!job) return [];

    const attempts = Number(job.attempts || 0) + 1;
    await q(
      `UPDATE coach_jobs
          SET status = 'processing',
              attempts = $2,
              updated_at = now()
        WHERE id = $1::uuid`,
      [job.id, attempts]
    );
    return [job];
  });
  return rows[0] || null;
}

async function runJob(job: CoachJobRow): Promise<{ status: CoachJobStatus; result: any | null }> {
  if (!config.openaiApiKey) {
    await q(
      `UPDATE coach_jobs
          SET status = 'failed',
              last_error = $2,
              updated_at = now(),
              completed_at = now()
        WHERE id = $1::uuid`,
      [job.id, "OPENAI_API_KEY is not set"]
    );
    return { status: "failed", result: null };
  }

  const maxAttempts = readEnvInt("COACH_JOB_MAX_ATTEMPTS", 10);
  const kind = job.kind;

  try {
    if (kind === "session") {
      if (!job.session_id) throw new Error("coach_job_missing_session_id");
      const session = await getSessionSnapshot(job.user_id, job.session_id);
      if (!session) throw new Error("coach_job_missing_session_payload");

      const profile = await getUserProfileSnapshot(job.user_id);
      const checkIn = await getLatestCheckInSnapshot(job.user_id);
      const recent = await getRecentSessionHistory(job.user_id, session.finishedAt, 8);

      const prompt = buildSessionCoachPrompt({ profile, checkIn, session, recent });
      const out = await generateCoachResult("session", prompt);

      const result: CoachResult = {
        kind: "session",
        createdAt: new Date().toISOString(),
        ...out,
      };

      await q(
        `UPDATE coach_jobs
            SET status = 'done',
                result = $2::jsonb,
                last_error = NULL,
                updated_at = now(),
                completed_at = now()
          WHERE id = $1::uuid`,
        [job.id, result]
      );

      // Telegram send (best-effort)
      const tgId = await getUserTelegramId(job.user_id);
      if (tgId && result.telegram?.bullets?.length) {
        const text = ["Разбор тренировки:", ...result.telegram.bullets.map((b) => `• ${b}`)].join("\n");
        const sent = await sendTelegramMessage({
          tgId,
          text,
          webappUrl: config.webappUrl,
          sessionId: job.session_id,
          kind: "session",
        });
        if (sent.ok) {
          await q(
            `UPDATE coach_jobs
                SET telegram_sent = true,
                    telegram_message_id = $2,
                    updated_at = now()
              WHERE id = $1::uuid`,
            [job.id, sent.messageId ?? null]
          );
        } else {
          coachLog("[CoachJobs] telegram send failed:", sent.error);
        }
      }

      return { status: "done", result };
    }

    // kind === "week"
    const end = job.period_end ? String(job.period_end).slice(0, 10) : toISODate(new Date());
    const endIso = new Date(`${end}T23:59:59.999Z`).toISOString();
    const start = job.period_start ? String(job.period_start).slice(0, 10) : toISODate(new Date(Date.now() - 6 * 86400000));
    const startIso = new Date(`${start}T00:00:00.000Z`).toISOString();

    const sessions = await getSessionsInPeriod(job.user_id, startIso, endIso, 40);
    if (sessions.length < 2) {
      throw new Error("coach_week_not_enough_sessions");
    }

    const profile = await getUserProfileSnapshot(job.user_id);
    const checkIn = await getLatestCheckInSnapshot(job.user_id);
    const prompt = buildWeeklyCoachPrompt({ profile, checkIn, startIso, endIso, sessions });
    const out = await generateCoachResult("week", prompt);

    const result: CoachResult = {
      kind: "week",
      createdAt: new Date().toISOString(),
      ...out,
    };

    await q(
      `UPDATE coach_jobs
          SET status = 'done',
              result = $2::jsonb,
              last_error = NULL,
              updated_at = now(),
              completed_at = now()
        WHERE id = $1::uuid`,
      [job.id, result]
    );

    const tgId = await getUserTelegramId(job.user_id);
    if (tgId && result.telegram?.bullets?.length) {
      const text = ["Итоги за последние 7 дней:", ...result.telegram.bullets.map((b) => `• ${b}`)].join("\n");
      const sent = await sendTelegramMessage({
        tgId,
        text,
        webappUrl: config.webappUrl,
        sessionId: job.session_id ?? null,
        kind: "week",
      });
      if (sent.ok) {
        await q(
          `UPDATE coach_jobs
              SET telegram_sent = true,
                  telegram_message_id = $2,
                  updated_at = now()
            WHERE id = $1::uuid`,
          [job.id, sent.messageId ?? null]
        );
      } else {
        coachLog("[CoachJobs] telegram send failed:", sent.error);
      }
    }

    return { status: "done", result };
  } catch (e: any) {
    const err = formatError(e);
    const attempts = Number(job.attempts || 1);
    const nextDelay = backoffSeconds(attempts);
    const nextRunAt = new Date(Date.now() + nextDelay * 1000).toISOString();
    const willRetry = attempts < maxAttempts;

    await q(
      `UPDATE coach_jobs
          SET status = $2,
              last_error = $3,
              next_run_at = $4,
              updated_at = now(),
              completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE completed_at END
        WHERE id = $1::uuid`,
      [job.id, willRetry ? "pending" : "failed", err, nextRunAt]
    );

    return { status: willRetry ? "pending" : "failed", result: null };
  }
}

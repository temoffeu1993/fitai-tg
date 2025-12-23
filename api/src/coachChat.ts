// api/src/coachChat.ts
// Coach chat: user asks questions, server injects user's history context.

import OpenAI from "openai";
import { q, withTransaction } from "./db.js";
import { config } from "./config.js";
import { AppError } from "./middleware/errorHandler.js";

type Role = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
};

function getOpenAI(): OpenAI {
  if (!config.openaiApiKey) throw new AppError("OPENAI_API_KEY is not set", 503);
  return new OpenAI({ apiKey: config.openaiApiKey });
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function safeJsonParse(raw: string): any {
  const clean = String(raw || "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(clean || "{}");
}

function normalizeAnswerText(parts: {
  intro?: string;
  bullets?: string[];
  actions?: Array<{ title?: string; how?: string; why?: string }>;
  outro?: string;
}): string {
  const lines: string[] = [];
  const intro = String(parts.intro || "").trim();
  if (intro) lines.push(intro);
  const bullets = Array.isArray(parts.bullets) ? parts.bullets : [];
  for (const b of bullets) {
    const s = String(b || "").trim().replace(/^\s*[-•—]\s*/g, "");
    if (!s) continue;
    lines.push(`• ${s}`);
  }
  const actions = Array.isArray(parts.actions) ? parts.actions : [];
  const cleanedActions = actions
    .map((a) => ({
      title: String(a?.title || "").trim(),
      how: String(a?.how || "").trim(),
      why: String(a?.why || "").trim(),
    }))
    .filter((a) => a.title && a.how)
    .slice(0, 4);
  if (cleanedActions.length) {
    lines.push("", "Что делать дальше:");
    for (const a of cleanedActions) {
      const why = a.why ? ` — ${a.why}` : "";
      lines.push(`• ${a.title}: ${a.how}${why}`);
    }
  }
  const outro = String(parts.outro || "").trim();
  if (outro) lines.push("", outro);
  return lines.join("\n").trim();
}

function normalizeWorkoutPayload(payload: any): any {
  const exercises = Array.isArray(payload?.exercises) ? payload.exercises : [];
  return {
    title: payload?.title ?? null,
    location: payload?.location ?? null,
    durationMin: payload?.durationMin ?? null,
    sessionRpe: payload?.feedback?.sessionRpe ?? null,
    exercises: exercises.map((ex: any) => ({
      name: ex?.name ?? null,
      pattern: ex?.pattern ?? null,
      effort: ex?.effort ?? null,
      done: Boolean(ex?.done),
      sets: Array.isArray(ex?.sets)
        ? ex.sets.map((s: any) => ({
            reps: s?.reps ?? null,
            weight: s?.weight ?? null,
          }))
        : [],
    })),
  };
}

async function getOrCreateThreadId(userId: string): Promise<string> {
  const rows = await q<{ id: string }>(`SELECT id FROM coach_chat_threads WHERE user_id = $1 LIMIT 1`, [userId]);
  if (rows[0]?.id) return rows[0].id;
  const created = await q<{ id: string }>(
    `INSERT INTO coach_chat_threads (user_id) VALUES ($1) RETURNING id`,
    [userId]
  );
  return created[0].id;
}

async function getChatHistory(threadId: string, limit: number): Promise<ChatMessage[]> {
  const rows = await q<{ id: string; role: Role; content: string; created_at: string }>(
    `SELECT id, role, content, created_at
       FROM coach_chat_messages
      WHERE thread_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [threadId, Math.max(1, Math.min(80, limit))]
  );
  // return ascending for UI
  return rows
    .reverse()
    .map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.created_at }));
}

async function getUserContext(userId: string) {
  const [onb] = await q<{ data: any; summary: any }>(
    `SELECT data, summary FROM onboardings WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const userProfile = {
    goal: onb?.data?.goal ?? onb?.summary?.goal ?? null,
    experience: onb?.data?.experience ?? onb?.summary?.experience ?? null,
    daysPerWeek: onb?.data?.schedule?.daysPerWeek ?? onb?.summary?.schedule?.daysPerWeek ?? onb?.summary?.freq ?? null,
    restrictions: onb?.data?.limitations ?? null,
  };

  const checkins = await q<{
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
      LIMIT 15`,
    [userId]
  );

  const normalizedCheckins = checkins.map((c) => {
    let pain: any = c.pain;
    if (typeof pain === "string") {
      try {
        pain = JSON.parse(pain);
      } catch {
        pain = null;
      }
    }
    const painArr = Array.isArray(pain)
      ? pain
          .map((p: any) => ({
            location: String(p?.location || "").trim(),
            level: clampInt(p?.level, 1, 10, 5),
          }))
          .filter((p: any) => p.location)
      : null;
    return {
      createdAt: c.created_at,
      sleepQuality: c.sleep_quality ?? null,
      energyLevel: c.energy_level ?? null,
      stressLevel: c.stress_level ?? null,
      availableMinutes: Number.isFinite(Number(c.available_minutes)) ? Number(c.available_minutes) : null,
      pain: painArr && painArr.length ? painArr : null,
    };
  });

  const sessions = await q<{ id: string; finished_at: string; payload: any }>(
    `SELECT id, finished_at, payload
       FROM workout_sessions
      WHERE user_id = $1
      ORDER BY finished_at DESC
      LIMIT 15`,
    [userId]
  );

  const normalizedSessions = sessions.map((s) => ({
    id: s.id,
    finishedAt: s.finished_at,
    workout: normalizeWorkoutPayload(s.payload),
  }));

  return { userProfile, checkins: normalizedCheckins, workouts: normalizedSessions };
}

function buildSystemPrompt(): string {
  return [
    'Ты опытный фитнес‑тренер (10+ лет). Отвечай по-русски, на "ты".',
    "Твоя задача — анализировать данные пользователя из приложения и давать профессиональные рекомендации.",
    "Пиши живо и по делу, без канцелярита и без шаблонных комплиментов.",
    "",
    "Важно:",
    "- Не придумывай факты, которых нет в данных. Причины формулируй как гипотезы (например: «похоже», «возможно»).",
    "- Не ставь диагнозы и не лечи. Если боль сильная/острая — советуй снизить нагрузку и при необходимости обратиться к специалисту.",
    "- Не используй термины типа RPE/RIR/1RM/проценты/тоннаж.",
    "- Дай 3–6 ключевых выводов и 2–4 конкретных шага «что делать дальше».",
  ].join("\n");
}

function buildUserPrompt(args: { question: string; context: any }): string {
  return [
    "Контекст пользователя (JSON):",
    JSON.stringify(args.context),
    "",
    "Вопрос пользователя:",
    args.question,
    "",
    "Ответ верни строго JSON в формате:",
    `{"intro": string, "bullets": string[], "actions": [{"title": string, "how": string, "why": string}], "outro": string}`,
  ].join("\n");
}

export async function getCoachChatHistoryForUser(userId: string, limit = 40): Promise<ChatMessage[]> {
  const threadId = await getOrCreateThreadId(userId);
  return getChatHistory(threadId, limit);
}

export async function sendCoachChatMessage(args: {
  userId: string;
  message: string;
}): Promise<{ threadId: string; userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  const userId = args.userId;
  const message = String(args.message || "").trim();
  if (!message) throw new AppError("message_required", 400);
  if (message.length > 1200) throw new AppError("message_too_long", 400);

  const openai = getOpenAI();
  const threadId = await getOrCreateThreadId(userId);
  const history = await getChatHistory(threadId, 18);
  const context = await getUserContext(userId);

  const t0 = Date.now();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.8,
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt() },
      ...history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: buildUserPrompt({ question: message, context }) },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = safeJsonParse(raw);
  const answerText = normalizeAnswerText({
    intro: parsed?.intro,
    bullets: parsed?.bullets,
    actions: parsed?.actions,
    outro: parsed?.outro,
  });

  const usage = completion.usage || ({} as any);
  const promptTokens = Number.isFinite(Number(usage.prompt_tokens)) ? Number(usage.prompt_tokens) : null;
  const completionTokens = Number.isFinite(Number(usage.completion_tokens)) ? Number(usage.completion_tokens) : null;
  const totalTokens = Number.isFinite(Number(usage.total_tokens)) ? Number(usage.total_tokens) : null;

  // Persist messages transactionally.
  const saved = await withTransaction(async () => {
    const [u] = await q<{ id: string; created_at: string }>(
      `INSERT INTO coach_chat_messages (thread_id, role, content, meta)
       VALUES ($1, 'user', $2, $3::jsonb)
       RETURNING id, created_at`,
      [threadId, message, JSON.stringify({ t: Date.now() })]
    );

    const [a] = await q<{ id: string; created_at: string }>(
      `INSERT INTO coach_chat_messages (thread_id, role, content, meta, prompt_tokens, completion_tokens, total_tokens)
       VALUES ($1, 'assistant', $2, $3::jsonb, $4, $5, $6)
       RETURNING id, created_at`,
      [
        threadId,
        answerText,
        JSON.stringify({ model: "gpt-4o", latencyMs: Date.now() - t0 }),
        promptTokens,
        completionTokens,
        totalTokens,
      ]
    );

    await q(`UPDATE coach_chat_threads SET updated_at = now() WHERE id = $1`, [threadId]);

    return { u, a };
  });

  return {
    threadId,
    userMessage: { id: saved.u.id, role: "user", content: message, createdAt: saved.u.created_at },
    assistantMessage: { id: saved.a.id, role: "assistant", content: answerText, createdAt: saved.a.created_at },
  };
}

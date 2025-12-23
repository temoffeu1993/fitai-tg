// api/src/coachChat.ts
// Coach chat: user asks questions, server injects user's history context.

import OpenAI from "openai";
import { q, withTransaction } from "./db.js";
import { config } from "./config.js";
import { AppError } from "./middleware/errorHandler.js";
import { EXERCISE_LIBRARY } from "./exerciseLibrary.js";

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

function normalizeNameKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\wа-яa-z]/g, "");
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

function isGreetingOnly(text: string): boolean {
  const s = String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[!?.]+/g, "")
    .replace(/\s+/g, " ");
  if (!s) return true;
  // short greeting without an actual question
  return /^(привет|здаров|здравствуйте|добрый день|доброе утро|добрый вечер|хай|hey|hello|hi)$/.test(s);
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

function summarizeExerciseSetStats(ex: any) {
  const sets = Array.isArray(ex?.sets) ? ex.sets : [];
  const normalizedSets = sets
    .map((s: any) => ({
      reps: Number.isFinite(Number(s?.reps)) ? Number(s.reps) : null,
      weight: Number.isFinite(Number(s?.weight)) ? Number(s.weight) : null,
    }))
    .filter((s: any) => s.reps != null || s.weight != null);

  const volumeKg = normalizedSets.reduce((sum: number, s: any) => {
    if (s.reps == null || s.weight == null) return sum;
    if (s.reps <= 0 || s.weight <= 0) return sum;
    return sum + s.reps * s.weight;
  }, 0);
  const maxWeight = normalizedSets.reduce((m: number, s: any) => (s.weight != null && s.weight > m ? s.weight : m), 0);
  const totalReps = normalizedSets.reduce((sum: number, s: any) => sum + (s.reps != null ? s.reps : 0), 0);
  return {
    setCount: normalizedSets.length,
    totalReps,
    maxWeight: maxWeight || null,
    volumeKg: Math.round(volumeKg * 10) / 10,
  };
}

function computeSessionStats(payload: any) {
  const exercises = Array.isArray(payload?.exercises) ? payload.exercises : [];
  const durationMin = Number.isFinite(Number(payload?.durationMin)) ? Number(payload.durationMin) : null;
  const sessionRpe = Number.isFinite(Number(payload?.feedback?.sessionRpe)) ? Number(payload.feedback.sessionRpe) : null;
  const doneExercises = exercises.filter((e: any) => Boolean(e?.done)).length;
  const totalSets = exercises.reduce((sum: number, e: any) => sum + (Array.isArray(e?.sets) ? e.sets.length : 0), 0);
  const totalVolumeKg = exercises.reduce((sum: number, e: any) => sum + (summarizeExerciseSetStats(e).volumeKg || 0), 0);
  const effortCounts: Record<string, number> = {};
  for (const e of exercises) {
    const k = String(e?.effort || "").trim();
    if (!k) continue;
    effortCounts[k] = (effortCounts[k] || 0) + 1;
  }
  return {
    durationMin,
    sessionRpe,
    doneExercises,
    totalExercises: exercises.length,
    totalSets,
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    effortCounts,
  };
}

function detectIntent(question: string) {
  const q = normalizeNameKey(question);
  if (!q) return { kind: "unknown" as const };
  if (/ustal|ustalost|fatigue|tired/.test(q) || /устал|усталост|нетсил|вял|разбит/.test(q)) return { kind: "recovery" as const };
  if (/bol|pain|hurt/.test(q) || /болит|боль|дискомфорт|травм|ноет/.test(q)) return { kind: "pain" as const };
  if (/ne(rast|rastet)|plateau|stagn/.test(q) || /нераст|стоит|плато|застопор/.test(q)) return { kind: "plateau" as const };
  if (/skolko|time|minut|быстр|долго|успев/.test(q) || /врем|минут|долго|коротк|успев/.test(q)) return { kind: "time" as const };
  if (/pitan|kcal|belok|protein|carb|углев|калор|питан|вес/.test(q)) return { kind: "nutrition" as const };
  return { kind: "general" as const };
}

function extractFocusExercises(args: { question: string; workouts: any[] }) {
  const qKey = normalizeNameKey(args.question);
  if (!qKey) return [];

  const fromHistory = new Set<string>();
  for (const w of args.workouts) {
    const exercises = Array.isArray(w?.workout?.exercises) ? w.workout.exercises : [];
    for (const ex of exercises) {
      const nm = String(ex?.name || "").trim();
      if (nm) fromHistory.add(nm);
    }
  }

  const candidates: Array<{ name: string; key: string; source: "history" | "library" }> = [];
  for (const nm of fromHistory) candidates.push({ name: nm, key: normalizeNameKey(nm), source: "history" });
  // Add library names for better matching to user wording, but keep minimal.
  for (const ex of EXERCISE_LIBRARY as any[]) {
    const nm = String(ex?.name || "").trim();
    if (!nm) continue;
    candidates.push({ name: nm, key: normalizeNameKey(nm), source: "library" });
  }

  const tokens = qKey
    .split(/(\d+)/g)
    .join(" ")
    .split(/\s+/g)
    .filter(Boolean);
  const strongWords = ["жим", "присед", "тяга", "станов", "подтяг", "отжим", "плеч", "спин", "груд", "ног", "бицеп", "трицеп"];
  const hits: Record<string, { name: string; score: number; source: string }> = {};
  for (const c of candidates) {
    if (!c.key || c.key.length < 3) continue;
    let score = 0;
    // direct substring match
    if (qKey.includes(c.key) || c.key.includes(qKey)) score += 6;
    for (const sw of strongWords) {
      if (qKey.includes(normalizeNameKey(sw)) && c.key.includes(normalizeNameKey(sw))) score += 3;
    }
    for (const t of tokens) {
      const tk = normalizeNameKey(t);
      if (tk.length < 3) continue;
      if (c.key.includes(tk)) score += 1;
    }
    if (score <= 0) continue;
    const prev = hits[c.name];
    if (!prev || score > prev.score) hits[c.name] = { name: c.name, score, source: c.source };
  }

  return Object.values(hits)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((h) => ({ name: h.name, source: h.source, score: h.score }));
}

function buildFocusContext(args: { question: string; context: any }) {
  const workouts = Array.isArray(args.context?.workouts) ? args.context.workouts : [];
  const intent = detectIntent(args.question);
  const focusExercises = extractFocusExercises({ question: args.question, workouts });

  const includeLast = workouts.length > 0 && questionMentionsLastWorkout(args.question);
  const lastWorkout = includeLast
    ? {
        id: workouts[0]?.id ?? null,
        finishedAt: workouts[0]?.finishedAt ?? null,
        stats: workouts[0]?.stats ?? null,
        workout: workouts[0]?.workout ?? null,
      }
    : null;

  const exerciseHistory = focusExercises.length
    ? workouts
        .map((w: any) => {
          const exercises = Array.isArray(w?.workout?.exercises) ? w.workout.exercises : [];
          const matched = exercises
            .filter((ex: any) => {
              const exKey = normalizeNameKey(ex?.name || "");
              return focusExercises.some((f) => exKey && exKey.includes(normalizeNameKey(f.name)));
            })
            .map((ex: any) => ({
              name: ex?.name ?? null,
              effort: ex?.effort ?? null,
              stats: summarizeExerciseSetStats(ex),
              sets: Array.isArray(ex?.sets)
                ? ex.sets.map((s: any) => ({ reps: s?.reps ?? null, weight: s?.weight ?? null }))
                : [],
            }));
          if (!matched.length) return null;
          return {
            workoutId: w?.id,
            finishedAt: w?.finishedAt,
            sessionStats: w?.stats ?? null,
            exercises: matched,
          };
        })
        .filter(Boolean)
    : [];

  return {
    intent,
    focusExercises,
    exerciseHistory,
    lastWorkout,
  };
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

  const normalizedSessions = sessions.map((s) => {
    const workout = normalizeWorkoutPayload(s.payload);
    const stats = computeSessionStats(s.payload);
    return {
      id: s.id,
      finishedAt: s.finished_at,
      workout,
      stats,
    };
  });

  const workoutsLast7 = normalizedSessions.filter((w) => {
    const t = new Date(w.finishedAt as any).getTime();
    return Number.isFinite(t) && Date.now() - t <= 7 * 24 * 60 * 60 * 1000;
  });
  const avgDuration =
    normalizedSessions.length > 0
      ? Math.round(
          (normalizedSessions.reduce((sum: number, w: any) => sum + (Number(w?.stats?.durationMin) || 0), 0) /
            normalizedSessions.length) * 10
        ) / 10
      : null;
  const avgSessionRpe =
    normalizedSessions.filter((w: any) => Number.isFinite(Number(w?.stats?.sessionRpe))).length > 0
      ? Math.round(
          (normalizedSessions.reduce((sum: number, w: any) => sum + (Number(w?.stats?.sessionRpe) || 0), 0) /
            normalizedSessions.filter((w: any) => Number.isFinite(Number(w?.stats?.sessionRpe))).length) * 10
        ) / 10
      : null;

  const stats = {
    workoutsCount: normalizedSessions.length,
    workoutsLast7d: workoutsLast7.length,
    checkinsCount: normalizedCheckins.length,
    avgDurationMin: avgDuration,
    avgSessionDifficulty: avgSessionRpe,
  };

  return { userProfile, checkins: normalizedCheckins, workouts: normalizedSessions, stats };
}

function buildSystemPrompt(): string {
  return [
    'Ты опытный фитнес‑тренер (10+ лет). Отвечай по-русски, на "ты".',
    "Твоя задача — анализировать данные пользователя из приложения и давать профессиональные рекомендации.",
    "Пиши живо и по делу, без канцелярита и без шаблонных комплиментов.",
    "Не пересказывай список упражнений — пользователь и так это видел. Твоя ценность: анализ причин и конкретные шаги.",
    "Каждый пункт должен опираться на данные пользователя (тренировки/чек-ины) или быть явно помечен как гипотеза.",
    "",
    "Важно:",
    "- Не придумывай факты, которых нет в данных. Причины формулируй как гипотезы (например: «похоже», «возможно»).",
    "- Не ставь диагнозы и не лечи. Если боль сильная/острая — советуй снизить нагрузку и при необходимости обратиться к специалисту.",
    "- Не используй термины типа RPE/RIR/1RM/проценты/тоннаж.",
    "- Не утверждай, что пользователь «мало отдыхал/отдыхал X минут» — фактический отдых не логируется. Можно предложить увеличить отдых как эксперимент, но без утверждений.",
    "- Дай 3–6 ключевых выводов и 2–4 конкретных шага «что делать дальше».",
  ].join("\n");
}

function buildUserPrompt(args: { question: string; context: any; focus: any; historyBrief: any }): string {
  return [
    "ВАЖНО: не пересказывай тренировки. Отвечай на вопрос по сути и опирайся на данные пользователя.",
    "Если данных недостаточно — скажи это прямо и предложи 1–2 безопасных шага, которые не требуют гадания.",
    "",
    "Контекст пользователя (JSON):",
    JSON.stringify(args.context),
    "",
    "Фокус под вопрос (JSON):",
    JSON.stringify(args.focus),
    "",
    "Короткая сводка диалога (JSON):",
    JSON.stringify(args.historyBrief),
    "",
    "Вопрос пользователя:",
    args.question,
    "",
    "Ответ верни строго JSON в формате:",
    `{"intro": string, "bullets": string[], "actions": [{"title": string, "how": string, "why": string}], "outro": string}`,
    "",
    "Требования к ответу:",
    "- 3–6 bullets: это выводы/причины/наблюдения, а не перечисление упражнений.",
    "- 2–4 actions: конкретные шаги на следующую тренировку/неделю.",
    "- Не используй конкретные веса/повторы, если ты их не видишь явно в данных из JSON.",
    "- Не делай вид, что ты уверен: причины формулируй как гипотезы.",
    "- В каждом bullet постарайся упомянуть конкретику из данных (упражнение/дата/длительность/оценка тяжести/объём), иначе перепиши bullet.",
  ].join("\n");
}

function makeContextRef(ctx: any) {
  const workouts = Array.isArray(ctx?.workouts) ? ctx.workouts : [];
  const checkins = Array.isArray(ctx?.checkins) ? ctx.checkins : [];
  return {
    workoutsCount: workouts.length,
    workoutIds: workouts.map((w: any) => w?.id).filter(Boolean),
    checkinsCount: checkins.length,
    checkinDates: checkins.map((c: any) => String(c?.createdAt || "").slice(0, 10)).filter(Boolean),
  };
}

function makeHistoryBrief(history: ChatMessage[]) {
  return history.slice(-6).map((m) => ({
    role: m.role,
    content: String(m.content || "").slice(0, 280),
  }));
}

function questionMentionsLastWorkout(q: string): boolean {
  const s = normalizeNameKey(q);
  return /последн|сегодня|этатрен|посмотритренировку|проанализирутрен|разбортрен/.test(s);
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
  const contextRef = makeContextRef(context);
  const focus = buildFocusContext({ question: message, context });
  const historyBrief = makeHistoryBrief(history);

  if (process.env.AI_LOG_CONTENT === "1") {
    console.log("[COACH_CHAT][content] question:", message);
    console.log("[COACH_CHAT][content] contextRef:", JSON.stringify(contextRef));
  }

  // Avoid wasting tokens on small talk: guide user to ask a concrete question.
  if (isGreetingOnly(message)) {
    const assistantText =
      "Привет. Напиши, что хочешь разобрать — я посмотрю твои тренировки и самочувствие и дам конкретные шаги.\n\n" +
      "Примеры:\n" +
      "• «Почему не растёт жим?»\n" +
      "• «Проанализируй последнюю тренировку: что улучшить?»\n" +
      "• «Почему в последние недели усталость выше?»\n" +
      "• «Как прогрессировать, если у меня 45–60 минут?»";

    const saved = await withTransaction(async () => {
      const [u] = await q<{ id: string; created_at: string }>(
        `INSERT INTO coach_chat_messages (thread_id, role, content, meta)
         VALUES ($1, 'user', $2, $3::jsonb)
         RETURNING id, created_at`,
        [threadId, message, JSON.stringify({ contextRef, type: "greeting" })]
      );
      const [a] = await q<{ id: string; created_at: string }>(
        `INSERT INTO coach_chat_messages (thread_id, role, content, meta)
         VALUES ($1, 'assistant', $2, $3::jsonb)
         RETURNING id, created_at`,
        [threadId, assistantText, JSON.stringify({ type: "greeting" })]
      );
      await q(`UPDATE coach_chat_threads SET updated_at = now() WHERE id = $1`, [threadId]);
      return { u, a };
    });

    return {
      threadId,
      userMessage: { id: saved.u.id, role: "user", content: message, createdAt: saved.u.created_at },
      assistantMessage: { id: saved.a.id, role: "assistant", content: assistantText, createdAt: saved.a.created_at },
    };
  }

  const model = String(process.env.COACH_CHAT_MODEL || "gpt-5.2");
  const t0 = Date.now();
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.7,
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt() },
      ...history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: buildUserPrompt({ question: message, context, focus, historyBrief }) },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = safeJsonParse(raw);
  const answerText0 = normalizeAnswerText({
    intro: parsed?.intro,
    bullets: parsed?.bullets,
    actions: parsed?.actions,
    outro: parsed?.outro,
  });

  if (process.env.AI_LOG_CONTENT === "1") {
    console.log("[COACH_CHAT][content] answer:", answerText0);
  }

  const latencyMs = Date.now() - t0;
  const usage = completion.usage || ({} as any);
  const promptTokens = Number.isFinite(Number(usage.prompt_tokens)) ? Number(usage.prompt_tokens) : null;
  const completionTokens = Number.isFinite(Number(usage.completion_tokens)) ? Number(usage.completion_tokens) : null;
  const totalTokens = Number.isFinite(Number(usage.total_tokens)) ? Number(usage.total_tokens) : null;

  if (process.env.AI_USAGE_LOG === "1") {
    console.log(
      `[COACH_CHAT] model=${model} ms=${latencyMs} prompt=${promptTokens ?? "?"} completion=${completionTokens ?? "?"} total=${totalTokens ?? "?"}`
    );
  }

  const answerLooksTooGeneric = (() => {
    const txt = answerText0.toLowerCase();
    const genericMarkers = ["разнообраз", "хорошая работа", "хороший режим", "в целом", "старайся", "следи за техникой"];
    const hasGeneric = genericMarkers.some((m) => txt.includes(m));
    const hasNumbers = /\d/.test(txt);
    const focusNames = Array.isArray(focus?.focusExercises) ? focus.focusExercises.map((f: any) => String(f?.name || "").toLowerCase()) : [];
    const hasFocusMention = focusNames.some((n) => n && txt.includes(n.slice(0, Math.min(10, n.length))));
    const assertsRest = txt.includes("время отдыха") || txt.includes("отдых между подход");
    return (hasGeneric && !hasNumbers && !hasFocusMention) || assertsRest;
  })();

  let answerText = answerText0;
  let rewriteUsed = false;
  if (answerLooksTooGeneric) {
    try {
      const completion2 = await openai.chat.completions.create({
        model,
        temperature: 0.5,
        max_tokens: 1100,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          {
            role: "user",
            content:
              buildUserPrompt({ question: message, context, focus, historyBrief }) +
              "\n\nПерепиши ответ так, чтобы он стал конкретнее и опирался на данные. " +
              "Убери общие фразы, не утверждай про отдых между подходами. " +
              "Если данных не хватает — прямо так и скажи и дай 2–3 шага, которые можно проверить в следующей тренировке.",
          },
        ],
      });
      const raw2 = completion2.choices[0]?.message?.content || "{}";
      const parsed2 = safeJsonParse(raw2);
      const answerText2 = normalizeAnswerText({
        intro: parsed2?.intro,
        bullets: parsed2?.bullets,
        actions: parsed2?.actions,
        outro: parsed2?.outro,
      });
      if (answerText2 && answerText2.length > 40) {
        answerText = answerText2;
        rewriteUsed = true;
      }
    } catch {
      // ignore rewrite failures
    }
  }

  // Persist messages transactionally.
  const saved = await withTransaction(async () => {
    const [u] = await q<{ id: string; created_at: string }>(
      `INSERT INTO coach_chat_messages (thread_id, role, content, meta)
       VALUES ($1, 'user', $2, $3::jsonb)
       RETURNING id, created_at`,
      [threadId, message, JSON.stringify({ contextRef, focus, intent: focus?.intent?.kind || null })]
    );

    const [a] = await q<{ id: string; created_at: string }>(
      `INSERT INTO coach_chat_messages (thread_id, role, content, meta, model, prompt_tokens, completion_tokens, total_tokens, latency_ms)
       VALUES ($1, 'assistant', $2, $3::jsonb, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        threadId,
        answerText,
        JSON.stringify({ focus, intent: focus?.intent?.kind || null, rewriteUsed }),
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs,
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

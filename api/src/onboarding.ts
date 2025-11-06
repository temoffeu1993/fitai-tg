// api/src/onboarding.ts
import { Router, Response } from "express";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
// import { requireAuth } from "./auth.js"; // в dev не используем
import OpenAI from "openai";
import { config } from "./config.js";

export const onboarding = Router();

const openai = new OpenAI({ apiKey: config.openaiApiKey! });

// helper: вернуть uid аутентифицированного или dev-гостя
async function getUidOrDev(req: any): Promise<string> {
  if (req.user?.uid) return req.user.uid;
  const rows = await q<{ id: string }>(
    `insert into users (tg_id, first_name, username)
     values (0, 'Dev', 'local')
     on conflict (tg_id) do update
       set username = excluded.username
     returning id`
  );
  if (!rows[0]?.id) throw new AppError("Cannot create dev user", 500);
  return rows[0].id;
}

/** Сохранить онбординг */
onboarding.post(
  "/onboarding/save",
  // requireAuth,
  asyncHandler(async (req: any, res: Response) => {
    const { data } = req.body || {};
    if (!data || typeof data !== "object") throw new AppError("Missing onboarding data", 400);

    const uid = await getUidOrDev(req);

    const d: any = data;

    const equipmentList =
      Array.isArray(d?.equipmentItems)   ? d.equipmentItems :
      Array.isArray(d?.equipment?.items) ? d.equipment.items :
      Array.isArray(d?.equipment)        ? d.equipment :
      [];

    const equipment =
      equipmentList.length ? equipmentList : (d?.environment?.bodyweightOnly ? ["bodyweight"] : []);

    const experience = d?.experience?.level ?? d?.experience ?? null;

    const summary = {
      name: d?.profile?.name ?? null,
      sex: d?.ageSex?.sex ?? null,
      age: d?.ageSex?.age ?? null,
      height: d?.body?.height ?? null,
      weight: d?.body?.weight ?? null,
      experience,
      equipment,
      lifestyle: d?.lifestyle ?? null,
      dietPrefs: d?.dietPrefs ?? null,
      motivation: d?.motivation ?? null,
      environment: d?.environment ?? null,
      goals: d?.goals ?? null,
    };

    await q(
      `insert into onboardings (user_id, data, summary, created_at, updated_at)
       values ($1, $2::jsonb, $3::jsonb, now(), now())
       on conflict (user_id)
       do update set data = excluded.data,
                    summary = excluded.summary,
                    updated_at = now()`,
      [uid, d, summary]
    );

    res.json({ ok: true, summary });
  })
);

/** Создать текстовую обратную связь по анкете */
onboarding.post(
  "/onboarding/feedback",
  asyncHandler(async (req: any, res: Response) => {
    const { data } = req.body || {};
    if (!data || typeof data !== "object") throw new AppError("Missing onboarding data", 400);

    // Расширенный промт с правилами и взаимосвязями
    const prompt = `
Ты — внимательный, доброжелательный ИИ-тренер и партнёр по процессу.
Пиши кратко, по-человечески, 120–220 слов, без канцелярита.
Три абзаца без заголовков:
1) Куда двигаемся — цель и краткая стратегия.
2) С чего начнём на этой неделе — говори в первом лице («я/мы»), возьми на себя работу: я подберу, я составлю, мы сделаем. Формулируй проактивно («я подготовлю план тренировок для тебя», «я дам набор упражнений с подходами и повторами», «мы адаптируем под твои ограничения»). Избегай слов «попробуй», «постарайся»; вместо них — «я предложу», «мы сделаем».
3) Короткое ободрение и фокус внимания на ближайшие тренировки.
ВАЖНО: поля расписания (daysPerWeek, minutesPerSession) — это планы пользователя и готовность, а НЕ то, что он уже делает.
Формулируй как «готов(а) заниматься N раз в неделю по ~X минут», а не «занимаешься…».
Если длительность задана как «90+», оставь «более 90 минут».
Учитывай возраст, пол, рост, вес, опыт, количество тренировок в неделю, длительность тренировки, доступное время, локацию и оборудование, ограничения по здоровью, стиль питания, продукты которые нельзя или не любит и бюджет на продукты, образ жизни, сон, уровень стресса, мотивацию и цель.
Избегай медицинских диагнозов и рецептов; при рисках — мягкое предупреждение обратиться к врачу.

Данные анкеты в JSON:
${JSON.stringify(data, null, 2)}
    `;

    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ты дружелюбный и профессиональный фитнес-тренер. Пиши на русском." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    const text = r.choices[0]?.message?.content?.trim() || "Ошибка генерации.";
    res.json({ feedback: text });
  })
);

/** Сырые данные (для предзаполнения мастера) */
onboarding.get(
  "/onboarding/raw",
  // requireAuth,
  asyncHandler(async (req: any, res: Response) => {
    const uid = await getUidOrDev(req);
    const rows = await q<{ data: any }>(`select data from onboardings where user_id = $1`, [uid]);
    res.json({ data: rows[0]?.data ?? null });
  })
);

/** Краткое summary */
onboarding.get(
  "/onboarding/summary",
  // requireAuth,
  asyncHandler(async (req: any, res: Response) => {
    const uid = await getUidOrDev(req);
    const rows = await q<{ summary: any }>(`select summary from onboardings where user_id = $1`, [uid]);
    res.json({ summary: rows[0]?.summary ?? null });
  })
);

export default onboarding;
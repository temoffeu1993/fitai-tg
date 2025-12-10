// api/src/schemes.ts
import { Router, Response } from "express";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import OpenAI from "openai";
import { config } from "./config.js";
import { workoutSchemes, WorkoutScheme } from "./workoutSchemes.js";

export const schemes = Router();

const openai = new OpenAI({ apiKey: config.openaiApiKey! });

function getUid(req: any): string {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
}

/** Получить рекомендованные схемы на основе онбординга */
schemes.post(
  "/schemes/recommend",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    // Получаем данные онбординга
    const onboardingRows = await q<{ summary: any, data: any }>(
      `select summary, data from onboardings where user_id = $1`,
      [uid]
    );
    
    if (!onboardingRows.length || !onboardingRows[0].summary) {
      throw new AppError("Onboarding data not found", 404);
    }
    
    const summary = onboardingRows[0].summary;
    const data = onboardingRows[0].data;
    
    // Собираем все данные для анализа
    const daysPerWeek = data.schedule?.daysPerWeek || summary.schedule?.daysPerWeek || 3;
    const minutesPerSession = data.schedule?.minutesPerSession || 60;
    const experience = data.experience || summary.experience || "never_trained";
    const goal = data.motivation?.goal || data.goals?.primary || summary.goals?.primary || "health_wellness";
    const age = data.ageSex?.age || summary.age || null;
    const sex = data.ageSex?.sex === "male" ? "male" : data.ageSex?.sex === "female" ? "female" : null;
    const hasHealthLimits = data.health?.hasLimits || false;
    const healthLimitsText = data.health?.limitsText || "";
    
    // Фильтруем схемы по базовым критериям
    const candidateSchemes = workoutSchemes.filter(scheme => {
      // 1. Количество дней (точное совпадение или ±1)
      const daysDiff = Math.abs(scheme.daysPerWeek - daysPerWeek);
      if (daysDiff > 1) return false;
      
      // 2. Опыт
      if (!scheme.experienceLevels.includes(experience)) return false;
      
      // 3. Время тренировки должно вписываться в диапазон схемы
      if (minutesPerSession < scheme.minMinutes || minutesPerSession > scheme.maxMinutes) {
        // Даём небольшую погрешность ±15 минут
        const tolerance = 15;
        if (minutesPerSession < scheme.minMinutes - tolerance || 
            minutesPerSession > scheme.maxMinutes + tolerance) {
          return false;
        }
      }
      
      // 4. Цель (хотя бы одна должна совпадать)
      if (!scheme.goals.includes(goal)) return false;
      
      return true;
    });
    
    if (candidateSchemes.length === 0) {
      throw new AppError("No suitable schemes found", 404);
    }
    
    // Используем ИИ для выбора лучших 3 схем и генерации описаний
    const userSexLabel = sex === "male" ? "мужской" : sex === "female" ? "женский" : "не указан";
    const experienceLabels: Record<string, string> = {
      never_trained: "Никогда не занимался в зале",
      long_break: "Перерыв 3+ месяца",
      training_regularly: "Тренируюсь регулярно (< 1 года)",
      training_experienced: "Тренируюсь давно (1+ год)"
    };
    const goalLabels: Record<string, string> = {
      lose_weight: "Похудеть",
      build_muscle: "Набрать массу",
      athletic_body: "Спортивное тело",
      lower_body_focus: "Акцент на ноги и ягодицы",
      strength: "Стать сильнее",
      health_wellness: "Здоровье и самочувствие"
    };
    
    const prompt = `
Ты — профессиональный фитнес-тренер с 10+ летним опытом. На основе детального анализа данных пользователя выбери 3 наиболее подходящие схемы тренировок.

ДАННЫЕ ПОЛЬЗОВАТЕЛЯ:
• Возраст: ${age || "не указан"}
• Пол: ${userSexLabel}
• Опыт: ${experienceLabels[experience] || experience}
• Основная цель: ${goalLabels[goal] || goal}
• Частота: ${daysPerWeek} раз в неделю
• Длительность: ${minutesPerSession} минут на тренировку
${hasHealthLimits ? `• Ограничения по здоровью: ${healthLimitsText}` : ""}

ДОСТУПНЫЕ СХЕМЫ (всего ${candidateSchemes.length}):
${candidateSchemes.map((s, i) => `
${i + 1}. "${s.name}" (${s.daysPerWeek} дней/нед, ${s.minMinutes}-${s.maxMinutes} мин)
   Тип: ${s.splitType} | Интенсивность: ${s.intensity}
   ${s.targetSex !== 'any' ? `Целевая аудитория: ${s.targetSex === 'female' ? 'женщины' : 'мужчины'}` : ''}
   Описание: ${s.description}
   Цели: ${s.goals.map(g => goalLabels[g] || g).join(", ")}
   Уровни опыта: ${s.experienceLevels.map(e => experienceLabels[e] || e).join(", ")}
   Структура: ${s.dayLabels.map(d => d.label).join(" → ")}
   Преимущества:
   ${s.benefits.map(b => `   - ${b}`).join("\n")}
   ${s.notes ? `Примечание: ${s.notes}` : ""}
`).join("\n")}`
;

КРИТЕРИИ ПОДБОРА:
1. Соответствие опыту и целям пользователя
2. Учёт пола и возраста (для женщин часто предпочтительнее схемы с акцентом на низ)
3. Соответствие доступному времени
4. Интенсивность должна соответствовать уровню подготовки
5. Разнообразие предложенных вариантов (разные подходы к одной цели)

ЗАДАЧА:
Выбери 3 схемы и для каждой напиши персональное обоснование (3-4 предложения):
1. РЕКОМЕНДОВАННАЯ — самая подходящая, объясни почему именно она идеальна
2. АЛЬТЕРНАТИВА 1 — другой подход к той же цели, укажи её уникальные преимущества
3. АЛЬТЕРНАТИВА 2 — ещё один вариант, покажи чем он отличается от первых двух

Формат ответа (строго JSON):
{
  "recommended": {
    "schemeIndex": 0,
    "reason": "Детальное персональное обоснование почему эта схема идеально подходит этому пользователю..."
  },
  "alternatives": [
    {
      "schemeIndex": 1,
      "reason": "Почему эта альтернатива тоже отличный выбор с другим подходом..."
    },
    {
      "schemeIndex": 2,
      "reason": "Уникальные преимущества этого варианта для пользователя..."
    }
  ]
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ты профессиональный фитнес-тренер. Отвечай только в формате JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const aiResponse = JSON.parse(completion.choices[0]?.message?.content || "{}");
    
    // Формируем ответ
    const recommendedScheme = candidateSchemes[aiResponse.recommended?.schemeIndex || 0];
    const alternative1 = candidateSchemes[aiResponse.alternatives?.[0]?.schemeIndex || 1 % candidateSchemes.length];
    const alternative2 = candidateSchemes[aiResponse.alternatives?.[1]?.schemeIndex || 2 % candidateSchemes.length];
    
    const response = {
      recommended: {
        ...recommendedScheme,
        reason: aiResponse.recommended?.reason || "Наиболее подходящая схема для ваших целей",
        isRecommended: true,
      },
      alternatives: [
        {
          ...alternative1,
          reason: aiResponse.alternatives?.[0]?.reason || "Хорошая альтернатива",
          isRecommended: false,
        },
        {
          ...alternative2,
          reason: aiResponse.alternatives?.[1]?.reason || "Ещё один вариант для рассмотрения",
          isRecommended: false,
        },
      ],
    };

    res.json(response);
  })
);

/** Сохранить выбранную схему */
schemes.post(
  "/schemes/select",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const { schemeId } = req.body;
    
    if (!schemeId) {
      throw new AppError("Scheme ID is required", 400);
    }
    
    // Находим схему
    const selectedScheme = workoutSchemes.find(s => s.id === schemeId);
    if (!selectedScheme) {
      throw new AppError("Scheme not found", 404);
    }
    
    // Сохраняем выбор в таблицу user_workout_schemes
    // Но сначала нужно добавить схему в таблицу workout_schemes если её там нет
    const schemeRows = await q<{ id: string }>(
      `SELECT id FROM workout_schemes WHERE id = $1::uuid`,
      [schemeId]
    );
    
    if (schemeRows.length === 0) {
      // Добавляем схему в базу
      await q(
        `INSERT INTO workout_schemes 
         (id, name, description, days_per_week, min_minutes, max_minutes, split_type, 
          experience_levels, goals, equipment_required, day_labels, benefits, notes, intensity, target_sex)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
         ON CONFLICT (id) DO NOTHING`,
        [
          schemeId,
          selectedScheme.name,
          selectedScheme.description,
          selectedScheme.daysPerWeek,
          selectedScheme.minMinutes,
          selectedScheme.maxMinutes,
          selectedScheme.splitType,
          selectedScheme.experienceLevels,
          selectedScheme.goals,
          selectedScheme.equipmentRequired,
          JSON.stringify(selectedScheme.dayLabels),
          selectedScheme.benefits,
          selectedScheme.notes || null,
          selectedScheme.intensity,
          selectedScheme.targetSex || 'any',
        ]
      );
    }
    
    // Сохраняем выбор пользователя
    await q(
      `INSERT INTO user_workout_schemes (user_id, scheme_id)
       VALUES ($1, $2::uuid)
       ON CONFLICT (user_id) DO UPDATE SET scheme_id = $2::uuid, selected_at = now()`,
      [uid, schemeId]
    );
    
    // Также сохраняем схему в training_programs для использования в генерации тренировок
    const blueprint = {
      name: selectedScheme.name,
      days: selectedScheme.dayLabels.map(d => d.label),
      description: selectedScheme.description,
      meta: {
        daysPerWeek: selectedScheme.daysPerWeek,
        goals: selectedScheme.goals,
        location: "gym",
        trainingStatus: "intermediate" as const,
        createdAt: new Date().toISOString(),
      },
    };
    
    await q(
      `INSERT INTO training_programs (user_id, blueprint_json, microcycle_len, week, day_idx)
       VALUES ($1, $2::jsonb, $3, 1, 0)
       ON CONFLICT (user_id) DO UPDATE 
       SET blueprint_json = $2::jsonb, microcycle_len = $3, updated_at = now()`,
      [uid, blueprint, selectedScheme.daysPerWeek]
    );
    
    res.json({ ok: true, scheme: selectedScheme });
  })
);

/** Получить выбранную схему пользователя */
schemes.get(
  "/schemes/selected",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    const rows = await q<{ scheme_id: string }>(
      `SELECT scheme_id FROM user_workout_schemes WHERE user_id = $1`,
      [uid]
    );
    
    if (!rows.length) {
      return res.json({ scheme: null });
    }
    
    const selectedScheme = workoutSchemes.find(s => s.id === rows[0].scheme_id);
    res.json({ scheme: selectedScheme || null });
  })
);

export default schemes;

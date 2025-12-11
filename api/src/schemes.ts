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
    
    // Извлекаем опыт из разных возможных источников
    let experience = data.experience?.level || data.experience || summary.experience?.level || summary.experience || "beginner";
    // Маппинг старых значений на новые (если остались старые данные)
    const expMap: Record<string, string> = {
      never_trained: "beginner",
      long_break: "beginner",
      training_regularly: "intermediate",
      training_experienced: "advanced",
    };
    experience = expMap[experience] || experience;
    
    const goal = data.motivation?.goal || data.goals?.primary || summary.goals?.primary || "health_wellness";
    const age = data.ageSex?.age || summary.age || null;
    const sex = data.ageSex?.sex === "male" ? "male" : data.ageSex?.sex === "female" ? "female" : null;
    const hasHealthLimits = data.health?.hasLimits || false;
    const healthLimitsText = data.health?.limitsText || "";
    
    // Фильтруем схемы по строгим критериям (без fallback)
    const candidateSchemes = workoutSchemes.filter(scheme => {
      // 1. Точное совпадение по количеству дней
      if (scheme.daysPerWeek !== daysPerWeek) return false;
      
      // 2. Опыт должен совпадать
      if (!scheme.experienceLevels.includes(experience)) return false;
      
      // 3. Время тренировки с погрешностью ±20 минут
      const tolerance = 20;
      if (minutesPerSession < scheme.minMinutes - tolerance || 
          minutesPerSession > scheme.maxMinutes + tolerance) {
        return false;
      }
      
      // 4. Цель должна совпадать
      if (!scheme.goals.includes(goal)) return false;
      
      return true;
    });
    
    if (candidateSchemes.length === 0) {
      throw new AppError(
        `К сожалению, не нашлось подходящей схемы для ваших параметров (${goal}, ${daysPerWeek} дн/нед, ${experience}). Попробуйте изменить количество дней в неделю или другие параметры.`,
        404
      );
    }
    
    // Программный подбор схем на основе чётких критериев (надёжнее и быстрее чем AI)
    
    // Функция для подсчёта соответствия схемы пользователю
    function scoreScheme(scheme: any): number {
      let score = 0;
      
      // 1. Соответствие опыту (вес: 15)
      if (scheme.experienceLevels.includes(experience)) score += 15;
      else score += 5; // fallback для соседних уровней
      
      // 2. Соответствие цели (вес: 25)
      if (scheme.goals.includes(goal)) score += 25;
      
      // 3. ПРИОРИТЕТ: Точное совпадение дней (вес: 30) - УВЕЛИЧЕН!
      const daysDiff = Math.abs(scheme.daysPerWeek - daysPerWeek);
      if (daysDiff === 0) score += 30; // Точное совпадение - максимальный приоритет!
      else if (daysDiff === 1) score += 15; // ±1 день - хорошо
      else if (daysDiff === 2) score += 5; // ±2 дня - допустимо
      // Больше 2 дней не должно попасть благодаря фильтрам
      
      // 4. Соответствие полу (вес: 12)
      if (scheme.targetSex === 'any') score += 8;
      else if (scheme.targetSex === sex) score += 12;
      
      // 5. Соответствие интенсивности опыту (вес: 13)
      if (experience === 'beginner' && scheme.intensity === 'low') score += 13;
      else if (experience === 'intermediate' && scheme.intensity === 'moderate') score += 13;
      else if (experience === 'advanced' && scheme.intensity === 'high') score += 13;
      else if (scheme.intensity === 'moderate') score += 7; // универсальная интенсивность
      
      // 6. Бонусы за специфические комбинации (вес: до 10)
      if (goal === 'lower_body_focus' && scheme.splitType.includes('glutes')) score += 10;
      if (goal === 'strength' && (scheme.splitType.includes('powerbuilding') || scheme.splitType.includes('strength'))) score += 10;
      if (goal === 'health_wellness' && scheme.splitType === 'full_body') score += 8;
      if (goal === 'lose_weight' && (scheme.splitType.includes('metabolic') || scheme.name.includes('Fat Loss'))) score += 10;
      
      return score;
    }
    
    // Сортируем кандидатов по соответствию
    const scoredSchemes = candidateSchemes
      .map(s => ({ scheme: s, score: scoreScheme(s) }))
      .sort((a, b) => b.score - a.score);
    
    // Выбираем топ-3 с учётом разнообразия типов сплитов
    const selectedSchemes: any[] = [];
    const usedSplitTypes = new Set<string>();
    
    // Первая схема - самая подходящая
    if (scoredSchemes.length > 0) {
      selectedSchemes.push(scoredSchemes[0].scheme);
      usedSplitTypes.add(scoredSchemes[0].scheme.splitType);
    }
    
    // Вторая и третья - стараемся выбрать разные типы
    for (const item of scoredSchemes.slice(1)) {
      if (selectedSchemes.length >= 3) break;
      
      // Предпочитаем разные типы сплитов
      if (!usedSplitTypes.has(item.scheme.splitType)) {
        selectedSchemes.push(item.scheme);
        usedSplitTypes.add(item.scheme.splitType);
      }
    }
    
    // Если всё ещё меньше 3, добавляем просто по скору
    for (const item of scoredSchemes.slice(1)) {
      if (selectedSchemes.length >= 3) break;
      if (!selectedSchemes.includes(item.scheme)) {
        selectedSchemes.push(item.scheme);
      }
    }
    
    // Генерируем персональные обоснования
    function generateReason(scheme: any, position: 'recommended' | 'alt1' | 'alt2'): string {
      const reasons: string[] = [];
      
      // Основное обоснование в зависимости от позиции
      if (position === 'recommended') {
        reasons.push(`Схема "${scheme.name}" — оптимальный выбор для ваших целей.`);
      } else if (position === 'alt1') {
        reasons.push(`Схема "${scheme.name}" — отличная альтернатива с немного другим подходом.`);
      } else {
        reasons.push(`Схема "${scheme.name}" — ещё один эффективный вариант для рассмотрения.`);
      }
      
      // Добавляем конкретные преимущества
      if (scheme.goals.includes(goal)) {
        const goalMap: Record<string, string> = {
          lose_weight: "направлена на жиросжигание и улучшение метаболизма",
          build_muscle: "оптимизирована для набора мышечной массы",
          athletic_body: "формирует гармоничное спортивное телосложение",
          lower_body_focus: "делает акцент на развитие ног и ягодиц",
          strength: "развивает силовые показатели",
          health_wellness: "улучшает общее самочувствие и здоровье"
        };
        reasons.push(`Она ${goalMap[goal] || "соответствует вашей цели"}.`);
      }
      
      // Частота
      reasons.push(`${scheme.daysPerWeek} тренировки в неделю обеспечивают оптимальный баланс нагрузки и восстановления.`);
      
      // Интенсивность
      const intensityMap = {
        low: "Мягкая интенсивность подходит для комфортного входа в тренировочный процесс",
        moderate: "Умеренная интенсивность — золотая середина для стабильного прогресса",
        high: "Высокая интенсивность максимизирует результаты при правильном восстановлении"
      };
      reasons.push(intensityMap[scheme.intensity as keyof typeof intensityMap] + ".");
      
      return reasons.join(" ");
    }
    
    // Формируем ответ (с защитой от undefined)
    // Гарантируем наличие всех 3 схем, дублируя первую если нужно
    const scheme1 = selectedSchemes[0];
    const scheme2 = selectedSchemes[1] || selectedSchemes[0];
    const scheme3 = selectedSchemes[2] || selectedSchemes[1] || selectedSchemes[0];
    
    const response = {
      recommended: {
        ...scheme1,
        reason: generateReason(scheme1, 'recommended'),
        isRecommended: true,
      },
      alternatives: [
        {
          ...scheme2,
          reason: selectedSchemes[1] ? generateReason(scheme2, 'alt1') : "Также подходит для ваших целей",
          isRecommended: false,
        },
        {
          ...scheme3,
          reason: selectedSchemes[2] ? generateReason(scheme3, 'alt2') : "Хороший вариант для начала",
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
      `SELECT id FROM workout_schemes WHERE id = $1`,
      [schemeId]
    );
    
    if (schemeRows.length === 0) {
      // Добавляем схему в базу
      await q(
        `INSERT INTO workout_schemes 
         (id, name, description, days_per_week, min_minutes, max_minutes, split_type, 
          experience_levels, goals, equipment_required, day_labels, benefits, notes, intensity, target_sex)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
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
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET scheme_id = $2, selected_at = now()`,
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

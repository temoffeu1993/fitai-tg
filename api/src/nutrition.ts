// api/src/nutrition.ts
// ============================================================================
// AI-FIRST NUTRITION COACH — реалистичный план питания на 3 дня
// Работает как настоящий нутрициолог: гибкие приёмы, точные КБЖУ, meal prep
// ============================================================================
import { Router, Response, Request } from "express";
import OpenAI from "openai";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { config } from "./config.js";

export const nutrition = Router();
const openai = new OpenAI({ apiKey: config.openaiApiKey! });

// ----------------------------------------------------------------------------
// types
// ----------------------------------------------------------------------------
type Onb = any;

type WeekPlanAI = {
  week: {
    name?: string;
    notes?: string;
    goal: { 
      kcal: number; 
      protein_g: number; 
      fat_g: number; 
      carbs_g: number; 
      meals_per_day: number; 
      diet_style?: string; 
      budget?: "низкий"|"средний"|"высокий" 
    };
    days: Array<{
      date?: string;
      title?: string;
      meals: Array<{
        title: string;
        time?: string;
        target_kcal?: number;
        target_protein_g?: number;
        target_fat_g?: number;
        target_carbs_g?: number;
        items: Array<{
          food: string;
          qty: number;
          unit: string;
          kcal?: number;
          protein_g?: number;
          fat_g?: number;
          carbs_g?: number;
          prep?: string;
          notes?: string;
        }>;
        notes?: string;
      }>;
    }>;
  };
};

type PlanStatus = "processing" | "ready" | "failed";

const MOSCOW_TZ = "Europe/Moscow";
const DEFAULT_MEALS = [
  { title: "Завтрак", time: "08:00" },
  { title: "Перекус", time: "11:00" },
  { title: "Обед", time: "14:00" },
  { title: "Полдник", time: "17:00" },
  { title: "Ужин", time: "20:00" },
];

function currentMoscowDateISO() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function addDaysToIso(iso: string, offset: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  const shifted = new Date(base.getTime() + offset * 86400000);
  return shifted.toISOString().slice(0, 10);
}

function buildWeekWindow(startIso: string) {
  return Array.from({ length: 3 }).map((_, idx) => {
    const iso = addDaysToIso(startIso, idx);
    const label = new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: MOSCOW_TZ,
    });
    return { iso, label };
  });
}

function buildSkeletonWeek(startDateISO: string, targets: NutritionTarget): WeekPlanAI {
  const mealsPerDay = Math.min(5, Math.max(3, targets.mealsPerDay));
  const baseMeals = DEFAULT_MEALS.slice(0, mealsPerDay).map((meal, idx) => ({
    title: meal.title,
    time: meal.time,
    target_kcal: Math.round(targets.dailyKcal / mealsPerDay),
    target_protein_g: Math.round(targets.proteinG / mealsPerDay),
    target_fat_g: Math.round(targets.fatG / mealsPerDay),
    target_carbs_g: Math.round(targets.carbsG / mealsPerDay),
    items: [],
    notes: idx === mealsPerDay - 1 ? "AI дополняет меню..." : undefined,
  }));

  const days = Array.from({ length: 3 }).map((_, idx) => {
    const dayIso = addDaysToIso(startDateISO, idx);
    return {
      date: dayIso,
      title: `День ${idx + 1}`,
      meals: baseMeals.map((meal) => ({ ...meal, items: [] })),
    };
  });

  return {
    week: {
      name: "План питания (черновик)",
      notes: "Готовим рекомендации — подожди пару секунд, пока AI добавляет блюда и граммовки.",
      goal: {
        kcal: targets.dailyKcal,
        protein_g: targets.proteinG,
        fat_g: targets.fatG,
        carbs_g: targets.carbsG,
        meals_per_day: mealsPerDay,
      },
      days,
    },
  };
}

// ----------------------------------------------------------------------------
// Расчёт калорий и макронутриентов
// ----------------------------------------------------------------------------
interface NutritionTarget {
  dailyKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  mealsPerDay: number;
}

function extractOnboardingData(onb: Onb) {
  return {
    gender: onb.ageSex?.sex || onb.gender || onb.sex || "male",
    age: Number(onb.ageSex?.age || onb.age) || 30,
    weight: Number(onb.body?.weight || onb.weight) || 70,
    height: Number(onb.body?.height || onb.height) || 170,
    activityLevel: onb.lifestyle?.workStyle || onb.activity?.level || onb.activityLevel || "moderate",
    goal: onb.motivation?.goal || onb.goals?.[0] || onb.goal || "maintain",
    sleep: onb.lifestyle?.sleep || onb.sleep?.hours || onb.sleepHours,
    stress: onb.lifestyle?.stress || onb.stress?.level || onb.stressLevel,
    
    dietStyle: onb.dietPrefs?.styles?.[0] || onb.nutrition?.dietStyle || onb.diet?.style || "всеядный",
    budget: onb.dietPrefs?.budgetLevel || onb.nutrition?.budget || "medium",
    restrictions: onb.dietPrefs?.restrictions || onb.nutrition?.restrictions || onb.restrictions || [],
    dislikes: onb.preferences?.dislike || onb.nutrition?.dislikes || onb.nutrition?.avoid || [],
    
    health: onb.health?.limitsText || onb.health?.conditions || "",
    hasLimits: onb.health?.hasLimits || false,
    allergies: onb.allergies || onb.health?.allergies || [],
  };
}

function calculateNutritionTargets(onb: Onb): NutritionTarget {
  const data = extractOnboardingData(onb);
  
  const gender = data.gender;
  const age = data.age;
  const weight = data.weight;
  const height = data.height;
  const activityLevel = data.activityLevel;
  const goal = data.goal;

  // 1. Базальный метаболизм (формула Mifflin-St Jeor)
  let bmr: number;
  if (gender.toLowerCase().includes("f") || gender.toLowerCase().includes("ж") || gender === "female") {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  }

  // 2. Общий расход калорий (TDEE)
  let activityMultiplier = 1.55;
  
  if (activityLevel.toLowerCase().includes("sedentary") || activityLevel.toLowerCase().includes("сидяч")) {
    activityMultiplier = 1.2;
  } else if (activityLevel.toLowerCase().includes("light") || activityLevel.toLowerCase().includes("лёгк")) {
    activityMultiplier = 1.375;
  } else if (activityLevel.toLowerCase().includes("active") || activityLevel.toLowerCase().includes("активн")) {
    activityMultiplier = 1.725;
  } else if (activityLevel.toLowerCase().includes("very") || activityLevel.toLowerCase().includes("очень")) {
    activityMultiplier = 1.9;
  }
  
  const tdee = Math.round(bmr * activityMultiplier);

  // 3. Корректировка под цель
  let dailyKcal = tdee;
  const goalLower = goal.toString().toLowerCase();
  
  if (goalLower.includes("loss") || goalLower.includes("lose") || goalLower.includes("худ") || goalLower.includes("сброс") || goalLower.includes("снижение")) {
    dailyKcal = Math.round(tdee * 0.82);
  } else if (goalLower.includes("gain") || goalLower.includes("muscle") || goalLower.includes("набор") || goalLower.includes("масс")) {
    dailyKcal = Math.round(tdee * 1.12);
  }

  // 4. Распределение макронутриентов
  let proteinG: number;
  let fatG: number;
  let carbsG: number;

  if (goalLower.includes("loss") || goalLower.includes("худ")) {
    proteinG = Math.round(weight * 2.0);
    fatG = Math.round((dailyKcal * 0.25) / 9);
    carbsG = Math.round((dailyKcal - proteinG * 4 - fatG * 9) / 4);
  } else if (goalLower.includes("gain") || goalLower.includes("muscle") || goalLower.includes("масс")) {
    proteinG = Math.round(weight * 2.2);
    fatG = Math.round((dailyKcal * 0.25) / 9);
    carbsG = Math.round((dailyKcal - proteinG * 4 - fatG * 9) / 4);
  } else {
    proteinG = Math.round(weight * 1.8);
    fatG = Math.round((dailyKcal * 0.28) / 9);
    carbsG = Math.round((dailyKcal - proteinG * 4 - fatG * 9) / 4);
  }

  const mealsPerDay = Number(onb.nutrition?.mealsPerDay) || 3;

  return {
    dailyKcal,
    proteinG,
    fatG,
    carbsG,
    mealsPerDay
  };
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------
function getUserId(req: any) {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
}

async function getOnboarding(userId: string): Promise<Onb> {
  const rows = await q(
    `SELECT data
       FROM onboardings
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1`,
    [userId]
  );
  return rows[0]?.data || {};
}

async function getLastNutritionPlans(userId: string, n = 3) {
  const rows = await q(
    `SELECT id, week_start_date, goal_kcal, protein_g, fat_g, carbs_g, meals_per_day, diet_style, restrictions, notes
     FROM nutrition_plans
     WHERE user_id = $1
       AND status = 'ready'
     ORDER BY week_start_date DESC
     LIMIT $2`,
    [userId, n]
  );
  return rows;
}

type AsyncPlanArgs = {
  planId: string;
  userId: string;
  weekStart: string;
  onboarding: Onb;
  targets: NutritionTarget;
};

async function deletePlanById(planId: string): Promise<void> {
  await q(`DELETE FROM nutrition_plans WHERE id = $1`, [planId]);
}

async function insertSkeletonPlan(
  userId: string,
  weekStart: string,
  aiPlan: WeekPlanAI,
  targets: NutritionTarget,
  onboarding: Onb
): Promise<string> {
  const data = extractOnboardingData(onboarding);
  const g = aiPlan.week.goal || {};

  await q("BEGIN");
  try {
    const planRows = await q(
      `INSERT INTO nutrition_plans
         (user_id, week_start_date, name, goal_kcal, protein_g, fat_g, carbs_g, meals_per_day, diet_style, restrictions, notes, status)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11, $12)
       RETURNING id`,
      [
        userId,
        weekStart,
        aiPlan.week.name || "План питания в обработке",
        Number(g.kcal) || targets.dailyKcal,
        Number(g.protein_g) || targets.proteinG,
        Number(g.fat_g) || targets.fatG,
        Number(g.carbs_g) || targets.carbsG,
        Number(g.meals_per_day) || targets.mealsPerDay,
        g.diet_style || data.dietStyle,
        Array.isArray(data.restrictions) && data.restrictions.length > 0 ? data.restrictions : null,
        aiPlan.week.notes || "AI формирует подробный рацион...",
        "processing",
      ]
    );
    const planId = planRows[0].id;

    for (let i = 0; i < aiPlan.week.days.length; i++) {
      const d = aiPlan.week.days[i];
      const dayDate = d?.date || addDaysToIso(weekStart, i);
      const [dayRow] = await q(
        `INSERT INTO nutrition_days (plan_id, day_index, day_date)
         VALUES ($1, $2, $3::date)
         RETURNING id`,
        [planId, i + 1, dayDate]
      );
      const dayId = dayRow.id;
      const meals = Array.isArray(d.meals) ? d.meals : [];
      for (let j = 0; j < meals.length; j++) {
        const m = meals[j];
        await q(
          `INSERT INTO nutrition_meals
             (day_id, title, time_hint, target_kcal, target_protein_g, target_fat_g, target_carbs_g, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            dayId,
            m.title || `Приём ${j + 1}`,
            m.time || null,
            m.target_kcal ?? null,
            m.target_protein_g ?? null,
            m.target_fat_g ?? null,
            m.target_carbs_g ?? null,
            j + 1,
          ]
        );
      }
    }

    await q("COMMIT");
    return planId;
  } catch (err) {
    await q("ROLLBACK");
    throw err;
  }
}

async function overwritePlanWithAI(
  planId: string,
  aiPlan: WeekPlanAI,
  targets: NutritionTarget,
  onboarding: Onb,
  weekStart: string
) {
  const data = extractOnboardingData(onboarding);
  const g = aiPlan.week.goal || {};
  await q("BEGIN");
  try {
    await q(`DELETE FROM nutrition_days WHERE plan_id = $1`, [planId]);

    for (let i = 0; i < aiPlan.week.days.length; i++) {
      const d = aiPlan.week.days[i];
      const fallbackDate = addDaysToIso(weekStart, i);
      let dayDate = d?.date;
      if (dayDate) {
        const parsed = new Date(dayDate);
        dayDate = Number.isNaN(parsed.getTime()) ? fallbackDate : parsed.toISOString().slice(0, 10);
      } else {
        dayDate = fallbackDate;
      }
      const [dayRow] = await q(
        `INSERT INTO nutrition_days (plan_id, day_index, day_date)
         VALUES ($1, $2, $3::date)
         RETURNING id`,
        [planId, i + 1, dayDate]
      );
      const dayId = dayRow.id;

      const meals = Array.isArray(d.meals) ? d.meals : [];
      for (let j = 0; j < meals.length; j++) {
        const m = meals[j];
        const [mealRow] = await q(
          `INSERT INTO nutrition_meals
             (day_id, title, time_hint, target_kcal, target_protein_g, target_fat_g, target_carbs_g, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            dayId,
            m.title || `Приём ${j + 1}`,
            m.time || null,
            m.target_kcal ?? null,
            m.target_protein_g ?? null,
            m.target_fat_g ?? null,
            m.target_carbs_g ?? null,
            j + 1,
          ]
        );
        const mealId = mealRow.id;

        const items = Array.isArray(m.items) ? m.items : [];
        for (let k = 0; k < items.length; k++) {
          const it = items[k];
          await q(
            `INSERT INTO nutrition_items
               (meal_id, food_name, qty, unit, kcal, protein_g, fat_g, carbs_g, prep, notes, position)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              mealId,
              it.food || "Продукт",
              Number(it.qty ?? 0),
              it.unit || "г",
              it.kcal ?? null,
              it.protein_g ?? null,
              it.fat_g ?? null,
              it.carbs_g ?? null,
              it.prep ?? null,
              it.notes ?? null,
              k + 1,
            ]
          );
        }
      }
    }

    await q(
      `UPDATE nutrition_plans
         SET name = $2,
             goal_kcal = $3,
             protein_g = $4,
             fat_g = $5,
             carbs_g = $6,
             meals_per_day = $7,
             diet_style = $8,
             restrictions = $9::text[],
             notes = $10,
             status = 'ready',
             error_info = NULL,
             updated_at = now()
       WHERE id = $1`,
      [
        planId,
        aiPlan.week.name || "Персонализированный план питания (3 дня)",
        Number(g.kcal) || targets.dailyKcal,
        Number(g.protein_g) || targets.proteinG,
        Number(g.fat_g) || targets.fatG,
        Number(g.carbs_g) || targets.carbsG,
        Number(g.meals_per_day) || targets.mealsPerDay,
        g.diet_style || data.dietStyle,
        Array.isArray(data.restrictions) && data.restrictions.length > 0 ? data.restrictions : null,
        aiPlan.week.notes || null,
      ]
    );

    await q("COMMIT");
  } catch (err) {
    await q("ROLLBACK");
    throw err;
  }
}

function queueDetailedPlanGeneration(args: AsyncPlanArgs) {
  setTimeout(() => {
    generateDetailedPlan(args).catch(async (err) => {
      console.error("Async nutrition generation failed:", err);
      await q(
        `UPDATE nutrition_plans
           SET status = 'failed',
               error_info = COALESCE($2, 'AI error'),
               updated_at = now()
         WHERE id = $1`,
        [args.planId, (err as any)?.message?.slice(0, 500) ?? null]
      );
    });
  }, 0);
}

async function generateDetailedPlan({
  planId,
  userId,
  weekStart,
  onboarding,
  targets,
}: AsyncPlanArgs) {
  const historyWeeks = await getLastNutritionPlans(userId, 3);
  const prompt = buildAIPrompt(onboarding, targets, historyWeeks, weekStart);

  if (process.env.DEBUG_AI === "1") {
    console.log("\n=== NUTRITION PROMPT ===");
    console.log(prompt);
    console.log("\n=== CALCULATED TARGETS ===");
    console.log(JSON.stringify(targets, null, 2));
  }

  const tLLM = Date.now();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.85,
    max_tokens: 9000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a professional nutritionist with 15+ years of experience and access to comprehensive nutrition databases (USDA, FatSecret). You create realistic, practical meal plans people actually use. CRITICAL: Each ingredient must be a separate item in the items array - NEVER combine multiple foods into one item. Always use calorie data for COOKED/PREPARED foods. Cross-check all values with nutrition databases. Verify daily totals match target ±100 kcal.",
      },
      { role: "user", content: prompt },
    ],
  });
  console.log(`[NUTRITION] openai.chat ${Date.now() - tLLM}ms`);

  let ai: WeekPlanAI | null = null;
  try {
    const content = completion.choices[0].message.content || "{}";
    const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    ai = JSON.parse(cleanContent);
  } catch (e) {
    console.error("AI JSON parse error:", e);
    throw new AppError("AI вернул некорректный JSON", 500);
  }

  if (!ai?.week?.days || !Array.isArray(ai.week.days)) {
    throw new AppError("AI сформировал некорректную структуру", 500);
  }

  if (ai.week.days.length !== 3) {
    throw new AppError(`AI создал ${ai.week.days.length} дней вместо 3. Попробуйте ещё раз.`, 500);
  }

  // === QA: нормализуем КБЖУ и подгоняем под цели ===
  ai = fixPlanToTargets(ai, targets);
  // ================================================

  const totalKcal = ai.week.days.reduce((sum, day) => {
    return (
      sum +
      (day.meals || []).reduce((mSum, meal) => {
        return (
          mSum +
          (meal.items || []).reduce((iSum, item) => iSum + (item.kcal || 0), 0)
        );
      }, 0)
    );
  }, 0);
  const avgDailyKcal = Math.round(totalKcal / 3);

  if (Math.abs(avgDailyKcal - targets.dailyKcal) > targets.dailyKcal * 0.15) {
    console.warn(
      `⚠️  AI generated plan with ${avgDailyKcal} kcal vs target ${targets.dailyKcal} (${Math.round(
        ((avgDailyKcal / targets.dailyKcal - 1) * 100)
      )}% diff)`
    );
  } else {
    console.log(`✓ Plan validated: ${avgDailyKcal} kcal (target ${targets.dailyKcal})`);
  }

  await overwritePlanWithAI(planId, ai, targets, onboarding, weekStart);
}

async function loadWeekPlan(userId: string, weekStart: string) {
  const head = await q(
    `SELECT id, user_id, name, goal_kcal, protein_g, fat_g, carbs_g, meals_per_day, diet_style, restrictions, notes,
            week_start_date, status, error_info
     FROM nutrition_plans
     WHERE user_id=$1 AND week_start_date = $2::date
     LIMIT 1`,
    [userId, weekStart]
  );
  if (!head[0]) return null;

  const planId = head[0].id;
  const days = await q(
    `SELECT id, day_index, day_date FROM nutrition_days WHERE plan_id=$1 ORDER BY day_index`,
    [planId]
  );
  const meals = await q(
    `SELECT id, day_id, title, time_hint, target_kcal, target_protein_g, target_fat_g, target_carbs_g, position
     FROM nutrition_meals
     WHERE day_id = ANY($1::uuid[])
     ORDER BY position`,
    [days.map((d: any) => d.id)]
  );
  const items = await q(
    `SELECT id, meal_id, food_name, qty, unit, kcal, protein_g, fat_g, carbs_g, prep, notes, position
     FROM nutrition_items
     WHERE meal_id = ANY($1::uuid[])
     ORDER BY position`,
    [meals.map((m: any) => m.id)]
  );

  const mealsByDay = new Map<string, any[]>();
  meals.forEach((m: any) => {
    const arr = mealsByDay.get(m.day_id) || [];
    arr.push({ ...m, items: [] });
    mealsByDay.set(m.day_id, arr);
  });
  const itemsByMeal = new Map<string, any[]>();
  items.forEach((i: any) => {
    const arr = itemsByMeal.get(i.meal_id) || [];
    arr.push(i);
    itemsByMeal.set(i.meal_id, arr);
  });
  
  meals.forEach((m: any) => {
    const arr = mealsByDay.get(m.day_id);
    const idx = arr?.findIndex((x) => x.id === m.id) ?? -1;
    if (idx >= 0) arr![idx].items = (itemsByMeal.get(m.id) || []).map((it) => ({
      food: it.food_name, qty: Number(it.qty), unit: it.unit, kcal: it.kcal ?? undefined,
      protein_g: it.protein_g ?? undefined, fat_g: it.fat_g ?? undefined, carbs_g: it.carbs_g ?? undefined,
      prep: it.prep ?? undefined, notes: it.notes ?? undefined
    }));
  });

  return {
    plan: {
      id: head[0].id,
      week_start_date: head[0].week_start_date,
      name: head[0].name || "Питание на 3 дня",
      notes: head[0].notes || "",
      goal: {
        kcal: head[0].goal_kcal ?? 0,
        protein_g: head[0].protein_g ?? 0,
        fat_g: head[0].fat_g ?? 0,
        carbs_g: head[0].carbs_g ?? 0,
        meals_per_day: head[0].meals_per_day ?? 3,
        diet_style: head[0].diet_style ?? "",
      },
      days: days.map((d: any) => ({
        day_index: d.day_index,
        date: d.day_date,
        meals: (mealsByDay.get(d.id) || []).map((m) => ({
          title: m.title,
          time: m.time_hint || null,
          target_kcal: m.target_kcal ?? undefined,
          target_protein_g: m.target_protein_g ?? undefined,
          target_fat_g: m.target_fat_g ?? undefined,
          target_carbs_g: m.target_carbs_g ?? undefined,
          items: m.items
        }))
      }))
    },
    status: (head[0].status as PlanStatus) || "ready",
    error: head[0].error_info || null,
    planId
  };
}

function mapBudgetLevel(budget: string): string {
  const b = budget.toLowerCase();
  if (b === "low" || b === "низкий") return "низкий";
  if (b === "high" || b === "высокий") return "высокий";
  return "средний";
}

// ----------------------------------------------------------------------------
// Культурные правила РФ
// ----------------------------------------------------------------------------
function ruCulturalGuidelines() {
  return `
КУЛЬТУРНЫЙ КОНТЕКСТ (Россия)

— Завтрак: преимущественно молочно-злаковые и яичные варианты; мясные горячие блюда утром редки.
— Обед: часто первое блюдо + горячее с гарниром и салатом; допускается одно из них, но избегай перегруза.
— Не сочетай два крахмальных гарнира в одном приёме (например, крупы + хлеб).
— Не дублируй основные белковые источники внутри одного приёма (оставь один основной, остальное — гарнир/овощи).
— Кисломолочные обычно как завтрак или перекус, не как самостоятельное блюдо в обед.
— Хлеб уместен в первую очередь к первому блюду; вечером минимум.
— Предпочитай базовые местные продукты; экзотику используй умеренно. Если используешь редкий продукт — в notes дай короткую локальную замену одной фразой.
— Нейтральные названия без брендов. Никаких шаблонов; сохраняй вариативность порций и калорий между днями.`;
}

// ----------------------------------------------------------------------------
// Prompt builder
// ----------------------------------------------------------------------------
function buildAIPrompt(onb: Onb, targets: NutritionTarget, lastWeeks: any[], weekStartISO: string) {
  const data = extractOnboardingData(onb);
  
  const gender = data.gender === "male" ? "мужской" : data.gender === "female" ? "женский" : data.gender;
  const age = data.age;
  const weight = data.weight;
  const height = data.height;
  const activityLevel = data.activityLevel === "sedentary" ? "сидячий образ жизни" : 
                        data.activityLevel === "moderate" ? "умеренная активность" : 
                        data.activityLevel === "active" ? "активный образ жизни" : data.activityLevel;
  const goal = data.goal === "muscle_gain" ? "набор мышечной массы" : 
               data.goal === "weight_loss" ? "снижение веса" :
               data.goal === "fat_loss" ? "снижение веса" :
               data.goal === "maintain" ? "поддержание формы" : data.goal;
  
  const health = data.hasLimits ? data.health : "нет ограничений";
  const dislikes = data.dislikes.length > 0 ? data.dislikes.join(", ") : "нет";
  const allergies = Array.isArray(data.allergies) && data.allergies.length > 0 
    ? data.allergies.join(", ") 
    : "нет";
  
  let dietStyle = data.dietStyle;
  if (dietStyle === "omnivore") dietStyle = "всеядный";
  if (dietStyle === "vegetarian") dietStyle = "вегетарианский";
  if (dietStyle === "vegan") dietStyle = "веганский";
  
  const budget = mapBudgetLevel(data.budget);
  const sleep = data.sleep || "не указано";
  const stress = data.stress || "не указан";

  const lastPlansInfo = lastWeeks.length > 0 
    ? `\n\nПредыдущие планы (не повторяй эти блюда):\n${lastWeeks.map((w, i) => 
        `${i+1}. Неделя ${w.week_start_date}: ${w.goal_kcal} ккал, ${w.diet_style}`
      ).join("\n")}`
    : "";

  const cultural = ruCulturalGuidelines();
  const weekDays = buildWeekWindow(weekStartISO);
  const daysText = weekDays
    .map(
      (day, idx) =>
        `${idx + 1}) ${day.label} (${day.iso}, московское время)`
    )
    .join("\n");

  return `Ты — профессиональный спортивный нутрициолог с 15+ годами практики и доступом к полным базам данных USDA и FatSecret.

Составь персональный план питания на 3 дня для этого клиента.

Работаем в часовом поясе Europe/Moscow. Неделя начинается ${weekDays[0].label}. План должен охватывать строго следующие три последовательных дня (используй эти ISO-даты в поле day_date):
${daysText}

═══════════════════════════════════════════════════════════
ДАННЫЕ КЛИЕНТА
═══════════════════════════════════════════════════════════
Пол: ${gender}
Возраст: ${age} лет
Вес: ${weight} кг
Рост: ${height} см
Активность: ${activityLevel}
Сон: ${sleep}
Уровень стресса: ${stress}

Цель: ${goal}
Стиль питания: ${dietStyle}
Бюджет: ${budget}
Не ест: ${dislikes}
Аллергии: ${allergies}
Медицинские ограничения: ${health}
${lastPlansInfo}

Целевые показатели (рассчитаны под эту цель):
- Калории в день: ${targets.dailyKcal} ккал
- Белки: ${targets.proteinG} г
- Жиры: ${targets.fatG} г
- Углеводы: ${targets.carbsG} г
- Базовое количество приёмов пищи: ${targets.mealsPerDay}

═══════════════════════════════════════════════════════════
КРИТИЧЕСКИ ВАЖНО: РАЗДЕЛЬНЫЕ ИНГРЕДИЕНТЫ
═══════════════════════════════════════════════════════════

❌ НИКОГДА НЕ ДЕЛАЙ ТАК (комбо-блюда):
{
  "food": "Гречка с куриной грудкой",
  "qty": 350,
  "unit": "г",
  "kcal": 550
}

✅ ВСЕГДА ДЕЛАЙ ТАК (раздельно):
{
  "food": "Гречка готовая",
  "qty": 200,
  "unit": "г",
  "kcal": 220,
  "protein_g": 8,
  "fat_g": 2,
  "carbs_g": 45,
  "prep": "варка"
},
{
  "food": "Куриная грудка вареная",
  "qty": 150,
  "unit": "г",
  "kcal": 247,
  "protein_g": 47,
  "fat_g": 3,
  "carbs_g": 0,
  "prep": "варка"
}

КАЖДЫЙ ИНГРЕДИЕНТ = ОТДЕЛЬНЫЙ ITEM!

═══════════════════════════════════════════════════════════
БАЗА ДАННЫХ КБЖУ (ГОТОВЫЕ ПРОДУКТЫ)
═══════════════════════════════════════════════════════════

Используй ТОЛЬКО эти реальные значения из USDA/FatSecret:

**БЕЛКОВЫЕ:**
- Яйцо вареное: 78 ккал/шт, 6г белка, 5г жира
- Куриная грудка вареная: 165 ккал/100г, 31г белка, 4г жира
- Треска запеченная: 105 ккал/100г, 23г белка, 1г жира
- Индейка тушеная: 140 ккал/100г, 24г белка, 4г жира
- Говядина тушеная: 180 ккал/100г, 26г белка, 8г жира

**ГАРНИРЫ (ГОТОВЫЕ):**
- Гречка вареная: 110 ккал/100г, 4г белка, 2г жира, 22г углеводов
- Рис вареный: 130 ккал/100г, 3г белка, 0г жира, 28г углеводов
- Овсянка на воде: 68 ккал/100г, 2г белка, 1г жира, 12г углеводов
- Картофель печеный: 93 ккал/100г, 2г белка, 0г жира, 21г углеводов
- Паста вареная: 131 ккал/100г, 5г белка, 1г жира, 25г углеводов

**МОЛОЧНОЕ:**
- Творог 5%: 121 ккал/100г, 16г белка, 5г жира, 2г углеводов
- Йогурт греческий: 59 ккал/100г, 10г белка, 0г жира, 4г углеводов
- Кефир 1%: 40 ккал/100мл, 3г белка, 1г жира, 4г углеводов

**ОВОЩИ:**
- Огурцы/помидоры: 15-20 ккал/100г
- Капуста/брокколи вареные: 35 ккал/100г
- Свекла вареная: 44 ккал/100г

**ПРОЧЕЕ:**
- Хлеб цельнозерновой: 240 ккал/100г (НЕ 400!)
- Орехи грецкие: 654 ккал/100г
- Масло растительное: 900 ккал/100г
- Банан: 96 ккал/шт (средний)

═══════════════════════════════════════════════════════════
ТРЕБОВАНИЯ К ПЛАНУ
═══════════════════════════════════════════════════════════

1. ПЕРСОНАЛИЗАЦИЯ
   Учитывай все данные клиента: возраст, вес, цель, бюджет, стиль питания.

2. СТРУКТУРА ДНЯ (3-5 приёмов)
   
   Определи оптимальное количество приёмов (3-5) исходя из:
   - Калорийность < 1600: обычно 3 приёма
   - Калорийность 1600-2500: 3-4 приёма (можно добавить 1 перекус)
   - Калорийность > 2500: 4-5 приёмов (можно 2 перекуса)
   
   ОБЯЗАТЕЛЬНЫЕ приёмы:
   - Завтрак (08:00)
   - Обед (13:00)
   - Ужин (19:00)
   
   ОПЦИОНАЛЬНЫЕ перекусы (добавляй по необходимости):
   - Перекус 1 (11:00) - между завтраком и обедом
   - Перекус 2 (16:00) - между обедом и ужином
   
   Перекус = 150-300 ккал, простой (фрукт + орехи, йогурт, творог)

3. РЕАЛИСТИЧНОСТЬ
   - Каждый ингредиент отдельно в items[]
   - Базовые способы готовки (варка, жарка, запекание)
   - Продукты доступны в обычном супермаркете

4. ГИБКОСТЬ КАЛОРИЙНОСТИ
   
   Не делай одинаковые приёмы пищи по калориям каждый день.
   Варьируй распределение калорий между приёмами.
   
   ОРИЕНТИРЫ для распределения (не строго):
   - Завтрак: ~${Math.round(targets.dailyKcal * 0.25)} ккал
   - Обед: ~${Math.round(targets.dailyKcal * 0.35)} ккал  
   - Ужин: ~${Math.round(targets.dailyKcal * 0.30)} ккал
   - Перекусы (если есть): по 150-250 ккал
   
   Главное: СУММА за ДЕНЬ = ${targets.dailyKcal} ± 100 ккал

5. ТОЧНОСТЬ КБЖУ
   
   Используй ТОЛЬКО данные из базы выше для ГОТОВЫХ продуктов.
   
   В каждом основном приёме (завтрак, обед, ужин) должно быть 25-45г белка.

6. РАЗНООБРАЗИЕ
   - Не повторяй точные блюда из предыдущих планов
   - Варьируй гарниры и овощи

${cultural}

═══════════════════════════════════════════════════════════
ФОРМАТ ОТВЕТА
═══════════════════════════════════════════════════════════

Ответь ТОЛЬКО валидным JSON без markdown блоков:

{
  "week": {
    "name": "План питания на 3 дня",
    "notes": "1-2 практичных совета",
    "goal": {
      "kcal": ${targets.dailyKcal},
      "protein_g": ${targets.proteinG},
      "fat_g": ${targets.fatG},
      "carbs_g": ${targets.carbsG},
      "meals_per_day": ${targets.mealsPerDay},
      "diet_style": "${dietStyle}",
      "budget": "${budget}"
    },
    "days": [
      {
        "date": "2025-01-13",
        "title": "Пн",
        "meals": [
          {
            "title": "Завтрак",
            "time": "08:00",
            "items": [
              {
                "food": "Овсянка готовая на воде",
                "qty": 250,
                "unit": "г",
                "kcal": 170,
                "protein_g": 5,
                "fat_g": 3,
                "carbs_g": 30,
                "prep": "варка"
              },
              {
                "food": "Банан",
                "qty": 1,
                "unit": "шт",
                "kcal": 96,
                "protein_g": 1,
                "fat_g": 0,
                "carbs_g": 23
              },
              {
                "food": "Яйцо вареное",
                "qty": 2,
                "unit": "шт",
                "kcal": 156,
                "protein_g": 12,
                "fat_g": 10,
                "carbs_g": 1,
                "prep": "варка"
              }
            ]
          }
        ]
      }
    ]
  }
}

═══════════════════════════════════════════════════════════
⚠️  ФИНАЛЬНАЯ ПРОВЕРКА (ОБЯЗАТЕЛЬНО!) ⚠️
═══════════════════════════════════════════════════════════

Перед отправкой ПРОВЕРЬ:

1. МАТЕМАТИКА:
   Посчитай сумму всех items.kcal за каждый день.
   Сумма ДОЛЖНА быть ${targets.dailyKcal} ± 100 ккал.

2. РАЗДЕЛЬНОСТЬ:
   Каждый ингредиент = отдельный item!
   Нет комбо типа "курица с рисом"!

3. СООТВЕТСТВИЕ БАЗЕ:
   Все КБЖУ взяты из базы данных выше!
   Яйцо = 78 ккал, не 100!
   Хлеб = 240 ккал/100г, не 400!

✓ Создано ровно 3 дня
✓ В каждом дне 3-5 приёмов
✓ Каждый ингредиент - отдельный item
✓ Сумма калорий = ${targets.dailyKcal} ± 100 ккал
✓ КБЖУ из базы данных USDA/FatSecret
✓ JSON валидный без markdown

НАЧИНАЙ ГЕНЕРАЦИЮ!`;
}

// ----------------------------------------------------------------------------
// ROUTE: сгенерировать 3-дневный план и сохранить
// ----------------------------------------------------------------------------
nutrition.post(
  "/generate-week",
  asyncHandler(async (req: Request, res: Response) => {
    
    const start = Date.now();
    console.log(`[NUTRITION] ▶️ start generation at ${new Date().toISOString()}`);

    const userId = await getUserId(req as any);
    const onboarding = await getOnboarding(userId);
    const weekStart = currentMoscowDateISO();
    const force = Boolean(req.body?.force);
    let existing = await loadWeekPlan(userId, weekStart);

    if (existing?.status === "ready" && !force) {
      console.log(`[NUTRITION] ⚡ cached plan returned in ${Date.now() - start}ms`);
      return res.json({
        plan: existing.plan,
        meta: {
          status: existing.status,
          planId: existing.planId,
          cached: true,
        },
      });
    }

    if (existing?.status === "processing" && !force) {
      console.log(`[NUTRITION] ⏳ plan already processing, returning status`);
      const skeleton = buildSkeletonWeek(weekStart, calculateNutritionTargets(onboarding));
      return res.json({
        plan: skeleton.week,
        meta: {
          status: "processing",
          planId: existing.planId,
          cached: false,
        },
      });
    }

    if (existing?.planId) {
      await deletePlanById(existing.planId);
      existing = null;
    }

    const targets = calculateNutritionTargets(onboarding);
    const skeleton = buildSkeletonWeek(weekStart, targets);
    const planId = await insertSkeletonPlan(userId, weekStart, skeleton, targets, onboarding);

    console.log(`[NUTRITION] planId=${planId} weekStart=${weekStart}, starting async generation`);

    queueDetailedPlanGeneration({
      planId,
      userId,
      weekStart,
      onboarding,
      targets,
    });

    console.log(`[NUTRITION] ⚡ returned skeleton in ${Date.now() - start}ms`);

    return res.json({
      plan: skeleton.week,
      meta: {
        status: "processing",
        planId: planId,
        created: true,
      },
    });
  })
);

// ----------------------------------------------------------------------------
// ROUTE: получить текущий план без генерации
// ----------------------------------------------------------------------------
nutrition.get(
  "/current-week",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const weekStart = currentMoscowDateISO();
    const data = await loadWeekPlan(userId, weekStart);
    if (!data) return res.status(404).json({ error: "План на этот период не найден" });
    res.json({
      plan: data.plan,
      meta: {
        status: data.status,
        planId: data.planId,
        error: data.error,
      },
    });
  })
);

// ----------------------------------------------------------------------------
// ROUTE: проверить статус генерации плана
// ----------------------------------------------------------------------------
nutrition.get(
  "/status/:planId",
  asyncHandler(async (req: Request, res: Response) => {
    const { planId } = req.params;
    
    const head = await q(
      `SELECT id, user_id, name, goal_kcal, protein_g, fat_g, carbs_g, meals_per_day, 
              diet_style, restrictions, notes, week_start_date, status, error_info
       FROM nutrition_plans
       WHERE id = $1
       LIMIT 1`,
      [planId]
    );

    if (!head[0]) {
      return res.status(404).json({ error: "План не найден" });
    }

    const plan = head[0];
    const status = plan.status as PlanStatus;

    if (status === "processing") {
      return res.json({
        status: "processing",
        planId: plan.id,
        error: null,
      });
    }

    const userId = plan.user_id;
    const weekStart = plan.week_start_date;
    const data = await loadWeekPlan(userId, weekStart);

    if (!data) {
      return res.status(404).json({ error: "План не найден" });
    }

    return res.json({
      plan: data.plan,
      status: data.status,
      planId: data.planId,
      error: data.error,
    });
  })
);

// ----------------------------------------------------------------------------
/* ROUTE: пересчитать целевые показатели (для тестирования) */
// ----------------------------------------------------------------------------
nutrition.get(
  "/calculate-targets",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const onboarding = await getOnboarding(userId);
    const targets = calculateNutritionTargets(onboarding);
    const extracted = extractOnboardingData(onboarding);
    res.json({ targets, extracted, rawOnboarding: onboarding });
  })
);

nutrition.get("/ping", (_req, res) => res.json({ ok: true, scope: "nutrition-3days-pro" }));

// ============================================================================
// NUTRITION QA LAYER
// ============================================================================
type Macro = { kcal: number; protein_g: number; fat_g: number; carbs_g: number };
type MealItem = {
  food: string; qty: number; unit: string;
  kcal?: number; protein_g?: number; fat_g?: number; carbs_g?: number;
  prep?: string; notes?: string;
};

const KCAL_PER_G = { p: 4, c: 4, f: 9 };

function appendNote(prev: string | undefined, add: string): string {
  if (!prev) return add;
  if (prev.includes(add)) return prev;
  return `${prev} ${add}`.trim();
}

// ============================================================================
// НОВОЕ: clampKcalDensity - защита от завышенных калорий
// ============================================================================
function clampKcalDensity(it: MealItem): MealItem {
  const qty = Number(it.qty || 0);
  if (!qty || qty <= 0) return it;

  const unit = (it.unit || "").toLowerCase();
  const name = (it.food || "").toLowerCase();

  // Яйца - особый случай (штуки)
  if (/(яйц|egg)/i.test(name) && unit === "шт") {
    const maxKcal = qty * 78;
    if (it.kcal && it.kcal > maxKcal) {
      return {
        ...it,
        kcal: maxKcal,
        protein_g: Math.round(qty * 6),
        fat_g: Math.round(qty * 5),
        carbs_g: Math.round(qty * 0.6),
        notes: appendNote(it.notes, "Яйцо = 78 ккал/шт"),
      };
    }
    return it;
  }

  // Только граммы дальше
  if (unit !== "г") return it;

  let maxPerG = 4.5; // дефолт

  // Низкокалорийная рыба
  if (/(треск|минтай|хек|судак|путассу|pollock|cod)/i.test(name)) {
    maxPerG = 1.2;
  }
  // Другая рыба
  else if (/(рыб|лосос|семг|тунец|горбуш)/i.test(name)) {
    maxPerG = 2.0;
  }
  // Курица/индейка
  else if (/(курин|индейк|филе)/i.test(name)) {
    maxPerG = 1.8;
  }
  // Говядина
  else if (/(говядин|телятин|beef)/i.test(name)) {
    maxPerG = 2.2;
  }
  // Овощи
  else if (/(овощ|огурц|помидор|томат|капуст|брокк|цветн|кабачк|морков|салат|зелень)/i.test(name)) {
    maxPerG = 0.6;
  }
  // Крупы готовые
  else if (/(рис|гречк|перлов|пшён|булгур|круп|готов)/i.test(name)) {
    maxPerG = 1.4;
  }
  // Паста/макароны готовые
  else if (/(макарон|паста|спагет|вермишел)/i.test(name)) {
    maxPerG = 1.4;
  }
  // Картофель
  else if (/(картоф|картошк)/i.test(name)) {
    maxPerG = 1.0;
  }
  // Хлеб
  else if (/(хлеб|батон|тост|булк|лаваш)/i.test(name)) {
    maxPerG = 2.6;
  }
  // Творог
  else if (/(творог)/i.test(name)) {
    maxPerG = 1.3;
  }
  // Йогурт/кефир
  else if (/(йогурт|кефир)/i.test(name)) {
    maxPerG = 0.8;
  }
  // Орехи
  else if (/(орех|миндаль|фундук|кешью|арахис|семечк)/i.test(name)) {
    maxPerG = 7.0;
  }
  // Масло
  else if (/(масло|oil|олив)/i.test(name)) {
    maxPerG = 9.0;
  }

  if (it.kcal == null) return it;

  const maxKcal = qty * maxPerG;
  if (it.kcal <= maxKcal) return it;

  const factor = maxKcal / it.kcal;

  return {
    ...it,
    kcal: Math.round(maxKcal),
    protein_g: it.protein_g != null ? Math.round(it.protein_g * factor) : it.protein_g,
    fat_g: it.fat_g != null ? Math.round(it.fat_g * factor) : it.fat_g,
    carbs_g: it.carbs_g != null ? Math.round(it.carbs_g * factor) : it.carbs_g,
    notes: appendNote(it.notes, `Скорректирована плотность (макс ${maxPerG.toFixed(1)} ккал/г)`),
  };
}

// ============================================================================
// Остальные QA функции
// ============================================================================
function normalizeCookedWeight(it: MealItem): MealItem {
  const name = (it.food || "").toLowerCase();
  const isGram = (it.unit || "").toLowerCase() === "г";
  if (!isGram) return it;

  if (/(гречк|рис|овсян|паст|макарон)/.test(name) && /(сух|сухая|сухие|dry)/.test(name)) {
    const cookedQty = Math.round((it.qty || 0) * 3.0);
    return {
      ...it,
      qty: cookedQty,
      food: it.food.replace(/(сух(ая|ие)?|dry)/gi, "готовая"),
      notes: appendNote(it.notes, "Пересчёт с сухого веса в готовый (~×3)."),
    };
  }

  return it;
}

function calibrateJuice(it: MealItem): MealItem {
  const name = (it.food || "").toLowerCase();
  const isMl = (it.unit || "").toLowerCase() === "мл";
  if (/(сок|juice)/i.test(name) && isMl) {
    const targetPerMl = 0.45;
    const want = Math.round((it.qty || 0) * targetPerMl);
    if (it.kcal == null || it.kcal < want) {
      return {
        ...it,
        kcal: want,
        protein_g: it.protein_g ?? 0,
        fat_g: it.fat_g ?? 0,
        carbs_g: it.carbs_g ?? Math.round(want / 4),
        notes: appendNote(it.notes, "Калорийность скорректирована для 100% сока (~0.45 ккал/мл)."),
      };
    }
  }
  return it;
}

function calibrateNuts(it: MealItem): MealItem {
  const name = (it.food || "").toLowerCase();
  const isGram = (it.unit || "").toLowerCase() === "г";
  if (/(орех|миндаль|фундук|грецк|кешью|арахис|семечк)/i.test(name) && isGram) {
    const perG = (it.kcal ?? 0) / Math.max(1, it.qty || 1);
    if (perG < 5.5) {
      const kcal = Math.round((it.qty || 0) * 6.0);
      return {
        ...it,
        kcal,
        protein_g: it.protein_g ?? Math.round((it.qty || 0) * 0.15),
        fat_g: it.fat_g ?? Math.round((it.qty || 0) * 0.55),
        carbs_g: it.carbs_g ?? Math.round((it.qty || 0) * 0.12),
        notes: appendNote(it.notes, "Калории орехов нормализованы (~600 ккал/100 г)."),
      };
    }
  }
  return it;
}

function calibrateDriedFruit(it: MealItem): MealItem {
  const name = (it.food || "").toLowerCase();
  const isGram = (it.unit || "").toLowerCase() === "г";
  if (/(кураг|изюм|финик|чернослив|сухофрукт)/i.test(name) && isGram) {
    const perG = (it.kcal ?? 0) / Math.max(1, it.qty || 1);
    if (perG < 4.0) {
      const kcal = Math.round((it.qty || 0) * 4.8);
      return {
        ...it,
        kcal,
        protein_g: it.protein_g ?? Math.round((it.qty || 0) * 0.03),
        fat_g: it.fat_g ?? 0,
        carbs_g: it.carbs_g ?? Math.round((it.qty || 0) * 1.15),
        notes: appendNote(it.notes, "Калории сухофруктов нормализованы (~480 ккал/100 г)."),
      };
    }
  }
  return it;
}

function calibrateVegSteam(it: MealItem): MealItem {
  const name = (it.food || "").toLowerCase();
  const isGram = (it.unit || "").toLowerCase() === "г";
  
  if (isGram && (/(брокк|овощ|капуст|кабачк|цветн|морков)/i.test(name)) && 
      (/(пар|steam|вар|отвар)/i.test(it.prep || "") || /(вар|отвар)/i.test(name))) {
    const per100 = ((it.kcal ?? 0) / Math.max(1, it.qty || 1)) * 100;
    if (per100 > 60 || per100 === 0) {
      const kcal = Math.round((it.qty || 0) * 0.35);
      return {
        ...it,
        kcal,
        protein_g: it.protein_g ?? Math.round((it.qty || 0) * 0.028),
        fat_g: it.fat_g ?? 0,
        carbs_g: it.carbs_g ?? Math.round((it.qty || 0) * 0.07),
        notes: appendNote(it.notes, "Скорректирована калорийность овощей (≈35 ккал/100 г)."),
      };
    }
  }
  return it;
}

function fillMissingKcals(it: MealItem): MealItem {
  let { kcal, protein_g, fat_g, carbs_g } = it;
  if (kcal == null && (protein_g != null || fat_g != null || carbs_g != null)) {
    const p = Number(protein_g || 0);
    const f = Number(fat_g || 0);
    const c = Number(carbs_g || 0);
    kcal = Math.round(p * KCAL_PER_G.p + f * KCAL_PER_G.f + c * KCAL_PER_G.c);
  }
  if (kcal != null && (protein_g == null && fat_g == null && carbs_g == null)) {
    const p = Math.round((kcal * 0.20) / KCAL_PER_G.p);
    const f = Math.round((kcal * 0.25) / KCAL_PER_G.f);
    const c = Math.round((kcal - p * KCAL_PER_G.p - f * KCAL_PER_G.f) / KCAL_PER_G.c);
    protein_g = p; fat_g = f; carbs_g = c;
  }
  return { ...it, kcal: kcal ?? 0, protein_g: protein_g ?? 0, fat_g: fat_g ?? 0, carbs_g: carbs_g ?? 0 };
}

function assumePorridgeBase(it: MealItem, mealTitle?: string): MealItem {
  const isPorridge = /(каша|овсян|пшён|ячмен|манн)/i.test(it.food || "");
  const saysWater = /(на воде)/i.test(it.food || "") || /(на воде)/i.test(it.prep || "");
  const saysMilk = /(на молоке)/i.test(it.food || "") || /(на молоке)/i.test(it.prep || "");
  const isBreakfast = /(завтрак)/i.test(mealTitle || "");
  if (isPorridge && !saysWater && !saysMilk && isBreakfast) {
    const add = Math.round(Math.min(90, Math.max(60, (it.qty || 250) / 3)));
    return {
      ...it,
      kcal: (it.kcal || 0) + add,
      notes: appendNote(it.notes, "Основа по умолчанию: молоко 2.5% (+)"),
    };
  }
  return it;
}

function adjustCommonBiases(it: MealItem, mealTitle?: string): MealItem {
  return calibrateVegSteam(
    calibrateDriedFruit(
      calibrateNuts(
        calibrateJuice(
          assumePorridgeBase(it, mealTitle)
        )
      )
    )
  );
}

function sumItems(items: MealItem[]): Macro {
  return items.reduce<Macro>((acc, it) => ({
    kcal: acc.kcal + (it.kcal ?? 0),
    protein_g: acc.protein_g + (it.protein_g ?? 0),
    fat_g: acc.fat_g + (it.fat_g ?? 0),
    carbs_g: acc.carbs_g + (it.carbs_g ?? 0),
  }), { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
}

const ADJUSTABLE_PATTERNS = [
  /(каша|овсян|гречк|рис|перлов|булгур|паста|макарон|картоф|хлеб)/i,
  /(йогурт|творог|сыр)/i,
  /(масло|олив|сливоч|арахисов|тахин)/i,
  /(банан|сухофрукт|мюсли|гранол)/i,
];

function isAdjustable(it: MealItem): boolean {
  const name = (it.food || "");
  return ADJUSTABLE_PATTERNS.some((re) => re.test(name));
}

function scaleItem(it: MealItem, factor: number): MealItem {
  const qty = Math.max(1, Math.round((it.qty || 0) * factor));
  const scale = (v?: number) => v != null ? Math.round(v * factor) : v;
  return {
    ...it,
    qty,
    kcal: scale(it.kcal),
    protein_g: scale(it.protein_g),
    fat_g: scale(it.fat_g),
    carbs_g: scale(it.carbs_g),
    notes: appendNote(it.notes, `Автокоррекция порции ×${factor.toFixed(2)}.`),
  };
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function needsOilHint(mealTitle: string | undefined, items: MealItem[]): boolean {
  const t = (mealTitle || "").toLowerCase();
  const hasOil = items.some(i => /масло/i.test(i.food || ""));
  const cookedByOil =
    /(жарк|запек|туш)/i.test(t) ||
    items.some(i => /(жарк|запек|туш)/i.test(i.prep || ""));
  const salad =
    /салат/i.test(t) ||
    items.some(i => /салат/i.test(i.food || ""));
  return !hasOil && (cookedByOil || salad);
}

function addOilItem(items: MealItem[], grams = 10): MealItem[] {
  return [
    ...items,
    {
      food: "Масло растительное",
      qty: grams,
      unit: "г",
      kcal: Math.round(grams * 9),
      protein_g: 0,
      fat_g: grams,
      carbs_g: 0,
      prep: "добавление",
      notes: "Учтено в КБЖУ",
    },
  ];
}

const RE_STARCH = /(гречк|рис|перлов|пшён|булгур|круп|паста|макарон|картоф|кус-кус)/i;
const RE_BREAD = /(хлеб|батон|тост)/i;

function removeBreadIfStarch(items: MealItem[]): MealItem[] {
  const hasStarch = items.some(i => RE_STARCH.test(i.food || ""));
  if (!hasStarch) return items;
  return items.filter(i => !RE_BREAD.test(i.food || ""));
}

function ensureMealProteinFloor(items: MealItem[], minProtein = 25): MealItem[] {
  const totals = sumItems(items);
  if (totals.protein_g >= minProtein) return items;

  const candidates = items.filter(i =>
    /(курин|индейк|говядин|рыб|яйц|творог|йогурт|сыр|протеин)/i.test(i.food || "")
  );
  if (!candidates.length) return items;

  const first = candidates[0];
  const need = clamp(minProtein - totals.protein_g, 6, 20);
  const per100 = first.protein_g ? (first.protein_g / Math.max(1, first.qty)) * 100 : 12;
  const factor = 1 + need / Math.max(8, per100);

  return items.map(x => x === first ? scaleItem(x, factor) : x);
}

const SPLITS: Record<number, number[]> = {
  3: [0.28, 0.36, 0.36],
  4: [0.25, 0.10, 0.35, 0.30],
  5: [0.23, 0.10, 0.32, 0.10, 0.25],
};

function adaptSplit(base: number[], dailyKcal: number): number[] {
  const s = [...base];
  if (dailyKcal >= 2800) {
    const take = 0.02;
    if (s[0] != null) s[0] = Math.max(0.18, s[0] - take);
    const last = s.length - 1;
    const mid = Math.floor(last / 2);
    s[mid] += take; s[last] += take;
    const sum = s.reduce((a, x) => a + x, 0);
    return s.map(x => x / sum);
  }
  if (dailyKcal <= 1700) {
    const add = 0.02;
    if (s[0] != null) s[0] += add;
    const last = s.length - 1;
    s[last] = Math.max(0.18, s[last] - add);
    const sum = s.reduce((a, x) => a + x, 0);
    return s.map(x => x / sum);
  }
  return s;
}

function splitMacrosPerMeal(mealsCount: number, totals: {kcal:number; p:number; f:number; c:number}) {
  const base = SPLITS[mealsCount] ?? SPLITS[4];
  const sum = base.reduce((a, x) => a + x, 0) || 1;
  const norm = base.map(x => x / sum);

  const proteinBias = norm.map((w, i, arr) => {
    const isSnack = (arr.length === 5 && (i === 1 || i === 3)) || (arr.length === 4 && i === 1);
    return isSnack ? w * 0.6 : w * 1.15;
  });
  const pbSum = proteinBias.reduce((a, x) => a + x, 0) || 1;
  const pW = proteinBias.map(x => x / pbSum);

  const fatBias = norm.map((w, i, arr) => {
    const last = arr.length - 1;
    const isDinner = i === last;
    const isLunch = i === Math.floor(last / 2);
    return w * (isDinner ? 1.2 : isLunch ? 1.15 : 0.9);
  });
  const fbSum = fatBias.reduce((a, x) => a + x, 0) || 1;
  const fW = fatBias.map(x => x / fbSum);

  const carbBias = norm.map((w, i, arr) => {
    const last = arr.length - 1;
    const isBreakfast = i === 0;
    const isLunch = i === Math.floor(last / 2);
    return w * (isBreakfast || isLunch ? 1.08 : 0.96);
  });
  const cbSum = carbBias.reduce((a, x) => a + x, 0) || 1;
  const cW = carbBias.map(x => x / cbSum);

  const kcalT = norm.map(w => Math.round(totals.kcal * w));
  const pT    = pW.map(w   => Math.round(totals.p    * w));
  const fT    = fW.map(w   => Math.round(totals.f    * w));
  const cT    = cW.map(w   => Math.round(totals.c    * w));

  const ensureProteinFloor = (arr: number[]) => {
    const mainIdx: number[] = [];
    if (arr.length >= 3) {
      mainIdx.push(0, Math.floor((arr.length - 1) / 2), arr.length - 1);
    }
    for (const i of mainIdx) {
      if (arr[i] < 25) {
        let need = 25 - arr[i];
        for (let j = 0; j < arr.length && need > 0; j++) {
          if (j === i) continue;
          const isSnack = (arr.length === 5 && (j === 1 || j === 3)) || (arr.length === 4 && j === 1);
          if (isSnack && arr[j] > 8) {
            const take = Math.min(need, Math.floor((arr[j] - 8) / 2));
            arr[j] -= take;
            arr[i] += take;
            need -= take;
          }
        }
      }
    }
    return arr;
  };

  return {
    kcal: kcalT,
    protein: ensureProteinFloor(pT),
    fat: fT,
    carbs: cT,
  };
}

function assignMealTargets(
  meals: { title?: string; target_kcal?: number; target_protein_g?: number; target_fat_g?: number; target_carbs_g?: number }[],
  totals: {kcal:number; p:number; f:number; c:number}
) {
  const n = Math.max(3, Math.min(5, meals.length || 3));
  const base = SPLITS[n] ?? SPLITS[4];
  const split = adaptSplit(base.slice(0, n), totals.kcal);
  const macro = splitMacrosPerMeal(n, totals);

  return meals.map((m, i) => {
    const hasAll =
      typeof m.target_kcal === "number" &&
      typeof m.target_protein_g === "number" &&
      typeof m.target_fat_g === "number" &&
      typeof m.target_carbs_g === "number";

    if (hasAll) return m;

    return {
      ...m,
      target_kcal: Math.max(120, macro.kcal[i] ?? Math.round(totals.kcal * (split[i] ?? 1 / n))),
      target_protein_g: Math.max(10, macro.protein[i] ?? Math.round(totals.p * (split[i] ?? 1 / n))),
      target_fat_g: Math.max(5, macro.fat[i] ?? Math.round(totals.f * (split[i] ?? 1 / n))),
      target_carbs_g: Math.max(10, macro.carbs[i] ?? Math.round(totals.c * (split[i] ?? 1 / n))),
    };
  });
}

function correctMealToTarget(meal: { items: MealItem[]; target_kcal?: number; title?: string }): { items: MealItem[]; target_kcal?: number } {
  const TARGET = typeof meal.target_kcal === "number" ? meal.target_kcal : undefined;
  
  // 🔥 НОВЫЙ ПАЙПЛАЙН с clampKcalDensity
  let items = meal.items
    .map(normalizeCookedWeight)
    .map((it) => adjustCommonBiases(it, meal.title))
    .map(fillMissingKcals)
    .map(clampKcalDensity);  // ← ДОБАВЛЕНО!

  if (needsOilHint(meal.title, items)) {
    items = addOilItem(items, /салат/i.test(meal.title || "") ? 10 : 10);
  }

  items = removeBreadIfStarch(items);

  if (/(завтрак|обед|ужин)/i.test(meal.title || "")) {
    items = ensureMealProteinFloor(items, 25);
  }

  if (!TARGET) return { ...meal, items };

  const CORRIDOR = 60;
  let total = sumItems(items).kcal;
  let diff = TARGET - total;

  let guard = 0;
  while (Math.abs(diff) > CORRIDOR && guard++ < 6) {
    const adjustable = items.filter(isAdjustable);
    if (!adjustable.length) break;
    const factor = diff > 0 ? 1.12 : 0.90;
    for (const it of adjustable.slice(0, 2)) {
      const scaled = scaleItem(it, factor);
      items = items.map(x => x === it ? scaled : x);
    }
    total = sumItems(items).kcal;
    diff = TARGET - total;
  }
  
  total = sumItems(items).kcal;
  diff = TARGET - total;
  
  if (diff > 60) {
    const isMainMeal = /(завтрак|обед|ужин)/i.test(meal.title || "");
    const isBreakfast = /(завтрак)/i.test(meal.title || "");
    
    if (isMainMeal) {
      let booster: MealItem;
      
      if (isBreakfast) {
        booster = {
          food: "Банан",
          qty: 1,
          unit: "шт",
          kcal: Math.min(120, diff),
          protein_g: 1,
          fat_g: 0,
          carbs_g: 27,
          notes: "Добавлено для баланса калорий",
        };
      } else {
        const needKcal = Math.min(200, diff);
        booster = {
          food: "Хлеб цельнозерновой",
          qty: Math.round(needKcal / 2.2),
          unit: "г",
          kcal: needKcal,
          protein_g: Math.round(needKcal / 18),
          fat_g: Math.round(needKcal / 50),
          carbs_g: Math.round(needKcal / 5),
          notes: "Добавлено для баланса",
        };
      }
      
      items = [...items, booster];
    }
  }
  
  return { ...meal, items };
}

function correctDay(
  meals: { items: MealItem[]; title?: string; target_kcal?: number }[],
  targetKcal: number,
  minProtein: number
): { items: MealItem[]; title?: string; target_kcal?: number }[] {
  
  meals = meals.map(m => correctMealToTarget(m));

  const totalsPre = sumItems(meals.flatMap(m => m.items));
  if (totalsPre.protein_g < minProtein) {
    const proteinCandidates = meals.flatMap(m => m.items)
      .filter(it => /(курин|индейк|творог|йогурт|рыб|яйц|сыр|протеин)/i.test(it.food));
    if (proteinCandidates.length) {
      const need = clamp(minProtein - totalsPre.protein_g, 10, 40);
      const cand = proteinCandidates[0];
      const per100 = cand.protein_g ? (cand.protein_g / Math.max(1, cand.qty)) * 100 : 12;
      const factor = 1 + need / Math.max(8, per100);
      meals = meals.map(m => ({ ...m, items: m.items.map(x => x === cand ? scaleItem(x, factor) : x) }));
    }
  }

  let totals = sumItems(meals.flatMap(m => m.items));
  let diff = targetKcal - totals.kcal;
  
  if (diff > 100) {
    const adjustable = meals.flatMap(m => m.items).filter(isAdjustable);
    if (adjustable.length > 0) {
      const factor = 1.08;
      for (const it of adjustable.slice(0, 2)) {
        const scaled = scaleItem(it, factor);
        meals = meals.map(m => ({ ...m, items: m.items.map(x => x === it ? scaled : x) }));
      }
    }
  }

  return meals;
}

function fixPlanToTargets(ai: WeekPlanAI, targets: NutritionTarget): WeekPlanAI {
  const perDayTarget = targets.dailyKcal;
  const minProtein = Math.round(targets.proteinG * 0.9);

  const fixedDays = ai.week.days.map(d => {
    const meals = Array.isArray(d.meals) ? d.meals : [];

    const withTargets = assignMealTargets(
      meals.map(m => ({
        title: m.title,
        target_kcal: m.target_kcal,
        target_protein_g: m.target_protein_g,
        target_fat_g: m.target_fat_g,
        target_carbs_g: m.target_carbs_g,
        items: m.items as any,
      })),
      { kcal: perDayTarget, p: targets.proteinG, f: targets.fatG, c: targets.carbsG }
    ) as typeof meals;

    const corrected = correctDay(withTargets as any, perDayTarget, minProtein);

    return { ...d, meals: corrected as any };
  });

  return {
    week: {
      ...ai.week,
      goal: {
        ...ai.week.goal,
        kcal: perDayTarget,
        protein_g: targets.proteinG,
        fat_g: targets.fatG,
        carbs_g: targets.carbsG,
        meals_per_day: targets.mealsPerDay,
      },
      days: fixedDays,
    },
  };
}

export default nutrition;

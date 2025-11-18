// api/src/nutrition.ts
// ============================================================================
// AI-FIRST NUTRITION COACH — реалистичный план питания на 3 дня
// Работает как настоящий нутрициолог: гибкие приёмы, точные КБЖУ, meal prep
// ============================================================================
import { Router, Response, Request } from "express";
import OpenAI from "openai";
import crypto from "crypto";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { config } from "./config.js";
import { ensureSubscription } from "./subscription.js";

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

type PlanStatus = "processing" | "ready" | "failed" | "archived";

const MOSCOW_TZ = "Europe/Moscow";
const WEEKLY_NUTRITION_LIMIT = 3;

function resolveTimezone(req: any): string {
  const candidate =
    (req?.headers?.["x-user-tz"] as string) ||
    (req?.body?.timezone as string) ||
    (req?.query?.tz as string) ||
    MOSCOW_TZ;
  if (typeof candidate === "string" && candidate.trim()) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: candidate });
      return candidate;
    } catch {
      /* ignore invalid */
    }
  }
  return MOSCOW_TZ;
}

function currentDateISO(timeZone = MOSCOW_TZ, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysISO(baseIso: string, offset: number) {
  const base = new Date(`${baseIso}T00:00:00Z`);
  const shifted = new Date(base.getTime() + offset * 86400000);
  return shifted.toISOString().slice(0, 10);
}

function formatLabel(iso: string, timeZone = MOSCOW_TZ) {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  });
}

function buildWeekWindow(startIso: string, timeZone = MOSCOW_TZ) {
  return Array.from({ length: 3 }).map((_, idx) => {
    const iso = addDaysISO(startIso, idx);
    return { iso, label: formatLabel(iso, timeZone) };
  });
}

function makePlanSeed(userId: string, planId: string, iso: string) {
  return crypto.createHash("sha256").update(`${userId}:${planId}:${iso}`).digest("hex").slice(0, 16);
}

const GOAL_DIRECTIVES: Record<string, (weight: number) => string> = {
  muscle_gain: (weight) =>
    `Цель: набор чистой мышечной массы. Суточные калории = TDEE × 1.12. Белок ≈ ${Math.round(
      weight * 2.2
    )} г/день. В каждом приёме минимум 25-35 г белка и умеренные сложные углеводы.`,
  weight_loss: (weight) =>
    `Цель: снижение веса с сохранением мышц. Суточные калории = TDEE × 0.82. Белок ≈ ${Math.round(
      weight * 2.0
    )} г/день. Следи за насыщением, добавляй овощи и избегай быстрых углеводов.`,
  fat_loss: (weight) =>
    `Цель: снижение жировой массы. Придерживайся умеренного дефицита, белок ≈ ${Math.round(
      weight * 2.0
    )} г/день. Больше овощей и клетчатки.`,
  maintain: (weight) =>
    `Цель: поддержание формы. Баланс калорий около TDEE, белок ≈ ${Math.round(weight * 1.8)} г/день.`,
  default: (weight) =>
    `Цель: здоровье и жизненный тонус. Держи белок около ${Math.round(weight * 1.8)} г/день и следи за разнообразием.`,
};

type MacroTotals = { kcal: number; protein: number; fat: number; carbs: number };

function sumItems(items: any[]): MacroTotals {
  return (items || []).reduce(
    (acc, it) => ({
      kcal: acc.kcal + Number(it?.kcal ?? 0),
      protein: acc.protein + Number(it?.protein_g ?? 0),
      fat: acc.fat + Number(it?.fat_g ?? 0),
      carbs: acc.carbs + Number(it?.carbs_g ?? 0),
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const GRAM_UNITS = ["г", "гр", "g", "ml", "мл"];
function isAdjustable(item: any) {
  if (!item) return false;
  const unit = String(item.unit || "").toLowerCase();
  return typeof item.qty === "number" && GRAM_UNITS.some((u) => unit.includes(u));
}

function scaleItem(item: any, factor: number) {
  if (typeof item.qty === "number") {
    const unit = String(item.unit || "").toLowerCase();
    let newQty = item.qty * factor;
    if (unit.includes("ml") || unit.includes("мл")) {
      newQty = Math.round(newQty / 10) * 10;
    } else {
      newQty = Math.round(newQty / 5) * 5;
    }
    item.qty = Math.max(5, newQty);
  }
  ["kcal", "protein_g", "fat_g", "carbs_g"].forEach((key) => {
    if (typeof item[key] === "number") {
      item[key] = Math.round(item[key] * factor * 10) / 10;
    }
  });
}

function enforceMealTargets(days: WeekPlanAI["week"]["days"], targets: NutritionTarget) {
  if (!Array.isArray(days)) return;
  for (const day of days) {
    if (!Array.isArray(day?.meals)) continue;
    for (const meal of day.meals) {
      const targetKcal = Number(meal?.target_kcal ?? 0);
      if (!targetKcal) continue;
      const totals = sumItems(meal.items);
      if (totals.kcal <= 0) continue;
      const diff = targetKcal - totals.kcal;
      if (Math.abs(diff) <= 80) continue;
      const adjustable = (meal.items || []).find((it) => isAdjustable(it));
      if (!adjustable) continue;
      const factor = clamp(targetKcal / Math.max(1, totals.kcal), 0.7, 1.6);
      scaleItem(adjustable, factor);
    }
    const dayTotals = day.meals.reduce(
      (acc, m) => {
        const totals = sumItems(m.items);
        return {
          kcal: acc.kcal + totals.kcal,
          protein: acc.protein + totals.protein,
          fat: acc.fat + totals.fat,
          carbs: acc.carbs + totals.carbs,
        };
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0 }
    );
    const dayTarget = targets.dailyKcal;
    if (!dayTarget) continue;
    const dayDiff = dayTarget - dayTotals.kcal;
    if (Math.abs(dayDiff) <= 120) continue;
    const adjustableMeal = [...day.meals].reverse().find((m) => (m.items || []).some((it) => isAdjustable(it)));
    if (!adjustableMeal) continue;
    const adjustableItem = adjustableMeal.items.find((it) => isAdjustable(it));
    if (!adjustableItem) continue;
    const factor = clamp(dayTarget / Math.max(1, dayTotals.kcal), 0.8, 1.3);
    scaleItem(adjustableItem, factor);
  }
}

function toDbInt(value: any) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function toDbQty(value: any, unitHint?: string) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const unit = (unitHint || "").toLowerCase();
  const isGramLike =
    unit.includes("г") ||
    unit.includes("гр") ||
    unit.includes("g") ||
    unit.includes("ml") ||
    unit.includes("мл");

  if (isGramLike) {
    const rounded = Math.round(num / 5) * 5;
    return Math.max(5, rounded);
  }

  // Для шт./ломтиков оставляем адекватные дроби (0.5) или целые
  const roundedPieces = Math.round(num * 2) / 2;
  return Math.max(0.5, roundedPieces);
}

const DEFAULT_MEALS = [
  { title: "Завтрак", time: "08:00" },
  { title: "Перекус", time: "11:00" },
  { title: "Обед", time: "14:00" },
  { title: "Полдник", time: "17:00" },
  { title: "Ужин", time: "20:00" },
];

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
    const dateIso = addDaysISO(startDateISO, idx);
    return {
      date: dateIso,
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
async function getUserId(req: any) {
  const bodyUserId = req.body?.userId;
  if (bodyUserId) return bodyUserId;
  if (req.user?.uid) return req.user.uid;
  const r = await q(
    `INSERT INTO users (tg_id, first_name, username)
     VALUES (0, 'Dev', 'local')
     ON CONFLICT (tg_id) DO UPDATE SET username = excluded.username
     RETURNING id`
  );
  return r[0].id;
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
       AND status IN ('ready', 'archived')
     ORDER BY week_start_date DESC
     LIMIT $2`,
    [userId, n]
  );
  return rows;
}

async function getRecentMealNames(userId: string, planLimit = 2, itemLimit = 20): Promise<string[]> {
  const rows = await q(
    `
    SELECT DISTINCT ON (LOWER(ni.food_name))
      ni.food_name
    FROM nutrition_items ni
    JOIN nutrition_meals nm ON nm.id = ni.meal_id
    JOIN nutrition_days nd ON nd.id = nm.day_id
    JOIN nutrition_plans np ON np.id = nd.plan_id
    WHERE np.user_id = $1
      AND np.status IN ('ready', 'archived')
    ORDER BY LOWER(ni.food_name), nd.day_date DESC
    LIMIT $2
  `,
    [userId, planLimit * itemLimit]
  );
  return rows.map((r: any) => r.food_name).filter(Boolean);
}

type AsyncPlanArgs = {
  planId: string;
  userId: string;
  weekStart: string;
  onboarding: Onb;
  targets: NutritionTarget;
  timeZone: string;
};

async function deletePlanById(planId: string): Promise<void> {
  await q(`DELETE FROM nutrition_plans WHERE id = $1`, [planId]);
}

async function archivePlanById(planId: string): Promise<void> {
  await q(
    `UPDATE nutrition_plans
        SET status = 'archived',
            updated_at = now()
      WHERE id = $1`,
    [planId]
  );
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
      const dayDate = d?.date || addDaysISO(weekStart, i);
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
      const fallbackDate = addDaysISO(weekStart, i);
      let dayDate = d?.date;
      if (dayDate) {
        const parsed = new Date(dayDate);
        if (Number.isNaN(parsed.getTime())) {
          dayDate = fallbackDate;
        } else {
          parsed.setHours(0, 0, 0, 0);
          dayDate = parsed.toISOString().slice(0, 10);
        }
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
              toDbQty(it.qty ?? null, it.unit || ""),
              it.unit || "г",
              toDbInt(it.kcal),
              toDbInt(it.protein_g),
              toDbInt(it.fat_g),
              toDbInt(it.carbs_g),
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
      try {
        const info = await q(
          `SELECT status, error_info FROM nutrition_plans WHERE id = $1`,
          [args.planId]
        );
        console.error("Async nutrition plan final status:", info[0]);
      } catch (e) {
        console.error("Failed to log nutrition plan status:", e);
      }
    });
  }, 0);
}

async function generateDetailedPlan({
  planId,
  userId,
  weekStart,
  onboarding,
  targets,
  timeZone,
}: AsyncPlanArgs) {
  const historyWeeks = await getLastNutritionPlans(userId, 3);
  const recentMeals = await getRecentMealNames(userId);
  const seed = makePlanSeed(userId, planId, weekStart);
  const prompt = buildAIPrompt(onboarding, targets, historyWeeks, weekStart, seed, recentMeals, timeZone);

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
          "You are a professional nutritionist with 15+ years of experience and access to comprehensive nutrition databases (USDA, FatSecret). You create realistic, practical meal plans people actually use. You adapt meals to Russian everyday eating culture. CRITICAL VERIFICATION: Always use calorie data for COOKED/PREPARED foods (not raw). Cross-check calorie values with your nutrition database knowledge before finalizing. If a value seems unusually high or low, recalculate using cooked weight. Verify total daily calories match target ±100 kcal. Vary meals across days. No templates. Trust your database knowledge.",
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

  enforceMealTargets(ai.week.days, targets);

  const meal0Kcals = ai.week.days.map((d) => d.meals?.[0]?.target_kcal || 0);
  if (
    meal0Kcals.length === 3 &&
    meal0Kcals[0] === meal0Kcals[1] &&
    meal0Kcals[1] === meal0Kcals[2]
  ) {
    console.warn("⚠️  AI создал шаблонные приёмы! Завтраки одинаковые по калориям.");
  }

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

async function loadWeekPlan(userId: string, refDate: string, opts?: { exact?: boolean }) {
  const exact = opts?.exact;
  const head = exact
    ? await q(
        `SELECT id, user_id, name, goal_kcal, protein_g, fat_g, carbs_g, meals_per_day, diet_style, restrictions, notes,
                week_start_date, status, error_info
         FROM nutrition_plans
         WHERE user_id=$1 AND week_start_date = $2::date AND status != 'archived'
         ORDER BY week_start_date DESC
         LIMIT 1`,
        [userId, refDate]
      )
    : await q(
        `SELECT id, user_id, name, goal_kcal, protein_g, fat_g, carbs_g, meals_per_day, diet_style, restrictions, notes,
                week_start_date, status, error_info
         FROM nutrition_plans
         WHERE user_id=$1
           AND week_start_date BETWEEN ($2::date - INTERVAL '2 days') AND $2::date
           AND status != 'archived'
         ORDER BY week_start_date DESC
         LIMIT 1`,
        [userId, refDate]
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
function buildAIPrompt(
  onb: Onb,
  targets: NutritionTarget,
  lastWeeks: any[],
  weekStartISO: string,
  seed: string,
  recentMeals: string[],
  timeZone: string = MOSCOW_TZ
) {
  const data = extractOnboardingData(onb);
  
  const gender = data.gender === "male" ? "мужской" : data.gender === "female" ? "женский" : data.gender;
  const age = data.age;
  const weight = data.weight;
  const height = data.height;
  const activityLevel = data.activityLevel === "sedentary" ? "сидячий образ жизни" : 
                        data.activityLevel === "moderate" ? "умеренная активность" : 
                        data.activityLevel === "active" ? "активный образ жизни" : data.activityLevel;
  const goalBase = typeof data.goal === "string" ? data.goal : "";
  const goalRaw = goalBase.toLowerCase();
  const goal = goalRaw === "muscle_gain" ? "набор мышечной массы" : 
               goalRaw === "weight_loss" ? "снижение веса" :
               goalRaw === "fat_loss" ? "снижение веса" :
               goalRaw === "maintain" ? "поддержание формы" : goalBase;
  
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

  const weekDays = buildWeekWindow(weekStartISO, timeZone);
  const recentMealsBlock =
    recentMeals.length > 0
      ? `\nНедавно уже использовались блюда/ингредиенты: ${recentMeals.slice(0, 20).join(", ")}.\nНе повторяй их дословно — вариируй рецепты (меняй гарниры, добавки, способы приготовления).`
      : "";
  const goalDirective = (GOAL_DIRECTIVES[goalRaw] || GOAL_DIRECTIVES.default)(weight);

  const cultural = ruCulturalGuidelines();

  return `Ты — профессиональный спортивный нутрициолог с 15+ годами практики и доступом к полным базам данных USDA и FatSecret.

Составь персональный план питания на 3 дня для этого клиента. Используй seed ${seed} как внутренний источник случайности, чтобы каждый запуск давал уникальную комбинацию блюд. ${goalDirective}

Дни плана:
${weekDays.map((d, idx) => `- День ${idx + 1}: ${d.label} (${d.iso})`).join("\n")}
${recentMealsBlock}

Уникальность:
- Завтраки в каждый из 3 дней НЕ должны повторять друг друга и не должны быть комбинацией "овсянка/яйца/банан". Используй разные каши/шакшука/сырники/омлет/творог/гречка/булгур и т.д.
- Обеды/ужины тоже должны отличаться по типу белка и гарниров между днями.

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
ТРЕБОВАНИЯ К ПЛАНУ
═══════════════════════════════════════════════════════════

1. ПЕРСОНАЛИЗАЦИЯ
   Учитывай все данные клиента: возраст, вес, цель, бюджет, стиль питания.
   Создай план специально для ЭТОГО человека, а не универсальный шаблон.

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
   - Простые блюда из 2-4 ингредиентов
   - Базовые способы готовки (варка, жарка, запекание)
   - Продукты доступны в обычном супермаркете (с учётом бюджета)

4. ГИБКОСТЬ КАЛОРИЙНОСТИ
   Не делай одинаковые приёмы пищи по калориям каждый день.
   Варьируй распределение калорий между приёмами.
   Главное: сумма за ДЕНЬ = ${targets.dailyKcal} ± 100 ккал

5. ТОЧНОСТЬ КБЖУ (КРИТИЧЕСКИ ВАЖНО!)
   
   Используй ТОЛЬКО данные для ГОТОВЫХ/ПРИГОТОВЛЕННЫХ продуктов из баз USDA/FatSecret.
   
   Крупы значительно увеличиваются при варке и теряют калорийность на грамм.
   Всегда указывай вес и калорийность ГОТОВОГО продукта, не сухого!
   
   Перед внесением каждого продукта проверяй:
   - Это калорийность для COOKED/PREPARED версии?
   - Если сомневаешься — сверься с базой USDA для cooked версии
   
   В каждом основном приёме (завтрак, обед, ужин) должно быть 25-45г белка. После заполнения каждого приёма пересчитай калории — если они ниже таргета, увеличь порцию и проверь снова перед отправкой.

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
    "notes": "1-2 практичных совета по приготовлению",
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
        "date": "YYYY-MM-DD",
        "title": "День 1/2/3",
        "meals": [
          {
            "title": "Завтрак",
            "time": "08:00",
            "target_kcal": число,
            "target_protein_g": число,
            "target_fat_g": число,
            "target_carbs_g": число,
            "items": [
              {
                "food": "Название готового блюда",
                "qty": число,
                "unit": "г/шт/мл",
                "kcal": число,
                "protein_g": число,
                "fat_g": число,
                "carbs_g": число,
                "prep": "способ приготовления",
                "notes": "краткая заметка"
              }
            ]
          },
          {
            "title": "Перекус",
            "time": "11:00",
            "target_kcal": число,
            "target_protein_g": число,
            "target_fat_g": число,
            "target_carbs_g": число,
            "items": []
          },
          {
            "title": "Обед",
            "time": "13:00",
            "target_kcal": число,
            "target_protein_g": число,
            "target_fat_g": число,
            "target_carbs_g": число,
            "items": []
          },
          {
            "title": "Перекус",
            "time": "16:00",
            "target_kcal": число,
            "target_protein_g": число,
            "target_fat_g": число,
            "target_carbs_g": число,
            "items": []
          },
          {
            "title": "Ужин",
            "time": "19:00",
            "target_kcal": число,
            "target_protein_g": число,
            "target_fat_g": число,
            "target_carbs_g": число,
            "items": []
          }
        ]
      }
    ]
  }
}

Количество приёмов (meals) может быть от 3 до 5 в зависимости от калорийности.

═══════════════════════════════════════════════════════════
⚠️  ФИНАЛЬНАЯ ПРОВЕРКА (ОБЯЗАТЕЛЬНО!) ⚠️
═══════════════════════════════════════════════════════════

Перед отправкой ПРОВЕРЬ:

1. МАТЕМАТИКА:
   Посчитай сумму всех items.kcal за каждый день.
   Сумма ДОЛЖНА быть ${targets.dailyKcal} ± 100 ккал.
   Если не попадает → скорректируй порции.

2. ЛОГИКА ВЕСОВ:
   Проверь крупы: если калорийность кажется слишком высокой → 
   убедись что используешь данные для COOKED версии из базы USDA.
   Готовая каша имеет в 3-4 раза меньше калорий на грамм чем сухая крупа.

3. ИСТОЧНИК ДАННЫХ:
   Мысленно сверься с базой USDA/FatSecret для prepared/cooked версии каждого продукта.
   Доверяй своим знаниям баз данных, не предположениям.

✓ Создано ровно 3 дня
✓ В каждом дне 3-5 приёмов (в зависимости от калорийности)
✓ Приёмы пищи имеют РАЗНУЮ калорийность (не шаблон!)
✓ Сумма калорий = ${targets.dailyKcal} ± 100 ккал (ПРОВЕРЕНО!)
✓ Веса ГОТОВЫХ продуктов, калории из баз данных USDA/FatSecret
✓ Блюда простые и логичные
✓ JSON валидный без markdown

НАЧИНАЙ ГЕНЕРАЦИЮ!`;
}

// ----------------------------------------------------------------------------
// ROUTE: сгенерировать 3-дневный план и сохранить
// ----------------------------------------------------------------------------
nutrition.post(
  "/generate-week",
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const start = Date.now();
      console.log(`[NUTRITION] ▶️ start generation at ${new Date().toISOString()}`);
  
      const userId = await getUserId(req as any);
      const tz = resolveTimezone(req);
      await ensureSubscription(userId, "nutrition");
      const onboarding = await getOnboarding(userId);
      const weekStart = currentDateISO(tz);
      const force = Boolean(req.body?.force);
      console.log(`[NUTRITION] params user=${userId} tz=${tz} weekStart=${weekStart} force=${force}`);
  
      // Лимит: не более одного нового плана в день
      const todayCount = await q<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt
           FROM nutrition_plans
          WHERE user_id = $1
            AND (created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
        [userId, tz]
      );
      if ((todayCount[0]?.cnt || 0) >= 1 && !force) {
        console.log(`[NUTRITION] blocked: daily limit reached (today=${todayCount[0]?.cnt})`);
        throw new AppError("Сегодня план питания уже обновлялся. Новый можно будет завтра.", 429);
      }
  
      // Недельный лимит (опционально)
      const weeklyCount = await q<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt
           FROM nutrition_plans
          WHERE user_id = $1
            AND created_at >= date_trunc('week', (now() AT TIME ZONE $2))`,
        [userId, tz]
      );
      if ((weeklyCount[0]?.cnt || 0) >= WEEKLY_NUTRITION_LIMIT && !force) {
        console.log(`[NUTRITION] blocked: weekly limit reached (week=${weeklyCount[0]?.cnt})`);
        throw new AppError("На этой неделе планы уже обновлялись. Новый можно будет позже.", 429);
      }
  
      // Проверка, что текущий 3-дневный блок уже закончился
      const latest = await q(
        `SELECT week_start_date
           FROM nutrition_plans
          WHERE user_id = $1
            AND status IN ('ready','archived')
          ORDER BY week_start_date DESC, created_at DESC
          LIMIT 1`,
        [userId]
      );
      if (latest[0]?.week_start_date) {
        const startIso: string = latest[0].week_start_date;
        const endIso = addDaysISO(startIso, 2); // покрывает 3 дня
        const todayIso = currentDateISO(tz);
        // Разрешаем новую генерацию в 3-й день (todayIso >= endIso)
        if (todayIso < endIso && !force) {
          console.log(
            `[NUTRITION] blocked: active plan covers today (start=${startIso} end=${endIso} today=${todayIso})`
          );
          throw new AppError(
            "У тебя уже есть активный план питания на эти дни. Новый можно будет сделать в третий день текущего блока.",
            429
          );
        }
        console.log(
          `[NUTRITION] latest plan start=${startIso} end=${endIso} today=${todayIso} force=${force}`
        );
      }
  
      let existing = await loadWeekPlan(userId, weekStart);
  
      // Если план готов и не force - вернуть его
      if (existing?.status === "ready" && !force) {
        console.log(`[NUTRITION] returning cached plan ${existing.planId}`);
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
  
      // Если план в обработке и не force - вернуть статус
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
  
      // Удалить старый план если force или failed
      if (existing?.planId) {
        console.log(`[NUTRITION] archiving existing plan ${existing.planId} (force=${force})`);
        await archivePlanById(existing.planId);
        existing = null;
      }
  
      const targets = calculateNutritionTargets(onboarding);
      const skeleton = buildSkeletonWeek(weekStart, targets);
      const planId = await insertSkeletonPlan(userId, weekStart, skeleton, targets, onboarding);
  
      console.log(`[NUTRITION] planId=${planId} weekStart=${weekStart}, starting async generation`);
  
      // 🔥 КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: запускаем генерацию в фоне
      queueDetailedPlanGeneration({
        planId,
        userId,
        weekStart,
        onboarding,
        targets,
        timeZone: tz,
      });
  
      // Сразу возвращаем skeleton со статусом processing
      console.log(`[NUTRITION] ⚡ returned skeleton in ${Date.now() - start}ms`);
  
      return res.json({
        plan: skeleton.week,
        meta: {
          status: "processing",
          planId: planId,
          created: true,
        },
      });
    } catch (err) {
      console.error("[NUTRITION] generate-week error:", err);
      throw err;
    }
  })
);

// ----------------------------------------------------------------------------
// ROUTE: получить текущий план без генерации
// ----------------------------------------------------------------------------
nutrition.get(
  "/current-week",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await getUserId(req as any);
    const tz = resolveTimezone(req);
    const weekStart = currentDateISO(tz);
    // exact=false — ищем актуальный план, который покрывает текущий день (старт мог быть 2 дня назад)
    const data = await loadWeekPlan(userId, weekStart, { exact: false });
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

    // Если план ещё обрабатывается - вернуть только статус
    if (status === "processing") {
      return res.json({
        status: "processing",
        planId: plan.id,
        error: null,
      });
    }

    // Если план готов или failed - загрузить полные данные
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
// ROUTE: пересчитать целевые показатели (для тестирования)
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

// health check
nutrition.get("/ping", (_req, res) => res.json({ ok: true, scope: "nutrition-3days-pro" }));

export default nutrition;

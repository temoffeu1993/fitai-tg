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
  const rows = await q(`SELECT data FROM onboardings WHERE user_id = $1 LIMIT 1`, [userId]);
  return rows[0]?.data || {};
}

function startOfWeekISO(d = new Date()) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7;
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - day);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

async function getLastNutritionPlans(userId: string, n = 3) {
  const rows = await q(
    `SELECT id, week_start_date, goal_kcal, protein_g, fat_g, carbs_g, meals_per_day, diet_style, restrictions, notes
     FROM nutrition_plans
     WHERE user_id = $1
     ORDER BY week_start_date DESC
     LIMIT $2`,
    [userId, n]
  );
  return rows;
}

async function loadWeekPlan(userId: string, weekStart: string) {
  const head = await q(
    `SELECT id, user_id, name, goal_kcal, protein_g, fat_g, carbs_g, meals_per_day, diet_style, restrictions, notes,
            week_start_date
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
    }
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

  const dates: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(weekStartISO);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const dayTitles = ["Пн", "Вт", "Ср"];

  const cultural = ruCulturalGuidelines();

  return `Ты — профессиональный спортивный нутрициолог с 15+ годами практики и доступом к полным базам данных USDA и FatSecret.

Составь персональный план питания на 3 дня для этого клиента.

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
        "title": "Пн/Вт/Ср",
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
    const userId = await getUserId(req as any);
    const onboarding = await getOnboarding(userId);
    const weekStart = startOfWeekISO(new Date());
    
    const existing = await loadWeekPlan(userId, weekStart);
    if (existing) {
      return res.json({ plan: existing.plan, meta: { cached: true } });
    }

    const targets = calculateNutritionTargets(onboarding);
    const historyWeeks = await getLastNutritionPlans(userId, 3);
    const prompt = buildAIPrompt(onboarding, targets, historyWeeks, weekStart);

    if (process.env.DEBUG_AI === "1") {
      console.log("\n=== NUTRITION PROMPT ===");
      console.log(prompt);
      console.log("\n=== CALCULATED TARGETS ===");
      console.log(JSON.stringify(targets, null, 2));
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.85,
      max_tokens: 9000,
      response_format: { type: "json_object" },
      messages: [
        { 
          role: "system", 
          content:
            "You are a professional nutritionist with 15+ years of experience and access to comprehensive nutrition databases (USDA, FatSecret). You create realistic, practical meal plans people actually use. You adapt meals to Russian everyday eating culture. CRITICAL VERIFICATION: Always use calorie data for COOKED/PREPARED foods (not raw). Cross-check calorie values with your nutrition database knowledge before finalizing. If a value seems unusually high or low, recalculate using cooked weight. Verify total daily calories match target ±100 kcal. Vary meals across days. No templates. Trust your database knowledge."
        },
        { role: "user", content: prompt },
      ],
    });

    let ai: WeekPlanAI | null = null;
    try {
      const content = completion.choices[0].message.content || "{}";
      const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      ai = JSON.parse(cleanContent);
    } catch (e) {
      console.error("AI JSON parse error:", e);
      console.error("Raw content:", completion.choices[0].message.content?.slice(0, 500));
      throw new AppError("AI вернул некорректный JSON", 500);
    }

    if (!ai?.week?.days || !Array.isArray(ai.week.days)) {
      console.error("AI returned invalid structure:", ai);
      throw new AppError("AI сформировал некорректную структуру", 500);
    }

    if (ai.week.days.length !== 3) {
      console.error(`AI returned ${ai.week.days.length} days instead of 3`);
      throw new AppError(`AI создал ${ai.week.days.length} дней вместо 3. Попробуйте ещё раз.`, 500);
    }

    // Валидация: проверяем что приёмы не шаблонные
    const meal0Kcals = ai.week.days.map(d => d.meals?.[0]?.target_kcal || 0);
    if (meal0Kcals.length === 3 && meal0Kcals[0] === meal0Kcals[1] && meal0Kcals[1] === meal0Kcals[2]) {
      console.warn("⚠️  AI создал шаблонные приёмы! Завтраки одинаковые по калориям.");
    }

    const totalKcal = ai.week.days.reduce((sum, day) => {
      return sum + (day.meals || []).reduce((mSum, meal) => {
        return mSum + ((meal.items || []).reduce((iSum, item) => iSum + (item.kcal || 0), 0) || 0);
      }, 0);
    }, 0);
    const avgDailyKcal = Math.round(totalKcal / 3);
    
    if (Math.abs(avgDailyKcal - targets.dailyKcal) > targets.dailyKcal * 0.15) {
      console.warn(`⚠️  AI generated plan with ${avgDailyKcal} kcal vs target ${targets.dailyKcal} (${Math.round((avgDailyKcal/targets.dailyKcal - 1) * 100)}% diff)`);
    } else {
      console.log(`✓ Plan validated: ${avgDailyKcal} kcal (target ${targets.dailyKcal})`);
    }

    // Сохраняем в БД
    await q("BEGIN");
    try {
      const g = ai.week.goal || {};
      const data = extractOnboardingData(onboarding);
      
      const planRow = await q(
        `INSERT INTO nutrition_plans
         (user_id, week_start_date, name, goal_kcal, protein_g, fat_g, carbs_g, meals_per_day, diet_style, restrictions, notes)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11)
         RETURNING id, week_start_date`,
        [
          userId,
          weekStart,
          ai.week.name || "Персонализированный план питания (3 дня)",
          Number(g.kcal) || targets.dailyKcal,
          Number(g.protein_g) || targets.proteinG,
          Number(g.fat_g) || targets.fatG,
          Number(g.carbs_g) || targets.carbsG,
          Number(g.meals_per_day) || targets.mealsPerDay,
          g.diet_style || data.dietStyle,
          Array.isArray(data.restrictions) && data.restrictions.length > 0 ? data.restrictions : null,
          ai.week.notes || null,
        ]
      );
      const planId = planRow[0].id;

      const dayIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const d = ai.week.days[i];
        const dayIndex = i + 1;
        const dayDate = d?.date || new Date(new Date(weekStart).getTime() + i * 86400000)
          .toISOString()
          .slice(0, 10);
        const row = await q(
          `INSERT INTO nutrition_days (plan_id, day_index, day_date)
           VALUES ($1, $2, $3::date)
           RETURNING id`,
          [planId, dayIndex, dayDate]
        );
        dayIds.push(row[0].id);
      }

      for (let i = 0; i < 3; i++) {
        const d = ai.week.days[i];
        const day_id = dayIds[i];
        const meals = Array.isArray(d.meals) ? d.meals : [];
        
        for (let j = 0; j < meals.length; j++) {
          const m = meals[j];
          const mealRow = await q(
            `INSERT INTO nutrition_meals
             (day_id, title, time_hint, target_kcal, target_protein_g, target_fat_g, target_carbs_g, position)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              day_id,
              m.title || `Приём ${j + 1}`,
              m.time || null,
              m.target_kcal ?? null,
              m.target_protein_g ?? null,
              m.target_fat_g ?? null,
              m.target_carbs_g ?? null,
              j + 1,
            ]
          );
          const mealId = mealRow[0].id;

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

      await q("COMMIT");

      const full = await loadWeekPlan(userId, weekStart);
      return res.json({ 
        plan: full?.plan, 
        meta: { 
          created: true,
          targets: targets,
          avgDailyKcal: avgDailyKcal,
          daysGenerated: ai.week.days.length,
          qualityChecks: {
            templated: meal0Kcals[0] === meal0Kcals[1] && meal0Kcals[1] === meal0Kcals[2],
            calorieAccuracy: Math.round((avgDailyKcal/targets.dailyKcal - 1) * 100)
          }
        } 
      });
    } catch (err) {
      await q("ROLLBACK");
      console.error("Save nutrition week failed:", err);
      if ((err as any)?.constraint === "uniq_plan_per_week") {
        const full = await loadWeekPlan(userId, weekStart);
        return res.json({ plan: full?.plan, meta: { existed: true } });
      }
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
    const weekStart = startOfWeekISO(new Date());
    const data = await loadWeekPlan(userId, weekStart);
    if (!data) return res.status(404).json({ error: "План на этот период не найден" });
    res.json({ plan: data.plan });
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

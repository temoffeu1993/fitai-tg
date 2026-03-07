// webapp/src/screens/NutritionToday.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getScheduleOverview, PlannedWorkout, ScheduleByDate } from "@/api/schedule";
import { generateWeek, getNutritionFeed, type NutritionFeedPlan, type NutritionFeedResponse } from "@/api/nutrition";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { useNutritionGenerationProgress } from "@/hooks/useNutritionGenerationProgress";
import NavBar from "@/components/NavBar";

type FoodItem = { food: string; qty: number; unit: string; kcal?: number; protein_g?: number; fat_g?: number; carbs_g?: number; prep?: string; notes?: string; };
type SnackPreset = {
  title: string;
  items: FoodItem[];
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  notes?: string;
};
type Meal = { title: string; time?: string; target_kcal?: number; target_protein_g?: number; target_fat_g?: number; target_carbs_g?: number; items: FoodItem[]; notes?: string; };
type Day = { day_index?: number; date: string; meals: Meal[] };
type WeekPlan = { id: string; week_start_date: string; name: string; notes?: string; goal: { kcal: number; protein_g: number; fat_g: number; carbs_g: number; meals_per_day: number; diet_style?: string }; days: Day[]; };
type TrainingInfo = { isTraining: boolean; status?: "slot" | "planned" | "completed"; time?: string | null };

const PRE_WORKOUT_SNACKS: SnackPreset[] = [
  {
    title: "Предтренировочный перекус",
    items: [
      { food: "Греческий йогурт 2%", qty: 150, unit: "г", kcal: 120, protein_g: 12, fat_g: 4, carbs_g: 8 },
      { food: "Мёд", qty: 1, unit: "ст. л.", kcal: 64, protein_g: 0, fat_g: 0, carbs_g: 16 },
      { food: "Черника", qty: 60, unit: "г", kcal: 35, protein_g: 0, fat_g: 0, carbs_g: 9 },
    ],
    kcal: 219,
    protein: 12,
    fat: 4,
    carbs: 33,
    notes: "Съешь за 30–45 минут до тренировки",
  },
  {
    title: "Предтренировочный перекус",
    items: [
      { food: "Тост цельнозерновой", qty: 1, unit: "ломтик", kcal: 80, protein_g: 4, fat_g: 1, carbs_g: 14 },
      { food: "Арахисовая паста", qty: 1, unit: "ст. л.", kcal: 95, protein_g: 4, fat_g: 8, carbs_g: 3 },
      { food: "Банан", qty: 0.5, unit: "шт", kcal: 50, protein_g: 1, fat_g: 0, carbs_g: 13 },
    ],
    kcal: 225,
    protein: 9,
    fat: 9,
    carbs: 30,
    notes: "Съешь за 40 минут до тренировки",
  },
  {
    title: "Предтренировочный перекус",
    items: [
      { food: "Овсянка быстрого приготовления", qty: 35, unit: "г", kcal: 130, protein_g: 5, fat_g: 2, carbs_g: 23 },
      { food: "Изюм", qty: 20, unit: "г", kcal: 60, protein_g: 1, fat_g: 0, carbs_g: 15 },
      { food: "Миндаль", qty: 10, unit: "г", kcal: 59, protein_g: 2, fat_g: 5, carbs_g: 2 },
    ],
    kcal: 249,
    protein: 8,
    fat: 7,
    carbs: 40,
    notes: "Съешь за 45 минут до тренировки",
  },
];

const POST_WORKOUT_SNACKS: SnackPreset[] = [
  {
    title: "Восстановительный перекус",
    items: [
      { food: "Протеиновый коктейль", qty: 1, unit: "порция", kcal: 180, protein_g: 28, fat_g: 3, carbs_g: 9 },
      { food: "Банан", qty: 1, unit: "шт", kcal: 105, protein_g: 1, fat_g: 0, carbs_g: 27 },
    ],
    kcal: 285,
    protein: 29,
    fat: 3,
    carbs: 36,
    notes: "Прими в течение 30 минут после тренировки",
  },
  {
    title: "Восстановительный перекус",
    items: [
      { food: "Творог 2%", qty: 150, unit: "г", kcal: 120, protein_g: 20, fat_g: 3, carbs_g: 6 },
      { food: "Мёд", qty: 1, unit: "ч. л.", kcal: 32, protein_g: 0, fat_g: 0, carbs_g: 8 },
      { food: "Киви", qty: 1, unit: "шт", kcal: 60, protein_g: 1, fat_g: 0, carbs_g: 15 },
    ],
    kcal: 212,
    protein: 21,
    fat: 3,
    carbs: 29,
    notes: "Подходит сразу после тренировки",
  },
  {
    title: "Восстановительный перекус",
    items: [
      { food: "Лавaш цельнозерновой", qty: 0.5, unit: "шт", kcal: 110, protein_g: 4, fat_g: 2, carbs_g: 20 },
      { food: "Хумус", qty: 2, unit: "ст. л.", kcal: 80, protein_g: 4, fat_g: 5, carbs_g: 7 },
      { food: "Куриная грудка (готовая)", qty: 60, unit: "г", kcal: 90, protein_g: 18, fat_g: 2, carbs_g: 0 },
    ],
    kcal: 280,
    protein: 26,
    fat: 9,
    carbs: 27,
    notes: "Съешь в течение часа после тренировки",
  },
];

const isoToday = () => {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const sum = (xs: Array<number | undefined>) => Math.round(xs.reduce((a, v) => a + (typeof v === "number" ? v : 0), 0));

// безопасное приведение к number
const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export default function NutritionToday() {
  const sub = useSubscriptionStatus();
  const [feed, setFeed] = useState<NutritionFeedResponse<WeekPlan> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [trainingInfo, setTrainingInfo] = useState<TrainingInfo | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const navigate = useNavigate();

  const steps = useMemo(
    () => ["Анализ онбординга", "Расчёт КБЖУ", "Подбор рецептов", "Баланс дней", "Готовим неделю"],
    []
  );

  const loadFeed = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await getNutritionFeed<WeekPlan>();
        setFeed({
          ...data,
          plans: data.plans.map((entry) => ({ ...entry, plan: normalize(entry.plan) })),
        });
        if (!silent) {
          setInlineError(null);
        }
      } catch (err: any) {
        if (!silent) {
          setError(err?.userMessage || "Не удалось получить план питания");
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const plans = feed?.plans ?? [];
  const activeEntry = useMemo<NutritionFeedPlan<WeekPlan> | null>(() => {
    if (!plans.length) return null;
    return plans.find((p) => p.isActive) || plans.find((p) => p.isUpcoming) || plans[0];
  }, [plans]);

  const plan = activeEntry?.plan ?? null;
  const planStatus = activeEntry?.status ?? (regenerating ? "processing" : null);

  const {
    progress: loaderProgress,
    stepIndex: loaderStepIndex,
    stepNumber: loaderStepNumber,
    startManual: kickProgress,
  } = useNutritionGenerationProgress(planStatus, { steps: steps.length });

  const availability = feed?.availability;
  const canGenerate = availability?.canGenerate ?? false;
  const buttonNote = canGenerate
    ? "Можно сгенерировать новый план питания."
    : availability?.reason ||
      (availability?.nextDateLabel
        ? "Новый план можно будет сгенерировать " + availability.nextDateLabel + "."
        : "Новый план пока недоступен.");
  const buttonDisabled = regenerating || !canGenerate || sub.locked;

  const handleRegenerate = useCallback(async () => {
    if (buttonDisabled) return;
    setInlineError(null);
    kickProgress();
    setRegenerating(true);
    try {
      await generateWeek({ force: true });
      await loadFeed({ silent: true });
    } catch (err: any) {
      setInlineError(err?.userMessage || "Не удалось запустить генерацию");
    } finally {
      setRegenerating(false);
    }
  }, [buttonDisabled, kickProgress, loadFeed]);

  useEffect(() => {
    let active = true;

    const loadSchedule = async () => {
      try {
        const data = await getScheduleOverview();
        if (!active) return;
        const info = deriveTrainingInfo(data.schedule?.dates, data.plannedWorkouts, isoToday());
        setTrainingInfo(info);
      } catch (err) {
        if (!active) return;
        setTrainingInfo(null);
      }
    };

    loadSchedule();
    const handler = () => loadSchedule();
    window.addEventListener("schedule_updated", handler as any);
    return () => {
      active = false;
      window.removeEventListener("schedule_updated", handler as any);
    };
  }, []);


  const todayISO = isoToday();

  const day: Day | undefined = useMemo(() => {
    if (!plan) return undefined;
    const exact = plan.days.find(d => String(d.date).slice(0, 10) === todayISO);
    return exact || plan.days[0];
  }, [plan, todayISO]);

  const displayDay: Day | undefined = useMemo(() => {
    if (!day) return undefined;
    if (!trainingInfo || !trainingInfo.isTraining) return day;
    return enhanceDayForTraining(day, trainingInfo);
  }, [day, trainingInfo]);

  const isProcessing = planStatus === "processing";
  const buttonLabel = regenerating ? "Готовим меню..." : plan ? "Сгенерировать заново" : "Сгенерировать план";

  if (error) {
    return <ErrorView msg={error} onRetry={() => { loadFeed(); }} />;
  }

  if (!plan && (loading || isProcessing)) {
    return (
      <Loader
        steps={steps}
        label="Готовлю питание на сегодня"
        progress={loaderProgress}
        activeStep={loaderStepIndex}
        stepNumber={loaderStepNumber}
      />
    );
  }

  if (!plan) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.heroCard}>
          <div style={s.heroHeader}>
            <span style={s.pill}>{new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })}</span>
            <span style={s.credits}>Нет меню</span>
          </div>
          <div style={s.heroTitle}>Собрать план питания</div>
          <div style={s.heroSubtitle}>AI подготовит рацион на 3 дня</div>
          <button
            className="soft-glow"
            disabled={buttonDisabled}
            style={{
              ...s.primaryBtn,
              opacity: buttonDisabled ? 0.6 : 1,
              cursor: buttonDisabled ? "not-allowed" : "pointer",
              marginTop: 12,
            }}
            onClick={handleRegenerate}
          >
            {buttonLabel}
          </button>
          <div style={s.buttonNote}>{buttonNote}</div>
          {inlineError && <div style={s.inlineError}>{inlineError}</div>}
        </section>
        <div style={{ height: 56 }} />
        <NavBar
          current="none"
          onChange={(t) => {
            if (t === "home") navigate("/");
            if (t === "plan") navigate("/schedule");
            if (t === "coach") navigate("/coach");
            if (t === "profile") navigate("/profile");
          }}
        />
      </div>
    );
  }

  if (!day || !displayDay) {
    return <ErrorView msg="Не удалось подготовить меню на сегодня" onRetry={() => { loadFeed(); }} />;
  }

  const isTrainingDay = trainingInfo?.isTraining ?? false;
  const formatValue = (value?: number) => (value != null ? value : "—");

  const baseTotals = computeTotals(day);
  const displayTotals = computeTotals(displayDay);
  const added = {
    kcal: Math.max(0, displayTotals.kcal - baseTotals.kcal),
    protein: Math.max(0, displayTotals.protein - baseTotals.protein),
    fat: Math.max(0, displayTotals.fat - baseTotals.fat),
    carbs: Math.max(0, displayTotals.carbs - baseTotals.carbs),
  };
  const boostPercent = isTrainingDay && baseTotals.kcal > 0
    ? Math.round((added.kcal / baseTotals.kcal) * 100)
    : 0;

  const goalKcal = plan.goal.kcal + added.kcal;
  const goalProtein = plan.goal.protein_g + added.protein;
  const goalFat = plan.goal.fat_g + added.fat;
  const goalCarbs = plan.goal.carbs_g + added.carbs;
  const displayKcal = displayTotals.kcal;
  const displayProtein = displayTotals.protein;
  const displayFat = displayTotals.fat;
  const displayCarbs = displayTotals.carbs;

  const dt = parseISODate(displayDay.date || day.date);
  const dateLabel = dt
  ? dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })
  : todayISO;
  const heroStatus = isTrainingDay ? "⚡ Усиленный план питания" : "План готов";
const pillDateLabel = new Date().toLocaleDateString("ru-RU", {
  day: "2-digit",
  month: "long",
  timeZone: "Europe/Moscow",
});

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />

      {/* HERO в стиле экрана «Расписание» */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
         <span style={s.pill}>{pillDateLabel}</span>
          <span style={s.credits}>{heroStatus}</span>
        </div>

        <div style={s.heroTitle}>План питания на сегодня</div>
        <div style={s.heroSubtitle}>Детальный состав приёмов пищи на текущий день</div>

        <button
          className="soft-glow"
          disabled={buttonDisabled}
          style={{
            ...s.primaryBtn,
            opacity: buttonDisabled ? 0.6 : 1,
            cursor: buttonDisabled ? "not-allowed" : "pointer",
            marginTop: 12,
          }}
          onClick={handleRegenerate}
        >
          {buttonLabel}
        </button>
        <div style={s.buttonNote}>{buttonNote}</div>
        {inlineError && <div style={s.inlineError}>{inlineError}</div>}
      </section>

      {/* Чипы под героем как на «Расписании» */}
      <section style={{ ...s.block, ...s.statsSection }}>
        <div style={s.statsRow}>
          <Stat icon="🔥" label={isTrainingDay ? "Ккал (усилено)" : "Ккал (итого)"} value={String(displayKcal)} />
          <Stat icon="🥚" label="Белки" value={`${displayProtein} г`} />
          <Stat icon="🍚" label="Ж/У" value={`${displayFat}/${displayCarbs} г`} />
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: "#333", textAlign: "left" }}>
          Цель на день: {formatValue(goalKcal)} ккал • Б/Ж/У: {formatValue(goalProtein)}/{formatValue(goalFat)}/{formatValue(goalCarbs)} г
          {isTrainingDay ? ` (с учётом тренировки, +${boostPercent}%)` : ""}
        </div>
      </section>

      {/* Приёмы пищи в стеклянном стиле как «Ближайшие» на «Расписании» */}
      <section style={s.block}>
        <div style={{ ...ux.card, overflow: "hidden" }}>
          <div style={{ ...ux.cardHeader }}>
            <div style={ux.iconInline}>🍽️</div>
            <div>
              <div style={ux.cardTitleRow}>
                <div style={ux.cardTitle}>Приёмы пищи</div>
              </div>
              <div style={ux.cardHint}>
                Состав блюд и целевые значения по каждому приёму
              </div>
            </div>
          </div>

          <div style={{ padding: 10, display: "grid", gap: 10 }}>
            {(displayDay.meals || []).map((m, idx) => {
              const mk = sum(m.items.map(i => i.kcal));
              const mp = sum(m.items.map(i => i.protein_g));
              const mf = sum(m.items.map(i => i.fat_g));
              const mc = sum(m.items.map(i => i.carbs_g));
              const targetKcal = m.target_kcal ?? mk;
              return (
                <div key={idx} style={mealCard.wrap}>
                  <div style={mealCard.header}>
                    <div style={row.name}>{m.title}</div>
                    <div style={row.cues}>{fmtTargets({ mk, mp, mf, mc, targetKcal })}</div>
                  </div>

                  {/* Состав приёма: стеклянные строки */}
                  <div style={{ display: "grid", gap: 6 }}>
                    {(m.items || []).map((it, k) => {
                      const itemKcal = toNum(it.kcal);
                      return (
                        <div key={k} style={food.line}>
                          <div style={food.left}>
                            <div style={food.textCol}>
                              <div style={food.foodName}>{it.food}</div>
                              {it.notes ? <div style={food.metaText}>{it.notes}</div> : null}
                            </div>
                            <div style={food.qty}>{`${num(it.qty)} ${it.unit}`}</div>
                          </div>
                          <div style={food.right}>
                            {itemKcal != null ? <span>{itemKcal} ккал</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {m.notes ? <div style={mealCard.notes}>{m.notes}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Плавающая кнопка с заметками (оставил весь функционал) */}
      {plan.notes && (
        <>
          {showNotes && (
            <div style={notesStyles.chatPanelWrap}>
              <div style={notesStyles.chatPanel}>
                <div style={notesStyles.chatHeader}>
                  <div style={notesStyles.chatHeaderLeft}>
                    <div style={notesStyles.robotIconLarge}>🤖</div>
                    <div style={notesStyles.chatTitle}>Заметки нутрициолога</div>
                  </div>
                  <button style={notesStyles.closeBtn} onClick={() => setShowNotes(false)}>✕</button>
                </div>
                <div style={notesStyles.chatBody}>{plan.notes}</div>
              </div>
            </div>
          )}
          <div style={notesStyles.fabWrap} onClick={() => setShowNotes((v) => !v)}>
            {!showNotes && (
              <div style={notesStyles.speechBubble}>
                <div style={notesStyles.speechText}>Заметки нутрициолога</div>
                <div style={notesStyles.speechArrow} />
              </div>
            )}
            <div style={notesStyles.fabCircle}><span style={{ fontSize: 35, lineHeight: 1 }}>🤖</span></div>
          </div>
        </>
      )}

      <div style={{ height: 56 }} />

      {/* ↓↓↓ Нижний бар без активной вкладки */}
      <NavBar
        current="none"
        onChange={(t) => {
          if (t === "home") navigate("/");
          if (t === "plan") navigate("/schedule");
          if (t === "coach") navigate("/coach");
          if (t === "profile") navigate("/profile");
        }}
      />
    </div>
  );
}

/* ---------------- utils ---------------- */
function normalize(p: any) {
  p.days = (p.days || []).map((d: any, i: number) => ({
    day_index: Number(d.day_index ?? i + 1),
    date: d.date,
    meals: (d.meals || []).map((m: any) => ({
      title: String(m.title || "Приём пищи"),
      time: m.time || undefined,
      target_kcal: toNum(m.target_kcal),
      target_protein_g: toNum(m.target_protein_g),
      target_fat_g: toNum(m.target_fat_g),
      target_carbs_g: toNum(m.target_carbs_g),
      items: (m.items || []).map((it: any) => ({
        food: String(it.food || ""),
        qty: Number(it.qty ?? 0),
        unit: String(it.unit || ""),
        kcal: toNum(it.kcal),
        protein_g: toNum(it.protein_g),
        fat_g: toNum(it.fat_g),
        carbs_g: toNum(it.carbs_g),
        prep: it.prep ?? undefined,
        notes: it.notes ?? undefined,
      })),
      notes: m.notes || undefined,
    })),
  }));

  return p;
}

function parseISODate(s?: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function deriveTrainingInfo(dates: ScheduleByDate | undefined, plannedWorkouts: PlannedWorkout[] | undefined, todayISO: string): TrainingInfo {
  const all = Array.isArray(plannedWorkouts) ? plannedWorkouts.filter(w => w.status !== "cancelled") : [];
  // Completed: match by completedAt (fact date), fallback to scheduledFor
  const completed = all.find(w => w.status === "completed" && (datePart(w.completedAt) === todayISO || datePart(w.scheduledFor) === todayISO));
  if (completed) {
    return { isTraining: true, status: "completed", time: timePart(completed.completedAt || completed.scheduledFor) };
  }
  const planned = all.filter(w => datePart(w.scheduledFor) === todayISO);
  const active = planned.find(w => w.status === "scheduled" || w.status === "planned");
  if (active) {
    return { isTraining: true, status: "planned", time: timePart(active.scheduledFor) };
  }
  const slotTime = dates?.[todayISO]?.time;
  if (slotTime) {
    return { isTraining: true, status: "slot", time: slotTime };
  }
  return { isTraining: false };
}

function computeTotals(day: Day): { kcal: number; protein: number; fat: number; carbs: number } {
  const total = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  (day.meals || []).forEach((meal) => {
    (meal.items || []).forEach((item) => {
      if (typeof item.kcal === "number") total.kcal += item.kcal;
      if (typeof item.protein_g === "number") total.protein += item.protein_g;
      if (typeof item.fat_g === "number") total.fat += item.fat_g;
      if (typeof item.carbs_g === "number") total.carbs += item.carbs_g;
    });
  });
  return {
    kcal: Math.round(total.kcal),
    protein: Math.round(total.protein),
    fat: Math.round(total.fat),
    carbs: Math.round(total.carbs),
  };
}

function enhanceDayForTraining(day: Day, info: TrainingInfo): Day {
  const meals = [...(day.meals || [])];
  const snacks = buildTrainingSnacks(info, meals.length);
  const withSnacks = snacks.length > 0 ? insertMealsByTime(meals, snacks) : meals;
  return {
    ...day,
    meals: withSnacks,
  };
}

function buildTrainingSnacks(info: TrainingInfo, indexSeed: number): Meal[] {
  if (!info.isTraining) return [];
  const pre = pickSnack(PRE_WORKOUT_SNACKS, indexSeed);
  const post = pickSnack(POST_WORKOUT_SNACKS, indexSeed + 1);
  const baseTime = info.time || "18:00";
  const preTime = shiftTime(baseTime, -45);
  const postTime = shiftTime(baseTime, 45);

  const preMeal: Meal = {
    title: pre.title,
    time: preTime,
    items: pre.items,
    target_kcal: pre.kcal,
    target_protein_g: pre.protein,
    target_fat_g: pre.fat,
    target_carbs_g: pre.carbs,
    notes: pre.notes,
  };

  const postMeal: Meal = {
    title: post.title,
    time: postTime,
    items: post.items,
    target_kcal: post.kcal,
    target_protein_g: post.protein,
    target_fat_g: post.fat,
    target_carbs_g: post.carbs,
    notes: post.notes,
  };

  if (info.status === "completed") {
    return [postMeal];
  }
  if (info.status === "planned") {
    return [preMeal, postMeal];
  }
  if (info.status === "slot") {
    return [preMeal, postMeal];
  }
  return [preMeal, postMeal];
}

function pickSnack(list: SnackPreset[], seed: number): SnackPreset {
  if (list.length === 0) throw new Error("Snack list empty");
  const idx = Math.abs(seed) % list.length;
  return list[idx];
}

function insertMealsByTime(meals: Meal[], snacks: Meal[]): Meal[] {
  const combined = [...meals, ...snacks];
  combined.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  return combined;
}

/** ISO string or Date → local YYYY-MM-DD (user's timezone, not UTC) */
function datePart(value: string | Date | undefined | null): string | null {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timePart(value: string | Date | undefined | null): string | null {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function shiftTime(time: string, offsetMinutes: number): string {
  const base = timeToMinutes(time);
  const mins = Math.max(0, Math.min(24 * 60 - 1, base + offsetMinutes));
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeToMinutes(time?: string): number {
  if (!time) return 24 * 60;
  const m = time.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 24 * 60;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h * 60 + min;
}

function fmtTargets(agg: { mk: number; mp: number; mf: number; mc: number; targetKcal?: number | undefined }) {
  const t = [
    `${agg.mk} ккал`,
    `${agg.mp} г белка`,
    `${agg.mf}/${agg.mc} г Ж/У`,
    typeof agg.targetKcal === "number" ? `цель ${agg.targetKcal} ккал` : null,
  ].filter(Boolean).join(" • ");
  return t;
}
const num = (x: any) => (Number.isFinite(x) ? String(x) : "");

/* ---------------- shared UI ---------------- */
function SoftGlowStyles() { return (<style>{`
  .soft-glow{background:linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);background-size:300% 300%;
  animation:glowShift 6s ease-in-out infinite,pulseSoft 3s ease-in-out infinite;transition:background .3s}
  @keyframes glowShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
  @keyframes pulseSoft{0%,100%{filter:brightness(1) saturate(1);transform:scale(1)}50%{filter:brightness(1.15) saturate(1.1);transform:scale(1.01)}}
`}</style>); }
function TypingDotsStyles(){return(<style>{`
  .typing-dots{display:inline-flex;align-items:center;gap:4px}
  .typing-dots .dot{width:6px;height:6px;border-radius:50%;background:#1b1b1b;opacity:.3;animation:blink 1.2s infinite}
  .typing-dots .dot:nth-child(2){animation-delay:.2s}
  .typing-dots .dot:nth-child(3){animation-delay:.4s}
  @keyframes blink{0%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}100%{opacity:.3;transform:translateY(0)}}
`}</style>); }
function Spinner(){return(<svg width="56" height="56" viewBox="0 0 50 50" style={{display:"block"}}>
  <circle cx="25" cy="25" r="20" stroke="rgba(0,0,0,.35)" strokeWidth="6" fill="none"/>
  <circle cx="25" cy="25" r="20" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none"
    strokeDasharray="110" strokeDashoffset="80" style={{transformOrigin:"25px 25px",animation:"spin 1.2s linear infinite"}}/>
  <style>{`@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>
</svg>);}
function ShimmerStyles(){return(<style>{`
  @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
`}</style>);}

function Loader({
  steps,
  label,
  progress,
  activeStep,
  stepNumber,
}: {
  steps: string[];
  label: string;
  progress: number;
  activeStep: number;
  stepNumber: number;
}) {
  const safeStep = steps[activeStep] ?? steps[0] ?? "";
  const spinnerHints = [
    "Учитываю цели и ограничения",
    "Распределяю КБЖУ по приёмам",
    "Подбираю блюда и перекусы",
    "Проверяю баланс по дням",
    "Формирую результаты",
  ];
  const hint = spinnerHints[Math.min(activeStep, spinnerHints.length - 1)];
  const displayProgress = Math.max(5, Math.min(99, Math.round(progress || 0)));
  const analyticsState = activeStep >= 1 ? "анализ завершён" : "в процессе";
  const selectionState = activeStep >= 3 ? "почти готово" : "готовится";

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />
      <ShimmerStyles />
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Загрузка</span>
          <span style={s.credits}>ИИ работает</span>
        </div>
        <div style={{ marginTop: 8, opacity: .9, fontSize: 13 }}>
          Шаг {Math.min(stepNumber, steps.length)} из {steps.length}
        </div>
        <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>{safeStep}</div>
        <div style={s.heroTitle}>{label}</div>
        <div style={s.loadWrap}>
          <Spinner />
          <div style={{ marginTop: 8, fontSize: 13, opacity: .9 }}>{hint}</div>
        </div>
      </section>

      <section style={s.statsRow}>
        <ChipStatSquare emoji="🧠" label="Аналитика" value={analyticsState} />
        <ChipStatSquare emoji="🧩" label="Подбор" value={selectionState} />
        <ChipStatSquare emoji="⚡" label="Прогресс" value={`${displayProgress}%`} />
      </section>

      <section style={s.blockWhite}>
        <SkeletonLine />
        <SkeletonLine w={80} />
        <SkeletonLine w={60} />
      </section>
    </div>
  );
}

function ErrorView({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />
      <section style={s.blockWhite}>
        <h3 style={{ marginTop: 0 }}>{msg}</h3>
        <p style={{ marginTop: 6, color: "#555" }}>Повтори попытку позже.</p>
        <button style={s.rowBtn} onClick={onRetry ?? (() => window.location.reload())}>
          Повторить
        </button>
      </section>
    </div>
  );
}

/** Чип как на «Расписании» */
function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statEmoji}>{icon}</div>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
    </div>
  );
}

/* НОВОЕ: квадратный чип загрузки как в Nutrition.tsx */
function ChipStatSquare({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: string;
}) {
  return (
    <div style={s.chipSquare}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ fontSize: 12, opacity: 0.7, textAlign: "center", whiteSpace: "normal", lineHeight: 1.2 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, textAlign: "center", whiteSpace: "normal", lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}

function SkeletonLine({ w = 100 }: { w?: number }) {
  return (<div style={{height:10,width:`${w}%`,borderRadius:6,background:"linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%)",backgroundSize:"400% 100%",animation:"shimmer 1.4s ease-in-out infinite",marginTop:8}} />);
}

/* ---------------- стили ---------------- */
const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const SCHEDULE_BTN_GRADIENT = "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";

const s: Record<string, React.CSSProperties> = {
  page:{
    maxWidth:720,margin:"0 auto",padding:"16px",
    fontFamily:"system-ui,-apple-system,'Inter','Roboto',Segoe UI",
    background:"transparent",
    minHeight:"100vh",
  },

  // чёрный hero как на «Расписании»
  heroCard:{
    position:"relative",padding:22,borderRadius:28,boxShadow:"0 2px 6px rgba(0,0,0,.08)",
    background:"#0f172a",color:"#fff",overflow:"hidden"
  },
  heroHeader:{display:"flex",justifyContent:"space-between",alignItems:"center"},
  pill:{
    background:"rgba(255,255,255,.08)",padding:"6px 12px",borderRadius:999,fontSize:12,color:"#fff",
    border:"1px solid rgba(255,255,255,.18)",backdropFilter:"blur(6px)",textTransform:"capitalize"
  },
  credits:{
    background:"rgba(255,255,255,.08)",padding:"6px 12px",borderRadius:999,fontSize:12,color:"#fff",
    border:"1px solid rgba(255,255,255,.18)",backdropFilter:"blur(6px)"
  },
  heroTitle:{fontSize:26,fontWeight:800,marginTop:6,color:"#fff"},
  heroSubtitle:{opacity:.9,marginTop:4,color:"rgba(255,255,255,.85)"},
  buttonNote:{fontSize:13,marginTop:10,opacity:0.85,color:"rgba(255,255,255,.85)"},
  inlineError:{marginTop:8,color:"#ff4d4f",fontSize:13,fontWeight:600},

  // кнопка как на «Расписании»
  primaryBtn:{
    border:"none",borderRadius:16,padding:"14px 18px",fontSize:16,fontWeight:700,color:"#000",
    background:SCHEDULE_BTN_GRADIENT,boxShadow:"0 12px 30px rgba(0,0,0,.35)",cursor:"pointer",width:"100%"
  },

  // секция чипов как на «Расписании»
  statsSection:{marginTop:12,padding:0,background:"transparent",boxShadow:"none"},
  statsRow:{
    display:"grid",
    gridTemplateColumns:"repeat(3,minmax(96px,1fr))",
    gap:12,
    marginTop:12,
    marginBottom:10
  },

  // новый квадратный чип как на Nutrition.tsx
  chipSquare:{
    background:"rgba(255,255,255,0.6)",
    color:"#000",
    border:"1px solid rgba(0,0,0,0.08)",
    boxShadow:"0 2px 6px rgba(0,0,0,0.08)",
    borderRadius:12,
    padding:"10px 8px",
    minHeight:96,
    display:"grid",
    placeItems:"center",
    textAlign:"center",
    backdropFilter:"blur(8px)",
    WebkitBackdropFilter:"blur(8px)",
    gap:4,
    wordBreak:"break-word",
    whiteSpace:"normal",
    hyphens:"none",
  },

  stat:{
    background:"rgba(255,255,255,0.6)",borderRadius:12,border:"1px solid rgba(0,0,0,0.08)",boxShadow:"0 2px 6px rgba(0,0,0,0.08)",
    padding:"10px 8px",minHeight:96,display:"grid",placeItems:"center",textAlign:"center",gap:4
  },
  statEmoji:{fontSize:20,color:"#111"},
  statLabel:{fontSize:11,color:"rgba(0,0,0,.75)",letterSpacing:0.2,textTransform:"none"},
  statValue:{fontWeight:800,fontSize:18,color:"#111"},

  block:{marginTop:16,padding:0,borderRadius:16,background:"transparent",boxShadow:"none"},
  blockWhite:{marginTop:16,padding:14,borderRadius:16,background:"#fff",boxShadow:cardShadow},
  rowBtn:{
    border:"none",padding:"12px 14px",borderRadius:12,fontWeight:700,color:"#fff",
    background:"linear-gradient(135deg,#6a8dff,#8a64ff)",cursor:"pointer",marginTop:8
  },
  heroFooter:{marginTop:10,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}, // больше не используется в Loader
  loadWrap:{marginTop:10,display:"grid",justifyItems:"center"},
};

const ux: Record<string, any> = {
  // стеклянная карточка как на «Расписании»
  card:{
    borderRadius:20,
    border:"1px solid rgba(255,255,255,.35)",
    boxShadow:"0 16px 30px rgba(0,0,0,.12)",
    background:"rgba(255,255,255,0.75)",
    backdropFilter:"blur(14px)",
    position:"relative"
  },
  cardHeader:{
    display:"grid",gridTemplateColumns:"24px 1fr",alignItems:"center",gap:10,padding:14,
    borderBottom:"1px solid rgba(255,255,255,.4)",background:"rgba(255,255,255,0.6)"
  },
  iconInline:{width:24,height:24,display:"grid",placeItems:"center",fontSize:18},
  cardTitleRow:{display:"flex",alignItems:"center",gap:6,justifyContent:"space-between"},
  cardTitle:{fontSize:15,fontWeight:750,color:"#1b1b1b",lineHeight:1.2},
  cardHint:{fontSize:11,color:"#2b2b2b",opacity:.85},
};

const mealCard: Record<string, React.CSSProperties> = {
  // стеклянный блок приёма
  wrap:{
    borderRadius:14,
    padding:10,
    display:"grid",
    gap:8,
    background:"rgba(255,255,255,0.75)",
    border:"1px solid rgba(255,255,255,.35)",
    boxShadow:"0 10px 24px rgba(0,0,0,.12)",
    backdropFilter:"blur(10px)",
  },
  header:{display:"grid",gap:4,color:"#1b1b1b"},
  notes:{fontSize:11,color:"#4a4a4a",marginTop:6},
};

const row: Record<string, React.CSSProperties> = {
  name:{fontSize:13.5,fontWeight:750,color:"#111",lineHeight:1.15,whiteSpace:"normal"},
  cues:{fontSize:11,color:"#333"},
};

const food: Record<string, React.CSSProperties> = {
  // строки внутри — тоже стеклянные, но чуть плотнее
  line:{
    display:"grid",
    gridTemplateColumns:"1fr auto",
    alignItems:"center",
    gap:8,
    padding:"10px 12px",
    borderRadius:12,
    background:"rgba(255,255,255,0.9)",
    border:"1px solid rgba(0,0,0,.06)",
    boxShadow:"0 1px 2px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.06)",
    backdropFilter:"blur(6px)",
  },
  left:{display:"flex",alignItems:"baseline",gap:8,minWidth:0},
  textCol:{display:"grid",gap:4,minWidth:0},
  foodName:{fontSize:13.5,fontWeight:400,color:"#1b1b1b",lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
  metaText:{fontSize:11.5,color:"#666",whiteSpace:"pre-wrap",wordBreak:"break-word"},
  qty:{fontSize:12,color:"#666",flexShrink:0},
  right:{fontSize:12,fontWeight:400,color:"#1b1b1b"},
};

const notesStyles: Record<string, React.CSSProperties> = {
  fabWrap:{
    position:"fixed",
    right:16,
    bottom:140,
    display:"flex",
    alignItems:"flex-end",
    gap:8,
    cursor:"pointer",
    zIndex:9999
  },
  // кружок — тем же градиентом, что и кнопка «Сгенерировать заново»
  fabCircle:{
    width:56,height:56,borderRadius:"50%",
    background:SCHEDULE_BTN_GRADIENT,
    border:"none",
    boxShadow:"0 6px 18px rgba(0,0,0,.25)",
    display:"grid",placeItems:"center",
    fontWeight:700,color:"#1b1b1b"
  },
  speechBubble:{
    maxWidth:180,background:"#fff",boxShadow:"0 10px 24px rgba(0,0,0,.15)",
    borderRadius:14,padding:"10px 12px",position:"relative",
    border:"1px solid rgba(0,0,0,.06)"
  },
  speechText:{fontSize:12,fontWeight:600,color:"#1b1b1b",lineHeight:1.3},
  speechArrow:{
    position:"absolute",right:-6,bottom:10,width:0,height:0,
    borderTop:"6px solid transparent",borderBottom:"6px solid transparent",borderLeft:"6px solid #fff",
    filter:"drop-shadow(0 2px 2px rgba(0,0,0,.1))"
  },
  chatPanelWrap:{position:"fixed",right:16,bottom:210,zIndex:10000,maxWidth:300,width:"calc(100% - 32px)"},
  chatPanel:{
    background:"#fff",borderRadius:20,boxShadow:"0 24px 64px rgba(0,0,0,.4)",
    border:"1px solid rgba(0,0,0,.06)",maxHeight:"40vh",display:"flex",flexDirection:"column",overflow:"hidden"
  },
  chatHeader:{
    display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"12px 12px 10px",
    borderBottom:"1px solid rgba(0,0,0,.06)",
    background:"linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))"
  },
  chatHeaderLeft:{display:"flex",alignItems:"center",gap:8},
  robotIconLarge:{fontSize:20,lineHeight:1},
  chatTitle:{fontSize:14,fontWeight:700,color:"#1b1b1b"},
  closeBtn:{
    background:"rgba(0,0,0,0.08)",border:"none",borderRadius:8,width:28,height:28,fontSize:16,fontWeight:600,lineHeight:1,color:"#1b1b1b",
    display:"grid",placeItems:"center",cursor:"pointer"
  },
  chatBody:{padding:12,fontSize:13.5,lineHeight:1.4,color:"#1b1b1b",whiteSpace:"pre-wrap",overflowY:"auto"},
};

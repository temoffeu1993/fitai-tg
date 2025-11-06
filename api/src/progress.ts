import { Router, Response } from "express";
import { q } from "./db.js";
import { asyncHandler } from "./middleware/errorHandler.js";
import { loadScheduleData } from "./utils/scheduleStore.js";

export const progress = Router();

type SummaryResponse = {
  stats: {
    currentWeightKg: number | null;
    weightDelta30d: number | null;
    workoutsTotal: number;
    workoutsDelta30d: number;
    caloriesPerDay: number | null;
    caloriesStatus: "normal" | "deficit" | "surplus" | "none";
    daysWithApp: number;
    planWeeklyGoal: number | null;
    planSeriesCurrent: number;
    planSeriesBest: number;
    dayStreakCurrent: number;
    dayStreakBest: number;
  };
  weightSeries: Array<{ date: string; weight: number }>;
  activity: {
    days: Array<{ date: string; completed: boolean }>;
    weeks: Array<{ label: string; days: Array<{ date: string; completed: boolean }> }>;
    dayStreakCurrent: number;
    dayStreakBest: number;
    planSeriesCurrent: number;
    planSeriesBest: number;
    completedThisWeek: number;
    weeklyGoal: number | null;
    completedThisMonth: number;
    daysInMonth: number;
    totalAllTime: number;
  };
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    badge: string;
    value?: string | null;
    earnedAt?: string | null;
    category: "strength" | "consistency" | "volume" | "nutrition" | "milestone";
  }>;
};

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, offset: number): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + offset);
  return copy;
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function weekLabel(date: Date): string {
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  const startLabel = weekStart.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const endLabel = weekEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return `${startLabel} – ${endLabel}`;
}

function positiveInt(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : typeof value === "number" ? value : null;
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(Number(num));
  return rounded > 0 ? rounded : null;
}

function parseISODateToUTC(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveUserId(req: any): Promise<string> {
  if (req.user?.uid) return req.user.uid;
  const bodyUserId = req.body?.userId || req.query?.userId;
  if (bodyUserId) return bodyUserId;
  const r = await q(
    `INSERT INTO users (tg_id, first_name, username)
       VALUES (0, 'Dev', 'local')
       ON CONFLICT (tg_id) DO UPDATE SET username = excluded.username
       RETURNING id`
  );
  return r[0].id;
}

progress.get(
  "/summary",
  asyncHandler(async (req: any, res: Response) => {
    const userId = await resolveUserId(req);

    const scheduleData = await loadScheduleData(userId);

    const [onboardingRow] = await q<{ data: any | null; summary: any | null }>(
      `SELECT data, summary
         FROM onboardings
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 1`,
      [userId]
    );

    const onboardingData = onboardingRow?.data ?? null;
    const onboardingSummary = onboardingRow?.summary ?? null;

    const daysFromOnboarding =
      positiveInt(onboardingData?.schedule?.daysPerWeek) ??
      positiveInt(onboardingSummary?.schedule?.daysPerWeek) ??
      positiveInt(onboardingSummary?.freq);

    const [currentWeightRow] = await q<{ weight: number | null; recorded_at: string | null }>(
      `SELECT weight, recorded_at
         FROM body_metrics
        WHERE user_id = $1 AND weight IS NOT NULL
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [userId]
    );

    const currentWeight = currentWeightRow?.weight ?? null;

    const [weightMonthRow] = await q<{ weight: number | null }>(
      `SELECT weight
         FROM body_metrics
        WHERE user_id = $1
          AND recorded_at <= (CURRENT_DATE - INTERVAL '30 days')
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [userId]
    );

    const weightDelta30d =
      currentWeight != null && weightMonthRow?.weight != null
        ? Number((currentWeight - weightMonthRow.weight).toFixed(2))
        : null;

    const [{ total_workouts }] = await q<{ total_workouts: number }>(
      `SELECT COUNT(*)::int AS total_workouts
         FROM workout_sessions
        WHERE user_id = $1`,
      [userId]
    );

    const [{ workouts_last_30 }] = await q<{ workouts_last_30: number }>(
      `SELECT COUNT(*)::int AS workouts_last_30
         FROM workout_sessions
        WHERE user_id = $1
          AND finished_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    );

    const [{ workouts_prev_30 }] = await q<{ workouts_prev_30: number }>(
      `SELECT COUNT(*)::int AS workouts_prev_30
         FROM workout_sessions
        WHERE user_id = $1
          AND finished_at >= NOW() - INTERVAL '60 days'
          AND finished_at < NOW() - INTERVAL '30 days'`,
      [userId]
    );

    const workoutsDelta30d = workouts_last_30 - workouts_prev_30;

    const [latestPlan] = await q<{ goal_kcal: number | null }>(
      `SELECT goal_kcal
         FROM nutrition_plans
        WHERE user_id = $1
        ORDER BY week_start_date DESC
        LIMIT 1`,
      [userId]
    );

    const caloriesPerDay = latestPlan?.goal_kcal ?? null;
    const caloriesStatus: SummaryResponse["stats"]["caloriesStatus"] =
      caloriesPerDay == null
        ? "none"
        : caloriesPerDay < 1800
        ? "deficit"
        : caloriesPerDay > 2600
        ? "surplus"
        : "normal";

    const [{ days_with_app }] = await q<{ days_with_app: number }>(
      `WITH events(created_at) AS (
         SELECT created_at FROM workout_sessions WHERE user_id = $1
         UNION ALL
         SELECT created_at FROM nutrition_plans WHERE user_id = $1
         UNION ALL
         SELECT created_at FROM body_metrics WHERE user_id = $1
         UNION ALL
         SELECT created_at FROM users WHERE id = $1
       )
       SELECT GREATEST(
         1,
         DATE_PART('day', NOW() - COALESCE(MIN(created_at), NOW()))::int
       ) AS days_with_app
       FROM events`,
      [userId]
    );

    const sessions = await q<{ finished_at: Date }>(
      `SELECT finished_at
         FROM workout_sessions
        WHERE user_id = $1
        ORDER BY finished_at DESC
        LIMIT 200`,
      [userId]
    );

    const sessionDates = sessions.map((s) => toISODate(new Date(s.finished_at)));
    const uniqueSessionDates = Array.from(new Set(sessionDates));
    const todayIso = toISODate(new Date());

    let dayStreak = 0;
    let cursor = new Date();
    while (uniqueSessionDates.includes(toISODate(cursor))) {
      dayStreak += 1;
      cursor = addDays(cursor, -1);
    }

    const completedSet = new Set(uniqueSessionDates);
    const activityDays: Array<{ date: string; completed: boolean }> = [];
    for (let i = 27; i >= 0; i--) {
      const day = toISODate(addDays(new Date(), -i));
      activityDays.push({ date: day, completed: completedSet.has(day) });
    }

    const weeks: Array<{ label: string; days: Array<{ date: string; completed: boolean }> }> = [];
    for (let i = 0; i < activityDays.length; i += 7) {
      const chunk = activityDays.slice(i, i + 7);
      if (chunk.length === 0) continue;
      const label = weekLabel(new Date(chunk[0].date));
      weeks.push({ label, days: chunk });
    }

    const completedThisMonth = uniqueSessionDates.filter((date) => date.slice(0, 7) === todayIso.slice(0, 7)).length;
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

    const sortedAscDates = [...uniqueSessionDates].sort();
    let bestDayStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;
    for (const iso of sortedAscDates) {
      const currentDate = new Date(iso);
      if (prevDate) {
        const diff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          tempStreak += 1;
        } else if (diff > 1) {
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
      bestDayStreak = Math.max(bestDayStreak, tempStreak);
      prevDate = currentDate;
    }

    const recurringWeeklyGoal =
      Object.values(scheduleData.dow ?? {}).filter((slot: any) => slot && slot.enabled).length || 0;

    const weeklySpecificTargets = new Map<string, number>();
    Object.entries(scheduleData.dates ?? {}).forEach(([iso, value]) => {
      const slotDate = parseISODateToUTC(iso);
      if (!slotDate || typeof value !== "object" || value == null) return;
      const weekKey = toISODate(startOfWeek(slotDate));
      weeklySpecificTargets.set(weekKey, (weeklySpecificTargets.get(weekKey) ?? 0) + 1);
    });

    const completionsByWeek = new Map<string, number>();
    for (const session of sessions) {
      const finishedAt = new Date(session.finished_at);
      if (!Number.isFinite(finishedAt.getTime())) continue;
      const weekKey = toISODate(startOfWeek(finishedAt));
      completionsByWeek.set(weekKey, (completionsByWeek.get(weekKey) ?? 0) + 1);
    }

    const baseWeeklyGoal = daysFromOnboarding ?? recurringWeeklyGoal;
    const currentWeekStart = startOfWeek(new Date());
    const currentWeekKey = toISODate(currentWeekStart);

    const weekKeys = new Set<string>([
      ...weeklySpecificTargets.keys(),
      ...completionsByWeek.keys(),
    ]);
    weekKeys.add(currentWeekKey);

    let earliestWeekDate: Date | null = null;
    for (const key of weekKeys) {
      const v = parseISODateToUTC(key);
      if (!v) continue;
      if (!earliestWeekDate || v < earliestWeekDate) {
        earliestWeekDate = v;
      }
    }
    const loopStart = earliestWeekDate ?? currentWeekStart;

    const weeklyGoalComputed = new Map<string, number>();
    let runningPlanSeries = 0;
    let bestPlanSeries = 0;
    let currentPlanSeries = 0;

    for (
      let weekCursor = new Date(loopStart);
      weekCursor <= currentWeekStart;
      weekCursor = addDays(weekCursor, 7)
    ) {
      const weekKey = toISODate(weekCursor);
      const specificTarget = weeklySpecificTargets.get(weekKey) ?? 0;
      const target =
        specificTarget > 0
          ? specificTarget
          : baseWeeklyGoal && baseWeeklyGoal > 0
          ? baseWeeklyGoal
          : 0;

      weeklyGoalComputed.set(weekKey, target);

      if (target <= 0) {
        continue;
      }

      const completed = completionsByWeek.get(weekKey) ?? 0;
      if (completed >= target) {
        runningPlanSeries += 1;
      } else {
        runningPlanSeries = 0;
      }
      if (runningPlanSeries > bestPlanSeries) {
        bestPlanSeries = runningPlanSeries;
      }
      if (weekKey === currentWeekKey) {
        currentPlanSeries = runningPlanSeries;
      }
    }

    const weeklyGoalCurrent = weeklyGoalComputed.get(currentWeekKey) ?? (baseWeeklyGoal ?? 0);
    const planWeeklyGoal = weeklyGoalCurrent > 0 ? weeklyGoalCurrent : null;
    const completedThisWeek = completionsByWeek.get(currentWeekKey) ?? 0;

    // Weight series last 90 days
    const weightSeriesRows = await q<{ recorded_at: string; weight: number }>(
      `SELECT recorded_at::text, weight
         FROM body_metrics
        WHERE user_id = $1
          AND weight IS NOT NULL
          AND recorded_at >= COALESCE((
            SELECT MIN(finished_at)::date FROM workout_sessions WHERE user_id = $1
          ), CURRENT_DATE - INTERVAL '120 days')
        ORDER BY recorded_at ASC`,
      [userId]
    );

    const weightSeries = weightSeriesRows.map((row) => ({ date: row.recorded_at, weight: Number(row.weight) }));

    // Personal records from workout sessions payload
    const recordRows = await q<{ payload: any; finished_at: string }>(
      `SELECT payload, finished_at
         FROM workout_sessions
        WHERE user_id = $1
          AND payload IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 200`,
      [userId]
    );

    const prMap = new Map<string, { weight?: number; reps?: number; updatedAt: string }>();

    for (const row of recordRows) {
      const finishedAt = row.finished_at;
      const payload = row.payload || {};
      const exercises = Array.isArray(payload.exercises) ? payload.exercises : [];
      for (const exercise of exercises) {
        const name: string | undefined = exercise?.name;
        if (!name) continue;
        const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
        for (const set of sets) {
          const weight = typeof set.weight === "number" ? set.weight : Number(set.weight);
          const reps = typeof set.reps === "number" ? set.reps : Number(set.reps);
          if (!Number.isFinite(weight) && !Number.isFinite(reps)) continue;
          const current = prMap.get(name) || { weight: undefined, reps: undefined, updatedAt: finishedAt };
          let updated = false;
          if (Number.isFinite(weight) && (current.weight == null || weight > current.weight)) {
            current.weight = Number(weight);
            current.updatedAt = finishedAt;
            updated = true;
          }
          if (Number.isFinite(reps) && (current.reps == null || reps > current.reps)) {
            current.reps = Number(reps);
            current.updatedAt = finishedAt;
            updated = true;
          }
          if (updated) {
            prMap.set(name, current);
          }
        }
      }
    }

    const achievements: SummaryResponse["achievements"] = [];
    const addAchievement = (achievement: SummaryResponse["achievements"][number]) => {
      if (achievements.some((item) => item.id === achievement.id)) return;
      achievements.push(achievement);
    };

    const nowIso = new Date().toISOString();

    const strengthEntries = Array.from(prMap.entries()).map(([exercise, data]) => {
      const score =
        data.weight != null
          ? data.weight
          : data.reps != null
          ? data.reps
          : 0;
      let value = "";
      if (data.weight != null) value = `${data.weight} кг`;
      if (data.reps != null && data.weight == null) value = `${data.reps} повторов`;
      if (data.reps != null && data.weight != null) value = `${data.weight} кг × ${data.reps}`;
      return {
        exercise,
        score,
        value,
        updatedAt: data.updatedAt ?? null,
      };
    });

    const strengthBadges = ["medal-gold", "medal-silver", "medal-bronze", "medal-purple", "medal-blue", "medal-green"];

    strengthEntries
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .forEach((entry, idx) => {
        const badgeCode = strengthBadges[idx] ?? "medal-default";
        const icon =
          idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx === 3 ? "💪" : idx === 4 ? "⚡️" : "⭐️";
        addAchievement({
          id: `strength-${slugify(entry.exercise)}`,
          title: entry.exercise,
          description: "Личный рекорд в упражнении",
          value: entry.value,
          icon,
          badge: badgeCode,
          earnedAt: entry.updatedAt,
          category: "strength",
        });
      });

    const volumeMilestones = [
      { id: "volume-1", threshold: 1, title: "Первый шаг", description: "Записана первая тренировка", icon: "🎯" },
      { id: "volume-10", threshold: 10, title: "10 тренировок", description: "Десять завершённых тренировок", icon: "🏅" },
      { id: "volume-25", threshold: 25, title: "25 тренировок", description: "Уверенный темп и дисциплина", icon: "🥈" },
      { id: "volume-50", threshold: 50, title: "50 тренировок", description: "Полсотни тренировок в истории", icon: "🥇" },
      { id: "volume-100", threshold: 100, title: "100 тренировок", description: "Сотня записанных сессий — мощно!", icon: "🏆" },
    ];
    const reachedVolume = volumeMilestones.filter((m) => total_workouts >= m.threshold).pop();
    if (reachedVolume) {
      const badgeCode = `volume-${reachedVolume.threshold}`;
      addAchievement({
        id: reachedVolume.id,
        title: reachedVolume.title,
        description: reachedVolume.description,
        value: `${total_workouts}`,
        icon: reachedVolume.icon,
        badge: badgeCode,
        earnedAt: nowIso,
        category: "volume",
      });
    }

    const planMilestones = [
      { id: "plan-1", threshold: 1, title: "Неделя по плану", description: "Выполнил недельную норму тренировок", icon: "✅" },
      { id: "plan-4", threshold: 4, title: "Месяц по плану", description: "4 недели подряд соблюдаешь график", icon: "📆" },
      { id: "plan-8", threshold: 8, title: "Два месяца по плану", description: "8 недель без срывов по графику", icon: "📆" },
      { id: "plan-12", threshold: 12, title: "Квартал по плану", description: "12 недель стабильно по расписанию", icon: "🏅" },
    ];
    const reachedPlan = planMilestones.filter((m) => bestPlanSeries >= m.threshold).pop();
    if (reachedPlan) {
      const badgeCode = `plan-${reachedPlan.threshold}`;
      addAchievement({
        id: reachedPlan.id,
        title: reachedPlan.title,
        description: reachedPlan.description,
        value: `${bestPlanSeries} нед.`,
        icon: reachedPlan.icon,
        badge: badgeCode,
        earnedAt: nowIso,
        category: "consistency",
      });
    }

    const dayMilestones = [
      { id: "day-3", threshold: 3, title: "3 дня подряд", description: "Три тренировки без пропусков", icon: "🔥" },
      { id: "day-7", threshold: 7, title: "Неделя подряд", description: "Неделя тренировок каждый день", icon: "🔥" },
      { id: "day-14", threshold: 14, title: "Две недели подряд", description: "Две недели без единого пропуска", icon: "🔥" },
    ];
    const reachedDay = dayMilestones.filter((m) => bestDayStreak >= m.threshold).pop();
    if (reachedDay) {
      const badgeCode = `streak-${reachedDay.threshold}`;
      addAchievement({
        id: reachedDay.id,
        title: reachedDay.title,
        description: reachedDay.description,
        value: `${bestDayStreak} дней`,
        icon: reachedDay.icon,
        badge: badgeCode,
        earnedAt: nowIso,
        category: "consistency",
      });
    }

    const response: SummaryResponse = {
      stats: {
        currentWeightKg: currentWeight,
        weightDelta30d,
        workoutsTotal: total_workouts,
        workoutsDelta30d,
        caloriesPerDay,
        caloriesStatus,
        daysWithApp: days_with_app,
        planWeeklyGoal,
        planSeriesCurrent: currentPlanSeries,
        planSeriesBest: bestPlanSeries,
        dayStreakCurrent: dayStreak,
        dayStreakBest: bestDayStreak,
      },
      weightSeries,
      activity: {
        days: activityDays,
        weeks,
        dayStreakCurrent: dayStreak,
        dayStreakBest: bestDayStreak,
        planSeriesCurrent: currentPlanSeries,
        planSeriesBest: bestPlanSeries,
        completedThisWeek,
        weeklyGoal: planWeeklyGoal,
        completedThisMonth,
        daysInMonth,
        totalAllTime: uniqueSessionDates.length,
      },
      achievements,
    };

    res.json(response);
  })
);

progress.post(
  "/body-metrics",
  asyncHandler(async (req: any, res: Response) => {
    const userId = await resolveUserId(req);
    const payload = req.body || {};
    const recordedAtRaw = payload.recordedAt || payload.date;
    const weight = payload.weight != null ? Number(payload.weight) : null;
    const bodyFat = payload.bodyFat != null ? Number(payload.bodyFat) : null;
    const muscle = payload.muscleMass != null ? Number(payload.muscleMass) : null;
    const notes = typeof payload.notes === "string" ? payload.notes.slice(0, 500) : null;

    const recordedAt = recordedAtRaw ? new Date(recordedAtRaw) : new Date();
    if (!Number.isFinite(recordedAt.getTime())) {
      return res.status(400).json({ error: "invalid_date" });
    }

    const iso = recordedAt.toISOString().slice(0, 10);

    await q(
      `INSERT INTO body_metrics (user_id, recorded_at, weight, body_fat, muscle_mass, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, recorded_at)
       DO UPDATE SET weight = EXCLUDED.weight,
                     body_fat = EXCLUDED.body_fat,
                     muscle_mass = EXCLUDED.muscle_mass,
                     notes = EXCLUDED.notes,
                     updated_at = now()`,
      [userId, iso, weight, bodyFat, muscle, notes]
    );

    res.json({ ok: true, recordedAt: iso });
  })
);

export default progress;

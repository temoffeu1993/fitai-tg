import { Router, Response } from "express";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { loadScheduleData } from "./utils/scheduleStore.js";
import { buildGamificationSummary } from "./gamification.js";
import { computeMuscleFocus } from "./progressMuscleFocus.js";
import { EXERCISE_LIBRARY, type Exercise } from "./exerciseLibrary.js";

// ── Exercise library helpers ──────────────────────────────────────────────────

const EXERCISE_BY_ID = new Map<string, Exercise>();
const EXERCISE_NAME_NORM = new Map<string, Exercise>();

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-яa-z0-9]/g, "").trim();
}

for (const ex of EXERCISE_LIBRARY) {
  EXERCISE_BY_ID.set(ex.id, ex);
  EXERCISE_NAME_NORM.set(normalizeName(ex.name), ex);
  if (ex.aliases) {
    for (const a of ex.aliases) EXERCISE_NAME_NORM.set(normalizeName(a), ex);
  }
}

function resolveExercise(exercisePayload: any): Exercise | null {
  const id = exercisePayload?.exerciseId || exercisePayload?.id;
  if (typeof id === "string" && EXERCISE_BY_ID.has(id)) return EXERCISE_BY_ID.get(id)!;
  const name = exercisePayload?.exerciseName || exercisePayload?.name;
  if (typeof name === "string") {
    const norm = normalizeName(name);
    if (EXERCISE_NAME_NORM.has(norm)) return EXERCISE_NAME_NORM.get(norm)!;
  }
  return null;
}

type MetricKind = "weight" | "reps" | "duration" | "assistance";

function getMetricKind(ex: Exercise): MetricKind {
  const loadable = new Set(["barbell", "dumbbell", "machine", "cable", "smith", "kettlebell", "landmine"]);
  const hasLoadable = ex.equipment.some((e) => loadable.has(e));
  if (hasLoadable && ex.weightInverted) return "assistance";
  if (hasLoadable) return "weight";
  if (ex.isTimeBased) return "duration";
  return "reps";
}

type ExercisePoint = { date: string; value: number; estimated1RM?: number };

async function computeExerciseProgress(userId: string) {
  const allSessions = await q<{ id: string; finished_at: string; payload: any }>(
    `SELECT id, finished_at::text, payload FROM workout_sessions
     WHERE user_id = $1 AND finished_at >= NOW() - INTERVAL '365 days' AND payload IS NOT NULL
     ORDER BY finished_at ASC`,
    [userId]
  );

  // Map: exerciseKey → { name, metricKind, supports1RM, points[], sessionCount }
  const exMap = new Map<string, {
    name: string;
    metricKind: MetricKind;
    supports1RM: boolean;
    sessionCount: number;
    points: ExercisePoint[];
  }>();

  for (const session of allSessions) {
    const exercises: any[] = Array.isArray(session.payload?.exercises) ? session.payload.exercises : [];
    const sessionDate = session.finished_at.slice(0, 10); // ISO date

    // Track best value per exercise per session
    const sessionBest = new Map<string, ExercisePoint>();

    for (const exPayload of exercises) {
      if (exPayload?.done === false || exPayload?.skipped === true) continue;

      const libEx = resolveExercise(exPayload);
      if (!libEx) continue;

      const metricKind = getMetricKind(libEx);
      const supports1RM = metricKind === "weight";
      const sets: any[] = Array.isArray(exPayload?.sets) ? exPayload.sets : [];

      let bestValue: number | null = null;
      let best1RM: number | null = null;

      for (const set of sets) {
        if (set?.done === false) continue;
        const w = typeof set?.weight === "number" ? set.weight : 0;
        const r = typeof set?.reps === "number" ? set.reps : 0;

        switch (metricKind) {
          case "weight":
            if (w > 0 && r > 0 && r <= 30) {
              if (bestValue === null || w > bestValue) bestValue = w;
              if (r >= 1 && r <= 12) {
                const e1rm = w * (1 + r / 30);
                if (best1RM === null || e1rm > best1RM) best1RM = Math.round(e1rm * 10) / 10;
              }
            }
            break;
          case "assistance":
            if (w > 0 && r > 0) {
              if (bestValue === null || w < bestValue) bestValue = w; // less assistance = better
            }
            break;
          case "reps":
            if (r > 0) {
              if (bestValue === null || r > bestValue) bestValue = r;
            }
            break;
          case "duration":
            if (r > 0) { // reps = seconds for isTimeBased
              if (bestValue === null || r > bestValue) bestValue = r;
            }
            break;
        }
      }

      if (bestValue === null) continue;

      const point: ExercisePoint = { date: sessionDate, value: bestValue };
      if (best1RM != null) point.estimated1RM = best1RM;

      // Keep best per exercise per session (for assistance: lower = better)
      const existing = sessionBest.get(libEx.id);
      if (!existing
        || (metricKind === "assistance" ? bestValue < existing.value : bestValue > existing.value)) {
        sessionBest.set(libEx.id, point);
      }

      // Ensure exercise entry exists
      if (!exMap.has(libEx.id)) {
        exMap.set(libEx.id, {
          name: libEx.name,
          metricKind,
          supports1RM,
          sessionCount: 0,
          points: [],
        });
      }
    }

    // Merge session bests into exMap
    for (const [exId, point] of sessionBest) {
      const entry = exMap.get(exId)!;
      entry.sessionCount++;
      entry.points.push(point);
    }
  }

  // Filter: ≥ 3 data points, sort by sessionCount desc
  const exercises = Array.from(exMap.entries())
    .filter(([, v]) => v.points.length >= 3)
    .sort((a, b) => b[1].sessionCount - a[1].sessionCount)
    .map(([key, v]) => ({
      key,
      name: v.name,
      metricKind: v.metricKind,
      supports1RM: v.supports1RM,
      sessionCount: v.sessionCount,
      points: v.points,
    }));

  return { exercises };
}

export const progress = Router();

function toNumberBe(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function computeSessionTonnage(payload: any): number {
  const exercises: any[] = Array.isArray(payload?.exercises) ? payload.exercises : [];
  let total = 0;
  for (const ex of exercises) {
    if (ex?.done === false || ex?.skipped === true) continue;
    const sets: any[] = Array.isArray(ex?.sets) ? ex.sets : [];
    for (const set of sets) {
      if (set?.done === false) continue;
      const w = toNumberBe(set?.weight) ?? 0;
      const r = toNumberBe(set?.reps) ?? 0;
      if (w > 0 && r > 0) total += w * r;
    }
  }
  return total;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function toISODate(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(base: Date, offset: number): Date {
  const copy = new Date(base); copy.setDate(copy.getDate() + offset); return copy;
}
function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day); copy.setHours(0, 0, 0, 0); return copy;
}
function weekLabel(date: Date): string {
  const ws = startOfWeek(date);
  const we = addDays(ws, 6);
  const sl = ws.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const el = we.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return `${sl} – ${el}`;
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
  return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-+|-+$/g, "");
}
function resolveUserId(req: any): string {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
}

// ─── Goal journey builder ─────────────────────────────────────────────────────

function buildGoalJourney(
  goal: string,
  workoutsTotal: number,
  hasPR: boolean,
  hasWeight: boolean,
  dayStreakBest: number,
  planSeriesBest: number,
  weightDelta: number | null,
  targetWeightDelta: number | null
): { goal: string; milestones: any[]; nextGoalText: string } {
  type Milestone = { id: string; label: string; emoji: string; completed: boolean; current: boolean; value?: string };
  let milestones: Milestone[] = [];

  if (goal === "lose_weight") {
    const delta = weightDelta != null ? Math.abs(weightDelta) : 0;
    milestones = [
      { id: "m1", label: "Старт", emoji: "🎯", completed: true, current: false },
      { id: "m2", label: "Записать вес", emoji: "📊", completed: hasWeight, current: !hasWeight && workoutsTotal >= 1 },
      { id: "m3", label: "10 трен.", emoji: "🔥", completed: workoutsTotal >= 10, current: !hasWeight ? false : workoutsTotal >= 1 && workoutsTotal < 10 },
      { id: "m4", label: "−2 кг", emoji: "⚖️", completed: delta >= 2, current: workoutsTotal >= 10 && delta < 2 },
      { id: "m5", label: "Месяц", emoji: "💪", completed: planSeriesBest >= 4, current: delta >= 2 && planSeriesBest < 4 },
      { id: "m6", label: "−5 кг", emoji: "⚖️", completed: delta >= 5, current: planSeriesBest >= 4 && delta < 5 },
      { id: "m7", label: "Цель!", emoji: "🏆", completed: targetWeightDelta != null && delta >= targetWeightDelta, current: delta >= 5 },
    ];
  } else if (goal === "build_muscle") {
    milestones = [
      { id: "m1", label: "Старт", emoji: "🎯", completed: true, current: false },
      { id: "m2", label: "Замеры", emoji: "📏", completed: false, current: workoutsTotal >= 1 },
      { id: "m3", label: "10 трен.", emoji: "🔥", completed: workoutsTotal >= 10, current: workoutsTotal >= 1 && workoutsTotal < 10 },
      { id: "m4", label: "Первый PR", emoji: "💪", completed: hasPR, current: workoutsTotal >= 10 && !hasPR },
      { id: "m5", label: "+5 кг в базовых", emoji: "📈", completed: false, current: hasPR },
      { id: "m6", label: "Месяц прогрессии", emoji: "💪", completed: planSeriesBest >= 4, current: false },
      { id: "m7", label: "Цель!", emoji: "🏆", completed: false, current: planSeriesBest >= 4 },
    ];
  } else {
    // athletic_body / health_wellness
    milestones = [
      { id: "m1", label: "Старт", emoji: "🎯", completed: true, current: false },
      { id: "m2", label: "Серия 2 нед.", emoji: "🔥", completed: planSeriesBest >= 2, current: workoutsTotal >= 1 && planSeriesBest < 2 },
      { id: "m3", label: "10 трен.", emoji: "🔥", completed: workoutsTotal >= 10, current: planSeriesBest >= 2 && workoutsTotal < 10 },
      { id: "m4", label: "Первый PR", emoji: "💪", completed: hasPR, current: workoutsTotal >= 10 && !hasPR },
      { id: "m5", label: "Серия 4 нед.", emoji: "📈", completed: planSeriesBest >= 4, current: hasPR && planSeriesBest < 4 },
      { id: "m6", label: "25 трен.", emoji: "⚡", completed: workoutsTotal >= 25, current: planSeriesBest >= 4 && workoutsTotal < 25 },
      { id: "m7", label: "Цель!", emoji: "🏆", completed: planSeriesBest >= 8, current: workoutsTotal >= 25 },
    ];
  }

  // Fix: exactly one "current" (first incomplete after last completed)
  let lastCompleted = -1;
  milestones.forEach((m, i) => { if (m.completed) lastCompleted = i; });
  milestones = milestones.map((m, i) => ({
    ...m,
    current: !m.completed && i === lastCompleted + 1,
  }));

  const nextMilestone = milestones.find((m) => !m.completed);
  const nextGoalText = nextMilestone
    ? `Следующая цель: ${nextMilestone.emoji} ${nextMilestone.label}`
    : "Все цели достигнуты! 🏆";

  return { goal, milestones, nextGoalText };
}

// ─── Achievement builder ──────────────────────────────────────────────────────

type AchievementEarned = { id: string; title: string; icon: string; earnedAt: string; badge?: string };
type AchievementUpcoming = { id: string; title: string; icon: string; current: number; target: number; percent: number };

// ─── Summary endpoint ─────────────────────────────────────────────────────────

progress.get(
  "/summary",
  asyncHandler(async (req: any, res: Response) => {
    const userId = resolveUserId(req);

    const scheduleData = await loadScheduleData(userId);

    const [onboardingRow] = await q<{ data: any | null; summary: any | null }>(
      `SELECT data, summary FROM onboardings WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );
    const onboardingData = onboardingRow?.data ?? null;
    const onboardingSummary = onboardingRow?.summary ?? null;

    const daysFromOnboarding =
      positiveInt(onboardingData?.schedule?.daysPerWeek) ??
      positiveInt(onboardingSummary?.schedule?.daysPerWeek) ??
      positiveInt(onboardingSummary?.freq);

    const userGoal: string =
      onboardingData?.goal ??
      onboardingSummary?.goal ??
      "health_wellness";

    const onboardingWeight: number | null =
      toNumberBe(onboardingData?.body?.weight) ??
      toNumberBe(onboardingSummary?.weight) ??
      null;

    const onboardingHeight: number | null =
      toNumberBe(onboardingData?.body?.height) ??
      toNumberBe(onboardingSummary?.height) ??
      null;

    const onboardingTargetWeight: number | null =
      toNumberBe(onboardingData?.body?.targetWeight) ??
      toNumberBe(onboardingSummary?.targetWeight) ??
      null;

    // ── Weight metrics ──────────────────────────────────────────────────────
    const [currentWeightRow] = await q<{ weight: number | null; recorded_at: string | null }>(
      `SELECT weight, recorded_at FROM body_metrics WHERE user_id = $1 AND weight IS NOT NULL ORDER BY recorded_at DESC LIMIT 1`,
      [userId]
    );
    const currentWeight = currentWeightRow?.weight ?? null;

    const [weightMonthRow] = await q<{ weight: number | null }>(
      `SELECT weight FROM body_metrics WHERE user_id = $1 AND recorded_at <= (CURRENT_DATE - INTERVAL '30 days') ORDER BY recorded_at DESC LIMIT 1`,
      [userId]
    );
    const weightDelta30d =
      currentWeight != null && weightMonthRow?.weight != null
        ? Number((currentWeight - weightMonthRow.weight).toFixed(2))
        : null;

    const effectiveCurrentWeight = currentWeight ?? onboardingWeight;
    const weightSource: "metrics" | "onboarding" = currentWeight != null ? "metrics" : "onboarding";

    // BMI
    const bmi =
      effectiveCurrentWeight != null && onboardingHeight != null && onboardingHeight > 0
        ? Number((effectiveCurrentWeight / Math.pow(onboardingHeight / 100, 2)).toFixed(1))
        : null;

    // Weight series
    const weightSeriesRows = await q<{ recorded_at: string; weight: number }>(
      `SELECT recorded_at::text, weight FROM body_metrics WHERE user_id = $1 AND weight IS NOT NULL AND recorded_at >= COALESCE((SELECT MIN(finished_at)::date FROM workout_sessions WHERE user_id = $1), CURRENT_DATE - INTERVAL '180 days') ORDER BY recorded_at ASC`,
      [userId]
    );
    const weightSeries = weightSeriesRows.map((r) => ({ date: r.recorded_at, weight: Number(r.weight) }));

    // Body measurements
    let latestMeasurements: any | null = null;
    let firstMeasurements: any | null = null;
    let measurementSeries: any[] = [];
    try {
      const allRows = await q<any>(
        `SELECT chest_cm, waist_cm, hips_cm, bicep_left_cm, bicep_right_cm, neck_cm, thigh_cm, recorded_at::text, notes
         FROM body_measurements WHERE user_id = $1 ORDER BY recorded_at ASC`,
        [userId]
      );
      measurementSeries = allRows.map((r: any) => ({
        date: r.recorded_at,
        chest_cm: toNumberBe(r.chest_cm),
        waist_cm: toNumberBe(r.waist_cm),
        hips_cm: toNumberBe(r.hips_cm),
        bicep_left_cm: toNumberBe(r.bicep_left_cm),
        bicep_right_cm: toNumberBe(r.bicep_right_cm),
        neck_cm: toNumberBe(r.neck_cm),
        thigh_cm: toNumberBe(r.thigh_cm),
      }));
      latestMeasurements = allRows.length > 0 ? allRows[allRows.length - 1] : null;
      firstMeasurements = allRows.length > 1 ? allRows[0] : null;
    } catch { /* table may not exist yet */ }

    let deltaFromFirst: any | null = null;
    if (latestMeasurements && firstMeasurements && latestMeasurements.recorded_at !== firstMeasurements.recorded_at) {
      deltaFromFirst = {};
      const fields = ["chest_cm", "waist_cm", "hips_cm", "bicep_left_cm", "bicep_right_cm", "neck_cm", "thigh_cm"] as const;
      for (const f of fields) {
        const a = toNumberBe(firstMeasurements[f]);
        const b = toNumberBe(latestMeasurements[f]);
        if (a != null && b != null) deltaFromFirst[f] = Number((b - a).toFixed(1));
      }
    }

    // ── Workout sessions ───────────────────────────────────────────────────
    const [{ total_workouts }] = await q<{ total_workouts: number }>(
      `SELECT COUNT(*)::int AS total_workouts FROM workout_sessions WHERE user_id = $1`,
      [userId]
    );
    const [{ workouts_last_30 }] = await q<{ workouts_last_30: number }>(
      `SELECT COUNT(*)::int AS workouts_last_30 FROM workout_sessions WHERE user_id = $1 AND finished_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    );
    const [{ workouts_prev_30 }] = await q<{ workouts_prev_30: number }>(
      `SELECT COUNT(*)::int AS workouts_prev_30 FROM workout_sessions WHERE user_id = $1 AND finished_at >= NOW() - INTERVAL '60 days' AND finished_at < NOW() - INTERVAL '30 days'`,
      [userId]
    );
    const workoutsDelta30d = workouts_last_30 - workouts_prev_30;

    // ── All sessions with payload (for muscle accent, PR, volume) ─────────
    const sessions = await q<{ id: string; finished_at: string; payload: any }>(
      `SELECT id, finished_at::text, payload FROM workout_sessions WHERE user_id = $1 AND payload IS NOT NULL ORDER BY finished_at DESC LIMIT 300`,
      [userId]
    );

    // ── Muscle accent (aggregate) ──────────────────────────────────────────
    const now = new Date();
    const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ago7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const allPayloads = sessions.map((s) => s.payload);
    const payloads30d = sessions.filter((s) => new Date(s.finished_at) >= ago30).map((s) => s.payload);
    const payloads7d = sessions.filter((s) => new Date(s.finished_at) >= ago7).map((s) => s.payload);

    const muscleAccent = {
      all: computeMuscleFocus(allPayloads),
      last30d: computeMuscleFocus(payloads30d),
      last7d: computeMuscleFocus(payloads7d),
    };

    // ── Personal records with e1RM ─────────────────────────────────────────
    type PREntry = { bestWeight: number; bestReps: number; firstWeight: number | null; achievedAt: string; isFirst: boolean };
    const prMap = new Map<string, PREntry>();
    const firstSessionId = sessions.length > 0 ? sessions[sessions.length - 1].id : null;

    // Process chronologically for isFirst detection
    for (let i = sessions.length - 1; i >= 0; i--) {
      const row = sessions[i];
      const finishedAt = row.finished_at;
      const exercises: any[] = Array.isArray(row.payload?.exercises) ? row.payload.exercises : [];
      for (const exercise of exercises) {
        const name: string | undefined = exercise?.name;
        const loadType: string = exercise?.loadType ?? "";
        if (!name || (loadType && loadType !== "external" && loadType !== "")) continue;
        const sets: any[] = Array.isArray(exercise.sets) ? exercise.sets : [];
        for (const set of sets) {
          const weight = toNumberBe(set?.weight);
          const reps = toNumberBe(set?.reps);
          if (!weight || weight <= 0 || !reps || reps <= 0) continue;
          const existing = prMap.get(name);
          if (!existing) {
            prMap.set(name, { bestWeight: weight, bestReps: reps, firstWeight: weight, achievedAt: finishedAt, isFirst: true });
          } else {
            if (weight > existing.bestWeight || (weight === existing.bestWeight && reps > existing.bestReps)) {
              const isFirst = row.id === firstSessionId;
              prMap.set(name, { ...existing, bestWeight: weight, bestReps: reps, achievedAt: finishedAt, isFirst });
            }
          }
        }
      }
    }

    const personalRecords = Array.from(prMap.entries())
      .map(([name, data]) => ({
        name,
        bestWeight: data.bestWeight,
        bestReps: data.bestReps,
        estimated1RM: Math.round(data.bestWeight * (1 + data.bestReps / 30) * 10) / 10,
        achievedAt: data.achievedAt,
        delta: data.isFirst ? null : (data.firstWeight != null ? Number((data.bestWeight - data.firstWeight).toFixed(1)) : null),
        isFirst: data.isFirst,
      }))
      .sort((a, b) => b.bestWeight - a.bestWeight)
      .slice(0, 8);

    // ── Volume trend (last 12 weeks) ────────────────────────────────────────
    const volumeWeeks: { weekStart: string; tonnage: number; sessions: number; mesoPhase: string | null }[] = [];
    const weekTonnageMap = new Map<string, { tonnage: number; sessions: number }>();
    for (const session of sessions) {
      const d = new Date(session.finished_at);
      const wk = toISODate(startOfWeek(d));
      const tonnage = computeSessionTonnage(session.payload);
      const cur = weekTonnageMap.get(wk) ?? { tonnage: 0, sessions: 0 };
      weekTonnageMap.set(wk, { tonnage: cur.tonnage + tonnage, sessions: cur.sessions + 1 });
    }
    // Build last 12 weeks sorted
    const twelveWeeksAgo = addDays(new Date(), -84);
    let weekCursor = startOfWeek(twelveWeeksAgo);
    const currentWeekStart = startOfWeek(new Date());
    while (weekCursor <= currentWeekStart) {
      const wk = toISODate(weekCursor);
      const data = weekTonnageMap.get(wk) ?? { tonnage: 0, sessions: 0 };
      volumeWeeks.push({ weekStart: wk, tonnage: Math.round(data.tonnage), sessions: data.sessions, mesoPhase: null });
      weekCursor = addDays(weekCursor, 7);
    }

    const nonEmptyWeeks = volumeWeeks.filter((w) => w.tonnage > 0);
    const avgTonnage =
      nonEmptyWeeks.length > 0
        ? Math.round(nonEmptyWeeks.reduce((s, w) => s + w.tonnage, 0) / nonEmptyWeeks.length)
        : null;

    let trendPercent: number | null = null;
    if (nonEmptyWeeks.length >= 3) {
      const half = Math.floor(nonEmptyWeeks.length / 2);
      const firstHalf = nonEmptyWeeks.slice(0, half);
      const secondHalf = nonEmptyWeeks.slice(-half);
      const avgFirst = firstHalf.reduce((s, w) => s + w.tonnage, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, w) => s + w.tonnage, 0) / secondHalf.length;
      if (avgFirst > 0) trendPercent = Math.round(((avgSecond - avgFirst) / avgFirst) * 100);
    }

    // ── Recovery (daily_check_ins) ──────────────────────────────────────────
    let recovery: any = { hasEnoughData: false, avgSleep: null, avgEnergy: null, avgStress: null, sleepTrend: null, energyTrend: null, stressTrend: null, insight: null, checkInCount: 0 };
    try {
      const checkIns = await q<{ sleep_hours: any; energy_level: string | null; stress_level: string | null; created_at: string }>(
        `SELECT sleep_hours, energy_level, stress_level, created_at FROM daily_check_ins WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [userId]
      );
      const checkInCount = checkIns.length;
      if (checkInCount >= 3) {
        const sleepVals = checkIns.map((c) => toNumberBe(c.sleep_hours)).filter((v): v is number => v != null);
        const avgSleep = sleepVals.length > 0 ? Math.round((sleepVals.reduce((s, v) => s + v, 0) / sleepVals.length) * 10) / 10 : null;

        const energyMap: Record<string, string> = { low: "Низкая", medium: "Средняя", high: "Высокая" };
        const stressMap: Record<string, string> = { low: "Низкий", medium: "Средний", high: "Высокий", very_high: "Очень высокий" };
        const energyCounts: Record<string, number> = {};
        const stressCounts: Record<string, number> = {};
        for (const c of checkIns) {
          if (c.energy_level) energyCounts[c.energy_level] = (energyCounts[c.energy_level] || 0) + 1;
          if (c.stress_level) stressCounts[c.stress_level] = (stressCounts[c.stress_level] || 0) + 1;
        }
        const topEnergy = Object.entries(energyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const topStress = Object.entries(stressCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        // Trend: compare first half vs second half of recent check-ins
        let sleepTrend: string | null = null;
        if (sleepVals.length >= 4) {
          const half = Math.floor(sleepVals.length / 2);
          const recent = sleepVals.slice(0, half).reduce((s, v) => s + v, 0) / half;
          const older = sleepVals.slice(-half).reduce((s, v) => s + v, 0) / half;
          sleepTrend = recent > older + 0.3 ? "improving" : recent < older - 0.3 ? "declining" : "stable";
        }

        recovery = {
          hasEnoughData: true,
          avgSleep,
          avgEnergy: topEnergy ? energyMap[topEnergy] ?? topEnergy : null,
          avgStress: topStress ? stressMap[topStress] ?? topStress : null,
          sleepTrend,
          energyTrend: null,
          stressTrend: null,
          insight: null,
          checkInCount,
        };
      } else {
        recovery = { ...recovery, checkInCount };
      }
    } catch { /* daily_check_ins may not exist */ }

    // ── Peak readiness (check-in × workout time-of-day) ─────────────────────
    let peakReadiness: any = { hasEnoughData: false, totalCheckins: 0, bestTimeOfDay: null, bestScore: null, slots: { morning: { count: 0, avgScore: null }, afternoon: { count: 0, avgScore: null }, evening: { count: 0, avgScore: null } } };
    try {
      const pairs = await q<{ finished_at: string; duration_min: number; energy_level: string | null; stress_level: string | null; sleep_quality: string | null }>(
        `SELECT ws.finished_at, COALESCE((ws.payload->>'durationMin')::int, 0) AS duration_min,
                dci.energy_level, dci.stress_level, dci.sleep_quality
         FROM workout_sessions ws
         INNER JOIN daily_check_ins dci
           ON ws.user_id = dci.user_id
           AND (ws.finished_at AT TIME ZONE 'UTC')::date = (dci.created_at AT TIME ZONE 'UTC')::date
         WHERE ws.user_id = $1 AND ws.finished_at >= NOW() - INTERVAL '90 days'`,
        [userId]
      );

      const energyScore: Record<string, number> = { high: 1, medium: 0.5, low: 0 };
      const sleepScore: Record<string, number> = { excellent: 1, good: 0.75, fair: 0.4, poor: 0 };
      const stressScore: Record<string, number> = { low: 1, medium: 0.6, high: 0.25, very_high: 0 };

      const buckets: Record<string, number[]> = { morning: [], afternoon: [], evening: [] };
      for (const p of pairs) {
        const finished = new Date(p.finished_at);
        const startMs = finished.getTime() - (p.duration_min || 0) * 60_000;
        const startHour = new Date(startMs).getHours();
        const tod = startHour < 12 ? "morning" : startHour < 17 ? "afternoon" : "evening";

        const e = energyScore[p.energy_level ?? ""] ?? 0.5;
        const sl = sleepScore[p.sleep_quality ?? ""] ?? 0.4;
        const st = stressScore[p.stress_level ?? ""] ?? 0.6;
        const score = ((e + sl + st) / 3) * 10;
        buckets[tod].push(score);
      }

      const slots: any = {};
      for (const tod of ["morning", "afternoon", "evening"] as const) {
        const arr = buckets[tod];
        slots[tod] = {
          count: arr.length,
          avgScore: arr.length >= 2 ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : null,
        };
      }

      const totalCheckins = pairs.length;
      let bestTimeOfDay: string | null = null;
      let bestScore: number | null = null;

      if (totalCheckins >= 5) {
        const valid = (["morning", "afternoon", "evening"] as const)
          .filter((t) => slots[t].avgScore != null)
          .sort((a, b) => slots[b].avgScore - slots[a].avgScore);

        if (valid.length > 0) {
          const top = valid[0];
          const second = valid[1];
          // Declare best if only one slot has data OR meaningfully better (>= 0.5 pts)
          if (!second || slots[top].avgScore - slots[second].avgScore >= 0.5) {
            bestTimeOfDay = top;
            bestScore = slots[top].avgScore;
          }
        }
      }

      peakReadiness = { hasEnoughData: totalCheckins >= 5, totalCheckins, bestTimeOfDay, bestScore, slots };
    } catch { /* daily_check_ins may not exist */ }

    // ── Streaks and activity ────────────────────────────────────────────────
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

    // Build map: date → timeOfDay (based on start time = finished_at − durationMin)
    const timeOfDayMap = new Map<string, "morning" | "afternoon" | "evening">();
    for (const s of sessions) {
      const finished = new Date(s.finished_at);
      const durationMin = Number(s.payload?.durationMin) || 0;
      const startMs = finished.getTime() - durationMin * 60_000;
      const startHour = new Date(startMs).getHours();
      const tod: "morning" | "afternoon" | "evening" =
        startHour < 12 ? "morning" : startHour < 17 ? "afternoon" : "evening";
      const iso = toISODate(finished);
      // Keep earliest session of the day
      if (!timeOfDayMap.has(iso)) timeOfDayMap.set(iso, tod);
    }

    const activityDays: Array<{ date: string; completed: boolean; timeOfDay: "morning" | "afternoon" | "evening" | null }> = [];
    for (let i = 83; i >= 0; i--) {
      const day = toISODate(addDays(new Date(), -i));
      activityDays.push({
        date: day,
        completed: completedSet.has(day),
        timeOfDay: timeOfDayMap.get(day) ?? null,
      });
    }

    const weeks: Array<{ label: string; days: Array<{ date: string; completed: boolean }> }> = [];
    for (let i = 0; i < activityDays.length; i += 7) {
      const chunk = activityDays.slice(i, i + 7);
      if (chunk.length === 0) continue;
      const label = weekLabel(new Date(chunk[0].date));
      weeks.push({ label, days: chunk });
    }

    const completedThisMonth = uniqueSessionDates.filter((d) => d.slice(0, 7) === todayIso.slice(0, 7)).length;
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

    const sortedAscDates = [...uniqueSessionDates].sort();
    let bestDayStreak = 0, tempStreak = 0;
    let prevDate: Date | null = null;
    for (const iso of sortedAscDates) {
      const currentDate = new Date(iso);
      if (prevDate) {
        const diff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) tempStreak += 1;
        else if (diff > 1) tempStreak = 1;
      } else { tempStreak = 1; }
      bestDayStreak = Math.max(bestDayStreak, tempStreak);
      prevDate = currentDate;
    }

    // ── Weekly plan series ──────────────────────────────────────────────────
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
    const currentWeekStart2 = startOfWeek(new Date());
    const currentWeekKey = toISODate(currentWeekStart2);

    const weekKeys = new Set<string>([...weeklySpecificTargets.keys(), ...completionsByWeek.keys()]);
    weekKeys.add(currentWeekKey);

    let earliestWeekDate: Date | null = null;
    for (const key of weekKeys) {
      const v = parseISODateToUTC(key);
      if (!v) continue;
      if (!earliestWeekDate || v < earliestWeekDate) earliestWeekDate = v;
    }
    const loopStart = earliestWeekDate ?? currentWeekStart2;

    const weeklyGoalComputed = new Map<string, number>();
    let runningPlanSeries = 0, bestPlanSeries = 0, currentPlanSeries = 0;
    for (let wc = new Date(loopStart); wc <= currentWeekStart2; wc = addDays(wc, 7)) {
      const wk = toISODate(wc);
      const specificTarget = weeklySpecificTargets.get(wk) ?? 0;
      const target = specificTarget > 0 ? specificTarget : baseWeeklyGoal && baseWeeklyGoal > 0 ? baseWeeklyGoal : 0;
      weeklyGoalComputed.set(wk, target);
      if (target <= 0) continue;
      const completed = completionsByWeek.get(wk) ?? 0;
      if (completed >= target) runningPlanSeries += 1;
      else runningPlanSeries = 0;
      if (runningPlanSeries > bestPlanSeries) bestPlanSeries = runningPlanSeries;
      if (wk === currentWeekKey) currentPlanSeries = runningPlanSeries;
    }

    const weeklyGoalCurrent = weeklyGoalComputed.get(currentWeekKey) ?? (baseWeeklyGoal ?? 0);
    const planWeeklyGoal = weeklyGoalCurrent > 0 ? weeklyGoalCurrent : null;
    const completedThisWeek = completionsByWeek.get(currentWeekKey) ?? 0;

    // ── Total tonnage (JS over sessions, limit 300) ──────────────────────────
    const totalTonnage = Math.round(
      sessions.reduce((sum, s) => sum + computeSessionTonnage(s.payload), 0)
    );

    // ── Total minutes — SQL over all sessions (no limit) ────────────────────
    const [{ total_minutes }] = await q<{ total_minutes: number }>(
      `SELECT COALESCE(
         SUM(
           CASE WHEN (payload->>'durationMin')::numeric > 0
             THEN ROUND((payload->>'durationMin')::numeric)::int
             ELSE 0 END
         ), 0
       )::int AS total_minutes
       FROM workout_sessions
       WHERE user_id = $1 AND payload IS NOT NULL`,
      [userId]
    );
    const totalMinutes = Number(total_minutes) || 0;

    // ── Tonnage delta 30d ───────────────────────────────────────────────────
    const tonnageLast30 = sessions
      .filter((s) => new Date(s.finished_at) >= ago30)
      .reduce((sum, s) => sum + computeSessionTonnage(s.payload), 0);
    const tonnagePrev30 = sessions
      .filter((s) => {
        const d = new Date(s.finished_at);
        const ago60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        return d >= ago60 && d < ago30;
      })
      .reduce((sum, s) => sum + computeSessionTonnage(s.payload), 0);

    const tonnageDelta30d =
      total_workouts >= 2 && tonnagePrev30 > 0
        ? Math.round(tonnageLast30 - tonnagePrev30)
        : null;

    // ── Days with app — from onboarding date, fallback to account creation ───
    // COALESCE: prefer onboarding created_at, fall back to users.created_at.
    // Direct timestamp subtraction in PG returns interval in days (no month ambiguity).
    const [{ days_with_app }] = await q<{ days_with_app: number }>(
      `SELECT GREATEST(1, DATE_PART('day', NOW() - COALESCE(
         (SELECT MIN(created_at) FROM onboardings WHERE user_id = $1),
         (SELECT created_at FROM users WHERE id = $1)
       ))::int) AS days_with_app`,
      [userId]
    );

    // ── Nutrition ────────────────────────────────────────────────────────────
    const [latestPlan] = await q<{ goal_kcal: number | null }>(
      `SELECT goal_kcal FROM nutrition_plans WHERE user_id = $1 ORDER BY week_start_date DESC LIMIT 1`,
      [userId]
    );
    const caloriesPerDay = latestPlan?.goal_kcal ?? null;
    const caloriesStatus =
      caloriesPerDay == null ? "none" :
      caloriesPerDay < 1800 ? "deficit" :
      caloriesPerDay > 2600 ? "surplus" : "normal";

    // ── Gamification ─────────────────────────────────────────────────────────
    const [plannedRow] = await q<{ planned_count: number }>(
      `SELECT COUNT(*)::int AS planned_count FROM planned_workouts WHERE user_id = $1 AND status IN ('scheduled', 'completed')`,
      [userId]
    );
    const gamification = buildGamificationSummary({
      onboardingCompleted: Boolean(onboardingRow),
      plannedWorkouts: Number(plannedRow?.planned_count || 0),
      completedWorkouts: total_workouts,
    });

    // ── AI insight ────────────────────────────────────────────────────────────
    let aiInsight: { text: string; type: "first_workout" | "early" | "personalized" };
    if (total_workouts === 0) {
      aiInsight = { text: "Пора начинать! Запланируй первую тренировку — Моро будет следить за твоим прогрессом.", type: "first_workout" };
    } else if (total_workouts === 1) {
      aiInsight = { text: "Отличный старт! 💪 Первая тренировка — самый важный шаг. Продолжай, и через пару недель я покажу тебе крутую аналитику!", type: "first_workout" };
    } else if (total_workouts < 5) {
      aiInsight = { text: `Ты набираешь обороты! Уже ${total_workouts} тренировки. Данные копятся — скоро смогу показать тренды силы и восстановления.`, type: "early" };
    } else {
      const trendText = trendPercent != null
        ? (trendPercent > 0 ? `Объём нагрузки вырос на ${Math.abs(trendPercent)}% — прогрессируешь! ` : trendPercent < -10 ? `Нагрузка снизилась на ${Math.abs(trendPercent)}% — возможно, нужен отдых. ` : "Нагрузка стабильная. ")
        : "";
      aiInsight = {
        text: `${trendText}${total_workouts} тренировок за всё время. ${dayStreak > 1 ? `Серия ${dayStreak} дней подряд — огонь! 🔥` : "Тренируйся регулярно для лучших результатов."}`,
        type: "personalized",
      };
    }

    // ── Achievements ─────────────────────────────────────────────────────────
    const earned: AchievementEarned[] = [];
    const upcoming: AchievementUpcoming[] = [];
    const nowIso = new Date().toISOString();

    const addEarned = (a: AchievementEarned) => { if (!earned.find((e) => e.id === a.id)) earned.push(a); };

    // Volume milestones
    const volumeMilestones = [
      { id: "vol-1", threshold: 1, title: "Первая тренировка", icon: "🎯", badge: "medal-gold" },
      { id: "vol-10", threshold: 10, title: "10 тренировок", icon: "🏅", badge: "volume-10" },
      { id: "vol-25", threshold: 25, title: "25 тренировок", icon: "🥈", badge: "volume-25" },
      { id: "vol-50", threshold: 50, title: "50 тренировок", icon: "🥇", badge: "volume-50" },
      { id: "vol-100", threshold: 100, title: "100 тренировок", icon: "🏆", badge: "volume-100" },
    ];
    const nextVol = volumeMilestones.find((m) => total_workouts < m.threshold);
    volumeMilestones.filter((m) => total_workouts >= m.threshold).forEach((m) => {
      addEarned({ id: m.id, title: m.title, icon: m.icon, earnedAt: nowIso, badge: m.badge });
    });
    if (nextVol) {
      upcoming.push({ id: nextVol.id, title: nextVol.title, icon: nextVol.icon, current: total_workouts, target: nextVol.threshold, percent: Math.round((total_workouts / nextVol.threshold) * 100) });
    }

    // Streak milestones
    const streakMilestones = [
      { id: "streak-3", threshold: 3, title: "3 дня подряд", icon: "🔥", badge: "streak-3" },
      { id: "streak-7", threshold: 7, title: "Неделя подряд", icon: "🔥", badge: "streak-7" },
      { id: "streak-14", threshold: 14, title: "2 недели подряд", icon: "🔥", badge: "streak-14" },
    ];
    const nextStreak = streakMilestones.find((m) => bestDayStreak < m.threshold);
    streakMilestones.filter((m) => bestDayStreak >= m.threshold).forEach((m) => {
      addEarned({ id: m.id, title: m.title, icon: m.icon, earnedAt: nowIso, badge: m.badge });
    });
    if (nextStreak) {
      upcoming.push({ id: nextStreak.id, title: nextStreak.title, icon: nextStreak.icon, current: bestDayStreak, target: nextStreak.threshold, percent: Math.round((bestDayStreak / nextStreak.threshold) * 100) });
    }

    // Plan series milestones
    const planMilestones = [
      { id: "plan-1", threshold: 1, title: "Неделя по плану", icon: "✅", badge: "plan-1" },
      { id: "plan-4", threshold: 4, title: "Месяц по плану", icon: "📆", badge: "plan-4" },
      { id: "plan-8", threshold: 8, title: "2 месяца по плану", icon: "📆", badge: "plan-8" },
    ];
    const nextPlan = planMilestones.find((m) => bestPlanSeries < m.threshold);
    planMilestones.filter((m) => bestPlanSeries >= m.threshold).forEach((m) => {
      addEarned({ id: m.id, title: m.title, icon: m.icon, earnedAt: nowIso, badge: m.badge });
    });
    if (nextPlan && upcoming.length < 3) {
      upcoming.push({ id: nextPlan.id, title: nextPlan.title, icon: nextPlan.icon, current: bestPlanSeries, target: nextPlan.threshold, percent: Math.round((bestPlanSeries / nextPlan.threshold) * 100) });
    }

    // ── Goal journey ─────────────────────────────────────────────────────────
    const hasPR = personalRecords.length > 0;
    const targetDelta =
      onboardingWeight != null && onboardingTargetWeight != null
        ? Math.abs(onboardingWeight - onboardingTargetWeight)
        : null;
    const goalJourney = buildGoalJourney(
      userGoal, total_workouts, hasPR,
      weightSeries.length > 0 || currentWeight != null,
      bestDayStreak, bestPlanSeries,
      weightDelta30d,
      targetDelta
    );

    // ── Exercise progress (per-exercise charts) ────────────────────────────────
    const exerciseProgress = await computeExerciseProgress(userId);

    // ── Final response ────────────────────────────────────────────────────────
    res.json({
      // Legacy fields (keep for backward compat)
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
      // New v2 fields
      level: gamification.level.currentLevel,
      totalXp: gamification.level.totalXp,
      daysWithApp: days_with_app,
      weekStreak: currentPlanSeries,
      workoutsTotal: total_workouts,
      totalTonnage,
      totalMinutes,
      userGoal,
      tonnageDelta30d,
      aiInsight,
      goalJourney,
      muscleAccent,
      personalRecords,
      body: {
        currentWeight: effectiveCurrentWeight,
        weightSource,
        weightDelta: weightDelta30d,
        weightSeries,
        bmi,
        heightCm: onboardingHeight,
        measurements: {
          latest: latestMeasurements,
          deltaFromFirst,
          series: measurementSeries,
        },
      },
      volumeTrend: {
        weeks: volumeWeeks.filter((w) => {
          const d = new Date(w.weekStart);
          return d >= twelveWeeksAgo;
        }),
        avgTonnage,
        trendPercent,
      },
      recovery,
      peakReadiness,
      exerciseProgress,
      achievements: {
        earned,
        upcoming: upcoming.slice(0, 3),
      },
    });
  })
);

// ─── Gamification endpoint ────────────────────────────────────────────────────

progress.get(
  "/gamification",
  asyncHandler(async (req: any, res: Response) => {
    const userId = resolveUserId(req);

    const [onboardingRow] = await q<{ has_onboarding: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM onboardings WHERE user_id = $1) AS has_onboarding`,
      [userId]
    );
    const [plannedRow] = await q<{ planned_count: number }>(
      `SELECT COUNT(*)::int AS planned_count FROM planned_workouts WHERE user_id = $1 AND status IN ('scheduled', 'completed')`,
      [userId]
    );
    const [completedRow] = await q<{ completed_count: number }>(
      `SELECT COUNT(*)::int AS completed_count FROM workout_sessions WHERE user_id = $1`,
      [userId]
    );

    const summary = buildGamificationSummary({
      onboardingCompleted: Boolean(onboardingRow?.has_onboarding),
      plannedWorkouts: Number(plannedRow?.planned_count || 0),
      completedWorkouts: Number(completedRow?.completed_count || 0),
    });

    res.json(summary);
  })
);

// ─── Body metrics endpoint ────────────────────────────────────────────────────

progress.post(
  "/body-metrics",
  asyncHandler(async (req: any, res: Response) => {
    const userId = resolveUserId(req);
    const payload = req.body || {};
    const recordedAtRaw = payload.recordedAt || payload.date;
    const weight = payload.weight != null ? Number(payload.weight) : null;
    const bodyFat = payload.bodyFat != null ? Number(payload.bodyFat) : null;
    const muscle = payload.muscleMass != null ? Number(payload.muscleMass) : null;
    const notes = typeof payload.notes === "string" ? payload.notes.slice(0, 500) : null;

    const recordedAt = recordedAtRaw ? new Date(recordedAtRaw) : new Date();
    if (!Number.isFinite(recordedAt.getTime())) return res.status(400).json({ error: "invalid_date" });

    const iso = recordedAt.toISOString().slice(0, 10);
    await q(
      `INSERT INTO body_metrics (user_id, recorded_at, weight, body_fat, muscle_mass, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, recorded_at)
       DO UPDATE SET weight = EXCLUDED.weight, body_fat = EXCLUDED.body_fat, muscle_mass = EXCLUDED.muscle_mass, notes = EXCLUDED.notes, updated_at = now()`,
      [userId, iso, weight, bodyFat, muscle, notes]
    );

    res.json({ ok: true, recordedAt: iso });
  })
);

// ─── Body measurements endpoint ───────────────────────────────────────────────

progress.post(
  "/measurements",
  asyncHandler(async (req: any, res: Response) => {
    const userId = resolveUserId(req);
    const p = req.body || {};
    const recordedAt = p.recordedAt ? new Date(p.recordedAt) : new Date();
    if (!Number.isFinite(recordedAt.getTime())) return res.status(400).json({ error: "invalid_date" });
    const iso = recordedAt.toISOString().slice(0, 10);

    const num = (v: any) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    const notes = typeof p.notes === "string" ? p.notes.slice(0, 500) : null;

    try {
      await q(
        `INSERT INTO body_measurements (user_id, recorded_at, chest_cm, waist_cm, hips_cm, bicep_left_cm, bicep_right_cm, neck_cm, thigh_cm, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (user_id, recorded_at)
         DO UPDATE SET chest_cm=EXCLUDED.chest_cm, waist_cm=EXCLUDED.waist_cm, hips_cm=EXCLUDED.hips_cm,
           bicep_left_cm=EXCLUDED.bicep_left_cm, bicep_right_cm=EXCLUDED.bicep_right_cm,
           neck_cm=EXCLUDED.neck_cm, thigh_cm=EXCLUDED.thigh_cm, notes=EXCLUDED.notes`,
        [userId, iso, num(p.chest_cm), num(p.waist_cm), num(p.hips_cm), num(p.bicep_left_cm), num(p.bicep_right_cm), num(p.neck_cm), num(p.thigh_cm), notes]
      );
    } catch {
      return res.status(500).json({ error: "table_not_found" });
    }

    res.json({ ok: true, recordedAt: iso });
  })
);

progress.get(
  "/measurements",
  asyncHandler(async (req: any, res: Response) => {
    const userId = resolveUserId(req);
    try {
      const rows = await q<any>(
        `SELECT recorded_at::text, chest_cm, waist_cm, hips_cm, bicep_left_cm, bicep_right_cm, neck_cm, thigh_cm, notes FROM body_measurements WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
        [userId]
      );
      res.json({ measurements: rows });
    } catch {
      res.json({ measurements: [] });
    }
  })
);

export default progress;

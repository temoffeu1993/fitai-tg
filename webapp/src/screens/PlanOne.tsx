import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  getScheduleOverview,
  removePlannedWorkoutExercise,
  reschedulePlannedWorkout,
  replacePlannedWorkoutExercise,
  updatePlannedWorkout,
  type PlannedWorkout,
} from "@/api/schedule";
import { getMesocycleCurrent } from "@/api/plan";
import { excludeExercise, getExerciseAlternatives, type ExerciseAlternative } from "@/api/exercises";
import { useWorkoutPlan } from "@/hooks/useWorkoutPlan";
import { useNutritionGenerationProgress } from "@/hooks/useNutritionGenerationProgress";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import DateTimeWheelModal from "@/components/DateTimeWheelModal";
import ScheduleReplaceConfirmModal from "@/components/ScheduleReplaceConfirmModal";
import { readSessionDraft } from "@/lib/activeWorkout";
import { resolveDayCopy } from "@/utils/dayLabelCopy";
import { ArrowLeft, Ban, Clock3, Dumbbell, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { workoutTheme } from "@/components/workout-session/theme";
import mascotImg from "@/assets/robonew.webp";
import tyagaImg from "@/assets/tyaga.webp";
import zhimImg from "@/assets/zhim.webp";
import nogiImg from "@/assets/nogi.webp";
import sredneImg from "@/assets/sredne.webp";

const defaultScheduleTime = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "18:00" : "09:00";
};

const formatScheduledDateChip = (iso: string) => {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  const date = dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  const time = dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
};

const formatWeekTitleRu = (week: number | null) => {
  const n = Number(week);
  if (!Number.isFinite(n) || n <= 1) return "Первая неделя";
  const words: Record<number, string> = {
    2: "Вторая неделя",
    3: "Третья неделя",
    4: "Четвертая неделя",
    5: "Пятая неделя",
    6: "Шестая неделя",
    7: "Седьмая неделя",
    8: "Восьмая неделя",
    9: "Девятая неделя",
    10: "Десятая неделя",
  };
  return words[Math.round(n)] || `${Math.round(n)}-я неделя`;
};

const PLANNED_WORKOUTS_COUNT_KEY = "planned_workouts_count_v1";
const SCHEDULE_CACHE_KEY = "schedule_cache_v1";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;
const WEEK_STACK_OFFSET_MIN = 62;
const WEEK_STACK_OFFSET_MAX = 72;
const WEEK_STACK_COLLAPSED_H = 104;
const WEEK_STACK_ACTIVE_H = 224;
const DETAILS_PANEL_ANIM_MS = 220;

type PlanOneInlineScheduleState = {
  plannedWorkoutId: string;
  title: string;
  date: string;
  time: string;
  canDelete: boolean;
};

type PlanOneScheduleReplaceConfirmState = {
  targetWorkoutId: string;
  targetTitle: string;
  conflictTitle: string;
  date: string;
  time: string;
};

function toDateKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toLocalDateInput(iso: string): string {
  return toDateKeyLocal(new Date(iso));
}

function toLocalTimeInput(iso: string): string {
  const dt = new Date(iso);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function parseHHMM(value: string | null | undefined): { hh: number; mm: number } | null {
  if (!value || !HHMM_RE.test(value)) return null;
  const [hhRaw, mmRaw] = value.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function normalizePlanned(list: PlannedWorkout[] | undefined): PlannedWorkout[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => {
      if (!item || !item.id) return false;
      if (item.status === "cancelled") return false;
      if (item.status === "pending") return true;
      return Boolean(item.scheduledFor);
    })
    .map((item) => ({
      ...item,
      status: item.status || "scheduled",
    }))
    .sort((a, b) => {
      const at = a.scheduledFor ? new Date(a.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.scheduledFor ? new Date(b.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
}

function readPlannedCache(): PlannedWorkout[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(SCHEDULE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const cached = Array.isArray(parsed?.plannedWorkouts) ? parsed.plannedWorkouts : [];
    return normalizePlanned(cached as PlannedWorkout[]);
  } catch {
    return [];
  }
}

export type Exercise = {
  name: string; sets: number;
  reps?: number | string; restSec?: number; cues?: string;
  pattern?: string; targetMuscles?: string[]; tempo?: string; guideUrl?: string; weight?: string;
  // NEW: detailed fields
  technique?: {
    setup: string;
    execution: string;
    commonMistakes: string[];
  };
  equipment?: string[];
  difficulty?: number;
  unilateral?: boolean;
  exerciseId?: string;
};

/**
 * PLAN — ознакомительный экран в общем стиле приложения.
 * - collapsible секции (разминка, основная часть, заминка)
 * - плавающий комментарий тренера (plan.notes)
 * - улучшенный caret
 * - увеличенный бот
 * - "пишет..." при генерации
 * - чат-бабл без затемнения
 */

export default function PlanOne() {
  const nav = useNavigate();
  const location = useLocation();
  const cachedPlanned = useMemo(() => readPlannedCache(), []);
  const hasInitialPlannedCache = cachedPlanned.length > 0;
  const {
    plan,
    status: planStatus,
    error: planError,
    metaError,
    loading,
    regenerate,
    refresh,
  } = useWorkoutPlan<any>({ autoFetch: false });
  const sub = useSubscriptionStatus();
  const [inlineScheduleModal, setInlineScheduleModal] = useState<PlanOneInlineScheduleState | null>(null);
  const [inlineScheduleSaving, setInlineScheduleSaving] = useState(false);
  const [inlineScheduleError, setInlineScheduleError] = useState<string | null>(null);
  const [inlineScheduleReplaceConfirm, setInlineScheduleReplaceConfirm] =
    useState<PlanOneScheduleReplaceConfirmState | null>(null);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>(cachedPlanned);
  const [plannedLoading, setPlannedLoading] = useState(!hasInitialPlannedCache);
  const [plannedFetchedOnce, setPlannedFetchedOnce] = useState(false);
  const [plannedError, setPlannedError] = useState<string | null>(null);
  const [selectedPlannedId, setSelectedPlannedId] = useState<string | null>(null);
  const [expandedPlannedIds, setExpandedPlannedIds] = useState<Record<string, boolean>>({});
  const [detailsPhase, setDetailsPhase] = useState<"closed" | "entering" | "open" | "closing">("closed");
  const detailsTimerRef = useRef<number | null>(null);
  const [weekGenerating, setWeekGenerating] = useState(false);
  const [mesoWeek, setMesoWeek] = useState<number | null>(null);

  const [initialPlanRequested, setInitialPlanRequested] = useState(false);
  const [initialWeekRequested, setInitialWeekRequested] = useState(false);
  const [needsCheckIn, setNeedsCheckIn] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 812
  );

  const [activeDraft, setActiveDraft] = useState(() => readSessionDraft());
  useEffect(() => {
    const refresh = () => setActiveDraft(readSessionDraft());
    window.addEventListener("schedule_updated", refresh);
    return () => window.removeEventListener("schedule_updated", refresh);
  }, []);
  const activeProgress = useMemo(() => {
    const d = activeDraft;
    const items = Array.isArray(d?.items) ? d!.items : [];
    if (!items.length) return null;
    const totalSets = items.reduce((sum: number, it: any) => {
      const sets = Array.isArray(it?.sets) ? it.sets.length : 0;
      return sum + sets;
    }, 0);
    if (!totalSets) return null;
    const doneSets = items.reduce((sum: number, it: any) => {
      const sets = Array.isArray(it?.sets) ? it.sets : [];
      return sum + sets.filter((set: any) => Boolean(set?.done)).length;
    }, 0);
    return Math.max(0, Math.min(100, Math.round((doneSets / totalSets) * 100)));
  }, [activeDraft]);

  const loadPlanned = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setPlannedLoading(true);
    setPlannedError(null);
    try {
      const data = await getScheduleOverview();
      const next = normalizePlanned(data.plannedWorkouts);
      setPlannedWorkouts(next);
      try {
        localStorage.setItem(PLANNED_WORKOUTS_COUNT_KEY, String(next.length));
      } catch { }
      // Keep schedule_cache_v1 in sync so WorkoutSession reads fresh data
      try {
        localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify({
          plannedWorkouts: Array.isArray(data?.plannedWorkouts) ? data.plannedWorkouts : [],
          scheduleDates: data?.schedule?.dates ?? {},
          ts: Date.now(),
        }));
      } catch { }
      try {
        window.dispatchEvent(new CustomEvent("planned_workouts_updated", { detail: { count: next.length } }));
      } catch {
        window.dispatchEvent(new Event("planned_workouts_updated"));
      }
    } catch (err) {
      console.error("Failed to load planned workouts", err);
      setPlannedError("Не удалось загрузить тренировки недели");
    } finally {
      if (!silent) setPlannedLoading(false);
      setPlannedFetchedOnce(true);
    }
  }, []);

  useEffect(() => {
    loadPlanned({ silent: hasInitialPlannedCache }).catch(() => { });
    const onScheduleUpdated = () => loadPlanned({ silent: true }).catch(() => { });
    window.addEventListener("schedule_updated" as any, onScheduleUpdated);
    window.addEventListener("plan_completed" as any, onScheduleUpdated);
    return () => {
      window.removeEventListener("schedule_updated" as any, onScheduleUpdated);
      window.removeEventListener("plan_completed" as any, onScheduleUpdated);
    };
  }, [loadPlanned, hasInitialPlannedCache]);

  useEffect(() => {
    getMesocycleCurrent()
      .then((r) => {
        const w = Number((r as any)?.mesocycle?.currentWeek);
        setMesoWeek(Number.isFinite(w) ? w : null);
      })
      .catch(() => { });
  }, []);

  const remainingPlanned = useMemo(() => {
    return (plannedWorkouts || [])
      .filter((w) => w && w.id)
      .filter((w) => w.status !== "cancelled" && w.status !== "completed");
  }, [plannedWorkouts]);

  const recommendedPlannedId = useMemo(() => {
    if (!remainingPlanned.length) return null;
    const byIndex = remainingPlanned
      .map((w) => ({ id: w.id, idx: Number((w.plan as any)?.dayIndex) }))
      .filter((x) => Number.isFinite(x.idx));
    if (byIndex.length) {
      byIndex.sort((a, b) => a.idx - b.idx);
      return byIndex[0].id;
    }
    return remainingPlanned
      .slice()
      .sort((a, b) => {
        const at = a.scheduledFor
          ? new Date(a.scheduledFor).getTime()
          : a.createdAt
            ? new Date(a.createdAt).getTime()
            : Number.POSITIVE_INFINITY;
        const bt = b.scheduledFor
          ? new Date(b.scheduledFor).getTime()
          : b.createdAt
            ? new Date(b.createdAt).getTime()
            : Number.POSITIVE_INFINITY;
        return at - bt;
      })[0].id;
  }, [remainingPlanned]);

  useEffect(() => {
    const selectable = (plannedWorkouts || []).filter((w) => w && w.id && w.status !== "cancelled");
    if (!selectable.length) {
      setSelectedPlannedId(null);
      return;
    }
    if (selectedPlannedId && selectable.some((w) => w.id === selectedPlannedId)) return;
    setSelectedPlannedId(recommendedPlannedId || selectable[0].id);
  }, [plannedWorkouts, recommendedPlannedId, selectedPlannedId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportHeight(window.innerHeight || 812);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Always start PlanOne from the top, not from any preserved previous route scroll state.
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const resetScrollTop = () => {
      if (root) root.scrollTop = 0;
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    resetScrollTop();
    const raf = window.requestAnimationFrame(resetScrollTop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const steps = useMemo(
    () => ["Анализ профиля", "Цели и ограничения", "Подбор упражнений", "Оптимизация нагрузки", "Формирование плана"],
    []
  );
  const todayIso = useMemo(() => toDateKeyLocal(new Date()), []);
  const { startManual: kickProgress } = useNutritionGenerationProgress(planStatus, {
    steps: steps.length,
    storageKey: "workout_generation_started_at",
    durationMs: 40_000,
  });

  const error = planError || metaError || null;
  const isProcessing = planStatus === "processing";
  const showLoader = (loading || isProcessing) && initialPlanRequested && !needsCheckIn;
  const showInitialPlannedLoader = plannedLoading && !hasInitialPlannedCache && !plannedFetchedOnce;
  const [paywall, setPaywall] = useState(false);

  // When there are no planned workouts, we immediately show the loader while the auto-generation effect kicks in.
  // This avoids a UI "flash" where the user briefly sees the empty-state button after navigating from dashboard.
  const shouldAutoGenerateWeek =
    plannedFetchedOnce &&
    !plannedLoading &&
    !weekGenerating &&
    remainingPlanned.length === 0 &&
    !sub.locked &&
    !initialWeekRequested;

  useEffect(() => {
    if (plan) {
      setInitialPlanRequested(true);
      setNeedsCheckIn(false);
    }
  }, [plan]);

  // Auto-generate week workouts only when there is nothing planned/remaining
  useEffect(() => {
    if (!plannedFetchedOnce) return;
    if (plannedLoading) return;
    if (remainingPlanned.length > 0) return;
    if (weekGenerating) return;
    if (sub.locked) return;
    if (initialWeekRequested) return;

    console.log("🚀 No workouts left: generating new week plan");
    setInitialWeekRequested(true);
    setWeekGenerating(true);
    kickProgress();
    refresh({ force: true })
      .then(() => loadPlanned({ silent: true }))
      .catch(() => { })
      .finally(() => setWeekGenerating(false));
  }, [plannedFetchedOnce, plannedLoading, remainingPlanned.length, weekGenerating, sub.locked, initialWeekRequested, kickProgress, refresh, loadPlanned]);

  useEffect(() => {
    const onPlanCompleted = () => {
      try {
        localStorage.removeItem("current_plan");
        localStorage.removeItem("session_draft");
        localStorage.removeItem("plan_cache_v2");
      } catch { }
      setNeedsCheckIn(true);
      setInitialPlanRequested(false);
    };
    window.addEventListener("plan_completed", onPlanCompleted as any);
    return () => window.removeEventListener("plan_completed", onPlanCompleted as any);
  }, [regenerate]);

  useEffect(() => {
    const onOnbUpdated = () => {
      refresh({ force: true }).catch(() => { });
    };
    window.addEventListener("onb_updated" as any, onOnbUpdated);
    return () => window.removeEventListener("onb_updated" as any, onOnbUpdated);
  }, [refresh]);

  // New UI: show all generated workouts (remaining ones) as selectable cards
  const weekHeaderTitle = formatWeekTitleRu(mesoWeek);

  const dayLabelRU = (planLike: any) => {
    const raw = String(
      planLike?.dayLabel ||
      planLike?.title ||
      planLike?.name ||
      planLike?.label ||
      planLike?.scheme_label ||
      ""
    ).trim();
    const idxRaw = Number(planLike?.dayIndex);
    const idx = Number.isFinite(idxRaw) ? Math.max(0, idxRaw - 1) : 0;
    const splitType = String(planLike?.splitType || planLike?.meta?.splitType || "").trim();
    if (raw) {
      const resolved = resolveDayCopy(raw, splitType, idx).title;
      if (/^День\s+\d+/.test(resolved)) return raw;
      return resolved;
    }
    return "Тренировка";
  };

  const dayMascotForLabel = (label: string) => {
    const v = String(label || "").toLowerCase();
    if (v.includes("push") || v.includes("пуш") || v.includes("жим") || v.includes("груд")) return zhimImg;
    if (v.includes("pull") || v.includes("пул") || v.includes("тяг") || v.includes("спин")) return tyagaImg;
    if (v.includes("leg") || v.includes("ног") || v.includes("ягод")) return nogiImg;
    return sredneImg;
  };

  const workoutChips = (p: any) => {
    const totalExercises = Number(p?.totalExercises) || (Array.isArray(p?.exercises) ? p.exercises.length : 0);
    const minutes = Number(p?.estimatedDuration) || null;
    return { totalExercises, minutes };
  };

  const mapPlanExercises = (p: any): Exercise[] =>
    (Array.isArray(p?.exercises) ? p.exercises : []).map((ex: any) => ({
      exerciseId: String(ex?.exerciseId || ex?.id || ex?.exercise?.id || "") || undefined,
      name: String(ex?.name || ex?.exerciseName || "Упражнение"),
      sets: Number(ex?.sets) || 1,
      reps: ex?.reps || ex?.repsRange || "",
      restSec: ex?.restSec != null ? Number(ex.restSec) : undefined,
      cues: String(ex?.tagline || ex?.notes || ex?.cues || "").trim() || undefined,
    }));

  const replaceTargetDate = (() => {
    const raw = (location.state as any)?.replaceDate;
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    return ISO_DATE_RE.test(value) ? value : null;
  })();

  const openScheduleForWorkout = (plannedWorkoutId: string) => {
    const workout = plannedWorkouts.find((w) => w.id === plannedWorkoutId) || null;
    if (!workout || workout.status === "completed" || workout.status === "cancelled") return;

    const todayIso = toDateKeyLocal(new Date());
    const hasFreshSchedule = workout.status === "scheduled" && Boolean(workout.scheduledFor);
    const scheduledDate = hasFreshSchedule && workout.scheduledFor ? toLocalDateInput(workout.scheduledFor) : null;
    const scheduledTime = hasFreshSchedule && workout.scheduledFor ? toLocalTimeInput(workout.scheduledFor) : null;
    const safeReplaceDate =
      replaceTargetDate && replaceTargetDate >= todayIso ? replaceTargetDate : null;
    const nextDate =
      scheduledDate && scheduledDate >= todayIso
        ? scheduledDate
        : safeReplaceDate || todayIso;
    const nextTime =
      scheduledTime && parseHHMM(scheduledTime)
        ? scheduledTime
        : defaultScheduleTime();
    const dayTitle = dayLabelRU(workout.plan || {});

    setInlineScheduleModal({
      plannedWorkoutId: workout.id,
      title: dayTitle,
      date: nextDate,
      time: nextTime,
      canDelete: workout.status === "scheduled",
    });
    setInlineScheduleError(null);
    setInlineScheduleSaving(false);
  };

  const handleInlineScheduleSave = async (date: string, time: string) => {
    if (!inlineScheduleModal || inlineScheduleSaving) return;
    if (!ISO_DATE_RE.test(date) || !HHMM_RE.test(time)) {
      setInlineScheduleError("Укажи корректные дату и время");
      return;
    }
    const when = new Date(`${date}T${time}`);
    if (!Number.isFinite(when.getTime())) {
      setInlineScheduleError("Укажи корректные дату и время");
      return;
    }
    const nowMinute = new Date();
    nowMinute.setSeconds(0, 0);
    if (when.getTime() < nowMinute.getTime()) {
      setInlineScheduleError("Нельзя выбрать прошедшие дату и время");
      return;
    }
    const target = plannedWorkouts.find((w) => w.id === inlineScheduleModal.plannedWorkoutId) || null;
    if (!target || target.status === "completed" || target.status === "cancelled") {
      setInlineScheduleError("Эту тренировку нельзя запланировать");
      return;
    }

    const conflict = plannedWorkouts.find((w) => {
      if (!w || w.id === target.id) return false;
      if (w.status !== "scheduled" || !w.scheduledFor) return false;
      const localDate = toLocalDateInput(w.scheduledFor);
      return localDate === date;
    });
    if (conflict) {
      setInlineScheduleReplaceConfirm({
        targetWorkoutId: target.id,
        targetTitle: inlineScheduleModal.title,
        conflictTitle: dayLabelRU(conflict.plan || {}),
        date,
        time,
      });
      return;
    }

    await performInlineScheduleSave(target.id, date, time);
  };

  const performInlineScheduleSave = async (targetWorkoutId: string, date: string, time: string) => {
    const when = new Date(`${date}T${time}`);
    if (!Number.isFinite(when.getTime())) {
      setInlineScheduleError("Укажи корректные дату и время");
      return;
    }

    setInlineScheduleSaving(true);
    setInlineScheduleError(null);
    try {
      const utcOffsetMinutes = when.getTimezoneOffset();
      const dayUtcOffsetMinutes = new Date(`${date}T00:00`).getTimezoneOffset();
      await reschedulePlannedWorkout(targetWorkoutId, {
        date,
        time,
        utcOffsetMinutes,
        dayUtcOffsetMinutes,
      });

      await loadPlanned({ silent: true });
      setInlineScheduleModal(null);
      setInlineScheduleReplaceConfirm(null);
      try {
        window.dispatchEvent(new Event("schedule_updated"));
        window.dispatchEvent(new Event("planned_workouts_updated"));
      } catch { }
    } catch (err) {
      console.error("inline schedule save failed", err);
      const code = extractApiErrorCode(err);
      if (code === "past_datetime") {
        setInlineScheduleError("Нельзя выбрать прошедшие дату и время");
      } else if (code === "planned_workout_completed") {
        setInlineScheduleError("Тренировка уже завершена и недоступна для переноса");
      } else if (code === "planned_workout_cancelled") {
        setInlineScheduleError("Тренировка отменена и недоступна для переноса");
      } else {
        setInlineScheduleError("Не удалось сохранить. Попробуй ещё раз.");
      }
    } finally {
      setInlineScheduleSaving(false);
    }
  };

  const handleInlineScheduleReplaceConfirm = async () => {
    if (!inlineScheduleReplaceConfirm || inlineScheduleSaving) return;
    await performInlineScheduleSave(
      inlineScheduleReplaceConfirm.targetWorkoutId,
      inlineScheduleReplaceConfirm.date,
      inlineScheduleReplaceConfirm.time
    );
  };

  const handleInlineScheduleDelete = async () => {
    if (!inlineScheduleModal || inlineScheduleSaving || !inlineScheduleModal.canDelete) return;
    const target = plannedWorkouts.find((w) => w.id === inlineScheduleModal.plannedWorkoutId) || null;
    if (!target || target.status !== "scheduled") {
      setInlineScheduleError("Тренировка уже не запланирована");
      return;
    }

    setInlineScheduleSaving(true);
    setInlineScheduleError(null);
    try {
      await updatePlannedWorkout(target.id, { status: "pending" });
      await loadPlanned({ silent: true });
      setInlineScheduleModal(null);
      setInlineScheduleReplaceConfirm(null);
      try {
        window.dispatchEvent(new Event("schedule_updated"));
        window.dispatchEvent(new Event("planned_workouts_updated"));
      } catch { }
    } catch (err) {
      console.error("inline schedule delete failed", err);
      setInlineScheduleError("Не удалось удалить дату и время. Попробуй ещё раз.");
    } finally {
      setInlineScheduleSaving(false);
    }
  };

  const handleGenerateWeek = async () => {
    if (sub.locked) {
      setPaywall(true);
      return;
    }
    setInitialWeekRequested(true);
    setWeekGenerating(true);
    kickProgress();
    try {
      await refresh({ force: true });
      await loadPlanned();
    } catch (err: any) {
      setPlannedError(humanizePlanError(err));
    } finally {
      setWeekGenerating(false);
    }
  };

  const weekWorkouts = (plannedWorkouts || [])
    .filter((w) => w && w.id && w.status !== "cancelled")
    .slice()
    .sort((a, b) => {
      const ai = Number((a.plan as any)?.dayIndex);
      const bi = Number((b.plan as any)?.dayIndex);
      const hasAi = Number.isFinite(ai);
      const hasBi = Number.isFinite(bi);
      if (hasAi && hasBi && ai !== bi) return ai - bi;
      if (hasAi && !hasBi) return -1;
      if (!hasAi && hasBi) return 1;
      const at = a.scheduledFor ? new Date(a.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.scheduledFor ? new Date(b.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  const activeStackId =
    weekWorkouts.length === 0
      ? null
      : selectedPlannedId && weekWorkouts.some((w) => w.id === selectedPlannedId)
        ? selectedPlannedId
        : weekWorkouts[0].id;
  const activeStackIndex = activeStackId ? weekWorkouts.findIndex((w) => w.id === activeStackId) : -1;
  const stackOrder = (() => {
    if (!weekWorkouts.length) return [];
    if (activeStackIndex < 0) return weekWorkouts.map((_, i) => i);
    const order = weekWorkouts.map((_, i) => i).filter((i) => i !== activeStackIndex);
    order.push(activeStackIndex);
    return order;
  })();
  const weekStackOffset = (() => {
    const vh = Number(viewportHeight) || 812;
    if (vh <= 700) return WEEK_STACK_OFFSET_MIN;
    if (vh >= 920) return WEEK_STACK_OFFSET_MAX;
    const t = (vh - 700) / 220;
    return Math.round(
      WEEK_STACK_OFFSET_MIN + (WEEK_STACK_OFFSET_MAX - WEEK_STACK_OFFSET_MIN) * t
    );
  })();
  const stackHeight = weekWorkouts.length
    ? (weekWorkouts.length - 1) * weekStackOffset + WEEK_STACK_ACTIVE_H + 8
    : 0;
  const activeStackWorkout = activeStackId ? weekWorkouts.find((w) => w.id === activeStackId) || null : null;
  const activeStackExpanded = Boolean(activeStackWorkout && expandedPlannedIds[activeStackWorkout.id]);
  const activeStackPlan: any = activeStackWorkout?.plan || {};
  const activeStackExercises = mapPlanExercises(activeStackPlan);
  const shouldOpenDetails = Boolean(activeStackWorkout && activeStackExpanded);
  const shouldRenderDetails = Boolean(activeStackWorkout) && detailsPhase !== "closed";

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (detailsTimerRef.current != null) {
      window.clearTimeout(detailsTimerRef.current);
      detailsTimerRef.current = null;
    }

    if (shouldOpenDetails) {
      setDetailsPhase((prev) => (prev === "open" ? prev : "entering"));
      const raf = window.requestAnimationFrame(() => setDetailsPhase("open"));
      return () => window.cancelAnimationFrame(raf);
    }

    setDetailsPhase((prev) => {
      if (prev === "closed") return prev;
      detailsTimerRef.current = window.setTimeout(() => {
        setDetailsPhase("closed");
        detailsTimerRef.current = null;
      }, DETAILS_PANEL_ANIM_MS);
      return "closing";
    });

    return () => {
      if (detailsTimerRef.current != null) {
        window.clearTimeout(detailsTimerRef.current);
        detailsTimerRef.current = null;
      }
    };
  }, [shouldOpenDetails, activeStackWorkout?.id]);

  const handleWorkoutPrimary = (workout: PlannedWorkout) => {
    if (workout.status === "completed") {
      if (workout.resultSessionId) {
        nav(`/workout/result?sessionId=${encodeURIComponent(String(workout.resultSessionId))}`);
      }
      return;
    }
    const scheduledIso = workout.scheduledFor ? toLocalDateInput(workout.scheduledFor) : "";
    const hasFreshSchedule =
      workout.status === "scheduled" &&
      Boolean(scheduledIso) &&
      scheduledIso >= todayIso;
    const workoutDate = hasFreshSchedule ? scheduledIso : todayIso;
    nav("/check-in", {
      state: {
        workoutDate,
        plannedWorkoutId: workout.id,
        returnTo: "/plan/one",
      },
    });
  };

  if (showInitialPlannedLoader || weekGenerating || showLoader || shouldAutoGenerateWeek) {
    return <WorkoutLoader />;
  }

  if (paywall || sub.locked) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.heroCard}>
          <div style={s.heroHeader}>
            <span style={s.pill}>Доступ</span>
            <span style={s.credits}>Premium</span>
          </div>
          <div style={s.heroTitle}>Оформите подписку</div>
          <div style={s.heroSubtitle}>
            Генерация тренировок и питания доступна по подписке. Первый план/тренировка — бесплатно.
          </div>
          <div style={{ marginTop: 16, fontSize: 13, opacity: 0.9 }}>
            {sub.reason || "Оформите подписку, чтобы продолжить."}
          </div>
          <button
            className="soft-glow"
            style={{ ...s.primaryBtn, marginTop: 18 }}
            onClick={() => setPaywall(false)}
          >
            Ок
          </button>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.blockWhite}>
          <h3 style={{ marginTop: 0 }}>{error}</h3>
          <p style={{ marginTop: 6, color: "#555" }}>Проверь подключение и повтори попытку.</p>
          <button style={s.rowBtn} onClick={() => window.location.reload()}>Повторить</button>
        </section>
      </div>
    );
  }

  if (plannedError) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.blockWhite}>
          <h3 style={{ marginTop: 0 }}>{plannedError}</h3>
          <p style={{ marginTop: 6, color: "#555" }}>Попробуй обновить список тренировок.</p>
          <button style={s.rowBtn} onClick={() => loadPlanned()}>
            Обновить
          </button>
        </section>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />
      <style>{pickStyles}</style>

      <section style={pick.programHeaderRow} className="plan-fade plan-delay-1">
        <div style={pick.programHeaderLeft}>
          <span style={pick.programAvatarCircle}>
            <img src={mascotImg} alt="" style={pick.programAvatarImg} loading="eager" decoding="async" />
          </span>
          <div style={pick.programHeaderText}>
            <div style={pick.programHeaderTitle}>{weekHeaderTitle}</div>
            <div style={pick.programHeaderSub}>Запланируй тренировку или сразу начинай</div>
          </div>
        </div>
      </section>

      {weekWorkouts.length ? (
        <section style={pick.weekListWrap} className="plan-fade plan-delay-2">
          <div style={{ ...pick.weekListGrid, height: stackHeight }}>
            {weekWorkouts.map((w, index) => {
              const p: any = w.plan || {};
              const isSelected = w.id === activeStackId;
              const stackIndex = stackOrder.indexOf(index);
              const top = stackIndex * weekStackOffset;
              const status = w.status || "pending";
              const { totalExercises, minutes } = workoutChips(p);
              const label = dayLabelRU(p);
              const labelLower = String(label).toLowerCase();
              const dayMascotSrc = dayMascotForLabel(label);
              const weekCardMascotStyle =
                labelLower.includes("спина") && labelLower.includes("бицепс")
                  ? { ...pick.weekCardMascot, bottom: -6 }
                  : labelLower.includes("ноги") && labelLower.includes("ягодиц")
                    ? { ...pick.weekCardMascot, bottom: -10 }
                    : pick.weekCardMascot;
              const key = w.id;
              const expanded = Boolean(expandedPlannedIds[key]);
              const isCompletedWorkout = status === "completed";
              const hasActiveProgress = activeDraft?.plannedWorkoutId === w.id && typeof activeProgress === "number" && status !== "completed";
              const primaryActionLabel = isCompletedWorkout ? "Результат" : hasActiveProgress ? "Продолжить" : "Начать";
              const scheduledIso = w.scheduledFor ? toLocalDateInput(w.scheduledFor) : "";
              const isStaleSchedule = status !== "completed" && Boolean(scheduledIso) && scheduledIso < todayIso;
              const isUserScheduled = status === "scheduled" || status === "completed";
              const scheduledDateChip = isUserScheduled && w.scheduledFor ? formatScheduledDateChip(w.scheduledFor) : "";
              const hasScheduledDate = Boolean(scheduledDateChip) && !isStaleSchedule;
              const dateChipLabel = hasScheduledDate ? scheduledDateChip : "Дата и время";
              const canEditSchedule = status !== "completed";
              const chipToneStyle = isCompletedWorkout
                ? pick.weekDateChipScheduled
                : pick.weekDateChipPending;
              const showEditPencil = !isCompletedWorkout;

              return (
                <div
                  key={w.id}
                  className="plan-stack-card"
                  style={{
                    ...pick.weekCard,
                    ...(isSelected ? pick.weekCardSelected : null),
                    top,
                    zIndex: stackIndex + 1,
                    height: isSelected ? WEEK_STACK_ACTIVE_H : WEEK_STACK_COLLAPSED_H,
                  }}
                  onClick={() => setSelectedPlannedId(w.id)}
                >
                  {isSelected ? (
                    <>
                      <img src={dayMascotSrc} alt="" style={weekCardMascotStyle} loading="lazy" decoding="async" />

                      <div style={pick.weekDateChipRow} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          style={{
                            ...pick.weekDateChipButton,
                            ...chipToneStyle,
                            ...(canEditSchedule ? null : pick.weekDateChipDisabled),
                          }}
                          onClick={() => {
                            if (!canEditSchedule) return;
                            openScheduleForWorkout(w.id);
                          }}
                          aria-label={
                            hasScheduledDate ? "Изменить дату и время тренировки" : "Выбрать дату и время тренировки"
                          }
                          disabled={!canEditSchedule}
                        >
                          <span>{dateChipLabel}</span>
                        </button>
                        {showEditPencil ? (
                          <button
                            type="button"
                            style={pick.weekDateChipEditBtn}
                            onClick={() => openScheduleForWorkout(w.id)}
                            aria-label="Изменить дату и время тренировки"
                          >
                            <Pencil size={14} strokeWidth={2.1} style={pick.weekDateChipEditIcon} />
                          </button>
                        ) : null}
                      </div>

                      <div style={pick.weekCardTitle}>{label}</div>

                      <div style={pick.weekCardMeta}>
                        <span style={pick.infoChip}>
                          <Clock3 size={13} strokeWidth={2.1} style={pick.infoChipClockIcon} />
                          <span style={pick.infoChipMinutesText}>{minutes ? `${minutes} мин` : "—"}</span>
                        </span>
                        <span style={pick.infoChip}>
                          <Dumbbell size={14} strokeWidth={2.1} />
                          <span style={pick.infoChipExercisesText}>{totalExercises} упражнений</span>
                        </span>
                      </div>

                      <div style={pick.weekCardActions} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="dash-primary-btn day-cta"
                          style={pick.weekActionPrimary}
                          onClick={() => handleWorkoutPrimary(w)}
                        >
                          <span>{primaryActionLabel}</span>
                          <span
                            style={
                              hasActiveProgress
                                ? { ...pick.weekActionPrimaryIconWrap, ...pick.weekActionPrimaryProgressWrap }
                                : pick.weekActionPrimaryIconWrap
                            }
                          >
                            <span style={hasActiveProgress ? pick.weekActionPrimaryProgressText : pick.weekActionPrimaryArrow}>
                              {hasActiveProgress ? `${activeProgress}%` : isCompletedWorkout ? "✓" : "→"}
                            </span>
                          </span>
                        </button>
                        <div style={pick.detailsLinkHitbox}>
                          <button
                            type="button"
                            style={pick.detailsLinkBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPlannedIds((prev) => ({ ...prev, [key]: !expanded }));
                            }}
                            aria-label={expanded ? "Скрыть детали тренировки" : "Показать детали тренировки"}
                          >
                            <svg
                              viewBox="0 0 20 6"
                              width="20"
                              height="6"
                              aria-hidden
                              style={pick.detailsChevronIcon}
                            >
                              <circle cx="3" cy="3" r="1.45" fill="currentColor" />
                              <circle cx="10" cy="3" r="1.45" fill="currentColor" />
                              <circle cx="17" cy="3" r="1.45" fill="currentColor" />
                            </svg>
                          </button>
                        </div>
                        <span style={pick.weekActionsRightSpacer} aria-hidden />
                      </div>
                    </>
                  ) : (
                    <div style={pick.weekCardCollapsedBody}>
                      <div style={pick.weekCardCollapsedTitle}>{label}</div>
                      <div style={pick.weekDateChipCollapsedRow}>
                        <div
                          style={{
                            ...pick.weekDateChipCollapsed,
                            ...chipToneStyle,
                          }}
                        >
                          <span style={pick.weekDateChipCollapsedText}>{dateChipLabel}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {shouldRenderDetails && activeStackWorkout ? (
            <div style={pick.detailsSection} className={`workout-details-panel workout-details-${detailsPhase}`}>
              <PlannedExercisesEditor
                plannedWorkout={activeStackWorkout}
                displayItems={activeStackExercises}
                onUpdated={(pw) => {
                  setPlannedWorkouts((prev) => prev.map((x) => (x.id === pw.id ? pw : x)));
                }}
              />
            </div>
          ) : null}
        </section>
      ) : (
        <section style={s.blockWhite} className="plan-fade plan-delay-2">
          <h3 style={{ marginTop: 0 }}>Тренировок на неделю пока нет</h3>
          <p style={{ marginTop: 6, color: "#555" }}>
            Сгенерируем набор тренировок под твою схему. После выполнения они будут исчезать из списка.
          </p>
          <button type="button" className="tap-primary" style={{ ...s.primaryBtn, marginTop: 10 }} onClick={handleGenerateWeek}>
            Сгенерировать тренировки
          </button>
        </section>
      )}

      <div style={{ height: 16 }} />
      {inlineScheduleModal ? (
        <DateTimeWheelModal
          key={inlineScheduleModal.plannedWorkoutId}
          title="Дата и время"
          subtitle={inlineScheduleModal.title}
          initialDate={inlineScheduleModal.date}
          initialTime={inlineScheduleModal.time}
          disallowPast
          saving={inlineScheduleSaving}
          error={inlineScheduleError}
          onClose={() => {
            if (inlineScheduleSaving) return;
            setInlineScheduleModal(null);
            setInlineScheduleReplaceConfirm(null);
            setInlineScheduleError(null);
          }}
          onSave={handleInlineScheduleSave}
          onDelete={inlineScheduleModal.canDelete ? handleInlineScheduleDelete : undefined}
        />
      ) : null}
      {inlineScheduleReplaceConfirm ? (
        <ScheduleReplaceConfirmModal
          message={`На эту дату уже стоит тренировка «${inlineScheduleReplaceConfirm.conflictTitle}». Заменить ее на «${inlineScheduleReplaceConfirm.targetTitle}»?`}
          busy={inlineScheduleSaving}
          onConfirm={handleInlineScheduleReplaceConfirm}
          onCancel={() => {
            if (inlineScheduleSaving) return;
            setInlineScheduleReplaceConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* ----------------- Типы и утилиты ----------------- */

function humanizePlanError(err: any): string {
  if (!err) return "Не удалось обновить план";
  const rawError = typeof err?.body?.error === "string" ? err.body.error : null;
  const code =
    err?.body?.code ||
    err?.body?.details?.reason ||
    rawError ||
    (typeof err?.message === "string" ? err.message : null);
  const label = err?.body?.details?.nextDateLabel;
  const labelPart = typeof label === "string" && label.trim() ? ` ${label}` : "";

  if (code === "daily_limit") {
    return "Новую тренировку можно сгенерировать завтра — телу нужно восстановиться после нагрузки.";
  }
  if (code === "active_plan") {
    return "Вы уже сгенерировали тренировку. Чтобы получить следующую, заверши текущую и сохрани результат — так мы поддерживаем структуру плана и прогрессию.";
  }
  if (code === "interval_limit") {
    return label
      ? `Дай телу восстановиться. Следующую тренировку можно запустить ${label}.`
      : "Дай телу восстановиться. Попробуй чуть позже.";
  }
  if (code === "weekly_limit") {
    const weeklyTarget = Number(err?.body?.details?.weeklyTarget) || null;
    const targetText = weeklyTarget
      ? `Вы достигли недельного лимита тренировок. Программа строится под выбранный вами ритм — сейчас это ${weeklyTarget} ${pluralizeTrainings(
        weeklyTarget
      )} в неделю.`
      : "Вы достигли недельного лимита тренировок.";
    const tail = " Если хотите увеличить нагрузку, обновите настройки в анкете.";
    return `${targetText}${tail}`;
  }
  if (code === "unlock_pending") {
    return "Сначала заверши текущую тренировку, затем откроем новую.";
  }

  const fallback = extractPlanError(err);
  return labelPart ? `${fallback}${labelPart}`.trim() : fallback;
}

function extractPlanError(err: any): string {
  if (!err) return "Не удалось обновить план";
  const body = err?.body;
  let message: string | null = null;
  if (body) {
    if (typeof body === "string") {
      message = body;
    } else if (typeof body === "object") {
      if (typeof body.error === "string") message = body.error;
      else if (typeof body.message === "string") message = body.message;
    }
  }
  if (!message && (err?.status === 429 || err?.status === 403)) {
    message = "Ограничение на генерацию. Попробуй чуть позже.";
  }
  if (!message && typeof err?.message === "string" && !/_failed$/.test(err.message)) {
    message = err.message;
  }
  if (!message) message = "Не удалось обновить план";

  const nextLabel = body?.details?.nextDateLabel;
  if (typeof nextLabel === "string" && nextLabel.trim() && !message.includes(nextLabel)) {
    return `${message} ${nextLabel}`.trim();
  }
  return message;
}

function extractApiErrorCode(err: any): string | null {
  const bodyError = err?.body?.error;
  if (typeof bodyError === "string" && bodyError.trim()) return bodyError.trim();
  const raw = typeof err?.message === "string" ? err.message.trim() : "";
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const code = parsed?.error;
    return typeof code === "string" && code.trim() ? code.trim() : null;
  } catch {
    return null;
  }
}

function pluralizeTrainings(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "тренировка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "тренировки";
  return "тренировок";
}

function formatReps(r?: number | string | [number, number]) {
  if (r == null || r === "") return "—";
  if (Array.isArray(r)) return r.join("-"); // [4, 6] → "4-6"
  return typeof r === "number" ? String(r) : String(r);
}

/* ----------------- Компоненты UI ----------------- */

function WorkoutLoader() {
  return (
    <div style={loaderSimple.wrap}>
      <style>{`
        .plan-boot-loader{
          display:flex;
          gap:10px;
          align-items:center;
          justify-content:center;
        }
        .plan-boot-loader span{
          width:10px;
          height:10px;
          border-radius:50%;
          background:#111;
          animation: planBootPulse 1s ease-in-out infinite;
        }
        .plan-boot-loader span:nth-child(2){ animation-delay: .15s; }
        .plan-boot-loader span:nth-child(3){ animation-delay: .3s; }
        @keyframes planBootPulse{ 0%,100%{ transform: scale(.7); opacity:.35; } 50%{ transform: scale(1); opacity:1; } }
      `}</style>
      <div style={loaderSimple.inner}>
        <div className="plan-boot-loader" aria-label="Загрузка">
          <span />
          <span />
          <span />
        </div>
        <div style={loaderSimple.label}>Готовлю тренировки</div>
      </div>
    </div>
  );
}

// ── Spring constants (matches ExerciseActionsSheet) ───────────────────
const PEE_SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const PEE_SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const PEE_SPRING_CONTENT = "cubic-bezier(0.36, 0.66, 0.04, 1)";
const PEE_SHEET_ENTER_MS = 380;
const PEE_SHEET_EXIT_MS = 260;
const PEE_CONTENT_ANIM_MS = 280;
const PEE_OVERLAY_ENTER_MS = 320;
const PEE_OPEN_TICK_MS = 12;

type PeeMode = "menu" | "replace" | "confirm_remove" | "confirm_ban";
type PeeSlide = "forward" | "backward";

function peeSlideDir(prev: PeeMode, next: PeeMode): PeeSlide {
  if (next === "menu" && prev !== "menu") return "backward";
  return "forward";
}

function PeeSkeleton() {
  return (
    <div style={{ display: "grid", gap: 6 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            minHeight: 58,
            padding: "14px 16px",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.4)",
            background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
            boxShadow: "0 10px 22px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.7)",
            animationDelay: `${i * 60}ms`,
          }}
          className="pee-skeleton-row"
        >
          <div style={{ height: 14, borderRadius: 8, width: `${55 + (i % 3) * 15}%` }} className="pee-shimmer" />
        </div>
      ))}
    </div>
  );
}

function PeeMenuBtn({ icon, label, onClick, danger = false, disabled = false }: {
  icon: React.ReactNode; label: string; onClick: () => void;
  danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="pee-menu-btn"
      style={{
        ...s.menuGroupBtn,
        color: danger ? workoutTheme.danger : workoutTheme.accent,
      }}
      onClick={onClick}
      disabled={disabled}
    >
      <span style={{ ...s.menuBtnIconWrap, color: danger ? workoutTheme.danger : workoutTheme.accent, opacity: danger ? 0.8 : 1 }}>
        {icon}
      </span>
      <span style={{ ...s.menuBtnLabel, opacity: danger ? 0.8 : 1 }}>
        {label}
      </span>
    </button>
  );
}

function PeeAltRow({ alt, onClick, index, isLast }: { alt: ExerciseAlternative; onClick: () => void; index: number; isLast?: boolean }) {
  return (
    <>
      <button
        type="button"
        className="pee-menu-btn"
        style={{
          ...s.menuGroupBtn,
          ...s.altRowInner,
          animationDelay: `${index * 30}ms`,
        }}
        onClick={onClick}
      >
        <div style={s.altTextWrap}>
          <div style={s.altName}>{alt.name}</div>
          {alt.hint ? <div style={s.altHint}>{alt.hint}</div> : null}
        </div>
      </button>
      {!isLast && <div style={{ ...s.menuDivider, marginLeft: 16 }} />}
    </>
  );
}

function PlannedExercisesEditor({
  plannedWorkout,
  displayItems,
  onUpdated,
}: {
  plannedWorkout: PlannedWorkout;
  displayItems: Exercise[];
  onUpdated: (pw: PlannedWorkout) => void;
}) {
  const plan: any = plannedWorkout?.plan || {};
  const exercisesRaw: any[] = Array.isArray(plan?.exercises) ? plan.exercises : [];
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [displayIndex, setDisplayIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<PeeMode>("menu");
  const [alts, setAlts] = useState<ExerciseAlternative[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sheet open/close animation state
  const [renderOpen, setRenderOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const enteredRef = useRef(false);

  const applyPeeEntered = (v: boolean) => { enteredRef.current = v; setEntered(v); };

  // Content slide transition state
  const [currentMode, setCurrentMode] = useState<PeeMode>("menu");
  const [prevMode, setPrevMode] = useState<PeeMode | null>(null);
  const [slideDir, setSlideDir] = useState<PeeSlide>("forward");
  const [contentAnimating, setContentAnimating] = useState(false);

  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const contentTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      [closeTimerRef, openTimerRef, contentTimerRef].forEach((r) => {
        if (r.current != null) window.clearTimeout(r.current);
      });
    };
  }, []);

  // Lock body scroll while sheet is visible
  useEffect(() => {
    if (!renderOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [renderOpen]);

  const isSheetOpen = menuIndex != null;

  // Sheet open/close lifecycle
  useEffect(() => {
    if (isSheetOpen) {
      if (closeTimerRef.current != null) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
      // Always go through the 12ms tick if not fully entered yet
      if (!renderOpen || !enteredRef.current) {
        setRenderOpen(true);
        applyPeeEntered(false);
        if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = window.setTimeout(() => { applyPeeEntered(true); openTimerRef.current = null; }, PEE_OPEN_TICK_MS);
        return;
      }
      applyPeeEntered(true);
      return;
    }
    if (!renderOpen) return;
    if (openTimerRef.current != null) { window.clearTimeout(openTimerRef.current); openTimerRef.current = null; }
    applyPeeEntered(false);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setRenderOpen(false);
      setCurrentMode("menu");
      setPrevMode(null);
      setContentAnimating(false);
      setDisplayIndex(null);
      closeTimerRef.current = null;
    }, PEE_SHEET_EXIT_MS + 20);
  }, [isSheetOpen, renderOpen]);

  // Content slide on mode change
  const goMode = useCallback((next: PeeMode) => {
    if (next === mode) return;
    const dir = peeSlideDir(mode, next);
    if (contentTimerRef.current != null) window.clearTimeout(contentTimerRef.current);
    setPrevMode(mode);
    setCurrentMode(next);
    setSlideDir(dir);
    setContentAnimating(true);
    contentTimerRef.current = window.setTimeout(() => {
      setPrevMode(null);
      setContentAnimating(false);
      contentTimerRef.current = null;
    }, PEE_CONTENT_ANIM_MS + 20);
    setMode(next);
  }, [mode]);

  const openMenu = (idx: number) => {
    setErr(null);
    setMode("menu");
    setCurrentMode("menu");
    setPrevMode(null);
    setContentAnimating(false);
    setMenuIndex(idx);
    setDisplayIndex(idx);
  };

  const current = displayIndex != null ? displayItems[displayIndex] : null;
  const currentId = current?.exerciseId || null;

  const close = () => {
    setMenuIndex(null);
    setAlts([]);
    setLoading(false);
    setErr(null);
  };

  const fetchAlternatives = async () => {
    if (!currentId || menuIndex == null) return;
    setLoading(true);
    setErr(null);
    goMode("replace");
    try {
      const dayPatterns = [...new Set(exercisesRaw.map((ex: any) => ex.pattern).filter(Boolean))].join(",");
      const res = await getExerciseAlternatives({ exerciseId: currentId, reason: "preference", limit: 3, allowedPatterns: dayPatterns || undefined });
      const list = Array.isArray(res?.alternatives) ? res.alternatives : [];
      setAlts(list.slice(0, 3));
    } catch (e) {
      console.error(e);
      setErr("Не удалось загрузить варианты замены. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const applyReplace = async (newExerciseId: string) => {
    if (menuIndex == null) return;
    setLoading(true);
    setErr(null);
    try {
      const pw = await replacePlannedWorkoutExercise({
        plannedWorkoutId: plannedWorkout.id,
        index: menuIndex,
        newExerciseId,
        reason: "user_replace",
        source: "user",
      });
      onUpdated(pw);
      close();
      try { window.dispatchEvent(new Event("schedule_updated" as any)); } catch { }
    } catch (e) {
      console.error(e);
      setErr("Не удалось заменить упражнение. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const applyRemove = async () => {
    if (menuIndex == null) return;
    setLoading(true);
    setErr(null);
    try {
      const pw = await removePlannedWorkoutExercise({
        plannedWorkoutId: plannedWorkout.id,
        index: menuIndex,
        reason: "user_remove",
        source: "user",
      });
      onUpdated(pw);
      close();
      try { window.dispatchEvent(new Event("schedule_updated" as any)); } catch { }
    } catch (e) {
      console.error(e);
      setErr("Не удалось удалить упражнение. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const applyBan = async () => {
    if (!currentId) return;
    setLoading(true);
    setErr(null);
    try {
      await excludeExercise({ exerciseId: currentId, reason: "user_ban_from_plan", source: "user" });
      close();
    } catch (e) {
      console.error(e);
      setErr("Не удалось исключить упражнение. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render content by mode ─────────────────────────────────────────────
  const renderPeeContent = (m: PeeMode) => {
    switch (m) {
      case "menu":
        return (
          <div style={s.menuWrap}>
            <div style={s.menuGroup}>
              <PeeMenuBtn
                icon={<RefreshCw size={18} strokeWidth={2.2} />}
                label="Заменить упражнение"
                onClick={() => void fetchAlternatives()}
                disabled={loading || !currentId}
              />
              <div style={s.menuDivider} />
              <PeeMenuBtn
                icon={<Trash2 size={18} strokeWidth={2.2} />}
                label="Удалить из тренировки"
                onClick={() => goMode("confirm_remove")}
                danger
              />
              <div style={s.menuDivider} />
              <PeeMenuBtn
                icon={<Ban size={18} strokeWidth={2.2} />}
                label="Исключить из планов"
                onClick={() => goMode("confirm_ban")}
                danger
                disabled={loading || !currentId}
              />
            </div>
          </div>
        );
      case "replace":
        return (
          <div style={s.replaceWrap}>
            {loading ? (
              <PeeSkeleton />
            ) : err ? (
              <div style={s.errorCard}>
                <div style={s.errorTitle}>Не удалось загрузить</div>
                <div style={s.errorBody}>{err}</div>
                <button
                  type="button"
                  className="pee-sheet-btn"
                  style={{
                    ...s.sheetBtn,
                    color: workoutTheme.accent,
                    ["--pee-btn-color" as never]: workoutTheme.accent,
                    marginTop: 8,
                  }}
                  onClick={() => void fetchAlternatives()}
                >
                  Попробовать снова
                </button>
              </div>
            ) : alts.length === 0 ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>🔍</div>
                <div style={s.emptyTitle}>Замены не найдены</div>
                <div style={s.emptyBody}>Для этого упражнения подходящих альтернатив нет</div>
              </div>
            ) : (
              <div style={s.menuGroup}>
                {alts.map((a, idx) => (
                  <PeeAltRow key={a.exerciseId} alt={a} onClick={() => void applyReplace(a.exerciseId)} index={idx} isLast={idx === alts.length - 1} />
                ))}
              </div>
            )}
          </div>
        );
      case "confirm_remove":
        return (
          <div style={s.confirmWrap}>
            <p style={s.confirmBody}>Удалить упражнение из этого плана?</p>
            <div style={s.confirmButtonGroup}>
              <PeeMenuBtn icon={<Trash2 size={18} strokeWidth={2.2} />} label={loading ? "Удаляем..." : "Да, удалить"} onClick={() => void applyRemove()} danger disabled={loading} />
              <div style={{ ...s.menuDivider, marginLeft: 16 }} />
              <PeeMenuBtn icon={<ArrowLeft size={18} strokeWidth={2.2} />} label="Отмена" onClick={() => goMode("menu")} />
            </div>
          </div>
        );
      case "confirm_ban":
        return (
          <div style={s.confirmWrap}>
            <p style={s.confirmBody}>Убрать упражнение из будущих генераций?</p>
            <div style={s.confirmButtonGroup}>
              <PeeMenuBtn icon={<Ban size={18} strokeWidth={2.2} />} label={loading ? "Сохраняем..." : "Да, заблокировать"} onClick={() => void applyBan()} danger disabled={loading} />
              <div style={{ ...s.menuDivider, marginLeft: 16 }} />
              <PeeMenuBtn icon={<ArrowLeft size={18} strokeWidth={2.2} />} label="Отмена" onClick={() => goMode("menu")} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Styles for exercise rows
  const rowStyle: React.CSSProperties = {
    padding: "20px 18px",
    borderRadius: 24,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    overflow: "hidden",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    justifyContent: "space-between",
  };
  const exerciseTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: "#0f172a" };
  const exerciseCues: React.CSSProperties = { marginTop: 8, fontSize: 14, fontWeight: 400, lineHeight: 1.5, color: "rgba(15, 23, 42, 0.6)" };
  const volumeChip: React.CSSProperties = { background: "transparent", border: "none", boxShadow: "none", padding: 0, borderRadius: 0, fontSize: 14, fontWeight: 400, color: "rgba(15, 23, 42, 0.6)", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 7, lineHeight: 1.5 };
  const volumeChipIcon: React.CSSProperties = { transform: "translateY(0.2px)", flex: "0 0 auto" };
  const menuDotBtn: React.CSSProperties = { border: "none", background: "transparent", boxShadow: "none", padding: 0, margin: 0, width: 20, height: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#0f172a" };
  const menuDotWrap: React.CSSProperties = { width: 20, height: 10, position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" };
  const menuDotHit: React.CSSProperties = { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 44, height: 34, minWidth: 44, minHeight: 34, padding: 0, margin: 0, border: "none", borderRadius: 12, background: "transparent", boxShadow: "none", cursor: "pointer", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" };

  const canGoBack = currentMode !== "menu";

  return (
    <>
      <style>{peeCss}</style>
      <div style={{ marginTop: 2, padding: "2px 0 4px", display: "grid", gap: 8, overflow: "visible" }}>
        {displayItems.map((it, i) => {
          const isSkipped = Boolean((exercisesRaw[i] as any)?.skipped);
          const isThisOpen = menuIndex === i;
          return (
            <div key={`planned-ex-${i}-${it.name}`} style={rowStyle} className="exercise-card-enter">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={exerciseTitle}>
                  {it.name || `Упражнение ${i + 1}`}{" "}
                  {isSkipped ? <span style={{ opacity: 0.6 }}>(пропуск)</span> : null}
                </div>
                <div style={{ marginTop: 2 }}>
                  <span style={volumeChip}>
                    <Dumbbell size={14} strokeWidth={2.1} style={volumeChipIcon} />
                    <span>{it.sets}×{formatReps(it.reps)}</span>
                  </span>
                </div>
                {it.cues ? <div style={exerciseCues}>{it.cues}</div> : null}
              </div>
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <div style={menuDotWrap}>
                  <button
                    type="button"
                    style={menuDotBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isThisOpen) close();
                      else openMenu(i);
                    }}
                    aria-label="Опции"
                  >
                    <svg viewBox="0 0 20 6" width="20" height="6" aria-hidden style={{ color: "#0f172a" }}>
                      <circle cx="3" cy="3" r="1.45" fill="currentColor" />
                      <circle cx="10" cy="3" r="1.45" fill="currentColor" />
                      <circle cx="17" cy="3" r="1.45" fill="currentColor" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    style={menuDotHit}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isThisOpen) close();
                      else openMenu(i);
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom sheet — portalled to body */}
      {renderOpen
        ? typeof document !== "undefined"
          ? createPortal(
            <>
              {/* Backdrop */}
              <div
                style={{
                  position: "fixed", inset: 0, zIndex: 75,
                  background: workoutTheme.overlayStrong,
                  opacity: entered ? 1 : 0,
                  transition: `opacity ${entered ? PEE_OVERLAY_ENTER_MS : PEE_SHEET_EXIT_MS}ms ease`,
                }}
                onClick={close}
              />
              {/* Sheet */}
              <div
                style={{
                  position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 76,
                  borderRadius: "24px 24px 0 0",
                  border: workoutTheme.cardBorder,
                  background: "linear-gradient(180deg, rgba(255,255,255,0.985) 0%, rgba(242,242,247,0.975) 100%)",
                  boxShadow: workoutTheme.cardShadow,
                  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
                  maxHeight: "80vh",
                  display: "flex",
                  flexDirection: "column",
                  willChange: "transform, opacity",
                  overflowY: "auto",
                  overflowX: "hidden",
                  transform: entered ? "translate3d(0,0,0)" : "translate3d(0,100%,0)",
                  opacity: entered ? 1 : 0,
                  transition: entered
                    ? `transform ${PEE_SHEET_ENTER_MS}ms ${PEE_SPRING_OPEN}, opacity ${Math.round(PEE_SHEET_ENTER_MS * 0.6)}ms ease`
                    : `transform ${PEE_SHEET_EXIT_MS}ms ${PEE_SPRING_CLOSE}, opacity ${PEE_SHEET_EXIT_MS}ms ease`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Grabber */}
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 2, flexShrink: 0 }} aria-hidden>
                  <div style={{ width: 46, height: 5, borderRadius: 999, background: "rgba(15,23,42,0.16)" }} />
                </div>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", padding: "2px 8px 6px", flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label="Назад"
                    className="pee-icon-btn"
                    style={{
                      width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      border: "none", background: "transparent", borderRadius: 999, color: workoutTheme.textSecondary,
                      cursor: "pointer", padding: 0, flexShrink: 0,
                      opacity: canGoBack ? 1 : 0, pointerEvents: canGoBack ? "auto" : "none",
                    }}
                    onClick={() => goMode("menu")}
                    tabIndex={canGoBack ? 0 : -1}
                  >
                    <ArrowLeft size={15} strokeWidth={2.5} />
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    aria-label="Закрыть"
                    className="pee-icon-btn"
                    style={{
                      width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      border: "none", background: "transparent", borderRadius: 999, color: workoutTheme.textSecondary,
                      cursor: "pointer", padding: 0, flexShrink: 0,
                    }}
                    onClick={close}
                  >
                    <X size={15} strokeWidth={2.5} />
                  </button>
                </div>
                {/* Content with slide transitions */}
                <div style={{ display: "grid", flex: 1, minHeight: 0, overflow: contentAnimating ? "hidden" : "visible" }}>
                  {contentAnimating && prevMode ? (
                    <>
                      <div style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column", animation: `${slideDir === "forward" ? "pee-out-left" : "pee-out-right"} ${PEE_CONTENT_ANIM_MS}ms ${PEE_SPRING_CONTENT} both`, pointerEvents: "none" }}>
                        {renderPeeContent(prevMode)}
                      </div>
                      <div style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column", animation: `${slideDir === "forward" ? "pee-in-right" : "pee-in-left"} ${PEE_CONTENT_ANIM_MS}ms ${PEE_SPRING_CONTENT} both` }}>
                        {renderPeeContent(currentMode)}
                      </div>
                    </>
                  ) : (
                    <div style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column" }}>
                      {renderPeeContent(currentMode)}
                    </div>
                  )}
                </div>
              </div>
            </>,
            document.body
          )
          : null
        : null}
    </>
  );
}

// ── PlanOne exercise menu CSS ──────────────────────────────────────────
const peeCss = `
  @keyframes pee-in-right {
    from { opacity: 0; transform: translate3d(44px, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes pee-in-left {
    from { opacity: 0; transform: translate3d(-44px, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes pee-out-left {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to   { opacity: 0; transform: translate3d(-44px, 0, 0); }
  }
  @keyframes pee-out-right {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to   { opacity: 0; transform: translate3d(44px, 0, 0); }
  }
  @keyframes pee-alt-in {
    from { opacity: 0; transform: translate3d(0, 10px, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes pee-skeleton-fade {
    from { opacity: 0; transform: translate3d(0, 6px, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes pee-shimmer {
    from { background-position: 200% 0; }
    to   { background-position: -200% 0; }
  }
  .pee-skeleton-row {
    animation: pee-skeleton-fade 0.4s ease both;
  }
  .pee-shimmer {
    background: linear-gradient(90deg,
      rgba(15,23,42,0.07) 0%,
      rgba(15,23,42,0.12) 30%,
      rgba(15,23,42,0.07) 60%
    ) !important;
    background-size: 200% 100% !important;
    animation: pee-shimmer 1.4s ease infinite !important;
  }
  /* Menu wrapper classes for PlanOne */
  .pee-menu-btn {
    appearance: none;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    transition: background 120ms ease;
  }
  .pee-menu-btn:active:not(:disabled) {
    background: rgba(15,23,42,0.08) !important;
  }

  .pee-sheet-btn {
    appearance: none;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    transition:
      background 220ms ease,
      border-color 220ms ease,
      color 220ms ease,
      transform 160ms ease,
      box-shadow 220ms ease;
    will-change: transform, background, border-color, box-shadow;
  }
  .pee-sheet-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.99);
  }
  .pee-sheet-btn:disabled {
    opacity: 0.72;
    cursor: default;
  }
  .pee-icon-btn {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    transition: opacity 120ms ease, transform 120ms ease;
    will-change: transform;
  }
  .pee-icon-btn:active {
    opacity: 0.55;
    transform: scale(0.9);
  }
  @media (prefers-reduced-motion: reduce) {
    .pee-sheet-btn, .pee-icon-btn, .pee-shimmer, .pee-skeleton-row {
      transition: none !important;
      animation: none !important;
    }
  }
`;

/* ----------------- Стиль под Dashboard ----------------- */

const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const loaderSimple = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#ffffff",
    padding: 16,
  } as React.CSSProperties,
  inner: {
    display: "grid",
    gap: 10,
    justifyItems: "center",
  } as React.CSSProperties,
  label: {
    fontSize: 13,
    color: "rgba(15,23,42,0.62)",
    fontWeight: 600,
  } as React.CSSProperties,
};

const s: Record<string, React.CSSProperties> = {
  menuWrap: {
    padding: "0px 0px 8px",
  },
  menuGroup: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  menuGroupBtn: {
    width: "100%",
    minHeight: 56,
    background: "transparent",
    border: "none",
    padding: "14px 24px",
    fontSize: 18,
    fontWeight: 500,
    textAlign: "left" as const,
    cursor: "pointer",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  menuDivider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    marginLeft: 68,
  },
  menuBtnIconWrap: {
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: "inherit",
  },
  menuBtnLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: 500,
    color: "inherit",
    lineHeight: 1.25,
  },
  replaceWrap: {
    display: "grid",
    gap: 0,
    padding: "0px 0px 8px",
  },
  altRowInner: {
    animation: "pee-alt-in 0.32s cubic-bezier(0.36, 0.66, 0.04, 1) both",
    color: workoutTheme.accent,
    padding: "14px 24px",
  },
  altTextWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  altName: {
    fontSize: 18,
    fontWeight: 500,
    color: "inherit",
    lineHeight: 1.3,
  },
  altHint: {
    fontSize: 13,
    fontWeight: 500,
    color: workoutTheme.textMuted,
    marginTop: 3,
    lineHeight: 1.3,
  },
  confirmWrap: {
    display: "flex",
    flexDirection: "column",
    padding: "0px 0px 8px",
  },
  confirmBody: {
    fontSize: 15,
    color: workoutTheme.textSecondary,
    lineHeight: 1.45,
    textAlign: "center",
    padding: "16px 16px 20px",
    margin: 0,
  },
  confirmButtonGroup: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  errorCard: {
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: 20,
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center" as const,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: workoutTheme.danger,
    marginBottom: 6,
  },
  errorBody: {
    fontSize: 14,
    color: workoutTheme.textSecondary,
    marginBottom: 16,
    lineHeight: 1.4,
  },
  sheetBtn: {
    width: "100%",
    background: "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.4) 100%)",
    border: "1px solid rgba(255,255,255,0.4)",
    boxShadow: "0 8px 20px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
    borderRadius: 16,
    padding: "14px 20px",
    fontSize: 16,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    padding: "32px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center" as const,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: 600,
    color: workoutTheme.textPrimary,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 14,
    color: workoutTheme.textSecondary,
    lineHeight: 1.4,
  },

  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui, -apple-system, 'Inter', 'Roboto', Segoe UI",
    background:
      "transparent",
    minHeight: "100vh",
  },

  heroCard: {
    position: "relative",
    padding: 20,
    borderRadius: 24,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
  },
  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  pill: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.12)",
    backdropFilter: "blur(4px)",
    textTransform: "capitalize",
  },
  credits: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.12)",
    backdropFilter: "blur(4px)",
    textTransform: "none",
    letterSpacing: 0.3,
  },
  heroTitle: { fontSize: 24, fontWeight: 800, marginTop: 6, color: "#fff" },
  heroSubtitle: { opacity: 0.85, marginTop: 4, color: "rgba(255,255,255,.85)" },
  primaryBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 700,
    color: "#000",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    border: "none",
    boxShadow: "0 12px 30px rgba(0,0,0,.35)",
    cursor: "pointer",
  },

  blockWhite: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    background: "#fff",
    boxShadow: cardShadow,
  },
  rowBtn: {
    border: "none",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    cursor: "pointer",
    marginTop: 8,
  },

};

function SoftGlowStyles() {
  return (
    <style>{`
      .soft-glow {
        background: linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);
        background-size: 300% 300%;
        animation: glowShift 6s ease-in-out infinite, pulseSoft 3s ease-in-out infinite;
        transition: background 0.3s ease;
      }
      @keyframes glowShift { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
      @keyframes pulseSoft { 0%,100% { filter: brightness(1) saturate(1); transform: scale(1) } 50% { filter: brightness(1.15) saturate(1.1); transform: scale(1.01) } }
      @media (prefers-reduced-motion: reduce) { .soft-glow { animation: none } }
      
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(20px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .exercise-card-enter {
        animation: fadeInUp 0.24s cubic-bezier(0.16, 1, 0.3, 1) backwards;
      }
    `}</style>
  );
}

function TypingDotsStyles() {
  return (
    <style>{`
      .typing-dots {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      .typing-dots .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #1b1b1b;
        opacity: 0.3;
        animation: blink 1.2s infinite;
      }
      .typing-dots .dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dots .dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes blink {
        0%   { opacity: 0.3; transform: translateY(0); }
        50%  { opacity: 1;   transform: translateY(-2px); }
        100% { opacity: 0.3; transform: translateY(0); }
      }
    `}</style>
  );
}

const pickStyles = `
  @keyframes planFadeUp {
    0% { opacity: 0; transform: translateY(14px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .plan-fade {
    animation: planFadeUp 520ms ease-out both;
  }
  .plan-delay-1 { animation-delay: 80ms; }
  .plan-delay-2 { animation-delay: 160ms; }
  .plan-delay-3 { animation-delay: 240ms; }
  .workout-details-panel {
    overflow: hidden;
    transform-origin: top center;
    will-change: max-height, opacity, transform;
    transition:
      max-height 220ms cubic-bezier(0.16, 1, 0.3, 1),
      opacity 180ms ease,
      transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .workout-details-entering,
  .workout-details-closing {
    max-height: 0;
    opacity: 0;
    transform: translateY(-6px) scale(0.99);
    pointer-events: none;
  }
  .workout-details-open {
    max-height: 1200px;
    opacity: 1;
    transform: translateY(0) scale(1);
    overflow: visible;
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(24px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .scheme-enter {
    animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  }
  .scheme-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(15,23,42,0.14);
  }

  .planone-start-btn {
    transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    user-select: none;
  }
  .planone-start-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.99) !important;
    background-color: #0b1220 !important;
    box-shadow: 0 6px 12px rgba(0,0,0,0.14) !important;
    filter: brightness(0.99) !important;
  }
  @media (hover: hover) {
    .planone-start-btn:hover:not(:disabled) { filter: brightness(1.03); }
  }
  .planone-start-btn:focus-visible {
    outline: 3px solid rgba(15, 23, 42, 0.18);
    outline-offset: 2px;
  }
  .plan-stack-card {
    -webkit-tap-highlight-color: transparent;
    transition: transform 220ms ease, box-shadow 220ms ease;
    will-change: transform;
  }
  .plan-stack-card:active:not(:disabled) {
    transform: translateY(1px) scale(0.98);
  }
  .dash-primary-btn {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    user-select: none;
    transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
  }
  .dash-primary-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.99) !important;
    background-color: #1e1f22 !important;
  }
  .day-cta:active:not(:disabled) {
    transform: translateY(1px) scale(0.99) !important;
  }
  .exercise-menu-option {
    -webkit-tap-highlight-color: transparent;
    transition: background 140ms ease, color 140ms ease, font-weight 140ms ease;
  }
  .exercise-menu-option:active:not(:disabled),
  .exercise-menu-option.is-active:not(:disabled) {
    background: rgba(30,31,34,0.06) !important;
    font-weight: 600 !important;
  }
  @media (hover: hover) {
    .exercise-menu-option:hover:not(:disabled) {
      background: rgba(30,31,34,0.05);
    }
  }
  .exercise-menu-option-danger {
    color: #b42318 !important;
  }
  .exercise-menu-option:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .exercise-menu-option:focus-visible {
    outline: 2px solid rgba(30,31,34,0.2);
    outline-offset: -2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .plan-fade,
    .plan-delay-1,
    .plan-delay-2,
    .plan-delay-3 { animation: none !important; opacity: 1 !important; transform: none !important; }
    .workout-details-panel,
    .workout-details-entering,
    .workout-details-closing,
    .workout-details-open { transition: none !important; animation: none !important; }
    .plan-stack-card { transition: none !important; }
    .dash-primary-btn { transition: none !important; }
    .exercise-menu-option { transition: none !important; }
  }
`;

const pick: Record<string, React.CSSProperties> = {
  programHeaderRow: {
    marginTop: 2,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  programHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  programAvatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flex: "0 0 auto",
    padding: 2,
  },
  programAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center 10%",
    borderRadius: 999,
  },
  programHeaderText: {
    display: "grid",
    gap: 2,
  },
  programHeaderTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1e1f22",
    lineHeight: 1.2,
  },
  programHeaderSub: {
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.4,
    color: "rgba(30, 31, 34, 0.7)",
  },
  weekListWrap: {
    marginTop: 12,
    display: "grid",
    gap: 8,
  },
  weekListGrid: {
    position: "relative",
    width: "100%",
  },
  weekCard: {
    position: "absolute",
    left: 0,
    right: 0,
    padding: "20px 18px",
    borderRadius: 24,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow:
      "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    transition: "top 320ms ease, height 320ms ease, transform 220ms ease, box-shadow 220ms ease",
    willChange: "top, height, transform",
    cursor: "pointer",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  weekCardSelected: {},
  weekCardMascot: {
    position: "absolute",
    right: -36,
    bottom: -18,
    width: 150,
    height: "auto",
    opacity: 1,
    filter: "none",
    pointerEvents: "none",
    zIndex: 0,
    transition: "opacity 220ms ease, transform 220ms ease",
  },
  weekCardTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.1,
    letterSpacing: -0.5,
    position: "relative",
    zIndex: 1,
  },
  weekDateChipRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    width: "fit-content",
    position: "relative",
    zIndex: 1,
  },
  weekDateChipButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: 28,
    padding: "0 12px",
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: "nowrap",
    width: "fit-content",
    position: "relative",
    zIndex: 1,
    transition: "background 180ms ease, box-shadow 180ms ease, color 180ms ease",
  },
  weekDateChipPending: {
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    color: "rgba(17,29,46,0.48)",
    textShadow: "0 1px 0 rgba(255,255,255,0.86), 0 -1px 0 rgba(15,23,42,0.14)",
  },
  weekDateChipScheduled: {
    background: "linear-gradient(180deg, rgba(222,236,208,0.98) 0%, rgba(206,226,188,0.96) 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(46,74,29,0.2), inset 0 -1px 0 rgba(255,255,255,0.82)",
    color: "rgba(26,56,16,0.62)",
    textShadow: "0 1px 0 rgba(255,255,255,0.88), 0 -1px 0 rgba(35,71,19,0.2)",
  },
  weekDateChipDisabled: {
    cursor: "default",
    opacity: 0.8,
  },
  weekDateChipEditBtn: {
    border: "none",
    background: "transparent",
    boxShadow: "none",
    padding: 0,
    margin: 0,
    width: 14,
    height: 14,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "rgba(15,23,42,0.6)",
    flex: "0 0 auto",
  },
  weekDateChipEditIcon: {
    color: "rgba(15,23,42,0.6)",
    flex: "0 0 auto",
  },
  weekCardMeta: {
    display: "flex",
    alignItems: "center",
    color: "rgba(15,23,42,.56)",
    gap: 14,
    position: "relative",
    zIndex: 1,
  },
  weekCardCollapsedBody: {
    marginTop: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  weekDateChipCollapsedRow: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    maxWidth: "100%",
    flexShrink: 0,
    position: "relative",
    zIndex: 1,
  },
  weekDateChipCollapsed: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 22,
    padding: "0 9px",
    borderRadius: 999,
    width: "fit-content",
    maxWidth: "100%",
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1,
    position: "relative",
    zIndex: 1,
  },
  weekDateChipCollapsedText: {
    display: "inline-block",
    whiteSpace: "nowrap",
    overflow: "visible",
    textOverflow: "clip",
  },
  weekCardCollapsedTitle: {
    fontSize: 20,
    lineHeight: 1.12,
    letterSpacing: -0.3,
    fontWeight: 700,
    color: "#0f172a",
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  weekCardActions: {
    marginTop: "auto",
    paddingTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "end",
    width: "100%",
  },
  weekActionPrimary: {
    alignSelf: "flex-start",
    justifySelf: "start",
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    height: 50,
    padding: "0 14px",
    border: "1px solid #1e1f22",
    borderRadius: 999,
    background: "#1e1f22",
    color: "#fff",
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "none",
  },
  weekActionPrimaryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
  },
  weekActionPrimaryProgressWrap: {
    width: "auto",
    minWidth: 44,
    padding: "0 8px",
  },
  weekActionPrimaryArrow: {
    fontSize: 18,
    lineHeight: 1,
    color: "#0f172a",
    fontWeight: 700,
  },
  weekActionPrimaryProgressText: {
    fontSize: 13,
    lineHeight: 1,
    color: "rgba(17,29,46,0.58)",
    fontWeight: 700,
    textShadow: "0 1px 0 rgba(255,255,255,0.86), 0 -1px 0 rgba(15,23,42,0.14)",
    letterSpacing: -0.1,
  },
  detailsLinkHitbox: {
    justifySelf: "center",
    alignSelf: "end",
    width: 20,
    height: 10,
    display: "grid",
    placeItems: "center",
    position: "relative",
  },
  detailsLinkBtn: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
    margin: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 34,
    minWidth: 44,
    minHeight: 34,
    borderRadius: 12,
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
  },
  detailsChevronIcon: {
    color: "#0f172a",
  },
  weekActionsRightSpacer: {
    justifySelf: "end",
    width: 1,
    height: 1,
  },
  infoChip: {
    background: "transparent",
    border: "none",
    boxShadow: "none",
    padding: 0,
    borderRadius: 0,
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15, 23, 42, 0.6)",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    lineHeight: 1.5,
  },
  infoChipClockIcon: {
    transform: "translateY(0.2px)",
    flex: "0 0 auto",
  },
  infoChipMinutesText: {
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.5,
  },
  infoChipExercisesText: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
  },
  detailsSection: {
    marginTop: 2,
    padding: 0,
    background: "transparent",
    borderRadius: 0,
    border: "none",
    display: "block",
  },
};


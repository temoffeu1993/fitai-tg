import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { loadHistory } from "@/lib/history";
import {
  createPlannedWorkout,
  getScheduleOverview,
  removePlannedWorkoutExercise,
  reschedulePlannedWorkout,
  replacePlannedWorkoutExercise,
  updatePlannedWorkout,
  type PlannedWorkout,
} from "@/api/schedule";
import { getMesocycleCurrent, submitCheckIn, type CheckInPayload } from "@/api/plan";
import { excludeExercise, getExerciseAlternatives, type ExerciseAlternative } from "@/api/exercises";
import { useWorkoutPlan } from "@/hooks/useWorkoutPlan";
import { useNutritionGenerationProgress } from "@/hooks/useNutritionGenerationProgress";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { CheckInForm } from "@/components/CheckInForm";
import DateTimeWheelModal from "@/components/DateTimeWheelModal";
import ScheduleReplaceConfirmModal from "@/components/ScheduleReplaceConfirmModal";
import { readSessionDraft } from "@/lib/activeWorkout";
import { toSessionPlan } from "@/lib/toSessionPlan";
import { resolveDayCopy } from "@/utils/dayLabelCopy";
import { ArrowLeft, Ban, Clock3, Dumbbell, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { workoutTheme } from "@/components/workout-session/theme";
import mascotImg from "@/assets/robonew.webp";
import tyagaImg from "@/assets/tyaga.webp";
import zhimImg from "@/assets/zhim.webp";
import nogiImg from "@/assets/nogi.webp";
import sredneImg from "@/assets/sredne.webp";

const toDateInput = (d: Date) => toDateKeyLocal(d);
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
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => toDateInput(new Date()));
  const [scheduleTime, setScheduleTime] = useState(() => defaultScheduleTime());
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
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

  // collapsible state
  const [openWarmup, setOpenWarmup] = useState(false);
  const [openMain, setOpenMain] = useState(false);
  const [openCooldown, setOpenCooldown] = useState(false);

  // trainer notes popup
  const [showNotes, setShowNotes] = useState(false);
  const [regenNotice, setRegenNotice] = useState<string | null>(null);
  const [regenInlineError, setRegenInlineError] = useState<string | null>(null);
  const [regenPending, setRegenPending] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
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

  const isAdmin = useMemo(() => {
    try {
      const raw = localStorage.getItem("profile");
      const profile = raw ? JSON.parse(raw) : null;
      const tgId = profile?.id ? String(profile.id) : null; // telegram numeric id
      const userId = profile?.user_id ? String(profile.user_id) : null; // backend uuid if есть
      const userUuid = profile?.uuid ? String(profile.uuid) : null;
      const username = profile?.username ? String(profile.username) : null;
      const adminEnv = String(import.meta.env.VITE_ADMIN_IDS || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      const adminTgEnv = String(import.meta.env.VITE_ADMIN_TG_IDS || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      const hardcoded = ["d5d09c2c-f82b-4055-8cfa-77342b3a89f2", "artemryzih"];
      const override = localStorage.getItem("admin_override") === "1";
      const identifiers = [tgId, userId, userUuid, username]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      return (
        override ||
        identifiers.some((v) => adminEnv.includes(v) || adminTgEnv.includes(v) || hardcoded.includes(v))
      );
    } catch {
      return false;
    }
  }, []);

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
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toDateKeyLocal(new Date()), []);
  const heroDateChipRaw = today.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const heroDateChip = heroDateChipRaw.charAt(0).toUpperCase() + heroDateChipRaw.slice(1);
  const chips = useMemo(() => {
    if (!plan) return null;
    const sets = (plan.exercises || []).reduce((a: number, x: any) => a + Number(x.sets || 0), 0);
    const minutes = Number(plan.duration || 0) || Math.max(25, Math.min(90, Math.round(sets * 3.5)));
    const kcal = Math.round(minutes * 6);
    return { sets, minutes, kcal };
  }, [plan]);
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
  const effectivePlan = needsCheckIn ? null : plan;

  // When there are no planned workouts, we immediately show the loader while the auto-generation effect kicks in.
  // This avoids a UI "flash" where the user briefly sees the empty-state button after navigating from dashboard.
  const shouldAutoGenerateWeek =
    plannedFetchedOnce &&
    !plannedLoading &&
    !weekGenerating &&
    remainingPlanned.length === 0 &&
    !sub.locked &&
    !initialWeekRequested;

  // Формируем понятное название тренировки на русском
  const planTitle = useMemo(() => {
    if (!effectivePlan) return "Тренировка дня";

    const label = effectivePlan.dayLabel || "";
    const focus = effectivePlan.dayFocus || "";

    // Если есть dayLabel, используем его как базу
    if (label.toLowerCase().includes("push")) {
      return "Грудь, плечи и трицепс";
    }
    if (label.toLowerCase().includes("pull")) {
      return "Спина и бицепс";
    }
    if (label.toLowerCase().includes("leg")) {
      return "Ноги и Ягодицы";
    }
    if (label.toLowerCase().includes("upper")) {
      return "Верхняя часть тела";
    }
    if (label.toLowerCase().includes("lower")) {
      return "Нижняя часть тела";
    }
    if (label.toLowerCase().includes("full body")) {
      return "Всё тело";
    }

    // Если в dayLabel есть русское название - используем его
    if (label && /[а-яА-Я]/.test(label)) {
      return label;
    }

    // Иначе пытаемся вытащить из focus
    if (focus && /[а-яА-Я]/.test(focus)) {
      // Берем первое предложение до точки/запятой
      const firstPart = focus.split(/[.,:—]/)[0].trim();
      if (firstPart.length < 50) return firstPart;
    }

    // Fallback на старое поведение
    return effectivePlan.title?.trim() || "Тренировка дня";
  }, [effectivePlan]);

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
      setRegenPending(false);
      setRegenInlineError(null);
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

  // --- новый обработчик регенерации: сброс экрана и запуск генерации ---
  const handleRegenerate = async () => {
    try {
      localStorage.removeItem("current_plan");
      localStorage.removeItem("session_draft");
    } catch { }
    setShowNotes(false);
    setRegenInlineError(null);
    setRegenNotice(null);

    if (sub.locked) {
      setPaywall(true);
      return;
    }

    // переводим пользователя обратно к форме чек-ина, чтобы сгенерировать с новыми данными
    setNeedsCheckIn(true);
    setInitialPlanRequested(false);
    setRegenPending(false);
  };

  const handleCheckInSubmit = async (data: CheckInPayload) => {
    setCheckInLoading(true);
    setCheckInError(null);
    try {
      await submitCheckIn(data);
      setInitialPlanRequested(true);
      setNeedsCheckIn(false); // сразу уходим из формы и ждём новую генерацию
      kickProgress();
      setRegenPending(true);
      await refresh({ force: true });
    } catch (err: any) {
      const message =
        err?.body?.error ||
        err?.body?.message ||
        err?.message ||
        "Не удалось сохранить самочувствие";
      setCheckInError(String(message));
    } finally {
      setRegenPending(false);
      setCheckInLoading(false);
    }
  };

  // REMOVED: handlePreWorkoutCheckInSubmit - now handled in separate CheckIn screen

  const handleScheduleOpen = () => {
    setScheduleDate(toDateInput(new Date()));
    setScheduleTime(defaultScheduleTime());
    setScheduleError(null);
    setShowScheduleModal(true);
  };

  const handleScheduleConfirm = async () => {
    if (!plan) return;
    if (!scheduleDate || !scheduleTime) {
      setScheduleError("Укажи дату и время");
      return;
    }
    const when = new Date(`${scheduleDate}T${scheduleTime}`);
    if (!Number.isFinite(when.getTime())) {
      setScheduleError("Некорректная дата или время");
      return;
    }

    try {
      setScheduleSaving(true);
      setScheduleError(null);
      await createPlannedWorkout({
        plan,
        scheduledFor: when.toISOString(),
        scheduledTime: scheduleTime,
        date: scheduleDate,
        time: scheduleTime,
        utcOffsetMinutes: when.getTimezoneOffset(),
      });
      setShowScheduleModal(false);
      try {
        window.dispatchEvent(new CustomEvent("schedule_updated"));
      } catch { }
      nav("/", { replace: true });
    } catch (err) {
      console.error("createPlannedWorkout failed", err);
      setScheduleError("Не удалось сохранить. Попробуй ещё раз.");
    } finally {
      setScheduleSaving(false);
    }
  };

  // New UI: show all generated workouts (remaining ones) as selectable cards
  const selectedPlanned = remainingPlanned.find((w) => w.id === selectedPlannedId) || null;
  const canStart = Boolean(selectedPlanned && selectedPlanned.scheduledFor);
  const startWorkoutDate = selectedPlanned?.scheduledFor ? toLocalDateInput(selectedPlanned.scheduledFor) : null;
  const normalizeSchemeTitleRU = (raw: string) => {
    let s = String(raw || "").trim();
    if (!s) return "Схема тренировок";

    // remove emojis
    s = s.replace(/[\u{1F300}-\u{1FAFF}]/gu, "").trim();
    // remove bracketed qualifiers
    s = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s*\[[^\]]*]\s*/g, " ").trim();
    // remove trailing qualifiers after dash
    s = s.replace(/\s*[-—–].*$/g, "").trim();
    s = s.replace(/\s{2,}/g, " ").trim();

    const v = s.toLowerCase();

    const hasUpper = /(upper|верх)/.test(v);
    const hasLower = /(lower|низ)/.test(v);
    const hasFull = /(full\s*body|fullbody|full|всё\s*тело|все\s*тело)/.test(v);
    const hasPPL = /(ppl|push|pull|legs?|пуш|пул|ног)/.test(v);

    if (hasUpper && hasLower && hasFull) return "Верх/Низ/Всё тело";
    if (hasUpper && hasLower) return "Верх/Низ";
    if (hasFull) return "Всё тело";
    if (hasPPL) return "Пуш/Пул/Ноги";
    if (hasUpper) return "Верх";
    if (hasLower) return "Низ";

    // light translation for common english words + cleanup
    s = s
      .replace(/full\s*body|fullbody/gi, "Всё тело")
      .replace(/upper/gi, "Верх")
      .replace(/lower/gi, "Низ")
      .replace(/push/gi, "Пуш")
      .replace(/pull/gi, "Пул")
      .replace(/legs?/gi, "Ноги");

    s = s
      .replace(/\s*[|]\s*/g, "/")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s*-\s*/g, "/")
      .replace(/\s{2,}/g, " ")
      .replace(/[,:;.!]+$/g, "")
      .trim();

    if (!s) return "Схема тренировок";
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const schemeTitle = (() => {
    const pool = [selectedPlanned, ...remainingPlanned].filter(Boolean) as PlannedWorkout[];
    for (const w of pool) {
      const name = String((w.plan as any)?.schemeName || "").trim();
      if (name) return normalizeSchemeTitleRU(name);
    }
    return "Тренировки";
  })();
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

  const decapitalizeRU = (text: string) => {
    const s = String(text || "").trim();
    if (!s) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
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

  const selectedDayLabel = (() => {
    if (!selectedPlanned) return null;
    const p: any = selectedPlanned.plan || {};
    return dayLabelRU(p);
  })();

  const startCtaLabel = "🏁 Начать тренировку";
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

  const handleStartSelected = () => {
    if (!selectedPlanned || !startWorkoutDate) return;
    const selectedId = selectedPlanned.id;
    if (activeDraft?.plannedWorkoutId === selectedId) {
      nav("/workout/session", { state: { plannedWorkoutId: selectedId } });
      return;
    }
    if ((selectedPlanned.plan as any)?.meta?.checkinApplied) {
      nav("/workout/session", { state: { plan: toSessionPlan(selectedPlanned.plan as any), plannedWorkoutId: selectedId } });
      return;
    }
    nav("/check-in", {
      state: {
        workoutDate: startWorkoutDate,
        plannedWorkoutId: selectedPlanned.id,
        returnTo: "/plan/one",
      },
    });
  };

  const handleScheduleSelected = () => {
    const fallback =
      selectedPlanned ||
      remainingPlanned[0] ||
      plannedWorkouts.find((w) => w.status === "scheduled" || w.status === "pending") ||
      null;
    if (!fallback) return;
    openScheduleForWorkout(fallback.id);
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
      } else {
        nav("/workout/result");
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

  // вычисления для верхнего блока (кнопки и метрики)
  const workoutNumber = (() => {
    try { const history = loadHistory(); return history.length + 1; } catch { return 1; }
  })();
  const totalExercises = Array.isArray(plan.exercises) ? plan.exercises.length : 0;
  const regenButtonDisabled = sub.locked || regenPending;
  const regenButtonLabel = regenPending ? "Готовим план..." : "Сгенерировать заново";

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />

      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>{heroDateChip}</span>
        </div>
        <div style={s.heroTitle}>{planTitle}</div>
        <div style={s.heroSubtitle}>Краткое превью перед стартом</div>

        <div style={s.heroCtas}>
          <button
            style={s.primaryBtn}
            onClick={() => {
              // Navigate to check-in screen
              nav("/check-in", {
                state: {
                  workoutDate: toDateInput(new Date()),
                  returnTo: "/plan/one",
                },
              });
            }}
          >
            🏁 Начать тренировку
          </button>

          <button
            type="button"
            style={s.secondaryBtn}
            onClick={handleScheduleOpen}
          >
            📅 Запланировать
          </button>
        </div>

        {/* regenerate button removed by request */}
      </section>

      {/* Чипы в фирменном стиле под верхним блоком */}
      {chips && (
        <section style={s.statsRow}>
          <ChipStatSquare emoji="🎯" label="Тренировка" value={`#${workoutNumber}`} />
          <ChipStatSquare emoji="🕒" label="Время" value={`${chips.minutes} мин`} />
          <ChipStatSquare emoji="💪" label="Упражнения" value={`${totalExercises}`} />
        </section>
      )}

      {/* Разминка */}
      {Array.isArray(plan.warmup) && plan.warmup.length > 0 && (
        <SectionCard
          icon="🔥"
          title="Разминка"
          hint="Мягкая активация. Подготовь суставы и мышцы к работе, двигайся плавно без рывков."
          isOpen={openWarmup}
          onToggle={() => setOpenWarmup((v) => !v)}
        >
          <ExercisesList items={plan.warmup} variant="warmup" isOpen={openWarmup} />
        </SectionCard>
      )}

      {/* Основная часть */}
      <SectionCard
        icon="💪"
        title="Основная часть"
        hint={plan.dayFocus || `${plan.dayLabel}: Основной тренировочный блок с прогрессией нагрузки. Следи за техникой выполнения.`}
        isOpen={openMain}
        onToggle={() => setOpenMain((v) => !v)}
      >
        <ExercisesList items={plan.exercises} variant="main" isOpen={openMain} />
      </SectionCard>

      {/* Заминка */}
      {Array.isArray(plan.cooldown) && plan.cooldown.length > 0 && (
        <SectionCard
          icon="🧘"
          title="Заминка"
          hint="Восстановление после нагрузки. Снизь пульс, растянь основные группы мышц, восстанови дыхание."
          isOpen={openCooldown}
          onToggle={() => setOpenCooldown((v) => !v)}
        >
          <ExercisesList items={plan.cooldown} variant="cooldown" isOpen={openCooldown} />
        </SectionCard>
      )}

      <div style={{ height: 56 }} />

      {showScheduleModal && (
        <ScheduleModal
          title={plan.title || "Тренировка"}
          date={scheduleDate}
          time={scheduleTime}
          loading={scheduleSaving}
          error={scheduleError}
          onClose={() => setShowScheduleModal(false)}
          onSubmit={handleScheduleConfirm}
          onDateChange={(val) => setScheduleDate(val)}
          onTimeChange={(val) => setScheduleTime(val)}
        />
      )}

      {/* Комментарий тренера */}
      {plan.notes && (
        <>
          {/* чат-панель над иконкой */}
          {showNotes && (
            <div
              style={notesStyles.chatPanelWrap}
            >
              <div style={notesStyles.chatPanel}>
                <div style={notesStyles.chatHeader}>
                  <div style={notesStyles.chatHeaderLeft}>
                    <div style={notesStyles.robotIconLarge}>🤖</div>
                    <div style={notesStyles.chatTitle}>Комментарий тренера</div>
                  </div>
                  <button
                    style={notesStyles.closeBtn}
                    onClick={() => setShowNotes(false)}
                  >
                    ✕
                  </button>
                </div>
                <div style={notesStyles.chatBody}>{plan.notes}</div>
              </div>
            </div>
          )}

          {/* плавающая кнопка тренера */}
          <div style={notesStyles.fabWrap} onClick={() => setShowNotes((v) => !v)}>
            {!showNotes && (
              <div style={notesStyles.speechBubble}>
                <div style={notesStyles.speechText}>Комментарий тренера</div>
                <div style={notesStyles.speechArrow} />
              </div>
            )}
            <div style={notesStyles.fabCircle}>
              <span style={{ fontSize: 35, lineHeight: 1 }}>🤖</span>
            </div>
          </div>
        </>
      )}

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

function djb2(str: string) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return String(h >>> 0);
}

function formatReps(r?: number | string | [number, number]) {
  if (r == null || r === "") return "—";
  if (Array.isArray(r)) return r.join("-"); // [4, 6] → "4-6"
  return typeof r === "number" ? String(r) : String(r);
}

function muscleNameRU(muscle: string): string {
  if (!muscle || typeof muscle !== 'string') return '';
  const map: Record<string, string> = {
    quads: "Квадрицепсы",
    glutes: "Ягодицы",
    hamstrings: "Бицепс бедра",
    calves: "Икры",
    chest: "Грудь",
    lats: "Широчайшие",
    upper_back: "Верх спины",
    traps: "Трапеции",
    rear_delts: "Задние дельты",
    front_delts: "Передние дельты",
    side_delts: "Средние дельты",
    triceps: "Трицепс",
    biceps: "Бицепс",
    forearms: "Предплечья",
    core: "Кор",
    lower_back: "Поясница",
  };
  return map[muscle] || muscle;
}

function equipmentNameRU(equipment: string): string {
  if (!equipment || typeof equipment !== 'string') return '';
  const map: Record<string, string> = {
    barbell: "Штанга",
    dumbbell: "Гантели",
    machine: "Тренажер",
    cable: "Кабель",
    smith: "Смит",
    bodyweight: "Свой вес",
    kettlebell: "Гиря",
    bands: "Резинки",
    bench: "Скамья",
    pullup_bar: "Турник",
    trx: "TRX",
    sled: "Сани",
    cardio_machine: "Кардио",
    landmine: "Мина",
  };
  return map[equipment] || equipment;
}

function formatSec(s?: number) {
  if (s == null) return "—";
  const m = Math.floor((s as number) / 60);
  const sec = Math.round((s as number) % 60);
  return m ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}с`;
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

function ScheduleModal({
  title,
  date,
  time,
  loading,
  error,
  onClose,
  onSubmit,
  onDateChange,
  onTimeChange,
}: {
  title: string;
  date: string;
  time: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  return (
    <div style={modal.wrap} role="dialog" aria-modal="true">
      <div style={modal.card}>
        <div style={modal.header}>
          <div style={modal.title}>{title}</div>
          <button style={modal.close} onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div style={modal.body}>
          <label style={modal.label}>
            <span style={modal.labelText}>Дата</span>
            <input
              style={modal.input}
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </label>
          <label style={modal.label}>
            <span style={modal.labelText}>Время</span>
            <input
              style={modal.input}
              type="time"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
            />
          </label>
          {error && <div style={modal.error}>{error}</div>}
        </div>
        <div style={modal.footer}>
          <button
            style={modal.cancel}
            onClick={onClose}
            type="button"
            disabled={loading}
          >
            Отмена
          </button>
          <button
            style={modal.save}
            onClick={onSubmit}
            type="button"
            disabled={loading}
          >
            {loading ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Insight({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div style={s.insightBox}>
      <div style={s.insightTitle}>{title}</div>
      <div style={s.insightValue}>{value || "—"}</div>
      {hint ? <div style={s.insightHint}>{hint}</div> : null}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  hint,
  children,
  isOpen,
  onToggle,
  chips,
}: {
  icon: string;
  title: string;
  hint?: string;
  children: any;
  isOpen: boolean;
  onToggle: () => void;
  chips?: Array<{ emoji: string; text: string }>;
}) {
  // Стиль карточки схемы
  const schemeCardStyle: React.CSSProperties = {
    position: "relative",
    padding: 18,
    borderRadius: 16,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    cursor: "default",
    transition: "all 0.3s ease",
    marginBottom: 16,
  };

  const schemeName: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 800,
    color: "#0f172a",
    marginTop: 0,
    marginBottom: 8,
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const schemeInfoStyle: React.CSSProperties = {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  };

  const infoChipStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    padding: "5px 10px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    color: "#334155",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const schemeDescriptionStyle: React.CSSProperties = {
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.6,
    marginBottom: 16,
    fontWeight: 500,
  };

  const expandBtnStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.6)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: "#475569",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };

  return (
    <section style={s.block}>
      <div style={schemeCardStyle}>
        {/* Название */}
        <div style={schemeName}>
          <span style={{ fontSize: 24 }}>{icon}</span>
          <span>{title}</span>
        </div>

        {/* Чипы с инфо */}
        {chips && chips.length > 0 && (
          <div style={schemeInfoStyle}>
            {chips.map((chip, i) => (
              <span key={i} style={infoChipStyle}>
                {chip.emoji} {chip.text}
              </span>
            ))}
          </div>
        )}

        {/* Описание */}
        {hint && <div style={schemeDescriptionStyle}>{hint}</div>}

        {/* Кнопка упражнения */}
        <button type="button" onClick={onToggle} style={expandBtnStyle}>
          {isOpen ? "Свернуть упражнения ▲" : "Упражнения ▼"}
        </button>

        {/* Раздел с упражнениями (анимированный) */}
        <div
          style={{
            display: "grid",
            gridTemplateRows: isOpen ? "1fr" : "0fr",
            transition: "grid-template-rows 0.3s ease-out",
            overflow: "hidden",
          }}
        >
          <div style={{ minHeight: 0 }}>{children}</div>
        </div>
      </div>
    </section>
  );
}

function ExercisesList({
  items,
  variant,
  isOpen,
}: {
  items: Array<Exercise | string>;
  variant: "warmup" | "main" | "cooldown";
  isOpen: boolean;
}) {
  const [expandedTechnique, setExpandedTechnique] = useState<Set<number>>(new Set());

  if (!Array.isArray(items) || items.length === 0 || !isOpen) return null;
  const isMain = variant === "main";


  const toggleTechnique = (index: number) => {
    setExpandedTechnique(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Styles for technique section
  const techBtn: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.6)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: "#475569",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };

  const techDetails: React.CSSProperties = {
    marginTop: 12,
    padding: 14,
    background: "rgba(255,255,255,0.5)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.06)",
    display: "grid",
    gap: 10,
  };

  const techBlock: React.CSSProperties = {
    display: "grid",
    gap: 6,
  };

  const techTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 800,
    color: "#0B1220",
  };

  const techText: React.CSSProperties = {
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.6,
  };

  const techList: React.CSSProperties = {
    margin: 0,
    paddingLeft: 20,
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.6,
    display: "grid",
    gap: 4,
  };

  // Стиль в формате daysList/dayItem из карточек схем
  const detailsSection: React.CSSProperties = {
    marginTop: 12,
    padding: 14,
    background: "rgba(255,255,255,0.5)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.06)",
    display: "grid",
    gap: 10,
  };

  const dayItem: React.CSSProperties = {
    padding: 8,
    background: "rgba(255,255,255,0.6)",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.06)",
  };

  const dayLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: "#0B1220",
    marginBottom: 2,
  };

  const dayFocus: React.CSSProperties = {
    fontSize: 11,
    color: "#4a5568",
    lineHeight: 1.3,
  };

  const benefitsTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 800,
    color: "#0B1220",
    marginBottom: 6,
  };

  const benefitsList: React.CSSProperties = {
    margin: 0,
    paddingLeft: 18,
    lineHeight: 1.5,
  };

  const benefitItem: React.CSSProperties = {
    fontSize: 12,
    color: "#1b1b1b",
    marginBottom: 4,
  };

  const infoChipStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    padding: "5px 10px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    color: "#334155",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  // Для warmup/cooldown показываем как список преимуществ БЕЗ заголовка
  if (variant === "warmup" || variant === "cooldown") {
    return (
      <div style={detailsSection}>
        <ul style={benefitsList}>
          {items.map((item, i) => {
            const name = typeof item === "string" ? item : item.name;
            return (
              <li key={`${variant}-${i}`} style={benefitItem}>
                {name}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Для main показываем каждое упражнение отдельным блоком БЕЗ общего контейнера
  return (
    <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
      {items.map((item, i) => {
        const isString = typeof item === "string";
        const name = isString ? item : item.name;
        const cues = isString ? null : item.cues;
        const sets = !isString ? item.sets : null;
        const reps = !isString ? item.reps : null;
        const restSec = !isString ? item.restSec : null;

        return (
          <div
            key={`${variant}-${i}-${name ?? "step"}`}
            style={{
              ...dayItem,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            {/* Левая часть: название и описание */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={dayLabel}>
                {name || `Упражнение ${i + 1}`}
              </div>
              {cues && <div style={dayFocus}>{cues}</div>}
            </div>

            {/* Правая часть: чипы */}
            {typeof sets === 'number' && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <span style={infoChipStyle}>
                  💪 {sets}×{formatReps(reps)}
                </span>
                {typeof restSec === 'number' && (
                  <span style={infoChipStyle}>
                    ⏱️ {formatSec(restSec)}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
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
const BLOCK_GRADIENT =
  "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";
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

/* ----------------- Мелкие элементы ----------------- */

const modal: Record<string, React.CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.35)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 2000,
    overscrollBehavior: "contain",
  },
  card: {
    width: "min(92vw, 420px)",
    borderRadius: 18,
    background: "#fff",
    boxShadow: "0 22px 60px rgba(0,0,0,.32)",
    padding: 20,
    display: "grid",
    gap: 18,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
  },
  close: {
    border: "none",
    background: "transparent",
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
    color: "#555",
  },
  body: {
    display: "grid",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 6,
  },
  labelText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#555",
  },
  input: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.12)",
    fontSize: 15,
    fontWeight: 600,
    color: "#1b1b1b",
    fontFamily: "inherit",
  },
  error: {
    background: "rgba(255,102,102,.12)",
    color: "#d24",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 10px",
    borderRadius: 10,
  },
  footer: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  cancel: {
    border: "none",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 700,
    background: "rgba(0,0,0,.06)",
    color: "#333",
    cursor: "pointer",
  },
  save: {
    border: "none",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 700,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 5px 16px rgba(0,0,0,.18)",
    cursor: "pointer",
  },
};

const s: Record<string, React.CSSProperties> = {
  ...modal,
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
  heroKicker: { marginTop: 10, opacity: 0.9, fontSize: 13, color: "rgba(255,255,255,.9)" },
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
  heroCtas: {
    marginTop: 18,
    display: "grid",
    gap: 12,
    width: "100%",
  },
  loaderBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.08)",
    background: "rgba(255,255,255,.06)",
    backdropFilter: "blur(6px)",
  },
  loaderTitle: { fontWeight: 700, fontSize: 16, color: "#fff", marginBottom: 8 },
  loaderSteps: { display: "grid", gap: 8 },
  loaderStep: { display: "flex", alignItems: "center", gap: 10, fontSize: 14 },
  loaderDot: { width: 12, height: 12, borderRadius: 999, background: "rgba(255,255,255,.2)" },
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

  secondaryBtn: {
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

  heroStartBtn: {
    marginTop: 22,
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.08)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 17,
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(0,0,0,0.14)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    WebkitTapHighlightColor: "transparent",
    whiteSpace: "nowrap",
  },

  block: {
    marginTop: 16,
    padding: 0,
    borderRadius: 16,
    background: "transparent",
    boxShadow: "none",
  },
  statsSection: {
    marginTop: 12,
    padding: 0,
    background: "transparent",
    boxShadow: "none",
  },

  linkBtn: {
    marginTop: 8,
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#fff",
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: 14,
    textAlign: "left",
    padding: 0,
  },

  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(96px, 1fr))",
    gap: 12,
    marginTop: 12,
    marginBottom: 10,
  },
  chipSquare: {
    background: "rgba(255,255,255,0.6)",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: "10px 8px",
    minHeight: 96,
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    gap: 4,
    wordBreak: "break-word",
    whiteSpace: "normal",
    hyphens: "none",
  },

  stat: {
    background: "rgba(255,255,255,0.6)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    padding: "10px 8px",
    minHeight: 96,
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    gap: 4,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  statEmoji: { fontSize: 22 },
  statLabel: {
    fontSize: 12,
    opacity: 0.7,
    lineHeight: 1.2,
  },
  statValue: { fontSize: 16, fontWeight: 800 },

  blockWhite: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    background: "#fff",
    boxShadow: cardShadow,
  },
  checkInCard: {
    marginTop: 12,
    padding: 0,
    borderRadius: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
    marginBottom: 72,
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

  loadWrap: { marginTop: 10, display: "grid", justifyItems: "center" },

  ghostBtn: {
    width: "100%",
    marginTop: 10,
    padding: "8px 0",
    border: "none",
    borderRadius: 14,
    background: "transparent",
    color: "#fff",
    fontSize: 14,
    fontWeight: 400,
    cursor: "pointer",
    textAlign: "center",
  },
  buttonNote: {
    fontSize: 13,
    color: "rgba(255,255,255,.8)",
    marginTop: 10,
    fontWeight: 400,
    opacity: 0.85,
    textAlign: "left",
  },
  inlineError: {
    fontSize: 13,
    color: "rgba(255,255,255,.8)",
    marginTop: 10,
    fontWeight: 400,
    opacity: 0.85,
    textAlign: "left",
  },

  analysisGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
    gap: 12,
    padding: "12px 12px 0",
  },
  analysisList: {
    padding: "0 16px 12px",
    fontSize: 13,
    color: "#1f2933",
  },
  analysisListTitle: {
    fontWeight: 700,
    marginBottom: 4,
  },
  analysisWarnings: {
    padding: "0 16px 16px",
    display: "grid",
    gap: 4,
    fontSize: 13,
    color: "#b45309",
    background: "rgba(255,196,150,0.2)",
    borderRadius: "0 0 16px 16px",
  },
  insightBox: {
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,.08)",
    background: "#fff",
    padding: 12,
    boxShadow: "0 6px 12px rgba(0,0,0,.05)",
    minHeight: 80,
    display: "grid",
    gap: 4,
  },
  insightTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6b7280",
    fontWeight: 700,
  },
  insightValue: {
    fontSize: 16,
    fontWeight: 800,
    color: "#111",
  },
  insightHint: {
    fontSize: 12,
    color: "#6b7280",
  },
};

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statEmoji}>{icon}</div>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
    </div>
  );
}

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
      <div
        style={{
          fontSize: 12,
          opacity: 0.7,
          textAlign: "center",
          whiteSpace: "normal",
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          textAlign: "center",
          whiteSpace: "normal",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SkeletonLine({ w = 100 }: { w?: number }) {
  return (
    <div
      style={{
        height: 10,
        width: `${w}%`,
        borderRadius: 6,
        background:
          "linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.4s ease-in-out infinite",
        marginTop: 8,
      }}
    />
  );
}

function Spinner() {
  return (
    <svg width="56" height="56" viewBox="0 0 50 50" style={{ display: "block" }}>
      <circle cx="25" cy="25" r="20" stroke="rgba(255,255,255,.35)" strokeWidth="6" fill="none" />
      <circle
        cx="25" cy="25" r="20"
        stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none"
        strokeDasharray="110" strokeDashoffset="80"
        style={{ transformOrigin: "25px 25px", animation: "spin 1.2s linear infinite" }}
      />
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      `}</style>
    </svg>
  );
}

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

/* ----------------- Единые цвета секций ----------------- */
const uxColors = {
  headerBg: "rgba(255,255,255,0.6)",
  subPill: "rgba(139,92,246,.14)",
  border: "rgba(139,92,246,.22)",
  iconBg: "transparent",
};

/* ----------------- Микро-стили карточек ----------------- */
const ux: Record<string, any> = {
  card: {
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 6px 20px rgba(0,0,0,.08)",
    overflow: "hidden",
    background: "rgba(255,255,255,0.6)",
    backdropFilter: "blur(12px)",
    position: "relative",
  },
  cardHeader: {
    display: "grid",
    gridTemplateColumns: "24px 1fr",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottom: "1px solid rgba(0,0,0,.06)",
    background: "rgba(255,255,255,0.6)",
    backdropFilter: "blur(12px)",
  },
  iconInline: {
    width: 24,
    height: 24,
    display: "grid",
    placeItems: "center",
    fontSize: 18,
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 15, fontWeight: 750, color: "#1b1b1b", lineHeight: 1.2 },
  cardHint: { fontSize: 11, color: "#2b2b2b", opacity: 0.85 },

  // новый caret
  caretWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    background: "rgba(255,255,255,0.4)",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05)",
    display: "grid",
    placeItems: "center",
    transition: "transform 0.18s ease",
  },
  caretInner: {
    width: 0,
    height: 0,
    borderLeft: "5px solid transparent",
    borderRight: "5px solid transparent",
    borderTop: "6px solid #4a3a7a",
  },
  cardBody: {
    padding: 12,
    background: "rgba(255,255,255,0.6)",
    backdropFilter: "blur(12px)",
  },
};

/* ----------------- Строки упражнений (ТОЧНО как карточки схем) ----------------- */
const row: Record<string, React.CSSProperties> = {
  wrap: {
    position: "relative",
    padding: 18,
    borderRadius: 16,
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    cursor: "default",
    transition: "all 0.3s ease",
  },
  left: {
    display: "grid",
    gap: 8,
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: 800,
    color: "#0f172a",
    marginTop: 0,
    marginBottom: 8,
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },
  cues: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.6,
    marginBottom: 12,
    fontWeight: 500,
  },
  metrics: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
};

/* ----------------- Капсулы метрик ----------------- */
const caps: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    alignItems: "flex-end",
  },
  box: {
    display: "inline-flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 110,
    padding: "6px 10px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(0,0,0,.08)",
    fontSize: 12.5,
    lineHeight: 1,
    fontFeatureSettings: "'tnum' 1, 'lnum' 1",
    color: "#222",
    textAlign: "center",
  },
  label: {
    fontSize: 10.5,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  num: {
    letterSpacing: 0.2,
    fontWeight: 700,
    fontSize: 12.5,
  },
};

/* ----------------- Старые метрики (если где-то используются) ----------------- */
const metricLabelStyle: React.CSSProperties = {
  fontSize: 20,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "#555",
  fontWeight: 700,
};

const metricNumStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.1,
  fontWeight: 600,
  letterSpacing: 0.2,
  fontFamily:
    "'Inter Tight', 'Roboto Condensed', 'SF Compact', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif",
};

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
  programProgressRow: {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  weekHeroCard: {
    position: "relative",
    marginTop: 2,
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.75)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    boxShadow:
      "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    padding: "16px 14px",
    overflow: "hidden",
  },
  weekHeroTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  weekHeroBody: {
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 10,
  },
  weekHeroText: {
    display: "grid",
    gap: 6,
    minWidth: 0,
  },
  weekHeroCaption: {
    fontSize: 18,
    color: "#0f172a",
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  weekHeroChip: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 22,
    padding: "0 10px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.06)",
    border: "1px solid rgba(15,23,42,0.08)",
    color: "rgba(15,23,42,0.72)",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  weekHeroTitle: {
    marginTop: 10,
    fontSize: 30,
    lineHeight: 1.07,
    letterSpacing: -0.5,
    color: "#0f172a",
    fontWeight: 800,
  },
  weekHeroDate: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 1.3,
    color: "rgba(15,23,42,0.58)",
    fontWeight: 500,
  },
  weekHeroSubtitle: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 1.4,
    color: "rgba(15,23,42,0.64)",
    maxWidth: 460,
  },
  weekHeroMascot: {
    width: 118,
    maxWidth: 118,
    height: "auto",
    objectFit: "contain",
    transform: "translateX(10px)",
    userSelect: "none",
    pointerEvents: "none",
  },
  weekProgressRow: {
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  weekProgressLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#111827",
    whiteSpace: "nowrap",
  },
  weekProgressPits: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  weekProgressPit: {
    width: 16,
    height: 10,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "grid",
    alignItems: "flex-end",
    overflow: "hidden",
  },
  weekProgressDone: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow:
      "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
  },
  weekHeroActions: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    alignItems: "center",
  },
  weekPrimaryBtn: {
    minHeight: 48,
    borderRadius: 999,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 16,
    fontWeight: 500,
    padding: "0 16px",
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
    textAlign: "left",
  },
  weekSecondaryBtn: {
    minHeight: 48,
    borderRadius: 999,
    border: "none",
    background: "transparent",
    color: "rgba(15, 23, 42, 0.6)",
    fontSize: 14,
    fontWeight: 500,
    padding: "0 4px",
    cursor: "pointer",
    boxShadow: "none",
  },
  weekListWrap: {
    marginTop: 12,
    display: "grid",
    gap: 8,
  },
  weekListHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    padding: "2px 2px 0",
  },
  weekListTitle: {
    fontSize: 17,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  weekListHint: {
    fontSize: 13,
    color: "rgba(15,23,42,0.62)",
    fontWeight: 500,
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
  header: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  headerTitle: { fontSize: 15, fontWeight: 900, color: "#0f172a" },
  headerHint: { fontSize: 13, color: "rgba(0,0,0,0.6)" },

  schemeCard: {
    position: "relative",
    padding: 18,
    borderRadius: 16,
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    cursor: "pointer",
    transition: "all 0.3s ease",
  },
  schemeCardSelected: {
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
    transform: "translateY(-2px)",
  },
  recommendedBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "rgba(30,31,34,0.08)",
    border: "1px solid rgba(30,31,34,0.16)",
    color: "#1e1f22",
    padding: "2px 8px",
    borderRadius: "100px",
    fontSize: 10,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 4,
    boxShadow: "none",
    zIndex: 10,
  },
  radioCircle: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "2px solid rgba(0,0,0,0.1)",
    background: "rgba(255,255,255,0.5)",
    display: "grid",
    placeItems: "center",
    transition: "all 0.3s ease",
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#0f172a",
    transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  },
  schemeName: {
    fontSize: 20,
    fontWeight: 800,
    color: "#0f172a",
    marginTop: 0,
    marginLeft: 36,
    marginRight: 0,
    marginBottom: 8,
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },
  schemeInfo: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    marginLeft: 36,
    flexWrap: "nowrap",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
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
  infoChipSoft: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    padding: "0 9px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.07)",
    border: "1px solid rgba(15,23,42,0.1)",
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(15,23,42,0.72)",
  },
  infoChipScheduled: {
    background: "rgba(255,230,128,.25)",
    border: "1px solid rgba(255,179,107,.4)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    color: "#334155",
    fontWeight: 600,
  },
  schemeDescription: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.6,
    marginBottom: 16,
    fontWeight: 500,
    marginLeft: 4,
  },
  actionRow: {
    width: "100%",
    marginTop: 8,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  actionBtn: {
    width: "100%",
    padding: "10px",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.6)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    color: "#475569",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    textAlign: "center",
    whiteSpace: "normal",
    lineHeight: 1.2,
  },
  detailsSection: {
    marginTop: 2,
    padding: 0,
    background: "transparent",
    borderRadius: 0,
    border: "none",
    display: "block",
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: "#0B1220",
  },
};

/* ----------------- Комментарий тренера styles ----------------- */
const notesStyles: Record<string, React.CSSProperties> = {
  // плавающий блок, пока план уже сгенерен
  fabWrap: {
    position: "fixed",
    right: 16,
    bottom: 160,
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    cursor: "pointer",
    zIndex: 9999,
  },

  // плавающий блок, пока генерим (нет клика, просто показывает typing)
  fabWrapLoading: {
    position: "fixed",
    right: 16,
    bottom: 160,
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    zIndex: 9999,
  },

  fabCircle: {
    width: 56, // увеличили
    height: 56,
    borderRadius: "50%",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    boxShadow: "0 10px 24px rgba(0,0,0,.2)",
    display: "grid",
    placeItems: "center",
    fontWeight: 700,
    color: "#1b1b1b",
  },

  speechBubble: {
    maxWidth: 180,
    background: "#fff",
    boxShadow: "0 10px 24px rgba(0,0,0,.15)",
    borderRadius: 14,
    padding: "10px 12px",
    position: "relative",
    border: "1px solid rgba(0,0,0,.06)",
  },
  speechText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#1b1b1b",
    lineHeight: 1.3,
  },
  speechArrow: {
    position: "absolute",
    right: -6,
    bottom: 10,
    width: 0,
    height: 0,
    borderTop: "6px solid transparent",
    borderBottom: "6px solid transparent",
    borderLeft: "6px solid #fff",
    filter: "drop-shadow(0 2px 2px rgba(0,0,0,.1))",
  },

  // чат-панель. без затемнения. появляется над иконкой
  chatPanelWrap: {
    position: "fixed",
    right: 16,
    bottom: 160 + 56 + 12, // подняли выше, чтобы не перекрывать иконку
    zIndex: 10000,
    maxWidth: 300,
    width: "calc(100% - 32px)",
  },
  chatPanel: {
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 24px 64px rgba(0,0,0,.4)",
    border: "1px solid rgba(0,0,0,.06)",
    maxHeight: "40vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "12px 12px 10px 12px",
    borderBottom: "1px solid rgba(0,0,0,.06)",
    background: "linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))",
  },
  chatHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  robotIconLarge: {
    fontSize: 20,
    lineHeight: 1,
  },
  chatTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#1b1b1b",
  },
  closeBtn: {
    background: "rgba(0,0,0,0.08)",
    border: "none",
    borderRadius: 8,
    width: 28,
    height: 28,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1,
    color: "#1b1b1b",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  chatBody: {
    padding: 12,
    fontSize: 13.5,
    lineHeight: 1.4,
    color: "#1b1b1b",
    whiteSpace: "pre-wrap",
    overflowY: "auto",
  },
};

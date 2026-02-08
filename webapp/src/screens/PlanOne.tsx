import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { loadHistory } from "@/lib/history";
import {
  createPlannedWorkout,
  getScheduleOverview,
  removePlannedWorkoutExercise,
  replacePlannedWorkoutExercise,
  type PlannedWorkout,
} from "@/api/schedule";
import { getMesocycleCurrent, submitCheckIn, type CheckInPayload } from "@/api/plan";
import { excludeExercise, getExerciseAlternatives, type ExerciseAlternative } from "@/api/exercises";
import { useWorkoutPlan } from "@/hooks/useWorkoutPlan";
import { useNutritionGenerationProgress } from "@/hooks/useNutritionGenerationProgress";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { CheckInForm } from "@/components/CheckInForm";
import { readSessionDraft } from "@/lib/activeWorkout";
import { toSessionPlan } from "@/lib/toSessionPlan";
import { resolveDayCopy } from "@/utils/dayLabelCopy";
import { Clock3, Dumbbell, Pencil } from "lucide-react";
import mascotImg from "@/assets/robonew.webp";
import tyagaImg from "@/assets/tyaga.webp";
import zhimImg from "@/assets/zhim.webp";
import nogiImg from "@/assets/nogi.webp";
import sredneImg from "@/assets/sredne.webp";

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
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
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_STACK_OFFSET_MIN = 62;
const WEEK_STACK_OFFSET_MAX = 72;
const WEEK_STACK_COLLAPSED_H = 104;
const WEEK_STACK_ACTIVE_H = 210;

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

export type Exercise = {
  name: string; sets: number;
  reps?: number|string; restSec?: number; cues?: string;
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
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [plannedLoading, setPlannedLoading] = useState(true);
  const [plannedError, setPlannedError] = useState<string | null>(null);
  const [selectedPlannedId, setSelectedPlannedId] = useState<string | null>(null);
  const [expandedPlannedIds, setExpandedPlannedIds] = useState<Record<string, boolean>>({});
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

  const activeDraft = useMemo(() => readSessionDraft(), []);
  const activeProgress = useMemo(() => {
    const d = activeDraft;
    const items = Array.isArray(d?.items) ? d!.items : [];
    if (!items.length) return null;
    const done = items.filter((it: any) => Boolean(it?.done)).length;
    return Math.max(0, Math.min(100, Math.round((done / items.length) * 100)));
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

  const loadPlanned = useCallback(async () => {
    setPlannedLoading(true);
    setPlannedError(null);
    try {
      const data = await getScheduleOverview();
      const next = normalizePlanned(data.plannedWorkouts);
      setPlannedWorkouts(next);
      try {
        localStorage.setItem(PLANNED_WORKOUTS_COUNT_KEY, String(next.length));
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent("planned_workouts_updated", { detail: { count: next.length } }));
      } catch {
        window.dispatchEvent(new Event("planned_workouts_updated"));
      }
    } catch (err) {
      console.error("Failed to load planned workouts", err);
      setPlannedError("Не удалось загрузить тренировки недели");
    } finally {
      setPlannedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlanned().catch(() => {});
    const onScheduleUpdated = () => loadPlanned().catch(() => {});
    window.addEventListener("schedule_updated" as any, onScheduleUpdated);
    window.addEventListener("plan_completed" as any, onScheduleUpdated);
    return () => {
      window.removeEventListener("schedule_updated" as any, onScheduleUpdated);
      window.removeEventListener("plan_completed" as any, onScheduleUpdated);
    };
  }, [loadPlanned]);

  useEffect(() => {
    getMesocycleCurrent()
      .then((r) => {
        const w = Number((r as any)?.mesocycle?.currentWeek);
        setMesoWeek(Number.isFinite(w) ? w : null);
      })
      .catch(() => {});
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

  const steps = useMemo(
    () => ["Анализ профиля", "Цели и ограничения", "Подбор упражнений", "Оптимизация нагрузки", "Формирование плана"],
    []
  );
  const today = useMemo(() => new Date(), []);
  const heroDateChipRaw = today.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const heroDateChip = heroDateChipRaw.charAt(0).toUpperCase() + heroDateChipRaw.slice(1);
  const chips = useMemo(() => {
    if (!plan) return null;
    const sets = (plan.exercises || []).reduce((a: number, x: any) => a + Number(x.sets || 0), 0);
    const minutes = Number(plan.duration || 0) || Math.max(25, Math.min(90, Math.round(sets * 3.5)));
    const kcal = Math.round(minutes * 6);
    return { sets, minutes, kcal };
  }, [plan]);
  const {
    progress: loaderProgress,
    startManual: kickProgress,
  } = useNutritionGenerationProgress(planStatus, {
    steps: steps.length,
    storageKey: "workout_generation_started_at",
    durationMs: 40_000,
  });

  const { loaderStepIndex, loaderStepNumber } = useMemo(() => {
    const fraction = Math.min(1, loaderProgress / 75); // 75% ≈ 30 секунд
    const number = Math.min(steps.length, Math.max(1, Math.ceil(fraction * steps.length)));
    return { loaderStepIndex: number - 1, loaderStepNumber: number };
  }, [loaderProgress, steps.length]);

  const error = planError || metaError || null;
  const isProcessing = planStatus === "processing";
  const showLoader = (loading || isProcessing) && initialPlanRequested && !needsCheckIn;
  const [paywall, setPaywall] = useState(false);
  const effectivePlan = needsCheckIn ? null : plan;

  // When there are no planned workouts, we immediately show the loader while the auto-generation effect kicks in.
  // This avoids a UI "flash" where the user briefly sees the empty-state button after navigating from dashboard.
  const shouldAutoGenerateWeek =
    !plannedLoading && !weekGenerating && remainingPlanned.length === 0 && !sub.locked && !initialWeekRequested;
  
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
      .then(() => loadPlanned())
      .catch(() => {})
      .finally(() => setWeekGenerating(false));
  }, [plannedLoading, remainingPlanned.length, weekGenerating, sub.locked, initialWeekRequested, kickProgress, refresh, loadPlanned]);

  useEffect(() => {
    const onPlanCompleted = () => {
      try {
        localStorage.removeItem("current_plan");
        localStorage.removeItem("session_draft");
        localStorage.removeItem("plan_cache_v2");
      } catch {}
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
      refresh({ force: true }).catch(() => {});
    };
    window.addEventListener("onb_updated" as any, onOnbUpdated);
    return () => window.removeEventListener("onb_updated" as any, onOnbUpdated);
  }, [refresh]);

  // --- новый обработчик регенерации: сброс экрана и запуск генерации ---
  const handleRegenerate = async () => {
    try {
      localStorage.removeItem("current_plan");
      localStorage.removeItem("session_draft");
    } catch {}
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
      await createPlannedWorkout({ plan, scheduledFor: when.toISOString(), scheduledTime: scheduleTime });
      setShowScheduleModal(false);
      try {
        window.dispatchEvent(new CustomEvent("schedule_updated"));
      } catch {}
      nav("/", { replace: true });
    } catch (err) {
      console.error("createPlannedWorkout failed", err);
      setScheduleError("Не удалось сохранить. Попробуй ещё раз.");
    } finally {
      setScheduleSaving(false);
    }
  };

  if (plannedLoading || weekGenerating || showLoader || shouldAutoGenerateWeek) {
    return (
      <WorkoutLoader
        steps={steps}
        progress={loaderProgress}
        stepIndex={loaderStepIndex}
        stepNumber={loaderStepNumber}
      />
    );
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

  // New UI: show all generated workouts (remaining ones) as selectable cards
  const selectedPlanned = remainingPlanned.find((w) => w.id === selectedPlannedId) || null;
  const canStart = Boolean(selectedPlanned && selectedPlanned.scheduledFor);
  const startWorkoutDate = selectedPlanned?.scheduledFor ? new Date(selectedPlanned.scheduledFor).toISOString().slice(0, 10) : null;
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
      cues: String(ex?.notes || ex?.cues || "").trim() || undefined,
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
    nav("/schedule", {
      state: {
        plannedWorkoutId,
        targetDate: replaceTargetDate,
        forcePick: Boolean(replaceTargetDate),
      },
    });
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

  const handleWorkoutPrimary = (workout: PlannedWorkout) => {
    if (workout.status === "completed") {
      if (workout.resultSessionId) {
        nav(`/workout/result?sessionId=${encodeURIComponent(String(workout.resultSessionId))}`);
      } else {
        nav("/workout/result");
      }
      return;
    }
    if (workout.status === "scheduled" && workout.scheduledFor) {
      const workoutDate = new Date(workout.scheduledFor).toISOString().slice(0, 10);
      nav("/check-in", {
        state: {
          workoutDate,
          plannedWorkoutId: workout.id,
          returnTo: "/plan/one",
        },
      });
      return;
    }
    openScheduleForWorkout(workout.id);
  };

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />
      <style>{pickStyles}</style>

      <section style={pick.programHeaderRow}>
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
        <section style={pick.weekListWrap}>
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
                  : pick.weekCardMascot;
              const key = w.id;
              const expanded = Boolean(expandedPlannedIds[key]);
              const primaryActionLabel = "Начать";
              const hasActiveProgress = activeDraft?.plannedWorkoutId === w.id && typeof activeProgress === "number" && status !== "completed";
              const scheduledDateChip = w.scheduledFor ? formatScheduledDateChip(w.scheduledFor) : "";
              const hasScheduledDate = Boolean(scheduledDateChip);
              const dateChipLabel = hasScheduledDate ? scheduledDateChip : "Дата и время";
              const canEditSchedule = status !== "completed";
              const isCompletedWorkout = status === "completed";
              const chipToneStyle = isCompletedWorkout ? pick.weekDateChipScheduled : pick.weekDateChipPending;
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
                        {hasActiveProgress ? <span style={pick.infoChipSoft}>В процессе {activeProgress}%</span> : null}
                      </div>

                      <div style={pick.weekCardActions} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="dash-primary-btn day-cta"
                          style={pick.weekActionPrimary}
                          onClick={() => handleWorkoutPrimary(w)}
                        >
                          <span>{primaryActionLabel}</span>
                          <span style={pick.weekActionPrimaryIconWrap}>
                            <span style={pick.weekActionPrimaryArrow}>→</span>
                          </span>
                        </button>
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
          {activeStackWorkout && activeStackExpanded ? (
            <div style={pick.detailsSection}>
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
        <section style={s.blockWhite}>
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
                  workoutDate: new Date().toISOString().split('T')[0],
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

function WorkoutLoader({
  steps,
  progress,
  stepIndex,
  stepNumber,
}: {
  steps: string[];
  progress: number;
  stepIndex: number;
  stepNumber: number;
}) {
  const safeIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
  const safeStep = steps[safeIndex] || steps[0] || "";
  const spinnerHints = [
    "Собираю анкету и ограничения",
    "Проверяю цели и инвентарь",
    "Подбираю упражнения и вариации",
    "Балансирую нагрузку и отдых",
    "Формирую финальный план",
  ];
  const hint = spinnerHints[Math.min(safeIndex, spinnerHints.length - 1)];
  const displayProgress = Math.max(5, Math.min(99, Math.round(progress || 0)));
  const analyticsState = safeIndex >= 1 ? "анализ готов" : "в процессе";
  const selectionState = safeIndex >= 3 ? "готовится" : "подбор идёт";

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Загрузка</span>
          <span style={s.credits}>ИИ работает</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>
          Шаг {Math.min(stepNumber, steps.length)} из {steps.length}
        </div>
        <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>{safeStep}</div>
        <div style={s.heroTitle}>Создаю персональную тренировку</div>
        <div style={s.loadWrap}>
          <Spinner />
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>{hint}</div>
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

      <div style={notesStyles.fabWrapLoading}>
        <div style={notesStyles.speechBubble}>
          <div style={notesStyles.speechText}>
            <span className="typing-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </span>
          </div>
          <div style={notesStyles.speechArrow} />
        </div>
        <div style={notesStyles.fabCircle}>
          <span style={{ fontSize: 35, lineHeight: 1 }}>🤖</span>
        </div>
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
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
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
  const [mode, setMode] = useState<"menu" | "replace" | "confirm_remove" | "confirm_ban">("menu");
  const menuBtnRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [popoverPhase, setPopoverPhase] = useState<"closed" | "opening" | "open" | "closing">("closed");
  const [panelPhase, setPanelPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const [alts, setAlts] = useState<ExerciseAlternative[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const goMode = useCallback(
    (next: "menu" | "replace" | "confirm_remove" | "confirm_ban") => {
      if (next === mode) return;
      // Avoid "lag": switch immediately, animate only the entering state.
      setMode(next);
      setPanelPhase("entering");
      window.requestAnimationFrame(() => setPanelPhase("idle"));
    },
    [mode]
  );

  const recomputeAnchorRect = useCallback(
    (idx: number | null) => {
      if (idx == null) {
        setAnchorRect(null);
        return;
      }
      try {
        const el = menuBtnRefs.current[idx];
        if (el) setAnchorRect(el.getBoundingClientRect());
      } catch {}
    },
    []
  );

  const openMenu = (idx: number) => {
    setErr(null);
    setMode("menu");
    setPanelPhase("idle");
    setMenuIndex(idx);
    recomputeAnchorRect(idx);
  };

  const closeImmediate = () => {
    setPopoverPhase("closed");
    setMenuIndex(null);
    setMode("menu");
    setAnchorRect(null);
    setAlts([]);
    setLoading(false);
    setErr(null);
  };

  const close = () => {
    setPopoverPhase("closing");
    window.setTimeout(() => closeImmediate(), 160);
  };

  useEffect(() => {
    if (menuIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const update = () => {
      recomputeAnchorRect(menuIndex);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [menuIndex, recomputeAnchorRect]);

  useLayoutEffect(() => {
    if (menuIndex == null) {
      setAnchorRect(null);
      return;
    }
    recomputeAnchorRect(menuIndex);
  }, [menuIndex, mode, recomputeAnchorRect]);

  useEffect(() => {
    if (menuIndex == null) {
      setPopoverPhase("closed");
      return;
    }
    setPopoverPhase("opening");
    const raf = window.requestAnimationFrame(() => setPopoverPhase("open"));
    return () => window.cancelAnimationFrame(raf);
  }, [menuIndex]);

  const current = menuIndex != null ? displayItems[menuIndex] : null;
  const currentId = current?.exerciseId || null;

  const fetchAlternatives = async () => {
    if (!currentId || menuIndex == null) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await getExerciseAlternatives({ exerciseId: currentId, reason: "preference", limit: 3 });
      const list = Array.isArray(res?.alternatives) ? res.alternatives : [];
      setAlts(list.slice(0, 3));
      goMode("replace");
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
      try {
        window.dispatchEvent(new Event("schedule_updated" as any));
      } catch {}
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
      try {
        window.dispatchEvent(new Event("schedule_updated" as any));
      } catch {}
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

  const rowStyle: React.CSSProperties = {
    padding: 8,
    background: "rgba(255,255,255,0.6)",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.06)",
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    justifyContent: "space-between",
  };
  const menuBtn: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.8)",
    padding: "6px 10px",
    cursor: "pointer",
    fontWeight: 800,
    color: "#0B1220",
    lineHeight: 1,
  };
  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "transparent",
    zIndex: 80,
  };
  const pad = 12;
  const estimatedHeight = mode === "replace" ? 260 : mode === "menu" ? 168 : 200;
  const replaceMaxHeight = (() => {
    if (typeof window === "undefined" || !anchorRect) return 260;
    const below = window.innerHeight - pad - (anchorRect.top + anchorRect.height + 2);
    const above = anchorRect.top - pad - 2;
    const target = 260;
    if (below >= 180) return Math.min(target, below);
    if (above >= 180) return Math.min(target, above);
    return Math.max(160, Math.min(target, Math.max(below, above)));
  })();
  const openUpward = (() => {
    if (typeof window === "undefined" || !anchorRect) return false;
    const below = window.innerHeight - pad - (anchorRect.top + anchorRect.height + 2);
    const above = anchorRect.top - pad - 2;
    if (mode === "replace") {
      if (below >= 180) return false;
      if (above >= 180) return true;
      return above > below;
    }
    return anchorRect.top + anchorRect.height + 2 + estimatedHeight > window.innerHeight - pad && above > 120;
  })();
  const baseTranslate = openUpward ? "translate(-100%, -100%)" : "translateX(-100%)";
  const isOpen = popoverPhase === "open";
  const isOpening = popoverPhase === "opening";
  const isClosing = popoverPhase === "closing";
  const sheetTransform = (() => {
    if (isOpen || isClosing) return `${baseTranslate} scaleY(1)`;
    if (isOpening) return `${baseTranslate} scaleY(0)`;
    return `${baseTranslate} scaleY(0)`;
  })();
  const sheetOpacity = isOpen ? 1 : 0;
  const popover: React.CSSProperties = (() => {
    if (typeof window === "undefined") return { position: "fixed", left: pad, top: 120 };
    const r = anchorRect;
    const rightEdge = r ? r.left + r.width : pad;
    const preferredWidth =
      mode === "replace"
        ? Math.min(280, window.innerWidth - pad * 2)
        : null;
    // Keep the menu fully within the viewport even when the dots button is near the left edge.
    const minLeft = pad + (preferredWidth ?? 0);
    const left = Math.max(minLeft, Math.min(window.innerWidth - pad, rightEdge));
    const top = r
      ? openUpward
        ? r.top - 2
        : r.top + r.height + 2
      : 120;
    return {
      position: "fixed",
      left,
      top,
      width: preferredWidth ?? "max-content",
      maxWidth: `calc(100vw - ${pad * 2}px)`,
    };
  })();
  const sheet: React.CSSProperties = {
    ...popover,
    background: "var(--tg-theme-bg-color, #f5f6fb)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
    padding: 8,
    transformOrigin: openUpward ? "bottom right" : "top right",
    transform: sheetTransform,
    opacity: sheetOpacity,
    transition: isClosing
      ? "opacity 160ms ease"
      : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease",
    overflow: "hidden",
    zIndex: 81,
  };
  const panelStyle: React.CSSProperties = {
    opacity: panelPhase === "idle" ? 1 : 0,
    transform: panelPhase === "idle" ? "translateY(0)" : panelPhase === "entering" ? "translateY(6px)" : "translateY(-6px)",
    transition: "opacity 160ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
    willChange: "opacity, transform",
  };
  const actionBtn: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.6)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    color: "#0B1220",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "nowrap",
  };
  const actionBtnWrap: React.CSSProperties = {
    ...actionBtn,
    whiteSpace: "normal",
    wordBreak: "break-word",
  };
  const dangerBtn: React.CSSProperties = {
    ...actionBtn,
    background: "rgba(239,68,68,.08)",
    borderColor: "rgba(239,68,68,.2)",
    color: "#0B1220",
  };
  const softBtn: React.CSSProperties = {
    ...actionBtn,
    background: "transparent",
    boxShadow: "none",
    border: "none",
    padding: "10px 12px",
    fontWeight: 500,
  };
  const subTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#0B1220" };
  const subText: React.CSSProperties = { fontSize: 12, color: "#475569", fontWeight: 700 };

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      {displayItems.map((it, i) => {
        const isSkipped = Boolean((exercisesRaw[i] as any)?.skipped);
        const isOpen = menuIndex === i;
        return (
          <div key={`planned-ex-${i}-${it.name}`} style={rowStyle} className="exercise-card-enter">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0B1220" }}>
                {it.name || `Упражнение ${i + 1}`} {isSkipped ? <span style={{ opacity: 0.6 }}>(пропуск)</span> : null}
              </div>
              {it.cues ? <div style={{ fontSize: 11, color: "#4a5568", lineHeight: 1.3 }}>{it.cues}</div> : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              <button
                type="button"
                style={menuBtn}
                ref={(el) => {
                  menuBtnRefs.current[i] = el;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isOpen) close();
                  else openMenu(i);
                }}
                aria-label="Опции"
              >
                {isOpen ? "✕" : "⋮"}
              </button>
              <span
                style={{
                  background: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  padding: "5px 10px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#334155",
                  whiteSpace: "nowrap",
                }}
              >
                💪 {it.sets}×{formatReps(it.reps)}
              </span>
            </div>
          </div>
        );
      })}

      {menuIndex != null ? (
        typeof document !== "undefined"
          ? createPortal(
              <>
                <div
                  style={overlay}
                  role="presentation"
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) close();
                  }}
                />
                <div style={sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                  {err ? (
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 12, background: "rgba(239,68,68,.10)", border: "1px solid rgba(239,68,68,.2)", color: "#7f1d1d", fontWeight: 700, fontSize: 12 }}>
                      {err}
                    </div>
                  ) : null}

                  <div style={panelStyle}>
                    {mode === "menu" ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <button
                          type="button"
                          style={actionBtn}
                          disabled={loading || !currentId}
                          onClick={() => void fetchAlternatives()}
                        >
                          🔀 Заменить
                        </button>
                        <button type="button" style={dangerBtn} disabled={loading} onClick={() => goMode("confirm_remove")}>
                          🗑️ Удалить
                        </button>
                        <button type="button" style={softBtn} disabled={loading || !currentId} onClick={() => goMode("confirm_ban")}>
                          Заблокировать
                        </button>
                      </div>
                    ) : null}

                    {mode === "confirm_remove" ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={subText}>Удалить упражнение из этого плана?</div>
                        <button type="button" style={dangerBtn} disabled={loading} onClick={() => void applyRemove()}>
                          Да, удалить
                        </button>
                        <button type="button" style={actionBtn} disabled={loading} onClick={() => goMode("menu")}>
                          ← Назад
                        </button>
                      </div>
                    ) : null}

                    {mode === "confirm_ban" ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={subText}>Убрать упражнение из будущих генераций?</div>
                        <button type="button" style={dangerBtn} disabled={loading} onClick={() => void applyBan()}>
                          Да, больше не предлагать
                        </button>
                        <button type="button" style={actionBtn} disabled={loading} onClick={() => goMode("menu")}>
                          ← Назад
                        </button>
                      </div>
                    ) : null}

                    {mode === "replace" ? (
                      <div style={{ display: "grid", gap: 8, maxHeight: replaceMaxHeight, overflow: "auto" }}>
                        <div style={subTitle}>Выбери замену</div>
                        {loading ? <div style={{ fontSize: 12, color: "#475569" }}>Загружаю…</div> : null}
                        {alts.map((a) => (
                          <button
                            key={a.exerciseId}
                            type="button"
                            style={actionBtnWrap}
                            disabled={loading}
                            onClick={() => void applyReplace(a.exerciseId)}
                          >
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1220" }}>{a.name}</div>
                          </button>
                        ))}
                        <button type="button" style={actionBtn} disabled={loading} onClick={() => goMode("menu")}>
                          ← Назад
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>,
              document.body
            )
          : null
      ) : null}
    </div>
  );
}

/* ----------------- Мелкие элементы ----------------- */

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
        animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards;
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

/* ----------------- Стиль под Dashboard ----------------- */

const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const BLOCK_GRADIENT =
  "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";
const s: Record<string, React.CSSProperties> = {
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

  /* фирменные чипы как на Dashboard */
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

  /* старые стат-блоки оставлены, но не используются для чипов */
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
  @media (prefers-reduced-motion: reduce) {
    .plan-stack-card { transition: none !important; }
    .dash-primary-btn { transition: none !important; }
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
    marginTop: 12,
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
  weekActionPrimaryArrow: {
    fontSize: 18,
    lineHeight: 1,
    color: "#0f172a",
    fontWeight: 700,
  },
  detailsLinkBtn: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 10,
    justifySelf: "center",
    alignSelf: "end",
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
    marginTop: 12,
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

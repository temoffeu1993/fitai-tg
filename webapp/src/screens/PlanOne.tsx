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
import { fireHapticImpact } from "@/utils/haptics";
import mascotImg from "@/assets/robonew.webp";

// ============================================================================
// CONSTANTS
// ============================================================================

const PLANNED_WORKOUTS_COUNT_KEY = "planned_workouts_count_v1";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_EXPANDED_H = 280;
const CARD_COLLAPSED_H = 100;
const STACK_OFFSET = 80;
const SWIPE_THRESHOLD = 80;
const SWIPE_ACTION_WIDTH = 180;

// Градиенты по типу тренировки
const WORKOUT_GRADIENTS: Record<string, string> = {
  push: "radial-gradient(120% 120% at 0% 0%, rgba(96,165,250,0.35) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(59,130,246,0.25) 0%, rgba(255,255,255,0) 55%)",
  pull: "radial-gradient(120% 120% at 0% 0%, rgba(45,212,191,0.35) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(20,184,166,0.25) 0%, rgba(255,255,255,0) 55%)",
  legs: "radial-gradient(120% 120% at 0% 0%, rgba(251,146,60,0.35) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(249,115,22,0.25) 0%, rgba(255,255,255,0) 55%)",
  full: "radial-gradient(120% 120% at 0% 0%, rgba(167,139,250,0.35) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(139,92,246,0.25) 0%, rgba(255,255,255,0) 55%)",
  upper: "radial-gradient(120% 120% at 0% 0%, rgba(251,113,133,0.35) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(244,63,94,0.25) 0%, rgba(255,255,255,0) 55%)",
  lower: "radial-gradient(120% 120% at 0% 0%, rgba(74,222,128,0.35) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(34,197,94,0.25) 0%, rgba(255,255,255,0) 55%)",
  default: "radial-gradient(120% 120% at 0% 0%, rgba(148,163,184,0.35) 0%, rgba(255,255,255,0) 60%), radial-gradient(120% 120% at 100% 100%, rgba(100,116,139,0.25) 0%, rgba(255,255,255,0) 55%)",
};

// ============================================================================
// CUSTOM SVG ICONS (matching Dashboard style)
// ============================================================================

function ClockIcon({ size = 20, color = "#1e1f22" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="8.5" stroke={color} />
      <path d="M12 7.5v5l3.5 2" stroke={color} />
    </svg>
  );
}

function DumbbellIcon({ size = 20, color = "#1e1f22" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M4 9v6" stroke={color} />
      <path d="M7 8v8" stroke={color} />
      <path d="M17 8v8" stroke={color} />
      <path d="M20 9v6" stroke={color} />
      <path d="M7 12h10" stroke={color} />
    </svg>
  );
}

function CalendarIcon({ size = 20, color = "#1e1f22" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke={color} />
      <path d="M16 2v4M8 2v4M3 10h18" stroke={color} />
    </svg>
  );
}

function CheckIcon({ size = 20, color = "#1e1f22" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M20 6L9 17l-5-5" stroke={color} />
    </svg>
  );
}

function SwapIcon({ size = 20, color = "#1e1f22" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M16 3l4 4-4 4" stroke={color} />
      <path d="M20 7H4" stroke={color} />
      <path d="M8 21l-4-4 4-4" stroke={color} />
      <path d="M4 17h16" stroke={color} />
    </svg>
  );
}

function TrashIcon({ size = 20, color = "#1e1f22" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke={color} />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke={color} />
    </svg>
  );
}

function BlockIcon({ size = 20, color = "#1e1f22" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="9" stroke={color} />
      <path d="M5.7 5.7l12.6 12.6" stroke={color} />
    </svg>
  );
}

function ArrowRightIcon({ size = 20, color = "#ffffff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M5 12h14M12 5l7 7-7 7" stroke={color} />
    </svg>
  );
}

function ChevronDownIcon({ size = 16, color = "#0f172a" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M6 9l6 6 6-6" stroke={color} />
    </svg>
  );
}

// ============================================================================
// TYPES & HELPERS
// ============================================================================

export type Exercise = {
  name: string;
  sets: number;
  reps?: number | string;
  restSec?: number;
  cues?: string;
  pattern?: string;
  targetMuscles?: string[];
  tempo?: string;
  guideUrl?: string;
  weight?: string;
  technique?: { setup: string; execution: string; commonMistakes: string[] };
  equipment?: string[];
  difficulty?: number;
  unilateral?: boolean;
  exerciseId?: string;
};

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const defaultScheduleTime = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "18:00" : "09:00";
};

const formatPlannedDateTime = (iso: string) => {
  const dt = new Date(iso);
  const date = dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const time = dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${date} в ${time}`;
};

function normalizePlanned(list: PlannedWorkout[] | undefined): PlannedWorkout[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => {
      if (!item || !item.id) return false;
      if (item.status === "cancelled") return false;
      if (item.status === "pending") return true;
      return Boolean(item.scheduledFor);
    })
    .map((item) => ({ ...item, status: item.status || "scheduled" }))
    .sort((a, b) => {
      const at = a.scheduledFor ? new Date(a.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.scheduledFor ? new Date(b.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
}

function getWorkoutGradient(label: string): string {
  const v = String(label || "").toLowerCase();
  if (v.includes("push") || v.includes("пуш") || v.includes("жим") || v.includes("грудь")) return WORKOUT_GRADIENTS.push;
  if (v.includes("pull") || v.includes("пул") || v.includes("тяг") || v.includes("спина")) return WORKOUT_GRADIENTS.pull;
  if (v.includes("leg") || v.includes("ног")) return WORKOUT_GRADIENTS.legs;
  if (v.includes("full") || v.includes("всё тело") || v.includes("все тело")) return WORKOUT_GRADIENTS.full;
  if (v.includes("upper") || v.includes("верх")) return WORKOUT_GRADIENTS.upper;
  if (v.includes("lower") || v.includes("низ")) return WORKOUT_GRADIENTS.lower;
  return WORKOUT_GRADIENTS.default;
}

function dayLabelRU(label: string): string {
  const v = String(label || "").toLowerCase();
  if (v.includes("push") || v.includes("пуш") || v.includes("жим")) return "Грудь, плечи и трицепс";
  if (v.includes("pull") || v.includes("пул") || v.includes("тяг")) return "Спина и бицепс";
  if (v.includes("leg") || v.includes("ног")) return "Ноги и ягодицы";
  if (v.includes("upper") || v.includes("верх")) return "Верхняя часть тела";
  if (v.includes("lower") || v.includes("низ")) return "Нижняя часть тела";
  if (v.includes("full")) return "Всё тело";
  if (v.includes("recovery") || v.includes("восстанов")) return "Восстановление";
  return label || "Тренировка";
}

function formatReps(r?: number | string | [number, number]) {
  if (r == null || r === "") return "—";
  if (Array.isArray(r)) return r.join("-");
  return typeof r === "number" ? String(r) : String(r);
}

function formatSec(s?: number) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}с`;
}

function humanizePlanError(err: any): string {
  if (!err) return "Не удалось обновить план";
  const code = err?.body?.code || err?.body?.details?.reason || err?.body?.error || err?.message;
  if (code === "daily_limit") return "Новую тренировку можно сгенерировать завтра.";
  if (code === "active_plan") return "Заверши текущую тренировку, чтобы получить следующую.";
  if (code === "interval_limit") return "Дай телу восстановиться. Попробуй чуть позже.";
  if (code === "weekly_limit") return "Достигнут недельный лимит тренировок.";
  return "Не удалось обновить план";
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PlanOne() {
  const nav = useNavigate();
  const location = useLocation();
  const { plan, status: planStatus, error: planError, metaError, loading, regenerate, refresh } = useWorkoutPlan<any>({ autoFetch: false });
  const sub = useSubscriptionStatus();

  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [plannedLoading, setPlannedLoading] = useState(true);
  const [plannedError, setPlannedError] = useState<string | null>(null);
  const [selectedPlannedId, setSelectedPlannedId] = useState<string | null>(null);
  const [weekGenerating, setWeekGenerating] = useState(false);
  const [mesoWeek, setMesoWeek] = useState<number | null>(null);
  const [initialWeekRequested, setInitialWeekRequested] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  const activeDraft = useMemo(() => readSessionDraft(), []);
  const activeProgress = useMemo(() => {
    const d = activeDraft;
    const items = Array.isArray(d?.items) ? d!.items : [];
    if (!items.length) return null;
    const done = items.filter((it: any) => Boolean(it?.done)).length;
    return Math.max(0, Math.min(100, Math.round((done / items.length) * 100)));
  }, [activeDraft]);

  const steps = useMemo(() => ["Анализ профиля", "Цели и ограничения", "Подбор упражнений", "Оптимизация нагрузки", "Формирование плана"], []);
  const { progress: loaderProgress, startManual: kickProgress } = useNutritionGenerationProgress(planStatus, {
    steps: steps.length,
    storageKey: "workout_generation_started_at",
    durationMs: 40_000,
  });

  const loadPlanned = useCallback(async () => {
    setPlannedLoading(true);
    setPlannedError(null);
    try {
      const data = await getScheduleOverview();
      const next = normalizePlanned(data.plannedWorkouts);
      setPlannedWorkouts(next);
      try { localStorage.setItem(PLANNED_WORKOUTS_COUNT_KEY, String(next.length)); } catch {}
      try { window.dispatchEvent(new CustomEvent("planned_workouts_updated", { detail: { count: next.length } })); } catch { window.dispatchEvent(new Event("planned_workouts_updated")); }
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

  // Reveal content animation
  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      setShowContent(true);
      return;
    }
    const t = window.setTimeout(() => setShowContent(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (root) root.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    window.scrollTo(0, 0);
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
        const at = a.scheduledFor ? new Date(a.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
        const bt = b.scheduledFor ? new Date(b.scheduledFor).getTime() : Number.POSITIVE_INFINITY;
        return at - bt;
      })[0].id;
  }, [remainingPlanned]);

  useEffect(() => {
    if (!remainingPlanned.length) {
      setSelectedPlannedId(null);
      return;
    }
    if (selectedPlannedId && remainingPlanned.some((w) => w.id === selectedPlannedId)) return;
    setSelectedPlannedId(recommendedPlannedId || remainingPlanned[0].id);
  }, [remainingPlanned, recommendedPlannedId, selectedPlannedId]);

  // Auto-generate week workouts
  useEffect(() => {
    if (plannedLoading) return;
    if (remainingPlanned.length > 0) return;
    if (weekGenerating) return;
    if (sub.locked) return;
    if (initialWeekRequested) return;

    setInitialWeekRequested(true);
    setWeekGenerating(true);
    kickProgress();
    refresh({ force: true })
      .then(() => loadPlanned())
      .catch(() => {})
      .finally(() => setWeekGenerating(false));
  }, [plannedLoading, remainingPlanned.length, weekGenerating, sub.locked, initialWeekRequested, kickProgress, refresh, loadPlanned]);

  const weekWorkouts = useMemo(() => {
    return (plannedWorkouts || [])
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
  }, [plannedWorkouts]);

  const totalWeekCount = weekWorkouts.length;
  const completedWeekCount = weekWorkouts.filter((w) => w.status === "completed").length;
  const weekChip = mesoWeek ? `Неделя ${mesoWeek}` : "Текущая неделя";

  const replaceTargetDate = useMemo(() => {
    const raw = (location.state as any)?.replaceDate;
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    return ISO_DATE_RE.test(value) ? value : null;
  }, [location.state]);

  const openScheduleForWorkout = (plannedWorkoutId: string) => {
    nav("/schedule", {
      state: { plannedWorkoutId, targetDate: replaceTargetDate, forcePick: Boolean(replaceTargetDate) },
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

  const handleWorkoutPrimary = (workout: PlannedWorkout) => {
    fireHapticImpact("light");
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
        state: { workoutDate, plannedWorkoutId: workout.id, returnTo: "/plan/one" },
      });
      return;
    }
    openScheduleForWorkout(workout.id);
  };

  // Loader state
  if (plannedLoading || weekGenerating) {
    return <WorkoutLoader steps={steps} progress={loaderProgress} />;
  }

  if (paywall || sub.locked) {
    return (
      <div style={st.page}>
        <ScreenStyles />
        <section style={st.errorCard}>
          <h3 style={{ margin: 0 }}>Оформите подписку</h3>
          <p style={{ marginTop: 8, color: "rgba(15,23,42,0.7)" }}>
            Генерация тренировок доступна по подписке.
          </p>
          <button type="button" style={st.primaryBtn} onClick={() => setPaywall(false)}>
            Понятно
          </button>
        </section>
      </div>
    );
  }

  if (plannedError) {
    return (
      <div style={st.page}>
        <ScreenStyles />
        <section style={st.errorCard}>
          <h3 style={{ margin: 0 }}>{plannedError}</h3>
          <button type="button" style={st.primaryBtn} onClick={() => loadPlanned()}>
            Обновить
          </button>
        </section>
      </div>
    );
  }

  return (
    <div style={st.page} className={isLeaving ? "onb-leave" : undefined}>
      <ScreenStyles />

      {/* Header */}
      <div style={st.header} className="onb-fade onb-fade-delay-1">
        <h1 style={st.title}>Твоя неделя</h1>
        <p style={st.subtitle}>{weekChip} • {completedWeekCount}/{totalWeekCount} выполнено</p>
      </div>

      {/* Progress Row */}
      <div style={st.progressRow} className="onb-fade onb-fade-delay-2">
        {Array.from({ length: Math.max(totalWeekCount, 1) }, (_, i) => (
          <div key={`progress-${i}`} style={st.progressDot}>
            {i < completedWeekCount && <div style={st.progressDotFilled} />}
          </div>
        ))}
      </div>

      {/* Workout Cards - Wallet Style */}
      {weekWorkouts.length > 0 ? (
        <div style={{ ...st.cardsContainer, height: CARD_EXPANDED_H + (weekWorkouts.length - 1) * STACK_OFFSET + 20 }}>
          {weekWorkouts.map((workout, idx) => {
            const activeIndex = Math.max(0, weekWorkouts.findIndex((w) => w.id === selectedPlannedId));
            const order = weekWorkouts.map((_, i) => i).filter((i) => i !== activeIndex);
            order.push(activeIndex);
            const stackIndex = order.indexOf(idx);
            const top = stackIndex * STACK_OFFSET;
            const height = stackIndex === order.length - 1 ? CARD_EXPANDED_H : CARD_COLLAPSED_H;
            const zIndex = stackIndex + 1;
            const isSelected = workout.id === selectedPlannedId;
            const isRecommended = workout.id === recommendedPlannedId;

            const p: any = workout.plan || {};
            const dayIndexRaw = Number(p?.dayIndex);
            const dayIndex = Number.isFinite(dayIndexRaw) && dayIndexRaw > 0 ? dayIndexRaw : idx + 1;
            const rawLabel = String(p.dayLabel || p.title || "Тренировка");
            const label = dayLabelRU(rawLabel);
            const gradient = getWorkoutGradient(rawLabel);
            const totalExercises = Number(p?.totalExercises) || (Array.isArray(p?.exercises) ? p.exercises.length : 0);
            const minutes = Number(p?.estimatedDuration) || null;
            const dateHint = workout.scheduledFor ? formatPlannedDateTime(workout.scheduledFor) : "Не запланировано";
            const status = workout.status || "pending";
            const statusText = status === "completed" ? "Выполнена" : status === "scheduled" ? "Запланирована" : "Свободный день";

            const exercises: Exercise[] = (Array.isArray(p.exercises) ? p.exercises : []).map((ex: any) => ({
              exerciseId: String(ex?.exerciseId || ex?.id || ex?.exercise?.id || "") || undefined,
              name: String(ex?.name || ex?.exerciseName || "Упражнение"),
              sets: Number(ex?.sets) || 1,
              reps: ex?.reps || ex?.repsRange || "",
              restSec: ex?.restSec != null ? Number(ex.restSec) : undefined,
              cues: String(ex?.notes || ex?.cues || "").trim() || undefined,
            }));

            return (
              <WorkoutCard
                key={workout.id}
                workout={workout}
                dayIndex={dayIndex}
                label={label}
                gradient={gradient}
                totalExercises={totalExercises}
                minutes={minutes}
                dateHint={dateHint}
                status={status}
                statusText={statusText}
                exercises={exercises}
                isSelected={isSelected}
                isRecommended={isRecommended}
                stackIndex={stackIndex}
                top={top}
                height={height}
                zIndex={zIndex}
                showContent={showContent}
                idx={idx}
                activeProgress={activeDraft?.plannedWorkoutId === workout.id ? activeProgress : null}
                onSelect={() => {
                  if (workout.status !== "completed") {
                    fireHapticImpact("light");
                    setSelectedPlannedId(workout.id);
                  }
                }}
                onStart={() => handleWorkoutPrimary(workout)}
                onSchedule={() => openScheduleForWorkout(workout.id)}
                onExerciseUpdated={(pw) => setPlannedWorkouts((prev) => prev.map((x) => (x.id === pw.id ? pw : x)))}
              />
            );
          })}
        </div>
      ) : (
        <section style={st.emptyCard} className="onb-fade onb-fade-delay-3">
          <h3 style={{ margin: 0 }}>Тренировок на неделю пока нет</h3>
          <p style={{ marginTop: 8, color: "rgba(15,23,42,0.7)" }}>
            Сгенерируем набор тренировок под твою схему.
          </p>
          <button type="button" style={st.primaryBtn} onClick={handleGenerateWeek}>
            Сгенерировать тренировки
          </button>
        </section>
      )}

      <div style={{ height: 100 }} />
    </div>
  );
}

// ============================================================================
// WORKOUT CARD COMPONENT
// ============================================================================

type WorkoutCardProps = {
  workout: PlannedWorkout;
  dayIndex: number;
  label: string;
  gradient: string;
  totalExercises: number;
  minutes: number | null;
  dateHint: string;
  status: string;
  statusText: string;
  exercises: Exercise[];
  isSelected: boolean;
  isRecommended: boolean;
  stackIndex: number;
  top: number;
  height: number;
  zIndex: number;
  showContent: boolean;
  idx: number;
  activeProgress: number | null;
  onSelect: () => void;
  onStart: () => void;
  onSchedule: () => void;
  onExerciseUpdated: (pw: PlannedWorkout) => void;
};

function WorkoutCard({
  workout,
  dayIndex,
  label,
  gradient,
  totalExercises,
  minutes,
  dateHint,
  status,
  statusText,
  exercises,
  isSelected,
  isRecommended,
  stackIndex,
  top,
  height,
  zIndex,
  showContent,
  idx,
  activeProgress,
  onSelect,
  onStart,
  onSchedule,
  onExerciseUpdated,
}: WorkoutCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusStyle = status === "completed"
    ? st.statusDone
    : status === "scheduled"
    ? st.statusScheduled
    : st.statusPending;

  const primaryActionLabel = status === "completed" ? "Результат" : status === "scheduled" ? "Начать" : "Выбрать дату";

  return (
    <button
      type="button"
      className={`workout-card onb-fade-target${showContent ? ` onb-fade onb-fade-delay-${Math.min(idx + 2, 5)}` : ""}`}
      style={{
        ...st.card,
        top,
        height: expanded ? "auto" : height,
        minHeight: height,
        zIndex,
        background: `linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(250,250,252,0.9) 100%), ${gradient}`,
      }}
      onClick={onSelect}
    >
      {/* Recommended Badge */}
      {isRecommended && status !== "completed" && (
        <div style={st.recommendedBadge}>
          <CheckIcon size={12} color="#fff" />
          <span>Следующая</span>
        </div>
      )}

      {/* Card Header */}
      <div style={st.cardHeader}>
        <div style={st.cardHeaderLeft}>
          <span style={st.dayPill}>День {dayIndex}</span>
          <span style={{ ...st.statusPill, ...statusStyle }}>{statusText}</span>
        </div>
        <div style={st.cardHeaderRight}>
          <CalendarIcon size={16} color="rgba(15,23,42,0.5)" />
          <span style={st.dateText}>{dateHint}</span>
        </div>
      </div>

      {/* Card Title */}
      <div style={st.cardTitle}>{label}</div>

      {/* Meta Info */}
      <div style={st.cardMeta}>
        <div style={st.metaChip}>
          <DumbbellIcon size={16} color="#334155" />
          <span>{totalExercises} упр.</span>
        </div>
        {minutes && (
          <div style={st.metaChip}>
            <ClockIcon size={16} color="#334155" />
            <span>{minutes} мин</span>
          </div>
        )}
        {activeProgress !== null && (
          <div style={{ ...st.metaChip, background: "rgba(163,230,53,0.2)", borderColor: "rgba(132,204,22,0.4)" }}>
            <CheckIcon size={16} color="#3f6212" />
            <span style={{ color: "#3f6212" }}>{activeProgress}%</span>
          </div>
        )}
      </div>

      {/* Actions - only show when selected */}
      {isSelected && (
        <div style={st.cardActions} onClick={(e) => e.stopPropagation()}>
          <button type="button" style={st.actionPrimary} onClick={onStart}>
            {primaryActionLabel}
            <ArrowRightIcon size={18} color="#fff" />
          </button>
          {status !== "completed" && (
            <button type="button" style={st.actionSecondary} onClick={onSchedule}>
              {status === "scheduled" ? "Изменить" : "Запланировать"}
            </button>
          )}
        </div>
      )}

      {/* Exercises Preview - only for selected card */}
      {isSelected && status !== "completed" && (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            style={st.expandBtn}
            onClick={() => {
              fireHapticImpact("light");
              setExpanded((v) => !v);
            }}
          >
            <span>{expanded ? "Скрыть упражнения" : "Показать упражнения"}</span>
            <div style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms ease" }}>
              <ChevronDownIcon size={16} color="rgba(15,23,42,0.7)" />
            </div>
          </button>

          {expanded && (
            <SwipeableExercisesList
              plannedWorkout={workout}
              exercises={exercises}
              onUpdated={onExerciseUpdated}
            />
          )}
        </div>
      )}
    </button>
  );
}

// ============================================================================
// SWIPEABLE EXERCISES LIST (iOS-style)
// ============================================================================

type SwipeableExercisesListProps = {
  plannedWorkout: PlannedWorkout;
  exercises: Exercise[];
  onUpdated: (pw: PlannedWorkout) => void;
};

function SwipeableExercisesList({ plannedWorkout, exercises, onUpdated }: SwipeableExercisesListProps) {
  return (
    <div style={st.exercisesList}>
      {exercises.map((ex, i) => (
        <SwipeableExerciseItem
          key={`${ex.name}-${i}`}
          exercise={ex}
          index={i}
          plannedWorkout={plannedWorkout}
          onUpdated={onUpdated}
        />
      ))}
    </div>
  );
}

type SwipeableExerciseItemProps = {
  exercise: Exercise;
  index: number;
  plannedWorkout: PlannedWorkout;
  onUpdated: (pw: PlannedWorkout) => void;
};

function SwipeableExerciseItem({ exercise, index, plannedWorkout, onUpdated }: SwipeableExerciseItemProps) {
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [actionMode, setActionMode] = useState<"none" | "replace" | "confirm_delete" | "confirm_block">("none");
  const [alts, setAlts] = useState<ExerciseAlternative[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (actionMode !== "none") return;
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = swipeX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || actionMode !== "none") return;
    const diff = e.touches[0].clientX - startXRef.current;
    const newX = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, currentXRef.current + diff));
    setSwipeX(newX);
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);

    if (swipeX < -SWIPE_THRESHOLD) {
      setSwipeX(-SWIPE_ACTION_WIDTH);
      setIsOpen(true);
      fireHapticImpact("medium");
    } else {
      setSwipeX(0);
      setIsOpen(false);
    }
  };

  const closeSwipe = () => {
    setSwipeX(0);
    setIsOpen(false);
    setActionMode("none");
    setAlts([]);
    setError(null);
  };

  const handleReplace = async () => {
    if (!exercise.exerciseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getExerciseAlternatives({ exerciseId: exercise.exerciseId, reason: "preference", limit: 3 });
      const list = Array.isArray(res?.alternatives) ? res.alternatives : [];
      setAlts(list.slice(0, 3));
      setActionMode("replace");
      fireHapticImpact("light");
    } catch (e) {
      setError("Не удалось загрузить альтернативы");
    } finally {
      setLoading(false);
    }
  };

  const applyReplace = async (newExerciseId: string) => {
    setLoading(true);
    setError(null);
    try {
      const pw = await replacePlannedWorkoutExercise({
        plannedWorkoutId: plannedWorkout.id,
        index,
        newExerciseId,
        reason: "user_replace",
        source: "user",
      });
      onUpdated(pw);
      closeSwipe();
      fireHapticImpact("medium");
      try { window.dispatchEvent(new Event("schedule_updated" as any)); } catch {}
    } catch (e) {
      setError("Не удалось заменить упражнение");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const pw = await removePlannedWorkoutExercise({
        plannedWorkoutId: plannedWorkout.id,
        index,
        reason: "user_remove",
        source: "user",
      });
      onUpdated(pw);
      closeSwipe();
      fireHapticImpact("medium");
      try { window.dispatchEvent(new Event("schedule_updated" as any)); } catch {}
    } catch (e) {
      setError("Не удалось удалить упражнение");
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!exercise.exerciseId) return;
    setLoading(true);
    setError(null);
    try {
      await excludeExercise({ exerciseId: exercise.exerciseId, reason: "user_ban_from_plan", source: "user" });
      closeSwipe();
      fireHapticImpact("medium");
    } catch (e) {
      setError("Не удалось заблокировать упражнение");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={st.exerciseItemWrapper} ref={containerRef}>
      {/* Action buttons (behind) */}
      <div style={st.swipeActions}>
        <button
          type="button"
          style={{ ...st.swipeActionBtn, background: "#3b82f6" }}
          onClick={handleReplace}
          disabled={loading || !exercise.exerciseId}
        >
          <SwapIcon size={20} color="#fff" />
          <span>Заменить</span>
        </button>
        <button
          type="button"
          style={{ ...st.swipeActionBtn, background: "#ef4444" }}
          onClick={() => setActionMode("confirm_delete")}
          disabled={loading}
        >
          <TrashIcon size={20} color="#fff" />
          <span>Удалить</span>
        </button>
        <button
          type="button"
          style={{ ...st.swipeActionBtn, background: "#6b7280" }}
          onClick={() => setActionMode("confirm_block")}
          disabled={loading || !exercise.exerciseId}
        >
          <BlockIcon size={20} color="#fff" />
          <span>Блок</span>
        </button>
      </div>

      {/* Main content (swipeable) */}
      <div
        style={{
          ...st.exerciseItem,
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? "none" : "transform 300ms cubic-bezier(0.25, 1, 0.5, 1)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => isOpen && closeSwipe()}
      >
        <div style={st.exerciseInfo}>
          <div style={st.exerciseName}>{exercise.name}</div>
          {exercise.cues && <div style={st.exerciseCues}>{exercise.cues}</div>}
        </div>
        <div style={st.exerciseMetrics}>
          <div style={st.exerciseMetric}>
            <DumbbellIcon size={14} color="#64748b" />
            <span>{exercise.sets}×{formatReps(exercise.reps)}</span>
          </div>
          {exercise.restSec && (
            <div style={st.exerciseMetric}>
              <ClockIcon size={14} color="#64748b" />
              <span>{formatSec(exercise.restSec)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Modal Overlay */}
      {actionMode !== "none" && (
        <div style={st.actionOverlay} onClick={() => setActionMode("none")}>
          <div style={st.actionModal} onClick={(e) => e.stopPropagation()}>
            {error && <div style={st.actionError}>{error}</div>}

            {actionMode === "replace" && (
              <>
                <div style={st.actionModalTitle}>Выберите замену</div>
                {loading ? (
                  <div style={st.actionLoading}>Загрузка...</div>
                ) : alts.length > 0 ? (
                  <div style={st.altsList}>
                    {alts.map((alt) => (
                      <button
                        key={alt.exerciseId}
                        type="button"
                        style={st.altBtn}
                        onClick={() => applyReplace(alt.exerciseId)}
                        disabled={loading}
                      >
                        {alt.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={st.actionLoading}>Альтернатив не найдено</div>
                )}
                <button type="button" style={st.cancelBtn} onClick={() => setActionMode("none")}>
                  Отмена
                </button>
              </>
            )}

            {actionMode === "confirm_delete" && (
              <>
                <div style={st.actionModalTitle}>Удалить упражнение?</div>
                <div style={st.actionModalText}>Это действие нельзя отменить</div>
                <button
                  type="button"
                  style={{ ...st.confirmBtn, background: "#ef4444" }}
                  onClick={handleDelete}
                  disabled={loading}
                >
                  {loading ? "Удаление..." : "Да, удалить"}
                </button>
                <button type="button" style={st.cancelBtn} onClick={() => setActionMode("none")}>
                  Отмена
                </button>
              </>
            )}

            {actionMode === "confirm_block" && (
              <>
                <div style={st.actionModalTitle}>Заблокировать упражнение?</div>
                <div style={st.actionModalText}>Оно больше не будет появляться в ваших тренировках</div>
                <button
                  type="button"
                  style={{ ...st.confirmBtn, background: "#6b7280" }}
                  onClick={handleBlock}
                  disabled={loading}
                >
                  {loading ? "Блокировка..." : "Да, заблокировать"}
                </button>
                <button type="button" style={st.cancelBtn} onClick={() => setActionMode("none")}>
                  Отмена
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LOADER COMPONENT
// ============================================================================

function WorkoutLoader({ steps, progress }: { steps: string[]; progress: number }) {
  const stepIndex = Math.min(steps.length - 1, Math.max(0, Math.floor((progress / 100) * steps.length)));
  const displayProgress = Math.max(5, Math.min(99, Math.round(progress || 0)));

  return (
    <div style={st.page}>
      <ScreenStyles />
      <div style={st.loaderCard}>
        <div style={st.loaderSpinner}>
          <svg width="64" height="64" viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="20" stroke="rgba(15,23,42,0.1)" strokeWidth="5" fill="none" />
            <circle
              cx="25" cy="25" r="20"
              stroke="#0f172a" strokeWidth="5" strokeLinecap="round" fill="none"
              strokeDasharray="110" strokeDashoffset="80"
              style={{ transformOrigin: "25px 25px", animation: "spin 1.2s linear infinite" }}
            />
          </svg>
        </div>
        <div style={st.loaderTitle}>Создаём тренировки</div>
        <div style={st.loaderSubtitle}>{steps[stepIndex]}</div>
        <div style={st.loaderProgress}>
          <div style={{ ...st.loaderProgressFill, width: `${displayProgress}%` }} />
        </div>
        <div style={st.loaderPercent}>{displayProgress}%</div>
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN STYLES
// ============================================================================

function ScreenStyles() {
  return (
    <style>{`
      @keyframes onbFadeUp {
        0% { opacity: 0; transform: translateY(14px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes onbFadeDown {
        0% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(12px); }
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .onb-fade-target { opacity: 0; }
      .onb-fade { animation: onbFadeUp 520ms ease-out both; }
      .onb-fade-delay-1 { animation-delay: 80ms; }
      .onb-fade-delay-2 { animation-delay: 160ms; }
      .onb-fade-delay-3 { animation-delay: 240ms; }
      .onb-fade-delay-4 { animation-delay: 320ms; }
      .onb-fade-delay-5 { animation-delay: 400ms; }
      .onb-leave { animation: onbFadeDown 220ms ease-in both; }

      .workout-card {
        appearance: none;
        outline: none;
        cursor: pointer;
        text-align: left;
        -webkit-tap-highlight-color: transparent;
        transition: top 320ms ease, height 320ms ease, transform 220ms ease, box-shadow 220ms ease;
        will-change: top, height, transform;
      }
      .workout-card:active:not(:disabled) {
        transform: translateY(1px) scale(0.99);
      }

      @media (prefers-reduced-motion: reduce) {
        .onb-fade, .onb-leave { animation: none !important; }
        .onb-fade-target { opacity: 1 !important; transform: none !important; }
        .workout-card { transition: none !important; }
      }
    `}</style>
  );
}

// ============================================================================
// INLINE STYLES
// ============================================================================

const st: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px calc(env(safe-area-inset-bottom, 0px) + 100px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    background: "transparent",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#1e1f22",
  },

  header: {
    display: "grid",
    gap: 4,
    textAlign: "center",
    marginTop: 8,
  },
  title: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.1,
    fontWeight: 800,
    letterSpacing: -0.8,
    color: "#0f172a",
  },
  subtitle: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.4,
    color: "rgba(15, 23, 42, 0.6)",
    fontWeight: 500,
  },

  progressRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "8px 0",
  },
  progressDot: {
    width: 28,
    height: 12,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.12)",
    display: "grid",
    placeItems: "center",
  },
  progressDotFilled: {
    width: 10,
    height: 6,
    borderRadius: 999,
    background: "linear-gradient(135deg, #84cc16 0%, #65a30d 100%)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  },

  cardsContainer: {
    position: "relative",
    width: "100%",
    marginTop: 8,
  },

  card: {
    position: "absolute",
    width: "100%",
    borderRadius: 24,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflow: "hidden",
  },

  recommendedBadge: {
    position: "absolute",
    top: -10,
    right: 18,
    background: "#0f172a",
    color: "#fff",
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: 5,
    boxShadow: "0 4px 12px rgba(15,23,42,0.3)",
    zIndex: 10,
  },

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  cardHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },

  dayPill: {
    padding: "5px 12px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.08)",
    color: "#0f172a",
    fontSize: 12,
    fontWeight: 700,
  },
  statusPill: {
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    border: "1px solid transparent",
  },
  statusScheduled: {
    background: "rgba(59,130,246,0.12)",
    borderColor: "rgba(59,130,246,0.25)",
    color: "#1d4ed8",
  },
  statusPending: {
    background: "rgba(255,255,255,0.78)",
    borderColor: "rgba(0,0,0,0.08)",
    color: "rgba(15,23,42,0.65)",
  },
  statusDone: {
    background: "rgba(163,230,53,0.18)",
    borderColor: "rgba(132,204,22,0.42)",
    color: "#3f6212",
  },

  dateText: {
    fontSize: 12,
    color: "rgba(15,23,42,0.5)",
    fontWeight: 500,
  },

  cardTitle: {
    fontSize: 26,
    lineHeight: 1.1,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: -0.4,
  },

  cardMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  metaChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(0,0,0,0.06)",
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },

  cardActions: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    marginTop: 4,
  },
  actionPrimary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    border: "none",
    background: "#0f172a",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(15,23,42,0.25)",
  },
  actionSecondary: {
    minHeight: 48,
    padding: "0 18px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.8)",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },

  expandBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    padding: "10px",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.5)",
    color: "rgba(15,23,42,0.7)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },

  exercisesList: {
    display: "grid",
    gap: 8,
    marginTop: 12,
  },

  exerciseItemWrapper: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
  },
  swipeActions: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SWIPE_ACTION_WIDTH,
    display: "flex",
    alignItems: "stretch",
  },
  swipeActionBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    border: "none",
    color: "#fff",
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
  },

  exerciseItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 14,
  },
  exerciseInfo: {
    flex: 1,
    minWidth: 0,
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.3,
  },
  exerciseCues: {
    fontSize: 12,
    color: "rgba(15,23,42,0.6)",
    marginTop: 2,
    lineHeight: 1.3,
  },
  exerciseMetrics: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    alignItems: "flex-end",
  },
  exerciseMetric: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "#64748b",
  },

  actionOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "grid",
    placeItems: "center",
    padding: 20,
    zIndex: 1000,
  },
  actionModal: {
    width: "100%",
    maxWidth: 320,
    background: "#fff",
    borderRadius: 20,
    padding: 20,
    display: "grid",
    gap: 12,
  },
  actionModalTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
    textAlign: "center",
  },
  actionModalText: {
    fontSize: 14,
    color: "rgba(15,23,42,0.7)",
    textAlign: "center",
  },
  actionError: {
    padding: "10px 14px",
    borderRadius: 12,
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.2)",
    color: "#dc2626",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
  },
  actionLoading: {
    fontSize: 14,
    color: "rgba(15,23,42,0.6)",
    textAlign: "center",
    padding: "12px 0",
  },
  altsList: {
    display: "grid",
    gap: 8,
  },
  altBtn: {
    padding: "14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.9)",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },
  confirmBtn: {
    padding: "14px",
    borderRadius: 14,
    border: "none",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  cancelBtn: {
    padding: "14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.9)",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },

  emptyCard: {
    padding: 24,
    borderRadius: 24,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    textAlign: "center",
  },
  errorCard: {
    padding: 24,
    borderRadius: 24,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    textAlign: "center",
    marginTop: 40,
  },

  primaryBtn: {
    width: "100%",
    marginTop: 16,
    padding: "14px 24px",
    borderRadius: 14,
    border: "none",
    background: "#0f172a",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(15,23,42,0.25)",
  },

  loaderCard: {
    marginTop: 60,
    padding: 32,
    borderRadius: 28,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "grid",
    placeItems: "center",
    gap: 16,
  },
  loaderSpinner: {
    display: "grid",
    placeItems: "center",
  },
  loaderTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: "#0f172a",
    textAlign: "center",
  },
  loaderSubtitle: {
    fontSize: 15,
    color: "rgba(15,23,42,0.6)",
    fontWeight: 500,
    textAlign: "center",
  },
  loaderProgress: {
    width: "100%",
    maxWidth: 200,
    height: 8,
    borderRadius: 999,
    background: "rgba(15,23,42,0.1)",
    overflow: "hidden",
  },
  loaderProgressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)",
    transition: "width 300ms ease",
  },
  loaderPercent: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
  },
};

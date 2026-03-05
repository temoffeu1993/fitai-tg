import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, CircleCheckBig, Calendar, Clock3, Check, ChevronRight, Trash2, Pencil, Dumbbell, ArrowLeft, Plus, RefreshCw, X } from "lucide-react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getScheduleOverview,
  updatePlannedWorkout,
  reschedulePlannedWorkout,
  PlannedWorkout,
  ScheduleByDate,
} from "@/api/schedule";
import { resolveWorkoutTitle } from "@/screens/WorkoutResult";
import DateTimeWheelInline from "@/components/DateTimeWheelInline";
import mascotImg from "@/assets/robonew.webp";


const isValidTime = (value: string) => /^\d{2}:\d{2}$/.test(value);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MASCOT_SRC = mascotImg;
const MONTH_FULL_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

const defaultTimeSuggestion = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "18:00" : "09:00";
};

const normalizeScheduleDates = (dates: Record<string, { time?: string }> | null | undefined): ScheduleByDate => {
  if (!dates) return {};
  const out: ScheduleByDate = {};
  Object.entries(dates).forEach(([iso, entry]) => {
    if (entry?.time && isValidTime(entry.time)) {
      out[iso] = { time: entry.time };
    }
  });
  return out;
};

type ModalState = {
  workout: PlannedWorkout | null;
  selectedWorkoutId: string | null;
  allowScheduledPick: boolean;
  date: string;
  time: string;
  saving: boolean;
  error: string | null;
};

type ReplaceConfirmState = {
  targetWorkoutId: string;
  targetTitle: string;
  conflictTitle: string;
  date: string;
  time: string;
  timeConflict: boolean;
};

export default function Schedule() {
  const nav = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planned, setPlanned] = useState<PlannedWorkout[]>([]);
  const [scheduleDates, setScheduleDates] = useState<ScheduleByDate>({});
  const [modal, setModal] = useState<ModalState | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState<ReplaceConfirmState | null>(null);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

  const reload = useCallback(async () => {
    const data = await getScheduleOverview();
    const normalized = normalizePlanned(data.plannedWorkouts);
    setPlanned(normalized);
    setScheduleDates(normalizeScheduleDates(data.schedule?.dates));
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await reload();
      } catch (err) {
        console.error("load schedule failed", err);
        if (active) setError("Не удалось загрузить расписание");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reload]);

  // If navigated from PlanOne with replace context, open scheduling modal in pick mode.
  const requestedOpenRef = useRef<{
    plannedWorkoutId: string | null;
    targetDate: string | null;
    forcePick: boolean;
  }>({
    plannedWorkoutId: null,
    targetDate: null,
    forcePick: false,
  });
  useEffect(() => {
    const state = (location.state as any) || {};
    const id =
      typeof state.plannedWorkoutId === "string" && state.plannedWorkoutId.trim()
        ? state.plannedWorkoutId.trim()
        : null;
    if (!id) return;
    const targetDate =
      typeof state.targetDate === "string" && ISO_DATE_RE.test(state.targetDate.trim())
        ? state.targetDate.trim()
        : null;
    requestedOpenRef.current = {
      plannedWorkoutId: id,
      targetDate,
      forcePick: Boolean(state.forcePick),
    };
  }, [location.state]);

  useEffect(() => {
    const req = requestedOpenRef.current;
    const id = req.plannedWorkoutId;
    if (!id) return;
    if (!planned.length) return;
    const w = planned.find((x) => x.id === id);
    if (!w) return;

    const todayKey = toDateKey(stripTime(new Date()));
    const requestedDate = req.targetDate || null;
    const openInPickMode = Boolean(req.forcePick || requestedDate);
    if (openInPickMode) {
      const date = requestedDate || todayKey;
      const fallbackTime =
        w.status === "scheduled" && w.scheduledFor
          ? toTimeInput(w.scheduledFor)
          : defaultTimeSuggestion();
      const time = scheduleDates[date]?.time ?? fallbackTime;
      setModal({
        workout: null,
        selectedWorkoutId: w.id,
        allowScheduledPick: true,
        date,
        time,
        saving: false,
        error: null,
      });
    } else {
      const initialTime = scheduleDates[todayKey]?.time ?? defaultTimeSuggestion();
      const date = w.status === "pending" ? todayKey : toDateInput(w.scheduledFor);
      const time = w.status === "pending" ? initialTime : toTimeInput(w.scheduledFor);
      setModal({
        workout: w,
        selectedWorkoutId: w.id,
        allowScheduledPick: false,
        date,
        time,
        saving: false,
        error: null,
      });
    }

    requestedOpenRef.current = { plannedWorkoutId: null, targetDate: null, forcePick: false };
    nav(".", { replace: true, state: null });
  }, [planned, scheduleDates, nav]);

  useEffect(() => {
    const handler = () => {
      reload().catch((err) => console.error("reload schedule failed", err));
    };
    window.addEventListener("schedule_updated", handler as any);
    return () => window.removeEventListener("schedule_updated", handler as any);
  }, [reload]);

  const [monthOffset, setMonthOffset] = useState(0);
  const today = stripTime(new Date());
  const view = addMonths(today, monthOffset);
  const monthLabel = view.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(/ г\.$/, "");
  const prevMonthName = MONTH_FULL_RU[addMonths(view, -1).getMonth()];
  const nextMonthName = MONTH_FULL_RU[addMonths(view, 1).getMonth()];

  const days = useMemo(() => buildMonthGrid(view), [view]);

  const plannedByDate = useMemo(() => groupByDate(planned), [planned]);

  // For picking in the calendar, show only not-yet-scheduled workouts.
  const pendingWorkouts = useMemo(() => planned.filter((w) => w.status === "pending"), [planned]);
  const assignableWorkouts = useMemo(
    () => planned.filter((w) => w.status === "pending" || w.status === "scheduled"),
    [planned]
  );

  const monthStart = useMemo(() => new Date(view.getFullYear(), view.getMonth(), 1), [view]);
  const monthEnd = useMemo(() => new Date(view.getFullYear(), view.getMonth() + 1, 0, 23, 59, 59, 999), [view]);

  const upcoming = useMemo(() => {
    return planned
      .filter((w) => {
        if (w.status !== "scheduled") return false;
        const t = new Date(w.scheduledFor).getTime();
        return t >= monthStart.getTime() && t <= monthEnd.getTime();
      })
      .sort(
        (a, b) =>
          new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
      );
  }, [planned, monthStart, monthEnd]);

  const completed = useMemo(() => {
    return planned
      .filter((w) => {
        if (w.status !== "completed") return false;
        const t = new Date(w.scheduledFor).getTime();
        return t >= monthStart.getTime() && t <= monthEnd.getTime();
      })
      .sort(
        (a, b) =>
          new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime()
      );
  }, [planned, monthStart, monthEnd]);

  const openDate = (date: Date) => {
    const key = toDateKey(date);
    const items = plannedByDate[key] || [];
    const completedItems = items.filter((w) => w.status === "completed");
    const scheduledItems = items.filter((w) => w.status === "scheduled");
    if (completedItems.length > 0 && scheduledItems.length === 0) {
      // All completed — open first one (readOnly view shows all)
      openWorkout(completedItems[0]);
      return;
    }
    if (scheduledItems.length > 0) {
      // Has scheduled — open in list mode (workout=null triggers scheduledWorkouts view)
      const first = scheduledItems[0];
      const initialTime = toTimeInput(first.scheduledFor);
      setModal({
        workout: null,
        selectedWorkoutId: null,
        allowScheduledPick: false,
        date: key,
        time: initialTime,
        saving: false,
        error: null,
      });
      return;
    }
    const initialTime = scheduleDates[key]?.time ?? defaultTimeSuggestion();
    setModal({
      workout: null,
      selectedWorkoutId: null,
      allowScheduledPick: false,
      date: key,
      time: initialTime,
      saving: false,
      error: null,
    });
  };

  const openWorkout = (workout: PlannedWorkout) => {
    const todayKey = toDateKey(stripTime(new Date()));
    const initialTime = scheduleDates[todayKey]?.time ?? defaultTimeSuggestion();
    const date = workout.status === "pending" ? todayKey : toDateInput(workout.scheduledFor);
    const time = workout.status === "pending" ? initialTime : toTimeInput(workout.scheduledFor);
    setModal({
      workout,
      selectedWorkoutId: workout.id,
      allowScheduledPick: false,
      date,
      time,
      saving: false,
      error: null,
    });
  };

  const handleModalSave = async (workoutId?: string) => {
    if (!modal) return;
    const { workout, date, time, selectedWorkoutId, allowScheduledPick } = modal;
    if (workout?.status === "completed") return;
    const candidatePool = allowScheduledPick ? assignableWorkouts : pendingWorkouts;
    const id = workoutId || selectedWorkoutId;
    const effectiveWorkout =
      workout ?? candidatePool.find((w) => w.id === id) ?? planned.find((w) => w.id === id) ?? null;
    if (!effectiveWorkout) {
      setModal((prev) =>
        prev ? { ...prev, error: "Выбери тренировку" } : prev
      );
      return;
    }
    const when = parseLocalDateTime(date, time);
    if (!when) {
      setModal((prev) =>
        prev ? { ...prev, error: "Укажи корректные дату и время" } : prev
      );
      return;
    }
    const conflict = planned.find(
      (w) =>
        w.id !== effectiveWorkout.id &&
        w.status === "scheduled" &&
        Boolean(w.scheduledFor) &&
        toDateInput(w.scheduledFor) === date
    );
    if (conflict) {
      const targetTitle = resolveWorkoutTitle(effectiveWorkout.plan || {});
      const conflictTitle = resolveWorkoutTitle(conflict.plan || {});
      const timeConflict = toTimeInput(conflict.scheduledFor) === time;
      setReplaceConfirm({
        targetWorkoutId: effectiveWorkout.id,
        targetTitle,
        conflictTitle,
        date,
        time,
        timeConflict,
      });
      return;
    }

    await performModalSave(effectiveWorkout.id, date, time);
  };

  const performModalSave = async (targetWorkoutId: string, date: string, time: string, mode?: "add" | "replace") => {
    const when = parseLocalDateTime(date, time);
    if (!when) {
      setModal((prev) =>
        prev ? { ...prev, error: "Укажи корректные дату и время" } : prev
      );
      return;
    }
    setModal((prev) => (prev ? { ...prev, saving: true, error: null } : prev));
    try {
      const utcOffsetMinutes = when.getTimezoneOffset();
      const dayUtcOffsetMinutes = new Date(`${date}T00:00`).getTimezoneOffset();
      const { plannedWorkout: updated, unscheduledIds } = await reschedulePlannedWorkout(targetWorkoutId, {
        date,
        time,
        utcOffsetMinutes,
        dayUtcOffsetMinutes,
        mode,
      });
      setPlanned((prev) => mergePlanned(prev, updated));
      if (unscheduledIds.length > 0) {
        setPlanned((prev) =>
          prev.map((w) =>
            unscheduledIds.includes(w.id) ? { ...w, status: "pending" as const } : w
          )
        );
      }
      await reload();
      setModal(null);
      setReplaceConfirm(null);
    } catch (err) {
      console.error("reschedule planned workout failed", err);
      const msg = err instanceof Error ? err.message : "";
      const isPast = msg.includes("past_datetime");
      setModal((prev) =>
        prev
          ? { ...prev, saving: false, error: isPast ? "Нельзя выбрать прошедшие дату и время" : "Не удалось сохранить. Попробуй ещё раз." }
          : prev
      );
    }
  };

  const handleReplaceConfirm = async () => {
    if (!replaceConfirm || !modal || modal.saving) return;
    await performModalSave(replaceConfirm.targetWorkoutId, replaceConfirm.date, replaceConfirm.time, "replace");
  };

  const handleReplaceAdd = async () => {
    if (!replaceConfirm || !modal || modal.saving) return;
    await performModalSave(replaceConfirm.targetWorkoutId, replaceConfirm.date, replaceConfirm.time, "add");
  };

  const handleModalDelete = async () => {
    if (!modal) return;
    const workoutId = modal.workout?.id || modal.selectedWorkoutId;
    if (!workoutId) return;
    setModal((prev) => (prev ? { ...prev, saving: true, error: null } : prev));
    try {
      const updated = await updatePlannedWorkout(workoutId, { status: "pending" });
      setPlanned((prev) => mergePlanned(prev, updated));
      await reload();
      setModal(null);
      setReplaceConfirm(null);
    } catch (err) {
      console.error("unschedule planned workout failed", err);
      setModal((prev) =>
        prev
          ? { ...prev, saving: false, error: "Не удалось удалить. Попробуй снова." }
          : prev
      );
    }
  };

  const handleModalStart = () => {
    if (!modal) return;
    const w = modal.workout ?? planned.find((p) => p.id === modal.selectedWorkoutId) ?? null;
    if (!w || w.status !== "scheduled") return;
    const workoutDate = toDateKey(parseIsoDate(w.scheduledFor));
    setModal(null);
    nav("/check-in", {
      state: {
        workoutDate,
        plannedWorkoutId: w.id,
        returnTo: "/schedule",
      },
    });
  };

  const handleModalDetails = (workoutId?: string) => {
    let sessionId: string | null = null;
    if (workoutId) {
      const w = planned.find((p) => p.id === workoutId);
      sessionId = w?.resultSessionId ? String(w.resultSessionId) : null;
    } else {
      sessionId = modal?.workout?.resultSessionId ? String(modal.workout.resultSessionId) : null;
    }
    if (!sessionId) return;
    setModal(null);
    nav(`/workout/result?sessionId=${encodeURIComponent(sessionId)}`);
  };

  const handleRetry = async () => {
    setLoading(true);
    try {
      await reload();
    } catch (err) {
      console.error("reload failed", err);
      setError("Не удалось загрузить расписание");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loader />;
  if (error) return <ErrorView msg={error} onRetry={handleRetry} />;

  const upcomingPreview = upcoming;

  return (
    <div style={s.page}>
      <style>{`
        @keyframes schedFadeUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .sched-fade { animation: schedFadeUp 520ms ease-out both; }
        .sched-delay-1 { animation-delay: 80ms; }
        .sched-delay-2 { animation-delay: 160ms; }
        .sched-delay-3 { animation-delay: 240ms; }
        @media (prefers-reduced-motion: reduce) {
          .sched-fade { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
      {/* BLOCK 1: Avatar Header */}
      <section style={s.avatarHeader} className="sched-fade sched-delay-1">
        <div style={s.avatarLeft}>
          <div style={s.avatarCircle}>
            <img src={MASCOT_SRC} alt="Моро" style={s.mascotAvatarImg} loading="eager" decoding="async" draggable={false} />
          </div>
          <div style={s.avatarText}>
            <div style={s.avatarTitle}>Календарь тренировок</div>
            <div style={s.avatarSub}>Нажми на дату и запланируй</div>
          </div>
        </div>
      </section>

      <section style={s.block} className="sched-fade sched-delay-2">
        <div style={ux.card}>
          <div style={s.calNav}>
            <button type="button" style={s.calNavBtn} onClick={() => setMonthOffset((x) => x - 1)}>
              <span>←</span>
              <span>{prevMonthName}</span>
            </button>
            <div style={s.calNavCurrent}>{monthLabel}</div>
            <button type="button" style={s.calNavBtn} onClick={() => setMonthOffset((x) => x + 1)}>
              <span>{nextMonthName}</span>
              <span>→</span>
            </button>
          </div>
          <div style={cal.headerRow}>
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => (
              <div key={w} style={cal.headerCell}>
                {w}
              </div>
            ))}
          </div>

          <div style={cal.grid}>
            {days.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;
	              const key = toDateKey(day);
	              const items = plannedByDate[key] || [];
	              const isToday = sameDate(day, today);
	              const hasCompleted = items.some((w) => w.status === "completed");
	              const completedItem = items.find((w) => w.status === "completed");
	              const scheduledItem = items.find((w) => w.status === "scheduled");
	              const primaryPlanned = scheduledItem ?? items[0] ?? null;
	              const cellState = hasCompleted
	                ? "completed"
	                : primaryPlanned
	                ? "planned"
	                : "empty";
	              const completedCount = items.filter((w) => w.status === "completed").length;
	              const scheduledCount = items.filter((w) => w.status === "scheduled").length;
	              const cellCount = cellState === "completed" ? completedCount : scheduledCount;
              return (
                <button
                  key={key}
                  type="button"
	                  style={{
	                    ...cal.cell,
	                    ...(isToday ? cal.today : {}),
	                    ...(cellState === "planned" ? cal.planned : {}),
	                    ...(cellState === "completed" ? cal.completed : {}),
	                  }}
	                  onClick={() => openDate(day)}
	                >
	                  <div style={cal.dateNum}>{day.getDate()}</div>
                  {cellCount > 0 && (
                    <div style={cal.cellCount}>{cellCount}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={s.block} className="sched-fade sched-delay-3">
        <div style={ux.card}>
          <button type="button" style={wl.headerBtn} onClick={() => setScheduledOpen((v) => !v)}>
            <div style={wl.headerLeft}>
              <ClipboardList size={18} strokeWidth={2.5} color="#0f172a" />
              <span style={wl.headerTitle}>Запланировано</span>
              <span style={wl.headerCount}>{upcomingPreview.length}</span>
            </div>
            <ChevronRight size={18} strokeWidth={2.2} color="rgba(15,23,42,0.4)" style={{ transform: scheduledOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 250ms ease" }} />
          </button>
          {scheduledOpen && <div style={wl.body}>
            {upcomingPreview.length === 0 ? (
              <div style={ux.cardHint}>
                Нет запланированных тренировок. Сохрани новую из генератора.
              </div>
            ) : (
              upcomingPreview.map((item, idx) => {
                const p: any = item.plan || {};
                const title = resolveWorkoutTitle(p);
                return (
                  <div key={item.id}>
                    {idx > 0 && <div style={wl.divider} />}
                    <div style={wl.row} onClick={() => openWorkout(item)}>
                      <div style={wl.name}>{title}</div>
                      <div style={wl.bottom}>
                        <div style={wl.chips}>
                          <span style={wl.chip}>
                            <Calendar size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            {fmtShortDate(item.scheduledFor)}
                          </span>
                          <span style={wl.chip}>
                            <Clock3 size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            {formatTime(item.scheduledFor)}
                          </span>
                        </div>
                        <Pencil size={14} strokeWidth={2} color="rgba(15,23,42,0.35)" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>}
        </div>
      </section>

      {completed.length > 0 && (
        <section style={s.block} className="sched-fade sched-delay-3">
          <div style={ux.card}>
            <button type="button" style={wl.headerBtn} onClick={() => setCompletedOpen((v) => !v)}>
              <div style={wl.headerLeft}>
                <CircleCheckBig size={18} strokeWidth={2.5} color="#0f172a" />
                <span style={wl.headerTitle}>Выполнено</span>
                <span style={wl.headerCount}>{completed.length}</span>
              </div>
              <ChevronRight size={18} strokeWidth={2.2} color="rgba(15,23,42,0.4)" style={{ transform: completedOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 250ms ease" }} />
            </button>
            {completedOpen && <div style={wl.body}>
              {completed.map((item, idx) => {
                const p: any = item.plan || {};
                const title = resolveWorkoutTitle(p);
                return (
                  <div key={item.id}>
                    {idx > 0 && <div style={wl.divider} />}
                    <div
                      style={wl.row}
                      onClick={() => {
                        if (item.resultSessionId) {
                          nav(`/workout/result?sessionId=${encodeURIComponent(item.resultSessionId)}`);
                        } else {
                          openWorkout(item);
                        }
                      }}
                    >
                      <div style={wl.name}>{title}</div>
                      <div style={wl.bottom}>
                        <div style={wl.chips}>
                          <span style={wl.chip}>
                            <Calendar size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            {fmtShortDate(item.scheduledFor)}
                          </span>
                          <span style={wl.chip}>
                            <Clock3 size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            {formatTime(item.scheduledFor)}
                          </span>
                        </div>
                        <span style={wl.arrow}>→</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>}
          </div>
        </section>
      )}

      <div style={{ height: 80 }} />

      {modal && (
        <ScheduleBottomSheet
          workout={modal.workout}
          selectedWorkoutId={modal.selectedWorkoutId}
          availableWorkouts={modal.allowScheduledPick ? assignableWorkouts : pendingWorkouts}
          date={modal.date}
          time={modal.time}
          saving={modal.saving}
          error={modal.error}
          onClose={() => {
            setModal(null);
            setReplaceConfirm(null);
          }}
          onDateTimeChange={(d, t) =>
            setModal((prev) => (prev ? { ...prev, date: d, time: t } : prev))
          }
          onSelectWorkout={(id) =>
            setModal((prev) => (prev ? { ...prev, selectedWorkoutId: id, error: null } : prev))
          }
          onSave={handleModalSave}
          onDelete={handleModalDelete}
          onStart={handleModalStart}
          onDetails={handleModalDetails}
          completedWorkouts={(plannedByDate[modal.date] || []).filter((w) => w.status === "completed")}
          scheduledWorkouts={(plannedByDate[modal.date] || []).filter((w) => w.status === "scheduled")}
          replaceConfirm={replaceConfirm}
          onReplaceConfirm={handleReplaceConfirm}
          onReplaceAdd={handleReplaceAdd}
          onReplaceCancel={() => { if (!modal?.saving) setReplaceConfirm(null); }}
        />
      )}
    </div>
  );
}

/* ===================== Bottom Sheet ===================== */

const SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const SHEET_ENTER_MS = 380;
const SHEET_EXIT_MS = 260;
const OPEN_TICK_MS = 12;
const CONTENT_ANIM_MS = 280;
const SPRING_CONTENT = "cubic-bezier(0.36, 0.66, 0.04, 1)";

const REMINDER_OPTIONS = [
  "За 1 час",
  "За 30 минут",
  "За 15 минут",
  "За 5 минут",
  "В момент события",
  "Не напоминать",
  "За 1 день",
];

function ScheduleBottomSheet({
  workout,
  selectedWorkoutId,
  availableWorkouts,
  date,
  time,
  saving,
  error,
  onClose,
  onDateTimeChange,
  onSelectWorkout,
  onSave,
  onDelete,
  onStart,
  onDetails,
  completedWorkouts,
  scheduledWorkouts,
  replaceConfirm,
  onReplaceConfirm,
  onReplaceAdd,
  onReplaceCancel,
}: {
  workout: PlannedWorkout | null;
  selectedWorkoutId: string | null;
  availableWorkouts: PlannedWorkout[];
  date: string;
  time: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onDateTimeChange: (date: string, time: string) => void;
  onSelectWorkout: (id: string) => void;
  onSave: (workoutId?: string) => void;
  onDelete: () => void;
  onStart: () => void;
  onDetails: (workoutId?: string) => void;
  completedWorkouts: PlannedWorkout[];
  scheduledWorkouts: PlannedWorkout[];
  replaceConfirm: ReplaceConfirmState | null;
  onReplaceConfirm: () => void;
  onReplaceAdd: () => void;
  onReplaceCancel: () => void;
}) {
  const [renderOpen, setRenderOpen] = useState(true);
  const [entered, setEntered] = useState(false);
  const enteredRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const animDoneTimerRef = useRef<number | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderValue, setReminderValue] = useState("За 1 час");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<PlannedWorkout | null>(null);
  const [addingWorkout, setAddingWorkout] = useState(false);
  const [savingMode, setSavingMode] = useState<"add" | "replace" | null>(null);
  const [slideDir, setSlideDir] = useState<"forward" | "backward">("forward");
  const [prevPage, setPrevPage] = useState<string | null>(null);
  const [pageAnimating, setPageAnimating] = useState(false);
  const pageTimerRef = useRef<number | null>(null);
  const canDelete = workout?.status === "scheduled";
  const needsPick = !workout;
  const readOnly = workout?.status === "completed";
  const canStart = workout?.status === "scheduled";
  const canDetails = workout?.status === "completed" && Boolean(workout?.resultSessionId);
  const hasScheduled = !workout && scheduledWorkouts.length > 0 && !editingWorkout && !selectedWorkoutId && !addingWorkout;

  const applyEntered = (v: boolean) => {
    enteredRef.current = v;
    setEntered(v);
  };

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
      if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
      if (animDoneTimerRef.current != null) window.clearTimeout(animDoneTimerRef.current);
      if (pageTimerRef.current != null) window.clearTimeout(pageTimerRef.current);
    };
  }, []);

  const goToPage = (direction: "forward" | "backward") => {
    if (pageTimerRef.current != null) window.clearTimeout(pageTimerRef.current);
    setPrevPage("snapshot");
    setSlideDir(direction);
    setPageAnimating(true);
    pageTimerRef.current = window.setTimeout(() => {
      setPrevPage(null);
      setPageAnimating(false);
      pageTimerRef.current = null;
    }, CONTENT_ANIM_MS + 20);
  };

  // Open animation: mount → 12ms tick → entered → animDone (remove transform)
  useEffect(() => {
    openTimerRef.current = window.setTimeout(() => {
      applyEntered(true);
      openTimerRef.current = null;
      // After enter animation completes, remove transform/willChange to restore momentum scrolling
      animDoneTimerRef.current = window.setTimeout(() => {
        setAnimDone(true);
        animDoneTimerRef.current = null;
      }, SHEET_ENTER_MS + 50);
    }, OPEN_TICK_MS);
  }, []);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setAnimDone(false);
    applyEntered(false);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, SHEET_EXIT_MS + 20);
  }, [closing, onClose]);

  const title = readOnly
    ? "Выполнено"
    : hasScheduled
      ? "Запланировано"
      : addingWorkout && !selectedWorkoutId
        ? "Добавить тренировку"
        : editingWorkout
          ? resolveWorkoutTitle(editingWorkout.plan || {})
          : needsPick && selectedWorkoutId
            ? resolveWorkoutTitle(availableWorkouts.find((aw) => aw.id === selectedWorkoutId)?.plan || {})
            : !needsPick
              ? resolveWorkoutTitle((workout as any)?.plan || {})
              : "Запланировать";

  return createPortal(
    <>
      {/* Overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2000,
          background: "rgba(10,16,28,0.52)",
          opacity: entered && !closing ? 1 : 0,
          transition: `opacity ${entered ? SHEET_ENTER_MS : SHEET_EXIT_MS}ms ease`,
        }}
        onClick={requestClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2001,
          borderRadius: "24px 24px 0 0",
          background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(242,242,247,0.95) 100%)",
          boxShadow: "0 -8px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
          maxHeight: "85vh",
          overflow: "visible",
          display: "flex",
          flexDirection: "column" as const,
          padding: "0 16px 16px",
          transform: animDone ? "none" : (entered && !closing ? "translateY(0)" : "translateY(100%)"),
          transition: animDone ? "none" : `transform ${entered && !closing ? SHEET_ENTER_MS : SHEET_EXIT_MS}ms ${entered && !closing ? SPRING_OPEN : SPRING_CLOSE}`,
          willChange: animDone ? "auto" : "transform",
        }}
      >
        <style>{`
          @keyframes sh-in-right { from { opacity: 0; transform: translate3d(44px, 0, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
          @keyframes sh-in-left { from { opacity: 0; transform: translate3d(-44px, 0, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
          @keyframes sh-out-left { from { opacity: 1; transform: translate3d(0, 0, 0); } to { opacity: 0; transform: translate3d(-44px, 0, 0); } }
          @keyframes sh-out-right { from { opacity: 1; transform: translate3d(0, 0, 0); } to { opacity: 0; transform: translate3d(44px, 0, 0); } }
        `}</style>

        {/* Grabber */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px", flexShrink: 0 }}>
          <div
            style={{
              width: 46,
              height: 5,
              borderRadius: 999,
              background: "rgba(15,23,42,0.18)",
            }}
          />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: `0 8px ${(confirmDelete || replaceConfirm) ? 0 : 8}px`, flexShrink: 0 }}>
          {(!confirmDelete && !replaceConfirm && (editingWorkout || addingWorkout || (needsPick && selectedWorkoutId))) ? (
            <button
              type="button"
              onClick={() => {
                if (editingWorkout) {
                  // Restore date and clear selectedWorkoutId so hasScheduled shows correctly
                  onDateTimeChange(toDateInput(editingWorkout.scheduledFor), toTimeInput(editingWorkout.scheduledFor));
                  onSelectWorkout("");
                  setEditingWorkout(null);
                } else if (addingWorkout) {
                  setAddingWorkout(false);
                  onSelectWorkout("");
                } else {
                  onSelectWorkout("");
                }
                goToPage("backward");
              }}
              aria-label="Назад"
              style={{
                width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "transparent", borderRadius: 999,
                color: "rgba(15,23,42,0.62)", cursor: "pointer", padding: 0, flexShrink: 0,
              }}
            >
              <ArrowLeft size={18} strokeWidth={2.2} />
            </button>
          ) : (
            <div style={{ width: 32, flexShrink: 0 }} />
          )}
          {(!confirmDelete && !replaceConfirm) ? (
            <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: "#0f172a", lineHeight: 1.25, textAlign: "center" as const }}>
              {title}
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            style={{
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              borderRadius: 999,
              color: "rgba(15,23,42,0.62)",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ display: "grid", flex: 1, minHeight: 0, overflow: pageAnimating ? "hidden" : "visible" }}>
          {pageAnimating && prevPage ? (
            <div style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column" as const, animation: `${slideDir === "forward" ? "sh-out-left" : "sh-out-right"} ${CONTENT_ANIM_MS}ms ${SPRING_CONTENT} both`, pointerEvents: "none" as const }} />
          ) : null}
          <div style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column" as const, ...(pageAnimating ? { animation: `${slideDir === "forward" ? "sh-in-right" : "sh-in-left"} ${CONTENT_ANIM_MS}ms ${SPRING_CONTENT} both` } : null) }}>
        {readOnly ? (
          <>
            {/* Completed workouts list */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", flexShrink: 1, minHeight: 0, padding: "8px 18px" }}>
              {completedWorkouts.map((w, idx) => {
                const p: any = w.plan || {};
                const title = resolveWorkoutTitle(p);
                return (
                  <div key={w.id}>
                    {idx > 0 && <div style={sh.sheetDivider} />}
                    <div style={sh.sheetRow} onClick={() => onDetails(w.id)}>
                      <div style={sh.sheetRowName}>{title}</div>
                      <div style={sh.sheetRowBottom}>
                        <div style={sh.sheetRowChips}>
                          <span style={sh.sheetRowChip}>
                            <Calendar size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            {fmtShortDate(w.scheduledFor)}
                          </span>
                          <span style={sh.sheetRowChip}>
                            <Clock3 size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            {formatTime(w.scheduledFor)}
                          </span>
                        </div>
                        <span style={sh.sheetRowArrow}>→</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : hasScheduled ? (
          <>
            {/* Scheduled workouts list */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", flexShrink: 1, minHeight: 0, padding: "8px 18px" }}>
              {scheduledWorkouts.map((w, idx) => {
                const p: any = w.plan || {};
                const title = resolveWorkoutTitle(p);
                return (
                  <div key={w.id}>
                    {idx > 0 && <div style={sh.sheetDivider} />}
                    <div style={sh.sheetRow}>
                      <div style={sh.sheetRowName}>{title}</div>
                      <div style={sh.sheetRowBottom}>
                        <div style={sh.sheetRowChips}>
                          <span style={sh.sheetRowChip}>
                            <Calendar size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            {fmtShortDate(w.scheduledFor)}
                          </span>
                          <span style={sh.sheetRowChip}>
                            <Clock3 size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                            {formatTime(w.scheduledFor)}
                          </span>
                        </div>
                        <Pencil size={18} strokeWidth={2} color="#1e1f22" style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => { setEditingWorkout(w); goToPage("forward"); }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Add workout button */}
              {availableWorkouts.length > 0 && (
                <>
                  <div style={sh.sheetDivider} />
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button
                      type="button"
                      style={sh.addWorkoutBtn}
                      onClick={() => { setAddingWorkout(true); goToPage("forward"); }}
                    >
                      <Plus size={22} strokeWidth={2.2} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : addingWorkout && !selectedWorkoutId ? (
          <>
            {/* Adding workout to a date with existing scheduled workouts */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", flexShrink: 1, minHeight: 0, padding: "8px 18px" }}>
              {availableWorkouts.length ? (
                availableWorkouts.map((w, idx) => {
                  const p: any = w.plan || {};
                  const label = resolveWorkoutTitle(p);
                  return (
                    <div key={w.id}>
                      {idx > 0 && <div style={sh.sheetDivider} />}
                      <div style={sh.sheetRow} onClick={() => { onSelectWorkout(w.id); goToPage("forward"); }}>
                        <div style={sh.sheetRowName}>{label}</div>
                        <div style={sh.sheetRowBottom}>
                          <div style={sh.sheetRowChips}>
                            <span style={sh.sheetRowChip}>
                              <Calendar size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                              Дата
                            </span>
                            <span style={sh.sheetRowChip}>
                              <Clock3 size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                              Время
                            </span>
                          </div>
                          <Pencil size={18} strokeWidth={2} color="#1e1f22" />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(15,23,42,0.55)", padding: "10px 0" }}>
                  Все тренировки уже запланированы. Выполните текущие, чтобы сгенерировать новый план.
                </div>
              )}
            </div>
          </>
        ) : replaceConfirm ? (
          <>
            {/* Replace confirm view */}
            <div style={sh.confirmWrap}>
              <p style={sh.confirmBody}>
                {replaceConfirm.timeConflict
                  ? <>На это время уже запланирована тренировка «{replaceConfirm.conflictTitle}». Заменить на «{replaceConfirm.targetTitle}»?</>
                  : <>На эту дату уже запланирована тренировка «{replaceConfirm.conflictTitle}». Вы хотите добавить «{replaceConfirm.targetTitle}» или заменить?</>
                }
              </p>
              <div style={sh.confirmButtonGroup}>
                {!replaceConfirm.timeConflict && (
                  <>
                    <button type="button" style={sh.confirmBtnCancel} onClick={() => { setSavingMode("add"); onReplaceAdd(); }} disabled={saving}>
                      <Plus size={18} strokeWidth={2.2} />
                      {saving && savingMode === "add" ? "Сохраняем..." : "Добавить"}
                    </button>
                    <div style={sh.confirmDividerBtn} />
                  </>
                )}
                <button type="button" style={sh.confirmBtnCancel} onClick={() => { setSavingMode("replace"); onReplaceConfirm(); }} disabled={saving}>
                  <RefreshCw size={18} strokeWidth={2.2} />
                  {saving && savingMode === "replace" ? "Сохраняем..." : "Заменить"}
                </button>
                <div style={sh.confirmDividerBtn} />
                <button type="button" style={sh.confirmBtnDanger} onClick={onReplaceCancel} disabled={saving}>
                  <X size={18} strokeWidth={2.2} />
                  Отмена
                </button>
              </div>
            </div>
          </>
        ) : confirmDelete ? (
          <>
            {/* Confirm delete view */}
            <div style={sh.confirmWrap}>
              <p style={sh.confirmBody}>
                Удалить тренировку «{title}»?
              </p>
              <div style={sh.confirmButtonGroup}>
                <button type="button" style={sh.confirmBtnDanger} onClick={onDelete}>
                  <Trash2 size={18} strokeWidth={2.2} />
                  Удалить
                </button>
                <div style={sh.confirmDividerBtn} />
                <button type="button" style={sh.confirmBtnCancel} onClick={() => { setConfirmDelete(false); goToPage("backward"); }}>
                  <X size={18} strokeWidth={2.2} />
                  Отмена
                </button>
              </div>
            </div>
          </>
        ) : editingWorkout ? (
          <>
            {/* Edit scheduled workout */}
            <DateTimeWheelInline
              initialDate={date}
              initialTime={toTimeInput(editingWorkout.scheduledFor)}
              onChange={onDateTimeChange}
            />

            <div style={sh.reminderWrap}>
              <button type="button" style={sh.reminderRow} onClick={() => setReminderOpen((v) => !v)}>
                <span style={sh.reminderLabel}>🔔 Напомнить</span>
                <span style={sh.reminderValue}>
                  <span>{reminderValue}</span>
                  <span style={sh.reminderChevrons}><span>▴</span><span>▾</span></span>
                </span>
              </button>
              {reminderOpen ? (
                <div style={sh.reminderList}>
                  {REMINDER_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      style={{ ...sh.reminderOption, ...(opt === reminderValue ? sh.reminderOptionActive : null) }}
                      onClick={() => { setReminderValue(opt); setReminderOpen(false); }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={sh.actionWrap}>
              <button
                type="button"
                className="intro-primary-btn ws-primary-btn"
                style={{ ...sh.primaryBtn, opacity: saving ? 0.5 : 1 }}
                onClick={() => onSave(editingWorkout.id)}
                disabled={saving}
              >
                <span style={sh.primaryBtnLabel}>{saving ? "Сохраняем..." : "Сохранить"}</span>
                <span style={sh.primaryBtnCircle}><span style={sh.primaryBtnCheck}>✓</span></span>
              </button>
              <button type="button" style={sh.deleteBtnRow} onClick={() => { onSelectWorkout(editingWorkout.id); setConfirmDelete(true); goToPage("forward"); }}>
                Удалить
              </button>
            </div>
          </>
        ) : needsPick && selectedWorkoutId ? (
          <>
            {/* Scheduling view — scrollers + save */}
            <DateTimeWheelInline
              initialDate={date}
              initialTime={time}
              onChange={onDateTimeChange}
            />

            <div style={sh.reminderWrap}>
              <button type="button" style={sh.reminderRow} onClick={() => setReminderOpen((v) => !v)}>
                <span style={sh.reminderLabel}>🔔 Напомнить</span>
                <span style={sh.reminderValue}>
                  <span>{reminderValue}</span>
                  <span style={sh.reminderChevrons}><span>▴</span><span>▾</span></span>
                </span>
              </button>
              {reminderOpen ? (
                <div style={sh.reminderList}>
                  {REMINDER_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      style={{ ...sh.reminderOption, ...(opt === reminderValue ? sh.reminderOptionActive : null) }}
                      onClick={() => { setReminderValue(opt); setReminderOpen(false); }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {error && <div style={sh.error}>{error}</div>}

            <div style={sh.actionWrap}>
              <button
                type="button"
                className="intro-primary-btn ws-primary-btn"
                style={{ ...sh.primaryBtn, opacity: saving ? 0.5 : 1 }}
                onClick={() => onSave()}
                disabled={saving}
              >
                <span style={sh.primaryBtnLabel}>{saving ? "Сохраняем..." : "Сохранить"}</span>
                <span style={sh.primaryBtnCircle}><span style={sh.primaryBtnCheck}>✓</span></span>
              </button>
            </div>
          </>
        ) : !needsPick && workout?.status === "scheduled" ? (
          <>
            {/* Direct scheduled workout view — scrollers + save/delete */}
            <DateTimeWheelInline
              initialDate={date}
              initialTime={time}
              onChange={onDateTimeChange}
            />

            <div style={sh.reminderWrap}>
              <button type="button" style={sh.reminderRow} onClick={() => setReminderOpen((v) => !v)}>
                <span style={sh.reminderLabel}>🔔 Напомнить</span>
                <span style={sh.reminderValue}>
                  <span>{reminderValue}</span>
                  <span style={sh.reminderChevrons}><span>▴</span><span>▾</span></span>
                </span>
              </button>
              {reminderOpen ? (
                <div style={sh.reminderList}>
                  {REMINDER_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      style={{ ...sh.reminderOption, ...(opt === reminderValue ? sh.reminderOptionActive : null) }}
                      onClick={() => { setReminderValue(opt); setReminderOpen(false); }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {error && <div style={sh.error}>{error}</div>}

            <div style={sh.actionWrap}>
              <button
                type="button"
                className="intro-primary-btn ws-primary-btn"
                style={{ ...sh.primaryBtn, opacity: saving ? 0.5 : 1 }}
                onClick={() => onSave(workout.id)}
                disabled={saving}
              >
                <span style={sh.primaryBtnLabel}>{saving ? "Сохраняем..." : "Сохранить"}</span>
                <span style={sh.primaryBtnCircle}><span style={sh.primaryBtnCheck}>✓</span></span>
              </button>
              <button
                type="button"
                style={sh.deleteBtnRow}
                onClick={() => { onSelectWorkout(workout.id); setConfirmDelete(true); goToPage("forward"); }}
              >
                Удалить
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Workout pick list — no scrollers, just list */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", flexShrink: 1, minHeight: 0, padding: "8px 18px" }}>
              {availableWorkouts.length ? (
                availableWorkouts.map((w, idx) => {
                  const p: any = w.plan || {};
                  const label = resolveWorkoutTitle(p);
                  return (
                    <div key={w.id}>
                      {idx > 0 && <div style={sh.sheetDivider} />}
                      <div style={sh.sheetRow} onClick={() => { onSelectWorkout(w.id); goToPage("forward"); }}>
                        <div style={sh.sheetRowName}>{label}</div>
                        <div style={sh.sheetRowBottom}>
                          <div style={sh.sheetRowChips}>
                            <span style={sh.sheetRowChip}>
                              <Calendar size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                              Дата
                            </span>
                            <span style={sh.sheetRowChip}>
                              <Clock3 size={14} strokeWidth={2.2} color="rgba(15,23,42,0.62)" />
                              Время
                            </span>
                          </div>
                          <Pencil size={18} strokeWidth={2} color="#1e1f22" />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(15,23,42,0.55)", padding: "10px 0" }}>
                  Все тренировки уже запланированы. Выполните текущие, чтобы сгенерировать новый план.
                </div>
              )}
            </div>

            {error && <div style={sh.error}>{error}</div>}
          </>
        )}

          </div>
        </div>

        {/* Safe area spacer */}
        <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </div>

    </>,
    document.body
  );
}

function Loader() {
  return (
    <div style={{ ...s.page, display: "grid", placeItems: "center" }}>
      <style>{`
        .sched-loader{display:flex;gap:10px;align-items:center;justify-content:center}
        .sched-loader span{width:10px;height:10px;border-radius:50%;background:#111;animation:schedPulse 1s ease-in-out infinite}
        .sched-loader span:nth-child(2){animation-delay:.15s}
        .sched-loader span:nth-child(3){animation-delay:.3s}
        @keyframes schedPulse{0%,100%{transform:scale(.7);opacity:.35}50%{transform:scale(1);opacity:1}}
      `}</style>
      <div className="sched-loader"><span /><span /><span /></div>
    </div>
  );
}

function ErrorView({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={s.page}>
      <section style={s.glassCard}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{msg}</h3>
        <button style={s.rowBtn} onClick={onRetry}>
          Обновить
        </button>
      </section>
    </div>
  );
}


function normalizePlanned(list: PlannedWorkout[] | undefined): PlannedWorkout[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => {
      if (!item || !item.id) return false;
      if (item.status === "cancelled") return false;
      // Pending workouts may not have a scheduled time yet; keep them for picking.
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

function mergePlanned(list: PlannedWorkout[], updated: PlannedWorkout) {
  const filtered = list.filter((w) => w.id !== updated.id);
  if (updated.status === "cancelled") return filtered;
  filtered.push(updated);
  return filtered.sort(
    (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
  );
}

function groupByDate(list: PlannedWorkout[]) {
  const map: Record<string, PlannedWorkout[]> = {};
  list.filter((item) => item.status !== "pending").forEach((item) => {
    const key = toDateKey(new Date(item.scheduledFor));
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  Object.values(map).forEach((items) =>
    items.sort(
      (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
    )
  );
  return map;
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDateInput(iso: string) {
  const dt = new Date(iso);
  return toDateKey(dt);
}

function toTimeInput(iso: string) {
  const dt = new Date(iso);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function parseLocalDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const when = new Date(`${date}T${time}`);
  return Number.isFinite(when.getTime()) ? when : null;
}

function stripTime(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMonths(date: Date, offset: number) {
  const x = new Date(date);
  x.setMonth(x.getMonth() + offset);
  return x;
}

function daysInMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
}

function buildMonthGrid(monthDate: Date): (Date | null)[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const total = daysInMonth(monthDate);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtFullDate(iso: string) {
  const dt = parseIsoDate(iso);
  return dt.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function fmtShortDate(iso: string) {
  const dt = parseIsoDate(iso);
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function parseIsoDate(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  }
  return new Date(iso);
}

function formatTime(iso: string) {
  const dt = new Date(iso);
  return dt.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const s: Record<string, CSSProperties> = {
  page: {
    maxWidth: 760,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui,-apple-system,'Inter','Roboto',Segoe UI",
    background: "transparent",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  // Avatar Header
  avatarHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  avatarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flex: "0 0 auto",
    padding: 2,
  },
  mascotAvatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center 10%",
    borderRadius: 999,
  },
  avatarText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  avatarTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1e1f22",
    lineHeight: 1.2,
  },
  avatarSub: {
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.4,
    color: "rgba(30, 31, 34, 0.7)",
  },

  // Calendar navigation
  calNav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
  },
  calNavBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: "none",
    padding: "6px 4px",
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.62)",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  } as CSSProperties,
  calNavCurrent: {
    fontSize: 16,
    fontWeight: 700,
    color: "#1e1f22",
    textTransform: "capitalize",
  } as CSSProperties,

  // Blocks
  block: {
    padding: 0,
    borderRadius: 24,
    background: "transparent",
    boxShadow: "none",
  },

  // Glass card (for loader/error)
  glassCard: {
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.75)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  // Row button (dark pill)
  rowBtn: {
    border: "1px solid #1e1f22",
    padding: "0 14px",
    height: 36,
    borderRadius: 999,
    fontWeight: 600,
    fontSize: 13,
    color: "#fff",
    background: "#1e1f22",
    cursor: "pointer",
    whiteSpace: "nowrap",
    lineHeight: 1,
  },
};

const ux: Record<string, CSSProperties> = {
  card: {
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.75)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    position: "relative",
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "14px 16px",
  },
  cardTitle: { fontSize: 16, fontWeight: 700, color: "#1e1f22", lineHeight: 1.2 },
  cardHint: { fontSize: 12, color: "rgba(15,23,42,0.55)", fontWeight: 400 },
  iconInline: { width: 24, height: 24, display: "grid", placeItems: "center", fontSize: 18 },
};

const cal: Record<string, CSSProperties> = {
  headerRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7,1fr)",
    gap: 6,
    padding: "6px 14px 0",
  },
  headerCell: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.62)",
    lineHeight: 1,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7,1fr)",
    gap: 6,
    padding: "10px 14px 14px",
  },
  cell: {
    border: "1px solid rgba(255,255,255,0.75)",
    borderRadius: 14,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    padding: "7px 7px 28px",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 3,
    cursor: "pointer",
    minHeight: 72,
    height: 72,
    boxShadow: "0 4px 8px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
    overflow: "hidden",
    position: "relative",
  },
  today: {},
  planned: {
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    border: "1px solid rgba(255,255,255,0.78)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
  },
  completed: {
    background: "linear-gradient(180deg, rgba(196,228,178,0.5) 0%, rgba(170,210,146,0.55) 100%)",
    border: "1px solid rgba(150,190,130,0.4)",
    boxShadow: "inset 0 2px 3px rgba(78,122,58,0.12), inset 0 -1px 0 rgba(255,255,255,0.22)",
  },
  dateNum: { fontSize: 13, fontWeight: 700, color: "#1e1f22", lineHeight: 1 },
  workoutTag: {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: 0.1,
    color: "rgba(15,23,42,0.55)",
    marginTop: -1,
    pointerEvents: "none",
    lineHeight: 1.1,
  },
  timeText: {
    position: "absolute",
    left: 7,
    right: 7,
    bottom: 5,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    color: "rgba(15,23,42,0.55)",
    gap: 0,
    textAlign: "left",
    pointerEvents: "none",
  },
  timeTextPlanned: {
    color: "rgba(15,23,42,0.65)",
  },
  timeLineTop: {
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1,
  },
  timeLineBottom: {
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1,
    marginTop: 1,
  },
  cellCount: {
    position: "absolute",
    right: 7,
    bottom: 5,
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(15,23,42,0.45)",
  },
};

const wl: Record<string, CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "18px 18px 0",
  },
  headerBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "18px 18px 0",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  headerCount: {
    fontSize: 14,
    fontWeight: 600,
    color: "rgba(15,23,42,0.4)",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.2,
  },
  body: {
    padding: "14px 18px 18px",
  },
  divider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    margin: "12px 0",
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  } as CSSProperties,
  name: {
    fontSize: 15,
    fontWeight: 600,
    color: "#1e1f22",
    lineHeight: 1.25,
  },
  bottom: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  } as CSSProperties,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.62)",
    lineHeight: 1.45,
  },
  arrow: {
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.62)",
    flexShrink: 0,
  } as CSSProperties,
};

const sh: Record<string, CSSProperties> = {
  // Workout pick rows
  pickRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    padding: "14px 24px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  },
  pickName: {
    fontSize: 18,
    fontWeight: 500,
    color: "#1e1f22",
    lineHeight: 1.3,
    flex: 1,
    minWidth: 0,
  },
  pickChip: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  pickChipActive: {
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "linear-gradient(180deg, rgba(196,228,178,0.34) 0%, rgba(170,210,146,0.42) 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.12), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  pickDivider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    marginLeft: 24,
  },
  // Reminder
  reminderWrap: {
    width: "100%",
    alignSelf: "stretch",
    position: "relative",
    overflow: "visible",
    display: "grid",
    gap: 8,
    marginTop: -4,
    marginBottom: 0,
  },
  reminderRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    background: "transparent",
    border: "none",
    padding: "16px 18px",
  },
  reminderLabel: {
    fontSize: 18,
    fontWeight: 600,
    color: "#1e1f22",
  },
  reminderValue: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 18,
    fontWeight: 500,
    color: "rgba(30,31,34,0.75)",
  },
  reminderChevrons: {
    display: "grid",
    fontSize: 12,
    lineHeight: 0.8,
    color: "rgba(30,31,34,0.55)",
    textAlign: "center",
  },
  reminderList: {
    position: "absolute",
    right: 0,
    left: "auto",
    transform: "none",
    bottom: "calc(100% + 4px)",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.65)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(245,245,250,0.4) 100%)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.35)",
    overflow: "hidden",
    zIndex: 7,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    width: "auto",
    maxWidth: "calc(100vw - 48px)",
  },
  reminderOption: {
    width: "100%",
    padding: "12px 16px",
    border: "none",
    background: "transparent",
    fontSize: 16,
    fontWeight: 500,
    color: "#1e1f22",
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  reminderOptionActive: {
    background: "rgba(30,31,34,0.06)",
    fontWeight: 600,
  },
  // Action buttons
  actionWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "24px 0 4px",
    flexShrink: 0,
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    height: 50,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  primaryBtnLabel: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1,
    color: "#fff",
  },
  primaryBtnCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
    color: "#0f172a",
  },
  primaryBtnCheck: {
    fontSize: 18,
    lineHeight: 1,
    color: "#1e1f22",
    fontWeight: 700,
    textShadow: "0 1px 0 rgba(255,255,255,0.82), 0 -1px 0 rgba(15,23,42,0.15)",
  },
  primaryBtnArrow: {
    fontSize: 18,
    lineHeight: 1,
    color: "#0f172a",
    fontWeight: 700,
  },
  pickRowWl: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    padding: 0,
  },
  scheduledRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 24px",
  },
  scheduledChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  scheduledChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.62)",
    lineHeight: 1.45,
  },
  scheduledEditBtn: {
    width: 36,
    height: 36,
    display: "grid",
    placeItems: "center",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: 999,
    flexShrink: 0,
  },
  sheetRow: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  },
  sheetRowName: {
    fontSize: 18,
    fontWeight: 500,
    color: "#1e1f22",
    lineHeight: 1.3,
  },
  sheetRowBottom: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetRowChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
  },
  sheetRowChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.62)",
    lineHeight: 1.45,
  },
  sheetRowArrow: {
    fontSize: 18,
    fontWeight: 500,
    color: "#1e1f22",
    flexShrink: 0,
  },
  sheetDivider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    margin: "12px 0",
  },
  addWorkoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "rgba(15,23,42,0.45)",
  },
  deleteBtnRow: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 500,
    color: "#b42318",
    opacity: 0.8,
    padding: "8px 16px",
    borderRadius: 999,
    WebkitTapHighlightColor: "transparent",
  },
  // Confirm views (delete / replace)
  confirmWrap: {
    display: "flex",
    flexDirection: "column" as const,
    padding: "0px 0px 8px",
  },
  confirmBody: {
    fontSize: 15,
    color: "rgba(15,23,42,0.55)",
    lineHeight: 1.45,
    textAlign: "center" as const,
    padding: "16px 16px 20px",
    margin: 0,
  },
  confirmButtonGroup: {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
  },
  confirmBtnDanger: {
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
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "flex-start" as const,
    gap: 16,
    color: "#b42318",
    opacity: 0.8,
    WebkitTapHighlightColor: "transparent",
  },
  confirmBtnCancel: {
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
    flexDirection: "row" as const,
    alignItems: "center",
    justifyContent: "flex-start" as const,
    gap: 16,
    color: "#1e1f22",
    WebkitTapHighlightColor: "transparent",
  },
  confirmDivider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
  },
  confirmDividerBtn: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    marginLeft: 16,
  },
  error: {
    background: "rgba(239,68,68,0.08)",
    color: "#b42318",
    fontSize: 13,
    fontWeight: 600,
    padding: "10px 12px",
    borderRadius: 14,
    marginTop: 8,
  },
};

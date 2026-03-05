import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, CircleCheckBig, Calendar, Clock3, Check, ChevronRight, Trash2, Pencil, Dumbbell, ArrowLeft } from "lucide-react";
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
import ScheduleReplaceConfirmModal from "@/components/ScheduleReplaceConfirmModal";
import DateTimeWheelInline from "@/components/DateTimeWheelInline";
import mascotImg from "@/assets/robonew.webp";
import tyagaImg from "@/assets/tyaga.webp";
import zhimImg from "@/assets/zhim.webp";
import nogiImg from "@/assets/nogi.webp";
import sredneImg from "@/assets/sredne.webp";

const dayLabelRU = (label: string) => {
  const v = String(label || "").toLowerCase();
  if (v.includes("push") || v.includes("пуш") || v.includes("жим")) return "Грудь, плечи и трицепс";
  if (v.includes("pull") || v.includes("пул") || v.includes("тяг")) return "Спина и бицепс";
  if (v.includes("leg") || v.includes("ног")) return "Ноги и ягодицы";
  if (v.includes("upper") || v.includes("верх")) return "Верхняя часть тела";
  if (v.includes("lower") || v.includes("низ")) return "Нижняя часть тела";
  if (v.includes("full")) return "Всё тело";
  if (v.includes("recovery") || v.includes("восстанов")) return "Восстановление";
  return label || "Тренировка";
};

const dayCodeShort = (label: string) => {
  const v = String(label || "").toLowerCase();
  if (v.includes("push") || v.includes("пуш") || v.includes("жим")) return "жим";
  if (v.includes("pull") || v.includes("пул") || v.includes("тяг")) return "тяга";
  if (v.includes("leg") || v.includes("ног")) return "ноги";
  if (v.includes("upper") || v.includes("верх")) return "верх";
  if (v.includes("lower") || v.includes("низ")) return "низ";
  if (v.includes("full")) return "всё";
  if (v.includes("recovery") || v.includes("восстанов")) return "восст";
  return "";
};

const isValidTime = (value: string) => /^\d{2}:\d{2}$/.test(value);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MASCOT_SRC = mascotImg;

const STACK_OFFSET = 66;
const STACK_COLLAPSED_H = 104;
const STACK_ACTIVE_H = 224;

const dayMascotForLabel = (label: string) => {
  const v = String(label || "").toLowerCase();
  if (v.includes("push") || v.includes("пуш") || v.includes("жим") || v.includes("груд")) return zhimImg;
  if (v.includes("pull") || v.includes("пул") || v.includes("тяг") || v.includes("спин")) return tyagaImg;
  if (v.includes("leg") || v.includes("ног") || v.includes("ягод")) return nogiImg;
  return sredneImg;
};

const formatScheduledDateChip = (iso: string) => {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  const date = dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  const time = dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
};
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

  const handleModalSave = async () => {
    if (!modal) return;
    const { workout, date, time, selectedWorkoutId, allowScheduledPick } = modal;
    if (workout?.status === "completed") return;
    const candidatePool = allowScheduledPick ? assignableWorkouts : pendingWorkouts;
    const effectiveWorkout =
      workout ?? candidatePool.find((w) => w.id === selectedWorkoutId) ?? planned.find((w) => w.id === selectedWorkoutId) ?? null;
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
      const targetPlan: any = effectiveWorkout.plan || {};
      const conflictPlan: any = conflict.plan || {};
      const targetTitle = dayLabelRU(String(targetPlan.dayLabel || targetPlan.title || "Тренировка"));
      const conflictTitle = dayLabelRU(String(conflictPlan.dayLabel || conflictPlan.title || "Тренировка"));
      setReplaceConfirm({
        targetWorkoutId: effectiveWorkout.id,
        targetTitle,
        conflictTitle,
        date,
        time,
      });
      return;
    }

    await performModalSave(effectiveWorkout.id, date, time);
  };

  const performModalSave = async (targetWorkoutId: string, date: string, time: string) => {
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
    await performModalSave(replaceConfirm.targetWorkoutId, replaceConfirm.date, replaceConfirm.time);
  };

  const handleModalDelete = async () => {
    if (!modal) return;
    const workoutId = modal.workout?.id;
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
	              const plannedTag = (() => {
	                const tagItem = scheduledItem ?? completedItem;
	                if (!tagItem) return "";
	                const p: any = tagItem.plan || {};
	                const raw = String(p.dayLabel || p.title || ""); 
	                return dayCodeShort(raw);
	              })();
	              let displayTime = primaryPlanned ? formatTime(primaryPlanned.scheduledFor) : null;
	              let extraCount = primaryPlanned ? Math.max(items.length - 1, 0) : 0;
	              const cellState = hasCompleted
	                ? "completed"
	                : primaryPlanned
	                ? "planned"
	                : "empty";
	              if (cellState === "completed") {
	                displayTime = null;
	                extraCount = 0;
	              }
	              const showTime = displayTime && cellState === "planned";
	              const timeStyle =
	                cellState === "planned"
	                  ? { ...cal.timeText, ...cal.timeTextPlanned }
	                  : null;
              const [timeHours, timeMinutes] = displayTime ? displayTime.split(":") : ["", ""];
              const timeTop = timeHours ? `${timeHours}:` : "";
              const timeBottom = timeMinutes ?? "";
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
	                  {(cellState === "planned" || cellState === "completed") && plannedTag ? (
	                    <div style={cal.workoutTag}>{plannedTag}</div>
	                  ) : null}
	                  {showTime && timeStyle && (
	                    <div style={timeStyle}>
	                      <span style={cal.timeLineTop}>{timeTop}</span>
	                      <span style={cal.timeLineBottom}>{timeBottom}</span>
	                    </div>
	                  )}
                  {cellState === "completed" && (
                    <div style={cal.checkMark}>✓</div>
                  )}
                  {extraCount > 0 ? (
                    <div style={cal.countBadge}>+{extraCount}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={s.block} className="sched-fade sched-delay-3">
        <div style={ux.card}>
          <div style={wl.header}>
            <ClipboardList size={18} strokeWidth={2.5} color="#0f172a" />
            <span style={wl.headerTitle}>Запланировано</span>
          </div>
          <div style={wl.body}>
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
          </div>
        </div>
      </section>

      {completed.length > 0 && (
        <section style={s.block} className="sched-fade sched-delay-3">
          <div style={ux.card}>
            <div style={wl.header}>
              <CircleCheckBig size={18} strokeWidth={2.5} color="#0f172a" />
              <span style={wl.headerTitle}>Выполнено</span>
            </div>
            <div style={wl.body}>
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
            </div>
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
        />
      )}
      {replaceConfirm ? (
        <ScheduleReplaceConfirmModal
          message={`На эту дату уже стоит тренировка «${replaceConfirm.conflictTitle}». Заменить ее на «${replaceConfirm.targetTitle}»?`}
          busy={Boolean(modal?.saving)}
          onConfirm={handleReplaceConfirm}
          onCancel={() => {
            if (modal?.saving) return;
            setReplaceConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* ===================== Bottom Sheet ===================== */

const SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const SHEET_ENTER_MS = 380;
const SHEET_EXIT_MS = 260;
const OPEN_TICK_MS = 12;

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
  onSave: () => void;
  onDelete: () => void;
  onStart: () => void;
  onDetails: (workoutId?: string) => void;
  completedWorkouts: PlannedWorkout[];
  scheduledWorkouts: PlannedWorkout[];
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
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedCompletedCardId, setSelectedCompletedCardId] = useState<string | null>(null);
  const [selectedScheduledCardId, setSelectedScheduledCardId] = useState<string | null>(null);
  const canDelete = workout?.status === "scheduled";
  const needsPick = !workout;
  const readOnly = workout?.status === "completed";
  const canStart = workout?.status === "scheduled";
  const canDetails = workout?.status === "completed" && Boolean(workout?.resultSessionId);
  const hasScheduled = !workout && scheduledWorkouts.length > 0 && !editingWorkoutId;
  const editingScheduled = editingWorkoutId ? scheduledWorkouts.find((w) => w.id === editingWorkoutId) ?? null : null;

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
    };
  }, []);

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
      : editingScheduled
        ? (() => {
            const p: any = editingScheduled.plan || {};
            return dayLabelRU(String(p.dayLabel || p.title || "Тренировка"));
          })()
        : !needsPick
          ? (() => {
              const p: any = (workout as any)?.plan || {};
              return dayLabelRU(String(p.dayLabel || p.title || "Тренировка"));
            })()
          : selectedWorkoutId
            ? (() => {
                const sw = availableWorkouts.find((w) => w.id === selectedWorkoutId);
                if (!sw) return "Запланировать";
                const p: any = sw.plan || {};
                return dayLabelRU(String(p.dayLabel || p.title || "Тренировка"));
              })()
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
        <div style={{ display: "flex", alignItems: "center", padding: "0 8px 8px", flexShrink: 0 }}>
          {(editingScheduled || (needsPick && selectedWorkoutId)) ? (
            <button
              type="button"
              onClick={() => editingScheduled ? setEditingWorkoutId(null) : onSelectWorkout("")}
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
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 16, fontWeight: 600, color: "#0f172a", lineHeight: 1.2 }}>
            {readOnly ? <CircleCheckBig size={16} strokeWidth={2.5} /> : (hasScheduled || editingScheduled || needsPick) ? <ClipboardList size={16} strokeWidth={2.5} /> : null}
            {title}
          </div>
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

        {readOnly ? (
          <>
            <style>{`
              .sh-stack-card { -webkit-tap-highlight-color: transparent; transition: transform 220ms ease, box-shadow 220ms ease; will-change: transform; }
              .sh-stack-card:active:not(:disabled) { transform: translateY(1px) scale(0.98); }
              .sh-primary-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; transition: transform 160ms ease, background-color 160ms ease; }
              .sh-primary-btn:active:not(:disabled) { transform: translateY(1px) scale(0.99) !important; background-color: #1e1f22 !important; }
            `}</style>
            {/* Completed workouts — stacked cards */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", flexShrink: 1, minHeight: 0, padding: "8px 0 20px" }}>
              {(() => {
                const cards = completedWorkouts;
                const activeIdx = cards.findIndex((w) => w.id === selectedCompletedCardId);
                const stackOrder = cards.map((_, i) => i);
                if (activeIdx >= 0) { stackOrder.splice(stackOrder.indexOf(activeIdx), 1); stackOrder.push(activeIdx); }
                const stackHeight = cards.length ? (cards.length - 1) * STACK_OFFSET + STACK_ACTIVE_H + 8 : 0;
                return (
                  <div style={{ position: "relative", width: "100%", height: stackHeight }}>
                    {cards.map((w, index) => {
                      const p: any = w.plan || {};
                      const isSelected = w.id === selectedCompletedCardId || (selectedCompletedCardId === null && index === 0);
                      const stackIndex = stackOrder.indexOf(index);
                      const top = stackIndex * STACK_OFFSET;
                      const rawLabel = String(p.dayLabel || p.title || "Тренировка");
                      const label = dayLabelRU(rawLabel);
                      const labelLower = String(label).toLowerCase();
                      const mascotSrc = dayMascotForLabel(label);
                      const mascotStyle: CSSProperties = labelLower.includes("спина") && labelLower.includes("бицепс")
                        ? { ...sh.stkMascot, bottom: -6 }
                        : labelLower.includes("ноги") && labelLower.includes("ягодиц")
                          ? { ...sh.stkMascot, bottom: -10 }
                          : sh.stkMascot;
                      const exCount = Number(p.totalExercises) || (Array.isArray(p.exercises) ? p.exercises.length : 0);
                      const estMin = Number(p.estimatedDuration) || null;
                      const dateChip = w.scheduledFor ? formatScheduledDateChip(w.scheduledFor) : "";

                      return (
                        <div
                          key={w.id}
                          className="sh-stack-card"
                          style={{ ...sh.stkCard, top, zIndex: stackIndex + 1, ...(isSelected ? { minHeight: STACK_ACTIVE_H } : { height: STACK_COLLAPSED_H }) }}
                          onClick={() => setSelectedCompletedCardId(w.id)}
                        >
                          {isSelected ? (
                            <>
                              <img src={mascotSrc} alt="" style={mascotStyle} loading="lazy" decoding="async" />
                              {dateChip ? (
                                <div style={sh.stkDateChipRow}>
                                  <div style={{ ...sh.stkDateChipBtn, ...sh.stkDateChipScheduled, cursor: "default" }}>
                                    <span>{dateChip}</span>
                                  </div>
                                </div>
                              ) : null}
                              <div style={sh.stkTitle}>{label}</div>
                              <div style={sh.stkMeta}>
                                <span style={sh.stkInfoChip}>
                                  <Clock3 size={13} strokeWidth={2.1} style={{ transform: "translateY(0.2px)", flex: "0 0 auto" }} />
                                  <span>{estMin ? `${estMin} мин` : "—"}</span>
                                </span>
                                <span style={sh.stkInfoChip}>
                                  <Dumbbell size={14} strokeWidth={2.1} />
                                  <span>{exCount} упражнений</span>
                                </span>
                              </div>
                              <div style={sh.stkActions} onClick={(e) => e.stopPropagation()}>
                                <button type="button" className="sh-primary-btn" style={sh.stkActionBtn} onClick={() => onDetails(w.id)}>
                                  <span>Результат</span>
                                  <span style={sh.stkActionIconWrap}><span style={sh.stkActionArrow}>✓</span></span>
                                </button>
                              </div>
                            </>
                          ) : (
                            <div style={sh.stkCollapsedBody}>
                              <div style={sh.stkCollapsedTitle}>{label}</div>
                              <div style={sh.stkDateChipCollapsedRow}>
                                <div style={{ ...sh.stkDateChipCollapsed, ...sh.stkDateChipScheduled }}>
                                  <span style={sh.stkDateChipCollapsedText}>{dateChip || "Выполнено"}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </>
        ) : hasScheduled ? (
          <>
            <style>{`
              .sh-stack-card { -webkit-tap-highlight-color: transparent; transition: transform 220ms ease, box-shadow 220ms ease; will-change: transform; }
              .sh-stack-card:active:not(:disabled) { transform: translateY(1px) scale(0.98); }
              .sh-primary-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; transition: transform 160ms ease, background-color 160ms ease; }
              .sh-primary-btn:active:not(:disabled) { transform: translateY(1px) scale(0.99) !important; background-color: #1e1f22 !important; }
            `}</style>
            {/* Scheduled workouts — stacked cards */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", flexShrink: 1, minHeight: 0, padding: "8px 0 20px" }}>
              {(() => {
                const cards = scheduledWorkouts;
                const activeIdx = cards.findIndex((w) => w.id === selectedScheduledCardId);
                const stackOrder = cards.map((_, i) => i);
                if (activeIdx >= 0) { stackOrder.splice(stackOrder.indexOf(activeIdx), 1); stackOrder.push(activeIdx); }
                const stackHeight = cards.length ? (cards.length - 1) * STACK_OFFSET + STACK_ACTIVE_H + 8 : 0;
                return (
                  <div style={{ position: "relative", width: "100%", height: stackHeight }}>
                    {cards.map((w, index) => {
                      const p: any = w.plan || {};
                      const isSelected = w.id === selectedScheduledCardId || (selectedScheduledCardId === null && index === 0);
                      const stackIndex = stackOrder.indexOf(index);
                      const top = stackIndex * STACK_OFFSET;
                      const rawLabel = String(p.dayLabel || p.title || "Тренировка");
                      const label = dayLabelRU(rawLabel);
                      const labelLower = String(label).toLowerCase();
                      const mascotSrc = dayMascotForLabel(label);
                      const mascotStyle: CSSProperties = labelLower.includes("спина") && labelLower.includes("бицепс")
                        ? { ...sh.stkMascot, bottom: -6 }
                        : labelLower.includes("ноги") && labelLower.includes("ягодиц")
                          ? { ...sh.stkMascot, bottom: -10 }
                          : sh.stkMascot;
                      const exCount = Number(p.totalExercises) || (Array.isArray(p.exercises) ? p.exercises.length : 0);
                      const estMin = Number(p.estimatedDuration) || null;
                      const dateChip = w.scheduledFor ? formatScheduledDateChip(w.scheduledFor) : "";

                      return (
                        <div
                          key={w.id}
                          className="sh-stack-card"
                          style={{ ...sh.stkCard, top, zIndex: stackIndex + 1, ...(isSelected ? { minHeight: STACK_ACTIVE_H } : { height: STACK_COLLAPSED_H }) }}
                          onClick={() => setSelectedScheduledCardId(w.id)}
                        >
                          {isSelected ? (
                            <>
                              <img src={mascotSrc} alt="" style={mascotStyle} loading="lazy" decoding="async" />
                              <div style={sh.stkDateChipRow} onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  style={{ ...sh.stkDateChipBtn, ...sh.stkDateChipScheduled }}
                                  onClick={() => setEditingWorkoutId(w.id)}
                                >
                                  <span>{dateChip || "Дата и время"}</span>
                                </button>
                                <button type="button" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center" }} onClick={() => setEditingWorkoutId(w.id)}>
                                  <Pencil size={14} strokeWidth={2.1} color="rgba(15,23,42,0.6)" />
                                </button>
                              </div>
                              <div style={sh.stkTitle}>{label}</div>
                              <div style={sh.stkMeta}>
                                <span style={sh.stkInfoChip}>
                                  <Clock3 size={13} strokeWidth={2.1} style={{ transform: "translateY(0.2px)", flex: "0 0 auto" }} />
                                  <span>{estMin ? `${estMin} мин` : "—"}</span>
                                </span>
                                <span style={sh.stkInfoChip}>
                                  <Dumbbell size={14} strokeWidth={2.1} />
                                  <span>{exCount} упражнений</span>
                                </span>
                              </div>
                              <div style={sh.stkActions} onClick={(e) => e.stopPropagation()}>
                                <button type="button" className="sh-primary-btn" style={sh.stkActionBtn} onClick={() => { onSelectWorkout(w.id); onStart(); }}>
                                  <span>Начать</span>
                                  <span style={sh.stkActionIconWrap}><span style={sh.stkActionArrow}>→</span></span>
                                </button>
                              </div>
                            </>
                          ) : (
                            <div style={sh.stkCollapsedBody}>
                              <div style={sh.stkCollapsedTitle}>{label}</div>
                              <div style={sh.stkDateChipCollapsedRow}>
                                <div style={{ ...sh.stkDateChipCollapsed, ...sh.stkDateChipScheduled }}>
                                  <span style={sh.stkDateChipCollapsedText}>{dateChip || "Запланировано"}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </>
        ) : confirmDelete ? (
          <>
            {/* Confirm delete view */}
            <div style={sh.confirmText}>
              Удалить тренировку «{title}»?
            </div>
            <div style={sh.confirmDivider} />
            <button type="button" style={sh.confirmBtn} onClick={() => setConfirmDelete(false)}>
              Отмена
            </button>
            <div style={sh.confirmDivider} />
            <button type="button" style={{ ...sh.confirmBtn, ...sh.confirmBtnDanger }} onClick={onDelete}>
              Удалить
            </button>
          </>
        ) : editingScheduled ? (
          <>
            {/* Edit scheduled workout */}
            <DateTimeWheelInline
              initialDate={date}
              initialTime={toTimeInput(editingScheduled.scheduledFor)}
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
                style={{ ...sh.primaryBtn, opacity: saving ? 0.5 : 1 }}
                onClick={() => { onSelectWorkout(editingScheduled.id); onSave(); }}
                disabled={saving}
              >
                <span style={sh.primaryBtnLabel}>{saving ? "Сохраняем..." : "Сохранить"}</span>
                <span style={sh.primaryBtnCircle}><span style={sh.primaryBtnCheck}>✓</span></span>
              </button>
              <button type="button" style={sh.deleteBtn} onClick={() => { onSelectWorkout(editingScheduled.id); setConfirmDelete(true); }}>
                Удалить
              </button>
            </div>
          </>
        ) : needsPick && !selectedWorkoutId ? (
          <>
            <style>{`
              .sh-stack-card { -webkit-tap-highlight-color: transparent; transition: transform 220ms ease, box-shadow 220ms ease; will-change: transform; }
              .sh-stack-card:active:not(:disabled) { transform: translateY(1px) scale(0.98); }
              .sh-primary-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; transition: transform 160ms ease, background-color 160ms ease; }
              .sh-primary-btn:active:not(:disabled) { transform: translateY(1px) scale(0.99) !important; background-color: #1e1f22 !important; }
            `}</style>
            {/* Stacked workout cards — Apple Pay style */}
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", flexShrink: 1, minHeight: 0, padding: "8px 0 20px" }}>
              {availableWorkouts.length ? (() => {
                const activeIdx = availableWorkouts.findIndex((w) => w.id === selectedCardId);
                const stackOrder = availableWorkouts.map((_, i) => i);
                if (activeIdx >= 0) {
                  stackOrder.splice(stackOrder.indexOf(activeIdx), 1);
                  stackOrder.push(activeIdx);
                }
                const stackHeight = availableWorkouts.length
                  ? (availableWorkouts.length - 1) * STACK_OFFSET + STACK_ACTIVE_H + 8
                  : 0;
                return (
                  <div style={{ position: "relative", width: "100%", height: stackHeight }}>
                    {availableWorkouts.map((w, index) => {
                      const p: any = w.plan || {};
                      const isSelected = w.id === selectedCardId || (selectedCardId === null && index === 0);
                      const stackIndex = stackOrder.indexOf(index);
                      const top = stackIndex * STACK_OFFSET;
                      const rawLabel = String(p.dayLabel || p.title || "Тренировка");
                      const label = dayLabelRU(rawLabel);
                      const labelLower = String(label).toLowerCase();
                      const mascotSrc = dayMascotForLabel(label);
                      const mascotStyle: CSSProperties = labelLower.includes("спина") && labelLower.includes("бицепс")
                        ? { ...sh.stkMascot, bottom: -6 }
                        : labelLower.includes("ноги") && labelLower.includes("ягодиц")
                          ? { ...sh.stkMascot, bottom: -10 }
                          : sh.stkMascot;
                      const exCount = Number(p.totalExercises) || (Array.isArray(p.exercises) ? p.exercises.length : 0);
                      const estMin = Number(p.estimatedDuration) || null;
                      const isCompleted = w.status === "completed";
                      const primaryLabel = isCompleted ? "Результат" : "Начать";
                      const primaryIcon = isCompleted ? "✓" : "→";

                      return (
                        <div
                          key={w.id}
                          className="sh-stack-card"
                          style={{
                            ...sh.stkCard,
                            top,
                            zIndex: stackIndex + 1,
                            ...(isSelected ? { minHeight: STACK_ACTIVE_H } : { height: STACK_COLLAPSED_H }),
                          }}
                          onClick={() => setSelectedCardId(w.id)}
                        >
                          {isSelected ? (
                            <>
                              <img src={mascotSrc} alt="" style={mascotStyle} loading="lazy" decoding="async" />

                              <div style={sh.stkDateChipRow} onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  style={{ ...sh.stkDateChipBtn, ...sh.stkDateChipPending }}
                                  onClick={() => onSelectWorkout(w.id)}
                                >
                                  <span>Дата и время</span>
                                </button>
                              </div>

                              <div style={sh.stkTitle}>{label}</div>

                              <div style={sh.stkMeta}>
                                <span style={sh.stkInfoChip}>
                                  <Clock3 size={13} strokeWidth={2.1} style={{ transform: "translateY(0.2px)", flex: "0 0 auto" }} />
                                  <span>{estMin ? `${estMin} мин` : "—"}</span>
                                </span>
                                <span style={sh.stkInfoChip}>
                                  <Dumbbell size={14} strokeWidth={2.1} />
                                  <span>{exCount} упражнений</span>
                                </span>
                              </div>

                              <div style={sh.stkActions} onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="sh-primary-btn"
                                  style={sh.stkActionBtn}
                                  onClick={() => isCompleted ? onDetails(w.id) : (() => { onSelectWorkout(w.id); onStart(); })()}
                                >
                                  <span>{primaryLabel}</span>
                                  <span style={sh.stkActionIconWrap}>
                                    <span style={sh.stkActionArrow}>{primaryIcon}</span>
                                  </span>
                                </button>
                              </div>
                            </>
                          ) : (
                            <div style={sh.stkCollapsedBody}>
                              <div style={sh.stkCollapsedTitle}>{label}</div>
                              <div style={sh.stkDateChipCollapsedRow}>
                                <div style={{ ...sh.stkDateChipCollapsed, ...sh.stkDateChipPending }}>
                                  <span style={sh.stkDateChipCollapsedText}>Дата и время</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(15,23,42,0.55)", padding: "10px 16px" }}>
                  Пока нет сгенерированных тренировок. Сначала открой PlanOne и сгенерируй план.
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Scheduling view (scrollers + save) */}
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
                style={{ ...sh.primaryBtn, opacity: saving ? 0.5 : 1 }}
                onClick={onSave}
                disabled={saving}
              >
                <span style={sh.primaryBtnLabel}>{saving ? "Сохраняем..." : "Сохранить"}</span>
                <span style={sh.primaryBtnCircle}><span style={sh.primaryBtnCheck}>✓</span></span>
              </button>
              {needsPick && (
                <button type="button" style={sh.deleteBtn} onClick={() => onSelectWorkout("")}>
                  Назад
                </button>
              )}
              {canDelete && (
                <button type="button" style={sh.deleteBtn} onClick={() => setConfirmDelete(true)} disabled={saving || readOnly}>
                  Удалить
                </button>
              )}
            </div>
          </>
        )}

        {/* Safe area spacer */}
        <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </div>

    </>,
    document.body
  );
}

function Loader() {
  return (
    <div style={{ ...s.page, alignItems: "center", justifyContent: "center" }}>
      <style>{`
        .sched-dots { display: inline-flex; align-items: center; gap: 4px; }
        .sched-dots .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #1b1b1b; opacity: 0.3;
          animation: schedBlink 1.2s infinite;
        }
        .sched-dots .dot:nth-child(2) { animation-delay: 0.2s; }
        .sched-dots .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes schedBlink {
          0% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
          100% { opacity: 0.3; transform: translateY(0); }
        }
      `}</style>
      <div className="sched-dots">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
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
  checkMark: {
    position: "absolute",
    right: 7,
    bottom: 5,
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(15,23,42,0.45)",
  },
  countBadge: {
    justifySelf: "start",
    fontSize: 9,
    fontWeight: 600,
    background: "rgba(255,255,255,.85)",
    borderRadius: 999,
    padding: "2px 5px",
    color: "rgba(15,23,42,0.55)",
  },
};

const wl: Record<string, CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "18px 18px 0",
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
    gap: 12,
    padding: "12px 0 4px",
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
  // Stacked cards (PlanOne-style)
  stkCard: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    padding: "20px 18px",
    borderRadius: 24,
    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(242,242,247,0.92) 100%)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "0 16px 32px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    transition: "top 320ms ease, height 320ms ease, min-height 320ms ease, transform 220ms ease, box-shadow 220ms ease",
    willChange: "top, height, min-height, transform",
    cursor: "pointer",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  stkMascot: {
    position: "absolute" as const,
    right: -36,
    bottom: -18,
    width: 150,
    height: "auto",
    opacity: 1,
    filter: "none",
    pointerEvents: "none" as const,
    zIndex: 0,
    transition: "opacity 220ms ease, transform 220ms ease",
  },
  stkTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.1,
    letterSpacing: -0.5,
    position: "relative" as const,
    zIndex: 1,
  },
  stkDateChipRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    width: "fit-content",
    position: "relative" as const,
    zIndex: 1,
  },
  stkDateChipBtn: {
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
    whiteSpace: "nowrap" as const,
    width: "fit-content",
    position: "relative" as const,
    zIndex: 1,
    transition: "background 180ms ease, box-shadow 180ms ease, color 180ms ease",
  },
  stkDateChipPending: {
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    color: "rgba(17,29,46,0.48)",
    textShadow: "0 1px 0 rgba(255,255,255,0.86), 0 -1px 0 rgba(15,23,42,0.14)",
  },
  stkDateChipScheduled: {
    background: "linear-gradient(180deg, rgba(222,236,208,0.98) 0%, rgba(206,226,188,0.96) 100%)",
    boxShadow: "inset 0 2px 3px rgba(46,74,29,0.2), inset 0 -1px 0 rgba(255,255,255,0.82)",
    color: "rgba(26,56,16,0.62)",
    textShadow: "0 1px 0 rgba(255,255,255,0.88), 0 -1px 0 rgba(35,71,19,0.2)",
  },
  stkMeta: {
    display: "flex",
    alignItems: "center",
    color: "rgba(15,23,42,.56)",
    gap: 14,
    position: "relative" as const,
    zIndex: 1,
  },
  stkInfoChip: {
    background: "transparent",
    border: "none",
    boxShadow: "none",
    padding: 0,
    borderRadius: 0,
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15, 23, 42, 0.6)",
    whiteSpace: "nowrap" as const,
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    lineHeight: 1.5,
  },
  stkActions: {
    marginTop: "auto",
    paddingTop: 12,
    display: "flex",
    alignItems: "end",
    width: "100%",
    position: "relative" as const,
    zIndex: 1,
  },
  stkActionBtn: {
    alignSelf: "flex-start",
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
  stkActionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
  },
  stkActionArrow: {
    fontSize: 18,
    lineHeight: 1,
    color: "#0f172a",
    fontWeight: 700,
  },
  stkCollapsedBody: {
    marginTop: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  stkCollapsedTitle: {
    fontSize: 20,
    lineHeight: 1.12,
    letterSpacing: -0.3,
    fontWeight: 700,
    color: "#0f172a",
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  stkDateChipCollapsedRow: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    maxWidth: "100%",
    flexShrink: 0,
    position: "relative" as const,
    zIndex: 1,
  },
  stkDateChipCollapsed: {
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
    position: "relative" as const,
    zIndex: 1,
  },
  stkDateChipCollapsedText: {
    display: "inline-block",
    whiteSpace: "nowrap" as const,
    overflow: "visible",
    textOverflow: "clip",
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
    gap: 8,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  },
  sheetRowName: {
    fontSize: 15,
    fontWeight: 600,
    color: "#1e1f22",
    lineHeight: 1.25,
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
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(15,23,42,0.62)",
    flexShrink: 0,
  },
  sheetDivider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    margin: "12px 0",
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(15,23,42,0.6)",
    padding: "8px 16px",
    borderRadius: 999,
  },
  // Confirm delete
  confirmText: {
    fontSize: 15,
    fontWeight: 500,
    color: "rgba(15,23,42,0.62)",
    textAlign: "center",
    padding: "24px 16px 16px",
    lineHeight: 1.4,
  },
  confirmBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    padding: "14px 24px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 500,
    color: "#1e1f22",
    textAlign: "center",
  },
  confirmBtnDanger: {
    color: "#b42318",
    fontWeight: 600,
  },
  confirmDivider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
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

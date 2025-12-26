import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  cancelPlannedWorkout,
  getScheduleOverview,
  updatePlannedWorkout,
  saveScheduleDates,
  PlannedWorkout,
  ScheduleByDate,
} from "@/api/schedule";

const isValidTime = (value: string) => /^\d{2}:\d{2}$/.test(value);
const defaultTimeSuggestion = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "18:00" : "09:00";
};

const normalizeScheduleDates = (dates: Record<string, { time?: string }> | null | undefined): ScheduleByDate => {
  if (!dates) return {};
  const out: ScheduleByDate = {};
  Object.entries(dates).forEach(([iso, entry]) => {
    if (entry && isValidTime(entry.time)) {
      out[iso] = { time: entry.time };
    }
  });
  return out;
};

type ModalState = {
  workout: PlannedWorkout;
  date: string;
  time: string;
  saving: boolean;
  error: string | null;
};

export default function Schedule() {
  const nav = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planned, setPlanned] = useState<PlannedWorkout[]>([]);
  const [scheduleDates, setScheduleDates] = useState<ScheduleByDate>({});
  const [monthOffset, setMonthOffset] = useState(0);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [slotEditor, setSlotEditor] = useState<{ iso: string; time: string } | null>(null);
  const [slotSaving, setSlotSaving] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);

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

  // If navigated from PlanOne with a specific planned workout, open its scheduling modal.
  const requestedPlannedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = (location.state as any)?.plannedWorkoutId;
    if (typeof id === "string" && id.trim()) {
      requestedPlannedIdRef.current = id.trim();
    }
  }, [location.state]);

  useEffect(() => {
    const id = requestedPlannedIdRef.current;
    if (!id) return;
    if (!planned.length) return;
    const w = planned.find((x) => x.id === id);
    if (!w) return;

    const todayKey = toDateKey(stripTime(new Date()));
    const initialTime = scheduleDates[todayKey]?.time ?? defaultTimeSuggestion();
    const date = w.status === "pending" ? todayKey : toDateInput(w.scheduledFor);
    const time = w.status === "pending" ? initialTime : toTimeInput(w.scheduledFor);
    setModal({ workout: w, date, time, saving: false, error: null });

    requestedPlannedIdRef.current = null;
    nav(".", { replace: true, state: null });
  }, [planned, scheduleDates, nav]);

  useEffect(() => {
    const handler = () => {
      reload().catch((err) => console.error("reload schedule failed", err));
    };
    window.addEventListener("schedule_updated", handler as any);
    return () => window.removeEventListener("schedule_updated", handler as any);
  }, [reload]);

  const today = stripTime(new Date());
  const view = addMonths(today, monthOffset);
  const monthLabel = view.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const prevView = addMonths(view, -1);
const nextView = addMonths(view, 1);

const prevMonthLabel = prevView.toLocaleDateString("ru-RU", { month: "long" });
const nextMonthLabel = nextView.toLocaleDateString("ru-RU", { month: "long" });

const showPrevYear = prevView.getFullYear() !== view.getFullYear();
const showNextYear = nextView.getFullYear() !== view.getFullYear();

  const days = useMemo(() => buildMonthGrid(view), [view]);

  const plannedByDate = useMemo(() => groupByDate(planned), [planned]);

  const upcoming = useMemo(() => {
    const nowTs = Date.now();
    return planned
      .filter(
        (w) =>
          w.status === "scheduled" && new Date(w.scheduledFor).getTime() >= nowTs - 60_000
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
      );
  }, [planned]);

  const sameMonth = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

  const plannedInViewMonth = planned.filter(
    (w) => w.status === "scheduled" && sameMonth(parseIsoDate(w.scheduledFor), view)
  ).length;

  const completedInViewMonth = planned.filter(
    (w) => w.status === "completed" && sameMonth(parseIsoDate(w.scheduledFor), view)
  ).length;

  // слоты расписания без тренировки
  const slotOnlyCountInViewMonth = Object.keys(scheduleDates).filter((iso) => {
    const d = parseIsoDate(iso);
    if (!sameMonth(d, view)) return false;
    const items = plannedByDate[iso] || [];
    return items.length === 0;
  }).length;

  const totalTrainingsInViewMonth = plannedInViewMonth + slotOnlyCountInViewMonth;
  const progressDenominator = totalTrainingsInViewMonth;
  const progressPct = progressDenominator > 0
    ? Math.round((completedInViewMonth / progressDenominator) * 100)
    : 0;

  const openDate = (date: Date) => {
    const key = toDateKey(date);
    const items = plannedByDate[key] || [];
    if (items.length > 0) {
      openWorkout(items[0]);
      return;
    }
    const initialTime = scheduleDates[key]?.time ?? defaultTimeSuggestion();
    setSlotEditor({ iso: key, time: initialTime });
    setSlotError(null);
    setSlotSaving(false);
  };

  const openWorkout = (workout: PlannedWorkout) => {
    const todayKey = toDateKey(stripTime(new Date()));
    const initialTime = scheduleDates[todayKey]?.time ?? defaultTimeSuggestion();
    const date = workout.status === "pending" ? todayKey : toDateInput(workout.scheduledFor);
    const time = workout.status === "pending" ? initialTime : toTimeInput(workout.scheduledFor);
    setModal({
      workout,
      date,
      time,
      saving: false,
      error: null,
    });
  };

  const handleSlotTimeChange = (value: string) => {
    setSlotError(null);
    setSlotEditor((prev) => (prev ? { ...prev, time: value } : prev));
  };

  const handleSlotSave = async () => {
    if (!slotEditor) return;
    if (!isValidTime(slotEditor.time)) {
      setSlotError("Некорректное время");
      return;
    }
    const next: ScheduleByDate = { ...scheduleDates, [slotEditor.iso]: { time: slotEditor.time } };
    setSlotSaving(true);
    try {
      await saveScheduleDates(next);
      setScheduleDates(next);
      setSlotEditor(null);
      setSlotError(null);
      try {
        window.dispatchEvent(new CustomEvent("schedule_updated"));
      } catch {}
    } catch (err) {
      console.error("save slot failed", err);
      setSlotError("Не удалось сохранить. Попробуй снова.");
    } finally {
      setSlotSaving(false);
    }
  };

  const handleSlotDelete = async () => {
    if (!slotEditor) return;
    const next: ScheduleByDate = { ...scheduleDates };
    delete next[slotEditor.iso];
    setSlotSaving(true);
    try {
      await saveScheduleDates(next);
      setScheduleDates(next);
      setSlotEditor(null);
      setSlotError(null);
      try {
        window.dispatchEvent(new CustomEvent("schedule_updated"));
      } catch {}
    } catch (err) {
      console.error("delete slot failed", err);
      setSlotError("Не удалось удалить. Попробуй ещё раз.");
    } finally {
      setSlotSaving(false);
    }
  };

  const closeSlotEditor = () => {
    setSlotEditor(null);
    setSlotError(null);
  };

  const handleModalSave = async () => {
    if (!modal) return;
    const { workout, date, time } = modal;
    const when = parseLocalDateTime(date, time);
    if (!when) {
      setModal((prev) =>
        prev ? { ...prev, error: "Укажи корректные дату и время" } : prev
      );
      return;
    }
    setModal((prev) => (prev ? { ...prev, saving: true, error: null } : prev));
    try {
      const updated = await updatePlannedWorkout(workout.id, {
        status: "scheduled",
        scheduledFor: when.toISOString(),
        scheduledTime: time,
      });
      setPlanned((prev) => mergePlanned(prev, updated));
      await reload();
      setModal((prev) =>
        prev
          ? {
              ...prev,
              workout: updated,
              date: toDateInput(updated.scheduledFor),
              time: toTimeInput(updated.scheduledFor),
              saving: false,
            }
          : prev
      );
    } catch (err) {
      console.error("update planned workout failed", err);
      setModal((prev) =>
        prev
          ? { ...prev, saving: false, error: "Не удалось сохранить. Попробуй ещё раз." }
          : prev
      );
    }
  };

  const handleModalCancel = async () => {
    if (!modal) return;
    const workoutId = modal.workout.id;
    setModal((prev) => (prev ? { ...prev, saving: true, error: null } : prev));
    try {
      await cancelPlannedWorkout(workoutId);
      setPlanned((prev) => prev.filter((w) => w.id !== workoutId));
      await reload();
      setModal(null);
    } catch (err) {
      console.error("cancel planned workout failed", err);
      setModal((prev) =>
        prev
          ? { ...prev, saving: false, error: "Не удалось удалить. Попробуй снова." }
          : prev
      );
    }
  };

  const handleStart = (workout: PlannedWorkout) => {
    if (!workout.plan) return;
    try {
      localStorage.setItem("current_plan", JSON.stringify(workout.plan));
      localStorage.setItem("planned_workout_id", workout.id);
    } catch {}
    setModal(null);
    nav("/workout/session", {
      state: { plan: workout.plan, plannedWorkoutId: workout.id },
    });
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

  const upcomingPreview = upcoming.slice(0, 6);

  return (
    <div style={s.page}>
      <SoftGlowStyles />

      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>{monthLabel}</span>
          <span style={s.credits}>Расписание</span>
        </div>
        <div style={s.heroTitle}>Календарь тренировок</div>
        <div style={s.heroSubtitle}>Запланируй и держи под контролем</div>

        <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(2,1fr)",
    gap: 8,
    marginTop: 12,
  }}
>
  <button style={s.primaryBtn} onClick={() => setMonthOffset(x => x - 1)}>
    ← {prevMonthLabel}{showPrevYear ? ` ${prevView.getFullYear()}` : ""}
  </button>
  <button style={s.primaryBtn} onClick={() => setMonthOffset(x => x + 1)}>
    {nextMonthLabel}{showNextYear ? ` ${nextView.getFullYear()}` : ""} →
  </button>
</div>

      </section>

      <section style={{ ...s.block, ...s.statsSection }}>
        <div style={s.statsRow}>
          <Stat icon="📅" label="План" value={String(totalTrainingsInViewMonth)} />
          <Stat icon="✔️" label="Выполнено" value={String(completedInViewMonth)} />
          <Stat icon="📈" label="Прогресс" value={`${progressPct}%`} />
        </div>
      </section>

      <section style={s.block}>
        <div style={{ ...ux.card, overflow: "hidden" }}>
          <div style={{ ...ux.cardHeader }}>
            <div style={ux.iconInline}>🗓️</div>
            <div>
              <div style={ux.cardTitleRow}>
                <div style={ux.cardTitle}>{monthLabel}</div>
              </div>
              <div style={ux.cardHint}>Нажми на дату, чтобы открыть детальную карточку</div>
            </div>
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
              const slotEntry = scheduleDates[key];
              const hasCompleted = items.some((w) => w.status === "completed");
              const scheduledItem = items.find((w) => w.status === "scheduled");
              const primaryPlanned = scheduledItem ?? items[0] ?? null;
              let displayTime = primaryPlanned
                ? formatTime(primaryPlanned.scheduledFor)
                : slotEntry?.time ?? null;
              let extraCount = primaryPlanned ? Math.max(items.length - 1, 0) : 0;
              const cellState = hasCompleted
                ? "completed"
                : primaryPlanned
                ? "planned"
                : slotEntry
                ? "slot"
                : "empty";
              if (cellState === "completed") {
                displayTime = null;
                extraCount = 0;
              }
              const showTime = displayTime && (cellState === "planned" || cellState === "slot");
              const timeStyle =
                cellState === "planned"
                  ? { ...cal.timeText, ...cal.timeTextPlanned }
                  : cellState === "slot"
                  ? { ...cal.timeText, ...cal.timeTextSlot }
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
                    ...(cellState === "slot" ? cal.slot : {}),
                    ...(cellState === "planned" ? cal.planned : {}),
                    ...(cellState === "completed" ? cal.completed : {}),
                  }}
                  onClick={() => openDate(day)}
                >
                  <div style={cal.dateNum}>{day.getDate()}</div>
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

      <section style={s.block}>
        <div style={{ ...ux.card, overflow: "hidden" }}>
          <div style={{ ...ux.cardHeader }}>
            <div style={ux.iconInline}>📌</div>
            <div>
              <div style={ux.cardTitleRow}>
                <div style={ux.cardTitle}>Ближайшие</div>
              </div>
              <div style={ux.cardHint}>Запланированные тренировки на ближайшие дни</div>
            </div>
          </div>
          <div style={{ padding: 10, display: "grid", gap: 8 }}>
            {upcomingPreview.length === 0 ? (
              <div style={ux.cardHint}>
                Нет запланированных тренировок. Сохрани новую из генератора.
              </div>
            ) : (
              upcomingPreview.map((item) => (
                <div key={item.id} style={list.row}>
                  <div style={list.left}>
                    <div style={list.title}>{fmtFullDate(item.scheduledFor)}</div>
                    <div style={list.hint}>В {formatTime(item.scheduledFor)}</div>
                  </div>
                 <button
  style={{
    ...s.rowBtn,
    background: "#000",
    color: "#fff",
    boxShadow: "none",
    border: "1px solid rgba(255,255,255,0.2)",
  }}
  onClick={() => openWorkout(item)}
>
  Открыть
</button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <div style={{ height: 80 }} />

      {slotEditor && (
        <SlotModal
          iso={slotEditor.iso}
          time={slotEditor.time}
          hasExisting={Boolean(scheduleDates[slotEditor.iso])}
          saving={slotSaving}
          error={slotError}
          onClose={closeSlotEditor}
          onChange={handleSlotTimeChange}
          onSave={handleSlotSave}
          onDelete={handleSlotDelete}
        />
      )}

      {modal && (
        <PlanPreviewModal
          workout={modal.workout}
          date={modal.date}
          time={modal.time}
          saving={modal.saving}
          error={modal.error}
          onClose={() => setModal(null)}
          onDateChange={(val) =>
            setModal((prev) => (prev ? { ...prev, date: val } : prev))
          }
          onTimeChange={(val) =>
            setModal((prev) => (prev ? { ...prev, time: val } : prev))
          }
          onSave={handleModalSave}
          onCancel={handleModalCancel}
          onStart={() => handleStart(modal.workout)}
        />
      )}
    </div>
  );
}

/* ===================== Модалы ===================== */

function SlotModal({
  iso,
  time,
  hasExisting,
  saving,
  error,
  onClose,
  onChange,
  onSave,
  onDelete,
}: {
  iso: string;
  time: string;
  hasExisting: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [hh, mm] = time.split(":").map(v => Number(v) || 0);

  const setHour = (v: number) => onChange(`${String(v).padStart(2,"0")}:${String(mm).padStart(2,"0")}`);
  const setMin  = (v: number) => onChange(`${String(hh).padStart(2,"0")}:${String(v).padStart(2,"0")}`);

  // Блокировка скролла body
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    const originalPosition = window.getComputedStyle(document.body).position;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    return () => {
      document.body.style.overflow = originalStyle;
      document.body.style.position = originalPosition;
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Только дата, всегда в одну строку
  const modalDateLabel = parseIsoDate(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });

  return (
    <div
      style={slotModalStyles.wrap}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchMove={(e) => {
        const target = e.target as HTMLElement;
        const scrollContainer = target.closest("[data-wheel-scroll]");
        if (!scrollContainer) e.preventDefault();
      }}
    >
      <div style={slotModalStyles.card}>
        <div style={slotModalStyles.topbar}>
          <button type="button" style={slotModalStyles.topBtnGhost} onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <div style={slotModalStyles.title} title={modalDateLabel}>{modalDateLabel}</div>
          <button type="button" style={slotModalStyles.topBtnPrimary} onClick={onSave} disabled={saving}>
            Сохранить
          </button>
        </div>

        {/* зона колес — фон как у экрана schedule.tsx */}
        <div style={wheel.container}>
          <div style={wheel.fadeTop} />
          <Wheel value={hh} maxValue={23} onChange={setHour} ariaLabel="Часы" />
          <div style={wheel.sep}>:</div>
          <Wheel value={mm} maxValue={59} onChange={setMin} ariaLabel="Минуты" />
          <div style={wheel.fadeBottom} />
          <div style={wheel.selector} />
        </div>

        {error && <div style={slotModalStyles.error}>{error}</div>}

        {hasExisting && (
          <button type="button" style={slotModalStyles.delete} onClick={onDelete} disabled={saving}>
            Удалить запись
          </button>
        )}
      </div>
    </div>
  );
}

function Wheel({
  value, maxValue, onChange, ariaLabel,
}: {
  value: number;
  maxValue: number;
  onChange: (v: number) => void;
  ariaLabel?: string;
}) {
  const ITEM_H = 36;
  const VISIBLE_ITEMS = 5;
  const PADDING_ITEMS = Math.floor(VISIBLE_ITEMS / 2);
  
  const ref = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  const values = Array.from({ length: maxValue + 1 }, (_, i) => i);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targetScroll = value * ITEM_H;
    el.scrollTop = targetScroll;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      const scrollTop = el.scrollTop;
      const rawIndex = scrollTop / ITEM_H;
      const currentIndex = Math.round(rawIndex);
      const clampedIndex = Math.min(Math.max(currentIndex, 0), maxValue);

      if (clampedIndex !== value) {
        onChange(clampedIndex);
      }

      scrollTimeoutRef.current = window.setTimeout(() => {
        const finalScrollTop = el.scrollTop;
        const finalRawIndex = finalScrollTop / ITEM_H;
        const finalIndex = Math.round(finalRawIndex);
        const finalClamped = Math.min(Math.max(finalIndex, 0), maxValue);
        
        const targetScroll = finalClamped * ITEM_H;

        if (Math.abs(el.scrollTop - targetScroll) > 0.5) {
          el.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
          });
        }

        if (finalClamped !== value) {
          onChange(finalClamped);
        }
      }, 150);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      el.removeEventListener("scroll", onScroll);
    };
  }, [value, maxValue, onChange]);

  return (
  <div style={wheel.colWrap} aria-label={ariaLabel}>
    <div ref={ref} style={wheel.col} data-wheel-scroll="true">
      {Array.from({ length: PADDING_ITEMS }).map((_, i) => (
        <div key={`pad-top-${i}`} style={wheel.item} />
      ))}
      
      {values.map(v => (
        <div key={v} style={{ ...wheel.item, ...(v === value ? wheel.itemActive : {}) }}>
          {String(v).padStart(2, "0")}
        </div>
      ))}
      
      {Array.from({ length: PADDING_ITEMS }).map((_, i) => (
        <div key={`pad-bottom-${i}`} style={wheel.item} />
      ))}
    </div>
  </div>
);
}

function PlanPreviewModal({
  workout,
  date,
  time,
  saving,
  error,
  onClose,
  onDateChange,
  onTimeChange,
  onSave: _onSave,
  onCancel,
  onStart,
}: {
  workout: PlannedWorkout;
  date: string;
  time: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onStart: () => void;
}) {
  const plan = workout.plan || {};
  const [motion, setMotion] = useState<"enter" | "open" | "closing">("enter");

  // Новое состояние для редактирования
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState(date);
  const [editTime, setEditTime] = useState(time);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMotion("open"));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = useCallback(() => {
    if (motion === "closing") return;
    setMotion("closing");
    window.setTimeout(() => onClose(), 160);
  }, [motion, onClose]);

  const handleEditToggle = () => {
    if (workout.status === "completed") return;
    setIsEditing(!isEditing);
    if (!isEditing) {
      setEditDate(date);
      setEditTime(time);
    }
  };

  const handleSaveEdit = async () => {
  const when = parseLocalDateTime(editDate, editTime);
  if (!when) return;
  
  try {
    // Сохраняем в БД через API
    const updated = await updatePlannedWorkout(workout.id, {
      scheduledFor: when.toISOString(),
      scheduledTime: editTime,
    });
    
    // Обновляем состояние в родительском компоненте
    onDateChange(toDateInput(updated.scheduledFor));
    onTimeChange(toTimeInput(updated.scheduledFor));
    
    // Обновляем локальное состояние
    setEditDate(toDateInput(updated.scheduledFor));
    setEditTime(toTimeInput(updated.scheduledFor));
    
    // Перезагружаем данные расписания
    try {
      window.dispatchEvent(new CustomEvent("schedule_updated"));
    } catch {}
    
    setIsEditing(false);
  } catch (err) {
    console.error("update failed", err);
  }
	};

  const wrapStyle: CSSProperties = {
    ...modalStyles.wrap,
    background: motion === "open" ? "rgba(0,0,0,.4)" : "rgba(0,0,0,0)",
    transition: "background 180ms ease",
  };

  const cardStyle: CSSProperties = {
    ...modalStyles.card,
    opacity: motion === "closing" ? 0 : motion === "enter" ? 0 : 1,
    transform: motion === "enter" ? "translateY(20px) scale(0.98)" : "translateY(0) scale(1)",
    transition:
      "opacity 160ms ease, transform 420ms cubic-bezier(0.16, 1, 0.3, 1), background 180ms ease",
    willChange: "opacity, transform",
  };

  return (
    <div
      style={wrapStyle}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div style={cardStyle}>
        <div style={modalStyles.topRow}>
          <button style={modalStyles.closeBtn} onClick={requestClose} type="button" aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div style={modalStyles.title}>{plan.title || "Тренировка"}</div>
        <div style={modalStyles.subtitle}>Выбери дату и время, чтобы запланировать тренировку</div>
        {/* Дата/время карточка */}
        <div style={modalStyles.dateTimeCard}>
          {!isEditing ? (
            <div style={modalStyles.dateTimeDisplay}>
              <div style={modalStyles.dateTimeInfo}>
                <div style={modalStyles.dateTimeRow}>
                  <span style={modalStyles.dateTimeIcon}>📅</span>
                  <span style={modalStyles.dateTimeText}>
                    {new Date(date).toLocaleDateString("ru-RU", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                </div>
                <div style={modalStyles.dateTimeRow}>
                  <span style={modalStyles.dateTimeIcon}>🕐</span>
                  <span style={modalStyles.dateTimeText}>{time}</span>
                </div>
              </div>
              {workout.status !== "completed" && (
                <button style={modalStyles.editBtn} onClick={handleEditToggle} type="button">
                  ✏️
                </button>
              )}
            </div>
          ) : (
            <div style={modalStyles.dateTimeEdit}>
              <div style={modalStyles.dateTimeRow}>
                <span style={modalStyles.dateTimeIcon}>📅</span>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  style={modalStyles.dateTimeInput}
                />
              </div>
              <div style={modalStyles.dateTimeRow}>
                <span style={modalStyles.dateTimeIcon}>🕐</span>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  style={modalStyles.dateTimeInput}
                />
              </div>
              <button style={modalStyles.saveEditBtn} onClick={handleSaveEdit} type="button">
                Сохранить изменения
              </button>
            </div>
          )}
        </div>

        {error && <div style={modalStyles.error}>{error}</div>}

        {/* Кнопки */}
        <div style={modalStyles.actions}>
          <button
            type="button"
            style={modalStyles.startBtn}
            onClick={onStart}
            disabled={saving || workout.status === "completed"}
          >
            {workout.status === "completed" ? "✓ Завершена" : "Начать тренировку"}
          </button>
          <button type="button" style={modalStyles.deleteBtn} onClick={onCancel} disabled={saving}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <section style={s.blockWhite}>
        <h3 style={{ marginTop: 0 }}>Загрузка…</h3>
        <p style={{ color: "#555" }}>Готовим календарь</p>
      </section>
    </div>
  );
}

function ErrorView({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <section style={s.blockWhite}>
        <h3 style={{ marginTop: 0 }}>{msg}</h3>
        <button style={s.rowBtn} onClick={onRetry}>
          Обновить
        </button>
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statEmoji}>{icon}</div>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
    </div>
  );
}

function SoftGlowStyles() {
  return (
    <style>{`
      .soft-glow{background:linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);background-size:300% 300%;
      animation:glowShift 6s ease-in-out infinite,pulseSoft 3s ease-in-out infinite;transition:background .3s}
      @keyframes glowShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
      @keyframes pulseSoft{0%,100%{filter:brightness(1) saturate(1);transform:scale(1)}50%{filter:brightness(1.15) saturate(1.1);transform:scale(1.01)}}
    `}</style>
  );
}

function normalizePlanned(list: PlannedWorkout[] | undefined): PlannedWorkout[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && item.id && item.scheduledFor && item.status !== "cancelled")
    .map((item) => ({
      ...item,
      status: item.status || "scheduled",
    }))
    .sort(
      (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
    );
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

function fmtShortDate(iso: string) {
  const dt = parseIsoDate(iso);
  return dt.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function fmtFullDate(iso: string) {
  const dt = parseIsoDate(iso);
  return dt.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
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

const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const s: Record<string, CSSProperties> = {
  page: {
    maxWidth: 760,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui,-apple-system,'Inter','Roboto',Segoe UI",
background:"transparent",
    minHeight: "100vh",
  },
  heroCard: {
    position: "relative",
    padding: 22,
    borderRadius: 28,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
  },
  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  pill: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    backdropFilter: "blur(6px)",
    textTransform: "capitalize",
  },
  credits: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    backdropFilter: "blur(6px)",
  },
  heroTitle: { fontSize: 26, fontWeight: 800, marginTop: 6, color: "#fff" },
  heroSubtitle: { opacity: 0.9, marginTop: 4, color: "rgba(255,255,255,.85)" },
  primaryBtn: {
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 700,
    color: "#000",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    boxShadow: "0 12px 30px rgba(0,0,0,.35)",
    cursor: "pointer",
  },
  block: {
    marginTop: 20,
    padding: 0,
    borderRadius: 20,
    background: "transparent",
    boxShadow: "none",
  },
  statsSection: {
    marginTop: 12,
    padding: 0,
    background: "transparent",
    boxShadow: "none",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: 12,
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
  },
  statEmoji: { fontSize: 20, color: "#111" },
  statLabel: {
    fontSize: 11,
    color: "rgba(0,0,0,.75)",
    letterSpacing: 0.2,
    textTransform: "none",
  },
  statValue: { fontWeight: 800, fontSize: 18, color: "#111" },
  blockWhite: {
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    background: "rgba(255,255,255,0.8)",
    boxShadow: "0 10px 24px rgba(0,0,0,.12)",
    backdropFilter: "blur(12px)",
  },
  rowBtn: {
    border: "none",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    cursor: "pointer",
  },
};

const ux: Record<string, any> = {
  card: {
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,.35)",
    boxShadow: "0 16px 30px rgba(0,0,0,.12)",
    background: "rgba(255,255,255,0.75)",
    backdropFilter: "blur(14px)",
    position: "relative",
  },
  cardHeader: {
    display: "grid",
    gridTemplateColumns: "24px 1fr",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottom: "1px solid rgba(255,255,255,.4)",
    background: "rgba(255,255,255,0.6)",
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
};

const cal: Record<string, CSSProperties> = {
  headerRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7,1fr)",
    gap: 8,
    padding: "14px 14px 0",
  },
  headerCell: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    color: "#4b5563",
    opacity: 0.85,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7,1fr)",
    gap: 8,
    padding: 14,
  },
  cell: {
    border: "1px solid rgba(255,255,255,.45)",
    borderRadius: 16,
    background: "rgba(255,255,255,0.75)",
    padding: "8px 8px 30px",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    cursor: "pointer",
    minHeight: 76,
    height: 76,
    boxShadow: "0 12px 28px rgba(0,0,0,.12)",
    backdropFilter: "blur(12px)",
    overflow: "hidden",
    position: "relative",
  },
  today: { boxShadow: "0 0 0 2px rgba(114,135,255,.4)" },
  slot: {
    background: "rgba(114,135,255,.2)",
    borderColor: "rgba(114,135,255,.4)",
  },
  planned: {
    background: "rgba(255,230,128,.25)",
    borderColor: "rgba(255,179,107,.4)",
  },
  completed: {
    background: "rgba(143,227,143,.25)",
    borderColor: "rgba(72,160,72,.45)",
  },
  dateNum: { fontSize: 13, fontWeight: 800, color: "#111" },
  timeText: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 6,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    color: "#1f2933",
    gap: 0,
    textAlign: "left",
    pointerEvents: "none",
  },
  timeTextPlanned: {
    color: "#8a4d0f",
  },
  timeTextSlot: {
    color: "#2f3a8f",
  },
  timeLineTop: {
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
  },
  timeLineBottom: {
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    marginTop: 2,
  },
  checkMark: {
    position: "absolute",
    right: 8,
    bottom: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#1f6b1f",
  },
  countBadge: {
    justifySelf: "start",
    fontSize: 10,
    fontWeight: 600,
    background: "rgba(255,255,255,.9)",
    borderRadius: 999,
    padding: "2px 6px",
    color: "#374151",
  },
};

const list: Record<string, CSSProperties> = {
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.75)",
    boxShadow: "0 10px 24px rgba(0,0,0,.08)",
    border: "1px solid rgba(255,255,255,.35)",
    backdropFilter: "blur(10px)",
  },
  left: { display: "grid", gap: 2 },
  title: { fontWeight: 700, fontSize: 14 },
  hint: { fontSize: 12, color: "#666" },
};

const slotModalStyles: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.55)",
    display: "grid",
    placeItems: "center",
    zIndex: 1900,
    padding: 16,
    overflow: "hidden",
  },
  // сам модал — чёрный фон
  card: {
    width: "min(92vw, 420px)",
    background: "#000",
    color: "#fff",
    borderRadius: 20,
    boxShadow: "0 24px 64px rgba(0,0,0,.65)",
    padding: "12px 12px 14px",
    display: "grid",
    gap: 10,
  },
  topbar: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 8,
  },
  // «Отмена» — белый текст без фона
  topBtnGhost: {
    justifySelf: "start",
    border: "none",
    background: "transparent",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 17,
    fontWeight: 600,
  },
  // «Сохранить» — фон как у кнопки редактирования анкеты, чёрный текст
      topBtnPrimary: {
    justifySelf: "end",
    border: "none",
    background:
      "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    color: "#000",
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 17,
    fontWeight: 800,
    boxShadow: "0 6px 16px rgba(0,0,0,.3)",
  },

  // дата — в одну строку
  title: {
    textAlign: "center",
    fontWeight: 800,
    fontSize: 17,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  error: {
    background: "rgba(255,102,102,.12)",
    color: "#ff8a8a",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 10px",
    borderRadius: 10,
  },
  delete: {
    border: "none",
    borderRadius: 12,
    padding: "12px",
    fontWeight: 400,
    background: "transparent",
    color: "#ff6b6b",
    cursor: "pointer",
    fontSize: 14,
    justifySelf: "center",
  },
};

const wheel: Record<string, CSSProperties> = {
  // фон под часами/минутами — как фон страницы schedule.tsx
    container: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: 8,
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 14,
    // точный фон экрана Schedule — светлый и без прозрачности
    background:
      "linear-gradient(135deg, #ECE3FF 0%, #D9C2F0 45%, #FFD8C2 100%)",
    position: "relative",
    overflow: "hidden",
  },

  sep: { fontSize: 24, fontWeight: 900, opacity: 0.85, alignSelf: "center", margin: "0 2px", color: "#111" },
  colWrap: { position: "relative", height: 180, overflow: "hidden", borderRadius: 12, background: "transparent" },
  col: {
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    scrollSnapType: "y mandatory",
    WebkitOverflowScrolling: "touch",
  },
  item: {
    height: 36,
    display: "grid",
    placeItems: "center",
    scrollSnapAlign: "center",
    fontSize: 20,
    fontWeight: 800,
    color: "#111",
    userSelect: "none",
  },
  itemActive: { transform: "scale(1.06)" },

  // лёгкие «шторки» сверху/снизу
  fadeTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 60,
    // светлый градиент в цвет фона schedule
    background: "linear-gradient(to bottom, #ECE3FF 0%, #ECE3FF 35%, rgba(236,227,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 10,
  },
  fadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
    // такой же плавный градиент снизу вверх
    background: "linear-gradient(to top, #FFD8C2 0%, #FFD8C2 35%, rgba(255,216,194,0) 100%)",
    pointerEvents: "none",
    zIndex: 10,
  },
  selector: {
    position: "absolute",
    left: 8,
    right: 8,
    top: "calc(50% - 18px)",
    height: 36,
    borderRadius: 10,
    boxShadow: "inset 0 0 0 2px rgba(0,0,0,.6)",
    pointerEvents: "none",
  },
};

const modalStyles: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    zIndex: 2000,
    padding: 16,
  },

  // Сам блок модала
  card: {
    width: "min(92vw, 460px)",
    maxHeight: "90vh",
    overflowY: "auto",
    overflowX: "hidden",
    background: "var(--tg-theme-bg-color, #f5f6fb)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 14px 40px rgba(0,0,0,0.18)",
    borderRadius: 20,
    display: "grid",
    gap: 12,
    padding: "14px 16px 16px",
  },

  topRow: { display: "flex", justifyContent: "flex-end" },
  closeBtn: {
    border: "none",
    background: "transparent",
    color: "#1b1b1b",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    padding: 6,
    borderRadius: 10,
  },
  title: { fontSize: 18, fontWeight: 800, color: "#111", lineHeight: 1.15 },
  subtitle: { marginTop: -6, fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,.6)" },

  // ===== Дата/время блок (как было) =====
  dateTimeDisplay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dateTimeInfo: { flex: 1, display: "grid", gap: 10 },
  dateTimeText: { flex: 1, fontSize: 15, fontWeight: 600, color: "#1b1b1b" },
  editBtn: {
  background: "rgba(255,255,255,0.6)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  backdropFilter: "blur(8px)",
  width: 40,
  height: 40,
  borderRadius: 12,
  fontSize: 18,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  },
  dateTimeEdit: { display: "grid", gap: 10 },
  saveEditBtn: {
    border: "none",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 700,
    fontSize: 14,
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    color: "#fff",
    cursor: "pointer",
    marginTop: 4,
  },

  // Дата/время карточка
  dateTimeCard: {
    background: "rgba(255, 255, 255, 0.85)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    borderRadius: 14,
    padding: 12,
    display: "grid",
    gap: 10,
  },
  dateTimeRow: { display: "flex", alignItems: "center", gap: 10 },
  dateTimeIcon: { fontSize: 18, flexShrink: 0 },
  dateTimeInput: {
    flex: 1,
    border: "none",
    background: "#fff",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 15,
    fontWeight: 600,
    color: "#1b1b1b",
    fontFamily: "inherit",
    boxShadow: "0 2px 8px rgba(0,0,0,.06)",
  },

  // Секция упражнений
  section: { margin: "0 16px", display: "grid", gap: 10 },
  sectionHeader: { display: "flex", alignItems: "center", gap: 8 },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 15, fontWeight: 750, color: "#1b1b1b" },
  exercisesList: { display: "grid", gap: 6, maxHeight: 200, overflowY: "auto" },
  exRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 10,
    background: "#fff",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.04)",
  },
  exLeft: { flex: 1, minWidth: 0 },
  exName: { fontSize: 13.5, fontWeight: 650, color: "#111", lineHeight: 1.15 },
  exRight: { marginLeft: 8 },
  exMeta: { fontSize: 12.5, fontWeight: 700, color: "#666", whiteSpace: "nowrap" },
  emptyState: { padding: "16px 12px", textAlign: "center", fontSize: 13, color: "#999" },
  moreText: { fontSize: 12, color: "#666", textAlign: "center", fontWeight: 600 },

  // Ошибка
  error: {
    margin: "0 16px",
    background: "rgba(255,102,102,.12)",
    color: "#d32f2f",
    fontSize: 12,
    fontWeight: 600,
    padding: "10px 12px",
    borderRadius: 10,
  },

  // Низ модала — кнопки
  actions: { marginTop: 6, display: "grid", gap: 8 },

  // «Начать тренировку» — стекло + фон как кнопки пролистывания месяца
  startBtn: {
  background: "#ffffffff",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  backdropFilter: "blur(8px)",
  borderRadius: 14,
  padding: "14px",
  fontWeight: 800,
  fontSize: 15,
  color: "#000000ff",
  cursor: "pointer",
  },
  deleteBtn: {
    border: "none",
    borderRadius: 14,
    padding: "12px",
    fontWeight: 400,
    fontSize: 14,
    background: "transparent",
    color: "#ff6b6b",
    cursor: "pointer",
  },
};

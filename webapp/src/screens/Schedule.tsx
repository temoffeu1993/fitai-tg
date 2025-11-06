import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
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

  const plannedInViewMonth = planned.filter((w) =>
    sameMonth(parseIsoDate(w.scheduledFor), view)
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
    setModal({
      workout,
      date: toDateInput(workout.scheduledFor),
      time: toTimeInput(workout.scheduledFor),
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
          <span style={s.pill}>Расписание</span>
          <span style={s.credits}>Твоя программа</span>
        </div>
        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>{monthLabel}</div>
        <div style={s.heroTitle}>Календарь тренировок</div>
        <div style={s.heroSubtitle}>Запланируй и держи под контролем</div>

        <div style={s.heroFooter}>
          <Stat icon="📅" label="Запланированно" value={String(totalTrainingsInViewMonth)} />
          <Stat icon="✔️" label="Выполнено" value={String(completedInViewMonth)} />
          <Stat icon="📈" label="Прогресс" value={`${progressPct}%`} />
        </div>

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

      <section style={s.block}>
        <div style={{ ...ux.card, boxShadow: ux.card.boxShadow, overflow: "hidden" }}>
          <div style={{ ...ux.cardHeader, background: uxColors.headerBg }}>
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
              const displayTime = primaryPlanned
                ? formatTime(primaryPlanned.scheduledFor)
                : slotEntry?.time ?? null;
              const extraCount = primaryPlanned ? Math.max(items.length - 1, 0) : 0;
              const cellState = hasCompleted
                ? "completed"
                : primaryPlanned
                ? "planned"
                : slotEntry
                ? "slot"
                : "empty";
              const badgeStyle =
                cellState === "completed"
                  ? { ...cal.timeBadge, ...cal.timeBadgeDone }
                  : cellState === "planned"
                  ? { ...cal.timeBadge, ...cal.timeBadgePlanned }
                  : cellState === "slot"
                  ? { ...cal.timeBadge, ...cal.timeBadgeSlot }
                  : null;
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
                  {badgeStyle && displayTime && (
                    <div style={badgeStyle}>{displayTime}</div>
                  )}
                  {cellState === "completed" && !displayTime && (
                    <div style={{ ...cal.timeBadge, ...cal.timeBadgeDone }}>✓</div>
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
        <div style={{ ...ux.card, boxShadow: ux.card.boxShadow, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ ...ux.cardHeader, background: uxColors.headerBg }}>
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
                  <button style={s.rowBtn} onClick={() => openWorkout(item)}>
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

      <div style={footer.ctaBar}>
        <button style={footer.btn} onClick={() => nav("/")}>
          На дашборд
        </button>
      </div>
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

  const setHour = (v: number) => {
    const newTime = `${String(v).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
    onChange(newTime);
  };
  
  const setMin = (v: number) => {
    const newTime = `${String(hh).padStart(2,"0")}:${String(v).padStart(2,"0")}`;
    onChange(newTime);
  };

  // Блокировка скролла body
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    const originalPosition = window.getComputedStyle(document.body).position;
    const scrollY = window.scrollY;
    
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    
    return () => {
      document.body.style.overflow = originalStyle;
      document.body.style.position = originalPosition;
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <div
      style={slotModalStyles.wrap}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchMove={(e) => {
        const target = e.target as HTMLElement;
        const scrollContainer = target.closest('[data-wheel-scroll]');
        if (!scrollContainer) {
          e.preventDefault();
        }
      }}
    >
      <div style={slotModalStyles.card}>
        <div style={slotModalStyles.topbar}>
          <button type="button" style={slotModalStyles.topBtnGhost} onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <div style={slotModalStyles.title}>{fmtFullDate(iso)}</div>
          <button type="button" style={slotModalStyles.topBtnPrimary} onClick={onSave} disabled={saving}>
            Сохранить
          </button>
        </div>


        <div style={wheel.container}>
  <div style={wheel.fadeTop} />
  <Wheel
    value={hh}
    maxValue={23}
    onChange={setHour}
    ariaLabel="Часы"
  />
  <div style={wheel.sep}>:</div>
  <Wheel
    value={mm}
    maxValue={59}
    onChange={setMin}
    ariaLabel="Минуты"
  />
  <div style={wheel.fadeBottom} />
  <div style={wheel.selector} />
</div>

        {error && <div style={slotModalStyles.error}>{error}</div>}

        {hasExisting && (
          <button
            type="button"
            style={slotModalStyles.delete}
            onClick={onDelete}
            disabled={saving}
          >
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
  onSave,
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
  const warmup = Array.isArray(plan.warmup) ? plan.warmup : [];
  const exercises = Array.isArray(plan.exercises) ? plan.exercises : [];
  const cooldown = Array.isArray(plan.cooldown) ? plan.cooldown : [];
  const statusLabel = workout.status === "completed" ? "Выполнена" : "Запланирована";

  // Новое состояние для редактирования
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState(date);
  const [editTime, setEditTime] = useState(time);

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

  // Вычисляем время тренировки
  const totalExercises = exercises.length;
  const estimatedMinutes = plan.duration || Math.max(25, Math.min(90, Math.round(totalExercises * 3.5)));
  
  // Локация (если есть в плане, иначе дефолт)
  const location = plan.location || "Дома";

  return (
    <div style={modalStyles.wrap} role="dialog" aria-modal="true" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div style={modalStyles.card}>
        {/* Hero-шапка */}
        <div style={modalStyles.heroHeader}>
          <div style={modalStyles.heroTop}>
            <span style={modalStyles.heroPill}>{statusLabel}</span>
            <button style={modalStyles.heroClose} onClick={onClose} type="button">
              ✕
            </button>
          </div>
          <div style={modalStyles.heroTitle}>{plan.title || "Тренировка"}</div>
          <div style={modalStyles.heroSubtitle}>Краткий превью запланированной тренировки</div>
        </div>

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
                      month: "long" 
                    })}
                  </span>
                </div>
                <div style={modalStyles.dateTimeRow}>
                  <span style={modalStyles.dateTimeIcon}>🕐</span>
                  <span style={modalStyles.dateTimeText}>{time}</span>
                </div>
              </div>
              {workout.status !== "completed" && (
                <button 
                  style={modalStyles.editBtn} 
                  onClick={handleEditToggle}
                  type="button"
                >
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
              <button
                style={modalStyles.saveEditBtn}
                onClick={handleSaveEdit}
                type="button"
              >
                Сохранить изменения
              </button>
            </div>
          )}
        </div>

        {/* Статистика */}
        <div style={modalStyles.statsGrid}>
          <div style={modalStyles.statBox}>
            <div style={modalStyles.statIcon}>⚡</div>
            <div style={modalStyles.statValue}>{totalExercises}</div>
            <div style={modalStyles.statLabel}>Упражнений</div>
          </div>
          <div style={modalStyles.statBox}>
            <div style={modalStyles.statIcon}>🕒</div>
            <div style={modalStyles.statValue}>{estimatedMinutes}</div>
            <div style={modalStyles.statLabel}>Минут</div>
          </div>
          <div style={modalStyles.statBox}>
            <div style={modalStyles.statIcon}>📍</div>
            <div style={modalStyles.statValue}>{location}</div>
            <div style={modalStyles.statLabel}>Локация</div>
          </div>
        </div>

        {error && <div style={modalStyles.error}>{error}</div>}

        {/* Кнопки */}
        <div style={modalStyles.actions}>
          <button
            className="soft-glow"
            type="button"
            style={modalStyles.startBtn}
            onClick={onStart}
            disabled={saving || workout.status === "completed"}
          >
            {workout.status === "completed" ? "✓ Завершена" : "Начать тренировку"}
          </button>
          <button
            type="button"
            style={modalStyles.deleteBtn}
            onClick={onCancel}
            disabled={saving}
          >
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
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)" }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
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
  list.forEach((item) => {
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
    maxWidth: 720,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui,-apple-system,'Inter','Roboto',Segoe UI",
  },
  heroCard: {
    position: "relative",
    padding: 16,
    borderRadius: 20,
    boxShadow: cardShadow,
    background:
      "linear-gradient(135deg, rgba(114,135,255,1) 0%, rgba(164,94,255,1) 45%, rgba(255,120,150,1) 100%)",
    color: "#fff",
    overflow: "hidden",
  },
  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  pill: {
    background: "rgba(255,255,255,.2)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    backdropFilter: "blur(6px)",
  },
  credits: {
    background: "rgba(255,255,255,.2)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    backdropFilter: "blur(6px)",
  },
  heroTitle: { fontSize: 22, fontWeight: 800, marginTop: 6 },
  heroSubtitle: { opacity: 0.92, marginTop: 2 },
  heroFooter: {
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 8,
  },
  stat: {
    background: "rgba(255,255,255,.15)",
    borderRadius: 12,
    padding: 10,
    textAlign: "center",
    backdropFilter: "blur(6px)",
    fontWeight: 600,
  },
  primaryBtn: {
    border: "none",
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 700,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
    cursor: "pointer",
  },
  block: {
    marginTop: 16,
    padding: 0,
    borderRadius: 16,
    background: "#fff",
    boxShadow: cardShadow,
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
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    cursor: "pointer",
  },
};

const uxColors = {
  headerBg: "linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))",
};

const ux: Record<string, any> = {
  card: {
    borderRadius: 18,
    border: "none",
    boxShadow: "0 8px 24px rgba(0,0,0,.06)",
    background: "#fff",
    position: "relative",
  },
  cardHeader: {
    display: "grid",
    gridTemplateColumns: "24px 1fr",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderBottom: "1px solid rgba(0,0,0,.06)",
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
    gap: 6,
    padding: "10px 10px 0",
  },
  headerCell: { textAlign: "center", fontSize: 12, fontWeight: 700, color: "#555" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7,1fr)",
    gap: 6,
    padding: 10,
  },
  cell: {
    border: "1px solid rgba(0,0,0,.06)",
    borderRadius: 12,
    background: "#fff",
    padding: 8,
    textAlign: "left",
    display: "grid",
    alignContent: "start",
    gap: 6,
    cursor: "pointer",
    minHeight: 64,
  },
  today: { boxShadow: "inset 0 0 0 2px rgba(114,135,255,.9)" },
  slot: {
    background: "linear-gradient(135deg, rgba(114,135,255,.12), rgba(164,94,255,.12))",
    border: "1px solid rgba(114,135,255,.2)",
  },
  planned: {
    background: "linear-gradient(135deg, rgba(255,230,128,.3), rgba(255,179,107,.28))",
    border: "1px solid rgba(0,0,0,.08)",
  },
  completed: {
    background: "linear-gradient(135deg, rgba(143, 227, 143, .35), rgba(102, 191, 102, .3))",
    border: "1px solid rgba(72, 160, 72, .35)",
  },
  dateNum: { fontSize: 13, fontWeight: 800, color: "#111" },
  timeBadge: {
    justifySelf: "start",
    fontSize: 11,
    fontWeight: 700,
    background: "rgba(0,0,0,.06)",
    borderRadius: 999,
    padding: "4px 8px",
    color: "#111",
  },
  timeBadgeDone: {
    background: "rgba(60, 140, 60, .15)",
    color: "#1f6b1f",
  },
  timeBadgePlanned: {
    background: "rgba(255,179,107,.22)",
    color: "#8a4d0f",
  },
  timeBadgeSlot: {
    background: "rgba(114,135,255,.18)",
    color: "#2f3a8f",
  },
  countBadge: {
    justifySelf: "start",
    fontSize: 11,
    fontWeight: 600,
    background: "rgba(0,0,0,.08)",
    borderRadius: 999,
    padding: "2px 8px",
    color: "#555",
  },
};

const list: Record<string, CSSProperties> = {
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 10,
    background: "#fff",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.04)",
  },
  left: { display: "grid", gap: 2 },
  title: { fontWeight: 700, fontSize: 14 },
  hint: { fontSize: 12, color: "#666" },
};

const slotModalStyles: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.35)",
    display: "grid",
    placeItems: "center",
    zIndex: 1900,
    padding: 16,
    overflow: "hidden",
  },
  card: {
    width: "min(92vw, 420px)",
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 24px 64px rgba(0,0,0,.35)",
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
  topBtnGhost: {
    justifySelf: "start",
    border: "none",
    background: "transparent",
    fontWeight: 400,
    color: "#6a8dff",
    padding: "10px 12px",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 17,
  },
  topBtnPrimary: {
    justifySelf: "end",
    border: "none",
    background: "transparent",
    fontWeight: 800,
    color: "#6a8dff",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 17,
  },
  title: {
    textAlign: "center",
    fontWeight: 700,
    fontSize: 17,
    color: "#1b1b1b",
  },
  subhint: {
    textAlign: "center",
    fontSize: 12,
    color: "#666",
    marginTop: 2,
    marginBottom: 4,
  },
  error: {
    background: "rgba(255,102,102,.12)",
    color: "#d24",
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
    color: "#d32f2f",
    cursor: "pointer",
    fontSize: 17,
  },
};

const wheel: Record<string, CSSProperties> = {
  container: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: 8,
    alignItems: "center",
    padding: "6px 8px",
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(114,135,255,.10), rgba(164,94,255,.08))",
    position: "relative",
    overflow: "hidden",
  },
  sep: {
    fontSize: 24,
    fontWeight: 900,
    opacity: 0.6,
    alignSelf: "center",
    margin: "0 2px",
  },
  colWrap: {
    position: "relative",
    height: 180,
    overflow: "hidden",
    borderRadius: 12,
    background: "transparent",
    boxShadow: "none",
  },
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
    fontWeight: 700,
    color: "#444",
    userSelect: "none",
  },
  itemActive: {
    color: "#111",
    transform: "scale(1.06)",
  },
  
  fadeTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 60,
    background: "linear-gradient(to bottom, rgb(240,238,255) 0%, rgb(240,238,255) 20%, rgba(240,238,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 10,
  },
  
  fadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
    background: "linear-gradient(to top, rgb(240,238,255) 0%, rgb(240,238,255) 20%, rgba(240,238,255,0) 100%)",
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
    boxShadow: "inset 0 0 0 2px rgba(114,135,255,.75)",
    pointerEvents: "none",
  },
};

const modalStyles: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.4)",
    display: "grid",
    placeItems: "center",
    zIndex: 2000,
    padding: 16,
  },
  card: {
  width: "min(92vw, 460px)",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 20,
  boxShadow: "0 24px 64px rgba(0,0,0,.35)",
  display: "grid",
  gap: 14,
  overflow: "hidden", // добавь эту строку
},

    dateTimeDisplay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dateTimeInfo: {
    flex: 1,
    display: "grid",
    gap: 10,
  },
  dateTimeText: {
    flex: 1,
    fontSize: 15,
    fontWeight: 600,
    color: "#1b1b1b",
  },
  editBtn: {
    background: "rgba(114,135,255,.12)",
    border: "none",
    width: 40,
    height: 40,
    borderRadius: 12,
    fontSize: 18,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    transition: "all 0.2s ease",
  },
  dateTimeEdit: {
    display: "grid",
    gap: 10,
  },
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
  
  // Hero-шапка в стиле экрана генерации
  heroHeader: {
    position: "relative",
    padding: 16,
    borderRadius: "20px 20px 0 0",
    background: "linear-gradient(135deg, rgba(114,135,255,1) 0%, rgba(164,94,255,1) 45%, rgba(255,120,150,1) 100%)",
    color: "#fff",
  },
  heroTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  heroPill: {
    background: "rgba(255,255,255,.2)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    backdropFilter: "blur(6px)",
    fontWeight: 600,
  },
  heroClose: {
    background: "rgba(255,255,255,.2)",
    border: "none",
    width: 28,
    height: 28,
    borderRadius: "50%",
    fontSize: 16,
    color: "#fff",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    backdropFilter: "blur(6px)",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginTop: 4,
    lineHeight: 1.2,
  },
  heroSubtitle: {
    fontSize: 13,
    opacity: 0.92,
    marginTop: 4,
  },

  // Дата/время карточка
  dateTimeCard: {
    margin: "0 16px",
    background: "linear-gradient(135deg, rgba(114,135,255,.08), rgba(164,94,255,.06))",
    borderRadius: 14,
    padding: 12,
    display: "grid",
    gap: 10,
  },
  dateTimeRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  dateTimeIcon: {
    fontSize: 18,
    flexShrink: 0,
  },
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

  // Статистика
  statsGrid: {
    margin: "0 16px",
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 8,
  },
  statBox: {
    background: "rgba(139,92,246,.08)",
    borderRadius: 12,
    padding: "10px 8px",
    textAlign: "center",
    display: "grid",
    gap: 4,
  },
  statIcon: {
    fontSize: 20,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 800,
    color: "#1b1b1b",
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statLabel: {
    fontSize: 10,
    color: "#666",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Секция упражнений
  section: {
    margin: "0 16px",
    display: "grid",
    gap: 10,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 750,
    color: "#1b1b1b",
  },
  exercisesList: {
    display: "grid",
    gap: 6,
    maxHeight: 200,
    overflowY: "auto",
  },
  exRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 10,
    background: "#fff",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.04)",
  },
  exLeft: {
    flex: 1,
    minWidth: 0,
  },
  exName: {
    fontSize: 13.5,
    fontWeight: 650,
    color: "#111",
    lineHeight: 1.15,
  },
  exRight: {
    marginLeft: 8,
  },
  exMeta: {
    fontSize: 12.5,
    fontWeight: 700,
    color: "#666",
    whiteSpace: "nowrap",
  },
  emptyState: {
    padding: "16px 12px",
    textAlign: "center",
    fontSize: 13,
    color: "#999",
  },
  moreText: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    fontWeight: 600,
  },

  error: {
    margin: "0 16px",
    background: "rgba(255,102,102,.12)",
    color: "#d32f2f",
    fontSize: 12,
    fontWeight: 600,
    padding: "10px 12px",
    borderRadius: 10,
  },

  // Кнопки
  actions: {
    margin: "0 16px 16px",
    display: "grid",
    gap: 8,
  },
  startBtn: {
    border: "none",
    borderRadius: 14,
    padding: "14px",
    fontWeight: 800,
    fontSize: 15,
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    color: "#1b1b1b",
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(0,0,0,.15)",
  },
  deleteBtn: {
    border: "none",
    borderRadius: 14,
    padding: "12px",
    fontWeight: 600,
    fontSize: 14,
    background: "transparent",
    color: "#d32f2f",
    cursor: "pointer",
  },
};

const footer: Record<string, CSSProperties> = {
  ctaBar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 12,
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
  },
  btn: {
    pointerEvents: "auto",
    border: "none",
    borderRadius: 14,
    padding: "12px 18px",
    fontWeight: 800,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 10px 24px rgba(0,0,0,.18)",
    cursor: "pointer",
  },
};
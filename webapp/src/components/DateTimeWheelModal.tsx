import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;
const DATE_ITEM_W = 64;
const DEFAULT_DATE_COUNT = 45;
const MAX_DATE_COUNT = 365;
const TIME_ITEM_H = 96;
const TIME_VISIBLE = 1;
const HOUR_BASE = 24;
const MIN_BASE = 60;
const HOUR_CYCLES = 7;
const MIN_CYCLES = 7;
const HOUR_MID = Math.floor(HOUR_CYCLES / 2);
const MIN_MID = Math.floor(MIN_CYCLES / 2);

type DateItem = { date: Date; dow: string; day: number; idx: number };

export type DateTimeWheelModalProps = {
  title?: string;
  subtitle?: string;
  initialDate: string;
  initialTime: string;
  minDate?: string;
  disallowPast?: boolean;
  saving?: boolean;
  error?: string | null;
  saveLabel?: string;
  onClose: () => void;
  onSave: (date: string, time: string) => void;
};

function toDateKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toHHMM(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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

function defaultScheduleTime() {
  const hour = new Date().getHours();
  return hour < 12 ? "18:00" : "09:00";
}

function buildDates(count: number): DateItem[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return {
      date: d,
      dow: DAY_SHORT[d.getDay()],
      day: d.getDate(),
      idx: i,
    };
  });
}

function toLocalDate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const [yRaw, mRaw, dRaw] = value.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export default function DateTimeWheelModal({
  title = "Дата и время",
  subtitle,
  initialDate,
  initialTime,
  minDate,
  disallowPast = true,
  saving = false,
  error = null,
  saveLabel = "Сохранить",
  onClose,
  onSave,
}: DateTimeWheelModalProps) {
  const todayIso = useMemo(() => toDateKeyLocal(new Date()), []);
  const computedDateCount = useMemo(() => {
    const today = toLocalDate(todayIso);
    if (!today) return DEFAULT_DATE_COUNT;
    const candidates = [initialDate, minDate]
      .map((x) => (typeof x === "string" ? x : ""))
      .map((x) => toLocalDate(x))
      .filter((x): x is Date => Boolean(x));
    let maxDaysAhead = 0;
    for (const candidate of candidates) {
      const diffMs = candidate.getTime() - today.getTime();
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays > maxDaysAhead) maxDaysAhead = diffDays;
    }
    const target = Math.max(DEFAULT_DATE_COUNT, maxDaysAhead + 14);
    return Math.min(MAX_DATE_COUNT, target);
  }, [initialDate, minDate, todayIso]);
  const dates = useMemo(() => buildDates(computedDateCount), [computedDateCount]);
  const hours = useMemo(
    () => Array.from({ length: HOUR_BASE * HOUR_CYCLES }, (_, i) => i % HOUR_BASE),
    []
  );
  const minutes = useMemo(
    () => Array.from({ length: MIN_BASE * MIN_CYCLES }, (_, i) => i % MIN_BASE),
    []
  );

  const effectiveMinDate = minDate && ISO_DATE_RE.test(minDate) ? minDate : todayIso;
  const safeInitialDate =
    ISO_DATE_RE.test(initialDate) && initialDate >= effectiveMinDate
      ? initialDate
      : effectiveMinDate;

  const initialIdx = useMemo(() => {
    const idx = dates.findIndex((item) => toDateKeyLocal(item.date) === safeInitialDate);
    return idx >= 0 ? idx : 0;
  }, [dates, safeInitialDate]);
  const initialTimeParsed = parseHHMM(initialTime) || parseHHMM(defaultScheduleTime()) || { hh: 9, mm: 0 };

  const [activeIdx, setActiveIdx] = useState(initialIdx);
  const [activeHour, setActiveHour] = useState(initialTimeParsed.hh);
  const [activeMinute, setActiveMinute] = useState(initialTimeParsed.mm);

  const dateRef = useRef<HTMLDivElement>(null);
  const dateRafRef = useRef<number | null>(null);
  const dateStopTimerRef = useRef<number | null>(null);

  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const hourRafRef = useRef<number | null>(null);
  const minuteRafRef = useRef<number | null>(null);
  const hourStopTimerRef = useRef<number | null>(null);
  const minuteStopTimerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.touchAction = prevBodyTouchAction;
    };
  }, []);

  useEffect(() => {
    dateRef.current?.scrollTo({
      left: initialIdx * DATE_ITEM_W,
      behavior: "auto",
    });
    hourRef.current?.scrollTo({
      top: (HOUR_BASE * HOUR_MID + initialTimeParsed.hh) * TIME_ITEM_H,
      behavior: "auto",
    });
    minuteRef.current?.scrollTo({
      top: (MIN_BASE * MIN_MID + initialTimeParsed.mm) * TIME_ITEM_H,
      behavior: "auto",
    });
  }, [initialIdx, initialTimeParsed.hh, initialTimeParsed.mm]);

  const handleDateScroll = useCallback(() => {
    if (dateRafRef.current == null) {
      dateRafRef.current = window.requestAnimationFrame(() => {
        dateRafRef.current = null;
        const el = dateRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollLeft / DATE_ITEM_W);
        const clamped = Math.max(0, Math.min(idx, dates.length - 1));
        if (clamped !== activeIdx) setActiveIdx(clamped);
      });
    }
    if (dateStopTimerRef.current) window.clearTimeout(dateStopTimerRef.current);
    dateStopTimerRef.current = window.setTimeout(() => {
      const el = dateRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollLeft / DATE_ITEM_W);
      const clamped = Math.max(0, Math.min(idx, dates.length - 1));
      if (clamped !== activeIdx) setActiveIdx(clamped);
      el.scrollTo({ left: clamped * DATE_ITEM_W, behavior: "smooth" });
    }, 80);
  }, [activeIdx, dates.length]);

  const handleHourScroll = useCallback(() => {
    if (hourRafRef.current == null) {
      hourRafRef.current = window.requestAnimationFrame(() => {
        hourRafRef.current = null;
        const el = hourRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollTop / TIME_ITEM_H);
        const normalized = ((idx % HOUR_BASE) + HOUR_BASE) % HOUR_BASE;
        if (normalized !== activeHour) setActiveHour(normalized);
      });
    }
    if (hourStopTimerRef.current) window.clearTimeout(hourStopTimerRef.current);
    hourStopTimerRef.current = window.setTimeout(() => {
      const el = hourRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / TIME_ITEM_H);
      const normalized = ((idx % HOUR_BASE) + HOUR_BASE) % HOUR_BASE;
      if (normalized !== activeHour) setActiveHour(normalized);
      const targetIdx = HOUR_BASE * HOUR_MID + normalized;
      el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
    }, 80);
  }, [activeHour]);

  const handleMinuteScroll = useCallback(() => {
    if (minuteRafRef.current == null) {
      minuteRafRef.current = window.requestAnimationFrame(() => {
        minuteRafRef.current = null;
        const el = minuteRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollTop / TIME_ITEM_H);
        const normalized = ((idx % MIN_BASE) + MIN_BASE) % MIN_BASE;
        if (normalized !== activeMinute) setActiveMinute(normalized);
      });
    }
    if (minuteStopTimerRef.current) window.clearTimeout(minuteStopTimerRef.current);
    minuteStopTimerRef.current = window.setTimeout(() => {
      const el = minuteRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / TIME_ITEM_H);
      const normalized = ((idx % MIN_BASE) + MIN_BASE) % MIN_BASE;
      if (normalized !== activeMinute) setActiveMinute(normalized);
      const targetIdx = MIN_BASE * MIN_MID + normalized;
      el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
    }, 80);
  }, [activeMinute]);

  useEffect(() => {
    return () => {
      if (dateRafRef.current) window.cancelAnimationFrame(dateRafRef.current);
      if (dateStopTimerRef.current) window.clearTimeout(dateStopTimerRef.current);
      if (hourRafRef.current) window.cancelAnimationFrame(hourRafRef.current);
      if (minuteRafRef.current) window.cancelAnimationFrame(minuteRafRef.current);
      if (hourStopTimerRef.current) window.clearTimeout(hourStopTimerRef.current);
      if (minuteStopTimerRef.current) window.clearTimeout(minuteStopTimerRef.current);
    };
  }, []);

  const selectedDate = dates[activeIdx];
  const selectedDateIso = selectedDate ? toDateKeyLocal(selectedDate.date) : effectiveMinDate;
  const selectedTime = toHHMM(activeHour, activeMinute);
  const selectedWhen = new Date(`${selectedDateIso}T${selectedTime}`);
  const selectionValid = Number.isFinite(selectedWhen.getTime());
  const nowMinute = new Date();
  nowMinute.setSeconds(0, 0);
  const isPastSelection = disallowPast && (!selectionValid || selectedWhen.getTime() < nowMinute.getTime());

  if (typeof document === "undefined") return null;

  return createPortal(
    <div style={st.wrap} role="dialog" aria-modal="true">
      <style>{styles}</style>
      <div style={st.card}>
        <div style={st.header}>
          <div style={st.titleWrap}>
            <div style={st.title}>{title}</div>
            {subtitle ? <div style={st.subtitle}>{subtitle}</div> : null}
          </div>
          <button type="button" style={st.close} onClick={onClose} disabled={saving} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div style={st.dateScroller}>
          <div style={st.dateIndicator} />
          <div style={st.dateFadeL} />
          <div style={st.dateFadeR} />
          <div ref={dateRef} style={st.dateTrack} className="dtw-date-track" onScroll={handleDateScroll}>
            {dates.map((d, idx) => {
              const active = idx === activeIdx;
              return (
                <button
                  key={idx}
                  type="button"
                  className="dtw-date-item"
                  style={{ ...st.dateItem, scrollSnapAlign: "center" }}
                  onClick={() => {
                    setActiveIdx(idx);
                    dateRef.current?.scrollTo({ left: idx * DATE_ITEM_W, behavior: "smooth" });
                  }}
                >
                  <span style={{ ...st.dateDow, ...(active ? st.dateDowActive : null) }}>{d.dow}</span>
                  <span style={{ ...st.dateNum, ...(active ? st.dateNumActive : null) }}>{d.day}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={st.timeWrap}>
          <div style={st.timeColon}>:</div>
          <div style={st.timeInner}>
            <div style={st.timeColWrap}>
              <div ref={hourRef} style={st.timeList} className="dtw-time-track" onScroll={handleHourScroll}>
                <div style={{ height: 0 }} />
                {hours.map((h, idx) => (
                  <button
                    key={`${h}-${idx}`}
                    type="button"
                    className="dtw-time-item"
                    style={{ ...st.timeItem, ...(h === activeHour ? st.timeItemActive : null) }}
                    onClick={() => {
                      const next = (activeHour + 1) % HOUR_BASE;
                      const el = hourRef.current;
                      if (!el) return;
                      const curIdx = Math.round(el.scrollTop / TIME_ITEM_H);
                      const curVal = ((curIdx % HOUR_BASE) + HOUR_BASE) % HOUR_BASE;
                      let targetIdx = curIdx - curVal + next;
                      if (next <= curVal) targetIdx += HOUR_BASE;
                      setActiveHour(next);
                      el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
                    }}
                  >
                    {String(h).padStart(2, "0")}
                  </button>
                ))}
                <div style={{ height: 0 }} />
              </div>
            </div>

            <div style={st.timeColWrap}>
              <div ref={minuteRef} style={st.timeList} className="dtw-time-track" onScroll={handleMinuteScroll}>
                <div style={{ height: 0 }} />
                {minutes.map((m, idx) => (
                  <button
                    key={`${m}-${idx}`}
                    type="button"
                    className="dtw-time-item"
                    style={{ ...st.timeItem, ...(m === activeMinute ? st.timeItemActive : null) }}
                    onClick={() => {
                      const next = (activeMinute + 1) % MIN_BASE;
                      const el = minuteRef.current;
                      if (!el) return;
                      const curIdx = Math.round(el.scrollTop / TIME_ITEM_H);
                      const curVal = ((curIdx % MIN_BASE) + MIN_BASE) % MIN_BASE;
                      let targetIdx = curIdx - curVal + next;
                      if (next <= curVal) targetIdx += MIN_BASE;
                      setActiveMinute(next);
                      el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
                    }}
                  >
                    {String(m).padStart(2, "0")}
                  </button>
                ))}
                <div style={{ height: 0 }} />
              </div>
            </div>
          </div>
        </div>

        {isPastSelection ? <div style={st.pastWarn}>Нельзя выбрать прошедшие дату и время</div> : null}
        {error ? <div style={st.error}>{error}</div> : null}

        <button
          type="button"
          className="dtw-save"
          style={{ ...st.save, ...((saving || isPastSelection) ? st.saveDisabled : null) }}
          disabled={saving || isPastSelection}
          onClick={() => onSave(selectedDateIso, selectedTime)}
        >
          {saving ? "Сохраняю..." : saveLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}

const styles = `
  .dtw-date-track::-webkit-scrollbar { display: none; }
  .dtw-time-track::-webkit-scrollbar { display: none; }
  .dtw-date-item, .dtw-time-item {
    -webkit-tap-highlight-color: transparent;
  }
  .dtw-save:active:not(:disabled) {
    transform: translateY(1px) scale(0.995);
  }
`;

const st: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    zIndex: 2400,
    background: "rgba(0,0,0,0.38)",
    display: "grid",
    placeItems: "end center",
    padding: 12,
  },
  card: {
    width: "min(720px, 100%)",
    borderRadius: 20,
    background: "rgba(255,255,255,0.98)",
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.32)",
    padding: "14px 14px calc(env(safe-area-inset-bottom, 0px) + 14px)",
    display: "grid",
    gap: 12,
    maxHeight: "92vh",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  titleWrap: { display: "grid", gap: 2 },
  title: { fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 },
  subtitle: { fontSize: 13, fontWeight: 600, color: "#475569" },
  close: {
    border: "none",
    background: "rgba(15,23,42,0.08)",
    width: 34,
    height: 34,
    borderRadius: 10,
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1,
    cursor: "pointer",
  },
  dateScroller: {
    position: "relative",
    borderRadius: 16,
    background: "rgba(241,245,249,0.7)",
    border: "1px solid rgba(15,23,42,0.08)",
    overflow: "hidden",
    paddingBlock: 4,
  },
  dateIndicator: {
    position: "absolute",
    top: 6,
    bottom: 6,
    left: "50%",
    transform: "translateX(-50%)",
    width: DATE_ITEM_W * 1.15,
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.96)",
    pointerEvents: "none",
    zIndex: 2,
  },
  dateFadeL: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: DATE_ITEM_W * 1.1,
    background: "linear-gradient(to right, rgba(241,245,249,1), rgba(241,245,249,0))",
    pointerEvents: "none",
    zIndex: 3,
  },
  dateFadeR: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: DATE_ITEM_W * 1.1,
    background: "linear-gradient(to left, rgba(241,245,249,1), rgba(241,245,249,0))",
    pointerEvents: "none",
    zIndex: 3,
  },
  dateTrack: {
    display: "flex",
    overflowX: "auto",
    scrollSnapType: "x proximity",
    scrollbarWidth: "none",
    paddingLeft: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    paddingRight: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    position: "relative",
    zIndex: 1,
  },
  dateItem: {
    width: DATE_ITEM_W,
    minWidth: DATE_ITEM_W,
    height: 72,
    border: "none",
    background: "transparent",
    color: "#334155",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    gap: 3,
    borderRadius: 10,
  },
  dateDow: { fontSize: 12, fontWeight: 700, opacity: 0.85 },
  dateDowActive: { color: "#0f172a", opacity: 1 },
  dateNum: { fontSize: 20, fontWeight: 800, lineHeight: 1 },
  dateNumActive: { color: "#0f172a", transform: "scale(1.03)" },
  timeWrap: {
    position: "relative",
    borderRadius: 16,
    padding: "8px 6px",
    background: "rgba(241,245,249,0.7)",
    border: "1px solid rgba(15,23,42,0.08)",
  },
  timeColon: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 34,
    fontWeight: 700,
    lineHeight: 1,
    color: "rgba(15,23,42,0.35)",
    pointerEvents: "none",
    zIndex: 5,
  },
  timeInner: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    alignItems: "center",
    gap: 12,
  },
  timeColWrap: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  timeList: {
    height: TIME_ITEM_H * TIME_VISIBLE,
    overflowY: "auto",
    scrollSnapType: "y proximity",
    scrollbarWidth: "none",
  },
  timeItem: {
    width: "100%",
    height: TIME_ITEM_H,
    border: "none",
    background: "transparent",
    color: "rgba(15,23,42,0.4)",
    fontSize: 48,
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    scrollSnapAlign: "center",
    cursor: "pointer",
  },
  timeItemActive: {
    color: "#0f172a",
    textShadow: "0 1px 0 rgba(255,255,255,0.45)",
  },
  pastWarn: {
    marginTop: -2,
    borderRadius: 12,
    background: "rgba(251,191,36,0.2)",
    border: "1px solid rgba(217,119,6,0.36)",
    color: "#92400e",
    fontSize: 12,
    fontWeight: 700,
    padding: "8px 10px",
  },
  error: {
    borderRadius: 12,
    background: "rgba(239,68,68,0.14)",
    border: "1px solid rgba(239,68,68,0.28)",
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: 700,
    padding: "8px 10px",
  },
  save: {
    marginTop: 2,
    border: "none",
    width: "100%",
    borderRadius: 14,
    padding: "14px 16px",
    fontSize: 16,
    fontWeight: 800,
    color: "#0b1220",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
    cursor: "pointer",
    transition: "transform 120ms ease, filter 120ms ease, opacity 120ms ease",
  },
  saveDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
    boxShadow: "none",
  },
};

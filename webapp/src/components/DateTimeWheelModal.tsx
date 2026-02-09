import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { fireHapticImpact } from "@/utils/haptics";

const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

const DATE_ITEM_W = 64;
const DATE_PAST_DAYS = 7;
const DEFAULT_DATE_COUNT = 37;
const MAX_DATE_COUNT = 365;

const TIME_ITEM_H = 96;
const TIME_VISIBLE = 1;
const TIME_COL_GAP = 14;

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

function toLocalDate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const [yRaw, mRaw, dRaw] = value.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function buildDates(count: number, offsetDays: number): DateItem[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i - offsetDays);
    return {
      date: d,
      dow: DAY_SHORT[d.getDay()],
      day: d.getDate(),
      idx: i,
    };
  });
}

export default function DateTimeWheelModal({
  initialDate,
  initialTime,
  minDate,
  disallowPast = true,
  saving = false,
  saveLabel = "Сохранить",
  onClose,
  onSave,
}: DateTimeWheelModalProps) {
  const todayIso = useMemo(() => toDateKeyLocal(new Date()), []);
  const effectiveMinDate = minDate && ISO_DATE_RE.test(minDate) ? minDate : todayIso;
  const safeInitialDate =
    ISO_DATE_RE.test(initialDate) && initialDate >= effectiveMinDate ? initialDate : effectiveMinDate;

  const dateCount = useMemo(() => {
    const today = toLocalDate(todayIso);
    if (!today) return DEFAULT_DATE_COUNT;

    const candidates = [safeInitialDate, effectiveMinDate]
      .map((x) => toLocalDate(x))
      .filter((x): x is Date => Boolean(x));

    let maxDaysAhead = 0;
    for (const candidate of candidates) {
      const diffMs = candidate.getTime() - today.getTime();
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays > maxDaysAhead) maxDaysAhead = diffDays;
    }

    const target = Math.max(DEFAULT_DATE_COUNT, DATE_PAST_DAYS + maxDaysAhead + 15);
    return Math.min(MAX_DATE_COUNT, target);
  }, [effectiveMinDate, safeInitialDate, todayIso]);

  const dates = useMemo(() => buildDates(dateCount, DATE_PAST_DAYS), [dateCount]);

  const hours = useMemo(
    () => Array.from({ length: HOUR_BASE * HOUR_CYCLES }, (_, i) => i % HOUR_BASE),
    []
  );
  const minutes = useMemo(
    () => Array.from({ length: MIN_BASE * MIN_CYCLES }, (_, i) => i % MIN_BASE),
    []
  );

  const initialIdx = useMemo(() => {
    const idx = dates.findIndex((item) => toDateKeyLocal(item.date) === safeInitialDate);
    if (idx >= 0) return idx;
    const todayIdx = dates.findIndex((item) => toDateKeyLocal(item.date) === todayIso);
    return todayIdx >= 0 ? todayIdx : Math.min(DATE_PAST_DAYS, dates.length - 1);
  }, [dates, safeInitialDate, todayIso]);

  const initialTimeParsed = parseHHMM(initialTime) || { hh: 9, mm: 0 };

  const [activeIdx, setActiveIdx] = useState(initialIdx);
  const [activeHour, setActiveHour] = useState(initialTimeParsed.hh);
  const [activeMinute, setActiveMinute] = useState(initialTimeParsed.mm);

  const dateRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  const dateRafRef = useRef<number | null>(null);
  const hourRafRef = useRef<number | null>(null);
  const minuteRafRef = useRef<number | null>(null);

  const dateStopTimerRef = useRef<number | null>(null);
  const hourStopTimerRef = useRef<number | null>(null);
  const minuteStopTimerRef = useRef<number | null>(null);

  const suppressHapticsRef = useRef(true);
  const lastDateTickRef = useRef<number | null>(null);
  const lastHourTickRef = useRef<number | null>(null);
  const lastMinuteTickRef = useRef<number | null>(null);

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
    dateRef.current?.scrollTo({ left: initialIdx * DATE_ITEM_W, behavior: "auto" });
    hourRef.current?.scrollTo({
      top: (HOUR_BASE * HOUR_MID + initialTimeParsed.hh) * TIME_ITEM_H,
      behavior: "auto",
    });
    minuteRef.current?.scrollTo({
      top: (MIN_BASE * MIN_MID + initialTimeParsed.mm) * TIME_ITEM_H,
      behavior: "auto",
    });

    lastDateTickRef.current = initialIdx;
    lastHourTickRef.current = HOUR_BASE * HOUR_MID + initialTimeParsed.hh;
    lastMinuteTickRef.current = MIN_BASE * MIN_MID + initialTimeParsed.mm;
  }, [initialIdx, initialTimeParsed.hh, initialTimeParsed.mm]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      suppressHapticsRef.current = false;
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  const handleDateScroll = useCallback(() => {
    if (dateRafRef.current == null) {
      dateRafRef.current = window.requestAnimationFrame(() => {
        dateRafRef.current = null;
        const el = dateRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollLeft / DATE_ITEM_W);
        const clamped = Math.max(0, Math.min(idx, dates.length - 1));

        if (lastDateTickRef.current !== clamped) {
          lastDateTickRef.current = clamped;
          if (!suppressHapticsRef.current) fireHapticImpact("light");
        }
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
      if (!suppressHapticsRef.current) fireHapticImpact("light");
    }, 80);
  }, [activeIdx, dates.length]);

  const handleHourScroll = useCallback(() => {
    if (hourRafRef.current == null) {
      hourRafRef.current = window.requestAnimationFrame(() => {
        hourRafRef.current = null;
        const el = hourRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollTop / TIME_ITEM_H);
        const clamped = Math.max(0, Math.min(idx, hours.length - 1));

        if (lastHourTickRef.current !== clamped) {
          lastHourTickRef.current = clamped;
          if (!suppressHapticsRef.current) fireHapticImpact("light");
        }

        const value = ((clamped % HOUR_BASE) + HOUR_BASE) % HOUR_BASE;
        if (value !== activeHour) setActiveHour(value);
      });
    }

    if (hourStopTimerRef.current) window.clearTimeout(hourStopTimerRef.current);
    hourStopTimerRef.current = window.setTimeout(() => {
      const el = hourRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / TIME_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, hours.length - 1));
      const value = ((clamped % HOUR_BASE) + HOUR_BASE) % HOUR_BASE;
      if (value !== activeHour) setActiveHour(value);
      const targetIdx = HOUR_BASE * HOUR_MID + value;
      el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
      if (!suppressHapticsRef.current) fireHapticImpact("light");
    }, 80);
  }, [activeHour, hours.length]);

  const handleMinuteScroll = useCallback(() => {
    if (minuteRafRef.current == null) {
      minuteRafRef.current = window.requestAnimationFrame(() => {
        minuteRafRef.current = null;
        const el = minuteRef.current;
        if (!el) return;
        const idx = Math.round(el.scrollTop / TIME_ITEM_H);
        const clamped = Math.max(0, Math.min(idx, minutes.length - 1));

        if (lastMinuteTickRef.current !== clamped) {
          lastMinuteTickRef.current = clamped;
          if (!suppressHapticsRef.current) fireHapticImpact("light");
        }

        const value = ((clamped % MIN_BASE) + MIN_BASE) % MIN_BASE;
        if (value !== activeMinute) setActiveMinute(value);
      });
    }

    if (minuteStopTimerRef.current) window.clearTimeout(minuteStopTimerRef.current);
    minuteStopTimerRef.current = window.setTimeout(() => {
      const el = minuteRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / TIME_ITEM_H);
      const clamped = Math.max(0, Math.min(idx, minutes.length - 1));
      const value = ((clamped % MIN_BASE) + MIN_BASE) % MIN_BASE;
      if (value !== activeMinute) setActiveMinute(value);
      const targetIdx = MIN_BASE * MIN_MID + value;
      el.scrollTo({ top: targetIdx * TIME_ITEM_H, behavior: "smooth" });
      if (!suppressHapticsRef.current) fireHapticImpact("light");
    }, 80);
  }, [activeMinute, minutes.length]);

  useEffect(() => {
    return () => {
      if (dateRafRef.current) window.cancelAnimationFrame(dateRafRef.current);
      if (hourRafRef.current) window.cancelAnimationFrame(hourRafRef.current);
      if (minuteRafRef.current) window.cancelAnimationFrame(minuteRafRef.current);

      if (dateStopTimerRef.current) window.clearTimeout(dateStopTimerRef.current);
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
      <div style={st.card} className="dtw-card-enter">
        <button
          type="button"
          style={st.close}
          className="dtw-close"
          onClick={onClose}
          disabled={saving}
          aria-label="Закрыть"
        >
          ✕
        </button>

        <div style={st.dateScroller}>
          <div style={st.dateIndicator} />
          <div style={st.dateFadeL} />
          <div style={st.dateFadeR} />
          <div ref={dateRef} style={st.dateTrack} className="date-track" onScroll={handleDateScroll}>
            {dates.map((d, idx) => {
              const active = idx === activeIdx;
              return (
                <button
                  key={idx}
                  type="button"
                  className="date-item"
                  style={{ ...st.dateItem, scrollSnapAlign: "center" }}
                  onClick={() => {
                    setActiveIdx(idx);
                    dateRef.current?.scrollTo({ left: idx * DATE_ITEM_W, behavior: "smooth" });
                    fireHapticImpact("light");
                  }}
                >
                  <span style={{ ...st.dateDow, ...(active ? st.dateDowActive : undefined) }}>{d.dow}</span>
                  <span style={{ ...st.dateNum, ...(active ? st.dateNumActive : undefined) }}>{d.day}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={st.timeWrap}>
          <div style={st.timeColonOverlay}>:</div>
          <div style={st.timeInner}>
            <div style={st.timeColWrap}>
              <div ref={hourRef} style={st.timeList} className="time-track" onScroll={handleHourScroll}>
                <div style={{ height: 0 }} />
                {hours.map((h, idx) => (
                  <button
                    key={`${h}-${idx}`}
                    type="button"
                    className="time-item"
                    style={{ ...st.timeItem, ...(h === activeHour ? st.timeItemActive : undefined) }}
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
                      fireHapticImpact("light");
                    }}
                  >
                    {String(h).padStart(2, "0")}
                  </button>
                ))}
                <div style={{ height: 0 }} />
              </div>
            </div>

            <div style={st.timeColWrap}>
              <div ref={minuteRef} style={st.timeList} className="time-track" onScroll={handleMinuteScroll}>
                <div style={{ height: 0 }} />
                {minutes.map((m, idx) => (
                  <button
                    key={`${m}-${idx}`}
                    type="button"
                    className="time-item"
                    style={{ ...st.timeItem, ...(m === activeMinute ? st.timeItemActive : undefined) }}
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
                      fireHapticImpact("light");
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

        <button
          type="button"
          style={{
            ...st.primaryBtn,
            ...(saving || isPastSelection ? st.primaryBtnDisabled : null),
          }}
          className="intro-primary-btn"
          disabled={saving || isPastSelection}
          onClick={() => {
            if (saving || isPastSelection) return;
            onSave(selectedDateIso, selectedTime);
          }}
        >
          {saving ? "Сохраняем..." : saveLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}

const styles = `
  @keyframes dtwCardIn {
    0% { opacity: 0; transform: translateY(14px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  .dtw-card-enter {
    animation: dtwCardIn 260ms ease-out both;
  }

  .date-track::-webkit-scrollbar { display: none; }
  .time-track::-webkit-scrollbar { display: none; }

  .date-item {
    appearance: none;
    outline: none;
    border: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: pan-x;
  }

  .time-item {
    appearance: none;
    outline: none;
    border: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: pan-y;
  }

  .dtw-close:active:not(:disabled) {
    transform: translateY(1px);
  }

  @media (prefers-reduced-motion: reduce) {
    .dtw-card-enter { animation: none !important; }
  }
`;

const st: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    zIndex: 2400,
    background: "rgba(0, 0, 0, 0.38)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: 12,
  },

  card: {
    width: "100%",
    maxWidth: 720,
    minWidth: 280,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.85)",
    position: "relative",
    overflow: "visible",
    padding: "44px 14px calc(env(safe-area-inset-bottom, 0px) + 16px)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  close: {
    position: "absolute",
    right: 12,
    top: 10,
    width: 30,
    height: 30,
    borderRadius: 999,
    border: "1px solid rgba(30,31,34,0.18)",
    background: "rgba(255,255,255,0.72)",
    color: "#1e1f22",
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
  },

  dateScroller: {
    position: "relative",
    overflow: "visible",
    width: "100%",
  },
  dateIndicator: {
    position: "absolute",
    left: "50%",
    top: 8,
    width: 64,
    height: 64,
    transform: "translateX(-50%)",
    borderRadius: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.35) 100%)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow:
      "0 12px 26px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.25)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    pointerEvents: "none",
    zIndex: 1,
  },
  dateFadeL: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: DATE_ITEM_W * 1.2,
    background: "linear-gradient(90deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 3,
  },
  dateFadeR: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: DATE_ITEM_W * 1.2,
    background: "linear-gradient(270deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0) 100%)",
    pointerEvents: "none",
    zIndex: 3,
  },
  dateTrack: {
    overflowX: "auto",
    overflowY: "hidden",
    whiteSpace: "nowrap",
    scrollSnapType: "x proximity",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    padding: "18px 0 16px",
    paddingLeft: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    paddingRight: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    position: "relative",
    zIndex: 2,
    display: "flex",
  },
  dateItem: {
    width: DATE_ITEM_W,
    minWidth: DATE_ITEM_W,
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: 0,
    background: "transparent",
    cursor: "pointer",
  },
  dateDow: {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(30,31,34,0.35)",
    lineHeight: 1,
    letterSpacing: 0.3,
  },
  dateDowActive: {
    color: "#1e1f22",
    fontWeight: 600,
  },
  dateNum: {
    fontSize: 24,
    fontWeight: 500,
    color: "rgba(30,31,34,0.3)",
    lineHeight: 1.3,
  },
  dateNumActive: {
    color: "#111",
    fontWeight: 700,
    fontSize: 26,
  },

  timeWrap: {
    borderRadius: 0,
    border: "none",
    background: "transparent",
    position: "relative",
    overflow: "hidden",
    width: "100%",
    alignSelf: "stretch",
    height: TIME_ITEM_H * TIME_VISIBLE,
  },
  timeInner: {
    position: "relative",
    zIndex: 2,
    height: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: TIME_COL_GAP,
    padding: "0 8px",
  },
  timeColonOverlay: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 64,
    fontWeight: 800,
    color: "#1e1f22",
    lineHeight: 1,
    zIndex: 4,
    pointerEvents: "none",
  },
  timeColWrap: {
    position: "relative",
    height: "100%",
    overflow: "hidden",
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  timeList: {
    maxHeight: "100%",
    width: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    scrollSnapType: "y proximity",
    scrollbarWidth: "none",
    WebkitOverflowScrolling: "touch",
    position: "relative",
    zIndex: 0,
    touchAction: "pan-y",
  },
  timeItem: {
    width: "100%",
    height: TIME_ITEM_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 88,
    fontWeight: 800,
    color: "#1e1f22",
    lineHeight: 1,
    scrollSnapAlign: "center",
    background: "transparent",
    boxShadow: "none",
    border: "none",
    padding: 0,
  },
  timeItemActive: {
    color: "#1e1f22",
    fontWeight: 900,
    fontSize: 92,
    lineHeight: 1,
    background: "transparent",
    boxShadow: "none",
  },

  primaryBtn: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
    marginTop: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.72,
    cursor: "default",
    boxShadow: "0 4px 8px rgba(0,0,0,0.14)",
  },
};

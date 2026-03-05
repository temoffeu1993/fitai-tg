import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { fireHapticImpact } from "@/utils/haptics";

const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

const DATE_ITEM_W = 64;
const DATE_PAST_DAYS = 7;
const DEFAULT_DATE_COUNT = 37;
const MAX_DATE_COUNT = 365;

const TIME_ITEM_H = 96;
const TIME_COL_GAP = 14;

const HOUR_BASE = 24;
const MIN_BASE = 60;

/* Physics constants for touch-based inertia */
const FRICTION = 0.95; // velocity multiplier per frame (~60fps)
const MIN_VELOCITY = 0.3; // px/frame threshold to stop
const SNAP_DURATION = 280; // ms for final snap animation

type DateItem = { date: Date; dow: string; day: number; idx: number };

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
    return { date: d, dow: DAY_SHORT[d.getDay()], day: d.getDate(), idx: i };
  });
}

/* ── Touch-based wheel column ── */
function useWheelTouch(
  totalItems: number,
  itemHeight: number,
  initialIndex: number,
  onIndexChange: (index: number) => void,
  suppressHaptics: React.RefObject<boolean>,
) {
  const offsetRef = useRef(initialIndex * itemHeight); // current scroll offset in px
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const touchStartYRef = useRef(0);
  const touchStartOffsetRef = useRef(0);
  const touchTimestampRef = useRef(0);
  const lastVelocitiesRef = useRef<number[]>([]);
  const lastIndexRef = useRef(initialIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAnimatingRef = useRef(false);
  const snapRafRef = useRef<number | null>(null);

  const maxOffset = (totalItems - 1) * itemHeight;

  const clampOffset = useCallback(
    (v: number) => Math.max(0, Math.min(v, maxOffset)),
    [maxOffset],
  );

  const getIndex = useCallback(
    (offset: number) => {
      const idx = Math.round(offset / itemHeight);
      return Math.max(0, Math.min(idx, totalItems - 1));
    },
    [itemHeight, totalItems],
  );

  // Update visual position via CSS transform (no rerender)
  const applyTransform = useCallback(
    (offset: number) => {
      const el = containerRef.current;
      if (!el) return;
      el.style.transform = `translateY(${-offset}px)`;
    },
    [],
  );

  // Check index and fire haptic + callback
  const checkIndex = useCallback(
    (offset: number) => {
      const idx = getIndex(offset);
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx;
        if (!suppressHaptics.current) fireHapticImpact("light");
        onIndexChange(idx);
      }
    },
    [getIndex, onIndexChange, suppressHaptics],
  );

  // Smooth snap to nearest item
  const snapTo = useCallback(
    (targetOffset: number) => {
      if (snapRafRef.current) cancelAnimationFrame(snapRafRef.current);
      isAnimatingRef.current = true;
      const start = offsetRef.current;
      const dist = targetOffset - start;
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / SNAP_DURATION, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + dist * eased;
        offsetRef.current = current;
        applyTransform(current);
        checkIndex(current);

        if (progress < 1) {
          snapRafRef.current = requestAnimationFrame(animate);
        } else {
          offsetRef.current = targetOffset;
          applyTransform(targetOffset);
          checkIndex(targetOffset);
          isAnimatingRef.current = false;
          snapRafRef.current = null;
        }
      };
      snapRafRef.current = requestAnimationFrame(animate);
    },
    [applyTransform, checkIndex],
  );

  // Inertia animation loop
  const startInertia = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = () => {
      let v = velocityRef.current;
      v *= FRICTION;
      velocityRef.current = v;

      let next = offsetRef.current + v;
      // Rubber-band at edges
      if (next < 0) {
        next = 0;
        velocityRef.current = 0;
      } else if (next > maxOffset) {
        next = maxOffset;
        velocityRef.current = 0;
      }
      offsetRef.current = next;
      applyTransform(next);
      checkIndex(next);

      if (Math.abs(velocityRef.current) > MIN_VELOCITY) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        // Snap to nearest
        const targetIdx = getIndex(next);
        const target = targetIdx * itemHeight;
        snapTo(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [maxOffset, applyTransform, checkIndex, getIndex, itemHeight, snapTo]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Stop any running animations
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (snapRafRef.current) { cancelAnimationFrame(snapRafRef.current); snapRafRef.current = null; }
      isAnimatingRef.current = false;
      velocityRef.current = 0;
      lastVelocitiesRef.current = [];

      const touch = e.touches[0];
      touchStartYRef.current = touch.clientY;
      touchStartOffsetRef.current = offsetRef.current;
      touchTimestampRef.current = performance.now();
    },
    [],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault(); // prevent parent scroll
      const touch = e.touches[0];
      const deltaY = touchStartYRef.current - touch.clientY; // positive = scroll down
      let newOffset = touchStartOffsetRef.current + deltaY;
      // Allow slight overscroll for feel, but clamp hard
      newOffset = clampOffset(newOffset);
      offsetRef.current = newOffset;
      applyTransform(newOffset);
      checkIndex(newOffset);

      // Track velocity (px per ms)
      const now = performance.now();
      const dt = now - touchTimestampRef.current;
      if (dt > 0) {
        const v = (newOffset - touchStartOffsetRef.current) / dt;
        lastVelocitiesRef.current.push(v);
        if (lastVelocitiesRef.current.length > 5) lastVelocitiesRef.current.shift();
      }
      // Update start for next delta
      touchStartYRef.current = touch.clientY;
      touchStartOffsetRef.current = newOffset;
      touchTimestampRef.current = now;
    },
    [clampOffset, applyTransform, checkIndex],
  );

  const onTouchEnd = useCallback(() => {
    const velocities = lastVelocitiesRef.current;
    if (velocities.length === 0) {
      // No movement, snap to current
      const targetIdx = getIndex(offsetRef.current);
      snapTo(targetIdx * itemHeight);
      return;
    }
    // Average last velocities, convert px/ms → px/frame (16.67ms)
    const avgVelocity =
      velocities.reduce((a, b) => a + b, 0) / velocities.length;
    velocityRef.current = avgVelocity * 16.67; // px per frame
    startInertia();
  }, [getIndex, snapTo, itemHeight, startInertia]);

  // Set initial position
  useEffect(() => {
    offsetRef.current = initialIndex * itemHeight;
    lastIndexRef.current = initialIndex;
    applyTransform(initialIndex * itemHeight);
  }, [initialIndex, itemHeight, applyTransform]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (snapRafRef.current) cancelAnimationFrame(snapRafRef.current);
    };
  }, []);

  return { containerRef, onTouchStart, onTouchMove, onTouchEnd };
}

export type DateTimeWheelInlineProps = {
  initialDate: string;
  initialTime: string;
  onChange: (date: string, time: string) => void;
};

export default function DateTimeWheelInline({
  initialDate,
  initialTime,
  onChange,
}: DateTimeWheelInlineProps) {
  const todayIso = useMemo(() => toDateKeyLocal(new Date()), []);
  const safeInitialDate = ISO_DATE_RE.test(initialDate) ? initialDate : todayIso;

  const dateCount = useMemo(() => {
    const today = toLocalDate(todayIso);
    if (!today) return DEFAULT_DATE_COUNT;
    const candidate = toLocalDate(safeInitialDate);
    if (!candidate) return DEFAULT_DATE_COUNT;
    const diffMs = candidate.getTime() - today.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const target = Math.max(DEFAULT_DATE_COUNT, DATE_PAST_DAYS + Math.max(0, diffDays) + 15);
    return Math.min(MAX_DATE_COUNT, target);
  }, [safeInitialDate, todayIso]);

  const dates = useMemo(() => buildDates(dateCount, DATE_PAST_DAYS), [dateCount]);

  // Flat arrays — no cycling needed with touch-based approach, but keep for wrapping
  const hourItems = useMemo(() => Array.from({ length: HOUR_BASE }, (_, i) => i), []);
  const minuteItems = useMemo(() => Array.from({ length: MIN_BASE }, (_, i) => i), []);

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

  const dateRafRef = useRef<number | null>(null);
  const dateStopTimerRef = useRef<number | null>(null);
  const suppressHapticsRef = useRef(true);
  const lastDateTickRef = useRef<number | null>(null);

  // Track latest values for onChange callback
  const latestRef = useRef({ idx: activeIdx, hh: activeHour, mm: activeMinute });

  // ── Touch-based time wheels ──
  const hourWheel = useWheelTouch(
    HOUR_BASE,
    TIME_ITEM_H,
    initialTimeParsed.hh,
    useCallback((idx: number) => setActiveHour(idx), []),
    suppressHapticsRef,
  );

  const minuteWheel = useWheelTouch(
    MIN_BASE,
    TIME_ITEM_H,
    initialTimeParsed.mm,
    useCallback((idx: number) => setActiveMinute(idx), []),
    suppressHapticsRef,
  );

  useEffect(() => {
    dateRef.current?.scrollTo({ left: initialIdx * DATE_ITEM_W, behavior: "auto" });
    lastDateTickRef.current = initialIdx;
  }, [initialIdx]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      suppressHapticsRef.current = false;
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  // Fire onChange whenever active values change
  useEffect(() => {
    const prev = latestRef.current;
    if (prev.idx === activeIdx && prev.hh === activeHour && prev.mm === activeMinute) return;
    latestRef.current = { idx: activeIdx, hh: activeHour, mm: activeMinute };
    const d = dates[activeIdx];
    if (!d) return;
    onChange(toDateKeyLocal(d.date), toHHMM(activeHour, activeMinute));
  }, [activeIdx, activeHour, activeMinute, dates, onChange]);

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

  useEffect(() => {
    return () => {
      if (dateRafRef.current) window.cancelAnimationFrame(dateRafRef.current);
      if (dateStopTimerRef.current) window.clearTimeout(dateStopTimerRef.current);
    };
  }, []);

  return (
    <div style={st.root}>
      <style>{css}</style>

      {/* Date scroller — keeps native scroll (horizontal, no conflict) */}
      <div style={st.dateScroller}>
        <div style={st.dateIndicator} />
        <div style={st.dateFadeL} />
        <div style={st.dateFadeR} />
        <div ref={dateRef} style={st.dateTrack} className="dtwi-date-track" onScroll={handleDateScroll}>
          {dates.map((d, idx) => {
            const active = idx === activeIdx;
            return (
              <button
                key={idx}
                type="button"
                className="dtwi-date-item"
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

      {/* Time wheels — custom touch-based with inertia */}
      <div style={st.timeWrap}>
        <div style={st.timeColonOverlay}>:</div>
        <div style={st.timeInner}>
          {/* Hours */}
          <div
            style={st.timeColWrap}
            onTouchStart={hourWheel.onTouchStart}
            onTouchMove={hourWheel.onTouchMove}
            onTouchEnd={hourWheel.onTouchEnd}
          >
            <div ref={hourWheel.containerRef} style={st.timeStrip}>
              {hourItems.map((h) => (
                <div
                  key={h}
                  style={{
                    ...st.timeItem,
                    ...(h === activeHour ? st.timeItemActive : undefined),
                  }}
                >
                  {String(h).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          {/* Minutes */}
          <div
            style={st.timeColWrap}
            onTouchStart={minuteWheel.onTouchStart}
            onTouchMove={minuteWheel.onTouchMove}
            onTouchEnd={minuteWheel.onTouchEnd}
          >
            <div ref={minuteWheel.containerRef} style={st.timeStrip}>
              {minuteItems.map((m) => (
                <div
                  key={m}
                  style={{
                    ...st.timeItem,
                    ...(m === activeMinute ? st.timeItemActive : undefined),
                  }}
                >
                  {String(m).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const css = `
  .dtwi-date-track::-webkit-scrollbar { display: none; }
  .dtwi-date-item {
    appearance: none; outline: none; border: none; cursor: pointer;
    -webkit-tap-highlight-color: transparent; touch-action: pan-x;
  }
`;

/* Sheet bg fade color — matches the bottom sheet gradient */
const FADE_COLOR = "rgba(250,250,252,1)";

const st: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
    paddingBottom: 8,
    flexShrink: 0,
  },

  /* ---- Date scroller ---- */
  dateScroller: {
    position: "relative",
    overflow: "visible",
    width: "100%",
  },
  dateIndicator: {
    position: "absolute",
    left: "50%",
    top: 6,
    width: 64,
    height: 60,
    transform: "translateX(-50%)",
    borderRadius: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.35) 100%)",
    border: "1px solid rgba(255,255,255,0.85)",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.10), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.25)",
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
    background: `linear-gradient(90deg, ${FADE_COLOR} 0%, rgba(250,250,252,0) 100%)`,
    pointerEvents: "none",
    zIndex: 3,
  },
  dateFadeR: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: DATE_ITEM_W * 1.2,
    background: `linear-gradient(270deg, ${FADE_COLOR} 0%, rgba(250,250,252,0) 100%)`,
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
    padding: "14px 0 12px",
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
    fontSize: 11,
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
    fontSize: 22,
    fontWeight: 500,
    color: "rgba(30,31,34,0.3)",
    lineHeight: 1.3,
  },
  dateNumActive: {
    color: "#111",
    fontWeight: 700,
    fontSize: 24,
  },

  /* ---- Time wheels ---- */
  timeWrap: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    height: TIME_ITEM_H,
    touchAction: "none", // we handle all touch ourselves
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
    touchAction: "none",
  },
  timeStrip: {
    // This is moved by transform — not native scroll
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    willChange: "transform",
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
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  timeItemActive: {
    color: "#1e1f22",
    fontWeight: 900,
    fontSize: 92,
    lineHeight: 1,
  },
};

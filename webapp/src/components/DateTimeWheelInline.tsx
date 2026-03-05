import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { fireHapticImpact } from "@/utils/haptics";

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

const DATE_ITEM_W = 64;
const DATE_PAST_DAYS = 7;
const DEFAULT_DATE_COUNT = 37;
const MAX_DATE_COUNT = 365;

const TIME_ITEM_H = 96;
const TIME_COL_GAP = 14;
const HOUR_COUNT = 24;
const MINUTE_COUNT = 60;

/* Cycling: render N copies so user can spin endlessly */
const CYCLE_COPIES = 7;
const HOUR_TOTAL = HOUR_COUNT * CYCLE_COPIES;
const MINUTE_TOTAL = MINUTE_COUNT * CYCLE_COPIES;
const HOUR_MID_COPY = Math.floor(CYCLE_COPIES / 2);
const MINUTE_MID_COPY = Math.floor(CYCLE_COPIES / 2);

/* Physics */
const DECEL = 0.96;
const VELOCITY_MIN = 0.3;
const SNAP_MS = 300;
const VELOCITY_SAMPLES = 5;
const VELOCITY_SCALE = 11;
const TAP_THRESHOLD = 6; // px — less than this = tap, not drag

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

type DateItem = { date: Date; dow: string; day: number; idx: number };

function toDateKeyLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toHHMM(h: number, m: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function parseHHMM(v: string | null | undefined) {
  if (!v || !HHMM_RE.test(v)) return null;
  const [hh, mm] = v.split(":").map(Number);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}
function toLocalDate(v: string) {
  if (!ISO_DATE_RE.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function buildDates(count: number, off: number): DateItem[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i - off);
    return { date: d, dow: DAY_SHORT[d.getDay()], day: d.getDate(), idx: i };
  });
}

/* ═══════════════════════════════════════════════════════
   useWheel — touch-based wheel with inertia + cycling
   ═══════════════════════════════════════════════════════ */

interface UseWheelOpts {
  totalItems: number;     // total rendered items (including copies for cycling)
  itemSize: number;
  axis: "x" | "y";
  initialOffset: number;  // initial offset in px
  wrap?: {                // cycling config
    base: number;         // items per cycle (e.g. 24 for hours)
    midCopy: number;      // which copy is "center"
  };
  onOffsetIndex: (index: number) => void;
}

function useWheel({ totalItems, itemSize, axis, initialOffset, wrap, onOffsetIndex }: UseWheelOpts) {
  const stripRef = useRef<HTMLDivElement>(null);
  const offset = useRef(initialOffset);
  const velocity = useRef(0);
  const lastIdx = useRef(Math.round(initialOffset / itemSize));
  const touchId = useRef<number | null>(null);
  const touchStartPos = useRef(0);
  const touchStartOff = useRef(0);
  const totalDrag = useRef(0); // track total movement for tap detection
  const samples = useRef<{ pos: number; time: number }[]>([]);
  const inertiaRaf = useRef<number | null>(null);
  const snapRaf = useRef<number | null>(null);
  const maxOff = (totalItems - 1) * itemSize;

  const clamp = useCallback((v: number) => Math.max(0, Math.min(v, maxOff)), [maxOff]);

  const apply = useCallback((off: number) => {
    const el = stripRef.current;
    if (!el) return;
    el.style.transform = axis === "y" ? `translateY(${-off}px)` : `translateX(${-off}px)`;
  }, [axis]);

  const emitIdx = useCallback((off: number) => {
    const raw = Math.round(off / itemSize);
    const idx = Math.max(0, Math.min(raw, totalItems - 1));
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      fireHapticImpact("light");
      onOffsetIndex(idx);
    }
  }, [itemSize, totalItems, onOffsetIndex]);

  // Silently normalize offset to middle copy (for cycling)
  const normalize = useCallback(() => {
    if (!wrap) return;
    const cur = offset.current;
    const idx = Math.round(cur / itemSize);
    const val = ((idx % wrap.base) + wrap.base) % wrap.base;
    const midIdx = wrap.base * wrap.midCopy + val;
    const newOff = midIdx * itemSize;
    offset.current = newOff;
    apply(newOff);
    lastIdx.current = midIdx;
  }, [wrap, itemSize, apply]);

  const snapTo = useCallback((target: number) => {
    if (snapRaf.current) cancelAnimationFrame(snapRaf.current);
    const start = offset.current;
    const delta = target - start;
    if (Math.abs(delta) < 0.5) {
      offset.current = target;
      apply(target);
      emitIdx(target);
      normalize();
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / SNAP_MS, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = start + delta * eased;
      offset.current = cur;
      apply(cur);
      emitIdx(cur);
      if (p < 1) {
        snapRaf.current = requestAnimationFrame(tick);
      } else {
        snapRaf.current = null;
        offset.current = target;
        apply(target);
        emitIdx(target);
        normalize();
      }
    };
    snapRaf.current = requestAnimationFrame(tick);
  }, [apply, emitIdx, normalize]);

  const runInertia = useCallback(() => {
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    const tick = () => {
      velocity.current *= DECEL;
      let next = offset.current + velocity.current;
      if (next <= 0) { next = 0; velocity.current = 0; }
      else if (next >= maxOff) { next = maxOff; velocity.current = 0; }
      offset.current = next;
      apply(next);
      emitIdx(next);
      if (Math.abs(velocity.current) > VELOCITY_MIN) {
        inertiaRaf.current = requestAnimationFrame(tick);
      } else {
        inertiaRaf.current = null;
        const nearIdx = Math.max(0, Math.min(Math.round(next / itemSize), totalItems - 1));
        snapTo(nearIdx * itemSize);
      }
    };
    inertiaRaf.current = requestAnimationFrame(tick);
  }, [maxOff, apply, emitIdx, snapTo, itemSize, totalItems]);

  const stopAll = useCallback(() => {
    if (inertiaRaf.current) { cancelAnimationFrame(inertiaRaf.current); inertiaRaf.current = null; }
    if (snapRaf.current) { cancelAnimationFrame(snapRaf.current); snapRaf.current = null; }
    velocity.current = 0;
  }, []);

  // ── Programmatic smooth scroll to index ──
  const scrollToIndex = useCallback((idx: number) => {
    stopAll();
    snapTo(idx * itemSize);
  }, [stopAll, snapTo, itemSize]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    stopAll();
    const t = e.changedTouches[0];
    touchId.current = t.identifier;
    const pos = axis === "y" ? t.clientY : t.clientX;
    touchStartPos.current = pos;
    touchStartOff.current = offset.current;
    totalDrag.current = 0;
    samples.current = [{ pos, time: performance.now() }];
  }, [axis, stopAll]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = Array.from(e.changedTouches).find((tt) => tt.identifier === touchId.current);
    if (!t) return;
    const pos = axis === "y" ? t.clientY : t.clientX;
    const delta = touchStartPos.current - pos;
    totalDrag.current += Math.abs(pos - (samples.current.length > 0 ? samples.current[samples.current.length - 1].pos : pos));
    const next = clamp(touchStartOff.current + delta);
    offset.current = next;
    apply(next);
    emitIdx(next);
    const now = performance.now();
    samples.current.push({ pos, time: now });
    if (samples.current.length > VELOCITY_SAMPLES) samples.current.shift();
  }, [axis, clamp, apply, emitIdx]);

  const onTouchEnd = useCallback((): boolean => {
    touchId.current = null;
    const wasTap = totalDrag.current < TAP_THRESHOLD;
    if (wasTap) {
      // Let the component handle tap
      const nearIdx = Math.max(0, Math.min(Math.round(offset.current / itemSize), totalItems - 1));
      snapTo(nearIdx * itemSize);
      return true; // was a tap
    }
    const sa = samples.current;
    if (sa.length < 2) {
      const nearIdx = Math.max(0, Math.min(Math.round(offset.current / itemSize), totalItems - 1));
      snapTo(nearIdx * itemSize);
      return false;
    }
    const first = sa[0];
    const last = sa[sa.length - 1];
    const dt = last.time - first.time;
    if (dt < 1) {
      const nearIdx = Math.max(0, Math.min(Math.round(offset.current / itemSize), totalItems - 1));
      snapTo(nearIdx * itemSize);
      return false;
    }
    const v = ((first.pos - last.pos) / dt) * VELOCITY_SCALE;
    velocity.current = v;
    if (Math.abs(v) < VELOCITY_MIN * 2) {
      const nearIdx = Math.max(0, Math.min(Math.round(offset.current / itemSize), totalItems - 1));
      snapTo(nearIdx * itemSize);
    } else {
      runInertia();
    }
    return false;
  }, [snapTo, itemSize, totalItems, runInertia]);

  useEffect(() => {
    offset.current = initialOffset;
    lastIdx.current = Math.round(initialOffset / itemSize);
    apply(initialOffset);
  }, [initialOffset, itemSize, apply]);

  useEffect(() => () => stopAll(), [stopAll]);

  return { stripRef, onTouchStart, onTouchMove, onTouchEnd, scrollToIndex, offset, stopAll };
}

/* ═══════════════════════════════════════════════════════
   DateTimeWheelInline
   ═══════════════════════════════════════════════════════ */

export type DateTimeWheelInlineProps = {
  initialDate: string;
  initialTime: string;
  onChange: (date: string, time: string) => void;
};

export default function DateTimeWheelInline({ initialDate, initialTime, onChange }: DateTimeWheelInlineProps) {
  const todayIso = useMemo(() => toDateKeyLocal(new Date()), []);
  const safeDate = ISO_DATE_RE.test(initialDate) ? initialDate : todayIso;

  const dateCount = useMemo(() => {
    const today = toLocalDate(todayIso);
    const cand = toLocalDate(safeDate);
    if (!today || !cand) return DEFAULT_DATE_COUNT;
    const diff = Math.floor((cand.getTime() - today.getTime()) / 86400000);
    return Math.min(MAX_DATE_COUNT, Math.max(DEFAULT_DATE_COUNT, DATE_PAST_DAYS + Math.max(0, diff) + 15));
  }, [safeDate, todayIso]);

  const dates = useMemo(() => buildDates(dateCount, DATE_PAST_DAYS), [dateCount]);

  // Cycled arrays for hours/minutes
  const hourItems = useMemo(() => Array.from({ length: HOUR_TOTAL }, (_, i) => i % HOUR_COUNT), []);
  const minuteItems = useMemo(() => Array.from({ length: MINUTE_TOTAL }, (_, i) => i % MINUTE_COUNT), []);

  const initDateIdx = useMemo(() => {
    const idx = dates.findIndex((d) => toDateKeyLocal(d.date) === safeDate);
    if (idx >= 0) return idx;
    const ti = dates.findIndex((d) => toDateKeyLocal(d.date) === todayIso);
    return ti >= 0 ? ti : Math.min(DATE_PAST_DAYS, dates.length - 1);
  }, [dates, safeDate, todayIso]);

  const initTime = parseHHMM(initialTime) || { hh: 9, mm: 0 };

  // Initial offsets for cycling wheels — start at middle copy
  const initHourOffset = (HOUR_COUNT * HOUR_MID_COPY + initTime.hh) * TIME_ITEM_H;
  const initMinOffset = (MINUTE_COUNT * MINUTE_MID_COPY + initTime.mm) * TIME_ITEM_H;

  const [activeDate, setActiveDate] = useState(initDateIdx);
  const [activeHour, setActiveHour] = useState(initTime.hh);
  const [activeMin, setActiveMin] = useState(initTime.mm);

  const latestRef = useRef({ d: activeDate, h: activeHour, m: activeMin });

  // Fire onChange on value changes
  useEffect(() => {
    const prev = latestRef.current;
    if (prev.d === activeDate && prev.h === activeHour && prev.m === activeMin) return;
    latestRef.current = { d: activeDate, h: activeHour, m: activeMin };
    const dt = dates[activeDate];
    if (!dt) return;
    onChange(toDateKeyLocal(dt.date), toHHMM(activeHour, activeMin));
  }, [activeDate, activeHour, activeMin, dates, onChange]);

  // ── Date wheel ──
  const dateWheel = useWheel({
    totalItems: dates.length,
    itemSize: DATE_ITEM_W,
    axis: "x",
    initialOffset: initDateIdx * DATE_ITEM_W,
    onOffsetIndex: useCallback((i: number) => setActiveDate(i), []),
  });

  // ── Hour wheel (cycled) ──
  const hourWheel = useWheel({
    totalItems: HOUR_TOTAL,
    itemSize: TIME_ITEM_H,
    axis: "y",
    initialOffset: initHourOffset,
    wrap: { base: HOUR_COUNT, midCopy: HOUR_MID_COPY },
    onOffsetIndex: useCallback((raw: number) => {
      setActiveHour(((raw % HOUR_COUNT) + HOUR_COUNT) % HOUR_COUNT);
    }, []),
  });

  // ── Minute wheel (cycled) ──
  const minWheel = useWheel({
    totalItems: MINUTE_TOTAL,
    itemSize: TIME_ITEM_H,
    axis: "y",
    initialOffset: initMinOffset,
    wrap: { base: MINUTE_COUNT, midCopy: MINUTE_MID_COPY },
    onOffsetIndex: useCallback((raw: number) => {
      setActiveMin(((raw % MINUTE_COUNT) + MINUTE_COUNT) % MINUTE_COUNT);
    }, []),
  });

  // ── Tap handlers ──
  const handleDateTap = useCallback((e: React.TouchEvent) => {
    const wasTap = dateWheel.onTouchEnd();
    if (!wasTap) return;
    // Find which item was tapped based on touch position
    const touch = e.changedTouches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    // Center of viewport = center of current item
    const centerX = rect.width / 2;
    const deltaItems = Math.round((touchX - centerX) / DATE_ITEM_W);
    if (deltaItems === 0) return; // tapped current
    const curIdx = Math.round(dateWheel.offset.current / DATE_ITEM_W);
    const newIdx = Math.max(0, Math.min(curIdx + deltaItems, dates.length - 1));
    dateWheel.scrollToIndex(newIdx);
  }, [dateWheel, dates.length]);

  const handleHourTap = useCallback((e: React.TouchEvent) => {
    const wasTap = hourWheel.onTouchEnd();
    if (!wasTap) return;
    // Tap on hour → advance by 1
    const curIdx = Math.round(hourWheel.offset.current / TIME_ITEM_H);
    hourWheel.scrollToIndex(curIdx + 1);
  }, [hourWheel]);

  const handleMinTap = useCallback((e: React.TouchEvent) => {
    const wasTap = minWheel.onTouchEnd();
    if (!wasTap) return;
    // Tap on minute → advance by 1
    const curIdx = Math.round(minWheel.offset.current / TIME_ITEM_H);
    minWheel.scrollToIndex(curIdx + 1);
  }, [minWheel]);

  return (
    <div style={st.root}>
      <style>{css}</style>

      {/* ── Date scroller ── */}
      <div style={st.dateScroller}>
        <div style={st.dateIndicator} />
        <div style={st.dateFadeL} />
        <div style={st.dateFadeR} />
        <div
          style={st.dateViewport}
          onTouchStart={dateWheel.onTouchStart}
          onTouchMove={dateWheel.onTouchMove}
          onTouchEnd={handleDateTap}
        >
          <div ref={dateWheel.stripRef} style={st.dateStrip}>
            {dates.map((d, idx) => {
              const active = idx === activeDate;
              return (
                <div key={idx} style={st.dateItem}>
                  <span style={active ? st.dateDowActive : st.dateDow}>{d.dow}</span>
                  <span style={active ? st.dateNumActive : st.dateNum}>{d.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Time wheels ── */}
      <div style={st.timeWrap}>
        <div style={st.timeColonOverlay}>:</div>
        <div style={st.timeInner}>
          {/* Hours */}
          <div
            style={st.timeViewport}
            onTouchStart={hourWheel.onTouchStart}
            onTouchMove={hourWheel.onTouchMove}
            onTouchEnd={handleHourTap}
          >
            <div ref={hourWheel.stripRef} style={st.timeStrip}>
              {hourItems.map((h, i) => (
                <div key={i} style={st.timeItem}>
                  {String(h).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          {/* Minutes */}
          <div
            style={st.timeViewport}
            onTouchStart={minWheel.onTouchStart}
            onTouchMove={minWheel.onTouchMove}
            onTouchEnd={handleMinTap}
          >
            <div ref={minWheel.stripRef} style={st.timeStrip}>
              {minuteItems.map((m, i) => (
                <div key={i} style={st.timeItem}>
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

/* ═══════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════ */

const css = ``;

const FADE_COLOR = "rgba(250,250,252,1)";

const st: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
    paddingBottom: 8,
    flexShrink: 0,
    userSelect: "none",
    WebkitUserSelect: "none",
  },

  /* ── Date ── */
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
    boxShadow: "0 12px 26px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.25)",
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
  dateViewport: {
    overflow: "hidden",
    width: "100%",
    height: 80,
    position: "relative",
    zIndex: 2,
    touchAction: "none",
  },
  dateStrip: {
    display: "flex",
    position: "absolute",
    top: 0,
    left: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    height: "100%",
    willChange: "transform",
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
  },
  dateDow: {
    fontSize: 12,
    fontWeight: 500,
    color: "rgba(30,31,34,0.35)",
    lineHeight: 1,
    letterSpacing: 0.3,
  },
  dateDowActive: {
    fontSize: 12,
    fontWeight: 600,
    color: "#1e1f22",
    lineHeight: 1,
    letterSpacing: 0.3,
  },
  dateNum: {
    fontSize: 24,
    fontWeight: 500,
    color: "rgba(30,31,34,0.3)",
    lineHeight: 1.3,
  },
  dateNumActive: {
    fontSize: 24,
    fontWeight: 700,
    color: "#111",
    lineHeight: 1.3,
  },

  /* ── Time ── */
  timeWrap: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    height: TIME_ITEM_H,
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
  timeViewport: {
    position: "relative",
    height: "100%",
    overflow: "hidden",
    flex: 1,
    touchAction: "none",
  },
  timeStrip: {
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
  },
};

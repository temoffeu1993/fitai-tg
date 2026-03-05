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

/* Physics — tuned for natural iOS-like feel */
const DECEL = 0.97;          // velocity decay per frame (higher = more glide)
const VELOCITY_MIN = 0.4;    // px/frame threshold to stop inertia
const SNAP_MS = 300;         // snap-to-item animation duration
const VELOCITY_SAMPLES = 5;  // recent touch samples for velocity calc
const VELOCITY_SCALE = 16;   // ms→frame conversion (≈ 1 frame at 60fps)

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
function buildDates(count: number, offset: number): DateItem[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i - offset);
    return { date: d, dow: DAY_SHORT[d.getDay()], day: d.getDate(), idx: i };
  });
}

/* ═══════════════════════════════════════════════════════
   useWheel — universal touch-based wheel with inertia
   Works identically on iOS & Android, inside any DOM context.
   ═══════════════════════════════════════════════════════ */

type WheelAxis = "x" | "y";

interface UseWheelOpts {
  itemCount: number;
  itemSize: number;       // px per item
  axis: WheelAxis;
  initialIndex: number;
  onIndexChange: (i: number) => void;
  haptics?: boolean;
}

function useWheel({ itemCount, itemSize, axis, initialIndex, onIndexChange, haptics = true }: UseWheelOpts) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Current pixel offset (0 = first item centered)
  const offset = useRef(initialIndex * itemSize);
  const velocity = useRef(0);
  const lastIdx = useRef(initialIndex);

  // Touch tracking
  const touchId = useRef<number | null>(null);
  const touchStart = useRef(0);       // clientX or clientY
  const touchOffset = useRef(0);      // offset at touch start
  const samples = useRef<{ pos: number; time: number }[]>([]);

  // Animation refs
  const inertiaRaf = useRef<number | null>(null);
  const snapRaf = useRef<number | null>(null);

  const maxOff = (itemCount - 1) * itemSize;

  const clamp = (v: number) => Math.max(0, Math.min(v, maxOff));
  const getIdx = (off: number) => Math.max(0, Math.min(Math.round(off / itemSize), itemCount - 1));

  const apply = useCallback((off: number) => {
    const el = stripRef.current;
    if (!el) return;
    el.style.transform = axis === "y" ? `translateY(${-off}px)` : `translateX(${-off}px)`;
  }, [axis]);

  const emitIndex = useCallback((off: number) => {
    const idx = getIdx(off);
    if (idx !== lastIdx.current) {
      lastIdx.current = idx;
      if (haptics) fireHapticImpact("light");
      onIndexChange(idx);
    }
  }, [getIdx, haptics, onIndexChange]);

  // ── Snap animation (ease-out cubic) ──
  const snapTo = useCallback((target: number) => {
    if (snapRaf.current) cancelAnimationFrame(snapRaf.current);
    const start = offset.current;
    const delta = target - start;
    if (Math.abs(delta) < 0.5) {
      offset.current = target;
      apply(target);
      emitIndex(target);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / SNAP_MS, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = start + delta * eased;
      offset.current = cur;
      apply(cur);
      emitIndex(cur);
      if (p < 1) snapRaf.current = requestAnimationFrame(tick);
      else { snapRaf.current = null; offset.current = target; apply(target); emitIndex(target); }
    };
    snapRaf.current = requestAnimationFrame(tick);
  }, [apply, emitIndex]);

  // ── Inertia loop ──
  const runInertia = useCallback(() => {
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    const tick = () => {
      velocity.current *= DECEL;
      let next = offset.current + velocity.current;

      // Clamp + kill velocity at edges
      if (next <= 0) { next = 0; velocity.current = 0; }
      else if (next >= maxOff) { next = maxOff; velocity.current = 0; }

      offset.current = next;
      apply(next);
      emitIndex(next);

      if (Math.abs(velocity.current) > VELOCITY_MIN) {
        inertiaRaf.current = requestAnimationFrame(tick);
      } else {
        inertiaRaf.current = null;
        snapTo(getIdx(next) * itemSize);
      }
    };
    inertiaRaf.current = requestAnimationFrame(tick);
  }, [maxOff, apply, emitIndex, snapTo, getIdx, itemSize]);

  // ── Stop all animations ──
  const stopAll = useCallback(() => {
    if (inertiaRaf.current) { cancelAnimationFrame(inertiaRaf.current); inertiaRaf.current = null; }
    if (snapRaf.current) { cancelAnimationFrame(snapRaf.current); snapRaf.current = null; }
    velocity.current = 0;
  }, []);

  // ── Touch handlers ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    stopAll();
    const t = e.changedTouches[0];
    touchId.current = t.identifier;
    touchStart.current = axis === "y" ? t.clientY : t.clientX;
    touchOffset.current = offset.current;
    samples.current = [{ pos: touchStart.current, time: performance.now() }];
  }, [axis, stopAll]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = Array.from(e.changedTouches).find((tt) => tt.identifier === touchId.current);
    if (!t) return;
    const pos = axis === "y" ? t.clientY : t.clientX;
    const delta = touchStart.current - pos; // positive = scroll forward
    const next = clamp(touchOffset.current + delta);
    offset.current = next;
    apply(next);
    emitIndex(next);

    // Record sample
    const now = performance.now();
    samples.current.push({ pos, time: now });
    if (samples.current.length > VELOCITY_SAMPLES) samples.current.shift();
  }, [axis, clamp, apply, emitIndex]);

  const onTouchEnd = useCallback(() => {
    touchId.current = null;
    const s = samples.current;
    if (s.length < 2) {
      snapTo(getIdx(offset.current) * itemSize);
      return;
    }
    const first = s[0];
    const last = s[s.length - 1];
    const dt = last.time - first.time;
    if (dt < 1) { snapTo(getIdx(offset.current) * itemSize); return; }
    // px/ms → px/frame
    const v = ((first.pos - last.pos) / dt) * VELOCITY_SCALE;
    velocity.current = v;

    if (Math.abs(v) < VELOCITY_MIN * 2) {
      snapTo(getIdx(offset.current) * itemSize);
    } else {
      runInertia();
    }
  }, [snapTo, getIdx, itemSize, runInertia]);

  // Set initial position (no animation)
  useEffect(() => {
    offset.current = initialIndex * itemSize;
    lastIdx.current = initialIndex;
    apply(initialIndex * itemSize);
  }, [initialIndex, itemSize, apply]);

  // Cleanup
  useEffect(() => () => stopAll(), [stopAll]);

  return { stripRef, onTouchStart, onTouchMove, onTouchEnd };
}

/* ═══════════════════════════════════════════════════════
   DateTimeWheelInline — main component
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
  const hours = useMemo(() => Array.from({ length: HOUR_COUNT }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: MINUTE_COUNT }, (_, i) => i), []);

  const initDateIdx = useMemo(() => {
    const idx = dates.findIndex((d) => toDateKeyLocal(d.date) === safeDate);
    if (idx >= 0) return idx;
    const ti = dates.findIndex((d) => toDateKeyLocal(d.date) === todayIso);
    return ti >= 0 ? ti : Math.min(DATE_PAST_DAYS, dates.length - 1);
  }, [dates, safeDate, todayIso]);

  const initTime = parseHHMM(initialTime) || { hh: 9, mm: 0 };

  const [activeDate, setActiveDate] = useState(initDateIdx);
  const [activeHour, setActiveHour] = useState(initTime.hh);
  const [activeMin, setActiveMin] = useState(initTime.mm);

  const suppressRef = useRef(true);
  const latestRef = useRef({ d: activeDate, h: activeHour, m: activeMin });

  useEffect(() => {
    const t = setTimeout(() => { suppressRef.current = false; }, 200);
    return () => clearTimeout(t);
  }, []);

  // Fire onChange on value changes
  useEffect(() => {
    const prev = latestRef.current;
    if (prev.d === activeDate && prev.h === activeHour && prev.m === activeMin) return;
    latestRef.current = { d: activeDate, h: activeHour, m: activeMin };
    const dt = dates[activeDate];
    if (!dt) return;
    onChange(toDateKeyLocal(dt.date), toHHMM(activeHour, activeMin));
  }, [activeDate, activeHour, activeMin, dates, onChange]);

  // ── Date wheel (horizontal) ──
  const dateWheel = useWheel({
    itemCount: dates.length,
    itemSize: DATE_ITEM_W,
    axis: "x",
    initialIndex: initDateIdx,
    onIndexChange: useCallback((i: number) => setActiveDate(i), []),
    haptics: true,
  });

  // ── Hour wheel (vertical) ──
  const hourWheel = useWheel({
    itemCount: HOUR_COUNT,
    itemSize: TIME_ITEM_H,
    axis: "y",
    initialIndex: initTime.hh,
    onIndexChange: useCallback((i: number) => setActiveHour(i), []),
    haptics: true,
  });

  // ── Minute wheel (vertical) ──
  const minWheel = useWheel({
    itemCount: MINUTE_COUNT,
    itemSize: TIME_ITEM_H,
    axis: "y",
    initialIndex: initTime.mm,
    onIndexChange: useCallback((i: number) => setActiveMin(i), []),
    haptics: true,
  });

  return (
    <div style={s.root}>
      <style>{css}</style>

      {/* ── Date scroller ── */}
      <div style={s.dateScroller}>
        <div style={s.dateIndicator} />
        <div style={s.dateFadeL} />
        <div style={s.dateFadeR} />
        <div
          style={s.dateViewport}
          onTouchStart={dateWheel.onTouchStart}
          onTouchMove={dateWheel.onTouchMove}
          onTouchEnd={dateWheel.onTouchEnd}
        >
          <div ref={dateWheel.stripRef} style={s.dateStrip}>
            {dates.map((d, idx) => {
              const active = idx === activeDate;
              return (
                <div key={idx} style={s.dateItem}>
                  <span style={{ ...s.dateDow, ...(active ? s.dateDowActive : undefined) }}>{d.dow}</span>
                  <span style={{ ...s.dateNum, ...(active ? s.dateNumActive : undefined) }}>{d.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Time wheels ── */}
      <div style={s.timeWrap}>
        <div style={s.timeColonOverlay}>:</div>
        <div style={s.timeInner}>
          {/* Hours */}
          <div
            style={s.timeViewport}
            onTouchStart={hourWheel.onTouchStart}
            onTouchMove={hourWheel.onTouchMove}
            onTouchEnd={hourWheel.onTouchEnd}
          >
            <div ref={hourWheel.stripRef} style={s.timeStrip}>
              {hours.map((h) => (
                <div key={h} style={{ ...s.timeItem, ...(h === activeHour ? s.timeItemActive : undefined) }}>
                  {String(h).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          {/* Minutes */}
          <div
            style={s.timeViewport}
            onTouchStart={minWheel.onTouchStart}
            onTouchMove={minWheel.onTouchMove}
            onTouchEnd={minWheel.onTouchEnd}
          >
            <div ref={minWheel.stripRef} style={s.timeStrip}>
              {minutes.map((m) => (
                <div key={m} style={{ ...s.timeItem, ...(m === activeMin ? s.timeItemActive : undefined) }}>
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

const css = `
  .dtwi-no-select {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
`;

const FADE_COLOR = "rgba(250,250,252,1)";

const s: Record<string, CSSProperties> = {
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
  timeItemActive: {
    fontWeight: 900,
    fontSize: 92,
  },
};

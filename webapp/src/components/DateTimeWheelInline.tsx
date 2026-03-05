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
const HOUR_COUNT = 24;
const MINUTE_COUNT = 60;

const CYCLE_COPIES = 7;
const HOUR_TOTAL = HOUR_COUNT * CYCLE_COPIES;
const MINUTE_TOTAL = MINUTE_COUNT * CYCLE_COPIES;
const HOUR_MID_COPY = Math.floor(CYCLE_COPIES / 2);
const MINUTE_MID_COPY = Math.floor(CYCLE_COPIES / 2);

/* Physics */
const DECEL = 0.96;
const VELOCITY_MIN = 0.3;
const SNAP_MS = 450;
const VELOCITY_SAMPLES = 5;
const VELOCITY_SCALE = 11;
const TAP_THRESHOLD = 6;

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
   useWheel — touch-based wheel with inertia

   Key: NO React state changes during drag/inertia.
   Only fires onSettle when animation completes.
   Haptics fire via ref tracking (no re-render).
   ═══════════════════════════════════════════════════════ */

interface UseWheelOpts {
  totalItems: number;
  itemSize: number;
  axis: "x" | "y";
  initialOffset: number;
  wrap?: { base: number; midCopy: number };
  onSettle: (index: number) => void; // fires ONLY when snap completes
}

function useWheel({ totalItems, itemSize, axis, initialOffset, wrap, onSettle }: UseWheelOpts) {
  const stripRef = useRef<HTMLDivElement>(null);
  const offset = useRef(initialOffset);
  const velocity = useRef(0);
  const lastHapticIdx = useRef(Math.round(initialOffset / itemSize));
  const touchId = useRef<number | null>(null);
  const touchStartPos = useRef(0);
  const touchStartOff = useRef(0);
  const totalDrag = useRef(0);
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

  // Haptic only — no state change, no re-render
  const tickHaptic = useCallback((off: number) => {
    const idx = Math.max(0, Math.min(Math.round(off / itemSize), totalItems - 1));
    if (idx !== lastHapticIdx.current) {
      lastHapticIdx.current = idx;
      fireHapticImpact("light");
    }
  }, [itemSize, totalItems]);

  const normalize = useCallback(() => {
    if (!wrap) return;
    const idx = Math.round(offset.current / itemSize);
    const val = ((idx % wrap.base) + wrap.base) % wrap.base;
    const midIdx = wrap.base * wrap.midCopy + val;
    const newOff = midIdx * itemSize;
    offset.current = newOff;
    apply(newOff);
    lastHapticIdx.current = midIdx;
  }, [wrap, itemSize, apply]);

  const snapTo = useCallback((target: number, silent = false) => {
    if (snapRaf.current) cancelAnimationFrame(snapRaf.current);
    const start = offset.current;
    const delta = target - start;
    if (Math.abs(delta) < 0.5) {
      offset.current = target;
      apply(target);
      normalize();
      if (!silent) onSettle(Math.round(target / itemSize));
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / SNAP_MS, 1);
      // ease-in-out: smooth start and end
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const cur = start + delta * eased;
      offset.current = cur;
      apply(cur);
      tickHaptic(cur);
      if (p < 1) {
        snapRaf.current = requestAnimationFrame(tick);
      } else {
        snapRaf.current = null;
        offset.current = target;
        apply(target);
        normalize();
        if (!silent) onSettle(Math.round(target / itemSize));
      }
    };
    snapRaf.current = requestAnimationFrame(tick);
  }, [apply, tickHaptic, normalize, onSettle, itemSize]);

  const runInertia = useCallback(() => {
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    const tick = () => {
      velocity.current *= DECEL;
      let next = offset.current + velocity.current;
      if (next <= 0) { next = 0; velocity.current = 0; }
      else if (next >= maxOff) { next = maxOff; velocity.current = 0; }
      offset.current = next;
      apply(next);
      tickHaptic(next);
      if (Math.abs(velocity.current) > VELOCITY_MIN) {
        inertiaRaf.current = requestAnimationFrame(tick);
      } else {
        inertiaRaf.current = null;
        const nearIdx = Math.max(0, Math.min(Math.round(next / itemSize), totalItems - 1));
        snapTo(nearIdx * itemSize);
      }
    };
    inertiaRaf.current = requestAnimationFrame(tick);
  }, [maxOff, apply, tickHaptic, snapTo, itemSize, totalItems]);

  const stopAll = useCallback(() => {
    if (inertiaRaf.current) { cancelAnimationFrame(inertiaRaf.current); inertiaRaf.current = null; }
    if (snapRaf.current) { cancelAnimationFrame(snapRaf.current); snapRaf.current = null; }
    velocity.current = 0;
  }, []);

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
    const prevPos = samples.current.length > 0 ? samples.current[samples.current.length - 1].pos : pos;
    totalDrag.current += Math.abs(pos - prevPos);
    const delta = touchStartPos.current - pos;
    const next = clamp(touchStartOff.current + delta);
    offset.current = next;
    apply(next);
    tickHaptic(next);
    const now = performance.now();
    samples.current.push({ pos, time: now });
    if (samples.current.length > VELOCITY_SAMPLES) samples.current.shift();
  }, [axis, clamp, apply, tickHaptic]);

  const onTouchEnd = useCallback((): boolean => {
    touchId.current = null;
    const wasTap = totalDrag.current < TAP_THRESHOLD;
    const nearIdx = Math.max(0, Math.min(Math.round(offset.current / itemSize), totalItems - 1));
    if (wasTap) {
      snapTo(nearIdx * itemSize);
      return true;
    }
    const sa = samples.current;
    if (sa.length < 2) { snapTo(nearIdx * itemSize); return false; }
    const first = sa[0];
    const last = sa[sa.length - 1];
    const dt = last.time - first.time;
    if (dt < 1) { snapTo(nearIdx * itemSize); return false; }
    const v = ((first.pos - last.pos) / dt) * VELOCITY_SCALE;
    velocity.current = v;
    if (Math.abs(v) < VELOCITY_MIN * 2) {
      snapTo(nearIdx * itemSize);
    } else {
      runInertia();
    }
    return false;
  }, [snapTo, itemSize, totalItems, runInertia]);

  useEffect(() => {
    offset.current = initialOffset;
    lastHapticIdx.current = Math.round(initialOffset / itemSize);
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
  const hourItems = useMemo(() => Array.from({ length: HOUR_TOTAL }, (_, i) => i % HOUR_COUNT), []);
  const minuteItems = useMemo(() => Array.from({ length: MINUTE_TOTAL }, (_, i) => i % MINUTE_COUNT), []);

  const initDateIdx = useMemo(() => {
    const idx = dates.findIndex((d) => toDateKeyLocal(d.date) === safeDate);
    if (idx >= 0) return idx;
    const ti = dates.findIndex((d) => toDateKeyLocal(d.date) === todayIso);
    return ti >= 0 ? ti : Math.min(DATE_PAST_DAYS, dates.length - 1);
  }, [dates, safeDate, todayIso]);

  const initTime = parseHHMM(initialTime) || { hh: 9, mm: 0 };
  const initHourOffset = (HOUR_COUNT * HOUR_MID_COPY + initTime.hh) * TIME_ITEM_H;
  const initMinOffset = (MINUTE_COUNT * MINUTE_MID_COPY + initTime.mm) * TIME_ITEM_H;

  // These refs hold the "settled" values — only updated when snap completes
  const settledDate = useRef(initDateIdx);
  const settledHour = useRef(initTime.hh);
  const settledMin = useRef(initTime.mm);

  // For date visual highlighting — updated via DOM, not React state
  const [visibleDateIdx, setVisibleDateIdx] = useState(initDateIdx);
  const dateItemsRef = useRef<HTMLDivElement>(null);

  // Update date highlighting via DOM directly during drag (no re-render)
  const lastHighlightIdx = useRef(initDateIdx);
  const highlightDate = useCallback((idx: number) => {
    if (idx === lastHighlightIdx.current) return;
    const container = dateItemsRef.current;
    if (!container) return;
    const prev = container.children[lastHighlightIdx.current] as HTMLElement | undefined;
    const next = container.children[idx] as HTMLElement | undefined;
    if (prev) {
      const dow = prev.children[0] as HTMLElement;
      const num = prev.children[1] as HTMLElement;
      if (dow) { dow.style.color = "rgba(30,31,34,0.35)"; dow.style.fontWeight = "500"; }
      if (num) { num.style.color = "rgba(30,31,34,0.3)"; num.style.fontWeight = "500"; }
    }
    if (next) {
      const dow = next.children[0] as HTMLElement;
      const num = next.children[1] as HTMLElement;
      if (dow) { dow.style.color = "#1e1f22"; dow.style.fontWeight = "600"; }
      if (num) { num.style.color = "#111"; num.style.fontWeight = "700"; }
    }
    lastHighlightIdx.current = idx;
  }, []);

  const onDateSettle = useCallback((idx: number) => {
    settledDate.current = idx;
    highlightDate(idx);
    const dt = dates[idx];
    if (!dt) return;
    onChange(toDateKeyLocal(dt.date), toHHMM(settledHour.current, settledMin.current));
  }, [dates, onChange, highlightDate]);

  const onHourSettle = useCallback((rawIdx: number) => {
    const h = ((rawIdx % HOUR_COUNT) + HOUR_COUNT) % HOUR_COUNT;
    settledHour.current = h;
    const dt = dates[settledDate.current];
    if (!dt) return;
    onChange(toDateKeyLocal(dt.date), toHHMM(h, settledMin.current));
  }, [dates, onChange]);

  const onMinSettle = useCallback((rawIdx: number) => {
    const m = ((rawIdx % MINUTE_COUNT) + MINUTE_COUNT) % MINUTE_COUNT;
    settledMin.current = m;
    const dt = dates[settledDate.current];
    if (!dt) return;
    onChange(toDateKeyLocal(dt.date), toHHMM(settledHour.current, m));
  }, [dates, onChange]);

  const dateWheel = useWheel({
    totalItems: dates.length,
    itemSize: DATE_ITEM_W,
    axis: "x",
    initialOffset: initDateIdx * DATE_ITEM_W,
    onSettle: onDateSettle,
  });

  // Override tickHaptic for dates to also update visual highlight
  const origDateTouchMove = dateWheel.onTouchMove;
  const dateOnTouchMove = useCallback((e: React.TouchEvent) => {
    origDateTouchMove(e);
    // Update highlight based on current offset
    const idx = Math.max(0, Math.min(Math.round(dateWheel.offset.current / DATE_ITEM_W), dates.length - 1));
    highlightDate(idx);
  }, [origDateTouchMove, dateWheel.offset, dates.length, highlightDate]);

  const hourWheel = useWheel({
    totalItems: HOUR_TOTAL,
    itemSize: TIME_ITEM_H,
    axis: "y",
    initialOffset: initHourOffset,
    wrap: { base: HOUR_COUNT, midCopy: HOUR_MID_COPY },
    onSettle: onHourSettle,
  });

  const minWheel = useWheel({
    totalItems: MINUTE_TOTAL,
    itemSize: TIME_ITEM_H,
    axis: "y",
    initialOffset: initMinOffset,
    wrap: { base: MINUTE_COUNT, midCopy: MINUTE_MID_COPY },
    onSettle: onMinSettle,
  });

  // Tap handlers
  const handleDateTap = useCallback((e: React.TouchEvent) => {
    const wasTap = dateWheel.onTouchEnd();
    if (!wasTap) return;
    const touch = e.changedTouches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const centerX = rect.width / 2;
    const deltaItems = Math.round((touchX - centerX) / DATE_ITEM_W);
    if (deltaItems === 0) return;
    const curIdx = Math.round(dateWheel.offset.current / DATE_ITEM_W);
    const newIdx = Math.max(0, Math.min(curIdx + deltaItems, dates.length - 1));
    dateWheel.scrollToIndex(newIdx);
  }, [dateWheel, dates.length]);

  const handleHourTap = useCallback(() => {
    const wasTap = hourWheel.onTouchEnd();
    if (!wasTap) return;
    const curIdx = Math.round(hourWheel.offset.current / TIME_ITEM_H);
    hourWheel.scrollToIndex(curIdx + 1);
  }, [hourWheel]);

  const handleMinTap = useCallback(() => {
    const wasTap = minWheel.onTouchEnd();
    if (!wasTap) return;
    const curIdx = Math.round(minWheel.offset.current / TIME_ITEM_H);
    minWheel.scrollToIndex(curIdx + 1);
  }, [minWheel]);

  return (
    <div style={st.root}>
      {/* Date scroller */}
      <div style={st.dateScroller}>
        <div style={st.dateIndicator} />
        <div style={st.dateFadeL} />
        <div style={st.dateFadeR} />
        <div
          style={st.dateViewport}
          onTouchStart={dateWheel.onTouchStart}
          onTouchMove={dateOnTouchMove}
          onTouchEnd={handleDateTap}
        >
          <div ref={(el) => { (dateWheel.stripRef as any).current = el; (dateItemsRef as any).current = el; }} style={st.dateStrip}>
            {dates.map((d, idx) => {
              const active = idx === initDateIdx;
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

      {/* Time wheels */}
      <div style={st.timeWrap}>
        <div style={st.timeColonOverlay}>:</div>
        <div style={st.timeInner}>
          <div
            style={st.timeViewport}
            onTouchStart={hourWheel.onTouchStart}
            onTouchMove={hourWheel.onTouchMove}
            onTouchEnd={handleHourTap}
          >
            <div ref={hourWheel.stripRef} style={st.timeStrip}>
              {hourItems.map((h, i) => (
                <div key={i} style={st.timeItem}>{String(h).padStart(2, "0")}</div>
              ))}
            </div>
          </div>

          <div
            style={st.timeViewport}
            onTouchStart={minWheel.onTouchStart}
            onTouchMove={minWheel.onTouchMove}
            onTouchEnd={handleMinTap}
          >
            <div ref={minWheel.stripRef} style={st.timeStrip}>
              {minuteItems.map((m, i) => (
                <div key={i} style={st.timeItem}>{String(m).padStart(2, "0")}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  dateScroller: { position: "relative", overflow: "visible", width: "100%" },
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
    position: "absolute", top: 0, bottom: 0, left: 0,
    width: DATE_ITEM_W * 1.2,
    background: `linear-gradient(90deg, ${FADE_COLOR} 0%, rgba(250,250,252,0) 100%)`,
    pointerEvents: "none", zIndex: 3,
  },
  dateFadeR: {
    position: "absolute", top: 0, bottom: 0, right: 0,
    width: DATE_ITEM_W * 1.2,
    background: `linear-gradient(270deg, ${FADE_COLOR} 0%, rgba(250,250,252,0) 100%)`,
    pointerEvents: "none", zIndex: 3,
  },
  dateViewport: {
    overflow: "hidden", width: "100%", height: 80,
    position: "relative", zIndex: 2, touchAction: "none",
  },
  dateStrip: {
    display: "flex", position: "absolute", top: 0,
    left: `calc(50% - ${DATE_ITEM_W / 2}px)`,
    height: "100%", willChange: "transform",
  },
  dateItem: {
    width: DATE_ITEM_W, minWidth: DATE_ITEM_W,
    display: "inline-flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    gap: 2, padding: 0,
  },
  dateDow: {
    fontSize: 12, fontWeight: 500, color: "rgba(30,31,34,0.35)",
    lineHeight: 1, letterSpacing: 0.3,
  },
  dateDowActive: {
    fontSize: 12, fontWeight: 600, color: "#1e1f22",
    lineHeight: 1, letterSpacing: 0.3,
  },
  dateNum: {
    fontSize: 24, fontWeight: 500, color: "rgba(30,31,34,0.3)", lineHeight: 1.3,
  },
  dateNumActive: {
    fontSize: 24, fontWeight: 700, color: "#111", lineHeight: 1.3,
  },
  timeWrap: {
    position: "relative", overflow: "hidden", width: "100%", height: TIME_ITEM_H,
  },
  timeInner: {
    position: "relative", zIndex: 2, height: "100%", width: "100%",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: TIME_COL_GAP, padding: "0 8px",
  },
  timeColonOverlay: {
    position: "absolute", left: "50%", top: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 64, fontWeight: 800, color: "#1e1f22",
    lineHeight: 1, zIndex: 4, pointerEvents: "none",
  },
  timeViewport: {
    position: "relative", height: "100%", overflow: "hidden",
    flex: 1, touchAction: "none",
  },
  timeStrip: {
    position: "absolute", top: 0, left: 0, width: "100%",
    willChange: "transform",
  },
  timeItem: {
    width: "100%", height: TIME_ITEM_H,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 88, fontWeight: 800, color: "#1e1f22", lineHeight: 1,
  },
};

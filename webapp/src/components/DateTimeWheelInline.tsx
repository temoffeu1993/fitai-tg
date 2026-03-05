import { useCallback, useMemo, useRef, type CSSProperties } from "react";
import { useWheel } from "@/hooks/useWheel";

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

  const settledDate = useRef(initDateIdx);
  const settledHour = useRef(initTime.hh);
  const settledMin = useRef(initTime.mm);

  const dateItemsRef = useRef<HTMLDivElement>(null);

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
      if (num) { num.style.color = "rgba(30,31,34,0.3)"; num.style.fontWeight = "500"; num.style.fontSize = "24px"; }
    }
    if (next) {
      const dow = next.children[0] as HTMLElement;
      const num = next.children[1] as HTMLElement;
      if (dow) { dow.style.color = "#1e1f22"; dow.style.fontWeight = "600"; }
      if (num) { num.style.color = "#111"; num.style.fontWeight = "700"; num.style.fontSize = "26px"; }
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
    onHighlight: highlightDate,
  });

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
          onTouchMove={dateWheel.onTouchMove}
          onTouchEnd={handleDateTap}
        >
          <div ref={(el) => { (dateWheel.stripRef as any).current = el; (dateItemsRef as any).current = el; }} style={st.dateStrip}>
            {dates.map((d, idx) => {
              const active = idx === initDateIdx;
              const isToday = toDateKeyLocal(d.date) === todayIso;
              return (
                <div key={idx} style={st.dateItem}>
                  <span style={active ? st.dateDowActive : st.dateDow}>{d.dow}</span>
                  <span style={active ? st.dateNumActive : st.dateNum}>{d.day}</span>
                  {isToday && <span style={st.todayDot} />}
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
    gap: 2, padding: 0, position: "relative",
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
    fontSize: 26, fontWeight: 700, color: "#111", lineHeight: 1.3,
  },
  todayDot: {
    width: 12, height: 12, borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    position: "absolute" as const, bottom: 2,
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
    fontSize: 92, fontWeight: 900, color: "#1e1f22", lineHeight: 1,
  },
};

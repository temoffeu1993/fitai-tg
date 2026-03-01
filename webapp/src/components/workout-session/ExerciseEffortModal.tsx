import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Activity, Check } from "lucide-react";
import { workoutTheme } from "./theme";
import type { EffortTag } from "./types";

const SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const SHEET_ENTER_MS = 380;
const SHEET_EXIT_MS = 260;
const OVERLAY_ENTER_MS = 320;
const OPEN_TICK_MS = 12;

const EFFORT_OPTIONS: Array<{
  value: Exclude<EffortTag, null>;
  num: number;
  label: string;
  sub: string;
}> = [
  { value: "easy", num: 6, label: "Слишком легко", sub: "Мог бы ещё столько же" },
  { value: "working", num: 7, label: "В самый раз", sub: "Тяжело, но контролируемо" },
  { value: "quite_hard", num: 8, label: "Тяжеловато", sub: "Последние повторы дались с трудом" },
  { value: "hard", num: 9, label: "Очень тяжело", sub: "Ещё одно — и всё, край" },
  { value: "max", num: 10, label: "На пределе", sub: "Полный отказ, не мог продолжить" },
];

const BAR_HEIGHTS = [56, 96, 136, 176, 216]; // increasing heights for 5 bars

type Props = {
  open: boolean;
  onSelect: (value: Exclude<EffortTag, null>) => void;
};

export default function ExerciseEffortModal({ open, onSelect }: Props) {
  const [renderOpen, setRenderOpen] = useState(open);
  const [entered, setEntered] = useState(open);
  const enteredRef = useRef(open);
  const [selected, setSelected] = useState<number | null>(null);

  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);

  const applyEntered = (v: boolean) => { enteredRef.current = v; setEntered(v); };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
      if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
    };
  }, []);

  // Reset selection when modal opens
  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  // Lock body scroll
  useEffect(() => {
    if (!renderOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [renderOpen]);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current != null) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
      if (!renderOpen || !enteredRef.current) {
        setRenderOpen(true);
        applyEntered(false);
        if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = window.setTimeout(() => { applyEntered(true); openTimerRef.current = null; }, OPEN_TICK_MS);
        return;
      }
      applyEntered(true);
      return;
    }
    if (!renderOpen) return;
    if (openTimerRef.current != null) { window.clearTimeout(openTimerRef.current); openTimerRef.current = null; }
    applyEntered(false);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setRenderOpen(false);
      closeTimerRef.current = null;
    }, SHEET_EXIT_MS + 20);
  }, [open, renderOpen]);

  if (!renderOpen) return null;

  const opt = selected != null ? EFFORT_OPTIONS[selected] : null;

  return (
    <>
      <style>{`
        .effort-bar-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 72,
          background: workoutTheme.overlayStrong,
          opacity: entered ? 1 : 0,
          transition: `opacity ${entered ? OVERLAY_ENTER_MS : SHEET_EXIT_MS}ms ease`,
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 73,
          borderRadius: "24px 24px 0 0",
          border: workoutTheme.cardBorder,
          background: "#ffffff",
          boxShadow: workoutTheme.cardShadow,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          willChange: "transform, opacity",
          transform: entered ? "translate3d(0,0,0)" : "translate3d(0,100%,0)",
          opacity: entered ? 1 : 0,
          transition: entered
            ? `transform ${SHEET_ENTER_MS}ms ${SPRING_OPEN}, opacity ${Math.round(SHEET_ENTER_MS * 0.6)}ms ease`
            : `transform ${SHEET_EXIT_MS}ms ${SPRING_CLOSE}, opacity ${SHEET_EXIT_MS}ms ease`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Check button top-right */}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 16px 0" }}>
          <button
            type="button"
            className="effort-bar-btn"
            style={{
              background: "transparent", border: "none", padding: 4, cursor: "pointer",
              opacity: selected != null ? 1 : 0.25,
              pointerEvents: selected != null ? "auto" : "none",
              transition: "opacity 200ms ease",
            }}
            disabled={selected == null}
            onClick={() => { if (selected != null) onSelect(EFFORT_OPTIONS[selected].value); }}
          >
            <Check size={26} strokeWidth={2.5} color={workoutTheme.textPrimary} />
          </button>
        </div>

        {/* Header */}
        <div style={{ padding: "4px 16px 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Activity size={18} strokeWidth={2.5} color={workoutTheme.textPrimary} />
          <div style={{
            fontSize: 18, fontWeight: 700, lineHeight: 1.25,
            color: workoutTheme.textPrimary,
          }}>
            Как ощущалась нагрузка?
          </div>
        </div>

        {/* Bars */}
        <div style={st.barsRow}>
          {EFFORT_OPTIONS.map((option, idx) => {
            const isSelected = selected === idx;
            return (
              <button
                key={option.value}
                type="button"
                className="effort-bar-btn"
                style={st.barTouchArea}
                onClick={() => setSelected(idx)}
              >
                <div style={{
                  ...st.barTrack,
                  height: BAR_HEIGHTS[idx],
                }}>
                  {isSelected && <div style={st.barFill} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div style={st.legendWrap}>
          {opt ? (
            <div style={st.legendRow}>
              <div style={st.legendNum}>{opt.num}</div>
              <div style={st.legendText}>
                <div style={st.legendLabel}>{opt.label}</div>
                <div style={st.legendSub}>{opt.sub}</div>
              </div>
            </div>
          ) : (
            <div style={st.legendPlaceholder}>Выберите уровень нагрузки</div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const st: Record<string, CSSProperties> = {
  barsRow: {
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    gap: 8, padding: "16px 32px 16px",
    height: 260,
  },
  barTouchArea: {
    display: "flex", flexDirection: "column", justifyContent: "flex-end",
    alignItems: "center", background: "transparent", border: "none",
    padding: "0 4px", cursor: "pointer", height: "100%",
  } as CSSProperties,
  barTrack: {
    width: 36, borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 4px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    position: "relative", overflow: "hidden",
  } as CSSProperties,
  barFill: {
    position: "absolute", inset: 0, borderRadius: 999,
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
  } as CSSProperties,

  legendWrap: {
    padding: "4px 24px 4px", minHeight: 52,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  legendRow: {
    display: "flex", alignItems: "center", gap: 12,
  },
  legendNum: {
    fontSize: 22, fontWeight: 800, color: workoutTheme.textPrimary, lineHeight: 1,
    flexShrink: 0, minWidth: 24,
  },
  legendText: {
    display: "flex", flexDirection: "column", gap: 2, minWidth: 0,
  } as CSSProperties,
  legendLabel: {
    fontSize: 17, fontWeight: 600, color: workoutTheme.textPrimary, lineHeight: 1.2,
  },
  legendSub: {
    fontSize: 13, fontWeight: 400, color: workoutTheme.textSecondary, lineHeight: 1.25,
  },
  legendPlaceholder: {
    fontSize: 15, fontWeight: 500, color: "rgba(15,23,42,0.35)",
    textAlign: "center", width: "100%",
  } as CSSProperties,
};

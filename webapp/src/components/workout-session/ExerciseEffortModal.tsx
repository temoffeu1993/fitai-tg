import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
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
  bg: string;
}> = [
  { value: "easy", num: 1, label: "Слишком легко", sub: "Мог бы ещё столько же", bg: "#edf3fd" },
  { value: "working", num: 2, label: "В самый раз", sub: "Тяжело, но контролируемо", bg: "#e8f8f2" },
  { value: "quite_hard", num: 3, label: "Тяжеловато", sub: "Последние повторы дались с трудом", bg: "#fef3e2" },
  { value: "hard", num: 4, label: "Очень тяжело", sub: "Ещё одно — и всё, край", bg: "#feeee3" },
  { value: "max", num: 5, label: "На пределе", sub: "Полный отказ, не мог продолжить", bg: "#fee8e8" },
];

const BAR_HEIGHTS = [28, 48, 68, 88, 108]; // increasing heights for 5 bars

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
  const sheetBg = opt ? opt.bg : "#ffffff";

  return (
    <>
      <style>{`
        .effort-bar-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .effort-confirm-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; transition: transform 160ms ease, box-shadow 160ms ease; }
        .effort-confirm-btn:active:not(:disabled) { transform: translateY(1px) scale(0.99) !important; }
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
          background: sheetBg,
          boxShadow: workoutTheme.cardShadow,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          willChange: "transform, opacity",
          transform: entered ? "translate3d(0,0,0)" : "translate3d(0,100%,0)",
          opacity: entered ? 1 : 0,
          transition: entered
            ? `transform ${SHEET_ENTER_MS}ms ${SPRING_OPEN}, opacity ${Math.round(SHEET_ENTER_MS * 0.6)}ms ease, background 280ms ease`
            : `transform ${SHEET_EXIT_MS}ms ${SPRING_CLOSE}, opacity ${SHEET_EXIT_MS}ms ease`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 2 }} aria-hidden>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: "rgba(15,23,42,0.16)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "8px 16px 4px", display: "grid", gap: 3 }}>
          <div style={{
            fontSize: 18, fontWeight: 700, lineHeight: 1.25,
            color: workoutTheme.textPrimary, textAlign: "center",
          }}>
            Как ощущалась нагрузка?
          </div>
          <div style={{
            fontSize: 13, fontWeight: 500, lineHeight: 1.35,
            color: workoutTheme.textSecondary, textAlign: "center",
          }}>
            Подберём вес точнее на следующей тренировке
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
              <div style={st.legendNumCircle}>
                <span style={st.legendNum}>{opt.num}</span>
              </div>
              <div style={st.legendText}>
                <div style={st.legendLabel}>{opt.label}</div>
                <div style={st.legendSub}>{opt.sub}</div>
              </div>
            </div>
          ) : (
            <div style={st.legendPlaceholder}>Выберите уровень нагрузки</div>
          )}
        </div>

        {/* Confirm button */}
        <div style={st.btnWrap}>
          <button
            type="button"
            className="effort-confirm-btn"
            style={{
              ...st.confirmBtn,
              opacity: selected != null ? 1 : 0.35,
              pointerEvents: selected != null ? "auto" : "none",
            }}
            disabled={selected == null}
            onClick={() => {
              if (selected != null) onSelect(EFFORT_OPTIONS[selected].value);
            }}
          >
            <span style={st.confirmBtnText}>Готово</span>
            <span style={st.confirmBtnCircle} aria-hidden>
              <Check size={20} strokeWidth={2.5} color="#0f172a" />
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const st: Record<string, CSSProperties> = {
  barsRow: {
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    gap: 14, padding: "24px 32px 16px",
    height: 140,
  },
  barTouchArea: {
    display: "flex", flexDirection: "column", justifyContent: "flex-end",
    alignItems: "center", background: "transparent", border: "none",
    padding: "0 6px", cursor: "pointer", height: "100%",
  } as CSSProperties,
  barTrack: {
    width: 28, borderRadius: 999,
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
    padding: "4px 24px 8px", minHeight: 56,
    display: "flex", alignItems: "center",
  },
  legendRow: {
    display: "flex", alignItems: "center", gap: 14, width: "100%",
  },
  legendNumCircle: {
    width: 44, height: 44, borderRadius: 999, flexShrink: 0,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  legendNum: {
    fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1,
  },
  legendText: {
    display: "flex", flexDirection: "column", gap: 2, minWidth: 0,
  } as CSSProperties,
  legendLabel: {
    fontSize: 17, fontWeight: 600, color: "#0f172a", lineHeight: 1.2,
  },
  legendSub: {
    fontSize: 13, fontWeight: 400, color: "rgba(15,23,42,0.62)", lineHeight: 1.25,
  },
  legendPlaceholder: {
    fontSize: 15, fontWeight: 500, color: "rgba(15,23,42,0.35)",
    textAlign: "center", width: "100%",
  } as CSSProperties,

  btnWrap: {
    padding: "8px 24px 0", display: "flex", justifyContent: "center",
  },
  confirmBtn: {
    display: "inline-flex", alignItems: "center", gap: 12,
    height: 56, minHeight: 56, padding: "0 14px",
    borderRadius: 999, border: "1px solid #1e1f22", background: "#1e1f22", color: "#fff",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)", cursor: "pointer",
    transition: "transform 160ms ease, opacity 250ms ease",
    fontSize: 18, fontWeight: 500,
  },
  confirmBtnText: {
    whiteSpace: "nowrap", fontSize: 18, fontWeight: 500, lineHeight: 1, color: "#fff",
  } as CSSProperties,
  confirmBtnCircle: {
    width: 40, height: 40, borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    marginRight: -6,
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    color: "#0f172a", flexShrink: 0,
  },
};

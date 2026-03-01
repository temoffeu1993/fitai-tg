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
        {/* Grabber */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 2 }} aria-hidden>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: "rgba(15,23,42,0.16)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "8px 16px 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Activity size={18} strokeWidth={2.5} color={workoutTheme.textPrimary} />
          <div style={{
            fontSize: 18, fontWeight: 700, lineHeight: 1.25,
            color: workoutTheme.textPrimary,
          }}>
            Как ощущалась нагрузка?
          </div>
        </div>

        {/* Bars + numbers */}
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
                <div style={st.barNum}>{option.num}</div>
              </button>
            );
          })}
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
            <div style={st.confirmBtnTextWrap}>
              <span style={st.confirmBtnLabel}>{opt ? opt.label : "Выберите нагрузку"}</span>
              {opt && <span style={st.confirmBtnSub}>{opt.sub}</span>}
            </div>
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
    gap: 8, padding: "24px 32px 12px",
    height: 140,
  },
  barTouchArea: {
    display: "flex", flexDirection: "column", justifyContent: "flex-end",
    alignItems: "center", background: "transparent", border: "none",
    padding: "0 4px", cursor: "pointer", height: "100%", gap: 6,
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
  barNum: {
    fontSize: 13, fontWeight: 600, color: "rgba(15,23,42,0.48)", lineHeight: 1,
  },

  btnWrap: {
    padding: "8px 24px 0", display: "flex", justifyContent: "center",
  },
  confirmBtn: {
    display: "inline-flex", alignItems: "center", gap: 12,
    height: 56, minHeight: 56, padding: "0 14px 0 20px",
    borderRadius: 999, border: "1px solid #1e1f22", background: "#1e1f22", color: "#fff",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)", cursor: "pointer",
    transition: "transform 160ms ease, opacity 250ms ease",
  },
  confirmBtnTextWrap: {
    display: "flex", flexDirection: "column", alignItems: "flex-start",
    gap: 1, minWidth: 0,
  } as CSSProperties,
  confirmBtnLabel: {
    whiteSpace: "nowrap", fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "#fff",
  } as CSSProperties,
  confirmBtnSub: {
    whiteSpace: "nowrap", fontSize: 12, fontWeight: 400, lineHeight: 1.2,
    color: "rgba(255,255,255,0.55)",
  } as CSSProperties,
  confirmBtnCircle: {
    width: 40, height: 40, borderRadius: 999,
    background: "linear-gradient(180deg, #e5e7eb 0%, #f3f4f6 100%)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    marginRight: -6, flexShrink: 0,
    boxShadow: "inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    color: "#0f172a",
  },
};

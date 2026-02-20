import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";

type Props = {
  open: boolean;
  items: SessionItem[];
  activeIndex: number;
  onClose: () => void;
  onPick: (index: number) => void;
};

// Matches ExerciseActionsSheet spring curves
const SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const SHEET_ENTER_MS = 380;
const SHEET_EXIT_MS = 260;
const OVERLAY_ENTER_MS = 320;
const OPEN_TICK_MS = 12;

export default function ExerciseListSheet(props: Props) {
  const { open, items, activeIndex, onClose, onPick } = props;

  const [renderOpen, setRenderOpen] = useState(open);
  const [entered, setEntered] = useState(open);
  const enteredRef = useRef(open);

  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);

  const applyEntered = (v: boolean) => {
    enteredRef.current = v;
    setEntered(v);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
      if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
    };
  }, []);

  // Lock body scroll while sheet is visible
  useEffect(() => {
    if (!renderOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [renderOpen]);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      // Always go through the 12ms tick if not fully entered yet
      if (!renderOpen || !enteredRef.current) {
        setRenderOpen(true);
        applyEntered(false);
        if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = window.setTimeout(() => {
          applyEntered(true);
          openTimerRef.current = null;
        }, OPEN_TICK_MS);
        return;
      }
      applyEntered(true);
      return;
    }

    if (!renderOpen) return;
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    applyEntered(false);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setRenderOpen(false);
      closeTimerRef.current = null;
    }, SHEET_EXIT_MS + 20);
  }, [open, renderOpen]);

  if (!renderOpen) return null;

  return (
    <>
      <style>{css}</style>

      {/* Backdrop */}
      <div
        style={{
          ...s.overlay,
          opacity: entered ? 1 : 0,
          transition: `opacity ${entered ? OVERLAY_ENTER_MS : SHEET_EXIT_MS}ms ease`,
        }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        style={{
          ...s.sheet,
          transform: entered ? "translate3d(0,0,0)" : "translate3d(0,100%,0)",
          opacity: entered ? 1 : 0,
          transition: entered
            ? `transform ${SHEET_ENTER_MS}ms ${SPRING_OPEN}, opacity ${Math.round(SHEET_ENTER_MS * 0.6)}ms ease`
            : `transform ${SHEET_EXIT_MS}ms ${SPRING_CLOSE}, opacity ${SHEET_EXIT_MS}ms ease`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber */}
        <div style={s.grabberRow} aria-hidden>
          <div style={s.grabber} />
        </div>

        {/* Header */}
        <div style={s.header}>
          <span style={s.headerSpacer} aria-hidden />
          <span style={s.title}></span>
          <button
            type="button"
            aria-label="Закрыть"
            className="els-icon-btn"
            style={s.iconBtn}
            onClick={onClose}
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        {/* List */}
        <div style={s.list}>
          {items.map((item, idx) => {
            const doneSets = item.sets.filter((set) => set.done).length;
            const totalSets = item.sets.length;
            const isActive = idx === activeIndex;
            const isDone = item.done;
            const isSkipped = item.skipped;
            const isCompleted = !isSkipped && totalSets > 0 && doneSets >= totalSets;
            return (
              <div key={`${item.id || item.name}-${idx}`} style={{ display: "flex", flexDirection: "column" }}>
                <button
                  type="button"
                  className="els-row-btn"
                  style={{
                    ...s.row,
                    ...(isActive ? s.rowActive : null),
                    ...(isDone || isSkipped ? s.rowDone : null),
                    animationDelay: `${idx * 20}ms`,
                  }}
                  onClick={() => onPick(idx)}
                >
                  <span style={{ ...s.rowName, color: isActive ? workoutTheme.accent : "inherit" }}>
                    {idx + 1}. {item.name}
                  </span>
                  <span style={{
                    ...s.rowMeta,
                    ...(isActive ? s.rowMetaActive : null),
                    ...(isCompleted ? s.rowMetaDone : null),
                  }}>
                    {isSkipped ? "—" : `${doneSets}/${totalSets}`}
                  </span>
                </button>
                {idx < items.length - 1 && <div style={s.divider} />}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

const css = `
  .els-icon-btn {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    transition: opacity 120ms ease, transform 120ms ease;
    will-change: transform;
  }
  .els-icon-btn:active {
    opacity: 0.55;
    transform: scale(0.9);
  }

  .els-row-btn {
    appearance: none;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    animation: els-row-in 0.3s cubic-bezier(0.36, 0.66, 0.04, 1) both;
    transition: background 120ms ease;
  }
  .els-row-btn:active:not(:disabled) {
    background: rgba(15,23,42,0.08) !important;
  }

  @keyframes els-row-in {
    from { opacity: 0; transform: translate3d(0, 8px, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .els-icon-btn, .els-row-btn {
      transition: none !important;
      animation: none !important;
    }
  }
`;

const s: Record<string, CSSProperties> = {
  // Backdrop
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 65,
    background: workoutTheme.overlayStrong,
  },

  // Sheet
  sheet: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 66,
    borderRadius: "24px 24px 0 0",
    border: workoutTheme.cardBorder,
    background: "linear-gradient(180deg, rgba(255,255,255,0.985) 0%, rgba(242,242,247,0.975) 100%)",
    boxShadow: workoutTheme.cardShadow,
    maxHeight: "80vh",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    display: "flex",
    flexDirection: "column",
    willChange: "transform, opacity",
  },

  // Grabber
  grabberRow: {
    display: "flex",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 0,
    flexShrink: 0,
  },
  grabber: {
    width: 46,
    height: 5,
    borderRadius: 999,
    background: "rgba(15,23,42,0.16)",
  },

  // Header — крестик справа, заголовок по центру
  header: {
    display: "grid",
    gridTemplateColumns: "32px 1fr 32px",
    alignItems: "center",
    gap: 4,
    padding: "0px 8px 0px",
    flexShrink: 0,
  },
  headerSpacer: {
    display: "block",
    width: 32,
    height: 32,
  },
  title: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
    letterSpacing: "-0.2px",
  },
  iconBtn: {
    width: 32,
    height: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    borderRadius: 999,
    color: workoutTheme.textSecondary,
    cursor: "pointer",
    padding: 0,
    justifySelf: "end",
  },

  // Scrollable list
  list: {
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    padding: "0px 0px 8px",
  },

  // Row
  row: {
    minHeight: 56,
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "14px 24px",
    background: "transparent",
    border: "none",
    color: "#1e1f22",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  },
  divider: {
    height: 1,
    background: "rgba(15,23,42,0.06)",
    marginLeft: 24,
  },
  rowActive: {
    // Left empty since we color the text itself
  },
  rowDone: {
    opacity: 0.52,
  },
  rowName: {
    flex: 1,
    minWidth: 0,
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.3,
  },
  rowMeta: {
    minWidth: 42,
    height: 30,
    borderRadius: 999,
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 10px",
    fontSize: 13,
    fontWeight: 600,
    color: workoutTheme.textSecondary,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
    letterSpacing: "0.2px",
  },
  rowMetaActive: {
    background: "rgba(15,23,42,0.06)",
    boxShadow: "none",
    color: workoutTheme.accent,
  },
  rowMetaDone: {
    background: "linear-gradient(180deg, rgba(196,228,178,0.34) 0%, rgba(170,210,146,0.42) 100%)",
    boxShadow: "inset 0 2px 3px rgba(78,122,58,0.12), inset 0 -1px 0 rgba(255,255,255,0.22)",
    color: workoutTheme.textPrimary,
  },
};

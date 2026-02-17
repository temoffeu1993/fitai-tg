import type { CSSProperties } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";

type Props = {
  open: boolean;
  items: SessionItem[];
  activeIndex: number;
  onClose: () => void;
  onPick: (index: number) => void;
};

export default function ExerciseListSheet(props: Props) {
  const { open, items, activeIndex, onClose, onPick } = props;
  if (!open) return null;

  return (
    <>
      <style>{sheetButtonCss}</style>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
          <div style={s.grabber} />
          <div style={s.title}>Список упражнений</div>
          <div style={s.list}>
            {items.map((item, idx) => {
              const doneSets = item.sets.filter((set) => set.done).length;
              const isActive = idx === activeIndex;
              return (
                <button
                  key={`${item.id || item.name}-${idx}`}
                  type="button"
                  className="ws-sheet-btn"
                  style={{
                    ...s.row,
                    ...(isActive ? s.rowActive : null),
                    ...(item.done ? s.rowDone : null),
                    ["--sheet-btn-bg" as never]: isActive
                      ? "#1e1f22"
                      : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                    ["--sheet-btn-border" as never]: isActive ? "#1e1f22" : "rgba(255,255,255,0.4)",
                    ["--sheet-btn-color" as never]: isActive ? "#fff" : "#1e1f22",
                    ["--sheet-btn-shadow" as never]: isActive
                      ? "0 6px 10px rgba(0,0,0,0.24)"
                      : "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
                  }}
                  onClick={() => onPick(idx)}
                >
                  <span style={s.rowName}>{item.name}</span>
                  <span style={s.rowMeta}>{doneSets}/{item.sets.length}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

const sheetButtonCss = `
  .ws-sheet-btn {
    appearance: none;
    outline: none;
    transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease, box-shadow 220ms ease;
    will-change: transform, background, border-color, box-shadow;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .ws-sheet-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.99);
    background: var(--sheet-btn-bg) !important;
    border-color: var(--sheet-btn-border) !important;
    color: var(--sheet-btn-color) !important;
    box-shadow: var(--sheet-btn-shadow) !important;
  }
  .ws-sheet-btn:disabled {
    opacity: 0.72;
    cursor: default;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-sheet-btn { transition: none !important; }
  }
`;

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 65,
    display: "grid",
    alignItems: "end",
    background: "transparent",
  },
  sheet: {
    borderRadius: "24px 24px 0 0",
    border: workoutTheme.cardBorder,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.985) 0%, rgba(242,242,247,0.975) 100%)",
    boxShadow: workoutTheme.cardShadow,
    padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
    display: "grid",
    gap: 8,
    maxHeight: "70vh",
  },
  grabber: {
    width: 46,
    height: 5,
    borderRadius: 999,
    background: "rgba(15,23,42,0.16)",
    justifySelf: "center",
    marginTop: 4,
  },
  title: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
  },
  list: {
    overflowY: "auto",
    display: "grid",
    gap: 6,
    padding: "2px 8px 8px",
    margin: "0 -8px",
  },
  row: {
    minHeight: 58,
    borderRadius: 18,
    border: "1px solid var(--sheet-btn-border, rgba(255,255,255,0.4))",
    background:
      "var(--sheet-btn-bg, linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%))",
    boxShadow:
      "var(--sheet-btn-shadow, 0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25))",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 10,
    padding: "14px 14px",
    color: "var(--sheet-btn-color, #1e1f22)",
    cursor: "pointer",
    textAlign: "left",
  },
  rowActive: {
    color: "#fff",
  },
  rowDone: {
    opacity: 0.62,
  },
  rowName: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.3,
  },
  rowMeta: {
    fontSize: 14,
    fontWeight: 500,
    color: "currentColor",
    opacity: 0.74,
  },
};

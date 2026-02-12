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
                style={{ ...s.row, ...(isActive ? s.rowActive : null), ...(item.done ? s.rowDone : null) }}
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
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 65,
    display: "grid",
    alignItems: "end",
    background: "rgba(10,16,28,0.34)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  },
  sheet: {
    borderRadius: "22px 22px 0 0",
    borderTop: "1px solid rgba(255,255,255,0.45)",
    background: workoutTheme.cardBg,
    boxShadow: "0 -12px 26px rgba(10,16,28,0.2)",
    padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
    display: "grid",
    gap: 8,
    maxHeight: "70vh",
  },
  grabber: {
    width: 46,
    height: 5,
    borderRadius: 999,
    background: "rgba(17,24,39,0.2)",
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
    paddingBottom: 2,
  },
  row: {
    minHeight: 44,
    borderRadius: 12,
    border: workoutTheme.pillBorder,
    background: "rgba(255,255,255,0.75)",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    color: workoutTheme.textPrimary,
    cursor: "pointer",
    textAlign: "left",
  },
  rowActive: {
    border: "1px solid rgba(17,24,39,0.2)",
    background: "rgba(17,24,39,0.08)",
  },
  rowDone: {
    opacity: 0.62,
  },
  rowName: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: 700,
    color: workoutTheme.textMuted,
  },
};


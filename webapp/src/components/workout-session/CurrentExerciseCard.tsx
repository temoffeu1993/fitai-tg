import type { CSSProperties, ReactNode } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { setsSummary } from "./utils";

type Props = {
  item: SessionItem | null;
  focusSetIndex: number;
  onOpenMenu: () => void;
  children?: ReactNode;
};

export default function CurrentExerciseCard(props: Props) {
  const { item, focusSetIndex, onOpenMenu, children } = props;
  if (!item) return null;

  const summary = setsSummary(item);
  const totalSets = Math.max(1, summary.total);
  const displaySet =
    summary.done >= totalSets
      ? totalSets
      : Math.min(Math.max(0, focusSetIndex), totalSets - 1) + 1;

  return (
    <section style={s.card}>
      <div style={s.topRow}>
        <h2 style={s.name}>{item.name}</h2>
        <button type="button" aria-label="Меню упражнения" style={s.menuBtn} onClick={onOpenMenu}>
          ⋯
        </button>
      </div>

      <div style={s.setRow}>
        <span style={s.setText}>Подход {displaySet} из {totalSets}</span>
        <div style={s.setGrooves} aria-hidden>
          {item.sets.map((entry, idx) => (
            <span
              key={idx}
              style={{
                ...s.groove,
                ...(entry.done ? s.grooveDone : null),
              }}
            />
          ))}
        </div>
      </div>

      {children}
    </section>
  );
}

const s: Record<string, CSSProperties> = {
  card: {
    padding: "18px 18px 20px",
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    display: "grid",
    gap: 14,
    minWidth: 0,
    overflow: "hidden",
  },
  topRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) auto",
    alignItems: "start",
    gap: 10,
    minWidth: 0,
  },
  name: {
    margin: 0,
    minWidth: 0,
    fontSize: 32,
    lineHeight: 1.14,
    fontWeight: 700,
    letterSpacing: -0.6,
    color: workoutTheme.textPrimary,
    whiteSpace: "normal",
    textWrap: "balance",
    overflowWrap: "break-word",
    wordBreak: "normal",
    hyphens: "auto",
  },
  menuBtn: {
    border: "none",
    background: "transparent",
    boxShadow: "none",
    borderRadius: 999,
    height: 40,
    minWidth: 40,
    padding: 0,
    color: workoutTheme.textSecondary,
    fontSize: 28,
    lineHeight: 1,
    fontWeight: 500,
    cursor: "pointer",
  },
  setRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    minWidth: 0,
    flexWrap: "nowrap",
  },
  setText: {
    fontSize: 14,
    lineHeight: 1.5,
    fontWeight: 400,
    color: "rgba(15, 23, 42, 0.6)",
    whiteSpace: "nowrap",
  },
  setGrooves: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
  },
  groove: {
    width: 12,
    height: 12,
    flex: "0 0 auto",
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
  },
  grooveDone: {
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow:
      "0 1px 2px rgba(2,6,23,0.35), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.42)",
  },
};

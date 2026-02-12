import type { CSSProperties } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { formatRepsLabel, setsSummary } from "./utils";

type Props = {
  item: SessionItem | null;
  index: number;
  total: number;
  focusSetIndex: number;
  onOpenMenu: () => void;
};

export default function CurrentExerciseCard(props: Props) {
  const { item, index, total, focusSetIndex, onOpenMenu } = props;
  if (!item) return null;

  const repsLabel = formatRepsLabel(item.targetReps);
  const targetWeight = item.targetWeight ? String(item.targetWeight) : null;
  const summary = setsSummary(item);

  return (
    <section style={s.card}>
      <div style={s.topRow}>
        <div style={s.stepPill}>Упражнение {index + 1} из {total}</div>
        <button type="button" aria-label="Меню упражнения" style={s.menuBtn} onClick={onOpenMenu}>
          •••
        </button>
      </div>

      <h2 style={s.name}>{item.name}</h2>
      <div style={s.goal}>
        <span style={s.goalMain}>Подход {Math.max(1, focusSetIndex + 1)} / {item.sets.length}</span>
        <span style={s.goalMeta}>
          {repsLabel || "повторы по плану"}
          {targetWeight ? ` · ${targetWeight}` : ""}
        </span>
      </div>

      <div style={s.progressLine}>
        <div style={s.progressTrack}>
          <div
            style={{
              ...s.progressFill,
              width: `${item.sets.length ? Math.round((summary.done / item.sets.length) * 100) : 0}%`,
            }}
          />
        </div>
        <span style={s.progressText}>
          {summary.done}/{summary.total}
        </span>
      </div>
    </section>
  );
}

const s: Record<string, CSSProperties> = {
  card: {
    padding: "20px 18px",
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    display: "grid",
    gap: 12,
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stepPill: {
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    color: workoutTheme.textSecondary,
  },
  menuBtn: {
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    borderRadius: 999,
    height: 34,
    minWidth: 34,
    padding: 0,
    color: workoutTheme.textSecondary,
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
    letterSpacing: 1,
  },
  name: {
    margin: 0,
    fontSize: 32,
    lineHeight: 1.12,
    fontWeight: 700,
    letterSpacing: -0.6,
    color: workoutTheme.textPrimary,
  },
  goal: {
    display: "grid",
    gap: 2,
  },
  goalMain: {
    fontSize: 26,
    lineHeight: 1.1,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
  },
  goalMeta: {
    fontSize: 14,
    lineHeight: 1.3,
    color: workoutTheme.textSecondary,
    fontWeight: 600,
  },
  progressLine: {
    marginTop: 2,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    background: "rgba(15,23,42,0.08)",
    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    transition: "width 200ms ease",
  },
  progressText: {
    fontSize: 13,
    fontWeight: 700,
    color: workoutTheme.textMuted,
    minWidth: 34,
    textAlign: "right",
  },
};

import type { CSSProperties } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { formatRepsLabel, setsSummary } from "./utils";
import { Dumbbell, Repeat2 } from "lucide-react";

type Props = {
  item: SessionItem | null;
  index: number;
  total: number;
  onOpenMenu: () => void;
};

export default function CurrentExerciseCard(props: Props) {
  const { item, onOpenMenu } = props;
  if (!item) return null;

  const repsLabel = formatRepsLabel(item.targetReps);
  const targetWeight = item.targetWeight ? String(item.targetWeight) : null;
  const summary = setsSummary(item);

  return (
    <section style={s.card}>
      <div style={s.topRow}>
        <h2 style={s.name}>{item.name}</h2>
        <button type="button" aria-label="Меню упражнения" style={s.menuBtn} onClick={onOpenMenu}>
          ⋯
        </button>
      </div>

      <div style={s.chipsRow}>
        <span style={s.metaChip}>
          <Repeat2 size={14} strokeWidth={2.1} />
          <span>{repsLabel ? `${repsLabel} повт.` : "Повторы —"}</span>
        </span>
        <span style={s.metaChip}>
          <Dumbbell size={14} strokeWidth={2.1} />
          <span>{targetWeight ? `${targetWeight} кг` : "Кг —"}</span>
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
        <span style={s.progressCaption}>
          Выполнено {summary.done} из {summary.total} подходов
        </span>
      </div>
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
    gap: 12,
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
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
  name: {
    margin: 0,
    minWidth: 0,
    flex: 1,
    fontSize: 32,
    lineHeight: 1.12,
    fontWeight: 700,
    letterSpacing: -0.6,
    color: workoutTheme.textPrimary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chipsRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  metaChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minHeight: 20,
    padding: 0,
    borderRadius: 0,
    border: "none",
    background: "transparent",
    boxShadow: "none",
    fontSize: 14,
    lineHeight: 1.5,
    color: workoutTheme.textSecondary,
    fontWeight: 500,
  },
  progressLine: {
    marginTop: 4,
    display: "grid",
    gap: 8,
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
  progressCaption: {
    fontSize: 12,
    fontWeight: 500,
    color: workoutTheme.textMuted,
    lineHeight: 1.3,
  },
};

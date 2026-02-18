import type { CSSProperties, ReactNode } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { formatRepsLabel, parseWeightNumber, requiresWeightInput } from "./utils";

function buildGoalLabel(item: SessionItem): string | null {
  const repsRaw = formatRepsLabel(item.targetReps);
  const needWeight = requiresWeightInput(item);
  const parsedWeight = parseWeightNumber(item.targetWeight);
  const weightStr = parsedWeight != null && parsedWeight > 0
    ? `${Number.isInteger(parsedWeight) ? parsedWeight : parsedWeight.toFixed(1)} кг`
    : typeof item.targetWeight === "string" && item.targetWeight.trim()
      ? item.targetWeight.trim()
      : null;

  const repsStr = repsRaw ? `${repsRaw} повт` : null;

  if (repsStr && weightStr && needWeight) return `${repsStr} · ${weightStr}`;
  if (repsStr) return repsStr;
  if (weightStr && needWeight) return weightStr;
  return null;
}

type Props = {
  item: SessionItem | null;
  onOpenMenu: () => void;
  children?: ReactNode;
};

export default function CurrentExerciseCard(props: Props) {
  const { item, onOpenMenu, children } = props;
  if (!item) return null;

  const goalLabel = buildGoalLabel(item);

  return (
    <section style={s.card}>
      <div style={s.topRow}>
        <div style={s.titleBlock}>
          <h2 style={s.name}>{item.name}</h2>
          {goalLabel && <p style={s.goal}>{goalLabel}</p>}
        </div>
        <button type="button" aria-label="Меню упражнения" style={s.menuBtn} onClick={onOpenMenu}>
          ⋯
        </button>
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
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
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
  goal: {
    margin: 0,
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.4,
    color: workoutTheme.textSecondary,
    letterSpacing: "0.1px",
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
};

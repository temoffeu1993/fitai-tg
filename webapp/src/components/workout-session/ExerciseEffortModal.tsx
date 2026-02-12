import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";
import type { EffortTag } from "./types";

type Props = {
  open: boolean;
  exerciseName: string;
  onSelect: (value: Exclude<EffortTag, null>) => void;
};

const EFFORT_OPTIONS: Array<{ value: Exclude<EffortTag, null>; emoji: string; label: string }> = [
  { value: "easy", emoji: "🙂", label: "Легко" },
  { value: "working", emoji: "💪", label: "Рабоче" },
  { value: "quite_hard", emoji: "😮‍💨", label: "Тяжеловато" },
  { value: "hard", emoji: "😵", label: "Тяжело" },
  { value: "max", emoji: "🥵", label: "Предел" },
];

export default function ExerciseEffortModal(props: Props) {
  const { open, exerciseName, onSelect } = props;
  if (!open) return null;

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <div style={s.title}>Насколько тяжело было упражнение?</div>
        <div style={s.subtitle}>{exerciseName}</div>
        <div style={s.row}>
          {EFFORT_OPTIONS.map((option) => (
            <button key={option.value} type="button" style={s.option} onClick={() => onSelect(option.value)}>
              <span style={s.optionEmoji}>{option.emoji}</span>
              <span style={s.optionLabel}>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 75,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: workoutTheme.overlayStrong,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  card: {
    width: "min(92vw, 420px)",
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    padding: 16,
    display: "grid",
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.2,
    color: workoutTheme.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.3,
    color: workoutTheme.textSecondary,
    textAlign: "center",
  },
  row: {
    marginTop: 2,
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 8,
  },
  option: {
    minHeight: 58,
    border: "none",
    borderRadius: 14,
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    gap: 2,
    padding: "6px 4px",
  },
  optionEmoji: {
    fontSize: 18,
    lineHeight: 1,
  },
  optionLabel: {
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1.1,
  },
};


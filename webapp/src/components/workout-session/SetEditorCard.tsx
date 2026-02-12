import type { CSSProperties } from "react";
import type { EffortTag, SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { canMarkSetDone, requiresWeightInput } from "./utils";

type Props = {
  item: SessionItem | null;
  focusSetIndex: number;
  blocked: boolean;
  onFocusSet: (index: number) => void;
  onAdjust: (setIdx: number, field: "reps" | "weight", delta: number) => void;
  onValue: (setIdx: number, field: "reps" | "weight", raw: string) => void;
  onToggleSetDone: (setIdx: number) => void;
  onSetEffort: (value: EffortTag) => void;
};

const EFFORT_OPTIONS: Array<{ value: Exclude<EffortTag, null>; emoji: string; label: string }> = [
  { value: "easy", emoji: "🙂", label: "Легко" },
  { value: "working", emoji: "💪", label: "Рабоче" },
  { value: "quite_hard", emoji: "😮‍💨", label: "Тяжеловато" },
  { value: "hard", emoji: "😵", label: "Тяжело" },
  { value: "max", emoji: "🥵", label: "Предел" },
];

export default function SetEditorCard(props: Props) {
  const {
    item,
    focusSetIndex,
    blocked,
    onFocusSet,
    onAdjust,
    onValue,
    onToggleSetDone,
    onSetEffort,
  } = props;

  if (!item) return null;
  const set = item.sets[focusSetIndex];
  if (!set) return null;

  const needWeight = requiresWeightInput(item);
  const ready = canMarkSetDone(set, needWeight);

  return (
    <section style={s.card}>
      <div style={s.inputsGrid}>
        <ValueControl
          label="Повторы"
          value={set.reps}
          onAdjust={(delta) => onAdjust(focusSetIndex, "reps", delta)}
          onChange={(raw) => onValue(focusSetIndex, "reps", raw)}
        />
        <ValueControl
          label={item.weightLabel || "Вес"}
          value={set.weight}
          onAdjust={(delta) => onAdjust(focusSetIndex, "weight", delta)}
          onChange={(raw) => onValue(focusSetIndex, "weight", raw)}
          disabled={!needWeight}
        />
      </div>

      <div style={s.dotRow}>
        {item.sets.map((entry, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Подход ${idx + 1}`}
            onClick={() => onFocusSet(idx)}
            style={{
              ...s.dot,
              ...(entry.done ? s.dotDone : null),
              ...(idx === focusSetIndex ? s.dotActive : null),
            }}
          />
        ))}
      </div>

      {blocked ? <div style={s.error}>Введи повторы{needWeight ? " и вес" : ""}, затем отметь подход.</div> : null}

      <button
        type="button"
        style={{ ...s.primary, ...(ready ? s.primaryActive : null), ...(set.done ? s.primaryDone : null) }}
        onClick={() => onToggleSetDone(focusSetIndex)}
      >
        {set.done ? "Подход отмечен" : "Подход выполнен"}
      </button>

      <div style={s.effortWrap}>
        <div style={s.effortLabel}>Насколько тяжело упражнение сейчас?</div>
        <div style={s.effortRow}>
          {EFFORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              style={{
                ...s.effortBtn,
                ...(item.effort === option.value ? s.effortBtnActive : null),
              }}
              onClick={() => onSetEffort(option.value)}
            >
              <span>{option.emoji}</span>
              <span style={s.effortText}>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ValueControl(props: {
  label: string;
  value: number | undefined;
  onAdjust: (delta: number) => void;
  onChange: (raw: string) => void;
  disabled?: boolean;
}) {
  const { label, value, onAdjust, onChange, disabled } = props;
  return (
    <div style={{ ...s.valueBox, ...(disabled ? s.valueBoxDisabled : null) }}>
      <div style={s.valueLabel}>{label}</div>
      <input
        inputMode="decimal"
        pattern="[0-9]*"
        style={s.valueInput}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <div style={s.adjustRow}>
        <button type="button" style={s.adjustBtn} onClick={() => onAdjust(-1)} disabled={disabled}>
          −1
        </button>
        <button type="button" style={s.adjustBtn} onClick={() => onAdjust(1)} disabled={disabled}>
          +1
        </button>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  card: {
    padding: 14,
    borderRadius: 20,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    display: "grid",
    gap: 12,
  },
  inputsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  valueBox: {
    border: workoutTheme.pillBorder,
    background: "rgba(255,255,255,0.68)",
    borderRadius: 14,
    padding: "10px 10px 8px",
    display: "grid",
    gap: 6,
  },
  valueBoxDisabled: {
    opacity: 0.5,
  },
  valueLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: workoutTheme.textMuted,
  },
  valueInput: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    border: "1px solid rgba(17,24,39,0.1)",
    background: "rgba(255,255,255,0.92)",
    fontSize: 28,
    lineHeight: 1,
    fontWeight: 800,
    color: workoutTheme.textPrimary,
    textAlign: "center",
    padding: "0 8px",
    outline: "none",
    fontVariantNumeric: "tabular-nums",
  },
  adjustRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
  },
  adjustBtn: {
    height: 32,
    borderRadius: 10,
    border: workoutTheme.pillBorder,
    background: workoutTheme.pillBg,
    color: workoutTheme.textSecondary,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  dotRow: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    border: "1px solid rgba(17,24,39,0.18)",
    background: "rgba(17,24,39,0.08)",
    cursor: "pointer",
    padding: 0,
  },
  dotDone: {
    background: "#0f172a",
    borderColor: "#0f172a",
  },
  dotActive: {
    boxShadow: "0 0 0 3px rgba(17,24,39,0.16)",
    transform: "scale(1.12)",
  },
  error: {
    fontSize: 12,
    fontWeight: 600,
    color: workoutTheme.danger,
    textAlign: "center",
  },
  primary: {
    width: "100%",
    minHeight: 56,
    borderRadius: 16,
    border: "1px solid rgba(17,24,39,0.12)",
    background: "rgba(17,24,39,0.08)",
    color: workoutTheme.textSecondary,
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryActive: {
    background: workoutTheme.accent,
    borderColor: workoutTheme.accent,
    color: workoutTheme.accentText,
    boxShadow: "0 10px 20px rgba(15,23,42,0.24)",
  },
  primaryDone: {
    background: "rgba(70,194,122,0.15)",
    borderColor: "rgba(70,194,122,0.4)",
    color: "#0f5132",
  },
  effortWrap: {
    display: "grid",
    gap: 8,
  },
  effortLabel: {
    fontSize: 12,
    color: workoutTheme.textMuted,
    fontWeight: 600,
    textAlign: "center",
  },
  effortRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 6,
  },
  effortBtn: {
    minHeight: 52,
    borderRadius: 12,
    border: workoutTheme.pillBorder,
    background: workoutTheme.pillBg,
    color: workoutTheme.textSecondary,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    gap: 2,
    fontSize: 16,
    lineHeight: 1,
    padding: "6px 2px",
  },
  effortBtnActive: {
    background: "rgba(17,24,39,0.12)",
    borderColor: "rgba(17,24,39,0.22)",
    color: workoutTheme.textPrimary,
  },
  effortText: {
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.1,
  },
};


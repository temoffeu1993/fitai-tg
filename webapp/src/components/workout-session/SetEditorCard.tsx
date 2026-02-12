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
    padding: 18,
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    display: "grid",
    gap: 14,
  },
  inputsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  valueBox: {
    border: "1px solid rgba(255,255,255,0.72)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.75) 100%)",
    borderRadius: 16,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 10px rgba(15,23,42,0.06)",
    padding: "10px 10px 9px",
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
    height: 56,
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,250,252,0.94) 100%)",
    fontSize: 30,
    lineHeight: 1,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
    textAlign: "center",
    padding: "0 8px",
    outline: "none",
    fontVariantNumeric: "tabular-nums",
    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.08)",
  },
  adjustRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 7,
  },
  adjustBtn: {
    height: 34,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  dotRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    cursor: "pointer",
    padding: 0,
  },
  dotDone: {
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow:
      "0 1px 2px rgba(2,6,23,0.42), inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
  },
  dotActive: {
    boxShadow:
      "0 0 0 3px rgba(17,24,39,0.1), inset 0 2px 3px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.85)",
    transform: "scale(1.08)",
  },
  error: {
    fontSize: 12,
    fontWeight: 600,
    color: workoutTheme.danger,
    textAlign: "center",
  },
  primary: {
    width: "100%",
    minHeight: 58,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
  },
  primaryActive: {
    background: workoutTheme.accent,
    color: workoutTheme.accentText,
    border: "1px solid #1e1f22",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  primaryDone: {
    background: "linear-gradient(180deg, #d7ff52 0%, #8bff1a 62%, #61d700 100%)",
    color: "rgba(17,56,6,0.82)",
    border: "none",
    boxShadow:
      "0 1px 2px rgba(86, 190, 0, 0.45), inset 0 1px 1px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(56, 135, 0, 0.45)",
  },
  effortWrap: {
    display: "grid",
    gap: 8,
  },
  effortLabel: {
    fontSize: 12,
    color: workoutTheme.textMuted,
    fontWeight: 500,
    textAlign: "center",
  },
  effortRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 8,
  },
  effortBtn: {
    minHeight: 54,
    borderRadius: 14,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
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
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    color: "#fff",
    boxShadow:
      "0 1px 2px rgba(2,6,23,0.42), inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -1px 1px rgba(2,6,23,0.55)",
  },
  effortText: {
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1.1,
  },
};

import type { CSSProperties } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { clampInt, requiresWeightInput } from "./utils";

type Props = {
  item: SessionItem | null;
  focusSetIndex: number;
  blocked: boolean;
  restEnabled: boolean;
  onFocusSet: (index: number) => void;
  onChangeReps: (setIdx: number, value: number) => void;
  onChangeWeight: (setIdx: number, value: number) => void;
  onToggleRestEnabled: () => void;
};

const MAX_REPS = 60;
const MIN_REPS = 0;
const MIN_WEIGHT = 0;
const MAX_WEIGHT = 300;
const WEIGHT_STEP = 1;

export default function SetEditorCard(props: Props) {
  const {
    item,
    focusSetIndex,
    blocked,
    restEnabled,
    onFocusSet,
    onChangeReps,
    onChangeWeight,
    onToggleRestEnabled,
  } = props;

  if (!item) return null;
  const set = item.sets[focusSetIndex];
  if (!set) return null;

  const needWeight = requiresWeightInput(item);
  const repsValue = Number.isFinite(Number(set.reps)) ? clampInt(Number(set.reps), MIN_REPS, MAX_REPS) : 0;
  const weightValue = Number.isFinite(Number(set.weight))
    ? Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, Math.round(Number(set.weight))))
    : 0;

  return (
    <section style={s.card}>
      <div style={s.inputsGrid}>
        <StepField
          label="Повторы"
          value={repsValue}
          onMinus={() => onChangeReps(focusSetIndex, Math.max(MIN_REPS, repsValue - 1))}
          onPlus={() => onChangeReps(focusSetIndex, Math.min(MAX_REPS, repsValue + 1))}
        />

        <StepField
          label="КГ"
          value={weightValue}
          disabled={!needWeight}
          onMinus={() => onChangeWeight(focusSetIndex, Math.max(MIN_WEIGHT, weightValue - WEIGHT_STEP))}
          onPlus={() => onChangeWeight(focusSetIndex, Math.min(MAX_WEIGHT, weightValue + WEIGHT_STEP))}
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

      {blocked ? <div style={s.error}>Введи повторы{needWeight ? " и кг" : ""}, затем отметь подход.</div> : null}

      <div style={s.restRow}>
        <span style={s.restLabel}>Авто-таймер отдыха</span>
        <button
          type="button"
          className={`ws-switch-btn ${restEnabled ? "ws-switch-btn-on" : ""}`}
          style={{ ...s.switchBtn, ...(restEnabled ? s.switchBtnOn : null) }}
          onClick={onToggleRestEnabled}
        >
          {restEnabled ? "Вкл" : "Выкл"}
        </button>
      </div>
    </section>
  );
}

function StepField(props: {
  label: string;
  value: number;
  disabled?: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const { label, value, disabled = false, onMinus, onPlus } = props;

  return (
    <div style={{ ...s.stepField, ...(disabled ? s.stepFieldDisabled : null) }}>
      <div style={s.valueLabel}>{label}</div>
      <div style={s.valueGroove}>
        <span style={s.valueText}>{value}</span>
      </div>
      <div style={s.stepActions}>
        <button
          type="button"
          style={s.stepBtn}
          onClick={onMinus}
          disabled={disabled}
          aria-label={`Уменьшить ${label}`}
        >
          −
        </button>
        <button
          type="button"
          style={s.stepBtn}
          onClick={onPlus}
          disabled={disabled}
          aria-label={`Увеличить ${label}`}
        >
          +
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
    minWidth: 0,
  },
  inputsGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
    gap: 12,
    minWidth: 0,
  },
  stepField: {
    display: "grid",
    gap: 8,
    minWidth: 0,
  },
  stepFieldDisabled: {
    opacity: 0.52,
  },
  valueLabel: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: workoutTheme.textMuted,
  },
  valueGroove: {
    minHeight: 88,
    borderRadius: 18,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
  },
  valueText: {
    fontSize: "clamp(44px, 13vw, 58px)",
    lineHeight: 1,
    fontWeight: 800,
    color: workoutTheme.textPrimary,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  stepActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  stepBtn: {
    minHeight: 44,
    borderRadius: 14,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textPrimary,
    fontSize: 24,
    lineHeight: 1,
    fontWeight: 700,
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
  restRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
  },
  restLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: workoutTheme.textSecondary,
  },
  switchBtn: {
    minHeight: 32,
    minWidth: 62,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    fontSize: 12,
    fontWeight: 700,
    padding: "0 12px",
    cursor: "pointer",
  },
  switchBtnOn: {
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,0.24)",
  },
};

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { requiresWeightInput } from "./utils";

type Props = {
  item: SessionItem | null;
  focusSetIndex: number;
  blocked: boolean;
  restEnabled: boolean;
  embedded?: boolean;
  onChangeReps: (setIdx: number, value: number) => void;
  onChangeWeight: (setIdx: number, value: number) => void;
  onToggleRestEnabled: () => void;
};

const WHEEL_ITEM_H = 72;
const WHEEL_VISIBLE = 1;
const REPS_VALUES = Array.from({ length: 61 }, (_, i) => i);
const WEIGHT_VALUES = Array.from({ length: 601 }, (_, i) => Math.round(i * 0.5 * 10) / 10);

export default function SetEditorCard(props: Props) {
  const {
    item,
    focusSetIndex,
    blocked,
    restEnabled,
    embedded = false,
    onChangeReps,
    onChangeWeight,
    onToggleRestEnabled,
  } = props;

  if (!item) return null;
  const set = item.sets[focusSetIndex];
  if (!set) return null;
  const needWeight = requiresWeightInput(item);

  return (
    <section style={{ ...(embedded ? s.embedRoot : s.card) }}>
      <div style={s.inputsGrid}>
        <WheelField
          label="Повторы"
          values={REPS_VALUES}
          value={Number.isFinite(Number(set.reps)) ? Number(set.reps) : undefined}
          onChange={(value) => onChangeReps(focusSetIndex, value)}
          formatValue={(value) => String(Math.round(value))}
        />

        <WheelField
          label="КГ"
          values={WEIGHT_VALUES}
          value={Number.isFinite(Number(set.weight)) ? Number(set.weight) : undefined}
          onChange={(value) => onChangeWeight(focusSetIndex, value)}
          formatValue={(value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))}
          disabled={!needWeight}
        />
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

function WheelField(props: {
  label: string;
  values: number[];
  value: number | undefined;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
  disabled?: boolean;
}) {
  const { label, values, value, onChange, formatValue, disabled = false } = props;
  const listRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const selectedIndex = useMemo(() => {
    if (!values.length) return 0;
    const target = Number.isFinite(Number(value)) ? Number(value) : values[0];
    let bestIdx = 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < values.length; i += 1) {
      const diff = Math.abs(values[i] - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [value, values]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const targetTop = selectedIndex * WHEEL_ITEM_H;
    if (Math.abs(node.scrollTop - targetTop) > 1) {
      node.scrollTo({ top: targetTop, behavior: "auto" });
    }
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
    };
  }, []);

  const handleScroll = () => {
    if (disabled) return;
    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      const node = listRef.current;
      if (!node || !values.length) return;
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(node.scrollTop / WHEEL_ITEM_H)));
      const next = values[idx];
      if (!Number.isFinite(Number(value)) || Math.abs(Number(value) - next) > 0.0001) {
        onChange(next);
      }
    });

    if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(() => {
      const node = listRef.current;
      if (!node || !values.length) return;
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(node.scrollTop / WHEEL_ITEM_H)));
      const next = values[idx];
      node.scrollTo({ top: idx * WHEEL_ITEM_H, behavior: "smooth" });
      if (!Number.isFinite(Number(value)) || Math.abs(Number(value) - next) > 0.0001) {
        onChange(next);
      }
    }, 80);
  };

  return (
    <div style={{ ...s.wheelField, ...(disabled ? s.wheelFieldDisabled : null) }}>
      <div style={s.wheelWrap}>
        <div ref={listRef} style={s.wheelList} onScroll={handleScroll} aria-label={label} role="listbox">
          {values.map((entry, idx) => (
            <button
              key={`${label}-${entry}-${idx}`}
              type="button"
              style={{ ...s.wheelItem, ...(idx === selectedIndex ? s.wheelItemActive : null) }}
              onClick={() => onChange(entry)}
              disabled={disabled}
              aria-selected={idx === selectedIndex}
            >
              {formatValue(entry)}
            </button>
          ))}
        </div>
      </div>
      <div style={s.valueLabel}>{label}</div>
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
  embedRoot: {
    display: "grid",
    gap: 14,
    minWidth: 0,
    paddingTop: 2,
  },
  inputsGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
    gap: 12,
    minWidth: 0,
  },
  wheelField: {
    border: "none",
    background: "transparent",
    borderRadius: 0,
    boxShadow: "none",
    padding: 0,
    display: "grid",
    gap: 6,
    minWidth: 0,
  },
  wheelFieldDisabled: {
    opacity: 0.52,
  },
  valueLabel: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: workoutTheme.textMuted,
    marginTop: 2,
  },
  wheelWrap: {
    position: "relative",
    height: WHEEL_ITEM_H * WHEEL_VISIBLE,
    overflow: "hidden",
    borderRadius: 16,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
  },
  wheelList: {
    position: "relative",
    zIndex: 1,
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
    scrollSnapType: "y mandatory",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    paddingTop: 0,
    paddingBottom: 0,
    touchAction: "pan-y",
  },
  wheelItem: {
    width: "100%",
    height: WHEEL_ITEM_H,
    border: "none",
    background: "transparent",
    color: workoutTheme.textSecondary,
    fontSize: 46,
    fontWeight: 700,
    lineHeight: 1,
    scrollSnapAlign: "center",
    fontVariantNumeric: "tabular-nums",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "clip",
  },
  wheelItemActive: {
    color: workoutTheme.textPrimary,
    fontSize: 52,
    fontWeight: 800,
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

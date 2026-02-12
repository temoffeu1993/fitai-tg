import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { formatRepsLabel, parseWeightNumber, requiresWeightInput } from "./utils";
import { fireHapticImpact } from "@/utils/haptics";

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
const WHEEL_CYCLES = 7;
const WHEEL_MID = Math.floor(WHEEL_CYCLES / 2);
const EPS = 0.0001;
const REPS_VALUES = Array.from({ length: 61 }, (_, i) => i);
const WEIGHT_VALUES = Array.from({ length: 601 }, (_, i) => Math.round(i * 0.5 * 10) / 10);

export default function SetEditorCard(props: Props) {
  const {
    item,
    focusSetIndex,
    blocked,
    embedded = false,
    onChangeReps,
    onChangeWeight,
  } = props;

  if (!item) return null;
  const set = item.sets[focusSetIndex];
  if (!set) return null;
  const needWeight = requiresWeightInput(item);
  const repsHintRaw = formatRepsLabel(item.targetReps);
  const repsHint = repsHintRaw ? `${repsHintRaw} повторов` : "—";
  const parsedWeight = parseWeightNumber(item.targetWeight);
  const weightHint = parsedWeight != null
    ? `${Number.isInteger(parsedWeight) ? parsedWeight : parsedWeight.toFixed(1)} кг`
    : typeof item.targetWeight === "string" && item.targetWeight.trim()
      ? item.targetWeight.trim()
      : "";

  return (
    <section style={{ ...(embedded ? s.embedRoot : s.card) }}>
      <div style={s.inputsGrid}>
        <WheelField
          ariaLabel="Повторы"
          hintLabel={repsHint}
          values={REPS_VALUES}
          value={Number.isFinite(Number(set.reps)) ? Number(set.reps) : undefined}
          onChange={(value) => onChangeReps(focusSetIndex, value)}
          formatValue={(value) => String(Math.round(value))}
        />

        <WheelField
          ariaLabel="Килограммы"
          hintLabel={needWeight ? weightHint : null}
          values={WEIGHT_VALUES}
          value={Number.isFinite(Number(set.weight)) ? Number(set.weight) : undefined}
          onChange={(value) => onChangeWeight(focusSetIndex, value)}
          formatValue={(value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))}
          disabled={!needWeight}
        />
      </div>

      {blocked ? <div style={s.error}>Введи повторы{needWeight ? " и кг" : ""}, затем отметь подход.</div> : null}
    </section>
  );
}

function WheelField(props: {
  ariaLabel: string;
  hintLabel?: string | null;
  values: number[];
  value: number | undefined;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
  disabled?: boolean;
}) {
  const { ariaLabel, hintLabel, values, value, onChange, formatValue, disabled = false } = props;
  const listRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const suppressHapticsRef = useRef(true);
  const lastTickRef = useRef<number | null>(null);

  const selectedValue = useMemo(() => {
    if (!values.length) return 0;
    return Number.isFinite(Number(value)) ? Number(value) : values[0];
  }, [value, values]);

  const selectedBaseIndex = useMemo(() => {
    if (!values.length) return 0;
    const target = selectedValue;
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
  }, [selectedValue, values]);

  const wheelValues = useMemo(() => {
    if (!values.length) return [] as number[];
    return Array.from({ length: values.length * WHEEL_CYCLES }, (_, i) => values[i % values.length]);
  }, [values]);

  useEffect(() => {
    const node = listRef.current;
    if (!node || !values.length) return;
    if (interactingRef.current) return;
    const targetIdx = values.length * WHEEL_MID + selectedBaseIndex;
    const targetTop = targetIdx * WHEEL_ITEM_H;
    if (Math.abs(node.scrollTop - targetTop) > 1) {
      node.scrollTo({ top: targetTop, behavior: "auto" });
    }
    lastTickRef.current = targetIdx;
  }, [selectedBaseIndex, values.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      suppressHapticsRef.current = false;
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
      if (releaseTimerRef.current != null) window.clearTimeout(releaseTimerRef.current);
    };
  }, []);

  const getScrollState = () => {
    const node = listRef.current;
    if (!node || !values.length || !wheelValues.length) return null;
    const rawIdx = Math.round(node.scrollTop / WHEEL_ITEM_H);
    const clamped = Math.max(0, Math.min(rawIdx, wheelValues.length - 1));
    const baseIdx = ((clamped % values.length) + values.length) % values.length;
    const next = values[baseIdx];
    return { baseIdx, next };
  };

  const handleScroll = () => {
    if (disabled) return;
    interactingRef.current = true;
    if (releaseTimerRef.current != null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    if (rafRef.current == null) {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const node = listRef.current;
        const state = getScrollState();
        if (!node || !state || !values.length || !wheelValues.length) return;
        const rawIdx = Math.round(node.scrollTop / WHEEL_ITEM_H);
        const clamped = Math.max(0, Math.min(rawIdx, wheelValues.length - 1));
        if (lastTickRef.current !== clamped) {
          lastTickRef.current = clamped;
          if (!suppressHapticsRef.current) fireHapticImpact("light");
        }
        if (!state) return;
        if (Math.abs(selectedValue - state.next) > EPS) onChange(state.next);
      });
    }

    if (stopTimerRef.current != null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(() => {
      const node = listRef.current;
      const state = getScrollState();
      if (!node || !state || !values.length) return;
      if (Math.abs(selectedValue - state.next) > EPS) {
        onChange(state.next);
      }
      const targetIdx = values.length * WHEEL_MID + state.baseIdx;
      node.scrollTo({ top: targetIdx * WHEEL_ITEM_H, behavior: "smooth" });
      if (!suppressHapticsRef.current) fireHapticImpact("light");
      releaseTimerRef.current = window.setTimeout(() => {
        interactingRef.current = false;
      }, 150);
    }, 80);
  };

  const handleSelect = () => {
    if (disabled || !values.length) return;
    const node = listRef.current;
    if (!node) return;
    interactingRef.current = true;
    if (releaseTimerRef.current != null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    const curIdx = Math.round(node.scrollTop / WHEEL_ITEM_H);
    const curVal = ((curIdx % values.length) + values.length) % values.length;
    const nextBaseIdx = (selectedBaseIndex + 1) % values.length;
    let targetIdx = curIdx - curVal + nextBaseIdx;
    if (nextBaseIdx <= curVal) targetIdx += values.length;
    const next = values[nextBaseIdx];
    node.scrollTo({ top: targetIdx * WHEEL_ITEM_H, behavior: "smooth" });
    if (Math.abs(selectedValue - next) > EPS) onChange(next);
    if (!suppressHapticsRef.current) fireHapticImpact("light");
    releaseTimerRef.current = window.setTimeout(() => {
      interactingRef.current = false;
    }, 260);
  };

  return (
    <div style={{ ...s.wheelField, ...(disabled ? s.wheelFieldDisabled : null) }}>
      <div style={s.wheelWrap}>
        <div
          ref={listRef}
          style={{ ...s.wheelList, ...(disabled ? s.wheelListDisabled : null) }}
          onScroll={disabled ? undefined : handleScroll}
          aria-label={ariaLabel}
          role="listbox"
        >
          {wheelValues.map((entry, idx) => (
            <button
              key={`${ariaLabel}-${entry}-${idx}`}
              type="button"
              style={{ ...s.wheelItem, ...(Math.abs(entry - selectedValue) <= EPS ? s.wheelItemActive : null) }}
              onClick={handleSelect}
              disabled={disabled}
              aria-selected={Math.abs(entry - selectedValue) <= EPS}
            >
              {formatValue(entry)}
            </button>
          ))}
        </div>
      </div>
      {hintLabel ? <div style={s.valueLabel}>{hintLabel}</div> : null}
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
    paddingTop: 16,
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
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    color: "rgba(15, 23, 42, 0.6)",
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
    scrollSnapType: "y proximity",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    paddingTop: 0,
    paddingBottom: 0,
    touchAction: "pan-y",
  },
  wheelListDisabled: {
    overflowY: "hidden",
    touchAction: "none",
    pointerEvents: "none",
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
};

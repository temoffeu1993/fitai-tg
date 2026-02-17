import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { defaultRepsFromTarget, formatRepsLabel, parseWeightNumber, requiresWeightInput } from "./utils";
import { fireHapticImpact } from "@/utils/haptics";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  item: SessionItem | null;
  focusSetIndex: number;
  blocked: boolean;
  restEnabled: boolean;
  embedded?: boolean;
  onChangeReps: (setIdx: number, value: number) => void;
  onChangeWeight: (setIdx: number, value: number) => void;
  onCommitSet: () => boolean;
  onToggleRestEnabled: () => void;
  onFocusSet?: (setIdx: number) => void;
};

const WHEEL_ITEM_H = 72;
const WHEEL_VISIBLE = 1;
const WHEEL_CYCLES = 7;
const WHEEL_MID = Math.floor(WHEEL_CYCLES / 2);
const EPS = 0.0001;
const FLASH_TINT_MS = 520;
const SAVED_LABEL_MS = 1400;
const REPS_VALUES = Array.from({ length: 60 }, (_, i) => i + 1);
const WEIGHT_VALUES = Array.from({ length: 601 }, (_, i) => Math.round(i * 0.5 * 10) / 10);

export default function SetEditorCard(props: Props) {
  const {
    item,
    focusSetIndex,
    blocked,
    embedded = false,
    onChangeReps,
    onChangeWeight,
    onCommitSet,
    onFocusSet,
  } = props;
  const [commitFlash, setCommitFlash] = useState(false);
  const [showSavedLabel, setShowSavedLabel] = useState(false);
  const flashTimerRef = useRef<number | null>(null);
  const savedLabelTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
      if (savedLabelTimerRef.current != null) window.clearTimeout(savedLabelTimerRef.current);
    };
  }, []);

  if (!item) return null;
  const set = item.sets[focusSetIndex];
  if (!set) return null;
  const exerciseCompleted = item.sets.every((entry) => Boolean(entry.done));
  const tintOn = commitFlash || exerciseCompleted;
  const needWeight = requiresWeightInput(item);
  const totalSets = Math.max(1, item.sets.length);
  const doneSets = item.sets.filter((entry) => Boolean(entry.done)).length;
  const displaySet =
    doneSets >= totalSets
      ? totalSets
      : Math.min(Math.max(0, focusSetIndex), totalSets - 1) + 1;
  const repsHintRaw = formatRepsLabel(item.targetReps);
  const repsHint = repsHintRaw ? `${repsHintRaw} повторов` : "—";
  const parsedWeight = parseWeightNumber(item.targetWeight);
  const weightHint = parsedWeight != null
    ? `${Number.isInteger(parsedWeight) ? parsedWeight : parsedWeight.toFixed(1)} кг`
      : typeof item.targetWeight === "string" && item.targetWeight.trim()
      ? item.targetWeight.trim()
      : "";
  const explicitReps = Number(set.reps);
  const prevRepsRaw = focusSetIndex > 0 ? Number(item.sets[focusSetIndex - 1]?.reps) : Number.NaN;
  const prevReps =
    Number.isFinite(prevRepsRaw) && prevRepsRaw > 0 ? Math.round(prevRepsRaw) : undefined;
  const targetDefaultReps = defaultRepsFromTarget(item.targetReps);
  const repsDisplayValue =
    Number.isFinite(explicitReps) && explicitReps > 0
      ? Math.round(explicitReps)
      : prevReps ?? targetDefaultReps;

  const canGoPrev = focusSetIndex > 0;
  const canGoNext = focusSetIndex < totalSets - 1;

  const handleCommit = () => {
    const committed = onCommitSet();
    if (!committed) return;
    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    setCommitFlash(true);
    flashTimerRef.current = window.setTimeout(() => {
      setCommitFlash(false);
      flashTimerRef.current = null;
    }, FLASH_TINT_MS);

    if (savedLabelTimerRef.current != null) window.clearTimeout(savedLabelTimerRef.current);
    setShowSavedLabel(true);
    savedLabelTimerRef.current = window.setTimeout(() => {
      setShowSavedLabel(false);
      savedLabelTimerRef.current = null;
    }, SAVED_LABEL_MS);
  };

  return (
    <section style={{ ...(embedded ? s.embedRoot : s.card) }}>
      <style>{secCss}</style>
      <div style={s.inputsGrid}>
        <WheelField
          ariaLabel="Повторы"
          hintLabel={repsHint}
          values={REPS_VALUES}
          value={repsDisplayValue}
          onChange={(value) => onChangeReps(focusSetIndex, value)}
          formatValue={(value) => String(Math.round(value))}
          flashSuccess={tintOn}
        />

        <WheelField
          ariaLabel="Килограммы"
          hintLabel={needWeight ? weightHint : null}
          values={WEIGHT_VALUES}
          value={Number.isFinite(Number(set.weight)) ? Number(set.weight) : undefined}
          onChange={(value) => onChangeWeight(focusSetIndex, value)}
          formatValue={(value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))}
          disabled={!needWeight}
          flashSuccess={tintOn}
        />
      </div>

      <button
        type="button"
        aria-label="Подход выполнен"
        style={s.commitBtn}
        onClick={handleCommit}
      >
        <span
          aria-hidden
          style={{
            ...s.commitTintOverlay,
            ...(tintOn ? s.commitTintOverlayOn : null),
          }}
        />
        <span
          aria-hidden
          style={s.commitCheck}
        >
          ✓
        </span>
      </button>

      {/* Set navigation row */}
      <div style={s.setNavRow}>
        {/* Left arrow — go to previous set */}
        <button
          type="button"
          className="sec-nav-btn"
          style={{
            ...s.navBtn,
            opacity: canGoPrev ? 1 : 0,
            pointerEvents: canGoPrev ? "auto" : "none",
          }}
          aria-label="Предыдущий подход"
          tabIndex={canGoPrev ? 0 : -1}
          onClick={() => {
            if (canGoPrev && onFocusSet) {
              onFocusSet(focusSetIndex - 1);
              fireHapticImpact("light");
            }
          }}
        >
          <ChevronLeft size={16} strokeWidth={2.2} />
        </button>

        {/* Counter text */}
        <div style={s.setIndexText} aria-live="polite">
          <span
            aria-hidden={showSavedLabel}
            style={{
              ...s.setIndexTextLayer,
              ...(showSavedLabel ? s.setIndexTextLayerHidden : s.setIndexTextLayerVisible),
            }}
          >
            Подход {displaySet} из {totalSets}
          </span>
          <span
            aria-hidden={!showSavedLabel}
            style={{
              ...s.setIndexTextLayer,
              ...(showSavedLabel ? s.savedTextVisible : s.savedTextHidden),
            }}
          >
            Подход сохранен
          </span>
        </div>

        {/* Right arrow — go to next set */}
        <button
          type="button"
          className="sec-nav-btn"
          style={{
            ...s.navBtn,
            opacity: canGoNext ? 1 : 0,
            pointerEvents: canGoNext ? "auto" : "none",
          }}
          aria-label="Следующий подход"
          tabIndex={canGoNext ? 0 : -1}
          onClick={() => {
            if (canGoNext && onFocusSet) {
              onFocusSet(focusSetIndex + 1);
              fireHapticImpact("light");
            }
          }}
        >
          <ChevronRight size={16} strokeWidth={2.2} />
        </button>
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
  flashSuccess?: boolean;
}) {
  const { ariaLabel, hintLabel, values, value, onChange, formatValue, disabled = false, flashSuccess = false } = props;
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
          aria-hidden
          style={{
            ...s.wheelTintOverlay,
            ...(flashSuccess ? s.wheelTintOverlayOn : null),
          }}
        />
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

const secCss = `
  .sec-nav-btn {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition: opacity 140ms ease, transform 130ms ease;
    will-change: transform;
  }
  .sec-nav-btn:active {
    transform: scale(0.82);
    opacity: 0.5;
  }
  @media (prefers-reduced-motion: reduce) {
    .sec-nav-btn { transition: none !important; }
  }
`;

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
  wheelTintOverlay: {
    position: "absolute",
    inset: 0,
    borderRadius: 16,
    pointerEvents: "none",
    opacity: 0,
    background: "linear-gradient(180deg, rgba(196,228,178,0.34) 0%, rgba(170,210,146,0.42) 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(78,122,58,0.12), inset 0 -1px 0 rgba(255,255,255,0.22)",
    transition: `opacity ${FLASH_TINT_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
    zIndex: 1,
  },
  wheelTintOverlayOn: {
    opacity: 1,
  },
  wheelList: {
    position: "relative",
    zIndex: 2,
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
    fontSize: 32,
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
    fontSize: 32,
    fontWeight: 700,
  },
  commitBtn: {
    width: "100%",
    minHeight: 56,
    borderRadius: 16,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    cursor: "pointer",
  },
  commitTintOverlay: {
    position: "absolute",
    inset: 0,
    borderRadius: 16,
    pointerEvents: "none",
    opacity: 0,
    background: "linear-gradient(180deg, rgba(196,228,178,0.34) 0%, rgba(170,210,146,0.42) 100%)",
    boxShadow:
      "inset 0 2px 3px rgba(78,122,58,0.12), inset 0 -1px 0 rgba(255,255,255,0.22)",
    transition: `opacity ${FLASH_TINT_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
    zIndex: 1,
  },
  commitTintOverlayOn: {
    opacity: 1,
  },
  commitCheck: {
    position: "relative",
    zIndex: 2,
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1,
    color: "rgba(15,23,42,0.45)",
    textShadow: "0 1px 0 rgba(255,255,255,0.82), 0 -1px 0 rgba(15,23,42,0.15)",
  },
  setIndexText: {
    position: "relative",
    minHeight: 21,
    flex: 1,
    minWidth: 0,
  },
  setIndexTextLayer: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, 0.62)",
    transition: "opacity 220ms ease, transform 220ms ease",
    willChange: "opacity, transform",
    whiteSpace: "nowrap",
  },
  setIndexTextLayerVisible: {
    opacity: 1,
    transform: "translateY(0)",
  },
  setIndexTextLayerHidden: {
    opacity: 0,
    transform: "translateY(-4px)",
  },
  savedTextHidden: {
    opacity: 0,
    transform: "translateY(4px)",
  },
  savedTextVisible: {
    opacity: 1,
    transform: "translateY(0)",
  },
  error: {
    fontSize: 12,
    fontWeight: 600,
    color: workoutTheme.danger,
    textAlign: "center",
  },

  // Set navigation row
  setNavRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  navBtn: {
    flexShrink: 0,
    width: 32,
    height: 32,
    border: "none",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    cursor: "pointer",
    color: "rgba(15,23,42,0.45)",
    padding: 0,
    transition: "opacity 140ms ease",
  },
};

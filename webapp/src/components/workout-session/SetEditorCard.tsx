import { useRef, useEffect, useCallback, type CSSProperties } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { clampInt, formatRepsLabel, requiresWeightInput, setsSummary } from "./utils";
import { MoreHorizontal } from "lucide-react";

type Props = {
  item: SessionItem | null;
  focusSetIndex: number;
  blocked: boolean;
  onFocusSet: (index: number) => void;
  onChangeReps: (setIdx: number, value: number) => void;
  onChangeWeight: (setIdx: number, value: number) => void;
  onOpenMenu: () => void;
};

const MAX_REPS = 60;
const MIN_REPS = 0;
const MIN_WEIGHT = 0;
const MAX_WEIGHT = 300;
const WEIGHT_STEP = 2.5;

const ITEM_H = 44;
const VISIBLE_ITEMS = 3;

export default function SetEditorCard(props: Props) {
  const {
    item,
    focusSetIndex,
    blocked,
    onFocusSet,
    onChangeReps,
    onChangeWeight,
    onOpenMenu,
  } = props;

  if (!item) return null;
  const set = item.sets[focusSetIndex];
  if (!set) return null;

  const needWeight = requiresWeightInput(item);
  const repsValue = Number.isFinite(Number(set.reps)) ? clampInt(Number(set.reps), MIN_REPS, MAX_REPS) : 0;
  const weightValue = Number.isFinite(Number(set.weight))
    ? Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, Number(set.weight)))
    : 0;

  const summary = setsSummary(item);
  const targetReps = formatRepsLabel(item.targetReps);
  const targetWeight = item.targetWeight ? String(item.targetWeight) : null;

  return (
    <section style={s.card}>
      {/* Exercise name + menu */}
      <div style={s.nameRow}>
        <h2 style={s.name}>{item.name}</h2>
        <button
          type="button"
          aria-label="Меню упражнения"
          style={s.menuBtn}
          onClick={onOpenMenu}
        >
          <MoreHorizontal size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Set indicator */}
      <div style={s.setInfo}>
        Подход {focusSetIndex + 1} из {item.sets.length}
      </div>

      {/* Set dots */}
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
              ...(idx === focusSetIndex && !entry.done ? s.dotActive : null),
              ...(idx === focusSetIndex && entry.done ? s.dotDoneActive : null),
            }}
          >
            {entry.done ? (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span style={s.dotNum}>{idx + 1}</span>
            )}
          </button>
        ))}
      </div>

      {/* Scroll wheels */}
      <div style={s.wheelsRow}>
        <div style={s.wheelCol}>
          <ScrollWheel
            value={repsValue}
            min={MIN_REPS}
            max={MAX_REPS}
            step={1}
            onChange={(v) => onChangeReps(focusSetIndex, v)}
            disabled={false}
          />
          <div style={s.wheelLabel}>повт.</div>
          {targetReps ? <div style={s.wheelHint}>цель: {targetReps}</div> : null}
        </div>

        <div style={{ ...s.wheelCol, ...(needWeight ? null : s.wheelColDisabled) }}>
          <ScrollWheel
            value={weightValue}
            min={MIN_WEIGHT}
            max={MAX_WEIGHT}
            step={WEIGHT_STEP}
            onChange={(v) => onChangeWeight(focusSetIndex, v)}
            disabled={!needWeight}
          />
          <div style={s.wheelLabel}>кг</div>
          {targetWeight ? <div style={s.wheelHint}>цель: {targetWeight}</div> : null}
        </div>
      </div>

      {/* Error */}
      {blocked ? (
        <div style={s.error}>
          Введи повторы{needWeight ? " и кг" : ""}, затем отметь подход.
        </div>
      ) : null}
    </section>
  );
}

/* ─── Scroll Wheel (drum picker) ──────────────────────────────── */

function ScrollWheel(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const { value, min, max, step, onChange, disabled } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollTimerRef = useRef<number | null>(null);
  const lastReportedRef = useRef(value);

  const steps: number[] = [];
  for (let v = min; v <= max; v += step) {
    steps.push(Math.round(v * 100) / 100);
  }

  const valueIndex = steps.indexOf(
    steps.reduce((prev, curr) =>
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    , steps[0])
  );

  // Scroll to value on mount and when value changes externally
  useEffect(() => {
    const el = containerRef.current;
    if (!el || isScrollingRef.current) return;
    const targetTop = valueIndex * ITEM_H;
    el.scrollTop = targetTop;
    lastReportedRef.current = value;
  }, [valueIndex, value]);

  const handleScroll = useCallback(() => {
    if (disabled) return;
    isScrollingRef.current = true;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

    scrollTimerRef.current = window.setTimeout(() => {
      isScrollingRef.current = false;
      const el = containerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(steps.length - 1, idx));
      const snapped = clamped * ITEM_H;
      el.scrollTo({ top: snapped, behavior: "smooth" });
      const newVal = steps[clamped];
      if (newVal !== lastReportedRef.current) {
        lastReportedRef.current = newVal;
        onChange(newVal);
      }
    }, 80);
  }, [disabled, onChange, steps]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const wheelHeight = VISIBLE_ITEMS * ITEM_H;
  const padItems = Math.floor(VISIBLE_ITEMS / 2);

  return (
    <div style={{ ...sw.outer, height: wheelHeight, ...(disabled ? sw.outerDisabled : null) }}>
      {/* Selection highlight band */}
      <div style={sw.highlight} aria-hidden />
      <div
        ref={containerRef}
        className="ws-scroll-wheel"
        style={sw.scroll}
        onScroll={handleScroll}
      >
        {/* Top padding */}
        {Array.from({ length: padItems }).map((_, i) => (
          <div key={`pad-top-${i}`} style={sw.item} aria-hidden />
        ))}
        {steps.map((v, i) => {
          const isCurrent = i === valueIndex;
          return (
            <div
              key={v}
              style={{
                ...sw.item,
                ...(isCurrent ? sw.itemActive : sw.itemInactive),
              }}
            >
              {step < 1 ? v.toFixed(1) : v}
            </div>
          );
        })}
        {/* Bottom padding */}
        {Array.from({ length: padItems }).map((_, i) => (
          <div key={`pad-bot-${i}`} style={sw.item} aria-hidden />
        ))}
      </div>
    </div>
  );
}

const sw: Record<string, CSSProperties> = {
  outer: {
    position: "relative",
    borderRadius: 16,
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    overflow: "hidden",
    width: "100%",
  },
  outerDisabled: {
    opacity: 0.4,
    pointerEvents: "none",
  },
  highlight: {
    position: "absolute",
    left: 6,
    right: 6,
    top: "50%",
    transform: "translateY(-50%)",
    height: ITEM_H,
    borderRadius: 12,
    background: "rgba(15,23,42,0.06)",
    pointerEvents: "none",
    zIndex: 1,
  },
  scroll: {
    height: "100%",
    overflowY: "auto",
    scrollSnapType: "y mandatory",
    WebkitOverflowScrolling: "touch",
    position: "relative",
    zIndex: 2,
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  },
  item: {
    height: ITEM_H,
    display: "grid",
    placeItems: "center",
    fontSize: 28,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    scrollSnapAlign: "start",
    userSelect: "none",
    color: "rgba(15,23,42,0.2)",
    letterSpacing: -0.5,
    lineHeight: 1,
  },
  itemActive: {
    color: workoutTheme.textPrimary,
    fontSize: 32,
    fontWeight: 800,
  },
  itemInactive: {
    color: "rgba(15,23,42,0.18)",
  },
};

const s: Record<string, CSSProperties> = {
  card: {
    padding: "20px 18px 18px",
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    display: "grid",
    gap: 16,
    minWidth: 0,
    overflow: "hidden",
  },
  nameRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
  },
  name: {
    margin: 0,
    minWidth: 0,
    fontSize: 26,
    lineHeight: 1.15,
    fontWeight: 700,
    letterSpacing: -0.5,
    color: workoutTheme.textPrimary,
    overflowWrap: "anywhere",
  },
  menuBtn: {
    border: "none",
    background: "transparent",
    borderRadius: 999,
    width: 36,
    height: 36,
    padding: 0,
    color: workoutTheme.textMuted,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  setInfo: {
    fontSize: 14,
    fontWeight: 600,
    color: workoutTheme.textSecondary,
    letterSpacing: -0.1,
  },
  dotRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    border: "1.5px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.8)",
    cursor: "pointer",
    padding: 0,
    display: "grid",
    placeItems: "center",
    transition: "all 200ms ease",
  },
  dotDone: {
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    border: "1.5px solid rgba(30,31,34,0.8)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
  dotActive: {
    border: "2px solid #1e1f22",
    boxShadow: "0 0 0 3px rgba(30,31,34,0.12)",
    transform: "scale(1.1)",
  },
  dotDoneActive: {
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    border: "2px solid #1e1f22",
    boxShadow: "0 0 0 3px rgba(30,31,34,0.12), 0 1px 3px rgba(0,0,0,0.3)",
    transform: "scale(1.1)",
  },
  dotNum: {
    fontSize: 11,
    fontWeight: 700,
    color: workoutTheme.textMuted,
  },
  wheelsRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    minWidth: 0,
  },
  wheelCol: {
    display: "grid",
    gap: 6,
    justifyItems: "center",
  },
  wheelColDisabled: {
    opacity: 0.45,
  },
  wheelLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: workoutTheme.textMuted,
    textAlign: "center",
  },
  wheelHint: {
    fontSize: 11,
    fontWeight: 500,
    color: workoutTheme.textMuted,
    opacity: 0.7,
    textAlign: "center",
  },
  error: {
    fontSize: 13,
    fontWeight: 600,
    color: workoutTheme.danger,
    textAlign: "center",
    padding: "2px 0",
  },
};

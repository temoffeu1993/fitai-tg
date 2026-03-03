import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";
import { defaultRepsFromTarget, requiresWeightInput } from "./utils";

function formatDoneChip(set: { reps?: number | null; weight?: number | null }, needWeight: boolean): string {
  const r = set.reps != null ? Math.round(Number(set.reps)) : null;
  const rStr = r != null && r > 0 ? String(r) : "—";
  if (!needWeight) return rStr;
  const w = set.weight != null ? Number(set.weight) : null;
  const wStr = w != null && w > 0
    ? (Number.isInteger(w) ? String(w) : w.toFixed(1))
    : "—";
  return `${rStr} × ${wStr} кг`;
}
import { fireHapticImpact } from "@/utils/haptics";
import { ChevronDown } from "lucide-react";

type Props = {
  item: SessionItem | null;
  focusSetIndex: number;
  blocked: boolean;
  restEnabled: boolean;
  embedded?: boolean;
  transitionKey?: number;
  onChangeReps: (setIdx: number, value: number) => void;
  onChangeWeight: (setIdx: number, value: number) => void;
  onCommitSet: () => boolean;
  onToggleRestEnabled: () => void;
  onFocusSet?: (setIdx: number) => void;
};

const WHEEL_ITEM_H = 36;
const WHEEL_WRAP_H = WHEEL_ITEM_H * 3;
const WHEEL_CENTER_OFFSET = WHEEL_ITEM_H;
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
    transitionKey,
    onChangeReps,
    onChangeWeight,
    onCommitSet,
    onFocusSet,
  } = props;
  const [commitFlash, setCommitFlash] = useState(false);
  const [showSavedLabel, setShowSavedLabel] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [counterPulse, setCounterPulse] = useState(false);
  const flashTimerRef = useRef<number | null>(null);
  const savedLabelTimerRef = useRef<number | null>(null);
  const counterPulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
      if (savedLabelTimerRef.current != null) window.clearTimeout(savedLabelTimerRef.current);
      if (counterPulseTimerRef.current != null) window.clearTimeout(counterPulseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (transitionKey == null || transitionKey === 0) return;
    setCounterPulse(true);
    if (counterPulseTimerRef.current != null) window.clearTimeout(counterPulseTimerRef.current);
    counterPulseTimerRef.current = window.setTimeout(() => {
      setCounterPulse(false);
      counterPulseTimerRef.current = null;
    }, 620);
  }, [transitionKey]);

  if (!item) return null;
  const set = item.sets[focusSetIndex];
  if (!set) return null;
  const exerciseCompleted = item.sets.every((entry) => Boolean(entry.done));
  const tintOn = commitFlash || exerciseCompleted || Boolean(set.done);
  const needWeight = requiresWeightInput(item);
  const totalSets = Math.max(1, item.sets.length);
  const displaySet = Math.min(Math.max(0, focusSetIndex), totalSets - 1) + 1;
  const repsHint = "повторы";
  const weightHint = needWeight ? (item.weightLabel || "кг") : null;
  const explicitReps = Number(set.reps);
  const prevRepsRaw = focusSetIndex > 0 ? Number(item.sets[focusSetIndex - 1]?.reps) : Number.NaN;
  const prevReps =
    Number.isFinite(prevRepsRaw) && prevRepsRaw > 0 ? Math.round(prevRepsRaw) : undefined;
  const targetDefaultReps = defaultRepsFromTarget(item.targetReps);
  const repsDisplayValue =
    Number.isFinite(explicitReps) && explicitReps > 0
      ? Math.round(explicitReps)
      : prevReps ?? targetDefaultReps;

  const doneSets = item.sets.filter((entry) => entry.done).length;
  const hasDoneSets = doneSets > 0;
  const progressPercent = (doneSets / totalSets) * 100;

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
      <div style={needWeight ? s.inputsGrid : s.inputsGridSingle}>
        <WheelField
          ariaLabel="Повторы"
          hintLabel={repsHint}
          values={REPS_VALUES}
          value={repsDisplayValue}
          onChange={(value) => onChangeReps(focusSetIndex, value)}
          formatValue={(value) => String(Math.round(value))}
          flashSuccess={tintOn}
          cyclic
        />

        {needWeight && (
          <WheelField
            ariaLabel="Килограммы"
            hintLabel={weightHint}
            values={WEIGHT_VALUES}
            value={Number.isFinite(Number(set.weight)) ? Number(set.weight) : undefined}
            onChange={(value) => onChangeWeight(focusSetIndex, value)}
            formatValue={(value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))}
            flashSuccess={tintOn}
          />
        )}
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
            ...s.commitProgressFill,
            width: `${progressPercent}%`,
          }}
        />
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

      {/* Set counter + expandable history */}
      <div>
        <button
          type="button"
          style={s.setCounterBtn}
          onClick={() => hasDoneSets && setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
        >
          <div
            style={s.setIndexText}
            aria-live="polite"
            className={counterPulse ? "ws-set-counter-pulse" : undefined}
          >
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
          {hasDoneSets && (
            <ChevronDown
              size={14}
              strokeWidth={2.2}
              style={{
                ...s.counterChevron,
                transform: historyOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          )}
        </button>

        {/* Expandable chips */}
        <div
          style={{
            ...s.chipsWrap,
            maxHeight: historyOpen ? `${item.sets.length * 64 + 16}px` : "0px",
            opacity: historyOpen ? 1 : 0,
          }}
          aria-hidden={!historyOpen}
        >
          <div style={s.doneChipsRow}>
            {item.sets.map((entry, idx) =>
              entry.done ? (
                <button
                  key={idx}
                  type="button"
                  style={{
                    ...s.doneHistoryBtn,
                    ...(idx === focusSetIndex ? s.doneHistoryBtnFocused : null),
                  }}
                  onClick={() => {
                    if (onFocusSet) {
                      onFocusSet(idx);
                      fireHapticImpact("light");
                    }
                  }}
                >
                  <span style={s.doneHistoryBtnLeft}>Подход {idx + 1}</span>
                  <span style={s.doneHistoryBtnCenter}>{formatDoneChip(entry, needWeight)}</span>
                  <span style={s.doneHistoryBtnRight}>✓</span>
                </button>
              ) : null
            )}
          </div>
        </div>
      </div>

      {blocked ? <div style={s.error}>Введи повторы{needWeight ? " и кг" : ""}, затем отметь подход.</div> : null}
    </section>
  );
}

/* ─── Touch-based wheel picker ─── */
const SLOT_COUNT = 7;
const HALF_SLOTS = 3;
const W_FRICTION = 0.98;
const W_SNAP_VEL = 0.05;
const W_SPRING = 0.2;

function WheelField(props: {
  ariaLabel: string;
  hintLabel?: string | null;
  values: number[];
  value: number | undefined;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
  disabled?: boolean;
  flashSuccess?: boolean;
  cyclic?: boolean;
}) {
  const { ariaLabel, hintLabel, values, value, onChange, formatValue, disabled = false, flashSuccess = false, cyclic = false } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<(HTMLDivElement | null)[]>([]);
  const posRef = useRef(0);
  const velRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const lastTickIdxRef = useRef(-1);
  const lastReportedIdxRef = useRef(-1);
  const suppressHapticsRef = useRef(true);

  // Refs for latest props (used inside imperative callbacks)
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const formatRef = useRef(formatValue);
  formatRef.current = formatValue;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const dragRef = useRef({
    active: false,
    id: -1,
    startY: 0,
    startPos: 0,
    startTime: 0,
    samples: [] as { y: number; t: number }[],
  });

  const findIdx = (v: number | undefined): number => {
    const arr = valuesRef.current;
    if (!arr.length || v == null || !Number.isFinite(v)) return 0;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i] - v);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const wrapIdx = (i: number) => {
    const len = valuesRef.current.length;
    return ((i % len) + len) % len;
  };

  /* Paint slots — direct DOM updates, no React re-renders */
  const paint = () => {
    const pos = posRef.current;
    const arr = valuesRef.current;
    const fmt = formatRef.current;
    const centerIdx = Math.round(pos);

    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const el = slotsRef.current[slot];
      if (!el) continue;
      const offset = slot - HALF_SLOTS;
      const rawIdx = centerIdx + offset;
      const valIdx = cyclic ? wrapIdx(rawIdx) : rawIdx;

      if (!cyclic && (rawIdx < 0 || rawIdx >= arr.length)) {
        el.style.opacity = "0";
        el.style.transform = "translateY(0px) scale(0.8)";
        el.textContent = "";
      } else {
        const y = (rawIdx - pos) * WHEEL_ITEM_H + WHEEL_CENTER_OFFSET;
        const dist = Math.abs(rawIdx - pos);
        // Single-value: only center visible, neighbors hidden during scroll
        const opacity = Math.max(0, 1 - dist * 1.8);
        const scale = dist < 0.5 ? 1 : Math.max(0.8, 1 - dist * 0.15);
        el.style.transform = `translateY(${y}px) scale(${scale})`;
        el.style.opacity = String(opacity);
        el.textContent = fmt(arr[valIdx]);
      }
    }

    const snapped = cyclic ? wrapIdx(centerIdx) : Math.max(0, Math.min(arr.length - 1, centerIdx));
    if (snapped !== lastTickIdxRef.current) {
      lastTickIdxRef.current = snapped;
      if (!suppressHapticsRef.current) fireHapticImpact("light");
    }
  };

  const stop = () => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    velRef.current = 0;
  };

  const snapTo = (target: number) => {
    const run = () => {
      const diff = target - posRef.current;
      if (Math.abs(diff) < 0.003) {
        posRef.current = cyclic ? wrapIdx(target) : target;
        paint();
        animRef.current = null;
        const arr = valuesRef.current;
        const idx = cyclic ? wrapIdx(target) : Math.max(0, Math.min(arr.length - 1, target));
        if (idx !== lastReportedIdxRef.current) {
          lastReportedIdxRef.current = idx;
          onChangeRef.current(arr[idx]);
        }
        return;
      }
      posRef.current += diff * W_SPRING;
      paint();
      animRef.current = requestAnimationFrame(run);
    };
    animRef.current = requestAnimationFrame(run);
  };

  const coast = () => {
    let lastTs = 0;
    const run = (ts: number) => {
      const dtFactor = lastTs ? Math.min((ts - lastTs) / 16, 3) : 1;
      lastTs = ts;

      velRef.current *= Math.pow(W_FRICTION, dtFactor);
      posRef.current += velRef.current * dtFactor;

      const maxIdx = valuesRef.current.length - 1;
      if (!cyclic) {
        if (posRef.current < 0) { posRef.current = 0; velRef.current = 0; }
        if (posRef.current > maxIdx) { posRef.current = maxIdx; velRef.current = 0; }
      }

      if (Math.abs(velRef.current) < W_SNAP_VEL) {
        const t = Math.round(posRef.current);
        snapTo(cyclic ? t : Math.max(0, Math.min(maxIdx, t)));
        return;
      }

      paint();

      // Report intermediate value during coast
      const roundedPos = Math.round(posRef.current);
      const idx = cyclic ? wrapIdx(roundedPos) : Math.max(0, Math.min(maxIdx, roundedPos));
      if (idx !== lastReportedIdxRef.current) {
        lastReportedIdxRef.current = idx;
        onChangeRef.current(valuesRef.current[idx]);
      }

      animRef.current = requestAnimationFrame(run);
    };
    animRef.current = requestAnimationFrame(run);
  };

  const computeVelocity = (): number => {
    const { samples } = dragRef.current;
    if (samples.length < 2) return 0;
    const last = samples[samples.length - 1];
    const cutoff = last.t - 80;
    let first = samples.length - 1;
    for (let i = samples.length - 2; i >= 0; i--) {
      if (samples[i].t >= cutoff) first = i;
      else break;
    }
    const s0 = samples[first], s1 = last;
    const dt = s1.t - s0.t;
    if (dt <= 0) return 0;
    const dy = s0.y - s1.y; // positive = scrolled upward = value increases
    return (dy / WHEEL_ITEM_H) / dt * 16;
  };

  /* ── Pointer handlers (unified touch + mouse) ── */
  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    stop();
    dragRef.current = {
      active: true,
      id: e.pointerId,
      startY: e.clientY,
      startPos: posRef.current,
      startTime: Date.now(),
      samples: [{ y: e.clientY, t: Date.now() }],
    };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active || e.pointerId !== d.id) return;
    e.preventDefault();
    const dy = d.startY - e.clientY;
    const maxIdx = valuesRef.current.length - 1;
    let newPos = d.startPos + dy / WHEEL_ITEM_H;
    if (!cyclic) {
      // Rubber-band at edges
      if (newPos < 0) newPos *= 0.3;
      else if (newPos > maxIdx) newPos = maxIdx + (newPos - maxIdx) * 0.3;
    }
    posRef.current = newPos;

    d.samples.push({ y: e.clientY, t: Date.now() });
    if (d.samples.length > 12) d.samples.shift();
    paint();

    const roundedPos = Math.round(posRef.current);
    const idx = cyclic ? wrapIdx(roundedPos) : Math.max(0, Math.min(maxIdx, roundedPos));
    if (idx !== lastReportedIdxRef.current) {
      lastReportedIdxRef.current = idx;
      onChangeRef.current(valuesRef.current[idx]);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active || e.pointerId !== d.id) return;
    d.active = false;

    const maxIdx = valuesRef.current.length - 1;
    if (!cyclic) {
      posRef.current = Math.max(0, Math.min(maxIdx, posRef.current));
    }

    const vel = computeVelocity();
    if (Math.abs(vel) > W_SNAP_VEL) {
      velRef.current = vel;
      coast();
    } else {
      snapTo(Math.round(posRef.current));
    }
  };

  /* Mouse wheel (desktop) */
  useEffect(() => {
    const node = containerRef.current;
    if (!node || disabled) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      stop();
      const delta = Math.sign(e.deltaY);
      const maxIdx = valuesRef.current.length - 1;
      const raw = Math.round(posRef.current) + delta;
      const target = cyclic ? raw : Math.max(0, Math.min(maxIdx, raw));
      snapTo(target);
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, [disabled]);

  /* Suppress haptics for first 200ms */
  useEffect(() => {
    const t = setTimeout(() => { suppressHapticsRef.current = false; }, 200);
    return () => clearTimeout(t);
  }, []);

  /* Sync from external value changes */
  useEffect(() => {
    if (dragRef.current.active || animRef.current != null) return;
    const idx = findIdx(value);
    if (Math.abs(idx - posRef.current) > 0.5) {
      posRef.current = idx;
      lastTickIdxRef.current = idx;
      lastReportedIdxRef.current = idx;
      paint();
    }
  }, [value]);

  /* Initial paint */
  useEffect(() => {
    const idx = findIdx(value);
    posRef.current = idx;
    lastTickIdxRef.current = idx;
    lastReportedIdxRef.current = idx;
    paint();
  }, []);

  /* Cleanup */
  useEffect(() => () => stop(), []);

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
        <div aria-hidden style={s.wheelChevronUp}>‹</div>
        <div aria-hidden style={s.wheelChevronDown}>‹</div>
        <div
          ref={containerRef}
          style={{ ...s.wheelContainer, ...(disabled ? s.wheelContainerDisabled : null) }}
          onPointerDown={disabled ? undefined : onPointerDown}
          onPointerMove={disabled ? undefined : onPointerMove}
          onPointerUp={disabled ? undefined : onPointerUp}
          onPointerCancel={disabled ? undefined : onPointerUp}
          aria-label={ariaLabel}
          role="listbox"
        >
          {Array.from({ length: SLOT_COUNT }, (_, i) => (
            <div
              key={i}
              ref={(el) => { slotsRef.current[i] = el; }}
              style={s.wheelSlot}
              aria-hidden
            />
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
  inputsGridSingle: {
    display: "grid",
    gridTemplateColumns: "1fr",
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
  wheelChevronUp: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: WHEEL_ITEM_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 400,
    lineHeight: 1,
    color: "rgba(15,23,42,0.13)",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: 3,
    transform: "rotate(90deg)",
  } as CSSProperties,
  wheelChevronDown: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: WHEEL_ITEM_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 400,
    lineHeight: 1,
    color: "rgba(15,23,42,0.13)",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: 3,
    transform: "rotate(-90deg)",
  } as CSSProperties,
  valueLabel: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    color: "rgba(15, 23, 42, 0.6)",
    marginTop: 0,
  },
  wheelWrap: {
    position: "relative",
    width: "100%",
    height: WHEEL_WRAP_H,
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
  wheelContainer: {
    position: "relative",
    zIndex: 2,
    height: "100%",
    overflow: "hidden",
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    cursor: "ns-resize",
  } as CSSProperties,
  wheelContainerDisabled: {
    pointerEvents: "none",
  },
  wheelSlot: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: WHEEL_ITEM_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 32,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
    fontVariantNumeric: "tabular-nums",
    pointerEvents: "none",
    willChange: "transform",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "clip",
    lineHeight: 1,
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
  commitProgressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
    pointerEvents: "none",
    background: "linear-gradient(180deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(2,6,23,0.5)",
    transition: "width 600ms cubic-bezier(0.22, 0.61, 0.36, 1)",
    zIndex: 1,
  },
  commitTintOverlay: {
    position: "absolute",
    inset: 0,
    borderRadius: 16,
    pointerEvents: "none",
    opacity: 0,
    zIndex: 2,
  },
  commitTintOverlayOn: {
    opacity: 0,
  },
  commitCheck: {
    position: "relative",
    zIndex: 3,
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1,
    color: "rgba(15,23,42,0.45)",
    textShadow: "0 1px 0 rgba(255,255,255,0.82), 0 -1px 0 rgba(15,23,42,0.15)",
    transition: "color 300ms ease, text-shadow 300ms ease",
  },
  commitCheckOnFill: {
    color: "rgba(255,255,255,0.95)",
    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
  },
  commitCheckDone: {
    color: "rgba(255,255,255,0.95)",
    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
  },
  setIndexText: {
    display: "grid",
    whiteSpace: "nowrap",
  },
  setIndexTextLayer: {
    gridArea: "1 / 1",
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

  // Set counter button
  setCounterBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    border: "none",
    background: "transparent",
    padding: "2px 0",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  },
  counterChevron: {
    color: "rgba(15,23,42,0.38)",
    flexShrink: 0,
    transition: "transform 200ms ease",
  },

  // Expandable history accordion
  chipsWrap: {
    overflow: "hidden",
    transition: "max-height 220ms cubic-bezier(0.36, 0.66, 0.04, 1), opacity 180ms ease",
  },
  doneChipsRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "8px 0 2px",
  },
  doneHistoryBtn: {
    width: "100%",
    minHeight: 56,
    borderRadius: 16,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    transition: "background 100ms ease, box-shadow 100ms ease",
  },
  doneHistoryBtnFocused: {
    background: "rgba(196,228,178,0.38)",
    boxShadow: "inset 0 2px 3px rgba(78,122,58,0.08), inset 0 -1px 0 rgba(255,255,255,0.22)",
  },
  doneHistoryBtnLeft: {
    fontSize: 16,
    fontWeight: 600,
    color: "rgba(15,23,42,0.6)",
  },
  doneHistoryBtnCenter: {
    fontSize: 18,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
    fontVariantNumeric: "tabular-nums",
  },
  doneHistoryBtnRight: {
    fontSize: 22,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
  },
};

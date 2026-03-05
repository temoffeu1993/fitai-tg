import { useCallback, useEffect, useRef } from "react";
import { fireHapticImpact } from "@/utils/haptics";

/* Physics — iOS UIPickerView style
   Apple uses time-based deceleration (0.998/ms ≈ 0.967/frame@60fps)
   and a damped spring for final snap */
const DECEL_RATE = 0.998;
const VELOCITY_STOP = 0.08;
const SPRING_STIFFNESS = 180;
const SPRING_DAMPING = 22;
const SPRING_MASS = 1;
const VELOCITY_SAMPLES = 5;
const TAP_THRESHOLD = 6;

export interface UseWheelOpts {
  totalItems: number;
  itemSize: number;
  axis: "x" | "y";
  initialOffset: number;
  wrap?: { base: number; midCopy: number };
  onSettle: (index: number) => void;
  onHighlight?: (index: number) => void;
}

export function useWheel({ totalItems, itemSize, axis, initialOffset, wrap, onSettle, onHighlight }: UseWheelOpts) {
  const stripRef = useRef<HTMLDivElement>(null);
  const offset = useRef(initialOffset);
  const velocity = useRef(0);
  const lastHapticIdx = useRef(Math.round(initialOffset / itemSize));
  const touchId = useRef<number | null>(null);
  const touchStartPos = useRef(0);
  const touchStartOff = useRef(0);
  const totalDrag = useRef(0);
  const samples = useRef<{ pos: number; time: number }[]>([]);
  const inertiaRaf = useRef<number | null>(null);
  const snapRaf = useRef<number | null>(null);
  const maxOff = (totalItems - 1) * itemSize;

  const clamp = useCallback((v: number) => Math.max(0, Math.min(v, maxOff)), [maxOff]);

  const apply = useCallback((off: number) => {
    const el = stripRef.current;
    if (!el) return;
    el.style.transform = axis === "y" ? `translateY(${-off}px)` : `translateX(${-off}px)`;
  }, [axis]);

  const tickHaptic = useCallback((off: number) => {
    const idx = Math.max(0, Math.min(Math.round(off / itemSize), totalItems - 1));
    if (idx !== lastHapticIdx.current) {
      lastHapticIdx.current = idx;
      fireHapticImpact("light");
      onHighlight?.(idx);
    }
  }, [itemSize, totalItems, onHighlight]);

  const normalize = useCallback(() => {
    if (!wrap) return;
    const idx = Math.round(offset.current / itemSize);
    const val = ((idx % wrap.base) + wrap.base) % wrap.base;
    const midIdx = wrap.base * wrap.midCopy + val;
    const newOff = midIdx * itemSize;
    offset.current = newOff;
    apply(newOff);
    lastHapticIdx.current = midIdx;
  }, [wrap, itemSize, apply]);

  const snapTo = useCallback((target: number, silent = false) => {
    if (snapRaf.current) cancelAnimationFrame(snapRaf.current);
    const start = offset.current;
    const dist = target - start;
    if (Math.abs(dist) < 0.5) {
      offset.current = target;
      apply(target);
      normalize();
      if (!silent) onSettle(Math.round(target / itemSize));
      return;
    }
    let pos = start;
    let vel = velocity.current;
    const tick = () => {
      const displacement = pos - target;
      const springForce = -SPRING_STIFFNESS * displacement;
      const dampingForce = -SPRING_DAMPING * vel;
      const accel = (springForce + dampingForce) / SPRING_MASS;
      vel += accel * (1 / 60);
      pos += vel * (1 / 60);
      offset.current = pos;
      apply(pos);
      tickHaptic(pos);
      if (Math.abs(pos - target) < 0.5 && Math.abs(vel) < 0.5) {
        snapRaf.current = null;
        offset.current = target;
        apply(target);
        normalize();
        if (!silent) onSettle(Math.round(target / itemSize));
      } else {
        snapRaf.current = requestAnimationFrame(tick);
      }
    };
    snapRaf.current = requestAnimationFrame(tick);
  }, [apply, tickHaptic, normalize, onSettle, itemSize]);

  const runInertia = useCallback(() => {
    if (inertiaRaf.current) cancelAnimationFrame(inertiaRaf.current);
    let lastT = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = now - lastT;
      lastT = now;
      velocity.current *= Math.pow(DECEL_RATE, dt);
      let next = offset.current + velocity.current * dt;
      if (next <= 0) { next = 0; velocity.current = 0; }
      else if (next >= maxOff) { next = maxOff; velocity.current = 0; }
      offset.current = next;
      apply(next);
      tickHaptic(next);
      if (Math.abs(velocity.current) > VELOCITY_STOP) {
        inertiaRaf.current = requestAnimationFrame(tick);
      } else {
        inertiaRaf.current = null;
        const nearIdx = Math.max(0, Math.min(Math.round(next / itemSize), totalItems - 1));
        snapTo(nearIdx * itemSize);
      }
    };
    inertiaRaf.current = requestAnimationFrame(tick);
  }, [maxOff, apply, tickHaptic, snapTo, itemSize, totalItems]);

  const stopAll = useCallback(() => {
    if (inertiaRaf.current) { cancelAnimationFrame(inertiaRaf.current); inertiaRaf.current = null; }
    if (snapRaf.current) { cancelAnimationFrame(snapRaf.current); snapRaf.current = null; }
    velocity.current = 0;
  }, []);

  const scrollToIndex = useCallback((idx: number) => {
    stopAll();
    snapTo(idx * itemSize);
  }, [stopAll, snapTo, itemSize]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    stopAll();
    const t = e.changedTouches[0];
    touchId.current = t.identifier;
    const pos = axis === "y" ? t.clientY : t.clientX;
    touchStartPos.current = pos;
    touchStartOff.current = offset.current;
    totalDrag.current = 0;
    samples.current = [{ pos, time: performance.now() }];
  }, [axis, stopAll]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = Array.from(e.changedTouches).find((tt) => tt.identifier === touchId.current);
    if (!t) return;
    const pos = axis === "y" ? t.clientY : t.clientX;
    const prevPos = samples.current.length > 0 ? samples.current[samples.current.length - 1].pos : pos;
    totalDrag.current += Math.abs(pos - prevPos);
    const delta = touchStartPos.current - pos;
    const next = clamp(touchStartOff.current + delta);
    offset.current = next;
    apply(next);
    tickHaptic(next);
    const now = performance.now();
    samples.current.push({ pos, time: now });
    if (samples.current.length > VELOCITY_SAMPLES) samples.current.shift();
  }, [axis, clamp, apply, tickHaptic]);

  const onTouchEnd = useCallback((): boolean => {
    touchId.current = null;
    const wasTap = totalDrag.current < TAP_THRESHOLD;
    const nearIdx = Math.max(0, Math.min(Math.round(offset.current / itemSize), totalItems - 1));
    if (wasTap) {
      snapTo(nearIdx * itemSize);
      return true;
    }
    const sa = samples.current;
    if (sa.length < 2) { snapTo(nearIdx * itemSize); return false; }
    const first = sa[0];
    const last = sa[sa.length - 1];
    const dt = last.time - first.time;
    if (dt < 1) { snapTo(nearIdx * itemSize); return false; }
    const v = (first.pos - last.pos) / dt;
    velocity.current = v;
    if (Math.abs(v) < VELOCITY_STOP * 3) {
      snapTo(nearIdx * itemSize);
    } else {
      runInertia();
    }
    return false;
  }, [snapTo, itemSize, totalItems, runInertia]);

  useEffect(() => {
    offset.current = initialOffset;
    lastHapticIdx.current = Math.round(initialOffset / itemSize);
    apply(initialOffset);
  }, [initialOffset, itemSize, apply]);

  useEffect(() => () => stopAll(), [stopAll]);

  return { stripRef, onTouchStart, onTouchMove, onTouchEnd, scrollToIndex, offset, stopAll };
}

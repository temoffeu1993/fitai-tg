import { useCallback, useEffect, useState } from "react";
import type { PlanStatus } from "@/api/nutrition";

type Options = {
  durationMs?: number;
  storageKey?: string;
  steps?: number;
};

const DEFAULT_DURATION = 80_000;
const DEFAULT_STORAGE_KEY = "nutrition_generation_started_at";
const MIN_PROGRESS = 5;

const readStoredTimestamp = (key: string): number | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : null;
};

const writeTimestamp = (key: string) => {
  if (typeof window === "undefined") return null;
  const now = Date.now();
  window.localStorage.setItem(key, String(now));
  return now;
};

export function useNutritionGenerationProgress(
  status: PlanStatus | null,
  options?: Options
) {
  const duration = options?.durationMs ?? DEFAULT_DURATION;
  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;
  const stepsTotal = Math.max(1, options?.steps ?? 5);

  const computeProgress = useCallback(
    (ts: number | null) => {
      if (!ts) return 0;
      const elapsed = Date.now() - ts;
      if (elapsed <= 0) return MIN_PROGRESS;
      const pct = (elapsed / duration) * 100;
      return Math.max(MIN_PROGRESS, Math.min(99, pct));
    },
    [duration]
  );

  const [progress, setProgress] = useState<number>(() => {
    const ts = readStoredTimestamp(storageKey);
    return computeProgress(ts);
  });

  const [active, setActive] = useState<boolean>(() => readStoredTimestamp(storageKey) != null);

  useEffect(() => {
    if (!active) return;
    let raf: number;
    const tick = () => {
      const ts = readStoredTimestamp(storageKey);
      if (!ts) {
        setActive(false);
        setProgress(0);
        return;
      }
      setProgress(computeProgress(ts));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [active, storageKey, computeProgress]);

  const stop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
    setActive(false);
    setProgress(0);
  }, [storageKey]);

  const start = useCallback(
    (opts?: { reset?: boolean }) => {
      let ts = readStoredTimestamp(storageKey);
      if (!ts || opts?.reset) {
        ts = writeTimestamp(storageKey) ?? null;
      }
      if (!ts) return;
      setActive(true);
      setProgress(computeProgress(ts));
    },
    [storageKey, computeProgress]
  );

  useEffect(() => {
    if (status === "processing") {
      start();
    } else if (status && status !== "processing") {
      stop();
    }
  }, [status, start, stop]);

  const effectiveProgress = active ? progress : 0;
  const stepSize = 100 / stepsTotal;
  const activeStep = active
    ? Math.min(stepsTotal - 1, Math.floor(effectiveProgress / stepSize))
    : 0;
  const stepNumber = active ? Math.max(1, activeStep + 1) : 1;

  return {
    progress: Math.min(99, Math.max(0, effectiveProgress)),
    stepIndex: activeStep,
    stepNumber,
    stepsTotal,
    isActive: active,
    startManual: () => start({ reset: true }),
    stop,
  };
}

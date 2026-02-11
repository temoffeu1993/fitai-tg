import { useEffect, useState } from "react";

type TypewriterOptions = {
  charIntervalMs?: number;
  startDelayMs?: number;
  disabled?: boolean;
};

export function useTypewriterText(
  target: string,
  options: TypewriterOptions = {}
): string {
  const { charIntervalMs = 30, startDelayMs = 0, disabled = false } = options;
  const normalizedTarget = target || "";
  const [typed, setTyped] = useState<string>("");

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    if (disabled || prefersReduced) {
      setTyped(normalizedTarget);
      return;
    }

    if (!normalizedTarget) {
      setTyped("");
      return;
    }

    setTyped("");
    let index = 0;
    let intervalId: number | null = null;

    const run = () => {
      intervalId = window.setInterval(() => {
        index += 1;
        setTyped(normalizedTarget.slice(0, index));
        if (index >= normalizedTarget.length && intervalId != null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, charIntervalMs);
    };

    let delayId: number | null = null;
    if (startDelayMs > 0) {
      delayId = window.setTimeout(run, startDelayMs);
    } else {
      run();
    }

    return () => {
      if (delayId != null) window.clearTimeout(delayId);
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [normalizedTarget, charIntervalMs, startDelayMs, disabled]);

  return typed;
}

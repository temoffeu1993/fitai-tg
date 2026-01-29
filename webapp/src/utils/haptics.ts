export type HapticLevel = "light" | "medium" | "heavy" | "rigid" | "soft";

const VIBRATION_PATTERNS: Record<HapticLevel, number | number[]> = {
  light: 18,
  medium: 28,
  heavy: 40,
  rigid: [40, 70, 40, 70, 40],
  soft: 12,
};

export function fireHapticImpact(level: HapticLevel = "light"): void {
  const hapticRef = (window as any)?.Telegram?.WebApp?.HapticFeedback;
  const hasImpact = typeof hapticRef?.impactOccurred === "function";
  const hasNotify = typeof hapticRef?.notificationOccurred === "function";

  if (hasImpact || hasNotify) {
    if (hasImpact) {
      if (level === "rigid") {
        hapticRef.impactOccurred("heavy");
        window.setTimeout(() => hapticRef.impactOccurred("heavy"), 70);
        window.setTimeout(() => hapticRef.impactOccurred("heavy"), 140);
      } else {
        hapticRef.impactOccurred(level);
      }
    }
    if (level === "rigid" && hasNotify) {
      window.setTimeout(() => hapticRef.notificationOccurred("warning"), 20);
    }
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(VIBRATION_PATTERNS[level] ?? 10);
  }
}

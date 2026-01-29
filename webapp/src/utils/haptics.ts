export type HapticLevel = "light" | "medium" | "heavy" | "rigid" | "soft";

const VIBRATION_PATTERNS: Record<HapticLevel, number | number[]> = {
  light: 14,
  medium: 22,
  heavy: 32,
  rigid: [32, 60, 32],
  soft: 10,
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
      } else {
        hapticRef.impactOccurred(level);
      }
    }
    if (level === "rigid" && hasNotify) {
      window.setTimeout(() => hapticRef.notificationOccurred("success"), 20);
    }
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(VIBRATION_PATTERNS[level] ?? 10);
  }
}

export type HapticLevel = "light" | "medium" | "heavy" | "rigid" | "soft";

const VIBRATION_PATTERNS: Record<HapticLevel, number | number[]> = {
  light: 10,
  medium: 14,
  heavy: 20,
  rigid: 26,
  soft: 8,
};

export function fireHapticImpact(level: HapticLevel = "light"): void {
  const hapticRef = (window as any)?.Telegram?.WebApp?.HapticFeedback;
  const hasImpact = typeof hapticRef?.impactOccurred === "function";
  if (hasImpact) {
    hapticRef.impactOccurred(level);
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(VIBRATION_PATTERNS[level] ?? 10);
  }
}

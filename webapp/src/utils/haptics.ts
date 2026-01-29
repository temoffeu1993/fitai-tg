export type HapticLevel = "light" | "medium" | "heavy" | "rigid" | "soft";

const VIBRATION_PATTERNS: Record<HapticLevel, number | number[]> = {
  light: 12,
  medium: 18,
  heavy: 26,
  rigid: [18, 28, 18],
  soft: 10,
};

export function fireHapticImpact(level: HapticLevel = "light"): void {
  const hapticRef = (window as any)?.Telegram?.WebApp?.HapticFeedback;
  if (hapticRef?.impactOccurred) {
    hapticRef.impactOccurred(level);
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(VIBRATION_PATTERNS[level] ?? 10);
  }
}

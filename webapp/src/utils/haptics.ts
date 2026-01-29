export type HapticLevel = "light" | "medium" | "heavy" | "rigid" | "soft";

const VIBRATION_PATTERNS: Record<HapticLevel, number | number[]> = {
  light: 12,
  medium: 18,
  heavy: 26,
  rigid: [22, 40, 22],
  soft: 10,
};

export function fireHapticImpact(level: HapticLevel = "light"): void {
  const hapticRef = (window as any)?.Telegram?.WebApp?.HapticFeedback;
  if (hapticRef?.impactOccurred) {
    hapticRef.impactOccurred(level);
    if (level === "rigid") {
      window.setTimeout(() => hapticRef.impactOccurred(level), 60);
    }
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(VIBRATION_PATTERNS[level] ?? 10);
  }
}

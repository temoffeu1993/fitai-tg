export type HapticLevel = "light" | "medium" | "heavy" | "rigid" | "soft";

const DEFAULT_DURATIONS: Record<HapticLevel, number> = {
  light: 8,
  medium: 14,
  heavy: 20,
  rigid: 26,
  soft: 10,
};

export function fireHapticImpact(level: HapticLevel = "light"): void {
  const hapticRef = (window as any)?.Telegram?.WebApp?.HapticFeedback;
  if (hapticRef?.impactOccurred) {
    hapticRef.impactOccurred(level);
    return;
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(DEFAULT_DURATIONS[level] ?? 10);
  }
}

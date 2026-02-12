import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";
import { formatClock } from "./utils";

type Props = {
  secondsLeft: number | null;
  onSkip: () => void;
  onAdd15: () => void;
};

export default function RestOverlay(props: Props) {
  const { secondsLeft, onSkip, onAdd15 } = props;
  if (secondsLeft == null) return null;

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <div style={s.kicker}>Отдых</div>
        <div style={s.clock}>{formatClock(secondsLeft)}</div>
        <div style={s.row}>
          <button type="button" style={s.secondary} onClick={onAdd15}>
            +15 сек
          </button>
          <button type="button" style={s.secondary} onClick={onSkip}>
            Пропустить
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: workoutTheme.overlayStrong,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  card: {
    width: "min(90vw, 380px)",
    borderRadius: 26,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    color: workoutTheme.textPrimary,
    boxShadow: workoutTheme.cardShadow,
    padding: "22px 20px",
    display: "grid",
    gap: 14,
    textAlign: "center",
  },
  kicker: {
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: workoutTheme.textMuted,
    fontWeight: 700,
  },
  clock: {
    fontSize: 72,
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: -2,
    fontVariantNumeric: "tabular-nums",
    color: workoutTheme.textPrimary,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  secondary: {
    minHeight: 46,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
};

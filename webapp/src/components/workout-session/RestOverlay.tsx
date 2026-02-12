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
      <div style={s.inner}>
        <div style={s.kicker}>Отдых</div>
        <div style={s.clock}>{formatClock(secondsLeft)}</div>
        <div style={s.actions}>
          <button type="button" style={s.actionSoft} onClick={onAdd15}>
            +15 сек
          </button>
          <button type="button" style={s.actionSoft} onClick={onSkip}>
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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 18px calc(env(safe-area-inset-bottom, 0px) + 20px)",
    background: "linear-gradient(180deg, rgba(7,10,18,0.6) 0%, rgba(7,10,18,0.72) 100%)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  },
  inner: {
    width: "min(100%, 460px)",
    margin: "0 auto",
    display: "grid",
    gap: 18,
    textAlign: "center",
  },
  kicker: {
    fontSize: 14,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.72)",
    fontWeight: 700,
  },
  clock: {
    fontSize: 96,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: -2.4,
    fontVariantNumeric: "tabular-nums",
    color: "#fff",
    textShadow: "0 14px 28px rgba(0,0,0,0.35)",
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  actionSoft: {
    minHeight: 50,
    borderRadius: 999,
    border: "none",
    background: "rgba(255,255,255,0.18)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.32), 0 10px 20px rgba(0,0,0,0.2)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
};

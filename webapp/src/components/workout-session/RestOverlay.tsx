import type { CSSProperties } from "react";
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
      <div style={s.content}>
        <div style={s.kicker}>Отдых</div>
        <div style={s.clock}>{formatClock(secondsLeft)}</div>
        <div style={s.actions}>
          <button type="button" style={s.actionBtn} onClick={onAdd15}>
            +15 сек
          </button>
          <button type="button" style={s.skipBtn} onClick={onSkip}>
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
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 18px calc(env(safe-area-inset-bottom, 0px) + 24px)",
    background: "linear-gradient(180deg, rgba(7,10,18,0.7) 0%, rgba(7,10,18,0.82) 100%)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  },
  content: {
    width: "min(100%, 400px)",
    display: "grid",
    gap: 20,
    textAlign: "center",
  },
  kicker: {
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)",
    fontWeight: 600,
  },
  clock: {
    fontSize: 88,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: -3,
    fontVariantNumeric: "tabular-nums",
    color: "#fff",
    textShadow: "0 8px 24px rgba(0,0,0,0.3)",
  },
  actions: {
    marginTop: 8,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  actionBtn: {
    minHeight: 50,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.1)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: -0.1,
  },
  skipBtn: {
    minHeight: 50,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.18)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: -0.1,
  },
};

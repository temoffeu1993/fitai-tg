import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";

type Props = {
  message: string | null;
};

export default function TransitionToast(props: Props) {
  const { message } = props;
  if (!message) return null;

  return (
    <div style={s.wrap} role="status" aria-live="polite">
      <div style={s.toast}>{message}</div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 118px)",
    zIndex: 58,
    pointerEvents: "none",
    display: "grid",
    justifyItems: "center",
    padding: "0 16px",
  },
  toast: {
    maxWidth: "min(92vw, 420px)",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.72)",
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    color: workoutTheme.textPrimary,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.2,
    textAlign: "center",
  },
};

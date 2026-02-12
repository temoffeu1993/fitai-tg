import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";

type Props = {
  primaryLabel: string;
  primaryEnabled?: boolean;
  showSecondary?: boolean;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
};

export default function BottomDock(props: Props) {
  const {
    primaryLabel,
    primaryEnabled = true,
    showSecondary = false,
    secondaryLabel,
    onPrimary,
    onSecondary,
  } = props;

  return (
    <footer style={s.wrap}>
      <div style={s.inner}>
        <button
          type="button"
          className="intro-primary-btn ws-primary-btn"
          disabled={!primaryEnabled}
          style={{
            ...s.primary,
            ...(primaryEnabled ? s.primaryActive : s.primaryDisabled),
          }}
          onClick={onPrimary}
        >
          <span>{primaryLabel}</span>
        </button>
        {showSecondary && secondaryLabel && onSecondary ? (
          <button type="button" style={s.secondary} onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </footer>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)",
    background: workoutTheme.dockFade,
  },
  inner: {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    display: "grid",
    gap: 8,
    boxSizing: "border-box",
  },
  primary: {
    width: "100%",
    minHeight: 58,
    borderRadius: 999,
    border: "none",
    fontSize: 17,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    letterSpacing: -0.2,
    transition: "transform 120ms ease, box-shadow 120ms ease",
  },
  primaryActive: {
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 8px 20px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.15)",
  },
  primaryDisabled: {
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textMuted,
    cursor: "default",
    opacity: 0.6,
  },
  secondary: {
    width: "100%",
    minHeight: 38,
    border: "none",
    background: "transparent",
    borderRadius: 999,
    color: "rgba(15,23,42,0.5)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    letterSpacing: -0.1,
  },
};

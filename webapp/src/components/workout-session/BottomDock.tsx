import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";

type Props = {
  primaryLabel: string;
  primaryEnabled?: boolean;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
};

export default function BottomDock(props: Props) {
  const { primaryLabel, primaryEnabled = true, secondaryLabel, onPrimary, onSecondary } = props;

  return (
    <footer style={s.wrap}>
      <div style={s.inner}>
        <button
          type="button"
          style={{ ...s.primary, ...(primaryEnabled ? s.primaryActive : null) }}
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
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
    padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 10px)",
    background: workoutTheme.dockFade,
  },
  inner: {
    width: "min(720px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 8,
  },
  primary: {
    width: "100%",
    minHeight: 56,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
  },
  primaryActive: {
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  secondary: {
    width: "100%",
    minHeight: 40,
    border: "none",
    background: "transparent",
    borderRadius: 999,
    color: "rgba(15,23,42,0.6)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
};

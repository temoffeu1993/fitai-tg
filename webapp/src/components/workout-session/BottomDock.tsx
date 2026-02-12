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
    background: "linear-gradient(180deg, rgba(237,241,248,0) 0%, rgba(237,241,248,0.92) 32%, rgba(237,241,248,0.98) 100%)",
  },
  inner: {
    width: "min(720px, 100%)",
    margin: "0 auto",
    display: "grid",
    gap: 8,
  },
  primary: {
    width: "100%",
    minHeight: 58,
    borderRadius: 18,
    border: "1px solid rgba(17,24,39,0.12)",
    background: "rgba(17,24,39,0.08)",
    color: workoutTheme.textSecondary,
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryActive: {
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    boxShadow: "0 10px 18px rgba(17,24,39,0.24)",
  },
  secondary: {
    width: "100%",
    minHeight: 42,
    borderRadius: 12,
    border: workoutTheme.pillBorder,
    background: "transparent",
    color: workoutTheme.textSecondary,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
};


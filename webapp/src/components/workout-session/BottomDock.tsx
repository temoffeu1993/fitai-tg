import type { CSSProperties, ReactNode } from "react";
import { workoutTheme } from "./theme";

type Props = {
  primaryLabel: string;
  primaryVisible?: boolean;
  primaryEnabled?: boolean;
  primaryVariant?: "default" | "compactArrow";
  primaryIcon?: ReactNode;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
};

export default function BottomDock(props: Props) {
  const {
    primaryLabel,
    primaryVisible = true,
    primaryEnabled = true,
    primaryVariant = "default",
    primaryIcon,
    secondaryLabel,
    onPrimary,
    onSecondary,
  } = props;
  const compact = primaryVariant === "compactArrow";
  const primaryDisabled = compact ? false : !primaryEnabled;

  return (
    <footer style={s.wrap}>
      <div style={s.inner}>
        {primaryVisible ? (
          <button
            type="button"
            className="intro-primary-btn ws-primary-btn"
            disabled={primaryDisabled}
            style={{
              ...s.primary,
              ...(compact ? s.primaryCompact : null),
              ...(compact || primaryEnabled ? s.primaryActive : null),
              ...(!compact && !primaryEnabled ? s.primaryDisabled : null),
            }}
            onClick={onPrimary}
          >
            {compact ? (
              <>
                <span style={s.primaryCompactText}>{primaryLabel}</span>
                <span style={s.primaryCompactArrowWrap} aria-hidden>
                  {primaryIcon ?? <span style={s.primaryCompactArrow}>→</span>}
                </span>
              </>
            ) : (
              primaryLabel
            )}
          </button>
        ) : null}
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
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    display: "grid",
    gap: 8,
    boxSizing: "border-box",
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
  primaryCompact: {
    width: "fit-content",
    maxWidth: "100%",
    justifySelf: "center",
    display: "inline-flex",
    alignItems: "center",
    gap: 12,
    height: 56,
    minHeight: 56,
    padding: "0 14px",
  },
  primaryActive: {
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
  primaryCompactText: {
    whiteSpace: "nowrap",
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1,
    color: "#fff",
  },
  primaryCompactArrowWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    background: workoutTheme.pillBg,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: -6,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textPrimary,
  },
  primaryCompactArrow: {
    fontSize: 20,
    lineHeight: 1,
    color: "#0f172a",
    fontWeight: 700,
  },
  primaryDisabled: {
    cursor: "default",
    opacity: 0.55,
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

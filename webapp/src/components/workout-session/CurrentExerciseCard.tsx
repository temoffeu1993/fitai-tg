import type { CSSProperties, ReactNode } from "react";
import type { SessionItem } from "./types";
import { workoutTheme } from "./theme";

type Props = {
  item: SessionItem | null;
  onOpenMenu: () => void;
  illustration?: string;
  children?: ReactNode;
};

export default function CurrentExerciseCard(props: Props) {
  const { item, onOpenMenu, illustration, children } = props;
  if (!item) return null;

  return (
    <section style={s.card}>
      <div style={s.topRow}>
        <h2 style={s.name}>{item.name}</h2>
        <button type="button" aria-label="Меню упражнения" style={s.menuBtn} onClick={onOpenMenu}>
          ⋯
        </button>
      </div>

      {illustration ? (
        <div style={s.illustrationWrap}>
          <img
            src={illustration}
            alt={`Иллюстрация упражнения: ${item.name}`}
            style={s.illustration}
            draggable={false}
          />
        </div>
      ) : null}

      {children}
    </section>
  );
}

const s: Record<string, CSSProperties> = {
  card: {
    padding: "18px 18px 20px",
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    display: "grid",
    gap: 14,
    minWidth: 0,
    overflow: "hidden",
  },
  topRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) auto",
    alignItems: "start",
    gap: 10,
    minWidth: 0,
  },
  name: {
    margin: 0,
    minWidth: 0,
    fontSize: 32,
    lineHeight: 1.14,
    fontWeight: 700,
    letterSpacing: -0.6,
    color: workoutTheme.textPrimary,
    whiteSpace: "normal",
    textWrap: "balance",
    overflowWrap: "break-word",
    wordBreak: "normal",
    hyphens: "auto",
  },
  menuBtn: {
    border: "none",
    background: "transparent",
    boxShadow: "none",
    borderRadius: 999,
    height: 40,
    minWidth: 40,
    padding: 0,
    color: workoutTheme.textSecondary,
    fontSize: 28,
    lineHeight: 1,
    fontWeight: 500,
    cursor: "pointer",
  },
  illustrationWrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "2px 0 0",
  },
  illustration: {
    maxWidth: 190,
    maxHeight: 190,
    width: "auto",
    height: "auto",
    objectFit: "contain",
    userSelect: "none",
    pointerEvents: "none",
  },
};

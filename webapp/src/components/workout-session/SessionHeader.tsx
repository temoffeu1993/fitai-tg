import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";
import { formatClock } from "./utils";

type Props = {
  title: string;
  subtitle: string;
  elapsedSec: number;
  running: boolean;
  progressPercent: number;
  onBack: () => void;
  onToggleTimer: () => void;
  onOpenList: () => void;
};

export default function SessionHeader(props: Props) {
  const {
    title,
    subtitle,
    elapsedSec,
    running,
    progressPercent,
    onBack,
    onToggleTimer,
    onOpenList,
  } = props;

  return (
    <header style={s.wrap}>
      <div style={s.row}>
        <button type="button" aria-label="Назад" style={s.iconBtn} onClick={onBack}>
          Назад
        </button>
        <div style={s.center}>
          <div style={s.title}>{title}</div>
          <div style={s.subtitle}>{subtitle}</div>
        </div>
        <button type="button" aria-label="Открыть список упражнений" style={s.iconBtn} onClick={onOpenList}>
          Список
        </button>
      </div>
      <div style={s.metaRow}>
        <button type="button" style={s.timerPill} onClick={onToggleTimer}>
          {formatClock(elapsedSec)} · {running ? "Пауза" : "Старт"}
        </button>
      </div>
      <div style={s.progressTrack}>
        <div style={{ ...s.progressFill, width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
      </div>
    </header>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    padding: "calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    background: "linear-gradient(180deg, rgba(244,246,251,0.95) 0%, rgba(244,246,251,0.78) 100%)",
    borderBottom: "1px solid rgba(17,24,39,0.06)",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "80px 1fr 80px",
    alignItems: "center",
    gap: 8,
  },
  center: {
    minWidth: 0,
    textAlign: "center",
  },
  title: {
    fontSize: 16,
    lineHeight: 1.2,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 1.2,
    color: workoutTheme.textMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  iconBtn: {
    border: workoutTheme.pillBorder,
    background: workoutTheme.pillBg,
    borderRadius: 12,
    height: 36,
    padding: "0 10px",
    color: workoutTheme.textPrimary,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  metaRow: {
    marginTop: 8,
    display: "flex",
    justifyContent: "center",
  },
  timerPill: {
    border: workoutTheme.pillBorder,
    background: workoutTheme.pillBg,
    borderRadius: 999,
    padding: "7px 14px",
    color: workoutTheme.textSecondary,
    fontSize: 13,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    cursor: "pointer",
  },
  progressTrack: {
    marginTop: 8,
    height: 4,
    borderRadius: 999,
    background: "rgba(17,24,39,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #1f2937 0%, #111827 100%)",
    transition: "width 220ms ease",
  },
};


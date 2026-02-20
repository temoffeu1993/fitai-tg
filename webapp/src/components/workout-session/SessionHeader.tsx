import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";
import { formatClock } from "./utils";
import { ArrowLeft, List, Pause, Play } from "lucide-react";

type Props = {
  elapsedSec: number;
  running: boolean;
  progressPercent: number;
  exerciseProgressLabel: string;
  onBack: () => void;
  onToggleTimer: () => void;
  onOpenList: () => void;
};

export default function SessionHeader(props: Props) {
  const {
    elapsedSec,
    running,
    progressPercent,
    exerciseProgressLabel,
    onBack,
    onToggleTimer,
    onOpenList,
  } = props;

  return (
    <>
      <div style={s.spacer} aria-hidden />
      <header style={s.wrap}>
        <div style={s.inner}>
          <div style={s.row}>
            <button type="button" aria-label="Назад" style={s.iconBtn} onClick={onBack}>
              <ArrowLeft size={20} strokeWidth={2.2} style={s.iconGlyph} />
            </button>

            <button type="button" style={s.timerPill} onClick={onToggleTimer}>
              {running ? (
                <Pause size={14} strokeWidth={2.2} style={s.timerIcon} />
              ) : (
                <Play size={14} strokeWidth={2.2} style={s.timerIcon} />
              )}
              <span>{formatClock(elapsedSec)}</span>
            </button>

            <button type="button" aria-label="Открыть список упражнений" style={s.listBtn} onClick={onOpenList}>
              <List size={22} strokeWidth={2.2} style={s.iconGlyph} />
            </button>
          </div>

          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill, width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
          </div>
        </div>
      </header>
    </>
  );
}

const s: Record<string, CSSProperties> = {
  spacer: {
    height: "calc(env(safe-area-inset-top, 0px) + 78px)",
  },
  wrap: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    padding: "calc(env(safe-area-inset-top, 0px) + 2px) 0 10px",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    background: workoutTheme.headerBg,
    borderBottom: "1px solid rgba(255,255,255,0.7)",
    boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
  },
  inner: {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    padding: "0 10px",
    boxSizing: "border-box",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "44px 1fr auto",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  iconBtn: {
    border: "none",
    background: "transparent",
    borderRadius: 999,
    minHeight: 44,
    minWidth: 44,
    padding: 0,
    color: "rgba(15,23,42,0.72)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  listBtn: {
    border: "none",
    background: "transparent",
    borderRadius: 999,
    minHeight: 44,
    minWidth: 44,
    padding: 0,
    color: "rgba(15,23,42,0.72)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: {
    flex: "0 0 auto",
  },
  timerPill: {
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    borderRadius: 999,
    padding: "10px 16px",
    color: workoutTheme.textSecondary,
    fontSize: 17,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    justifySelf: "center",
    minWidth: 146,
  },
  timerIcon: {
    color: "rgba(15,23,42,0.74)",
    flex: "0 0 auto",
  },
  progressTrack: {
    marginTop: 8,
    height: 6,
    borderRadius: 999,
    background: "rgba(15,23,42,0.08)",
    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    transition: "width 220ms ease",
  },
};

import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";
import { formatClock } from "./utils";
import { ArrowLeft, ChevronRight, Pause, Play } from "lucide-react";

type Props = {
  elapsedSec: number;
  running: boolean;
  progressPercent: number;
  doneSets: number;
  totalSets: number;
  onBack: () => void;
  onToggleTimer: () => void;
  onOpenList: () => void;
};

export default function SessionHeader(props: Props) {
  const {
    elapsedSec,
    running,
    progressPercent,
    doneSets,
    totalSets,
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
            <button
              type="button"
              aria-label="Назад"
              style={s.backBtn}
              onClick={onBack}
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </button>

            <button
              type="button"
              style={s.timerPill}
              onClick={onToggleTimer}
            >
              {running ? (
                <Pause size={12} strokeWidth={2.2} style={s.timerIcon} />
              ) : (
                <Play size={12} strokeWidth={2.2} style={s.timerIcon} />
              )}
              <span>{formatClock(elapsedSec)}</span>
            </button>

            <button
              type="button"
              style={s.progressPill}
              onClick={onOpenList}
              aria-label="Открыть список упражнений"
            >
              <span>{doneSets}/{totalSets}</span>
              <ChevronRight size={14} strokeWidth={2.2} style={s.chevron} />
            </button>
          </div>

          <div style={s.progressTrack}>
            <div
              style={{
                ...s.progressFill,
                width: `${Math.max(0, Math.min(100, progressPercent))}%`,
              }}
            />
          </div>
        </div>
      </header>
    </>
  );
}

const s: Record<string, CSSProperties> = {
  spacer: {
    height: "calc(env(safe-area-inset-top, 0px) + 64px)",
  },
  wrap: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    padding: "calc(env(safe-area-inset-top, 0px) + 6px) 0 0",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    background: workoutTheme.headerBg,
    borderBottom: "1px solid rgba(255,255,255,0.6)",
  },
  inner: {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    padding: "0 12px",
    boxSizing: "border-box",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 44,
  },
  backBtn: {
    border: "none",
    background: "transparent",
    borderRadius: 999,
    width: 40,
    height: 40,
    padding: 0,
    color: workoutTheme.textPrimary,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  timerPill: {
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    borderRadius: 999,
    padding: "6px 14px",
    color: workoutTheme.textPrimary,
    fontSize: 14,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    letterSpacing: -0.2,
  },
  timerIcon: {
    opacity: 0.7,
    flexShrink: 0,
  },
  progressPill: {
    border: "none",
    background: "transparent",
    borderRadius: 999,
    padding: "6px 4px 6px 10px",
    color: workoutTheme.textSecondary,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
  },
  chevron: {
    opacity: 0.5,
    flexShrink: 0,
  },
  progressTrack: {
    marginTop: 8,
    height: 3,
    borderRadius: 999,
    background: "rgba(15,23,42,0.06)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #3a3b40 0%, #1e1f22 54%, #121316 100%)",
    transition: "width 300ms ease",
  },
};

import { useEffect, useState, type CSSProperties } from "react";
import { workoutTheme } from "./theme";
import { formatClock } from "./utils";
import { AlignJustify, ArrowLeft, Pause, Play } from "lucide-react";

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
  const [compact, setCompact] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth <= 390 : false
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 390px)");
    const apply = () => setCompact(mq.matches);
    apply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  return (
    <>
      <div style={s.spacer} aria-hidden />
      <header style={s.wrap}>
        <div style={s.inner}>
          <div style={{ ...s.row, ...(compact ? s.rowCompact : null) }}>
            <button
              type="button"
              aria-label="Назад"
              style={{ ...s.iconBtn, ...(compact ? s.iconBtnCompact : null) }}
              onClick={onBack}
            >
              <ArrowLeft size={17} strokeWidth={2.1} style={s.iconGlyph} />
              <span style={compact ? s.iconBtnLabelHidden : undefined}>Назад</span>
            </button>
            <div style={s.center}>
              <div style={s.title}>{title}</div>
              <div style={s.subtitle}>{subtitle}</div>
            </div>
            <button
              type="button"
              aria-label="Открыть список упражнений"
              style={{ ...s.iconBtn, ...(compact ? s.iconBtnCompact : null) }}
              onClick={onOpenList}
            >
              <AlignJustify size={17} strokeWidth={2.1} style={s.iconGlyph} />
              <span style={compact ? s.iconBtnLabelHidden : undefined}>Список</span>
            </button>
          </div>
          <div style={s.metaRow}>
            <button type="button" style={s.timerPill} onClick={onToggleTimer}>
              <span>{formatClock(elapsedSec)}</span>
              <span style={s.timerSep}>·</span>
              {running ? <Pause size={13} strokeWidth={2.1} style={s.timerIcon} /> : <Play size={13} strokeWidth={2.1} style={s.timerIcon} />}
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
    height: "calc(env(safe-area-inset-top, 0px) + 114px)",
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
    gridTemplateColumns: "auto minmax(0,1fr) auto",
    alignItems: "center",
    gap: 6,
  },
  rowCompact: {
    gap: 2,
  },
  center: {
    minWidth: 0,
    textAlign: "center",
  },
  title: {
    fontSize: 18,
    lineHeight: 1.2,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 1.2,
    color: workoutTheme.textMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  iconBtn: {
    border: "none",
    background: "transparent",
    borderRadius: 999,
    minHeight: 44,
    padding: "0 6px",
    color: "rgba(15,23,42,0.62)",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 0,
  },
  iconBtnCompact: {
    padding: "0 2px",
    minWidth: 36,
  },
  iconBtnLabelHidden: {
    display: "none",
  },
  iconGlyph: {
    opacity: 0.84,
    flex: "0 0 auto",
  },
  metaRow: {
    marginTop: 7,
    display: "flex",
    justifyContent: "center",
  },
  timerPill: {
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    borderRadius: 999,
    padding: "8px 14px",
    color: workoutTheme.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  timerSep: {
    opacity: 0.66,
  },
  timerIcon: {
    color: "rgba(15,23,42,0.68)",
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

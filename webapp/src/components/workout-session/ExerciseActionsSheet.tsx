import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, X, RefreshCw, SkipForward, Trash2, Ban, ChevronRight } from "lucide-react";
import type { ExerciseAlternative } from "@/api/exercises";
import { workoutTheme } from "./theme";
import type { ExerciseMenuState, SessionItem } from "./types";

type Props = {
  state: ExerciseMenuState | null;
  item: SessionItem | null;
  alts: ExerciseAlternative[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onLoadAlternatives: () => void;
  onReplace: (alt: ExerciseAlternative) => void;
  onAskSkip: () => void;
  onAskRemove: () => void;
  onAskBan: () => void;
  onSkip: () => void;
  onRemove: () => void;
  onBan: () => void;
  onBackMenu: () => void;
};

type MenuMode = ExerciseMenuState["mode"];
type SlideDirection = "forward" | "backward";

// iOS spring: fast attack, gentle settle — matches UIKit default spring
const SPRING_OPEN = "cubic-bezier(0.32, 0.72, 0, 1)";
const SPRING_CLOSE = "cubic-bezier(0.55, 0, 1, 0.45)";
const SPRING_CONTENT = "cubic-bezier(0.36, 0.66, 0.04, 1)";

const SHEET_ENTER_MS = 380;
const SHEET_EXIT_MS = 260;
const CONTENT_ANIM_MS = 280;
const OVERLAY_ENTER_MS = 320;
const OPEN_TICK_MS = 12;

function getSlideDirection(prev: MenuMode, next: MenuMode): SlideDirection {
  if (next === "menu" && prev !== "menu") return "backward";
  return "forward";
}

function getTitleForMode(mode: MenuMode, item: SessionItem | null): string {
  if (!item) return "";
  switch (mode) {
    case "menu": return item.name;
    case "replace": return "Замена";
    case "confirm_skip": return "Пропустить?";
    case "confirm_remove": return "Удалить?";
    case "confirm_ban": return "Исключить?";
    default: return "";
  }
}

// Skeleton for loading state — iOS-style shimmer
function AlternativeSkeleton() {
  return (
    <div style={sk.wrap} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ ...sk.row, animationDelay: `${i * 60}ms` }} className="eas-skeleton-row">
          <div style={{ ...sk.bar, width: `${55 + (i % 3) * 15}%` }} className="eas-shimmer" />
          {i % 2 === 0 && <div style={{ ...sk.bar, width: "38%", height: 11, marginTop: 5, opacity: 0.6 }} className="eas-shimmer" />}
        </div>
      ))}
    </div>
  );
}

export default function ExerciseActionsSheet(props: Props) {
  const {
    state, item, alts, loading, error,
    onClose, onLoadAlternatives, onReplace,
    onAskSkip, onAskRemove, onAskBan,
    onSkip, onRemove, onBan, onBackMenu,
  } = props;

  const propOpen = Boolean(state && item);
  const [renderOpen, setRenderOpen] = useState(propOpen);
  const [entered, setEntered] = useState(propOpen);
  const [displayState, setDisplayState] = useState<ExerciseMenuState | null>(state);
  const [displayItem, setDisplayItem] = useState<SessionItem | null>(item);
  const [currentMode, setCurrentMode] = useState<MenuMode | null>(state?.mode ?? null);
  const [prevMode, setPrevMode] = useState<MenuMode | null>(null);
  const [slideDirection, setSlideDirection] = useState<SlideDirection>("forward");
  const [contentAnimating, setContentAnimating] = useState(false);
  const [titleAnimating, setTitleAnimating] = useState(false);
  const [titleText, setTitleText] = useState(() => getTitleForMode(state?.mode ?? "menu", item));
  const [nextTitleText, setNextTitleText] = useState("");

  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const contentTimerRef = useRef<number | null>(null);
  const titleTimerRef = useRef<number | null>(null);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      [closeTimerRef, openTimerRef, contentTimerRef, titleTimerRef].forEach((r) => {
        if (r.current != null) window.clearTimeout(r.current);
      });
    };
  }, []);

  // Keep display data fresh while open
  useEffect(() => {
    if (state) setDisplayState(state);
    if (item) setDisplayItem(item);
  }, [state, item]);

  // Sheet open/close lifecycle
  useEffect(() => {
    if (propOpen) {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (!renderOpen) {
        setRenderOpen(true);
        setEntered(false);
        if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = window.setTimeout(() => {
          setEntered(true);
          openTimerRef.current = null;
        }, OPEN_TICK_MS);
        return;
      }
      setEntered(true);
      return;
    }

    if (!renderOpen) return;
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    setEntered(false);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setRenderOpen(false);
      setDisplayState(null);
      setDisplayItem(null);
      setCurrentMode(null);
      setPrevMode(null);
      setContentAnimating(false);
      setTitleAnimating(false);
      closeTimerRef.current = null;
    }, SHEET_EXIT_MS + 20);
  }, [propOpen, renderOpen]);

  // Content transition on mode change
  useEffect(() => {
    const nextMode = state?.mode ?? null;
    if (!nextMode) return;

    if (currentMode == null) {
      setCurrentMode(nextMode);
      setTitleText(getTitleForMode(nextMode, displayItem));
      return;
    }

    if (nextMode === currentMode) return;

    const dir = getSlideDirection(currentMode, nextMode);
    const newTitle = getTitleForMode(nextMode, displayItem);

    if (contentTimerRef.current != null) window.clearTimeout(contentTimerRef.current);
    if (titleTimerRef.current != null) window.clearTimeout(titleTimerRef.current);

    setPrevMode(currentMode);
    setCurrentMode(nextMode);
    setSlideDirection(dir);
    setContentAnimating(true);
    setTitleAnimating(true);
    setNextTitleText(newTitle);

    contentTimerRef.current = window.setTimeout(() => {
      setPrevMode(null);
      setContentAnimating(false);
      contentTimerRef.current = null;
    }, CONTENT_ANIM_MS + 20);

    titleTimerRef.current = window.setTimeout(() => {
      setTitleText(newTitle);
      setTitleAnimating(false);
      titleTimerRef.current = null;
    }, CONTENT_ANIM_MS / 2);
  }, [state?.mode, currentMode, displayItem]);

  // ── Content renderer ──────────────────────────────────────────────────
  const renderContent = (mode: MenuMode) => {
    if (!displayItem) return null;

    switch (mode) {
      case "menu":
        return (
          <div style={s.menuList}>
            <ActionRow
              icon={<RefreshCw size={17} strokeWidth={2.2} />}
              label="Заменить упражнение"
              onClick={onLoadAlternatives}
              iconColor="#007AFF"
              iconBg="rgba(0,122,255,0.10)"
            />
            <ActionRow
              icon={<SkipForward size={17} strokeWidth={2.2} />}
              label="Пропустить упражнение"
              onClick={onAskSkip}
              iconColor="#FF9500"
              iconBg="rgba(255,149,0,0.10)"
            />
            <div style={s.menuDivider} />
            <ActionRow
              icon={<Trash2 size={17} strokeWidth={2.2} />}
              label="Удалить из тренировки"
              onClick={onAskRemove}
              iconColor="#FF3B30"
              iconBg="rgba(255,59,48,0.10)"
              danger
            />
            <ActionRow
              icon={<Ban size={16} strokeWidth={2.2} />}
              label="Исключить из будущих тренировок"
              onClick={onAskBan}
              iconColor="#FF3B30"
              iconBg="rgba(255,59,48,0.10)"
              danger
            />
          </div>
        );

      case "replace":
        return (
          <div style={s.replaceWrap}>
            {loading ? (
              <AlternativeSkeleton />
            ) : error ? (
              <div style={s.errorCard}>
                <div style={s.errorTitle}>Не удалось загрузить</div>
                <div style={s.errorBody}>{error}</div>
                <button
                  type="button"
                  className="eas-btn"
                  style={s.retryBtn}
                  onClick={onLoadAlternatives}
                >
                  Попробовать снова
                </button>
              </div>
            ) : alts.length === 0 ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>🔍</div>
                <div style={s.emptyTitle}>Замены не найдены</div>
                <div style={s.emptyBody}>Для этого упражнения подходящих альтернатив нет</div>
              </div>
            ) : (
              <div style={s.altList}>
                {alts.map((alt, i) => (
                  <AltRow
                    key={alt.exerciseId}
                    alt={alt}
                    onReplace={onReplace}
                    index={i}
                  />
                ))}
              </div>
            )}
          </div>
        );

      case "confirm_skip":
        return (
          <ConfirmView
            body={`Упражнение «${displayItem.name}» будет пропущено в этой тренировке`}
            confirmLabel="Пропустить"
            onConfirm={onSkip}
            onCancel={onBackMenu}
          />
        );

      case "confirm_remove":
        return (
          <ConfirmView
            body={`«${displayItem.name}» будет удалено из этой тренировки`}
            confirmLabel="Удалить"
            onConfirm={onRemove}
            onCancel={onBackMenu}
          />
        );

      case "confirm_ban":
        return (
          <ConfirmView
            body={`«${displayItem.name}» больше не будет включаться в твои планы`}
            confirmLabel={loading ? "Сохраняем..." : "Исключить"}
            onConfirm={onBan}
            onCancel={onBackMenu}
            disabled={loading}
          />
        );

      default:
        return null;
    }
  };

  if (!renderOpen || !displayState || !displayItem || !currentMode) return null;

  const canGoBack = currentMode !== "menu";

  return (
    <>
      <style>{globalCss}</style>

      {/* Backdrop */}
      <div
        style={{
          ...s.overlay,
          opacity: entered ? 1 : 0,
          transition: `opacity ${entered ? OVERLAY_ENTER_MS : SHEET_EXIT_MS}ms ease`,
        }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        style={{
          ...s.sheetWrap,
          transform: entered ? "translate3d(0,0,0)" : "translate3d(0,100%,0)",
          opacity: entered ? 1 : 0,
          transition: entered
            ? `transform ${SHEET_ENTER_MS}ms ${SPRING_OPEN}, opacity ${SHEET_ENTER_MS * 0.6}ms ease`
            : `transform ${SHEET_EXIT_MS}ms ${SPRING_CLOSE}, opacity ${SHEET_EXIT_MS}ms ease`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber */}
        <div style={s.grabberRow} aria-hidden>
          <div style={s.grabber} />
        </div>

        {/* Header */}
        <div style={s.header}>
          <button
            type="button"
            aria-label="Назад"
            className="eas-icon-btn"
            style={{
              ...s.headerBtn,
              opacity: canGoBack ? 1 : 0,
              pointerEvents: canGoBack ? "auto" : "none",
            }}
            onClick={onBackMenu}
            tabIndex={canGoBack ? 0 : -1}
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
            <span style={s.backLabel}>Назад</span>
          </button>

          {/* Animated title */}
          <div style={s.titleWrap} aria-live="polite">
            {titleAnimating ? (
              <>
                <span
                  key={`out-${titleText}`}
                  style={{
                    ...s.title,
                    ...(slideDirection === "forward" ? s.titleOutLeft : s.titleOutRight),
                  }}
                  aria-hidden
                >
                  {titleText}
                </span>
                <span
                  key={`in-${nextTitleText}`}
                  style={{
                    ...s.title,
                    ...(slideDirection === "forward" ? s.titleInRight : s.titleInLeft),
                  }}
                >
                  {nextTitleText}
                </span>
              </>
            ) : (
              <span style={{ ...s.title, ...s.titleStatic }}>{titleText}</span>
            )}
          </div>

          <button
            type="button"
            aria-label="Закрыть"
            className="eas-icon-btn"
            style={{ ...s.headerBtn, ...s.headerBtnClose }}
            onClick={onClose}
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        {/* Content area with slide transition */}
        <div
          style={{
            ...s.contentViewport,
            overflow: contentAnimating ? "hidden" : "visible",
          }}
        >
          {contentAnimating && prevMode ? (
            <>
              <div
                style={{
                  ...s.contentPane,
                  animation: `${slideDirection === "forward" ? "eas-out-left" : "eas-out-right"} ${CONTENT_ANIM_MS}ms ${SPRING_CONTENT} both`,
                  pointerEvents: "none",
                }}
              >
                {renderContent(prevMode)}
              </div>
              <div
                style={{
                  ...s.contentPane,
                  animation: `${slideDirection === "forward" ? "eas-in-right" : "eas-in-left"} ${CONTENT_ANIM_MS}ms ${SPRING_CONTENT} both`,
                }}
              >
                {renderContent(currentMode)}
              </div>
            </>
          ) : (
            <div style={{ ...s.contentPane }}>{renderContent(currentMode)}</div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function ActionRow({
  icon, label, onClick, iconColor, iconBg, danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  iconColor: string;
  iconBg: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className="eas-action-row"
      style={{ ...s.actionRow, color: danger ? "#FF3B30" : "rgba(0,0,0,0.88)" }}
      onClick={onClick}
    >
      <span style={{ ...s.actionIcon, background: iconBg, color: iconColor }}>
        {icon}
      </span>
      <span style={s.actionLabel}>{label}</span>
      <ChevronRight size={15} strokeWidth={2} style={{ color: "rgba(0,0,0,0.22)", flexShrink: 0 }} />
    </button>
  );
}

function AltRow({
  alt, onReplace, index,
}: {
  alt: ExerciseAlternative;
  onReplace: (a: ExerciseAlternative) => void;
  index: number;
}) {
  return (
    <button
      type="button"
      className="eas-alt-row"
      style={{
        ...s.altRow,
        animationDelay: `${index * 30}ms`,
      }}
      onClick={() => onReplace(alt)}
    >
      <div style={s.altContent}>
        <div style={s.altName}>{alt.name}</div>
        {alt.hint ? <div style={s.altHint}>{alt.hint}</div> : null}
      </div>
      <ChevronRight size={14} strokeWidth={2} style={{ color: "rgba(0,0,0,0.2)", flexShrink: 0 }} />
    </button>
  );
}

function ConfirmView({
  body, confirmLabel, onConfirm, onCancel, disabled = false,
}: {
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={s.confirmWrap}>
      <p style={s.confirmBody}>{body}</p>
      <button
        type="button"
        className="eas-btn eas-btn-danger"
        style={s.confirmBtn}
        onClick={onConfirm}
        disabled={disabled}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="eas-btn"
        style={s.cancelBtn}
        onClick={onCancel}
      >
        Отмена
      </button>
    </div>
  );
}

// ── Skeleton styles ────────────────────────────────────────────────────
const sk: Record<string, CSSProperties> = {
  wrap: {
    display: "grid",
    gap: 4,
    padding: "4px 0",
  },
  row: {
    padding: "14px 16px",
    borderRadius: 14,
    background: "rgba(0,0,0,0.035)",
    animation: "eas-skeleton-fade 0.4s ease both",
  },
  bar: {
    height: 15,
    borderRadius: 8,
    background: "linear-gradient(90deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.04) 50%, rgba(0,0,0,0.08) 100%)",
    backgroundSize: "200% 100%",
  },
};

// ── Global CSS (keyframes + interactive states) ───────────────────────
const globalCss = `
  /* Sheet content transitions */
  @keyframes eas-in-right {
    from { opacity: 0; transform: translate3d(44px, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes eas-in-left {
    from { opacity: 0; transform: translate3d(-44px, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes eas-out-left {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to   { opacity: 0; transform: translate3d(-44px, 0, 0); }
  }
  @keyframes eas-out-right {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to   { opacity: 0; transform: translate3d(44px, 0, 0); }
  }

  /* Title transitions */
  @keyframes eas-title-in-right {
    from { opacity: 0; transform: translate3d(20px, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes eas-title-in-left {
    from { opacity: 0; transform: translate3d(-20px, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes eas-title-out-left {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to   { opacity: 0; transform: translate3d(-20px, 0, 0); }
  }
  @keyframes eas-title-out-right {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to   { opacity: 0; transform: translate3d(20px, 0, 0); }
  }

  /* Alt rows stagger in */
  @keyframes eas-alt-in {
    from { opacity: 0; transform: translate3d(0, 10px, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }

  /* Skeleton loading */
  @keyframes eas-skeleton-fade {
    from { opacity: 0; transform: translate3d(0, 6px, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes eas-shimmer {
    from { background-position: 200% 0; }
    to   { background-position: -200% 0; }
  }

  .eas-shimmer {
    background: linear-gradient(90deg,
      rgba(0,0,0,0.07) 0%,
      rgba(0,0,0,0.12) 30%,
      rgba(0,0,0,0.07) 60%
    ) !important;
    background-size: 200% 100% !important;
    animation: eas-shimmer 1.4s ease infinite !important;
  }

  /* Action row */
  .eas-action-row {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    transition: background 120ms ease, transform 100ms ease;
    will-change: transform;
  }
  .eas-action-row:active {
    background: rgba(0,0,0,0.06) !important;
    transform: scale(0.985);
  }

  /* Alt row */
  .eas-alt-row {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    animation: eas-alt-in 0.32s cubic-bezier(0.36, 0.66, 0.04, 1) both;
    transition: background 120ms ease, transform 100ms ease;
    will-change: transform, opacity;
  }
  .eas-alt-row:active {
    background: rgba(0,0,0,0.06) !important;
    transform: scale(0.985);
  }

  /* Generic button */
  .eas-btn {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    transition: opacity 120ms ease, transform 100ms ease;
    will-change: transform;
  }
  .eas-btn:active:not(:disabled) {
    opacity: 0.75;
    transform: scale(0.97);
  }
  .eas-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Icon button */
  .eas-icon-btn {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    transition: opacity 120ms ease, transform 100ms ease;
    will-change: transform;
  }
  .eas-icon-btn:active {
    opacity: 0.6;
    transform: scale(0.92);
  }

  /* Remove top border from first alt row to avoid double border with container */
  .eas-alt-row:first-child {
    border-top: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .eas-action-row, .eas-alt-row, .eas-btn, .eas-icon-btn,
    .eas-shimmer {
      transition: none !important;
      animation: none !important;
    }
  }
`;

// ── Styles ─────────────────────────────────────────────────────────────
const s: Record<string, CSSProperties> = {
  // Backdrop
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    background: "rgba(0,0,0,0.45)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
  },

  // Sheet container
  sheetWrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 71,
    borderRadius: "20px 20px 0 0",
    background: "rgba(242,242,247,0.97)",
    backdropFilter: "blur(40px) saturate(180%)",
    WebkitBackdropFilter: "blur(40px) saturate(180%)",
    boxShadow: "0 -1px 0 rgba(0,0,0,0.1), 0 -20px 60px rgba(0,0,0,0.18)",
    paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
    maxHeight: "82vh",
    display: "flex",
    flexDirection: "column",
    willChange: "transform, opacity",
    overflowY: "auto",
    overflowX: "hidden",
  },

  // Grabber
  grabberRow: {
    display: "flex",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 4,
    flexShrink: 0,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: "rgba(60,60,67,0.3)",
  },

  // Header
  header: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    alignItems: "center",
    gap: 4,
    padding: "6px 8px 8px",
    flexShrink: 0,
  },
  headerBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "6px 8px",
    border: "none",
    background: "transparent",
    borderRadius: 10,
    color: "#007AFF",
    fontSize: 16,
    fontWeight: 400,
    cursor: "pointer",
    minWidth: 60,
    whiteSpace: "nowrap",
    transition: "opacity 150ms ease",
  },
  headerBtnClose: {
    justifyContent: "flex-end",
    minWidth: 32,
    padding: "6px 8px",
    color: "rgba(60,60,67,0.6)",
  },
  backLabel: {
    fontSize: 16,
    fontWeight: 400,
    color: "#007AFF",
  },

  // Title
  titleWrap: {
    position: "relative",
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  title: {
    position: "absolute",
    fontSize: 16,
    fontWeight: 600,
    color: "rgba(0,0,0,0.88)",
    textAlign: "center",
    whiteSpace: "nowrap",
    letterSpacing: "-0.3px",
  },
  titleStatic: {
    position: "relative",
  },
  titleInRight: {
    animation: `eas-title-in-right 240ms cubic-bezier(0.36, 0.66, 0.04, 1) both`,
  },
  titleInLeft: {
    animation: `eas-title-in-left 240ms cubic-bezier(0.36, 0.66, 0.04, 1) both`,
  },
  titleOutLeft: {
    animation: `eas-title-out-left 240ms cubic-bezier(0.36, 0.66, 0.04, 1) both`,
    pointerEvents: "none",
  },
  titleOutRight: {
    animation: `eas-title-out-right 240ms cubic-bezier(0.36, 0.66, 0.04, 1) both`,
    pointerEvents: "none",
  },

  // Content viewport (slide transitions)
  contentViewport: {
    display: "grid",
    flex: 1,
    minHeight: 0,
  },
  contentPane: {
    gridArea: "1 / 1",
    display: "flex",
    flexDirection: "column",
  },

  // ── Menu mode ─────────────────────────────────────────────────────────
  menuList: {
    display: "flex",
    flexDirection: "column",
    margin: "4px 16px 8px",
    borderRadius: 14,
    overflow: "hidden",
    background: "rgba(255,255,255,0.8)",
    boxShadow: "0 1px 0 rgba(0,0,0,0.08), inset 0 0 0 0.5px rgba(0,0,0,0.08)",
  },
  menuDivider: {
    height: 0.5,
    background: "rgba(0,0,0,0.1)",
    marginLeft: 56,
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "13px 16px",
    border: "none",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    width: "100%",
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  actionLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: 400,
    color: "inherit",
    letterSpacing: "-0.2px",
  },

  // ── Replace mode ──────────────────────────────────────────────────────
  replaceWrap: {
    display: "flex",
    flexDirection: "column",
    padding: "4px 16px 8px",
  },
  altList: {
    display: "flex",
    flexDirection: "column",
    borderRadius: 14,
    overflow: "hidden",
    background: "rgba(255,255,255,0.8)",
    boxShadow: "0 1px 0 rgba(0,0,0,0.08), inset 0 0 0 0.5px rgba(0,0,0,0.08)",
  },
  altRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "13px 16px",
    border: "none",
    borderTop: "0.5px solid rgba(0,0,0,0.07)",
    background: "transparent",
    textAlign: "left" as const,
    cursor: "pointer",
    width: "100%",
  },
  altContent: {
    flex: 1,
    minWidth: 0,
  },
  altName: {
    fontSize: 16,
    fontWeight: 400,
    color: "rgba(0,0,0,0.88)",
    letterSpacing: "-0.2px",
    lineHeight: 1.3,
  },
  altHint: {
    fontSize: 13,
    color: "rgba(0,0,0,0.44)",
    marginTop: 2,
    lineHeight: 1.3,
  },

  // Error / empty state
  errorCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "24px 16px",
    borderRadius: 14,
    background: "rgba(255,59,48,0.06)",
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#FF3B30",
  },
  errorBody: {
    fontSize: 14,
    color: "rgba(0,0,0,0.55)",
    lineHeight: 1.4,
  },
  retryBtn: {
    marginTop: 8,
    padding: "9px 20px",
    borderRadius: 12,
    border: "none",
    background: "#007AFF",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "32px 16px",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "rgba(0,0,0,0.7)",
  },
  emptyBody: {
    fontSize: 14,
    color: "rgba(0,0,0,0.44)",
    lineHeight: 1.4,
    maxWidth: 240,
  },

  // ── Confirm mode ──────────────────────────────────────────────────────
  confirmWrap: {
    display: "flex",
    flexDirection: "column",
    padding: "4px 16px 8px",
    gap: 10,
  },
  confirmBody: {
    fontSize: 15,
    color: "rgba(0,0,0,0.55)",
    lineHeight: 1.45,
    textAlign: "center",
    padding: "8px 4px",
    margin: 0,
  },
  confirmBtn: {
    width: "100%",
    padding: "16px",
    borderRadius: 14,
    border: "none",
    background: "rgba(255,59,48,0.88)",
    color: "#fff",
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: "-0.2px",
    cursor: "pointer",
  },
  cancelBtn: {
    width: "100%",
    padding: "16px",
    borderRadius: 14,
    border: "none",
    background: "rgba(255,255,255,0.85)",
    boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.1)",
    color: "#007AFF",
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: "-0.2px",
    cursor: "pointer",
  },
};

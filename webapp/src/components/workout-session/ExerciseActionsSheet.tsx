import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, X, RefreshCw, SkipForward, Trash2, Ban } from "lucide-react";
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

  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const contentTimerRef = useRef<number | null>(null);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      [closeTimerRef, openTimerRef, contentTimerRef].forEach((r) => {
        if (r.current != null) window.clearTimeout(r.current);
      });
    };
  }, []);

  // Lock body scroll while sheet is visible
  useEffect(() => {
    if (!renderOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [renderOpen]);

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
      closeTimerRef.current = null;
    }, SHEET_EXIT_MS + 20);
  }, [propOpen, renderOpen]);

  // Content transition on mode change
  useEffect(() => {
    const nextMode = state?.mode ?? null;
    if (!nextMode) return;

    if (currentMode == null) {
      setCurrentMode(nextMode);
      return;
    }

    if (nextMode === currentMode) return;

    const dir = getSlideDirection(currentMode, nextMode);

    if (contentTimerRef.current != null) window.clearTimeout(contentTimerRef.current);

    setPrevMode(currentMode);
    setCurrentMode(nextMode);
    setSlideDirection(dir);
    setContentAnimating(true);

    contentTimerRef.current = window.setTimeout(() => {
      setPrevMode(null);
      setContentAnimating(false);
      contentTimerRef.current = null;
    }, CONTENT_ANIM_MS + 20);
  }, [state?.mode, currentMode]);

  // ── Content renderer ──────────────────────────────────────────────────
  const renderContent = (mode: MenuMode) => {
    if (!displayItem) return null;

    switch (mode) {
      case "menu":
        return (
          <div style={s.menuList}>
            {/* Primary actions — side by side */}
            <div style={s.menuRow}>
              <MenuBtn
                icon={<RefreshCw size={16} strokeWidth={2.2} />}
                label="Заменить"
                onClick={onLoadAlternatives}
              />
              <MenuBtn
                icon={<SkipForward size={16} strokeWidth={2.2} />}
                label="Пропустить"
                onClick={onAskSkip}
              />
            </div>
            {/* Destructive actions — smaller, muted */}
            <MenuBtn
              icon={<Trash2 size={15} strokeWidth={2.2} />}
              label="Удалить из тренировки"
              onClick={onAskRemove}
              danger
              small
            />
            <MenuBtn
              icon={<Ban size={15} strokeWidth={2.2} />}
              label="Исключить из будущих тренировок"
              onClick={onAskBan}
              danger
              small
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
                  className="eas-sheet-btn"
                  style={{
                    ...s.sheetBtn,
                    color: workoutTheme.accent,
                    ["--eas-btn-color" as never]: workoutTheme.accent,
                    marginTop: 8,
                  }}
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
              ...s.iconBtn,
              opacity: canGoBack ? 1 : 0,
              pointerEvents: canGoBack ? "auto" : "none",
            }}
            onClick={onBackMenu}
            tabIndex={canGoBack ? 0 : -1}
          >
            <ArrowLeft size={15} strokeWidth={2.5} />
          </button>

          <div style={s.headerSpacer} />

          <button
            type="button"
            aria-label="Закрыть"
            className="eas-icon-btn"
            style={s.iconBtn}
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

function MenuBtn({ icon, label, onClick, danger = false, small = false }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className="eas-sheet-btn"
      style={{
        ...s.sheetBtn,
        ...(small ? s.sheetBtnSmall : null),
        color: danger ? workoutTheme.danger : workoutTheme.accent,
        ["--eas-btn-color" as never]: danger ? workoutTheme.danger : workoutTheme.accent,
      }}
      onClick={onClick}
    >
      <span style={{ ...s.menuBtnIconWrap, ...(small ? s.menuBtnIconWrapSmall : null) }}>
        {icon}
      </span>
      <span style={{ ...s.menuBtnLabel, ...(small ? s.menuBtnLabelSmall : null) }}>
        {label}
      </span>
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
      className="eas-sheet-btn"
      style={{
        ...s.sheetBtn,
        ...s.altRowInner,
        animationDelay: `${index * 30}ms`,
      }}
      onClick={() => onReplace(alt)}
    >
      <div style={s.altName}>{alt.name}</div>
      {alt.hint ? <div style={s.altHint}>{alt.hint}</div> : null}
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
        className="eas-sheet-btn"
        style={{
          ...s.sheetBtn,
          color: workoutTheme.danger,
          ["--eas-btn-color" as never]: workoutTheme.danger,
        }}
        onClick={onConfirm}
        disabled={disabled}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="eas-sheet-btn"
        style={{
          ...s.sheetBtn,
          color: workoutTheme.accent,
          ["--eas-btn-color" as never]: workoutTheme.accent,
        }}
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
    gap: 6,
  },
  row: {
    minHeight: 58,
    padding: "14px 16px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.4)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    boxShadow: "0 10px 22px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.7)",
    animation: "eas-skeleton-fade 0.4s ease both",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 6,
  },
  bar: {
    height: 14,
    borderRadius: 8,
    background: "rgba(15,23,42,0.08)",
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
      rgba(15,23,42,0.07) 0%,
      rgba(15,23,42,0.12) 30%,
      rgba(15,23,42,0.07) 60%
    ) !important;
    background-size: 200% 100% !important;
    animation: eas-shimmer 1.4s ease infinite !important;
  }

  /* Sheet button — matches ExerciseListSheet row style */
  .eas-sheet-btn {
    appearance: none;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    transition:
      background 220ms ease,
      border-color 220ms ease,
      color 220ms ease,
      transform 160ms ease,
      box-shadow 220ms ease;
    will-change: transform, background, border-color, box-shadow;
  }
  .eas-sheet-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.99);
  }
  .eas-sheet-btn:disabled {
    opacity: 0.72;
    cursor: default;
  }

  /* Icon button */
  .eas-icon-btn {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    cursor: pointer;
    transition: opacity 120ms ease, transform 120ms ease;
    will-change: transform;
  }
  .eas-icon-btn:active {
    opacity: 0.55;
    transform: scale(0.9);
  }

  @media (prefers-reduced-motion: reduce) {
    .eas-sheet-btn, .eas-icon-btn, .eas-shimmer {
      transition: none !important;
      animation: none !important;
    }
  }
`;

// ── Styles ─────────────────────────────────────────────────────────────
const s: Record<string, CSSProperties> = {
  // Backdrop — matches workoutTheme.overlayStrong used elsewhere
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    background: workoutTheme.overlayStrong,
  },

  // Sheet container — matches ExerciseListSheet exactly
  sheetWrap: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 71,
    borderRadius: "24px 24px 0 0",
    border: workoutTheme.cardBorder,
    background: "linear-gradient(180deg, rgba(255,255,255,0.985) 0%, rgba(242,242,247,0.975) 100%)",
    boxShadow: workoutTheme.cardShadow,
    paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    willChange: "transform, opacity",
    overflowY: "auto",
    overflowX: "hidden",
  },

  // Grabber — matches ExerciseListSheet grabber exactly
  grabberRow: {
    display: "flex",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 2,
    flexShrink: 0,
  },
  grabber: {
    width: 46,
    height: 5,
    borderRadius: 999,
    background: "rgba(15,23,42,0.16)",
  },

  // Header
  header: {
    display: "flex",
    alignItems: "center",
    padding: "2px 8px 6px",
    flexShrink: 0,
  },
  headerSpacer: {
    flex: 1,
  },
  iconBtn: {
    width: 32,
    height: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    borderRadius: 999,
    color: workoutTheme.textSecondary,
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
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

  // ── Shared button — matches ExerciseListSheet row style ───────────────
  sheetBtn: {
    width: "100%",
    minHeight: 58,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.4)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    boxShadow: "0 10px 22px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
    padding: "12px 14px",
    fontSize: 18,
    fontWeight: 500,
    textAlign: "left" as const,
    cursor: "pointer",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuBtnIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: "inherit",
  },
  menuBtnLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: 500,
    color: "inherit",
    lineHeight: 1.25,
  },

  // ── Menu mode ─────────────────────────────────────────────────────────
  menuList: {
    display: "grid",
    gap: 6,
    padding: "4px 16px 8px",
  },
  menuRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
  },
  sheetBtnSmall: {
    minHeight: 46,
    padding: "10px 12px",
    opacity: 0.72,
  },
  menuBtnIconWrapSmall: {
    width: 28,
    height: 28,
  },
  menuBtnLabelSmall: {
    fontSize: 15,
    fontWeight: 400,
  },

  // ── Replace mode ──────────────────────────────────────────────────────
  replaceWrap: {
    display: "grid",
    gap: 6,
    padding: "4px 16px 8px",
  },
  altList: {
    display: "grid",
    gap: 6,
  },
  altRowInner: {
    animation: "eas-alt-in 0.32s cubic-bezier(0.36, 0.66, 0.04, 1) both",
    color: workoutTheme.accent,
    flexDirection: "column" as const,
    alignItems: "flex-start",
  },
  altName: {
    fontSize: 18,
    fontWeight: 500,
    color: "inherit",
    lineHeight: 1.3,
  },
  altHint: {
    fontSize: 13,
    fontWeight: 500,
    color: workoutTheme.textMuted,
    marginTop: 3,
    lineHeight: 1.3,
  },

  // Error / empty state
  errorCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "24px 16px",
    borderRadius: 18,
    background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: workoutTheme.danger,
  },
  errorBody: {
    fontSize: 14,
    color: workoutTheme.textSecondary,
    lineHeight: 1.4,
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
    color: workoutTheme.textSecondary,
  },
  emptyBody: {
    fontSize: 14,
    color: workoutTheme.textMuted,
    lineHeight: 1.4,
    maxWidth: 240,
  },

  // ── Confirm mode ──────────────────────────────────────────────────────
  confirmWrap: {
    display: "grid",
    gap: 6,
    padding: "4px 16px 8px",
  },
  confirmBody: {
    fontSize: 15,
    color: workoutTheme.textSecondary,
    lineHeight: 1.45,
    textAlign: "center",
    padding: "8px 4px",
    margin: 0,
  },
};

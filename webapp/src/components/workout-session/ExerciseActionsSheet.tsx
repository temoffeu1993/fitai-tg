import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, X } from "lucide-react";
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

const SHEET_ANIM_MS = 240;
const CONTENT_ANIM_MS = 220;

function getSlideDirection(prev: MenuMode, next: MenuMode): SlideDirection {
  if (next === "menu" && prev !== "menu") return "backward";
  return "forward";
}

export default function ExerciseActionsSheet(props: Props) {
  const {
    state,
    item,
    alts,
    loading,
    error,
    onClose,
    onLoadAlternatives,
    onReplace,
    onAskSkip,
    onAskRemove,
    onAskBan,
    onSkip,
    onRemove,
    onBan,
    onBackMenu,
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
  const contentTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
      if (contentTimerRef.current != null) window.clearTimeout(contentTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state) setDisplayState(state);
    if (item) setDisplayItem(item);
  }, [state, item]);

  useEffect(() => {
    if (propOpen) {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      if (!renderOpen) {
        setRenderOpen(true);
        setEntered(false);
        const raf = window.requestAnimationFrame(() => setEntered(true));
        return () => window.cancelAnimationFrame(raf);
      }

      setEntered(true);
      return;
    }

    if (!renderOpen) return;

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
    }, SHEET_ANIM_MS);
  }, [propOpen, renderOpen]);

  useEffect(() => {
    const nextMode = state?.mode ?? null;
    if (!nextMode) return;

    if (currentMode == null) {
      setCurrentMode(nextMode);
      return;
    }

    if (nextMode === currentMode) return;

    if (contentTimerRef.current != null) window.clearTimeout(contentTimerRef.current);
    setPrevMode(currentMode);
    setCurrentMode(nextMode);
    setSlideDirection(getSlideDirection(currentMode, nextMode));
    setContentAnimating(true);

    contentTimerRef.current = window.setTimeout(() => {
      setPrevMode(null);
      setContentAnimating(false);
      contentTimerRef.current = null;
    }, CONTENT_ANIM_MS);
  }, [state?.mode, currentMode]);

  const renderContent = (mode: MenuMode) => {
    if (!displayItem) return null;

    if (mode === "menu") {
      return (
        <>
          <button type="button" className="ws-sheet-btn" style={s.action} onClick={onLoadAlternatives}>
            Заменить упражнение
          </button>
          <button type="button" className="ws-sheet-btn" style={s.action} onClick={onAskSkip}>
            Пропустить упражнение
          </button>
          <button type="button" className="ws-sheet-btn" style={s.action} onClick={onAskRemove}>
            Удалить упражнение
          </button>
          <button type="button" className="ws-sheet-btn" style={s.actionDanger} onClick={onAskBan}>
            Исключить из будущих тренировок
          </button>
        </>
      );
    }

    if (mode === "replace") {
      return (
        <>
          {loading ? <div style={s.hint}>Подбираю альтернативы...</div> : null}
          {error ? <div style={s.error}>{error}</div> : null}
          {!loading && !error && alts.length === 0 ? (
            <div style={s.hint}>Подходящих замен не найдено.</div>
          ) : null}
          {!loading && alts.length > 0 ? (
            <div style={s.list}>
              {alts.map((alt) => (
                <button key={alt.exerciseId} type="button" className="ws-sheet-btn" style={s.action} onClick={() => onReplace(alt)}>
                  <div style={s.altTitle}>{alt.name}</div>
                  {alt.hint ? <div style={s.altHint}>{alt.hint}</div> : null}
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" className="ws-sheet-btn" style={s.back} onClick={onBackMenu}>
            Назад
          </button>
        </>
      );
    }

    if (mode === "confirm_skip") {
      return (
        <>
          <div style={s.hint}>Пропустить «{displayItem.name}» в этой тренировке?</div>
          <button type="button" className="ws-sheet-btn" style={s.actionDanger} onClick={onSkip}>
            Да, пропустить
          </button>
          <button type="button" className="ws-sheet-btn" style={s.back} onClick={onBackMenu}>
            Отмена
          </button>
        </>
      );
    }

    if (mode === "confirm_remove") {
      return (
        <>
          <div style={s.hint}>Удалить «{displayItem.name}» из этой тренировки?</div>
          <button type="button" className="ws-sheet-btn" style={s.actionDanger} onClick={onRemove}>
            Да, удалить
          </button>
          <button type="button" className="ws-sheet-btn" style={s.back} onClick={onBackMenu}>
            Отмена
          </button>
        </>
      );
    }

    return (
      <>
        <div style={s.hint}>Исключить «{displayItem.name}» из будущих планов?</div>
        <button type="button" className="ws-sheet-btn" style={s.actionDanger} onClick={onBan} disabled={loading}>
          {loading ? "Сохраняем..." : "Исключить"}
        </button>
        <button type="button" className="ws-sheet-btn" style={s.back} onClick={onBackMenu}>
          Отмена
        </button>
      </>
    );
  };

  if (!renderOpen || !displayState || !displayItem || !currentMode) return null;

  const canGoBack = currentMode !== "menu";

  return (
    <>
      <style>{sheetButtonCss}</style>
      <style>{sheetMotionCss}</style>
      <div
        style={{
          ...s.overlay,
          ...(entered ? s.overlayOpen : s.overlayClosed),
        }}
        onClick={onClose}
      >
        <div
          style={{
            ...s.sheet,
            ...(entered ? s.sheetOpen : s.sheetClosed),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={s.topRow}>
            {canGoBack ? (
              <button
                type="button"
                aria-label="Назад"
                className="ws-sheet-icon-btn"
                style={s.iconBtn}
                onClick={onBackMenu}
              >
                <ArrowLeft size={18} strokeWidth={2.2} />
              </button>
            ) : (
              <span style={s.iconGhost} aria-hidden />
            )}

            <div style={s.grabber} />

            <button
              type="button"
              aria-label="Закрыть меню"
              className="ws-sheet-icon-btn"
              style={s.iconBtn}
              onClick={onClose}
            >
              <X size={18} strokeWidth={2.2} />
            </button>
          </div>

          <div style={s.contentViewport}>
            {contentAnimating && prevMode ? (
              <>
                <div
                  style={{
                    ...s.contentPane,
                    ...(slideDirection === "forward" ? s.contentPaneOutLeft : s.contentPaneOutRight),
                  }}
                >
                  {renderContent(prevMode)}
                </div>
                <div
                  style={{
                    ...s.contentPane,
                    ...(slideDirection === "forward" ? s.contentPaneInRight : s.contentPaneInLeft),
                  }}
                >
                  {renderContent(currentMode)}
                </div>
              </>
            ) : (
              <div style={{ ...s.contentPane, ...s.contentPaneStatic }}>{renderContent(currentMode)}</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const sheetButtonCss = `
  .ws-sheet-btn {
    appearance: none;
    outline: none;
    transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease, box-shadow 220ms ease;
    will-change: transform, background, border-color, box-shadow;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .ws-sheet-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.99);
    background: var(--sheet-btn-bg) !important;
    border-color: var(--sheet-btn-border) !important;
    color: var(--sheet-btn-color) !important;
    box-shadow: var(--sheet-btn-shadow) !important;
  }
  .ws-sheet-btn:disabled {
    opacity: 0.72;
    cursor: default;
  }
  .ws-sheet-icon-btn {
    appearance: none;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition: transform 160ms ease;
  }
  .ws-sheet-icon-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.98);
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-sheet-btn,
    .ws-sheet-icon-btn { transition: none !important; }
  }
`;

const sheetMotionCss = `
  @keyframes ws-sheet-content-in-right {
    from { opacity: 0; transform: translateX(26px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes ws-sheet-content-in-left {
    from { opacity: 0; transform: translateX(-26px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes ws-sheet-content-out-left {
    from { opacity: 1; transform: translateX(0); }
    to { opacity: 0; transform: translateX(-22px); }
  }
  @keyframes ws-sheet-content-out-right {
    from { opacity: 1; transform: translateX(0); }
    to { opacity: 0; transform: translateX(22px); }
  }
`;

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    display: "grid",
    alignItems: "end",
    background: "transparent",
    transition: `opacity ${SHEET_ANIM_MS}ms ease`,
  },
  overlayOpen: {
    opacity: 1,
  },
  overlayClosed: {
    opacity: 0,
  },
  sheet: {
    borderRadius: "24px 24px 0 0",
    border: workoutTheme.cardBorder,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.985) 0%, rgba(242,242,247,0.975) 100%)",
    boxShadow: workoutTheme.cardShadow,
    padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
    display: "grid",
    gap: 10,
    maxHeight: "74vh",
    overflowY: "auto",
    transition: `transform ${SHEET_ANIM_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${SHEET_ANIM_MS}ms ease`,
    transform: "translateY(0)",
    opacity: 1,
  },
  sheetOpen: {
    transform: "translateY(0)",
    opacity: 1,
  },
  sheetClosed: {
    transform: "translateY(26px)",
    opacity: 0,
  },
  topRow: {
    display: "grid",
    gridTemplateColumns: "40px 1fr 40px",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    marginTop: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    border: "none",
    background: "transparent",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(15,23,42,0.72)",
    cursor: "pointer",
    padding: 0,
    justifySelf: "start",
  },
  iconGhost: {
    width: 36,
    height: 36,
    display: "block",
  },
  grabber: {
    width: 46,
    height: 5,
    borderRadius: 999,
    background: "rgba(15,23,42,0.16)",
    justifySelf: "center",
  },
  contentViewport: {
    display: "grid",
    overflow: "hidden",
  },
  contentPane: {
    gridArea: "1 / 1",
    display: "grid",
    gap: 8,
  },
  contentPaneStatic: {
    position: "relative",
  },
  contentPaneInRight: {
    animation: `ws-sheet-content-in-right ${CONTENT_ANIM_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
  },
  contentPaneInLeft: {
    animation: `ws-sheet-content-in-left ${CONTENT_ANIM_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
  },
  contentPaneOutLeft: {
    animation: `ws-sheet-content-out-left ${CONTENT_ANIM_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
    pointerEvents: "none",
  },
  contentPaneOutRight: {
    animation: `ws-sheet-content-out-right ${CONTENT_ANIM_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
    pointerEvents: "none",
  },
  list: {
    display: "grid",
    gap: 8,
  },
  action: {
    width: "100%",
    textAlign: "left",
    borderRadius: 18,
    border: "1px solid var(--sheet-btn-border, rgba(255,255,255,0.4))",
    background:
      "var(--sheet-btn-bg, linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%))",
    boxShadow:
      "var(--sheet-btn-shadow, 0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25))",
    color: "var(--sheet-btn-color, #1e1f22)",
    minHeight: 58,
    padding: "16px 14px",
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
    ["--sheet-btn-bg" as never]:
      "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    ["--sheet-btn-border" as never]: "rgba(255,255,255,0.4)",
    ["--sheet-btn-color" as never]: "#1e1f22",
    ["--sheet-btn-shadow" as never]:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
  },
  actionDanger: {
    width: "100%",
    textAlign: "left",
    borderRadius: 18,
    border: "1px solid var(--sheet-btn-border, rgba(255,255,255,0.4))",
    background:
      "var(--sheet-btn-bg, linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%))",
    boxShadow:
      "var(--sheet-btn-shadow, 0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25))",
    color: "var(--sheet-btn-color, rgba(180,35,24,0.95))",
    minHeight: 58,
    padding: "16px 14px",
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
    ["--sheet-btn-bg" as never]:
      "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    ["--sheet-btn-border" as never]: "rgba(255,255,255,0.4)",
    ["--sheet-btn-color" as never]: "rgba(180,35,24,0.95)",
    ["--sheet-btn-shadow" as never]:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
  },
  back: {
    width: "100%",
    textAlign: "center",
    borderRadius: 18,
    border: "1px solid var(--sheet-btn-border, rgba(255,255,255,0.4))",
    background:
      "var(--sheet-btn-bg, linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%))",
    boxShadow:
      "var(--sheet-btn-shadow, 0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25))",
    color: "var(--sheet-btn-color, #1e1f22)",
    minHeight: 58,
    padding: "16px 14px",
    fontSize: 18,
    fontWeight: 500,
    cursor: "pointer",
    ["--sheet-btn-bg" as never]:
      "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    ["--sheet-btn-border" as never]: "rgba(255,255,255,0.4)",
    ["--sheet-btn-color" as never]: "#1e1f22",
    ["--sheet-btn-shadow" as never]:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
  },
  hint: {
    fontSize: 14,
    lineHeight: 1.35,
    color: workoutTheme.textSecondary,
    padding: "2px 2px 6px",
  },
  error: {
    fontSize: 13,
    lineHeight: 1.35,
    color: workoutTheme.danger,
    padding: "4px 2px",
  },
  altTitle: {
    fontSize: 18,
    fontWeight: 500,
    color: "currentColor",
    lineHeight: 1.25,
  },
  altHint: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: 500,
    color: workoutTheme.textMuted,
  },
};

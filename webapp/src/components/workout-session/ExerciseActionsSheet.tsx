import type { CSSProperties } from "react";
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

  if (!state || !item) return null;

  const renderContent = () => {
    if (state.mode === "menu") {
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

    if (state.mode === "replace") {
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

    if (state.mode === "confirm_skip") {
      return (
        <>
          <div style={s.hint}>Пропустить «{item.name}» в этой тренировке?</div>
          <button type="button" className="ws-sheet-btn" style={s.actionDanger} onClick={onSkip}>
            Да, пропустить
          </button>
          <button type="button" className="ws-sheet-btn" style={s.back} onClick={onBackMenu}>
            Отмена
          </button>
        </>
      );
    }

    if (state.mode === "confirm_remove") {
      return (
        <>
          <div style={s.hint}>Удалить «{item.name}» из этой тренировки?</div>
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
        <div style={s.hint}>Исключить «{item.name}» из будущих планов?</div>
        <button type="button" className="ws-sheet-btn" style={s.actionDanger} onClick={onBan} disabled={loading}>
          {loading ? "Сохраняем..." : "Исключить"}
        </button>
        <button type="button" className="ws-sheet-btn" style={s.back} onClick={onBackMenu}>
          Отмена
        </button>
      </>
    );
  };

  return (
    <>
      <style>{sheetButtonCss}</style>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
          <div style={s.grabber} />
          <div style={s.title}>{item.name}</div>
          <div style={s.content}>{renderContent()}</div>
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
  @media (prefers-reduced-motion: reduce) {
    .ws-sheet-btn { transition: none !important; }
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
  },
  sheet: {
    borderRadius: "24px 24px 0 0",
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
    display: "grid",
    gap: 10,
    maxHeight: "74vh",
    overflowY: "auto",
  },
  grabber: {
    width: 46,
    height: 5,
    borderRadius: 999,
    background: "rgba(15,23,42,0.16)",
    justifySelf: "center",
    marginTop: 4,
  },
  title: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
  },
  content: {
    display: "grid",
    gap: 8,
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

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
          <button type="button" style={s.action} onClick={onLoadAlternatives}>
            Заменить упражнение
          </button>
          <button type="button" style={s.action} onClick={onAskSkip}>
            Пропустить упражнение
          </button>
          <button type="button" style={s.action} onClick={onAskRemove}>
            Удалить упражнение
          </button>
          <button type="button" style={s.actionDanger} onClick={onAskBan}>
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
                <button key={alt.exerciseId} type="button" style={s.action} onClick={() => onReplace(alt)}>
                  <div style={s.altTitle}>{alt.name}</div>
                  {alt.hint ? <div style={s.altHint}>{alt.hint}</div> : null}
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" style={s.back} onClick={onBackMenu}>
            Назад
          </button>
        </>
      );
    }

    if (state.mode === "confirm_skip") {
      return (
        <>
          <div style={s.hint}>Пропустить «{item.name}» в этой тренировке?</div>
          <button type="button" style={s.actionDanger} onClick={onSkip}>
            Да, пропустить
          </button>
          <button type="button" style={s.back} onClick={onBackMenu}>
            Отмена
          </button>
        </>
      );
    }

    if (state.mode === "confirm_remove") {
      return (
        <>
          <div style={s.hint}>Удалить «{item.name}» из этой тренировки?</div>
          <button type="button" style={s.actionDanger} onClick={onRemove}>
            Да, удалить
          </button>
          <button type="button" style={s.back} onClick={onBackMenu}>
            Отмена
          </button>
        </>
      );
    }

    return (
      <>
        <div style={s.hint}>Исключить «{item.name}» из будущих планов?</div>
        <button type="button" style={s.actionDanger} onClick={onBan} disabled={loading}>
          {loading ? "Сохраняем..." : "Исключить"}
        </button>
        <button type="button" style={s.back} onClick={onBackMenu}>
          Отмена
        </button>
      </>
    );
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={s.grabber} />
        <div style={s.title}>{item.name}</div>
        <div style={s.content}>{renderContent()}</div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 70,
    display: "grid",
    alignItems: "end",
    background: "rgba(10,16,28,0.38)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  },
  sheet: {
    borderRadius: "22px 22px 0 0",
    borderTop: "1px solid rgba(255,255,255,0.45)",
    background: workoutTheme.cardBg,
    boxShadow: "0 -12px 26px rgba(10,16,28,0.2)",
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
    background: "rgba(17,24,39,0.2)",
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
    borderRadius: 14,
    border: workoutTheme.pillBorder,
    background: "rgba(255,255,255,0.74)",
    color: workoutTheme.textPrimary,
    minHeight: 48,
    padding: "12px 14px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  actionDanger: {
    width: "100%",
    textAlign: "left",
    borderRadius: 14,
    border: "1px solid rgba(226,76,75,0.35)",
    background: "rgba(226,76,75,0.12)",
    color: "#9d2f2f",
    minHeight: 48,
    padding: "12px 14px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  back: {
    width: "100%",
    borderRadius: 14,
    border: workoutTheme.pillBorder,
    background: "transparent",
    color: workoutTheme.textSecondary,
    minHeight: 44,
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
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
    fontSize: 15,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
    lineHeight: 1.25,
  },
  altHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: 500,
    color: workoutTheme.textMuted,
  },
};


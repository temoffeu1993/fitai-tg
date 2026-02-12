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
  restEnabled: boolean;
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
  onToggleRestEnabled: () => void;
};

export default function ExerciseActionsSheet(props: Props) {
  const {
    state,
    item,
    alts,
    loading,
    error,
    restEnabled,
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
    onToggleRestEnabled,
  } = props;

  if (!state || !item) return null;

  const renderContent = () => {
    if (state.mode === "menu") {
      return (
        <>
          <div style={s.restRow}>
            <span style={s.restLabel}>Авто-таймер отдыха</span>
            <button
              type="button"
              style={{ ...s.restToggle, ...(restEnabled ? s.restToggleOn : null) }}
              onClick={onToggleRestEnabled}
            >
              {restEnabled ? "Вкл" : "Выкл"}
            </button>
          </div>
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
    background: workoutTheme.overlay,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  sheet: {
    borderRadius: "22px 22px 0 0",
    borderTop: "1px solid rgba(255,255,255,0.75)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(245,245,250,0.4) 100%)",
    boxShadow:
      "0 -12px 26px rgba(10,16,28,0.2), inset 0 1px 0 rgba(255,255,255,0.88)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
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
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.78)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.72) 100%)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.88), 0 2px 6px rgba(15,23,42,0.08)",
    color: workoutTheme.textPrimary,
    minHeight: 50,
    padding: "12px 14px",
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
  },
  actionDanger: {
    width: "100%",
    textAlign: "left",
    borderRadius: 14,
    border: "1px solid rgba(180,35,24,0.18)",
    background: "rgba(255,255,255,0.72)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.86), 0 2px 6px rgba(15,23,42,0.06)",
    color: "rgba(180,35,24,0.95)",
    minHeight: 50,
    padding: "12px 14px",
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
  },
  back: {
    width: "100%",
    borderRadius: 999,
    border: "none",
    background: "transparent",
    color: "rgba(15,23,42,0.6)",
    minHeight: 44,
    padding: "10px 12px",
    fontSize: 15,
    fontWeight: 500,
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
  restRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "6px 2px",
  },
  restLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: workoutTheme.textSecondary,
  },
  restToggle: {
    minHeight: 32,
    minWidth: 58,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    fontSize: 12,
    fontWeight: 700,
    padding: "0 12px",
    cursor: "pointer",
  },
  restToggleOn: {
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,0.24)",
  },
};

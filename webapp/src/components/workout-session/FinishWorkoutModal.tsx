import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";

type Props = {
  open: boolean;
  durationMin: string;
  startedAt: string;
  saving: boolean;
  error: string | null;
  onChangeDuration: (v: string) => void;
  onChangeStartedAt: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function FinishWorkoutModal(props: Props) {
  const {
    open,
    durationMin,
    startedAt,
    saving,
    error,
    onChangeDuration,
    onChangeStartedAt,
    onCancel,
    onSubmit,
  } = props;

  if (!open) return null;

  return (
    <div style={s.overlay} onClick={onCancel}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        <h3 style={s.title}>Завершить тренировку</h3>
        <label style={s.label}>
          <span style={s.labelText}>Начало тренировки</span>
          <input
            type="datetime-local"
            style={s.input}
            value={startedAt}
            onChange={(e) => onChangeStartedAt(e.target.value)}
            disabled={saving}
          />
        </label>
        <label style={s.label}>
          <span style={s.labelText}>Длительность (мин)</span>
          <input
            inputMode="numeric"
            style={s.input}
            value={durationMin}
            onChange={(e) => onChangeDuration(e.target.value)}
            disabled={saving}
          />
        </label>

        {error ? <div style={s.error}>{error}</div> : null}
        <div style={s.row}>
          <button type="button" style={s.cancel} onClick={onCancel} disabled={saving}>
            Отмена
          </button>
          <button type="button" style={s.submit} onClick={onSubmit} disabled={saving}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: workoutTheme.overlayStrong,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  card: {
    width: "min(92vw, 420px)",
    borderRadius: 24,
    border: workoutTheme.cardBorder,
    background: workoutTheme.cardBg,
    boxShadow: workoutTheme.cardShadow,
    padding: 18,
    display: "grid",
    gap: 10,
  },
  title: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.2,
    fontWeight: 700,
    color: workoutTheme.textPrimary,
  },
  label: {
    display: "grid",
    gap: 6,
  },
  labelText: {
    fontSize: 12,
    lineHeight: 1.2,
    color: workoutTheme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,250,252,0.94) 100%)",
    color: workoutTheme.textPrimary,
    padding: "0 12px",
    fontSize: 15,
    fontWeight: 500,
    boxSizing: "border-box",
    outline: "none",
    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.08)",
  },
  error: {
    fontSize: 13,
    lineHeight: 1.35,
    color: workoutTheme.danger,
    fontWeight: 600,
  },
  row: {
    marginTop: 4,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  cancel: {
    minHeight: 46,
    borderRadius: 999,
    border: "none",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    color: workoutTheme.textSecondary,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  submit: {
    minHeight: 46,
    borderRadius: 999,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
  },
};

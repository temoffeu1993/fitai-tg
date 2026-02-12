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
    background: "rgba(10,16,28,0.45)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  card: {
    width: "min(92vw, 420px)",
    borderRadius: 22,
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
    fontWeight: 800,
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
    minHeight: 44,
    borderRadius: 12,
    border: "1px solid rgba(17,24,39,0.14)",
    background: "rgba(255,255,255,0.86)",
    color: workoutTheme.textPrimary,
    padding: "0 12px",
    fontSize: 15,
    fontWeight: 600,
    boxSizing: "border-box",
    outline: "none",
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
    minHeight: 44,
    borderRadius: 12,
    border: workoutTheme.pillBorder,
    background: "transparent",
    color: workoutTheme.textSecondary,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  submit: {
    minHeight: 44,
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
};


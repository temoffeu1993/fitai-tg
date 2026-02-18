import type { CSSProperties } from "react";
import { workoutTheme } from "./theme";

const RPE_OPTIONS: Array<{ value: number; emoji: string; label: string }> = [
  { value: 5,  emoji: "😴", label: "Легко" },
  { value: 6,  emoji: "🙂", label: "Умеренно" },
  { value: 7,  emoji: "💪", label: "Рабочий" },
  { value: 8,  emoji: "😮‍💨", label: "Тяжеловато" },
  { value: 9,  emoji: "😵", label: "Тяжело" },
  { value: 10, emoji: "🥵", label: "Предел" },
];

type Props = {
  open: boolean;
  durationMin: string;
  startedAt: string;
  sessionRpe: number | null;
  saving: boolean;
  error: string | null;
  onChangeDuration: (v: string) => void;
  onChangeStartedAt: (v: string) => void;
  onChangeSessionRpe: (v: number) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function FinishWorkoutModal(props: Props) {
  const {
    open,
    durationMin,
    startedAt,
    sessionRpe,
    saving,
    error,
    onChangeDuration,
    onChangeStartedAt,
    onChangeSessionRpe,
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

        {/* Session RPE selector */}
        <div style={s.label}>
          <span style={s.labelText}>Общая нагрузка тренировки</span>
          <div style={s.rpeRow}>
            {RPE_OPTIONS.map((opt) => {
              const selected = sessionRpe === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={saving}
                  style={{
                    ...s.rpeBtn,
                    ...(selected ? s.rpeBtnSelected : {}),
                  }}
                  onClick={() => onChangeSessionRpe(opt.value)}
                  title={opt.label}
                >
                  <span style={s.rpeEmoji}>{opt.emoji}</span>
                  <span style={{ ...s.rpeLabel, ...(selected ? s.rpeLabelSelected : {}) }}>
                    {opt.value}
                  </span>
                </button>
              );
            })}
          </div>
          {sessionRpe != null && (
            <span style={s.rpeHint}>
              {RPE_OPTIONS.find((o) => o.value === sessionRpe)?.label ?? ""}
            </span>
          )}
        </div>

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
  rpeRow: {
    display: "flex",
    gap: 4,
  },
  rpeBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.08)",
    background: workoutTheme.pillBg,
    boxShadow: workoutTheme.pillShadow,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: "6px 2px",
    WebkitTapHighlightColor: "transparent",
    transition: "background 160ms ease, box-shadow 160ms ease",
  } as CSSProperties,
  rpeBtnSelected: {
    background: "linear-gradient(135deg, rgba(196,228,178,0.55) 0%, rgba(196,228,178,0.35) 100%)",
    border: "1px solid rgba(100,180,60,0.35)",
    boxShadow: "0 2px 8px rgba(100,180,60,0.18), inset 0 1px 0 rgba(255,255,255,0.8)",
  } as CSSProperties,
  rpeEmoji: {
    fontSize: 18,
    lineHeight: 1,
  },
  rpeLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: workoutTheme.textMuted,
    lineHeight: 1,
  },
  rpeLabelSelected: {
    color: workoutTheme.textPrimary,
  },
  rpeHint: {
    fontSize: 12,
    fontWeight: 500,
    color: workoutTheme.textSecondary,
    textAlign: "center" as const,
    lineHeight: 1.3,
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

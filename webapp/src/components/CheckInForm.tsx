import React, { useMemo, useState } from "react";
import type { CheckInPayload } from "@/api/plan";

type Props = {
  onSubmit: (data: CheckInPayload) => Promise<void> | void;
  onSkip: () => void;
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
};

const chipStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#fff",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  cursor: "pointer",
  fontSize: 14,
};

const chipActive: React.CSSProperties = {
  ...chipStyle,
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
};

export function CheckInForm({ onSubmit, onSkip, open, loading, error, onClose }: Props) {
  const [sleepHours, setSleepHours] = useState<number>(7);
  const [energyLevel, setEnergyLevel] = useState<CheckInPayload["energyLevel"]>("medium");
  const [stressLevel, setStressLevel] = useState<CheckInPayload["stressLevel"]>("medium");
  const [sleepQuality, setSleepQuality] = useState<CheckInPayload["sleepQuality"]>("good");
  const [motivation, setMotivation] = useState<CheckInPayload["motivation"]>("medium");
  const [mood, setMood] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [injuries, setInjuries] = useState<string[]>([]);
  const [newInjury, setNewInjury] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const sliderLabel = useMemo(() => {
    if (sleepHours >= 8) return "Выспался";
    if (sleepHours >= 6.5) return "Нормально";
    return "Мало сна";
  }, [sleepHours]);

  if (!open) return null;

  const handleAddInjury = () => {
    const v = newInjury.trim();
    if (!v) return;
    if (injuries.includes(v)) return;
    setInjuries([...injuries, v]);
    setNewInjury("");
  };

  const handleSubmit = async () => {
    setFormError(null);
    const payload: CheckInPayload = {
      sleepHours,
      energyLevel,
      stressLevel,
      sleepQuality,
      motivation,
      mood: mood.trim() || undefined,
      injuries: injuries.length ? injuries : undefined,
      notes: notes.trim() || undefined,
    };

    try {
      await onSubmit(payload);
    } catch (err: any) {
      const msg =
        typeof err?.message === "string"
          ? err.message
          : "Не удалось сохранить самочувствие. Попробуй ещё раз.";
      setFormError(msg);
    }
  };

  return (
    <div style={modal.wrap} role="dialog" aria-modal="true">
      <div style={modal.card}>
        <div style={modal.header}>
          <div style={modal.title}>Как ты сегодня? 💬</div>
          <button style={modal.close} onClick={onClose || onSkip} type="button">
            ✕
          </button>
        </div>

        <div style={modal.body}>
          <label style={modal.label}>
            <div style={modal.labelText}>Сон</div>
            <input
              type="range"
              min={3}
              max={12}
              step={0.5}
              value={sleepHours}
              onChange={(e) => setSleepHours(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={modal.subLabel}>
              {sleepHours} ч · {sliderLabel}
            </div>
          </label>

          <div style={modal.groupTitle}>Энергия</div>
          <div style={modal.chips}>
            {(["low", "medium", "high"] as const).map((val) => (
              <button
                key={val}
                style={energyLevel === val ? chipActive : chipStyle}
                onClick={() => setEnergyLevel(val)}
                type="button"
              >
                {val === "low" ? "🥱 Низкая" : val === "medium" ? "😊 Средняя" : "🔥 Высокая"}
              </button>
            ))}
          </div>

          <button
            type="button"
            style={modal.advancedToggle}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Скрыть детали" : "Уточнить детали"}
          </button>

          {showAdvanced && (
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div style={modal.groupTitle}>Стресс</div>
                <div style={modal.chips}>
                  {(["low", "medium", "high", "very_high"] as const).map((val) => (
                    <button
                      key={val}
                      style={stressLevel === val ? chipActive : chipStyle}
                      onClick={() => setStressLevel(val)}
                      type="button"
                    >
                      {{
                        low: "Низкий",
                        medium: "Средний",
                        high: "Высокий",
                        very_high: "Очень высокий",
                      }[val]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={modal.groupTitle}>Качество сна</div>
                <div style={modal.chips}>
                  {(["poor", "fair", "good", "excellent"] as const).map((val) => (
                    <button
                      key={val}
                      style={sleepQuality === val ? chipActive : chipStyle}
                      onClick={() => setSleepQuality(val)}
                      type="button"
                    >
                      {{
                        poor: "Плохое",
                        fair: "Так себе",
                        good: "Хорошее",
                        excellent: "Отличное",
                      }[val]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={modal.groupTitle}>Травмы/боли</div>
                {injuries.length > 0 && (
                  <div style={modal.tagRow}>
                    {injuries.map((item) => (
                      <span key={item} style={modal.tag}>
                        {item}
                        <button
                          type="button"
                          style={modal.tagClose}
                          onClick={() => setInjuries(injuries.filter((x) => x !== item))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input
                    style={modal.input}
                    placeholder="Например: боль в колене"
                    value={newInjury}
                    onChange={(e) => setNewInjury(e.target.value)}
                  />
                  <button type="button" style={modal.smallBtn} onClick={handleAddInjury}>
                    + добавить
                  </button>
                </div>
              </div>

              <div>
                <div style={modal.groupTitle}>Мотивация</div>
                <div style={modal.chips}>
                  {(["low", "medium", "high"] as const).map((val) => (
                    <button
                      key={val}
                      style={motivation === val ? chipActive : chipStyle}
                      onClick={() => setMotivation(val)}
                      type="button"
                    >
                      {{
                        low: "Низкая",
                        medium: "Средняя",
                        high: "Высокая",
                      }[val]}
                    </button>
                  ))}
                </div>
              </div>

              <label style={modal.label}>
                <div style={modal.labelText}>Настроение</div>
                <input
                  style={modal.input}
                  placeholder="Например: бодрость, усталость"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                />
              </label>

              <label style={modal.label}>
                <div style={modal.labelText}>Комментарий</div>
                <textarea
                  style={{ ...modal.input, minHeight: 72, resize: "vertical" }}
                  placeholder="Свободная заметка о самочувствии"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          )}

          {(error || formError) && (
            <div style={modal.error}>{error || formError}</div>
          )}
        </div>

        <div style={modal.footer}>
          <button style={modal.ghostBtn} onClick={onSkip} type="button" disabled={loading}>
            Пропустить
          </button>
          <button style={modal.save} onClick={handleSubmit} type="button" disabled={loading}>
            {loading ? "Сохраняем..." : "Сохранить и сгенерировать"}
          </button>
        </div>
      </div>
    </div>
  );
}

const modal: Record<string, React.CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 9999,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    overflow: "hidden",
  },
  header: {
    padding: "16px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },
  title: { fontSize: 18, fontWeight: 700 },
  close: {
    border: "none",
    background: "transparent",
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
  },
  body: { padding: "14px 18px", display: "grid", gap: 12, maxHeight: "65vh", overflowY: "auto" },
  label: { display: "grid", gap: 6 },
  labelText: { fontSize: 13, opacity: 0.7 },
  subLabel: { fontSize: 13, opacity: 0.8, marginTop: 2 },
  input: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    padding: "12px 12px",
    fontSize: 15,
    background: "#f9fafb",
  },
  groupTitle: { fontSize: 14, fontWeight: 700, marginBottom: 6 },
  chips: { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" },
  advancedToggle: {
    border: "none",
    background: "rgba(0,0,0,0.05)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 600,
  },
  tagRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 },
  tag: {
    padding: "6px 10px",
    background: "rgba(0,0,0,0.05)",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  tagClose: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
  },
  footer: {
    padding: "12px 18px 16px",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    borderTop: "1px solid rgba(0,0,0,0.06)",
  },
  ghostBtn: {
    borderRadius: 12,
    padding: "12px 14px",
    border: "1px solid rgba(0,0,0,0.12)",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  save: {
    borderRadius: 12,
    padding: "12px 14px",
    border: "none",
    background: "linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b)",
    color: "#000",
    fontWeight: 800,
    cursor: "pointer",
  },
  smallBtn: {
    borderRadius: 10,
    padding: "10px 12px",
    border: "1px solid rgba(0,0,0,0.1)",
    background: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  error: {
    background: "rgba(255,0,0,0.07)",
    color: "#a12020",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    border: "1px solid rgba(161,32,32,0.2)",
  },
};

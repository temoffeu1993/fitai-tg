import React, { useMemo, useState } from "react";
import type { CheckInPayload } from "@/api/plan";

type Props = {
  onSubmit: (data: CheckInPayload) => Promise<void> | void;
  onSkip?: () => void;
  open?: boolean;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
  inline?: boolean;
  showSkip?: boolean;
  title?: string;
  submitLabel?: string;
};

const chipStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
  background: "rgba(255,255,255,0.6)",
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  cursor: "pointer",
  fontSize: 14,
  transition: "all .15s ease",
};

const chipActive: React.CSSProperties = {
  ...chipStyle,
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
};

export function CheckInForm({
  onSubmit,
  onSkip,
  open = true,
  loading,
  error,
  onClose,
  inline = false,
  showSkip = true,
  title,
  submitLabel,
}: Props) {
  const [sleepHours, setSleepHours] = useState<number>(7);
  const [energyLevel, setEnergyLevel] = useState<CheckInPayload["energyLevel"]>("medium");
  const [stressLevel, setStressLevel] = useState<CheckInPayload["stressLevel"]>("medium");
  const sleepQualityScale: CheckInPayload["sleepQuality"][] = ["poor", "fair", "good", "excellent"];
  const [sleepQuality, setSleepQuality] = useState<CheckInPayload["sleepQuality"]>("good");
  const sleepQualityIndex = sleepQualityScale.indexOf(sleepQuality);
  const [motivation, setMotivation] = useState<CheckInPayload["motivation"]>("medium");
  const [mood, setMood] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [injuries, setInjuries] = useState<string[]>([]);
  const [newInjury, setNewInjury] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [availableMinutes, setAvailableMinutes] = useState<number>(60);

  const sliderLabel = useMemo(() => {
    if (sleepHours >= 8) return "Выспался";
    if (sleepHours < 6) return "Мало сна";
    return "Нормально";
  }, [sleepHours]);

  const shouldRender = inline || open;
  if (!shouldRender) return null;

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
      availableMinutes,
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

  const wrapperStyle = inline ? modal.inlineWrap : modal.wrap;
  const cardStyle = inline
    ? modal.inlineCard
    : modal.card;
  const footerStyle = inline
    ? { ...modal.footerInline, gridTemplateColumns: showSkip ? "1fr 1fr" : "1fr" }
    : modal.footer;

  return (
    <div style={wrapperStyle} role={inline ? undefined : "dialog"} aria-modal={inline ? undefined : "true"}>
      <div style={cardStyle}>
        {!inline && (
          <div style={modal.header}>
            <div style={modal.title}>{title || "Как ты сегодня? 💬"}</div>
            {(onClose || onSkip) ? (
              <button style={modal.close} onClick={onClose || onSkip} type="button">
                ✕
              </button>
            ) : null}
          </div>
        )}

        <div style={modal.bodyInline}>
          <div style={modal.cardMini}>
            <div style={modal.cardMiniTitle}>😴 Сон</div>
            <input
              type="range"
              min={5}
              max={9}
              step={1}
              value={sleepHours}
              onChange={(e) => setSleepHours(Number(e.target.value))}
              style={{ width: "100%" }}
              className="checkin-slider ticks-5"
              list="sleepTicks"
            />
            <div style={modal.subLabel}>
              {sleepHours} ч · {sliderLabel}
            </div>
            <datalist id="sleepTicks">
              <option value="5" />
              <option value="6" />
              <option value="7" />
              <option value="8" />
              <option value="9" />
            </datalist>
          </div>

          <div style={modal.cardMini}>
            <div style={modal.cardMiniTitle}>🌙 Качество сна</div>
            <input
              type="range"
              min={0}
              max={3}
              step={1}
              value={sleepQualityIndex < 0 ? 2 : sleepQualityIndex}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setSleepQuality(sleepQualityScale[idx] || "good");
              }}
              style={{ width: "100%" }}
              className="checkin-slider ticks-4"
              list="sleepQualityTicks"
            />
            <div style={modal.subLabel}>
              {{
                0: "Плохое",
                1: "Так себе",
                2: "Хорошее",
                3: "Отличное",
              }[String(sleepQualityIndex < 0 ? 2 : sleepQualityIndex) as "0" | "1" | "2" | "3"]}
            </div>
            <datalist id="sleepQualityTicks">
              <option value="0" label="Плохое" />
              <option value="1" label="Так себе" />
              <option value="2" label="Хорошее" />
              <option value="3" label="Отличное" />
            </datalist>
          </div>

          <div style={modal.cardWide}>
            <div style={modal.cardMiniTitle}>⏱️ Время на тренировку</div>
            <input
              type="number"
              min={20}
              max={180}
              step={5}
              style={modal.inputGlass}
              value={availableMinutes}
              onChange={(e) => setAvailableMinutes(Number(e.target.value))}
              placeholder="60–90"
            />
          </div>

          <div style={modal.cardWide}>
            <div style={modal.groupTitle}>⚡ Энергия</div>
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
              <div style={modal.cardWide}>
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

              <div style={modal.cardWide}>
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

              <div style={modal.cardWide}>
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
                    style={modal.inputGlass}
                    placeholder="Например: боль в колене"
                    value={newInjury}
                    onChange={(e) => setNewInjury(e.target.value)}
                  />
                  <button type="button" style={modal.smallBtn} onClick={handleAddInjury}>
                    + добавить
                  </button>
                </div>
              </div>

              <div style={modal.cardWide}>
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

              <div style={modal.cardWide}>
                <div style={modal.groupTitle}>Настроение</div>
                <input
                  style={modal.inputGlass}
                  placeholder="Например: бодрость, усталость"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                />
              </div>

              <div style={modal.cardWide}>
                <div style={modal.groupTitle}>Комментарий</div>
                <textarea
                  style={{ ...modal.inputGlass, minHeight: 72, resize: "vertical" }}
                  placeholder="Свободная заметка о самочувствии"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {(error || formError) && (
            <div style={modal.error}>{error || formError}</div>
          )}
        </div>

        <div style={footerStyle}>
          {showSkip && onSkip ? (
            <button style={modal.ghostBtn} onClick={onSkip} type="button" disabled={loading}>
              Пропустить
            </button>
          ) : null}
          <button style={modal.save} onClick={handleSubmit} type="button" disabled={loading}>
            {loading ? "Сохраняем..." : submitLabel || "Сгенерировать тренировку"}
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
  inlineWrap: {
    position: "relative",
    background: "transparent",
    display: "block",
  },
  inlineCard: {
    width: "100%",
    background: "transparent",
    borderRadius: 16,
    padding: 0,
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
  bodyInline: { padding: "0", display: "grid", gap: 12 },
  label: { display: "grid", gap: 6 },
  labelText: { fontSize: 13, opacity: 0.7 },
  subLabel: { fontSize: 13, opacity: 0.8, marginTop: 2 },
  inputGlass: {
    width: "100%",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    padding: "12px 12px",
    fontSize: 15,
    background: "rgba(255,255,255,0.55)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  cardMini: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.58)",
    border: "1px solid rgba(0,0,0,0.05)",
    boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
    display: "grid",
    gap: 8,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  cardMiniTitle: {
    fontSize: 13,
    opacity: 0.8,
    marginBottom: 2,
    fontWeight: 700,
  },
  grid2: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
  },
  cardWide: {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.58)",
    border: "1px solid rgba(0,0,0,0.05)",
    boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
    display: "grid",
    gap: 10,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  sliderBase: {
    width: "100%",
    accentColor: "#0f172a",
    background: "transparent",
    height: 32,
    padding: 0,
    margin: 0,
  },
  sliderTicks5: {
    backgroundImage:
      "radial-gradient(circle, rgba(15,23,42,0.9) 0, rgba(15,23,42,0.9) 40%, transparent 45%), linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55))",
    backgroundSize: "25% 60%, 100% 4px",
    backgroundPosition: "0 50%, 0 50%",
    backgroundRepeat: "repeat-x, no-repeat",
    borderRadius: 999,
  },
  sliderTicks4: {
    backgroundImage:
      "radial-gradient(circle, rgba(15,23,42,0.9) 0, rgba(15,23,42,0.9) 40%, transparent 45%), linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55))",
    backgroundSize: "33.333% 60%, 100% 4px",
    backgroundPosition: "0 50%, 0 50%",
    backgroundRepeat: "repeat-x, no-repeat",
    borderRadius: 999,
  },
  groupTitle: { fontSize: 14, fontWeight: 700, marginBottom: 6 },
  chips: { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" },
  advancedToggle: {
    border: "none",
    background: "rgba(0,0,0,0.04)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 700,
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
  footerInline: {
    padding: "0",
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
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
    borderRadius: 16,
    padding: "14px 18px",
    border: "none",
    background: "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)",
    color: "#000",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
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

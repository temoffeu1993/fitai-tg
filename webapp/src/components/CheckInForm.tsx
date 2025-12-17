import React, { useState } from "react";
import type { CheckInPayload, SleepQuality, PainLocation } from "@/api/plan";

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
  whiteSpace: "nowrap",
};

const chipActive: React.CSSProperties = {
  ...chipStyle,
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
};

const sliderCss = `
.checkin-slider {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 44px;
  background: transparent;
  cursor: pointer;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  padding: 12px 0;
}
.checkin-slider::-webkit-slider-runnable-track {
  height: 4px;
  background: transparent;
  border-radius: 999px;
}
.checkin-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.12);
  box-shadow: 0 3px 10px rgba(0,0,0,0.16);
  margin-top: -10px;
  transition: transform 80ms ease, box-shadow 80ms ease;
}
.checkin-slider::-moz-range-track {
  height: 4px;
  background: transparent;
  border-radius: 999px;
}
.checkin-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.12);
  box-shadow: 0 3px 10px rgba(0,0,0,0.16);
  transition: transform 80ms ease, box-shadow 80ms ease;
}
`;

const PAIN_ZONES: Array<{ key: PainLocation; label: string }> = [
  { key: "shoulder", label: "Плечо" },
  { key: "elbow", label: "Локоть" },
  { key: "wrist", label: "Запястье / кисть" },
  { key: "neck", label: "Шея" },
  { key: "lower_back", label: "Поясница" },
  { key: "hip", label: "Тазобедренный сустав" },
  { key: "knee", label: "Колено" },
  { key: "ankle", label: "Голеностоп / стопа" },
];

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
  const [sleepQuality, setSleepQuality] = useState<SleepQuality>("ok");
  const [energyLevel, setEnergyLevel] = useState<CheckInPayload["energyLevel"]>("medium");
  const [stressLevel, setStressLevel] = useState<CheckInPayload["stressLevel"]>("medium");
  const [availableMinutes, setAvailableMinutes] = useState<number>(60);
  const [hasPain, setHasPain] = useState(false);
  const [painMap, setPainMap] = useState<Partial<Record<PainLocation, number>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const shouldRender = inline || open;
  if (!shouldRender) return null;

  const handleSubmit = async () => {
    setFormError(null);
    
    const pain = hasPain
      ? Object.entries(painMap)
          .map(([location, level]) => ({
            location: location as PainLocation,
            level: Number(level),
          }))
          .filter(p => Number.isFinite(p.level) && p.level >= 1 && p.level <= 10)
      : undefined;

    const payload: CheckInPayload = {
      sleepQuality,
      energyLevel,
      stressLevel,
      availableMinutes,
      pain: pain?.length ? pain : undefined,
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
  const cardStyle = inline ? modal.inlineCard : modal.card;
  const footerStyle = inline
    ? { ...modal.footerInline, gridTemplateColumns: showSkip ? "1fr 1fr" : "1fr" }
    : modal.footer;

  return (
    <div style={wrapperStyle} role={inline ? undefined : "dialog"} aria-modal={inline ? undefined : "true"}>
      <style>{sliderCss}</style>
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
          {/* 1. СОН (один вопрос, 5 чипов) */}
          <div style={modal.cardMini}>
            <div style={modal.cardMiniTitle}>😴 Как ты поспал?</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {(["poor", "fair", "ok", "good", "excellent"] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  style={sleepQuality === val ? chipActive : chipStyle}
                  onClick={() => setSleepQuality(val)}
                >
                  {val === "poor"
                    ? "Плохо"
                    : val === "fair"
                    ? "Так себе"
                    : val === "ok"
                    ? "Нормально"
                    : val === "good"
                    ? "Хорошо"
                    : "Отлично"}
                </button>
              ))}
            </div>
          </div>

          {/* 2. ЭНЕРГИЯ */}
          <div style={modal.cardMini}>
            <div style={modal.cardMiniTitle}>⚡ Энергия</div>
            <input
              type="range"
              min={0}
              max={2}
              step={1}
              value={["low", "medium", "high"].indexOf(energyLevel || "medium")}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setEnergyLevel((["low", "medium", "high"] as const)[idx] || "medium");
              }}
              style={{
                ...sliderStyle(0, 2, ["low", "medium", "high"].indexOf(energyLevel || "medium"), [0, 50, 100]),
                marginTop: 4,
              }}
              className="checkin-slider"
            />
            <div style={{ ...modal.subLabel, marginTop: 2 }}>
              {energyLevel === "low" ? "Низкая" : energyLevel === "medium" ? "Средняя" : "Высокая"}
            </div>
          </div>

          {/* 3. СТРЕСС */}
          <div style={modal.cardMini}>
            <div style={modal.cardMiniTitle}>😰 Стресс</div>
            <input
              type="range"
              min={0}
              max={3}
              step={1}
              value={["low", "medium", "high", "very_high"].indexOf(stressLevel || "medium")}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setStressLevel((["low", "medium", "high", "very_high"] as const)[idx] || "medium");
              }}
              style={{
                ...sliderStyle(
                  0,
                  3,
                  ["low", "medium", "high", "very_high"].indexOf(stressLevel || "medium"),
                  [0, 33.333, 66.666, 100]
                ),
                marginTop: 4,
              }}
              className="checkin-slider"
            />
            <div style={{ ...modal.subLabel, marginTop: 2 }}>
              {{
                low: "Низкий",
                medium: "Средний",
                high: "Высокий",
                very_high: "Очень высокий",
              }[stressLevel || "medium"]}
            </div>
          </div>

          {/* 4. ВРЕМЯ НА ТРЕНИРОВКУ */}
          <div style={modal.cardMini}>
            <div style={modal.cardMiniTitle}>⏱️ Время на тренировку</div>
            <input
              type="range"
              min={40}
              max={90}
              step={10}
              value={availableMinutes}
              onChange={(e) => setAvailableMinutes(Number(e.target.value))}
              style={{ ...sliderStyle(40, 90, availableMinutes, [0, 25, 50, 75, 100]), marginTop: 4 }}
              className="checkin-slider"
            />
            <div style={{ ...modal.subLabel, marginTop: 2 }}>{availableMinutes} мин</div>
          </div>

          {/* 5. БОЛЬ/ДИСКОМФОРТ (структурированная) */}
          <div style={modal.cardWide}>
            <div style={modal.groupTitle}>🩹 Есть боль/дискомфорт сегодня?</div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={!hasPain ? chipActive : chipStyle}
                onClick={() => {
                  setHasPain(false);
                  setPainMap({});
                }}
              >
                Нет
              </button>
              <button type="button" style={hasPain ? chipActive : chipStyle} onClick={() => setHasPain(true)}>
                Да
              </button>
            </div>

            {hasPain && (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                <div style={modal.chips}>
                  {PAIN_ZONES.map((z) => {
                    const active = painMap[z.key] != null;
                    return (
                      <button
                        key={z.key}
                        type="button"
                        style={active ? chipActive : chipStyle}
                        onClick={() => {
                          setPainMap((prev) => {
                            const next = { ...prev };
                            if (next[z.key] == null) next[z.key] = 5;
                            else delete next[z.key];
                            return next;
                          });
                        }}
                      >
                        {z.label}
                      </button>
                    );
                  })}
                </div>

                {Object.entries(painMap).map(([loc, level]) => {
                  const zone = PAIN_ZONES.find((z) => z.key === loc);
                  return (
                    <div key={loc} style={modal.cardMini}>
                      <div style={modal.cardMiniTitle}>{zone?.label || loc}</div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={level}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setPainMap((prev) => ({ ...prev, [loc]: v }));
                        }}
                        style={{
                          ...sliderStyle(1, 10, level, [0, 33.333, 66.666, 100]),
                          marginTop: 4,
                        }}
                        className="checkin-slider"
                      />
                      <div style={{ ...modal.subLabel, marginTop: 2 }}>
                        {level}/10 {level >= 4 ? "— адаптируем упражнения" : ""}
                      </div>
                    </div>
                  );
                })}

                <div style={{ ...modal.subLabel, opacity: 0.7, fontSize: 12 }}>
                  💡 Если уровень ≥ 4 — уберём упражнения, которые могут раздражать эти зоны
                </div>
              </div>
            )}
          </div>

          {(error || formError) && <div style={modal.error}>{error || formError}</div>}
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

// Helper function for slider styles
function sliderStyle(min: number, max: number, value: number, ticks: number[]): React.CSSProperties {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const tickImgs = ticks.map(() => `linear-gradient(to bottom, rgba(15,23,42,0.3) 0%, rgba(15,23,42,0.3) 100%)`);
  const bgImages = [
    `linear-gradient(to right, rgba(15,23,42,0.8) 0%, rgba(15,23,42,0.8) ${pct}%, rgba(15,23,42,0.18) ${pct}%, rgba(15,23,42,0.18) 100%)`,
    ...tickImgs,
  ].join(", ");
  const bgSizes = ["100% 4px", ...tickImgs.map(() => "1px 8px")].join(", ");
  const bgPositions = ["0 50%", ...ticks.map((p) => `${p}% 50%`)].join(", ");
  return {
    width: "100%",
    height: 28,
    backgroundImage: bgImages,
    backgroundSize: bgSizes,
    backgroundPosition: bgPositions,
    backgroundRepeat: "no-repeat",
    borderRadius: 999,
    cursor: "pointer",
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    padding: 0,
    margin: 0,
  };
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
  subLabel: { fontSize: 13, opacity: 0.8, marginTop: 1 },
  cardMini: {
    padding: 10,
    borderRadius: 14,
    background: "rgba(255,255,255,0.58)",
    border: "1px solid rgba(0,0,0,0.05)",
    boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
    display: "grid",
    gap: 4,
    minHeight: 82,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  cardMiniTitle: {
    fontSize: 13,
    opacity: 0.8,
    marginBottom: 0,
    fontWeight: 700,
  },
  cardWide: {
    padding: 10,
    borderRadius: 14,
    background: "rgba(255,255,255,0.58)",
    border: "1px solid rgba(0,0,0,0.05)",
    boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
    display: "grid",
    gap: 6,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  groupTitle: { fontSize: 14, fontWeight: 700, marginBottom: 6 },
  chips: { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))" },
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
    border: "1px solid #0f172a",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 8px 16px rgba(0,0,0,0.16)",
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

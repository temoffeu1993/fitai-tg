import React, { useLayoutEffect, useRef, useState } from "react";
import type { CheckInPayload, SleepQuality, PainLocation } from "@/api/plan";

type Props = {
  onSubmit: (data: CheckInPayload) => Promise<void> | void;
  onSkip?: () => void;
  open?: boolean;
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
  inline?: boolean;
  title?: string;
  submitLabel?: string;
  onBack?: () => void;
  backLabel?: string;
};

const chipStyle: React.CSSProperties = {
  padding: "14px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.06)",
  background: "rgba(255,255,255,0.6)",
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
  color: "#111827",
  transition: "all .15s ease",
  whiteSpace: "normal",
  wordBreak: "break-word",
  lineHeight: 1.2,
  textAlign: "center",
  minHeight: 62,
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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
.checkin-step-animate {
  animation: checkinStepIn 840ms cubic-bezier(.4,0,.2,1) both;
  will-change: transform, opacity;
  transform-origin: 50% 50%;
}
@keyframes checkinStepIn {
  0% { opacity: 0; transform: translateY(10px); }
  55% { opacity: 1; transform: translateY(0); }
  100% { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .checkin-step-animate { animation: none !important; }
}

.checkin-primary-btn,
.checkin-text-btn {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
}
.checkin-primary-btn {
  transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease, filter 160ms ease;
}
.checkin-primary-btn:active:not(:disabled) {
  transform: translateY(1px) scale(0.99) !important;
  background-color: #0b1220 !important;
  box-shadow: 0 6px 12px rgba(0,0,0,0.14) !important;
  filter: brightness(0.99) !important;
}
@media (hover: hover) {
  .checkin-primary-btn:hover:not(:disabled) {
    filter: brightness(1.03);
  }
}
.checkin-primary-btn:focus-visible {
  outline: 3px solid rgba(15, 23, 42, 0.18);
  outline-offset: 2px;
}
.checkin-text-btn {
  transition: color 160ms ease, transform 160ms ease;
}
.checkin-text-btn:active:not(:disabled) {
  transform: translateY(1px) !important;
  color: rgba(17,24,39,0.72) !important;
  background-color: transparent !important;
}
.checkin-text-btn:focus-visible {
  outline: 3px solid rgba(15, 23, 42, 0.12);
  outline-offset: 2px;
  border-radius: 12px;
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

function painImpact(level: number): { title: string; desc: string } {
  const v = Math.max(1, Math.min(10, Math.round(level)));
  // Эти пороги совпадают с текущей логикой в генерации:
  // 4+ → адаптация упражнений, 5-6 → облегчение, 7 → recovery, 8+ → skip.
  if (v >= 8) {
    return {
      title: "Очень сильная боль",
      desc: "Тренировка может быть небезопасна — скорее всего предложим отдых вместо занятия. Если боль острая/резкая — лучше не тренироваться.",
    };
  }
  if (v >= 7) {
    return {
      title: "Сильная боль",
      desc: "Переведём тренировку в восстановительный режим: меньше объёма и нагрузки, больше отдыха, только безопасные движения.",
    };
  }
  if (v >= 5) {
    return {
      title: "Боль заметная",
      desc: "Сделаем тренировку легче: меньше объёма и интенсивности, больше контроля и аккуратности в движениях.",
    };
  }
  if (v >= 4) {
    return {
      title: "Умеренная боль",
      desc: "Адаптируем упражнения: уберём движения, которые могут раздражать эту зону, и подберём более комфортные варианты.",
    };
  }
  return {
    title: "Лёгкий дискомфорт",
    desc: "Обычно оставляем тренировку как есть, но работаем в комфортной амплитуде и без нарастания боли.",
  };
}

export function CheckInForm({
  onSubmit,
  onSkip,
  open = true,
  loading,
  error,
  onClose,
  inline = false,
  title,
  submitLabel,
  onBack,
  backLabel,
}: Props) {
  const [sleepQuality, setSleepQuality] = useState<SleepQuality>("ok");
  const [energyLevel, setEnergyLevel] = useState<CheckInPayload["energyLevel"]>("medium");
  const [stressLevel, setStressLevel] = useState<CheckInPayload["stressLevel"]>("medium");
  const [availableMinutes, setAvailableMinutes] = useState<number>(60);
  const [hasPain, setHasPain] = useState(false);
  const [painMap, setPainMap] = useState<Partial<Record<PainLocation, number>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const stepCardRef = useRef<HTMLDivElement | null>(null);
  const measureRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [descMinHeightByStep, setDescMinHeightByStep] = useState<Record<number, number>>({});

  const sleepOptions = [
    { key: "poor" as const, label: "Плохо", desc: "Сон был прерывистым или коротким — восстановление слабое." },
    { key: "fair" as const, label: "Так себе", desc: "В целом спал, но бодрости меньше обычного." },
    { key: "ok" as const, label: "Нормально", desc: "Обычный сон — можно работать и тренироваться в привычном режиме." },
    { key: "good" as const, label: "Хорошо", desc: "Выспался — чувствуешь заметную бодрость и ясность." },
    { key: "excellent" as const, label: "Отлично", desc: "Полностью восстановился — максимум энергии и готовности." },
  ];
  const energyOptions = [
    { key: "low" as const, label: "Низкая", desc: "Сил мало — лучше держать умеренный темп и не форсировать." },
    { key: "medium" as const, label: "Средняя", desc: "Обычный уровень — стандартная тренировка должна зайти." },
    { key: "high" as const, label: "Высокая", desc: "Много сил — можно работать увереннее, сохраняя технику." },
  ];
  const stressOptions = [
    { key: "low" as const, label: "Низкий", desc: "Спокойно — нервная система не перегружена." },
    { key: "medium" as const, label: "Средний", desc: "Есть напряжение, но оно контролируемое." },
    { key: "high" as const, label: "Высокий", desc: "Сильно напряжён — лучше снизить интенсивность и объем." },
    { key: "very_high" as const, label: "Очень высокий", desc: "На пределе — бережёмся, фокус на восстановлении." },
  ];
  const sleepIndex = Math.max(0, sleepOptions.findIndex((o) => o.key === sleepQuality));
  const sleepOpt = sleepOptions[sleepIndex] || sleepOptions[2];

  const energyKey = energyLevel || "medium";
  const energyIndex = Math.max(0, energyOptions.findIndex((o) => o.key === energyKey));
  const energyOpt = energyOptions[energyIndex] || energyOptions[1];

  const stressKey = stressLevel || "medium";
  const stressIndex = Math.max(0, stressOptions.findIndex((o) => o.key === stressKey));
  const stressOpt = stressOptions[stressIndex] || stressOptions[1];

  const totalSteps = 5;
  const lastStep = totalSteps - 1;
  const isLastStep = step >= lastStep;

  const measureCount = step === 0 ? sleepOptions.length : step === 1 ? energyOptions.length : step === 2 ? stressOptions.length : 0;
  measureRefs.current.length = measureCount;

  useLayoutEffect(() => {
    if (measureCount === 0) return;

    const measure = () => {
      const heights = measureRefs.current.slice(0, measureCount).map((el) => (el ? el.offsetHeight : 0));
      const max = Math.max(0, ...heights);
      if (max <= 0) return;
      setDescMinHeightByStep((prev) => {
        const prevVal = prev[step] || 0;
        if (Math.abs(prevVal - max) < 1) return prev;
        return { ...prev, [step]: max };
      });
    };

    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && stepCardRef.current) {
      ro = new ResizeObserver(() => window.requestAnimationFrame(measure));
      ro.observe(stepCardRef.current);
    }
    return () => {
      ro?.disconnect();
    };
  }, [measureCount, step]);

  const descMinHeight = descMinHeightByStep[step] || 0;

  const shouldRender = inline || open;
  if (!shouldRender) return null;

  const handlePrimary = () => {
    if (loading) return;
    if (isLastStep) {
      void handleSubmit();
      return;
    }
    setStep((s) => Math.max(0, Math.min(lastStep, s + 1)));
  };

  const handleBackClick = () => {
    if (loading) return;
    if (step > 0) {
      setStep((s) => Math.max(0, s - 1));
      return;
    }
    const cb = onBack || onClose || onSkip;
    if (cb) cb();
    else window.history.back();
  };

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
  const footerStyle = inline ? modal.footerInline : modal.footer;

  const primaryLabel = isLastStep ? submitLabel || "Начать тренировку" : "Далее →";

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
          {step === 0 ? (
            <div ref={stepCardRef} style={modal.cardMini} className="checkin-step-animate" key={`step-${step}`}>
              <div style={modal.cardMiniTitle}>😴 Как ты поспал?</div>
              <div style={modal.value}>
                <div style={modal.valueTitle}>{sleepOpt.label}</div>
                <div style={{ ...modal.valueDesc, minHeight: descMinHeight || undefined }}>{sleepOpt.desc}</div>
              </div>
              <div aria-hidden style={modal.measureWrap}>
                {sleepOptions.map((o, i) => (
                  <div
                    key={o.key}
                    ref={(el) => {
                      measureRefs.current[i] = el;
                    }}
                    style={modal.valueDesc}
                  >
                    {o.desc}
                  </div>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={4}
                step={1}
                value={sleepIndex}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setSleepQuality(sleepOptions[idx]?.key || "ok");
                }}
                style={{ ...sliderStyle(0, 4, sleepIndex, [0, 25, 50, 75, 100]) }}
                className="checkin-slider"
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div ref={stepCardRef} style={modal.cardMini} className="checkin-step-animate" key={`step-${step}`}>
              <div style={modal.cardMiniTitle}>⚡ Энергия</div>
              <div style={modal.value}>
                <div style={modal.valueTitle}>{energyOpt.label}</div>
                <div style={{ ...modal.valueDesc, minHeight: descMinHeight || undefined }}>{energyOpt.desc}</div>
              </div>
              <div aria-hidden style={modal.measureWrap}>
                {energyOptions.map((o, i) => (
                  <div
                    key={o.key}
                    ref={(el) => {
                      measureRefs.current[i] = el;
                    }}
                    style={modal.valueDesc}
                  >
                    {o.desc}
                  </div>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={1}
                value={energyIndex}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setEnergyLevel(energyOptions[idx]?.key || "medium");
                }}
                style={{ ...sliderStyle(0, 2, energyIndex, [0, 50, 100]) }}
                className="checkin-slider"
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div ref={stepCardRef} style={modal.cardMini} className="checkin-step-animate" key={`step-${step}`}>
              <div style={modal.cardMiniTitle}>😰 Стресс</div>
              <div style={modal.value}>
                <div style={modal.valueTitle}>{stressOpt.label}</div>
                <div style={{ ...modal.valueDesc, minHeight: descMinHeight || undefined }}>{stressOpt.desc}</div>
              </div>
              <div aria-hidden style={modal.measureWrap}>
                {stressOptions.map((o, i) => (
                  <div
                    key={o.key}
                    ref={(el) => {
                      measureRefs.current[i] = el;
                    }}
                    style={modal.valueDesc}
                  >
                    {o.desc}
                  </div>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={stressIndex}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setStressLevel(stressOptions[idx]?.key || "medium");
                }}
                style={{ ...sliderStyle(0, 3, stressIndex, [0, 33.333, 66.666, 100]) }}
                className="checkin-slider"
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div ref={stepCardRef} style={modal.cardMini} className="checkin-step-animate" key={`step-${step}`}>
              <div style={modal.cardMiniTitle}>⏱️ Время на тренировку</div>
              <div style={modal.value}>
                <div style={modal.valueTitle}>{availableMinutes} мин</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[45, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    style={availableMinutes === m ? chipActive : chipStyle}
                    onClick={() => setAvailableMinutes(m)}
                  >
                    {m} мин
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step >= 4 ? (
            <div ref={stepCardRef} style={modal.cardWide} className="checkin-step-animate" key={`step-${step}`}>
              <div style={modal.groupTitle}>🩹 Есть боль/дискомфорт сегодня?</div>

              <div style={modal.binaryRow}>
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
                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  <div style={modal.chips}>
                    {PAIN_ZONES.map((z) => {
                      const active = painMap[z.key] != null;
                      const level = Number(painMap[z.key] ?? 5);
                      const impact = painImpact(level);
                      return (
                        <div key={z.key} style={modal.painZoneCell}>
                          <button
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

                          {active ? (
                            <div style={modal.painInline}>
                              <div style={modal.painInlineTitle}>Как сильно болит?</div>
                              <div style={modal.painInlineValue}>
                                <span style={modal.painInlineValueTitle}>
                                  {level}/10 — {impact.title}
                                </span>
                                <span style={modal.painInlineValueDesc}>{impact.desc}</span>
                              </div>
                              <input
                                type="range"
                                min={1}
                                max={10}
                                step={1}
                                value={level}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  setPainMap((prev) => ({ ...prev, [z.key]: v }));
                                }}
                                style={{ ...sliderStyle(1, 10, level, [0, 33.333, 66.666, 100]) }}
                                className="checkin-slider"
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {(error || formError) && <div style={modal.error}>{error || formError}</div>}
        </div>

        <div style={footerStyle}>
          <button
            style={{
              ...modal.save,
            }}
            onClick={handlePrimary}
            type="button"
            disabled={loading}
            className="checkin-primary-btn"
          >
            {loading && isLastStep ? "Сохраняем..." : primaryLabel}
          </button>
          <button
            style={modal.backTextBtn}
            onClick={handleBackClick}
            type="button"
            disabled={loading}
            className="checkin-text-btn"
          >
            {backLabel || "Назад"}
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
  bodyInline: { padding: "0", display: "grid", gap: 16 },
  subLabel: { fontSize: 14, opacity: 0.82, marginTop: 2, lineHeight: 1.35 },
  value: {
    display: "grid",
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  valueTitle: { fontSize: 17, fontWeight: 900, color: "#111827" },
  valueDesc: { fontSize: 14, color: "rgba(17,24,39,0.75)", lineHeight: 1.4 },
  measureWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    visibility: "hidden",
    pointerEvents: "none",
  },
  cardMini: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.58)",
    border: "1px solid rgba(0,0,0,0.05)",
    boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
    display: "grid",
    gap: 10,
    position: "relative",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  cardMiniTitle: {
    fontSize: 18,
    opacity: 0.92,
    marginBottom: 0,
    fontWeight: 900,
  },
  cardWide: {
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.58)",
    border: "1px solid rgba(0,0,0,0.05)",
    boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
    display: "grid",
    gap: 12,
    position: "relative",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  groupTitle: { fontSize: 18, fontWeight: 900, marginBottom: 4, opacity: 0.92 },
  binaryRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "stretch" },
  chips: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" },
  painZoneCell: { display: "grid", gap: 10, alignItems: "start" },
  painInline: {
    background: "rgba(255,255,255,0.6)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
    display: "grid",
    gap: 10,
  },
  painInlineTitle: { fontSize: 14, fontWeight: 900, opacity: 0.9 },
  painInlineValue: { display: "grid", gap: 6 },
  painInlineValueTitle: { fontSize: 14, fontWeight: 900, color: "#111827" },
  painInlineValueDesc: { fontSize: 13.5, color: "rgba(17,24,39,0.75)", lineHeight: 1.4 },
  footer: {
    padding: "12px 18px 16px",
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    borderTop: "1px solid rgba(0,0,0,0.06)",
    position: "relative",
    zIndex: 2,
  },
  footerInline: {
    padding: "0",
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
    position: "relative",
    zIndex: 2,
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
    padding: "16px 18px",
    width: "100%",
    border: "1px solid #0f172a",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 800,
    fontSize: 17,
    cursor: "pointer",
    boxShadow: "0 8px 16px rgba(0,0,0,0.16)",
    WebkitTapHighlightColor: "transparent",
  },
  backTextBtn: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#111827",
    fontSize: 16,
    fontWeight: 700,
    padding: "14px 16px",
    cursor: "pointer",
    textAlign: "center",
    WebkitTapHighlightColor: "transparent",
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

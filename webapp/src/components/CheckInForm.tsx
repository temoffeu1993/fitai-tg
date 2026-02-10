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
  title?: string;
  submitLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  onStepChange?: (
    step: number,
    totalSteps: number,
    context?: {
      sleepQuality: SleepQuality;
      sleepTouched: boolean;
    }
  ) => void;
  hideStepMeta?: boolean;
  hideStepTitle?: boolean;
  hideBackOnFirstStep?: boolean;
};

const chipStyle: React.CSSProperties = {
  padding: "14px 14px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.5)",
  background: "linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.12) 100%)",
  boxShadow:
    "0 6px 12px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.72), inset 0 0 0 1px rgba(255,255,255,0.25)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 500,
  color: "#1e1f22",
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
  background: "#1e1f22",
  color: "#fff",
  border: "1px solid #1e1f22",
  boxShadow: "0 6px 10px rgba(0,0,0,0.2)",
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
  animation: checkinStepIn 420ms cubic-bezier(.4,0,.2,1) both;
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

.checkin-option-card {
  appearance: none;
  outline: none;
  transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
  will-change: transform, background, border-color;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.checkin-option-card:active:not(:disabled) {
  transform: translateY(1px) scale(0.99);
  background: var(--checkin-card-bg) !important;
  border-color: var(--checkin-card-border) !important;
  color: var(--checkin-card-color) !important;
}
.checkin-option-card:focus-visible {
  outline: 3px solid rgba(15, 23, 42, 0.18);
  outline-offset: 2px;
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
  background-color: #1e1f22 !important;
  border-color: #1e1f22 !important;
}
.checkin-primary-btn:disabled {
  background-color: #1e1f22 !important;
  border-color: #1e1f22 !important;
  color: #fff !important;
  box-shadow: 0 6px 10px rgba(0,0,0,0.24) !important;
  filter: none !important;
}
.checkin-primary-btn:disabled {
  opacity: 1 !important;
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
  onStepChange,
  hideStepMeta = false,
  hideStepTitle = false,
  hideBackOnFirstStep = false,
}: Props) {
  const [sleepQuality, setSleepQuality] = useState<SleepQuality>("ok");
  const [sleepTouched, setSleepTouched] = useState(false);
  const [energyLevel, setEnergyLevel] = useState<CheckInPayload["energyLevel"]>("medium");
  const [stressLevel, setStressLevel] = useState<CheckInPayload["stressLevel"]>("medium");
  const [availableMinutes, setAvailableMinutes] = useState<number>(60);
  const [hasPain, setHasPain] = useState(false);
  const [painMap, setPainMap] = useState<Partial<Record<PainLocation, number>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const sleepOptions = [
    { key: "poor" as const, label: "Плохо", emoji: "😴" },
    { key: "fair" as const, label: "Так себе", emoji: "🥱" },
    { key: "ok" as const, label: "Нормально", emoji: "🙂" },
    { key: "good" as const, label: "Хорошо", emoji: "😊" },
    { key: "excellent" as const, label: "Отлично", emoji: "🤩" },
  ];
  const energyOptions = [
    { key: "low" as const, label: "Низкая", emoji: "🪫" },
    { key: "medium" as const, label: "Средняя", emoji: "🔋" },
    { key: "high" as const, label: "Высокая", emoji: "⚡️" },
  ];
  const stressOptions = [
    { key: "low" as const, label: "Низкий", emoji: "🧘" },
    { key: "medium" as const, label: "Средний", emoji: "😬" },
    { key: "high" as const, label: "Высокий", emoji: "😓" },
    { key: "very_high" as const, label: "Очень высокий", emoji: "😵" },
  ];
  const durationOptions = [
    { value: 45, label: "45 минут", emoji: "⏱️" },
    { value: 60, label: "60 минут", emoji: "⏲️" },
    { value: 90, label: "90 минут", emoji: "🕰️" },
  ] as const;

  const totalSteps = 5;
  const lastStep = totalSteps - 1;
  const isLastStep = step >= lastStep;

  React.useEffect(() => {
    onStepChange?.(step, totalSteps, {
      sleepQuality,
      sleepTouched,
    });
  }, [onStepChange, step, totalSteps, sleepQuality, sleepTouched]);

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

  const primaryLabel = isLastStep ? submitLabel || "Начать тренировку" : "Далее";
  const shouldShowBackTextBtn = !(hideBackOnFirstStep && step === 0);

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
          {!hideStepMeta ? (
            <div style={modal.stepMeta}>
              <span style={modal.stepText}>Шаг {step + 1} из {totalSteps}</span>
            </div>
          ) : null}

          {step === 0 ? (
            <div style={modal.cardMini} className="checkin-step-animate" key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.cardMiniTitle}>Как ты поспал?</div> : null}
              <div style={modal.optionList}>
                {sleepOptions.map((option) => {
                  const isActive = sleepQuality === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className="checkin-option-card"
                      style={{
                        ...modal.optionCard,
                        ["--checkin-card-bg" as never]:
                          isActive
                            ? "#1e1f22"
                            : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                        ["--checkin-card-border" as never]: isActive ? "#1e1f22" : "rgba(255,255,255,0.4)",
                        ["--checkin-card-color" as never]: isActive ? "#fff" : "#1e1f22",
                        ...(isActive ? modal.optionCardActive : {}),
                      }}
                      onClick={() => {
                        setSleepQuality(option.key);
                        setSleepTouched(true);
                      }}
                    >
                      <div style={modal.optionCardTitleRow}>
                        <span style={modal.optionCardEmoji} aria-hidden>
                          {option.emoji}
                        </span>
                        <div style={modal.optionCardTitle}>{option.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div style={modal.cardMini} className="checkin-step-animate" key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.cardMiniTitle}>Энергия</div> : null}
              <div style={modal.optionList}>
                {energyOptions.map((option) => {
                  const isActive = energyLevel === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className="checkin-option-card"
                      style={{
                        ...modal.optionCard,
                        ["--checkin-card-bg" as never]:
                          isActive
                            ? "#1e1f22"
                            : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                        ["--checkin-card-border" as never]: isActive ? "#1e1f22" : "rgba(255,255,255,0.4)",
                        ["--checkin-card-color" as never]: isActive ? "#fff" : "#1e1f22",
                        ...(isActive ? modal.optionCardActive : {}),
                      }}
                      onClick={() => setEnergyLevel(option.key)}
                    >
                      <div style={modal.optionCardTitleRow}>
                        <span style={modal.optionCardEmoji} aria-hidden>
                          {option.emoji}
                        </span>
                        <div style={modal.optionCardTitle}>{option.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div style={modal.cardMini} className="checkin-step-animate" key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.cardMiniTitle}>Стресс</div> : null}
              <div style={modal.optionList}>
                {stressOptions.map((option) => {
                  const isActive = stressLevel === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className="checkin-option-card"
                      style={{
                        ...modal.optionCard,
                        ["--checkin-card-bg" as never]:
                          isActive
                            ? "#1e1f22"
                            : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                        ["--checkin-card-border" as never]: isActive ? "#1e1f22" : "rgba(255,255,255,0.4)",
                        ["--checkin-card-color" as never]: isActive ? "#fff" : "#1e1f22",
                        ...(isActive ? modal.optionCardActive : {}),
                      }}
                      onClick={() => setStressLevel(option.key)}
                    >
                      <div style={modal.optionCardTitleRow}>
                        <span style={modal.optionCardEmoji} aria-hidden>
                          {option.emoji}
                        </span>
                        <div style={modal.optionCardTitle}>{option.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div style={modal.cardMini} className="checkin-step-animate" key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.cardMiniTitle}>Время на тренировку</div> : null}
              <div style={modal.optionList}>
                {durationOptions.map((option) => {
                  const isActive = availableMinutes === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="checkin-option-card"
                      style={{
                        ...modal.optionCard,
                        ["--checkin-card-bg" as never]:
                          isActive
                            ? "#1e1f22"
                            : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                        ["--checkin-card-border" as never]: isActive ? "#1e1f22" : "rgba(255,255,255,0.4)",
                        ["--checkin-card-color" as never]: isActive ? "#fff" : "#1e1f22",
                        ...(isActive ? modal.optionCardActive : {}),
                      }}
                      onClick={() => setAvailableMinutes(option.value)}
                    >
                      <div style={modal.optionCardTitleRow}>
                        <span style={modal.optionCardEmoji} aria-hidden>
                          {option.emoji}
                        </span>
                        <div style={modal.optionCardTitle}>{option.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step >= 4 ? (
            <div style={modal.cardWide} className="checkin-step-animate" key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.groupTitle}>Есть боль или дискомфорт?</div> : null}

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
            <span style={modal.saveText}>{loading && isLastStep ? "Сохраняем..." : primaryLabel}</span>
          </button>
          {shouldShowBackTextBtn ? (
            <button
              style={modal.backTextBtn}
              onClick={handleBackClick}
              type="button"
              disabled={loading}
              className="checkin-text-btn"
            >
              {backLabel || "Назад"}
            </button>
          ) : null}
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
    background: "rgba(0,0,0,0.24)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 9999,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(245,245,250,0.7) 100%)",
    boxShadow: "0 14px 28px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    overflow: "hidden",
  },
  inlineWrap: {
    position: "relative",
    background: "transparent",
    display: "block",
  },
  inlineCard: {
    width: "100%",
    borderRadius: 0,
    border: "none",
    background: "transparent",
    boxShadow: "none",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
    overflow: "visible",
    padding: "16px 14px calc(env(safe-area-inset-bottom, 0px) + 154px)",
  },
  header: {
    padding: "16px 18px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid rgba(255,255,255,0.6)",
  },
  title: { fontSize: 22, fontWeight: 700, color: "#1e1f22" },
  close: {
    border: "none",
    background: "transparent",
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
  },
  bodyInline: { padding: "0", display: "grid", gap: 12 },
  stepMeta: {
    display: "flex",
    justifyContent: "center",
    marginBottom: -2,
  },
  stepText: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.25,
    color: "rgba(30,31,34,0.55)",
    textTransform: "uppercase",
  },
  subLabel: { fontSize: 14, opacity: 0.82, marginTop: 2, lineHeight: 1.35 },
  value: {
    display: "grid",
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  valueTitle: { fontSize: 34, lineHeight: 1.02, fontWeight: 700, color: "#1e1f22", letterSpacing: -0.6 },
  valueTitleRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
  },
  valueEmoji: {
    fontSize: 20,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "grayscale(1) saturate(0) contrast(1.05) brightness(0.55)",
    opacity: 0.86,
  },
  valueTitleIcon: {
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  },
  valueDesc: { fontSize: 15, color: "rgba(30,31,34,0.75)", lineHeight: 1.42 },
  valueDescRow: {
    display: "inline-flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 15,
    color: "rgba(30,31,34,0.75)",
    lineHeight: 1.42,
  },
  valueDescIcon: {
    width: 18,
    height: 18,
    marginTop: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  },
  measureWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    visibility: "hidden",
    pointerEvents: "none",
  },
  cardMini: {
    padding: "2px 2px 0",
    borderRadius: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    display: "grid",
    gap: 12,
    position: "relative",
  },
  cardMiniTitle: {
    fontSize: 30,
    lineHeight: 1.06,
    opacity: 0.92,
    marginBottom: 0,
    fontWeight: 700,
    letterSpacing: -0.8,
    color: "#1e1f22",
  },
  optionList: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
  },
  optionCard: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.4)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow:
      "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
    color: "#1e1f22",
    fontSize: 18,
    fontWeight: 500,
    padding: "18px 16px",
    textAlign: "left",
    display: "flex",
    gap: 0,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    width: "100%",
    cursor: "pointer",
  },
  optionCardActive: {
    background: "#1e1f22",
    border: "1px solid #1e1f22",
    color: "#fff",
  },
  optionCardTitleRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  optionCardTitle: {
    fontSize: 18,
    lineHeight: 1.22,
    fontWeight: 500,
  },
  optionCardEmoji: {
    fontSize: 18,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transform: "translateY(1px)",
  },
  cardWide: {
    padding: "2px 2px 0",
    borderRadius: 0,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    display: "grid",
    gap: 12,
    position: "relative",
  },
  groupTitle: {
    fontSize: 30,
    lineHeight: 1.06,
    fontWeight: 700,
    marginBottom: 4,
    opacity: 0.92,
    letterSpacing: -0.8,
    color: "#1e1f22",
  },
  binaryRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "stretch" },
  chips: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(162px, 1fr))" },
  painZoneCell: { display: "grid", gap: 10, alignItems: "start" },
  painInline: {
    background: "transparent",
    border: "none",
    borderTop: "1px solid rgba(30,31,34,0.12)",
    borderRadius: 0,
    padding: "10px 0 0",
    boxShadow: "none",
    display: "grid",
    gap: 10,
  },
  painInlineTitle: { fontSize: 14, fontWeight: 600, opacity: 0.86, color: "#1e1f22" },
  painInlineValue: { display: "grid", gap: 6 },
  painInlineValueTitle: { fontSize: 16, fontWeight: 600, color: "#1e1f22" },
  painInlineValueDesc: { fontSize: 14, color: "rgba(30,31,34,0.72)", lineHeight: 1.4 },
  footer: {
    padding: "0 18px 16px",
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    borderTop: "none",
    position: "relative",
    zIndex: 2,
  },
  footerInline: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "14px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)",
    marginTop: 0,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    maxWidth: "100%",
    background: "transparent",
    border: "none",
    boxShadow: "none",
    zIndex: 6,
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
    width: "100%",
    borderRadius: 16,
    padding: "16px 18px",
    height: "auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    border: "1px solid #1e1f22",
    background: "#1e1f22",
    color: "#fff",
    fontWeight: 500,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 6px 10px rgba(0,0,0,0.24)",
    WebkitTapHighlightColor: "transparent",
    appearance: "none",
    WebkitAppearance: "none",
    outline: "none",
  },
  saveText: {
    fontSize: 18,
    fontWeight: 500,
    textAlign: "center",
    lineHeight: 1,
  },
  backTextBtn: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "#1e1f22",
    fontSize: 16,
    fontWeight: 600,
    padding: "14px 16px",
    cursor: "pointer",
    textAlign: "center",
    WebkitTapHighlightColor: "transparent",
  },
  error: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.35,
    textAlign: "center",
  },
};

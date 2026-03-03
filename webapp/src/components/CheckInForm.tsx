import React, { useLayoutEffect, useRef, useState } from "react";
import type { CheckInPayload, SleepQuality, PainLocation } from "@/api/plan";
import BottomDock from "@/components/workout-session/BottomDock";

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
  onStepChange?: (step: number, totalSteps: number) => void;
  hideStepMeta?: boolean;
  hideStepTitle?: boolean;
  hideBackOnFirstStep?: boolean;
};

const selectionTileStyle: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid var(--tile-border)",
  background: "var(--tile-bg)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow:
    "0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(255,255,255,0.25)",
  color: "var(--tile-color)",
  fontSize: 18,
  fontWeight: 500,
  padding: "18px 10px",
  textAlign: "center",
  cursor: "pointer",
  width: "100%",
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
.checkin-entry-target {
  opacity: 0;
}
.checkin-entry-fade {
  animation: checkinEntryOpacityIn 520ms ease-out both;
  animation-delay: 160ms;
  will-change: opacity;
}
@keyframes checkinEntryOpacityIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .checkin-entry-target { opacity: 1 !important; transform: none !important; }
  .checkin-entry-fade { animation: none !important; }
  .checkin-step-animate { animation: none !important; }
}

.checkin-tile-card {
  appearance: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 220ms ease, border-color 220ms ease, color 220ms ease, transform 160ms ease;
  will-change: transform, background, border-color;
}
.checkin-tile-card:active:not(:disabled) {
  transform: translateY(1px) scale(0.99);
  background: var(--tile-bg) !important;
  border-color: var(--tile-border) !important;
  color: var(--tile-color) !important;
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
  const [energyLevel, setEnergyLevel] = useState<CheckInPayload["energyLevel"]>("medium");
  const [stressLevel, setStressLevel] = useState<CheckInPayload["stressLevel"]>("medium");
  const [availableMinutes, setAvailableMinutes] = useState<number>(60);
  const [hasPain, setHasPain] = useState(false);
  const [painMap, setPainMap] = useState<Partial<Record<PainLocation, number>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [hasNavigatedSteps, setHasNavigatedSteps] = useState(false);
  const stepCardRef = useRef<HTMLDivElement | null>(null);
  const measureRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [descMinHeightByStep, setDescMinHeightByStep] = useState<Record<number, number>>({});

  const sleepOptions = [
    { key: "poor" as const, label: "Плохо", emoji: "😴", desc: "Сон был прерывистым или коротким — восстановление слабое." },
    { key: "fair" as const, label: "Так себе", emoji: "🥱", desc: "В целом спал, но бодрости меньше обычного." },
    { key: "ok" as const, label: "Нормально", emoji: "🙂", desc: "Обычный сон — можно работать и тренироваться в привычном режиме." },
    { key: "good" as const, label: "Хорошо", emoji: "😊", desc: "Выспался — чувствуешь заметную бодрость и ясность." },
    { key: "excellent" as const, label: "Отлично", emoji: "🤩", desc: "Полностью восстановился — максимум энергии и готовности." },
  ];
  const energyOptions = [
    { key: "low" as const, label: "Низкая", emoji: "🪫", desc: "Сил мало — лучше держать умеренный темп и не форсировать." },
    { key: "medium" as const, label: "Средняя", emoji: "🔋", desc: "Обычный уровень — стандартная тренировка должна зайти." },
    { key: "high" as const, label: "Высокая", emoji: "⚡️", desc: "Много сил — можно работать увереннее, сохраняя технику." },
  ];
  const stressOptions = [
    { key: "low" as const, label: "Низкий", emoji: "🧘", desc: "Спокойно — нервная система не перегружена." },
    { key: "medium" as const, label: "Средний", emoji: "😬", desc: "Есть напряжение, но оно контролируемое." },
    { key: "high" as const, label: "Высокий", emoji: "😓", desc: "Сильно напряжён — лучше снизить интенсивность и объем." },
    { key: "very_high" as const, label: "Очень высокий", emoji: "😵", desc: "На пределе — бережёмся, фокус на восстановлении." },
  ];
  const durationOptions = [
    { value: 45, label: "45 минут" },
    { value: 60, label: "60 минут" },
    { value: 90, label: "90 минут" },
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

  React.useEffect(() => {
    onStepChange?.(step, totalSteps);
  }, [onStepChange, step, totalSteps]);

  const shouldRender = inline || open;
  if (!shouldRender) return null;

  const handlePrimary = () => {
    if (loading) return;
    if (isLastStep) {
      void handleSubmit();
      return;
    }
    setHasNavigatedSteps(true);
    setStep((s) => Math.max(0, Math.min(lastStep, s + 1)));
  };

  const handleBackClick = () => {
    if (loading) return;
    if (step > 0) {
      setHasNavigatedSteps(true);
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
  const isPainStep = step >= 4;
  // Always dock footer if inline, as requested to match WorkoutSession
  const shouldDockFooter = inline;
  const cardStyle = inline
    ? {
      ...modal.inlineCard,
      ...modal.inlineCardWithDockedFooter,
    }
    : modal.card;
  const footerStyle = inline
    ? modal.footerInlineDockedFixed
    : modal.footerInlineFlowPainActive;
  const saveBtnStyle = inline ? { ...modal.save, ...modal.saveInline } : modal.save;
  const backBtnStyle = inline ? { ...modal.backTextBtn, ...modal.backTextBtnInline } : modal.backTextBtn;
  const cardMiniStyle = inline
    ? {
      ...modal.cardMini,
      ...(step <= 2 ? modal.cardMiniInlineNarrow : modal.cardMiniInline),
    }
    : modal.cardMini;
  const cardWideStyle = inline ? { ...modal.cardWide, ...modal.cardWideInline } : modal.cardWide;
  const durationGridStyle = inline ? { ...modal.durationGrid, ...modal.durationGridInline } : modal.durationGrid;
  const binaryRowStyle = inline ? { ...modal.binaryRow, ...modal.binaryRowInline } : modal.binaryRow;
  const chipsStyle = inline ? { ...modal.chips, ...modal.chipsInline } : modal.chips;

  const primaryLabel = isLastStep ? submitLabel || "Начать тренировку" : "Далее";
  const shouldShowBackTextBtn = !(hideBackOnFirstStep && step === 0);
  const stepCardAnimClass = hasNavigatedSteps ? "checkin-step-animate" : undefined;

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

        <div style={modal.bodyInline} className={inline ? "checkin-entry-target checkin-entry-fade" : undefined}>
          {!hideStepMeta ? (
            <div style={modal.stepMeta}>
              <span style={modal.stepText}>Шаг {step + 1} из {totalSteps}</span>
            </div>
          ) : null}

          {step === 0 ? (
            <div ref={stepCardRef} style={cardMiniStyle} className={stepCardAnimClass} key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.cardMiniTitle}>Как ты поспал?</div> : null}
              <div style={modal.value}>
                <div style={modal.valueTitleRow}>
                  <span style={modal.valueTitle}>{sleepOpt.label}</span>
                  <span style={modal.valueEmoji} aria-hidden>{sleepOpt.emoji}</span>
                </div>
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
            <div ref={stepCardRef} style={cardMiniStyle} className={stepCardAnimClass} key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.cardMiniTitle}>Энергия</div> : null}
              <div style={modal.value}>
                <div style={modal.valueTitleRow}>
                  <span style={modal.valueTitle}>{energyOpt.label}</span>
                  <span style={modal.valueEmoji} aria-hidden>{energyOpt.emoji}</span>
                </div>
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
            <div ref={stepCardRef} style={cardMiniStyle} className={stepCardAnimClass} key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.cardMiniTitle}>Стресс</div> : null}
              <div style={modal.value}>
                <div style={modal.valueTitleRow}>
                  <span style={modal.valueTitle}>{stressOpt.label}</span>
                  <span style={modal.valueEmoji} aria-hidden>{stressOpt.emoji}</span>
                </div>
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
            <div ref={stepCardRef} style={cardMiniStyle} className={stepCardAnimClass} key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.cardMiniTitle}>Время на тренировку</div> : null}
              <div style={durationGridStyle}>
                {durationOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="checkin-tile-card"
                    style={{
                      ...selectionTileStyle,
                      ["--tile-bg" as never]:
                        availableMinutes === option.value
                          ? "#1e1f22"
                          : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                      ["--tile-border" as never]: availableMinutes === option.value ? "#1e1f22" : "rgba(255,255,255,0.4)",
                      ["--tile-color" as never]: availableMinutes === option.value ? "#fff" : "#1e1f22",
                    }}
                    onClick={() => setAvailableMinutes(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step >= 4 ? (
            <div ref={stepCardRef} style={cardWideStyle} className={stepCardAnimClass} key={`step-${step}`}>
              {!hideStepTitle ? <div style={modal.groupTitle}>Есть боль или дискомфорт?</div> : null}

              <div style={binaryRowStyle}>
                <button
                  type="button"
                  className="checkin-tile-card"
                  style={{
                    ...selectionTileStyle,
                    ["--tile-bg" as never]:
                      !hasPain
                        ? "#1e1f22"
                        : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                    ["--tile-border" as never]: !hasPain ? "#1e1f22" : "rgba(255,255,255,0.4)",
                    ["--tile-color" as never]: !hasPain ? "#fff" : "#1e1f22",
                  }}
                  onClick={() => {
                    setHasPain(false);
                    setPainMap({});
                  }}
                >
                  Нет
                </button>
                <button
                  type="button"
                  className="checkin-tile-card"
                  style={{
                    ...selectionTileStyle,
                    ["--tile-bg" as never]:
                      hasPain
                        ? "#1e1f22"
                        : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                    ["--tile-border" as never]: hasPain ? "#1e1f22" : "rgba(255,255,255,0.4)",
                    ["--tile-color" as never]: hasPain ? "#fff" : "#1e1f22",
                  }}
                  onClick={() => setHasPain(true)}
                >
                  Да
                </button>
              </div>

              {hasPain && (
                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  <div style={chipsStyle}>
                    {PAIN_ZONES.map((z) => {
                      const active = painMap[z.key] != null;
                      const level = Number(painMap[z.key] ?? 5);
                      const impact = painImpact(level);
                      return (
                        <div key={z.key} style={modal.painZoneCell}>
                          <button
                            type="button"
                            className="checkin-tile-card"
                            style={{
                              ...selectionTileStyle,
                              ["--tile-bg" as never]:
                                active
                                  ? "#1e1f22"
                                  : "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 100%)",
                              ["--tile-border" as never]: active ? "#1e1f22" : "rgba(255,255,255,0.4)",
                              ["--tile-color" as never]: active ? "#fff" : "#1e1f22",
                            }}
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

        {inline ? (
          <div className="checkin-entry-target checkin-entry-fade">
            <BottomDock
              primaryLabel={loading && isLastStep ? "Сохраняем..." : primaryLabel}
              primaryVariant="compactArrow"
              onPrimary={handlePrimary}
              primaryEnabled={!loading}
              secondaryLabel={shouldShowBackTextBtn ? (backLabel || "Назад") : undefined}
              onSecondary={shouldShowBackTextBtn ? handleBackClick : undefined}
            />
          </div>
        ) : (
          <div style={footerStyle}>
            <button
              style={{
                ...saveBtnStyle,
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
                style={backBtnStyle}
                onClick={handleBackClick}
                type="button"
                disabled={loading}
                className="checkin-text-btn"
              >
                {backLabel || "Назад"}
              </button>
            ) : null}
          </div>
        )}
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
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minHeight: "100%",
  },
  inlineCard: {
    width: "100%",
    minHeight: "100%",
    borderRadius: 0,
    border: "none",
    background: "transparent",
    boxShadow: "none",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
    overflow: "visible",
    padding: "16px 0 0",
    display: "flex",
    flexDirection: "column",
  },
  inlineCardWithDockedFooter: {
    paddingBottom: "calc(var(--layout-nav-height, 72px) + 132px)",
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
  bodyInline: { padding: "0", display: "grid", gap: 14 },
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
  cardMiniInline: {
    padding: 0,
  },
  cardMiniInlineNarrow: {
    padding: "0 14px",
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
  cardWideInline: {
    padding: 0,
  },
  durationGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    width: "100%",
  },
  durationGridInline: {
    width: "100%",
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
  binaryRowInline: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  chips: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(162px, 1fr))" },
  chipsInline: { gridTemplateColumns: "1fr" },
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
  footerInlineDockedFixed: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: "calc(var(--layout-nav-height, 72px) + clamp(4px, 0.9vh, 8px))",
    padding: "14px clamp(16px, 4vw, 20px) calc(max(env(safe-area-inset-bottom, 0px), 0px) + 2px)",
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
    background: "transparent",
    border: "none",
    boxShadow: "none",
    zIndex: 6,
  },
  footerInlineFlowPainActive: {
    position: "relative",
    marginTop: 14,
    paddingBottom:
      "calc(max(env(safe-area-inset-bottom, 0px), 0px) + clamp(2px, 0.7vh, 6px))",
  },
  save: {
    width: "100%",
    maxWidth: 420,
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
  saveInline: {
    maxWidth: "100%",
  },
  saveText: {
    fontSize: 18,
    fontWeight: 500,
    textAlign: "center",
  },
  backTextBtn: {
    width: "100%",
    maxWidth: 420,
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
  backTextBtnInline: {
    maxWidth: "100%",
  },
  error: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.35,
    textAlign: "center",
  },
};

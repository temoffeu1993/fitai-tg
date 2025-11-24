import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadHistory } from "@/lib/history";
import { createPlannedWorkout } from "@/api/schedule";
import { useWorkoutPlan } from "@/hooks/useWorkoutPlan";
import { useNutritionGenerationProgress } from "@/hooks/useNutritionGenerationProgress";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const defaultScheduleTime = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "18:00" : "09:00";
};

/**
 * Вытащить заголовок тренировки из текста плана:
 * первая непустая строка, подрезанная до 80 символов.
 */
function derivePlanTitle(plan: any): string {
  if (!plan || !plan.text) return "Тренировка дня";
  const raw = String(plan.text);
  const firstLine = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "Тренировка дня";
  const cleaned = firstLine.replace(/^[-•]/, "").trim();
  return cleaned.length > 80 ? cleaned.slice(0, 77) + "…" : cleaned;
}

/**
 * PLAN — ознакомительный экран в общем стиле приложения.
 * Теперь план — один большой текст от тренера (plan.text).
 */

export default function PlanOne() {
  const nav = useNavigate();
  const {
    plan,
    analysis,
    status: planStatus,
    error: planError,
    metaError,
    loading,
    regenerate,
    refresh,
  } = useWorkoutPlan<any>();
  const sub = useSubscriptionStatus();
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => toDateInput(new Date()));
  const [scheduleTime, setScheduleTime] = useState(() => defaultScheduleTime());
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // одна секция с текстом плана
  const [openText, setOpenText] = useState(true);

  // trainer notes popup (теперь на основе analysis)
  const [showNotes, setShowNotes] = useState(false);
  const [regenNotice, setRegenNotice] = useState<string | null>(null);
  const [regenInlineError, setRegenInlineError] = useState<string | null>(null);
  const [regenPending, setRegenPending] = useState(false);

  const steps = useMemo(
    () => ["Анализ профиля", "Цели и ограничения", "Подбор упражнений", "Оптимизация нагрузки", "Формирование плана"],
    []
  );

  const today = useMemo(() => new Date(), []);
  const heroDateChipRaw = today.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const heroDateChip = heroDateChipRaw.charAt(0).toUpperCase() + heroDateChipRaw.slice(1);

  // эвристики по тексту плана: время, упражнения, ккал
  const chips = useMemo(() => {
    if (!plan || !plan.text) return null;
    const text = String(plan.text);
    const words = text.split(/\s+/).filter(Boolean).length;
    const approxMinutes = Math.max(25, Math.min(90, Math.round(words / 5))); // длина текста ≈ время
    const bulletMatches = text.match(/(^|\n)\s*[-•\d]/g) || [];
    const approxExercises =
      Math.max(3, Math.min(15, bulletMatches.length || Math.round(words / 80))) || 3;
    const kcal = Math.round(approxMinutes * 6);
    return { minutes: approxMinutes, kcal, exercises: approxExercises };
  }, [plan]);

  const {
    progress: loaderProgress,
    startManual: kickProgress,
  } = useNutritionGenerationProgress(planStatus, {
    steps: steps.length,
    storageKey: "workout_generation_started_at",
    durationMs: 40_000,
  });

  const { loaderStepIndex, loaderStepNumber } = useMemo(() => {
    const fraction = Math.min(1, loaderProgress / 75); // 75% ≈ 30 секунд
    const number = Math.min(steps.length, Math.max(1, Math.ceil(fraction * steps.length)));
    return { loaderStepIndex: number - 1, loaderStepNumber: number };
  }, [loaderProgress, steps.length]);

  const error = planError || metaError || null;
  const isProcessing = planStatus === "processing";
  const showLoader = loading || isProcessing || (!plan && !error);
  const [paywall, setPaywall] = useState(false);

  // заголовок тренировки из текста
  const planTitle = useMemo(() => derivePlanTitle(plan), [plan]);

  // комментарий тренера из analysis
  const trainerNote = useMemo(() => {
    if (!analysis) return "";
    const parts: string[] = [];
    if (analysis.recovery) parts.push(String(analysis.recovery));
    if (analysis.deloadSuggested) {
      parts.push(
        "Сейчас логично держать нагрузку чуть легче и внимательно следить за самочувствием: техника, пульс, дыхание."
      );
    }
    if (Array.isArray(analysis.weightNotes) && analysis.weightNotes.length) {
      parts.push(
        "По рабочим весам можно ориентироваться на недавние тренировки (ориентиры, не жёсткие правила):\n" +
          analysis.weightNotes.slice(0, 3).join("\n")
      );
    }
    return parts.join("\n\n").trim();
  }, [analysis]);

  useEffect(() => {
    const onPlanCompleted = () => {
      regenerate().catch(() => {});
    };
    window.addEventListener("plan_completed", onPlanCompleted as any);
    return () => window.removeEventListener("plan_completed", onPlanCompleted as any);
  }, [regenerate]);

  useEffect(() => {
    const onOnbUpdated = () => {
      refresh({ force: true }).catch(() => {});
    };
    window.addEventListener("onb_updated" as any, onOnbUpdated);
    return () => window.removeEventListener("onb_updated" as any, onOnbUpdated);
  }, [refresh]);

  // --- обработчик регенерации ---
  const handleRegenerate = async () => {
    try {
      localStorage.removeItem("current_plan");
      localStorage.removeItem("session_draft");
    } catch {}
    setShowNotes(false);
    setRegenInlineError(null);
    if (sub.locked) {
      setPaywall(true);
      return;
    }
    kickProgress();
    setRegenPending(true);
    setRegenNotice(null);
    try {
      await refresh({ force: true, silent: true });
    } catch (err: any) {
      const status = err?.status;
      const message = humanizePlanError(err);
      if (status === 403 || status === 429) {
        setRegenNotice(message);
        return;
      }
      if (status === 401) {
        setPaywall(true);
        return;
      }
      setRegenInlineError(message || "Не удалось обновить план");
    } finally {
      setRegenPending(false);
    }
  };

  const handleScheduleOpen = () => {
    setScheduleDate(toDateInput(new Date()));
    setScheduleTime(defaultScheduleTime());
    setScheduleError(null);
    setShowScheduleModal(true);
  };

  const handleScheduleConfirm = async () => {
    if (!plan) return;
    if (!scheduleDate || !scheduleTime) {
      setScheduleError("Укажи дату и время");
      return;
    }
    const when = new Date(`${scheduleDate}T${scheduleTime}`);
    if (!Number.isFinite(when.getTime())) {
      setScheduleError("Некорректная дата или время");
      return;
    }

    try {
      setScheduleSaving(true);
      setScheduleError(null);
      await createPlannedWorkout({ plan, scheduledFor: when.toISOString(), scheduledTime: scheduleTime });
      setShowScheduleModal(false);
      try {
        window.dispatchEvent(new CustomEvent("schedule_updated"));
      } catch {}
      nav("/", { replace: true });
    } catch (err) {
      console.error("createPlannedWorkout failed", err);
      setScheduleError("Не удалось сохранить. Попробуй ещё раз.");
    } finally {
      setScheduleSaving(false);
    }
  };

  if (showLoader) {
    return (
      <WorkoutLoader
        steps={steps}
        progress={loaderProgress}
        stepIndex={loaderStepIndex}
        stepNumber={loaderStepNumber}
      />
    );
  }

  if (paywall || sub.locked) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.heroCard}>
          <div style={s.heroHeader}>
            <span style={s.pill}>Доступ</span>
            <span style={s.credits}>Premium</span>
          </div>
          <div style={s.heroTitle}>Оформите подписку</div>
          <div style={s.heroSubtitle}>
            Генерация тренировок и питания доступна по подписке. Первый план/тренировка — бесплатно.
          </div>
          <div style={{ marginTop: 16, fontSize: 13, opacity: 0.9 }}>
            {sub.reason || "Оформите подписку, чтобы продолжить."}
          </div>
          <button
            className="soft-glow"
            style={{ ...s.primaryBtn, marginTop: 18 }}
            onClick={() => setPaywall(false)}
          >
            Ок
          </button>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.blockWhite}>
          <h3 style={{ marginTop: 0 }}>{error}</h3>
          <p style={{ marginTop: 6, color: "#555" }}>Проверь подключение и повтори попытку.</p>
          <button style={s.rowBtn} onClick={() => window.location.reload()}>
            Повторить
          </button>
        </section>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={s.page}>
        <SoftGlowStyles />
        <TypingDotsStyles />
        <section style={s.blockWhite}>
          <h3 style={{ marginTop: 0 }}>План отсутствует</h3>
        </section>
      </div>
    );
  }

  // вычисления для верхнего блока (кнопки и метрики)
  const workoutNumber = (() => {
    try {
      const history = loadHistory();
      return history.length + 1;
    } catch {
      return 1;
    }
  })();
  const totalExercises = chips?.exercises ?? 0;
  const regenButtonDisabled = sub.locked || regenPending;
  const regenButtonLabel = regenPending ? "Готовим план..." : "Сгенерировать заново";

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />

      {/* HERO */}
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>{heroDateChip}</span>
        </div>
        <div style={s.heroTitle}>{planTitle}</div>
        <div style={s.heroSubtitle}>Краткое превью перед стартом</div>

        <div style={s.heroCtas}>
          <button
            style={s.primaryBtn}
            onClick={() => {
              try {
                localStorage.setItem("current_plan", JSON.stringify(plan));
                nav("/workout/session", { state: { plan } });
              } catch (err) {
                console.error("open session error", err);
                alert("Не удалось открыть тренировку");
              }
            }}
          >
            Начать тренировку
          </button>

          <button
            type="button"
            style={s.secondaryBtn}
            onClick={handleScheduleOpen}
          >
            Запланировать
          </button>
        </div>

        <button
          type="button"
          style={{
            ...s.ghostBtn,
            opacity: regenButtonDisabled ? 0.6 : 1,
            cursor: regenButtonDisabled ? "not-allowed" : "pointer",
          }}
          disabled={regenButtonDisabled}
          onClick={handleRegenerate}
        >
          {regenButtonLabel}
        </button>
        {regenNotice ? (
          <div style={s.buttonNote}>{regenNotice}</div>
        ) : regenInlineError ? (
          <div style={s.inlineError}>{regenInlineError}</div>
        ) : null}
      </section>

      {/* Чипы под верхним блоком */}
      {chips && (
        <section style={s.statsRow}>
          <ChipStatSquare emoji="🎯" label="Тренировка" value={`#${workoutNumber}`} />
          <ChipStatSquare emoji="🕒" label="Время" value={`${chips.minutes} мин`} />
          <ChipStatSquare emoji="💪" label="Упражнения" value={`${totalExercises}`} />
        </section>
      )}

      {/* Одна секция с целым текстом плана */}
      <SectionCard
        icon="📋"
        title="План тренировки"
        hint="Следуй по порядку, подстраивая под свои ощущения."
        isOpen={openText}
        onToggle={() => setOpenText((v) => !v)}
      >
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: "#1b1b1b",
            whiteSpace: "pre-wrap",
          }}
        >
          {plan.text}
        </div>
      </SectionCard>

      <div style={{ height: 56 }} />

      {showScheduleModal && (
        <ScheduleModal
          title={planTitle || "Тренировка"}
          date={scheduleDate}
          time={scheduleTime}
          loading={scheduleSaving}
          error={scheduleError}
          onClose={() => setShowScheduleModal(false)}
          onSubmit={handleScheduleConfirm}
          onDateChange={(val) => setScheduleDate(val)}
          onTimeChange={(val) => setScheduleTime(val)}
        />
      )}

      {/* Комментарий тренера (из analysis) */}
      {trainerNote && (
        <>
          {showNotes && (
            <div style={notesStyles.chatPanelWrap}>
              <div style={notesStyles.chatPanel}>
                <div style={notesStyles.chatHeader}>
                  <div style={notesStyles.chatHeaderLeft}>
                    <div style={notesStyles.robotIconLarge}>🤖</div>
                    <div style={notesStyles.chatTitle}>Комментарий тренера</div>
                  </div>
                  <button
                    style={notesStyles.closeBtn}
                    onClick={() => setShowNotes(false)}
                  >
                    ✕
                  </button>
                </div>
                <div style={notesStyles.chatBody}>{trainerNote}</div>
              </div>
            </div>
          )}

          <div style={notesStyles.fabWrap} onClick={() => setShowNotes((v) => !v)}>
            {!showNotes && (
              <div style={notesStyles.speechBubble}>
                <div style={notesStyles.speechText}>Комментарий тренера</div>
                <div style={notesStyles.speechArrow} />
              </div>
            )}
            <div style={notesStyles.fabCircle}>
              <span style={{ fontSize: 35, lineHeight: 1 }}>🤖</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------- Типы/утилиты для ошибок ----------------- */

function humanizePlanError(err: any): string {
  if (!err) return "Не удалось обновить план";
  const rawError = typeof err?.body?.error === "string" ? err.body.error : null;
  const code =
    err?.body?.code ||
    err?.body?.details?.reason ||
    rawError ||
    (typeof err?.message === "string" ? err.message : null);
  const label = err?.body?.details?.nextDateLabel;
  const labelPart = typeof label === "string" && label.trim() ? ` ${label}` : "";

  if (code === "daily_limit") {
    return "Новую тренировку можно сгенерировать завтра — телу нужно восстановиться после нагрузки.";
  }
  if (code === "active_plan") {
    return "Вы уже сгенерировали тренировку. Чтобы получить следующую, заверши текущую и сохрани результат — так мы поддерживаем структуру плана и прогрессию.";
  }
  if (code === "interval_limit") {
    return label
      ? `Дай телу восстановиться. Следующую тренировку можно запустить ${label}.`
      : "Дай телу восстановиться. Попробуй чуть позже.";
  }
  if (code === "weekly_limit") {
    const weeklyTarget = Number(err?.body?.details?.weeklyTarget) || null;
    const targetText = weeklyTarget
      ? `Вы достигли недельного лимита тренировок. Программа строится под выбранный вами ритм — сейчас это ${weeklyTarget} ${pluralizeTrainings(
          weeklyTarget
        )} в неделю.`
      : "Вы достигли недельного лимита тренировок.";
    const tail = " Если хотите увеличить нагрузку, обновите настройки в анкете.";
    return `${targetText}${tail}`;
  }
  if (code === "unlock_pending") {
    return "Сначала заверши текущую тренировку, затем откроем новую.";
  }

  const fallback = extractPlanError(err);
  return labelPart ? `${fallback}${labelPart}`.trim() : fallback;
}

function extractPlanError(err: any): string {
  if (!err) return "Не удалось обновить план";
  const body = err?.body;
  let message: string | null = null;
  if (body) {
    if (typeof body === "string") {
      message = body;
    } else if (typeof body === "object") {
      if (typeof body.error === "string") message = body.error;
      else if (typeof body.message === "string") message = body.message;
    }
  }
  if (!message && (err?.status === 429 || err?.status === 403)) {
    message = "Ограничение на генерацию. Попробуй чуть позже.";
  }
  if (!message && typeof err?.message === "string" && !/_failed$/.test(err.message)) {
    message = err.message;
  }
  if (!message) message = "Не удалось обновить план";

  const nextLabel = body?.details?.nextDateLabel;
  if (typeof nextLabel === "string" && nextLabel.trim() && !message.includes(nextLabel)) {
    return `${message} ${nextLabel}`.trim();
  }
  return message;
}

function pluralizeTrainings(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "тренировка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "тренировки";
  return "тренировок";
}

function djb2(str: string) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return String(h >>> 0);
}

/* ----------------- Компоненты UI ----------------- */

function WorkoutLoader({
  steps,
  progress,
  stepIndex,
  stepNumber,
}: {
  steps: string[];
  progress: number;
  stepIndex: number;
  stepNumber: number;
}) {
  const safeIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
  const safeStep = steps[safeIndex] || steps[0] || "";
  const spinnerHints = [
    "Собираю анкету и ограничения",
    "Проверяю цели и инвентарь",
    "Подбираю упражнения и вариации",
    "Балансирую нагрузку и отдых",
    "Формирую финальный план",
  ];
  const hint = spinnerHints[Math.min(safeIndex, spinnerHints.length - 1)];
  const displayProgress = Math.max(5, Math.min(99, Math.round(progress || 0)));
  const analyticsState = safeIndex >= 1 ? "анализ готов" : "в процессе";
  const selectionState = safeIndex >= 3 ? "готовится" : "подбор идёт";

  return (
    <div style={s.page}>
      <SoftGlowStyles />
      <TypingDotsStyles />
      <section style={s.heroCard}>
        <div style={s.heroHeader}>
          <span style={s.pill}>Загрузка</span>
          <span style={s.credits}>ИИ работает</span>
        </div>

        <div style={{ marginTop: 8, opacity: 0.9, fontSize: 13 }}>
          Шаг {Math.min(stepNumber, steps.length)} из {steps.length}
        </div>
        <div style={{ marginTop: 4, opacity: 0.85, fontSize: 13 }}>{safeStep}</div>
        <div style={s.heroTitle}>Создаю персональную тренировку</div>
        <div style={s.loadWrap}>
          <Spinner />
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>{hint}</div>
        </div>
      </section>

      <section style={s.statsRow}>
        <ChipStatSquare emoji="🧠" label="Аналитика" value={analyticsState} />
        <ChipStatSquare emoji="🧩" label="Подбор" value={selectionState} />
        <ChipStatSquare emoji="⚡" label="Прогресс" value={`${displayProgress}%`} />
      </section>

      <section style={s.blockWhite}>
        <SkeletonLine />
        <SkeletonLine w={80} />
        <SkeletonLine w={60} />
      </section>

      <div style={notesStyles.fabWrapLoading}>
        <div style={notesStyles.speechBubble}>
          <div style={notesStyles.speechText}>
            <span className="typing-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </span>
          </div>
          <div style={notesStyles.speechArrow} />
        </div>
        <div style={notesStyles.fabCircle}>
          <span style={{ fontSize: 35, lineHeight: 1 }}>🤖</span>
        </div>
      </div>
    </div>
  );
}

function ScheduleModal({
  title,
  date,
  time,
  loading,
  error,
  onClose,
  onSubmit,
  onDateChange,
  onTimeChange,
}: {
  title: string;
  date: string;
  time: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  return (
    <div style={modal.wrap} role="dialog" aria-modal="true">
      <div style={modal.card}>
        <div style={modal.header}>
          <div style={modal.title}>{title}</div>
          <button style={modal.close} onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div style={modal.body}>
          <label style={modal.label}>
            <span style={modal.labelText}>Дата</span>
            <input
              style={modal.input}
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </label>
          <label style={modal.label}>
            <span style={modal.labelText}>Время</span>
            <input
              style={modal.input}
              type="time"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
            />
          </label>
          {error && <div style={modal.error}>{error}</div>}
        </div>
        <div style={modal.footer}>
          <button
            style={modal.cancel}
            onClick={onClose}
            type="button"
            disabled={loading}
          >
            Отмена
          </button>
          <button
            style={modal.save}
            onClick={onSubmit}
            type="button"
            disabled={loading}
          >
            {loading ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Insight({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div style={s.insightBox}>
      <div style={s.insightTitle}>{title}</div>
      <div style={s.insightValue}>{value || "—"}</div>
      {hint ? <div style={s.insightHint}>{hint}</div> : null}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  hint,
  children,
  isOpen,
  onToggle,
}: {
  icon: string;
  title: string;
  hint?: string;
  children: any;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <section style={s.block}>
      <div style={{ ...ux.card, boxShadow: ux.card.boxShadow }}>
        <button
          style={{
            ...ux.cardHeader,
            width: "100%",
            border: "none",
            textAlign: "left",
            cursor: "pointer",
            position: "relative",
          }}
          onClick={onToggle}
        >
          <div style={{ ...ux.iconInline }}>{icon}</div>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div style={ux.cardTitleRow}>
              <div style={ux.cardTitle}>{title}</div>
              <div
                style={{
                  ...ux.caretWrap,
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              >
                <div style={ux.caretInner} />
              </div>
            </div>
            {hint && <div style={ux.cardHint}>{hint}</div>}
          </div>
        </button>

        {isOpen && <div style={ux.cardBody}>{children}</div>}
      </div>
    </section>
  );
}

/* ----------------- Мелкие элементы ----------------- */

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statEmoji}>{icon}</div>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
    </div>
  );
}

function ChipStatSquare({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: string;
}) {
  return (
    <div style={s.chipSquare}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div
        style={{
          fontSize: 12,
          opacity: 0.7,
          textAlign: "center",
          whiteSpace: "normal",
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          textAlign: "center",
          whiteSpace: "normal",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SkeletonLine({ w = 100 }: { w?: number }) {
  return (
    <div
      style={{
        height: 10,
        width: `${w}%`,
        borderRadius: 6,
        background:
          "linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.4s ease-in-out infinite",
        marginTop: 8,
      }}
    />
  );
}

function Spinner() {
  return (
    <svg width="56" height="56" viewBox="0 0 50 50" style={{ display: "block" }}>
      <circle cx="25" cy="25" r="20" stroke="rgba(255,255,255,.35)" strokeWidth="6" fill="none" />
      <circle
        cx="25"
        cy="25"
        r="20"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="110"
        strokeDashoffset="80"
        style={{ transformOrigin: "25px 25px", animation: "spin 1.2s linear infinite" }}
      />
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      `}</style>
    </svg>
  );
}

function SoftGlowStyles() {
  return (
    <style>{`
      .soft-glow {
        background: linear-gradient(135deg,#ffe680,#ffb36b,#ff8a6b);
        background-size: 300% 300%;
        animation: glowShift 6s ease-in-out infinite, pulseSoft 3s ease-in-out infinite;
        transition: background 0.3s ease;
      }
      @keyframes glowShift { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
      @keyframes pulseSoft { 0%,100% { filter: brightness(1) saturate(1); transform: scale(1) } 50% { filter: brightness(1.15) saturate(1.1); transform: scale(1.01) } }
      @media (prefers-reduced-motion: reduce) { .soft-glow { animation: none } }
    `}</style>
  );
}

function TypingDotsStyles() {
  return (
    <style>{`
      .typing-dots {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      .typing-dots .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #1b1b1b;
        opacity: 0.3;
        animation: blink 1.2s infinite;
      }
      .typing-dots .dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dots .dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes blink {
        0%   { opacity: 0.3; transform: translateY(0); }
        50%  { opacity: 1;   transform: translateY(-2px); }
        100% { opacity: 0.3; transform: translateY(0); }
      }
    `}</style>
  );
}

/* ----------------- Стиль под Dashboard ----------------- */

const cardShadow = "0 8px 24px rgba(0,0,0,.08)";
const BLOCK_GRADIENT =
  "linear-gradient(135deg, rgba(236,227,255,.9) 0%, rgba(217,194,240,.9) 45%, rgba(255,216,194,.9) 100%)";
const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui, -apple-system, 'Inter', 'Roboto', Segoe UI",
    background: "transparent",
    minHeight: "100vh",
  },

  heroCard: {
    position: "relative",
    padding: 20,
    borderRadius: 24,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#050505",
    color: "#fff",
    overflow: "hidden",
  },
  heroHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  pill: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.12)",
    backdropFilter: "blur(4px)",
    textTransform: "capitalize",
  },
  credits: {
    background: "rgba(255,255,255,.08)",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.12)",
    backdropFilter: "blur(4px)",
    textTransform: "none",
    letterSpacing: 0.3,
  },
  heroTitle: { fontSize: 24, fontWeight: 800, marginTop: 6, color: "#fff" },
  heroSubtitle: { opacity: 0.85, marginTop: 4, color: "rgba(255,255,255,.85)" },
  heroCtas: {
    marginTop: 18,
    display: "grid",
    gap: 12,
    width: "100%",
  },
  primaryBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 700,
    color: "#000",
    background: BLOCK_GRADIENT,
    border: "none",
    boxShadow: "0 12px 30px rgba(0,0,0,.35)",
    cursor: "pointer",
  },

  secondaryBtn: {
    width: "100%",
    borderRadius: 16,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 700,
    color: "#000",
    background: BLOCK_GRADIENT,
    border: "none",
    boxShadow: "0 12px 30px rgba(0,0,0,.35)",
    cursor: "pointer",
  },

  block: {
    marginTop: 16,
    padding: 0,
    borderRadius: 16,
    background: "transparent",
    boxShadow: "none",
  },
  statsSection: {
    marginTop: 12,
    padding: 0,
    background: "transparent",
    boxShadow: "none",
  },

  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(96px, 1fr))",
    gap: 12,
    marginTop: 12,
    marginBottom: 10,
  },
  chipSquare: {
    background: "rgba(255,255,255,0.6)",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: "10px 8px",
    minHeight: 96,
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    gap: 4,
    wordBreak: "break-word",
    whiteSpace: "normal",
    hyphens: "none",
  },

  stat: {
    background: "rgba(255,255,255,0.6)",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    padding: "10px 8px",
    minHeight: 96,
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    gap: 4,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  statEmoji: { fontSize: 22 },
  statLabel: {
    fontSize: 12,
    opacity: 0.7,
    lineHeight: 1.2,
  },
  statValue: { fontSize: 16, fontWeight: 800 },

  blockWhite: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    background: "#fff",
    boxShadow: cardShadow,
  },

  rowBtn: {
    border: "none",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg,#6a8dff,#8a64ff)",
    cursor: "pointer",
    marginTop: 8,
  },

  loadWrap: { marginTop: 10, display: "grid", justifyItems: "center" },

  ghostBtn: {
    width: "100%",
    marginTop: 10,
    padding: "8px 0",
    border: "none",
    borderRadius: 14,
    background: "transparent",
    color: "#fff",
    fontSize: 14,
    fontWeight: 400,
    cursor: "pointer",
    textAlign: "center",
  },
  buttonNote: {
    fontSize: 13,
    color: "rgba(255,255,255,.8)",
    marginTop: 10,
    fontWeight: 400,
    opacity: 0.85,
    textAlign: "left",
  },
  inlineError: {
    fontSize: 13,
    color: "rgba(255,255,255,.8)",
    marginTop: 10,
    fontWeight: 400,
    opacity: 0.85,
    textAlign: "left",
  },

  analysisGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
    gap: 12,
    padding: "12px 12px 0",
  },
  analysisList: {
    padding: "0 16px 12px",
    fontSize: 13,
    color: "#1f2933",
  },
  analysisListTitle: {
    fontWeight: 700,
    marginBottom: 4,
  },
  analysisWarnings: {
    padding: "0 16px 16px",
    display: "grid",
    gap: 4,
    fontSize: 13,
    color: "#b45309",
    background: "rgba(255,196,150,0.2)",
    borderRadius: "0 0 16px 16px",
  },
  insightBox: {
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,.08)",
    background: "#fff",
    padding: 12,
    boxShadow: "0 6px 12px rgba(0,0,0,.05)",
    minHeight: 80,
    display: "grid",
    gap: 4,
  },
  insightTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6b7280",
    fontWeight: 700,
  },
  insightValue: {
    fontSize: 16,
    fontWeight: 800,
    color: "#111",
  },
  insightHint: {
    fontSize: 12,
    color: "#6b7280",
  },
};

const modal: Record<string, React.CSSProperties> = {
  wrap: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.35)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 2000,
    overscrollBehavior: "contain",
  },
  card: {
    width: "min(92vw, 420px)",
    borderRadius: 18,
    background: "#fff",
    boxShadow: "0 22px 60px rgba(0,0,0,.32)",
    padding: 20,
    display: "grid",
    gap: 18,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
  },
  close: {
    border: "none",
    background: "transparent",
    fontSize: 20,
    cursor: "pointer",
    lineHeight: 1,
    color: "#555",
  },
  body: {
    display: "grid",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 6,
  },
  labelText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#555",
  },
  input: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.12)",
    fontSize: 15,
    fontWeight: 600,
    color: "#1b1b1b",
    fontFamily: "inherit",
  },
  error: {
    background: "rgba(255,102,102,.12)",
    color: "#d24",
    fontSize: 12,
    fontWeight: 600,
    padding: "8px 10px",
    borderRadius: 10,
  },
  footer: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  cancel: {
    border: "none",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 700,
    background: "rgba(0,0,0,.06)",
    color: "#333",
    cursor: "pointer",
  },
  save: {
    border: "none",
    borderRadius: 12,
    padding: "12px 14px",
    fontWeight: 700,
    color: "#1b1b1b",
    background: "linear-gradient(135deg,#ffe680,#ffb36b)",
    boxShadow: "0 5px 16px rgba(0,0,0,.18)",
    cursor: "pointer",
  },
};

/* ----------------- Карточки секций ----------------- */

const ux: Record<string, any> = {
  card: {
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,.08)",
    boxShadow: "0 6px 20px rgba(0,0,0,.08)",
    overflow: "hidden",
    background: "rgba(255,255,255,0.6)",
    backdropFilter: "blur(12px)",
    position: "relative",
  },
  cardHeader: {
    display: "grid",
    gridTemplateColumns: "24px 1fr",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottom: "1px solid rgba(0,0,0,.06)",
    background: "rgba(255,255,255,0.6)",
    backdropFilter: "blur(12px)",
  },
  iconInline: {
    width: 24,
    height: 24,
    display: "grid",
    placeItems: "center",
    fontSize: 18,
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 15, fontWeight: 750, color: "#1b1b1b", lineHeight: 1.2 },
  cardHint: { fontSize: 11, color: "#2b2b2b", opacity: 0.85 },

  caretWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    background: "rgba(255,255,255,0.4)",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.05)",
    display: "grid",
    placeItems: "center",
    transition: "transform 0.18s ease",
  },
  caretInner: {
    width: 0,
    height: 0,
    borderLeft: "5px solid transparent",
    borderRight: "5px solid transparent",
    borderTop: "6px solid #4a3a7a",
  },
  cardBody: {
    padding: 12,
    background: "rgba(255,255,255,0.6)",
    backdropFilter: "blur(12px)",
  },
};

/* ----------------- Комментарий тренера styles ----------------- */

const notesStyles: Record<string, React.CSSProperties> = {
  fabWrap: {
    position: "fixed",
    right: 16,
    bottom: 160,
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    cursor: "pointer",
    zIndex: 9999,
  },
  fabWrapLoading: {
    position: "fixed",
    right: 16,
    bottom: 160,
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
    zIndex: 9999,
  },

  fabCircle: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: BLOCK_GRADIENT,
    boxShadow: "0 10px 24px rgba(0,0,0,.2)",
    display: "grid",
    placeItems: "center",
    fontWeight: 700,
    color: "#1b1b1b",
  },

  speechBubble: {
    maxWidth: 180,
    background: "#fff",
    boxShadow: "0 10px 24px rgba(0,0,0,.15)",
    borderRadius: 14,
    padding: "10px 12px",
    position: "relative",
    border: "1px solid rgba(0,0,0,.06)",
  },
  speechText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#1b1b1b",
    lineHeight: 1.3,
  },
  speechArrow: {
    position: "absolute",
    right: -6,
    bottom: 10,
    width: 0,
    height: 0,
    borderTop: "6px solid transparent",
    borderBottom: "6px solid transparent",
    borderLeft: "6px solid #fff",
    filter: "drop-shadow(0 2px 2px rgba(0,0,0,.1))",
  },

  chatPanelWrap: {
    position: "fixed",
    right: 16,
    bottom: 160 + 56 + 12,
    zIndex: 10000,
    maxWidth: 300,
    width: "calc(100% - 32px)",
  },
  chatPanel: {
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 24px 64px rgba(0,0,0,.4)",
    border: "1px solid rgba(0,0,0,.06)",
    maxHeight: "40vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "12px 12px 10px 12px",
    borderBottom: "1px solid rgba(0,0,0,.06)",
    background: "linear-gradient(135deg, rgba(114,135,255,.16), rgba(164,94,255,.14))",
  },
  chatHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  robotIconLarge: {
    fontSize: 20,
    lineHeight: 1,
  },
  chatTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#1b1b1b",
  },
  closeBtn: {
    background: "rgba(0,0,0,0.08)",
    border: "none",
    borderRadius: 8,
    width: 28,
    height: 28,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1,
    color: "#1b1b1b",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  },
  chatBody: {
    padding: 12,
    fontSize: 13.5,
    lineHeight: 1.4,
    color: "#1b1b1b",
    whiteSpace: "pre-wrap",
    overflowY: "auto",
  },
};

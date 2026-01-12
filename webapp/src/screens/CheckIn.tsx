import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckInForm } from "@/components/CheckInForm";
import { startWorkout, type CheckInPayload } from "@/api/plan";

function toSessionPlan(workout: any) {
  const w = workout && typeof workout === "object" ? workout : {};
  const exercises = Array.isArray(w.exercises) ? w.exercises : [];
  const sets = exercises.reduce((acc: number, ex: any) => acc + Number(ex?.sets || 0), 0);
  const duration = Number(w.estimatedDuration) || Math.max(25, Math.min(90, Math.round(sets * 3.5)));
  const title = String(w.dayLabel || w.schemeName || w.title || "Тренировка");
  const location = String(w.schemeName || "Тренировка");

  return {
    title,
    location,
    duration,
    exercises: exercises.map((ex: any) => ({
      exerciseId: ex?.exerciseId || ex?.id || undefined,
      name: String(ex?.name || ex?.exerciseName || "Упражнение"),
      sets: Number(ex?.sets) || 1,
      reps: ex?.reps || ex?.repsRange || "",
      restSec: ex?.restSec != null ? Number(ex.restSec) : undefined,
      pattern: ex?.pattern,
      weight: ex?.weight ?? null,
      loadType: ex?.loadType,
      requiresWeightInput: ex?.requiresWeightInput,
      weightLabel: ex?.weightLabel,
    })),
  };
}

export default function CheckIn() {
  const nav = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    action: "keep_day" | "swap_day" | "recovery";
    notes: string[];
    workout: any;
    swapInfo?: { from: string; to: string; reason: string[] };
  }>(null);
  const [summaryPhase, setSummaryPhase] = useState<"thinking" | "ready">("thinking");

  // Получаем параметры из navigation state (если пришли из PlanOne)
  const { workoutDate, returnTo, plannedWorkoutId } = (location.state || {}) as {
    workoutDate?: string;
    returnTo?: string;
    plannedWorkoutId?: string;
  };

  useEffect(() => {
    if (!result) return;
    setSummaryPhase("thinking");
    const t = window.setTimeout(() => setSummaryPhase("ready"), 1100);
    return () => window.clearTimeout(t);
  }, [result]);

  const summary = useMemo(() => {
    if (!result) return null;
    const notes = Array.isArray(result.notes) ? result.notes : [];
    const swap = result.swapInfo;

    if (result.action === "recovery") {
      return {
        title: "Режим восстановления",
        subtitle: notes.length ? "Мы сделали тренировку легче и безопаснее." : "Мы сделали тренировку легче и безопаснее.",
        notes: notes.length ? notes : ["Тренировка облегчена: меньше объёма и нагрузки, больше отдыха и контроля."],
      };
    }

    if (result.action === "swap_day") {
      const label = swap?.from && swap?.to ? `Сегодня: ${swap.from} → ${swap.to}` : "Мы немного переставили день тренировки.";
      return {
        title: "Тренировка адаптирована",
        subtitle: label,
        notes: notes.length ? notes : ["Тренировка переставлена внутри недели, чтобы лучше соответствовать самочувствию."],
      };
    }

    if (notes.length === 0) {
      return {
        title: "Тренировка по плану",
        subtitle: "Без изменений — можно начинать.",
        notes: [],
      };
    }

    return {
      title: "Тренировка адаптирована",
      subtitle: "Учли твой чек-ин и обновили план.",
      notes,
    };
  }, [result]);

  const goToWorkout = () => {
    if (!result) return;
    nav("/workout/session", {
      state: {
        plan: toSessionPlan(result.workout),
        plannedWorkoutId,
        isRecovery: result.action === "recovery",
        swapInfo: result.action === "swap_day" ? result.swapInfo : undefined,
        notes: result.notes,
      },
    });
  };

  const handleSubmit = async (payload: CheckInPayload) => {
    setLoading(true);
    setError(null);

    try {
      // Вызываем API для адаптации тренировки
      const response = await startWorkout({
        date: workoutDate,
        plannedWorkoutId,
        checkin: payload,
      });

      // Обрабатываем разные действия
      if (response.action === "skip") {
        // Пропустить тренировку
        alert("💤 Сегодня лучше отдохнуть.\n\n" + (response.notes?.join("\n") || ""));
        nav(returnTo || "/plan/one");
        return;
      }

      setResult({
        action: response.action,
        notes: Array.isArray(response.notes) ? response.notes : [],
        workout: response.workout,
        swapInfo: response.swapInfo,
      });
    } catch (err: any) {
      console.error("CheckIn error:", err);
      setError(err.message || "Не удалось обработать чек-ин. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Вернуться назад без чек-ина
    nav(returnTo || "/plan/one");
  };

  return (
    <div style={styles.page}>
      {!result ? (
        <>
          {/* Верхний блок с заголовком */}
          <section style={styles.heroCard}>
            <div style={styles.heroTitle}>Твоё состояние перед тренировкой</div>
            <div style={styles.heroSubtitle}>
              Расскажи как ты себя чувствуешь, и мы адаптируем тренировку под тебя
            </div>
          </section>
          <div style={{ height: 16 }} />
        </>
      ) : null}

      {!result ? (
        <CheckInForm
          onSubmit={handleSubmit}
          onBack={handleSkip}
          loading={loading}
          error={error}
          inline={true}
          submitLabel="Продолжить"
          title="Как ты сегодня? 💬"
        />
      ) : (
        <>
          <section style={styles.summaryCard}>
            <div style={styles.summaryKicker}>🧠 Анализируем чек-ин</div>

            {summaryPhase === "thinking" ? (
              <div style={styles.thinkingRow} aria-live="polite">
                <div style={styles.thinkingDot} />
                <div style={styles.thinkingText}>
                  Подстраиваем тренировку под самочувствие<span className="thinking-dots" />
                </div>
              </div>
            ) : (
              <div style={styles.summaryBody}>
                <div style={styles.summaryTitle}>{summary?.title || "Готово"}</div>
                {summary?.subtitle ? <div style={styles.summarySubtitle}>{summary.subtitle}</div> : null}

                {summary?.notes?.length ? (
                  <div style={styles.notesList}>
                    {summary.notes.slice(0, 8).map((t, i) => (
                      <div key={i} style={styles.noteItem}>
                        • {t}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <style>{thinkingCss}</style>
          </section>

          {summaryPhase === "ready" ? (
            <div style={styles.summaryFooter}>
              <button type="button" style={styles.summaryPrimaryBtn} onClick={goToWorkout} disabled={loading}>
                Начать тренировку
              </button>
              <button
                type="button"
                style={styles.summaryBackBtn}
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
                disabled={loading}
              >
                Изменить ответы
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const thinkingCss = `
@keyframes thinkingPulse {
  0% { opacity: .35; transform: scale(.92); }
  50% { opacity: 1; transform: scale(1); }
  100% { opacity: .35; transform: scale(.92); }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes thinkingDots {
  0%, 20% { content: ""; }
  40% { content: "."; }
  60% { content: ".."; }
  80%, 100% { content: "..."; }
}
.thinking-dots::after {
  content: "";
  animation: thinkingDots 1.15s steps(1, end) infinite;
}
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "16px",
    paddingBottom: "100px",
    fontFamily: "system-ui, -apple-system, 'Inter', 'Roboto', Segoe UI",
    background: "transparent",
    minHeight: "100vh",
  },
  heroCard: {
    position: "relative",
    padding: 20,
    borderRadius: 24,
    boxShadow: "0 2px 6px rgba(0,0,0,.08)",
    background: "#0f172a",
    color: "#fff",
    overflow: "hidden",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: 800,
    marginTop: 0,
    color: "#fff",
  },
  heroSubtitle: {
    opacity: 0.85,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 1.5,
    color: "rgba(255,255,255,.85)",
  },
  summaryCard: {
    position: "relative",
    padding: 18,
    borderRadius: 24,
    background: "#ffffff",
    boxShadow: "0 2px 10px rgba(15, 23, 42, .10)",
    border: "1px solid rgba(15, 23, 42, .06)",
  },
  summaryKicker: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.3,
    color: "rgba(15, 23, 42, .72)",
    textTransform: "uppercase",
  },
  thinkingRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingTop: 14,
    paddingBottom: 6,
  },
  thinkingDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    background: "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
    animation: "thinkingPulse 1.05s ease-in-out infinite",
    flex: "0 0 auto",
  },
  thinkingText: {
    fontSize: 14,
    fontWeight: 700,
    color: "rgba(15, 23, 42, .88)",
  },
  summaryBody: {
    paddingTop: 14,
    animation: "fadeInUp .35s ease-out both",
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  summarySubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 1.45,
    color: "rgba(15, 23, 42, .70)",
  },
  notesList: {
    marginTop: 12,
    display: "grid",
    gap: 8,
  },
  noteItem: {
    fontSize: 14,
    lineHeight: 1.4,
    color: "rgba(15, 23, 42, .84)",
  },
  summaryFooter: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  summaryPrimaryBtn: {
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
  summaryBackBtn: {
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
};

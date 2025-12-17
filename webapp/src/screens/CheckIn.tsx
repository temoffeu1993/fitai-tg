import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckInForm } from "@/components/CheckInForm";
import { startWorkout, type CheckInPayload } from "@/api/plan";

export default function CheckIn() {
  const nav = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Получаем параметры из navigation state (если пришли из PlanOne)
  const { workoutDate, returnTo } = (location.state || {}) as {
    workoutDate?: string;
    returnTo?: string;
  };

  const handleSubmit = async (payload: CheckInPayload) => {
    setLoading(true);
    setError(null);

    try {
      // Вызываем API для адаптации тренировки
      const response = await startWorkout({
        date: workoutDate,
        checkin: payload,
      });

      // Обрабатываем разные действия
      if (response.action === "skip") {
        // Пропустить тренировку
        alert("💤 Сегодня лучше отдохнуть.\n\n" + (response.notes?.join("\n") || ""));
        nav(returnTo || "/plan/one");
      } else if (response.action === "recovery") {
        // Recovery session
        nav("/workout/session", {
          state: {
            workout: response.workout,
            isRecovery: true,
            notes: response.notes,
          },
        });
      } else if (response.action === "swap_day") {
        // Swapped day
        nav("/workout/session", {
          state: {
            workout: response.workout,
            swapInfo: response.swapInfo,
            notes: response.notes,
          },
        });
      } else {
        // Keep day (обычная тренировка)
        nav("/workout/session", {
          state: {
            workout: response.workout,
            notes: response.notes,
          },
        });
      }
    } catch (err: any) {
      console.error("CheckIn error:", err);
      setError(err.message || "Не удалось обработать чек-ин. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Вернуться назад без чек-ина (начать тренировку как есть)
    nav(returnTo || "/plan/one");
  };

  return (
    <div style={styles.page}>
      <CheckInForm
        onSubmit={handleSubmit}
        onSkip={handleSkip}
        loading={loading}
        error={error}
        inline={true}
        showSkip={true}
        submitLabel="Начать тренировку"
        title="Как ты сегодня? 💬"
      />
    </div>
  );
}

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
};

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
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={() => nav(-1)} style={styles.backBtn}>
          ← Назад
        </button>
        <h1 style={styles.title}>Чек-ин перед тренировкой</h1>
      </div>

      <CheckInForm
        onSubmit={handleSubmit}
        onSkip={handleSkip}
        loading={loading}
        error={error}
        inline={true}
        showSkip={true}
        submitLabel="Начать тренировку"
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
    paddingBottom: "40px",
  },
  header: {
    marginBottom: "20px",
  },
  backBtn: {
    background: "rgba(255,255,255,0.2)",
    border: "1px solid rgba(255,255,255,0.3)",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "12px",
    fontSize: "15px",
    fontWeight: "500",
    cursor: "pointer",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    marginBottom: "12px",
  },
  title: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#fff",
    margin: 0,
    textShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
};

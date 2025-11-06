// webapp/src/screens/WorkoutsPlan.tsx
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { generatePlan } from "../api";

export default function WorkoutsPlan({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const { plan, setPlan, setChips, setLastWorkoutId } = useStore();
  const [loading, setLoading] = useState(!plan);

  useEffect(() => {
    if (plan) return;
    setLoading(true);
    generatePlan()
      .then(({ workoutId, plan }) => {
        setPlan(plan);
        setLastWorkoutId(workoutId);
        // простые чипы: время и сеты, ккал приблизительно
        const sets = plan.items.reduce((a: number, x: any) => a + (x.sets || 0), 0);
        const minutes = Math.max(25, Math.min(90, Math.round(sets * 3.5))); // грубо
        const kcal = Math.round(minutes * 6); // 6 ккал/мин как при умеренной силовой
        setChips({ sets, minutes, kcal });
      })
      .finally(() => setLoading(false));
  }, [plan, setPlan, setChips, setLastWorkoutId]);

  if (loading) {
    return (
      <div style={box}>
        <button onClick={onBack} style={back}>← Назад</button>
        <h3>Генерируем тренировку…</h3>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={box}>
        <button onClick={onBack} style={back}>← Назад</button>
        <h3>Не удалось создать план</h3>
      </div>
    );
  }

  return (
    <div style={box}>
      <button onClick={onBack} style={back}>← Назад</button>
      <h2 style={{ marginTop: 0 }}>{plan.title}</h2>
      <ul style={{ paddingLeft: 18 }}>
        {plan.items.map((it, i) => (
          <li key={i} style={{ marginBottom: 8 }}>
            <b>{it.name}</b> — {it.sets}×{it.reps}
          </li>
        ))}
      </ul>
      {plan.cues && <div style={{ opacity: 0.8, marginTop: 8 }}>{plan.cues}</div>}

      <button style={primary} onClick={onStart}>Начать тренировку</button>
    </div>
  );
}

const box: React.CSSProperties = { maxWidth: 720, margin: "0 auto", padding: 16 };
const back: React.CSSProperties = { border: "none", background: "transparent", padding: 0, marginBottom: 8, fontSize: 16 };
const primary: React.CSSProperties = { marginTop: 16, width: "100%", padding: "14px 16px", borderRadius: 14, border: "none", background: "#0088cc", color: "#fff", fontWeight: 700, fontSize: 16 };
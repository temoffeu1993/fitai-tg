// webapp/src/api.ts
const API = import.meta.env.VITE_API_URL!;
const token = () => localStorage.getItem("token") || "";

export async function getOnbSummary() {
  const r = await fetch(`${API}/onboarding/summary`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!r.ok) return null;
  return r.json(); // { summary }
}

export async function generatePlan() {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${import.meta.env.VITE_API_URL}/plan/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    credentials: "include",
    body: JSON.stringify({ data: JSON.parse(localStorage.getItem("onb_summary")||"{}") })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "plan_failed");
  // сервер отдаёт { plan, used? }
  return { workoutId: crypto.randomUUID(), plan: j.plan };
}

export async function saveWorkoutResult(workoutId: string, result: any) {
  const r = await fetch(`${API}/workout/saveResult`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ workoutId, result }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
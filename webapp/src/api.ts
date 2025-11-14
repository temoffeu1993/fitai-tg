// webapp/src/api.ts
import {
  generatePlan as requestWorkoutPlan,
  getCurrentPlan,
  checkPlanStatus,
  type WorkoutPlanResponse,
} from "./api/plan";

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
  const cached = await getCurrentPlan().catch((err: any) => {
    if (err?.status === 404) return null;
    throw err;
  });

  if (cached?.meta?.status === "ready" && cached.plan) {
    return { workoutId: cached.meta?.planId || crypto.randomUUID(), plan: cached.plan };
  }

  let resp: WorkoutPlanResponse | null = await requestWorkoutPlan();

  if (resp?.meta?.status === "processing" && resp.meta.planId) {
    resp = await waitForPlanReady(resp.meta.planId);
  }

  if (!resp?.plan) {
    throw new Error("plan_failed");
  }

  return { workoutId: resp.meta?.planId || crypto.randomUUID(), plan: resp.plan };
}

async function waitForPlanReady(planId: string) {
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const resp = await checkPlanStatus(planId);
    if (resp.meta?.status === "ready") {
      return resp;
    }
    if (resp.meta?.status === "failed") {
      throw new Error(resp.meta?.error || "plan_failed");
    }
  }
  throw new Error("plan_timeout");
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

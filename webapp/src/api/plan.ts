import { apiFetch } from "@/lib/apiClient";

// webapp/src/api/plan.ts

export async function generatePlan(onboarding: any) {
  console.log("== GENERATE PLAN REQUEST PAYLOAD ==", onboarding);

  const r = await apiFetch("/plan/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ payload: onboarding }),
  });

  const text = await r.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    console.warn("== GENERATE PLAN: invalid JSON response ==", text);
  }

  console.log("== GENERATE PLAN RAW RESPONSE ==", text);

  if (!r.ok) {
    const msg = data?.detail || data?.message || text || `HTTP ${r.status}`;
    console.error("== GENERATE PLAN SERVER ERROR ==", msg);
    throw new Error(msg);
  }

  if (!data?.plan) {
    console.error("== GENERATE PLAN: no plan in response ==", data);
    throw new Error("no_plan_in_response");
  }

  console.log("== GENERATE PLAN SUCCESS ==", data.plan);
  return data.plan;
}

export async function saveSession(payload: any, opts: { plannedWorkoutId?: string } = {}) {
  console.log("== SAVE SESSION PAYLOAD ==", payload, opts);

  const body: any = { payload };
  if (opts.plannedWorkoutId) body.plannedWorkoutId = opts.plannedWorkoutId;

  const r = await apiFetch("/plan/save-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const text = await r.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    console.warn("== SAVE SESSION: invalid JSON response ==", text);
  }

  if (!r.ok) {
    const msg = data?.detail || data?.message || text || `HTTP ${r.status}`;
    console.error("== SAVE SESSION SERVER ERROR ==", msg);
    throw new Error(msg);
  }

  console.log("== SAVE SESSION SUCCESS ==", data);
  return data;
}

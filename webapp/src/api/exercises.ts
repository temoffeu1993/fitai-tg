import { apiFetch } from "@/lib/apiClient";

export type ExerciseAlternative = {
  exerciseId: string;
  name: string;
  hint?: string;
  suggestedWeight?: number | null;
  equipment?: string[];
  patterns?: string[];
  primaryMuscles?: string[];
  kind?: string;
  loadType?: "bodyweight" | "external" | "assisted";
  requiresWeightInput?: boolean;
  weightLabel?: string;
};

export async function getExerciseAlternatives(args: {
  exerciseId: string;
  reason?: string;
  limit?: number;
}): Promise<{ ok: boolean; original: any; alternatives: ExerciseAlternative[] }> {
  const q = new URLSearchParams();
  if (args.reason) q.set("reason", args.reason);
  if (args.limit) q.set("limit", String(args.limit));

  const r = await apiFetch(`/plan/exercises/${encodeURIComponent(args.exerciseId)}/alternatives?${q.toString()}`);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || "failed_to_get_alternatives");
  }
  return r.json();
}

export async function getExcludedExercises(): Promise<string[]> {
  const r = await apiFetch("/profile/excluded-exercises");
  if (!r.ok) throw new Error("failed_to_get_excluded_exercises");
  const data = await r.json();
  return Array.isArray(data?.excludedExerciseIds) ? data.excludedExerciseIds : [];
}

export async function getExcludedExerciseDetails(): Promise<Array<{ exerciseId: string; name: string }>> {
  const r = await apiFetch("/profile/excluded-exercises/details");
  if (!r.ok) throw new Error("failed_to_get_excluded_exercise_details");
  const data = await r.json();
  return Array.isArray(data?.excluded) ? data.excluded : [];
}

export async function searchExercises(args: { q: string; limit?: number }) {
  const q = new URLSearchParams();
  q.set("q", args.q);
  if (args.limit) q.set("limit", String(args.limit));
  const r = await apiFetch(`/plan/exercises/search?${q.toString()}`);
  if (!r.ok) throw new Error("failed_to_search_exercises");
  return r.json() as Promise<{ ok: boolean; items: Array<{ exerciseId: string; name: string }> }>;
}

export async function excludeExercise(args: { exerciseId: string; reason?: string; source?: string }) {
  const r = await apiFetch("/profile/excluded-exercises", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exerciseId: args.exerciseId, reason: args.reason || null, source: args.source || "user" }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || "failed_to_exclude_exercise");
  }
  return r.json();
}

export async function includeExercise(args: { exerciseId: string }) {
  const r = await apiFetch(`/profile/excluded-exercises/${encodeURIComponent(args.exerciseId)}`, {
    method: "DELETE",
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || "failed_to_include_exercise");
  }
  return r.json();
}

// webapp/src/api/nutrition.ts
export async function getCurrentWeek() {
  const r = await fetch("/api/nutrition/current-week");
  if (!r.ok) throw new Error("current-week failed");
  return r.json();
}
export async function generateWeek() {
  const r = await fetch("/api/nutrition/generate-week", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!r.ok) throw new Error("generate-week failed");
  return r.json();
}

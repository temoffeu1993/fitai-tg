// webapp/src/api/onboarding.ts
export async function saveOnboarding(payload: unknown) {
  const token = localStorage.getItem("token") || "";
  const res = await fetch("/onboarding/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    },
    body: JSON.stringify({ data: payload }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Onboarding save failed: ${res.status} ${text}`);
  }
  const json = await res.json().catch(() => ({}));
  // сервер вернёт summary, если нет — используем payload
  return json?.summary ?? payload;
}
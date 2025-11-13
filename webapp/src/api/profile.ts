import { apiFetch } from "@/lib/apiClient";

export async function resetProfileRemote(): Promise<void> {
  const resp = await apiFetch("/profile/reset", { method: "POST" });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(body || "reset_failed");
  }
}

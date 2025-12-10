import { apiFetch } from "@/lib/apiClient";

export type WorkoutScheme = {
  id: string;
  name: string;
  russianName?: string; // понятное название на русском
  description: string;
  daysPerWeek: number;
  minMinutes: number;
  maxMinutes: number;
  splitType: string;
  experienceLevels: string[];
  goals: string[];
  equipmentRequired: string[];
  dayLabels: Array<{ day: number; label: string; focus: string }>;
  benefits: string[];
  notes?: string;
  intensity: "low" | "moderate" | "high";
  targetSex?: "male" | "female" | "any";
  reason?: string;
  isRecommended?: boolean;
};

export type SchemeRecommendations = {
  recommended: WorkoutScheme;
  alternatives: WorkoutScheme[];
};

export async function getSchemeRecommendations(): Promise<SchemeRecommendations> {
  const token = localStorage.getItem("token") || "";
  const res = await apiFetch("/schemes/recommend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    },
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get recommendations: ${res.status} ${text}`);
  }
  
  return res.json();
}

export async function selectScheme(schemeId: string): Promise<void> {
  const token = localStorage.getItem("token") || "";
  const res = await apiFetch("/schemes/select", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    },
    body: JSON.stringify({ schemeId }),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to select scheme: ${res.status} ${text}`);
  }
}

export async function getSelectedScheme(): Promise<WorkoutScheme | null> {
  const token = localStorage.getItem("token") || "";
  const res = await apiFetch("/schemes/selected", {
    method: "GET",
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  });
  
  if (!res.ok) {
    return null;
  }
  
  const data = await res.json();
  return data.scheme || null;
}

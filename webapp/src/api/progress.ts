export type ProgressSummary = {
  stats: {
    currentWeightKg: number | null;
    weightDelta30d: number | null;
    workoutsTotal: number;
    workoutsDelta30d: number;
    caloriesPerDay: number | null;
    caloriesStatus: "normal" | "deficit" | "surplus" | "none";
    daysWithApp: number;
    planWeeklyGoal: number | null;
    planSeriesCurrent: number;
    planSeriesBest: number;
    dayStreakCurrent: number;
    dayStreakBest: number;
  };
  weightSeries: Array<{ date: string; weight: number }>;
  activity: {
    days: Array<{ date: string; completed: boolean }>;
    weeks: Array<{ label: string; days: Array<{ date: string; completed: boolean }> }>;
    dayStreakCurrent: number;
    dayStreakBest: number;
    planSeriesCurrent: number;
    planSeriesBest: number;
    completedThisWeek: number;
    weeklyGoal: number | null;
    completedThisMonth: number;
    daysInMonth: number;
    totalAllTime: number;
  };
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    icon: string;
    value?: string | null;
    earnedAt?: string | null;
    category: "strength" | "consistency" | "volume" | "nutrition" | "milestone";
  }>;
};

export async function getProgressSummary(): Promise<ProgressSummary> {
  const r = await fetch("/api/progress/summary", { credentials: "include" });
  if (!r.ok) throw new Error("failed_to_load_progress");
  return r.json();
}

export async function saveBodyMetric(input: { recordedAt?: string; weight?: number; bodyFat?: number; muscleMass?: number; notes?: string }) {
  const r = await fetch("/api/progress/body-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error("failed_to_save_body_metric");
  return r.json();
}

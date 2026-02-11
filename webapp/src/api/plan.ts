import { apiFetch } from "@/lib/apiClient";

export type PlanStatus = "processing" | "ready" | "failed";

export type WorkoutPlanResponse<TPlan = any> = {
  plan: TPlan | null;
  analysis?: any | null;
  meta?: {
    status?: PlanStatus | null;
    planId?: string | null;
    error?: string | null;
    progress?: number | null;
    progressStage?: string | null;
  };
};

async function parseJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error: any = new Error(`${label}_failed`);
    error.status = res.status;
    if (body) {
      try {
        error.body = JSON.parse(body);
      } catch {
        error.body = body;
      }
    }
    throw error;
  }
  return res.json();
}

export async function getCurrentPlan<T = any>(): Promise<WorkoutPlanResponse<T>> {
  const res = await apiFetch("/plan/current");
  return parseJson(res, "current_plan");
}

export async function generatePlan<T = any>(
  opts: { force?: boolean } = {}
): Promise<WorkoutPlanResponse<T>> {
  const res = await apiFetch("/plan/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: Boolean(opts.force) }),
  });
  return parseJson(res, "generate_plan");
}

export async function checkPlanStatus<T = any>(planId: string): Promise<WorkoutPlanResponse<T>> {
  const res = await apiFetch(`/plan/status/${planId}`);
  return parseJson(res, "plan_status");
}

// НОВЫЙ чек-ин: структурированный, без лишних полей
export type SleepQuality = "poor" | "fair" | "ok" | "good" | "excellent";

export type PainLocation =
  | "shoulder"
  | "elbow"
  | "wrist"
  | "neck"
  | "lower_back"
  | "hip"
  | "knee"
  | "ankle";

export type PainEntry = {
  location: PainLocation;
  level: number; // 1-10
};

export type CheckInPayload = {
  sleepQuality?: SleepQuality;           // НОВОЕ: один вопрос вместо sleepHours + sleepQuality
  energyLevel?: "low" | "medium" | "high";
  stressLevel?: "low" | "medium" | "high" | "very_high";
  availableMinutes?: number;              // 40-90
  pain?: PainEntry[];                     // НОВОЕ: структурированная боль вместо injuries
  notes?: string;                         // опционально
  
  // УДАЛЕНО: sleepHours, injuries, limitations, motivation, mood, 
  // menstrualPhase, menstrualSymptoms, hydration, lastMeal
};

export async function submitCheckIn(payload: CheckInPayload) {
  const res = await apiFetch("/plan/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<{ success: boolean; checkInId: string; createdAt: string }>(res, "check_in");
}

export async function getLatestCheckIn() {
  const res = await apiFetch("/plan/check-in/latest");
  return parseJson(res, "latest_check_in");
}

export type StartWorkoutResponse = {
  action: "keep_day" | "swap_day" | "recovery" | "skip";
  notes?: string[];
  summary?: {
    version?: number;
    changed: boolean;
    changeNotes: string[];
    infoNotes: string[];
    warnings?: string[];
    severity?: "low" | "medium" | "high" | "critical";
    whatChanged?: string;
    why?: string;
    howToTrainToday?: string;
    changeMeta?: {
      volumeAdjusted?: boolean;
      deload?: boolean;
      shortenedForTime?: boolean;
      trimmedForCaps?: boolean;
      intentAdjusted?: boolean;
      safetyAdjusted?: boolean;
      corePolicyAdjusted?: boolean;
    };
    diff?: {
      setsDelta: number;
      durationDelta: number | null;
      addedCount: number;
      removedCount: number;
      replacedCount?: number;
      volumeDeltaPct?: number | null;
      durationDeltaPct?: number | null;
      beforeSets?: number;
      afterSets?: number;
      beforeDuration?: number | null;
      afterDuration?: number | null;
      structureChanged?: boolean;
    };
  };
  workout?: any;
  swapInfo?: { from: string; to: string; reason: string[] };
};

export async function startWorkout(payload: {
  date?: string;
  checkin?: CheckInPayload;
  plannedWorkoutId?: string;
}) {
  const res = await apiFetch("/plan/workout/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<StartWorkoutResponse>(res, "start_workout");
}

export async function getMesocycleCurrent() {
  const res = await apiFetch("/plan/mesocycle/current");
  return parseJson<{ success: boolean; mesocycle: any }>(res, "mesocycle_current");
}

export async function saveSession(
  payload: any,
  opts: { plannedWorkoutId?: string; startedAt?: string; durationMin?: number } = {}
) {
  const body: Record<string, any> = { payload };
  if (opts.plannedWorkoutId) body.plannedWorkoutId = opts.plannedWorkoutId;
  if (opts.startedAt) body.startedAt = opts.startedAt;
  if (opts.durationMin) body.durationMin = opts.durationMin;

  const res = await apiFetch("/plan/save-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res, "save_session");
}

export async function getProgressionJob(jobId: string) {
  const res = await apiFetch(`/plan/progression/jobs/${jobId}`);
  return parseJson<{ ok: boolean; job: any }>(res, "progression_job");
}

export async function getCoachJob(jobId: string) {
  const res = await apiFetch(`/plan/coach/jobs/${jobId}`);
  return parseJson<{ ok: boolean; job: any }>(res, "coach_job");
}

export async function getCoachSessionReport(sessionId: string) {
  const res = await apiFetch(`/plan/coach/session/${sessionId}`);
  return parseJson<{ ok: boolean; found: boolean; report?: any }>(res, "coach_session");
}

export async function getLatestWeeklyCoachReport() {
  const res = await apiFetch(`/plan/coach/weekly/latest`);
  return parseJson<{ ok: boolean; found: boolean; report?: any }>(res, "coach_weekly_latest");
}

export async function getWorkoutSessionById(sessionId: string) {
  const res = await apiFetch(`/plan/sessions/${sessionId}`);
  return parseJson<{ ok: boolean; session: any; progressionJob?: any | null; coachReport?: any | null }>(
    res,
    "session_by_id"
  );
}

export async function getCoachChatHistory(limit = 40) {
  const res = await apiFetch(`/plan/coach/chat/history?limit=${encodeURIComponent(String(limit))}`);
  return parseJson<{ ok: boolean; messages: Array<{ id: string; role: string; content: string; createdAt: string }> }>(
    res,
    "coach_chat_history"
  );
}

export async function sendCoachChat(message: string) {
  const res = await apiFetch(`/plan/coach/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return parseJson<{ ok: boolean; threadId: string; userMessage: any; assistantMessage: any }>(res, "coach_chat_send");
}

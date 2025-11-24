import { useCallback, useEffect, useState } from "react";
import {
  generatePlanBlock,
  type WorkoutPlanResponse,
  type PlanStatus,
} from "@/api/plan";

const WORKOUT_CACHE_KEY = "plan_cache_v2";

export type UseWorkoutPlanResult<TPlan> = {
  plan: TPlan | null;
  plans: TPlan[];
  analysis: any | null;
  status: PlanStatus | null;
  planId: string | null;
  error: string | null;
  metaError: string | null;
  loading: boolean;
  polling: boolean;
  serverProgress: number | null;
  progressStage: string | null;
  regenerate: () => Promise<void>;
  refresh: (opts?: { force?: boolean; silent?: boolean }) => Promise<void>;
};

export function useWorkoutPlan<TPlan = any>(): UseWorkoutPlanResult<TPlan> {
  const [plan, setPlan] = useState<TPlan | null>(null);
  const [plans, setPlans] = useState<TPlan[]>([]);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [serverProgress, setServerProgress] = useState<number | null>(null);
  const [progressStage, setProgressStage] = useState<string | null>(null);

  const applyResponse = useCallback(
    (resp?: WorkoutPlanResponse<TPlan>, opts?: { keepPlan?: boolean }) => {
      if (!resp) return;
      const meta = resp.meta ?? {};
      const nextStatus = (meta.status ?? null) as PlanStatus | null;
      setStatus(nextStatus);
      setPlanId(meta.planId ?? null);
      setServerProgress(typeof meta.progress === "number" ? meta.progress : null);
      setProgressStage(meta.progressStage ?? null);
      setMetaError(meta.error ?? null);

      if (nextStatus === "ready" && resp.plan) {
        setPlan(resp.plan);
        setPlans([resp.plan]);
        setAnalysis(resp.analysis ?? null);
        try {
          localStorage.setItem(
            WORKOUT_CACHE_KEY,
            JSON.stringify({ plan: resp.plan, analysis: resp.analysis ?? null, ts: Date.now() })
          );
        } catch {}
        setError(null);
        setLoading(false);
      } else if (nextStatus === "failed") {
        if (!opts?.keepPlan) {
          setPlan(null);
          setPlans([]);
          setAnalysis(null);
        }
        try {
          localStorage.removeItem(WORKOUT_CACHE_KEY);
        } catch {}
        setLoading(false);
      } else if (nextStatus === "processing" && !opts?.keepPlan) {
        setPlan(null);
        setAnalysis(null);
        try {
          localStorage.removeItem(WORKOUT_CACHE_KEY);
        } catch {}
      }
    },
    []
  );

  const refresh = useCallback(
    async (opts?: { force?: boolean; silent?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        // Всегда генерируем блок из 3 тренировок, чтобы отдать связку
        const block = await generatePlanBlock<TPlan>({ daysInBlock: 3 });
        const first = block.plans?.[0];

        if (first?.plan) {
          setPlan(first.plan);
          setPlans(block.plans.map((p) => p.plan!).filter(Boolean));
          setAnalysis(first.analysis ?? null);
          const meta = first.meta ?? {};
          setStatus((meta.status ?? "ready") as PlanStatus);
          setPlanId(meta.planId ?? null);
          setServerProgress(typeof meta.progress === "number" ? meta.progress : null);
          setProgressStage(meta.progressStage ?? null);
          setMetaError(meta.error ?? null);
          setError(null);
          setLoading(false);
        } else {
          throw new Error("empty_block");
        }
      } catch (err) {
        console.error("Workout plan request failed", err);
        if (!silent) {
          setError("Не удалось получить план");
          setLoading(false);
        }
        throw err;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    let hasCache = false;
    try {
      const raw = localStorage.getItem(WORKOUT_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.plan) {
          setPlan(cached.plan);
          setAnalysis(cached.analysis ?? null);
          setStatus("ready");
          hasCache = true;
          setLoading(false);
        }
      }
    } catch {
      // ignore
    }

    refresh({ silent: hasCache }).catch(() => {
      if (!hasCache) setLoading(false);
    });
  }, [refresh]);

  const regenerate = useCallback(async () => {
    try {
      await refresh({ force: true });
    } catch {
      // error already handled in refresh
    }
  }, [refresh]);

  return {
    plan,
    plans,
    analysis,
    status,
    planId,
    error,
    metaError,
    loading,
    polling,
    serverProgress,
    progressStage,
    regenerate,
    refresh,
  };
}

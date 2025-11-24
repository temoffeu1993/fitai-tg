import { useCallback, useEffect, useState } from "react";
import {
  generatePlan,
  getCurrentPlan,
  checkPlanStatus,
  type WorkoutPlanResponse,
  type PlanStatus,
} from "@/api/plan";

const WORKOUT_CACHE_KEY = "plan_cache_v2";

export type UseWorkoutPlanResult<TPlan> = {
  plan: TPlan | null;
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
        let resp: WorkoutPlanResponse<TPlan>;
        if (opts?.force) {
          resp = await generatePlan<TPlan>({ force: true });
        } else {
          try {
            resp = await getCurrentPlan<TPlan>();
          } catch (err: any) {
            if (err?.status === 404) {
              resp = await generatePlan<TPlan>();
            } else {
              throw err;
            }
          }
        }
        applyResponse(resp);
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
    [applyResponse]
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

  useEffect(() => {
    if (status !== "processing" || !planId) {
      setPolling(false);
      return;
    }

    setPolling(true);
    let cancelled = false;

    const tick = async () => {
      try {
        const resp = await checkPlanStatus<TPlan>(planId);
        applyResponse(resp, { keepPlan: true });
        if (resp.meta?.status !== "processing" && !cancelled) {
          setPolling(false);
          setLoading(false);
          return true;
        }
      } catch (err: any) {
        if (err?.status === 404 && !cancelled) {
          setPolling(false);
          return true;
        }
      }
      return false;
    };

    const interval = setInterval(tick, 4000);
    tick();

    return () => {
      cancelled = true;
      clearInterval(interval);
      setPolling(false);
    };
  }, [status, planId, applyResponse]);

  const regenerate = useCallback(async () => {
    try {
      await refresh({ force: true });
    } catch {
      // error already handled in refresh
    }
  }, [refresh]);

  return {
    plan,
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

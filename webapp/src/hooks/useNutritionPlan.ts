import { useCallback, useEffect, useState } from "react";
import { generateWeek, getCurrentWeek, type NutritionPlanResponse, type PlanStatus } from "@/api/nutrition";

export const NUTRITION_CACHE_KEY = "nutrition_week_cache_v2";

type NormalizeFn<TPlan> = (plan: TPlan) => TPlan | void;

export type UseNutritionPlanResult<TPlan> = {
  plan: TPlan | null;
  status: PlanStatus | null;
  metaError: string | null;
  error: string | null;
  loading: boolean;
  polling: boolean;
  refresh: (opts?: { force?: boolean; silent?: boolean }) => Promise<void>;
  regenerate: () => Promise<void>;
};

export function useNutritionPlan<TPlan>(options: {
  cacheKey?: string;
  normalize: NormalizeFn<TPlan>;
  errorMessage?: string;
}): UseNutritionPlanResult<TPlan> {
  const cacheKey = options.cacheKey || NUTRITION_CACHE_KEY;
  const normalizePlan = options.normalize;
  const errorMessage = options.errorMessage || "Не удалось получить план питания";
  const [plan, setPlan] = useState<TPlan | null>(null);
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  const applyPlanResponse = useCallback(
    (resp?: NutritionPlanResponse<TPlan>, opts?: { keepPlan?: boolean }) => {
      if (!resp?.plan) throw new Error("plan_missing");
      const copy = deepClone(resp.plan);
      const normalized = (normalizePlan(copy) as TPlan | void) ?? copy;
      const nextStatus: PlanStatus = resp.meta?.status ?? "ready";
      setStatus(nextStatus);
      const err = resp.meta?.error ?? null;
      setMetaError(err);

      if (nextStatus === "ready") {
        setPlan(normalized);
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ plan: normalized, status: nextStatus, ts: Date.now() })
          );
        } catch {
          // ignore quota errors
        }
      } else {
        if (!opts?.keepPlan) {
          setPlan(null);
        }
        try {
          localStorage.removeItem(cacheKey);
        } catch {
          // ignore
        }
      }
    },
    [cacheKey, normalizePlan]
  );

  const refresh = useCallback(
    async (opts?: { force?: boolean; silent?: boolean; clearPlan?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        if (opts?.clearPlan) {
          setPlan(null);
          try {
            localStorage.removeItem(cacheKey);
          } catch {
            // ignore
          }
        }
        let resp: NutritionPlanResponse<TPlan>;
        if (opts?.force) {
          resp = await generateWeek<TPlan>({ force: true });
        } else {
          try {
            resp = await getCurrentWeek<TPlan>();
          } catch (err: any) {
            if (err?.status === 404) {
              resp = await generateWeek<TPlan>();
            } else {
              throw err;
            }
          }
        }
        applyPlanResponse(resp);
      } catch (err: any) {
        if (!silent) {
          console.error(err);
          const msg = err?.userMessage || err?.message || errorMessage;
          setError(msg);
        }
        throw err;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [applyPlanResponse, errorMessage]
  );

  useEffect(() => {
    let hasCache = false;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.plan) {
          const normalized = (normalizePlan(cached.plan) as TPlan | void) ?? cached.plan;
          if (cached.status === "ready") {
            setPlan(normalized);
            setStatus("ready");
            setLoading(false);
            hasCache = true;
          }
        }
      }
    } catch {
      // ignore corrupted cache
    }

    refresh({ silent: hasCache }).catch(() => {
      if (!hasCache) setLoading(false);
    });
  }, [cacheKey, refresh]);

  useEffect(() => {
    if (status !== "processing") {
      setPolling(false);
      return;
    }

    setPolling(true);
    let cancelled = false;

    const tick = async () => {
      try {
        const resp = await getCurrentWeek<TPlan>();
        applyPlanResponse(resp, { keepPlan: true });
        const nextStatus: PlanStatus = resp.meta?.status ?? "ready";
        if (nextStatus !== "processing" && !cancelled) {
          setPolling(false);
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

    const interval = setInterval(() => {
      tick();
    }, 5000);
    tick();

    return () => {
      cancelled = true;
      clearInterval(interval);
      setPolling(false);
    };
  }, [status, applyPlanResponse]);

  const regenerate = useCallback(
    () => refresh({ force: true, clearPlan: false }),
    [refresh]
  );

  return {
    plan,
    status,
    metaError,
    error,
    loading,
    polling,
    refresh,
    regenerate,
  };
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

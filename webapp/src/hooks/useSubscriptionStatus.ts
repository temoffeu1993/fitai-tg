import { useEffect, useState } from "react";
import { getSubscriptionStatus, type SubscriptionInfo } from "@/api/subscription";

export function useSubscriptionStatus() {
  const [data, setData] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getSubscriptionStatus()
      .then((r) => {
        if (!mounted) return;
        setData(r);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("subscription status failed", err);
        setError("Не удалось получить статус подписки");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const locked = data?.status === "none";
  const reason =
    locked && !error
      ? "Доступ к генерации по подписке. Оформи премиум, чтобы продолжить."
      : error;

  return { data, loading, error, locked, reason };
}

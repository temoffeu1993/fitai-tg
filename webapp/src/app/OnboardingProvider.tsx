import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type Draft = Record<string, any>;

type Ctx = {
  draft: Draft;
  patch: (p: Draft) => void;
  reset: () => void;
};

const OnbCtx = createContext<Ctx | null>(null);

const KEY = "onb_draft_v1";

export default function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<Draft>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch {}
  }, [draft]);

  const value = useMemo<Ctx>(
    () => ({
      draft,
      patch: (p) => setDraft((prev) => ({ ...prev, ...p })),
      reset: () => setDraft({}),
    }),
    [draft]
  );

  return <OnbCtx.Provider value={value}>{children}</OnbCtx.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnbCtx);
  if (!ctx) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return ctx;
}
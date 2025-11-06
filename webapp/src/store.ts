// webapp/src/store.ts
import { create } from "zustand";

export type Screen = "dashboard" | "plan" | "session" | "onboarding";

// Продвинутый план одной тренировки для UI
export type UIPlan = {
  title: string;
  duration: number;
  location: string;
  warmup: string[];
  exercises: Array<{
    name: string;
    sets: number;
    reps: string | number;
    restSec?: number;
    cues?: string;
  }>;
  cooldown: string[];
};

// Короткие метрики для чипов
export type Chips = { sets: number; minutes: number; kcal: number };

type State = {
  screen: Screen;
  setScreen: (s: Screen) => void;

  onboardingReady: boolean;
  setOnboardingReady: (v: boolean) => void;

  plan: UIPlan | null;
  setPlan: (p: UIPlan | null) => void;

  // чипы дашборда
  chips: { kcal: number | null; minutes: number | null; sets: number | null };
  setChips: (c: Partial<State["chips"]>) => void;

  lastWorkoutId: string | null;
  setLastWorkoutId: (id: string | null) => void;
};

export const useStore = create<State>((set) => ({
  screen: "dashboard",
  setScreen: (s) => set({ screen: s }),

  onboardingReady: false,
  setOnboardingReady: (v) => set({ onboardingReady: v }),

  plan: null,
  setPlan: (p) => set({ plan: p }),

  chips: { kcal: null, minutes: null, sets: null },
  setChips: (c) => set((s) => ({ chips: { ...s.chips, ...c } })),

  lastWorkoutId: null,
  setLastWorkoutId: (id) => set({ lastWorkoutId: id }),
}));
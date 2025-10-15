import { create } from "zustand";
import type { Onboarding, WorkoutPlan } from "./types";

type S = {
  token?: string;
  onboarding?: Partial<Onboarding>;
  workoutId?: string;
  plan?: WorkoutPlan;
  setToken:(t:string)=>void;
  setOnb:(p:Partial<Onboarding>)=>void;
  setPlan:(id:string, p:WorkoutPlan)=>void;
};
export const useApp = create<S>((set)=>({
  setToken:(t)=>set({token:t}),
  setOnb:(p)=>set(s=>({onboarding:{...s.onboarding,...p}})),
  setPlan:(id,p)=>set({workoutId:id, plan:p}),
}));
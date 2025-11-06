import { Request } from "express";

export interface AuthRequest extends Request {
  user?: { uid: string; tg: number; iat?: number; exp?: number };
}

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export type Sex = "m" | "f";
export type Experience = "novice" | "intermediate" | "advanced";

export interface OnboardingData {
  age?: number;
  sex?: Sex;
  height?: number;
  weight?: number;
  goal?: string;
  experience?: Experience;
  freq?: number;
  duration?: number;
  location?: string;
  equipment?: string[];
  limitations?: string[];
}

export interface WorkoutPlan {
  title: string;
  items: Array<{ name: string; sets: number; reps: string }>; // reps: "8–12"
  cues?: string;
}

export interface WorkoutResult {
  completed: boolean;
  exercises: Array<{
    name: string;
    sets: Array<{ reps: number; weight?: number }>;
  }>;
  notes?: string;
}

export interface DatabaseUser {
  id: string;
  tg_id: number;
  first_name?: string;
  username?: string;
  created_at: string;   // из pg как текст по умолчанию
  updated_at?: string;
}

export interface DatabaseOnboarding {
  id: string;
  user_id: string;
  data: OnboardingData;
  created_at: string;
  updated_at?: string;
}

export interface DatabaseWorkout {
  id: string;
  user_id: string;
  plan: WorkoutPlan;
  result?: WorkoutResult | null;
  created_at: string;
  updated_at?: string;
}

/* Опционально: тела запросов */
export interface AuthTelegramBody { initData: string }
export interface SaveOnboardingBody { data: OnboardingData }

export type DowSchedule = { [dow: string]: { enabled: boolean; time: string } };
export type DateSchedule = { [isoDate: string]: { time: string } };
export interface WorkoutSchedulePayload {
  dow?: DowSchedule;
  dates?: DateSchedule;
}

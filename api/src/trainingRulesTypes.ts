// Новые типы правил тренировки (вместо жёстких блоков)
// ============================================================================

import { MovementPattern } from "./workoutTemplates.js";
import { TrainingGoal, ExperienceLevel } from "./trainingRulesEngine.js";

/**
 * ПРАВИЛА тренировочного дня для двухэтапной генерации
 * 
 * AI получает ТОЛЬКО эти 3 поля и САМ определяет:
 * - Сколько упражнений нужно
 * - Сколько подходов и повторений
 * - Какие паттерны движений использовать
 * - Как распределить объём
 * 
 * На основе своих знаний Volume Landmarks (MEV/MAV/MRV)
 */
export type DayTrainingRules = {
  name: string;         // "Push Day", "Full Body", "Upper Body"
  focus: string;        // "Грудь, плечи, трицепс — все толкающие движения"
  description: string;  // "Начинаем с тяжелых жимов, заканчиваем изоляцией"
};

/**
 * Контекст для генерации (что AI получает)
 */
export type WorkoutGenerationContext = {
  rules: DayTrainingRules;
  userProfile: {
    experience: ExperienceLevel;
    goal: TrainingGoal;
    timeAvailable: number;
    daysPerWeek: number;
  };
  checkIn?: {
    energy: "low" | "medium" | "high";
    pain: Array<{ location: string; level: number }>;
    injuries: string[];
    mode: "recovery" | "light" | "normal" | "push";
  };
  history: {
    recentExercises: string[];     // Последние 20 упражнений
    weightHistory: Record<string, string>;
    lastWorkoutDate?: string;
  };
};


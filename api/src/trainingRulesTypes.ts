// Новые типы правил тренировки (вместо жёстких блоков)
// ============================================================================

import { MovementPattern } from "./workoutTemplates.js";
import { TrainingGoal, ExperienceLevel } from "./trainingRulesEngine.js";

/**
 * ПРАВИЛА тренировочного дня (НЕ конкретные упражнения!)
 */
export type DayTrainingRules = {
  name: string;
  focus: string;  // "Грудь, плечи, трицепс"
  description: string;
  
  // Основные правила структуры
  structure: {
    totalExercisesRange: [number, number];  // [6, 9] для advanced hypertrophy
    
    // Распределение по типам (количество упражнений каждого типа)
    compound: {
      count: [number, number];  // [2, 3] = 2-3 базовых упражнения
      sets: number;             // 4-5 подходов
      reps: string;             // "6-8"
      rest: number;             // 120 сек
      priority: 1;              // Выполняются первыми
      notes: string;
    };
    
    secondary: {
      count: [number, number];  // [2, 3]
      sets: number;             // 3-4 подхода
      reps: string;             // "8-12"
      rest: number;             // 90 сек
      priority: 2;
      notes: string;
    };
    
    isolation: {
      count: [number, number];  // [2, 3]
      sets: number;             // 3 подхода
      reps: string;             // "12-15"
      rest: number;             // 60 сек
      priority: 3;
      notes: string;
    };
  };
  
  // Целевые зоны и доступные паттерны движений
  targetAreas: {
    primary: string[];    // ["грудь", "передние дельты"] - основной фокус
    secondary: string[];  // ["трицепс", "средние дельты"] - вторичный
  };
  
  // Целевые объёмы по мышечным группам (минимум/максимум подходов)
  targetMuscleVolume?: {
    [muscleGroup: string]: {
      beginner: { 60: { min: number; max: number }; 75: { min: number; max: number }; 90: { min: number; max: number } };
      intermediate: { 60: { min: number; max: number }; 75: { min: number; max: number }; 90: { min: number; max: number } };
      advanced: { 60: { min: number; max: number }; 75: { min: number; max: number }; 90: { min: number; max: number } };
    };
  };
  
  // Рекомендуемые паттерны (AI выбирает из них)
  recommendedPatterns: {
    compound: MovementPattern[];     // Для базовых упражнений
    secondary: MovementPattern[];    // Для вторичных
    isolation: MovementPattern[];    // Для изоляции
  };
  
  // Формат тренировки
  format: {
    type: "standard" | "circuit" | "supersets" | "giant_sets";
    supersetPairs?: number[][];  // Какие упражнения можно объединить в суперсеты
    notes: string;
  };
  
  // Разминка/заминка
  warmup: {
    durationMinutes: number;
    guidelines: string;
  };
  
  cooldown: {
    durationMinutes: number;
    guidelines: string;
  };
  
  // Правила адаптации (при травмах, усталости и т.п.)
  adaptationRules: {
    canReduce: boolean;           // Можно ли уменьшать объём
    minExercises: number;         // Минимум упражнений даже в recovery
    fallbackFocus?: string;       // На что переключиться если основной фокус травмирован
    avoidIfInjured: string[];     // Какие зоны избегать при травмах
  };
  
  // Научное обоснование
  scientificNotes: string[];
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


// progressionService.ts
// ============================================================================
// PROGRESSION SERVICE: Orchestrator for exercise progression system
//
// ЦЕЛЬ: Связать workout sessions с progressionEngine и БД
// ВХОД: Payload тренировки (exercises с sets/weight/reps/effort)
// ВЫХОД: Обновлённые рекомендации по весам/повторам для следующих тренировок
// ============================================================================

import type { Exercise } from "./exerciseLibrary.js";
import type { Goal, ExperienceLevel } from "./normalizedSchemes.js";
import type { 
  ExerciseProgressionData, 
  ExerciseHistory,
  ProgressionRecommendation,
  EffortTag as EngineEffortTag
} from "./progressionEngine.js";

import {
  calculateProgression,
  updateProgressionData,
  initializeProgressionData,
  shouldRotateExercise,
  PROGRESSION_RULES_BY_GOAL,
} from "./progressionEngine.js";

import {
  getProgressionData,
  saveProgressionData,
  saveWorkoutHistory,
} from "./progressionDb.js";

// ============================================================================
// TYPES: Payload structure from frontend
// ============================================================================

/**
 * Frontend effort mapping (from WorkoutSession.tsx)
 */
export type FrontendEffort = "easy" | "working" | "quite_hard" | "hard" | "max";

/**
 * Set data from frontend
 */
export type FrontendSet = {
  reps?: number;
  weight?: number;
};

/**
 * Exercise data from frontend payload
 */
export type FrontendExercise = {
  name: string;
  pattern?: string;
  targetMuscles?: string[];
  restSec?: number;
  reps?: string | number; // target reps range
  done?: boolean;
  effort?: FrontendEffort;
  sets: FrontendSet[];
};

/**
 * Complete session payload from frontend
 */
export type SessionPayload = {
  title: string;
  location?: string;
  durationMin: number;
  exercises: FrontendExercise[];
  feedback?: {
    sessionRpe?: number;
  };
};

/**
 * Progression summary result
 */
export type ProgressionSummary = {
  totalExercises: number;
  progressedCount: number;      // +weight or +reps
  maintainedCount: number;       // same weight/reps
  deloadCount: number;           // -weight
  rotationSuggestions: string[]; // exercises that should be rotated
  details: Array<{
    exerciseName: string;
    recommendation: ProgressionRecommendation;
  }>;
};

// ============================================================================
// HELPERS: Data transformation
// ============================================================================

/**
 * Map frontend effort to engine EffortTag
 * Frontend: easy/working/quite_hard/hard/max
 * Engine: same (but typed differently)
 */
function mapEffortToRPE(effort: FrontendEffort | undefined): number {
  if (!effort) return 7; // default: working
  
  const mapping: Record<FrontendEffort, number> = {
    easy: 5,         // RPE 5: легко
    working: 7,      // RPE 7: рабочий
    quite_hard: 8,   // RPE 8: тяжеловато
    hard: 9,         // RPE 9: тяжело
    max: 10,         // RPE 10: предел
  };
  
  return mapping[effort] || 7;
}

/**
 * Parse target reps range from string/number
 * Examples: "6-10" → [6, 10], 12 → [8, 12], "8-12" → [8, 12]
 */
function parseRepsRange(reps: string | number | undefined): [number, number] {
  if (!reps) return [8, 12]; // default
  
  if (typeof reps === 'number') {
    // Single number: use ±2 range
    const min = Math.max(1, reps - 2);
    const max = reps + 2;
    return [min, max];
  }
  
  // String: "6-10", "8–12", "10"
  const match = String(reps).match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (match) {
    return [Number(match[1]), Number(match[2])];
  }
  
  // Single number as string
  const num = Number(reps);
  if (Number.isFinite(num) && num > 0) {
    const min = Math.max(1, num - 2);
    const max = num + 2;
    return [min, max];
  }
  
  return [8, 12]; // fallback
}

/**
 * Find exercise by name in library
 * @param name - exercise name
 * @returns Exercise or null
 */
async function findExerciseByName(name: string): Promise<Exercise | null> {
  try {
    const { EXERCISE_LIBRARY } = await import("./exerciseLibrary.js");
    
    // Normalize name for comparison
    const normalize = (s: string) => 
      s.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\wа-яa-z]/g, '');
    
    const searchNorm = normalize(name);
    
    // Find by exact match or close match
    const found = EXERCISE_LIBRARY.find(ex => {
      const exNorm = normalize(ex.name);
      return exNorm === searchNorm || exNorm.includes(searchNorm) || searchNorm.includes(exNorm);
    });
    
    return found || null;
  } catch {
    return null;
  }
}

// ============================================================================
// MAIN: Apply progression from completed session
// ============================================================================

/**
 * Process completed workout session and update progression data
 * 
 * @param args.userId - User ID (UUID)
 * @param args.payload - Session payload from frontend
 * @param args.goal - User goal (for progression rules)
 * @param args.experience - User experience level
 * @param args.workoutDate - Date of workout (ISO string)
 * @returns Progression summary
 */
export async function applyProgressionFromSession(args: {
  userId: string;
  payload: SessionPayload;
  goal: Goal;
  experience: ExperienceLevel;
  workoutDate: string;
}): Promise<ProgressionSummary> {
  const { userId, payload, goal, experience, workoutDate } = args;
  
  const summary: ProgressionSummary = {
    totalExercises: 0,
    progressedCount: 0,
    maintainedCount: 0,
    deloadCount: 0,
    rotationSuggestions: [],
    details: [],
  };
  
  // Process each exercise
  for (const exerciseData of payload.exercises) {
    // Skip if no sets recorded
    if (!exerciseData.sets || exerciseData.sets.length === 0) {
      continue;
    }
    
    // Find exercise in library
    const exercise = await findExerciseByName(exerciseData.name);
    if (!exercise) {
      console.warn(`[ProgressionService] Exercise not found: ${exerciseData.name}`);
      continue;
    }
    
    summary.totalExercises++;
    
    try {
      // Get or initialize progression data
      let progressionData = await getProgressionData(exercise.id, userId);
      
      if (!progressionData) {
        progressionData = initializeProgressionData({
          exerciseId: exercise.id,
          exercise,
          experience,
          goal,
        });
      }
      
      // Parse target reps range
      const targetRepsRange = parseRepsRange(exerciseData.reps);
      
      // Map frontend effort to RPE
      const avgRpe = mapEffortToRPE(exerciseData.effort);
      
      // Build ExerciseHistory entry
      const history: ExerciseHistory = {
        exerciseId: exercise.id,
        workoutDate,
        sets: exerciseData.sets.map((s, idx) => ({
          targetReps: targetRepsRange[1], // upper bound as target
          actualReps: s.reps || 0,
          weight: s.weight || 0,
          rpe: avgRpe,
          completed: (s.reps || 0) >= targetRepsRange[0], // met lower bound
        })),
      };
      
      // Calculate progression recommendation
      const recommendation = calculateProgression({
        exercise,
        progressionData,
        goal,
        experience,
        targetRepsRange,
        currentIntent: undefined, // use default from payload/RPE
      });
      
      // Update progression data based on recommendation
      const updatedData = updateProgressionData({
        progressionData,
        workoutHistory: history,
        recommendation,
        goal,
      });
      
      // Save to database
      await saveProgressionData(updatedData, userId);
      await saveWorkoutHistory(history, userId);
      
      // Update summary counts
      if (recommendation.action === "increase_weight" || recommendation.action === "increase_reps") {
        summary.progressedCount++;
      } else if (recommendation.action === "deload" || recommendation.action === "decrease_weight") {
        summary.deloadCount++;
      } else {
        summary.maintainedCount++;
      }
      
      // Check if rotation needed
      if (shouldRotateExercise(updatedData)) {
        summary.rotationSuggestions.push(exerciseData.name);
      }
      
      summary.details.push({
        exerciseName: exerciseData.name,
        recommendation,
      });
      
    } catch (error) {
      console.error(`[ProgressionService] Error processing ${exerciseData.name}:`, error);
      // Continue with other exercises
    }
  }
  
  return summary;
}

// ============================================================================
// HELPER: Get progression recommendations for next workout
// ============================================================================

/**
 * Get progression recommendations for exercises in next workout
 * This is called BEFORE workout generation to provide suggested weights
 * 
 * @param args.userId - User ID
 * @param args.exercises - Exercises planned for next workout
 * @param args.goal - User goal
 * @param args.experience - User experience level
 * @returns Map of exerciseId → recommendation
 */
export async function getNextWorkoutRecommendations(args: {
  userId: string;
  exercises: Exercise[];
  goal: Goal;
  experience: ExperienceLevel;
}): Promise<Map<string, ProgressionRecommendation>> {
  const { userId, exercises, goal, experience } = args;
  
  const recommendations = new Map<string, ProgressionRecommendation>();
  
  for (const exercise of exercises) {
    try {
      const progressionData = await getProgressionData(exercise.id, userId);
      
      if (!progressionData) {
        // No history: use starting weight
        const initData = initializeProgressionData({
          exerciseId: exercise.id,
          exercise,
          experience,
          goal,
        });
        
        recommendations.set(exercise.id, {
          exerciseId: exercise.id,
          action: "maintain",
          newWeight: initData.currentWeight,
          reason: "Первый раз с этим упражнением. Начинаем с консервативного веса.",
        });
        continue;
      }
      
      // Has history: get last workout to determine target reps
      const lastWorkout = progressionData.history[progressionData.history.length - 1];
      const targetRepsRange: [number, number] = lastWorkout 
        ? [lastWorkout.sets[0]?.targetReps - 2 || 8, lastWorkout.sets[0]?.targetReps + 2 || 12]
        : [8, 12];
      
      const recommendation = calculateProgression({
        exercise,
        progressionData,
        goal,
        experience,
        targetRepsRange,
        currentIntent: undefined,
      });
      
      recommendations.set(exercise.id, recommendation);
      
    } catch (error) {
      console.error(`[ProgressionService] Error getting recommendation for ${exercise.name}:`, error);
    }
  }
  
  return recommendations;
}

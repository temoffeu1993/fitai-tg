// Тестовый эндпоинт для НАУЧНОЙ системы генерации
// ============================================================================

import { Router, Request, Response } from "express";
import { asyncHandler } from "./middleware/errorHandler.js";
import { buildWorkoutFromRules, UserProfile } from "./workoutBuilder.js";
import { CheckInData } from "./checkInAdapter.js";
import { 
  PPL_PUSH_RULES, 
  PPL_PULL_RULES, 
  PPL_LEGS_RULES, 
  FULL_BODY_RULES 
} from "./flexibleTemplates.js";
import { ExperienceLevel, TrainingGoal } from "./trainingRulesEngine.js";

export const scientificWorkoutTest = Router();

// Доступные шаблоны
const TEMPLATES = {
  ppl_push: PPL_PUSH_RULES,
  ppl_pull: PPL_PULL_RULES,
  ppl_legs: PPL_LEGS_RULES,
  full_body: FULL_BODY_RULES
};

/**
 * POST /api/scientific-test/generate
 * 
 * Тестирует НАУЧНУЮ систему генерации
 * 
 * Body:
 * {
 *   "template": "ppl_push" | "ppl_pull" | "ppl_legs" | "full_body",
 *   "profile": {
 *     "experience": "beginner" | "intermediate" | "advanced",
 *     "goal": "strength" | "hypertrophy" | "metabolic" | "athletic",
 *     "timeAvailable": 60,
 *     "daysPerWeek": 3
 *   },
 *   "checkIn": { ... } // опционально
 * }
 */
scientificWorkoutTest.post(
  "/generate",
  asyncHandler(async (req: Request, res: Response) => {
    const { template, profile, checkIn } = req.body;
    
    console.log("\n🧪 ТЕСТИРОВАНИЕ НАУЧНОЙ СИСТЕМЫ");
    console.log(`Template: ${template}`);
    console.log(`Профиль:`, profile);
    
    // Валидация
    if (!template || !TEMPLATES[template as keyof typeof TEMPLATES]) {
      return res.status(400).json({
        error: "Укажите template: ppl_push, ppl_pull, ppl_legs или full_body"
      });
    }
    
    if (!profile || !profile.experience || !profile.goal || !profile.timeAvailable) {
      return res.status(400).json({
        error: "Укажите profile: { experience, goal, timeAvailable, daysPerWeek }"
      });
    }
    
    // Генерация
    const templateRules = TEMPLATES[template as keyof typeof TEMPLATES];
    
    const workout = buildWorkoutFromRules({
      templateRules,
      userProfile: profile as UserProfile,
      checkIn: checkIn as CheckInData | undefined
    });
    
    console.log(`✅ Сгенерировано: ${workout.totalExercises} упражнений, ${workout.totalSets} подходов`);
    
    return res.json({
      success: true,
      template: {
        id: template,
        name: templateRules.name,
        focus: templateRules.focus
      },
      profile,
      workout
    });
  })
);

/**
 * GET /api/scientific-test/templates
 * 
 * Список доступных шаблонов
 */
scientificWorkoutTest.get(
  "/templates",
  asyncHandler(async (req: Request, res: Response) => {
    const templates = Object.entries(TEMPLATES).map(([id, template]) => ({
      id,
      name: template.name,
      focus: template.focus,
      description: template.description,
      targetMuscleGroups: template.meta.targetMuscleGroups,
      difficulty: template.meta.difficulty,
      estimatedDurationRange: template.meta.estimatedDurationRange
    }));
    
    return res.json({
      total: templates.length,
      templates
    });
  })
);

/**
 * POST /api/scientific-test/compare-profiles
 * 
 * Сравнить как одна схема адаптируется под разные профили
 */
scientificWorkoutTest.post(
  "/compare-profiles",
  asyncHandler(async (req: Request, res: Response) => {
    const { template = "ppl_push", timeAvailable = 60, goal = "hypertrophy", daysPerWeek = 3 } = req.body;
    
    const templateRules = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!templateRules) {
      return res.status(400).json({ error: "Неверный template" });
    }
    
    console.log(`\n🔬 СРАВНЕНИЕ ПРОФИЛЕЙ для ${template}`);
    
    const profiles: UserProfile[] = [
      {
        experience: "beginner",
        goal: goal as TrainingGoal,
        timeAvailable,
        daysPerWeek
      },
      {
        experience: "intermediate",
        goal: goal as TrainingGoal,
        timeAvailable,
        daysPerWeek
      },
      {
        experience: "advanced",
        goal: goal as TrainingGoal,
        timeAvailable,
        daysPerWeek
      }
    ];
    
    const results = profiles.map(profile => {
      const workout = buildWorkoutFromRules({
        templateRules,
        userProfile: profile
      });
      
      return {
        experience: profile.experience,
        exercises: workout.totalExercises,
        sets: workout.totalSets,
        duration: workout.estimatedDuration,
        notes: workout.scientificNotes
      };
    });
    
    return res.json({
      template: {
        id: template,
        name: templateRules.name
      },
      parameters: {
        timeAvailable,
        goal,
        daysPerWeek
      },
      comparison: results
    });
  })
);

/**
 * POST /api/scientific-test/compare-goals
 * 
 * Сравнить как одна схема адаптируется под разные цели
 */
scientificWorkoutTest.post(
  "/compare-goals",
  asyncHandler(async (req: Request, res: Response) => {
    const { template = "ppl_push", experience = "intermediate", timeAvailable = 60, daysPerWeek = 3 } = req.body;
    
    const templateRules = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!templateRules) {
      return res.status(400).json({ error: "Неверный template" });
    }
    
    console.log(`\n🎯 СРАВНЕНИЕ ЦЕЛЕЙ для ${template}`);
    
    const goals: TrainingGoal[] = ["strength", "hypertrophy", "metabolic", "athletic"];
    
    const results = goals.map(goal => {
      const workout = buildWorkoutFromRules({
        templateRules,
        userProfile: {
          experience: experience as ExperienceLevel,
          goal,
          timeAvailable,
          daysPerWeek
        }
      });
      
      return {
        goal,
        exercises: workout.totalExercises,
        sets: workout.totalSets,
        duration: workout.estimatedDuration,
        exerciseDetails: workout.exercises.map(ex => ({
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          rest: ex.rest
        }))
      };
    });
    
    return res.json({
      template: {
        id: template,
        name: templateRules.name
      },
      parameters: {
        experience,
        timeAvailable,
        daysPerWeek
      },
      comparison: results
    });
  })
);

/**
 * POST /api/scientific-test/compare-time
 * 
 * Сравнить как схема адаптируется под разное время
 */
scientificWorkoutTest.post(
  "/compare-time",
  asyncHandler(async (req: Request, res: Response) => {
    const { template = "ppl_push", experience = "intermediate", goal = "hypertrophy", daysPerWeek = 3 } = req.body;
    
    const templateRules = TEMPLATES[template as keyof typeof TEMPLATES];
    if (!templateRules) {
      return res.status(400).json({ error: "Неверный template" });
    }
    
    console.log(`\n⏱️  СРАВНЕНИЕ ВРЕМЕНИ для ${template}`);
    
    const timeOptions = [45, 60, 75, 90];
    
    const results = timeOptions.map(timeAvailable => {
      const workout = buildWorkoutFromRules({
        templateRules,
        userProfile: {
          experience: experience as ExperienceLevel,
          goal: goal as TrainingGoal,
          timeAvailable,
          daysPerWeek
        }
      });
      
      return {
        timeAvailable,
        exercises: workout.totalExercises,
        sets: workout.totalSets,
        actualDuration: workout.estimatedDuration,
        exerciseNames: workout.exercises.map(ex => ex.name)
      };
    });
    
    return res.json({
      template: {
        id: template,
        name: templateRules.name
      },
      parameters: {
        experience,
        goal,
        daysPerWeek
      },
      comparison: results
    });
  })
);


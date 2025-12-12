// Тестовый эндпоинт для новой логики генерации
// ============================================================================

import { Router, Request, Response } from "express";
import { asyncHandler } from "./middleware/errorHandler.js";
import { generateWorkoutFromTemplate, ExperienceLevel } from "./workoutGenerator.js";
import { CheckInData } from "./checkInAdapter.js";
import { workoutSchemes } from "./workoutSchemes.js";

export const workoutTest = Router();

/**
 * POST /api/workout-test/generate
 * 
 * Тестирует новую логику генерации на основе template
 * 
 * Body:
 * {
 *   "schemeId": "push_pull_legs_5x_classic",
 *   "dayIndex": 0,
 *   "checkIn": { ... }, // опционально
 *   "experience": "intermediate"
 * }
 */
workoutTest.post(
  "/generate",
  asyncHandler(async (req: Request, res: Response) => {
    const { schemeId, dayIndex = 0, checkIn, experience = "intermediate" } = req.body;
    
    console.log("\n🧪 ТЕСТИРОВАНИЕ НОВОЙ ЛОГИКИ ГЕНЕРАЦИИ");
    console.log(`Схема: ${schemeId}, День: ${dayIndex}`);
    
    // Находим схему
    const scheme = workoutSchemes.find(s => s.id === schemeId);
    if (!scheme) {
      return res.status(404).json({ 
        error: "Схема не найдена",
        availableSchemes: workoutSchemes.slice(0, 5).map(s => ({ id: s.id, name: s.russianName }))
      });
    }
    
    // Получаем день
    const day = scheme.dayLabels[dayIndex];
    if (!day) {
      return res.status(404).json({ 
        error: `День ${dayIndex} не найден в схеме`,
        availableDays: scheme.dayLabels.length
      });
    }
    
    // Проверяем наличие template
    if (!day.template) {
      return res.status(400).json({
        error: `У дня ${dayIndex} (${day.label}) нет template`,
        note: "Template пока добавлен только к некоторым схемам/дням"
      });
    }
    
    console.log(`✓ Схема найдена: ${scheme.russianName}`);
    console.log(`✓ День: ${day.label} - ${day.focus}`);
    console.log(`✓ Template: ${day.template.totalExercises} упражнений`);
    
    // Генерируем тренировку
    const workout = await generateWorkoutFromTemplate({
      dayTemplate: day.template,
      dayLabel: day.label,
      dayFocus: day.focus,
      checkIn: checkIn as CheckInData | undefined,
      history: {
        recentExercises: [
          // Имитация истории - упражнения которые были недавно
          "Жим лёжа",
          "Подтягивания",
          "Приседания со штангой на спине"
        ],
        weightHistory: {
          "Жим лёжа": "60 кг",
          "Подтягивания": "вес тела",
          "Приседания со штангой на спине": "80 кг",
          "Становая тяга классическая": "100 кг"
        }
      },
      userProfile: {
        experience: experience as ExperienceLevel,
        injuries: [],
        preferences: []
      }
    });
    
    console.log(`✓ Тренировка сгенерирована: ${workout.totalExercises} упражнений, ${workout.totalSets} подходов`);
    
    return res.json({
      success: true,
      scheme: {
        id: scheme.id,
        name: scheme.russianName,
        description: scheme.description
      },
      day: {
        index: dayIndex,
        label: day.label,
        focus: day.focus
      },
      workout
    });
  })
);

/**
 * GET /api/workout-test/schemes
 * 
 * Возвращает список схем с template
 */
workoutTest.get(
  "/schemes",
  asyncHandler(async (req: Request, res: Response) => {
    const schemesWithTemplates = workoutSchemes
      .filter(scheme => scheme.dayLabels.some(day => day.template))
      .map(scheme => ({
        id: scheme.id,
        name: scheme.russianName,
        description: scheme.description,
        daysPerWeek: scheme.daysPerWeek,
        intensity: scheme.intensity,
        goals: scheme.goals,
        experienceLevels: scheme.experienceLevels,
        daysWithTemplates: scheme.dayLabels
          .map((day, idx) => day.template ? { index: idx, label: day.label, focus: day.focus } : null)
          .filter(d => d !== null)
      }));
    
    return res.json({
      total: schemesWithTemplates.length,
      schemes: schemesWithTemplates
    });
  })
);

/**
 * POST /api/workout-test/check-in-analysis
 * 
 * Тестирует только анализ чекина без генерации
 */
workoutTest.post(
  "/check-in-analysis",
  asyncHandler(async (req: Request, res: Response) => {
    const { schemeId, dayIndex = 0, checkIn } = req.body;
    
    if (!checkIn) {
      return res.status(400).json({ error: "checkIn обязателен" });
    }
    
    const scheme = workoutSchemes.find(s => s.id === schemeId);
    if (!scheme) {
      return res.status(404).json({ error: "Схема не найдена" });
    }
    
    const day = scheme.dayLabels[dayIndex];
    if (!day?.template) {
      return res.status(400).json({ error: "Template не найден" });
    }
    
    const { analyzeCheckIn, adaptDayTemplate } = await import("./checkInAdapter.js");
    
    const analysis = analyzeCheckIn(checkIn as CheckInData, day.template);
    const adaptedTemplate = adaptDayTemplate(day.template, analysis);
    
    return res.json({
      success: true,
      analysis,
      original: {
        exercises: day.template.totalExercises,
        sets: day.template.totalSets,
        duration: day.template.estimatedDuration
      },
      adapted: {
        exercises: adaptedTemplate.totalExercises,
        sets: adaptedTemplate.totalSets,
        duration: adaptedTemplate.estimatedDuration,
        blocks: adaptedTemplate.exerciseBlocks.map(b => ({
          name: b.name,
          pattern: b.movementPattern,
          sets: b.sets,
          reps: b.reps,
          rest: b.rest
        }))
      }
    });
  })
);


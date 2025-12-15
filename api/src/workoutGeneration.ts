// api/src/workoutGeneration.ts
// ============================================================================
// NEW WORKOUT GENERATION API - Using Deterministic System
// ============================================================================

import { Router, Response } from "express";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { 
  generateWorkoutDay,
  generateWeekPlan,
  type UserProfile,
  type CheckInData,
  type WorkoutHistory,
} from "./workoutDayGenerator.js";
import {
  NORMALIZED_SCHEMES,
  type ExperienceLevel,
  type Goal,
  type Equipment,
  type TimeBucket,
} from "./normalizedSchemes.js";
import {
  createMesocycle,
  shouldStartNewMesocycle,
  advanceMesocycle,
} from "./mesocycleEngine.js";
import {
  getMesocycle,
  saveMesocycle,
  getWeeklyPlan,
  saveWeeklyPlan,
  getCurrentWeekStart,
} from "./mesocycleDb.js";

export const workoutGeneration = Router();

function getUid(req: any): string {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
}

// ============================================================================
// POST /generate - Алиас для совместимости со старым фронтендом
// Генерирует недельный план (аналог /generate-week)
// ============================================================================

workoutGeneration.post(
  "/generate",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    console.log(`🔄 /generate called for user ${uid} (legacy endpoint → deterministic system)`);
    
    // Get user profile
    const userProfile = await buildUserProfile(uid);
    
    // Get selected scheme
    const schemeRows = await q<{ scheme_id: string }>(
      `SELECT scheme_id FROM user_workout_schemes WHERE user_id = $1`,
      [uid]
    );
    
    if (!schemeRows.length) {
      throw new AppError("No scheme selected", 404);
    }
    
    const scheme = NORMALIZED_SCHEMES.find(s => s.id === schemeRows[0].scheme_id);
    if (!scheme) {
      throw new AppError("Scheme not found", 404);
    }
    
    // Get or create mesocycle
    let mesocycle = await getMesocycle(uid);
    if (!mesocycle || shouldStartNewMesocycle(mesocycle)) {
      mesocycle = createMesocycle({ userId: uid, goal: userProfile.goal });
      await saveMesocycle(uid, mesocycle);
      console.log(`🆕 Created new mesocycle: week ${mesocycle.currentWeek}/${mesocycle.totalWeeks}`);
    }
    
    // Check if we need to advance week
    const weekStart = await getCurrentWeekStart();
    const existingPlan = await getWeeklyPlan(uid, weekStart);
    if (existingPlan && existingPlan.mesoWeek !== mesocycle.currentWeek) {
      mesocycle = advanceMesocycle(mesocycle);
      await saveMesocycle(uid, mesocycle);
      console.log(`⏩ Advanced to week ${mesocycle.currentWeek}/${mesocycle.totalWeeks}`);
    }
    
    // Get check-in
    const checkin = await getLatestCheckIn(uid);
    
    // Get history
    const history = await getWorkoutHistory(uid);
    
    // Generate week plan
    const checkins = checkin ? Array(scheme.daysPerWeek).fill(checkin) : undefined;
    
    const weekPlan = generateWeekPlan({
      scheme,
      userProfile,
      mesocycle,
      checkins,
      history,
    });
    
    console.log(`✅ Generated week plan: ${weekPlan.length} days (meso week ${mesocycle.currentWeek})`);
    
    // Save weekly plan
    await saveWeeklyPlan({
      userId: uid,
      weekStartDate: weekStart,
      mesoWeek: mesocycle.currentWeek,
      schemeId: scheme.id,
      workouts: weekPlan,
    });
    
    // Return TODAY's workout (day 0) for compatibility with old frontend
    const todayWorkout = weekPlan[0];
    
    return res.json({
      success: true,
      plan: {
        id: `week_${Date.now()}`,
        exercises: todayWorkout.exercises.map(ex => ({
          exerciseId: ex.exercise.id,
          name: ex.exercise.name,
          sets: ex.sets,
          reps: ex.repsRange,
          restSec: ex.restSec,
          weight: 0, // Будет заполнено из progressionDb
          targetMuscles: ex.exercise.primaryMuscles,
          cues: ex.notes,
        })),
        dayLabel: todayWorkout.dayLabel,
        focus: todayWorkout.dayFocus,
        estimatedDuration: todayWorkout.estimatedDuration,
        notes: todayWorkout.adaptationNotes,
      },
      weekPlan: weekPlan.map((day, idx) => ({
        day: idx + 1,
        label: day.dayLabel,
        focus: day.dayFocus,
        totalExercises: day.totalExercises,
        totalSets: day.totalSets,
        estimatedDuration: day.estimatedDuration,
      })),
      mesocycle: {
        week: mesocycle.currentWeek,
        totalWeeks: mesocycle.totalWeeks,
        phase: mesocycle.phase,
      },
    });
  })
);

// ============================================================================
// HELPER: Build user profile from database
// ============================================================================

async function buildUserProfile(uid: string): Promise<UserProfile> {
  // Get onboarding data
  const onboardingRows = await q<{ summary: any, data: any }>(
    `SELECT summary, data FROM onboardings WHERE user_id = $1`,
    [uid]
  );
  
  if (!onboardingRows.length) {
    throw new AppError("Onboarding data not found. Please complete onboarding first.", 404);
  }
  
  const summary = onboardingRows[0].summary;
  const data = onboardingRows[0].data;
  
  // Get selected scheme
  const schemeRows = await q<{ scheme_id: string }>(
    `SELECT scheme_id FROM user_workout_schemes WHERE user_id = $1`,
    [uid]
  );
  
  if (!schemeRows.length) {
    throw new AppError("No workout scheme selected. Please select a scheme first.", 404);
  }
  
  const scheme = NORMALIZED_SCHEMES.find(s => s.id === schemeRows[0].scheme_id);
  if (!scheme) {
    throw new AppError("Selected scheme not found", 404);
  }
  
  // Extract parameters
  const daysPerWeek = scheme.daysPerWeek;
  const minutesPerSession = data.schedule?.minutesPerSession || 60;
  
  // Map experience
  let experience: ExperienceLevel = "beginner";
  const rawExp = data.experience?.level || data.experience || summary.experience?.level || summary.experience || "beginner";
  const expMap: Record<string, ExperienceLevel> = {
    never_trained: "beginner",
    long_break: "beginner",
    novice: "beginner",
    training_regularly: "intermediate",
    training_experienced: "advanced",
  };
  experience = (expMap[rawExp] || rawExp) as ExperienceLevel;
  
  // Map goal
  const oldGoal = data.motivation?.goal || data.goals?.primary || summary.goals?.primary || "health_wellness";
  const goalMap: Record<string, Goal> = {
    lose_weight: "lose_weight",
    build_muscle: "build_muscle",
    athletic_body: "athletic_body",
    lower_body_focus: "lower_body_focus",
    strength: "strength",
    health_wellness: "health_wellness",
    fat_loss: "lose_weight",
    hypertrophy: "build_muscle",
    general_fitness: "athletic_body",
    powerlifting: "strength",
  };
  const goal: Goal = goalMap[oldGoal] || "health_wellness";
  
  // Map equipment
  const location = data.location?.type || summary.location || "gym";
  const equipmentList = data.equipment?.available || [];
  let equipment: Equipment = "gym_full";
  
  if (location === "gym" || equipmentList.includes("barbell") || equipmentList.includes("machines")) {
    equipment = "gym_full";
  } else if (equipmentList.includes("dumbbells")) {
    equipment = "dumbbells";
  } else {
    equipment = "bodyweight";
  }
  
  // Calculate time bucket
  let timeBucket: TimeBucket = 60;
  if (minutesPerSession <= 50) timeBucket = 45;
  else if (minutesPerSession <= 75) timeBucket = 60;
  else timeBucket = 90;
  
  // Get sex
  const sex = data.ageSex?.sex === "male" ? "male" : data.ageSex?.sex === "female" ? "female" : undefined;
  
  return {
    experience,
    goal,
    daysPerWeek,
    timeBucket,
    equipment,
    sex,
  };
}

// ============================================================================
// HELPER: Get workout history
// ============================================================================

async function getWorkoutHistory(uid: string): Promise<WorkoutHistory> {
  // Get last 20 exercises from completed workouts
  const rows = await q<{ exercises: any[] }>(
    `SELECT data->'exercises' as exercises 
     FROM planned_workouts 
     WHERE user_id = $1 AND status = 'completed'
     ORDER BY completed_at DESC 
     LIMIT 10`,
    [uid]
  );
  
  const recentExerciseIds: string[] = [];
  
  for (const row of rows) {
    if (Array.isArray(row.exercises)) {
      for (const ex of row.exercises) {
        if (ex.exercise?.id) {
          recentExerciseIds.push(ex.exercise.id);
        }
      }
    }
  }
  
  return {
    recentExerciseIds: recentExerciseIds.slice(0, 20), // Last 20 exercises
  };
}

// ============================================================================
// HELPER: Get latest check-in
// ============================================================================

async function getLatestCheckIn(uid: string): Promise<CheckInData | undefined> {
  const rows = await q<{ 
    energy: string, 
    sleep: string, 
    stress: string,
    pain: string[],
    soreness: string[],
  }>(
    `SELECT energy, sleep, stress, pain, soreness
     FROM daily_check_ins 
     WHERE user_id = $1 
     ORDER BY date DESC 
     LIMIT 1`,
    [uid]
  );
  
  if (!rows.length) {
    return undefined;
  }
  
  const row = rows[0];
  
  return {
    energy: row.energy as "low" | "medium" | "high",
    sleep: row.sleep as "poor" | "ok" | "good",
    stress: row.stress as "high" | "medium" | "low",
    pain: row.pain || [],
    soreness: row.soreness || [],
  };
}

// ============================================================================
// POST /workout/generate - Generate a single workout day
// ============================================================================

workoutGeneration.post(
  "/workout/generate",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const { dayIndex } = req.body; // 0-based index
    
    if (typeof dayIndex !== "number" || dayIndex < 0) {
      throw new AppError("Invalid dayIndex. Must be a non-negative number.", 400);
    }
    
    console.log(`🏋️ Generating workout for user ${uid}, day ${dayIndex}`);
    
    // Get user profile
    const userProfile = await buildUserProfile(uid);
    
    // Get selected scheme
    const schemeRows = await q<{ scheme_id: string }>(
      `SELECT scheme_id FROM user_workout_schemes WHERE user_id = $1`,
      [uid]
    );
    
    const scheme = NORMALIZED_SCHEMES.find(s => s.id === schemeRows[0].scheme_id);
    if (!scheme) {
      throw new AppError("Scheme not found", 404);
    }
    
    // Validate dayIndex
    if (dayIndex >= scheme.daysPerWeek) {
      throw new AppError(`Invalid dayIndex ${dayIndex}. Scheme has ${scheme.daysPerWeek} days.`, 400);
    }
    
    // Get check-in
    const checkin = await getLatestCheckIn(uid);
    
    // Get history
    const history = await getWorkoutHistory(uid);
    
    console.log(`   User profile:`, userProfile);
    console.log(`   Check-in:`, checkin || 'none');
    console.log(`   History: ${history.recentExerciseIds.length} recent exercises`);
    
    // Generate workout
    const workout = generateWorkoutDay({
      scheme,
      dayIndex,
      userProfile,
      checkin,
      history,
    });
    
    console.log(`✅ Generated workout: ${workout.totalExercises} exercises, ${workout.totalSets} sets`);
    
    // Save to database
    const workoutData = {
      schemeId: scheme.id,
      schemeName: workout.schemeName,
      dayIndex: workout.dayIndex,
      dayLabel: workout.dayLabel,
      dayFocus: workout.dayFocus,
      intent: workout.intent,
      exercises: workout.exercises.map(ex => ({
        exerciseId: ex.exercise.id,
        exerciseName: ex.exercise.name,
        sets: ex.sets,
        repsRange: ex.repsRange,
        restSec: ex.restSec,
        notes: ex.notes,
        targetMuscles: ex.exercise.primaryMuscles,
      })),
      totalExercises: workout.totalExercises,
      totalSets: workout.totalSets,
      estimatedDuration: workout.estimatedDuration,
      adaptationNotes: workout.adaptationNotes,
      warnings: workout.warnings,
    };
    
    await q(
      `INSERT INTO planned_workouts 
       (user_id, workout_date, data, status)
       VALUES ($1, CURRENT_DATE, $2::jsonb, 'pending')
       ON CONFLICT (user_id, workout_date) 
       DO UPDATE SET data = $2::jsonb, status = 'pending', created_at = now()`,
      [uid, workoutData]
    );
    
    res.json({
      ok: true,
      workout: workoutData,
    });
  })
);

// ============================================================================
// POST /workout/generate-week - Generate full week plan
// ============================================================================

workoutGeneration.post(
  "/workout/generate-week",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    console.log(`🗓️ Generating week plan for user ${uid}`);
    
    // Get user profile
    const userProfile = await buildUserProfile(uid);
    
    // Get selected scheme
    const schemeRows = await q<{ scheme_id: string }>(
      `SELECT scheme_id FROM user_workout_schemes WHERE user_id = $1`,
      [uid]
    );
    
    const scheme = NORMALIZED_SCHEMES.find(s => s.id === schemeRows[0].scheme_id);
    if (!scheme) {
      throw new AppError("Scheme not found", 404);
    }
    
    // Get check-in
    const checkin = await getLatestCheckIn(uid);
    
    // Get history
    const history = await getWorkoutHistory(uid);
    
    // НОВОЕ: Get or create mesocycle
    let mesocycle = await getMesocycle(uid);
    if (!mesocycle || shouldStartNewMesocycle(mesocycle)) {
      mesocycle = createMesocycle({
        userId: uid,
        goal: userProfile.goal,
      });
      await saveMesocycle(uid, mesocycle);
      console.log(`🆕 Created new mesocycle: week ${mesocycle.currentWeek}/${mesocycle.totalWeeks}`);
    }
    
    // НОВОЕ: Check if we need to advance week
    const weekStart = await getCurrentWeekStart();
    const existingPlan = await getWeeklyPlan(uid, weekStart);
    if (existingPlan && existingPlan.mesoWeek !== mesocycle.currentWeek) {
      // New week started, advance mesocycle
      mesocycle = advanceMesocycle(mesocycle);
      await saveMesocycle(uid, mesocycle);
      console.log(`⏩ Advanced to week ${mesocycle.currentWeek}/${mesocycle.totalWeeks}`);
    }
    
    // Generate week plan (same check-in for all days for simplicity)
    const checkins = checkin ? Array(scheme.daysPerWeek).fill(checkin) : undefined;
    
    const weekPlan = generateWeekPlan({
      scheme,
      userProfile,
      mesocycle, // НОВОЕ: передаём мезоцикл
      checkins,
      history,
    });
    
    console.log(`✅ Generated week plan: ${weekPlan.length} days (meso week ${mesocycle.currentWeek})`);
    
    // НОВОЕ: Save weekly plan
    await saveWeeklyPlan({
      userId: uid,
      weekStartDate: weekStart,
      mesoWeek: mesocycle.currentWeek,
      schemeId: scheme.id,
      workouts: weekPlan,
    });
    
    // Save all workouts
    for (let i = 0; i < weekPlan.length; i++) {
      const workout = weekPlan[i];
      
      const workoutData = {
        schemeId: scheme.id,
        schemeName: workout.schemeName,
        dayIndex: workout.dayIndex,
        dayLabel: workout.dayLabel,
        dayFocus: workout.dayFocus,
        intent: workout.intent,
        exercises: workout.exercises.map(ex => ({
          exerciseId: ex.exercise.id,
          exerciseName: ex.exercise.name,
          sets: ex.sets,
          repsRange: ex.repsRange,
          restSec: ex.restSec,
          notes: ex.notes,
          targetMuscles: ex.exercise.primaryMuscles,
        })),
        totalExercises: workout.totalExercises,
        totalSets: workout.totalSets,
        estimatedDuration: workout.estimatedDuration,
        adaptationNotes: workout.adaptationNotes,
        warnings: workout.warnings,
      };
      
      // Use different dates for each workout
      await q(
        `INSERT INTO planned_workouts 
         (user_id, workout_date, data, status)
         VALUES ($1, CURRENT_DATE + $2, $3::jsonb, 'pending')
         ON CONFLICT (user_id, workout_date) 
         DO UPDATE SET data = $3::jsonb, status = 'pending', created_at = now()`,
        [uid, i, workoutData]
      );
    }
    
    res.json({
      ok: true,
      weekPlan: weekPlan.map((w, i) => ({
        dayIndex: i,
        dayLabel: w.dayLabel,
        totalExercises: w.totalExercises,
        totalSets: w.totalSets,
        intent: w.intent,
      })),
    });
  })
);

// ============================================================================
// GET /workout/week - Get current week plan (or generate)
// ============================================================================

workoutGeneration.get(
  "/workout/week",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    const weekStart = await getCurrentWeekStart();
    let existingPlan = await getWeeklyPlan(uid, weekStart);
    
    if (existingPlan) {
      return res.json({ success: true, weekPlan: existingPlan.workouts, mesoWeek: existingPlan.mesoWeek, cached: true });
    }
    
    const userProfile = await buildUserProfile(uid);
    const schemeRows = await q<{ scheme_id: string }>(
      `SELECT scheme_id FROM user_workout_schemes WHERE user_id = $1`,
      [uid]
    );
    
    const scheme = NORMALIZED_SCHEMES.find(s => s.id === schemeRows[0].scheme_id);
    if (!scheme) throw new AppError("Scheme not found", 404);
    
    let mesocycle = await getMesocycle(uid);
    if (!mesocycle || shouldStartNewMesocycle(mesocycle)) {
      mesocycle = createMesocycle({ userId: uid, goal: userProfile.goal });
      await saveMesocycle(uid, mesocycle);
    }
    
    const checkin = await getLatestCheckIn(uid);
    const history = await getWorkoutHistory(uid);
    const checkins = checkin ? Array(scheme.daysPerWeek).fill(checkin) : undefined;
    
    const weekPlan = generateWeekPlan({ scheme, userProfile, mesocycle, checkins, history });
    
    await saveWeeklyPlan({
      userId: uid,
      weekStartDate: weekStart,
      mesoWeek: mesocycle.currentWeek,
      schemeId: scheme.id,
      workouts: weekPlan,
    });
    
    return res.json({ success: true, weekPlan, mesoWeek: mesocycle.currentWeek, cached: false });
  })
);

// ============================================================================
// GET /workout/today - Get today's workout
// ============================================================================

workoutGeneration.get(
  "/workout/today",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    const rows = await q<{ data: any, status: string }>(
      `SELECT data, status FROM planned_workouts 
       WHERE user_id = $1 AND workout_date = CURRENT_DATE
       LIMIT 1`,
      [uid]
    );
    
    if (!rows.length) {
      return res.json({ workout: null });
    }
    
    res.json({
      workout: rows[0].data,
      status: rows[0].status,
    });
  })
);

// ============================================================================
// GET /mesocycle/current - Get current mesocycle info
// ============================================================================

workoutGeneration.get(
  "/mesocycle/current",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    let mesocycle = await getMesocycle(uid);
    
    if (!mesocycle) {
      const userProfile = await buildUserProfile(uid);
      mesocycle = createMesocycle({ userId: uid, goal: userProfile.goal });
      await saveMesocycle(uid, mesocycle);
    }
    
    return res.json({ success: true, mesocycle });
  })
);

export default workoutGeneration;

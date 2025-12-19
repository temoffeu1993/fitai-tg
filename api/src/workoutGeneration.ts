// api/src/workoutGeneration.ts
// ============================================================================
// NEW WORKOUT GENERATION API - Using Deterministic System
// ============================================================================

import { Router, Response } from "express";
import { q, withTransaction } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { enqueueProgressionJob, processProgressionJob } from "./progressionJobs.js";
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

const isUUID = (s: unknown) =>
  typeof s === "string" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);

// ============================================================================
// POST /check-in - Save daily check-in
// ============================================================================

workoutGeneration.post(
  "/check-in",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const data = req.body || {};
    
    console.log(`💾 CHECK-IN for user ${uid}:`, data);
    
    // Validation
    const validSleep = ["poor", "fair", "ok", "good", "excellent"];
    if (data.sleepQuality && !validSleep.includes(data.sleepQuality)) {
      throw new AppError(`sleepQuality must be one of: ${validSleep.join(", ")}`, 400);
    }
    
    if (data.availableMinutes != null) {
      const av = Number(data.availableMinutes);
      if (!Number.isFinite(av) || av < 10 || av > 240) {
        throw new AppError("availableMinutes must be between 10 and 240", 400);
      }
    }
    
    const validEnergy = ["low", "medium", "high"];
    if (data.energyLevel && !validEnergy.includes(data.energyLevel)) {
      throw new AppError(`energyLevel must be one of: ${validEnergy.join(", ")}`, 400);
    }
    
    const validStress = ["low", "medium", "high", "very_high"];
    if (data.stressLevel && !validStress.includes(data.stressLevel)) {
      throw new AppError(`stressLevel must be one of: ${validStress.join(", ")}`, 400);
    }
    
    // Validate pain (structured format)
    const PAIN_LOCATIONS = ["shoulder", "elbow", "wrist", "neck", "lower_back", "hip", "knee", "ankle"];
    let pain = null;
    if (data.pain) {
      if (!Array.isArray(data.pain)) {
        throw new AppError("pain must be an array", 400);
      }
      const validatedPain = [];
      for (const p of data.pain) {
        if (!p || typeof p !== "object") continue;
        const location = String(p.location || "").trim();
        const level = Number(p.level);
        
        if (!PAIN_LOCATIONS.includes(location)) {
          throw new AppError(`Invalid pain location: ${location}. Must be one of: ${PAIN_LOCATIONS.join(", ")}`, 400);
        }
        if (!Number.isFinite(level) || level < 1 || level > 10) {
          throw new AppError("pain.level must be 1-10", 400);
        }
        
        validatedPain.push({ location, level });
      }
      pain = validatedPain.length > 0 ? validatedPain : null;
    }
    
    // Save to DB (упрощенная схема - только нужные поля)
    const result = await q(
      `INSERT INTO daily_check_ins (
        user_id,
        pain,
        sleep_quality, 
        stress_level, 
        energy_level,
        notes,
        available_minutes
      ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, (DATE(created_at AT TIME ZONE 'UTC')))
      DO UPDATE SET
        pain = EXCLUDED.pain,
        sleep_quality = EXCLUDED.sleep_quality,
        stress_level = EXCLUDED.stress_level,
        energy_level = EXCLUDED.energy_level,
        notes = EXCLUDED.notes,
        available_minutes = EXCLUDED.available_minutes,
        updated_at = NOW()
      RETURNING id, created_at`,
      [
        uid,
        pain, // передаем как есть, БД сама преобразует в JSONB
        data.sleepQuality || null,
        data.stressLevel || null,
        data.energyLevel || null,
        data.notes || null,
        data.availableMinutes || null,
      ]
    );
    
    console.log(`✅ Check-in saved: ${result[0].id}`);
    
    res.json({
      success: true,
      checkInId: result[0].id,
      createdAt: result[0].created_at,
    });
  })
);

// ============================================================================
// GET /check-in/latest - Get latest check-in
// ============================================================================

workoutGeneration.get(
  "/check-in/latest",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    const checkin = await getLatestCheckIn(uid);
    
    if (!checkin) {
      return res.json({ checkIn: null });
    }
    
    res.json({
      checkIn: checkin,
    });
  })
);

// ============================================================================
// POST /generate - Алиас для совместимости со старым фронтендом
// Генерирует недельный план и возвращает первый день
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
    
    console.log(`📋 Selected scheme: ${scheme.russianName} (${scheme.id})`);
    
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
    
    // Get history
    const history = await getWorkoutHistory(uid);

    // НОВОЕ: Generate week plan БЕЗ чек-ина (базовая структура недели)
    // Чек-ин будет применяться только при старте конкретного дня
    const weekPlan = await generateWeekPlan({
      scheme,
      userProfile,
      mesocycle,
      history,
      // НЕ передаём checkins - неделя генерируется как базовый план
    });
    
    console.log(`✅ Generated week plan: ${weekPlan.length} days (meso week ${mesocycle.currentWeek})`);
    
    // Save weekly plan
    console.log(`💾 Saving weekly plan to DB...`);
    await saveWeeklyPlan({
      userId: uid,
      weekStartDate: weekStart,
      mesoWeek: mesocycle.currentWeek,
      schemeId: scheme.id,
      workouts: weekPlan,
    });
    console.log(`✅ Weekly plan saved`);
    
    // Save all workouts to planned_workouts
    console.log(`💾 Saving ${weekPlan.length} workouts to planned_workouts...`);
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
      
      await q(
        `INSERT INTO planned_workouts 
         (user_id, workout_date, data, plan, scheduled_for, status)
         VALUES ($1, CURRENT_DATE + make_interval(days => $2), $3::jsonb, $3::jsonb,
                 (CURRENT_DATE + make_interval(days => $2))::timestamp, 'scheduled')
         ON CONFLICT (user_id, workout_date) 
         DO UPDATE SET 
           data = $3::jsonb,
           plan = $3::jsonb,
           status = 'scheduled', 
           updated_at = now()`,
        [uid, i, workoutData]
      );
      console.log(`  ✓ Saved day ${i + 1}: ${workout.dayLabel}`);
    }
    console.log(`✅ All workouts saved to planned_workouts`);
    
    // Return TODAY's workout (day 0) for compatibility with old frontend
    const todayWorkout = weekPlan[0];
    
    console.log(`📤 Sending response to client...`);
    
    // Format response for old frontend (WorkoutPlanResponse)
    return res.json({
      plan: {
        id: `week_${Date.now()}`,
        warmup: todayWorkout.warmup,
        exercises: todayWorkout.exercises.map(ex => ({
          exerciseId: ex.exercise.id,
          name: ex.exercise.name,
          sets: ex.sets,
          reps: ex.repsRange,
          restSec: ex.restSec,
          weight: ex.suggestedWeight ?? 0,
          targetMuscles: ex.exercise.primaryMuscles,
          cues: [ex.progressionNote, ex.notes].filter(Boolean).join(" • "),
          // NEW: Detailed fields
          technique: ex.exercise.technique,
          equipment: ex.exercise.equipment,
          difficulty: ex.exercise.difficulty,
          unilateral: ex.exercise.unilateral,
        })),
        cooldown: todayWorkout.cooldown,
        dayLabel: todayWorkout.dayLabel,
        focus: todayWorkout.dayFocus,
        estimatedDuration: todayWorkout.estimatedDuration,
        notes: todayWorkout.adaptationNotes,
        // Дополнительные данные для нового фронтенда (если нужны)
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
          phase: mesocycle.currentPhase,
        },
      },
      analysis: null,
      meta: {
        status: 'ready',
        planId: `week_${Date.now()}`,
        error: null,
        progress: 100,
        progressStage: 'complete',
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
  // Профессиональная логика: buckets с небольшим overlap для естественных границ
  // 45 bucket: до 52 мин (фокус короткие тренировки)
  // 60 bucket: 52-72 мин (стандарт для большинства)
  // 90 bucket: 73+ мин (длинные интенсивные тренировки)
  let timeBucket: TimeBucket = 60;
  if (minutesPerSession < 52) timeBucket = 45;        
  else if (minutesPerSession < 73) timeBucket = 60;   
  else timeBucket = 90;
  
  // Get sex
  const sex = data.ageSex?.sex === "male" ? "male" : data.ageSex?.sex === "female" ? "female" : undefined;
  
  return {
    userId: uid, // NEW: для системы прогрессии
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
  // Get exercises from completed workouts (for variety between weeks)
  const rows = await q<{ exercises: any[] }>(
    `SELECT data->'exercises' as exercises 
     FROM planned_workouts 
     WHERE user_id = $1 AND status = 'completed'
     ORDER BY completed_at DESC 
     LIMIT 5`,
    [uid]
  );
  
  const recentExerciseIds: string[] = [];
  
  for (const row of rows) {
    if (Array.isArray(row.exercises)) {
      for (const ex of row.exercises) {
        if (ex.exerciseId || ex.exercise?.id) {
          const id = ex.exerciseId || ex.exercise?.id;
          if (!recentExerciseIds.includes(id)) {
            recentExerciseIds.push(id);
          }
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
    energy_level: "low" | "medium" | "high" | null,
    sleep_quality: "poor" | "fair" | "ok" | "good" | "excellent" | null,
    stress_level: "low" | "medium" | "high" | "very_high" | null,
    pain: any,
    available_minutes: number | null,
  }>(
    `SELECT energy_level, sleep_quality, stress_level, pain, available_minutes
     FROM daily_check_ins 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [uid]
  );
  
  if (!rows.length) {
    return undefined;
  }
  
  const row = rows[0];
  
  // Parse pain from JSONB to PainEntry[] с валидацией
  const PAIN_LOCATIONS = new Set(["shoulder", "elbow", "wrist", "neck", "lower_back", "hip", "knee", "ankle"]);
  const painArray: import("./workoutDayGenerator.js").PainEntry[] = [];
  
  if (row.pain) {
    let painData = row.pain;
    
    // Если пришло как строка JSON, парсим
    if (typeof painData === 'string') {
      try {
        painData = JSON.parse(painData);
      } catch {
        painData = [];
      }
    }
    
    if (Array.isArray(painData)) {
      for (const p of painData) {
        if (!p || typeof p !== 'object') continue;
        
        const location = String(p.location || '');
        const lvl = Number(p.level);
        
        // Валидация: только известные локации и корректный level
        if (!PAIN_LOCATIONS.has(location)) continue;
        if (!Number.isFinite(lvl)) continue;
        
        // Клампинг 1-10
        const level = Math.max(1, Math.min(10, Math.round(lvl)));
        
        painArray.push({ location, level });
      }
    }
  }
  
  // Map sleep_quality (5 вариантов) напрямую
  const sleep = row.sleep_quality || "ok";
  
  // Нормализация stress
  const stress = mapStress(row.stress_level);
  
  return {
    energy: row.energy_level ?? "medium",
    sleep,
    stress,
    pain: painArray.length > 0 ? painArray : undefined,
    soreness: [], // Not tracked separately in new schema
    availableMinutes: row.available_minutes ?? undefined,
  };
}

// Helper для нормализации stress
function mapStress(v: any): "high" | "medium" | "low" | "very_high" {
  if (v === "very_high" || v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}

// Helper: маппер CheckInPayload (из фронта) → CheckInData (для генератора)
function mapPayloadToCheckInData(payload: any): CheckInData | undefined {
  if (!payload) return undefined;
  
  return {
    sleep: payload.sleepQuality || "ok",
    energy: payload.energyLevel || "medium",
    stress: mapStress(payload.stressLevel),
    pain: Array.isArray(payload.pain) ? payload.pain : undefined,
    soreness: [],
    availableMinutes: payload.availableMinutes ?? undefined, // ИСПРАВЛЕНО: добавлено
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
    const { computeReadiness } = await import("./readiness.js");
    const readiness = computeReadiness({
      checkin,
      fallbackTimeBucket: userProfile.timeBucket,
    });

    const workout = await generateWorkoutDay({
      scheme,
      dayIndex,
      userProfile,
      readiness,
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
       (user_id, workout_date, data, plan, scheduled_for, status)
       VALUES ($1, CURRENT_DATE, $2::jsonb, $2::jsonb, CURRENT_TIMESTAMP, 'scheduled')
       ON CONFLICT (user_id, workout_date) 
       DO UPDATE SET 
         data = $2::jsonb,
         plan = $2::jsonb,
         status = 'scheduled', 
         updated_at = now()`,
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
    
    console.log(`\n🗓️  [GENERATE WEEK] ===================================`);
    console.log(`   User: ${uid}`);
    
    // Get user profile
    const userProfile = await buildUserProfile(uid);
    console.log(`   Profile: ${userProfile.experience} | ${userProfile.goal} | ${userProfile.daysPerWeek}d/w | ${userProfile.timeBucket}min`);
    
    // Get selected scheme
    const schemeRows = await q<{ scheme_id: string }>(
      `SELECT scheme_id FROM user_workout_schemes WHERE user_id = $1`,
      [uid]
    );
    
    const scheme = NORMALIZED_SCHEMES.find(s => s.id === schemeRows[0].scheme_id);
    if (!scheme) {
      throw new AppError("Scheme not found", 404);
    }
    
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

    console.log(`   Scheme: ${scheme.id} (${scheme.russianName})`);
    console.log(`   Mesocycle: Week ${mesocycle.currentWeek}/${mesocycle.totalWeeks}`);

    // Generate week plan
    const weekPlan = await generateWeekPlan({
      scheme,
      userProfile,
      mesocycle, // НОВОЕ: передаём мезоцикл
      history,
    });
    
    console.log(`   ✅ Generated ${weekPlan.length} workouts:`);
    weekPlan.forEach((w, i) => {
      console.log(`      Day ${i + 1}: ${w.dayLabel} (${w.totalExercises} ex, ${w.totalSets} sets, ${w.estimatedDuration}min, intent: ${w.intent})`);
    });
    console.log("=====================================================\n");
    
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
         (user_id, workout_date, data, plan, scheduled_for, status)
         VALUES ($1, CURRENT_DATE + make_interval(days => $2), $3::jsonb, $3::jsonb,
                 (CURRENT_DATE + make_interval(days => $2))::timestamp, 'scheduled')
         ON CONFLICT (user_id, workout_date) 
         DO UPDATE SET 
           data = $3::jsonb,
           plan = $3::jsonb,
           status = 'scheduled', 
           updated_at = now()`,
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

    const history = await getWorkoutHistory(uid);

    // НОВОЕ: Generate week plan БЕЗ чек-ина (базовая структура недели)
    const weekPlan = await generateWeekPlan({ 
      scheme, 
      userProfile, 
      mesocycle, 
      history,
      // НЕ передаём checkins - неделя генерируется как базовый план
    });
    
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
// POST /workout/start - Start a workout with check-in adaptation
// ============================================================================

workoutGeneration.post(
  "/workout/start",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const { date, checkin: checkinFromBody } = req.body;
    
    const workoutDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`\n🏁 [START WORKOUT] ===================================`);
    console.log(`   User: ${uid} | Date: ${workoutDate}`);
    
    // 1. Get base planned workout for this date
    const plannedRows = await q<{ 
      data: any, 
      status: string,
      workout_date: string,
    }>(
      `SELECT data, status, workout_date FROM planned_workouts 
       WHERE user_id = $1 AND workout_date = $2
       LIMIT 1`,
      [uid, workoutDate]
    );
    
    if (!plannedRows.length) {
      throw new AppError("No planned workout found for this date. Please generate a week plan first.", 404);
    }
    
    const basePlan = plannedRows[0].data;
    const originalDayIndex = basePlan.dayIndex;
    
    console.log(`   Base plan: Day ${originalDayIndex} - ${basePlan.dayLabel}`);
    
    // 2. Get or use check-in
    let checkin: CheckInData | undefined;
    if (checkinFromBody) {
      // Map frontend payload to CheckInData format
      checkin = mapPayloadToCheckInData(checkinFromBody);
      console.log(`   Check-in: from request`);
    } else {
      // Get latest check-in from DB
      checkin = await getLatestCheckIn(uid);
      console.log(`   Check-in: from DB`);
    }
    
    // 3. Get user profile and scheme
    const userProfile = await buildUserProfile(uid);
    const schemeRows = await q<{ scheme_id: string }>(
      `SELECT scheme_id FROM user_workout_schemes WHERE user_id = $1`,
      [uid]
    );
    const scheme = NORMALIZED_SCHEMES.find(s => s.id === schemeRows[0].scheme_id);
    if (!scheme) {
      throw new AppError("Scheme not found", 404);
    }
    
    // 4. ВАЖНО: Вычисляем readiness ОДИН РАЗ (используется и в policy, и в generator)
    const { computeReadiness } = await import("./readiness.js");
    const readiness = computeReadiness({
      checkin,
      fallbackTimeBucket: userProfile.timeBucket,
    });
    
    // 5. Decide action using policy
    const { decideStartAction } = await import("./checkinPolicy.js");
    const decision = decideStartAction({
      scheme,
      dayIndex: originalDayIndex,
      readiness,
    });
    
    console.log(`   📋 Decision: ${decision.action}`);
    
    // 6. Handle decision
    if (decision.action === "skip") {
      // Skip workout - return recovery info
      console.log(`   ❌ SKIP: ${basePlan.dayLabel}`);
      console.log("=====================================================\n");
      return res.json({
        action: "skip",
        notes: decision.notes,
        originalDay: basePlan.dayLabel,
      });
    }
    
    if (decision.action === "recovery") {
      console.log(`   🧘 RECOVERY: Replacing ${basePlan.dayLabel}`);
      // Generate recovery session
      const { generateRecoverySession } = await import("./workoutDayGenerator.js");
      const painAreas = checkin?.pain?.map(p => p.location) || [];
      const recoveryWorkout = generateRecoverySession({
        userProfile,
        painAreas,
        availableMinutes: checkin?.availableMinutes || 30,
      });
      
      // Convert to workout format
      const workoutData = {
        schemeId: "recovery",
        schemeName: "Восстановительная сессия",
        dayIndex: 0,
        dayLabel: "Recovery",
        dayFocus: "Мобильность и растяжка",
        intent: "light",
        exercises: recoveryWorkout.exercises.map(ex => ({
          exerciseId: ex.exercise.id,
          exerciseName: ex.exercise.name,
          sets: ex.sets,
          repsRange: ex.repsRange,
          restSec: ex.restSec,
          notes: ex.notes,
          targetMuscles: ex.exercise.primaryMuscles,
        })),
        totalExercises: recoveryWorkout.totalExercises,
        totalSets: recoveryWorkout.totalSets,
        estimatedDuration: recoveryWorkout.estimatedDuration,
        adaptationNotes: recoveryWorkout.adaptationNotes,
        warnings: recoveryWorkout.warnings,
        meta: {
          adaptedAt: new Date().toISOString(),
          originalDayIndex,
          action: "recovery",
          checkinApplied: !!checkin,
        },
      };
      
      // Save recovery workout to DB
      await q(
        `UPDATE planned_workouts 
         SET data = $2::jsonb, 
             plan = $2::jsonb,
             updated_at = NOW()
         WHERE user_id = $1 AND workout_date = $3`,
        [uid, workoutData, workoutDate]
      );
      
      console.log(`   ✅ Saved recovery session (${recoveryWorkout.totalExercises} ex, ${recoveryWorkout.estimatedDuration}min)`);
      console.log("=====================================================\n");
      return res.json({
        action: "recovery",
        notes: decision.notes,
        workout: workoutData,
      });
    }
    
    let finalDayIndex = originalDayIndex;
    let swapInfo = null;
    let workoutData: any;
    
    // 7. ВАЖНО: При "keep_day" используем сохранённые упражнения из БД!
    if (decision.action === "keep_day") {
      console.log(`   ✅ KEEP_DAY: Using saved exercises from plan`);
      
      // Берём упражнения из basePlan (из БД), только добавляем notes/warnings
      const combinedNotes = [
        ...(decision.notes || []),
        ...(basePlan.adaptationNotes || []),
      ];
      
      workoutData = {
        ...basePlan, // Сохраняем ВСЕ данные из базового плана (упражнения, sets, reps)
        adaptationNotes: combinedNotes.length > 0 ? combinedNotes : undefined,
        warnings: readiness.warnings?.length > 0 ? readiness.warnings : undefined,
        // Обновляем метаданные
        meta: {
          adaptedAt: new Date().toISOString(),
          originalDayIndex,
          finalDayIndex: originalDayIndex,
          action: "keep_day",
          wasSwapped: false,
          checkinApplied: !!checkin,
        },
      };
      
      console.log(`   ✅ Kept original workout (${basePlan.totalExercises} ex, ${basePlan.totalSets} sets, ${basePlan.estimatedDuration}min)`);
      
    } else {
      // 8. Для SWAP или других действий — РЕГЕНЕРИРУЕМ тренировку
      
      if (decision.action === "swap_day") {
        console.log(`   🔄 SWAP: ${basePlan.dayLabel} → ${decision.targetDayLabel}`);
        finalDayIndex = decision.targetDayIndex;
        swapInfo = {
          from: basePlan.dayLabel,
          to: decision.targetDayLabel,
          reason: decision.notes,
        };
      }
      
      const history = await getWorkoutHistory(uid);
      const mesocycle = await getMesocycle(uid);
      
      // Get week plan data for periodization
      let weekPlanData = null;
      if (mesocycle) {
        const { getWeekPlan } = await import("./mesocycleEngine.js");
        weekPlanData = getWeekPlan({
          mesocycle,
          weekNumber: mesocycle.currentWeek,
          daysPerWeek: scheme.daysPerWeek,
        });
      }
      
      const adaptedWorkout = await generateWorkoutDay({
        scheme,
        dayIndex: finalDayIndex,
        userProfile,
        readiness, // ВАЖНО: передаём уже вычисленный readiness
        history,
        dupIntensity: weekPlanData?.dupPattern?.[finalDayIndex],
        weekPlanData,
      });
      
      workoutData = {
        schemeId: scheme.id,
        schemeName: adaptedWorkout.schemeName,
        dayIndex: adaptedWorkout.dayIndex,
        dayLabel: adaptedWorkout.dayLabel,
        dayFocus: adaptedWorkout.dayFocus,
        intent: adaptedWorkout.intent,
        exercises: adaptedWorkout.exercises.map(ex => ({
          exerciseId: ex.exercise.id,
          exerciseName: ex.exercise.name,
          sets: ex.sets,
          repsRange: ex.repsRange,
          restSec: ex.restSec,
          notes: ex.notes,
          targetMuscles: ex.exercise.primaryMuscles,
        })),
        totalExercises: adaptedWorkout.totalExercises,
        totalSets: adaptedWorkout.totalSets,
        estimatedDuration: adaptedWorkout.estimatedDuration,
        adaptationNotes: adaptedWorkout.adaptationNotes,
        warnings: adaptedWorkout.warnings,
        // НОВОЕ: метаданные адаптации
        meta: {
          adaptedAt: new Date().toISOString(),
          originalDayIndex,
          finalDayIndex,
          action: decision.action,
          wasSwapped: decision.action === "swap_day",
          swapInfo: swapInfo || undefined,
          checkinApplied: !!checkin,
        },
      };
    }
    
    // Update planned_workouts
    // NOTE: For swap_day, we save the swapped workout (finalDayIndex) for today's date.
    // The original day (originalDayIndex) will be skipped/replaced in the week rotation.
    // Meta info preserves the swap history for tracking and future adjustments.
    await q(
      `UPDATE planned_workouts 
       SET data = $2::jsonb, 
           plan = $2::jsonb,
           updated_at = NOW()
       WHERE user_id = $1 AND workout_date = $3`,
      [uid, workoutData, workoutDate]
    );
    
    // If swapped, mark future occurrence of finalDayIndex as "already done today"
    if (decision.action === "swap_day") {
      // Calculate when finalDayIndex was originally scheduled
      const daysSinceWeekStart = new Date(workoutDate).getDay();
      const daysUntilTarget = (finalDayIndex - originalDayIndex + scheme.daysPerWeek) % scheme.daysPerWeek;
      const targetDate = new Date(workoutDate);
      targetDate.setDate(targetDate.getDate() + daysUntilTarget);
      
      // Mark that day as swapped (using separate metadata field)
      await q(
        `UPDATE planned_workouts
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{wasSwappedEarlier}',
           'true'::jsonb
         ),
         updated_at = NOW()
         WHERE user_id = $1
           AND workout_date = $2
           AND workout_date > $3`,
        [uid, targetDate.toISOString().split('T')[0], workoutDate]
      );
      
      console.log(`      Marked future day ${finalDayIndex} as swapped`);
    }
    
    console.log("=====================================================\n");
    
    // 9. Return workout with combined notes
    const combinedNotes = [
      ...(decision.notes || []),
      ...(workoutData.adaptationNotes || []),
    ];

    res.json({
      action: decision.action,
      notes: combinedNotes.length > 0 ? combinedNotes : undefined,
      workout: workoutData,
      swapInfo,
    });
  })
);

// ============================================================================
// POST /save-session - Save completed workout (compatibility with webapp)
// ============================================================================

workoutGeneration.post(
  "/save-session",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const payload = req.body?.payload;

    if (!payload || !Array.isArray(payload.exercises) || payload.exercises.length === 0) {
      throw new AppError("Invalid payload: exercises array required", 400);
    }

    const plannedRaw = req.body?.plannedWorkoutId;
    const plannedWorkoutId = isUUID(plannedRaw) ? (plannedRaw as string) : null;

    const startedAtInput = req.body?.startedAt;
    const durationMinInput = req.body?.durationMin;

    const now = new Date();
    let startedAt = now;
    if (typeof startedAtInput === "string" && startedAtInput.trim()) {
      const dt = new Date(startedAtInput);
      if (Number.isFinite(dt.getTime())) startedAt = dt;
    }

    let durationMin = Number(durationMinInput);
    if (!Number.isFinite(durationMin) || durationMin <= 0) durationMin = 40;
    durationMin = Math.max(10, Math.min(300, Math.round(durationMin)));
    const finishedAt = new Date(startedAt.getTime() + durationMin * 60_000);

    let progression: any = null;
    let progressionJobId: string | null = null;
    let progressionJobStatus: string | null = null;

    const { sessionId, jobId } = await withTransaction(async () => {
      const result = await q<{ id: string }>(
        `INSERT INTO workout_sessions (user_id, payload, finished_at)
         VALUES ($1, $2::jsonb, $3)
         RETURNING id`,
        [uid, payload, finishedAt.toISOString()]
      );

      const sessionId = result[0]?.id;
      if (!sessionId) throw new AppError("Failed to save session", 500);

      await q(
        `INSERT INTO workouts (user_id, plan, result, created_at, started_at, completed_at, unlock_used)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, false)`,
        [uid, payload, payload, finishedAt.toISOString(), startedAt.toISOString(), finishedAt.toISOString()]
      );

      if (plannedWorkoutId) {
        await q(
          `UPDATE planned_workouts
              SET status = 'completed',
                  result_session_id = $3,
                  completed_at = $4,
                  updated_at = NOW()
            WHERE id = $1 AND user_id = $2`,
          [plannedWorkoutId, uid, sessionId, finishedAt.toISOString()]
        );
      } else {
        await q(
          `INSERT INTO planned_workouts (user_id, plan, scheduled_for, status, result_session_id, workout_date, data, completed_at)
           VALUES ($1, $2::jsonb, $3, 'completed', $4, $5, $2::jsonb, $3)`,
          [uid, payload, finishedAt.toISOString(), sessionId, finishedAt.toISOString().slice(0, 10)]
        );
      }

      // NEW: Outbox job for progression (eventual consistency)
      const { jobId } = await enqueueProgressionJob({
        userId: uid,
        sessionId,
        plannedWorkoutId,
        workoutDate: finishedAt.toISOString().slice(0, 10),
      });

      return { sessionId, jobId };
    });

    progressionJobId = jobId;

    // Best-effort immediate processing (does not affect workout save)
    try {
      const r = await processProgressionJob({ jobId });
      progressionJobStatus = r.status;
      progression = r.progression;
    } catch (e) {
      console.error("[save-session] progression job process failed:", (e as any)?.message || e);
      progressionJobStatus = "pending";
      progression = null;
    }

    res.json({ ok: true, sessionId, progression, progressionJobId, progressionJobStatus });
  })
);

// ============================================================================
// GET /progression/jobs/:id - Poll progression job status/result
// ============================================================================

workoutGeneration.get(
  "/progression/jobs/:id",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const jobId = String(req.params?.id || "");
    if (!isUUID(jobId)) {
      throw new AppError("Invalid job id", 400);
    }

    const rows = await q<{
      id: string;
      status: string;
      attempts: number;
      last_error: string | null;
      result: any | null;
      updated_at: string;
      completed_at: string | null;
    }>(
      `SELECT id, status, attempts, last_error, result, updated_at, completed_at
         FROM progression_jobs
        WHERE id = $1::uuid AND user_id = $2::uuid
        LIMIT 1`,
      [jobId, uid]
    );

    if (!rows.length) {
      throw new AppError("Job not found", 404);
    }

    const row = rows[0];
    res.json({
      ok: true,
      job: {
        id: row.id,
        status: row.status,
        attempts: row.attempts,
        lastError: row.last_error,
        result: row.result,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
      },
    });
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

// api/src/workoutGeneration.ts
// ============================================================================
// NEW WORKOUT GENERATION API - Using Deterministic System
// ============================================================================

import { Router, Response } from "express";
import { q, withTransaction } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { enqueueProgressionJob, processProgressionJob } from "./progressionJobs.js";
import {
  enqueueCoachJob,
  getCoachJob,
  getCoachReportBySession,
  getLatestWeeklyCoachReport,
  maybeEnqueueWeeklyCoachJob,
  processCoachJob,
} from "./coachJobs.js";
import { getCoachChatHistoryForUser, sendCoachChatMessage } from "./coachChat.js";
import { getNextWorkoutRecommendations } from "./progressionService.js";
import { 
  generateWorkoutDay,
  generateWeekPlan,
  type CheckInData,
  type WorkoutHistory,
} from "./workoutDayGenerator.js";
import { EXERCISE_LIBRARY } from "./exerciseLibrary.js";
import {
  NORMALIZED_SCHEMES,
} from "./normalizedSchemes.js";
import { buildUserProfile } from "./userProfile.js";
import { getExerciseAlternatives } from "./exerciseAlternatives.js";
import { logExerciseChangeEvent } from "./exerciseChangeEvents.js";
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

function inferLoadInfoFromExercise(exercise: any): {
  loadType: "bodyweight" | "external" | "assisted";
  requiresWeightInput: boolean;
  weightLabel: string;
} {
  const id = String(exercise?.id || "").toLowerCase();
  const name = String(exercise?.name || "").toLowerCase();
  const nameEn = String(exercise?.nameEn || "").toLowerCase();
  const equipment = Array.isArray(exercise?.equipment) ? exercise.equipment : [];

  const isAssisted = id.includes("assisted") || name.includes("гравитрон") || nameEn.includes("assisted");
  if (isAssisted) return { loadType: "assisted", requiresWeightInput: true, weightLabel: "Помощь (кг)" };

  const loadable = new Set(["barbell", "dumbbell", "machine", "cable", "smith", "kettlebell", "landmine"]);
  const externalHints = [
    "barbell",
    "dumbbell",
    "machine",
    "cable",
    "smith",
    "kettlebell",
    "landmine",
    "штанг",
    "гантел",
    "тренаж",
    "блок",
    "кроссовер",
    "смита",
    "гир",
  ];
  const hintedExternal = externalHints.some((k) => id.includes(k) || name.includes(k) || nameEn.includes(k));
  const hasExternal = equipment.some((eq: string) => loadable.has(eq)) || hintedExternal;
  const hasBodyweight =
    equipment.includes("bodyweight") || equipment.includes("pullup_bar") || equipment.includes("trx");

  if (!hasExternal) return { loadType: "bodyweight", requiresWeightInput: false, weightLabel: "" };
  return { loadType: "external", requiresWeightInput: !hasBodyweight, weightLabel: "Вес (кг)" };
}

function enrichLoadInfoForStoredPlanExercises(exercises: any[]): any[] {
  if (!Array.isArray(exercises)) return [];
  return exercises.map((ex: any) => {
    if (ex?.loadType && typeof ex?.requiresWeightInput === "boolean") return ex;
    const id = ex?.exerciseId || ex?.id || ex?.exercise?.id || null;
    const lib = typeof id === "string" ? EXERCISE_LIBRARY.find((e) => e.id === id) : null;
    const inferred = inferLoadInfoFromExercise(
      lib || { id, name: ex?.exerciseName || ex?.name, equipment: ex?.equipment || [] }
    );
    return {
      ...ex,
      loadType: ex?.loadType ?? inferred.loadType,
      requiresWeightInput: ex?.requiresWeightInput ?? inferred.requiresWeightInput,
      weightLabel: ex?.weightLabel ?? inferred.weightLabel,
    };
  });
}

function toFinitePositiveNumberOrNull(value: any): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

// ============================================================================
// GET /exercises/:exerciseId/alternatives - deterministic alternatives from library
// ============================================================================

workoutGeneration.get(
  "/exercises/:exerciseId/alternatives",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const exerciseId = String(req.params?.exerciseId || "").trim();
    if (!exerciseId) throw new AppError("missing_exercise_id", 400);

    const reason = typeof req.query?.reason === "string" ? String(req.query.reason) : null;
    const limit = typeof req.query?.limit === "string" ? Number(req.query.limit) : null;
    const avoidEquipmentRaw = typeof req.query?.avoidEquipment === "string" ? String(req.query.avoidEquipment) : "";
    const requireEquipmentRaw =
      typeof req.query?.requireEquipment === "string" ? String(req.query.requireEquipment) : "";

    const avoidEquipment = avoidEquipmentRaw
      ? avoidEquipmentRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const requireEquipment = requireEquipmentRaw
      ? requireEquipmentRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const userProfile = await buildUserProfile(uid);

    const equipmentAvailable =
      userProfile.equipment === "gym_full"
        ? (["gym_full"] as any)
        : userProfile.equipment === "dumbbells"
          ? (["dumbbell", "bench", "bodyweight"] as any)
          : userProfile.equipment === "bodyweight"
            ? (["bodyweight", "pullup_bar", "bands"] as any)
            : (["gym_full"] as any);

    const { original, alternatives } = getExerciseAlternatives({
      originalExerciseId: exerciseId,
      ctx: {
        userExperience: userProfile.experience as any,
        equipmentAvailable,
        excludedExerciseIds: userProfile.excludedExerciseIds ?? [],
        avoidEquipment: avoidEquipment as any,
        requireEquipment: requireEquipment as any,
        reason: reason as any,
        limit,
      },
    });

    // Attach suggested weights from progression (best-effort).
    const suggestedById = new Map<string, number | null>();
    try {
      const ids = [original.id, ...alternatives.map((a) => a.exerciseId)];
      const uniqueIds = Array.from(new Set(ids));
      const libById = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e] as const));
      const libExercises = uniqueIds.map((id) => libById.get(id)).filter(Boolean) as any[];
      if (libExercises.length) {
        const recs = await getNextWorkoutRecommendations({
          userId: uid,
          exercises: libExercises,
          goal: userProfile.goal,
          experience: userProfile.experience,
        });
        for (const id of uniqueIds) {
          const rec = recs.get(id);
          const w = toFinitePositiveNumberOrNull(rec?.newWeight);
          suggestedById.set(id, w);
        }
      }
    } catch (e) {
      console.warn("[alternatives] failed to attach suggested weights:", (e as any)?.message || e);
    }

    res.json({
      ok: true,
      original: {
        exerciseId: original.id,
        name: original.name,
        equipment: original.equipment,
        patterns: original.patterns,
        primaryMuscles: original.primaryMuscles,
        kind: original.kind,
        suggestedWeight: suggestedById.get(original.id) ?? null,
        ...inferLoadInfoFromExercise(original),
      },
      alternatives: alternatives.map((a) => {
        const lib = EXERCISE_LIBRARY.find((e) => e.id === a.exerciseId);
        return {
          exerciseId: a.exerciseId,
          name: a.name,
          equipment: a.equipment,
          patterns: a.patterns,
          primaryMuscles: a.primaryMuscles,
          kind: a.kind,
          hint: a.hint,
          suggestedWeight: suggestedById.get(a.exerciseId) ?? null,
          ...(lib ? inferLoadInfoFromExercise(lib) : inferLoadInfoFromExercise({ id: a.exerciseId, name: a.name, equipment: a.equipment })),
        };
      }),
    });
  })
);

// ============================================================================
// GET /exercises/search?q=... - lightweight exercise search for UI
// ============================================================================

workoutGeneration.get(
  "/exercises/search",
  asyncHandler(async (req: any, res: Response) => {
    getUid(req); // auth check
    const qRaw = typeof req.query?.q === "string" ? String(req.query.q) : "";
    const q = qRaw.trim().toLowerCase();
    const limit = Math.max(1, Math.min(50, Number(req.query?.limit ?? 20) || 20));

    const normalized = (s: string) =>
      String(s || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[^\wа-яa-z0-9]+/g, " ")
        .trim();

    const qn = normalized(q);
    const tokens = qn ? qn.split(/\s+/g).filter(Boolean) : [];

    const scored = (EXERCISE_LIBRARY as any[])
      .map((ex) => {
        const name = String(ex?.name || "");
        const nameEn = String(ex?.nameEn || "");
        const aliases = Array.isArray(ex?.aliases) ? ex.aliases.map((a: any) => String(a || "")) : [];
        const hay = normalized([name, nameEn, ...aliases].join(" "));
        let score = 0;
        if (!qn) score = 1;
        else {
          if (hay.includes(qn)) score += 12;
          for (const t of tokens) if (t.length >= 2 && hay.includes(t)) score += 2;
          if (String(ex?.id || "").toLowerCase().includes(q.trim().toLowerCase())) score += 6;
        }
        return { ex, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ ex }) => ({
        exerciseId: String(ex.id),
        name: String(ex.name),
        equipment: ex.equipment ?? [],
        patterns: ex.patterns ?? [],
        primaryMuscles: ex.primaryMuscles ?? [],
        kind: ex.kind ?? null,
      }));

    res.json({ ok: true, items: scored });
  })
);

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
        data.availableMinutes ?? null,
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
	          weight: ex.suggestedWeight ?? null,
	          notes: ex.notes,
	          targetMuscles: ex.exercise.primaryMuscles,
	          loadType: (ex as any).loadType,
	          requiresWeightInput: (ex as any).requiresWeightInput,
	          weightLabel: (ex as any).weightLabel,
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
	          weight: ex.suggestedWeight ?? null,
	          targetMuscles: ex.exercise.primaryMuscles,
	          cues: [ex.progressionNote, ex.notes].filter(Boolean).join(" • "),
	          // NEW: Detailed fields
	          technique: ex.exercise.technique,
	          equipment: ex.exercise.equipment,
	          difficulty: ex.exercise.difficulty,
	          unilateral: ex.exercise.unilateral,
	          loadType: (ex as any).loadType,
	          requiresWeightInput: (ex as any).requiresWeightInput,
	          weightLabel: (ex as any).weightLabel,
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

// buildUserProfile() moved to api/src/userProfile.ts (shared across endpoints).

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
  
  const rawSleep = payload.sleepQuality ?? payload.sleep;
  const rawEnergy = payload.energyLevel ?? payload.energy;
  const rawStress = payload.stressLevel ?? payload.stress;
  const rawPain = payload.pain;
  const rawAvailableMinutes = payload.availableMinutes ?? payload.available_minutes ?? payload.minutes;

  const validSleep = new Set<CheckInData["sleep"]>(["poor", "fair", "ok", "good", "excellent"]);
  const sleep: CheckInData["sleep"] = validSleep.has(rawSleep) ? rawSleep : "ok";

  const validEnergy = new Set<CheckInData["energy"]>(["low", "medium", "high"]);
  const energy: CheckInData["energy"] = validEnergy.has(rawEnergy) ? rawEnergy : "medium";

  const stress: CheckInData["stress"] = mapStress(rawStress);

  // Validate pain (same locations as /check-in)
  const PAIN_LOCATIONS = new Set(["shoulder", "elbow", "wrist", "neck", "lower_back", "hip", "knee", "ankle"]);
  let pain: CheckInData["pain"] | undefined = undefined;
  if (Array.isArray(rawPain)) {
    const validated: import("./workoutDayGenerator.js").PainEntry[] = [];
    for (const p of rawPain) {
      if (!p || typeof p !== "object") continue;
      const location = String((p as any).location || "").trim();
      const levelRaw = Number((p as any).level);
      if (!PAIN_LOCATIONS.has(location)) continue;
      if (!Number.isFinite(levelRaw)) continue;
      const level = Math.max(1, Math.min(10, Math.round(levelRaw)));
      validated.push({ location, level });
    }
    pain = validated.length > 0 ? validated : undefined;
  }

  // Validate minutes. NOTE: /workout/start may pass 0 (special case: "no time").
  let availableMinutes: number | undefined = undefined;
  if (rawAvailableMinutes !== null && rawAvailableMinutes !== undefined) {
    const minsRaw = Number(rawAvailableMinutes);
    if (Number.isFinite(minsRaw) && minsRaw >= 0 && minsRaw <= 240) {
      availableMinutes = Math.round(minsRaw);
    }
  }

  return {
    sleep,
    energy,
    stress,
    pain,
    soreness: [],
    availableMinutes,
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
	          weight: ex.suggestedWeight ?? null,
	          notes: ex.notes,
	          targetMuscles: ex.exercise.primaryMuscles,
	          loadType: (ex as any).loadType,
	          requiresWeightInput: (ex as any).requiresWeightInput,
	          weightLabel: (ex as any).weightLabel,
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
      plan: any,
      base_plan: any,
      status: string,
      workout_date: string,
    }>(
      `SELECT data, plan, base_plan, status, workout_date FROM planned_workouts 
       WHERE user_id = $1 AND workout_date = $2
       LIMIT 1`,
      [uid, workoutDate]
    );
    
    if (!plannedRows.length) {
      throw new AppError("No planned workout found for this date. Please generate a week plan first.", 404);
    }
    
    const row = plannedRows[0];
    const basePlan = (row.base_plan ?? row.plan ?? row.data) as any;
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
	        availableMinutes: readiness.effectiveMinutes ?? 30,
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
	          loadType: (ex as any).loadType,
	          requiresWeightInput: (ex as any).requiresWeightInput,
	          weightLabel: (ex as any).weightLabel,
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
         SET base_plan = COALESCE(base_plan, plan),
             data = $2::jsonb, 
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
		      const availableMinutes = readiness.effectiveMinutes;
          const baseWasCheckinApplied = Boolean(basePlan?.meta?.checkinApplied);
		      const estimateBasePlanMinutes = (plan: any): number | null => {
		        const rawExercises = plan?.exercises;
		        const exercises = Array.isArray(rawExercises) ? rawExercises : [];
		        let totalSec = 0;
		        let counted = 0;
		        for (const ex of exercises) {
		          // `sets` may be a number (planned workouts) OR an array (saved session payload).
		          const setsCountRaw = Array.isArray(ex?.sets)
		            ? ex.sets.length
		            : Number.isFinite(Number(ex?.sets))
		            ? Number(ex?.sets)
		            : Number(ex?.totalSets);
		          const setsCount = Number.isFinite(setsCountRaw) ? Math.round(setsCountRaw) : 0;
		          if (setsCount <= 0) continue;
		          const restRaw = ex?.restSec ?? ex?.rest ?? 90;
		          const restSec = Number.isFinite(Number(restRaw)) ? Math.max(0, Math.round(Number(restRaw))) : 90;
		          const setDurationSec = 60 + restSec;
	          totalSec += setsCount * setDurationSec;
	          counted++;
	        }
	        if (counted > 0 && totalSec > 0) return Math.ceil(totalSec / 60);
	        const totalSetsRaw = Number(plan?.totalSets);
	        if (Number.isFinite(totalSetsRaw) && totalSetsRaw > 0) return Math.ceil(totalSetsRaw * 2.5);
	        const totalExRaw = Number(plan?.totalExercises);
	        if (Number.isFinite(totalExRaw) && totalExRaw > 0) return Math.ceil(totalExRaw * 7.5);
	        return null;
	      };

		      const estimatedRaw = Number(basePlan?.estimatedDuration);
		      const baseEstimated = Number.isFinite(estimatedRaw) && estimatedRaw > 0
		        ? estimatedRaw
		        : estimateBasePlanMinutes(basePlan);

		      const bufferMin =
		        typeof availableMinutes === "number" && Number.isFinite(availableMinutes)
		          ? Math.ceil(availableMinutes * 0.08)
		          : 0;

		      const shouldAdaptForTime =
		        typeof availableMinutes === "number" &&
		        Number.isFinite(availableMinutes) &&
		        typeof baseEstimated === "number" &&
		        Number.isFinite(baseEstimated) &&
		        baseEstimated > availableMinutes + bufferMin;

          // If this workout was previously adapted for shorter time (check-in applied),
          // allow re-generation when the user now has significantly MORE time.
          const shouldAdaptForMoreTime =
            baseWasCheckinApplied &&
            typeof availableMinutes === "number" &&
            Number.isFinite(availableMinutes) &&
            typeof baseEstimated === "number" &&
            Number.isFinite(baseEstimated) &&
            availableMinutes >= 60 &&
            baseEstimated + 15 < availableMinutes;

		      const baseIntent = typeof basePlan?.intent === "string" ? String(basePlan.intent) : null;
		      const shouldAdaptForIntent = baseIntent !== null && baseIntent !== readiness.intent;

		      const blockedSet =
		        Array.isArray(readiness.blockedPatterns) && readiness.blockedPatterns.length > 0
		          ? new Set(readiness.blockedPatterns.map((p) => String(p).toLowerCase().trim()))
		          : null;
		      const baseExercises = Array.isArray(basePlan?.exercises) ? basePlan.exercises : [];
		      const hasBlockedExercises =
		        blockedSet !== null &&
		        baseExercises.some((ex: any) => {
		          const id = ex?.exerciseId || ex?.id || ex?.exercise?.id || null;
		          if (typeof id !== "string") return false;
		          const lib = EXERCISE_LIBRARY.find((e) => e.id === id);
		          if (!lib) return false;
		          return Array.isArray((lib as any).patterns)
		            ? (lib as any).patterns.some((pat: any) => blockedSet.has(String(pat).toLowerCase()))
		            : false;
		        });

		      const hasCoreExercisesWhenOptional =
		        readiness.corePolicy === "optional" &&
		        baseExercises.some((ex: any) => {
		          const id = ex?.exerciseId || ex?.id || ex?.exercise?.id || null;
		          if (typeof id !== "string") return false;
		          const lib = EXERCISE_LIBRARY.find((e) => e.id === id);
		          if (!lib) return false;
		          return Array.isArray((lib as any).patterns)
		            ? (lib as any).patterns.some((pat: any) => String(pat).toLowerCase() === "core")
		            : false;
		        });

		      const shouldRegenerate =
            shouldAdaptForTime ||
            shouldAdaptForMoreTime ||
            shouldAdaptForIntent ||
            hasBlockedExercises ||
            hasCoreExercisesWhenOptional;

		      if (shouldRegenerate) {
		        const reasons: string[] = [];
		        if (shouldAdaptForTime) reasons.push("time");
            if (shouldAdaptForMoreTime) reasons.push("time_up");
		        if (shouldAdaptForIntent) reasons.push("intent");
		        if (hasBlockedExercises) reasons.push("blocked_patterns");
		        if (hasCoreExercisesWhenOptional) reasons.push("core_policy");

		        console.log(
	          `   ✅ KEEP_DAY: Day stays the same, but workout needs adaptation (${reasons.join(", ")}) → regenerating with timeBucket=${readiness.timeBucket}`
	        );

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
          dayIndex: originalDayIndex,
          userProfile,
          readiness,
          history,
          dupIntensity: weekPlanData?.dupPattern?.[originalDayIndex],
          weekPlanData,
        });

        const combinedNotes = [
          ...(decision.notes || []),
          ...(adaptedWorkout.adaptationNotes || []),
        ];

	        workoutData = {
          schemeId: scheme.id,
          schemeName: adaptedWorkout.schemeName,
          dayIndex: adaptedWorkout.dayIndex,
          dayLabel: adaptedWorkout.dayLabel,
          dayFocus: adaptedWorkout.dayFocus,
          intent: adaptedWorkout.intent,
	          exercises: adaptedWorkout.exercises.map((ex) => ({
	            exerciseId: ex.exercise.id,
	            exerciseName: ex.exercise.name,
	            sets: ex.sets,
	            repsRange: ex.repsRange,
	            restSec: ex.restSec,
	            weight: ex.suggestedWeight ?? null,
	            notes: ex.notes,
	            targetMuscles: ex.exercise.primaryMuscles,
	            loadType: (ex as any).loadType,
	            requiresWeightInput: (ex as any).requiresWeightInput,
	            weightLabel: (ex as any).weightLabel,
	          })),
          totalExercises: adaptedWorkout.totalExercises,
          totalSets: adaptedWorkout.totalSets,
          estimatedDuration: adaptedWorkout.estimatedDuration,
          adaptationNotes: combinedNotes.length > 0 ? combinedNotes : undefined,
          warnings: readiness.warnings?.length > 0 ? readiness.warnings : undefined,
          meta: {
            adaptedAt: new Date().toISOString(),
            originalDayIndex,
            finalDayIndex: originalDayIndex,
            action: "keep_day",
            wasSwapped: false,
            checkinApplied: !!checkin,
          },
        };

        console.log(
          `   ✅ KEEP_DAY: Regenerated workout (${workoutData.totalExercises} ex, ${workoutData.totalSets} sets, ${workoutData.estimatedDuration}min)`
        );
	      } else {
	        console.log(`   ✅ KEEP_DAY: Using base plan exercises`);
      
        // Берём упражнения из basePlan (из БД), только добавляем notes/warnings
        const combinedNotes = [
          ...(decision.notes || []),
          ...(basePlan.adaptationNotes || []),
        ];

	        const enrichedExercises = enrichLoadInfoForStoredPlanExercises(
	          Array.isArray(basePlan?.exercises) ? basePlan.exercises : []
	        );

	        // planned_workouts may not store weights; attach suggested weights from progression for UI.
	        let exercisesWithWeights = enrichedExercises;
	        try {
	          const needsWeights = enrichedExercises.some((ex: any) => {
	            const hasWeight = toFinitePositiveNumberOrNull(ex?.weight) != null;
	            const lt = String(ex?.loadType || "").toLowerCase();
	            const isBodyweight = lt === "bodyweight";
	            return !hasWeight && !isBodyweight;
	          });

	          if (needsWeights) {
	            const ids = enrichedExercises
	              .map((ex: any) => ex?.exerciseId || ex?.id || ex?.exercise?.id || null)
	              .filter((id: any) => typeof id === "string") as string[];
	            const uniqueIds = Array.from(new Set(ids));
	            const libById = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e] as const));
	            const libExercises = uniqueIds.map((id) => libById.get(id)).filter(Boolean) as any[];

	            if (libExercises.length > 0) {
	              const recs = await getNextWorkoutRecommendations({
	                userId: uid,
	                exercises: libExercises,
	                goal: userProfile.goal,
	                experience: userProfile.experience,
	              });

	              exercisesWithWeights = enrichedExercises.map((ex: any) => {
	                const id = ex?.exerciseId || ex?.id || ex?.exercise?.id || null;
	                const rec = typeof id === "string" ? recs.get(id) : undefined;
	                const suggested = rec?.newWeight;
	                const suggestedWeight = toFinitePositiveNumberOrNull(suggested);
	                return {
	                  ...ex,
	                  // Keep stored weight if present; otherwise attach suggested (null for BW).
	                  weight: toFinitePositiveNumberOrNull(ex?.weight) ?? suggestedWeight,
	                };
	              });
	            }
	          }
	        } catch (e) {
	          console.warn("   ⚠️  Failed to attach suggested weights for stored plan exercises:", e);
	        }
	        workoutData = {
	          ...basePlan, // Сохраняем ВСЕ данные из базового плана (упражнения, sets, reps)
	          exercises: exercisesWithWeights,
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

        console.log(
          `   ✅ Kept original workout (${basePlan.totalExercises} ex, ${basePlan.totalSets} sets, ${basePlan.estimatedDuration}min)`
        );
      }
      
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
	          weight: ex.suggestedWeight ?? null,
	          notes: ex.notes,
	          targetMuscles: ex.exercise.primaryMuscles,
	          loadType: (ex as any).loadType,
	          requiresWeightInput: (ex as any).requiresWeightInput,
	          weightLabel: (ex as any).weightLabel,
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
       SET base_plan = COALESCE(base_plan, plan),
           data = $2::jsonb, 
           plan = $2::jsonb,
           updated_at = NOW()
       WHERE user_id = $1 AND workout_date = $3`,
      [uid, workoutData, workoutDate]
    );
    
    // If swapped, mark future occurrence of finalDayIndex as "already done today"
    if (decision.action === "swap_day") {
      // Find the next planned workout that corresponds to finalDayIndex and mark it as already done.
      const nextRows = await q<{ workout_date: string }>(
        `SELECT workout_date
         FROM planned_workouts
         WHERE user_id = $1
           AND workout_date > $2
           AND (data->>'dayIndex')::int = $3
         ORDER BY workout_date ASC
         LIMIT 1`,
        [uid, workoutDate, finalDayIndex]
      );

      if (nextRows.length) {
        const nextDate = nextRows[0].workout_date;
        const markedAt = new Date().toISOString();

        await q(
          `UPDATE planned_workouts
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'wasSwappedEarlier', true,
             'swappedIntoDate', $3,
             'swappedFromDayIndex', $4,
             'swappedToDayIndex', $5,
             'swappedMarkedAt', $6
           ),
           updated_at = NOW()
           WHERE user_id = $1
             AND workout_date = $2`,
          [uid, nextDate, workoutDate, originalDayIndex, finalDayIndex, markedAt]
        );

        console.log(`      Marked future dayIndex=${finalDayIndex} on ${nextDate} as swapped`);
      } else {
        console.log(`      No future planned workout found for dayIndex=${finalDayIndex} to mark as swapped`);
      }
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

    const debugProgression =
      process.env.DEBUG_PROGRESSION === "1" ||
      process.env.DEBUG_AI === "1" ||
      String(process.env.DEBUG_AI || "").toLowerCase().includes("progression");
    if (debugProgression) {
      const exCount = Array.isArray(payload?.exercises) ? payload.exercises.length : 0;
      const exSummary = Array.isArray(payload?.exercises)
        ? payload.exercises.slice(0, 30).map((e: any) => ({
            id: e?.id,
            name: e?.name,
            repsTarget: e?.reps,
            sets: Array.isArray(e?.sets) ? e.sets.length : 0,
            repsFilled: Array.isArray(e?.sets) ? e.sets.filter((s: any) => (s?.reps ?? 0) > 0).length : 0,
            weightFilled: Array.isArray(e?.sets) ? e.sets.filter((s: any) => (s?.weight ?? 0) > 0).length : 0,
            repsSample: Array.isArray(e?.sets) ? e.sets.slice(0, 6).map((s: any) => s?.reps ?? null) : [],
            weightSample: Array.isArray(e?.sets) ? e.sets.slice(0, 6).map((s: any) => s?.weight ?? null) : [],
            effort: e?.effort,
          }))
        : [];
      console.log("[save-session][debug] request", {
        userId: String(uid).slice(0, 8),
        plannedWorkoutId,
        startedAt: startedAt.toISOString(),
        durationMin,
        finishedAt: finishedAt.toISOString(),
        sessionRpe: payload?.feedback?.sessionRpe,
        exercises: exCount,
        exSummary,
      });
    }

    const payloadChangesRaw = Array.isArray(payload?.changes) ? payload.changes : [];
    const payloadChanges = payloadChangesRaw
      .filter((c: any) => c && typeof c === "object")
      .slice(0, 80)
      .map((c: any) => ({
        action: String(c.action || ""),
        fromExerciseId: c.fromExerciseId != null ? String(c.fromExerciseId) : null,
        toExerciseId: c.toExerciseId != null ? String(c.toExerciseId) : null,
        reason: c.reason != null ? String(c.reason) : null,
        source: c.source != null ? String(c.source) : null,
        meta: c.meta ?? null,
        at: c.at != null ? String(c.at) : new Date().toISOString(),
      }))
      .filter((c: any) => c.action && ["replace", "remove", "skip", "exclude", "include"].includes(c.action));

	    let progression: any = null;
	    let progressionJobId: string | null = null;
	    let progressionJobStatus: string | null = null;
	    let coachJobId: string | null = null;
	    let coachJobStatus: string | null = null;
	    let weeklyCoachJobId: string | null = null;

		    const { sessionId, jobId, coachJobId: cjId } = await withTransaction(async () => {
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
                  plan = $5::jsonb,
                  data = $5::jsonb,
                  updated_at = NOW()
            WHERE id = $1 AND user_id = $2`,
          [plannedWorkoutId, uid, sessionId, finishedAt.toISOString(), JSON.stringify(payload)]
        );
      } else {
        await q(
          `INSERT INTO planned_workouts (user_id, plan, scheduled_for, status, result_session_id, workout_date, data, completed_at)
           VALUES ($1, $2::jsonb, $3, 'completed', $4, $5, $2::jsonb, $3)`,
          [uid, payload, finishedAt.toISOString(), sessionId, finishedAt.toISOString().slice(0, 10)]
        );
      }

      if (payloadChanges.length) {
        for (const c of payloadChanges) {
          await logExerciseChangeEvent({
            userId: uid,
            plannedWorkoutId,
            sessionId,
            action: c.action as any,
            fromExerciseId: c.fromExerciseId,
            toExerciseId: c.toExerciseId,
            reason: c.reason,
            source: c.source,
            meta: { ...(c.meta ?? {}), at: c.at },
          });
        }
      }

      // NEW: Outbox job for progression (eventual consistency)
	      const { jobId } = await enqueueProgressionJob({
	        userId: uid,
	        sessionId,
	        plannedWorkoutId,
	        workoutDate: finishedAt.toISOString().slice(0, 10),
	      });

		      const { jobId: cj } = await enqueueCoachJob({
		        userId: uid,
		        kind: "session",
		        sessionId,
		      });

		      return { sessionId, jobId, coachJobId: cj };
		    });

		    progressionJobId = jobId;
		    coachJobId = cjId || null;

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

	    // Coach feedback: do not block saving the workout (OpenAI call can be slow).
	    coachJobStatus = coachJobId ? "pending" : null;
	    if (coachJobId) {
	      setTimeout(() => {
	        processCoachJob({ jobId: coachJobId })
	          .catch((e) => console.error("[save-session] coach job async failed:", (e as any)?.message || e));
	      }, 0);
	    }

	    // Weekly: best-effort enqueue (throttled inside helper)
	    try {
	      const w = await maybeEnqueueWeeklyCoachJob({ userId: uid, nowIso: finishedAt.toISOString() });
	      weeklyCoachJobId = w?.jobId || null;
	    } catch (e) {
	      console.warn("[save-session] weekly coach enqueue failed:", (e as any)?.message || e);
	      weeklyCoachJobId = null;
	    }

    if (debugProgression) {
      console.log("[save-session][debug] response", {
        ok: true,
        sessionId: String(sessionId).slice(0, 8),
        progressionJobId: String(progressionJobId).slice(0, 8),
        progressionJobStatus,
        progressionSummary: progression
          ? {
              totalExercises: progression.totalExercises,
              progressedCount: progression.progressedCount,
              maintainedCount: progression.maintainedCount,
              deloadCount: progression.deloadCount,
            }
          : null,
      });
    }

	    res.json({
	      ok: true,
	      sessionId,
	      progression,
	      progressionJobId,
	      progressionJobStatus,
	      coachJobId,
	      coachJobStatus,
	      weeklyCoachJobId,
	    });
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
// GET /coach/jobs/:id - Poll coach job status/result
// ============================================================================

workoutGeneration.get(
  "/coach/jobs/:id",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const jobId = String(req.params?.id || "");
    if (!isUUID(jobId)) throw new AppError("Invalid job id", 400);
    const job = await getCoachJob(uid, jobId);
    if (!job) throw new AppError("coach_job_not_found", 404);
    res.json({ ok: true, job });
  })
);

// ============================================================================
// GET /coach/session/:sessionId - Get latest coach report for a session
// ============================================================================

workoutGeneration.get(
  "/coach/session/:sessionId",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const sessionId = String(req.params?.sessionId || "");
    if (!isUUID(sessionId)) throw new AppError("Invalid session id", 400);
    const report = await getCoachReportBySession(uid, sessionId);
    if (!report) return res.json({ ok: true, found: false });
    res.json({ ok: true, found: true, report });
  })
);

// ============================================================================
// GET /coach/weekly/latest - Latest weekly coach report (last 7 days)
// ============================================================================

workoutGeneration.get(
  "/coach/weekly/latest",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const report = await getLatestWeeklyCoachReport(uid);
    if (!report) return res.json({ ok: true, found: false });
    res.json({ ok: true, found: true, report });
  })
);

// ============================================================================
// GET /sessions/:id - Fetch saved workout session (for deep links)
// ============================================================================

workoutGeneration.get(
  "/sessions/:id",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const sessionId = String(req.params?.id || "");
    if (!isUUID(sessionId)) throw new AppError("Invalid session id", 400);

    const [s] = await q<{ id: string; finished_at: string; payload: any }>(
      `SELECT id, finished_at, payload
         FROM workout_sessions
        WHERE user_id = $1 AND id = $2::uuid
        LIMIT 1`,
      [uid, sessionId]
    );
    if (!s?.id) throw new AppError("session_not_found", 404);

    const [pj] = await q<{ id: string; status: string | null; result: any | null; last_error: string | null }>(
      `SELECT id, status, result, last_error
         FROM progression_jobs
        WHERE user_id = $1 AND session_id = $2::uuid
        LIMIT 1`,
      [uid, sessionId]
    );

    const coach = await getCoachReportBySession(uid, sessionId);

    res.json({
      ok: true,
      session: {
        id: s.id,
        finishedAt: s.finished_at,
        payload: s.payload,
      },
      progressionJob: pj
        ? { id: pj.id, status: pj.status, result: pj.result ?? null, lastError: pj.last_error ?? null }
        : null,
      coachReport: coach || null,
    });
  })
);

// ============================================================================
// COACH CHAT: Ask questions with full history context
// ============================================================================

workoutGeneration.get(
  "/coach/chat/history",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const limit = Number(req.query?.limit);
    const messages = await getCoachChatHistoryForUser(uid, Number.isFinite(limit) ? limit : 40);
    res.json({ ok: true, messages });
  })
);

workoutGeneration.post(
  "/coach/chat",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const message = req.body?.message;
    const out = await sendCoachChatMessage({ userId: uid, message });
    res.json({ ok: true, threadId: out.threadId, userMessage: out.userMessage, assistantMessage: out.assistantMessage });
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

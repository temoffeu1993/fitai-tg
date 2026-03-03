// api/src/schemes.ts
// ============================================================================
// SCHEMES API - UPDATED TO USE NEW NORMALIZED SCHEMES
// ============================================================================

import { Router, Response } from "express";
import { q } from "./db.js";
import { asyncHandler, AppError } from "./middleware/errorHandler.js";
import { 
  NORMALIZED_SCHEMES, 
  getCandidateSchemes, 
  rankSchemes,
  type NormalizedWorkoutScheme,
  type SchemeUser,
  type ExperienceLevel,
  type Goal,
  type Location,
  type TimeBucket,
  type ConstraintTag,
} from "./normalizedSchemes.js";

export const schemes = Router();

function getUid(req: any): string {
  if (req.user?.uid) return req.user.uid;
  throw new AppError("Unauthorized", 401);
}

// ============================================================================
// HELPER: Validate goal (no legacy mapping)
// ============================================================================

const ALLOWED_GOALS: ReadonlySet<Goal> = new Set([
  "lose_weight",
  "build_muscle",
  "athletic_body",
  "health_wellness",
]);

function parseGoal(rawGoal: string): Goal {
  if (ALLOWED_GOALS.has(rawGoal as Goal)) {
    return rawGoal as Goal;
  }
  throw new AppError(
    `Unsupported goal value "${rawGoal}". Expected one of: ${Array.from(ALLOWED_GOALS).join(", ")}.`,
    400
  );
}

// ============================================================================
// HELPER: Resolve training location from onboarding payload
// ============================================================================

function resolveLocation(
  trainingPlace?: string | null,
  location?: string,
  equipmentList?: string[]
): Location {
  if (trainingPlace === "gym") return "gym";
  if (trainingPlace === "home_no_equipment") return "home_no_equipment";
  if (trainingPlace === "home_with_gear") return "home_with_gear";
  if (location === "gym") return "gym";
  if (location === "home_no_equipment") return "home_no_equipment";
  if (location === "home_with_gear") return "home_with_gear";
  if (location === "home") {
    if (equipmentList?.some((item) => ["dumbbells", "bands"].includes(item))) {
      return "home_with_gear";
    }
    return "home_no_equipment";
  }
  return "gym";
}

// ============================================================================
// HELPER: Calculate time bucket from minutes
// ============================================================================

function calculateTimeBucket(minutes: number): TimeBucket {
  if (minutes <= 50) return 45;
  if (minutes <= 75) return 60;
  return 90;
}

// ============================================================================
// POST /schemes/recommend - Get recommended schemes based on onboarding
// ============================================================================

schemes.post(
  "/schemes/recommend",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    // Get onboarding data
    const onboardingRows = await q<{ summary: any, data: any }>(
      `SELECT summary, data FROM onboardings WHERE user_id = $1`,
      [uid]
    );
    
    if (!onboardingRows.length || !onboardingRows[0].summary) {
      throw new AppError("Onboarding data not found", 404);
    }
    
    const summary = onboardingRows[0].summary;
    const data = onboardingRows[0].data;
    
    // Extract user parameters
    const daysPerWeek = data.schedule?.daysPerWeek || summary.schedule?.daysPerWeek || 3;
    const minutesPerSession = data.schedule?.minutesPerSession || 60;
    
    // Map experience
    let experience = data.experience?.level || data.experience || summary.experience?.level || summary.experience || "beginner";
    const expMap: Record<string, ExperienceLevel> = {
      never_trained: "beginner",
      long_break: "beginner",
      novice: "beginner",
      training_regularly: "intermediate",
      training_experienced: "advanced",
    };
    experience = expMap[experience] || experience;
    
    // Map goal
    const rawGoal = data.motivation?.goal || data.goals?.primary || summary.goals?.primary || "health_wellness";
    const goal = parseGoal(rawGoal);
    
    // Extract other params
    const sex = data.ageSex?.sex === "male" ? "male" : data.ageSex?.sex === "female" ? "female" : undefined;
    const trainingPlace = data.trainingPlace?.place || summary.trainingPlace?.place || null;
    const location = data.location?.type || summary.location || "gym";
    const equipmentList =
      data.equipment?.available || summary.equipmentItems || summary.equipment || [];
    
    // Extract age and body metrics
    const age = data.ageSex?.age || summary.ageSex?.age || 30;
    const height = data.body?.height || summary.body?.height || 170;
    const weight = data.body?.weight || summary.body?.weight || 70;
    
    // Calculate BMI
    const heightM = height / 100;
    const bmi = weight / (heightM * heightM);
    
    // Map to new format
    const resolvedLocation = resolveLocation(trainingPlace, location, equipmentList);
    const timeBucket = calculateTimeBucket(minutesPerSession);
    
    // Build constraints based on age and BMI
    const constraints: ConstraintTag[] = [];
    
    // Age-based constraints
    if (age >= 50) {
      constraints.push("avoid_high_impact");
      constraints.push("avoid_heavy_spinal_loading");
    } else if (age >= 35) {
      // 35-50: moderate approach, no specific constraints but will influence scoring
    }
    
    // BMI-based constraints
    if (bmi >= 30) {
      constraints.push("avoid_high_impact");
    }

    // Experience-based constraints
    if (experience === "beginner") {
      constraints.push("beginner_simplicity");
    }
    
    // Build user profile for new system
    const userProfile: SchemeUser = {
      experience: experience as ExperienceLevel,
      goal,
      daysPerWeek,
      timeBucket,
      location: resolvedLocation,
      sex: sex as "male" | "female" | undefined,
      constraints,
      age, // added for ranking logic
      bmi, // added for ranking logic
    };
    
    console.log("🔍 User profile for scheme recommendation:", {
      ...userProfile,
      ageCategory: age >= 50 ? "50+" : age >= 35 ? "35-50" : "18-35",
      bmiCategory: bmi >= 30 ? "≥30 (high)" : bmi >= 25 ? "25-30 (overweight)" : "<25 (normal)",
      appliedConstraints: constraints.length ? constraints : "none",
    });
    
    // Use new recommendation system
    let candidates = getCandidateSchemes(userProfile);
    let fallbackUsed: string | null = null;

    // Fallback strategy: relax filters step by step if no exact match
    if (candidates.length === 0) {
      // Step 1: Try adjacent days (±1)
      for (const delta of [-1, 1]) {
        const altDays = daysPerWeek + delta;
        if (altDays >= 2 && altDays <= 6) {
          candidates = getCandidateSchemes({ ...userProfile, daysPerWeek: altDays });
          if (candidates.length > 0) {
            fallbackUsed = `Точной схемы на ${daysPerWeek} дней не нашлось — показываем ближайшую на ${altDays} дней.`;
            break;
          }
        }
      }
    }

    if (candidates.length === 0) {
      // Step 2: Try relaxing time bucket (90→60, 45→60)
      const altTime: TimeBucket = timeBucket === 90 ? 60 : timeBucket === 45 ? 60 : 45;
      candidates = getCandidateSchemes({ ...userProfile, timeBucket: altTime });
      if (candidates.length > 0) {
        fallbackUsed = `Точной схемы на ${timeBucket} мин не нашлось — показываем ближайшую на ${altTime} мин.`;
      }
    }

    if (candidates.length === 0) {
      // Step 3: Try relaxing goal to athletic_body (most universal)
      if (goal !== "athletic_body") {
        candidates = getCandidateSchemes({ ...userProfile, goal: "athletic_body" });
        if (candidates.length > 0) {
          fallbackUsed = `Точной схемы для "${goal}" не нашлось — показываем универсальную программу.`;
        }
      }
    }

    if (candidates.length === 0) {
      throw new AppError(
        `К сожалению, не нашлось подходящей схемы для ваших параметров (${goal}, ${daysPerWeek} дн/нед, ${experience}). Попробуйте изменить количество дней в неделю или другие параметры.`,
        404
      );
    }

    if (fallbackUsed) {
      console.log(`⚠️ Fallback used: ${fallbackUsed}`);
    }
    
    // Rank schemes
    const ranked = rankSchemes(userProfile, candidates);
    
    console.log(`✅ Found ${ranked.length} candidates, recommending top 3`);
    
    // Generate personalized reasons
    function generateReason(scheme: NormalizedWorkoutScheme, position: 'recommended' | 'alt1' | 'alt2'): string {
      const reasons: string[] = [];
      
      if (position === 'recommended') {
        reasons.push(`Схема "${scheme.russianName}" — оптимальный выбор для ваших целей.`);
      } else if (position === 'alt1') {
        reasons.push(`Схема "${scheme.russianName}" — отличная альтернатива с немного другим подходом.`);
      } else {
        reasons.push(`Схема "${scheme.russianName}" — ещё один эффективный вариант для рассмотрения.`);
      }
      
      reasons.push(scheme.description);
      
      // Frequency
      reasons.push(`${scheme.daysPerWeek} тренировки в неделю обеспечивают оптимальный баланс нагрузки и восстановления.`);
      
      // Intensity
      const intensityMap = {
        low: "Мягкая интенсивность подходит для комфортного входа в тренировочный процесс",
        moderate: "Умеренная интенсивность — золотая середина для стабильного прогресса",
        high: "Высокая интенсивность максимизирует результаты при правильном восстановлении"
      };
      reasons.push(intensityMap[scheme.intensity] + ".");
      
      return reasons.join(" ");
    }
    
    // Convert to old format for API compatibility
    function convertToOldFormat(scheme: NormalizedWorkoutScheme) {
      return {
        id: scheme.id,
        name: scheme.name,
        russianName: scheme.russianName,
        description: scheme.description,
        daysPerWeek: scheme.daysPerWeek,
        minMinutes: scheme.timeBuckets[0], // Approximate
        maxMinutes: scheme.timeBuckets[scheme.timeBuckets.length - 1],
        splitType: scheme.splitType,
        experienceLevels: scheme.experienceLevels,
        goals: scheme.goals,
        equipmentRequired: scheme.locations,
        dayLabels: scheme.days.map(d => ({
          day: d.day,
          label: d.label,
          focus: d.focus,
          templateRulesId: d.templateRulesId,
        })),
        benefits: scheme.benefits,
        // notes: scheme.notes, // ❌ СКРЫТО - это для разработчиков, не для клиента
        intensity: scheme.intensity,
        targetSex: scheme.targetSex || 'any',
      };
    }
    
    // Build response
    const response = {
      recommended: {
        ...convertToOldFormat(ranked[0]),
        reason: generateReason(ranked[0], 'recommended'),
        isRecommended: true,
      },
      alternatives: ranked.slice(1, 3).map((scheme, idx) => ({
        ...convertToOldFormat(scheme),
        reason: generateReason(scheme, idx === 0 ? 'alt1' : 'alt2'),
        isRecommended: false,
      })),
      ...(fallbackUsed ? { fallbackNote: fallbackUsed } : {}),
    };

    res.json(response);
  })
);

// ============================================================================
// POST /schemes/select - Save selected scheme
// ============================================================================

schemes.post(
  "/schemes/select",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    const { schemeId } = req.body;
    
    if (!schemeId) {
      throw new AppError("Scheme ID is required", 400);
    }
    
    // Find scheme in new system
    const selectedScheme = NORMALIZED_SCHEMES.find(s => s.id === schemeId);
    if (!selectedScheme) {
      throw new AppError("Scheme not found", 404);
    }
    
    console.log(`✅ User ${uid} selected scheme: ${selectedScheme.russianName}`);
    
    // Check if scheme exists in DB
    const schemeRows = await q<{ id: string }>(
      `SELECT id FROM workout_schemes WHERE id = $1`,
      [schemeId]
    );
    
    if (schemeRows.length === 0) {
      // Add scheme to database
      await q(
        `INSERT INTO workout_schemes 
         (id, name, description, days_per_week, min_minutes, max_minutes, split_type, 
          experience_levels, goals, equipment_required, day_labels, benefits, notes, intensity, target_sex)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
         ON CONFLICT (id) DO NOTHING`,
        [
          schemeId,
          selectedScheme.name,
          selectedScheme.description,
          selectedScheme.daysPerWeek,
          selectedScheme.timeBuckets[0],
          selectedScheme.timeBuckets[selectedScheme.timeBuckets.length - 1],
          selectedScheme.splitType,
          selectedScheme.experienceLevels,
          selectedScheme.goals,
          selectedScheme.locations,
          JSON.stringify(selectedScheme.days.map(d => ({
            day: d.day,
            label: d.label,
            focus: d.focus,
            templateRulesId: d.templateRulesId,
          }))),
          selectedScheme.benefits,
          selectedScheme.notes || null,
          selectedScheme.intensity,
          selectedScheme.targetSex || 'any',
        ]
      );
    }
    
    // Save user selection
    await q(
      `INSERT INTO user_workout_schemes (user_id, scheme_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET scheme_id = $2, selected_at = now()`,
      [uid, schemeId]
    );
    
    // Save to training_programs for workout generation
    const blueprint = {
      name: selectedScheme.name,
      days: selectedScheme.days.map(d => ({
        label: d.label,
        focus: d.focus,
        templateRulesId: d.templateRulesId,
      })),
      description: selectedScheme.description,
      meta: {
        daysPerWeek: selectedScheme.daysPerWeek,
        goals: selectedScheme.goals,
        location: "gym",
        trainingStatus: "intermediate" as const,
        createdAt: new Date().toISOString(),
      },
    };
    
    await q(
      `INSERT INTO training_programs (user_id, blueprint_json, microcycle_len, week, day_idx)
       VALUES ($1, $2::jsonb, $3, 1, 0)
       ON CONFLICT (user_id) DO UPDATE 
       SET blueprint_json = $2::jsonb, microcycle_len = $3, updated_at = now()`,
      [uid, blueprint, selectedScheme.daysPerWeek]
    );
    
    res.json({ 
      ok: true, 
      scheme: {
        ...selectedScheme,
        dayLabels: selectedScheme.days,
      } 
    });
  })
);

// ============================================================================
// GET /schemes/selected - Get user's selected scheme
// ============================================================================

schemes.get(
  "/schemes/selected",
  asyncHandler(async (req: any, res: Response) => {
    const uid = getUid(req);
    
    const rows = await q<{ scheme_id: string }>(
      `SELECT scheme_id FROM user_workout_schemes WHERE user_id = $1`,
      [uid]
    );
    
    if (!rows.length) {
      return res.json({ scheme: null });
    }
    
    const selectedScheme = NORMALIZED_SCHEMES.find(s => s.id === rows[0].scheme_id);
    
    if (!selectedScheme) {
      return res.json({ scheme: null });
    }
    
    res.json({ 
      scheme: {
        ...selectedScheme,
        dayLabels: selectedScheme.days,
      } 
    });
  })
);

// ============================================================================
// GET /schemes/all - Get all available schemes (for debugging/admin)
// ============================================================================

schemes.get(
  "/schemes/all",
  asyncHandler(async (_req: any, res: Response) => {
    res.json({
      schemes: NORMALIZED_SCHEMES.map(s => ({
        ...s,
        dayLabels: s.days,
      })),
      total: NORMALIZED_SCHEMES.length,
    });
  })
);

export default schemes;

import { q } from "./db.js";
import { AppError } from "./middleware/errorHandler.js";
import { NORMALIZED_SCHEMES, type ExperienceLevel, type Goal, type Location, type TimeBucket } from "./normalizedSchemes.js";
import type { UserProfile } from "./workoutDayGenerator.js";

/**
 * Deterministic user profile for the workout generator and related endpoints.
 * Keeps mapping logic in one place (experience/goal/equipment/time bucket + exclusions).
 */
export async function buildUserProfile(uid: string): Promise<UserProfile> {
  // Get onboarding data
  const onboardingRows = await q<{ summary: any; data: any }>(
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

  const scheme = NORMALIZED_SCHEMES.find((s) => s.id === schemeRows[0].scheme_id);
  if (!scheme) {
    throw new AppError("Selected scheme not found", 404);
  }

  // Extract parameters
  const daysPerWeek = scheme.daysPerWeek;
  const minutesPerSession = data.schedule?.minutesPerSession || 60;

  // Map experience
  let experience: ExperienceLevel = "beginner";
  const rawExp =
    data.experience?.level || data.experience || summary.experience?.level || summary.experience || "beginner";
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
    tone_up: "athletic_body",
    lower_body_focus: "lower_body_focus",
    strength: "strength",
    health_wellness: "health_wellness",
    fat_loss: "lose_weight",
    hypertrophy: "build_muscle",
    general_fitness: "athletic_body",
    powerlifting: "strength",
  };
  const goal: Goal = goalMap[oldGoal] || "health_wellness";

  // Resolve location
  const trainingPlace = data.trainingPlace?.place || summary.trainingPlace?.place || null;
  const location = data.location?.type || summary.location || "gym";
  const equipmentList =
    data.equipment?.available || summary.equipmentItems || summary.equipment || [];
  let resolvedLocation: Location = "gym";
  if (trainingPlace === "gym") {
    resolvedLocation = "gym";
  } else if (trainingPlace === "home_no_equipment") {
    resolvedLocation = "home_no_equipment";
  } else if (trainingPlace === "home_with_gear") {
    resolvedLocation = "home_with_gear";
  } else if (location === "home_no_equipment") {
    resolvedLocation = "home_no_equipment";
  } else if (location === "home_with_gear") {
    resolvedLocation = "home_with_gear";
  } else if (location === "home") {
    resolvedLocation = equipmentList.some((item: string) => ["dumbbells", "bands"].includes(item))
      ? "home_with_gear"
      : "home_no_equipment";
  }

  // Calculate time bucket
  let timeBucket: TimeBucket = 60;
  if (minutesPerSession < 52) timeBucket = 45;
  else if (minutesPerSession < 73) timeBucket = 60;
  else timeBucket = 90;

  // Get sex
  const sex = data.ageSex?.sex === "male" ? "male" : data.ageSex?.sex === "female" ? "female" : undefined;

  // Excluded exercises (user preference)
  const excludedRows = await q<{ excluded_exercise_ids: string[] | null }>(
    `SELECT excluded_exercise_ids FROM users WHERE id = $1::uuid LIMIT 1`,
    [uid]
  );
  const excludedExerciseIds = Array.isArray(excludedRows[0]?.excluded_exercise_ids)
    ? excludedRows[0]!.excluded_exercise_ids
    : [];

  return {
    userId: uid,
    experience,
    goal,
    daysPerWeek,
    timeBucket,
    location: resolvedLocation,
    sex,
    excludedExerciseIds,
  };
}

// api/src/e2e.test.ts — Full E2E flow: Onboarding → Scheme → Generate → Start → Save
// Tests 50+ user personas through the complete workout lifecycle with real DB

import { jest, describe, test, afterAll, expect } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "./testApp.js";
import { q, pool } from "./db.js";
import { config } from "./config.js";

// ============================================================================
// TEST SETUP
// ============================================================================

const app = createApp();
const TG_ID_BASE = 900_000_000; // test user tg_ids start here

interface Persona {
  name: string;
  sex: "male" | "female";
  age: number;
  height: number;
  weight: number;
  experience: "beginner" | "intermediate" | "advanced";
  goal: "build_muscle" | "lose_weight" | "athletic_body" | "health_wellness";
  daysPerWeek: number;
  minutesPerSession: number;
  place: "gym" | "home_with_gear" | "home_no_equipment";
  equipmentItems?: string[];
  pain?: { location: string; level: number }[];
  checkin?: {
    sleepQuality: string;
    energyLevel: string;
    stressLevel: string;
    pain?: { location: string; level: number }[];
    availableMinutes?: number;
  };
}

// ============================================================================
// 50+ PERSONAS — covering all meaningful combinations
// ============================================================================

const PERSONAS: Persona[] = [
  // === GROUP 1: BEGINNERS (16 personas) ===
  { name: "B01 beginner/muscle/gym/M/25/3d/60m", sex: "male", age: 25, height: 178, weight: 75, experience: "beginner", goal: "build_muscle", daysPerWeek: 3, minutesPerSession: 60, place: "gym" },
  { name: "B02 beginner/muscle/home_gear/F/30/3d/45m", sex: "female", age: 30, height: 165, weight: 58, experience: "beginner", goal: "build_muscle", daysPerWeek: 3, minutesPerSession: 45, place: "home_with_gear", equipmentItems: ["dumbbells", "bands"] },
  { name: "B03 beginner/muscle/home_bw/M/20/4d/30m", sex: "male", age: 20, height: 175, weight: 68, experience: "beginner", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 30, place: "home_no_equipment" },
  { name: "B04 beginner/lose/gym/F/35/4d/60m", sex: "female", age: 35, height: 160, weight: 72, experience: "beginner", goal: "lose_weight", daysPerWeek: 4, minutesPerSession: 60, place: "gym" },
  { name: "B05 beginner/lose/home_gear/M/40/3d/45m", sex: "male", age: 40, height: 180, weight: 95, experience: "beginner", goal: "lose_weight", daysPerWeek: 3, minutesPerSession: 45, place: "home_with_gear", equipmentItems: ["dumbbells", "bands"] },
  { name: "B06 beginner/lose/home_bw/F/28/2d/30m", sex: "female", age: 28, height: 163, weight: 65, experience: "beginner", goal: "lose_weight", daysPerWeek: 2, minutesPerSession: 30, place: "home_no_equipment" },
  { name: "B07 beginner/athletic/gym/M/22/5d/90m", sex: "male", age: 22, height: 182, weight: 78, experience: "beginner", goal: "athletic_body", daysPerWeek: 5, minutesPerSession: 90, place: "gym" },
  { name: "B08 beginner/athletic/home_gear/F/26/3d/60m", sex: "female", age: 26, height: 168, weight: 60, experience: "beginner", goal: "athletic_body", daysPerWeek: 3, minutesPerSession: 60, place: "home_with_gear", equipmentItems: ["dumbbells", "bench", "bands"] },
  { name: "B09 beginner/health/gym/M/55/2d/45m", sex: "male", age: 55, height: 175, weight: 85, experience: "beginner", goal: "health_wellness", daysPerWeek: 2, minutesPerSession: 45, place: "gym" },
  { name: "B10 beginner/health/home_bw/F/60/2d/30m", sex: "female", age: 60, height: 158, weight: 68, experience: "beginner", goal: "health_wellness", daysPerWeek: 2, minutesPerSession: 30, place: "home_no_equipment" },
  { name: "B11 beginner/muscle/gym/M/16/3d/45m (teen)", sex: "male", age: 16, height: 170, weight: 58, experience: "beginner", goal: "build_muscle", daysPerWeek: 3, minutesPerSession: 45, place: "gym" },
  { name: "B12 beginner/health/gym/F/65/2d/30m (senior)", sex: "female", age: 65, height: 155, weight: 70, experience: "beginner", goal: "health_wellness", daysPerWeek: 2, minutesPerSession: 30, place: "gym" },
  { name: "B13 beginner/lose/gym/M/45/2d/45m", sex: "male", age: 45, height: 170, weight: 110, experience: "beginner", goal: "lose_weight", daysPerWeek: 2, minutesPerSession: 45, place: "gym" },
  { name: "B14 beginner/athletic/home_bw/M/18/3d/30m", sex: "male", age: 18, height: 176, weight: 65, experience: "beginner", goal: "athletic_body", daysPerWeek: 3, minutesPerSession: 30, place: "home_no_equipment" },
  { name: "B15 beginner/muscle/gym/F/23/4d/60m", sex: "female", age: 23, height: 170, weight: 55, experience: "beginner", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "gym" },
  { name: "B16 beginner/health/home_gear/M/62/2d/45m", sex: "male", age: 62, height: 172, weight: 78, experience: "beginner", goal: "health_wellness", daysPerWeek: 2, minutesPerSession: 45, place: "home_with_gear", equipmentItems: ["dumbbells", "bands"] },

  // === GROUP 2: INTERMEDIATE (14 personas) ===
  { name: "I01 inter/muscle/gym/M/28/4d/60m", sex: "male", age: 28, height: 180, weight: 82, experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "gym" },
  { name: "I02 inter/muscle/gym/F/25/5d/90m", sex: "female", age: 25, height: 167, weight: 62, experience: "intermediate", goal: "build_muscle", daysPerWeek: 5, minutesPerSession: 90, place: "gym" },
  { name: "I03 inter/muscle/home_gear/M/32/4d/60m", sex: "male", age: 32, height: 176, weight: 80, experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "home_with_gear", equipmentItems: ["dumbbells", "bench", "bands", "pullup_bar"] },
  { name: "I04 inter/lose/gym/F/38/4d/45m", sex: "female", age: 38, height: 162, weight: 70, experience: "intermediate", goal: "lose_weight", daysPerWeek: 4, minutesPerSession: 45, place: "gym" },
  { name: "I05 inter/lose/gym/M/45/3d/60m", sex: "male", age: 45, height: 178, weight: 92, experience: "intermediate", goal: "lose_weight", daysPerWeek: 3, minutesPerSession: 60, place: "gym" },
  { name: "I06 inter/lose/home_gear/F/30/5d/45m", sex: "female", age: 30, height: 165, weight: 67, experience: "intermediate", goal: "lose_weight", daysPerWeek: 5, minutesPerSession: 45, place: "home_with_gear", equipmentItems: ["dumbbells", "bands", "kettlebell"] },
  { name: "I07 inter/athletic/gym/M/26/5d/60m", sex: "male", age: 26, height: 183, weight: 80, experience: "intermediate", goal: "athletic_body", daysPerWeek: 5, minutesPerSession: 60, place: "gym" },
  { name: "I08 inter/athletic/gym/F/23/4d/60m", sex: "female", age: 23, height: 170, weight: 58, experience: "intermediate", goal: "athletic_body", daysPerWeek: 4, minutesPerSession: 60, place: "gym" },
  { name: "I09 inter/health/gym/M/50/3d/60m", sex: "male", age: 50, height: 175, weight: 88, experience: "intermediate", goal: "health_wellness", daysPerWeek: 3, minutesPerSession: 60, place: "gym" },
  { name: "I10 inter/health/home_gear/F/48/3d/45m", sex: "female", age: 48, height: 160, weight: 65, experience: "intermediate", goal: "health_wellness", daysPerWeek: 3, minutesPerSession: 45, place: "home_with_gear", equipmentItems: ["dumbbells", "bands"] },
  { name: "I11 inter/muscle/gym/M/35/6d/60m (high freq)", sex: "male", age: 35, height: 178, weight: 85, experience: "intermediate", goal: "build_muscle", daysPerWeek: 6, minutesPerSession: 60, place: "gym" },
  { name: "I12 inter/lose/home_bw/M/42/3d/30m", sex: "male", age: 42, height: 172, weight: 90, experience: "intermediate", goal: "lose_weight", daysPerWeek: 3, minutesPerSession: 30, place: "home_no_equipment" },
  { name: "I13 inter/muscle/gym/M/30/3d/45m", sex: "male", age: 30, height: 180, weight: 78, experience: "intermediate", goal: "build_muscle", daysPerWeek: 3, minutesPerSession: 45, place: "gym" },
  { name: "I14 inter/athletic/home_gear/F/27/4d/60m", sex: "female", age: 27, height: 168, weight: 60, experience: "intermediate", goal: "athletic_body", daysPerWeek: 4, minutesPerSession: 60, place: "home_with_gear", equipmentItems: ["dumbbells", "bench", "bands", "pullup_bar"] },

  // === GROUP 3: ADVANCED (10 personas) ===
  { name: "A01 adv/muscle/gym/M/28/5d/90m", sex: "male", age: 28, height: 182, weight: 90, experience: "advanced", goal: "build_muscle", daysPerWeek: 5, minutesPerSession: 90, place: "gym" },
  { name: "A02 adv/muscle/gym/F/26/6d/60m", sex: "female", age: 26, height: 168, weight: 63, experience: "advanced", goal: "build_muscle", daysPerWeek: 6, minutesPerSession: 60, place: "gym" },
  { name: "A03 adv/muscle/gym/M/35/4d/60m", sex: "male", age: 35, height: 178, weight: 85, experience: "advanced", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "gym" },
  { name: "A04 adv/lose/gym/M/30/5d/60m", sex: "male", age: 30, height: 180, weight: 88, experience: "advanced", goal: "lose_weight", daysPerWeek: 5, minutesPerSession: 60, place: "gym" },
  { name: "A05 adv/lose/gym/F/28/4d/45m", sex: "female", age: 28, height: 165, weight: 62, experience: "advanced", goal: "lose_weight", daysPerWeek: 4, minutesPerSession: 45, place: "gym" },
  { name: "A06 adv/athletic/gym/M/25/5d/60m", sex: "male", age: 25, height: 185, weight: 82, experience: "advanced", goal: "athletic_body", daysPerWeek: 5, minutesPerSession: 60, place: "gym" },
  { name: "A07 adv/athletic/gym/F/27/6d/90m", sex: "female", age: 27, height: 170, weight: 60, experience: "advanced", goal: "athletic_body", daysPerWeek: 6, minutesPerSession: 90, place: "gym" },
  { name: "A08 adv/health/gym/M/55/3d/60m", sex: "male", age: 55, height: 175, weight: 82, experience: "advanced", goal: "health_wellness", daysPerWeek: 3, minutesPerSession: 60, place: "gym" },
  { name: "A09 adv/muscle/home_gear/M/32/5d/60m", sex: "male", age: 32, height: 180, weight: 85, experience: "advanced", goal: "build_muscle", daysPerWeek: 5, minutesPerSession: 60, place: "home_with_gear", equipmentItems: ["dumbbells", "bench", "pullup_bar", "bands", "kettlebell"] },
  { name: "A10 adv/muscle/gym/M/22/6d/90m (max)", sex: "male", age: 22, height: 186, weight: 92, experience: "advanced", goal: "build_muscle", daysPerWeek: 6, minutesPerSession: 90, place: "gym" },

  // === GROUP 4: EDGE CASES & CONSTRAINTS (14 personas) ===
  {
    name: "E01 beginner/health/gym/M/55 + knee pain",
    sex: "male", age: 55, height: 175, weight: 85, experience: "beginner", goal: "health_wellness", daysPerWeek: 2, minutesPerSession: 45, place: "gym",
    checkin: { sleepQuality: "fair", energyLevel: "medium", stressLevel: "medium", pain: [{ location: "knee", level: 5 }], availableMinutes: 40 },
  },
  {
    name: "E02 inter/muscle/gym/M/35 + shoulder pain",
    sex: "male", age: 35, height: 178, weight: 82, experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "good", energyLevel: "high", stressLevel: "low", pain: [{ location: "shoulder", level: 6 }], availableMinutes: 55 },
  },
  {
    name: "E03 adv/muscle/gym/M/30 + lower_back pain",
    sex: "male", age: 30, height: 180, weight: 88, experience: "advanced", goal: "build_muscle", daysPerWeek: 5, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "good", energyLevel: "medium", stressLevel: "medium", pain: [{ location: "lower_back", level: 7 }], availableMinutes: 50 },
  },
  {
    name: "E04 beginner/lose/gym/F/50 + knee+hip",
    sex: "female", age: 50, height: 160, weight: 80, experience: "beginner", goal: "lose_weight", daysPerWeek: 3, minutesPerSession: 45, place: "gym",
    checkin: { sleepQuality: "ok", energyLevel: "medium", stressLevel: "high", pain: [{ location: "knee", level: 4 }, { location: "hip", level: 5 }], availableMinutes: 40 },
  },
  {
    name: "E05 inter/athletic/gym/M/40 + elbow pain",
    sex: "male", age: 40, height: 176, weight: 80, experience: "intermediate", goal: "athletic_body", daysPerWeek: 4, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "good", energyLevel: "high", stressLevel: "low", pain: [{ location: "elbow", level: 5 }], availableMinutes: 60 },
  },
  {
    name: "E06 beginner/muscle/gym/M/16 (youngest)",
    sex: "male", age: 16, height: 168, weight: 55, experience: "beginner", goal: "build_muscle", daysPerWeek: 3, minutesPerSession: 45, place: "gym",
    checkin: { sleepQuality: "excellent", energyLevel: "high", stressLevel: "low" },
  },
  {
    name: "E07 beginner/health/gym/F/68 (oldest)",
    sex: "female", age: 68, height: 155, weight: 72, experience: "beginner", goal: "health_wellness", daysPerWeek: 2, minutesPerSession: 30, place: "gym",
    checkin: { sleepQuality: "fair", energyLevel: "low", stressLevel: "medium", availableMinutes: 25 },
  },
  {
    name: "E08 inter/lose/gym/M/40 BMI=35 (obese)",
    sex: "male", age: 40, height: 170, weight: 101, experience: "intermediate", goal: "lose_weight", daysPerWeek: 3, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "ok", energyLevel: "medium", stressLevel: "medium" },
  },
  {
    name: "E09 beginner/health/home_bw/F/55 (minimal)",
    sex: "female", age: 55, height: 160, weight: 68, experience: "beginner", goal: "health_wellness", daysPerWeek: 2, minutesPerSession: 30, place: "home_no_equipment",
    checkin: { sleepQuality: "ok", energyLevel: "medium", stressLevel: "low" },
  },
  {
    name: "E10 inter/muscle/gym/F/28 + wrist pain",
    sex: "female", age: 28, height: 165, weight: 58, experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "good", energyLevel: "high", stressLevel: "low", pain: [{ location: "wrist", level: 6 }] },
  },
  {
    name: "E11 beginner/lose/home_bw/M/45 + ankle",
    sex: "male", age: 45, height: 175, weight: 95, experience: "beginner", goal: "lose_weight", daysPerWeek: 2, minutesPerSession: 30, place: "home_no_equipment",
    checkin: { sleepQuality: "fair", energyLevel: "low", stressLevel: "high", pain: [{ location: "ankle", level: 4 }] },
  },
  {
    name: "E12 adv/athletic/gym/M/30 + neck pain",
    sex: "male", age: 30, height: 182, weight: 82, experience: "advanced", goal: "athletic_body", daysPerWeek: 5, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "good", energyLevel: "high", stressLevel: "low", pain: [{ location: "neck", level: 5 }] },
  },
  {
    name: "E13 inter/health/gym/F/52 + multi-pain",
    sex: "female", age: 52, height: 162, weight: 68, experience: "intermediate", goal: "health_wellness", daysPerWeek: 3, minutesPerSession: 45, place: "gym",
    checkin: { sleepQuality: "poor", energyLevel: "low", stressLevel: "very_high", pain: [{ location: "shoulder", level: 4 }, { location: "knee", level: 5 }, { location: "lower_back", level: 6 }], availableMinutes: 30 },
  },
  {
    name: "E14 critical state → should skip/recovery",
    sex: "male", age: 35, height: 180, weight: 82, experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "poor", energyLevel: "low", stressLevel: "very_high", pain: [{ location: "lower_back", level: 9 }, { location: "knee", level: 8 }], availableMinutes: 30 },
  },
];

// ============================================================================
// HELPERS
// ============================================================================

interface TestUser {
  id: string;
  tgId: number;
  token: string;
}

async function createTestUser(tgId: number, name: string): Promise<TestUser> {
  const rows = await q<{ id: string }>(
    `INSERT INTO users (tg_id, first_name, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (tg_id) DO UPDATE SET first_name = EXCLUDED.first_name, updated_at = now()
     RETURNING id`,
    [tgId, name, `test_${tgId}`]
  );
  const id = rows[0].id;
  const token = jwt.sign({ uid: id, tg: tgId }, config.jwtSecret, { expiresIn: "1h" });
  return { id, tgId, token };
}

async function cleanupTestUser(userId: string) {
  // Delete in dependency order
  await q(`DELETE FROM exercise_change_events WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM coach_chat_messages WHERE thread_id IN (SELECT id FROM coach_chat_threads WHERE user_id = $1::uuid)`, [userId]).catch(() => {});
  await q(`DELETE FROM coach_chat_threads WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM coach_jobs WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM progression_jobs WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM exercise_history WHERE user_id = $1`, [userId]).catch(() => {});
  await q(`DELETE FROM exercise_progression WHERE user_id = $1`, [userId]).catch(() => {});
  await q(`DELETE FROM workout_sessions WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM workouts WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM planned_workouts WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM weekly_plans WHERE user_id = $1`, [userId]).catch(() => {});
  await q(`DELETE FROM mesocycles WHERE user_id = $1`, [userId]).catch(() => {});
  await q(`DELETE FROM daily_check_ins WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM body_metrics WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM body_measurements WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM user_session_counters WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM workout_plans WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM training_programs WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM user_workout_schemes WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM onboardings WHERE user_id = $1::uuid`, [userId]).catch(() => {});
  await q(`DELETE FROM users WHERE id = $1::uuid`, [userId]).catch(() => {});
}

function buildOnboardingPayload(p: Persona) {
  const equipmentItems = p.equipmentItems ??
    (p.place === "gym" ? ["machines", "barbell", "dumbbell", "cable", "smith"] :
     p.place === "home_with_gear" ? ["dumbbells", "bands"] :
     ["bodyweight"]);

  return {
    data: {
      profile: { name: `Test ${p.name}` },
      ageSex: { sex: p.sex, age: p.age },
      body: { height: p.height, weight: p.weight },
      schedule: {
        daysPerWeek: p.daysPerWeek,
        perWeek: p.daysPerWeek,
        minutesPerSession: p.minutesPerSession,
        minutes: p.minutesPerSession,
      },
      experience: { level: p.experience },
      trainingPlace: { place: p.place },
      equipmentItems,
      environment: {
        location: p.place === "gym" ? "gym" : "home",
        bodyweightOnly: p.place === "home_no_equipment",
      },
      health: { injuries: [], restrictions: [] },
      lifestyle: { sleep: 7, stress: "medium" },
      dietPrefs: { preference: "balanced" },
      motivation: { goal: p.goal },
      goals: { primary: p.goal },
    },
  };
}

function buildSessionPayload(workout: any) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  return {
    exercises: exercises.map((ex: any) => {
      const sets = Number(ex.sets) || 3;
      const repsRange = String(ex.repsRange || ex.reps || "8-12");
      const [minR, maxR] = repsRange.includes("-")
        ? repsRange.split("-").map(Number)
        : [Number(repsRange) || 10, Number(repsRange) || 10];
      const targetReps = Math.round((minR + maxR) / 2);
      const weight = Number(ex.weight) || 0;

      return {
        id: ex.exerciseId || ex.id,
        name: ex.exerciseName || ex.name,
        reps: repsRange,
        done: true,
        sets: Array.from({ length: sets }, (_, i) => ({
          reps: Math.max(1, targetReps - Math.floor(i / 2)), // slight fatigue
          weight: weight > 0 ? weight : undefined,
          done: true,
        })),
      };
    }),
    feedback: { sessionRpe: 7 },
  };
}

// ============================================================================
// RESULT TRACKING
// ============================================================================

interface TestResult {
  persona: string;
  step: string;
  status: "pass" | "fail" | "warn";
  detail?: string;
  responseStatus?: number;
  responseBody?: any;
}

const allResults: TestResult[] = [];

function record(persona: string, step: string, status: "pass" | "fail" | "warn", detail?: string, extra?: { responseStatus?: number; responseBody?: any }) {
  allResults.push({ persona, step, status, detail, ...extra });
}

// ============================================================================
// TESTS
// ============================================================================

// Increase Jest timeout for all tests
jest.setTimeout(300_000); // 5 minutes for the entire suite

afterAll(async () => {
  // Cleanup all test users
  const rows = await q<{ id: string }>(
    `SELECT id FROM users WHERE tg_id >= $1 AND tg_id < $2`,
    [TG_ID_BASE, TG_ID_BASE + PERSONAS.length + 100]
  );
  for (const row of rows) {
    await cleanupTestUser(row.id);
  }
  await pool.end();

  // Print summary
  const fails = allResults.filter(r => r.status === "fail");
  const warns = allResults.filter(r => r.status === "warn");
  const passes = allResults.filter(r => r.status === "pass");

  console.log("\n\n" + "=".repeat(80));
  console.log("E2E TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total checks: ${allResults.length}`);
  console.log(`  PASS: ${passes.length}`);
  console.log(`  WARN: ${warns.length}`);
  console.log(`  FAIL: ${fails.length}`);

  if (warns.length > 0) {
    console.log("\n--- WARNINGS ---");
    for (const w of warns) {
      console.log(`  [${w.persona}] ${w.step}: ${w.detail}`);
    }
  }

  if (fails.length > 0) {
    console.log("\n--- FAILURES ---");
    for (const f of fails) {
      console.log(`  [${f.persona}] ${f.step}: ${f.detail}`);
      if (f.responseBody) {
        console.log(`    Response (${f.responseStatus}): ${JSON.stringify(f.responseBody).slice(0, 500)}`);
      }
    }
  }

  console.log("=".repeat(80) + "\n");
});

describe("E2E Full Flow", () => {
  test.each(PERSONAS.map((p, i) => ({ ...p, idx: i })))(
    "$name",
    async (persona) => {
      const tgId = TG_ID_BASE + persona.idx;
      let user: TestUser;
      let recommendedSchemeId: string | null = null;
      let plannedWorkoutId: string | null = null;
      let workoutData: any = null;

      // ────────────────────────────────────────────────────
      // STEP 1: Create test user
      // ────────────────────────────────────────────────────
      try {
        user = await createTestUser(tgId, persona.name);
        record(persona.name, "create_user", "pass");
      } catch (err: any) {
        record(persona.name, "create_user", "fail", err.message);
        return; // can't continue
      }

      const auth = { Authorization: `Bearer ${user.token}` };

      // ────────────────────────────────────────────────────
      // STEP 2: Save onboarding
      // ────────────────────────────────────────────────────
      const onboardingPayload = buildOnboardingPayload(persona);
      const onbRes = await request(app)
        .post("/onboarding/save")
        .set(auth)
        .send(onboardingPayload);

      if (onbRes.status === 200 && onbRes.body.ok) {
        record(persona.name, "onboarding_save", "pass");

        // Validate summary
        const s = onbRes.body.summary;
        if (!s?.schedule?.daysPerWeek) {
          record(persona.name, "onboarding_summary", "warn", "summary missing daysPerWeek");
        }
        if (!s?.experience) {
          record(persona.name, "onboarding_summary", "warn", "summary missing experience");
        }
      } else {
        record(persona.name, "onboarding_save", "fail", `HTTP ${onbRes.status}`, { responseStatus: onbRes.status, responseBody: onbRes.body });
        return;
      }

      // ────────────────────────────────────────────────────
      // STEP 3: Scheme recommendation
      // ────────────────────────────────────────────────────
      const schemeRes = await request(app)
        .post("/schemes/recommend")
        .set(auth)
        .send({});

      if (schemeRes.status === 200 && schemeRes.body.recommended) {
        const rec = schemeRes.body.recommended;
        recommendedSchemeId = rec.id;
        record(persona.name, "scheme_recommend", "pass", `recommended: ${rec.russianName} (${rec.id})`);

        // Validate scheme makes sense
        if (rec.daysPerWeek > persona.daysPerWeek + 1 || rec.daysPerWeek < persona.daysPerWeek - 1) {
          record(persona.name, "scheme_days_match", "warn",
            `user wants ${persona.daysPerWeek}d but got ${rec.daysPerWeek}d scheme`);
        }

        if (schemeRes.body.fallbackNote) {
          record(persona.name, "scheme_fallback", "warn", schemeRes.body.fallbackNote);
        }
      } else {
        record(persona.name, "scheme_recommend", "fail", `HTTP ${schemeRes.status}`, { responseStatus: schemeRes.status, responseBody: schemeRes.body });
        return;
      }

      // ────────────────────────────────────────────────────
      // STEP 4: Select scheme
      // ────────────────────────────────────────────────────
      const selectRes = await request(app)
        .post("/schemes/select")
        .set(auth)
        .send({ schemeId: recommendedSchemeId });

      if (selectRes.status === 200 && selectRes.body.ok) {
        record(persona.name, "scheme_select", "pass");
      } else {
        record(persona.name, "scheme_select", "fail", `HTTP ${selectRes.status}`, { responseStatus: selectRes.status, responseBody: selectRes.body });
        return;
      }

      // ────────────────────────────────────────────────────
      // STEP 5: Generate week plan
      // ────────────────────────────────────────────────────
      const genRes = await request(app)
        .post("/api/workout/generate")
        .set(auth)
        .send({});

      if (genRes.status === 200 && genRes.body.plan) {
        const plan = genRes.body.plan;
        record(persona.name, "generate_week", "pass",
          `${plan.weekPlan?.length || "?"}d, ${plan.exercises?.length || "?"} exercises today`);

        // Validate plan structure
        if (!plan.exercises || plan.exercises.length === 0) {
          record(persona.name, "generate_exercises", "fail", "no exercises generated");
        } else {
          record(persona.name, "generate_exercises", "pass", `${plan.exercises.length} exercises`);

          // Check for duplicate exercises
          const ids = plan.exercises.map((e: any) => e.exerciseId).filter(Boolean);
          const uniqueIds = new Set(ids);
          if (uniqueIds.size < ids.length) {
            const dupes = ids.filter((id: string, i: number) => ids.indexOf(id) !== i);
            record(persona.name, "generate_no_dupes", "fail", `duplicate exercises: ${dupes.join(", ")}`);
          } else {
            record(persona.name, "generate_no_dupes", "pass");
          }

          // Check exercise count is reasonable
          const exCount = plan.exercises.length;
          if (exCount < 3) {
            record(persona.name, "generate_ex_count", "warn", `only ${exCount} exercises (very low)`);
          } else if (exCount > 12) {
            record(persona.name, "generate_ex_count", "warn", `${exCount} exercises (very high)`);
          } else {
            record(persona.name, "generate_ex_count", "pass", `${exCount} exercises`);
          }

          // Check estimated duration
          const duration = plan.estimatedDuration;
          if (typeof duration === "number") {
            const maxExpected = persona.minutesPerSession * 1.3;
            const minExpected = Math.min(persona.minutesPerSession * 0.5, 15);
            if (duration > maxExpected) {
              record(persona.name, "generate_duration", "warn",
                `estimated ${duration}min exceeds ${persona.minutesPerSession}min budget by ${Math.round(((duration / persona.minutesPerSession) - 1) * 100)}%`);
            } else if (duration < minExpected) {
              record(persona.name, "generate_duration", "warn", `estimated ${duration}min seems too short`);
            } else {
              record(persona.name, "generate_duration", "pass", `${duration}min (budget: ${persona.minutesPerSession})`);
            }
          }

          // Check sets/reps are in valid ranges
          for (const ex of plan.exercises) {
            const sets = Number(ex.sets);
            if (sets < 1 || sets > 8 || !Number.isFinite(sets)) {
              record(persona.name, "generate_sets_range", "warn",
                `${ex.name || ex.exerciseId}: ${sets} sets (unusual)`);
            }
          }
        }

        // Validate week plan
        if (plan.weekPlan) {
          const weekDays = plan.weekPlan.length;
          if (weekDays !== persona.daysPerWeek) {
            // Might be OK if scheme has different day count (fallback)
            record(persona.name, "generate_week_days", "warn",
              `generated ${weekDays} days but user wants ${persona.daysPerWeek}`);
          } else {
            record(persona.name, "generate_week_days", "pass", `${weekDays} days`);
          }
        }
      } else {
        record(persona.name, "generate_week", "fail", `HTTP ${genRes.status}`, { responseStatus: genRes.status, responseBody: genRes.body });
        return;
      }

      // ────────────────────────────────────────────────────
      // STEP 6: Get planned workouts (to get IDs)
      // ────────────────────────────────────────────────────
      const plannedRes = await request(app)
        .get("/api/planned-workouts")
        .set(auth);

      if (plannedRes.status === 200 && Array.isArray(plannedRes.body.plannedWorkouts)) {
        const pws = plannedRes.body.plannedWorkouts;
        if (pws.length === 0) {
          record(persona.name, "planned_workouts", "fail", "no planned workouts found after generation");
          return;
        }
        plannedWorkoutId = pws[0].id;
        record(persona.name, "planned_workouts", "pass", `${pws.length} planned workouts, using first: ${plannedWorkoutId?.slice(0, 8)}`);
      } else {
        record(persona.name, "planned_workouts", "fail", `HTTP ${plannedRes.status}`, { responseStatus: plannedRes.status, responseBody: plannedRes.body });
        return;
      }

      // ────────────────────────────────────────────────────
      // STEP 7: Start workout with check-in
      // ────────────────────────────────────────────────────
      const checkin = persona.checkin ?? {
        sleepQuality: "good",
        energyLevel: "medium",
        stressLevel: "low",
      };

      const startRes = await request(app)
        .post("/api/workout/workout/start")
        .set(auth)
        .send({
          date: new Date().toISOString().split("T")[0],
          plannedWorkoutId,
          commit: true,
          checkin,
        });

      if (startRes.status === 200) {
        const body = startRes.body;
        const action = body.action;
        record(persona.name, "workout_start", "pass", `action: ${action}`);

        // For critical check-ins, expect skip or recovery
        if (persona.checkin?.pain?.some(p => p.level >= 8) &&
            persona.checkin?.sleepQuality === "poor" &&
            persona.checkin?.energyLevel === "low") {
          if (action !== "skip" && action !== "recovery") {
            record(persona.name, "start_critical_check", "warn",
              `critical state but got action="${action}" (expected skip or recovery)`);
          } else {
            record(persona.name, "start_critical_check", "pass", `correctly got ${action}`);
          }
        }

        // For pain check-ins, verify safety
        if (action === "keep_day" && body.workout?.exercises && persona.checkin?.pain) {
          const painLocations = persona.checkin.pain
            .filter(p => p.level >= 5)
            .map(p => p.location);

          if (painLocations.length > 0) {
            const kneeBlocked = painLocations.includes("knee");
            const shoulderBlocked = painLocations.includes("shoulder");
            const backBlocked = painLocations.includes("lower_back");

            for (const ex of body.workout.exercises) {
              const pattern = ex.pattern || "";
              if (kneeBlocked && (pattern === "squat" || pattern === "lunge")) {
                record(persona.name, "start_pain_safety", "fail",
                  `knee pain level 5+ but workout contains ${pattern} exercise: ${ex.exerciseName}`);
              }
              if (shoulderBlocked && (pattern === "vertical_push" || pattern === "overhead_press")) {
                record(persona.name, "start_pain_safety", "warn",
                  `shoulder pain level 5+ but workout contains ${pattern}: ${ex.exerciseName}`);
              }
              if (backBlocked && (pattern === "hinge" || pattern === "squat")) {
                record(persona.name, "start_pain_safety", "warn",
                  `lower back pain level 5+ but workout contains ${pattern}: ${ex.exerciseName}`);
              }
            }
          }
        }

        workoutData = body.workout;

        // Validate workout structure
        if (action !== "skip" && body.workout) {
          const w = body.workout;
          if (!w.exercises || !Array.isArray(w.exercises)) {
            record(persona.name, "start_workout_structure", "fail", "workout missing exercises array");
          } else if (w.exercises.length === 0 && action !== "recovery") {
            record(persona.name, "start_workout_structure", "fail", "workout has 0 exercises");
          } else {
            record(persona.name, "start_workout_structure", "pass",
              `${w.exercises.length} ex, ${w.totalSets} sets, ~${w.estimatedDuration}min`);
          }

          // Check for required fields on each exercise
          for (const ex of (w.exercises || [])) {
            if (!ex.exerciseId && !ex.id) {
              record(persona.name, "start_exercise_id", "fail", `exercise missing id: ${JSON.stringify(ex).slice(0, 100)}`);
            }
            if (!ex.exerciseName && !ex.name) {
              record(persona.name, "start_exercise_name", "fail", `exercise missing name: ${ex.exerciseId}`);
            }
          }
        }

        // Validate summary
        if (body.summary) {
          if (body.summary.severity && !["low", "medium", "high", "critical"].includes(body.summary.severity)) {
            record(persona.name, "start_summary_severity", "fail", `invalid severity: ${body.summary.severity}`);
          }
        }

      } else {
        record(persona.name, "workout_start", "fail", `HTTP ${startRes.status}`, { responseStatus: startRes.status, responseBody: startRes.body });
        // Don't return - try to save session anyway if we have workout data from generation
        workoutData = genRes.body.plan;
      }

      // ────────────────────────────────────────────────────
      // STEP 8: Save session (if we have a workout)
      // ────────────────────────────────────────────────────
      if (!workoutData || startRes.body?.action === "skip") {
        record(persona.name, "save_session", "pass", "skipped (no workout or skip action)");
        return;
      }

      const sessionPayload = buildSessionPayload(workoutData);

      if (sessionPayload.exercises.length === 0) {
        record(persona.name, "save_session", "warn", "no exercises to save (workout was empty?)");
        return;
      }

      const saveRes = await request(app)
        .post("/api/workout/save-session")
        .set(auth)
        .send({
          plannedWorkoutId,
          startedAt: new Date().toISOString(),
          durationMin: workoutData.estimatedDuration || 45,
          payload: sessionPayload,
        });

      if (saveRes.status === 200 && saveRes.body.ok) {
        record(persona.name, "save_session", "pass",
          `session #${saveRes.body.sessionNumber}, progression: ${saveRes.body.progressionJobStatus}`);

        // Check progression result
        if (saveRes.body.progression) {
          const prog = saveRes.body.progression;
          record(persona.name, "progression", "pass",
            `total=${prog.totalExercises}, progressed=${prog.progressedCount}, maintained=${prog.maintainedCount}, deload=${prog.deloadCount}`);
        } else if (saveRes.body.progressionJobStatus === "pending") {
          record(persona.name, "progression", "warn", "progression job still pending");
        }
      } else {
        record(persona.name, "save_session", "fail", `HTTP ${saveRes.status}`, { responseStatus: saveRes.status, responseBody: saveRes.body });
      }
    },
    60_000 // 60s timeout per persona
  );
});

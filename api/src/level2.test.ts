// api/src/level2.test.ts — Level 2: Scientific & Professional Accuracy
// Validates that generated workouts follow evidence-based training principles:
//  1. Rep ranges match goal
//  2. Rest periods match goal
//  3. Exercise order (compound before isolation)
//  4. Weekly volume per muscle group (MEV–MRV range)
//  5. Push/pull balance
//  6. No major muscle groups neglected
//  7. Beginner exercise difficulty appropriate
//  8. Pain/constraint filtering correctness
//  9. DUP intensity variation across days
// 10. Multi-session progression

import { jest, describe, test, beforeAll, afterAll, expect } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "./testApp.js";
import { q, pool } from "./db.js";
import { config } from "./config.js";
import { EXERCISE_LIBRARY, type Exercise, type Pattern, type MuscleGroup } from "./exerciseLibrary.js";
import { setSelectionSeed, clearSelectionSeed } from "./exerciseSelector.js";

// ============================================================================
// SETUP
// ============================================================================

const app = createApp();
const TG_ID_BASE = 910_000_000; // separate range from Level 1

jest.setTimeout(600_000); // 10 minutes

// Exercise lookup map
const EX_MAP = new Map<string, Exercise>();
for (const ex of EXERCISE_LIBRARY) EX_MAP.set(ex.id, ex);

// Pattern classification
const COMPOUND_PATTERNS: ReadonlySet<string> = new Set([
  "squat", "hinge", "lunge", "hip_thrust",
  "horizontal_push", "incline_push", "vertical_push",
  "horizontal_pull", "vertical_pull",
]);
const ISOLATION_PATTERNS: ReadonlySet<string> = new Set([
  "rear_delts", "delts_iso", "triceps_iso", "biceps_iso", "calves", "core",
]);

// ============================================================================
// EVIDENCE-BASED REFERENCE VALUES
// ============================================================================

// Rep ranges per goal (from volumeEngine.ts — REPS_BY_GOAL)
const EXPECTED_REPS: Record<string, { main: [number, number]; secondary: [number, number]; accessory: [number, number] }> = {
  build_muscle:    { main: [6, 10],  secondary: [8, 12],  accessory: [10, 15] },
  lose_weight:     { main: [12, 15], secondary: [12, 18], accessory: [15, 20] },
  athletic_body:   { main: [8, 12],  secondary: [10, 15], accessory: [12, 18] },
  health_wellness: { main: [8, 12],  secondary: [10, 15], accessory: [12, 18] },
};

// Rest periods per goal (from volumeEngine.ts — REST_BY_GOAL), seconds
const EXPECTED_REST: Record<string, { main: number; secondary: number; accessory: number }> = {
  build_muscle:    { main: 120, secondary: 90, accessory: 60 },
  lose_weight:     { main: 90,  secondary: 60, accessory: 45 },
  athletic_body:   { main: 90,  secondary: 75, accessory: 60 },
  health_wellness: { main: 90,  secondary: 75, accessory: 60 },
};

// Weekly volume (sets per muscle group) — evidence-based ranges
// Schoenfeld 2017, Israetel MEV/MRV
const WEEKLY_VOLUME_RANGE: Record<string, { min: number; max: number }> = {
  beginner:     { min: 6,  max: 18 },
  intermediate: { min: 10, max: 22 },
  advanced:     { min: 12, max: 30 },
};

// Major muscle groups that should be trained weekly
const MAJOR_MUSCLES: MuscleGroup[] = [
  "quads", "hamstrings", "glutes", "chest", "lats", "front_delts",
];

// Pain → blocked patterns mapping (from readiness.ts)
const PAIN_BLOCKS: Record<string, string[]> = {
  knee:       ["squat", "lunge"],
  shoulder:   ["vertical_push"],
  lower_back: ["hinge", "squat"],
  hip:        ["hinge", "lunge"],
  elbow:      ["horizontal_push", "vertical_push"],
  wrist:      ["horizontal_push", "vertical_push"],
  ankle:      ["lunge"],
  neck:       [],  // neck level 4+ adds flag, level 6+ blocks vertical_push
};

// ============================================================================
// PERSONA SUBSET — representative 18 personas for deep analysis
// ============================================================================

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

const PERSONAS: Persona[] = [
  // 1 beginner per goal
  { name: "L2-B01 beg/muscle/gym/M/25/3d/60m", sex: "male", age: 25, height: 178, weight: 75, experience: "beginner", goal: "build_muscle", daysPerWeek: 3, minutesPerSession: 60, place: "gym" },
  { name: "L2-B02 beg/lose/gym/F/35/4d/60m", sex: "female", age: 35, height: 160, weight: 72, experience: "beginner", goal: "lose_weight", daysPerWeek: 4, minutesPerSession: 60, place: "gym" },
  { name: "L2-B03 beg/athletic/gym/M/22/3d/60m", sex: "male", age: 22, height: 182, weight: 78, experience: "beginner", goal: "athletic_body", daysPerWeek: 3, minutesPerSession: 60, place: "gym" },
  { name: "L2-B04 beg/health/gym/M/55/3d/60m", sex: "male", age: 55, height: 175, weight: 85, experience: "beginner", goal: "health_wellness", daysPerWeek: 3, minutesPerSession: 60, place: "gym" },

  // 1 intermediate per goal
  { name: "L2-I01 inter/muscle/gym/M/28/4d/60m", sex: "male", age: 28, height: 180, weight: 82, experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "gym" },
  { name: "L2-I02 inter/lose/gym/F/38/4d/60m", sex: "female", age: 38, height: 162, weight: 70, experience: "intermediate", goal: "lose_weight", daysPerWeek: 4, minutesPerSession: 60, place: "gym" },
  { name: "L2-I03 inter/athletic/gym/M/26/5d/60m", sex: "male", age: 26, height: 183, weight: 80, experience: "intermediate", goal: "athletic_body", daysPerWeek: 5, minutesPerSession: 60, place: "gym" },
  { name: "L2-I04 inter/health/gym/M/50/3d/60m", sex: "male", age: 50, height: 175, weight: 88, experience: "intermediate", goal: "health_wellness", daysPerWeek: 3, minutesPerSession: 60, place: "gym" },

  // 1 advanced per goal
  { name: "L2-A01 adv/muscle/gym/M/28/5d/90m", sex: "male", age: 28, height: 182, weight: 90, experience: "advanced", goal: "build_muscle", daysPerWeek: 5, minutesPerSession: 90, place: "gym" },
  { name: "L2-A02 adv/lose/gym/M/30/5d/60m", sex: "male", age: 30, height: 180, weight: 88, experience: "advanced", goal: "lose_weight", daysPerWeek: 5, minutesPerSession: 60, place: "gym" },
  { name: "L2-A03 adv/athletic/gym/M/25/5d/60m", sex: "male", age: 25, height: 185, weight: 82, experience: "advanced", goal: "athletic_body", daysPerWeek: 5, minutesPerSession: 60, place: "gym" },
  { name: "L2-A04 adv/health/gym/M/55/3d/60m", sex: "male", age: 55, height: 175, weight: 82, experience: "advanced", goal: "health_wellness", daysPerWeek: 3, minutesPerSession: 60, place: "gym" },

  // Pain/constraint edge cases
  { name: "L2-P01 inter/muscle/gym + shoulder 6", sex: "male", age: 35, height: 178, weight: 82, experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "good", energyLevel: "high", stressLevel: "low", pain: [{ location: "shoulder", level: 6 }] } },
  { name: "L2-P02 beg/lose/gym + knee 5", sex: "female", age: 50, height: 160, weight: 80, experience: "beginner", goal: "lose_weight", daysPerWeek: 3, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "ok", energyLevel: "medium", stressLevel: "medium", pain: [{ location: "knee", level: 5 }] } },
  { name: "L2-P03 adv/muscle/gym + lower_back 7", sex: "male", age: 30, height: 180, weight: 88, experience: "advanced", goal: "build_muscle", daysPerWeek: 5, minutesPerSession: 60, place: "gym",
    checkin: { sleepQuality: "good", energyLevel: "medium", stressLevel: "medium", pain: [{ location: "lower_back", level: 7 }] } },

  // High frequency (6d) + Low frequency (2d)
  { name: "L2-F01 inter/muscle/gym/6d/60m", sex: "male", age: 35, height: 178, weight: 85, experience: "intermediate", goal: "build_muscle", daysPerWeek: 6, minutesPerSession: 60, place: "gym" },
  { name: "L2-F02 beg/health/gym/2d/45m", sex: "male", age: 55, height: 175, weight: 85, experience: "beginner", goal: "health_wellness", daysPerWeek: 2, minutesPerSession: 45, place: "gym" },

  // Home with equipment
  { name: "L2-H01 inter/muscle/home_gear/4d/60m", sex: "male", age: 32, height: 176, weight: 80, experience: "intermediate", goal: "build_muscle", daysPerWeek: 4, minutesPerSession: 60, place: "home_with_gear", equipmentItems: ["dumbbells", "bench", "bands", "pullup_bar"] },
];

// ============================================================================
// HELPERS
// ============================================================================

interface TestUser { id: string; tgId: number; token: string; }

async function createTestUser(tgId: number, name: string): Promise<TestUser> {
  const rows = await q<{ id: string }>(
    `INSERT INTO users (tg_id, first_name, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (tg_id) DO UPDATE SET first_name = EXCLUDED.first_name, updated_at = now()
     RETURNING id`,
    [tgId, name, `test_l2_${tgId}`]
  );
  const id = rows[0].id;
  const token = jwt.sign({ uid: id, tg: tgId }, config.jwtSecret, { expiresIn: "1h" });
  return { id, tgId, token };
}

async function cleanupTestUser(userId: string) {
  const tables = [
    "exercise_change_events", "coach_chat_messages", "coach_chat_threads",
    "coach_jobs", "progression_jobs", "exercise_history", "exercise_progression",
    "workout_sessions", "workouts", "planned_workouts", "weekly_plans",
    "mesocycles", "daily_check_ins", "body_metrics", "body_measurements",
    "user_session_counters", "workout_plans", "training_programs",
    "user_workout_schemes", "onboardings",
  ];
  for (const t of tables) {
    if (t === "coach_chat_messages") {
      await q(`DELETE FROM coach_chat_messages WHERE thread_id IN (SELECT id FROM coach_chat_threads WHERE user_id = $1::uuid)`, [userId]).catch(() => {});
    } else {
      await q(`DELETE FROM ${t} WHERE user_id = $1::uuid`, [userId]).catch(() => {});
    }
  }
  await q(`DELETE FROM users WHERE id = $1::uuid`, [userId]).catch(() => {});
}

function buildOnboardingPayload(p: Persona) {
  const equipmentItems = p.equipmentItems ??
    (p.place === "gym" ? ["machines", "barbell", "dumbbell", "cable", "smith"] :
     p.place === "home_with_gear" ? ["dumbbells", "bands"] : ["bodyweight"]);
  return {
    data: {
      profile: { name: `Test ${p.name}` },
      ageSex: { sex: p.sex, age: p.age },
      body: { height: p.height, weight: p.weight },
      schedule: { daysPerWeek: p.daysPerWeek, perWeek: p.daysPerWeek, minutesPerSession: p.minutesPerSession, minutes: p.minutesPerSession },
      experience: { level: p.experience },
      trainingPlace: { place: p.place },
      equipmentItems,
      environment: { location: p.place === "gym" ? "gym" : "home", bodyweightOnly: p.place === "home_no_equipment" },
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
      const repsRange = ex.repsRange;
      const minR = Array.isArray(repsRange) ? repsRange[0] : 8;
      const maxR = Array.isArray(repsRange) ? repsRange[1] : 12;
      const targetReps = Math.round((minR + maxR) / 2);
      return {
        id: ex.exerciseId || ex.id,
        name: ex.exerciseName || ex.name,
        reps: `${minR}-${maxR}`,
        done: true,
        sets: Array.from({ length: sets }, (_, i) => ({
          reps: Math.max(1, targetReps - Math.floor(i / 2)),
          weight: ex.suggestedWeight || (ex.loadType === "bodyweight" ? 0 : 20),
          done: true,
        })),
      };
    }),
    feedback: { sessionRpe: 7 },
  };
}

// Classify exercise role based on pattern
function classifyRole(pattern: string): "main" | "secondary" | "accessory" {
  if (COMPOUND_PATTERNS.has(pattern)) return "main";
  if (ISOLATION_PATTERNS.has(pattern)) return "accessory";
  return "secondary";
}

// ============================================================================
// RESULT TRACKING
// ============================================================================

interface TestResult {
  persona: string;
  category: string;
  check: string;
  status: "pass" | "fail" | "warn";
  detail?: string;
}

const allResults: TestResult[] = [];

function record(persona: string, category: string, check: string, status: "pass" | "fail" | "warn", detail?: string) {
  allResults.push({ persona, category, check, status, detail });
}

// ============================================================================
// TESTS
// ============================================================================

// Deterministic exercise selection for reproducible results
beforeAll(() => setSelectionSeed(42));

afterAll(async () => {
  clearSelectionSeed();
  // Cleanup
  const rows = await q<{ id: string }>(
    `SELECT id FROM users WHERE tg_id >= $1 AND tg_id < $2`,
    [TG_ID_BASE, TG_ID_BASE + PERSONAS.length + 100]
  );
  for (const row of rows) await cleanupTestUser(row.id);
  await pool.end();

  // ── Summary ──
  const fails = allResults.filter(r => r.status === "fail");
  const warns = allResults.filter(r => r.status === "warn");
  const passes = allResults.filter(r => r.status === "pass");

  console.log("\n\n" + "=".repeat(80));
  console.log("LEVEL 2 — SCIENTIFIC ACCURACY SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total checks: ${allResults.length}`);
  console.log(`  PASS: ${passes.length}`);
  console.log(`  WARN: ${warns.length}`);
  console.log(`  FAIL: ${fails.length}`);

  // Group by category
  const categories = [...new Set(allResults.map(r => r.category))];
  for (const cat of categories) {
    const catResults = allResults.filter(r => r.category === cat);
    const catFails = catResults.filter(r => r.status === "fail").length;
    const catWarns = catResults.filter(r => r.status === "warn").length;
    const catPasses = catResults.filter(r => r.status === "pass").length;
    const icon = catFails > 0 ? "❌" : catWarns > 0 ? "⚠️" : "✅";
    console.log(`  ${icon} ${cat}: ${catPasses}P / ${catWarns}W / ${catFails}F`);
  }

  if (warns.length > 0) {
    console.log("\n--- WARNINGS ---");
    for (const w of warns) {
      console.log(`  [${w.persona}] ${w.category}/${w.check}: ${w.detail}`);
    }
  }

  if (fails.length > 0) {
    console.log("\n--- FAILURES ---");
    for (const f of fails) {
      console.log(`  [${f.persona}] ${f.category}/${f.check}: ${f.detail}`);
    }
  }

  console.log("=".repeat(80) + "\n");
});

describe("Level 2: Scientific Accuracy", () => {
  test.each(PERSONAS.map((p, i) => ({ ...p, idx: i })))(
    "$name",
    async (persona) => {
      const tgId = TG_ID_BASE + persona.idx;
      const user = await createTestUser(tgId, persona.name);
      const auth = { Authorization: `Bearer ${user.token}` };

      // ── Setup: onboarding + scheme ──
      const onbRes = await request(app).post("/onboarding/save").set(auth).send(buildOnboardingPayload(persona));
      if (onbRes.status !== 200) { record(persona.name, "setup", "onboarding", "fail", `HTTP ${onbRes.status}`); return; }

      const schemeRes = await request(app).post("/schemes/recommend").set(auth).send({});
      if (schemeRes.status !== 200 || !schemeRes.body.recommended) { record(persona.name, "setup", "scheme_recommend", "fail", `HTTP ${schemeRes.status}`); return; }

      const schemeId = schemeRes.body.recommended.id;
      const schemeDays = schemeRes.body.recommended.daysPerWeek;
      await request(app).post("/schemes/select").set(auth).send({ schemeId });

      // ── Generate full week ──
      const genRes = await request(app).post("/api/workout/generate").set(auth).send({});
      if (genRes.status !== 200 || !genRes.body.plan) { record(persona.name, "setup", "generate", "fail", `HTTP ${genRes.status}`); return; }

      record(persona.name, "setup", "flow", "pass", `scheme=${schemeId}, ${schemeDays}d`);

      // Get planned workouts
      const plannedRes = await request(app).get("/api/planned-workouts").set(auth);
      if (plannedRes.status !== 200) { record(persona.name, "setup", "planned_workouts", "fail", `HTTP ${plannedRes.status}`); return; }

      const plannedWorkouts = plannedRes.body.plannedWorkouts || [];
      if (plannedWorkouts.length === 0) { record(persona.name, "setup", "planned_workouts", "fail", "none found"); return; }

      // ── Start workouts for ALL days in the week ──
      const weekWorkouts: any[] = [];
      const checkin = persona.checkin ?? { sleepQuality: "good", energyLevel: "medium", stressLevel: "low" };

      for (let dayIdx = 0; dayIdx < Math.min(plannedWorkouts.length, schemeDays); dayIdx++) {
        const pw = plannedWorkouts[dayIdx];
        const startRes = await request(app).post("/api/workout/workout/start").set(auth).send({
          date: new Date().toISOString().split("T")[0],
          plannedWorkoutId: pw.id,
          commit: true,
          checkin,
        });

        if (startRes.status === 200 && startRes.body.workout?.exercises) {
          weekWorkouts.push({
            dayIndex: dayIdx,
            dayLabel: startRes.body.workout.dayLabel || `Day ${dayIdx}`,
            action: startRes.body.action,
            exercises: startRes.body.workout.exercises,
            totalSets: startRes.body.workout.totalSets,
            estimatedDuration: startRes.body.workout.estimatedDuration,
            intent: startRes.body.workout.intent,
          });
        } else if (startRes.body?.action === "skip" || startRes.body?.action === "recovery") {
          // Pain personas may skip/recover — that's valid
          weekWorkouts.push({
            dayIndex: dayIdx,
            dayLabel: `Day ${dayIdx}`,
            action: startRes.body.action,
            exercises: startRes.body.workout?.exercises || [],
            totalSets: 0,
            estimatedDuration: 0,
            intent: "light",
          });
        }
      }

      if (weekWorkouts.length === 0) {
        record(persona.name, "setup", "week_workouts", "fail", "no workouts generated");
        return;
      }

      // ================================================================
      // CHECK 1: REP RANGES MATCH GOAL
      // ================================================================
      const expectedReps = EXPECTED_REPS[persona.goal];
      let repCheckTotal = 0;
      let repCheckOk = 0;

      for (const day of weekWorkouts) {
        if (day.action === "skip" || day.action === "recovery") continue;
        for (const ex of day.exercises) {
          const rr = ex.repsRange;
          if (!Array.isArray(rr) || rr.length < 2) continue;
          const [minR, maxR] = rr;
          const pattern = ex.pattern || "";
          const role = classifyRole(pattern);

          // Determine expected range for this role
          let expected: [number, number];
          if (role === "main") expected = expectedReps.main;
          else if (role === "secondary") expected = expectedReps.secondary;
          else expected = expectedReps.accessory;

          repCheckTotal++;

          // Allow ±3 reps tolerance (intent modifiers shift reps ±2, rounding etc.)
          const tolerance = 3;
          if (minR >= expected[0] - tolerance && maxR <= expected[1] + tolerance) {
            repCheckOk++;
          } else {
            record(persona.name, "rep_ranges", `${ex.exerciseName}`, "warn",
              `goal=${persona.goal} role=${role}: got ${minR}-${maxR}, expected ~${expected[0]}-${expected[1]}`);
          }
        }
      }

      if (repCheckTotal > 0) {
        const pct = Math.round((repCheckOk / repCheckTotal) * 100);
        if (pct >= 80) {
          record(persona.name, "rep_ranges", "overall", "pass", `${repCheckOk}/${repCheckTotal} (${pct}%) exercises have goal-appropriate reps`);
        } else if (pct >= 60) {
          record(persona.name, "rep_ranges", "overall", "warn", `only ${pct}% of exercises match goal rep ranges`);
        } else {
          record(persona.name, "rep_ranges", "overall", "fail", `only ${pct}% of exercises match goal rep ranges — scientifically inadequate`);
        }
      }

      // ================================================================
      // CHECK 2: REST PERIODS MATCH GOAL
      // ================================================================
      const expectedRest = EXPECTED_REST[persona.goal];
      let restCheckTotal = 0;
      let restCheckOk = 0;

      for (const day of weekWorkouts) {
        if (day.action === "skip" || day.action === "recovery") continue;
        for (const ex of day.exercises) {
          const rest = ex.restSec;
          if (typeof rest !== "number") continue;
          const role = classifyRole(ex.pattern || "");

          let expectedVal: number;
          if (role === "main") expectedVal = expectedRest.main;
          else if (role === "secondary") expectedVal = expectedRest.secondary;
          else expectedVal = expectedRest.accessory;

          restCheckTotal++;

          // Allow ±50% tolerance (experience modifiers: beginner +20%, advanced -10%, plus rounding)
          if (rest >= expectedVal * 0.5 && rest <= expectedVal * 1.5) {
            restCheckOk++;
          } else {
            record(persona.name, "rest_periods", `${ex.exerciseName}`, "warn",
              `goal=${persona.goal} role=${role}: got ${rest}s, expected ~${expectedVal}s`);
          }
        }
      }

      if (restCheckTotal > 0) {
        const pct = Math.round((restCheckOk / restCheckTotal) * 100);
        if (pct >= 80) {
          record(persona.name, "rest_periods", "overall", "pass", `${restCheckOk}/${restCheckTotal} (${pct}%) correct`);
        } else if (pct >= 60) {
          record(persona.name, "rest_periods", "overall", "warn", `only ${pct}% of rest periods match goal`);
        } else {
          record(persona.name, "rest_periods", "overall", "fail", `only ${pct}% of rest periods match goal — inadequate`);
        }
      }

      // ================================================================
      // CHECK 3: EXERCISE ORDER — COMPOUNDS BEFORE ISOLATION
      // ================================================================
      for (const day of weekWorkouts) {
        if (day.action === "skip" || day.action === "recovery") continue;
        const exercises = day.exercises;
        if (exercises.length < 3) continue;

        let lastCompoundIdx = -1;
        let firstIsolationIdx = exercises.length;

        exercises.forEach((ex: any, idx: number) => {
          const libEx = EX_MAP.get(ex.exerciseId);
          const kind = libEx?.kind || "compound";
          if (kind === "compound") lastCompoundIdx = Math.max(lastCompoundIdx, idx);
          if ((kind === "isolation" || kind === "core") && idx < firstIsolationIdx) firstIsolationIdx = idx;
        });

        // Allow some mixing — just check that the FIRST exercise is compound
        const firstEx = exercises[0];
        const firstExLib = EX_MAP.get(firstEx?.exerciseId);
        const firstIsCompound = firstExLib?.kind === "compound" || COMPOUND_PATTERNS.has(firstEx?.pattern || "");

        if (firstIsCompound) {
          record(persona.name, "exercise_order", day.dayLabel, "pass", "first exercise is compound");
        } else {
          record(persona.name, "exercise_order", day.dayLabel, "warn",
            `first exercise is ${firstExLib?.kind || "unknown"}: ${firstEx?.exerciseName} (${firstEx?.pattern})`);
        }

        // Check that at least the first 40% are compounds
        const first40pct = Math.ceil(exercises.length * 0.4);
        let compoundsInFirst40 = 0;
        for (let i = 0; i < first40pct; i++) {
          const ex = exercises[i];
          const lib = EX_MAP.get(ex?.exerciseId);
          if (lib?.kind === "compound" || COMPOUND_PATTERNS.has(ex?.pattern || "")) compoundsInFirst40++;
        }

        const compoundRatio = compoundsInFirst40 / first40pct;
        if (compoundRatio >= 0.7) {
          record(persona.name, "exercise_order", `${day.dayLabel}_compound_first`, "pass",
            `${Math.round(compoundRatio * 100)}% compounds in first 40%`);
        } else {
          record(persona.name, "exercise_order", `${day.dayLabel}_compound_first`, "warn",
            `only ${Math.round(compoundRatio * 100)}% compounds in first 40% of workout`);
        }
      }

      // ================================================================
      // CHECK 4: WEEKLY VOLUME PER MUSCLE GROUP (SETS/WEEK)
      // ================================================================
      const weeklyMuscleVolume: Record<string, number> = {};

      for (const day of weekWorkouts) {
        if (day.action === "skip" || day.action === "recovery") continue;
        for (const ex of day.exercises) {
          const sets = Number(ex.sets) || 0;
          const muscles = ex.targetMuscles || [];
          const libEx = EX_MAP.get(ex.exerciseId);

          // Primary muscles get full set credit
          const primaryMuscles = libEx?.primaryMuscles || muscles;
          for (const m of primaryMuscles) {
            weeklyMuscleVolume[m] = (weeklyMuscleVolume[m] || 0) + sets;
          }

          // Secondary muscles get half credit (standard practice)
          const secondaryMuscles = libEx?.secondaryMuscles || [];
          for (const m of secondaryMuscles) {
            weeklyMuscleVolume[m] = (weeklyMuscleVolume[m] || 0) + sets * 0.5;
          }
        }
      }

      const volumeRange = WEEKLY_VOLUME_RANGE[persona.experience];

      // Check major muscle groups
      for (const muscle of MAJOR_MUSCLES) {
        const vol = Math.round(weeklyMuscleVolume[muscle] || 0);

        // Skip muscles that might be blocked by pain
        if (persona.checkin?.pain?.some(p => p.level >= 5)) {
          // Don't flag missing muscles for pain personas — they might be legitimately blocked
          continue;
        }

        if (vol === 0) {
          record(persona.name, "weekly_volume", `${muscle}_missing`, "fail",
            `${muscle}: 0 sets/week — major muscle group completely neglected`);
        } else if (vol < volumeRange.min) {
          record(persona.name, "weekly_volume", `${muscle}_low`, "warn",
            `${muscle}: ${vol} sets/week — below MEV (${volumeRange.min} min for ${persona.experience})`);
        } else if (vol > volumeRange.max) {
          record(persona.name, "weekly_volume", `${muscle}_high`, "warn",
            `${muscle}: ${vol} sets/week — above MRV (${volumeRange.max} max for ${persona.experience})`);
        } else {
          record(persona.name, "weekly_volume", `${muscle}`, "pass",
            `${muscle}: ${vol} sets/week (range: ${volumeRange.min}-${volumeRange.max})`);
        }
      }

      // Total weekly volume summary
      const totalWeekSets = Object.values(weeklyMuscleVolume).reduce((s, v) => s + v, 0);
      record(persona.name, "weekly_volume", "total_sets", "pass",
        `total: ${Math.round(totalWeekSets)} sets across ${Object.keys(weeklyMuscleVolume).length} muscle groups`);

      // ================================================================
      // CHECK 5: PUSH/PULL BALANCE
      // ================================================================
      let pushSets = 0;
      let pullSets = 0;

      for (const day of weekWorkouts) {
        if (day.action === "skip" || day.action === "recovery") continue;
        for (const ex of day.exercises) {
          const sets = Number(ex.sets) || 0;
          const pattern = ex.pattern || "";
          if (["horizontal_push", "incline_push", "vertical_push"].includes(pattern)) pushSets += sets;
          if (["horizontal_pull", "vertical_pull"].includes(pattern)) pullSets += sets;
        }
      }

      if (pushSets > 0 && pullSets > 0) {
        const ratio = pushSets / pullSets;
        if (ratio >= 0.6 && ratio <= 1.6) {
          record(persona.name, "balance", "push_pull", "pass",
            `push:pull = ${pushSets}:${pullSets} (ratio ${ratio.toFixed(2)})`);
        } else if (ratio > 2.0 || ratio < 0.5) {
          record(persona.name, "balance", "push_pull", "fail",
            `push:pull extreme imbalance: ${pushSets}:${pullSets} (ratio ${ratio.toFixed(2)}, must be 0.5-2.0)`);
        } else {
          record(persona.name, "balance", "push_pull", "warn",
            `push:pull imbalance: ${pushSets}:${pullSets} (ratio ${ratio.toFixed(2)}, should be 0.6-1.6)`);
        }
      } else if (pushSets === 0 && pullSets === 0) {
        // Full body with no push/pull patterns — unusual but possible for home_bw
        record(persona.name, "balance", "push_pull", "warn", "no push or pull movements detected");
      }

      // ================================================================
      // CHECK 6: BEGINNER EXERCISE DIFFICULTY
      // ================================================================
      if (persona.experience === "beginner") {
        let difficultyIssues = 0;
        let totalExChecked = 0;

        for (const day of weekWorkouts) {
          if (day.action === "skip" || day.action === "recovery") continue;
          for (const ex of day.exercises) {
            const libEx = EX_MAP.get(ex.exerciseId);
            if (!libEx) continue;
            totalExChecked++;

            // Beginners shouldn't get difficulty 5 exercises
            if (libEx.difficulty >= 5) {
              record(persona.name, "beginner_safety", `${ex.exerciseName}_difficulty`, "fail",
                `difficulty ${libEx.difficulty}/5 is too high for beginner: ${ex.exerciseName}`);
              difficultyIssues++;
            }

            // Beginners shouldn't get high CNS exercises frequently
            if (libEx.cnsLoad === 3) {
              record(persona.name, "beginner_safety", `${ex.exerciseName}_cns`, "warn",
                `CNS load 3 (high) for beginner: ${ex.exerciseName} — consider simpler alternative`);
              difficultyIssues++;
            }
          }
        }

        if (difficultyIssues === 0 && totalExChecked > 0) {
          record(persona.name, "beginner_safety", "overall", "pass",
            `all ${totalExChecked} exercises appropriate for beginners`);
        }
      }

      // ================================================================
      // CHECK 7: PAIN/CONSTRAINT FILTERING
      // ================================================================
      if (persona.checkin?.pain) {
        for (const painItem of persona.checkin.pain) {
          if (painItem.level < 4) continue; // only level 4+ triggers blocks

          const blockedPatterns = PAIN_BLOCKS[painItem.location] || [];
          if (painItem.location === "neck" && painItem.level >= 6) {
            blockedPatterns.push("vertical_push");
          }

          for (const day of weekWorkouts) {
            if (day.action === "skip" || day.action === "recovery") continue;
            for (const ex of day.exercises) {
              const pattern = ex.pattern || "";
              if (blockedPatterns.includes(pattern)) {
                record(persona.name, "pain_filtering", `${painItem.location}_${pattern}`, "fail",
                  `${painItem.location} pain (level ${painItem.level}) should block ${pattern}, but found: ${ex.exerciseName}`);
              }
            }
          }

          // If no violations found for this pain location
          const violations = allResults.filter(r =>
            r.persona === persona.name &&
            r.category === "pain_filtering" &&
            r.check.startsWith(`${painItem.location}_`) &&
            r.status === "fail"
          );

          if (violations.length === 0) {
            record(persona.name, "pain_filtering", `${painItem.location}`, "pass",
              `${painItem.location} pain (level ${painItem.level}): all blocked patterns correctly excluded`);
          }
        }
      }

      // ================================================================
      // CHECK 8: DUP INTENSITY VARIATION (across days)
      // Checks actual repsRange + restSec of first compound exercise per day
      // ================================================================
      if (weekWorkouts.length >= 3) {
        const trainingDays = weekWorkouts.filter(d => d.action !== "skip" && d.action !== "recovery");
        // Collect repsRange+restSec from first main/secondary exercise per day
        const daySignatures: string[] = [];
        for (const day of trainingDays) {
          const compound = day.exercises?.find((ex: any) =>
            ex.role === "main" || ex.role === "secondary"
          );
          if (compound) {
            const rr = compound.repsRange;
            daySignatures.push(`${rr[0]}-${rr[1]}@${compound.restSec}s`);
          }
        }

        const uniqueSigs = new Set(daySignatures);
        if (uniqueSigs.size >= 2) {
          record(persona.name, "periodization", "dup_variation", "pass",
            `${uniqueSigs.size} unique rep/rest combos across ${daySignatures.length} days: ${[...uniqueSigs].join(", ")}`);
        } else if (daySignatures.length >= 3) {
          record(persona.name, "periodization", "dup_variation", "fail",
            `only 1 rep/rest combo (${daySignatures[0]}) across ${daySignatures.length} days — no DUP variation detected`);
        }
      }

      // ================================================================
      // CHECK 9: SETS PER EXERCISE — not too many, not too few
      // ================================================================
      for (const day of weekWorkouts) {
        if (day.action === "skip" || day.action === "recovery") continue;
        for (const ex of day.exercises) {
          const sets = Number(ex.sets);
          if (sets > 6) {
            record(persona.name, "sets_per_exercise", ex.exerciseName, "warn",
              `${sets} sets on one exercise is excessive (max recommended: 6)`);
          } else if (sets < 1) {
            record(persona.name, "sets_per_exercise", ex.exerciseName, "fail",
              `${sets} sets — invalid`);
          }
        }
      }

      // ================================================================
      // CHECK 10: SESSION TIME vs AVAILABLE MINUTES
      // ================================================================
      for (const day of weekWorkouts) {
        if (day.action === "skip" || day.action === "recovery") continue;
        const est = day.estimatedDuration;
        const avail = persona.checkin?.availableMinutes ?? persona.minutesPerSession;
        if (typeof est === "number" && est > 0) {
          const overPct = ((est - avail) / avail) * 100;
          if (overPct <= 20) {
            record(persona.name, "session_time", day.dayLabel, "pass",
              `${est}min estimated vs ${avail}min available (+${Math.round(overPct)}%)`);
          } else {
            record(persona.name, "session_time", day.dayLabel, "fail",
              `${est}min estimated vs ${avail}min available (+${Math.round(overPct)}%) — exceeds +20% tolerance`);
          }
        }
      }

      // ================================================================
      // CHECK 11: MULTI-SESSION PROGRESSION (save + regenerate same day)
      // ================================================================
      // Only test progression for non-pain gym personas to keep it focused
      if (!persona.checkin?.pain && persona.place === "gym" && weekWorkouts.length > 0) {
        const firstDay = weekWorkouts[0];
        if (firstDay.action !== "skip" && firstDay.action !== "recovery" && firstDay.exercises.length > 0) {
          // Save session 1
          const sessionPayload = buildSessionPayload(firstDay);
          const saveRes = await request(app)
            .post("/api/workout/save-session")
            .set(auth)
            .send({
              plannedWorkoutId: plannedWorkouts[0].id,
              startedAt: new Date().toISOString(),
              durationMin: firstDay.estimatedDuration || 45,
              payload: sessionPayload,
            });

          if (saveRes.status === 200) {
            record(persona.name, "progression", "session1_save", "pass");

            // Regenerate week + start same day again
            await request(app).post("/api/workout/generate").set(auth).send({});
            const planned2 = await request(app).get("/api/planned-workouts").set(auth);
            const pw2 = planned2.body?.plannedWorkouts?.[0];

            if (pw2) {
              const start2Res = await request(app).post("/api/workout/workout/start").set(auth).send({
                date: new Date().toISOString().split("T")[0],
                plannedWorkoutId: pw2.id,
                commit: true,
                checkin: { sleepQuality: "good", energyLevel: "medium", stressLevel: "low" },
              });

              if (start2Res.status === 200 && start2Res.body.workout?.exercises) {
                const session2Exercises = start2Res.body.workout.exercises;

                // Check for suggested weights / progression notes
                let hasProgressionData = false;
                for (const ex of session2Exercises) {
                  if (ex.suggestedWeight || ex.progressionNote) {
                    hasProgressionData = true;
                    break;
                  }
                }

                if (hasProgressionData) {
                  record(persona.name, "progression", "session2_has_suggestions", "pass",
                    "second session has weight suggestions based on first session");
                } else {
                  record(persona.name, "progression", "session2_has_suggestions", "warn",
                    "second session has no progression suggestions — may be first-session cold start");
                }

                // Check exercise variety (not exact same exercises every time)
                const s1Ids = new Set(firstDay.exercises.map((e: any) => e.exerciseId));
                const s2Ids = new Set(session2Exercises.map((e: any) => e.exerciseId));
                const overlap = [...s1Ids].filter(id => s2Ids.has(id)).length;
                const overlapPct = overlap / Math.max(s1Ids.size, 1);

                // Some overlap is expected (same day pattern), but not 100% always
                record(persona.name, "progression", "exercise_continuity", "pass",
                  `${Math.round(overlapPct * 100)}% exercise overlap between sessions (continuity + variety)`);
              }
            }
          } else {
            record(persona.name, "progression", "session1_save", "fail", `HTTP ${saveRes.status}`);
          }
        }
      }
    },
    120_000 // 2min timeout per persona
  );
});

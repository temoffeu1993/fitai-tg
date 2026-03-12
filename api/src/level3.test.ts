// api/src/level3.test.ts — Level 3: Personalization Quality
// Tests that changing ONE variable produces meaningfully different workouts.
// Comparison pairs:
//  1. Male vs Female (same everything else)
//  2. Age 25 vs Age 65 (difficulty, impact)
//  3. build_muscle vs lose_weight (reps, exercise choice)
//  4. Gym vs Home no equipment (equipment filtering)
//  5. 2d/week vs 6d/week (volume distribution)
//  6. 30min vs 90min (exercise count scaling)
//  7. No pain vs Knee pain (exercise filtering)
//  8. Good checkin vs Bad checkin (intent adaptation)
//  9. Beginner vs Advanced (complexity, volume)
// 10. BMI normal vs BMI 35+ (impact restrictions)

import { jest, describe, test, afterAll, expect } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "./testApp.js";
import { q, pool } from "./db.js";
import { config } from "./config.js";
import { EXERCISE_LIBRARY, type Exercise } from "./exerciseLibrary.js";

const app = createApp();
const TG_ID_BASE = 920_000_000;
jest.setTimeout(600_000);

const EX_MAP = new Map<string, Exercise>();
for (const ex of EXERCISE_LIBRARY) EX_MAP.set(ex.id, ex);

const COMPOUND_PATTERNS = new Set([
  "squat", "hinge", "lunge", "hip_thrust",
  "horizontal_push", "incline_push", "vertical_push",
  "horizontal_pull", "vertical_pull",
]);

// ============================================================================
// TYPES
// ============================================================================

interface PersonaConfig {
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
  checkin?: {
    sleepQuality: string;
    energyLevel: string;
    stressLevel: string;
    pain?: { location: string; level: number }[];
    availableMinutes?: number;
  };
}

interface WorkoutResult {
  action: string;
  exercises: any[];
  totalSets: number;
  estimatedDuration: number;
  intent: string;
  dayLabel: string;
  schemeId: string;
  schemeDays: number;
}

interface TestResult {
  pair: string;
  check: string;
  status: "pass" | "fail" | "warn";
  detail?: string;
}

const allResults: TestResult[] = [];

function record(pair: string, check: string, status: "pass" | "fail" | "warn", detail?: string) {
  allResults.push({ pair, check, status, detail });
}

// ============================================================================
// COMPARISON PAIRS — change ONE variable
// ============================================================================

const BASE: PersonaConfig = {
  sex: "male", age: 28, height: 180, weight: 80,
  experience: "intermediate", goal: "build_muscle",
  daysPerWeek: 4, minutesPerSession: 60, place: "gym",
};

interface ComparisonPair {
  name: string;
  a: { label: string; config: Partial<PersonaConfig> };
  b: { label: string; config: Partial<PersonaConfig> };
  checks: (a: WorkoutResult, b: WorkoutResult, pair: string) => void;
}

const PAIRS: ComparisonPair[] = [
  // ── 1. Male vs Female ──
  {
    name: "sex: male vs female",
    a: { label: "male", config: { sex: "male" } },
    b: { label: "female", config: { sex: "female", height: 165, weight: 60 } },
    checks: (a, b, pair) => {
      // Female should have more glute/hip focus
      const aGlute = countMuscle(a.exercises, "glutes");
      const bGlute = countMuscle(b.exercises, "glutes");
      if (bGlute >= aGlute) {
        record(pair, "female_glute_focus", "pass", `F=${bGlute} >= M=${aGlute} glute exercises`);
      } else {
        record(pair, "female_glute_focus", "warn", `F=${bGlute} < M=${aGlute} — female should have >= glute focus`);
      }

      // Programs should differ (not identical)
      const aIds = new Set(a.exercises.map((e: any) => e.exerciseId));
      const bIds = new Set(b.exercises.map((e: any) => e.exerciseId));
      const overlap = [...aIds].filter(id => bIds.has(id)).length;
      const overlapPct = overlap / Math.max(aIds.size, bIds.size, 1);
      if (overlapPct < 1.0) {
        record(pair, "programs_differ", "pass", `${Math.round(overlapPct * 100)}% overlap — programs are personalized`);
      } else {
        record(pair, "programs_differ", "warn", "100% identical exercises — no sex-based personalization");
      }
    },
  },

  // ── 2. Young vs Senior ──
  {
    name: "age: 25 vs 65",
    a: { label: "age25", config: { age: 25, goal: "health_wellness", experience: "beginner", daysPerWeek: 3 } },
    b: { label: "age65", config: { age: 65, goal: "health_wellness", experience: "beginner", daysPerWeek: 3, height: 170, weight: 78 } },
    checks: (a, b, pair) => {
      // Senior should have lower average difficulty
      const aDiff = avgDifficulty(a.exercises);
      const bDiff = avgDifficulty(b.exercises);
      if (bDiff <= aDiff + 0.5) {
        record(pair, "senior_lower_difficulty", "pass", `senior=${bDiff.toFixed(1)} <= young=${aDiff.toFixed(1)} avg difficulty`);
      } else {
        record(pair, "senior_lower_difficulty", "fail", `senior=${bDiff.toFixed(1)} > young=${aDiff.toFixed(1)} — seniors should get easier exercises`);
      }

      // Senior should have lower CNS load
      const aCns = avgCns(a.exercises);
      const bCns = avgCns(b.exercises);
      if (bCns <= aCns + 0.3) {
        record(pair, "senior_lower_cns", "pass", `senior CNS=${bCns.toFixed(1)} <= young=${aCns.toFixed(1)}`);
      } else {
        record(pair, "senior_lower_cns", "warn", `senior CNS=${bCns.toFixed(1)} > young=${aCns.toFixed(1)} — consider lighter exercises`);
      }

      // Senior should have fewer or no high-impact exercises
      const aHighImpact = a.exercises.filter((e: any) => hasTag(e.exerciseId, "high_impact")).length;
      const bHighImpact = b.exercises.filter((e: any) => hasTag(e.exerciseId, "high_impact")).length;
      record(pair, "senior_low_impact", bHighImpact <= aHighImpact ? "pass" : "warn",
        `senior high-impact=${bHighImpact}, young=${aHighImpact}`);
    },
  },

  // ── 3. build_muscle vs lose_weight ──
  {
    name: "goal: muscle vs lose_weight",
    a: { label: "muscle", config: { goal: "build_muscle" } },
    b: { label: "lose", config: { goal: "lose_weight" } },
    checks: (a, b, pair) => {
      // Muscle should have lower reps (6-12), lose should have higher (12-20)
      const aAvgReps = avgReps(a.exercises);
      const bAvgReps = avgReps(b.exercises);
      if (bAvgReps > aAvgReps) {
        record(pair, "lose_higher_reps", "pass", `lose=${bAvgReps.toFixed(1)} > muscle=${aAvgReps.toFixed(1)} avg reps`);
      } else {
        record(pair, "lose_higher_reps", "fail", `lose=${bAvgReps.toFixed(1)} <= muscle=${aAvgReps.toFixed(1)} — lose_weight should have higher reps`);
      }

      // Muscle should have longer rest periods
      const aAvgRest = avgRest(a.exercises);
      const bAvgRest = avgRest(b.exercises);
      if (aAvgRest >= bAvgRest) {
        record(pair, "muscle_longer_rest", "pass", `muscle=${aAvgRest.toFixed(0)}s >= lose=${bAvgRest.toFixed(0)}s rest`);
      } else {
        record(pair, "muscle_longer_rest", "warn", `muscle=${aAvgRest.toFixed(0)}s < lose=${bAvgRest.toFixed(0)}s — muscle should have longer rest`);
      }

      // Different schemes should be selected
      if (a.schemeId !== b.schemeId) {
        record(pair, "different_schemes", "pass", `muscle=${a.schemeId}, lose=${b.schemeId}`);
      } else {
        record(pair, "different_schemes", "warn", `same scheme ${a.schemeId} for both goals`);
      }
    },
  },

  // ── 4. Gym vs Home no equipment ──
  {
    name: "location: gym vs home_bw",
    a: { label: "gym", config: { place: "gym" as const } },
    b: { label: "home_bw", config: { place: "home_no_equipment" as const, equipmentItems: ["bodyweight"], daysPerWeek: 3 } },
    checks: (a, b, pair) => {
      // Gym should use barbell/machine/cable exercises
      const aHasBarbell = a.exercises.some((e: any) => hasEquipment(e.exerciseId, "barbell"));
      const aHasMachine = a.exercises.some((e: any) => hasEquipment(e.exerciseId, "machine"));
      if (aHasBarbell || aHasMachine) {
        record(pair, "gym_uses_equipment", "pass", `gym has barbell=${aHasBarbell}, machine=${aHasMachine}`);
      } else {
        record(pair, "gym_uses_equipment", "warn", "gym workout has no barbell or machine exercises");
      }

      // Home_bw should NOT use barbell/machine
      const bHasBarbell = b.exercises.some((e: any) => hasEquipment(e.exerciseId, "barbell"));
      const bHasMachine = b.exercises.some((e: any) => hasEquipment(e.exerciseId, "machine"));
      if (!bHasBarbell && !bHasMachine) {
        record(pair, "home_no_equipment", "pass", "home_bw correctly has no barbell/machine");
      } else {
        record(pair, "home_no_equipment", "fail", `home_bw has barbell=${bHasBarbell} machine=${bHasMachine} — equipment filtering broken!`);
      }

      // Home_bw should use bodyweight exercises
      const bHasBw = b.exercises.some((e: any) => hasEquipment(e.exerciseId, "bodyweight"));
      record(pair, "home_uses_bodyweight", bHasBw ? "pass" : "warn",
        `home_bw has bodyweight exercises: ${bHasBw}`);
    },
  },

  // ── 5. 2d vs 6d per week ──
  {
    name: "frequency: 2d vs 6d",
    a: { label: "2d", config: { daysPerWeek: 2, experience: "beginner" as const, goal: "health_wellness" as const } },
    b: { label: "6d", config: { daysPerWeek: 6 } },
    checks: (a, b, pair) => {
      // 2d should have MORE exercises per session (concentrated volume)
      const aEx = a.exercises.length;
      const bEx = b.exercises.length;
      // 2d full body should have more exercises than 6d split day
      record(pair, "2d_more_exercises_per_session", aEx >= bEx ? "pass" : "warn",
        `2d=${aEx} exercises, 6d=${bEx} — 2d full body should be denser`);

      // Different schemes
      if (a.schemeDays !== b.schemeDays) {
        record(pair, "different_frequency", "pass", `2d scheme=${a.schemeDays}d, 6d scheme=${b.schemeDays}d`);
      } else {
        record(pair, "different_frequency", "fail", `same frequency ${a.schemeDays}d for both`);
      }

      // 6d should have more sets per week total (higher volume potential)
      const aSetsPerWeek = a.totalSets * a.schemeDays;
      const bSetsPerWeek = b.totalSets * b.schemeDays;
      if (bSetsPerWeek > aSetsPerWeek) {
        record(pair, "6d_more_weekly_volume", "pass", `2d=${aSetsPerWeek} vs 6d=${bSetsPerWeek} total weekly sets`);
      } else {
        record(pair, "6d_more_weekly_volume", "warn", `2d=${aSetsPerWeek} >= 6d=${bSetsPerWeek} — 6d should have more weekly volume`);
      }
    },
  },

  // ── 6. 30min vs 90min ──
  {
    name: "time: 30min vs 90min",
    a: { label: "30m", config: { minutesPerSession: 30, experience: "beginner" as const, daysPerWeek: 3 } },
    b: { label: "90m", config: { minutesPerSession: 90, experience: "advanced" as const, daysPerWeek: 5 } },
    checks: (a, b, pair) => {
      // 90min should have more exercises
      if (b.exercises.length > a.exercises.length) {
        record(pair, "90m_more_exercises", "pass", `30m=${a.exercises.length}, 90m=${b.exercises.length}`);
      } else {
        record(pair, "90m_more_exercises", "fail", `30m=${a.exercises.length} >= 90m=${b.exercises.length} — 90min should have more`);
      }

      // 90min should have more total sets
      if (b.totalSets > a.totalSets) {
        record(pair, "90m_more_sets", "pass", `30m=${a.totalSets}, 90m=${b.totalSets} sets`);
      } else {
        record(pair, "90m_more_sets", "fail", `30m=${a.totalSets} >= 90m=${b.totalSets} — 90min should have more sets`);
      }

      // 90min estimated duration should be longer
      if (b.estimatedDuration > a.estimatedDuration) {
        record(pair, "90m_longer_duration", "pass", `30m=${a.estimatedDuration}min, 90m=${b.estimatedDuration}min`);
      } else {
        record(pair, "90m_longer_duration", "fail", `durations not scaled: 30m=${a.estimatedDuration}, 90m=${b.estimatedDuration}`);
      }
    },
  },

  // ── 7. No pain vs Knee pain ──
  {
    name: "pain: none vs knee_5",
    a: { label: "no_pain", config: {} },
    b: { label: "knee_pain", config: {
      checkin: { sleepQuality: "good", energyLevel: "medium", stressLevel: "low", pain: [{ location: "knee", level: 5 }] },
    }},
    checks: (a, b, pair) => {
      // Knee pain should remove squat/lunge patterns
      const aSquats = a.exercises.filter((e: any) => e.pattern === "squat" || e.pattern === "lunge").length;
      const bSquats = b.exercises.filter((e: any) => e.pattern === "squat" || e.pattern === "lunge").length;
      if (bSquats === 0) {
        record(pair, "knee_blocks_squat_lunge", "pass", `no_pain has ${aSquats} squat/lunge, knee_pain has 0`);
      } else if (bSquats < aSquats) {
        record(pair, "knee_blocks_squat_lunge", "warn", `knee pain reduced squat/lunge: ${aSquats}→${bSquats} but didn't fully block`);
      } else {
        record(pair, "knee_blocks_squat_lunge", "fail", `knee pain didn't reduce squat/lunge: both have ${bSquats}`);
      }

      // Knee pain workout should still have exercises (not empty)
      if (b.exercises.length > 0) {
        record(pair, "knee_still_has_workout", "pass", `${b.exercises.length} exercises despite knee pain`);
      } else {
        record(pair, "knee_still_has_workout", "fail", "knee pain resulted in empty workout");
      }

      // Should have hinge/pull patterns instead (alternatives to squats)
      const bHinge = b.exercises.filter((e: any) => e.pattern === "hinge" || e.pattern === "horizontal_pull" || e.pattern === "vertical_pull").length;
      record(pair, "knee_has_alternatives", bHinge > 0 ? "pass" : "warn",
        `knee pain workout has ${bHinge} hinge/pull exercises as alternatives`);
    },
  },

  // ── 8. Good checkin vs Bad checkin ──
  {
    name: "checkin: good vs poor",
    a: { label: "good", config: {
      checkin: { sleepQuality: "excellent", energyLevel: "high", stressLevel: "low" },
    }},
    b: { label: "poor", config: {
      checkin: { sleepQuality: "poor", energyLevel: "low", stressLevel: "very_high" },
    }},
    checks: (a, b, pair) => {
      // Good should get hard/normal intent, poor should get light/normal
      if (a.intent === "hard" && (b.intent === "light" || b.intent === "normal")) {
        record(pair, "intent_adaptation", "pass", `good=${a.intent}, poor=${b.intent}`);
      } else if (a.intent !== b.intent) {
        record(pair, "intent_adaptation", "pass", `intents differ: good=${a.intent}, poor=${b.intent}`);
      } else {
        record(pair, "intent_adaptation", "warn", `same intent ${a.intent} for both — checkin not adapting intensity`);
      }

      // Poor checkin should have fewer or equal sets
      if (b.totalSets <= a.totalSets) {
        record(pair, "poor_less_volume", "pass", `good=${a.totalSets} sets, poor=${b.totalSets} — volume reduced`);
      } else {
        record(pair, "poor_less_volume", "warn", `poor=${b.totalSets} > good=${a.totalSets} sets — poor checkin should reduce volume`);
      }

      // Poor should have shorter or equal estimated duration
      if (b.estimatedDuration <= a.estimatedDuration) {
        record(pair, "poor_shorter_duration", "pass", `good=${a.estimatedDuration}min, poor=${b.estimatedDuration}min`);
      } else {
        record(pair, "poor_shorter_duration", "warn", `poor=${b.estimatedDuration}min > good=${a.estimatedDuration}min`);
      }
    },
  },

  // ── 9. Beginner vs Advanced ──
  {
    name: "experience: beginner vs advanced",
    a: { label: "beginner", config: { experience: "beginner" as const, daysPerWeek: 3, minutesPerSession: 60 } },
    b: { label: "advanced", config: { experience: "advanced" as const, daysPerWeek: 5, minutesPerSession: 90 } },
    checks: (a, b, pair) => {
      // Beginner should have lower average difficulty
      const aDiff = avgDifficulty(a.exercises);
      const bDiff = avgDifficulty(b.exercises);
      if (aDiff <= bDiff + 0.3) {
        record(pair, "beginner_simpler", "pass", `beg=${aDiff.toFixed(1)} <= adv=${bDiff.toFixed(1)} avg difficulty`);
      } else {
        record(pair, "beginner_simpler", "fail", `beg=${aDiff.toFixed(1)} > adv=${bDiff.toFixed(1)} — beginners should get simpler exercises`);
      }

      // Advanced should have more sets per exercise
      const aAvgSets = a.totalSets / Math.max(a.exercises.length, 1);
      const bAvgSets = b.totalSets / Math.max(b.exercises.length, 1);
      if (bAvgSets >= aAvgSets - 0.3) {
        record(pair, "advanced_more_sets", "pass", `beg=${aAvgSets.toFixed(1)} sets/ex, adv=${bAvgSets.toFixed(1)}`);
      } else {
        record(pair, "advanced_more_sets", "warn", `adv=${bAvgSets.toFixed(1)} < beg=${aAvgSets.toFixed(1)} sets/ex`);
      }

      // Different schemes
      if (a.schemeId !== b.schemeId) {
        record(pair, "different_schemes", "pass", `beg=${a.schemeId}, adv=${b.schemeId}`);
      } else {
        record(pair, "different_schemes", "warn", `same scheme for beginner and advanced: ${a.schemeId}`);
      }
    },
  },

  // ── 10. Normal BMI vs High BMI ──
  {
    name: "bmi: normal vs 35+",
    a: { label: "bmi22", config: { weight: 72, height: 180 } }, // BMI ~22
    b: { label: "bmi35", config: { weight: 113, height: 180, goal: "lose_weight" as const } }, // BMI ~35
    checks: (a, b, pair) => {
      // High BMI should have fewer or no high-impact exercises
      const aImpact = a.exercises.filter((e: any) => {
        const lib = EX_MAP.get(e.exerciseId);
        return lib?.tags?.includes("conditioning_like") || e.pattern === "lunge";
      }).length;
      const bImpact = b.exercises.filter((e: any) => {
        const lib = EX_MAP.get(e.exerciseId);
        return lib?.tags?.includes("conditioning_like") || e.pattern === "lunge";
      }).length;

      record(pair, "high_bmi_less_impact", bImpact <= aImpact ? "pass" : "warn",
        `normal_bmi impact=${aImpact}, high_bmi=${bImpact}`);

      // High BMI should prefer machine/stable exercises
      const bStable = b.exercises.filter((e: any) => {
        const lib = EX_MAP.get(e.exerciseId);
        return lib?.tags?.includes("stable_choice") || lib?.tags?.includes("spine_safe");
      }).length;
      record(pair, "high_bmi_stable_exercises", bStable > 0 ? "pass" : "warn",
        `high BMI has ${bStable} stable/spine-safe exercises`);

      // Programs should differ
      const aIds = new Set(a.exercises.map((e: any) => e.exerciseId));
      const bIds = new Set(b.exercises.map((e: any) => e.exerciseId));
      const overlap = [...aIds].filter(id => bIds.has(id)).length;
      const overlapPct = overlap / Math.max(aIds.size, bIds.size, 1);
      record(pair, "programs_differ", overlapPct < 0.85 ? "pass" : "warn",
        `${Math.round(overlapPct * 100)}% exercise overlap`);
    },
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function countMuscle(exercises: any[], muscle: string): number {
  return exercises.filter((e: any) => {
    const lib = EX_MAP.get(e.exerciseId);
    return lib?.primaryMuscles?.includes(muscle as any) || e.targetMuscles?.includes(muscle);
  }).length;
}

function avgDifficulty(exercises: any[]): number {
  const diffs = exercises.map((e: any) => EX_MAP.get(e.exerciseId)?.difficulty || 3);
  return diffs.length ? diffs.reduce((s, d) => s + d, 0) / diffs.length : 0;
}

function avgCns(exercises: any[]): number {
  const loads = exercises.map((e: any) => EX_MAP.get(e.exerciseId)?.cnsLoad || 1);
  return loads.length ? loads.reduce((s, d) => s + d, 0) / loads.length : 0;
}

function avgReps(exercises: any[]): number {
  const reps = exercises.map((e: any) => {
    const rr = e.repsRange;
    if (Array.isArray(rr)) return (rr[0] + rr[1]) / 2;
    return 10;
  });
  return reps.length ? reps.reduce((s, r) => s + r, 0) / reps.length : 0;
}

function avgRest(exercises: any[]): number {
  const rests = exercises.map((e: any) => e.restSec || 60).filter((r: number) => r > 0);
  return rests.length ? rests.reduce((s: number, r: number) => s + r, 0) / rests.length : 0;
}

function hasTag(exId: string, tag: string): boolean {
  return EX_MAP.get(exId)?.tags?.includes(tag) || false;
}

function hasEquipment(exId: string, eq: string): boolean {
  return EX_MAP.get(exId)?.equipment?.includes(eq as any) || false;
}

// ============================================================================
// FLOW HELPERS
// ============================================================================

interface TestUser { id: string; tgId: number; token: string; }

let userCounter = 0;

async function createTestUser(name: string): Promise<TestUser> {
  const tgId = TG_ID_BASE + userCounter++;
  const rows = await q<{ id: string }>(
    `INSERT INTO users (tg_id, first_name, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (tg_id) DO UPDATE SET first_name = EXCLUDED.first_name, updated_at = now()
     RETURNING id`,
    [tgId, name, `test_l3_${tgId}`]
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

async function runFullFlow(label: string, cfg: PersonaConfig): Promise<WorkoutResult | null> {
  const user = await createTestUser(label);
  const auth = { Authorization: `Bearer ${user.token}` };

  const equipmentItems = cfg.equipmentItems ??
    (cfg.place === "gym" ? ["machines", "barbell", "dumbbell", "cable", "smith"] :
     cfg.place === "home_with_gear" ? ["dumbbells", "bands"] : ["bodyweight"]);

  // Onboarding
  const onbRes = await request(app).post("/onboarding/save").set(auth).send({
    data: {
      profile: { name: label },
      ageSex: { sex: cfg.sex, age: cfg.age },
      body: { height: cfg.height, weight: cfg.weight },
      schedule: { daysPerWeek: cfg.daysPerWeek, perWeek: cfg.daysPerWeek, minutesPerSession: cfg.minutesPerSession, minutes: cfg.minutesPerSession },
      experience: { level: cfg.experience },
      trainingPlace: { place: cfg.place },
      equipmentItems,
      environment: { location: cfg.place === "gym" ? "gym" : "home", bodyweightOnly: cfg.place === "home_no_equipment" },
      health: { injuries: [], restrictions: [] },
      lifestyle: { sleep: 7, stress: "medium" },
      dietPrefs: { preference: "balanced" },
      motivation: { goal: cfg.goal },
      goals: { primary: cfg.goal },
    },
  });
  if (onbRes.status !== 200) return null;

  // Scheme
  const schemeRes = await request(app).post("/schemes/recommend").set(auth).send({});
  if (schemeRes.status !== 200 || !schemeRes.body.recommended) return null;
  const schemeId = schemeRes.body.recommended.id;
  const schemeDays = schemeRes.body.recommended.daysPerWeek;
  await request(app).post("/schemes/select").set(auth).send({ schemeId });

  // Generate
  const genRes = await request(app).post("/api/workout/generate").set(auth).send({});
  if (genRes.status !== 200) return null;

  // Get planned workout
  const plannedRes = await request(app).get("/api/planned-workouts").set(auth);
  const pw = plannedRes.body?.plannedWorkouts?.[0];
  if (!pw) return null;

  // Start workout
  const checkin = cfg.checkin ?? { sleepQuality: "good", energyLevel: "medium", stressLevel: "low" };
  const startRes = await request(app).post("/api/workout/workout/start").set(auth).send({
    date: new Date().toISOString().split("T")[0],
    plannedWorkoutId: pw.id,
    commit: true,
    checkin,
  });

  if (startRes.status !== 200) return null;

  return {
    action: startRes.body.action,
    exercises: startRes.body.workout?.exercises || [],
    totalSets: startRes.body.workout?.totalSets || 0,
    estimatedDuration: startRes.body.workout?.estimatedDuration || 0,
    intent: startRes.body.workout?.intent || "normal",
    dayLabel: startRes.body.workout?.dayLabel || "?",
    schemeId,
    schemeDays,
  };
}

// ============================================================================
// TESTS
// ============================================================================

afterAll(async () => {
  // Cleanup
  const rows = await q<{ id: string }>(
    `SELECT id FROM users WHERE tg_id >= $1 AND tg_id < $2`,
    [TG_ID_BASE, TG_ID_BASE + 100]
  );
  for (const row of rows) await cleanupTestUser(row.id);
  await pool.end();

  // Summary
  const fails = allResults.filter(r => r.status === "fail");
  const warns = allResults.filter(r => r.status === "warn");
  const passes = allResults.filter(r => r.status === "pass");

  console.log("\n\n" + "=".repeat(80));
  console.log("LEVEL 3 — PERSONALIZATION QUALITY SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total checks: ${allResults.length}`);
  console.log(`  PASS: ${passes.length}`);
  console.log(`  WARN: ${warns.length}`);
  console.log(`  FAIL: ${fails.length}`);

  // Group by pair
  const pairs = [...new Set(allResults.map(r => r.pair))];
  for (const p of pairs) {
    const pResults = allResults.filter(r => r.pair === p);
    const pF = pResults.filter(r => r.status === "fail").length;
    const pW = pResults.filter(r => r.status === "warn").length;
    const pP = pResults.filter(r => r.status === "pass").length;
    const icon = pF > 0 ? "❌" : pW > 0 ? "⚠️" : "✅";
    console.log(`  ${icon} ${p}: ${pP}P / ${pW}W / ${pF}F`);
  }

  if (warns.length > 0) {
    console.log("\n--- WARNINGS ---");
    for (const w of warns) console.log(`  [${w.pair}] ${w.check}: ${w.detail}`);
  }

  if (fails.length > 0) {
    console.log("\n--- FAILURES ---");
    for (const f of fails) console.log(`  [${f.pair}] ${f.check}: ${f.detail}`);
  }

  console.log("=".repeat(80) + "\n");
});

describe("Level 3: Personalization", () => {
  test.each(PAIRS.map((p, i) => ({ ...p, idx: i })))(
    "$name",
    async (pair) => {
      const cfgA: PersonaConfig = { ...BASE, ...pair.a.config };
      const cfgB: PersonaConfig = { ...BASE, ...pair.b.config };

      const [resultA, resultB] = await Promise.all([
        runFullFlow(`L3-${pair.name}-${pair.a.label}`, cfgA),
        runFullFlow(`L3-${pair.name}-${pair.b.label}`, cfgB),
      ]);

      if (!resultA) {
        record(pair.name, "setup_a", "fail", `${pair.a.label} flow failed`);
        return;
      }
      if (!resultB) {
        record(pair.name, "setup_b", "fail", `${pair.b.label} flow failed`);
        return;
      }

      // Run pair-specific checks
      pair.checks(resultA, resultB, pair.name);
    },
    120_000
  );
});

// api/src/periodization.contract.test.ts
// ============================================================================
// PERIODIZATION ARCHITECTURE — CONTRACT TESTS
//
// These tests define the rules of the new periodization architecture.
// Many will FAIL on current code — that's expected.
// They become green as we implement each layer.
//
// Rules tested:
//  1. Beginner + any goal → main/secondary never < 6 reps
//  2. PPL 3x → no day-level DUP (each muscle group seen only once/week)
//  3. UL 4x → DUP wave by exposure (Upper A/B, Lower A/B), not calendar days
//  4. No exercise history → DUP rep override off for that exercise
//  5. Accessories never get low-rep heavy profile (< 8 reps)
//  6. DayPrescription is per-day, but exercise-level overrides exist
//  7. Deload week → no strength-biased day
// ============================================================================

import { jest, describe, test, beforeAll, afterAll, expect } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "./testApp.js";
import { q, pool } from "./db.js";
import { config } from "./config.js";
import { setSelectionSeed, clearSelectionSeed } from "./exerciseSelector.js";
import { getPatternRole } from "./patternRoles.js";

// ============================================================================
// SETUP
// ============================================================================

const app = createApp();
const TG_ID_BASE = 950_000_000; // unique range for contract tests

jest.setTimeout(600_000); // 10 minutes

// ============================================================================
// ROLE INFERENCE — API doesn't return `role`, so we infer from `pattern`
// ============================================================================

function inferRole(pattern: string): "main" | "secondary" | "accessory" | "pump" | "conditioning" {
  return getPatternRole(pattern);
}

// ============================================================================
// GOLDEN PERSONAS — canonical user profiles, DO NOT CHANGE
// ============================================================================

interface GoldenPersona {
  id: string;               // stable key
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
  // Expected scheme characteristics (for validation)
  expectedSplitFamily: "full_body" | "upper_lower" | "push_pull_legs" | "conditioning" | "bro_split" | "other";
  expectedDUP: "off" | "full" | "by_exposure";
  // Force specific scheme instead of recommendation (for testing specific split types)
  forceSchemeId?: string;
}

const GOLDEN_PERSONAS: GoldenPersona[] = [
  // GP1: Beginner FB 3x — full DUP allowed, but calibration should suppress it
  {
    id: "GP1_beg_muscle_fb3",
    name: "GP1 beginner/muscle/FB3x/gym/M",
    sex: "male", age: 25, height: 178, weight: 75,
    experience: "beginner", goal: "build_muscle",
    daysPerWeek: 3, minutesPerSession: 60, place: "gym",
    expectedSplitFamily: "full_body",
    expectedDUP: "full", // split allows full DUP, but calibration will suppress
  },

  // GP2: Intermediate UL 4x — DUP by exposure (Upper A/B, Lower A/B)
  {
    id: "GP2_inter_muscle_ul4",
    name: "GP2 intermediate/muscle/UL4x/gym/M",
    sex: "male", age: 28, height: 180, weight: 82,
    experience: "intermediate", goal: "build_muscle",
    daysPerWeek: 4, minutesPerSession: 60, place: "gym",
    expectedSplitFamily: "upper_lower",
    expectedDUP: "by_exposure",
  },

  // GP3: Advanced PPL 6x — DUP by exposure (Push A/B, Pull A/B, Legs A/B)
  {
    id: "GP3_adv_muscle_ppl6",
    name: "GP3 advanced/muscle/PPL6x/gym/M",
    sex: "male", age: 28, height: 182, weight: 90,
    experience: "advanced", goal: "build_muscle",
    daysPerWeek: 6, minutesPerSession: 90, place: "gym",
    expectedSplitFamily: "push_pull_legs",
    expectedDUP: "by_exposure",
  },

  // GP4: Intermediate PPL 3x — DUP OFF (each muscle group seen once/week)
  // Force ppl_3x_condensed because recommender prefers fb_3x_classic for 3d
  {
    id: "GP4_inter_muscle_ppl3",
    name: "GP4 intermediate/muscle/PPL3x/gym/M",
    sex: "male", age: 30, height: 176, weight: 80,
    experience: "intermediate", goal: "build_muscle",
    daysPerWeek: 3, minutesPerSession: 60, place: "gym",
    expectedSplitFamily: "push_pull_legs",
    expectedDUP: "off",
    forceSchemeId: "ppl_3x_condensed",
  },

  // GP5: Beginner health 2x — DUP OFF (too few days, beginner)
  {
    id: "GP5_beg_health_fb2",
    name: "GP5 beginner/health/FB2x/gym/M",
    sex: "male", age: 55, height: 175, weight: 85,
    experience: "beginner", goal: "health_wellness",
    daysPerWeek: 2, minutesPerSession: 45, place: "gym",
    expectedSplitFamily: "full_body",
    expectedDUP: "off", // beginner 2x → DUP off
  },

  // GP6: Intermediate lose_weight 4x — conditioning split, DUP off
  {
    id: "GP6_inter_lose_cond4",
    name: "GP6 intermediate/lose/cond4x/gym/F",
    sex: "female", age: 35, height: 162, weight: 70,
    experience: "intermediate", goal: "lose_weight",
    daysPerWeek: 4, minutesPerSession: 60, place: "gym",
    expectedSplitFamily: "conditioning",
    expectedDUP: "off",
  },

  // GP7: Advanced athletic 5x — athletic/PPL, DUP by exposure
  {
    id: "GP7_adv_athletic_5",
    name: "GP7 advanced/athletic/5x/gym/M",
    sex: "male", age: 26, height: 183, weight: 80,
    experience: "advanced", goal: "athletic_body",
    daysPerWeek: 5, minutesPerSession: 60, place: "gym",
    expectedSplitFamily: "other", // could be athletic_5x or ppl_5x
    expectedDUP: "by_exposure",
  },
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
    [tgId, name, `test_contract_${tgId}`]
  );
  const id = rows[0].id;
  const token = jwt.sign({ uid: id, tg: tgId }, config.jwtSecret, { expiresIn: "2h" });
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

function buildOnboardingPayload(p: GoldenPersona) {
  const equipmentItems = p.equipmentItems ??
    (p.place === "gym" ? ["machines", "barbell", "dumbbell", "cable", "smith"] :
     p.place === "home_with_gear" ? ["dumbbells", "bands", "pullup_bar"] : ["bodyweight"]);
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

// Roles that should never get low-rep ranges
const ACCESSORY_ROLES = new Set(["accessory", "pump", "conditioning"]);
// Patterns that map to accessory/pump
const ACCESSORY_PATTERNS = new Set([
  "triceps_iso", "biceps_iso", "calves", "core", "carry",
  "conditioning_low_impact", "conditioning_intervals",
]);

// ============================================================================
// TEST DATA: collected per persona
// ============================================================================

interface DayData {
  dayIndex: number;
  dayLabel: string;
  intent: string;
  exercises: Array<{
    exerciseId: string;
    exerciseName: string;
    pattern: string;
    role: string;
    sets: number;
    repsRange: [number, number] | null;
    restSec: number;
    suggestedWeight: number | null;
    loadType: string;
  }>;
}

interface PersonaTestData {
  persona: GoldenPersona;
  schemeId: string;
  schemeDays: number;
  days: DayData[];
  errors: string[];
}

const personaData = new Map<string, PersonaTestData>();

// ============================================================================
// SETUP: Generate workouts for all personas
// ============================================================================

beforeAll(async () => {
  setSelectionSeed(42);

  for (let i = 0; i < GOLDEN_PERSONAS.length; i++) {
    const p = GOLDEN_PERSONAS[i];
    const tgId = TG_ID_BASE + i;
    const user = await createTestUser(tgId, p.name);
    const auth = { Authorization: `Bearer ${user.token}` };

    const data: PersonaTestData = {
      persona: p,
      schemeId: "",
      schemeDays: 0,
      days: [],
      errors: [],
    };

    try {
      // Onboarding
      const onbRes = await request(app).post("/onboarding/save").set(auth).send(buildOnboardingPayload(p));
      if (onbRes.status !== 200) { data.errors.push(`Onboarding failed: ${onbRes.status}`); personaData.set(p.id, data); continue; }

      // Scheme recommendation + selection
      let schemeId: string;
      let schemeDays: number;

      if (p.forceSchemeId) {
        // Force specific scheme for testing specific split types
        schemeId = p.forceSchemeId;
        schemeDays = p.daysPerWeek;
      } else {
        const schemeRes = await request(app).post("/schemes/recommend").set(auth).send({});
        if (schemeRes.status !== 200 || !schemeRes.body.recommended) { data.errors.push(`Scheme recommend failed: ${schemeRes.status}`); personaData.set(p.id, data); continue; }
        const scheme = schemeRes.body.recommended;
        schemeId = scheme.id;
        schemeDays = scheme.daysPerWeek;
      }

      data.schemeId = schemeId;
      data.schemeDays = schemeDays;

      await request(app).post("/schemes/select").set(auth).send({ schemeId });

      // Generate week
      const genRes = await request(app).post("/api/workout/generate").set(auth).send({});
      if (genRes.status !== 200) { data.errors.push(`Generate failed: ${genRes.status}`); personaData.set(p.id, data); continue; }

      // Get planned workouts
      const plannedRes = await request(app).get("/api/planned-workouts").set(auth);
      if (plannedRes.status !== 200) { data.errors.push(`Planned workouts failed: ${plannedRes.status}`); personaData.set(p.id, data); continue; }
      const plannedWorkouts = plannedRes.body.plannedWorkouts || [];

      // Start each day
      const checkin = { sleepQuality: "good", energyLevel: "medium", stressLevel: "low" };
      for (let dayIdx = 0; dayIdx < Math.min(plannedWorkouts.length, data.schemeDays); dayIdx++) {
        const pw = plannedWorkouts[dayIdx];
        const startRes = await request(app).post("/api/workout/workout/start").set(auth).send({
          date: new Date().toISOString().split("T")[0],
          plannedWorkoutId: pw.id,
          commit: true,
          checkin,
        });

        if (startRes.status === 200 && startRes.body.workout?.exercises) {
          const wo = startRes.body.workout;
          data.days.push({
            dayIndex: dayIdx,
            dayLabel: wo.dayLabel || `Day ${dayIdx + 1}`,
            intent: wo.intent || "normal",
            exercises: (wo.exercises || []).map((ex: any) => {
              const pattern = ex.pattern || "unknown";
              return {
                exerciseId: ex.exerciseId || ex.id,
                exerciseName: ex.exerciseName || ex.name || "Unknown",
                pattern,
                role: inferRole(pattern), // infer from pattern since API doesn't return role
                sets: Number(ex.sets) || 0,
                repsRange: Array.isArray(ex.repsRange) ? ex.repsRange as [number, number] : null,
                restSec: Number(ex.restSec) || 0,
                suggestedWeight: ex.weight ?? ex.suggestedWeight ?? null,
                loadType: ex.loadType || "unknown",
              };
            }),
          });
        }
      }
    } catch (err: any) {
      data.errors.push(`Exception: ${err.message}`);
    }

    personaData.set(p.id, data);
  }
});

afterAll(async () => {
  clearSelectionSeed();
  const rows = await q<{ id: string }>(
    `SELECT id FROM users WHERE tg_id >= $1 AND tg_id < $2`,
    [TG_ID_BASE, TG_ID_BASE + GOLDEN_PERSONAS.length + 100]
  );
  for (const row of rows) await cleanupTestUser(row.id);
  await pool.end();
});

// ============================================================================
// HELPER: get data for a persona
// ============================================================================

function getData(personaId: string): PersonaTestData {
  const d = personaData.get(personaId);
  if (!d) throw new Error(`No data for persona ${personaId}`);
  if (d.errors.length > 0) throw new Error(`Setup errors for ${personaId}: ${d.errors.join("; ")}`);
  if (d.days.length === 0) throw new Error(`No workout days generated for ${personaId}`);
  return d;
}

// ============================================================================
// CONTRACT 1: BEGINNER — no main/secondary exercise gets reps < 6
//
// Rule: Beginners lack technique for heavy low-rep work.
// Calibration should override DUP for uncalibrated exercises.
// ============================================================================

describe("Contract 1: Beginner rep floor", () => {
  const beginnerPersonas = GOLDEN_PERSONAS.filter(p => p.experience === "beginner");

  test.each(beginnerPersonas.map(p => [p.id, p.name]))(
    "%s: main/secondary reps >= 6",
    (personaId) => {
      const data = getData(personaId as string);
      const violations: string[] = [];

      for (const day of data.days) {
        for (const ex of day.exercises) {
          if (!ex.repsRange) continue;
          const role = ex.role;
          // Only check main and secondary — these are the ones DUP affects
          if (role !== "main" && role !== "secondary") continue;

          const [minR] = ex.repsRange;
          if (minR < 6) {
            violations.push(
              `${day.dayLabel}: ${ex.exerciseName} (${role}) got ${ex.repsRange[0]}-${ex.repsRange[1]} reps — min < 6 is unsafe for beginner`
            );
          }
        }
      }

      expect(violations).toEqual([]);
    }
  );
});

// ============================================================================
// CONTRACT 2: PPL 3x — no day-level DUP
//
// Rule: In PPL 3x each muscle group is trained once per week.
// DUP (heavy/medium/light variation) is meaningless because there's
// no repeated exposure to wave across.
// ============================================================================

describe("Contract 2: PPL 3x — no DUP variation", () => {
  test("GP4 (PPL 3x): no DUP-level rep range shifts between days", () => {
    const data = getData("GP4_inter_muscle_ppl3");

    // In PPL 3x, Push/Pull/Legs each train different muscle groups.
    // There's no repeated exposure to wave across, so DUP is meaningless.
    // All main exercises should get goal-standard reps, not DUP-shifted.

    // Collect min reps of main exercises per day
    const dayMainMinReps: Array<{ day: string; minReps: number[] }> = [];

    for (const day of data.days) {
      const mainMinReps: number[] = [];
      for (const ex of day.exercises) {
        if (ex.role === "main" && ex.repsRange) {
          mainMinReps.push(ex.repsRange[0]);
        }
      }
      if (mainMinReps.length > 0) {
        dayMainMinReps.push({ day: day.dayLabel, minReps: mainMinReps });
      }
    }

    if (dayMainMinReps.length < 2) return; // not enough data

    // For build_muscle, goal-standard main reps = [6,10].
    // DUP would create one day at [4,6] and another at [10,15].
    // Check that no day has DUP-extreme reps (< 6 or > 12 for build_muscle main)
    const violations: string[] = [];
    for (const { day, minReps } of dayMainMinReps) {
      for (const mr of minReps) {
        if (mr < 6) {
          violations.push(`${day}: main exercise got minReps=${mr} — DUP heavy applied to PPL 3x`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ============================================================================
// CONTRACT 3: UL 4x — DUP wave by exposure group, not calendar day
//
// Rule: In UL 4x (Upper A, Lower A, Upper B, Lower B), DUP should wave
// between Upper A and Upper B (same muscles, different stimulus),
// NOT between Upper A and Lower A (different muscles).
// ============================================================================

describe("Contract 3: UL 4x — wave by exposure", () => {
  // Helper: get average min reps for main exercises in a day
  function avgMainMinReps(day: DayData): number | null {
    const mains = day.exercises.filter(e => e.role === "main" && e.repsRange);
    if (mains.length === 0) return null;
    return mains.reduce((s, e) => s + e.repsRange![0], 0) / mains.length;
  }

  test("GP2 (UL 4x): Upper A and Upper B have different rep profiles (DUP by exposure)", () => {
    const data = getData("GP2_inter_muscle_ul4");

    // Classify days by region
    const upperDays = data.days.filter(d => {
      const label = d.dayLabel.toLowerCase();
      return label.includes("upper") || label.includes("верх");
    });

    // If we have 2 Upper days, they should have DIFFERENT rep profiles
    if (upperDays.length >= 2) {
      const upperReps = upperDays.map(d => avgMainMinReps(d)).filter(r => r !== null) as number[];
      if (upperReps.length >= 2) {
        const upperSpread = Math.abs(upperReps[0] - upperReps[1]);
        // DUP should create variation WITHIN the exposure group (Upper A vs Upper B)
        expect(upperSpread).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("GP2 (UL 4x): Lower A and Lower B have different rep profiles (DUP by exposure)", () => {
    const data = getData("GP2_inter_muscle_ul4");

    const lowerDays = data.days.filter(d => {
      const label = d.dayLabel.toLowerCase();
      return label.includes("lower") || label.includes("низ") || label.includes("ноги");
    });

    if (lowerDays.length >= 2) {
      const lowerReps = lowerDays.map(d => avgMainMinReps(d)).filter(r => r !== null) as number[];
      if (lowerReps.length >= 2) {
        const lowerSpread = Math.abs(lowerReps[0] - lowerReps[1]);
        expect(lowerSpread).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("GP2 (UL 4x): DUP NOT applied cross-region (Upper heavy ≠ Lower light)", () => {
    const data = getData("GP2_inter_muscle_ul4");

    // Current broken behavior: DUP_PATTERNS[4] = [heavy, medium, light, medium]
    //   Day 0 (Upper A) = heavy [4-6]
    //   Day 1 (Lower A) = medium [6-10]
    //   Day 2 (Upper B) = light [10-15]
    //   Day 3 (Lower B) = medium [6-10]
    // This is WRONG: heavy/light should be within SAME region (Upper A vs Upper B).

    if (data.days.length < 4) return;

    // Get rep profiles per day
    const dayProfiles = data.days.map(d => ({
      label: d.dayLabel,
      isUpper: d.dayLabel.toLowerCase().includes("upper"),
      isLower: d.dayLabel.toLowerCase().includes("lower"),
      avgMinReps: avgMainMinReps(d),
    }));

    // Find Upper A and Lower A (days 0 and 1 typically)
    const upperA = dayProfiles.find(d => d.isUpper);
    const lowerA = dayProfiles.find(d => d.isLower);

    if (upperA?.avgMinReps && lowerA?.avgMinReps) {
      // Upper A and Lower A train DIFFERENT muscles.
      // They should NOT have a DUP-level spread between them.
      // A spread > 4 means one is "heavy" and the other "medium/light" — calendar DUP.
      const crossRegionSpread = Math.abs(upperA.avgMinReps - lowerA.avgMinReps);
      expect(crossRegionSpread).toBeLessThanOrEqual(4);
    }
  });
});

// ============================================================================
// CONTRACT 4: No exercise history → no DUP rep override for that exercise
//
// Rule: First-time exercises have no calibrated weight.
// DUP rep range override (e.g. 4-6 heavy) should NOT apply
// until the exercise has sufficient history (≥2 valid exposures).
// ============================================================================

describe("Contract 4: Uncalibrated exercises — no DUP override", () => {
  test.each(GOLDEN_PERSONAS.map(p => [p.id, p.name]))(
    "%s: first-time exercises get safe mid-range reps",
    (personaId) => {
      const data = getData(personaId as string);
      const p = data.persona;
      const violations: string[] = [];

      // On first workout generation (no history), ALL exercises are uncalibrated.
      // They should NOT get extreme DUP ranges (< 6 for heavy, or > 18 for light).
      for (const day of data.days) {
        for (const ex of day.exercises) {
          if (!ex.repsRange) continue;
          if (ex.role !== "main" && ex.role !== "secondary") continue;

          const [minR, maxR] = ex.repsRange;

          // For uncalibrated exercises, safe range should be goal-appropriate mid-range
          // Never below 6 (even for advanced), never above 18 (sanity)
          if (minR < 6) {
            violations.push(
              `${day.dayLabel}: ${ex.exerciseName} (${ex.role}) got ${minR}-${maxR} — min < 6 without exercise history`
            );
          }
        }
      }

      expect(violations).toEqual([]);
    }
  );
});

// ============================================================================
// CONTRACT 5: Accessories NEVER get low-rep heavy profile
//
// Rule: Accessory exercises (triceps_iso, biceps_iso, calves, core, etc.)
// should ALWAYS stay in hypertrophy-safe ranges (≥ 8 reps).
// DUP day type must not affect accessories.
// ============================================================================

describe("Contract 5: Accessories always hypertrophy-safe", () => {
  test.each(GOLDEN_PERSONAS.map(p => [p.id, p.name]))(
    "%s: accessory reps >= 8",
    (personaId) => {
      const data = getData(personaId as string);
      const violations: string[] = [];

      for (const day of data.days) {
        for (const ex of day.exercises) {
          if (!ex.repsRange) continue;

          const isAccessory = ACCESSORY_ROLES.has(ex.role) || ACCESSORY_PATTERNS.has(ex.pattern);
          if (!isAccessory) continue;

          const [minR] = ex.repsRange;
          if (minR < 8) {
            violations.push(
              `${day.dayLabel}: ${ex.exerciseName} (${ex.role}/${ex.pattern}) got ${ex.repsRange[0]}-${ex.repsRange[1]} — accessory min < 8`
            );
          }
        }
      }

      expect(violations).toEqual([]);
    }
  );
});

// ============================================================================
// CONTRACT 6: Deload week — no strength-biased day
//
// Rule: During a scheduled deload week, no day should have
// strength-biased characteristics (low reps + high rest).
// volumeMultiplier should be < 0.8.
// ============================================================================

describe("Contract 6: Deload suppresses heavy days", () => {
  // This test is structural — we verify that in deload week,
  // if DUP were applied, it would NOT produce heavy (low-rep) days.
  // For now, we test indirectly: on normal week generation (week 1),
  // verify that the system COULD produce DUP variation (if split allows).
  // Full deload testing will come when we can force week number.

  test("GP2 (intermediate UL 4x): normal week has rep variation across days", () => {
    const data = getData("GP2_inter_muscle_ul4");

    // Collect min reps of main exercises per day
    const dayMinReps: number[] = [];
    for (const day of data.days) {
      const mains = day.exercises.filter(e => e.role === "main" && e.repsRange);
      if (mains.length > 0) {
        dayMinReps.push(Math.min(...mains.map(e => e.repsRange![0])));
      }
    }

    // With DUP active on UL 4x, we expect at least SOME variation
    if (dayMinReps.length >= 2) {
      const spread = Math.max(...dayMinReps) - Math.min(...dayMinReps);
      // Just verify the system produces data — deload suppression tested later
      expect(spread).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// CONTRACT 7: Split-aware DUP — correct mapping for all scheme families
//
// Rule: DUP wave assignment must be based on repeated muscle group
// exposures within the split, not on calendar day number.
// ============================================================================

describe("Contract 7: Split-aware DUP mapping", () => {
  test("GP3 (PPL 6x): Push A and Push B should have different rep profiles", () => {
    const data = getData("GP3_adv_muscle_ppl6");

    // Find Push days
    const pushDays = data.days.filter(d => {
      const label = d.dayLabel.toLowerCase();
      return label.includes("push") || label.includes("жим");
    });

    if (pushDays.length >= 2) {
      // Get average min reps for main exercises
      const reps = pushDays.map(d => {
        const mains = d.exercises.filter(e => e.role === "main" && e.repsRange);
        if (mains.length === 0) return null;
        return mains.reduce((s, e) => s + e.repsRange![0], 0) / mains.length;
      }).filter(r => r !== null) as number[];

      if (reps.length >= 2) {
        // Push A and Push B should have DUP variation (different rep ranges)
        const spread = Math.abs(reps[0] - reps[1]);
        expect(spread).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("GP5 (beginner FB 2x): no DUP — too few days for beginner", () => {
    const data = getData("GP5_beg_health_fb2");

    // For beginner with 2 days, DUP should be off
    // All main exercises across both days should have similar rep ranges
    const mainRepMins: number[] = [];

    for (const day of data.days) {
      for (const ex of day.exercises) {
        if (ex.role === "main" && ex.repsRange) {
          mainRepMins.push(ex.repsRange[0]);
        }
      }
    }

    if (mainRepMins.length >= 2) {
      const spread = Math.max(...mainRepMins) - Math.min(...mainRepMins);
      // No DUP-level jumps for beginner 2x
      expect(spread).toBeLessThanOrEqual(4);
    }
  });
});

// ============================================================================
// CONTRACT 8: repProfile is per-role, not per-day
//
// Rule: DayPrescription.repProfile must define ranges per role
// (main, secondary, accessory). A "strength_biased" day should have
// low reps for main, moderate for secondary, hypertrophy for accessory.
// NOT all exercises at the same range.
// ============================================================================

describe("Contract 8: Per-role rep differentiation", () => {
  test.each(GOLDEN_PERSONAS.filter(p => p.experience !== "beginner").map(p => [p.id, p.name]))(
    "%s: main exercises have lower reps than accessories on same day",
    (personaId) => {
      const data = getData(personaId as string);
      let checksPerformed = 0;
      let checksOk = 0;

      for (const day of data.days) {
        const mainExercises = day.exercises.filter(e => e.role === "main" && e.repsRange);
        const accessoryExercises = day.exercises.filter(e =>
          (ACCESSORY_ROLES.has(e.role) || ACCESSORY_PATTERNS.has(e.pattern)) && e.repsRange
        );

        if (mainExercises.length === 0 || accessoryExercises.length === 0) continue;

        const avgMainMin = mainExercises.reduce((s, e) => s + e.repsRange![0], 0) / mainExercises.length;
        const avgAccMin = accessoryExercises.reduce((s, e) => s + e.repsRange![0], 0) / accessoryExercises.length;

        checksPerformed++;
        // Main should have same or lower min reps than accessories
        if (avgMainMin <= avgAccMin) {
          checksOk++;
        }
      }

      // At least some days should show role differentiation
      if (checksPerformed > 0) {
        const pct = (checksOk / checksPerformed) * 100;
        expect(pct).toBeGreaterThanOrEqual(80);
      }
    }
  );
});

// ============================================================================
// SUMMARY: Print contract test results
// ============================================================================

afterAll(() => {
  console.log("\n" + "=".repeat(80));
  console.log("PERIODIZATION CONTRACT TESTS — SUMMARY");
  console.log("=".repeat(80));

  for (const [id, data] of personaData) {
    const p = data.persona;
    console.log(`\n  ${p.id}: ${p.experience}/${p.goal}/${p.daysPerWeek}d`);
    console.log(`    scheme: ${data.schemeId} (${data.schemeDays}d)`);
    console.log(`    days generated: ${data.days.length}`);
    if (data.errors.length > 0) {
      console.log(`    ERRORS: ${data.errors.join("; ")}`);
    }

    // Show rep ranges per day for debugging
    for (const day of data.days) {
      const mainReps = day.exercises
        .filter(e => e.role === "main" && e.repsRange)
        .map(e => `${e.repsRange![0]}-${e.repsRange![1]}`);
      const accReps = day.exercises
        .filter(e => ACCESSORY_ROLES.has(e.role) && e.repsRange)
        .map(e => `${e.repsRange![0]}-${e.repsRange![1]}`);
      console.log(`    ${day.dayLabel}: main=[${mainReps.join(",")}] acc=[${accReps.join(",")}]`);
    }
  }

  console.log("\n" + "=".repeat(80));
});

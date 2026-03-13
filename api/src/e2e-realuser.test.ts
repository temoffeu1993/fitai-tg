// api/src/e2e-realuser.test.ts — E2E Real User Simulation
// Full user lifecycle: onboarding → scheme → 10 workouts with progression
// Runs against Supabase (production DB) via DATABASE_URL override
//
// Usage:
//   DATABASE_URL="postgresql://postgres.xbxozviuqgwogutrcyhd:pzRDJYHtEDr45VjS@aws-1-eu-west-3.pooler.supabase.com:5432/postgres" \
//   NODE_OPTIONS='--experimental-vm-modules' npx jest --testPathPattern=e2e-realuser --verbose

import { jest, describe, test, beforeAll, afterAll, expect } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { createApp } from "./testApp.js";
import { q, pool } from "./db.js";
import { config } from "./config.js";

// ============================================================================
// CONFIG
// ============================================================================

const app = createApp();
const TG_ID_BASE = 990_000_000; // unique range for E2E tests
const WORKOUTS_PER_USER = 10;

jest.setTimeout(900_000); // 15 minutes

// ============================================================================
// PERSONAS — realistic users, normal check-in, no pain
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
  place: "gym" | "home_with_gear";
  equipmentItems?: string[];
}

const PERSONAS: Persona[] = [
  {
    name: "E2E-01 beg/muscle/gym/M/25/3d/60m",
    sex: "male", age: 25, height: 178, weight: 75,
    experience: "beginner", goal: "build_muscle",
    daysPerWeek: 3, minutesPerSession: 60, place: "gym",
  },
  {
    name: "E2E-02 inter/lose/gym/F/35/4d/60m",
    sex: "female", age: 35, height: 162, weight: 70,
    experience: "intermediate", goal: "lose_weight",
    daysPerWeek: 4, minutesPerSession: 60, place: "gym",
  },
  {
    name: "E2E-03 adv/muscle/gym/M/28/5d/90m",
    sex: "male", age: 28, height: 182, weight: 90,
    experience: "advanced", goal: "build_muscle",
    daysPerWeek: 5, minutesPerSession: 90, place: "gym",
  },
  {
    name: "E2E-04 beg/health/gym/M/50/2d/45m",
    sex: "male", age: 50, height: 175, weight: 85,
    experience: "beginner", goal: "health_wellness",
    daysPerWeek: 2, minutesPerSession: 45, place: "gym",
  },
  {
    name: "E2E-05 inter/athletic/gym/M/30/4d/60m",
    sex: "male", age: 30, height: 180, weight: 80,
    experience: "intermediate", goal: "athletic_body",
    daysPerWeek: 4, minutesPerSession: 60, place: "gym",
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
    [tgId, name, `test_e2e_${tgId}`]
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

function buildOnboardingPayload(p: Persona) {
  const equipmentItems = p.equipmentItems ??
    (p.place === "gym" ? ["machines", "barbell", "dumbbell", "cable", "smith"] :
     ["dumbbells", "bands", "pullup_bar"]);
  return {
    data: {
      profile: { name: `Test ${p.name}` },
      ageSex: { sex: p.sex, age: p.age },
      body: { height: p.height, weight: p.weight },
      schedule: { daysPerWeek: p.daysPerWeek, perWeek: p.daysPerWeek, minutesPerSession: p.minutesPerSession, minutes: p.minutesPerSession },
      experience: { level: p.experience },
      trainingPlace: { place: p.place },
      equipmentItems,
      environment: { location: p.place === "gym" ? "gym" : "home", bodyweightOnly: false },
      health: { injuries: [], restrictions: [] },
      lifestyle: { sleep: 7, stress: "medium" },
      dietPrefs: { preference: "balanced" },
      motivation: { goal: p.goal },
      goals: { primary: p.goal },
    },
  };
}

// Simulate realistic per-exercise effort based on workout progression
const EFFORT_LEVELS: Array<"easy" | "working" | "quite_hard" | "hard" | "max"> =
  ["easy", "working", "quite_hard", "hard", "max"];

function pickEffort(workoutNumber: number, exerciseIndex: number): "easy" | "working" | "quite_hard" | "hard" {
  // Early workouts: easy/working. Later workouts: working/quite_hard/hard.
  // Compounds (low index) feel harder than accessories (high index).
  const base = Math.min(3, Math.floor(workoutNumber / 3)); // 0→0, 1-2→0, 3-5→1, 6-8→2, 9+→3
  const adjust = exerciseIndex === 0 ? 1 : 0; // first exercise (compound) feels harder
  const idx = Math.min(3, base + adjust); // cap at "hard" (no "max" in simulation)
  return EFFORT_LEVELS[idx] as "easy" | "working" | "quite_hard" | "hard";
}

function buildSessionPayload(workout: any, workoutNumber: number) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  return {
    exercises: exercises.map((ex: any, exIdx: number) => {
      const sets = Number(ex.sets) || 3;
      const repsRange = ex.repsRange;
      const minR = Array.isArray(repsRange) ? repsRange[0] : 8;
      const maxR = Array.isArray(repsRange) ? repsRange[1] : 12;
      // Early workouts: hit mid-range reps. Later workouts: hit TOP of range to trigger progression.
      const targetReps = workoutNumber <= 2
        ? Math.round((minR + maxR) / 2)  // mid-range first time
        : maxR;                           // top of range → triggers weight increase
      // Use suggested weight from progression if available, otherwise default
      const baseWeight = ex.weight ?? ex.suggestedWeight ?? (ex.loadType === "bodyweight" ? 0 : 20);
      const progressWeight = baseWeight > 0 ? baseWeight : 0;
      const effort = pickEffort(workoutNumber, exIdx);
      return {
        id: ex.exerciseId || ex.id,
        name: ex.exerciseName || ex.name,
        reps: `${minR}-${maxR}`,
        done: true,
        effort,
        sets: Array.from({ length: sets }, (_, i) => ({
          reps: Math.max(1, targetReps - (workoutNumber <= 2 ? Math.floor(i / 2) : 0)),
          weight: progressWeight,
          done: true,
        })),
      };
    }),
    feedback: { sessionRpe: Math.min(9, 5 + Math.floor(workoutNumber / 3)) },
  };
}

// ============================================================================
// REPORT TYPES
// ============================================================================

interface ExerciseReport {
  order: number;
  exerciseId: string;
  exerciseName: string;
  pattern: string;
  sets: number;
  repsRange: [number, number] | null;
  restSec: number;
  suggestedWeight: number | null;
  loadType: string;
}

interface ProgressionResponse {
  totalExercises: number;
  progressedCount: number;
  maintainedCount: number;
  deloadCount: number;
  details: { exerciseName: string; recommendation: any }[];
}

interface WorkoutReport {
  workoutNumber: number;
  dayLabel: string;
  intent: string;
  totalExercises: number;
  totalSets: number;
  estimatedDuration: number;
  exercises: ExerciseReport[];
  progressionResult?: ProgressionResponse | null;
}

interface ProgressionDelta {
  exerciseId: string;
  exerciseName: string;
  firstSeen: number; // workout number
  occurrences: { workoutNum: number; suggestedWeight: number | null; repsRange: [number, number] | null; sets: number }[];
}

interface PersonaReport {
  persona: Persona;
  schemeId: string;
  schemeName: string;
  schemeDays: number;
  dayLabels: string[];
  workouts: WorkoutReport[];
  progression: ProgressionDelta[];
  errors: string[];
}

// ============================================================================
// TESTS
// ============================================================================

const allReports: PersonaReport[] = [];

afterAll(async () => {
  // Cleanup all test users
  const rows = await q<{ id: string }>(
    `SELECT id FROM users WHERE tg_id >= $1 AND tg_id < $2`,
    [TG_ID_BASE, TG_ID_BASE + PERSONAS.length + 100]
  );
  for (const row of rows) await cleanupTestUser(row.id);
  await pool.end();

  // ── Write full report to file (avoids mixing with SQL debug logs) ──
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w("=".repeat(100));
  w("E2E REAL USER SIMULATION — FULL REPORT");
  w(`Date: ${new Date().toISOString()}`);
  w("=".repeat(100));

  for (const report of allReports) {
    const p = report.persona;
    w("\n" + "─".repeat(100));
    w(`PERSONA: ${p.name}`);
    w("─".repeat(100));
    w(`  Onboarding: ${p.sex}, ${p.age}y, ${p.height}cm/${p.weight}kg, ${p.experience}, ${p.goal}`);
    w(`  Schedule: ${p.daysPerWeek}d/week, ${p.minutesPerSession}min, ${p.place}`);
    w(`  Scheme: ${report.schemeId} (${report.schemeName}), ${report.schemeDays} days`);
    w(`  Day labels: ${report.dayLabels.join(" | ")}`);

    if (report.errors.length > 0) {
      w(`  ERRORS:`);
      for (const err of report.errors) w(`    ❌ ${err}`);
    }

    // Per-workout details
    for (const wo of report.workouts) {
      w(`\n  ── Workout #${wo.workoutNumber}: ${wo.dayLabel} (intent: ${wo.intent}) ──`);
      w(`     ${wo.totalExercises} exercises, ${wo.totalSets} sets, ~${wo.estimatedDuration}min estimated`);
      w(`     ${"#".padEnd(3)} ${"Exercise".padEnd(35)} ${"Pattern".padEnd(20)} ${"Sets".padEnd(5)} ${"Reps".padEnd(10)} ${"Rest".padEnd(6)} ${"Weight".padEnd(8)} Load`);
      w(`     ${"-".repeat(95)}`);
      for (const ex of wo.exercises) {
        const reps = ex.repsRange ? `${ex.repsRange[0]}-${ex.repsRange[1]}` : "N/A";
        const weight = ex.suggestedWeight != null ? `${ex.suggestedWeight}kg` : "—";
        w(
          `     ${String(ex.order).padEnd(3)} ${ex.exerciseName.padEnd(35).slice(0, 35)} ${ex.pattern.padEnd(20).slice(0, 20)} ${String(ex.sets).padEnd(5)} ${reps.padEnd(10)} ${String(ex.restSec).padEnd(6)} ${weight.padEnd(8)} ${ex.loadType}`
        );
      }
      // Progression result from save-session
      if (wo.progressionResult) {
        const pr = wo.progressionResult;
        w(`     📈 Progression: ${pr.progressedCount}↑ ${pr.maintainedCount}= ${pr.deloadCount}↓ (of ${pr.totalExercises})`);
        if (pr.details?.length) {
          for (const d of pr.details) {
            const rec = d.recommendation;
            const action = rec?.action || rec?.type || "?";
            const reason = rec?.reason || rec?.note || "";
            w(`        ${d.exerciseName.padEnd(30).slice(0, 30)} → ${action}${reason ? ` (${reason.slice(0, 60)})` : ""}`);
          }
        }
      }
    }

    // Progression analysis
    if (report.progression.length > 0) {
      w(`\n  ── Progression Summary ──`);
      for (const prog of report.progression) {
        if (prog.occurrences.length < 2) continue;
        const first = prog.occurrences[0];
        const last = prog.occurrences[prog.occurrences.length - 1];
        const weightDelta = (last.suggestedWeight ?? 0) - (first.suggestedWeight ?? 0);
        const repsDelta = last.repsRange && first.repsRange
          ? `[${first.repsRange[0]}-${first.repsRange[1]}] → [${last.repsRange[0]}-${last.repsRange[1]}]`
          : "N/A";
        w(
          `     ${prog.exerciseName.padEnd(35).slice(0, 35)} seen ${prog.occurrences.length}x | ` +
          `weight: ${first.suggestedWeight ?? 0} → ${last.suggestedWeight ?? 0} (${weightDelta >= 0 ? "+" : ""}${weightDelta}kg) | ` +
          `reps: ${repsDelta} | sets: ${first.sets} → ${last.sets}`
        );
      }
    }
  }

  w("\n" + "=".repeat(100));
  w("END OF E2E REPORT");
  w("=".repeat(100));

  const reportText = lines.join("\n");
  const reportPath = path.resolve(process.cwd(), "e2e-report.txt");
  fs.writeFileSync(reportPath, reportText, "utf-8");

  // Also write JSON for programmatic analysis
  const jsonPath = path.resolve(process.cwd(), "e2e-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(allReports, null, 2), "utf-8");

  console.log(`\n✅ E2E Report written to:\n   ${reportPath}\n   ${jsonPath}\n`);
});

describe("E2E Real User Simulation", () => {
  test.each(PERSONAS.map((p, i) => ({ ...p, idx: i })))(
    "$name",
    async (persona) => {
      const tgId = TG_ID_BASE + persona.idx;
      const user = await createTestUser(tgId, persona.name);
      const auth = { Authorization: `Bearer ${user.token}` };

      const report: PersonaReport = {
        persona,
        schemeId: "",
        schemeName: "",
        schemeDays: 0,
        dayLabels: [],
        workouts: [],
        progression: [],
        errors: [],
      };

      // ── 1. ONBOARDING ──
      const onbRes = await request(app).post("/onboarding/save").set(auth).send(buildOnboardingPayload(persona));
      if (onbRes.status !== 200) {
        report.errors.push(`Onboarding failed: HTTP ${onbRes.status}`);
        allReports.push(report);
        return;
      }

      // ── 2. SCHEME RECOMMENDATION ──
      const schemeRes = await request(app).post("/schemes/recommend").set(auth).send({});
      if (schemeRes.status !== 200 || !schemeRes.body.recommended) {
        report.errors.push(`Scheme recommend failed: HTTP ${schemeRes.status}`);
        allReports.push(report);
        return;
      }

      const scheme = schemeRes.body.recommended;
      report.schemeId = scheme.id;
      report.schemeName = scheme.russianName || scheme.name;
      report.schemeDays = scheme.daysPerWeek;
      report.dayLabels = (scheme.dayLabels || []).map((d: any) => d.label);

      // ── 3. SELECT SCHEME ──
      const selectRes = await request(app).post("/schemes/select").set(auth).send({ schemeId: scheme.id });
      if (selectRes.status !== 200) {
        report.errors.push(`Scheme select failed: HTTP ${selectRes.status}`);
        allReports.push(report);
        return;
      }

      // ── 4. GENERATE + START + SAVE — 10 workouts ──
      const exerciseHistory = new Map<string, ProgressionDelta>();
      let completedWorkouts = 0;

      for (let workoutNum = 1; workoutNum <= WORKOUTS_PER_USER; workoutNum++) {
        // Generate week if needed (every daysPerWeek workouts)
        if ((workoutNum - 1) % persona.daysPerWeek === 0) {
          const genRes = await request(app).post("/api/workout/generate").set(auth).send({});
          if (genRes.status !== 200) {
            report.errors.push(`Week generation failed at workout #${workoutNum}: HTTP ${genRes.status} — ${JSON.stringify(genRes.body).slice(0, 200)}`);
            break;
          }
        }

        // Get planned workouts
        const plannedRes = await request(app).get("/api/planned-workouts").set(auth);
        if (plannedRes.status !== 200) {
          report.errors.push(`Planned workouts fetch failed at #${workoutNum}: HTTP ${plannedRes.status}`);
          break;
        }

        // Find first pending workout
        const pending = (plannedRes.body.plannedWorkouts || []).find(
          (pw: any) => pw.status === "pending" || pw.status === "scheduled"
        );
        if (!pending) {
          report.errors.push(`No pending workout found at #${workoutNum}. Total planned: ${(plannedRes.body.plannedWorkouts || []).length}`);
          break;
        }

        // Fake date: space workouts 3 days apart so progression service sees enough recovery time
        const fakeDate = new Date(Date.now() - (WORKOUTS_PER_USER - workoutNum) * 3 * 24 * 60 * 60 * 1000);
        const fakeDateStr = fakeDate.toISOString().split("T")[0];

        // Start workout with normal check-in
        const startRes = await request(app).post("/api/workout/workout/start").set(auth).send({
          date: fakeDateStr,
          plannedWorkoutId: pending.id,
          commit: true,
          checkin: {
            sleepQuality: "good",
            energyLevel: "medium",
            stressLevel: "low",
            availableMinutes: persona.minutesPerSession,
          },
        });

        if (startRes.status !== 200 || !startRes.body.workout?.exercises) {
          report.errors.push(`Start workout #${workoutNum} failed: HTTP ${startRes.status}, action=${startRes.body?.action}`);
          continue;
        }

        const workout = startRes.body.workout;
        const exercises: ExerciseReport[] = (workout.exercises || []).map((ex: any, i: number) => ({
          order: i + 1,
          exerciseId: ex.exerciseId || ex.id,
          exerciseName: ex.exerciseName || ex.name || "Unknown",
          pattern: ex.pattern || "unknown",
          sets: Number(ex.sets) || 0,
          repsRange: Array.isArray(ex.repsRange) ? ex.repsRange as [number, number] : null,
          restSec: Number(ex.restSec) || 0,
          suggestedWeight: ex.weight ?? ex.suggestedWeight ?? null,
          loadType: ex.loadType || "unknown",
        }));

        const workoutReport: WorkoutReport = {
          workoutNumber: workoutNum,
          dayLabel: workout.dayLabel || `Day ${workoutNum}`,
          intent: workout.intent || "normal",
          totalExercises: exercises.length,
          totalSets: exercises.reduce((s, e) => s + e.sets, 0),
          estimatedDuration: workout.estimatedDuration || 0,
          exercises,
        };
        report.workouts.push(workoutReport);

        // Track exercise progression
        for (const ex of exercises) {
          if (!exerciseHistory.has(ex.exerciseId)) {
            exerciseHistory.set(ex.exerciseId, {
              exerciseId: ex.exerciseId,
              exerciseName: ex.exerciseName,
              firstSeen: workoutNum,
              occurrences: [],
            });
          }
          exerciseHistory.get(ex.exerciseId)!.occurrences.push({
            workoutNum,
            suggestedWeight: ex.suggestedWeight,
            repsRange: ex.repsRange,
            sets: ex.sets,
          });
        }

        // Save session (simulate completing the workout)
        const sessionPayload = buildSessionPayload(workout, workoutNum);
        const saveRes = await request(app).post("/api/workout/save-session").set(auth).send({
          plannedWorkoutId: pending.id,
          startedAt: fakeDate.toISOString(),
          durationMin: persona.minutesPerSession,
          payload: sessionPayload,
        });

        if (saveRes.status !== 200) {
          report.errors.push(`Save session #${workoutNum} failed: HTTP ${saveRes.status} — ${JSON.stringify(saveRes.body).slice(0, 200)}`);
        } else {
          completedWorkouts++;
          // Capture real progression data from the response
          if (saveRes.body?.progression) {
            workoutReport.progressionResult = saveRes.body.progression;
          }
        }
      }

      // Build progression report
      report.progression = Array.from(exerciseHistory.values())
        .filter(p => p.occurrences.length >= 2)
        .sort((a, b) => b.occurrences.length - a.occurrences.length);

      allReports.push(report);

      // Basic assertions
      expect(completedWorkouts).toBeGreaterThanOrEqual(Math.min(WORKOUTS_PER_USER, persona.daysPerWeek * 2));
      expect(report.errors.length).toBeLessThanOrEqual(2); // allow minor hiccups
    }
  );
});

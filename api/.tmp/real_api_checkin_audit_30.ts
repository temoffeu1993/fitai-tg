import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { computeReadiness } from '/Users/artemryzih/Desktop/fitai-tg/api/src/readiness.ts';
import { EXERCISE_LIBRARY } from '/Users/artemryzih/Desktop/fitai-tg/api/src/exerciseLibrary.ts';

dotenv.config({ path: '/Users/artemryzih/Desktop/fitai-tg/api/.env' });

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8080';
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL || process.env.RENDER_DATABASE_URL;

if (!JWT_SECRET) throw new Error('JWT_SECRET is missing');
if (!DATABASE_URL) throw new Error('DATABASE_URL is missing');

const { Client } = pg;

const libById = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));

type Experience = 'beginner' | 'intermediate' | 'advanced';
type Goal = 'lose_weight' | 'build_muscle' | 'athletic_body' | 'health_wellness';
type Location = 'gym' | 'home_no_equipment' | 'home_with_gear';
type Sex = 'male' | 'female';

type Profile = {
  id: string;
  tgId: string;
  username: string;
  firstName: string;
  sex: Sex;
  age: number;
  height: number;
  weight: number;
  experience: Experience;
  goal: Goal;
  location: Location;
  daysPerWeek: number;
  minutesPerSession: 45 | 60 | 90;
};

type PlannedRow = {
  id: string;
  workout_date: string;
  status: string;
  data: any;
  plan: any;
  base_plan: any;
};

const UI = {
  experiences: ['beginner', 'intermediate', 'advanced'] as Experience[],
  goals: ['lose_weight', 'build_muscle', 'athletic_body', 'health_wellness'] as Goal[],
  locations: ['gym', 'home_no_equipment', 'home_with_gear'] as Location[],
  days: [2, 3, 4, 5, 6],
  minutes: [45, 60, 90] as const,
  sexes: ['male', 'female'] as Sex[],
};

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const round1 = (n: number) => Math.round(n * 10) / 10;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeToken(uid: string, tg: string) {
  return jwt.sign({ uid, tg }, JWT_SECRET as string, { expiresIn: '2d' });
}

async function api(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

function determineDayType(labelRaw: string, focusRaw: string, daysPerWeek?: number): string {
  const label = String(labelRaw || '').toLowerCase();
  const focus = String(focusRaw || '').toLowerCase();

  if (label.includes('push') || focus.includes('chest') || focus.includes('shoulder') || focus.includes('груд') || focus.includes('плеч')) return 'push';
  if (label.includes('pull') || focus.includes('back') || focus.includes('спин')) return 'pull';
  if (label.includes('legs') || label.includes('ног') || focus.includes('legs') || focus.includes('ног')) return 'legs';
  if (label.includes('upper') || label.includes('верх')) return 'upper';
  if (label.includes('lower') || label.includes('низ')) return 'lower';
  if (label.includes('full') || label.includes('всё тело') || (typeof daysPerWeek === 'number' && daysPerWeek <= 3)) return 'full_body';
  return 'unknown';
}

function extractWorkout(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  const exs = Array.isArray(raw.exercises) ? raw.exercises : [];
  const exercises = exs
    .map((ex: any) => {
      const id = ex?.exerciseId || ex?.id || ex?.exercise?.id || null;
      if (!id || typeof id !== 'string') return null;
      const lib = libById.get(id);
      const name = ex?.exerciseName || ex?.name || ex?.exercise?.name || lib?.name || id;
      const patterns = Array.isArray(ex?.patterns)
        ? ex.patterns.map((p: any) => String(p))
        : ex?.pattern
        ? [String(ex.pattern)]
        : Array.isArray(lib?.patterns)
        ? lib.patterns.map((p) => String(p))
        : [];
      const sets = Number(ex?.sets) || 0;
      const restSec = Number(ex?.restSec) || 0;
      const loadType = String(ex?.loadType || '').toLowerCase() || null;
      const w = Number(ex?.weight);
      const weight = Number.isFinite(w) && w > 0 ? w : null;
      return { id, name, patterns, sets, restSec, loadType, weight };
    })
    .filter(Boolean) as Array<{ id: string; name: string; patterns: string[]; sets: number; restSec: number; loadType: string | null; weight: number | null }>;

  const totalSets = Number(raw.totalSets) || exercises.reduce((s, e) => s + (Number(e.sets) || 0), 0);
  const estimatedDuration = Number(raw.estimatedDuration);
  const duration = Number.isFinite(estimatedDuration) && estimatedDuration >= 0 ? estimatedDuration : null;

  return {
    dayLabel: String(raw.dayLabel || ''),
    dayFocus: String(raw.dayFocus || ''),
    intent: raw.intent ? String(raw.intent) : null,
    totalExercises: Number(raw.totalExercises) || exercises.length,
    totalSets,
    estimatedDuration: duration,
    exercises,
  };
}

function diffWorkouts(before: any, after: any) {
  if (!before || !after) return null;

  const b = new Map(before.exercises.map((e: any) => [e.id, e]));
  const a = new Map(after.exercises.map((e: any) => [e.id, e]));

  const added = [...a.keys()].filter((id) => !b.has(id));
  const removed = [...b.keys()].filter((id) => !a.has(id));
  const common = [...a.keys()].filter((id) => b.has(id));

  const weightDeltas: number[] = [];
  for (const id of common) {
    const be = b.get(id);
    const ae = a.get(id);
    if (!be || !ae) continue;
    if (be.weight != null && ae.weight != null && be.loadType === 'external' && ae.loadType === 'external') {
      weightDeltas.push(ae.weight - be.weight);
    }
  }

  const avgWeightDelta = weightDeltas.length > 0 ? round1(weightDeltas.reduce((s, x) => s + x, 0) / weightDeltas.length) : null;

  return {
    addedIds: added,
    removedIds: removed,
    addedNames: added.map((id) => a.get(id)?.name || id),
    removedNames: removed.map((id) => b.get(id)?.name || id),
    addedCount: added.length,
    removedCount: removed.length,
    totalSetsDelta: (after.totalSets || 0) - (before.totalSets || 0),
    estimatedDurationDelta:
      typeof after.estimatedDuration === 'number' && typeof before.estimatedDuration === 'number'
        ? after.estimatedDuration - before.estimatedDuration
        : null,
    weightChangedExerciseCount: weightDeltas.length,
    avgExternalWeightDelta: avgWeightDelta,
  };
}

function quietReadiness(checkinPayload: any, fallbackTimeBucket: 45 | 60 | 90) {
  const origLog = console.log;
  const origWarn = console.warn;
  try {
    console.log = () => {};
    console.warn = () => {};
    return computeReadiness({
      checkin: {
        sleep: checkinPayload.sleepQuality,
        energy: checkinPayload.energyLevel,
        stress: checkinPayload.stressLevel,
        pain: checkinPayload.pain,
        availableMinutes: checkinPayload.availableMinutes,
      },
      fallbackTimeBucket,
    });
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
}

function evaluateSafety(afterWorkout: any, readiness: any) {
  if (!afterWorkout) {
    return {
      blockedViolations: [] as string[],
      avoidViolations: [] as string[],
    };
  }

  const blocked = new Set((readiness?.blockedPatterns || []).map((x: any) => String(x).toLowerCase()));
  const avoid = new Set((readiness?.avoidFlags || []).map((x: any) => String(x)));

  const presentPatterns = new Set<string>();
  const avoidViolations: string[] = [];

  for (const ex of afterWorkout.exercises || []) {
    const pats = Array.isArray(ex.patterns) ? ex.patterns : [];
    for (const p of pats) presentPatterns.add(String(p).toLowerCase());

    const lib = libById.get(ex.id);
    const flags = lib?.jointFlags || [];
    if (flags.some((f) => avoid.has(String(f)))) {
      avoidViolations.push(ex.name);
    }
  }

  const blockedViolations = [...blocked].filter((p) => presentPatterns.has(p));
  return { blockedViolations, avoidViolations };
}

function summaryQuality(summary: any) {
  const bullets = Array.isArray(summary?.changeNotes) ? summary.changeNotes : [];
  const hasWhat = Boolean(clean(String(summary?.whatChanged || '')));
  const hasWhy = Boolean(clean(String(summary?.why || '')));
  const hasHow = Boolean(clean(String(summary?.howToTrainToday || '')));
  return {
    hasWhat,
    hasWhy,
    hasHow,
    bulletCount: bullets.length,
    pass: hasWhat && hasWhy && hasHow,
  };
}

function coachVerdict(args: {
  action: string;
  readiness: any;
  diff: any;
  safety: { blockedViolations: string[]; avoidViolations: string[] };
  summaryQ: any;
  scenario: string;
  availableMinutes: number;
  afterDuration: number | null;
}) {
  const issues: string[] = [];
  let score = 100;

  if (args.safety.blockedViolations.length > 0) {
    issues.push(`blocked patterns in final workout: ${args.safety.blockedViolations.join(', ')}`);
    score -= 45;
  }
  if (args.safety.avoidViolations.length > 0) {
    issues.push(`avoid flags violated by exercises: ${args.safety.avoidViolations.join(', ')}`);
    score -= 40;
  }
  if (args.readiness?.severity === 'critical' && args.action !== 'skip') {
    issues.push('critical readiness but action is not skip');
    score -= 35;
  }
  if (args.scenario === 'time_45_ui' && typeof args.afterDuration === 'number' && args.afterDuration > args.availableMinutes + 10) {
    issues.push(`time cap exceeded: ${args.afterDuration} > ${args.availableMinutes}+10`);
    score -= 20;
  }
  const painMax = Array.isArray(args.readiness?.painByLocation)
    ? 0
    : Math.max(0, Number(args.readiness?.maxPainLevel || 0));
  if (painMax >= 7 && args.action === 'keep_day' && args.diff && (args.diff.addedCount + args.diff.removedCount === 0)) {
    issues.push('high pain but keep_day without exercise substitution');
    score -= 18;
  }
  if (!args.summaryQ.pass) {
    issues.push('summary lacks what/why/how blocks');
    score -= 12;
  }

  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
  return { score: Math.max(0, score), grade, issues, professional: issues.length === 0 };
}

function equipmentItemsForLocation(location: Location) {
  if (location === 'gym') return ['machines'];
  if (location === 'home_no_equipment') return ['bodyweight'];
  return ['dumbbells', 'bands'];
}

function buildProfiles(limit = 30): Profile[] {
  const ages = [19, 23, 27, 31, 35, 39, 43, 47, 51, 55, 59];
  const bmiTargets = [20.5, 23.5, 26.5, 29.5, 32.5, 34.0];
  const hMale = [168, 173, 178, 183, 188];
  const hFemale = [156, 161, 166, 171, 176];

  const out: Profile[] = [];
  let idx = 0;

  for (const goal of UI.goals) {
    for (const experience of UI.experiences) {
      for (const location of UI.locations) {
        for (const daysPerWeek of UI.days) {
          for (const minutesPerSession of UI.minutes) {
            const sex = UI.sexes[idx % UI.sexes.length];
            const age = ages[idx % ages.length];
            const hArr = sex === 'male' ? hMale : hFemale;
            const height = hArr[(idx + 1) % hArr.length];
            const bmi = bmiTargets[(idx + 2) % bmiTargets.length];
            const weight = round1(bmi * (height / 100) * (height / 100));
            const id = crypto.randomUUID();
            const username = `audit30_${String(out.length + 1).padStart(2, '0')}_${Date.now().toString().slice(-5)}`;
            out.push({
              id,
              tgId: `audit_tg_${out.length + 1}_${Date.now()}`,
              username,
              firstName: `Audit${out.length + 1}`,
              sex,
              age,
              height,
              weight,
              experience,
              goal,
              location,
              daysPerWeek,
              minutesPerSession,
            });
            idx += 1;
            if (out.length >= limit) return out;
          }
        }
      }
    }
  }
  return out;
}

function scenarioForTarget(dayType: string, fallbackMinutes: number) {
  if (dayType === 'push' || dayType === 'upper') {
    return {
      name: 'target_block_push_upper',
      checkin: {
        sleepQuality: 'fair',
        energyLevel: 'medium',
        stressLevel: 'high',
        availableMinutes: 45,
        pain: [{ location: 'shoulder', level: 7 }],
      },
    };
  }
  if (dayType === 'legs' || dayType === 'lower') {
    return {
      name: 'target_block_legs_lower',
      checkin: {
        sleepQuality: 'good',
        energyLevel: 'medium',
        stressLevel: 'low',
        availableMinutes: 45,
        pain: [{ location: 'knee', level: 7 }],
      },
    };
  }
  return {
    name: 'target_fullbody_safety',
    checkin: {
      sleepQuality: 'fair',
      energyLevel: 'medium',
      stressLevel: 'medium',
      availableMinutes: fallbackMinutes,
      pain: [{ location: 'shoulder', level: 6 }],
    },
  };
}

function chooseTargetRow(rows: PlannedRow[]) {
  const withType = rows.map((r) => {
    const raw = (r.data ?? r.plan ?? {}) as any;
    return {
      row: r,
      dayType: determineDayType(raw?.dayLabel, raw?.dayFocus),
    };
  });

  const preferred = withType.find((x) => ['push', 'upper', 'legs', 'lower'].includes(x.dayType));
  if (preferred) return preferred;
  return withType[0] || null;
}

async function main() {
  const startedAt = new Date().toISOString();
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const profiles = buildProfiles(30);

  await client.connect();

  // cleanup previous audit users (safe prefix)
  await client.query(`DELETE FROM users WHERE username LIKE 'audit30_%'`);

  const actionCount: Record<string, number> = { keep_day: 0, swap_day: 0, recovery: 0, skip: 0 };
  const issues = {
    blockedPatternViolation: 0,
    avoidFlagViolation: 0,
    criticalSeverityPolicyViolation: 0,
    overTimeViolation: 0,
    summaryQualityViolation: 0,
    highPainNoAdjustment: 0,
  };

  const runs: any[] = [];
  const users: any[] = [];

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];

    await client.query(
      `INSERT INTO users(id, tg_id, first_name, username)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (id)
       DO UPDATE SET tg_id=EXCLUDED.tg_id, first_name=EXCLUDED.first_name, username=EXCLUDED.username, updated_at=NOW()`,
      [p.id, p.tgId, p.firstName, p.username]
    );

    const token = makeToken(p.id, p.tgId);

    const onboardingPayload = {
      data: {
        ageSex: { sex: p.sex, age: p.age },
        body: { height: p.height, weight: p.weight },
        schedule: { daysPerWeek: p.daysPerWeek, minutesPerSession: p.minutesPerSession },
        experience: p.experience,
        trainingPlace: { place: p.location },
        equipmentItems: equipmentItemsForLocation(p.location),
        goals: { primary: p.goal },
        motivation: { goal: p.goal },
      },
    };

    await api('/onboarding/save', token, { method: 'POST', body: JSON.stringify(onboardingPayload) });
    const rec = await api('/schemes/recommend', token, { method: 'POST', body: JSON.stringify({}) });
    const recommended = rec?.recommended;
    if (!recommended?.id) {
      throw new Error(`No recommended scheme for profile ${p.id}`);
    }
    await api('/schemes/select', token, { method: 'POST', body: JSON.stringify({ schemeId: recommended.id }) });

    users.push({
      id: p.id,
      username: p.username,
      profile: {
        sex: p.sex,
        age: p.age,
        height: p.height,
        weight: p.weight,
        experience: p.experience,
        goal: p.goal,
        location: p.location,
        daysPerWeek: p.daysPerWeek,
        minutesPerSession: p.minutesPerSession,
      },
      scheme: {
        id: recommended.id,
        name: recommended.russianName || recommended.name,
        splitType: recommended.splitType,
      },
    });

    const baseScenarios = [
      {
        name: 'neutral_ui',
        checkin: {
          sleepQuality: 'good',
          energyLevel: 'medium',
          stressLevel: 'low',
          availableMinutes: p.minutesPerSession,
          pain: [],
        },
      },
      {
        name: 'time_45_ui',
        checkin: {
          sleepQuality: 'ok',
          energyLevel: 'medium',
          stressLevel: 'medium',
          availableMinutes: 45,
          pain: [],
        },
      },
      {
        name: 'critical_combo_ui',
        checkin: {
          sleepQuality: 'poor',
          energyLevel: 'low',
          stressLevel: 'very_high',
          availableMinutes: 45,
          pain: [
            { location: 'knee', level: 8 },
            { location: 'shoulder', level: 8 },
          ],
        },
      },
    ];

    for (const sc of baseScenarios) {
      await api('/plan/generate', token, { method: 'POST', body: JSON.stringify({ force: true }) });
      const rowsRes = await client.query(
        `SELECT id, workout_date::text AS workout_date, status, data, plan, base_plan
         FROM planned_workouts
         WHERE user_id = $1
           AND status IN ('pending','scheduled')
         ORDER BY workout_date ASC, updated_at DESC`,
        [p.id]
      );
      const rows = rowsRes.rows as PlannedRow[];
      if (rows.length === 0) continue;
      const target = rows[0];

      const beforeRaw = (target.base_plan ?? target.plan ?? target.data) as any;
      const before = extractWorkout(beforeRaw);
      const dayType = determineDayType(before?.dayLabel || '', before?.dayFocus || '', p.daysPerWeek);

      const resp = await api('/plan/workout/start', token, {
        method: 'POST',
        body: JSON.stringify({
          date: target.workout_date,
          plannedWorkoutId: target.id,
          checkin: sc.checkin,
        }),
      });

      const afterRowRes = await client.query(
        `SELECT id, workout_date::text AS workout_date, status, data, plan, base_plan
         FROM planned_workouts WHERE id = $1 LIMIT 1`,
        [target.id]
      );
      const afterRow = afterRowRes.rows[0] as PlannedRow;
      const afterRaw = (resp?.workout ?? afterRow?.data ?? afterRow?.plan ?? null) as any;
      const after = extractWorkout(afterRaw);
      const diff = diffWorkouts(before, after);

      const readiness = quietReadiness(sc.checkin, p.minutesPerSession);
      const safety = evaluateSafety(after, readiness);
      const summaryQ = summaryQuality(resp?.summary || {});

      if (safety.blockedViolations.length > 0) issues.blockedPatternViolation += 1;
      if (safety.avoidViolations.length > 0) issues.avoidFlagViolation += 1;
      if (readiness?.severity === 'critical' && resp?.action !== 'skip') issues.criticalSeverityPolicyViolation += 1;
      if (sc.name === 'time_45_ui' && typeof after?.estimatedDuration === 'number' && after.estimatedDuration > 55) issues.overTimeViolation += 1;
      if (!summaryQ.pass) issues.summaryQualityViolation += 1;

      const highPain = Array.isArray(sc.checkin.pain) && sc.checkin.pain.some((x: any) => Number(x.level) >= 7);
      if (
        highPain &&
        resp?.action === 'keep_day' &&
        diff &&
        diff.addedCount + diff.removedCount === 0 &&
        (!diff.weightChangedExerciseCount || diff.avgExternalWeightDelta == null || diff.avgExternalWeightDelta >= 0)
      ) {
        issues.highPainNoAdjustment += 1;
      }

      actionCount[String(resp?.action || 'keep_day')] = (actionCount[String(resp?.action || 'keep_day')] || 0) + 1;

      const verdict = coachVerdict({
        action: String(resp?.action || ''),
        readiness,
        diff,
        safety,
        summaryQ,
        scenario: sc.name,
        availableMinutes: Number(sc.checkin.availableMinutes || p.minutesPerSession),
        afterDuration: after?.estimatedDuration ?? null,
      });

      runs.push({
        userId: p.id,
        username: p.username,
        schemeId: recommended.id,
        scenario: sc.name,
        request: sc.checkin,
        action: resp?.action,
        day: {
          date: target.workout_date,
          dayLabel: before?.dayLabel,
          dayFocus: before?.dayFocus,
          dayType,
        },
        readiness: {
          severity: readiness?.severity,
          intent: readiness?.intent,
          blockedPatterns: readiness?.blockedPatterns || [],
          avoidFlags: readiness?.avoidFlags || [],
        },
        before: {
          totalExercises: before?.totalExercises ?? null,
          totalSets: before?.totalSets ?? null,
          estimatedDuration: before?.estimatedDuration ?? null,
        },
        after: {
          totalExercises: after?.totalExercises ?? null,
          totalSets: after?.totalSets ?? null,
          estimatedDuration: after?.estimatedDuration ?? null,
        },
        diff,
        safety,
        summary: {
          whatChanged: resp?.summary?.whatChanged || null,
          why: resp?.summary?.why || null,
          howToTrainToday: resp?.summary?.howToTrainToday || null,
          quality: summaryQ,
        },
        coachVerdict: verdict,
      });

      await sleep(80);
    }

    // targeted scenario on most informative day type
    await api('/plan/generate', token, { method: 'POST', body: JSON.stringify({ force: true }) });
    const targetedRowsRes = await client.query(
      `SELECT id, workout_date::text AS workout_date, status, data, plan, base_plan
       FROM planned_workouts
       WHERE user_id = $1
         AND status IN ('pending','scheduled')
       ORDER BY workout_date ASC, updated_at DESC`,
      [p.id]
    );
    const targetedRows = targetedRowsRes.rows as PlannedRow[];
    const pick = chooseTargetRow(targetedRows);
    if (pick) {
      const targetRow = pick.row;
      const targetScenario = scenarioForTarget(pick.dayType, p.minutesPerSession);

      const beforeRaw = (targetRow.base_plan ?? targetRow.plan ?? targetRow.data) as any;
      const before = extractWorkout(beforeRaw);
      const dayType = determineDayType(before?.dayLabel || '', before?.dayFocus || '', p.daysPerWeek);

      const resp = await api('/plan/workout/start', token, {
        method: 'POST',
        body: JSON.stringify({
          date: targetRow.workout_date,
          plannedWorkoutId: targetRow.id,
          checkin: targetScenario.checkin,
        }),
      });

      const afterRowRes = await client.query(
        `SELECT id, workout_date::text AS workout_date, status, data, plan, base_plan
         FROM planned_workouts WHERE id = $1 LIMIT 1`,
        [targetRow.id]
      );
      const afterRow = afterRowRes.rows[0] as PlannedRow;
      const afterRaw = (resp?.workout ?? afterRow?.data ?? afterRow?.plan ?? null) as any;
      const after = extractWorkout(afterRaw);
      const diff = diffWorkouts(before, after);

      const readiness = quietReadiness(targetScenario.checkin, p.minutesPerSession);
      const safety = evaluateSafety(after, readiness);
      const summaryQ = summaryQuality(resp?.summary || {});

      if (safety.blockedViolations.length > 0) issues.blockedPatternViolation += 1;
      if (safety.avoidViolations.length > 0) issues.avoidFlagViolation += 1;
      if (readiness?.severity === 'critical' && resp?.action !== 'skip') issues.criticalSeverityPolicyViolation += 1;
      if (!summaryQ.pass) issues.summaryQualityViolation += 1;

      const highPain = Array.isArray(targetScenario.checkin.pain) && targetScenario.checkin.pain.some((x: any) => Number(x.level) >= 7);
      if (
        highPain &&
        resp?.action === 'keep_day' &&
        diff &&
        diff.addedCount + diff.removedCount === 0 &&
        (!diff.weightChangedExerciseCount || diff.avgExternalWeightDelta == null || diff.avgExternalWeightDelta >= 0)
      ) {
        issues.highPainNoAdjustment += 1;
      }

      actionCount[String(resp?.action || 'keep_day')] = (actionCount[String(resp?.action || 'keep_day')] || 0) + 1;

      const verdict = coachVerdict({
        action: String(resp?.action || ''),
        readiness,
        diff,
        safety,
        summaryQ,
        scenario: targetScenario.name,
        availableMinutes: Number(targetScenario.checkin.availableMinutes || p.minutesPerSession),
        afterDuration: after?.estimatedDuration ?? null,
      });

      runs.push({
        userId: p.id,
        username: p.username,
        schemeId: recommended.id,
        scenario: targetScenario.name,
        request: targetScenario.checkin,
        action: resp?.action,
        day: {
          date: targetRow.workout_date,
          dayLabel: before?.dayLabel,
          dayFocus: before?.dayFocus,
          dayType,
        },
        readiness: {
          severity: readiness?.severity,
          intent: readiness?.intent,
          blockedPatterns: readiness?.blockedPatterns || [],
          avoidFlags: readiness?.avoidFlags || [],
        },
        before: {
          totalExercises: before?.totalExercises ?? null,
          totalSets: before?.totalSets ?? null,
          estimatedDuration: before?.estimatedDuration ?? null,
        },
        after: {
          totalExercises: after?.totalExercises ?? null,
          totalSets: after?.totalSets ?? null,
          estimatedDuration: after?.estimatedDuration ?? null,
        },
        diff,
        safety,
        summary: {
          whatChanged: resp?.summary?.whatChanged || null,
          why: resp?.summary?.why || null,
          howToTrainToday: resp?.summary?.howToTrainToday || null,
          quality: summaryQ,
        },
        coachVerdict: verdict,
      });
    }

    console.log(`[${i + 1}/${profiles.length}] done user=${p.username} scheme=${recommended.id}`);
  }

  const qualityPass = runs.filter((r) => r.summary?.quality?.pass).length;

  const totals = {
    users: users.length,
    runs: runs.length,
    actionCount,
    issues,
    summaryPassRate: `${qualityPass}/${runs.length}`,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'real_api_e2e',
    apiBase: API_BASE,
    totals,
    users,
    runs,
  };

  const outJson = '/tmp/real_api_checkin_audit_30_report.json';
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

  const topBad = [...runs]
    .sort((a, b) => (a.coachVerdict.score ?? 0) - (b.coachVerdict.score ?? 0))
    .slice(0, 12)
    .map((r) => ({
      user: r.username,
      scenario: r.scenario,
      action: r.action,
      score: r.coachVerdict.score,
      issues: r.coachVerdict.issues,
      day: r.day,
      diff: r.diff,
    }));

  const summaryMd = [
    `# Real API Check-in Audit (30 users)`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Runs: ${totals.runs}`,
    `Users: ${totals.users}`,
    ``,
    `## Action count`,
    `- keep_day: ${totals.actionCount.keep_day || 0}`,
    `- swap_day: ${totals.actionCount.swap_day || 0}`,
    `- recovery: ${totals.actionCount.recovery || 0}`,
    `- skip: ${totals.actionCount.skip || 0}`,
    ``,
    `## Safety issues`,
    `- blockedPatternViolation: ${totals.issues.blockedPatternViolation}`,
    `- avoidFlagViolation: ${totals.issues.avoidFlagViolation}`,
    `- criticalSeverityPolicyViolation: ${totals.issues.criticalSeverityPolicyViolation}`,
    `- overTimeViolation: ${totals.issues.overTimeViolation}`,
    `- highPainNoAdjustment: ${totals.issues.highPainNoAdjustment}`,
    ``,
    `## Summary quality`,
    `- pass: ${totals.summaryPassRate}`,
    ``,
    `## Lowest score examples`,
    ...topBad.map((x, i) => `${i + 1}. ${x.user} | ${x.scenario} | ${x.action} | score=${x.score} | issues=${(x.issues || []).join('; ') || 'none'}`),
    ``,
    `JSON report: ${outJson}`,
  ].join('\n');

  const outMd = '/tmp/real_api_checkin_audit_30_summary.md';
  fs.writeFileSync(outMd, summaryMd);

  // cleanup test users after run to avoid polluting DB
  await client.query(`DELETE FROM users WHERE username LIKE 'audit30_%'`);

  await client.end();

  console.log(JSON.stringify({ outJson, outMd, totals }, null, 2));
}

main().catch((err) => {
  console.error('FAILED real api audit:', err);
  process.exit(1);
});

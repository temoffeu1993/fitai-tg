import {
  buildSummaryPayload,
  computeWorkoutSummaryDiff,
  type SummaryChangeMeta,
  type WorkoutStartAction,
} from "./checkinSummary.js";
import { decideStartAction } from "./checkinPolicy.js";
import { computeReadiness } from "./readiness.js";
import {
  generateRecoverySession,
  generateWorkoutDay,
  type CheckInData,
  type GeneratedWorkoutDay,
  type UserProfile,
} from "./workoutDayGenerator.js";
import {
  getCandidateSchemes,
  rankSchemes,
  type Goal,
  type NormalizedWorkoutScheme,
  type SchemeUser,
} from "./normalizedSchemes.js";

function normalizeLine(line: string): string {
  return String(line || "")
    .toLowerCase()
    .replace(/[•\-–—]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDuplicateLines(lines: string[]): boolean {
  const normalized = lines.map(normalizeLine).filter(Boolean);
  return new Set(normalized).size !== normalized.length;
}

function hasManualWeightInstruction(lines: string[]): boolean {
  const text = lines.join(" ").toLowerCase();
  return (
    /(сниз(ь|ьте)|уменьш(и|ите)|сбрасывай|сбрасывайте).{0,24}вес/.test(text) ||
    /(добав(ь|ьте)|повыш(ай|айте)).{0,24}вес/.test(text)
  );
}

function assertFactsNarrativeConsistency(summary: any) {
  expect(summary?.facts).toBeDefined();
  const drivers: string[] = Array.isArray(summary?.facts?.adaptation?.drivers)
    ? summary.facts.adaptation.drivers
    : [];

  const narrativeText = [summary.whatChanged, summary.why, summary.howToTrainToday]
    .map((line: string) => String(line || ""))
    .join(" ")
    .toLowerCase();

  if (drivers.includes("time_limit")) {
    expect(narrativeText).toMatch(/врем|мин/);
  }
  if (drivers.includes("pain_safety")) {
    expect(narrativeText).toMatch(/боль|безопас|риск|дискомфорт/);
  }
  if (drivers.includes("no_change")) {
    expect(String(summary.whatChanged || "").toLowerCase()).toMatch(/без изменений|оставили/);
  }
  if (drivers.includes("swap_day")) {
    expect(String(summary.whatChanged || "").toLowerCase()).toMatch(/переставили|→/);
  }
}

function pickSchemeUser(): SchemeUser {
  return {
    experience: "intermediate",
    goal: "athletic_body",
    daysPerWeek: 3,
    timeBucket: 90,
    location: "gym",
    sex: "male",
    constraints: [],
    age: 31,
    bmi: 24,
  };
}

function toUserProfile(user: SchemeUser): UserProfile {
  return {
    experience: user.experience,
    goal: user.goal,
    daysPerWeek: user.daysPerWeek,
    timeBucket: user.timeBucket,
    location: user.location,
    sex: user.sex,
    constraints: user.constraints,
  };
}

type SimulatedStartResult = {
  action: WorkoutStartAction;
  summary: any;
  diff: ReturnType<typeof computeWorkoutSummaryDiff>;
};

async function simulateWorkoutStart(args: {
  scheme: NormalizedWorkoutScheme;
  userProfile: UserProfile;
  beforePlan: GeneratedWorkoutDay;
  checkin: CheckInData;
}): Promise<SimulatedStartResult> {
  const { scheme, userProfile, beforePlan, checkin } = args;
  const readiness = computeReadiness({
    checkin,
    fallbackTimeBucket: userProfile.timeBucket,
  });
  const decision = decideStartAction({
    scheme,
    dayIndex: 0,
    readiness,
  });

  let action: WorkoutStartAction = decision.action;
  let afterPlan: any = beforePlan;
  let swapInfo: { from?: string; to?: string } | null = null;

  if (decision.action === "skip") {
    afterPlan = {
      dayLabel: "Skip",
      totalExercises: 0,
      totalSets: 0,
      estimatedDuration: 0,
      exercises: [],
    };
  } else if (decision.action === "recovery") {
    afterPlan = generateRecoverySession({
      userProfile,
      painAreas: Array.isArray(checkin.pain) ? checkin.pain.map((p) => p.location) : [],
      availableMinutes: checkin.availableMinutes,
      blockedPatterns: readiness.blockedPatterns,
      avoidFlags: readiness.avoidFlags,
    });
  } else if (decision.action === "swap_day") {
    afterPlan = await generateWorkoutDay({
      scheme,
      dayIndex: decision.targetDayIndex,
      userProfile,
      readiness,
      history: { recentExerciseIds: [] },
    });
    swapInfo = {
      from: beforePlan.dayLabel,
      to: decision.targetDayLabel,
    };
  } else {
    afterPlan = await generateWorkoutDay({
      scheme,
      dayIndex: 0,
      userProfile,
      readiness,
      history: { recentExerciseIds: [] },
    });
  }

  const diff = computeWorkoutSummaryDiff({
    beforePlan,
    afterPlan,
    fallbackTimeBucket: userProfile.timeBucket,
  });

  const afterMeta: SummaryChangeMeta = (afterPlan as any)?.changeMeta || {};
  const summary = buildSummaryPayload({
    action,
    severity: readiness.severity,
    changeMeta: {
      ...afterMeta,
      safetyAdjusted:
        Boolean(afterMeta.safetyAdjusted) ||
        readiness.blockedPatterns.length > 0 ||
        readiness.avoidFlags.length > 0,
    },
    changeNotes: Array.isArray((afterPlan as any)?.changeNotes) ? (afterPlan as any).changeNotes : [],
    infoNotes: Array.isArray((afterPlan as any)?.infoNotes) ? (afterPlan as any).infoNotes : [],
    warnings: [
      ...(Array.isArray((afterPlan as any)?.warnings) ? (afterPlan as any).warnings : []),
      ...readiness.warnings,
    ],
    swapInfo: swapInfo || undefined,
    diff,
    checkin,
    readiness,
    onboardingMinutes: userProfile.timeBucket,
    beforePlan,
    afterPlan,
  });

  return { action, summary, diff };
}

describe("integration: /plan/workout/start narrative contract", () => {
  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  afterAll(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("facts -> narrative консистентны, без дублей и без ручных инструкций про снижение веса", async () => {
    const schemeUser = pickSchemeUser();
    const candidates = getCandidateSchemes(schemeUser);
    expect(candidates.length).toBeGreaterThan(0);
    const [scheme] = rankSchemes(schemeUser, candidates);
    const userProfile = toUserProfile(schemeUser);

    const baselineReadiness = computeReadiness({
      fallbackTimeBucket: userProfile.timeBucket,
    });
    const beforePlan = await generateWorkoutDay({
      scheme,
      dayIndex: 0,
      userProfile,
      readiness: baselineReadiness,
      history: { recentExerciseIds: [] },
    });

    const scenarios: Array<{ name: string; checkin: CheckInData }> = [
      {
        name: "low_recovery",
        checkin: { sleep: "poor", energy: "low", stress: "medium", pain: [], soreness: [], availableMinutes: 90 },
      },
      {
        name: "normal",
        checkin: { sleep: "ok", energy: "medium", stress: "medium", pain: [], soreness: [], availableMinutes: 90 },
      },
      {
        name: "high_readiness",
        checkin: { sleep: "excellent", energy: "high", stress: "low", pain: [], soreness: [], availableMinutes: 90 },
      },
      {
        name: "time_limited",
        checkin: { sleep: "ok", energy: "medium", stress: "medium", pain: [], soreness: [], availableMinutes: 60 },
      },
      {
        name: "pain_safety",
        checkin: {
          sleep: "ok",
          energy: "medium",
          stress: "medium",
          pain: [{ location: "shoulder", level: 7 }],
          soreness: [],
          availableMinutes: 90,
        },
      },
    ];

    for (const scenario of scenarios) {
      const result = await simulateWorkoutStart({
        scheme,
        userProfile,
        beforePlan,
        checkin: scenario.checkin,
      });

      assertFactsNarrativeConsistency(result.summary);

      const triplet = [
        String(result.summary.whatChanged || ""),
        String(result.summary.why || ""),
        String(result.summary.howToTrainToday || ""),
      ].filter(Boolean);
      expect(hasDuplicateLines(triplet)).toBe(false);

      const allUserFacingLines = [
        ...triplet,
        ...(Array.isArray(result.summary.changeNotes) ? result.summary.changeNotes : []),
        ...(Array.isArray(result.summary.infoNotes) ? result.summary.infoNotes : []),
        ...(Array.isArray(result.summary.warnings) ? result.summary.warnings : []),
      ]
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      expect(hasManualWeightInstruction(allUserFacingLines)).toBe(false);
    }
  });
});

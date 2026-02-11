import {
  buildSummaryPayload,
  computeWorkoutSummaryDiff,
  isSummaryTextContradiction,
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
  type ConstraintTag,
  type ExperienceLevel,
  type Goal,
  type Location,
  type NormalizedWorkoutScheme,
  type SchemeUser,
  type TimeBucket,
} from "./normalizedSchemes.js";

type ProfileCase = {
  id: string;
  scheme: NormalizedWorkoutScheme;
  userProfile: UserProfile;
  onboardingMinutes: TimeBucket;
};

type QualityMetrics = {
  totalRuns: number;
  summary_text_contradiction: number;
  duplicate_lines: number;
  unknown_jargon: number;
};

const UNKNOWN_JARGON_PATTERNS: RegExp[] = [
  /добивани/i,
  /главн(ых|ые)\s+подход/i,
  /\bRIR\b/i,
  /делоад|deload/i,
  /дропсет|drop\s*set/i,
  /суперсет|super\s*set/i,
];

function normalizeLine(line: string): string {
  return String(line || "")
    .toLowerCase()
    .replace(/[•\-–—]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDuplicateLines(lines: string[]): boolean {
  const norm = lines.map(normalizeLine).filter(Boolean);
  return new Set(norm).size !== norm.length;
}

function containsUnknownJargon(lines: string[]): boolean {
  const text = lines.join(" ");
  return UNKNOWN_JARGON_PATTERNS.some((rx) => rx.test(text));
}

function makeConstraints(age: number, bmi: number): ConstraintTag[] {
  const out: ConstraintTag[] = [];
  if (age >= 50) out.push("avoid_high_impact", "avoid_heavy_spinal_loading");
  if (bmi >= 30) out.push("avoid_high_impact");
  return Array.from(new Set(out));
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

function buildProfileMatrix(size: number): ProfileCase[] {
  const experiences: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];
  const goals: Goal[] = ["lose_weight", "build_muscle", "athletic_body", "health_wellness"];
  const days: Array<2 | 3 | 4 | 5> = [2, 3, 4, 5];
  const buckets: TimeBucket[] = [45, 60, 90];
  const locations: Location[] = ["gym", "home_with_gear", "home_no_equipment"];
  const sexes: Array<"male" | "female"> = ["male", "female"];

  const out: ProfileCase[] = [];
  let seed = 0;
  while (out.length < size && seed < 2000) {
    const exp = experiences[seed % experiences.length];
    const goal = goals[Math.floor(seed / experiences.length) % goals.length];
    const day = days[Math.floor(seed / (experiences.length * goals.length)) % days.length];
    const timeBucket = buckets[Math.floor(seed / (experiences.length * goals.length * days.length)) % buckets.length];
    const location =
      locations[Math.floor(seed / (experiences.length * goals.length * days.length * buckets.length)) % locations.length];
    const sex = sexes[Math.floor(seed / 7) % sexes.length];
    const age = 20 + (seed % 41);
    const bmi = 20 + ((seed * 3) % 15); // 20..34
    const constraints = makeConstraints(age, bmi);

    const user: SchemeUser = {
      experience: exp,
      goal,
      daysPerWeek: day,
      timeBucket,
      location,
      constraints,
      sex,
      age,
      bmi,
    };
    const candidates = getCandidateSchemes(user);
    if (candidates.length > 0) {
      const [scheme] = rankSchemes(user, candidates);
      out.push({
        id: `P${String(out.length + 1).padStart(2, "0")}`,
        scheme,
        userProfile: toUserProfile(user),
        onboardingMinutes: timeBucket,
      });
    }
    seed += 1;
  }
  return out;
}

function checkinsForProfile(onboardingMinutes: TimeBucket): CheckInData[] {
  const timeLimitedMinutes = onboardingMinutes === 90 ? 60 : onboardingMinutes === 60 ? 45 : 45;
  const base: CheckInData[] = [
    { sleep: "ok", energy: "medium", stress: "medium", pain: [], soreness: [] },
    { sleep: "poor", energy: "low", stress: "medium", pain: [], soreness: [] },
    { sleep: "excellent", energy: "high", stress: "low", pain: [], soreness: [] },
    {
      sleep: "ok",
      energy: "medium",
      stress: "medium",
      pain: [{ location: "shoulder", level: 7 }],
      soreness: [],
    },
  ];

  if (timeLimitedMinutes < onboardingMinutes) {
    base.push({
      sleep: "ok",
      energy: "medium",
      stress: "medium",
      pain: [],
      soreness: [],
      availableMinutes: timeLimitedMinutes,
    });
  }
  return base;
}

async function simulateSummary(args: {
  scheme: NormalizedWorkoutScheme;
  userProfile: UserProfile;
  beforePlan: GeneratedWorkoutDay;
  checkin: CheckInData;
}): Promise<{ summary: any; diff: ReturnType<typeof computeWorkoutSummaryDiff> }> {
  const readiness = computeReadiness({
    checkin: args.checkin,
    fallbackTimeBucket: args.userProfile.timeBucket,
  });
  const decision = decideStartAction({
    scheme: args.scheme,
    dayIndex: 0,
    readiness,
  });

  let action: WorkoutStartAction = decision.action;
  let afterPlan: any = args.beforePlan;
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
      userProfile: args.userProfile,
      painAreas: Array.isArray(args.checkin.pain) ? args.checkin.pain.map((p) => p.location) : [],
      availableMinutes: args.checkin.availableMinutes,
      blockedPatterns: readiness.blockedPatterns,
      avoidFlags: readiness.avoidFlags,
    });
  } else if (decision.action === "swap_day") {
    afterPlan = await generateWorkoutDay({
      scheme: args.scheme,
      dayIndex: decision.targetDayIndex,
      userProfile: args.userProfile,
      readiness,
      history: { recentExerciseIds: [] },
    });
    swapInfo = {
      from: args.beforePlan.dayLabel,
      to: decision.targetDayLabel,
    };
  } else {
    afterPlan = await generateWorkoutDay({
      scheme: args.scheme,
      dayIndex: 0,
      userProfile: args.userProfile,
      readiness,
      history: { recentExerciseIds: [] },
    });
  }

  const diff = computeWorkoutSummaryDiff({
    beforePlan: args.beforePlan,
    afterPlan,
    fallbackTimeBucket: args.userProfile.timeBucket,
  });

  const changeMeta: SummaryChangeMeta = (afterPlan as any)?.changeMeta || {};
  const summary = buildSummaryPayload({
    action,
    severity: readiness.severity,
    changeMeta: {
      ...changeMeta,
      safetyAdjusted:
        Boolean(changeMeta.safetyAdjusted) ||
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
    checkin: args.checkin,
    readiness,
    onboardingMinutes: args.userProfile.timeBucket,
    beforePlan: args.beforePlan,
    afterPlan,
  });

  return { summary, diff };
}

describe("e2e matrix: check-in narrative quality gates", () => {
  jest.setTimeout(180000);

  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  afterAll(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("держит целевые метрики качества на 30 профилях", async () => {
    const profiles = buildProfileMatrix(30);
    expect(profiles.length).toBe(30);

    const metrics: QualityMetrics = {
      totalRuns: 0,
      summary_text_contradiction: 0,
      duplicate_lines: 0,
      unknown_jargon: 0,
    };

    for (const profile of profiles) {
      const baselineReadiness = computeReadiness({
        fallbackTimeBucket: profile.userProfile.timeBucket,
      });
      const beforePlan = await generateWorkoutDay({
        scheme: profile.scheme,
        dayIndex: 0,
        userProfile: profile.userProfile,
        readiness: baselineReadiness,
        history: { recentExerciseIds: [] },
      });

      const checkins = checkinsForProfile(profile.onboardingMinutes);
      for (const checkin of checkins) {
        const { summary, diff } = await simulateSummary({
          scheme: profile.scheme,
          userProfile: profile.userProfile,
          beforePlan,
          checkin,
        });

        metrics.totalRuns += 1;

        if (isSummaryTextContradiction(summary.whatChanged, diff)) {
          metrics.summary_text_contradiction += 1;
        }

        const keyLines = [
          String(summary.whatChanged || ""),
          String(summary.why || ""),
          String(summary.howToTrainToday || ""),
        ].filter(Boolean);
        if (hasDuplicateLines(keyLines)) {
          metrics.duplicate_lines += 1;
        }

        if (containsUnknownJargon(keyLines)) {
          metrics.unknown_jargon += 1;
        }
      }
    }

    expect(metrics.totalRuns).toBeGreaterThanOrEqual(120);
    expect(metrics.summary_text_contradiction).toBe(0);
    expect(metrics.duplicate_lines).toBe(0);
    expect(metrics.unknown_jargon).toBe(0);
  });
});

import {
  buildSummaryPayload,
  computeWorkoutSummaryDiff,
  isSummaryTextContradiction,
} from "./checkinSummary.js";
import type { CheckInData } from "./workoutDayGenerator.js";

function makePlan(idsAndSets: Array<[string, number]>, estimatedDuration: number) {
  const exercises = idsAndSets.map(([exerciseId, sets]) => ({ exerciseId, sets }));
  return {
    exercises,
    totalExercises: exercises.length,
    totalSets: exercises.reduce((sum, ex) => sum + ex.sets, 0),
    estimatedDuration,
  };
}

function joinNarrativeLines(summary: {
  whatChanged?: string;
  why?: string;
  howToTrainToday?: string;
}): string {
  return [summary.whatChanged, summary.why, summary.howToTrainToday]
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .join(" ");
}

function hasManualWeightInstruction(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    /(сниз(ь|ьте)|уменьш(и|ите)|сбрасывай|сбрасывайте).{0,24}вес/.test(normalized) ||
    /(добав(ь|ьте)|повыш(ай|айте)).{0,24}вес/.test(normalized)
  );
}

describe("checkin narrative builder (unit)", () => {
  it("плохой сон + низкая энергия при 90 мин: облегчает по состоянию, не по времени", () => {
    const beforePlan = makePlan(
      [
        ["bench_press", 4],
        ["incline_db_press", 4],
        ["lat_pulldown", 4],
        ["cable_row", 4],
        ["lateral_raise", 4],
        ["triceps_pushdown", 4],
        ["biceps_curl", 3],
      ],
      88
    );
    const afterPlan = makePlan(
      [
        ["bench_press", 3],
        ["incline_db_press", 3],
        ["lat_pulldown", 3],
        ["cable_row", 3],
        ["lateral_raise", 3],
        ["triceps_pushdown", 3],
        ["biceps_curl", 2],
      ],
      70
    );
    const checkin: CheckInData = {
      sleep: "poor",
      energy: "low",
      stress: "medium",
      availableMinutes: 90,
      pain: [],
      soreness: [],
    };
    const diff = computeWorkoutSummaryDiff({
      beforePlan,
      afterPlan,
      fallbackTimeBucket: 90,
    });
    const summary = buildSummaryPayload({
      action: "keep_day",
      changeMeta: { intentAdjusted: true, volumeAdjusted: true },
      changeNotes: [],
      infoNotes: [],
      warnings: [],
      diff,
      checkin,
      readiness: { intent: "light", severity: "high", maxPainLevel: 0 },
      onboardingMinutes: 90,
      beforePlan,
      afterPlan,
    });

    expect(summary.whatChanged).toMatch(/легче|снизили/i);
    expect(summary.why).toMatch(/сон|энерги/i);
    expect(summary.whatChanged).not.toMatch(/под время/i);
    expect(summary.why).not.toMatch(/указал 90 мин вместо обычных 90/i);
    expect(isSummaryTextContradiction(summary.whatChanged, diff)).toBe(false);
    expect(hasManualWeightInstruction(joinNarrativeLines(summary))).toBe(false);
  });

  it("нормальный чек-ин: оставляет план без изменений и объясняет почему", () => {
    const beforePlan = makePlan(
      [
        ["squat", 4],
        ["rom_deadlift", 4],
        ["split_squat", 3],
        ["leg_curl", 3],
      ],
      62
    );
    const afterPlan = beforePlan;
    const checkin: CheckInData = {
      sleep: "ok",
      energy: "medium",
      stress: "medium",
      availableMinutes: 60,
      pain: [],
      soreness: [],
    };
    const diff = computeWorkoutSummaryDiff({
      beforePlan,
      afterPlan,
      fallbackTimeBucket: 60,
    });
    const summary = buildSummaryPayload({
      action: "keep_day",
      forcedChanged: false,
      changeMeta: {},
      changeNotes: [],
      infoNotes: [],
      warnings: [],
      diff,
      checkin,
      readiness: { intent: "normal", severity: "low", maxPainLevel: 0 },
      onboardingMinutes: 60,
      beforePlan,
      afterPlan,
    });

    expect(summary.changed).toBe(false);
    expect(summary.whatChanged).toMatch(/без изменений|оставили/i);
    expect(summary.why).toMatch(/состояние ровное|оставили план/i);
    expect(isSummaryTextContradiction(summary.whatChanged, diff)).toBe(false);
    expect(hasManualWeightInstruction(joinNarrativeLines(summary))).toBe(false);
  });

  it("высокий ресурс: может повышать нагрузку без противоречий", () => {
    const beforePlan = makePlan(
      [
        ["bench_press", 4],
        ["incline_db_press", 4],
        ["cable_row", 4],
        ["lat_pulldown", 4],
        ["lateral_raise", 3],
      ],
      74
    );
    const afterPlan = makePlan(
      [
        ["bench_press", 5],
        ["incline_db_press", 5],
        ["cable_row", 5],
        ["lat_pulldown", 5],
        ["lateral_raise", 4],
      ],
      88
    );
    const checkin: CheckInData = {
      sleep: "excellent",
      energy: "high",
      stress: "low",
      availableMinutes: 90,
      pain: [],
      soreness: [],
    };
    const diff = computeWorkoutSummaryDiff({
      beforePlan,
      afterPlan,
      fallbackTimeBucket: 90,
    });
    const summary = buildSummaryPayload({
      action: "keep_day",
      changeMeta: { volumeAdjusted: true },
      changeNotes: [],
      infoNotes: [],
      warnings: [],
      diff,
      checkin,
      readiness: { intent: "hard", severity: "low", maxPainLevel: 0 },
      onboardingMinutes: 90,
      beforePlan,
      afterPlan,
    });

    expect(summary.whatChanged).toMatch(/повысили|добавили/i);
    expect(summary.why).toMatch(/высокий ресурс|повысить/i);
    expect(isSummaryTextContradiction(summary.whatChanged, diff)).toBe(false);
    expect(hasManualWeightInstruction(joinNarrativeLines(summary))).toBe(false);
  });

  it("90 → 60 минут: объясняет адаптацию именно под время", () => {
    const beforePlan = makePlan(
      [
        ["bench_press", 4],
        ["incline_db_press", 4],
        ["row", 4],
        ["lat_pulldown", 4],
        ["lateral_raise", 3],
        ["triceps_pushdown", 3],
      ],
      90
    );
    const afterPlan = makePlan(
      [
        ["bench_press", 3],
        ["row", 3],
        ["lat_pulldown", 3],
        ["lateral_raise", 2],
      ],
      60
    );
    const checkin: CheckInData = {
      sleep: "ok",
      energy: "medium",
      stress: "medium",
      availableMinutes: 60,
      pain: [],
      soreness: [],
    };
    const diff = computeWorkoutSummaryDiff({
      beforePlan,
      afterPlan,
      fallbackTimeBucket: 90,
    });
    const summary = buildSummaryPayload({
      action: "keep_day",
      changeMeta: { shortenedForTime: true, volumeAdjusted: true },
      changeNotes: [],
      infoNotes: [],
      warnings: [],
      diff,
      checkin,
      readiness: { intent: "normal", severity: "low", maxPainLevel: 0 },
      onboardingMinutes: 90,
      beforePlan,
      afterPlan,
    });

    expect(summary.whatChanged).toMatch(/под время|сократили тренировку/i);
    expect(summary.why).toMatch(/60|90|мин/i);
    expect(isSummaryTextContradiction(summary.whatChanged, diff)).toBe(false);
    expect(hasManualWeightInstruction(joinNarrativeLines(summary))).toBe(false);
  });
});

describe("checkin narrative invariants", () => {
  it("не допускает противоречия текста по направлению изменения", () => {
    const scenarios = [
      {
        before: makePlan([["a", 4], ["b", 4], ["c", 4]], 70),
        after: makePlan([["a", 3], ["b", 3], ["c", 3]], 55),
        checkin: { sleep: "poor", energy: "low", stress: "high", availableMinutes: 90, pain: [], soreness: [] } satisfies CheckInData,
        meta: { volumeAdjusted: true, intentAdjusted: true },
      },
      {
        before: makePlan([["a", 4], ["b", 4], ["c", 4]], 70),
        after: makePlan([["a", 5], ["b", 5], ["c", 5]], 86),
        checkin: { sleep: "excellent", energy: "high", stress: "low", availableMinutes: 90, pain: [], soreness: [] } satisfies CheckInData,
        meta: { volumeAdjusted: true },
      },
      {
        before: makePlan([["a", 4], ["b", 4], ["c", 4]], 88),
        after: makePlan([["a", 3], ["b", 3]], 60),
        checkin: { sleep: "ok", energy: "medium", stress: "medium", availableMinutes: 60, pain: [], soreness: [] } satisfies CheckInData,
        meta: { shortenedForTime: true, volumeAdjusted: true },
      },
    ];

    for (const scenario of scenarios) {
      const diff = computeWorkoutSummaryDiff({
        beforePlan: scenario.before,
        afterPlan: scenario.after,
        fallbackTimeBucket: 90,
      });
      const summary = buildSummaryPayload({
        action: "keep_day",
        changeMeta: scenario.meta,
        diff,
        checkin: scenario.checkin,
        readiness: { intent: "normal", severity: "medium", maxPainLevel: 0 },
        onboardingMinutes: 90,
        beforePlan: scenario.before,
        afterPlan: scenario.after,
      });
      expect(isSummaryTextContradiction(summary.whatChanged, diff)).toBe(false);
    }
  });
});

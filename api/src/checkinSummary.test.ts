import {
  buildCoachSummaryBlocks,
  computeWorkoutSummaryDiff,
  isSummaryTextContradiction,
  type WorkoutSummaryDiff,
} from "./checkinSummary.js";

function makeDiff(overrides: Partial<WorkoutSummaryDiff> = {}): WorkoutSummaryDiff {
  return {
    setsDelta: 0,
    durationDelta: 0,
    addedCount: 0,
    removedCount: 0,
    replacedCount: 0,
    volumeDeltaPct: 0,
    durationDeltaPct: 0,
    beforeSets: 10,
    afterSets: 10,
    beforeDuration: 60,
    afterDuration: 60,
    structureChanged: false,
    ...overrides,
  };
}

describe("checkin summary semantics", () => {
  it("не пишет 'сократили', если фактически объем вырос", () => {
    const beforePlan = {
      totalSets: 8,
      estimatedDuration: 48,
      exercises: [
        { exerciseId: "bench", sets: 4 },
        { exerciseId: "row", sets: 4 },
      ],
    };
    const afterPlan = {
      totalSets: 12,
      estimatedDuration: 64,
      exercises: [
        { exerciseId: "bench", sets: 4 },
        { exerciseId: "row", sets: 4 },
        { exerciseId: "pullup", sets: 4 },
      ],
    };
    const diff = computeWorkoutSummaryDiff({
      beforePlan,
      afterPlan,
      fallbackTimeBucket: 60,
    });

    const blocks = buildCoachSummaryBlocks({
      action: "keep_day",
      changed: true,
      // Проверяем, что техфлаг не ломает пользовательскую семантику
      changeMeta: { shortenedForTime: true },
      diff,
      warnings: [],
      infoNotes: [],
      changeNotes: [],
    });

    expect(blocks.whatChanged).toMatch(/добавили/i);
    expect(blocks.whatChanged).not.toMatch(/сократили/i);
    expect(isSummaryTextContradiction(blocks.whatChanged, diff)).toBe(false);
  });

  it("приоритет безопасности выше формулировки про объем", () => {
    const diff = makeDiff({
      setsDelta: -4,
      durationDelta: -18,
      volumeDeltaPct: -28.6,
      durationDeltaPct: -30,
      beforeSets: 14,
      afterSets: 10,
      beforeDuration: 60,
      afterDuration: 42,
    });

    const blocks = buildCoachSummaryBlocks({
      action: "keep_day",
      changed: true,
      changeMeta: { safetyAdjusted: true, shortenedForTime: true },
      diff,
      warnings: ["🔴 Сильная боль: колено 7/10"],
      infoNotes: [],
      changeNotes: [],
    });

    expect(blocks.whatChanged).toMatch(/рискованн|проблемн/i);
  });

  it("swap_day показывает человеко-понятные названия", () => {
    const blocks = buildCoachSummaryBlocks({
      action: "swap_day",
      changed: true,
      swapInfo: { from: "Push Day", to: "Pull Day" },
      changeNotes: [],
      infoNotes: [],
      warnings: [],
      diff: makeDiff({ structureChanged: true, addedCount: 1, removedCount: 1, replacedCount: 1 }),
    });

    expect(blocks.whatChanged).toContain("Жимовой день");
    expect(blocks.whatChanged).toContain("Тяговой день");
  });

  it("детектор ловит противоречие текста с положительным диффом", () => {
    const positiveDiff = makeDiff({
      setsDelta: 4,
      durationDelta: 15,
      volumeDeltaPct: 33.3,
      durationDeltaPct: 25,
      beforeSets: 12,
      afterSets: 16,
      beforeDuration: 60,
      afterDuration: 75,
      addedCount: 1,
      structureChanged: true,
    });
    expect(
      isSummaryTextContradiction("Сократили объём под доступное время.", positiveDiff)
    ).toBe(true);

    const negativeDiff = makeDiff({
      setsDelta: -3,
      durationDelta: -12,
      volumeDeltaPct: -25,
      durationDeltaPct: -20,
      beforeSets: 12,
      afterSets: 9,
      beforeDuration: 60,
      afterDuration: 48,
      removedCount: 1,
      structureChanged: true,
    });
    expect(
      isSummaryTextContradiction("Добавили рабочий объём под текущее состояние.", negativeDiff)
    ).toBe(true);
  });
});

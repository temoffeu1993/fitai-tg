import { computeMuscleFocusSummary } from "./progressMuscleFocus.js";

describe("computeMuscleFocusSummary", () => {
  it("counts working sets instead of all ramp-up sets for weighted lifts", () => {
    const summary = computeMuscleFocusSummary([
      {
        exercises: [
          {
            id: "ho_barbell_bench_press",
            pattern: "horizontal_push",
            done: true,
            sets: [
              { reps: 12, weight: 20, done: true },
              { reps: 10, weight: 40, done: true },
              { reps: 8, weight: 60, done: true },
              { reps: 8, weight: 60, done: true },
              { reps: 8, weight: 60, done: true },
              { reps: 7, weight: 60, done: true },
            ],
          },
        ],
      },
    ]);

    expect(summary.totalEffectiveSets).toBe(4);
    expect(summary.mappedEffectiveSets).toBe(4);
    expect(summary.items[0]).toEqual(expect.objectContaining({ muscle: "Грудь" }));
    expect(summary.items.reduce((sum, item) => sum + item.percent, 0)).toBe(100);
  });

  it("falls back to movement pattern when exercise id is unknown", () => {
    const summary = computeMuscleFocusSummary([
      {
        exercises: [
          {
            id: "custom_pull",
            pattern: "vertical_pull",
            done: true,
            sets: [
              { reps: 10, done: true },
              { reps: 9, done: true },
              { reps: 8, done: true },
              { reps: 8, done: true },
            ],
          },
        ],
      },
    ]);

    expect(summary.mappedEffectiveSets).toBe(4);
    expect(summary.coveragePercent).toBe(1);
    expect(summary.items[0]).toEqual(expect.objectContaining({ muscle: "Спина" }));
    expect(summary.items[1]).toEqual(expect.objectContaining({ muscle: "Руки" }));
  });

  it("returns no items when there is not enough reliable data", () => {
    const summary = computeMuscleFocusSummary([
      {
        exercises: [
          {
            id: "co_plank",
            pattern: "core",
            done: true,
            sets: [
              { reps: 45, done: true },
              { reps: 45, done: true },
              { reps: 45, done: true },
            ],
          },
        ],
      },
    ]);

    expect(summary.totalEffectiveSets).toBe(3);
    expect(summary.items).toEqual([]);
  });
});

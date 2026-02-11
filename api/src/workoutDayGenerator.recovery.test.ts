import { generateRecoverySession, type UserProfile } from "./workoutDayGenerator.js";

const baseUser: UserProfile = {
  experience: "beginner",
  goal: "health_wellness",
  daysPerWeek: 3,
  timeBucket: 60,
  location: "gym",
};

describe("generateRecoverySession safety filters", () => {
  it("removes blocked lower-body patterns from recovery session", () => {
    const session = generateRecoverySession({
      userProfile: baseUser,
      painAreas: ["knee"],
      availableMinutes: 45,
      blockedPatterns: ["squat", "lunge"],
      avoidFlags: ["knee_sensitive"],
    });

    const ids = session.exercises.map((x) => x.exercise.id);
    const patterns = session.exercises.flatMap((x) => x.exercise.patterns);

    expect(ids).not.toContain("recovery_deep_squat");
    expect(patterns).not.toContain("squat");
    expect(patterns).not.toContain("lunge");
    expect(session.exercises.length).toBeGreaterThan(0);
  });

  it("filters shoulder-sensitive recovery moves when shoulder is flagged", () => {
    const session = generateRecoverySession({
      userProfile: baseUser,
      painAreas: ["shoulder"],
      availableMinutes: 45,
      blockedPatterns: ["vertical_push", "overhead_press"],
      avoidFlags: ["shoulder_sensitive"],
    });

    const ids = session.exercises.map((x) => x.exercise.id);

    expect(ids).not.toContain("recovery_shoulder_circles");
    expect(ids).not.toContain("recovery_chest_stretch");
    expect(session.adaptationNotes?.some((line) => line.includes("чувствительные зоны"))).toBe(true);
  });
});


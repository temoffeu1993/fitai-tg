export const GAMIFICATION_XP_CONFIG = {
  onboardingComplete: 120,
  workoutPlanned: 40,
  workoutCompleted: 180,
  levelBase: 200,
  levelStep: 100,
} as const;

export type GamificationCounts = {
  onboardingCompleted: boolean;
  plannedWorkouts: number;
  completedWorkouts: number;
};

export type GamificationLevel = {
  currentLevel: number;
  totalXp: number;
  levelXp: number;
  levelTargetXp: number;
  progress: number;
};

export type GamificationSummary = {
  counts: GamificationCounts;
  xp: {
    onboarding: number;
    planning: number;
    workouts: number;
    total: number;
  };
  level: GamificationLevel;
  config: typeof GAMIFICATION_XP_CONFIG;
};

function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function xpTargetForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level) || 1);
  return (
    GAMIFICATION_XP_CONFIG.levelBase +
    (safeLevel - 1) * GAMIFICATION_XP_CONFIG.levelStep
  );
}

export function buildLevelProgress(totalXpRaw: number): GamificationLevel {
  const totalXp = toNonNegativeInt(totalXpRaw);
  let currentLevel = 1;
  let levelXp = totalXp;
  let levelTargetXp = xpTargetForLevel(currentLevel);

  while (levelXp >= levelTargetXp) {
    levelXp -= levelTargetXp;
    currentLevel += 1;
    levelTargetXp = xpTargetForLevel(currentLevel);
  }

  return {
    currentLevel,
    totalXp,
    levelXp,
    levelTargetXp,
    progress: levelTargetXp > 0 ? Math.min(1, levelXp / levelTargetXp) : 1,
  };
}

export function buildGamificationSummaryFromCounts(
  input: GamificationCounts
): GamificationSummary {
  const counts: GamificationCounts = {
    onboardingCompleted: Boolean(input.onboardingCompleted),
    plannedWorkouts: toNonNegativeInt(input.plannedWorkouts),
    completedWorkouts: toNonNegativeInt(input.completedWorkouts),
  };

  const onboarding = counts.onboardingCompleted
    ? GAMIFICATION_XP_CONFIG.onboardingComplete
    : 0;
  const planning = counts.plannedWorkouts * GAMIFICATION_XP_CONFIG.workoutPlanned;
  const workouts = counts.completedWorkouts * GAMIFICATION_XP_CONFIG.workoutCompleted;
  const total = onboarding + planning + workouts;

  return {
    counts,
    xp: {
      onboarding,
      planning,
      workouts,
      total,
    },
    level: buildLevelProgress(total),
    config: GAMIFICATION_XP_CONFIG,
  };
}

export const EMPTY_GAMIFICATION_SUMMARY = buildGamificationSummaryFromCounts({
  onboardingCompleted: false,
  plannedWorkouts: 0,
  completedWorkouts: 0,
});


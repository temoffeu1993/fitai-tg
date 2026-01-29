-- 2026_01_migrate_onboarding_goals.sql
-- Normalize onboarding goals to 4 allowed values:
-- lose_weight, build_muscle, athletic_body, health_wellness
-- Run on production AFTER deploy that enforces strict goal validation.

BEGIN;

-- data.motivation.goal
UPDATE onboardings
SET data = jsonb_set(
  data,
  '{motivation,goal}',
  to_jsonb(
    CASE (data #>> '{motivation,goal}')
      WHEN 'lose_weight' THEN 'lose_weight'
      WHEN 'build_muscle' THEN 'build_muscle'
      WHEN 'athletic_body' THEN 'athletic_body'
      WHEN 'health_wellness' THEN 'health_wellness'
      WHEN 'fat_loss' THEN 'lose_weight'
      WHEN 'hypertrophy' THEN 'build_muscle'
      WHEN 'muscle_gain' THEN 'build_muscle'
      WHEN 'strength' THEN 'build_muscle'
      WHEN 'powerlifting' THEN 'build_muscle'
      WHEN 'lower_body_focus' THEN 'athletic_body'
      WHEN 'tone_up' THEN 'athletic_body'
      WHEN 'general_fitness' THEN 'athletic_body'
      WHEN 'event_prep' THEN 'athletic_body'
      WHEN 'maintenance' THEN 'health_wellness'
      ELSE 'health_wellness'
    END
  ),
  true
)
WHERE data #>> '{motivation,goal}' IS NOT NULL;

-- data.goals.primary
UPDATE onboardings
SET data = jsonb_set(
  data,
  '{goals,primary}',
  to_jsonb(
    CASE (data #>> '{goals,primary}')
      WHEN 'lose_weight' THEN 'lose_weight'
      WHEN 'build_muscle' THEN 'build_muscle'
      WHEN 'athletic_body' THEN 'athletic_body'
      WHEN 'health_wellness' THEN 'health_wellness'
      WHEN 'fat_loss' THEN 'lose_weight'
      WHEN 'hypertrophy' THEN 'build_muscle'
      WHEN 'muscle_gain' THEN 'build_muscle'
      WHEN 'strength' THEN 'build_muscle'
      WHEN 'powerlifting' THEN 'build_muscle'
      WHEN 'lower_body_focus' THEN 'athletic_body'
      WHEN 'tone_up' THEN 'athletic_body'
      WHEN 'general_fitness' THEN 'athletic_body'
      WHEN 'event_prep' THEN 'athletic_body'
      WHEN 'maintenance' THEN 'health_wellness'
      ELSE 'health_wellness'
    END
  ),
  true
)
WHERE data #>> '{goals,primary}' IS NOT NULL;

-- summary.goals.primary
UPDATE onboardings
SET summary = jsonb_set(
  summary,
  '{goals,primary}',
  to_jsonb(
    CASE (summary #>> '{goals,primary}')
      WHEN 'lose_weight' THEN 'lose_weight'
      WHEN 'build_muscle' THEN 'build_muscle'
      WHEN 'athletic_body' THEN 'athletic_body'
      WHEN 'health_wellness' THEN 'health_wellness'
      WHEN 'fat_loss' THEN 'lose_weight'
      WHEN 'hypertrophy' THEN 'build_muscle'
      WHEN 'muscle_gain' THEN 'build_muscle'
      WHEN 'strength' THEN 'build_muscle'
      WHEN 'powerlifting' THEN 'build_muscle'
      WHEN 'lower_body_focus' THEN 'athletic_body'
      WHEN 'tone_up' THEN 'athletic_body'
      WHEN 'general_fitness' THEN 'athletic_body'
      WHEN 'event_prep' THEN 'athletic_body'
      WHEN 'maintenance' THEN 'health_wellness'
      ELSE 'health_wellness'
    END
  ),
  true
)
WHERE summary #>> '{goals,primary}' IS NOT NULL;

COMMIT;

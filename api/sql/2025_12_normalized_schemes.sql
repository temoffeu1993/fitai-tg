-- 2025_12_normalized_schemes.sql
-- ============================================================================
-- Migration: Update workout_schemes to use normalized schemes
-- 
-- This migration:
-- 1. Adds new columns if needed
-- 2. Clears old schemes
-- 3. Inserts new normalized schemes (22 instead of 40)
-- ============================================================================

-- Ensure table has all required columns
ALTER TABLE workout_schemes 
ADD COLUMN IF NOT EXISTS intensity VARCHAR(20) DEFAULT 'moderate',
ADD COLUMN IF NOT EXISTS target_sex VARCHAR(20) DEFAULT 'any';

-- Optional: Backup old schemes (uncomment if needed)
-- CREATE TABLE IF NOT EXISTS workout_schemes_backup AS SELECT * FROM workout_schemes;

-- Clear old schemes (optional - comment out if you want to keep them)
-- TRUNCATE TABLE workout_schemes CASCADE;

-- Delete old user_workout_schemes (optional - users will need to reselect)
-- This is safe because new schemes will be recommended based on same criteria
-- TRUNCATE TABLE user_workout_schemes;

-- ============================================================================
-- Insert normalized schemes
-- ============================================================================

-- Note: Use the API endpoint to insert schemes, or insert manually here
-- Example for one scheme:

/*
INSERT INTO workout_schemes 
(id, name, description, days_per_week, min_minutes, max_minutes, split_type, 
 experience_levels, goals, equipment_required, day_labels, benefits, notes, intensity, target_sex)
VALUES 
(
  'fb_2x_beginner_base',
  'Full Body 2x Base',
  'Две тренировки на всё тело — безопасный и эффективный старт для формы и похудения.',
  2,
  45,
  90,
  'full_body',
  ARRAY['beginner', 'intermediate'],
  ARRAY['lose_weight', 'health_wellness', 'athletic_body', 'build_muscle'],
  ARRAY['gym_full', 'dumbbells', 'limited', 'bodyweight'],
  '[
    {
      "day": 1,
      "label": "Full Body A",
      "focus": "База на всё тело: присед/тяга/жим + простые аксессуары, без перегруза.",
      "templateRulesId": "Full Body A"
    },
    {
      "day": 2,
      "label": "Full Body B",
      "focus": "Вариативность углов: другой вариант ног/тяги/жима + акцент на технику.",
      "templateRulesId": "Full Body B"
    }
  ]'::jsonb,
  ARRAY[
    'Лучший вариант для новичка при 2 тренировках в неделю.',
    'Частая практика основных движений без перегруза суставов.',
    'Хорошо работает и на похудение, и на тонус/мышцы.'
  ],
  'Для похудения добавляй шаги/кардио отдельно; силовые держи стабильными.',
  'low',
  'any'
)
ON CONFLICT (id) DO UPDATE 
SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  days_per_week = EXCLUDED.days_per_week,
  min_minutes = EXCLUDED.min_minutes,
  max_minutes = EXCLUDED.max_minutes,
  split_type = EXCLUDED.split_type,
  experience_levels = EXCLUDED.experience_levels,
  goals = EXCLUDED.goals,
  equipment_required = EXCLUDED.equipment_required,
  day_labels = EXCLUDED.day_labels,
  benefits = EXCLUDED.benefits,
  notes = EXCLUDED.notes,
  intensity = EXCLUDED.intensity,
  target_sex = EXCLUDED.target_sex;
*/

-- ============================================================================
-- Verify migration
-- ============================================================================

-- Check total schemes
-- SELECT COUNT(*) as total_schemes FROM workout_schemes;

-- Check schemes by split type
-- SELECT split_type, COUNT(*) as count 
-- FROM workout_schemes 
-- GROUP BY split_type 
-- ORDER BY count DESC;

-- Check schemes by days per week
-- SELECT days_per_week, COUNT(*) as count 
-- FROM workout_schemes 
-- GROUP BY days_per_week 
-- ORDER BY days_per_week;

-- ============================================================================
-- IMPORTANT NOTES
-- ============================================================================

-- 1. Schemes are now inserted automatically via API when user selects them
-- 2. No need to pre-populate all 22 schemes
-- 3. Old schemes can coexist if needed (just change IDs)
-- 4. Users will get new recommendations automatically

-- ============================================================================
-- Rollback (if needed)
-- ============================================================================

-- RESTORE FROM BACKUP:
-- TRUNCATE TABLE workout_schemes;
-- INSERT INTO workout_schemes SELECT * FROM workout_schemes_backup;

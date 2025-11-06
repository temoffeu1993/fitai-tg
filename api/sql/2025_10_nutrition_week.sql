-- 1) Переименовать столбец даты плана -> неделя (если его ещё нет, пропусти ALTER)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='nutrition_plans' AND column_name='start_date'
  ) THEN
    ALTER TABLE nutrition_plans RENAME COLUMN start_date TO week_start_date;
  END IF;
END$$;

-- если столбца нет вовсе (свежая схема) — добавь
ALTER TABLE nutrition_plans
  ADD COLUMN IF NOT EXISTS week_start_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- уникальность «одна неделя на пользователя»
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='uniq_plan_per_week'
  ) THEN
    ALTER TABLE nutrition_plans
      ADD CONSTRAINT uniq_plan_per_week UNIQUE (user_id, week_start_date);
  END IF;
END$$;

-- 2) Дни недели
CREATE TABLE IF NOT EXISTS nutrition_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
  day_index INT NOT NULL CHECK (day_index BETWEEN 1 AND 7), -- 1=Пн (или начни с даты)
  day_date DATE,                                            -- опционально: week_start_date + day_index-1
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plan_id, day_index)
);

-- 3) Перевесить meals: добавить day_id, временно держим оба
ALTER TABLE nutrition_meals
  ADD COLUMN IF NOT EXISTS day_id UUID REFERENCES nutrition_days(id) ON DELETE CASCADE;

-- 3.a) Если были старые данные (meals.plan_id заполнен) — создаём по 7 дней и переносим в day 1
DO $$
DECLARE
  r RECORD; d1 UUID;
BEGIN
  FOR r IN
    SELECT p.id AS plan_id, p.week_start_date
    FROM nutrition_plans p
    WHERE NOT EXISTS (SELECT 1 FROM nutrition_days d WHERE d.plan_id = p.id)
  LOOP
    -- создаём 7 дней
    FOR i IN 1..7 LOOP
      INSERT INTO nutrition_days (plan_id, day_index, day_date)
      VALUES (r.plan_id, i, COALESCE(r.week_start_date, CURRENT_DATE) + (i-1))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Привяжем существующие meals к day 1
  UPDATE nutrition_meals m
  SET day_id = d.id
  FROM nutrition_days d
  WHERE m.day_id IS NULL
    AND m.plan_id = d.plan_id
    AND d.day_index = 1;
END$$;

-- 3.b) Убираем старый FK после переноса
ALTER TABLE nutrition_meals
  DROP CONSTRAINT IF EXISTS nutrition_meals_plan_id_fkey;
ALTER TABLE nutrition_meals
  DROP COLUMN IF EXISTS plan_id;

-- 4) Индексы
CREATE INDEX IF NOT EXISTS idx_nutrition_days_plan ON nutrition_days(plan_id, day_index);
CREATE INDEX IF NOT EXISTS idx_nutrition_meals_day  ON nutrition_meals(day_id, position);
CREATE INDEX IF NOT EXISTS idx_nutrition_items_meal ON nutrition_items(meal_id, position);

-- 5) Триггеры updated_at
DROP TRIGGER IF EXISTS trg_set_updated_at_nutrition_days ON nutrition_days;
CREATE TRIGGER trg_set_updated_at_nutrition_days
BEFORE UPDATE ON nutrition_days
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6) Вьюхи
DROP VIEW IF EXISTS v_nutrition_plan_totals;

CREATE OR REPLACE VIEW v_nutrition_day_totals AS
SELECT
  d.id  AS day_id,
  d.plan_id,
  COALESCE(SUM(i.kcal), 0)        AS kcal_total,
  COALESCE(SUM(i.protein_g), 0)   AS protein_total_g,
  COALESCE(SUM(i.fat_g), 0)       AS fat_total_g,
  COALESCE(SUM(i.carbs_g), 0)     AS carbs_total_g
FROM nutrition_days d
LEFT JOIN nutrition_meals m ON m.day_id = d.id
LEFT JOIN nutrition_items i ON i.meal_id = m.id
GROUP BY d.id, d.plan_id;

CREATE OR REPLACE VIEW v_nutrition_week_totals AS
SELECT
  p.id AS plan_id,
  COALESCE(SUM(dt.kcal_total), 0)      AS kcal_week,
  COALESCE(SUM(dt.protein_total_g), 0) AS protein_week_g,
  COALESCE(SUM(dt.fat_total_g), 0)     AS fat_week_g,
  COALESCE(SUM(dt.carbs_total_g), 0)   AS carbs_week_g
FROM nutrition_plans p
LEFT JOIN v_nutrition_day_totals dt ON dt.plan_id = p.id
GROUP BY p.id;
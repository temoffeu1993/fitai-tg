-- базовые таблицы питания
CREATE TABLE IF NOT EXISTS nutrition_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  name TEXT DEFAULT 'Базовый план',
  goal_kcal INT,
  protein_g INT,
  fat_g INT,
  carbs_g INT,
  meals_per_day INT CHECK (meals_per_day BETWEEN 1 AND 8),
  diet_style TEXT,
  restrictions TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nutrition_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  time_hint TIME,
  target_kcal INT,
  target_protein_g INT,
  target_fat_g INT,
  target_carbs_g INT,
  position INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nutrition_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID NOT NULL REFERENCES nutrition_meals(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  qty NUMERIC(10,2) NOT NULL,
  unit TEXT NOT NULL,
  kcal INT,
  protein_g NUMERIC(10,2),
  fat_g NUMERIC(10,2),
  carbs_g NUMERIC(10,2),
  prep TEXT,
  notes TEXT,
  position INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_user ON nutrition_plans(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_meals_plan ON nutrition_meals(plan_id, position);
CREATE INDEX IF NOT EXISTS idx_nutrition_items_meal ON nutrition_items(meal_id, position);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_nutrition_plans ON nutrition_plans;
CREATE TRIGGER trg_set_updated_at_nutrition_plans
BEFORE UPDATE ON nutrition_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_nutrition_meals ON nutrition_meals;
CREATE TRIGGER trg_set_updated_at_nutrition_meals
BEFORE UPDATE ON nutrition_meals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_nutrition_items ON nutrition_items;
CREATE TRIGGER trg_set_updated_at_nutrition_items
BEFORE UPDATE ON nutrition_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE VIEW v_nutrition_plan_totals AS
SELECT
  p.id AS plan_id,
  COALESCE(SUM(i.kcal),0)      AS kcal_total,
  COALESCE(SUM(i.protein_g),0) AS protein_total_g,
  COALESCE(SUM(i.fat_g),0)     AS fat_total_g,
  COALESCE(SUM(i.carbs_g),0)   AS carbs_total_g
FROM nutrition_plans p
LEFT JOIN nutrition_meals m ON m.plan_id = p.id
LEFT JOIN nutrition_items i ON i.meal_id = m.id
GROUP BY p.id;
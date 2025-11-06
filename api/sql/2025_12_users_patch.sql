ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_users ON users;
CREATE TRIGGER trg_set_updated_at_users
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

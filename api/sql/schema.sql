create extension if not exists pgcrypto;

create table if not exists users(
  id uuid primary key default gen_random_uuid(),
  tg_id bigint unique not null,
  first_name text,
  username text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at_users on users;
create trigger trg_set_updated_at_users
before update on users
for each row execute function set_updated_at();

create table if not exists onboardings(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  data jsonb not null,
  summary jsonb,                          -- добавили
  created_at timestamptz default now(),
  updated_at timestamptz default now(),   -- добавили
  unique(user_id)                         -- один актуальный онбординг на юзера
);

create table if not exists workouts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  plan jsonb not null,
  result jsonb,
  created_at timestamptz default now()
);

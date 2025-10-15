create extension if not exists pgcrypto;

create table if not exists users(
  id uuid primary key default gen_random_uuid(),
  tg_id bigint unique not null,
  first_name text,
  username text,
  created_at timestamptz default now()
);

create table if not exists onboardings(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz default now()
);

create table if not exists workouts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  plan jsonb not null,
  result jsonb,
  created_at timestamptz default now()
);
-- Reddit Sales Tool schema. Run once in the Supabase SQL editor.
-- Row level security is on for every table and no policies are defined, so the
-- browser can never read or write these tables directly. All access goes through
-- the app's server routes, which use the service role key.

create table if not exists benches (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at_ms bigint not null default 0
);

create table if not exists sold_prices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  year int,
  set_name text,
  num text,
  player text not null,
  grade text,
  price numeric(10, 2) not null,
  sold_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sold_prices_sold_at on sold_prices (sold_at desc);
create index if not exists sold_prices_user on sold_prices (user_id);

create table if not exists hunt_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  zip text,
  radius_miles int,
  targets text,
  sources text,
  updated_at timestamptz not null default now()
);

create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null,
  images int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time on ai_usage (user_id, created_at desc);

alter table benches enable row level security;
alter table sold_prices enable row level security;
alter table hunt_profiles enable row level security;
alter table ai_usage enable row level security;

-- Lun Store v2 schema - Supabase migration (applied automatically by the GitHub integration).
-- Never edit a migration that has already been applied; ship changes as a new migration file.
-- Lun Store - Supabase schema (Phase S1)
-- Run: Supabase Dashboard > SQL Editor > paste this whole file > Run.
-- Design: public data is readable by everyone (anon key); all writes go
-- through the Cloudflare Worker (service_role) after token checks. RLS is
-- enabled and write policies are intentionally absent (service_role
-- bypasses RLS).

create extension if not exists pgcrypto;

-- Who: LunID profile (created from the Worker's Google sign-in)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique not null,
  lunid text unique not null,               -- e.g. 'sachin@lunos'
  display_name text not null default '',
  avatar_url text not null default '',
  is_publisher boolean not null default false,
  is_trusted boolean not null default false, -- good record = auto-approved uploads
  is_banned boolean not null default false,
  strikes int not null default 0,
  storage_used_bytes bigint not null default 0,
  storage_quota_bytes bigint not null default 524288000, -- 500 MB
  created_at timestamptz not null default now()
);

-- Running totals per package (the catalog itself lives on GitHub)
create table if not exists public.package_stats (
  package_id text primary key,
  downloads_total bigint not null default 0,
  likes_total bigint not null default 0,
  rating_sum bigint not null default 0,
  rating_count bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id bigint generated always as identity primary key,
  package_id text not null,
  author uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_comments_pkg on public.comments(package_id, created_at desc);

-- One user, one like (the UNIQUE constraint is the real protection)
create table if not exists public.likes (
  package_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (package_id, user_id)
);

-- Rating only after downloading - the Worker checks downloads first
create table if not exists public.ratings (
  package_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (package_id, user_id)
);

create table if not exists public.favorites (
  package_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (package_id, user_id)
);

create table if not exists public.follows (
  creator_id uuid not null references public.profiles(id) on delete cascade,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (creator_id, follower_id)
);

-- Download tracking: one row per real install (dedupe in the RPC below)
create table if not exists public.downloads_daily (
  id bigint generated always as identity primary key,
  package_id text not null,
  day date not null,
  user_key text not null,  -- profile uuid (signed in) or 'ip:hash' (guest)
  unique (package_id, day, user_key)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  package_id text not null,
  reporter uuid references public.profiles(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 300),
  status text not null default 'pending' check (status in ('pending','hidden','dismissed','actioned')),
  created_at timestamptz not null default now()
);

-- Upload state: pending -> approved/rejected (approved = GitHub catalog entry)
create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  publisher uuid not null references public.profiles(id) on delete cascade,
  package_id text not null,
  pkg_type text not null check (pkg_type in ('gui','cli','theme','icon','font','wallpaper','live-wallpaper','cursor','widget','sound')),
  name text not null,
  version text not null,
  license_id text not null,
  own_work_declaration boolean not null default false, -- "this is my work" declaration
  hf_path text not null default '',
  sha256 text not null default '',
  size_bytes bigint not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- Fyn: closed-loop virtual currency. Balances change only via the ledger.
create table if not exists public.fyn_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.fyn_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null,             -- + earn, - spend/burn
  kind text not null,                 -- daily_login, upload_approved, milestone, tip, premium_unlock, featured, compute_earn, compute_spend
  ref text not null default '',       -- package_id / job_id etc.
  created_at timestamptz not null default now()
);
create index if not exists idx_fyn_ledger_user on public.fyn_ledger(user_id, created_at desc);

-- Account sync: favorites/installs/unlocks JSON (personal files NEVER sync)
create table if not exists public.user_sync (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  installed jsonb not null default '[]'::jsonb,
  premium_unlocks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Leaderboards (views): always computed from real unique counters
create or replace view public.leaderboard_developers as
select pr.id, pr.lunid, pr.display_name, pr.avatar_url,
       coalesce(sum(ps.downloads_total),0) as total_downloads,
       count(distinct c.package_id) as packages_commented_on
from public.profiles pr
left join public.submissions s on s.publisher = pr.id and s.status='approved'
left join public.package_stats ps on ps.package_id = s.package_id
left join public.comments c on c.author = pr.id
where pr.is_publisher and not pr.is_banned
group by pr.id
order by total_downloads desc;

create or replace view public.leaderboard_packages as
select package_id, downloads_total, likes_total,
       case when rating_count>0 then round((rating_sum::numeric/rating_count),2) else 0 end as avg_rating,
       rating_count
from public.package_stats
order by downloads_total desc;

-- Atomic helpers (the Worker calls these via RPC; counters never race)
create or replace function public.record_download(p_package text, p_user_key text)
returns boolean language plpgsql security definer as $$
declare inserted boolean;
begin
  insert into public.downloads_daily(package_id, day, user_key)
  values (p_package, current_date, p_user_key)
  on conflict do nothing returning true into inserted;
  if inserted is null then return false; end if;
  insert into public.package_stats(package_id, downloads_total, updated_at)
  values (p_package, 1, now())
  on conflict (package_id) do update
    set downloads_total = public.package_stats.downloads_total + 1, updated_at = now();
  return true;
end $$;

create or replace function public.toggle_like(p_package text, p_user uuid)
returns boolean language plpgsql security definer as $$
declare existed boolean;
begin
  delete from public.likes where package_id=p_package and user_id=p_user returning true into existed;
  if existed then
    update public.package_stats set likes_total=greatest(likes_total-1,0), updated_at=now() where package_id=p_package;
    return false;
  end if;
  insert into public.likes(package_id, user_id) values (p_package, p_user);
  insert into public.package_stats(package_id, likes_total, updated_at) values (p_package, 1, now())
  on conflict (package_id) do update set likes_total=public.package_stats.likes_total+1, updated_at=now();
  return true;
end $$;

create or replace function public.set_rating(p_package text, p_user uuid, p_stars int)
returns json language plpgsql security definer as $$
declare old int;
begin
  if not exists (select 1 from public.downloads_daily where package_id=p_package and user_key=p_user::text) then
    return json_build_object('ok', false, 'error', 'Download the package before rating it');
  end if;
  select stars into old from public.ratings where package_id=p_package and user_id=p_user;
  insert into public.ratings(package_id, user_id, stars) values (p_package, p_user, p_stars)
  on conflict (package_id, user_id) do update set stars=excluded.stars;
  insert into public.package_stats(package_id, rating_sum, rating_count, updated_at)
  values (p_package, p_stars, 1, now())
  on conflict (package_id) do update set
    rating_sum = public.package_stats.rating_sum + p_stars - coalesce(old,0),
    rating_count = public.package_stats.rating_count + (case when old is null then 1 else 0 end),
    updated_at = now();
  return json_build_object('ok', true);
end $$;

-- RLS: public read, writes only via service_role (Worker)
alter table public.profiles enable row level security;
alter table public.package_stats enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.ratings enable row level security;
alter table public.favorites enable row level security;
alter table public.follows enable row level security;
alter table public.downloads_daily enable row level security;
alter table public.reports enable row level security;
alter table public.submissions enable row level security;
alter table public.fyn_wallets enable row level security;
alter table public.fyn_ledger enable row level security;
alter table public.user_sync enable row level security;

create policy "public read stats" on public.package_stats for select using (true);
create policy "public read comments" on public.comments for select using (not is_hidden);
create policy "public read profiles" on public.profiles for select using (true);
-- No anon policies on the remaining tables = anon can neither read nor write.
-- The Worker uses service_role for everything; user_sync/Fyn are only
-- reachable through the Worker.

-- V7 shared-world storage. The browser uses only a publishable key; all
-- high-frequency positions stay in Realtime Presence / the simulation worker.
create extension if not exists pgcrypto;

create table if not exists public.player_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  badges jsonb not null default '[]'::jsonb,
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id text primary key check (char_length(id) between 1 and 48),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ready' check (status in ('ready', 'closed')),
  max_players integer not null default 32 check (max_players between 1 and 32),
  created_at timestamptz not null default now(),
  last_tick bigint not null default 0
);

create table if not exists public.room_members (
  room_id text not null references public.rooms(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

create table if not exists public.player_collections (
  player_id uuid not null references auth.users(id) on delete cascade,
  landmark_id integer not null check (landmark_id between 1 and 11),
  discovered_at timestamptz not null default now(),
  evidence_level text not null check (evidence_level in ('verified', 'triangulated', 'estimated')),
  source text not null check (source in ('solo', 'room')),
  primary key (player_id, landmark_id)
);

create table if not exists public.player_badges (
  player_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null check (char_length(badge_id) between 1 and 80),
  earned_at timestamptz not null default now(),
  primary key (player_id, badge_id)
);

create table if not exists public.team_objectives (
  room_id text not null references public.rooms(id) on delete cascade,
  objective_id text not null,
  progress integer not null default 0 check (progress >= 0),
  target_count integer not null check (target_count > 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room_id, objective_id)
);

create table if not exists public.world_events (
  room_id text not null references public.rooms(id) on delete cascade,
  event_id text not null,
  type text not null check (type in ('celestial', 'transit', 'landmark', 'team')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  primary key (room_id, event_id)
);

create table if not exists public.room_snapshots (
  room_id text primary key references public.rooms(id) on delete cascade,
  tick bigint not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.player_profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.player_collections enable row level security;
alter table public.player_badges enable row level security;
alter table public.team_objectives enable row level security;
alter table public.world_events enable row level security;
alter table public.room_snapshots enable row level security;

create or replace function public.is_room_member(target_room text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = target_room and player_id = auth.uid()
  );
$$;

drop policy if exists "profile_self_select" on public.player_profiles;
create policy "profile_self_select" on public.player_profiles for select to authenticated using (id = auth.uid());
drop policy if exists "profile_self_insert" on public.player_profiles;
create policy "profile_self_insert" on public.player_profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profile_self_update" on public.player_profiles;
create policy "profile_self_update" on public.player_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "room_member_read" on public.rooms;
create policy "room_member_read" on public.rooms for select to authenticated using (owner_id = auth.uid() or public.is_room_member(id));
drop policy if exists "room_owner_create" on public.rooms;
create policy "room_owner_create" on public.rooms for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "room_owner_update" on public.rooms;
create policy "room_owner_update" on public.rooms for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "member_self_read" on public.room_members;
create policy "member_self_read" on public.room_members for select to authenticated using (player_id = auth.uid() or public.is_room_member(room_id));
drop policy if exists "member_self_join" on public.room_members;
create policy "member_self_join" on public.room_members for insert to authenticated with check (player_id = auth.uid() and exists (select 1 from public.rooms where id = room_id and status = 'ready'));
drop policy if exists "member_self_leave" on public.room_members;
create policy "member_self_leave" on public.room_members for delete to authenticated using (player_id = auth.uid());

drop policy if exists "collection_self_read" on public.player_collections;
create policy "collection_self_read" on public.player_collections for select to authenticated using (player_id = auth.uid());
drop policy if exists "collection_self_write" on public.player_collections;
create policy "collection_self_write" on public.player_collections for insert to authenticated with check (player_id = auth.uid());

drop policy if exists "badge_self_read" on public.player_badges;
create policy "badge_self_read" on public.player_badges for select to authenticated using (player_id = auth.uid());

drop policy if exists "objective_member_read" on public.team_objectives;
create policy "objective_member_read" on public.team_objectives for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "event_member_read" on public.world_events;
create policy "event_member_read" on public.world_events for select to authenticated using (public.is_room_member(room_id));
drop policy if exists "snapshot_member_read" on public.room_snapshots;
create policy "snapshot_member_read" on public.room_snapshots for select to authenticated using (public.is_room_member(room_id));

-- Joining, command validation, team progress and snapshot writes belong to the
-- authoritative simulation service. No client write policy is granted for
-- objectives, events or snapshots.
comment on table public.room_members is 'Membership writes should pass through the authoritative room join service to enforce the 32-player cap atomically.';
comment on table public.room_snapshots is 'Low-frequency recovery snapshot; Realtime Presence remains the position channel.';

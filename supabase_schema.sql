-- Interaction Day Group Nexus Supabase Schema
-- Safe to run multiple times in Supabase SQL Editor.
-- This version adds Admin Wait List Management RPC functions without opening public DELETE/UPDATE policies.

create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  year text not null,
  joined_at timestamptz not null default now(),
  constraint participant_name_whitelist check (
    name in (
      'Lee Mann Ronn',
      'Cheong Bu Shoong',
      'Chong Meng Hin',
      'Wong Yi Chieng',
      'Kong Jun Yang',
      'Chuah Shin Yee',
      'Cheah Zhi Xuan',
      'Lee Wen Ze',
      'Hong Chee Ren',
      'Wong Ting Kai',
      'Phon Kar Lok'
    )
  ),
  constraint participant_year_whitelist check (
    year in ('Foundation', 'Year 1', 'Year 2', 'Year 3', 'Year 4')
  )
);

create table if not exists public.event_state (
  id integer primary key default 1,
  status text not null default 'waiting',
  started_at timestamptz,
  groups jsonb not null default '{}'::jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint only_one_event_row check (id = 1),
  constraint valid_event_status check (status in ('waiting', 'completed'))
);

insert into public.event_state (id, status, groups, version)
values (1, 'waiting', '{}'::jsonb, 0)
on conflict (id) do nothing;

alter table public.participants enable row level security;
alter table public.event_state enable row level security;

grant usage on schema public to anon;
grant select, insert on public.participants to anon;
grant select on public.event_state to anon;

drop policy if exists "Anyone can view participants" on public.participants;
create policy "Anyone can view participants"
on public.participants
for select
to anon
using (true);

drop policy if exists "Anyone can join with official name" on public.participants;
create policy "Anyone can join with official name"
on public.participants
for insert
to anon
with check (
  name in (
    'Lee Mann Ronn',
    'Cheong Bu Shoong',
    'Chong Meng Hin',
    'Wong Yi Chieng',
    'Kong Jun Yang',
    'Chuah Shin Yee',
    'Cheah Zhi Xuan',
    'Lee Wen Ze',
    'Hong Chee Ren',
    'Wong Ting Kai',
    'Phon Kar Lok'
  )
  and year in ('Foundation', 'Year 1', 'Year 2', 'Year 3', 'Year 4')
);

drop policy if exists "Anyone can view event state" on public.event_state;
create policy "Anyone can view event state"
on public.event_state
for select
to anon
using (true);

create or replace function public.verify_interaction_admin(
  admin_username text,
  admin_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if admin_username <> 'jingyikcheah' or admin_password <> 'jingyik12345' then
    raise exception 'Invalid admin credentials.';
  end if;
end;
$$;

create or replace function public.admin_start_event(
  admin_username text,
  admin_password text,
  group_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verify_interaction_admin(admin_username, admin_password);

  update public.event_state
  set
    status = 'completed',
    started_at = now(),
    groups = coalesce(group_payload, '{}'::jsonb),
    version = version + 1,
    updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.admin_save_groups(
  admin_username text,
  admin_password text,
  group_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verify_interaction_admin(admin_username, admin_password);

  update public.event_state
  set
    status = 'completed',
    started_at = now(),
    groups = coalesce(group_payload, '{}'::jsonb),
    version = version + 1,
    updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.auto_start_when_full(group_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_count integer;
  changed_count integer;
begin
  select count(*) into participant_count from public.participants;

  if participant_count <> 11 then
    return false;
  end if;

  update public.event_state
  set
    status = 'completed',
    started_at = now(),
    groups = coalesce(group_payload, '{}'::jsonb),
    version = version + 1,
    updated_at = now()
  where id = 1 and status = 'waiting';

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

create or replace function public.admin_reset_event(
  admin_username text,
  admin_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verify_interaction_admin(admin_username, admin_password);

  delete from public.participants;

  update public.event_state
  set
    status = 'waiting',
    started_at = null,
    groups = '{}'::jsonb,
    version = version + 1,
    updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.admin_remove_participant(
  admin_username text,
  admin_password text,
  p_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer;
begin
  perform public.verify_interaction_admin(admin_username, admin_password);

  delete from public.participants p
  where p.id = p_participant_id;

  get diagnostics removed_count = row_count;
  if removed_count = 0 then
    raise exception 'Participant record not found.';
  end if;

  update public.event_state
  set
    status = 'waiting',
    started_at = null,
    groups = '{}'::jsonb,
    version = version + 1,
    updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.admin_update_participant_year(
  admin_username text,
  admin_password text,
  p_participant_id uuid,
  p_participant_year text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  perform public.verify_interaction_admin(admin_username, admin_password);

  if p_participant_year not in ('Foundation', 'Year 1', 'Year 2', 'Year 3', 'Year 4') then
    raise exception 'Invalid participant year.';
  end if;

  update public.participants p
  set year = p_participant_year
  where p.id = p_participant_id;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Participant record not found.';
  end if;

  update public.event_state
  set
    status = 'waiting',
    started_at = null,
    groups = '{}'::jsonb,
    version = version + 1,
    updated_at = now()
  where id = 1;
end;
$$;

grant execute on function public.verify_interaction_admin(text, text) to anon;
grant execute on function public.admin_start_event(text, text, jsonb) to anon;
grant execute on function public.admin_save_groups(text, text, jsonb) to anon;
grant execute on function public.auto_start_when_full(jsonb) to anon;
grant execute on function public.admin_reset_event(text, text) to anon;
grant execute on function public.admin_remove_participant(text, text, uuid) to anon;
grant execute on function public.admin_update_participant_year(text, text, uuid, text) to anon;

alter table public.participants replica identity full;
alter table public.event_state replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.participants;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.event_state;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

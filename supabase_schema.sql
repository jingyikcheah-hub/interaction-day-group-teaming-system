-- Interaction Day Group Nexus Supabase Schema
-- Run this once inside Supabase SQL Editor.

create extension if not exists pgcrypto;

drop table if exists public.participants cascade;
drop table if exists public.event_state cascade;

create table public.participants (
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

create table public.event_state (
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
values (1, 'waiting', '{}'::jsonb, 0);

alter table public.participants enable row level security;
alter table public.event_state enable row level security;


grant usage on schema public to anon;
grant select, insert on public.participants to anon;
grant select on public.event_state to anon;


create policy "Anyone can view participants"
on public.participants
for select
to anon
using (true);

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

create policy "Anyone can view event state"
on public.event_state
for select
to anon
using (true);

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
  if admin_username <> 'jingyikcheah' or admin_password <> 'jingyik12345' then
    raise exception 'Invalid admin credentials.';
  end if;

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
  if admin_username <> 'jingyikcheah' or admin_password <> 'jingyik12345' then
    raise exception 'Invalid admin credentials.';
  end if;

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

grant execute on function public.admin_start_event(text, text, jsonb) to anon;
grant execute on function public.auto_start_when_full(jsonb) to anon;
grant execute on function public.admin_reset_event(text, text) to anon;

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

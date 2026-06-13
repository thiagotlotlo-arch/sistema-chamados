
-- V20.8.18 - SCHEMA SUPABASE PERSISTÊNCIA APP_STATE
-- Rode no SQL Editor do Supabase.
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state disable row level security;

insert into public.app_state (id, data, updated_at)
values ('default', '{}'::jsonb, now())
on conflict (id) do nothing;

-- Opcional: índice para consulta/backup
create index if not exists idx_app_state_updated_at on public.app_state(updated_at);

-- MIGRAÇÃO SEGURA V20.8.23 FINAL
-- NÃO executa delete, truncate ou drop.
-- Use este arquivo no Supabase SQL Editor se você já tem dados/importações.

begin;

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state disable row level security;

insert into public.app_state (id, data, updated_at)
values ('default', '{}'::jsonb, now())
on conflict (id) do nothing;

create index if not exists idx_app_state_updated_at
on public.app_state(updated_at);

commit;

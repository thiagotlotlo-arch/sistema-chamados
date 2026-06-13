-- V20.8.22 - modelo correto usado pelo sistema
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_state disable row level security;
insert into public.app_state (id,data,updated_at) values ('default','{}'::jsonb,now()) on conflict (id) do nothing;

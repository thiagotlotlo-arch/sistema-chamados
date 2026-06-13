-- V&B Chamados V14.0 - schema opcional PostgreSQL/Supabase
create table if not exists usuarios (id bigserial primary key,nome text,usuario text unique,senha text,perfil text,ativo text,analista text,permissoes jsonb default '[]');
create table if not exists perfis (id bigserial primary key,nome text unique,permissoes jsonb default '[]');
create table if not exists lojas (id bigserial primary key,codigo text,nome text,cnpj text,ie text,telefone text,cep text,uf text,cidade text,endereco text,latitude numeric,longitude numeric,analista text,proprietario text,feriado text,horario text,anexos jsonb default '[]');
create table if not exists prestadores (id bigserial primary key,empresa text,responsavel text,telefone text,email text,cnpj text,cpf text,cep text,uf text,cidade text,endereco text,ativo text,raio_km numeric,valor_km numeric,latitude numeric,longitude numeric,servicos jsonb default '[]',anexos jsonb default '[]');
create table if not exists proprietarios (id bigserial primary key,nome text,cnpj text,cpf text,telefone text,cep text,uf text,cidade text,endereco text,anexos jsonb default '[]');
create table if not exists chamados (id bigserial primary key,numero_interno text,loja_nome text,analista text,prestador_nome text,tipo_servico text,prioridade text,status text,valor numeric,data_abertura date,descricao text,observacoes text,anexos jsonb default '[]');
create table if not exists ordens_servico (id bigserial primary key,numero text,loja_nome text,prestador_nome text,chamados jsonb default '[]',valor_total numeric,created_at timestamptz default now());
create table if not exists lembretes (id bigserial primary key,titulo text,data date,hora time,analista text,cor text,fixar_inicial text,chamado_id bigint,preventiva_id bigint,descricao text);
create table if not exists preventivas (id bigserial primary key,titulo text,loja_nome text,data_lembrete date,status text,descricao text,lembrete_id bigint);
create table if not exists pontos (id bigserial primary key,usuario_id bigint,usuario_nome text,data date,inicio time,fim time,total text,tipo text,obs text);

-- V15.0 estável


-- V20.8.10 - PERSISTÊNCIA PRINCIPAL DO SISTEMA EM JSON NO SUPABASE
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Recomendado para este sistema: usar SUPABASE_SERVICE_ROLE_KEY no Render.
-- Se usar ANON KEY, será necessário configurar policies. Para evitar erro de permissão, mantenha service_role no backend.
alter table public.app_state disable row level security;

insert into public.app_state (id, data, updated_at)
values ('default', '{}'::jsonb, now())
on conflict (id) do nothing;


-- V20.8.10 - GARANTIA DE PERSISTÊNCIA PRINCIPAL
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_state disable row level security;
grant all on table public.app_state to postgres;
grant all on table public.app_state to service_role;
grant select, insert, update on table public.app_state to authenticated;
grant select, insert, update on table public.app_state to anon;
insert into public.app_state (id, data, updated_at) values ('default', '{}'::jsonb, now()) on conflict (id) do nothing;

-- SCHEMA V20.9.3 - SISTEMA VESTCASA / V&B CHAMADOS
create table if not exists public.app_state (
  id text primary key default 'default',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_state (id, data, updated_at)
values (
  'default',
  jsonb_build_object(
    'version','20.9.3',
    'config', jsonb_build_object(
      'next', jsonb_build_object('usuario',2,'perfil',4,'loja',1,'prestador',1,'proprietario',1,'chamado',1,'numeroChamado',1,'os',1,'lembrete',1,'preventiva',1,'ponto',1),
      'nomeSistema','V&B CHAMADOS',
      'subtitulo','CHAMADOS DE MANUTENÇÃO',
      'tema','VERDE',
      'logoUrl','',
      'logoLocal', null,
      'regraNomeFilial','MESCLAR_NOME_CIDADE_UF',
      'usarLogoLojaOS','SIM'
    ),
    'usuarios', jsonb_build_array(jsonb_build_object('id',1,'nome','OLITECH','usuario','OLITECH','senha','051309','perfil','ADMIN','ativo','SIM','analista','SIM','permissoes',jsonb_build_array('TODAS'))),
    'perfis', jsonb_build_array(
      jsonb_build_object('id',1,'nome','ADMIN','permissoes',jsonb_build_array('TODAS')),
      jsonb_build_object('id',2,'nome','ANALISTA','permissoes',jsonb_build_array('INICIO','CHAMADOS','CHAMADOS_EDITAR','LOJAS','PRESTADORES','PROPRIETARIOS','LEMBRETES','PREVENTIVAS','ORDENS_SERVICO','IMPORTAR','RELATORIOS','PONTO_HORAS')),
      jsonb_build_object('id',3,'nome','CONSULTA','permissoes',jsonb_build_array('INICIO','CHAMADOS','LOJAS','PRESTADORES','PROPRIETARIOS','RELATORIOS'))
    ),
    'tiposServico', jsonb_build_array('A DEFINIR','FAZ TUDO','ELÉTRICA','HIDRÁULICA','AR CONDICIONADO','DEDETIZAÇÃO','SERRALHERIA','CHAVEIRO','TELHADO','LIMPEZA','MANUTENÇÃO GERAL'),
    'statusChamado', jsonb_build_array('ABERTO','AGENDADO','AGUARDANDO','EM ANDAMENTO','AGUARDANDO APROVAÇÃO','FINALIZADO','CANCELADO'),
    'lojas', '[]'::jsonb,'prestadores','[]'::jsonb,'proprietarios','[]'::jsonb,'chamados','[]'::jsonb,'os','[]'::jsonb,'lembretes','[]'::jsonb,'preventivas','[]'::jsonb,'pontos','[]'::jsonb,'pagamentos','[]'::jsonb,'empresas','[]'::jsonb,'distance_cache','[]'::jsonb
  ),
  now()
)
on conflict (id) do nothing;

create table if not exists public.empresas (id bigserial primary key, nome text, logo text, created_at timestamptz default now());
create table if not exists public.lojas (id bigserial primary key, data jsonb default '{}'::jsonb, created_at timestamptz default now());
create table if not exists public.prestadores (id bigserial primary key, data jsonb default '{}'::jsonb, created_at timestamptz default now());
create table if not exists public.proprietarios (id bigserial primary key, data jsonb default '{}'::jsonb, created_at timestamptz default now());
create table if not exists public.chamados (id bigserial primary key, data jsonb default '{}'::jsonb, created_at timestamptz default now());
create table if not exists public.ordens_servico (id bigserial primary key, data jsonb default '{}'::jsonb, created_at timestamptz default now());
create table if not exists public.lembretes (id bigserial primary key, data jsonb default '{}'::jsonb, created_at timestamptz default now());
create table if not exists public.preventivas (id bigserial primary key, data jsonb default '{}'::jsonb, created_at timestamptz default now());
create table if not exists public.pontos (id bigserial primary key, data jsonb default '{}'::jsonb, created_at timestamptz default now());
create table if not exists public.distance_cache (id bigserial primary key, data jsonb default '{}'::jsonb, created_at timestamptz default now());

-- V20.9.3: logos/assinaturas devem ficar embutidos como dataUrl no app_state.

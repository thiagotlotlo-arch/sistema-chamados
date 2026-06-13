BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.app_state (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  usuario text NOT NULL UNIQUE,
  senha text NOT NULL,
  perfil text NOT NULL DEFAULT 'ADMIN',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.usuarios (nome, usuario, senha, perfil, ativo)
VALUES ('OLITECH','OLITECH','051309','ADMIN',true)
ON CONFLICT (usuario) DO UPDATE SET nome=EXCLUDED.nome, senha=EXCLUDED.senha, perfil=EXCLUDED.perfil, ativo=true;
INSERT INTO public.app_state (id, data, updated_at)
VALUES ('default','{"usuarios":[{"id":1,"nome":"OLITECH","usuario":"OLITECH","senha":"051309","perfil":"ADMIN","analista":true,"ativo":true}],"lojas":[],"prestadores":[],"proprietarios":[],"chamados":[],"os":[],"preventivas":[],"lembretes":[],"config":{"nomeSistema":"V&B CHAMADOS","subtitulo":"CHAMADOS DE MANUTENÇÃO","tema":"VERDE","regraFilial":"MESCLAR NOME + CIDADE + UF","whatsappSuporte":"16996076918"},"_seq":{"usuario":1,"loja":0,"prestador":0,"proprietario":0,"chamado":0,"numeroChamado":0,"os":0,"lembretes":0,"preventivas":0}}'::jsonb,now())
ON CONFLICT (id) DO NOTHING;
COMMIT;

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.app_state (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_state(id,data,updated_at) VALUES('default','{}'::jsonb,now()) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  usuario text NOT NULL UNIQUE,
  senha text NOT NULL,
  perfil text NOT NULL DEFAULT 'admin',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.usuarios(nome,usuario,senha,perfil,ativo) VALUES('Administrador','admin','admin','admin',true) ON CONFLICT(usuario) DO NOTHING;
COMMIT;

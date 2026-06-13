BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.app_state (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_state (id,data,updated_at)
VALUES ('default','{}'::jsonb,now())
ON CONFLICT (id) DO NOTHING;
COMMIT;

-- LIMPAR BANCO MANTENDO CONFIG, USUÁRIOS, PERFIS E PERMISSÕES
update public.app_state
set data = jsonb_build_object(
  'version', '20.9.0',
  'config', coalesce(data->'config', '{}'::jsonb),
  'usuarios', coalesce(data->'usuarios', '[]'::jsonb),
  'perfis', coalesce(data->'perfis', '[]'::jsonb),
  'permissoes', coalesce(data->'permissoes', '[]'::jsonb),
  'tiposServico', coalesce(data->'tiposServico', '["A DEFINIR","FAZ TUDO","ELÉTRICA","HIDRÁULICA","AR CONDICIONADO","DEDETIZAÇÃO","SERRALHERIA","CHAVEIRO","TELHADO","LIMPEZA","MANUTENÇÃO GERAL"]'::jsonb),
  'statusChamado', coalesce(data->'statusChamado', '["ABERTO","AGENDADO","AGUARDANDO","EM ANDAMENTO","AGUARDANDO APROVAÇÃO","FINALIZADO","CANCELADO"]'::jsonb),
  'lojas','[]'::jsonb,'prestadores','[]'::jsonb,'proprietarios','[]'::jsonb,'chamados','[]'::jsonb,'os','[]'::jsonb,'lembretes','[]'::jsonb,'preventivas','[]'::jsonb,'pontos','[]'::jsonb,'pagamentos','[]'::jsonb,'empresas','[]'::jsonb,'distance_cache','[]'::jsonb
),
updated_at = now()
where id='default';

truncate table public.empresas, public.lojas, public.prestadores, public.proprietarios, public.chamados, public.ordens_servico, public.lembretes, public.preventivas, public.pontos, public.distance_cache restart identity cascade;

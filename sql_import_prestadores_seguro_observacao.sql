-- OBSERVAÇÃO IMPORTANTE
-- Use apenas scripts que atualizem data->'prestadores' no app_state.
-- Não use UPDATE app_state SET data = ... contendo somente prestadores, pois isso apaga chamados/lojas do JSON.
-- Antes de importar qualquer planilha, faça backup:
select data from public.app_state where id='default';

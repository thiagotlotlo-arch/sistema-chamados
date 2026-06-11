# V&B Chamados V14.0 Estável

Sistema reconstruído para reduzir erros e manter as funções pedidas: usuários/permissões, lojas, prestadores, proprietários, chamados, logística, O.S., lembretes, preventivas, ponto/horas, relatórios, importação, PDF, backup e temas.

## Login padrão
Usuário: OLITECH
Senha: 051309

## Instalação Render
1. Apague os arquivos antigos do GitHub.
2. Envie todos os arquivos deste ZIP.
3. Render > Clear build cache & deploy.
4. Build Command: npm install
5. Start Command: npm start
6. Acesse /diagnostico após login.

## Banco
Por padrão usa data/db.json. O arquivo é criado automaticamente.

## Outra empresa
Suba este mesmo pacote em outro repositório/Render. Entre com OLITECH/051309, altere Config, logo, usuários e permissões.


## V14.1
- Impressão de O.S. ajustada conforme modelos enviados: cabeçalho, dados do requerente, descrição por chamados, prestador, termo e assinaturas em uma folha A4.
- O.S. pode reutilizar logo da loja ou logo da empresa pela Config.
- Logo local passa a ser salvo também em base64 no banco para não sumir após deploy do Render.
- Cadastro da loja ganhou WhatsApp do responsável.
- PDF de prestador reforçado para nome, endereço, CEP, telefone, cidade e UF.
- PDF de loja com regra de filial reforçada: MEGA VEST CASA LTDA -> MEGA VEST CASA CIDADE UF.
- Combo/autocomplete global reforçado a partir de 2 caracteres.


## V14.2
Correções diretas:
- Importação de planilha corrigida para não retornar 0 quando a planilha possui colunas com nomes diferentes.
- Cadastro de loja: upload de PDF corrigido para não sumir o anexo ao clicar em Pesquisar PDF.
- Cadastro de prestador: upload de PDF corrigido e busca reforçada de nome, CNPJ, CEP, telefone, cidade, UF e endereço.
- Formulários de PDF e planilha apontam para rotas V14.2 robustas.


## V14.3
- Loja: PDF usa a lógica do prestador, mas aplica regra de filial com cidade + UF.
- Prestador: PDF mantém nome original/limpo sem mesclar cidade.
- CEP reforçado em loja, prestador e importação.
- Importação de planilha ampliada para aceitar mais nomes de colunas.


## V14.4
Correção de deploy Render:
- Removidas rotas com `:id?`, que estavam causando falha na inicialização.
- Criadas rotas separadas e seguras:
  - /v144/loja-pdf
  - /v144/loja-pdf/:id
  - /v144/prestador-pdf
  - /v144/prestador-pdf/:id


## V14.5
Correção de deploy Render:
- Corrigido `ReferenceError: requirePerm is not defined`.
- Removidas rotas antigas desativadas que ainda executavam validação.
- Adicionado `v145Require`, verificação de permissão compatível com a base atual.


## V14.6
Correção do erro de rota /v144 nos cadastros por PDF. Formulários agora usam /v146.


## V15.0 Estável
- Removidos patches de rotas /v142, /v143, /v144 e /v146 que causavam erro na importação PDF.
- PDF voltou a usar as rotas nativas de loja e prestador.
- Importação de planilha reforçada em /v15/importar-planilha.
- Diagnóstico em /diagnostico.
- Versão única V15.0.


## V15.1
- Importação de PDF reforçada para loja e prestador.
- CEP, cidade e UF reforçados na leitura.
- Regra de filial mantida: NOME + CIDADE + UF.
- Cidades e UF voltaram como combobox/autocomplete.
- Rotas PDF novas:
  - /v151/loja-pdf
  - /v151/loja-pdf/:id
  - /v151/prestador-pdf
  - /v151/prestador-pdf/:id

## V15.2
- Corrige PDF deixando Nome loja e CEP vazios.
- Fallback para MEGA VEST CASA quando o PDF contém CNPJ/razão social da rede.
- Mantém CEP já existente caso o PDF não informe.
- Rota loja PDF: /v152/loja-pdf.

## V15.3
Importação PDF reestruturada no estilo da V11, corrigindo `db is not defined` e usando rotas /v153.

## V15.4
- Config `Filial / nomes repetidos` agora grava nas duas chaves: regraNomeFilial e filialNomesRepetidos.
- PDF de loja usa /v154/loja-pdf.
- Se marcado MESCLAR, gera NOME + CIDADE + UF.
- Reforço para nome/CEP/cidade/UF.

## V15.5
- Importação de planilha segura: não apaga usuários/analistas e cria backup automático.
- Autocomplete de analista a partir de 2 caracteres.

## V15.6
- Importação blindada: preserva usuários, analistas, perfis e permissões.
- Backup automático antes da importação.
- Nova rota /v156/importar-planilha.


## V15.7
- Importação de planilha reescrita e colocada antes das rotas antigas, para evitar cair em /v155 ou /v156 quebradas.
- As rotas /importar-planilha, /v15/importar-planilha, /v155/importar-planilha, /v156/importar-planilha e /v157/importar-planilha usam o mesmo handler seguro.
- Protege usuários e perfis antes/depois da importação, com backup automático.
- Autocomplete de analista a partir de 2 caracteres.

## V15.8
- Importação de planilha refeita usando a lógica antiga estável da V12.
- Rotas /importar-planilha, /v15, /v155, /v156, /v157 e /v158 apontam para o mesmo importador protegido.
- Erros de importação retornam página tratada 200, não derrubam o Render.
- Usuários/perfis/permissões são preservados.

## V15.9
- Mantém importação de planilha da V15.8.
- Restaura/fortalece PDF de loja com regra MEGA VEST CASA + CIDADE + UF.
- Botão Gerar localização volta a abrir Google Maps por endereço/cidade/UF ou lat/long.

## V16.0
- Chamado rápido separado: loja, descrição e anexos.
- Chamado completo separado para analista/admin com atribuição, prestador e logística.

## V16.1
- Grid padrão só com chamados abertos.
- Finalizados/cancelados aparecem apenas por busca/filtro.
- Fechamento em massa de chamados selecionados.
- OS com WhatsApp do responsável da loja e do prestador.

## V20.8.2
- Tudo em maiúsculo automaticamente ao digitar e no login.
- Melhorias de visual mobile.
- Grid inicial não carrega chamados por padrão; só após busca ou Mostrar todos para poupar memória.
- Mantidas as funções existentes.

## V20.8.3
- Restaurada tela de O.S. agrupada por loja/prestador com sugestão de junção.
- Botão selecionar todos da loja/prestador.
- Impressão mantém layout atual e volta a exibir assinatura digital do analista/usuário.
- Botão WhatsApp responsável da loja na O.S. e WhatsApp prestador.
- Fechar O.S. fecha chamados vinculados.


## V20.8.4 - Correção Supabase
Esta versão corrige a persistência: o sistema passa a carregar e salvar os dados na tabela `public.app_state` do Supabase quando as variáveis abaixo estiverem configuradas no Render:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`  (recomendado; não usar anon em produção para salvar)
- `SUPABASE_STATE_ID=default` opcional

Antes de subir, rode o `schema.sql` no Supabase SQL Editor.
Verificação: acesse `/api/v2084/status` logado. Precisa mostrar `supabaseConfigurado:true` e `supabaseOk:true`.


## V20.8.6
- Correção exclusiva para Render Node.js 20 + Supabase: adicionada dependência ws e transporte realtime.
- Mantidas as funções da V20.8.5 sem alterações.

## V20.8.7
- Correção pontual da importação de planilha.
- A importação agora salva usando a função oficial `save()`, atualizando cache em memória e Supabase.
- Corrige caso em que a tela dizia que importou, mas as buscas vinham zeradas.
- Adicionado diagnóstico: `/api/v2087/status`.

## V20.8.8
- Correção da conversão de valores importados: R$800,00 agora salva como 800.00.
- Ajuste para buscar assinatura digital cadastrada no usuário/analista e exibir na impressão da O.S.


## V20.9.0 - VestCasa estabilizado
- Mantida a base VestCasa/V&B Chamados.
- Supabase app_state protegido contra banco incompleto.
- Corrigido WebSocket do Supabase em Node 20.
- Corrigido erro CLOSED IS NOT DEFINED.
- Importação salva no cache/Supabase.
- Valores BR corrigidos: R$ 800,00 = 800.00.
- O.S. agrupada por loja/prestador com junção.
- Fechar O.S. fecha chamados vinculados.
- Impressão de O.S. modelo VestCasa com logo da loja, WhatsApp e assinatura digital do analista.
- Textos/digitação em maiúsculas e mobile compacto.
- Inclui schema.sql e reset_banco_mantendo_config.sql.

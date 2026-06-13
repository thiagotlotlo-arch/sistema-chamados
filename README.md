# VB Chamados V20.5 Recuperado

Versão consolidada a partir do histórico do projeto.

## Login padrão
- Usuário: `OLITECH`
- Senha: `051309`

## Supabase
Use o arquivo `schema.sql` no SQL Editor do Supabase.
Configure no Render:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STATE_ID=default`
- `SESSION_SECRET`
- `NODE_VERSION=20.18.1`

## Diagnóstico
Depois de publicar, acesse:
- `/api/v205/status`
- `/diagnostico`

## Incluído
- Botão Sobre.
- Supabase app_state.
- Lembretes com post-it, hora e bipe pelo front-end.
- Preventivas vinculadas a lembretes.
- O.S. agrupada por loja/prestador com impressão e fechamento.
- Logos por loja e reutilização.
- Assinatura digital de usuário na O.S.
- Importação PDF para loja/prestador/proprietário.
- Regra MEGA VEST CASA + CIDADE + UF.
- Temas de cores.
- Ponto automático com múltiplos plantões e edição.


## V20.7.0
- Consultas de lojas, prestadores e chamados com botão Mostrar todos.
- Lojas por Analista com filtro por analista/TODOS e impressão.
- Config sem WhatsApp suporte.
- Importação PDF/cartão CNPJ restaurada para nova/editar loja, prestador e proprietário.
- Regra loja: Mega Vest Casa + Cidade - UF.

## V20.7.1
Correção forçada: versão na tela, consultas com Mostrar Todos, Lojas por Analista, PDF CNPJ, Config sem WhatsApp suporte.

## V20.7.2
- Corrige travamento de loading após login.
- Loading fica restrito a importação/PDF/backup/restauração.
- Adicionado endpoint /api/v2072/status.

## V20.7.3
- Corrigida tela Nova/Editar Loja com Analista responsável, Proprietário cadastrado, PDF CNPJ e reutilizar logo.

## V20.7.4
- Tela de cadastro/edição de loja refeita e organizada.
- Blocos: PDF, dados principais, endereço, vínculos, logo, horários e logística.
- Analista responsável e proprietário cadastrado.

## V20.7.5
- Corrigida importação da planilha CHAMADOS.
- Leitura por colunas horizontais: A Loja, B Número, C Data, D Prioridade, E Autorizado, G Descrição, H Data Conversa, I Agendado, J Prestador, K Telefone, L Valor, M Pagamento, N Fechamento.
- Ignora linhas mescladas/títulos de loja sem número válido na coluna B.
- Cria/vincula loja e prestador automaticamente.

## V20.8.0
- O.S. com junção de chamados da mesma loja/prestador.
- Botão selecionar todos da loja/prestador.
- Ao fechar O.S., fecha automaticamente todos os chamados vinculados.
- Chamados fechados saem da grid padrão, mas continuam pesquisáveis por status/número.
- O.S. de junção sempre traz todos os chamados vinculados.
- Se fechar sem descrição/prestador/valor, pede motivo: cancelamento, fechar sem valor etc.
- Consulta de chamados com Abrir, Editar, Finalizar, Excluir e Gerar O.S.

## V20.8.1
- Ajustado somente o layout de impressão da O.S.
- Modelo VestCasa em A4.
- Inclui logo da loja.
- Inclui assinatura digital do analista/usuário quando cadastrada.
- Mantida impressão com/sem valor.

## V20.8.22
- Corrigido salvamento real do nome da loja nas rotas ativas V20.8.1.
- Botão Editar campos adicionado por script em telas de edição; novos cadastros ficam liberados.
- Cartão CNPJ/fotos/logo da loja salvos em dataUrl dentro do app_state.
- Rotas para abrir anexos da loja.
- /api/save/status explica que os dados ficam em app_state.data JSONB, não nas tabelas separadas.
- /api/save/flush força gravação no Supabase.

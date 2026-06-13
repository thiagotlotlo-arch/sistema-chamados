VB Chamados V9.8 - base V9.7 com Supabase e correções novas

Base mantida da V9.7 porque era a versão com lembretes/post-it/som, preventivas e importação PDF/planilha funcionando melhor.

Correções aplicadas:
- Supabase app_state usando id default.
- Status de banco em /api/v196/status.
- Rotas antigas: /v154/config, /v159/loja-pdf/:id e /v153/prestador-pdf.
- Upload flexível para logos, anexos, PDFs e assinaturas, evitando erro Unexpected field.
- PDF de loja volta a preencher nome + cidade + UF conforme regra.
- Cidade limpa, sem texto extra como UF SP ENDERECO ELETRONICO.
- Formulários ajustados para multipart automaticamente.

Render:
Build Command: npm install
Start Command: npm start
Depois use Clear build cache & deploy.

V9.8.1 - Correção Render Node 20 + Supabase

Correção principal:
- Corrige erro: Node.js 20 detected without native WebSocket support.
- Importa a dependência ws e configura o Supabase Realtime para usar esse transporte.

Render:
- Build Command: npm install --no-package-lock --omit=dev --no-audit --no-fund
- Start Command: npm start
- NODE_VERSION: 20.18.1 funciona com esta versão.

Banco:
- Rode schema_v9_8_1.sql se a tabela app_state ainda não existir.

Sobre:
- Botão Sobre permanece no menu.
- Página /sobre atualizada com card Olitech, WhatsApp 16 99607-6918 e parceria ChatGPT.

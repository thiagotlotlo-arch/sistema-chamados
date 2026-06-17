PATCH V20.8.29 - Correção cadastros e logo

Correções:
- Corrigido erro "p is not defined" ao abrir cadastro de lojas.
- Corrigido erro "l is not defined" em prestadores/proprietários causado por bloco de anexos trocado.
- Adicionado alias /lojas/novo redirecionando para /lojas/nova.
- Adicionado alias /os/novo e /ponto-horas/nova para evitar página não encontrada.
- Mantido logo salvo em base64 no banco/configuração, evitando depender da pasta uploads.
- Mantidas as funções e layout existentes.

Como aplicar:
1. Substitua os arquivos do GitHub pelos arquivos deste patch.
2. Não suba node_modules, uploads, data ou .env.
3. No Render use npm install e npm start normalmente.

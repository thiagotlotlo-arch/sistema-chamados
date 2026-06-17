V20.8.23 R4 - Correção final do nome da loja

Correção aplicada:
- Ao editar uma loja já cadastrada, o botão Salvar mantém exatamente o texto digitado no campo "Nome loja".
- A regra automática "MEGA VEST CASA + CIDADE + UF" fica restrita ao fluxo de importação por PDF, não ao salvamento manual.
- As rotas antigas /v159/loja-pdf também foram ajustadas, pois o front antigo redirecionava o formulário para elas.
- Horário de funcionamento continua persistindo nos campos e no objeto horarioFuncionamento.

Render:
Build Command: rm -rf node_modules package-lock.json && npm install --omit=dev --no-audit --no-fund
Start Command: npm start
Depois usar Clear build cache & deploy.

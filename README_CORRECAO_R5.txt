V20.8.23 R5 - Correção O.S. PDF/WhatsApp

Correções aplicadas:
- Removidas funções repetidas de WhatsApp na tela de impressão da O.S.
- A tela de O.S. agora mostra apenas:
  - Imprimir
  - Com valor
  - Sem valor
  - Voltar
  - Baixar PDF
  - PDF WhatsApp Loja
  - PDF WhatsApp Prestador
  - Fechar O.S.
- PDF enviado ao WhatsApp passa a respeitar o mesmo parâmetro com valor/sem valor.
- PDF gerado foi ajustado para ficar mais próximo da impressão, com logo e assinatura digital do analista quando cadastrada.
- Adicionado botão de conversa direta pelo WhatsApp nas telas de cadastro/edição quando houver telefone/WhatsApp.
- Mantidas correções anteriores de loja, horário, permissões e horas extras.

Render:
Build Command:
rm -rf node_modules package-lock.json && npm install --omit=dev --no-audit --no-fund

Start Command:
npm start

Depois usar Clear build cache & deploy.

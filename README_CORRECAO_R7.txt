Correção R7 - Horário Domingo/Feriado e WhatsApp responsável

Alterações:
- No cadastro/edição de loja, ao marcar Domingo/Feriado como ABERTO aparecem os campos:
  * Dom/Feriado abre
  * Dom/Feriado fecha
- Os horários de domingo/feriado são salvos em horaDomFeriadoAbre, horaDomFeriadoFecha e horarioFuncionamento.
- O botão Conversar no WhatsApp agora prioriza o campo WhatsApp responsável antes do telefone.
- Mantidas correções anteriores do nome da loja ao salvar.

Deploy Render:
Build Command: rm -rf node_modules package-lock.json && npm install --omit=dev --no-audit --no-fund
Start Command: npm start
Depois: Clear build cache & deploy.

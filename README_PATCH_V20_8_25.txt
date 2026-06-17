PATCH V20.8.25 - Correções pontuais

Correções feitas sem alterar layout geral nem funções já existentes:

1) Ponto/Horas
- Corrigida a rota /ponto-horas/nova para não cair mais em Página não encontrada.
- A rota agora redireciona para /ponto-horas, mantendo a tela atual do sistema.
- Também incluídos redirecionamentos seguros para /ponto-hora e /ponto-hora/nova.

2) Cadastro de Loja - Domingo/Feriado
- Adicionados campos de horário dentro do bloco já existente "Horário funcionamento":
  - Dom/Feriado abre
  - Dom/Feriado fecha
- Corrigido salvamento para manter os horários ao editar loja.
- O sistema agora preserva os campos antigos se a loja já tiver dados salvos.

Arquivo alterado:
- server.js

Como aplicar:
1. Faça backup do sistema atual.
2. Substitua os arquivos do GitHub por esta versão.
3. Envie para o Render normalmente.
4. Teste:
   - /ponto-horas/nova
   - cadastro/edição de loja com domingo/feriado aberto e horários preenchidos.

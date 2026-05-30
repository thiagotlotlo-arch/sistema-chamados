V12 ESTRUTURADO - Sistema de Chamados

Login padrão:
usuario: olitech
senha: 051309

O que foi refeito:
- server.js limpo, sem patches antigos sobrepostos.
- Cadastros salvam de verdade: lojas, prestadores, proprietários, chamados, lembretes, preventivas, ponto/horas.
- PDF de loja/prestador/proprietário em endpoint único e sem loop.
- Busca CEP/CNPJ.
- Importação XLSX com tela de loading.
- Grids só mostram dados ao buscar ou clicar em Mostrar todos.
- Lembretes em post-it e alarme sonoro com botão de ativação.
- O.S. como impressão/termo dos chamados, com junção por mesma loja + mesmo prestador.
- Preventivas geram lembrete automático.
- Tema de cores em Config.

Instalação recomendada:
1. Apague os arquivos antigos do GitHub.
2. Envie todos os arquivos deste ZIP.
3. No Render: Manual Deploy > Clear build cache & deploy.
4. Abra o sistema e aperte Ctrl+F5.
5. Confirme selo V12.0 no canto inferior.

Observação sobre som:
Navegadores bloqueiam áudio automático sem interação. Clique em “Alarme ativo / testar” ao abrir o sistema.

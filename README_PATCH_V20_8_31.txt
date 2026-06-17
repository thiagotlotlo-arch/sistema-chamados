PATCH V20.8.31 - correção de páginas, O.S. e mesclagem

Correções aplicadas:
1. Corrigido erro ao abrir /lojas/nova: variável p não definida.
2. Corrigido erro rows.join is not a function na página /admin/mesclar-duplicados e em qualquer tabela que receba linhas já renderizadas.
3. Corrigidas funções de O.S. para priorizar IDs de loja/prestador antes do nome, reduzindo impressão com prestador errado quando houver cadastros parecidos/duplicados.
4. Mantida ferramenta /admin/mesclar-duplicados com MEGA, SHOPPING e AG separados.
5. Ao mesclar lojas, o analista responsável fica vazio para não conflitar Hiago/Fernando/Thiago.
6. Versão visual e API atualizadas para V20.8.31.
7. Handler de página não encontrada movido para o final para não bloquear rotas adicionadas depois.
8. Mantido layout atual.

Após subir no GitHub/Render:
- Verifique /admin/verificar-paginas
- Acesse /admin/mesclar-duplicados para conferir duplicidades antes de aplicar
- Faça backup antes de aplicar mesclagem

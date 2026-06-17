PATCH V20.8.28 - Correção geral pós atualização

Correções aplicadas:
1. Corrigido erro tratado em páginas após atualização, incluindo referência indefinida em O.S./assinatura.
2. Mantidas as funções da aba Ponto/Horas:
   - editar horas
   - excluir horas
   - filtro por data inicial/final
   - filtro por usuário/analista
   - relatório/impressão dentro da própria aba Ponto/Horas
3. Relatório Ponto/Horas:
   - mantém logo da empresa
   - pega assinatura digital cadastrada no usuário/analista quando existir
   - mantém apenas campo simples "Assinatura" para assinatura manual
4. Logo da empresa:
   - ao salvar em Config, o logo passa a ser preservado em base64 dentro do banco/configuração
   - evita perder o logo em nova publicação/deploy quando a pasta uploads do Render for recriada
   - preserva compatibilidade com logo por URL e logo local já existente

Observação:
Caso o logo já tenha sido perdido antes deste patch, será necessário cadastrar o logo novamente uma única vez em CONFIG. Depois disso ele ficará gravado no banco/configuração.

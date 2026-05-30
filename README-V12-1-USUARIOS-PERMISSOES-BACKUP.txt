V12.1 - Usuários, Analistas, Permissões, Backup e Restauração

Adicionado:
- /usuarios: cadastrar, editar e excluir usuários/analistas.
- /perfis: cadastrar e editar perfis/permissões.
- /backup: baixar backup JSON e restaurar backup.
- Remove visualmente "login padrão" da aba Config.
- Adiciona atalhos na Config.
- Login passa a validar usuários cadastrados sem diferenciar maiúsculas/minúsculas no usuário.
- Mantém usuário OLITECH / 051309 como admin interno, mas não mostra mais na Config.

Depois de subir:
1. Render: Clear build cache & deploy.
2. Ctrl+F5.
3. Confirmar selo V12.1 no canto.
4. Abrir /config ou /usuarios.

Validação:
node --check server.js = OK


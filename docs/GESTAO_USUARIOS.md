# Gestão de usuários — DengueSaaS

## O que foi implementado

Acesse **Usuários** no menu lateral com a conta de perfil **ADMIN**. O novo módulo permite criar, listar, ativar/desativar contas, alterar perfis e redefinir senhas provisórias.

Perfis:

| Ação | ADMIN | OPERADOR | VISUALIZADOR |
| --- | --- | --- | --- |
| Consultar mapa, dashboard, estações e telemetria | sim | sim | sim |
| Exportar CSV | sim | sim | não |
| Reiniciar coletor | sim | sim | não |
| Reiniciar Raspberry | sim | não | não |
| Alterar dados de estações e importar malha SIG | sim | não | não |
| Consultar auditoria e gerenciar usuários | sim | não | não |
| Alterar a própria senha | sim | sim | sim |

As permissões são verificadas no hook `accessGuard` no backend; ocultar controles no frontend não substitui essa verificação.

## Criar conta

1. Faça login como administrador.
2. Abra **Usuários**.
3. Preencha um nome sem espaços (`operador.e01`, por exemplo) e escolha o perfil.
4. Clique em **Criar usuário**.
5. O backend gera uma **senha aleatória de 32 caracteres**, armazena somente seu hash com salt (scrypt) e devolve a senha provisória **uma única vez** na resposta. Copie antes de sair da tela. Compartilhe por meio seguro com o responsável.
6. O novo usuário deve entrar com login e senha temporária e definir sua própria senha de no mínimo 12 caracteres.

A desativação revoga imediatamente as sessões armazenadas do usuário. Ao redefinir a senha, a conta volta a exigir troca no próximo login e as sessões existentes são encerradas.

O último administrador ativo não pode ser desativado/rebaixado. O administrador não pode alterar seu próprio perfil ou desativar sua própria conta pela tela de usuários; para mudar a senha usa **Configurações**.

Todas as alterações ficam na trilha de auditoria (nomes de usuários, ações e perfis), **nunca a senha**.

## API autenticada (ADMIN apenas)

`GET /api/admin/users`

`POST /api/admin/users` (JSON: `{"username":"operador.e01","role":"OPERADOR"}`)

`PATCH /api/admin/users/:id` (JSON: `{"active":false}` ou `{"role":"VISUALIZADOR"}`)

`POST /api/admin/users/:id/reset-password`

O frontend usa cookie de sessão HttpOnly e chamadas same-origin. Não exponha endpoints administrativos diretamente na Internet sem HTTPS e políticas de acesso à rede.

## Implantação no servidor 10.22.0.24

**Esta branch deriva de `feat/mapa-estacoes-card-20261109`, portanto inclui todas as alterações de mapa anteriores.**

Antes de implantar, faça backup do PostgreSQL e verifique o status do Git. No servidor:

```bash
cd /u01/dengue-saas
mkdir -p /var/backups/dengue-saas
BACKUP="/var/backups/dengue-saas/pre-usuarios-$(date +%Y%m%d-%H%M%S).sql"
docker compose -p dengue-saas -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$BACKUP"
test -s "$BACKUP" && ls -lh "$BACKUP"

git status --short
git fetch origin
git switch feat/gestao-usuarios-permissoes-20261109
git pull --ff-only

docker compose -p dengue-saas -f docker-compose.prod.yml up -d --build api web
docker compose -p dengue-saas -f docker-compose.prod.yml ps
curl -i http://localhost:8090/health
```

O Dockerfile da API já executa `npx prisma db push` na inicialização. A alteração é aditiva: coluna `AdminUser.active BOOLEAN DEFAULT true`; as contas anteriores permanecem ativas.

### Testes de aceitação

- Abra o painel usando uma conta ADMIN já cadastrada.
- Deve aparecer o item lateral **Usuários**, além do mapa existente.
- Cadastre uma conta VISUALIZADOR; copie a senha temporária.
- Entre em uma janela anônima e confirme a exigência de troca de senha.
- No perfil VISUALIZADOR: dashboard e mapa visíveis; botão exportar, reiniciar coletor, reiniciar host, edição e importação de mapa não visíveis.
- No perfil OPERADOR: CSV e reinício do coletor disponíveis; reboot da Raspberry e gestão de contas proibidos.
- Confirme que chamadas HTTP diretas a URLs administrativas de contas sem papel ADMIN retornam 403.
- Desative a conta de teste e confirme que o login passa a ser recusado.
- No menu **Atividades**, confira eventos `USER_CREATED`, `USER_UPDATED` e `USER_PASSWORD_RESET`.

**Não é preciso alterar Raspberry Pi, agentes, Dojot, nem os certificados mTLS.**

## Rollback

```bash
cd /u01/dengue-saas
git switch feat/mapa-estacoes-card-20261109
docker compose -p dengue-saas -f docker-compose.prod.yml up -d --build api web
```

Os novos registros de usuários podem permanecer no banco, mas não haverá tela de gestão na versão antiga. Caso precise reverter o banco em si, use o backup após avaliar os eventos e dados coletados depois do backup. Não execute `docker compose down -v`.

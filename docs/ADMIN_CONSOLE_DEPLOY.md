# Console administrativa do DengueSaaS — implantação

**Alvo:** servidor `10.22.0.24` (`/u01/dengue-saas`); estação E01 no Rasp5 (`10.54.0.58`).
A Dojot existente em `/u01/docker-compose` e os certificados mTLS não são alterados.

## O que a versão adiciona

- Login administrativo inicial `admin/admin`, armazenado com scrypt e troca de senha obrigatória (mín. 12 caracteres).
- Sessões em PostgreSQL com cookie HttpOnly + SameSite=Strict, validade de 8 horas e logout revogável.
- Proteção das rotas de dashboard, estações, edição, auditoria, CSV e reinícios.
- Sidebar com Visão geral, Estações, Telemetria, Atividades e Configurações.
- Exportação CSV por estação e consolidada, a partir do histórico `SENSOR_PAYLOAD` já recebido pelo SaaS.
  **Não** é cópia byte a byte do CSV original armazenado no cartão SD da Raspberry.
- Duas ações distintas: `RESTART_COLLECTOR` e `REBOOT_HOST`, com confirmação, fila e auditoria.
- O reboot só recebe status `SUCCESS` quando o agente retorna com `bootId` diferente.

## Segurança / decisões de implantação

- O primeiro login `admin/admin` é apenas de bootstrap e não concede acesso às telas sem trocar a senha.
- Ainda não há multiusuários nem RBAC granular: é um administrador único.
- **HTTP em 8090 não cifra as credenciais**: restrinja o acesso à rede privada/VPN.
  Adicione HTTPS (proxy reverso com certificado) antes de qualquer publicação externa.
- A versão atual usa uma `STATION_API_KEY` compartilhada com os agentes, não autenticação por estação.
  Para maior escala, implementar credencial individual, revogação e rotação.
- O agente aceita exclusivamente os dois comandos acima, nunca comandos arbitrários.
- O uso de `sudo` está restrito em `/etc/sudoers.d/dengue-saas-agent`.

## 1. Fazer backup no servidor antes do deploy

Como root, no servidor 10.22.0.24:

```bash
cd /u01/dengue-saas
docker compose -p dengue-saas -f docker-compose.prod.yml ps
# O filesystem / possui pouco espaço; usar /var (9,1 GB livres na última verificação).
mkdir -p /var/backups/dengue-saas
docker compose -p dengue-saas -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "/var/backups/dengue-saas/pre-admin-$(date +%Y%m%d-%H%M%S).sql"
ls -lh /var/backups/dengue-saas/
git status --short
```

Verifique que o backup não está vazio. **Não** use `docker compose down -v`.

## 2. Atualizar apenas os containers do SaaS

```bash
cd /u01/dengue-saas
git fetch origin
git switch feat/admin-console-20261109

# Manter as variáveis existentes no .env.
# STATION_API_KEY precisa continuar configurada para o agente.
docker compose -p dengue-saas -f docker-compose.prod.yml config --quiet
docker compose -p dengue-saas -f docker-compose.prod.yml up -d --build api web

docker compose -p dengue-saas -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:8090/health
```

O container API executa `prisma db push` no boot, criando as tabelas de
administradores e sessões. O PostgreSQL existente e os dados de E01 são mantidos.

Agora abra `http://10.22.0.24:8090`, faça login com `admin/admin` e
**troque a senha imediatamente** para liberar o painel.

## 3. Atualizar o agente da Raspberry E01

No Rasp5:

```bash
cd /opt/dengue-saas-agent
git status --short
git fetch origin
git switch feat/admin-console-20261109

# .env não é versionado, e deve continuar com SAAS_AGENT_KEY
# e SENSOR_CSV_FILE=/home/evandro/Desktop/dados_estacao_sem_pressao.csv

sudo systemctl restart dengue-saas-agent@evandro.service
sudo systemctl status dengue-saas-agent@evandro.service --no-pager
sudo journalctl -u dengue-saas-agent@evandro.service -n 40 --no-pager
```

Sem sudoers, o heartbeat e as exportações funcionam normalmente, mas os botões
de reiniciar retornarão `FAILED`. **Nunca** executar o agente inteiro como root.

## 4. Permissões mínimas do agente (somente se quiser reinício remoto)

Confirmar caminhos:

```bash
command -v systemctl
systemctl cat estacao-dengue.service
```

Para Raspberry OS / Debian com systemctl em `/usr/bin/systemctl`:

```bash
sudo cp /opt/dengue-saas-agent/agent/sudoers.dengue-saas-agent.example /etc/sudoers.d/dengue-saas-agent
sudo chown root:root /etc/sudoers.d/dengue-saas-agent
sudo chmod 440 /etc/sudoers.d/dengue-saas-agent
sudo visudo -cf /etc/sudoers.d/dengue-saas-agent
```

**Não** adicionar `NOPASSWD: ALL`. Verifique que o usuário do agente é `evandro`.

Para teste de autorização sem efetuar o reinício:

```bash
sudo -u evandro sudo -n -l
```

Não execute os comandos permitidos manualmente apenas para testá-los.

## 5. Validação

1. `GET /health` retorna 200 sem credenciais.
2. `GET /api/dashboard` retorna 401 sem sessão.
3. Login inicial funciona e obriga a troca de senha.
4. Após login, E01 aparece com histórico, mapa e dados dos sensores.
5. CSV da E01 e CSV consolidado são baixados com cabeçalho e linhas reais.
6. Enviar reinício do coletor pelo painel; observar `RUNNING` no systemd, confirmação `SUCCESS` e auditoria.
7. Reboot da Raspberry: comando começa `RUNNING`, fica indisponível durante reboot e só termina `SUCCESS` quando a E01 voltar com outro `bootId`.
8. Confirmar que o broker MQTT/mTLS da Dojot continua recebendo dados.

## Rollback

No servidor, voltar para a branch funcional anterior e reconstruir somente API/Web:

```bash
cd /u01/dengue-saas
git switch feat/estacao-pi5-monitoramento-20261106
docker compose -p dengue-saas -f docker-compose.prod.yml up -d --build api web
```

O schema novo é aditivo, então suas novas tabelas podem permanecer sem uso.
Na Raspberry, voltar a branch do agente e reiniciar somente `dengue-saas-agent@evandro.service`.
As credenciais antigas não precisam ser recuperadas. Mantenha o backup do PostgreSQL.

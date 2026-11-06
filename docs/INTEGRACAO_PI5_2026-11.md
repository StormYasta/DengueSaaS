# Integração da Raspberry Pi 5 ao DengueSaaS

## Ambiente já utilizado (verificar antes de executar)
- Servidor DengueSaaS: `192.168.58.123`, usuário `evandro`, diretório `~/apps/DengueSaaS`
- Dashboard: `http://192.168.58.123:8090`
- Docker Compose: `docker-compose.prod.yml` (PostgreSQL + API + frontend)
- Dojot compartilha o host, mas a porta 8080 e seus containers não devem ser alterados
- Agente novo: somente monitoramento. **Não** acessa GPIO, não inicia MQTT e não substitui o serviço do coletor em produção

> Os comandos abaixo são para execução no servidor/Raspberry via SSH.
> Não foram executados remotamente pela criação desta branch.

## 1. Atualizar servidor sem interromper Dojot

No servidor:

```bash
ssh evandro@192.168.58.123
cd ~/apps/DengueSaaS
git status --short
# Caso haja alterações locais, preservá-las antes de trocar de branch.
git fetch origin
git switch feat/estacao-pi5-monitoramento-20261106

# Backup lógico do banco antes do deploy.
mkdir -p ~/backups/dengue-saas
docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > ~/backups/dengue-saas/dengue-saas-$(date +%F-%H%M).sql
```

No arquivo `~/apps/DengueSaaS/.env`, **preservar** as configurações PostgreSQL existentes e conferir:

```dotenv
APP_PORT=8090
CORS_ORIGIN=http://192.168.58.123:8090
OFFLINE_AFTER_SECONDS=120
STATION_API_KEY=GERAR_UM_SEGREDO_ALEATORIO
ADMIN_API_KEY=GERAR_OUTRO_SEGREDO_ALEATORIO
```

Gerar chaves distintas com `openssl rand -hex 32`. Manter .env fora do Git.
Se existir agente antigo ainda publicando no SaaS, primeiro atualizar seu credenciamento;
ativar `STATION_API_KEY` interrompe heartbeats sem `X-Station-Key`.

```bash
docker compose -f docker-compose.prod.yml up -d --build api web
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:8090/health
```

A operação acima recria somente os containers do SaaS informados; não rodar
`docker compose down -v` e não mexer nos containers Dojot.

## 2. Instalar agente de monitoramento na Raspberry

Acessar a Raspberry por SSH; não desativar seu `estacao.service` nem alterar
o código do coletor/MQTT existente:

```bash
sudo git clone --branch feat/estacao-pi5-monitoramento-20261106 https://github.com/StormYasta/DengueSaaS.git /opt/dengue-saas-agent
sudo python3 -m venv /opt/dengue-saas-agent/agent/.venv
sudo /opt/dengue-saas-agent/agent/.venv/bin/pip install -r /opt/dengue-saas-agent/agent/requirements-monitor.txt
sudo cp /opt/dengue-saas-agent/agent/.env.monitor.example /opt/dengue-saas-agent/agent/.env
sudo nano /opt/dengue-saas-agent/agent/.env
```

Configurar `SAAS_AGENT_KEY` igual a `STATION_API_KEY`, `STATION_SLUG`,
`SERVICE_NAME` com o nome real do coletor, e o **caminho real** de
`SENSOR_CSV_FILE` ou `SENSOR_JSON_FILE`. Se não houver arquivo compartilhado
de leituras, o agente já monitora CPU, RAM, disco, temperatura da CPU e serviço,
mas não enviará telemetria ambiental até configurar a fonte.

```bash
sudo chgrp "$(id -gn)" /opt/dengue-saas-agent/agent/.env
sudo chmod 640 /opt/dengue-saas-agent/agent/.env
sudo cp /opt/dengue-saas-agent/agent/dengue-saas-agent@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now "dengue-saas-agent@$(id -un).service"
sudo systemctl status "dengue-saas-agent@$(id -un).service" --no-pager
journalctl -u "dengue-saas-agent@$(id -un).service" -n 60 --no-pager
```

O serviço do agente envia heartbeats a cada 30s. A coleta ambiental pode
continuar em seu próprio intervalo (por exemplo 15 minutos).

## 3. Coordenadas manuais

No painel da estação, editar latitude e longitude e fornecer a chave
`ADMIN_API_KEY` no momento de salvar. A chave não é persistida no navegador.
O heartbeat **não** sobrescreve latitude/longitude definidas no servidor.

Exemplo para testar via API:

```bash
curl -X PATCH http://127.0.0.1:8090/api/stations/ID_DA_ESTACAO/location \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: SUA_ADMIN_API_KEY" \
  -d '{"latitude":-20.8339,"longitude":-49.3999}'
```

Os números são ilustrativos: usar a localização real da estação.

## 4. Validação

1. O endpoint `/health` retorna `ok: true`.
2. O log do novo serviço mostra `Heartbeat OK (201)`.
3. No dashboard, a estação E01 aparece online e com CPU/RAM/disco reais.
4. Quando houver CSV/JSON acessível, sensores aparecem no histórico ambiental.
5. As coordenadas persistem após novo heartbeat.
6. Dojot continua recebendo MQTT normalmente do coletor existente.

**Limitações atuais:** a autenticação de usuários do painel ainda não foi
implementada; manter o SaaS na rede interna ou atrás de acesso protegido.
A chave de estação e a chave administrativa via HTTP não devem trafegar
pela internet sem HTTPS/VPN. A API ainda registra leituras ambientais como eventos
`SENSOR_PAYLOAD` (antes de migrar para tabela de telemetria dedicada).

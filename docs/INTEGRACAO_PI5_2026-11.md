# Deploy do DengueSaaS no servidor 10.22.0.24

> **Instalação nova.** O antigo host `192.168.58.123` não é mais utilizado.
> Os comandos foram preparados, mas **não foram executados por SSH** nesta conversa.

## Escopo

- Servidor: `10.22.0.24` (acesso SSH já utilizado como `root`).
- Dojot existente: arquivos em `/u01/docker-compose`; **não alterar** o projeto, rede ou containers.
- DengueSaaS: instalar em `/u01/dengue-saas`, isolado em seu próprio Docker Compose.
- Banco: PostgreSQL em volume exclusivo do DengueSaaS, sem porta de banco publicada no host.
- Acesso web sugerido: `http://10.22.0.24:8090`, **somente se a porta estiver disponível**.
- Estação Raspberry Pi: continuará publicando MQTT pela rotina atual. O agente novo consulta CPU, RAM, disco, temperatura e status `systemd`, além de ler a última medição CSV/JSON produzida pelo coletor.
- GPS dispensado; coordenadas definidas manualmente no painel.

## Etapa 1 — Inspecionar o servidor, sem alterações

No computador com acesso à rede do servidor:

```bash
ssh root@10.22.0.24
hostname
docker --version
docker compose version
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
ss -ltnp | grep -E '(:8090|:8080|:5432)\b' || true
df -h /u01
free -h
```

Confirmar que `8090/tcp` não está ocupada e há espaço/memória adequados.
Se estiver ocupada, escolher outra porta e substituir `8090` nas instruções,
inclusive `APP_PORT`, `CORS_ORIGIN` e `SAAS_API_URL`.

## Etapa 2 — Instalação nova em /u01/dengue-saas

Executar **somente após inspecionar** o resultado da etapa 1.

```bash
test ! -e /u01/dengue-saas || { echo "Pasta /u01/dengue-saas já existe; inspecione antes"; exit 1; }
git clone --branch feat/estacao-pi5-monitoramento-20261106 \
  https://github.com/StormYasta/DengueSaaS.git /u01/dengue-saas
cd /u01/dengue-saas
```

Se o repositório exigir autenticação GitHub, usar seu acesso já configurado ao Git;
não colocar tokens no comando ou no repositório.

Gerar credenciais aleatórias sem publicá-las no Git e criar o `.env` do servidor:

```bash
umask 077
DB_PASS="$(openssl rand -hex 24)"
STATION_KEY="$(openssl rand -hex 32)"
ADMIN_KEY="$(openssl rand -hex 32)"
cat > .env <<EOF
POSTGRES_USER=dengue
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=dengue_saas
APP_PORT=8090
CORS_ORIGIN=http://10.22.0.24:8090
OFFLINE_AFTER_SECONDS=120
STATION_API_KEY=${STATION_KEY}
ADMIN_API_KEY=${ADMIN_KEY}
EOF
chmod 600 .env
unset DB_PASS STATION_KEY ADMIN_KEY
docker compose -p dengue-saas -f docker-compose.prod.yml config --quiet
```

> Preserve o `.env` do servidor. A chave `STATION_API_KEY` também deve ser
> configurada no agente da Raspberry como `SAAS_AGENT_KEY`.
> `ADMIN_API_KEY` é usada no painel para editar as coordenadas.
> Não envie nenhuma dessas credenciais por chat, Git ou prints.

Iniciar apenas os serviços deste projeto:

```bash
docker compose -p dengue-saas -f docker-compose.prod.yml up -d --build
docker compose -p dengue-saas -f docker-compose.prod.yml ps
curl -fsS --max-time 10 http://127.0.0.1:8090/health
curl -fsS --max-time 10 http://127.0.0.1:8090/api/dashboard
```

O `api` cria as tabelas do banco no primeiro boot. Não usar
`docker compose down -v`: o volume `dengue-saas_postgres_data` conterá os dados reais.

Caso ocorra erro, obter somente os logs desta instalação:

```bash
docker compose -p dengue-saas -f docker-compose.prod.yml logs --tail=100 api web postgres
```

## Etapa 3 — Habilitar envio da Raspberry Pi

O novo agente `agent/station_agent.py` é independente do coletor MQTT.
Não altera GPIO, I2C, DNS ou certificados da Dojot. Na Raspberry:

```bash
sudo git clone --branch feat/estacao-pi5-monitoramento-20261106 \
  https://github.com/StormYasta/DengueSaaS.git /opt/dengue-saas-agent
sudo python3 -m venv /opt/dengue-saas-agent/agent/.venv
sudo /opt/dengue-saas-agent/agent/.venv/bin/pip install \
  -r /opt/dengue-saas-agent/agent/requirements-monitor.txt
sudo cp /opt/dengue-saas-agent/agent/.env.monitor.example \
  /opt/dengue-saas-agent/agent/.env
sudo nano /opt/dengue-saas-agent/agent/.env
```

Confirmar `SAAS_API_URL=http://10.22.0.24:8090/api`, definir
`SAAS_AGENT_KEY` correspondente ao servidor, o nome real do serviço de coleta
(`SERVICE_NAME`) e **um** dos arquivos de saída da coleta:
`SENSOR_CSV_FILE` ou `SENSOR_JSON_FILE`.

Se não houver arquivo compartilhado, deixar ambos vazios inicialmente:
o monitoramento da Raspberry funcionará sem dados dos sensores.
Depois de confirmar nome do usuário `whoami`, instalar serviço:

```bash
sudo chgrp "$(id -gn)" /opt/dengue-saas-agent/agent/.env
sudo chmod 640 /opt/dengue-saas-agent/agent/.env
sudo cp /opt/dengue-saas-agent/agent/dengue-saas-agent@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now "dengue-saas-agent@$(id -un).service"
journalctl -u "dengue-saas-agent@$(id -un).service" -n 50 --no-pager
```

Verificar a conectividade `curl -fsS http://10.22.0.24:8090/health` na Raspberry.
Se a estação estiver em outra rede, será necessário roteamento ou uma VPN.

## Etapa 4 — Coordenadas fixas

Abrir `http://10.22.0.24:8090`, selecionar a estação E01,
informar latitude/longitude reais e fornecer a chave administrativa apenas
no momento de salvar. A API não permite que os heartbeats sobrescrevam
essas coordenadas.

## Checklist de aceitação

1. O dashboard carrega no IP/porta selecionados.
2. `/health` responde `{"ok":true,...}`.
3. Estação envia heartbeat a cada 30s e aparece online.
4. A temperatura do sistema não é confundida com a leitura DHT22.
5. Últimas medições dos sensores aparecem quando CSV/JSON configurado.
6. Latitude e longitude persistem após novos heartbeats.
7. Dojot segue recebendo MQTT e seus containers permanecem inalterados.

## Operação e segurança

A API usa chave de estação para aceitar heartbeats e chave administrativa
para edição de coordenadas. **Ainda não existe autenticação de usuários
para visualizar o dashboard.** A instalação deve permanecer em rede privada
ou receber proteção adicional de autenticação, HTTPS/VPN e firewall antes
de ficar pública. Mesmo dentro da rede, o uso de HTTP transmite essas
chaves sem criptografia. Não expor `8090/tcp` na internet.

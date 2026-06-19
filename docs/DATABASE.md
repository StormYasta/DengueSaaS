# Banco de dados

## Entidades principais

### stations

Representa cada Raspberry Pi/estação climática.

Campos principais:

- name
- slug
- location
- ipAddress
- agentVersion
- status
- serviceStatus
- lastHeartbeatAt
- lastDataReceivedAt
- últimas métricas recebidas

### heartbeats

Registra cada heartbeat recebido.

Uso:

- Auditoria
- Diagnóstico
- Verificação de comunicação

### metrics

Histórico de métricas para gráficos.

Uso:

- CPU
- RAM
- disco
- temperatura
- uptime

### events

Eventos operacionais derivados pelo backend.

Exemplos:

- Serviço parado
- Temperatura alta
- Disco cheio

### station_logs

Logs enviados pelo agente ou coletor Python.

### commands

Comandos remotos controlados para versões futuras.

Exemplos:

- restart_service
- reboot_device
- update_script

## Observação de escala

Para poucas estações, PostgreSQL puro resolve muito bem.

Quando o volume crescer, considerar:

- Particionamento por data em `metrics`
- Retenção automática de dados antigos
- TimescaleDB
- Agregações horárias/dia

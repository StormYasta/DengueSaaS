# Arquitetura — DengueSaaS Monitor

## 1. Visão geral

A plataforma possui três componentes principais:

1. **Agente local**: roda em cada Raspberry Pi, coleta métricas e envia heartbeat periódico.
2. **Backend central**: API REST responsável por receber dados, persistir histórico e entregar informações ao dashboard.
3. **Frontend web**: dashboard moderno para acompanhamento operacional das estações.

```txt
Raspberry Pi
  └── Agent Python
        ├── psutil
        ├── systemctl
        └── POST /api/heartbeats

Servidor Central
  ├── Fastify API
  ├── Prisma ORM
  └── PostgreSQL

Usuário
  └── React Dashboard
```

## 2. Comunicação

### Heartbeat

Cada agente envia um heartbeat em intervalo configurável, por padrão 30 segundos.

Payload principal:

```json
{
  "stationSlug": "E01",
  "stationName": "Estação 01",
  "location": "Laboratório",
  "ipAddress": "192.168.0.20",
  "agentVersion": "1.0.0",
  "serviceStatus": "RUNNING",
  "cpuPercent": 15,
  "memoryPercent": 42,
  "diskPercent": 65,
  "temperatureCelsius": 48.2,
  "uptimeSeconds": 30221,
  "lastCollectionAt": "2026-06-19T12:00:00.000Z",
  "recordsLast24h": 5234
}
```

## 3. Regra de online/offline

No MVP, a estação é considerada online quando o último heartbeat foi recebido há menos de `OFFLINE_AFTER_SECONDS`.

Valor padrão:

```txt
120 segundos
```

## 4. Backend

Responsabilidades:

- Cadastro e listagem de estações
- Recebimento de heartbeats
- Armazenamento de métricas históricas
- Registro de eventos
- Registro de logs
- Exposição dos dados para o dashboard

## 5. Frontend

Funcionalidades do MVP:

- Dashboard geral
- Cards de resumo
- Pesquisa de estações
- Tabela com status operacional
- Tela de detalhes
- Gráfico histórico de CPU, RAM, disco e temperatura
- Tema claro/escuro

## 6. Agente local

Responsabilidades:

- Coletar CPU, RAM, disco, temperatura e uptime
- Verificar status do serviço `systemd`
- Enviar heartbeat para a API
- Futuramente receber comandos pendentes

## 7. Segurança futura

No MVP a API ainda não exige autenticação por estação.

Para produção, adicionar:

- API key por estação
- Assinatura HMAC no heartbeat
- TLS obrigatório
- Rate limit
- Registro de auditoria
- Controle RBAC no painel

## 8. Alertas futuros

Alertas recomendados:

- Estação offline
- Serviço parado
- CPU alta
- Temperatura elevada
- Disco cheio
- Ausência de transmissão de dados

Integrações:

- Telegram: simples e barato para começar
- Discord: bom para equipe técnica
- WhatsApp: via Iris API/Noryn, quando quiser alertas comerciais

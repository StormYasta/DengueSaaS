# DengueSaaS — Plataforma de Monitoramento de Estações Climáticas IoT

MVP de uma plataforma web para monitoramento e gerenciamento de estações climáticas baseadas em Raspberry Pi.

## Objetivo

Centralizar a saúde operacional das estações climáticas usadas em pesquisa acadêmica, reduzindo a necessidade de diagnóstico manual via AnyDesk/terminal.

O sistema monitora:

- Status online/offline
- Último heartbeat
- CPU, RAM, disco e temperatura da Raspberry Pi
- Status do serviço `systemd` responsável pela coleta
- Tempo desde o último dado recebido
- Histórico de métricas
- Eventos operacionais

## Arquitetura

```txt
Raspberry Pi / Agente Python
        |
        | POST /api/heartbeats
        v
Backend Fastify + Prisma + PostgreSQL
        |
        | REST API
        v
Frontend React + Vite
```

## Estrutura

```txt
.
├── apps
│   ├── api      # Backend REST
│   └── web      # Dashboard React
├── agent        # Agente Python para Raspberry Pi
├── docs         # Arquitetura, banco, API e roadmap
└── docker-compose.yml
```

## Stack

- Backend: Node.js, Fastify, TypeScript, Prisma
- Banco: PostgreSQL
- Frontend: React, Vite, Recharts
- Agente: Python 3, psutil, requests
- Alertas futuros: Telegram, Discord e WhatsApp

## Como rodar o MVP

### 1. Banco de dados

```bash
docker compose up -d postgres
```

### 2. Backend

```bash
cd apps/api
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

API em: `http://localhost:3333`

### 3. Frontend

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

Dashboard em: `http://localhost:5173`

### 4. Agente Python

```bash
cd agent
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python station_agent.py
```

## Integração atual (Raspberry Pi 5 + Dojot)

Para integrar uma estação que já possui um coletor MQTT ativo, use o agente
**independente** `agent/station_agent.py`: ele não disputa GPIO, ADS1115 ou
DHT22 com o serviço existente. Os dados ambientais podem ser lidos de um CSV/JSON
gerado pelo coletor. Configure `agent/.env.monitor.example` e instale
`agent/dengue-saas-agent@.service`.

O servidor já utilizado em laboratório oferece o SaaS na porta `8090`,
sem interferir na porta `8080` da Dojot. As coordenadas são mantidas
manualmente no painel, com chave `ADMIN_API_KEY`, e não são atualizadas
pelos heartbeats.

Procedimento detalhado: [Integração Pi 5](docs/INTEGRACAO_PI5_2026-11.md).

## MVP implementado

- Cadastro/listagem de estações
- Recebimento de heartbeat
- Atualização automática do status da estação
- Histórico de métricas
- Dashboard geral
- Tela de detalhes
- Detecção de online/offline no backend
- Agente Python coletando métricas reais do sistema
- Logs remotos básicos
- Documentação de arquitetura, API, banco e roadmap

## Próximas versões

### Versão 2

- Alertas
- Notificações Telegram/Discord/WhatsApp
- Autenticação por estação

### Versão 3

- Reinício remoto de serviço
- Reinício remoto da Raspberry Pi
- Atualização remota dos scripts
- Execução remota de comandos controlados

Leia a documentação completa em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

# Deploy em servidor com Docker

Este guia sobe o DengueSaaS em modo servidor usando Docker Compose.

A stack de produção possui:

- `postgres`: banco PostgreSQL com volume persistente
- `api`: backend Fastify + Prisma
- `web`: frontend React servido pelo Nginx

O Nginx do container `web` também faz proxy de `/api` para o container `api`, então o navegador acessa tudo pela mesma porta pública.

## Pré-requisitos no servidor

No Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
```

Instale Docker e Docker Compose Plugin conforme sua distribuição.

Teste:

```bash
docker --version
docker compose version
```

## Instalação

Clone o projeto:

```bash
git clone https://github.com/StormYasta/DengueSaaS.git
cd DengueSaaS
```

Crie o arquivo de ambiente:

```bash
cp .env.production.example .env.production
nano .env.production
```

Ajuste principalmente:

```env
APP_PORT=8080
POSTGRES_PASSWORD=troque_esta_senha
CORS_ORIGIN=http://IP_DO_SERVIDOR:8080
```

Suba a stack:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Acompanhe os logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

Acesse:

```txt
http://IP_DO_SERVIDOR:8080
```

## Atualização

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## Parar a stack

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

## Backup do banco

```bash
docker exec dengue-saas-postgres pg_dump -U dengue dengue_saas > backup_dengue_saas.sql
```

## Restaurar backup

```bash
cat backup_dengue_saas.sql | docker exec -i dengue-saas-postgres psql -U dengue dengue_saas
```

## Observação sobre banco e Prisma

No MVP, o container da API executa:

```bash
npx prisma db push
```

Isso sincroniza o schema Prisma com o PostgreSQL automaticamente ao iniciar a API. Para produção mais madura, o ideal é trocar isso por migrations versionadas com:

```bash
prisma migrate deploy
```

## Próximo passo: estações Raspberry Pi

Com o servidor no ar, cada estação deve enviar heartbeat para:

```txt
http://IP_DO_SERVIDOR:8080/api/heartbeats
```

No arquivo `.env` do agente:

```env
API_URL=http://IP_DO_SERVIDOR:8080/api
STATION_SLUG=E01
STATION_NAME=UBS Central / Boa Vista
STATION_LOCATION=São José do Rio Preto
SERVICE_NAME=coletor-clima.service
HEARTBEAT_INTERVAL_SECONDS=30
AGENT_VERSION=1.0.0
```

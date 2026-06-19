# API — DengueSaaS Monitor

Base local:

```txt
http://localhost:3333/api
```

## Health check

```http
GET /health
```

## Dashboard

```http
GET /api/dashboard
```

Retorna resumo e lista das estações.

## Estações

### Listar estações

```http
GET /api/stations
```

### Criar estação

```http
POST /api/stations
Content-Type: application/json

{
  "name": "Estação 01",
  "slug": "E01",
  "location": "Laboratório"
}
```

### Detalhar estação

```http
GET /api/stations/:id
```

### Histórico de métricas

```http
GET /api/stations/:id/metrics?limit=120
```

## Heartbeats

```http
POST /api/heartbeats
Content-Type: application/json

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

## Logs

```http
POST /api/logs
Content-Type: application/json

{
  "stationSlug": "E01",
  "level": "ERROR",
  "source": "collector",
  "message": "Sensor desconectado"
}
```

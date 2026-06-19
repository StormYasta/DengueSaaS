# Dados mock para apresentação

Este projeto possui um seed do Prisma para preencher o banco com dados fictícios de demonstração.

## Como carregar os dados

Com o PostgreSQL rodando:

```bash
cd apps/api
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Depois rode o frontend:

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

Acesse:

```txt
http://localhost:5173
```

## Cenários simulados

### E01 - Laboratório FATEC

Estação online e saudável.

Ideal para mostrar o fluxo normal:

- Heartbeat recente
- Serviço `RUNNING`
- Métricas estáveis
- Coleta recente

### E02 - Área Externa

Estação offline.

Ideal para mostrar diagnóstico centralizado:

- Sem heartbeat há horas
- Última transmissão antiga
- Evento crítico de estação offline

### E03 - Caixa Protegida

Estação online, mas com serviço de coleta falhando.

Ideal para explicar que uma Raspberry pode estar ligada, mas a coleta climática pode estar parada.

- Heartbeat recente
- Serviço `FAILED`
- Sem transmissão recente de dados
- Logs de timeout de sensor

### E04 - Telhado Bloco B

Estação online com sinais de risco operacional.

- CPU alta
- RAM elevada
- Disco acima de 90%
- Temperatura elevada

### E05 - Jardim Experimental

Estação cadastrada, mas ainda não instalada/conectada.

- Sem heartbeat
- Sem métricas
- Evento de estação aguardando primeiro contato

## História sugerida para apresentar

A ideia principal da demonstração é mostrar que o sistema não serve apenas para saber se a Raspberry está ligada.

Ele responde três perguntas importantes:

1. A estação está online?
2. O serviço de coleta está funcionando?
3. Os dados climáticos estão realmente chegando?

Com isso, o responsável pelo projeto consegue identificar rapidamente se o problema está na conexão, no serviço Python, no sensor, no armazenamento ou no próprio equipamento.

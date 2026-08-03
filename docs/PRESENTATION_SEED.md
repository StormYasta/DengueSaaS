# Dados mock para apresentação

Este guia popula o banco real do servidor com 10 estações demonstrativas para apresentação.

O seed cria estações com status variados:

- Online / saudável
- Atenção / warning
- Offline / crítico
- Serviço de coleta com falha
- Uso de disco alto
- Atraso na transmissão de dados

As estações são mockadas com referências territoriais de São José do Rio Preto, incluindo a FATEC Rio Preto e unidades/regiões inspiradas em UBS.

## Executar no servidor

Dentro da pasta do projeto:

```bash
cd ~/apps/DengueSaaS
```

Atualize o código:

```bash
git pull
```

Recrie os containers para copiar o novo script para dentro da imagem da API:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Execute o seed de apresentação:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api node prisma/seed-presentation.mjs
```

Depois acesse o painel:

```txt
http://IP_DO_SERVIDOR:8090
```

## Observação

O seed usa `upsert` por `slug`, então ele atualiza as estações `E01` até `E10` se elas já existirem.

Se uma estação real com o mesmo `slug` estiver enviando heartbeat, ela pode sobrescrever parte do mock no próximo envio. Para apresentação, pause temporariamente o serviço da estação real ou deixe ela ligada como a E01 piloto.

## Voltar a rodar

Pode executar o seed novamente quantas vezes quiser antes da apresentação:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api node prisma/seed-presentation.mjs
```

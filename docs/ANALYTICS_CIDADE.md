# DengueSaaS — médias urbanas e telemetria por período

## Funcionalidades

**Visão geral**: primeiro bloco `Resumo da cidade` com temperatura média, umidade média, velocidade média do vento e indicador bruto do MQ-135. Inclui quantidade de estações representadas por métrica, número online, atualização da última amostra e aviso de que média da rede não equivale à média de toda a cidade.

**Filtros** nas telas `Visão geral` e `Telemetria`:
- 1 hora, 6 horas, 12 horas, 24 horas, 7 dias, 30 dias;
- período personalizado com horários de início e fim (mínimo 1 minuto, máximo 30 dias);
- seleção de todas ou uma estação específica na visão geral.

**Gráficos**: temperatura, umidade, vento e MQ-135 separados, uma unidade e um eixo vertical por card, sem interpolar faltas. Condições operacionais de CPU, RAM, disco e temperatura da Raspberry também separadas por gráfico.

**Sensores sem dados**: pressão não é mostrada caso não haja pressão positiva; blocos de RPM/pulsos/janela somem caso não existam. Direção negativa e vento parado não são exibidos como direção real.

## Endpoint

`GET /api/analytics?range=24h`

`GET /api/analytics?range=7d&stationId=<id>`

`GET /api/analytics?range=custom&from=2026-11-08T00%3A00%3A00-03%3A00&to=2026-11-09T00%3A00%3A00-03%3A00`

Sessão administrativa obrigatória, como nas outras rotas de leitura.

Responde:
- `averages`: médias das últimas amostras disponíveis de estações **online** cuja coleta ocorreu nos últimos 40 minutos (em cada métrica, uma observação por estação).
- `samplesByMetric`: quantas estações forneceram uma leitura válida por métrica.
- `series`: média histórica com **peso igual por estação em cada intervalo**. Estações atualmente offline podem participar do histórico de períodos passados.
- `systemSeries`: médias por intervalo de CPU, RAM, disco e temperatura da Raspberry (apenas quando filtrada por uma estação).
- `bucketMinutes`, `snapshotAt`, contagem de estações, `timeBasis`.

**Temporalidade:** o histórico consulta eventos que chegaram ao servidor durante a janela selecionada e, quando disponível, usa o timestamp da coleta armazenado no payload para situá-los no gráfico. Uma leitura antiga que só tenha sido enviada depois da janela histórica selecionada pode não ser encontrada numa pesquisa retroativa. Para auditoria científica com backfill completo, evoluir futuramente para coluna indexada `sampledAt` nos eventos.

**Validação:** leituras não numéricas, fora dos limites e o par DHT22 `0/0` são ignorados para médias. Vento de valor zero é válido. O MQ-135 é representado por leitura/indicador bruto, **não** como ppm calibrado. Dados meteorológicos não representam uma média oficial da cidade.

## Implantar no 10.22.0.24

A versão atual não exige migrations e não muda agente, certificados nem Dojot.

```bash
cd /u01/dengue-saas
git status --short
git fetch origin
git switch feat/analytics-cidade-filtros-20261109
docker compose -p dengue-saas -f docker-compose.prod.yml up -d --build api web
docker compose -p dengue-saas -f docker-compose.prod.yml ps
curl -i http://127.0.0.1:8090/health
curl -i 'http://127.0.0.1:8090/api/analytics?range=24h'
```

Esperado: três containers ativos/healthy; `/health` 200; `/api/analytics` sem login 401. Acesse painel autenticado, selecione E01 e confira tendências.

## Checklist manual

1. `Resumo da cidade` mostra média e contribuição (com E01 única, corresponde à leitura dela).
2. Alterar 24h para 1h e 7d altera a quantidade de pontos no histórico; escolher datas personalizadas funciona.
3. Filtrar E01 no painel inicial altera séries, mapa e tabela.
4. No painel de E01, mudar período modifica gráficos ambientais **e** indicadores operacionais.
5. Umidade tem escala 0–100; os outros gráficos têm apenas um eixo vertical.
6. O período sem leituras mostra estado vazio, sem inventar zero.
7. A estação continua online via heartbeat, e a conexão MQTT/mTLS da Dojot não é afetada.
8. Autenticação existente, exportações CSV e comandos remotos continuam presentes.

## Rollback sem perda de dados

```bash
cd /u01/dengue-saas
git switch feat/admin-console-20261109
docker compose -p dengue-saas -f docker-compose.prod.yml up -d --build api web
```

Não executar `docker compose down -v`.

# Mapa das 10 regiões de São José do Rio Preto

## Finalidade e fonte

O SIG Rio Preto (https://sig.riopreto.sp.gov.br/portal/home/) apresenta as dez regiões de planejamento: Bosque, Central, CEU, Cidade da Criança, HB, Pinheirinho, Represa, Schmitt, Talhado e Vila Toninho.

A representação no DengueSaaS deve usar a **geometria vetorial real** da Prefeitura. É proibido aproximar os limites por screenshot ou por vértices inventados. Em novembro de 2026, as consultas automáticas ao portal SIG estavam retornando erro, por isso nenhum polígono foi commitado sem verificação.

**Atenção:** não confundir essas regiões internas com as microrregiões geográficas interestaduais do IBGE.

## Como obter a camada oficial

1. Acesse o portal SIG Rio Preto e abra o Mapa Digital (mapa historicamente associado ao item `a2d1e2a003dd450b8af235748758904b`).
2. Na lista de camadas, procure `Regiões`, `Divisão geográfica` ou equivalente.
3. Se o portal fornecer **Exportar Dados**, selecione GeoJSON em WGS84 / EPSG:4326.
4. Se houver somente ArcGIS MapServer/FeatureServer, localize o endereço completo da camada na interface do portal. Consulte os metadados do serviço e exporte via QGIS ou ArcGIS. Endpoints `.../query?where=1%3D1&outFields=*&outSR=4326&f=geojson` são um padrão geral de ArcGIS, **não** um link verificado do SIG Rio Preto; use apenas com o endereço real obtido na fonte.
5. Se não houver exportação pública, solicite à equipe de geoprocessamento da Prefeitura um SHP ou GeoJSON das dez regiões. No QGIS, exporte SHP como GeoJSON com CRS `EPSG:4326`. Caso existam múltiplos polígonos de uma região, eles podem permanecer separados.

### Formato aceito

- `FeatureCollection` padrão GeoJSON com no mínimo 10 features.
- Cada feature possui geometria `Polygon` ou `MultiPolygon`.
- Propriedade identificadora do nome: `name`, `nome`, `NOME`, `REGIAO`, `regiao`, `NM_REGIAO` ou equivalentes suportadas pelo importador.
- Exatamente 10 nomes distintos reconhecidos. Pode haver múltiplos polígonos por região.
- Posições no formato **[longitude, latitude]** em WGS84, anéis fechados.
- Até 7 MB para upload e até 150.000 vértices. Simplifique a camada se necessário sem descaracterizar seus limites.

## Importar

1. Faça login como administrador.
2. Abra **Configurações → Divisão geográfica — 10 regiões**.
3. Selecione o `.geojson` oficial e preencha o endereço da fonte.
4. Clique em **Importar as 10 regiões**.
5. O backend valida as 10 regiões e grava a geometria na tabela `RegionMap` do PostgreSQL; a operação fica auditada.
6. Abra **Visão geral** e use **Ocultar/Mostrar regiões**, o seletor de região e o clique nos polígonos.

O filtro de região usa teste ponto-em-polígono das **coordenadas cadastradas no SaaS** de cada estação. Estações sem coordenadas não podem ser associadas automaticamente. As médias da cidade permanecem calculadas conforme o filtro de estação na barra principal; selecionar a região filtra os pontos e a tabela, **não** altera silenciosamente as médias.

## Implantação no 10.22.0.24

Esta branch é derivada de `feat/analytics-cidade-filtros-20261109`; o servidor precisa ter essa base antes de receber a camada regional.

No servidor:

```bash
cd /u01/dengue-saas
git status --short
git fetch origin
git switch feat/mapa-regioes-riopreto-20261109
docker compose -p dengue-saas -f docker-compose.prod.yml up -d --build api web
docker compose -p dengue-saas -f docker-compose.prod.yml ps
curl -i http://127.0.0.1:8090/health
```

O startup Prisma `db push` adiciona a tabela `RegionMap` de forma aditiva. Antes de deploy, faça backup do PostgreSQL e guarde o arquivo `/u01/dengue-saas/.env`.

**Não precisa atualizar** Raspberry, Dojot ou certificados mTLS. Não executar `down -v`.

## Verificação

- Login e dashboard devem continuar operando.
- Antes de importar, o mapa deve exibir mensagem de que a malha ainda não está disponível, sem polígonos fictícios.
- Depois da importação, verificar 10 regiões, tooltips, seleção, opacidade, botão de camadas e E01 sobre o mapa.
- Conferir se E01 está dentro da região correta com base nas coordenadas definidas na plataforma.
- Exportações CSV e heartbeat da E01 devem continuar funcionando.

## Retorno à versão anterior

```bash
cd /u01/dengue-saas
git switch feat/analytics-cidade-filtros-20261109
docker compose -p dengue-saas -f docker-compose.prod.yml up -d --build api web
```

O dado da camada permanece no PostgreSQL; o rollback apenas deixa de utilizá-lo.

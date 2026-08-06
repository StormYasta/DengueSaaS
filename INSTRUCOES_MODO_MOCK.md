# DengueSaaS — modo mock sem Docker

Neste modo são usados somente:

- frontend React/Vite;
- dados simulados armazenados no navegador;
- dashboard ambiental criado pelo instalador Python V3.

Não são usados:

- Docker Compose;
- PostgreSQL;
- API Fastify;
- Raspberry Pi;
- conexão com sensores.

## 1. Aplicar o dashboard ambiental

Coloque o instalador Python V3 na raiz do projeto e execute:

```bat
py aplicar_dashboard_estacoes_v3.py
```

O instalador está no pacote anterior:

```text
DengueSaaS_dashboard_python_v3.zip
```

Ele adiciona ao modo local os dados simulados de:

- temperatura;
- umidade;
- qualidade do ar;
- chuva;
- velocidade e direção do vento;
- RPM e pulsos do anemômetro;
- gráficos históricos.

## 2. Colocar o inicializador na raiz

A estrutura deve ficar assim:

```text
DengueSaaS/
├── INICIAR_MODO_FEIRA.bat
├── aplicar_dashboard_estacoes_v3.py
├── apps/
│   └── web/
└── agent/
```

## 3. Iniciar

Dê dois cliques em:

```text
INICIAR_MODO_FEIRA.bat
```

O arquivo:

1. verifica se o npm está instalado;
2. executa `npm install` quando necessário;
3. inicia `npm run dev:local`;
4. abre o navegador em `http://localhost:5173`.

## Acesso

No notebook:

```text
http://localhost:5173
```

Em outro dispositivo na mesma rede:

```text
http://IP_DO_NOTEBOOK:5173
```

## Importante

Os dados são inteiramente simulados e ficam no `localStorage` do navegador.
Nenhuma leitura real da Raspberry é recebida nesse modo.

## Resetar os dados simulados

Abra o painel no navegador, pressione `F12`, abra a guia `Console` e execute:

```javascript
localStorage.removeItem('dengue-saas-presentation-data-v2');
location.reload();
```

## Encerrar

Volte à janela preta e pressione:

```text
CTRL+C
```

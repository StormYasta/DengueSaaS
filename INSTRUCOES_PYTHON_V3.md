# Instalador Python V3

Esta versão substitui os instaladores PowerShell e pode continuar mesmo que o
repositório tenha recebido alterações parciais anteriormente.

## Instalação

Coloque estes arquivos na raiz do repositório:

```text
DengueSaaS/
├── aplicar_dashboard_estacoes_v3.py
├── payload_dashboard_demo.json
├── apps/
├── agent/
└── docker-compose.prod.yml
```

No Prompt de Comando:

```bat
py aplicar_dashboard_estacoes_v3.py
```

Caso o comando `py` não exista:

```bat
python aplicar_dashboard_estacoes_v3.py
```

## Backup

O instalador cria automaticamente:

```text
.backup_dashboard_estacoes_python_v3/AAAAMMDD_HHMMSS/
```

## Depois da aplicação

```bat
docker compose -f docker-compose.prod.yml up -d --build
```

Abra:

```text
http://localhost:8080
```

## Raspberry

Copie somente:

```text
agent/estacao_dojot_saas.py
```

para a Raspberry e reinicie:

```bash
sudo systemctl restart estacao-dengue.service
sudo journalctl -u estacao-dengue.service -f
```

No `.env` da Raspberry:

```env
SAAS_API_URL=http://IP_DO_NOTEBOOK:8080/api
READ_INTERVAL_SECONDS=10
```

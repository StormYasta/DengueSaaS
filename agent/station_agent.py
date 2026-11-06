"""Agente de observabilidade. Não acessa GPIO nem altera o coletor MQTT."""
import csv
import json
import math
import os
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import psutil
import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

API_URL = os.getenv("SAAS_API_URL", os.getenv("API_URL", "http://localhost:3333/api")).rstrip("/")
API_KEY = os.getenv("SAAS_AGENT_KEY", "")
STATION_SLUG = os.getenv("STATION_SLUG", "E01")
STATION_NAME = os.getenv("STATION_NAME", STATION_SLUG)
STATION_LOCATION = os.getenv("STATION_LOCATION", "")
SERVICE_NAME = os.getenv("SERVICE_NAME", "estacao.service")
COLLECTOR_PROCESS_MATCH = os.getenv("COLLECTOR_PROCESS_MATCH", "").strip()
HEARTBEAT_INTERVAL_SECONDS = max(10, int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "30")))
SAAS_TIMEOUT_SECONDS = max(1, int(os.getenv("SAAS_TIMEOUT_SECONDS", "10")))
AGENT_VERSION = "1.2.0"

# O coletor existente permanece responsável por GPIO, CSV e publicação Dojot.
# Configure UMA origem de dados para acrescentar leituras meteorológicas ao heartbeat.
SENSOR_CSV_FILE = os.getenv("SENSOR_CSV_FILE", "")
SENSOR_JSON_FILE = os.getenv("SENSOR_JSON_FILE", "")

SENSOR_FIELDS = (
    "temperatura", "umidade", "pressao_abs", "pressao_rel",
    "qual_ar", "pluviometrico", "chuva_tensao", "vel_vento",
    "dir_vento", "anemometro_pulsos", "anemometro_rpm",
    "anemometro_intervalo_s",
)


def get_ip_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("192.0.2.1", 80))
            return sock.getsockname()[0]
    except OSError:
        return None


def get_cpu_temperature():
    try:
        return round(float(Path("/sys/class/thermal/thermal_zone0/temp").read_text().strip()) / 1000, 1)
    except (FileNotFoundError, OSError, ValueError):
        return None


def get_service_status():
    # Estações cujo coletor é executado manualmente (sem unidade systemd).
    # A busca é pelo nome exato do arquivo de script em um argumento do processo.
    if COLLECTOR_PROCESS_MATCH:
        try:
            for process in psutil.process_iter(["pid", "cmdline"]):
                if process.info["pid"] == os.getpid():
                    continue
                args = process.info.get("cmdline") or []
                if any(Path(arg).name == COLLECTOR_PROCESS_MATCH for arg in args[1:]):
                    return "RUNNING"
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
        return "STOPPED"

    if not SERVICE_NAME:
        return "UNKNOWN"

    try:
        result = subprocess.run(
            ["systemctl", "is-active", SERVICE_NAME],
            capture_output=True, text=True, timeout=3, check=False,
        )
        status = result.stdout.strip().lower()
        if status == "active":
            return "RUNNING"
        if status in {"inactive", "deactivating"}:
            return "STOPPED"
        if status in {"failed", "activating"}:
            return "FAILED"
    except (OSError, subprocess.TimeoutExpired):
        pass
    return "UNKNOWN"


def parse_timestamp(value, fallback):
    if value:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.astimezone()  # horário local da Raspberry Pi
            return dt.astimezone(timezone.utc).isoformat()
        except ValueError:
            pass
    return datetime.fromtimestamp(fallback, tz=timezone.utc).isoformat()


def normalize_reading(raw):
    payload = {}
    for field in SENSOR_FIELDS:
        value = raw.get(field)
        if value is None or value == "":
            continue
        if field == "pluviometrico" and isinstance(value, str):
            if value.lower() in {"true", "false"}:
                payload[field] = value.lower() == "true"
                continue
        try:
            number = float(value)
            if math.isfinite(number):
                if field == "anemometro_pulsos":
                    if number >= 0 and number.is_integer():
                        payload[field] = int(number)
                else:
                    payload[field] = number
        except (TypeError, ValueError):
            continue
    return payload


def latest_sensor_reading():
    path_str = SENSOR_JSON_FILE or SENSOR_CSV_FILE
    if not path_str:
        return None, None
    path = Path(path_str)
    if not path.is_file():
        return None, None

    try:
        if SENSOR_JSON_FILE:
            data = json.loads(path.read_text(encoding="utf-8"))
            raw = data.get("sensorPayload", data)
            if not isinstance(raw, dict):
                return None, None
            timestamp = data.get("timestamp") or data.get("collectedAt") or raw.get("timestamp")
        else:
            with path.open(encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                raw = None
                for row in reader:
                    if any(v for v in row.values()):
                        raw = row
            if raw is None:
                return None, None
            timestamp = raw.get("timestamp") or raw.get("collectedAt")

        payload = normalize_reading(raw)
        if not payload:
            return None, None
        return parse_timestamp(timestamp, path.stat().st_mtime), payload
    except (OSError, ValueError, json.JSONDecodeError, csv.Error) as exc:
        print(f"[SAAS] Não foi possível ler {path}: {exc}", flush=True)
        return None, None


def collect_heartbeat(last_collection_at, new_payload):
    data = {
        "stationSlug": STATION_SLUG,
        "stationName": STATION_NAME,
        "location": STATION_LOCATION,
        "ipAddress": get_ip_address(),
        "agentVersion": AGENT_VERSION,
        "serviceStatus": get_service_status(),
        "cpuPercent": psutil.cpu_percent(interval=0.2),
        "memoryPercent": psutil.virtual_memory().percent,
        "diskPercent": psutil.disk_usage("/").percent,
        "temperatureCelsius": get_cpu_temperature(),
        "uptimeSeconds": int(time.time() - psutil.boot_time()),
        "recordsLast24h": 0,
    }
    if data["ipAddress"] is None:
        del data["ipAddress"]
    if last_collection_at:
        data["lastCollectionAt"] = last_collection_at
    if new_payload:
        data["sensorPayload"] = new_payload
    return data


def main():
    print(f"[SAAS] Iniciando agente {AGENT_VERSION} para {STATION_SLUG} -> {API_URL}", flush=True)
    if not SENSOR_JSON_FILE and not SENSOR_CSV_FILE:
        print("[SAAS] Sem arquivo de sensores: somente saúde da Raspberry será monitorada.", flush=True)

    last_sent_reading = None
    session = requests.Session()
    if API_KEY:
        session.headers.update({"X-Station-Key": API_KEY})

    while True:
        try:
            timestamp, payload = latest_sensor_reading()
            has_new_reading = timestamp is not None and timestamp != last_sent_reading
            heartbeat = collect_heartbeat(timestamp, payload if has_new_reading else None)
            response = session.post(
                f"{API_URL}/heartbeats", json=heartbeat, timeout=SAAS_TIMEOUT_SECONDS
            )
            response.raise_for_status()
            if has_new_reading:
                last_sent_reading = timestamp
            print(f"[SAAS] Heartbeat OK ({response.status_code}); sensor_novo={has_new_reading}", flush=True)
        except (requests.RequestException, OSError) as exc:
            print(f"[SAAS] Falha na comunicação: {exc}", flush=True)

        time.sleep(HEARTBEAT_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()

import os
import socket
import subprocess
import time
from datetime import datetime, timezone

import psutil
import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv('API_URL', 'http://localhost:3333/api').rstrip('/')
STATION_SLUG = os.getenv('STATION_SLUG', 'E01')
STATION_NAME = os.getenv('STATION_NAME', STATION_SLUG)
STATION_LOCATION = os.getenv('STATION_LOCATION', '')
SERVICE_NAME = os.getenv('SERVICE_NAME', 'coletor-clima.service')
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv('HEARTBEAT_INTERVAL_SECONDS', '30'))
AGENT_VERSION = os.getenv('AGENT_VERSION', '1.0.0')


def get_ip_address() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(('8.8.8.8', 80))
            return sock.getsockname()[0]
    except OSError:
        return '127.0.0.1'


def get_temperature_celsius():
    paths = [
        '/sys/class/thermal/thermal_zone0/temp',
        '/sys/devices/virtual/thermal/thermal_zone0/temp',
    ]

    for path in paths:
        try:
            with open(path, 'r', encoding='utf-8') as file:
                raw = file.read().strip()
                return round(float(raw) / 1000, 1)
        except (FileNotFoundError, ValueError, OSError):
            continue

    return None


def get_service_status(service_name: str) -> str:
    try:
        result = subprocess.run(
            ['systemctl', 'is-active', service_name],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        status = result.stdout.strip().lower()

        if status == 'active':
            return 'RUNNING'
        if status == 'failed':
            return 'FAILED'
        if status in {'inactive', 'deactivating'}:
            return 'STOPPED'
        return 'UNKNOWN'
    except Exception:
        return 'UNKNOWN'


def collect_payload() -> dict:
    boot_time = psutil.boot_time()
    uptime_seconds = int(time.time() - boot_time)

    return {
        'stationSlug': STATION_SLUG,
        'stationName': STATION_NAME,
        'location': STATION_LOCATION or None,
        'ipAddress': get_ip_address(),
        'agentVersion': AGENT_VERSION,
        'serviceStatus': get_service_status(SERVICE_NAME),
        'cpuPercent': psutil.cpu_percent(interval=1),
        'memoryPercent': psutil.virtual_memory().percent,
        'diskPercent': psutil.disk_usage('/').percent,
        'temperatureCelsius': get_temperature_celsius(),
        'uptimeSeconds': uptime_seconds,
        'lastCollectionAt': datetime.now(timezone.utc).isoformat(),
        'recordsLast24h': 0,
    }


def send_heartbeat(payload: dict) -> None:
    response = requests.post(f'{API_URL}/heartbeats', json=payload, timeout=10)
    response.raise_for_status()


def main():
    print(f'Iniciando agente {AGENT_VERSION} para {STATION_SLUG}')
    print(f'API: {API_URL}')

    while True:
        try:
            payload = collect_payload()
            send_heartbeat(payload)
            print(f"Heartbeat enviado: {payload['stationSlug']} CPU={payload['cpuPercent']}% RAM={payload['memoryPercent']}%")
        except Exception as exc:
            print(f'Erro ao enviar heartbeat: {exc}')

        time.sleep(HEARTBEAT_INTERVAL_SECONDS)


if __name__ == '__main__':
    main()

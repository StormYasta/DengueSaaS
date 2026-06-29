import csv
import json
import math
import os
import signal
import socket
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

# ================== ENV ==================
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

CSV_FILE = os.getenv("CSV_FILE", str(BASE_DIR / "dados_estacao.csv"))

SAAS_API_URL = os.getenv("SAAS_API_URL", os.getenv("API_URL", "http://localhost:8090/api")).rstrip("/")
STATION_SLUG = os.getenv("STATION_SLUG", "E01")
STATION_NAME = os.getenv("STATION_NAME", "Estação 01")
STATION_LOCATION = os.getenv("STATION_LOCATION", "São José do Rio Preto")
STATION_LATITUDE = os.getenv("STATION_LATITUDE")
STATION_LONGITUDE = os.getenv("STATION_LONGITUDE")
SERVICE_NAME = os.getenv("SERVICE_NAME", "estacao-dengue.service")
AGENT_VERSION = os.getenv("AGENT_VERSION", "1.1.0")
READ_INTERVAL_SECONDS = int(os.getenv("READ_INTERVAL_SECONDS", "900"))
SAAS_TIMEOUT_SECONDS = int(os.getenv("SAAS_TIMEOUT_SECONDS", "10"))

MQTT_BROKER = os.getenv("MQTT_BROKER", "192.168.58.123")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1884"))
DEVICE_ID = os.getenv("DEVICE_ID", "admin:6421c9")
MQTT_USER = os.getenv("MQTT_USER", DEVICE_ID)
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_TOPIC = os.getenv("MQTT_TOPIC", f"{DEVICE_ID}/attrs")
MQTT_ENABLED = os.getenv("MQTT_ENABLED", "true").lower() == "true"

CLIENT_ID = f"{DEVICE_ID}-{socket.gethostname()}-{uuid.uuid4().hex[:6]}"

# ================== HARDWARE IMPORTS ==================
try:
    import board
    import busio
    import adafruit_dht
    import adafruit_ads1x15.ads1115 as ADS1115
    from adafruit_ads1x15.analog_in import AnalogIn
    from gpiozero import Button, Device
    from gpiozero.pins.lgpio import LGPIOFactory

    Device.pin_factory = LGPIOFactory()
    HARDWARE_AVAILABLE = True
except Exception as exc:
    print(f"[AVISO] Bibliotecas de hardware não disponíveis: {exc}")
    print("[AVISO] O agente vai iniciar, mas leituras de sensores ficarão zeradas.")
    HARDWARE_AVAILABLE = False

try:
    import paho.mqtt.client as mqtt
    MQTT_LIB_AVAILABLE = True
except Exception as exc:
    print(f"[AVISO] Biblioteca MQTT não disponível: {exc}")
    MQTT_LIB_AVAILABLE = False

# ================== CONSTANTES ==================
ANEMOMETRO_PIN = 17
DHT_PIN = None

R1_OHMS = 10000.0
R2_OHMS = 20000.0
DIVIDER_GAIN = (R1_OHMS + R2_OHMS) / R2_OHMS

R0 = 10.55
m_const = -0.3376
b_const = 0.7165

RAIO_ANEMOMETRO_MM = 105

# ================== ESTADO ==================
connected = False
last_connect_log = 0.0
contador_pulsos = 0
ultimo_tempo_leitura = time.time()
client = None
anemometro = None
dht_device = None
mq_channel = None
chuva_channel = None
dir_vento_channel = None


def parse_optional_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def on_connect(client, userdata, flags, rc):
    global connected, last_connect_log
    if rc == 0:
        now = time.time()
        if (not connected) or (now - last_connect_log > 60):
            print("LIGADO À DOJOT COM SUCESSO!")
            last_connect_log = now
        connected = True
    else:
        connected = False
        print(f"Falha na ligação MQTT, código de retorno: {rc}")


def on_disconnect(client, userdata, rc):
    global connected
    if connected:
        print(f"MQTT desconectado. rc={rc}")
    connected = False


def contar_pulsos_anemometro():
    global contador_pulsos
    contador_pulsos += 1


def setup_hardware():
    global DHT_PIN, anemometro, dht_device, mq_channel, chuva_channel, dir_vento_channel

    if not HARDWARE_AVAILABLE:
        return

    DHT_PIN = board.D4

    try:
        anemometro = Button(ANEMOMETRO_PIN, pull_up=True, bounce_time=0.01)
        anemometro.when_pressed = contar_pulsos_anemometro
    except Exception as exc:
        print(f"Erro ao iniciar anemômetro: {exc}")
        anemometro = None

    try:
        i2c = busio.I2C(board.SCL, board.SDA)
    except Exception as exc:
        print(f"Erro ao iniciar I2C: {exc}")
        i2c = None

    try:
        if i2c:
            ads = ADS1115.ADS1115(i2c)
            mq_channel = AnalogIn(ads, 0)
            chuva_channel = AnalogIn(ads, 1)
            dir_vento_channel = AnalogIn(ads, 2)
    except Exception as exc:
        print(f"Erro ao iniciar ADS1115: {exc}")
        mq_channel = None
        chuva_channel = None
        dir_vento_channel = None

    try:
        dht_device = adafruit_dht.DHT22(DHT_PIN)
    except Exception as exc:
        print(f"Erro ao iniciar DHT22: {exc}")
        dht_device = None


def setup_mqtt():
    global client

    if not MQTT_ENABLED:
        print("MQTT desativado por configuração.")
        return

    if not MQTT_LIB_AVAILABLE:
        print("MQTT indisponível porque a biblioteca paho-mqtt não foi carregada.")
        return

    client = mqtt.Client(client_id=CLIENT_ID)
    client.username_pw_set(username=MQTT_USER, password=MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    print(f"A ligar à Dojot (IP {MQTT_BROKER} porta {MQTT_PORT})...")
    client.connect_async(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()


def vin_antes_divisor(v_out):
    return 0.0 if v_out is None else v_out * DIVIDER_GAIN


def ler_mq135():
    if not mq_channel:
        return -1.0
    try:
        v_ads = mq_channel.voltage
        if v_ads <= 0:
            return -1.0
        v = vin_antes_divisor(v_ads)
        if v <= 0.01:
            return -1.0
        rs = ((3.3 * 10.0) / v) - 10.0
        ratio = rs / R0
        ppm = math.pow(10, (math.log10(ratio) - b_const) / m_const)
        return ppm
    except Exception:
        return -1.0


def ler_chuva():
    if not chuva_channel:
        return 0.0, 0
    try:
        v_ads = chuva_channel.voltage
        v = vin_antes_divisor(v_ads)
        chuva_bin = 1 if v < 1.5 else 0
        return v, chuva_bin
    except Exception:
        return 0.0, 0


def ler_velocidade_vento():
    global contador_pulsos, ultimo_tempo_leitura
    agora = time.time()
    dt = agora - ultimo_tempo_leitura
    pulsos = contador_pulsos
    contador_pulsos = 0
    ultimo_tempo_leitura = agora

    if dt <= 0:
        return 0.0

    rpm = (pulsos * 60.0) / dt
    vel_ms = ((4 * math.pi * RAIO_ANEMOMETRO_MM * rpm) / 60.0) / 1000.0
    return vel_ms * 3.6


def ler_direcao_vento():
    if not dir_vento_channel:
        return -1
    try:
        soma_raw = 0
        for _ in range(20):
            v_ads = dir_vento_channel.voltage
            val_arduino = (v_ads / 3.3) * 1023
            soma_raw += val_arduino
            time.sleep(0.01)

        ar = soma_raw / 20.0

        if 0 <= ar <= 64:
            return 315
        if 65 <= ar <= 100:
            return 270
        if 101 <= ar <= 200:
            return 225
        if 201 <= ar <= 300:
            return 180
        if 301 <= ar <= 400:
            return 135
        if 401 <= ar <= 480:
            return 90
        if 481 <= ar <= 580:
            return 45
        if 581 <= ar <= 750:
            return 0
        return -1
    except Exception as exc:
        print(f"Erro ao ler direção: {exc}")
        return -1


def ler_dht():
    if not dht_device:
        return 0.0, 0.0
    try:
        temperatura = dht_device.temperature
        umidade = dht_device.humidity
        return temperatura, umidade
    except RuntimeError:
        return 0.0, 0.0


def salvar_csv(payload):
    file_exists = os.path.isfile(CSV_FILE)
    with open(CSV_FILE, mode="a", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["timestamp"] + list(payload.keys()))
        if not file_exists:
            writer.writeheader()
        linha = {"timestamp": datetime.now().isoformat()}
        linha.update(payload)
        writer.writerow(linha)


def get_lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except Exception:
        return None


def get_service_status():
    if not SERVICE_NAME:
        return "UNKNOWN"
    try:
        import subprocess
        result = subprocess.run(
            ["systemctl", "is-active", SERVICE_NAME],
            capture_output=True,
            text=True,
            timeout=5,
        )
        status = result.stdout.strip()
        if status == "active":
            return "RUNNING"
        if status in ("inactive", "deactivating"):
            return "STOPPED"
        if status in ("failed", "activating"):
            return "FAILED"
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


def get_uptime_seconds():
    try:
        with open("/proc/uptime", "r") as file:
            return int(float(file.readline().split()[0]))
    except Exception:
        return None


def enviar_dojot(payload):
    payload_json = json.dumps(payload)

    if client and connected:
        client.publish(MQTT_TOPIC, payload_json)
        print(f"Enviado para Dojot: {payload_json}")
    else:
        print(f"[SEM MQTT] Payload gerado: {payload_json}")


def enviar_saas(payload):
    latitude = parse_optional_float(STATION_LATITUDE)
    longitude = parse_optional_float(STATION_LONGITUDE)

    heartbeat = {
        "stationSlug": STATION_SLUG,
        "stationName": STATION_NAME,
        "location": STATION_LOCATION,
        "latitude": latitude,
        "longitude": longitude,
        "ipAddress": get_lan_ip(),
        "agentVersion": AGENT_VERSION,
        "serviceStatus": get_service_status(),
        "cpuPercent": 0,
        "memoryPercent": 0,
        "diskPercent": 0,
        "temperatureCelsius": payload.get("temperatura"),
        "uptimeSeconds": get_uptime_seconds(),
        "lastCollectionAt": datetime.now().isoformat(),
        "recordsLast24h": 96,
    }

    try:
        import psutil
        heartbeat["cpuPercent"] = round(psutil.cpu_percent(interval=0.2), 2)
        heartbeat["memoryPercent"] = round(psutil.virtual_memory().percent, 2)
        heartbeat["diskPercent"] = round(psutil.disk_usage("/").percent, 2)
    except Exception as exc:
        print(f"[SAAS] Não foi possível ler métricas do sistema: {exc}")

    try:
        response = requests.post(
            f"{SAAS_API_URL}/heartbeats",
            json=heartbeat,
            timeout=SAAS_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        print(f"[SAAS] Heartbeat enviado: {response.status_code} {response.text}")
    except Exception as exc:
        print(f"[SAAS] Falha ao enviar heartbeat: {exc}")


def cleanup(sig=None, frame=None):
    print("Encerrando com segurança...")
    try:
        if client:
            client.loop_stop()
            client.disconnect()
    except Exception:
        pass

    try:
        if dht_device:
            dht_device.exit()
    except Exception:
        pass

    try:
        if HARDWARE_AVAILABLE:
            Device.close_all()
    except Exception:
        pass

    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

print("\n--- A INICIAR ESTAÇÃO NA RASPBERRY PI ---")
print(f"Estação: {STATION_SLUG} - {STATION_NAME}")
print(f"DengueSaaS API: {SAAS_API_URL}")

setup_hardware()
setup_mqtt()

try:
    while True:
        temperatura, umidade = ler_dht()
        ppm = ler_mq135()
        v_chuva, chuva_bin = ler_chuva()
        vel_vento = ler_velocidade_vento()
        dir_vento = ler_direcao_vento()

        payload = {
            "temperatura": round(temperatura, 1) if temperatura is not None else 0.0,
            "umidade": round(umidade, 0) if umidade is not None else 0.0,
            "pressao_abs": 0.0,
            "pressao_rel": 0.0,
            "qual_ar": round(ppm, 1) if ppm != -1.0 else -1.0,
            "pluviometrico": chuva_bin,
            "vel_vento": round(vel_vento, 2) if vel_vento is not None else 0.0,
            "dir_vento": dir_vento if dir_vento is not None else 0,
        }

        salvar_csv(payload)
        enviar_dojot(payload)
        enviar_saas(payload)

        time.sleep(READ_INTERVAL_SECONDS)

except KeyboardInterrupt:
    print("\nScript interrompido pelo utilizador.")
finally:
    cleanup()

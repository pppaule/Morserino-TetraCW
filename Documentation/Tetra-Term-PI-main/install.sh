#!/usr/bin/env bash
# Install script for Tetra Terminal on Ubuntu 24.04
# This script installs required packages, sets up the database,
# configures Apache and systemd services, and copies project files
# into /var/www/html. Run as root after cloning the repository.

set -e
export DEBIAN_FRONTEND=noninteractive

FORCE_NEW=false
if [[ "$1" == "--force-new" ]]; then
  FORCE_NEW=true
  shift
fi
if [[ $# -gt 0 ]]; then
  echo "Unbekannte Option: $1" >&2
  exit 1
fi

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausführen." >&2
  exit 1
fi

REPO_DIR=$(pwd)
WEB_DIR="/var/www/html"
DB_NAME="tetra"

if [ "$FORCE_NEW" = true ]; then
  echo "[0/7] Entferne bestehende Installation..."
  systemctl stop tetra-terminal.service 2>/dev/null || true
  systemctl disable tetra-terminal.service 2>/dev/null || true
  systemctl stop core-ws-logger.service 2>/dev/null || true
  systemctl disable core-ws-logger.service 2>/dev/null || true
  rm -f /etc/systemd/system/tetra-terminal.service /etc/systemd/system/core-ws-logger.service
  systemctl daemon-reload
  rm -rf "${WEB_DIR:?}"/*
  mysql -u root -e "DROP DATABASE IF EXISTS ${DB_NAME};"
fi

echo "[1/7] Sammle Konfigurationsparameter..."

read -p "Baudrate [115200]: " BAUDRATE
BAUDRATE=${BAUDRATE:-115200}

read -p "Anzahl Geräte: " DEVICE_COUNT

TTYS=()
ISSIS=()
for ((i=1;i<=DEVICE_COUNT;i++)); do
  read -p "TTY für Gerät $i: " TTY
  read -p "ISSI für Gerät $i: " ISSI
  TTYS+=("$TTY")
  ISSIS+=("$ISSI")
done

read -p "Zugangsdaten für DAPNET vorhanden? (j/N): " DAPNET_HAS_CREDS
if [[ "$DAPNET_HAS_CREDS" =~ ^([JjYy])$ ]]; then
  DAPNET_ENABLED=true
  read -p "DAPNET Call: " DAPNET_CALL
  read -p "DAPNET AuthKey: " DAPNET_AUTHKEY
else
  DAPNET_ENABLED=false
fi

echo "[2/7] Installiere Systempakete..."
apt-get update
apt-get install -y apache2 mysql-server nodejs npm alsa-utils rsync openssl

echo "[3/7] Kopiere Projektdateien nach ${WEB_DIR}..."
mkdir -p "$WEB_DIR"
rsync -av --delete --exclude 'system' "$REPO_DIR/" "$WEB_DIR/"
# Generiere Konfigurationsdateien im Zielverzeichnis
TETRA_CONF="$WEB_DIR/tetraterm.conf"
{
  echo "{"
  echo "  \"audioDevice\": \"plughw:0,0\"," 
  echo "  \"baudRate\": $BAUDRATE," 
  echo "  \"ttys\": [" 
  for ((i=0;i<DEVICE_COUNT;i++)); do 
    comma=","; [[ $i -eq $((DEVICE_COUNT-1)) ]] && comma="" 
    printf '    "%s"%s\n' "${TTYS[$i]}" "$comma" 
  done 
  echo "  ]," 
  echo "  \"devices\": {" 
  for ((i=0;i<DEVICE_COUNT;i++)); do 
    idx=$((i+1)) 
    comma=","; [[ $i -eq $((DEVICE_COUNT-1)) ]] && comma="" 
    printf '    "%s": {\n      "issi": %s\n    }%s\n' "$idx" "${ISSIS[$i]}" "$comma" 
  done 
  echo "  }"
  echo "}"
} > "$TETRA_CONF"

if [ "$DAPNET_ENABLED" = true ]; then
cat > "$WEB_DIR/dapnetConfig.json" <<EOF
{
  "enabled": true,
  "call": "$DAPNET_CALL",
  "authKey": "$DAPNET_AUTHKEY",
  "host": "dapnet.afu.rwth-aachen.de"
}
EOF
else
cat > "$WEB_DIR/dapnetConfig.json" <<EOF
{
  "enabled": false
}
EOF
fi

# Ersetze ISSI-Platzhalter in Frontend-Dateien
if [ ${#ISSIS[@]} -ge 1 ]; then
  sed -i "s/__ISSI1__/${ISSIS[0]}/g" "$WEB_DIR/index.html" "$WEB_DIR/map.js"
fi
if [ ${#ISSIS[@]} -ge 2 ]; then
  sed -i "s/__ISSI2__/${ISSIS[1]}/g" "$WEB_DIR/index.html" "$WEB_DIR/map.js"
fi

cd "$WEB_DIR"

echo "[4/7] Installiere Node-Abhängigkeiten..."
npm install --production

cd "$REPO_DIR"

echo "[5/7] Richte MySQL-Datenbank ein..."
mysql -u root -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root ${DB_NAME} < "${REPO_DIR}/system/mysql-schema-optimized.sql"

echo "[6/7] Installiere und aktiviere systemd-Dienste..."
cp "${REPO_DIR}/system/tetra-terminal.service" /etc/systemd/system/
cp "${REPO_DIR}/system/core-ws-logger.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tetra-terminal.service
systemctl enable --now core-ws-logger.service

echo "[7/7] Konfiguriere Apache..."
cp "${REPO_DIR}/system/000-default.conf" /etc/apache2/sites-available/000-default.conf
cp "${REPO_DIR}/system/000-default-ssl.conf" /etc/apache2/sites-available/000-default-ssl.conf
a2enmod ssl proxy proxy_http proxy_wstunnel > /dev/null
a2ensite 000-default-ssl > /dev/null
if [ ! -f /etc/ssl/private/tetraterm-selfsigned.key ]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/tetraterm-selfsigned.key \
    -out /etc/ssl/certs/tetraterm-selfsigned.crt \
    -subj "/CN=localhost"
fi
systemctl restart apache2

echo "Installation abgeschlossen."

#!/bin/bash
# Install (or update) JDBoard as a system service behind nginx.
#
#   sudo ./scripts/install.sh                     # install, or update an existing install
#   sudo ./scripts/install.sh --with-pytorch      # also install PyTorch + Ultralytics (~3 GB)
#   sudo ./scripts/install.sh --uninstall         # remove the service (keeps data and login)
#   sudo ./scripts/install.sh --uninstall --purge # remove everything, including models
#
# Options: --port N (HTTP port, default 80), --https-port N (default 443),
#          --no-https (plain HTTP only), --renew-cert (new self-signed certificate),
#          --no-fail2ban (don't block IPs after repeated wrong logins),
#          --backend-port N (default 5001), --rebuild-frontend, --fresh-venv, --no-migrate
#
# Layout
#   /opt/jdboard            app: backend, built frontend, Python venv (owned by root)
#   /etc/jdboard            jdboard.env (settings), htpasswd (login)
#   /var/lib/jdboard        models, logs, settings (owned by the 'jdboard' user)
#   jdboard.service         backend, runs as the unprivileged 'jdboard' user on 127.0.0.1
#   nginx                   HTTPS (self-signed certificate in /etc/jdboard/tls unless you
#                           put your own there), serves the frontend, proxies /api, checks
#                           the login; HTTP redirects to HTTPS
#   fail2ban                blocks an IP for 15 minutes after 5 wrong logins in 10 minutes
#   /etc/sudoers.d/jdboard  lets the service run /opt/jdboard/bin/jdboard-admin
#                           (reboot, poweroff, drop caches, manage jtop) - nothing else
#   jdboard-passwd / jdboard-pip   change the login or admin password / add Python packages
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/jdboard
ETC=/etc/jdboard
DATA=/var/lib/jdboard
SERVICE=jdboard.service
UNIT=/etc/systemd/system/$SERVICE
NGINX_SITE=/etc/nginx/sites-available/jdboard
SUDOERS=/etc/sudoers.d/jdboard
RELEASE_REPO="${JDBOARD_RELEASE_REPO:-Ashp116/JDBoard}"

PORT=80
HTTPS_PORT=443
HTTPS=1
RENEW_CERT=0
FAIL2BAN=1
BACKEND_PORT=5001
WITH_PYTORCH=0
REBUILD_FRONTEND=0
FRESH_VENV=0
MIGRATE=1
UNINSTALL=0
PURGE=0

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
while [ $# -gt 0 ]; do
    case "$1" in
        --port) PORT="${2:?--port needs a number}"; shift 2 ;;
        --https-port) HTTPS_PORT="${2:?--https-port needs a number}"; shift 2 ;;
        --no-https) HTTPS=0; shift ;;
        --renew-cert) RENEW_CERT=1; shift ;;
        --no-fail2ban) FAIL2BAN=0; shift ;;
        --backend-port) BACKEND_PORT="${2:?--backend-port needs a number}"; shift 2 ;;
        --with-pytorch) WITH_PYTORCH=1; shift ;;
        --rebuild-frontend) REBUILD_FRONTEND=1; shift ;;
        --fresh-venv) FRESH_VENV=1; shift ;;
        --no-migrate) MIGRATE=0; shift ;;
        --uninstall) UNINSTALL=1; shift ;;
        --purge) PURGE=1; shift ;;
        -h|--help) usage 0 ;;
        *) echo "Unknown option: $1" >&2; usage 1 ;;
    esac
done

if [ "$(id -u)" -ne 0 ]; then
    echo "Run with sudo: sudo $0 $*" >&2
    exit 1
fi
for p in "$PORT" "$HTTPS_PORT" "$BACKEND_PORT"; do
    if ! [[ "$p" =~ ^[0-9]+$ ]] || [ "$p" -lt 1 ] || [ "$p" -gt 65535 ]; then
        echo "Invalid port: $p" >&2; exit 1
    fi
done

ADMIN_USER="${SUDO_USER:-}"     # the person installing; added to the jdboard group
step() { echo; echo "==> $*"; }
as_admin() { sudo -u "$ADMIN_USER" -H bash -c "$1"; }

# --- uninstall ---------------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
    step "Removing JDBoard"
    systemctl disable --now "$SERVICE" 2>/dev/null || true
    rm -f "$UNIT" "$SUDOERS" /usr/local/bin/jdboard-pip /usr/local/bin/jdboard-passwd
    if [ -f /etc/fail2ban/jail.d/jdboard.conf ]; then
        rm -f /etc/fail2ban/jail.d/jdboard.conf
        systemctl reload fail2ban 2>/dev/null || true
    fi
    systemctl daemon-reload
    if [ -L /etc/nginx/sites-enabled/jdboard ] || [ -f "$NGINX_SITE" ]; then
        rm -f /etc/nginx/sites-enabled/jdboard "$NGINX_SITE"
        systemctl reload nginx 2>/dev/null || true
    fi
    rm -rf "$APP"
    if [ "$PURGE" -eq 1 ]; then
        rm -rf "$DATA" "$ETC"
        userdel jdboard 2>/dev/null || true
        groupdel jdboard 2>/dev/null || true
        echo "Removed JDBoard, its models/data, login and the 'jdboard' user."
    else
        echo "Removed the JDBoard service and app. Kept $DATA (models) and $ETC (login);"
        echo "add --purge to delete them too."
    fi
    echo "nginx itself was left installed."
    exit 0
fi

# --- 1. checks -----------------------------------------------------------------
step "Checking the system"
if [ -f /etc/nv_tegra_release ]; then
    echo "JetPack/L4T: $(head -1 /etc/nv_tegra_release | sed 's/^# //; s/, *GCID.*//')"
else
    echo "⚠️  /etc/nv_tegra_release not found - this doesn't look like a Jetson. Continuing anyway."
fi
if ! python3 -c "import jtop" 2>/dev/null; then
    echo "❌ jetson-stats (jtop) isn't installed. Install it, then re-run:"
    echo "     sudo pip3 install -U jetson-stats   (add --break-system-packages on Ubuntu 24.04)"
    exit 1
fi
if ! systemctl is-active --quiet jtop.service; then
    if systemctl list-unit-files jtop.service >/dev/null 2>&1; then
        systemctl enable --now jtop.service
    else
        jtop --install-service
    fi
fi
echo "jtop.service: $(systemctl is-active jtop.service)"
if ! command -v nginx >/dev/null; then
    echo "Installing nginx"
    apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q nginx
fi
command -v openssl >/dev/null || { echo "❌ openssl is required"; exit 1; }

# Stop an older JDBoard service first: it may hold the port and be writing to the
# models we're about to copy
if systemctl is-active --quiet "$SERVICE"; then
    echo "Stopping the running $SERVICE"
    systemctl stop "$SERVICE"
fi

# --- 2. user and folders ----------------------------------------------------------
step "Service user and folders"
if ! id jdboard >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$DATA" --no-create-home \
            --shell /usr/sbin/nologin --comment "JDBoard service" jdboard
    echo "Created system user 'jdboard' (no password, no login shell)"
fi
for g in video render jtop systemd-journal; do
    getent group "$g" >/dev/null && usermod -aG "$g" jdboard
done
if [ -n "$ADMIN_USER" ] && [ "$ADMIN_USER" != root ]; then
    usermod -aG jdboard "$ADMIN_USER"
    echo "Added $ADMIN_USER to the 'jdboard' group (can read/write $DATA; log in again to apply)"
fi
install -d -m 755 -o root -g root "$APP" "$APP/bin"
install -d -m 755 -o root -g root "$ETC"        # nginx (www-data) must reach htpasswd
# setgid: files created in the data folder stay in the jdboard group
install -d -m 2770 -o jdboard -g jdboard "$DATA" "$DATA/models" "$DATA/models/downloads" "$DATA/logs" "$DATA/config"

# --- 3. app files --------------------------------------------------------------------
step "Installing the backend to $APP"
# Root-owned and read-only for everyone else: the service must not be able to
# change its own code (rsync -a would copy the checkout's owner and modes)
rsync -a --delete --no-owner --no-group --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
      --exclude '__pycache__' --exclude '*.pyc' "$REPO/backend/" "$APP/backend/"
chown -R root:root "$APP/backend"
install -m 755 -o root -g root "$REPO/deploy/jdboard-admin" "$APP/bin/jdboard-admin"
install -m 755 -o root -g root "$REPO/deploy/jdboard-pip" /usr/local/bin/jdboard-pip
install -m 755 -o root -g root "$REPO/deploy/jdboard-passwd" /usr/local/bin/jdboard-passwd
install -m 644 -o root -g root "$REPO/requirements.txt" "$APP/requirements.txt"
git -C "$REPO" rev-parse --short HEAD > "$APP/VERSION" 2>/dev/null || echo unknown > "$APP/VERSION"

# --- 4. Python environment -------------------------------------------------------------
step "Python environment ($APP/venv)"
VENV="$APP/venv"
SRC_VENV="$REPO/.venv"
if [ "$FRESH_VENV" -eq 1 ]; then
    rm -rf "$VENV"
fi
if [ ! -x "$VENV/bin/python" ]; then
    if [ -x "$SRC_VENV/bin/python" ] && [ "$FRESH_VENV" -eq 0 ]; then
        echo "Copying the existing environment from $SRC_VENV (no re-download)"
        cp -a "$SRC_VENV" "$VENV"
        # venvs record their own path in scripts (e.g. the yolo command) and pyvenv.cfg
        grep -rlI --null "$SRC_VENV" "$VENV/bin" "$VENV/pyvenv.cfg" 2>/dev/null \
            | xargs -0 -r sed -i "s#$SRC_VENV#$VENV#g"
    else
        echo "Creating a new environment"
        python3 -m venv --system-site-packages "$VENV"
    fi
fi
"$VENV/bin/python" -m pip install -q --upgrade pip
"$VENV/bin/python" -m pip install -q -r "$APP/requirements.txt"
if "$VENV/bin/python" -c "import torch, ultralytics" 2>/dev/null; then
    echo "PyTorch + Ultralytics: installed"
elif [ "$WITH_PYTORCH" -eq 1 ]; then
    echo "Installing PyTorch (CUDA 13.2) and Ultralytics - this downloads ~3 GB"
    "$VENV/bin/python" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu132
    "$VENV/bin/python" -m pip install ultralytics --no-deps
    "$VENV/bin/python" -m pip install -q -r "$APP/requirements.txt"
else
    echo "PyTorch/Ultralytics not installed - monitoring works, model inference won't."
    echo "  Re-run with --with-pytorch to add them (~3 GB)."
fi
# Versions jdboard-pip must not change
"$VENV/bin/python" -m pip freeze 2>/dev/null | grep -iE '^(numpy|torch|torchvision|ml-dtypes)==' > "$APP/constraints.txt" || true
chown -R root:root "$VENV"
chmod -R a+rX,go-w "$VENV"
# The service can't write here, so compile the backend now
"$VENV/bin/python" -m compileall -q "$APP/backend" >/dev/null || true

# --- 5. frontend -----------------------------------------------------------------------
step "Frontend"
DIST="$REPO/frontend/dist"
NODE_ENV_CMD='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; true'
NODE_MAJOR=""
if [ -n "$ADMIN_USER" ] && [ "$ADMIN_USER" != root ]; then
    NODE_MAJOR="$(as_admin "$NODE_ENV_CMD; node -p 'process.versions.node.split(\".\")[0]' 2>/dev/null" || true)"
fi
if [ -f "$DIST/index.html" ] && [ "$REBUILD_FRONTEND" -eq 0 ]; then
    echo "Using the existing build in frontend/dist (--rebuild-frontend to rebuild)"
elif [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -ge 20 ]; then
    echo "Building with Node $NODE_MAJOR"
    as_admin "$NODE_ENV_CMD; cd '$REPO/frontend' && npm ci --no-audit --no-fund && npm run build"
else
    echo "Node 20+ not found; downloading the prebuilt frontend from github.com/$RELEASE_REPO"
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    curl -fsSL -o "$TMP/frontend.tar.gz" \
        "https://github.com/$RELEASE_REPO/releases/latest/download/jdboard-frontend.tar.gz" \
        || { echo "❌ No prebuilt frontend available. Install Node 20+ (e.g. via nvm) and re-run."; exit 1; }
    mkdir -p "$TMP/dist" && tar -xzf "$TMP/frontend.tar.gz" -C "$TMP/dist" --no-same-owner
    DIST="$TMP/dist"
fi
[ -f "$DIST/index.html" ] || { echo "❌ frontend build is missing index.html"; exit 1; }
rsync -a --delete --no-owner --no-group --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r "$DIST/" "$APP/frontend/"
chown -R root:root "$APP/frontend"

# --- 6. move existing models/data from the repo checkout -------------------------------
if [ "$MIGRATE" -eq 1 ] && [ ! -f "$DATA/models/models_registry.json" ] && [ -f "$REPO/models/models_registry.json" ]; then
    step "Copying your models and history from $REPO"
    rsync -a --exclude '__pycache__' "$REPO/models/" "$DATA/models/"
    [ -f "$REPO/logs/requests.db" ] && cp -p "$REPO/logs/requests.db" "$DATA/logs/"
    [ -f "$REPO/config/settings.json" ] && cp -p "$REPO/config/settings.json" "$DATA/config/"
    # The registry stores absolute paths; point them at the new folder
    "$VENV/bin/python" - "$DATA/models/models_registry.json" "$REPO/models" "$DATA/models" <<'PY'
import json, os, sys
registry_path, old, new = sys.argv[1], os.path.realpath(sys.argv[2]), sys.argv[3]
registry = json.load(open(registry_path))
for info in registry.values():
    for key in ('file_path', 'custom_script_path'):
        value = info.get(key)
        if value and os.path.realpath(value).startswith(old + os.sep):
            info[key] = new + os.path.realpath(value)[len(old):]
    info['loaded'] = False
json.dump(registry, open(registry_path, 'w'), indent=2)
print(f"Updated {len(registry)} model(s): {', '.join(registry)}")
PY
    echo "The originals in $REPO/models were left in place; delete them once you're happy."
fi
chown -R jdboard:jdboard "$DATA"
find "$DATA" -type d -exec chmod 2770 {} +
find "$DATA" -type f -exec chmod g+rw {} +

# --- 7. settings, root helper, service -------------------------------------------------
step "Service"
cat > "$ETC/jdboard.env" <<EOF
# JDBoard backend settings (read by $SERVICE)
JDBOARD_HOST=127.0.0.1
JDBOARD_PORT=$BACKEND_PORT
JDBOARD_DATA_DIR=$DATA
JDBOARD_FRONTEND_DIST=$APP/frontend
JDBOARD_AUTH=nginx
JDBOARD_PRIVILEGED_HELPER=$APP/bin/jdboard-admin
PYTHONUNBUFFERED=1
PATH=$VENV/bin:/usr/local/cuda/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LD_LIBRARY_PATH=/usr/local/cuda/lib64
EOF
chown root:jdboard "$ETC/jdboard.env"
chmod 640 "$ETC/jdboard.env"
rm -f "$ETC/auth"    # the old in-app login; nginx checks the login now

TMP_SUDOERS="$(mktemp)"
install -m 440 "$REPO/deploy/sudoers-jdboard" "$TMP_SUDOERS"
if visudo -cf "$TMP_SUDOERS" >/dev/null; then
    install -m 440 -o root -g root "$TMP_SUDOERS" "$SUDOERS"
else
    echo "❌ sudoers rule failed validation; not installed"; rm -f "$TMP_SUDOERS"; exit 1
fi
rm -f "$TMP_SUDOERS"

install -m 644 -o root -g root "$REPO/deploy/jdboard.service" "$UNIT"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null

# --- 8. login and nginx ----------------------------------------------------------------
step "Login"
if [ -s "$ETC/htpasswd" ]; then
    echo "Keeping the existing login (change it with: sudo jdboard-passwd)"
elif [ ! -t 0 ]; then
    echo "❌ The dashboard login has to be typed in, but this isn't an interactive terminal."
    echo "   Everything up to here is installed. Open a terminal (SSH or the desktop) and run:"
    echo "     cd $REPO && sudo ./scripts/install.sh"
    echo "   It picks up where this left off."
    exit 1
else
    echo "Choose the username and password for the dashboard (not your Linux account)."
    /usr/local/bin/jdboard-passwd
fi

step "nginx"
if [ "$HTTPS" -eq 1 ]; then
    TLS_DIR="$ETC/tls"
    install -d -m 755 -o root -g root "$TLS_DIR"
    if [ "$RENEW_CERT" -eq 1 ] || [ ! -s "$TLS_DIR/jdboard.crt" ] || [ ! -s "$TLS_DIR/jdboard.key" ]; then
        # Self-signed, valid 10 years, for this device's names and current addresses
        HOST="$(hostname)"
        SAN="DNS:$HOST,DNS:$HOST.local,DNS:localhost,IP:127.0.0.1"
        for ip in $(hostname -I); do SAN="$SAN,IP:$ip"; done
        openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
            -subj "/CN=$HOST" -addext "subjectAltName=$SAN" \
            -keyout "$TLS_DIR/jdboard.key" -out "$TLS_DIR/jdboard.crt" 2>/dev/null
        chmod 600 "$TLS_DIR/jdboard.key"
        chmod 644 "$TLS_DIR/jdboard.crt"
        echo "Created a self-signed certificate for $SAN"
        echo "  (browsers warn once; replace $TLS_DIR/jdboard.crt/.key with your own to avoid that)"
    else
        echo "Using the certificate in $TLS_DIR"
    fi
fi
python3 "$REPO/deploy/render-nginx-site.py" "$REPO/deploy/nginx-jdboard.conf" "$NGINX_SITE" \
    "$HTTPS" "$PORT" "$HTTPS_PORT" "$BACKEND_PORT" "$ETC/tls"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/jdboard
# nginx's stock welcome site also claims the default server on port 80
if [ "$PORT" = 80 ] && [ -L /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default
    echo "Disabled nginx's default welcome site (it used port 80)"
fi
nginx -t
systemctl enable nginx >/dev/null
systemctl reload nginx 2>/dev/null || systemctl restart nginx

if [ "$FAIL2BAN" -eq 1 ]; then
    step "Blocking repeated wrong logins (fail2ban)"
    if ! command -v fail2ban-client >/dev/null; then
        apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q fail2ban
    fi
    PORTS="$PORT"
    [ "$HTTPS" -eq 1 ] && PORTS="$PORT,$HTTPS_PORT"
    install -d -m 755 /etc/fail2ban/jail.d
    sed -e "s/@PORTS@/$PORTS/" "$REPO/deploy/fail2ban-jdboard.conf" > /etc/fail2ban/jail.d/jdboard.conf
    systemctl enable fail2ban >/dev/null
    systemctl restart fail2ban
    sleep 2
    if fail2ban-client status nginx-http-auth >/dev/null 2>&1; then
        echo "fail2ban is watching the dashboard login (unban: sudo fail2ban-client set nginx-http-auth unbanip <ip>)"
    else
        echo "⚠️  fail2ban didn't start its JDBoard jail; check: sudo fail2ban-client status"
    fi
fi

# --- 9. start and check ----------------------------------------------------------------
step "Starting JDBoard"
systemctl restart "$SERVICE"
for _ in $(seq 1 40); do
    BACKEND="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BACKEND_PORT/api/system/privileges" || true)"
    [ "$BACKEND" = 200 ] && break
    sleep 1
done
if [ "$HTTPS" -eq 1 ]; then
    FRONT="$(curl -sk -o /dev/null -w '%{http_code}' "https://127.0.0.1:$HTTPS_PORT/" || true)"
    SCHEME=https; URL_PORT=""; [ "$HTTPS_PORT" -ne 443 ] && URL_PORT=":$HTTPS_PORT"
else
    FRONT="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
    SCHEME=http; URL_PORT=""; [ "$PORT" -ne 80 ] && URL_PORT=":$PORT"
fi

echo
if [ "$BACKEND" = 200 ] && [ "$FRONT" = 401 ]; then
    echo "✅ JDBoard is running (backend $(cat "$APP/VERSION")) and starts on boot."
    for ip in $(hostname -I); do
        [[ "$ip" == *:* || "$ip" == 169.254.* || "$ip" == 172.17.* ]] && continue
        echo "   $SCHEME://$ip$URL_PORT"
    done
    if [ "$HTTPS" -eq 1 ]; then
        echo "   (self-signed certificate: your browser asks you to accept it the first time)"
    fi
else
    echo "❌ Something isn't answering (backend: $BACKEND, nginx: $FRONT - expected 200 and 401)."
    journalctl -u "$SERVICE" -n 30 --no-pager || true
    exit 1
fi
cat <<EOF

Logs:              journalctl -u jdboard -f
Restart:           sudo systemctl restart jdboard
Change login:      sudo jdboard-passwd
Admin password:    sudo jdboard-passwd --admin   (asked before reboot/shutdown/...; --admin --remove to drop)
Add a library:     sudo jdboard-pip install <package> && sudo systemctl restart jdboard
Update:            git pull && sudo ./scripts/install.sh --rebuild-frontend
Models/data:       $DATA (you're in the 'jdboard' group after logging in again)
EOF

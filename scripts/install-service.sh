#!/bin/bash
# Install JDBoard as a systemd service that starts on boot.
#
#   sudo ./scripts/install-service.sh [--port 80] [--with-pytorch] [--rebuild-frontend] [--no-password]
#   sudo ./scripts/install-service.sh --uninstall
#
# What it does:
#   1. Checks for JetPack and jetson-stats (jtop) and that jtop.service runs
#   2. Creates .venv (with system site-packages) and installs requirements.txt
#      (--with-pytorch also installs PyTorch cu132 + Ultralytics, ~3 GB)
#   3. Builds the frontend (needs Node 20+), or downloads the prebuilt one from
#      the latest GitHub release
#   4. Asks for a login (HTTP Basic auth) unless one exists or --no-password
#   5. Writes /etc/systemd/system/jdboard.service, enables and starts it
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE=jdboard.service
UNIT_FILE="/etc/systemd/system/$SERVICE"
AUTH_FILE=/etc/jdboard/auth
RELEASE_REPO="${JDBOARD_RELEASE_REPO:-Ashp116/JDBoard}"
PORT=80
WITH_PYTORCH=0
REBUILD_FRONTEND=0
NO_PASSWORD=0
UNINSTALL=0

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --port) PORT="${2:?--port needs a number}"; shift 2 ;;
        --with-pytorch) WITH_PYTORCH=1; shift ;;
        --rebuild-frontend) REBUILD_FRONTEND=1; shift ;;
        --no-password) NO_PASSWORD=1; shift ;;
        --uninstall) UNINSTALL=1; shift ;;
        -h|--help) usage 0 ;;
        *) echo "Unknown option: $1" >&2; usage 1 ;;
    esac
done

if [ "$(id -u)" -ne 0 ]; then
    echo "Run with sudo: sudo $0 $*" >&2
    exit 1
fi

SERVICE_USER="${JDBOARD_USER:-${SUDO_USER:-}}"
if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = root ]; then
    echo "Run this with sudo from your normal account (JDBoard should not run as root)," >&2
    echo "or set JDBOARD_USER=<user>." >&2
    exit 1
fi
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
SERVICE_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"

as_user() { sudo -u "$SERVICE_USER" -H bash -c "$1"; }
step() { echo; echo "==> $*"; }

if [ "$UNINSTALL" -eq 1 ]; then
    step "Removing $SERVICE"
    systemctl disable --now "$SERVICE" 2>/dev/null || true
    rm -f "$UNIT_FILE"
    systemctl daemon-reload
    echo "Removed. The login in $AUTH_FILE and the .venv were kept; delete them by hand if you like."
    exit 0
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo "Invalid port: $PORT" >&2
    exit 1
fi

# --- 1. Platform checks --------------------------------------------------------
step "Checking the system"
if [ -f /etc/nv_tegra_release ]; then
    echo "JetPack/L4T: $(head -1 /etc/nv_tegra_release | sed 's/^# //; s/, *GCID.*//')"
else
    echo "⚠️  /etc/nv_tegra_release not found - this doesn't look like a Jetson. Continuing anyway."
fi

if ! python3 -c "import jtop" 2>/dev/null; then
    echo "❌ jetson-stats (jtop) isn't installed. Install it, then re-run this script:"
    echo "     sudo pip3 install -U jetson-stats   (add --break-system-packages on Ubuntu 24.04)"
    exit 1
fi
if ! systemctl is-active --quiet jtop.service; then
    if systemctl list-unit-files jtop.service >/dev/null 2>&1; then
        echo "Starting jtop.service"
        systemctl enable --now jtop.service
    else
        echo "Installing jtop.service"
        jtop --install-service
    fi
fi
echo "jtop.service: $(systemctl is-active jtop.service)"
if getent group jtop >/dev/null && ! id -nG "$SERVICE_USER" | tr ' ' '\n' | grep -qx jtop; then
    usermod -aG jtop "$SERVICE_USER"
    echo "Added $SERVICE_USER to the jtop group"
fi

# Port free? (ignore our own service, which we're about to restart)
if ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q . && ! systemctl is-active --quiet "$SERVICE"; then
    echo "❌ Port $PORT is already in use:"
    ss -ltnpH "sport = :$PORT" || true
    echo "   Stop that program or choose another port with --port."
    exit 1
fi

# --- 2. Python environment -----------------------------------------------------
step "Setting up the Python environment (.venv)"
PYTHON="$REPO/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
    as_user "python3 -m venv --system-site-packages '$REPO/.venv'"
fi
as_user "'$PYTHON' -m pip install -q --upgrade pip"
as_user "'$PYTHON' -m pip install -q -r '$REPO/requirements.txt'"

if as_user "'$PYTHON' -c 'import torch, ultralytics'" 2>/dev/null; then
    echo "PyTorch + Ultralytics: installed"
elif [ "$WITH_PYTORCH" -eq 1 ]; then
    echo "Installing PyTorch (CUDA 13.2) and Ultralytics - this downloads ~3 GB"
    as_user "'$PYTHON' -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu132"
    as_user "'$PYTHON' -m pip install ultralytics --no-deps"
    as_user "'$PYTHON' -m pip install -q -r '$REPO/requirements.txt'"
else
    echo "PyTorch/Ultralytics not installed - monitoring works, model inference won't."
    echo "  Re-run with --with-pytorch to add them (~3 GB)."
fi

# --- 3. Frontend -------------------------------------------------------------
step "Preparing the frontend"
DIST="$REPO/frontend/dist"
NODE_ENV_CMD='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; true'
NODE_MAJOR="$(as_user "$NODE_ENV_CMD; node -p 'process.versions.node.split(\".\")[0]' 2>/dev/null" || true)"

if [ -f "$DIST/index.html" ] && [ "$REBUILD_FRONTEND" -eq 0 ]; then
    echo "Using existing build in frontend/dist (pass --rebuild-frontend to rebuild)"
elif [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -ge 20 ]; then
    echo "Building with Node $NODE_MAJOR"
    as_user "$NODE_ENV_CMD; cd '$REPO/frontend' && npm ci --no-audit --no-fund && npm run build"
else
    echo "Node 20+ not found; downloading the prebuilt frontend from github.com/$RELEASE_REPO"
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    if curl -fsSL -o "$TMP/frontend.tar.gz" \
        "https://github.com/$RELEASE_REPO/releases/latest/download/jdboard-frontend.tar.gz"; then
        rm -rf "$DIST"
        as_user "mkdir -p '$DIST'"
        tar -xzf "$TMP/frontend.tar.gz" -C "$DIST" --no-same-owner
        chown -R "$SERVICE_USER:$SERVICE_GROUP" "$DIST"
    else
        echo "❌ No prebuilt frontend available. Install Node 20+ (e.g. via nvm) and re-run."
        exit 1
    fi
fi
[ -f "$DIST/index.html" ] || { echo "❌ frontend/dist/index.html is missing"; exit 1; }

# --- 4. Login ----------------------------------------------------------------
step "Login"
if [ -f "$AUTH_FILE" ]; then
    echo "Using the existing login in $AUTH_FILE (change it with: sudo ./scripts/set-password.sh)"
elif [ "$NO_PASSWORD" -eq 1 ]; then
    echo "⚠️  No password: anyone on your network can use the terminal, kill processes and reboot."
else
    echo "JDBoard includes a web terminal and reboot controls, so it should have a password."
    JDBOARD_USER="$SERVICE_USER" "$REPO/scripts/set-password.sh"
fi

# --- 5. systemd service ------------------------------------------------------
step "Installing $SERVICE"
CAPS=""
if [ "$PORT" -lt 1024 ]; then
    # Lets the unprivileged service user listen on a port below 1024
    CAPS="AmbientCapabilities=CAP_NET_BIND_SERVICE"
fi
SUPP_GROUPS=""
getent group jtop >/dev/null && SUPP_GROUPS="SupplementaryGroups=jtop"

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=JDBoard - Jetson dashboard
Documentation=https://github.com/$RELEASE_REPO
After=network-online.target jtop.service
Wants=network-online.target jtop.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
$SUPP_GROUPS
WorkingDirectory=$REPO/backend
Environment=PYTHONUNBUFFERED=1
Environment=JDBOARD_PORT=$PORT
Environment=JDBOARD_AUTH_FILE=$AUTH_FILE
Environment=PATH=$SERVICE_HOME/.local/bin:/usr/local/cuda/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=LD_LIBRARY_PATH=/usr/local/cuda/lib64
ExecStart=$PYTHON app.py
$CAPS
Restart=on-failure
RestartSec=5
# Give running model exports time to be stopped cleanly
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"

# Wait for it to answer
URL_PORT=""; [ "$PORT" -ne 80 ] && URL_PORT=":$PORT"
for _ in $(seq 1 30); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
    if [ "$CODE" = 200 ] || [ "$CODE" = 401 ]; then break; fi
    sleep 1
done

echo
if systemctl is-active --quiet "$SERVICE" && { [ "$CODE" = 200 ] || [ "$CODE" = 401 ]; }; then
    echo "✅ JDBoard is running and will start on boot."
    for ip in $(hostname -I); do
        [[ "$ip" == *:* || "$ip" == 169.254.* || "$ip" == 172.17.* ]] && continue
        echo "   http://$ip$URL_PORT"
    done
else
    echo "❌ $SERVICE didn't come up. Recent logs:"
    journalctl -u "$SERVICE" -n 30 --no-pager || true
    exit 1
fi
echo
echo "Logs:    journalctl -u $SERVICE -f"
echo "Restart: sudo systemctl restart $SERVICE"
echo "Remove:  sudo $0 --uninstall"

#!/bin/bash
# Set (or change) the JDBoard login. Run with sudo:
#   sudo ./scripts/set-password.sh [username]
# Writes /etc/jdboard/auth (username:password-hash), readable by the service user.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
AUTH_DIR=/etc/jdboard
AUTH_FILE="$AUTH_DIR/auth"
SERVICE_USER="${JDBOARD_USER:-${SUDO_USER:-$(id -un)}}"
PYTHON="$REPO/.venv/bin/python"
[ -x "$PYTHON" ] || PYTHON=python3

if [ "$(id -u)" -ne 0 ]; then
    echo "Run with sudo: sudo $0 $*" >&2
    exit 1
fi

LOGIN="${1:-}"
if [ -z "$LOGIN" ]; then
    read -rp "JDBoard username [$SERVICE_USER]: " LOGIN
    LOGIN="${LOGIN:-$SERVICE_USER}"
fi
if [[ "$LOGIN" == *:* ]]; then
    echo "Username can't contain ':'" >&2
    exit 1
fi

while true; do
    read -rsp "New JDBoard password: " PW1; echo
    read -rsp "Repeat password: " PW2; echo
    if [ "$PW1" != "$PW2" ]; then
        echo "Passwords don't match, try again."
    elif [ "${#PW1}" -lt 8 ]; then
        echo "Use at least 8 characters."
    else
        break
    fi
done

# Password goes to Python on stdin, never on a command line
HASH="$(printf '%s' "$PW1" | "$PYTHON" -c 'import sys; from werkzeug.security import generate_password_hash; print(generate_password_hash(sys.stdin.read()))')"
unset PW1 PW2

install -d -m 755 "$AUTH_DIR"
umask 077
printf '%s:%s\n' "$LOGIN" "$HASH" > "$AUTH_FILE"
chown "root:$(id -gn "$SERVICE_USER")" "$AUTH_FILE"
chmod 640 "$AUTH_FILE"
echo "✅ Login saved to $AUTH_FILE (user '$LOGIN')."

if systemctl is-active --quiet jdboard.service 2>/dev/null; then
    systemctl restart jdboard.service
    echo "🔄 Restarted jdboard.service"
fi

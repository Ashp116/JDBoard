#!/bin/bash

# Start Backend Server

echo "🚀 Starting Backend Server"
echo "=========================="

cd "$(dirname "$0")" || exit 1

# Create the virtual environment on first run. --system-site-packages keeps
# jetson-stats (jtop) and JetPack's OpenCV/numpy visible inside the venv.
if [ ! -x "$(pwd)/.venv/bin/python" ]; then
    echo "📦 Creating virtual environment (.venv)"
    python3 -m venv --system-site-packages .venv || exit 1
fi
PYTHON="$(pwd)/.venv/bin/python"

# Install requirements if anything is missing
if ! $PYTHON -c "import flask, flask_cors, flask_socketio, psutil" 2>/dev/null; then
    echo "📦 Installing requirements..."
    $PYTHON -m pip install -r requirements.txt || exit 1
fi

# jtop must be installed system-wide and its service running
if ! $PYTHON -c "import jtop" 2>/dev/null; then
    echo "❌ jetson-stats not found. Install it with: sudo pip3 install -U jetson-stats"
    exit 1
fi
if ! systemctl is-active --quiet jtop.service; then
    echo "⚠️  jtop.service is not active. Run: sudo jtop --install-service"
fi

echo "🌟 Starting Flask backend server..."
echo "📡 Backend: http://localhost:5000"
echo "🔄 Press Ctrl+C to stop"
echo ""

# Don't set FLASK_DEBUG to prevent auto-reloading issues with WebSocket
# export FLASK_DEBUG=1

cd backend || exit 1
exec $PYTHON app.py
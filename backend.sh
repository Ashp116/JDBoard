#!/bin/bash

# Start Backend Server

echo "🚀 Starting Backend Server"
echo "=========================="

cd "$(dirname "$0")" || exit 1

# Use .venv if available
if [ -x "$(pwd)/.venv/bin/python" ]; then
    PYTHON="$(pwd)/.venv/bin/python"
    echo "📦 Using virtual environment"
else
    PYTHON="python3"
    echo "⚠️  Using system Python"
fi

# Install requirements if Flask is missing
if ! $PYTHON -c "import flask" 2>/dev/null; then
    echo "📦 Installing requirements..."
    $PYTHON -m pip install -r requirements.txt
fi

echo "🌟 Starting Flask backend server..."
echo "📡 Backend: http://localhost:5000"
echo "🔄 Press Ctrl+C to stop"
echo ""

cd backend
$PYTHON app.py
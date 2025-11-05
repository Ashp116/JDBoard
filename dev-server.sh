#!/bin/bash

# NVIDIA Jetson Edge Dashboard - Development Server Script

echo "🚀 NVIDIA Jetson Edge Dashboard - Development Mode"
echo "================================================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check and install Node.js if needed
if ! command_exists node; then
    echo "❌ Node.js not found. Please install Node.js first."
    echo "💡 Run: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

# Determine frontend directory
BASE_DIR="$(dirname "$0")"
if [ -d "$BASE_DIR/frontend" ]; then
    FRONTEND_DIR="$BASE_DIR/frontend"
else
    echo "❌ Frontend directory not found (frontend/)."
    exit 1
fi

cd "$FRONTEND_DIR" || exit

# Use package-lock if present for reproducible installs
if [ -f "package-lock.json" ]; then
    echo "📦 Installing dependencies from package-lock.json (npm ci)..."
    npm ci
elif [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (npm install)..."
    npm install
fi

echo "🌟 Starting NVIDIA Dashboard in development mode..."
echo "📡 Backend should be running on http://localhost:5000"
echo "🖥️  Frontend will be available on http://localhost:3000 (or the host configured in Vite)"
echo "🔄 Hot reload enabled - changes will update automatically"
echo ""
echo "Press Ctrl+C to stop the development server"
echo ""

# Start development server; pass --host so the dev server is reachable from other devices if needed
npm run dev -- --host
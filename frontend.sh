#!/bin/bash

# Start Frontend Development Server

echo "🚀 Starting Frontend Development Server"
echo "======================================="

cd "$(dirname "$0")/frontend" || {
    echo "❌ Frontend directory not found"
    exit 1
}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🌟 Starting Vite development server..."
echo "🖥️  Local: http://localhost:3000"
echo "🌐 Network: http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "📡 Backend will auto-connect to:"
echo "   - Local access: http://localhost:5000"
echo "   - Network access: http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo "🔄 Press Ctrl+C to stop"
echo ""

npm run dev
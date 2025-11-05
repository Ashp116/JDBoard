#!/bin/bash

# NVIDIA Jetson Edge Dashboard - Development Build Script

echo "🚀 NVIDIA Jetson Edge Dashboard - Development Build"
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Navigate to React frontend directory
cd "$(dirname "$0")/frontend" || exit

echo "📦 Installing dependencies..."
npm install

echo "🛠️  Building React application..."
npm run build

echo "✅ Build completed successfully!"
echo "📁 Built files are in: $(pwd)/dist"

# Copy built files to backend static directory if it exists
if [ -d "../static" ]; then
    echo "📂 Copying built files to backend static directory..."
    cp -r dist/* ../static/
    echo "✅ Files copied to backend static directory"
fi

echo "🎉 React build process completed!"
echo "🌐 You can now serve the application from the backend"
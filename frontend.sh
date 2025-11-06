#!/bin/bash

# Start Frontend Development Server with TypeScript

echo "🚀 Starting TypeScript React Frontend Development Server"
echo "========================================================"

cd "$(dirname "$0")/frontend" || {
    echo "❌ Frontend directory not found"
    exit 1
}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if TypeScript is properly configured
if [ ! -f "tsconfig.json" ]; then
    echo "⚠️  TypeScript configuration not found"
    echo "📝 Creating tsconfig.json..."
fi

# Run TypeScript type checking before starting
echo "🔍 Running TypeScript type check..."
if npm run type-check; then
    echo "✅ TypeScript compilation successful"
else
    echo "⚠️  TypeScript compilation has warnings/errors"
    echo "🚀 Starting development server anyway..."
fi

echo ""
echo "🌟 Starting Vite development server with TypeScript..."
echo "🖥️  Local: http://localhost:3000"
echo "🌐 Network: http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "📡 Backend will auto-connect to:"
echo "   - Local access: http://localhost:5000"
echo "   - Network access: http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo "📝 TypeScript features enabled:"
echo "   - Type checking"
echo "   - IntelliSense support"
echo "   - Path aliases (@/* imports)"
echo ""
echo "🔄 Press Ctrl+C to stop"
echo ""

npm run dev
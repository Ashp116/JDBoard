#!/bin/bash

# Network Configuration Test Script
echo "🔍 Network Configuration Test"
echo "=============================="

# Get IP address
IP=$(hostname -I | awk '{print $1}')
echo "📍 Jetson IP Address: $IP"

# Test if backend is running
echo ""
echo "🔧 Testing Backend Connection..."
if curl -s "http://localhost:5000" > /dev/null; then
    echo "✅ Backend is running on localhost:5000"
else
    echo "❌ Backend is not running on localhost:5000"
fi

if curl -s "http://$IP:5000" > /dev/null; then
    echo "✅ Backend is accessible on LAN at $IP:5000"
else
    echo "❌ Backend is not accessible on LAN at $IP:5000"
fi

# Test frontend
echo ""
echo "🌐 Testing Frontend Connection..."
if curl -s "http://localhost:3000" > /dev/null; then
    echo "✅ Frontend is running on localhost:3000"
else
    echo "❌ Frontend is not running on localhost:3000"
fi

if curl -s "http://$IP:3000" > /dev/null; then
    echo "✅ Frontend is accessible on LAN at $IP:3000"
else
    echo "❌ Frontend is not accessible on LAN at $IP:3000"
fi

echo ""
echo "📱 Access URLs:"
echo "   Local:   http://localhost:3000"
echo "   Network: http://$IP:3000"
echo ""
echo "🔗 Backend URLs (auto-detected by frontend):"
echo "   Local:   http://localhost:5000"
echo "   Network: http://$IP:5000"
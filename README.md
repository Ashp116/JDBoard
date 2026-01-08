
<p align="center">
   <img src="/JDBoardIcon.svg" alt="JDBoard Logo" width="120" />
</p>

# JDBoard

A modern edge AI dashboard for NVIDIA Jetson devices with real-time monitoring and inferencing.

## Overview

JDBoard is a full-stack application that combines a React TypeScript frontend with a Python Flask backend to deliver a comprehensive edge AI management platform. Built specifically for NVIDIA Jetson devices, it offers seamless integration with CUDA, TensorRT, and other AI frameworks while providing real-time system monitoring and performance analytics.

## Quick Start

**Prerequisites**
- NVIDIA Jetson device or CUDA-capable system
- Python 3.8+ and Node.js 16+
- At least 4GB RAM

**Installation**
```bash
git clone https://github.com/Ashp116/JDBoard.git
cd Jetson_Edge

# Backend setup
./backend.sh

# Frontend development
./frontend.sh
```

**Access**
- Development: http://localhost:3000
- Production: http://localhost:5000

## Architecture

**Frontend**: React 18 with TypeScript, Styled Components, Chart.js, Socket.IO

**Backend**: Flask with Socket.IO, OpenCV, PyTorch, ONNX Runtime

**Real-time Communication**: WebSocket for live system updates

**Database**: File-based logging with JSON exports

## API Endpoints

- `POST /api/inference` - Run AI inference on uploaded images

## Supported Formats

| Framework | Extensions | GPU Acceleration |
|-----------|------------|------------------|
| ONNX | .onnx | CUDA |
| TensorRT | .trt, .engine | TensorRT |
| PyTorch | .pth, .pt | CUDA |
| TensorFlow | .pb, .h5 | CUDA |

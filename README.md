
<p align="center">
   <img src="/JDBoardIcon.svg" alt="JDBoard Logo" width="120" />
</p>

# JDBoard

A modern edge AI dashboard for NVIDIA Jetson devices with real-time monitoring and inferencing.

## Overview

JDBoard is a full-stack application that combines a React TypeScript frontend with a Python Flask backend to deliver a comprehensive edge AI management platform. Built specifically for NVIDIA Jetson devices, it offers seamless integration with CUDA, TensorRT, and other AI frameworks while providing real-time system monitoring and performance analytics.

## Quick Start

**Prerequisites**
- NVIDIA Jetson with JetPack 6/7 (tested: Orin Nano 8GB, JetPack 7.2)
- [jetson-stats](https://github.com/rbonghi/jetson_stats) (`sudo pip3 install -U jetson-stats`)
- Node.js 20+ only if you build the frontend yourself (otherwise the installer downloads a prebuilt one)

### Run as a service (starts on boot)

```bash
git clone https://github.com/Ashp116/JDBoard.git
cd JDBoard
sudo ./scripts/install-service.sh                 # dashboard on http://<jetson-ip>/
sudo ./scripts/install-service.sh --with-pytorch  # also install PyTorch + Ultralytics (~3 GB) for model inference
```

The installer checks jtop, creates `.venv`, builds the frontend, asks you for a
login, and installs `jdboard.service` (runs as your user, restarts on crash).
Options: `--port N` (default 80), `--rebuild-frontend` (after pulling updates),
`--no-password`, `--uninstall`.

```bash
journalctl -u jdboard -f                # logs
sudo systemctl restart jdboard          # restart (e.g. after git pull)
sudo ./scripts/set-password.sh          # change the login
```

> **Security:** JDBoard has a web terminal and can kill processes and reboot the
> device, so keep the password on. To reach it from outside your network, put it
> behind HTTPS (e.g. nginx or a VPN) rather than forwarding the port.

### Development

```bash
./backend.sh    # Flask API on :5000
./frontend.sh   # Vite dev server on :3000 (proxies /api to :5000) - open http://<jetson-ip>:3000
```

Without the service, `./backend.sh` also serves a built frontend (`cd frontend && npm run build`)
on http://<jetson-ip>:5000. Set `JDBOARD_PORT` to change the port.

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

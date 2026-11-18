
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

### Install (runs on boot, behind nginx)

```bash
git clone https://github.com/Ashp116/JDBoard.git
cd JDBoard
sudo ./scripts/install.sh                  # dashboard on http://<jetson-ip>/
sudo ./scripts/install.sh --with-pytorch   # also install PyTorch + Ultralytics (~3 GB) for model inference
```

What it sets up:

| Where | What |
|---|---|
| `/opt/jdboard` | The app: backend, built frontend, Python environment (owned by root) |
| `/var/lib/jdboard` | Models, logs and settings (owned by the `jdboard` user) |
| `/etc/jdboard` | `jdboard.env` (settings) and `htpasswd` (the dashboard login) |
| `jdboard.service` | The backend, running as the unprivileged **`jdboard`** user on `127.0.0.1` only |
| nginx | HTTPS (self-signed certificate in `/etc/jdboard/tls`; plain HTTP redirects to it), serves the frontend, forwards `/api` to the backend, and checks the login |
| fail2ban | Blocks an IP for 15 minutes after 5 wrong logins within 10 minutes |

The `jdboard` user has no password or login shell and can't read your home folder.
Its only root access is `/opt/jdboard/bin/jdboard-admin`, which can reboot, power off,
drop caches, manage `jtop.service` and turn start-on-boot on/off, and nothing else.
Those dashboard actions don't ask for a password unless you set an **admin password**
(`sudo jdboard-passwd --admin`); then the dashboard asks for it first, remembers it for
15 minutes, and locks a client out for 5 minutes after 5 wrong tries. The installer adds you to the `jdboard` group so you can
reach the models folder over SSH (log in again first).

If you already have a checkout with a `.venv` and models, the installer copies them
(nothing is re-downloaded) and leaves the originals in place.

```bash
journalctl -u jdboard -f                              # logs
sudo systemctl restart jdboard                        # restart
sudo jdboard-passwd                                   # change the dashboard login
sudo jdboard-passwd --admin                           # set the admin password (--admin --remove to drop it)
sudo jdboard-pip install <package>                    # add a library for a custom script
git pull && sudo ./scripts/install.sh                     # update (rebuilds the frontend if it changed)
sudo ./scripts/install.sh --uninstall                 # remove (keeps models; --purge removes them too)
```

Other options: `--https-port N` (default 443), `--port N` (HTTP, default 80), `--no-https`,
`--renew-cert` (e.g. after the IP changed), `--no-fail2ban`, `--backend-port N` (default 5001),
`--fresh-venv`, `--no-migrate`.

The certificate is self-signed, so the browser warns the first time; accept it once, or put
your own certificate at `/etc/jdboard/tls/jdboard.crt` / `jdboard.key` and reload nginx.

> **Security:** JDBoard has a web terminal and can reboot the device. Keep the login,
> and to reach it from outside your network use a VPN rather than forwarding the port.

### API keys (bots and scripts)

Programs use an API key instead of the dashboard login. Create one in
**Settings → API Keys** (it's shown once), choosing what it may do:

| Scope | Allows |
|---|---|
| Inference only | list models, load/unload them, run inference |
| Read only | every read (monitoring, models, logs, live Socket.IO updates); no changes |
| Full access | everything except the web terminal and managing keys (admin actions still need the admin password) |

Send it as a Bearer token. The Jetson's certificate is self-signed, so tell the
client not to verify it (`-k` / `verify=False`); the connection and the key are
still encrypted:

```bash
curl -k -H "Authorization: Bearer jdb_..." https://jetson.local/api/models/list
curl -k -H "Authorization: Bearer jdb_..." -F image=@photo.jpg https://jetson.local/api/inference/YOLOv11n
```

```python
import requests, urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)   # self-signed certificate

r = requests.post("https://jetson.local/api/inference/YOLOv11n",
                  headers={"Authorization": "Bearer jdb_..."},
                  files={"image": open("photo.jpg", "rb")}, verify=False)
print(r.json()["data"]["result"]["predictions"])
```

To also check that you're talking to *your* Jetson, copy `/etc/jdboard/tls/jdboard.crt`
to the bot's machine and use `--cacert jdboard.crt` / `verify="jdboard.crt"` instead.

Keys are stored hashed in `/var/lib/jdboard/config/api_keys.json` and can be revoked
any time; a client sending 10 wrong keys in a minute has its keys refused for 10 minutes.

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

## API

Everything the dashboard does goes through its HTTP API under `/api`. The dashboard's
**API** page lists every route with its parameters and lets you try them, either as
yourself or with an API key to see exactly what a bot with that key can do.

**Authentication:** a browser uses the dashboard login; programs send an API key as
`Authorization: Bearer jdb_...` (see *API keys* above). The certificate is self-signed,
so use `curl -k` / `verify=False`. The last column shows which key scopes may call a
route; "login only" routes (web terminal, managing keys) can't be called with a key.

### Models

| Method | Path | What it does | Keys |
|---|---|---|---|
| GET | `/api/models` | List all available AI models | inference, read, full |
| DELETE | `/api/models/<model_id>` | Delete a model from the system (⚠) | full |
| DELETE | `/api/models/<model_id>/custom-script` | Remove a model's custom script so it uses the default handler again (⚠) | full |
| GET | `/api/models/<model_id>/custom-script` | Get the custom inference script for a specific model | read, full |
| PUT | `/api/models/<model_id>/custom-script` | Save an edited inference script for a model (body: {"script_content": "..."}) | full |
| POST | `/api/models/<model_id>/force-reload` | Force unload and reload a model from memory | full |
| POST | `/api/models/<model_id>/load` | Load a model for inference | inference, full |
| PUT | `/api/models/<model_id>/rename` | Rename a model | full |
| POST | `/api/models/<model_id>/unload` | Unload a model from memory | inference, full |
| GET | `/api/models/active-downloads` | Get list of active downloads/conversions to restore state on page reload | inference, read, full |
| POST | `/api/models/cancel-download` | Cancel an active download | full |
| GET | `/api/models/custom-script-template` | Download the custom model inference script template | inference, read, full |
| POST | `/api/models/download-yolo` | Download and optionally convert a YOLO model with custom script support and real-time progress updates | full |
| GET | `/api/models/downloads/<download_id>/status` | State of one download: active (with progress), completed, failed, or unknown | read, full |
| POST | `/api/models/emergency-cleanup` | Emergency cleanup to free all GPU memory (⚠) | full |
| GET | `/api/models/list` | List all models with detailed information | inference, read, full |
| POST | `/api/models/upload` | Upload a model file; Ultralytics .pt and any .onnx can be converted to TensorRT | full |

### Inference

| Method | Path | What it does | Keys |
|---|---|---|---|
| POST | `/api/inference/<model_id>` | Run inference on uploaded image | inference, full |

### Logs

| Method | Path | What it does | Keys |
|---|---|---|---|
| GET | `/api/logs/inference` | Get inference logs with pagination and filtering | read, full |
| POST | `/api/logs/inference/clear` | Clear all inference logs (⚠) | full |
| GET | `/api/logs/inference/export/<format>` | Export inference logs in different formats | read, full |
| GET | `/api/logs/inference/stats` | Get detailed inference statistics | read, full |
| GET | `/api/logs/requests` | Get request logs with pagination | read, full |
| GET | `/api/logs/stats` | Get request statistics | read, full |

### System

| Method | Path | What it does | Keys |
|---|---|---|---|
| GET | `/api/gpu/memory` | Get GPU memory usage information | read, full |
| GET | `/api/system/autostart` | Whether JDBoard starts on boot (systemd) | read, full |
| POST | `/api/system/autostart` | Turn starting JDBoard on boot on or off (systemctl enable/disable) (admin password) | full |
| POST | `/api/system/clear-cache` | Clear system cache and free memory (admin password, ⚠) | full |
| GET | `/api/system/fan-mode` | Get current and available fan profiles from jtop | read, full |
| POST | `/api/system/fan-mode` | Set fan profile through jtop.service (no sudo required) | full |
| GET | `/api/system/gpu` | Get GPU status and statistics | read, full |
| GET | `/api/system/info` | Get comprehensive system information | read, full |
| POST | `/api/system/jetson-clocks` | Turn jetson_clocks on/off through jtop.service (no sudo required) | full |
| POST | `/api/system/jtop-force-reconnect` | Force reconnect to jtop without restarting the service (no sudo required) | full |
| POST | `/api/system/jtop-install-service` | Install and start the jtop service (admin password, ⚠) | full |
| POST | `/api/system/jtop-restart-service` | Restart the jtop service to fix broken pipe issues (admin password, ⚠) | full |
| GET | `/api/system/logs` | Get system logs with optional filtering for broken pipe monitoring | read, full |
| POST | `/api/system/power-mode` | Set NV power mode through jtop.service (no sudo required) | full |
| GET | `/api/system/power-modes` | Get available NV power modes from jtop | read, full |
| GET | `/api/system/privileges` | Whether admin actions (reboot, shutdown, jtop, cache) need a password | read, full |
| GET | `/api/system/processes` | Get list of running processes with optional pagination and sorting | read, full |
| POST | `/api/system/processes/<pid>/kill` | Kill a process by PID (⚠) | full |
| POST | `/api/system/reboot` | Reboot the system (admin password, ⚠) | full |
| POST | `/api/system/shutdown` | Shutdown the system (admin password, ⚠) | full |
| GET | `/api/system/status` | Get comprehensive system status | read, full |

### Settings

| Method | Path | What it does | Keys |
|---|---|---|---|
| GET | `/api/settings` | Get dashboard settings, with hardware settings read live from jtop | read, full |
| POST | `/api/settings` | Save dashboard settings (hardware settings are applied via their own endpoints) | full |

### API keys

| Method | Path | What it does | Keys |
|---|---|---|---|
| GET | `/api/api-keys` | List API keys (name, scope, prefix, last use) - never the keys themselves | login only |
| POST | `/api/api-keys` | Create an API key. The response contains the full key (admin password) | login only |
| DELETE | `/api/api-keys/<key_id>` | Revoke an API key; anything using it stops working at once (⚠) | login only |
| POST | `/api/api-keys/<key_id>/reveal` | Show a key again - only with the admin password, so one must be set (admin password) | login only |

### Terminal

| Method | Path | What it does | Keys |
|---|---|---|---|
| POST | `/api/terminal/complete` | Handle tab completion for terminal commands | login only |
| POST | `/api/terminal/execute` | Execute a terminal command safely with session support | login only |
| GET | `/api/terminal/userinfo` | Get current user and hostname information for terminal display | login only |

⚠ = changes or removes something, or affects the whole device (the API page asks first).

## Supported Formats

| Framework | Extensions | GPU Acceleration |
|-----------|------------|------------------|
| ONNX | .onnx | CUDA |
| TensorRT | .trt, .engine | TensorRT |
| PyTorch | .pth, .pt | CUDA |
| TensorFlow | .pb, .h5 | CUDA |

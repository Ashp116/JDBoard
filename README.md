
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
git pull && sudo ./scripts/install.sh --rebuild-frontend   # update
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

## API Endpoints

- `POST /api/inference` - Run AI inference on uploaded images

## Supported Formats

| Framework | Extensions | GPU Acceleration |
|-----------|------------|------------------|
| ONNX | .onnx | CUDA |
| TensorRT | .trt, .engine | TensorRT |
| PyTorch | .pth, .pt | CUDA |
| TensorFlow | .pb, .h5 | CUDA |

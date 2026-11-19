
<p align="center">
   <img src="/JDBoardIcon.svg" alt="JDBoard Logo" width="120" />
</p>

# JDBoard

A dashboard for NVIDIA Jetson devices: live system monitoring, model management and
inference, in the browser.

## Features

- **Monitoring** – CPU, GPU, memory, temperatures, power and fan from jtop, live over
  WebSocket; process list; system and inference logs
- **Hardware controls** – power mode, fan mode, Jetson Clocks, reboot and shutdown
- **Models** – download YOLO models, or upload your own `.pt`, `.onnx` or `.engine` file;
  convert to TensorRT (FP32, FP16 or INT8 with calibration images); search, sort and filter
- **Inference** – run models on images from the dashboard; edit a model's inference
  script (Python, with syntax highlighting and error lines)
- **API** – every action is an HTTP API; API keys with scopes for bots and scripts; the
  Inference page's **API Routes** tab has examples and a test panel
- **Web terminal**
- **Secure by default** – HTTPS, a login, an optional admin password for dangerous
  actions, and an unprivileged service user

## Quick Start

**Prerequisites**
- NVIDIA Jetson with JetPack 6/7 (tested: Orin Nano 8GB, JetPack 7.2)
- [jetson-stats](https://github.com/rbonghi/jetson_stats) (`sudo pip3 install -U jetson-stats`)
- Node.js 20+ only if you build the frontend yourself (otherwise the installer downloads a prebuilt one)

### Install (runs on boot, behind nginx)

Run in a terminal (it asks you to choose the dashboard login):

```bash
git clone https://github.com/Ashp116/JDBoard.git
cd JDBoard
sudo ./scripts/install.sh                  # dashboard on https://<jetson-ip>/
sudo ./scripts/install.sh --with-pytorch   # also install PyTorch + Ultralytics (~3 GB) for model inference
```

`--with-pytorch` installs the PyTorch build for your JetPack: on JetPack 7 (CUDA 13),
PyTorch's own CUDA builds pinned to a tested version (currently torch 2.15.0 /
torchvision 0.29.2 for CUDA 13.2); on JetPack 6 (CUDA 12.6), NVIDIA's Jetson builds
from `pypi.jetson-ai-lab.io`. It then checks that PyTorch can use the GPU.

What it sets up:

| Where | What |
|---|---|
| `/opt/jdboard` | The app: backend, built frontend, Python environment (owned by root) |
| `/var/lib/jdboard` | Models, logs, settings and API keys (owned by the `jdboard` user) |
| `/etc/jdboard` | `jdboard.env` (settings), `htpasswd` (the dashboard login), `admin-password`, `tls/` (certificate) |
| `jdboard.service` | The backend, running as the unprivileged **`jdboard`** user on `127.0.0.1` only |
| nginx | HTTPS (plain HTTP redirects to it), serves the frontend, forwards `/api` to the backend, checks the login; only serves the site while JDBoard runs |
| fail2ban | Blocks an IP for 15 minutes after 5 wrong logins within 10 minutes |

The `jdboard` user has no password or login shell and can't read your home folder. Its
only root access is `/opt/jdboard/bin/jdboard-admin`, which can reboot, power off, drop
caches, manage `jtop.service` and turn start-on-boot on/off, and nothing else.

Those actions don't ask for a password unless you set an **admin password** (the
installer offers to, or `sudo jdboard-passwd --admin`). Then the dashboard asks for it
first, remembers it for 15 minutes, and locks a client out for 5 minutes after 5 wrong
tries. It's separate from your Linux password and from the dashboard login.

The installer adds you to the `jdboard` group so you can reach `/var/lib/jdboard` over
SSH (log in again first). If you already have a checkout with a `.venv` and models, it
copies them (nothing is re-downloaded) and leaves the originals in place.

```bash
journalctl -u jdboard -f                     # logs
sudo systemctl restart jdboard               # restart
git pull && sudo ./scripts/install.sh        # update (rebuilds the frontend if it changed)
sudo jdboard-passwd                          # change the dashboard login
sudo jdboard-passwd --admin                  # set the admin password (--admin --remove to drop it)
sudo jdboard-pip install <package>           # add a library for a custom inference script
jdboard-pytorch status                       # PyTorch version and whether it can use the GPU
sudo ./scripts/install.sh --uninstall        # remove (keeps models; add --purge to remove them too)
```

To use a different PyTorch, `jdboard-pytorch` installs it into JDBoard's environment, keeps
numpy and JetPack's OpenCV untouched, checks the GPU works and restarts JDBoard:

```bash
sudo jdboard-pytorch install                         # the recommended build for this JetPack
sudo jdboard-pytorch install 2.14.0                  # a specific version
sudo jdboard-pytorch install --index-url <URL>       # from your own package index
sudo jdboard-pytorch install --wheel torch-....whl   # a wheel file (repeat --wheel for torchvision)
sudo jdboard-pytorch uninstall                       # remove it (models stop loading; monitoring keeps working)
```

Add `--dry-run` to see what would run. Re-running the installer never replaces a PyTorch
that's already there. Settings → System Information shows the installed version.

Other options: `--https-port N` (default 443), `--port N` (HTTP, default 80), `--no-https`,
`--renew-cert` (e.g. after the IP changed), `--no-fail2ban`, `--admin-password` /
`--no-admin-password`, `--backend-port N` (default 5001), `--fresh-venv`, `--no-migrate`.

Turning **Settings → Auto-start JDBoard** off stops JDBoard and its website from starting
at boot (`sudo systemctl start jdboard` starts it by hand); updates keep that choice.

The certificate is self-signed, so the browser warns the first time; accept it once, or
put your own certificate at `/etc/jdboard/tls/jdboard.crt` / `jdboard.key` and reload nginx.

> **Security:** JDBoard has a web terminal and can reboot the device. Keep the login,
> and to reach it from outside your network use a VPN rather than forwarding the port.

### Development

```bash
./backend.sh    # Flask API on :5000
./frontend.sh   # Vite dev server on :3000 (proxies /api to :5000) - open http://<jetson-ip>:3000
```

Without the service, `./backend.sh` also serves a built frontend (`cd frontend && npm run build`)
on http://<jetson-ip>:5000. Set `JDBOARD_PORT` to change the port. In a development checkout,
admin actions ask for your sudo password instead of using the service's helper.

## API

Everything the dashboard does goes through its HTTP API under `/api`. The certificate is
self-signed, so clients skip verification (`curl -k`, `verify=False`); the connection is
still encrypted.

### API keys

Programs use an API key instead of the dashboard login. Create one in
**Settings → API Keys** (needs the admin password, if one is set) and choose what it may do:

| Scope | Allows |
|---|---|
| Inference only | list models, load/unload them, run inference |
| Read only | every read (monitoring, models, logs, live Socket.IO updates); no changes |
| Full access | everything except the web terminal and managing keys (admin actions still need the admin password) |

The key is shown when you create it and can be viewed again later with the admin password;
**Revoke** stops it at once. Keys are stored hashed for checking, plus encrypted with a key
only the service can read (`/var/lib/jdboard/config/`). A client sending 10 wrong keys in a
minute has its keys refused for 10 minutes.

### Inference routes

The Inference page's **API Routes** tab shows these with curl, JavaScript and Python
examples, and a test panel to try them with your login or an API key.

| Method | Path | What it does | Key scopes |
|---|---|---|---|
| POST | `/api/inference/<model_id>` | Run inference on an image (multipart field `image`) | Inference, Full |
| GET | `/api/models/list` | List models (id, framework, precision, loaded) | Inference, Read, Full |
| POST | `/api/models/<model_id>/load` | Load a model | Inference, Full |
| POST | `/api/models/<model_id>/unload` | Unload a model | Inference, Full |
| POST | `/api/models/<model_id>/force-reload` | Unload and load again | Full |

```bash
curl -k -H "Authorization: Bearer jdb_..." https://jetson.local/api/models/list
curl -k -X POST -H "Authorization: Bearer jdb_..." https://jetson.local/api/models/YOLOv11n/load
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

Each prediction has `class`, `class_id`, `confidence` and `bbox` (`x`, `y`, `width`,
`height` in original-image pixels; `x`/`y` is the box centre). To also check that you're
talking to *your* Jetson, copy `/etc/jdboard/tls/jdboard.crt` to the client and use
`--cacert jdboard.crt` / `verify="jdboard.crt"` instead of skipping verification.

## Supported Formats

| Format | Extensions | How JDBoard runs it |
|---|---|---|
| TensorRT | `.engine`, `.trt` | TensorRT on the GPU (fastest) |
| PyTorch | `.pt` (Ultralytics YOLO) | PyTorch on the GPU (FP32 or FP16); can be converted to TensorRT |
| ONNX | `.onnx` | Converted to TensorRT on upload (trtexec, FP32/FP16); not run directly, since ONNX Runtime is disabled on Jetson |

Ultralytics models work with the built-in handler for every task: detection boxes,
segmentation masks, pose keypoints with skeletons, oriented boxes and classification are
drawn on the Inference page. Other models (e.g. an RF-DETR TensorRT engine) need a custom
inference script, edited from the model's card. A script returns predictions with an
optional `bbox` and a list of `shapes` (polygon, keypoints, polyline, circle, text,
image) in original-image pixels, and the dashboard draws them; the template and
`backend/jdboard_annotations.py` describe the format.

## Architecture

- **Frontend:** React 18 + TypeScript (Vite), styled-components, Chart.js, Socket.IO client
- **Backend:** Flask + Flask-SocketIO; system data from jtop
- **Inference:** a separate worker process (PyTorch, TensorRT, Ultralytics) that only runs
  while a model is loaded, so JDBoard idles at ~100 MB; conversions run as subprocesses
- **Web server:** nginx (HTTPS, login, API key checks) in front of the backend
- **Storage:** models and a JSON registry, SQLite for request and inference logs, JSON settings

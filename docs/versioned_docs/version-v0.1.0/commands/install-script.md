---
sidebar_position: 1
---

# install.sh

`scripts/install.sh` installs, updates and uninstalls JDBoard. Run it with `sudo`,
from the [downloaded release](../getting-started/installation.md#1-download-a-release)
(or a git clone), in a terminal (it asks questions).

```bash
sudo ./scripts/install.sh                      # install, or update an existing install
sudo ./scripts/install.sh --with-pytorch       # also install PyTorch + Ultralytics (~3 GB)
sudo ./scripts/install.sh --uninstall          # remove JDBoard (keeps data and the login)
sudo ./scripts/install.sh --uninstall --purge  # remove everything, including models
sudo ./scripts/install.sh --help               # list the options
```

## Options

| Option | Default | What it does |
|---|---|---|
| `--with-pytorch` | off | Install PyTorch, torchvision and Ultralytics for your JetPack. Never replaces a PyTorch that's already installed. |
| `--https-port N` | 443 | Port for the dashboard over HTTPS. |
| `--port N` | 80 | HTTP port. Redirects to HTTPS (or serves the dashboard with `--no-https`). |
| `--no-https` | | Plain HTTP only. Passwords are then sent unencrypted; only for trusted networks. |
| `--renew-cert` | | Make a new self-signed certificate, for example after the Jetson's IP or hostname changed. |
| `--no-fail2ban` | | Don't install or configure fail2ban's login protection. |
| `--admin-password` | | Ask for an admin password, even when updating. (Normally it's only offered on a fresh install.) |
| `--no-admin-password` | | Don't offer an admin password. |
| `--backend-port N` | 5001 | Port the backend listens on (on `127.0.0.1` only). |
| `--rebuild-frontend` | | Build the dashboard even if its source hasn't changed (needs Node.js 20+). |
| `--fresh-venv` | | Recreate the Python environment from scratch. |
| `--no-migrate` | | Don't copy `.venv` and models from a development checkout. |
| `--uninstall` | | Remove JDBoard. Add `--purge` to also delete `/var/lib/jdboard`, `/etc/jdboard` and the `jdboard` user. |

## What it does

1. Checks for jtop and starts `jtop.service` if needed.
2. Installs nginx (and fail2ban) if they're missing.
3. Creates the `jdboard` service user and the folders in `/opt/jdboard`,
   `/var/lib/jdboard` and `/etc/jdboard`.
4. Sets up the Python environment with JDBoard's packages, and PyTorch with
   `--with-pytorch`.
5. Builds the dashboard with Node.js 20+ if it's installed and the source changed;
   without Node.js it downloads the prebuilt dashboard from the GitHub release.
6. Asks for the dashboard login (first install) and optionally an admin password.
7. Creates the self-signed certificate, the nginx site, the fail2ban jail and
   `jdboard.service`, installs the [helper commands](service.md), and starts JDBoard.

Re-running it is safe: it updates what's changed and keeps your data, login, keys and
PyTorch. See [Updating](../getting-started/updating.md).

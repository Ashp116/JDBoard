---
sidebar_position: 2
---

# Installation

The installer sets JDBoard up as a system service that starts on boot, behind nginx
with HTTPS and a login.

## 1. Download a release

Download the latest release from
[GitHub Releases](https://github.com/Ashp116/JDBoard/releases) and unpack it:

```bash
TAG=$(curl -fsSL https://api.github.com/repos/Ashp116/JDBoard/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4)
curl -fsSL -o jdboard.tar.gz https://github.com/Ashp116/JDBoard/archive/refs/tags/$TAG.tar.gz
mkdir jdboard && tar -xzf jdboard.tar.gz -C jdboard --strip-components=1
cd jdboard
```

The first line looks up the newest release's tag (for example `v1.2.0`); the others
download that release's source and unpack it into a folder called `jdboard`.

To install a specific release, such as a beta, set the tag yourself instead:

```bash
TAG=v1.2.0-beta.1
```

You can also download **Source code (tar.gz)** from the release page in a browser and
copy it to the Jetson.

:::tip[You don't need Node.js]
Each release has the dashboard already built (`jdboard-frontend.tar.gz`). If Node.js
isn't installed, the installer downloads that instead of building the dashboard on
the Jetson. If Node.js 20+ is installed, it builds the dashboard itself.
:::

## 2. Run the installer

Run it **in a terminal** on the Jetson (directly or over SSH), because it asks you
questions:

```bash
sudo ./scripts/install.sh --with-pytorch
```

Leave out `--with-pytorch` if you only want monitoring, or want to
[install PyTorch yourself](../commands/jdboard-pytorch.md) later. PyTorch is about
3 GB.

The installer asks for:

1. **The dashboard login**: a username and password you'll use in the browser.
2. **An admin password** (optional). If you set one, the dashboard asks for it before
   rebooting, shutting down, clearing the cache, managing the jtop service, changing
   start-on-boot, and creating or viewing API keys. You can set it later with
   [`jdboard-passwd --admin`](../commands/jdboard-passwd.md).

It then takes a few minutes. When it finishes, it prints the address to open.

## 3. Open the dashboard

Go to `https://<jetson-ip>/` from any computer on your network, for example
`https://192.168.1.50/`. Find the Jetson's IP with `hostname -I`.

The certificate is self-signed, so the browser warns you the first time. Accept the
warning once (in Chrome: **Advanced → Proceed**). The connection is still encrypted.
To avoid the warning, put your own certificate at `/etc/jdboard/tls/jdboard.crt` and
`/etc/jdboard/tls/jdboard.key` and run `sudo systemctl reload nginx`.

Log in with the username and password from step 2.

## What the installer sets up

| Where | What |
|---|---|
| `/opt/jdboard` | The app: backend, built dashboard, Python environment (`venv`). Owned by root. |
| `/var/lib/jdboard` | Your data: models, logs, settings and API keys. Owned by the `jdboard` user. |
| `/etc/jdboard` | `jdboard.env` (settings), `htpasswd` (the login), `admin-password`, `tls/` (the certificate). |
| `jdboard.service` | The backend, running as the unprivileged **`jdboard`** user on `127.0.0.1:5001` only. |
| nginx | HTTPS on port 443 (HTTP on port 80 redirects to it). Serves the dashboard, checks the login and API keys, forwards `/api` to the backend. Only serves the site while JDBoard runs. |
| fail2ban | Blocks an IP for 15 minutes after 5 wrong logins within 10 minutes. |
| `/etc/sudoers.d/jdboard` | Lets the service run `/opt/jdboard/bin/jdboard-admin`, and nothing else, as root. |

The `jdboard` user has no password or login shell and can't read your home folder.

The installer also adds you to the `jdboard` group, so you can read
`/var/lib/jdboard` (models, logs) over SSH. Log out and back in for that to take
effect.

## Installing from a git clone

Developers can install from a clone instead of a release; the installer works the same:

```bash
git clone https://github.com/Ashp116/JDBoard.git
cd JDBoard
sudo ./scripts/install.sh --with-pytorch
```

If you've been running JDBoard from that folder with `./backend.sh` and it has a
`.venv` and models, the installer copies them to the installed layout, so nothing is
downloaded again. The originals are left in place. Pass `--no-migrate` to skip this.

## Options

The installer has options for ports, HTTPS, fail2ban and more. See
[install.sh](../commands/install-script.md) for all of them.

Next: [First steps](first-steps.md).

---
sidebar_position: 5
---

# The service and its helpers

## Everyday commands

```bash
systemctl status jdboard              # is it running?
sudo systemctl restart jdboard        # restart it
sudo systemctl start jdboard          # start it (e.g. with start-on-boot turned off)
journalctl -u jdboard -f              # follow its log
journalctl -u jdboard --since today   # today's log
```

## Files

| Path | Contents |
|---|---|
| `/etc/jdboard/jdboard.env` | Settings for the service (ports, data folder) |
| `/etc/jdboard/htpasswd` | The dashboard login |
| `/etc/jdboard/admin-password` | The admin password (hashed) |
| `/etc/jdboard/tls/` | The HTTPS certificate and key |
| `/var/lib/jdboard/models/` | Models, custom scripts and the model registry |
| `/var/lib/jdboard/logs/` | Request and inference logs (SQLite) |
| `/var/lib/jdboard/config/` | Dashboard settings and API keys |
| `/opt/jdboard/version.json` | The installed version, commit and branch |

## Helper programs

The installer adds these. You don't run the last two yourself.

| Command | What it's for |
|---|---|
| [`jdboard-passwd`](jdboard-passwd.md) | Change the dashboard login or admin password |
| [`jdboard-pip`](jdboard-pip.md) | Add Python packages safely |
| [`jdboard-pytorch`](jdboard-pytorch.md) | Install, change or remove PyTorch |
| `/opt/jdboard/bin/jdboard-admin` | The only thing the service may run as root |
| `/opt/jdboard/bin/jdboard-web` | Turns the nginx site on and off with the service |

### jdboard-admin

The service runs as the unprivileged `jdboard` user. `/etc/sudoers.d/jdboard` lets it
run `jdboard-admin` as root without a password, and `jdboard-admin` accepts only fixed
actions:

| Action | Used for |
|---|---|
| `reboot`, `poweroff` | Restart / Shutdown System |
| `drop-caches` | Clear Cache on the Memory tab |
| `jtop-start`, `jtop-stop`, `jtop-restart`, `jtop-install-service` | Repairing the jtop service |
| `autostart-on`, `autostart-off` | Auto-start JDBoard |

It's owned by root and the service can't change it, so the dashboard can't run
anything else as root.

### jdboard-web

systemd runs it as root when JDBoard starts and stops: it enables the nginx site when
JDBoard starts and disables it after a clean stop. So with start-on-boot turned off,
nothing answers on the dashboard's ports after a reboot until you start JDBoard.

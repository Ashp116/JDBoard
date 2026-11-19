---
sidebar_position: 4
---

# Updating and uninstalling

## Update

From the folder you cloned:

```bash
git pull
sudo ./scripts/install.sh
```

The installer updates the app in place and keeps your models, settings, login, API
keys and PyTorch. It rebuilds the dashboard only if its source changed.

:::warning
Updating restarts JDBoard. A model conversion that's running at the time (for example
a TensorRT build) is stopped and has to be started again. Wait for conversions to
finish before updating.
:::

Settings → System Information shows the running version, commit and branch, so you
can check the update took effect.

## Start on boot

JDBoard starts at boot by default. Turn **Settings → Auto-start JDBoard** off to stop
that; the dashboard's website then isn't served after a reboot either. Start it by hand
with:

```bash
sudo systemctl start jdboard
```

Updates keep your choice.

## Uninstall

```bash
sudo ./scripts/install.sh --uninstall           # remove JDBoard; keep models, logs and the login
sudo ./scripts/install.sh --uninstall --purge   # remove everything, including models
```

Neither removes jtop, nginx or fail2ban themselves, since other software may use them;
only JDBoard's site and settings for them.

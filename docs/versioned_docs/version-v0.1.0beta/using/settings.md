---
sidebar_position: 6
---

# Settings

## System Information

The device model and module, JetPack, kernel and power model, uptime, the running
JDBoard version (version, commit and branch), and the installed PyTorch and TensorRT
versions.

**Serial Number** is hidden until you click the eye button. A copy button appears
once it's shown.

## Performance Settings

| Setting | What it does |
|---|---|
| **Jetson Clocks** | Locks CPU, GPU and memory clocks at their maximum for the current power mode. Faster, but uses more power and runs hotter. |
| **Power Mode** | The NV power model (for example 15W, 25W or MAXN SUPER, depending on the device). Some changes need a reboot. |
| **Fan Mode** | The fan profile (for example quiet or cool). |

These go through jtop's service and don't need a password.

## JDBoard Settings

- **Auto-start JDBoard**: whether JDBoard (and its website) starts at boot. An
  [admin action](dashboard.md#admin-actions).
- **Data Refresh Rate** and **Enable Notifications** for the dashboard.
- Inference analytics: export or clear the inference history.

## System Control

**Restart System** and **Shutdown System**. Both are admin actions.

The jtop service can also be repaired from here if system data stops arriving (see
[Troubleshooting](../troubleshooting.md#no-system-data)).

## API Keys

Create keys for programs that call the API, view a key again, or revoke it. Creating
and viewing need the admin password, if one is set. See
[API keys](../api/authentication.md#api-keys).

---
sidebar_position: 5
---

# System

## Status and information

| Route | Returns |
|---|---|
| <span className="method method--get">GET</span> `/api/system/status` | Current CPU, GPU, memory, disk, temperatures, power and fan, from jtop |
| <span className="method method--get">GET</span> `/api/system/gpu` | GPU usage and statistics |
| <span className="method method--get">GET</span> `/api/system/info` | Device model and module, JetPack, kernel, power model, uptime |
| <span className="method method--get">GET</span> `/api/system/version` | JDBoard `version`, `commit`, `branch`, `installed_at` |
| <span className="method method--get">GET</span> `/api/system/ml-libraries` | Installed `torch` (and its CUDA version), `torchvision`, `ultralytics`, `tensorrt` |
| <span className="method method--get">GET</span> `/api/system/serial-number` | The Jetson's `serial_number`; `404` if the device doesn't report one |
| <span className="method method--get">GET</span> `/api/system/privileges` | Whether admin actions need a password (`passwordless`, `admin_password`) |

For a stream of system data instead of polling, use the
[live updates](realtime.md).

## Hardware settings

These go through jtop's service and don't need the admin password.

| Route | Body |
|---|---|
| <span className="method method--get">GET</span> `/api/system/power-modes` | Available power modes and the current one |
| <span className="method method--post">POST</span> `/api/system/power-mode` | `{"mode": <id>}` |
| <span className="method method--get">GET</span> `/api/system/fan-mode` | Available fan profiles and the current one |
| <span className="method method--post">POST</span> `/api/system/fan-mode` | `{"mode": "quiet"}` |
| <span className="method method--post">POST</span> `/api/system/jetson-clocks` | `{"enabled": true}` |

## Admin actions

These take the admin password as `sudo_password` in the body; see
[Admin actions](authentication.md#admin-actions).

| Route | Body |
|---|---|
| <span className="method method--post">POST</span> `/api/system/reboot` | `{"sudo_password": "..."}` |
| <span className="method method--post">POST</span> `/api/system/shutdown` | `{"sudo_password": "..."}` |
| <span className="method method--post">POST</span> `/api/system/clear-cache` | `{"sudo_password": "..."}` |
| <span className="method method--get">GET</span> `/api/system/autostart` | Whether JDBoard starts on boot (no password needed) |
| <span className="method method--post">POST</span> `/api/system/autostart` | `{"enabled": false, "sudo_password": "..."}` |
| <span className="method method--post">POST</span> `/api/system/jtop-install-service` | `{"sudo_password": "..."}` |
| <span className="method method--post">POST</span> `/api/system/jtop-restart-service` | `{"sudo_password": "..."}` |
| <span className="method method--post">POST</span> `/api/system/jtop-force-reconnect` | Reconnect to jtop without restarting it (no password needed) |

## Processes

### <span className="method method--get">GET</span> `/api/system/processes`

Running processes. Query parameters: `search`, `sort_by` (default `cpu`), `page`,
`per_page` (10 to 500, default 20).

### <span className="method method--post">POST</span> `/api/system/processes/<pid>/kill`

Stops a process.

## Dashboard settings

| Route | |
|---|---|
| <span className="method method--get">GET</span> `/api/settings` | Dashboard settings, with hardware settings read live from jtop |
| <span className="method method--post">POST</span> `/api/settings` | Save dashboard settings |

## Terminal

`/api/terminal/execute`, `/api/terminal/complete` and `/api/terminal/userinfo` run the
[web terminal](../using/terminal.md). They need the dashboard login; no API key can
use them.

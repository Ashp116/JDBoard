---
sidebar_position: 1
---

# The dashboard

The sidebar has eight pages. Each has a keyboard shortcut:

| Page | Shortcut | What it's for |
|---|---|---|
| **Dashboard** | Ctrl+1 | System metrics and statistics at a glance |
| **Models** | Ctrl+2 | Download, upload, convert, load and manage models: [Models](models.md) |
| **Inference** | Ctrl+3 | Run models on images, inference history, API routes: [Inference](inference.md) |
| **Monitoring** | Ctrl+4 | Live charts for CPU, GPU, memory, network and fan: [Monitoring](monitoring.md) |
| **Processes** | Ctrl+5 | Running processes: search, sort, stop: [Monitoring](monitoring.md#processes) |
| **Terminal** | Ctrl+6 | A shell on the Jetson in the browser: [Terminal](terminal.md) |
| **Logs** | Ctrl+7 | JDBoard's system logs: [Monitoring](monitoring.md#logs) |
| **Settings** | Ctrl+8 | Device information, power and fan modes, start on boot, API keys: [Settings](settings.md) |

The connection indicator shows whether the page is receiving live data from the
Jetson. Live data arrives over a WebSocket, so it pauses if the connection drops and
resumes when it comes back.

## Admin actions

Some actions can disrupt the device: rebooting, shutting down, clearing the memory
cache, managing the jtop service, turning start-on-boot on or off, and creating or
viewing API keys. If an [admin password](../commands/jdboard-passwd.md#admin-password)
is set, the dashboard asks for it first and remembers it for 15 minutes. After 5 wrong
tries, that client is locked out for 5 minutes.

Without an admin password, those actions just run, since you're already logged in.

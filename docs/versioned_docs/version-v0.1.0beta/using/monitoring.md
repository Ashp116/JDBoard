---
sidebar_position: 4
---

# Monitoring, processes and logs

All system data comes from [jtop](../getting-started/prerequisites.md#install-jtop)
and is streamed to the browser live.

## Monitoring

The **Monitoring** page has a chart and details for each part of the system:

| Tab | Shows |
|---|---|
| **CPU** | Usage per core, frequency, temperature |
| **GPU** | Usage, frequency, temperature |
| **Memory** | RAM used, cached and free, and swap. **Clear Cache** frees cached memory (an [admin action](dashboard.md#admin-actions)). |
| **Network** | Data sent and received |
| **Fan** | Fan speed and power use |

Charts keep recording in the background while you're on other pages. **Pause Charts**
freezes them; **Clear Buffer** starts the history again.

## Processes

The **Processes** page lists running processes with their CPU and memory use. Search
by name, PID or command, sort by any column, and stop a process.

## Logs

The **Logs** page shows JDBoard's own log: models loading, conversions, inference,
errors. On the installed service you can also read it on the Jetson:

```bash
journalctl -u jdboard -f
```

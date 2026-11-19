---
sidebar_position: 7
---

# Live updates

The dashboard gets live data over [Socket.IO](https://socket.io/) at
`https://<jetson-ip>/socket.io/`, authenticated like any other request. API keys with
the **Read** or **Full** scope can connect.

## Events from the server

| Event | When | Contains |
|---|---|---|
| `connected` | On connecting | A welcome message |
| `system_update` | At the **Data Refresh Rate** set in Settings | `{"data": {...}}`: CPU, GPU, memory, disk, temperatures, power and fan, like [`/api/system/status`](system.md#status-and-information). On a problem, `{"error": "..."}` instead. |
| `system_data` | In reply to `request_system_data` | The current system data |
| `log_message`, `logs_update` | New log lines (after `subscribe_logs`) | Log entries |
| `download_progress` | During a model download or conversion | `download_id`, progress and status |
| `download_complete`, `download_error`, `download_cancelled` | When it ends | `download_id` and the result or error |

## Events you can send

| Event | Effect |
|---|---|
| `request_system_data` | Reply with a `system_data` event now |
| `subscribe_logs` | Start receiving log events |

## Example

```python
import socketio   # pip install "python-socketio[client]"

sio = socketio.Client(ssl_verify=False)

@sio.on("system_update")
def on_update(message):
    data = message.get("data") or {}
    print("CPU", data.get("cpu", {}).get("usage"), "% | GPU", data.get("gpu", {}).get("usage"), "%")

sio.connect("https://<jetson-ip>", headers={"Authorization": "Bearer jdb_..."},
            transports=["polling", "websocket"])
sio.wait()
```

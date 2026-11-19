---
sidebar_position: 1
title: API overview
---

# API overview

Everything the dashboard does goes through JDBoard's HTTP API, so scripts, bots and
other programs can do the same.

## Base URL

```text
https://<jetson-ip>/api
```

For example `https://192.168.1.50/api/models/list`. With `--https-port`, include the
port.

The certificate is self-signed, so clients usually skip verification (`curl -k`,
`verify=False` in Python). The connection is still encrypted; see
[Security](../security.md#verifying-the-certificate-from-clients) to verify it
properly.

## Authentication

Send either an **API key** (recommended for programs) or the **dashboard login**:

```bash
curl -k -H "Authorization: Bearer jdb_..." https://<jetson-ip>/api/models/list
curl -k -u admin:password            https://<jetson-ip>/api/models/list
```

See [Authentication](authentication.md) for keys and what each scope allows.

## Requests and responses

- Request bodies are JSON (`Content-Type: application/json`), except file uploads,
  which are `multipart/form-data`.
- Responses are JSON with a `success` field. Failures also have an `error` message and
  an HTTP error status:

```json
{"success": false, "error": "No image provided"}
```

| Status | Meaning |
|---|---|
| 200 | Success |
| 400 | Something's wrong with the request (missing field, bad image, …) |
| 401 | Missing or wrong login or API key, or a wrong admin password |
| 403 | The API key's scope doesn't allow this |
| 404 | No such model, key, … |
| 429 | Too many wrong admin passwords; wait and retry |
| 500 | The action failed; the `error` says why |
| 507 | GPU memory exhausted during inference; all models were unloaded |

## Quick example

```python
import requests, urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)   # self-signed certificate

BASE = "https://192.168.1.50/api"
HEADERS = {"Authorization": "Bearer jdb_..."}

requests.post(f"{BASE}/models/YOLOv11n/load", headers=HEADERS, verify=False)

with open("photo.jpg", "rb") as f:
    r = requests.post(f"{BASE}/inference/YOLOv11n", headers=HEADERS,
                      files={"image": f}, verify=False)

for p in r.json()["data"]["result"]["predictions"]:
    print(p["class"], round(p["confidence"], 2), p.get("bbox"))
```

## Sections

| Page | Routes |
|---|---|
| [Inference](inference.md) | Run a model on an image |
| [Models](models.md) | List, load, unload, upload, download, convert, rename, delete, custom scripts |
| [System](system.md) | Status, information, power and fan modes, reboot, processes, settings |
| [Logs](logs.md) | System, request and inference logs |
| [Live updates](realtime.md) | Socket.IO events for live system data and logs |

The dashboard's **Inference → API Routes** tab also has examples and a test panel for
the inference routes.

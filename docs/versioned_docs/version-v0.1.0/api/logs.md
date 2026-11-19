---
sidebar_position: 6
---

# Logs

## System log

### <span className="method method--get">GET</span> `/api/system/logs`

JDBoard's recent log lines. Query parameters: `filter` (text to match) and `since`.

## Request log

| Route | |
|---|---|
| <span className="method method--get">GET</span> `/api/logs/requests` | API requests, newest first. Query: `page`, `per_page` |
| <span className="method method--get">GET</span> `/api/logs/stats` | Request counts and statistics |

## Inference log

Every inference is recorded: model, time taken, number of predictions, client IP and
device.

### <span className="method method--get">GET</span> `/api/logs/inference`

Query parameters, all optional:

| Parameter | Filters by |
|---|---|
| `model_id` | Model |
| `client_ip` | Client IP |
| `device_info` | Client device (for example `Desktop`) |
| `start_date`, `end_date` | Date range |
| `search` | Text anywhere in the entry |
| `page`, `per_page` | Pagination |

### <span className="method method--get">GET</span> `/api/logs/inference/stats`

Totals and averages: inferences per model, average time, and more.

### <span className="method method--get">GET</span> `/api/logs/inference/export/<format>`

Downloads the log as `json`, `csv` or `txt`.

### <span className="method method--post">POST</span> `/api/logs/inference/clear`

Deletes the inference log.

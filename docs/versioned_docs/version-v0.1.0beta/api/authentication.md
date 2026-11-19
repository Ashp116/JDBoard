---
sidebar_position: 2
---

# Authentication

nginx checks every request to `/api` before it reaches JDBoard. Send one of:

| Method | Header | Use for |
|---|---|---|
| **API key** | `Authorization: Bearer jdb_...` | Programs, bots, scripts |
| **Dashboard login** | HTTP Basic (`curl -u user:password`) | Quick tests; has full access, like the dashboard |

## API keys

Create keys in **Settings → API Keys**. Creating a key, and viewing it again later,
need the [admin password](../commands/jdboard-passwd.md#admin-password) if one is
set. **Revoke** stops a key at once.

Keys look like `jdb_` followed by random characters. JDBoard stores a hash to check
them, plus a copy encrypted with a key only the service can read, so they can be shown
again.

### Scopes

Each key has one scope:

| Scope | Allows |
|---|---|
| **Inference only** | List models, load and unload them, run inference |
| **Read only** | Every `GET` (monitoring, models, logs) and live updates over Socket.IO; no changes |
| **Full access** | Everything except the terminal and managing keys. Admin actions still need the admin password. |

Exactly what *Inference only* allows:

| Method | Path |
|---|---|
| `GET` | `/api/models`, `/api/models/list` |
| `POST` | `/api/models/<model_id>/load`, `/api/models/<model_id>/unload` |
| `POST` | `/api/inference/<model_id>` |

**No key** can use `/api/terminal/*`, `/api/api-keys*` or `/api/auth/*`, whatever its
scope. Those need the dashboard login.

A request outside the key's scope gets `403`. A wrong key gets `401`. A client that
sends 10 wrong keys within a minute has all its keys refused for 10 minutes, also with
`401`.

## Admin actions

Rebooting, shutting down, clearing the cache, managing the jtop service and changing
start-on-boot take the admin password in the JSON body, in the `sudo_password` field:

```bash
curl -k -X POST -u admin:password -H "Content-Type: application/json" \
     -d '{"sudo_password": "<admin password>"}' \
     https://<jetson-ip>/api/system/clear-cache
```

If no admin password is set, leave the field out. In a
[development checkout](../getting-started/development.md), it's your sudo password
instead.

## Managing keys over the API

These need the dashboard login (not a key).

### <span className="method method--get">GET</span> `/api/api-keys`

Lists keys: id, name, scope, when created and last used. Never the keys themselves.

### <span className="method method--post">POST</span> `/api/api-keys`

```json
{"name": "warehouse-bot", "scope": "inference", "admin_password": "..."}
```

`scope` is `inference`, `read` or `full`. The response contains the new key.

### <span className="method method--post">POST</span> `/api/api-keys/<key_id>/reveal`

```json
{"admin_password": "..."}
```

Returns the key again. Only works when an admin password is set.

### <span className="method method--delete">DELETE</span> `/api/api-keys/<key_id>`

Revokes the key.

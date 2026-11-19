---
sidebar_position: 10
---

# Security

JDBoard can run commands, reboot the device and run code, so it's locked down by
default.

| Layer | What it does |
|---|---|
| **HTTPS** | All traffic is encrypted, including the login. The certificate is self-signed; use your own to avoid the browser warning. |
| **Login** | nginx asks for the dashboard login on every page and API call. Change it with [`jdboard-passwd`](commands/jdboard-passwd.md). |
| **fail2ban** | An IP is blocked for 15 minutes after 5 wrong logins within 10 minutes. |
| **Admin password** | Optional. Asked for before rebooting, shutting down, clearing the cache, managing jtop, changing start-on-boot, and creating or viewing API keys. |
| **API keys** | Programs get a key with only the access they need, instead of your login. A client that sends 10 wrong keys in a minute has keys refused for 10 minutes. |
| **Service user** | The backend runs as `jdboard`: no password, no login shell, no access to your home folder, and it only listens on `127.0.0.1`. |
| **Root access** | Only through [`jdboard-admin`](commands/service.md#jdboard-admin), which accepts a fixed list of actions. |

## Keep it on your network

:::danger
Don't forward JDBoard's port on your router. The web terminal and admin actions make
it a high-value target. To reach it from outside your network, use a VPN such as
WireGuard or Tailscale.
:::

## Verifying the certificate from clients

Clients usually skip verification of the self-signed certificate (`curl -k`,
`verify=False`). The connection is still encrypted, but the client can't tell it's
talking to *your* Jetson. To check that too, copy `/etc/jdboard/tls/jdboard.crt` to the
client and trust it explicitly:

```bash
curl --cacert jdboard.crt https://<jetson-ip>/api/models/list -H "Authorization: Bearer jdb_..."
```

```python
requests.get(url, headers=headers, verify="jdboard.crt")
```

The certificate is made for the Jetson's IP and hostname at install time. After those
change, run `sudo ./scripts/install.sh --renew-cert`.

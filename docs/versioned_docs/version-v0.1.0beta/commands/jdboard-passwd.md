---
sidebar_position: 2
---

# jdboard-passwd

Sets JDBoard's two passwords.

## Dashboard login

The username and password you log in to the dashboard with. Stored in
`/etc/jdboard/htpasswd` and checked by nginx.

```bash
sudo jdboard-passwd           # asks for a username and password
sudo jdboard-passwd admin     # change the password of the user "admin"
```

## Admin password

An optional second password, asked for before actions that can disrupt the device:

- rebooting and shutting down
- clearing the memory cache
- installing, starting or restarting the jtop service
- turning start-on-boot on or off
- creating API keys and viewing them again

```bash
sudo jdboard-passwd --admin            # set or change it
sudo jdboard-passwd --admin --remove   # remove it; those actions stop asking
```

It's stored hashed in `/etc/jdboard/admin-password` and checked by the backend. It's
separate from your Linux password and from the dashboard login. The dashboard
remembers it for 15 minutes, and locks a client out for 5 minutes after 5 wrong tries.

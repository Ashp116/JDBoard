---
sidebar_position: 11
---

# Troubleshooting

Start with JDBoard's log; most problems explain themselves there:

```bash
journalctl -u jdboard -n 100 --no-pager
```

## The dashboard doesn't load

- **Is JDBoard running?** `systemctl status jdboard`. If start-on-boot is turned off,
  it doesn't start after a reboot, and nginx doesn't serve the site either:
  `sudo systemctl start jdboard`.
- **Right address?** Use `https://`, and the IP from `hostname -I`. With
  `--https-port`, add the port: `https://<ip>:8443/`.
- **Certificate warning** on first visit: expected with the self-signed certificate.
  Accept it once.

## Locked out after wrong passwords

fail2ban blocks an IP for 15 minutes after 5 wrong logins. Wait, or unblock it on the
Jetson:

```bash
sudo fail2ban-client set nginx-http-auth unbanip <your-ip>
```

Forgot the login? Set a new one with `sudo jdboard-passwd`.

## No system data

The charts stay at zero or the dashboard says jtop is unavailable.

```bash
systemctl status jtop.service
sudo systemctl restart jtop.service
```

Settings has buttons to restart or reinstall the jtop service. If jtop itself is
missing, [install it](getting-started/prerequisites.md#install-jtop).

## A model won't load

- **"PyTorch not installed"**: run `jdboard-pytorch status`, then
  `sudo jdboard-pytorch install` (see [jdboard-pytorch](commands/jdboard-pytorch.md)).
- **"plan files are only supported on the target runtime platform"**: the `.engine`
  was built on a different device or TensorRT version. Upload the `.pt` or `.onnx` and
  convert it on the Jetson.
- **Out of GPU memory**: unload other models. On a CUDA out-of-memory error during
  inference, JDBoard unloads all models to recover; load the one you need again.

## Results look worse than expected

- **Image size**: a TensorRT engine's input size is fixed when it's built. Models
  trained at another size than the one used to build (OBB models at 1024,
  classification at 224) do worse. Rebuild with the right size under **Advanced**.
- **The wrong kind of image**: OBB models are trained on aerial photos (planes,
  ships, storage tanks…), so they do poorly on everyday photos.
- **INT8**: some accuracy loss is expected; calibrate with images like the real ones,
  or use FP16.

## A conversion stopped

Updating or restarting JDBoard stops a running conversion (the log shows
`exit code -15`). Start it again, and wait for conversions to finish before updating.

## The dashboard didn't change after updating

The installer rebuilds the dashboard when its source changes, which needs Node.js 20+.
Without Node it downloads the prebuilt one from the latest release, which may be
older than your checkout. Install Node.js, then:

```bash
sudo ./scripts/install.sh --rebuild-frontend
```

Then reload the page (Ctrl+Shift+R). Settings → System Information shows the running
commit.

## Still stuck?

[Open an issue](https://github.com/Ashp116/JDBoard/issues) with the output of
`journalctl -u jdboard -n 200 --no-pager` and your JetPack version.

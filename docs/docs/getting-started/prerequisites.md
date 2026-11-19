---
sidebar_position: 1
---

# Prerequisites

## What you need

| | Requirement | Notes |
|---|---|---|
| **Device** | An NVIDIA Jetson with **JetPack 6 or 7** | Tested on a Jetson Orin Nano 8GB with JetPack 7.2 (L4T R39.2, CUDA 13.2, TensorRT 10.16). |
| **jtop** | [jetson-stats](https://github.com/rbonghi/jetson_stats) | Required: all system data and hardware controls come from it. [Install it below](#install-jtop). |
| **git** | To download JDBoard | Included with JetPack. |
| **Internet** | During installation | For nginx and fail2ban packages, Python packages, and PyTorch if you choose it. |
| **Disk space** | About 1 GB, or about 4 GB with PyTorch | Plus the models you add. |
| **Node.js 20+** | Optional | Only to build the dashboard yourself. Without it, the installer downloads a prebuilt dashboard from GitHub. |

The installer installs everything else for you: nginx, fail2ban, a Python environment
with JDBoard's packages, and (with `--with-pytorch`) PyTorch for your JetPack.

## Install jtop

jtop comes from the `jetson-stats` package and runs as a system service, `jtop.service`.

```bash
sudo pip3 install -U jetson-stats
```

On Ubuntu 24.04 (JetPack 7), pip refuses to install system-wide packages unless told
to:

```bash
sudo pip3 install -U --break-system-packages jetson-stats
```

Then reboot, or log out and back in, and check it works:

```bash
jtop                                  # the jtop terminal UI; q to quit
systemctl status jtop.service         # should be active (running)
```

:::tip
The JDBoard installer checks for jtop and stops with this command if it's missing. If
jtop is installed but its service isn't running, the installer starts it.
:::

## Optional: Node.js

You only need Node.js if you want the installer to build the dashboard from source
(for example, after changing the frontend). The simplest way is
[nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# open a new terminal, then:
nvm install 22
```

The installer finds Node through nvm automatically, even when run with `sudo`.

## Optional: PyTorch

To run models you need PyTorch and Ultralytics. The installer adds them when you pass
`--with-pytorch`, choosing the right build for your JetPack:

- **JetPack 7 (CUDA 13):** PyTorch's own CUDA builds, pinned to tested versions.
- **JetPack 6 (CUDA 12.6):** NVIDIA's Jetson builds from `pypi.jetson-ai-lab.io`.

You can also add, change or remove PyTorch later with
[`jdboard-pytorch`](../commands/jdboard-pytorch.md). Without PyTorch, monitoring and
everything else work; only loading models doesn't.

TensorRT comes with JetPack, so TensorRT engines and conversions work as long as
PyTorch and Ultralytics are installed too.

Next: [Installation](installation.md).

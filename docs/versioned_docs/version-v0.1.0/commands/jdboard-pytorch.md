---
sidebar_position: 4
---

# jdboard-pytorch

Manages PyTorch in JDBoard's Python environment. Models need PyTorch to load;
everything else works without it.

```bash
jdboard-pytorch status                              # versions, whether CUDA works
sudo jdboard-pytorch install                        # the recommended build for this JetPack
sudo jdboard-pytorch install 2.14.0                 # a specific torch version
sudo jdboard-pytorch install --index-url <URL>      # from your own package index
sudo jdboard-pytorch install --wheel torch-....whl  # from wheel files
sudo jdboard-pytorch uninstall                      # remove torch and torchvision
```

## Options

| Option | What it does |
|---|---|
| `--torchvision VERSION` | Install this torchvision version instead of the matching one. |
| `--wheel FILE` | Install from a wheel file. Repeat it for torchvision. |
| `--index-url URL` | Install from this package index. |
| `--no-restart` | Don't restart JDBoard afterwards. |
| `--dry-run` | Show what would run without changing anything. |
| `--yes` | Don't ask for confirmation. |

## Which build it installs

| JetPack | CUDA | Recommended build |
|---|---|---|
| 7 | 13 | PyTorch's own CUDA builds from `download.pytorch.org`, pinned to versions tested with JDBoard (currently torch 2.15.0 and torchvision 0.29.2 for CUDA 13.2) |
| 6 | 12.6 | NVIDIA's Jetson builds from `pypi.jetson-ai-lab.io` |

After installing, it checks that PyTorch can use the GPU and restarts JDBoard. numpy
and JetPack's OpenCV are left untouched, and the new versions become the ones
[`jdboard-pip`](jdboard-pip.md) protects.

The installer's `--with-pytorch` uses the same recommended build, and re-running the
installer never replaces a PyTorch you installed this way. Settings → System
Information shows the installed version.

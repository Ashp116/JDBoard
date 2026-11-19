---
sidebar_position: 3
---

# jdboard-pip

Installs Python packages into JDBoard's environment (`/opt/jdboard/venv`), for
example a library a [custom inference script](../custom-models/custom-scripts.md)
needs.

```bash
sudo jdboard-pip install shapely
sudo systemctl restart jdboard      # so JDBoard picks it up
```

It accepts the same arguments as `pip`. Unlike plain `pip`, it protects the packages
JDBoard depends on:

- **numpy, PyTorch and torchvision** stay at the versions JDBoard was installed with
  (`/opt/jdboard/constraints.txt`). JetPack's OpenCV needs numpy 1.x, and a package
  that pulls in numpy 2 would break it.
- Packages that would **shadow JetPack's CUDA-enabled OpenCV** (such as
  `opencv-python`) or **replace PyTorch** are refused.

To change PyTorch itself, use [`jdboard-pytorch`](jdboard-pytorch.md).

---
sidebar_position: 5
---

# Development setup

To work on JDBoard itself, run it straight from your checkout instead of installing
the service.

```bash
./backend.sh    # Flask API on :5000
./frontend.sh   # Vite dev server on :3000 (forwards /api to :5000)
```

Open `http://<jetson-ip>:3000`. The dev server reloads the page as you edit the
frontend.

- **`backend.sh`** creates `.venv` on first run with `--system-site-packages`, so
  jtop and JetPack's CUDA-enabled OpenCV are visible inside it, and installs the
  requirements if anything is missing. jtop must be installed system-wide and its
  service running.
- **`frontend.sh`** needs Node.js 20+.

Without the dev server, `./backend.sh` also serves a built dashboard on
`http://<jetson-ip>:5000`:

```bash
cd frontend && npm run build
```

Set `JDBOARD_PORT` to use a different port.

## Differences from the installed service

- No nginx, so no HTTPS, login or API keys: don't expose a development backend to a
  network you don't trust.
- Models, logs and settings live in the checkout (`models/`, `logs/`) instead of
  `/var/lib/jdboard`. `JDBOARD_DATA_DIR` changes that.
- Admin actions (reboot, clear cache, …) ask for **your sudo password** instead of
  using the service's helper.

## Building these docs

The docs are a [Docusaurus](https://docusaurus.io/) site in `docs/`:

```bash
cd docs
npm install
npm start          # live preview on http://localhost:3000/JDBoard/
npm run build      # static site in docs/build
```

Changes to `docs/` merged into `main` are published to
[ashp116.github.io/JDBoard](https://ashp116.github.io/JDBoard/) by the **Docs**
GitHub Actions workflow.

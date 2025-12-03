# Unified Backend Migration Plan

Goal: consolidate `web_interface.py`, `axeshed.py`, and `axepool.py` into a single backend that serves the React/Tailwind UI on one port, is portable on Windows/Linux, and keeps current API shapes intact so the frontend can continue independently.

## Approach
- Keep Flask and merge via blueprints for minimal churn and compatibility with existing handlers.
- Extract shared state (paths, JSON helpers, locks/DB, licensing/auth) into a common module.
- Run background work (benchmark engine, schedulers) in threads; keep `aiohttp` for device calls.
- Serve built UI (`dist/public`) from the same app; preserve `/api/**` routes.
- Add a single CLI entrypoint (`axebench-serve`) for running the unified server.

## Proposed Layout
- `python/app.py` – create Flask app, register blueprints, serve static UI.
- `python/app_state.py` – config dirs, JSON helpers or SQLite, locks, shared aiohttp session factory, licensing/auth wiring.
- `python/blueprints/benchmark.py` – routes from `web_interface.py` (benchmark/sessions/devices).
- `python/blueprints/profiles.py` – routes from `axeshed.py` (profiles/schedules).
- `python/blueprints/pools.py` – routes from `axepool.py` (pools/pool schedules).
- `python/cli.py` – `axebench-serve` entrypoint with host/port/static flags.
- `python/pyproject.toml` – packaging + console_script; include built UI assets as package data.
- `python/packaging/` – PyInstaller spec, winsw/service templates (later).

## Data/Persistence
- Short term: keep JSON files in `~/.bitaxe-benchmark`; add file locks to avoid races.
- Optional hardening: move pools/profiles/sessions to SQLite (single file, no daemon).

## API Compatibility
- Keep existing `/api` paths/fields so the frontend can continue unchanged.
- Add missing fields per `BACKEND_REQUIREMENTS.md` (vrTemp/errors, duration/tests/tune_type, bestDiff, logs, profile save).

## Frontend Coordination
- Frontend continues on current branch.
- When unified backend is ready: update Vite proxy and `VITE_API_BASE_URL` to the new single port.
- No route changes anticipated; only base URL/proxy flip.

## Packaging/Run Targets
- `pip install .` / `pipx install .` to get `axebench-serve`.
- PyInstaller bundles for Win/Linux with UI assets embedded.
- Later: optional systemd/winsw service templates.

## Work Phases
1) Skeleton: app factory, blueprints, shared state module, serve static UI stub.
2) Move routes: port handlers from each service into blueprints; keep logic intact.
3) State/persistence: lock JSON writes; optionally add SQLite layer.
4) API completeness: satisfy `BACKEND_REQUIREMENTS.md` fields; validate responses.
5) CLI/packaging: add entrypoint, pyproject, PyInstaller spec.
6) Frontend flip: adjust proxy/base URL; smoke test end-to-end on single port.

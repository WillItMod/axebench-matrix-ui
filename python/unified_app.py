"""
Unified Flask entrypoint that mounts AxeBench (web_interface),
AxeShed (profile scheduler), and AxePool (pool scheduler) on one server
and serves the prebuilt React frontend statically.

Routes:
- AxeBench (benchmark/device API): root (/api/..., existing routes)
- AxeShed: mounted at /shed (e.g., /shed/api/devices/<name>/schedule)
- AxePool: mounted at /pool (e.g., /pool/api/devices/<name>/schedule)
- Frontend: built assets from dist/public with index fallback
"""
import os
import sys
from pathlib import Path
from flask import send_from_directory, Blueprint
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from web_interface import app as bench_app
from axeshed import app as shed_app
from axepool import app as pool_app


class _ApiPrefixMiddleware:
  """Ensure pool_app always sees /api/... even when mounted at /pool/api."""

  def __init__(self, app, prefix="/api"):
    self.app = app
    self.prefix = prefix if prefix.startswith("/") else f"/{prefix}"

  def __call__(self, environ, start_response):
    path = environ.get("PATH_INFO", "") or "/"
    if not path.startswith(self.prefix):
      environ = environ.copy()
      # Avoid double slashes when concatenating.
      environ["PATH_INFO"] = f"{self.prefix}{path if path.startswith('/') else '/' + path}"
    return self.app(environ, start_response)


def create_unified_app():
  """Attach shed/pool apps and static frontend under one server."""
  pool_api_app = _ApiPrefixMiddleware(pool_app)

  bench_app.wsgi_app = DispatcherMiddleware(
    bench_app.wsgi_app,
    {
      "/shed": shed_app,
      # Mount pool API under /pool/api so /pool can be handled by the SPA.
      "/pool/api": pool_api_app,
    },
  )

  # Resolve the built frontend directory (handles Nuitka onefile extraction paths).
  project_root = Path(__file__).resolve().parent.parent

  def _find_static_dir():
    candidates = []

    # Onefile extraction root (where data files land)
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
      candidates.append(Path(meipass) / "dist" / "public")

    # Directory alongside the executable
    exe_dir = Path(sys.executable).resolve().parent
    candidates.append(exe_dir / "dist" / "public")

    # Source tree locations (when running from source)
    candidates.append(project_root / "dist" / "public")
    candidates.append(project_root / "client" / "public")

    for cand in candidates:
      if (cand / "index.html").exists():
        return cand

    # Fallback to last candidate even if missing (Flask will 404 explicitly)
    return candidates[-1]

  static_dir = _find_static_dir()

  # Serve React UI at root and catch-all (except API paths)
  @bench_app.route("/", defaults={"path": ""})
  @bench_app.route("/<path:path>")
  def serve_frontend(path):
    target = static_dir / path
    if target.is_file():
      return send_from_directory(static_dir, path)
    return send_from_directory(static_dir, "index.html")

  return bench_app


if __name__ == "__main__":
  app = create_unified_app()
  port = int(os.environ.get("AXE_PORT", "5000"))
  app.run(host="0.0.0.0", port=port, debug=False, threaded=True)

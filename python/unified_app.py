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
from pathlib import Path
from flask import send_from_directory, Blueprint
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from web_interface import app as bench_app
from axeshed import app as shed_app
from axepool import app as pool_app


def create_unified_app():
  """Attach shed/pool apps and static frontend under one server."""
  bench_app.wsgi_app = DispatcherMiddleware(
    bench_app.wsgi_app,
    {
      "/shed": shed_app,
      # Mount pool API under /pool/api so /pool can be handled by the SPA.
      "/pool/api": pool_app,
    },
  )

  # Serve built frontend if present
  project_root = Path(__file__).resolve().parent.parent
  dist_dir = project_root / "dist" / "public"
  static_dir = dist_dir if dist_dir.exists() else project_root / "client" / "public"

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

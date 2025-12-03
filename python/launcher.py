#!/usr/bin/env python3
"""
Unified AxeBench Launcher
Starts the single unified Flask app (bench + shed + pool) and serves the built frontend.

Env:
  AXE_PORT (default 5000) - port to bind (set 80 if you want HTTP on port 80)
"""

import json
import os
import signal
import sys
import time
import webbrowser
from multiprocessing import Process
from pathlib import Path

# Clear stale benchmark state if no engine is running
state_file = Path.home() / ".bitaxe-benchmark" / "benchmark_state.json"
if state_file.exists():
    with open(state_file, "r") as f:
        state = json.load(f)
    if state.get("running") is True:
        state["running"] = False
        state["config"] = None
        with open(state_file, "w") as f:
            json.dump(state, f, indent=2)


def print_banner(port: int):
    print(
        f"""
==============================================================
            AxeBench Unified Launcher
==============================================================

  Starting unified app on: http://localhost:{port}
  Components:
    - AxeBench (benchmark/device)
    - AxeShed  (profile scheduler) mounted at /shed
    - AxePool  (pool scheduler)    mounted at /pool

  Press Ctrl+C to stop.
==============================================================
"""
    )


def start_unified(port: int):
    """Start unified Flask app (bench + shed + pool)."""
    from unified_app import create_unified_app

    app = create_unified_app()
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)


def main():
    port = int(os.environ.get("AXE_PORT", "5000"))
    print_banner(port)

    proc = Process(target=start_unified, args=(port,), name="AxeBench-Unified")
    proc.start()

    # Open browser to unified app
    try:
        time.sleep(1)
        webbrowser.open(f"http://localhost:{port}")
    except Exception:
        pass

    def handle_signal(sig, frame):
        if proc.is_alive():
            proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    proc.join()


if __name__ == "__main__":
    main()

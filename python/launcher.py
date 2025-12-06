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
import urllib.request
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
    # Bind on IPv6 unspecified to support dual-stack (IPv6 + IPv4)
    app.run(host="::", port=port, debug=False, threaded=True)


def wait_for_server(url: str, timeout: int = 15) -> bool:
    """Poll until the HTTP server responds or timeout expires."""
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=2):
                return True
        except Exception:
            time.sleep(0.25)
    return False


def launch_webview(url: str, proc: Process) -> bool:
    """Start a native window pointing at the running server."""
    try:
        import webview
    except Exception:
        return False

    window = webview.create_window("AxeBench", url, width=1200, height=800)

    def on_closed():
        if proc.is_alive():
            proc.terminate()

    window.events.closed += on_closed

    # Blocks until the window is closed
    webview.start(debug=False)
    return True


def main():
    port = int(os.environ.get("AXE_PORT", "5000"))
    print_banner(port)

    proc = Process(target=start_unified, args=(port,), name="AxeBench-Unified")
    proc.start()

    url = f"http://localhost:{port}"

    wait_for_server(url)
    opened = launch_webview(url, proc)
    if not opened:
        # Fallback: open default browser if native window could not be created
        try:
            import webbrowser

            webbrowser.open(url)
        except Exception:
            pass

    def handle_signal(sig, frame):
        if proc.is_alive():
            proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        if opened:
            # launch_webview blocks until window closed
            if proc.is_alive():
                proc.terminate()
        else:
            proc.join()
    finally:
        if proc.is_alive():
            proc.terminate()


if __name__ == "__main__":
    main()

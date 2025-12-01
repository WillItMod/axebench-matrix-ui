#!/usr/bin/env python3
import json
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

"""
AxeBench Suite Launcher
Starts all three web applications (AxeBench, AxeShed, AxePool) simultaneously
"""

import sys
import time
import signal
import logging
import webbrowser
from pathlib import Path
from threading import Thread
from multiprocessing import Process

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# Store process references for cleanup
processes = []

def print_banner():
    """Print startup banner"""
    print("""
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║       ⚡ AxeBench Suite Launcher ⚡                       ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   Starting all services...                                ║
║                                                           ║
║   ⚡ AxeBench:  http://localhost:5000  (Benchmark/Tune)   ║
║   🏠 AxeShed:   http://localhost:5001  (Profile Sched)    ║
║   🎱 AxePool:   http://localhost:5002  (Pool Manager)     ║
║                                                           ║
║   Press Ctrl+C to stop all services                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    """)

def start_axebench():
    """Start AxeBench web server"""
    try:
        logger.info("Starting AxeBench on port 5000...")
        from web_interface import run_web_server
        run_web_server(host='0.0.0.0', port=5000)
    except Exception as e:
        logger.error(f"AxeBench failed to start: {e}")
        sys.exit(1)

def start_axeshed():
    """Start AxeShed web server"""
    try:
        logger.info("Starting AxeShed on port 5001...")
        from axeshed import run_axeshed
        run_axeshed(host='0.0.0.0', port=5001)
    except Exception as e:
        logger.error(f"AxeShed failed to start: {e}")
        sys.exit(1)

def start_axepool():
    """Start AxePool web server"""
    try:
        logger.info("Starting AxePool on port 5002...")
        from axepool import run_axepool
        run_axepool(host='0.0.0.0', port=5002)
    except Exception as e:
        logger.error(f"AxePool failed to start: {e}")
        sys.exit(1)

def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully"""
    logger.info("\nShutting down all services...")
    for process in processes:
        if process.is_alive():
            process.terminate()
    
    # Wait for processes to terminate
    for process in processes:
        process.join(timeout=5)
        if process.is_alive():
            process.kill()
    
    logger.info("All services stopped.")
    sys.exit(0)

def main():
    """Main launcher function"""
    print_banner()
    
    # Set up signal handler for Ctrl+C
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Change to script directory
    script_dir = Path(__file__).parent
    sys.path.insert(0, str(script_dir))
    
    # Create processes for each app
    logger.info("Initializing services...")
    
    axebench_process = Process(target=start_axebench, name='AxeBench')
    axeshed_process = Process(target=start_axeshed, name='AxeShed')
    axepool_process = Process(target=start_axepool, name='AxePool')
    
    processes = [axebench_process, axeshed_process, axepool_process]
    
    # Start all processes
    for process in processes:
        process.start()
        time.sleep(1)  # Small delay between starts to avoid port conflicts
    
    logger.info("All services started!")
    logger.info("")
    
    # Wait a moment for services to fully initialize
    time.sleep(2)
    
    # Open browser to AxeBench (port 5000)
    logger.info("Opening AxeBench in browser...")
    try:
        webbrowser.open('http://localhost:5000')
    except Exception as e:
        logger.warning(f"Could not open browser automatically: {e}")
        logger.info("Please open http://localhost:5000 in your browser manually")
    
    logger.info("")
    
    # Wait for all processes
    try:
        for process in processes:
            process.join()
    except KeyboardInterrupt:
        signal_handler(None, None)

if __name__ == '__main__':
    main()

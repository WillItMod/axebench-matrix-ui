#!/bin/bash
#
# AxeBench + AxeShed + AxePool Launcher
# Starts all web interfaces simultaneously
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║       ⚡ AxeBench Suite Launcher ⚡                       ║"
echo "║                                                           ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║                                                           ║"
echo "║   Starting all services...                                ║"
echo "║                                                           ║"
echo "║   ⚡ AxeBench:  http://localhost:5000  (Benchmark/Tune)   ║"
echo "║   🏠 AxeShed:   http://localhost:5001  (Profile Sched)    ║"
echo "║   🎱 AxePool:   http://localhost:5002  (Pool Manager)     ║"
echo "║                                                           ║"
echo "║   Press Ctrl+C to stop all services                       ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $AXEBENCH_PID 2>/dev/null
    kill $AXESHED_PID 2>/dev/null
    kill $AXEPOOL_PID 2>/dev/null
    wait $AXEBENCH_PID 2>/dev/null
    wait $AXESHED_PID 2>/dev/null
    wait $AXEPOOL_PID 2>/dev/null
    echo "Done."
    exit 0
}

# Set trap for Ctrl+C
trap cleanup SIGINT SIGTERM

# Start AxeBench in background
echo "[$(date '+%H:%M:%S')] Starting AxeBench on port 5000..."
python3 web_interface.py &
AXEBENCH_PID=$!

# Small delay to avoid port conflicts
sleep 1

# Start AxeShed in background
echo "[$(date '+%H:%M:%S')] Starting AxeShed on port 5001..."
python3 axeshed.py &
AXESHED_PID=$!

sleep 1

# Start AxePool in background
echo "[$(date '+%H:%M:%S')] Starting AxePool on port 5002..."
python3 axepool.py &
AXEPOOL_PID=$!

echo ""
echo "[$(date '+%H:%M:%S')] All services started!"
echo ""

# Wait for all processes
wait $AXEBENCH_PID $AXESHED_PID $AXEPOOL_PID

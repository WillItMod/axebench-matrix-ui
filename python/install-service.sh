#!/bin/bash
# Install AxeBench Suite as a systemd service
# Runs all three apps: AxeBench, AxeShed, AxePool

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         AxeBench Suite - Service Installer                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Get current user and directory
CURRENT_USER=$(whoami)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing for user: $CURRENT_USER"
echo "Directory: $SCRIPT_DIR"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  Don't run as root. Run as your normal user (uses sudo internally)."
    exit 1
fi

# Create service file with correct paths
echo "Creating systemd service file..."
sudo tee /etc/systemd/system/axebench.service > /dev/null <<EOF
[Unit]
Description=AxeBench Suite - Bitaxe Benchmark, Fleet Manager & Pool Switching
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=/bin/bash $SCRIPT_DIR/launch.sh
Restart=on-failure
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=axebench

# Environment
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
echo "Reloading systemd..."
sudo systemctl daemon-reload

# Enable service to start on boot
echo "Enabling service..."
sudo systemctl enable axebench.service

# Start service
echo "Starting service..."
sudo systemctl start axebench.service

# Get IP
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$IP" ]; then
    IP="localhost"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              ✓ Service Installed Successfully!            ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║                                                           ║"
echo "║   ⚡ AxeBench:  http://$IP:5000                      ║"
echo "║   🏠 AxeShed:   http://$IP:5001                      ║"
echo "║   🎱 AxePool:   http://$IP:5002                      ║"
echo "║                                                           ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║   Commands:                                               ║"
echo "║     Start:   sudo systemctl start axebench               ║"
echo "║     Stop:    sudo systemctl stop axebench                ║"
echo "║     Restart: sudo systemctl restart axebench             ║"
echo "║     Status:  sudo systemctl status axebench              ║"
echo "║     Logs:    sudo journalctl -u axebench -f              ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

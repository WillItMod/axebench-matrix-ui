# Installing AxeBench as a Linux System Service

This guide will help you set up AxeBench to run automatically as a system service on Linux.

## Prerequisites

- Linux system with systemd (Ubuntu 18.04+, Debian 10+, Fedora 29+, etc.)
- AxeBench cloned to your system
- Python 3.11+ installed
- Sudo access

## Installation Steps

### 1. Navigate to AxeBench Directory

```bash
cd /path/to/AxeBench
```

Replace `/path/to/AxeBench` with your actual AxeBench directory path.

### 2. Make the Launch Script Executable

```bash
chmod +x launch.sh
```

### 3. Edit the Service Configuration

Open the service file with a text editor:

```bash
nano axebench.service
```

Replace the following placeholders with your actual values:

- **`YOUR_USERNAME`** → Your Linux username (e.g., `ubuntu`, `pi`, `axe`)
- **`/path/to/axebench`** → Full path to your AxeBench directory (e.g., `/home/ubuntu/AxeBench`)

**Example:**
```ini
[Unit]
Description=AxeBench Suite - Bitaxe Benchmark, Fleet Manager & Pool Switching
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/AxeBench
ExecStart=/bin/bash /home/ubuntu/AxeBench/launch.sh
Restart=on-failure
RestartSec=10

Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

Save and exit (Ctrl+X, then Y, then Enter in nano).

### 4. Install the Service

Copy the service file to the system directory:

```bash
sudo cp axebench.service /etc/systemd/system/axebench.service
```

### 5. Enable and Start the Service

Reload systemd configuration:

```bash
sudo systemctl daemon-reload
```

Enable the service to start on boot:

```bash
sudo systemctl enable axebench
```

Start the service now:

```bash
sudo systemctl start axebench
```

## Verification

Check that the service is running:

```bash
sudo systemctl status axebench
```

You should see:
- **Active: active (running)**
- All three services started (AxeBench, AxeShed, AxePool)

Test the web interfaces:

```bash
curl http://localhost:5000  # AxeBench
curl http://localhost:5001  # AxeShed
curl http://localhost:5002  # AxePool
```

Or open in your browser:
- AxeBench: `http://localhost:5000`
- AxeShed: `http://localhost:5001`
- AxePool: `http://localhost:5002`

## Common Commands

### Check Service Status
```bash
sudo systemctl status axebench
```

### View Recent Logs
```bash
sudo journalctl -u axebench --lines=50
```

### View Live Logs (Follow Mode)
```bash
sudo journalctl -u axebench -f
```

### Stop the Service
```bash
sudo systemctl stop axebench
```

### Restart the Service
```bash
sudo systemctl restart axebench
```

### Disable Auto-Start on Boot
```bash
sudo systemctl disable axebench
```

### Uninstall the Service
```bash
sudo systemctl stop axebench
sudo systemctl disable axebench
sudo rm /etc/systemd/system/axebench.service
sudo systemctl daemon-reload
```

## Troubleshooting

### Service Won't Start
1. Check the logs: `sudo journalctl -u axebench -n 50`
2. Verify the paths in `axebench.service` are correct
3. Ensure `launch.sh` is executable: `chmod +x launch.sh`
4. Check that Python 3.11+ is installed: `python3 --version`

### Port Already in Use
If you see "Address already in use" errors:
- Check if AxeBench is already running: `ps aux | grep python`
- Kill any existing processes: `pkill -f "python3 web_interface.py"`
- Try restarting: `sudo systemctl restart axebench`

### Permission Denied
- Ensure you're using `sudo` for systemctl commands
- Verify the user in `axebench.service` matches your username
- Check directory permissions: `ls -la /path/to/AxeBench`

### Services Not Starting
- Check if all Python dependencies are installed
- Run the launch script manually to see errors: `bash launch.sh`
- Check system resources (disk space, RAM)

## Auto-Start on Boot

Once enabled with `sudo systemctl enable axebench`, AxeBench will automatically start whenever your system boots up.

To verify it's enabled:
```bash
sudo systemctl is-enabled axebench
```

Should output: `enabled`

## Getting Help

If you encounter issues:
1. Check the logs: `sudo journalctl -u axebench -n 100`
2. Verify all paths and usernames in the service file
3. Test running `launch.sh` manually: `bash launch.sh`
4. Check that your user has permission to access the AxeBench directory

---

**That's it!** AxeBench is now running as a system service and will start automatically on boot.

# AxeBench Suite

**The complete Bitaxe management toolkit** - Benchmark, tune, schedule, and manage pools across your entire fleet.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8%2B-blue.svg)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20WSL-lightgrey.svg)

## 🎯 What's Included

| App | Port | Purpose |
|-----|------|---------|
| **AxeBench** | 5000 | Benchmark & tune individual devices, generate performance profiles |
| **AxeShed** | 5001 | Fleet management - schedule profiles across devices (Quiet by day, Max by night) |
| **AxePool** | 5002 | Pool management - switch pools, schedule solo/pool mining, manage pool library |

## ✨ Features

### AxeBench
- 🔍 Auto-detect Bitaxe model (Gamma, Supra, Ultra, Hex, Max)
- 📊 Systematic voltage/frequency benchmarking with live stats
- 🌡️ Real-time temperature and power monitoring
- ⚡ Generate optimized profiles: Quiet, Efficient, Max, Nuclear
- 🔒 Safety limits with PSU warnings for stock power supplies
- 💨 Fan control with temperature targeting

### AxeShed
- 📅 Time-based profile scheduling (e.g., Quiet 06:00-22:00, Max 22:00-06:00)
- 🏠 Fleet-wide profile management
- 🔄 Automatic profile switching with fan control
- 📈 Device status monitoring

### AxePool
- 🎱 Pool library - save and reuse pool configurations
- 🔄 One-click pool switching across devices
- 📥 Import pools from devices into library
- ⏰ Pool scheduling (solo mine at night, pool by day)
- 🔀 Swap main/fallback pools instantly

## 📋 Prerequisites

- Python 3.8 or higher
- pip (Python package manager)
- Network access to your Bitaxe devices
- Bitaxe running compatible firmware (ESP-Miner)

## 🚀 Installation

### Linux (Ubuntu/Debian)

```bash
# Install Python if not present
sudo apt update
sudo apt install -y python3 python3-pip python3-venv git

# Clone the repository
git clone https://github.com/YOUR_USERNAME/axebench.git
cd axebench

# Install Python dependencies
pip3 install -r requirements.txt

# Make shell scripts executable
chmod +x launch.sh setup.sh install-service.sh

# Run the suite
./launch.sh
```

### WSL (Windows Subsystem for Linux)

```bash
# Ensure WSL is installed (from PowerShell as admin):
# wsl --install

# Open WSL terminal, then:
sudo apt update
sudo apt install -y python3 python3-pip git

# Clone the repository
git clone https://github.com/YOUR_USERNAME/axebench.git
cd axebench

# Install dependencies
pip3 install -r requirements.txt

# Make scripts executable
chmod +x launch.sh setup.sh install-service.sh

# Run
./launch.sh
```

**WSL Note:** Access the web interface from Windows browser at `http://localhost:5000` (ports forward automatically in WSL2).

### Quick Start (Single Command)

```bash
git clone https://github.com/YOUR_USERNAME/axebench.git && cd axebench && pip3 install -r requirements.txt && chmod +x *.sh && ./launch.sh
```

## 📦 Dependencies

The following Python packages are required (installed via `pip3 install -r requirements.txt`):

| Package | Purpose |
|---------|---------|
| flask | Web framework for UI |
| aiohttp | Async HTTP for device communication |
| requests | HTTP requests |
| numpy | Statistical calculations |

## 📖 Usage

### Running All Apps

```bash
./launch.sh
```

This starts all three services:
- AxeBench: http://localhost:5000
- AxeShed: http://localhost:5001
- AxePool: http://localhost:5002

Press `Ctrl+C` to stop all services.

### Running Individual Apps

```bash
# AxeBench only
python3 web_interface.py

# AxeShed only
python3 axeshed.py

# AxePool only
python3 axepool.py
```

### Installing as System Service (Linux)

For running AxeBench Suite on boot (e.g., on a Raspberry Pi or server):

```bash
# Edit the service file to set correct paths
nano axebench.service

# Install systemd service
sudo cp axebench.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable axebench
sudo systemctl start axebench

# Check status
sudo systemctl status axebench

# View logs
sudo journalctl -u axebench -f

# Stop service
sudo systemctl stop axebench
```

**Important:** Edit `axebench.service` to update:
- `WorkingDirectory=` to your axebench folder path
- `User=` to your username

## 🔧 Configuration

All configuration is stored in `~/.bitaxe-benchmark/`:

```
~/.bitaxe-benchmark/
├── devices.json          # Registered devices
├── profiles/             # Generated performance profiles
│   └── {device-name}.json
├── schedules/            # AxeShed profile schedules
│   └── {device-name}.json
├── pools/                # Pool library
│   └── pools.json
├── pool_schedules/       # AxePool schedules
│   └── {device-name}.json
└── sessions/             # Benchmark session data
```

## 📊 Supported Bitaxe Models

| Model | Chip | Stock PSU | Safe Power | Max Power (Upgraded PSU) |
|-------|------|-----------|------------|--------------------------|
| Gamma | BM1370 | 25W | 20W | 45W |
| Supra | BM1368 | 25W | 18W | 35W |
| Ultra | BM1366 | 25W | 18W | 30W |
| Hex | BM1366×6 | 120W | 100W | 120W |
| Max | BM1397 | 25W | 15W | 25W |

## ⚠️ Safety Features

- **PSU Warnings**: Alerts when power limits exceed stock PSU capacity
- **Temperature Limits**: Configurable ASIC and VReg temperature thresholds  
- **Voltage/Frequency Bounds**: Model-specific safe operating ranges
- **Settings Verification**: Confirms settings actually applied to device
- **Minimum Sample Duration**: 120s minimum ensures reliable benchmark data

## 🎮 Workflow Examples

### Tuning a New Device

1. Open AxeBench (http://localhost:5000)
2. Add device by IP address (auto-detects model)
3. Select device and run benchmark with desired parameters
4. Review results and generate profiles
5. Profiles automatically available in AxeShed

### Setting Up Day/Night Profiles

1. Benchmark device and generate profiles in AxeBench
2. Open AxeShed (http://localhost:5001)
3. Click "Edit Schedule" on device
4. Add time blocks:
   - 06:00-22:00 → Quiet (low noise during day)
   - 22:00-06:00 → Max (full power at night)
5. Enable scheduling and start scheduler

### Pool Scheduling (Solo at Night)

1. Open AxePool (http://localhost:5002)
2. Add pools to library (or use presets, or import from device)
3. Click "Edit Schedule" on device
4. Add time blocks:
   - 08:00-00:00 → Braiins Pool (consistent payouts)
   - 00:00-08:00 → Public Pool Solo (lottery tickets!)
5. Enable and start scheduler

## 🛠️ Troubleshooting

### "Connection refused" or timeout errors
- Verify Bitaxe is powered on and connected to network
- Check IP address is correct (try pinging it)
- Ensure no firewall blocking port 80 (Bitaxe API)
- Try accessing Bitaxe web UI directly in browser

### Settings not applying
- Enable "Restart between tests" in benchmark settings
- Some firmware versions require restart to apply voltage/frequency changes
- Check the status log for "Settings mismatch" warnings

### Fan control not working
- Ensure firmware supports autofan API (ESP-Miner 2.0+)
- Check device has controllable fan (some boards have fixed-speed fans)

### WSL networking issues
```bash
# Check if you can reach your Bitaxe from WSL
ping 192.168.1.xxx

# If not, try from Windows - if Windows works but WSL doesn't,
# it's a WSL networking issue. Try WSL2 with mirrored networking.
```

### "Module not found" errors
```bash
# Reinstall dependencies
pip3 install -r requirements.txt --force-reinstall
```

### Permission denied on launch.sh
```bash
chmod +x launch.sh setup.sh install-service.sh
```

## 📝 API Reference

All apps expose REST APIs for automation and integration:

### AxeBench API (port 5000)
```
GET  /api/devices                    - List all devices
POST /api/devices                    - Add device {"ip": "192.168.1.x"}
DELETE /api/devices/{name}           - Remove device
GET  /api/devices/{name}/profile     - Get device model config
GET  /api/sessions                   - List benchmark sessions
GET  /api/sessions/{id}              - Get session details
DELETE /api/sessions/{id}            - Delete session
POST /api/benchmark/start            - Start benchmark
GET  /api/benchmark/status           - Get benchmark status
POST /api/benchmark/stop             - Stop benchmark
GET  /api/profiles/{device}          - Get generated profiles
POST /api/profiles/{device}          - Save profiles
```

### AxeShed API (port 5001)
```
GET  /api/devices                    - List devices with status
POST /api/devices/{name}/apply/{profile} - Apply profile now
GET  /api/devices/{name}/schedule    - Get schedule
POST /api/devices/{name}/schedule    - Save schedule
GET  /api/scheduler/status           - Scheduler running?
POST /api/scheduler/start            - Start scheduler
POST /api/scheduler/stop             - Stop scheduler
```

### AxePool API (port 5002)
```
GET  /api/devices                    - List devices with pool info
GET  /api/pools                      - List saved pools
POST /api/pools                      - Add pool to library
DELETE /api/pools/{id}               - Remove pool
GET  /api/pools/presets              - Get built-in pool presets
POST /api/devices/{name}/pool/apply/{pool_id} - Apply as main pool
POST /api/devices/{name}/pool/apply-fallback/{pool_id} - Apply as fallback
POST /api/devices/{name}/pool/swap   - Swap main/fallback
POST /api/devices/{name}/pool/import - Import device pools to library
GET  /api/devices/{name}/schedule    - Get pool schedule
POST /api/devices/{name}/schedule    - Save pool schedule
GET  /api/scheduler/status           - Scheduler running?
POST /api/scheduler/start            - Start pool scheduler
POST /api/scheduler/stop             - Stop pool scheduler
```

## 🗂️ Project Structure

```
axebench/
├── web_interface.py      # AxeBench main app
├── axeshed.py            # AxeShed scheduler app
├── axepool.py            # AxePool manager app
├── benchmark_engine.py   # Core benchmarking logic
├── config.py             # Model configurations & limits
├── device_manager.py     # Device communication
├── data_analyzer.py      # Results analysis
├── launch.sh             # Start all apps
├── requirements.txt      # Python dependencies
├── axebench.service      # Systemd service file
└── README.md             # This file
```

## ❤️ Support Development

AxeBench is free and open source! If you find it useful, please consider supporting development:

[![Patreon](https://img.shields.io/badge/Patreon-Support-f96854?logo=patreon)](https://www.patreon.com/YOUR_PATREON)

**Patron benefits:**
- 🚀 Priority feature requests
- 🐛 Priority bug fixes
- 💬 Direct support
- ⭐ Ad-free experience (no nag banner)

### For Creators: Setting Up Patreon Integration

If you're forking AxeBench and want to use Patreon licensing:

1. Create a Patreon developer app at https://www.patreon.com/portal/registration/register-clients
2. Set redirect URI to `http://localhost:5000/auth/patreon/callback`
3. Configure credentials:

```bash
# Option 1: Environment variables
export PATREON_CLIENT_ID="your_client_id"
export PATREON_CLIENT_SECRET="your_client_secret"
export PATREON_CAMPAIGN_ID="your_campaign_id"
export PATREON_MIN_PLEDGE="500"  # $5.00 minimum

# Option 2: Source the config file
cp patreon_config.sh my_patreon_config.sh
# Edit my_patreon_config.sh with your credentials
source my_patreon_config.sh
./launch.sh
```

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Bitaxe](https://github.com/skot/bitaxe) open-source mining hardware
- [ESP-Miner](https://github.com/skot/ESP-Miner) firmware
- The solo mining community

---

**Made with ⚡ for the Bitaxe community**

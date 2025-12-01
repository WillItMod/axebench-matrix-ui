# AxeBench Matrix UI v2.0

A stunning Matrix/Gridrunner-themed frontend interface for AxeBench v3.0.0 - the professional Bitaxe fleet management system.

## Features

### 🎨 Matrix Aesthetic
- **Animated Grid Background**: Moving digital grid with perspective
- **Digital Rain Effect**: Falling Japanese characters (Matrix-style)
- **Neon Glow Effects**: Green/cyan glowing text and UI elements
- **Scanline Overlay**: CRT-style scanline animation
- **HUD Panels**: Futuristic corner-bracketed panels
- **Monospace Typography**: Share Tech Mono font for authentic terminal feel

### ⚡ Core Functionality

#### Dashboard
- **Fleet Overview**: Total devices, online count, fleet hashrate, total power
- **Device Grid**: Real-time device cards with status indicators
- **Device Cards**: Show hashrate, temperature, power, fan speed
- **Auto-Refresh**: Updates every 5 seconds
- **Add Device**: Modal with IP auto-detection

#### Benchmark
- **Full Configuration**: All 40+ benchmark parameters
- **Auto Mode**: Intelligent step adjustment (25→5mV, 50→10MHz)
- **Voltage/Frequency Ranges**: Customizable start/stop/step values
- **Test Parameters**: Duration, warmup, cooldown, cycles
- **Optimization Goals**: Max hashrate, efficiency, balanced, quiet mode
- **Safety Limits**: Max chip temp, VR temp, power
- **Auto-Recovery**: Automatic error recovery with 3 strategies
- **Live Monitoring**: Real-time progress and stats during benchmark
- **Advanced Options**: Restart between tests, plots, CSV export

#### Profiles
- **Profile Management**: View, apply, delete profiles
- **Profile Details**: Voltage, frequency, hashrate, efficiency
- **Nano Tune**: Fine-tune existing profiles with ±mV/MHz ranges
- **Save Current**: Save current device settings as profile
- **Best Profile Indicator**: Highlights optimal profile

#### Sessions
- **Session History**: Complete benchmark session archive
- **Session Details**: Full configuration, results, logs
- **Best Results**: Highlighted best profile from each session
- **Visualization**: Links to hashrate, efficiency, temp, power plots
- **Log Viewer**: Terminal-style log display
- **Session Management**: Delete old sessions

## Setup

### Prerequisites
- Node.js 22+ (included in sandbox)
- pnpm (included in sandbox)
- Python 3.8+ for backend services
- AxeBench backend services (AxeBench, AxeShed, AxePool)

### Installation

1. **Start Backend Services**
   
   Use the launcher to start all three backend services:
   ```bash
   python python/launcher.py
   ```
   
   This starts:
   - **AxeBench** (port 5000) - Main benchmarking interface
   - **AxeShed** (port 5001) - Profile scheduling
   - **AxePool** (port 5002) - Pool management

2. **Install Frontend Dependencies**
   ```bash
   cd /home/ubuntu/axebench-matrix-ui
   pnpm install
   ```

3. **Start Frontend Development Server**
   ```bash
   pnpm dev
   ```
   
   The interface will be available at http://localhost:3000
   
   The frontend uses Vite proxy to forward `/api` requests to AxePool (port 5002).

4. **Build for Production**
   ```bash
   pnpm build
   pnpm start
   ```

## Connecting to Backend Services

The Matrix UI connects to the AxeBench backend services via REST API.

### Service Ports
- **AxeBench**: `http://localhost:5000` - Main benchmarking
- **AxeShed**: `http://localhost:5001` - Profile scheduling  
- **AxePool**: `http://localhost:5002` - Pool management (primary API)

### Frontend Configuration
- **Dev Server**: `http://localhost:3000`
- **API Proxy**: `/api` → `http://localhost:5002` (AxePool)
- **API Prefix**: `/api`

### API Endpoints Used

#### Device Management
- `GET /api/devices` - List all devices
- `POST /api/devices` - Add new device
- `POST /api/devices/detect` - Auto-detect device from IP
- `POST /api/device/<name>/restart` - Restart device
- `POST /api/device/<name>/settings` - Apply voltage/frequency

#### Benchmark
- `POST /api/benchmark/start` - Start benchmark
- `GET /api/benchmark/status` - Get live status
- `POST /api/benchmark/stop` - Stop benchmark

#### Profiles
- `GET /api/profiles/<device>` - Get device profiles
- `POST /api/profiles/<device>` - Save profiles
- `POST /api/profiles/<device>/apply/<profile>` - Apply profile
- `POST /api/profiles/<device>/custom` - Save current as custom
- `DELETE /api/profiles/<device>/delete/<profile>` - Delete profile

#### Sessions
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/<id>` - Get session details
- `GET /api/sessions/<id>/logs` - Get session logs
- `GET /api/sessions/<id>/plot/<type>` - Get plot image
- `DELETE /api/sessions/<id>` - Delete session

### CORS Configuration

If your Flask backend is on a different host/port, you need to enable CORS:

```python
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
```

Or for specific origins:

```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000", "https://your-domain.com"]
    }
})
```

## Architecture

### Frontend Stack
- **React 19**: UI framework
- **TypeScript**: Type safety
- **Tailwind CSS 4**: Styling with custom matrix theme
- **Wouter**: Lightweight routing
- **shadcn/ui**: UI component library
- **Sonner**: Toast notifications

### File Structure
```
client/
├── src/
│   ├── components/
│   │   ├── MatrixBackground.tsx    # Animated background
│   │   ├── Layout.tsx              # Main layout with nav
│   │   └── AddDeviceModal.tsx      # Device addition modal
│   ├── pages/
│   │   ├── Dashboard.tsx           # Fleet overview
│   │   ├── Benchmark.tsx           # Benchmark configuration
│   │   ├── Profiles.tsx            # Profile management
│   │   └── Sessions.tsx            # Session history
│   ├── lib/
│   │   └── api.ts                  # API client & helpers
│   ├── App.tsx                     # Root component
│   └── index.css                   # Matrix theme CSS
└── public/                         # Static assets
```

## Customization

### API Base URL
Change the API endpoint in `client/src/lib/api.ts`:

```typescript
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
```

### Theme Colors
Modify CSS variables in `client/src/index.css`:

```css
:root {
  --matrix-green: #00ff41;
  --neon-cyan: #00ffff;
  --electric-blue: #0080ff;
  /* ... */
}
```

### Polling Intervals
Adjust refresh rates in component files:

```typescript
// Dashboard auto-refresh (default: 5 seconds)
const interval = setInterval(loadDevices, 5000);

// Benchmark status polling (default: 1 second)
const interval = setInterval(fetchStatus, 1000);
```

## Features Preserved from Original

All functionality from the original AxeBench web interface is preserved:

✅ **Device Management**
- Add/remove devices
- Auto-detection
- Device restart
- Fan control
- Direct V/F settings

✅ **Benchmark Features**
- Full parameter configuration
- Auto Mode with intelligent stepping
- Multiple optimization goals
- Safety limits
- Auto-recovery system
- Live monitoring
- Session persistence

✅ **Profile System**
- Save/load profiles
- Apply profiles
- Nano Tune fine-tuning
- Profile comparison
- Best profile detection

✅ **Session Management**
- Session history
- Detailed logs
- Result visualization
- Plot generation
- Session export

✅ **Advanced Features**
- PSU management
- Shared PSU support
- Thermal throttling
- Search strategies
- Tier restrictions
- License management

## Troubleshooting

### "Failed to load devices" Error
- Check that Flask backend is running
- Verify `VITE_API_BASE_URL` is correct
- Check CORS is enabled on backend
- Verify network connectivity

### No devices showing
- Add devices using "ADD_DEVICE" button
- Use auto-detection with device IP
- Check devices are online and accessible

### Benchmark not starting
- Select a device first
- Verify device is online
- Check voltage/frequency ranges are valid
- Ensure Flask backend has device access

### Styling issues
- Clear browser cache
- Restart dev server: `pnpm dev`
- Check browser console for errors

## Development

### Run Development Server
```bash
pnpm dev
```

### Build for Production
```bash
pnpm build
```

### Type Checking
```bash
pnpm check
```

### Format Code
```bash
pnpm format
```

## License

This frontend interface is designed to work with the AxeBench system. Refer to the main AxeBench project for licensing information.

## Credits

- **Matrix Aesthetic**: Inspired by The Matrix (1999)
- **Gridrunner Theme**: Retro gaming aesthetic
- **AxeBench v3.0.0**: Professional Bitaxe benchmark backend
- **Matrix UI v2.0**: Modern React frontend interface
- **UI Framework**: React + shadcn/ui

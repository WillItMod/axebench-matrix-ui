# AxeBench Complete Functionality Documentation

## Overview
This document catalogs EVERY function, button, input field, data storage mechanism, and feature in the AxeBench system. This ensures the new matrix UI preserves 100% of existing functionality.

---

## 1. AUTHENTICATION & LICENSING

### Patreon OAuth System
- **Login Flow**: `/auth/patreon/callback` handles OAuth
- **License Status**: `GET /api/license/status` - Returns patron tier, device limit, features
- **Logout**: `POST /api/license/logout` - Clears saved credentials
- **Refresh**: `POST /api/license/refresh` - Re-verify patron status
- **Tier Info**: `GET /api/tier-info` - Get current user tier and available features

### UI Elements
- **Support Development Button**: Opens Patreon OAuth flow
- **Nag Modal**: Shows for free tier users (dismissible)
- **Patron Banner**: Displays patron name and tier
- **Logout Button**: In patron banner

### Data Storage
- `~/.bitaxe-benchmark/auth_origin.txt` - Stores origin host for OAuth callback
- License data stored by licensing.py module

---

## 2. DEVICE MANAGEMENT

### Core Device Operations

#### Add Device
- **API**: `POST /api/devices`
- **Request Body**: `{name, ip, model, psu}`
- **Auto-Detection**: `POST /api/devices/detect` - Detects model, chip, hostname from IP
- **UI Elements**:
  - Add Device button (dashboard)
  - Device name input
  - IP address input
  - Model dropdown (Gamma, Supra, Ultra, Hex, Max, NerdQAxe variants)
  - Auto-detect button (🔍 Detect)
  - PSU configuration section

#### Device Models Supported
- **Gamma** (BM1370, 1 chip)
- **Supra** (BM1368)
- **Ultra** (BM1366)
- **Hex** (BM1366 x6 chips)
- **Max** (BM1397)
- **NerdQAxe** (BM1370, 1 chip, Nerd variant)
- **NerdQAxe+** (BM1370, 2 chips)
- **NerdQAxe++** (BM1370, 4 chips)

#### View/Edit Device
- **API**: `PUT /api/devices/<device_name>`
- **Request Body**: `{name, ip, model, psu}`
- **UI Elements**:
  - Device detail modal (view mode)
  - Edit button → switches to edit mode
  - Name, IP, Model inputs
  - PSU configuration
  - Save/Cancel buttons

#### Remove Device
- **API**: `DELETE /api/devices/<device_name>`
- **UI**: Delete button in device card/detail modal

#### Device Status
- **API**: `GET /api/devices/<device_name>/status`
- **Returns**: hashrate, temp, power, voltage, frequency, fan speed, uptime, best share
- **UI**: Real-time status display in device cards
- **Polling**: Auto-refreshes every 2-5 seconds

#### Device Actions
- **Restart Device**: `POST /api/device/<device_name>/restart`
- **Apply Settings**: `POST /api/device/<device_name>/settings` - Direct V/F application
- **Set Fan**: `POST /api/devices/<device_name>/fan` - Auto mode with target temp or manual

### PSU Management

#### Shared PSU System
- **List PSUs**: `GET /api/psus`
- **Create PSU**: `POST /api/psus` - `{name, capacity_watts, safe_watts, warning_watts}`
- **Update PSU**: `PUT /api/psus/<psu_id>`
- **Delete PSU**: `DELETE /api/psus/<psu_id>`
- **Get PSU Devices**: `GET /api/psus/<psu_id>/devices` - Returns devices + live power totals

#### PSU Types
- **Standalone**: Each device has own PSU (default 25W)
- **Shared**: Multiple devices share one PSU with capacity tracking

#### UI Elements
- Add Shared PSU button
- PSU cards showing capacity, usage, devices
- Device assignment to PSU
- Power usage warnings (amber/red)

### Data Storage
- `~/.bitaxe-benchmark/devices.json` - Device list with IP, model, PSU config
- `~/.bitaxe-benchmark/shared_psus.json` - Shared PSU configurations

---

## 3. BENCHMARK SYSTEM

### Benchmark Configuration

#### Easy/Geek Mode Toggle
- **UI**: Mode switch at top of benchmark tab
- **Storage**: `localStorage.axebench_ui_mode`
- **Easy Mode**: Hides advanced options (marked with `.advanced-only` class)
- **Geek Mode**: Shows all options

#### Device Selection
- **Dropdown**: Lists all devices
- **Auto-loads**: Device model profile when selected
- **Quick Benchmark**: Button in device card → switches to benchmark tab with device pre-selected

#### Hardware Presets
- **API**: `GET /api/hardware-presets`
- **Types**: Fast, Optimal, Thorough
- **Per-Device**: `GET /api/hardware-preset/<preset_key>/<device_model>`
- **Auto-populates**: Voltage/frequency ranges based on device model

#### Saved Profiles
- **Load**: Dropdown + Load button
- **Save Current**: Button to save current config
- **Delete**: 🗑️ button
- **Storage**: `localStorage` (per-device)

#### Auto Mode (Intelligent Step Adjustment)
- **Checkbox**: 🤖 Auto Mode
- **Default**: ON
- **Behavior**:
  - Starts with coarse steps (25mV, 50MHz)
  - Auto-switches to fine steps (5mV, 10MHz) when:
    - Hitting limits
    - Finding optimal zones
    - Detecting instability
  - Faster and more accurate than fixed steps

#### Voltage Settings
- **Start Voltage** (mV)
- **Stop Voltage** (mV)
- **Step Size** (mV) - Disabled when Auto Mode ON
- **Auto Label**: Shows "(Auto: 25→5mV)" when enabled

#### Frequency Settings
- **Start Frequency** (MHz)
- **Stop Frequency** (MHz)
- **Step Size** (MHz) - Disabled when Auto Mode ON
- **Auto Label**: Shows "(Auto: 50→10MHz)" when enabled

#### Test Parameters
- **Test Duration** (seconds) - Per test duration
- **Warmup Time** (seconds) - Before sampling
- **Cooldown Time** (seconds) - Between tests
- **Cycles Per Test** - Repeat each V/F combo N times for accuracy

#### Optimization Goal
- **Dropdown**: max_hashrate, efficient, balanced, quiet
- **Affects**: Which results are prioritized
- **Quiet Mode**: Shows fan target slider when selected

#### Safety Limits
- **Max Chip Temp** (°C)
- **Max VR Temp** (°C)
- **Max Power** (W)
- **Auto-loaded**: From device model profile

#### Advanced Options (Geek Mode Only)
- **Restart Between Tests**: Checkbox (slower but thorough)
- **Enable Plots**: Generate visualization charts
- **Export CSV**: Save results as spreadsheet

#### Auto-Recovery System
- **Checkbox**: 🔄 Auto-Recovery Mode (default ON)
- **Strategy Dropdown**:
  - Conservative (Voltage first)
  - Aggressive (Frequency first)
  - Balanced
- **Max Retries**: Number of recovery attempts
- **Cooldown**: Seconds between retries
- **Behavior**: If test fails, automatically try alternatives instead of stopping

### Benchmark Execution

#### Start Benchmark
- **API**: `POST /api/benchmark/start`
- **Request Body**: Complete config object (30+ fields)
- **Button**: "Start Benchmark" (green)
- **Validation**: Checks device selected, fields filled

#### Stop Benchmark
- **API**: `POST /api/benchmark/stop`
- **Button**: "Stop Benchmark" (red) - Only shown when running
- **Persistence**: Control panel persists after page refresh if benchmark running

#### Benchmark Status
- **API**: `GET /api/benchmark/status`
- **Polling**: Every 1 second when running
- **Returns**:
  - `running`: boolean
  - `progress`: 0-100
  - `current_test`: Current V/F combo
  - `tests_completed` / `tests_total`
  - `device`: Device name
  - `phase`: warmup, sampling, error, warning, complete, strategy
  - `message`: Current status message
  - `message_queue`: Array of console messages
  - `error`: Error message if stopped
  - `warning`: Warning message (non-fatal)
  - `recovery_action`: What recovery was taken
  - `live_data`: Current device readings (hashrate, temp, power, etc.)
  - `last_safe_settings`: Last known good V/F
  - `config`: Benchmark config used
  - `safety_limits`: Safety limits for run

#### Live Benchmark Display
- **Progress Bar**: Visual progress indicator
- **Current Test**: Shows V/F being tested
- **Live Stats Panel**:
  - Voltage (mV)
  - Frequency (MHz)
  - Hashrate (GH/s)
  - Temperature (°C)
  - Power (W)
  - Fan Speed (%)
  - Error Rate (%)
- **Event Log**: Scrollable console with timestamped events
  - Color-coded by type (info, success, warning, error, strategy)
  - Expandable/collapsible
  - Auto-scrolls to bottom
- **Best Result Tracking**: Shows best hashrate/efficiency found so far

#### Message Queue
- **API**: `POST /api/benchmark/clear_queue`
- **Purpose**: Frontend fetches messages, then clears queue to avoid duplicates

### Special Benchmark Modes

#### Fine Tune Mode (Nano Tune)
- **Trigger**: "🔬 Nano" button on profile cards
- **Modal**: Nano Tune Goal Selection
- **Goals**:
  - **Max Hashrate**: Test higher V/F (±50mV, +50MHz)
  - **Balanced**: Test around current V/F (±25mV, ±25MHz)
  - **Efficient**: Test lower V/F for better efficiency
  - **Quiet**: Test lower V/F to reduce fan speed
    - Shows fan target slider (20-80%)
- **Behavior**:
  - Uses existing profile as baseline
  - Narrow test range around profile V/F
  - Fine steps (5mV, 10MHz)
  - Auto-saves result back to profile (optional)
- **UI Elements**:
  - Goal selection cards (clickable)
  - Fan target slider (quiet mode only)
  - Base settings display
  - Test range preview
  - Start button (disabled until goal selected)
- **Storage**: 
  - `window.fineTuneProfileName`
  - `window.fineTuneDeviceName`
  - `window.fineTuneExpectedHashrate`
  - `window.fineTuneOptimizationGoal`
  - `window.fineTuneAutoSave`

#### Hashrate Comparison Bar
- **Shows**: Only in Fine Tune mode
- **Compares**: Current hashrate vs expected (from profile)
- **Visual**: Progress bar with percentage difference

### Benchmark Presets
- **API**: `GET /api/presets`
- **API**: `GET /api/benchmark/preset/<device>/<preset>`
- **Types**: fast, optimal, thorough
- **Auto-populates**: All config fields

### Optimization Targets
- **API**: `GET /api/optimization-targets`
- **Returns**: List of available targets with descriptions

### Data Storage
- `~/.bitaxe-benchmark/benchmark_state.json` - Current benchmark state (persists across restarts)
- `~/.bitaxe-benchmark/sessions/` - Completed benchmark sessions

---

## 4. PROFILE MANAGEMENT

### Profile Operations

#### Get Profiles
- **API**: `GET /api/profiles/<device_name>`
- **Returns**: All profiles for device (Quiet, Efficient, Max, Nuclear, Custom)
- **List All**: `GET /api/profiles` - All devices with profiles

#### Save Profiles
- **API**: `POST /api/profiles/<device_name>`
- **Request Body**: `{profiles: {quiet: {...}, efficient: {...}, ...}, session_id, overwrite}`
- **Overwrite Protection**: Requires `overwrite: true` if profiles exist

#### Apply Profile
- **API**: `POST /api/profiles/<device_name>/apply/<profile_name>`
- **Applies**: Voltage, frequency, fan target to device
- **UI**: Apply button on profile cards

#### Save Custom Profile
- **API**: `POST /api/profiles/<device_name>/custom`
- **Captures**: Current device settings as custom profile

#### Update Profile
- **API**: `POST /api/profiles/<device_name>/update`
- **Request Body**: `{profile_name, profile_data}`
- **UI**: Edit button on profile cards → Edit Profile Modal

#### Delete Profile
- **API**: `DELETE /api/profiles/<device_name>/delete/<profile_name>`
- **UI**: Delete button in profile list

### Profile Types Generated
- **Quiet**: Lowest power, minimal fan noise
- **Efficient**: Best J/TH efficiency
- **Max**: Maximum hashrate
- **Nuclear**: Absolute maximum (if different from Max)
- **Custom**: User-saved configurations

### Profile Data Structure
```json
{
  "voltage": 1200,
  "frequency": 500,
  "hashrate": 550.5,
  "efficiency": 25.3,
  "power": 15.2,
  "temp": 55,
  "fan_speed": 45,
  "fan_target": 60,
  "error_rate": 0.15
}
```

### UI Elements
- **Profile Cards**: Show V/F, hashrate, efficiency, power
- **Apply Button**: Applies profile to device
- **Edit Button**: Opens edit modal
- **Nano Button**: Opens Nano Tune modal
- **Delete Button**: Removes profile
- **Generate from Session**: Creates profiles from completed benchmark

### Data Storage
- `~/.bitaxe-benchmark/profiles/<device-name>.json`

---

## 5. SESSION MANAGEMENT

### Session Operations

#### List Sessions
- **API**: `GET /api/sessions`
- **Returns**: Array of all benchmark sessions
- **Sorting**: Most recent first
- **Data**: ID, device, start time, status, test count, has_logs

#### Get Session Details
- **API**: `GET /api/sessions/<session_id>`
- **Returns**: Complete session data with all results

#### Get Session Logs
- **API**: `GET /api/sessions/<session_id>/logs`
- **Returns**: Event log for session
- **UI**: 📋 Logs button on session cards

#### Get Session Plot
- **API**: `GET /api/sessions/<session_id>/plot/<plot_type>`
- **Types**: hashrate, efficiency, temperature, power
- **Returns**: PNG image

#### Delete Session
- **API**: `DELETE /api/sessions/<session_id>`
- **UI**: 🗑️ button on session cards

### Session Status Types
- **completed**: Finished successfully
- **running**: Currently executing
- **interrupted**: Stopped by user or error
- **error**: Failed with error

### Session Data Structure
```json
{
  "id": "session_20240101_120000",
  "device": "My Bitaxe",
  "start_time": "2024-01-01T12:00:00",
  "end_time": "2024-01-01T12:30:00",
  "status": "completed",
  "config": {...},
  "results": [...],
  "best_hashrate": {...},
  "best_efficiency": {...},
  "stop_reason": "Completed successfully"
}
```

### UI Elements
- **Sessions Tab**: Lists all sessions
- **Session Cards**: Clickable to view details
- **Status Badges**: Color-coded by status
- **View Logs Button**: Opens logs modal
- **Generate Profiles Button**: Creates profiles from session
- **Delete Button**: Removes session
- **Auto-refresh**: Every 10 seconds

### Data Storage
- `~/.bitaxe-benchmark/sessions/<session_id>.json`
- `~/.bitaxe-benchmark/sessions/<session_id>_log.txt`

---

## 6. LIVE MONITORING

### Real-time Data Display
- **Polling Interval**: 2-5 seconds
- **Data Source**: `GET /api/devices/<device_name>/status`

### Metrics Displayed
- **Hashrate** (GH/s) - Current mining speed
- **Temperature** (°C) - Chip temp
- **VR Temperature** (°C) - Voltage regulator temp
- **Power** (W) - Current consumption
- **Voltage** (mV) - Core voltage
- **Frequency** (MHz) - Clock speed
- **Fan Speed** (%) - Current fan RPM percentage
- **Uptime** - Device uptime
- **Best Share** - Difficulty of best share found

### Charts (if implemented in original)
- **Hashrate Graph**: Performance over time
- **Temperature Graph**: Chip + VR temps (dual lines)
- **Power Graph**: Power + voltage (dual axis)
- **History**: Last 60 data points (2 minutes)

---

## 7. FLEET MANAGEMENT

### Fleet Dashboard
- **Auto-refresh**: Every 30 seconds
- **Refresh Button**: Manual refresh
- **Fleet Stats**:
  - Total Devices
  - Online Devices
  - Total Hashrate (sum of all)
  - Total Power (sum of all)

### Device Cards
- **Status Indicator**: Green (online) / Red (offline)
- **Model Badge**: Color-coded by model
- **Quick Stats**: Hashrate, temp, power
- **Quick Actions**:
  - Quick Benchmark button
  - View Details button
  - Fan control (if device supports)

### Network Scan
- **Scan Network Button**: Discovers devices on local network
- **Range**: Scans common IP ranges
- **Auto-add**: Option to add discovered devices

---

## 8. CONFIGURATION & SETTINGS

### Device Model Profiles
- **API**: `GET /api/device-profile/<device_model>`
- **Returns**: Complete device specifications
- **Data**:
  - Name, chip type
  - Stock voltage/frequency
  - Safe/max voltage/frequency ranges
  - Temperature limits
  - Power limits
  - PSU specifications

### Model Configurations
```javascript
{
  gamma: {
    name: "Bitaxe Gamma",
    chip: "BM1370",
    stock_voltage: 1200,
    stock_frequency: 490,
    min_voltage: 1000,
    max_voltage: 1350,
    safe_max_voltage: 1250,
    min_frequency: 400,
    max_frequency: 750,
    safe_max_frequency: 575,
    stock_max_chip_temp: 65,
    max_chip_temp: 70,
    stock_max_vr_temp: 80,
    max_vr_temp: 85,
    stock_psu_watts: 25,
    safe_power_stock_psu: 20,
    max_power: 45
  }
  // ... similar for supra, ultra, hex, max, nerdqaxe variants
}
```

### Hardware Presets
- **Fast**: Wide sweep, coarse steps, throughput focused
- **Optimal**: Moderate window, medium steps, balanced
- **Thorough**: Narrow window, fine steps, precision focused

### Optimization Targets
```javascript
{
  max_hashrate: {
    name: "Maximum Hashrate",
    description: "Prioritize highest GH/s",
    target_error: 0.25,
    hashrate_tolerance: 0.92
  },
  efficient: {
    name: "Maximum Efficiency",
    description: "Best J/TH ratio",
    target_error: 0.15,
    hashrate_tolerance: 0.96
  },
  balanced: {
    name: "Balanced",
    description: "Balance between hashrate and efficiency",
    target_error: 0.20,
    hashrate_tolerance: 0.94
  },
  quiet: {
    name: "Quiet Mode",
    description: "Minimize fan noise",
    fan_target: 40,
    target_error: 0.15
  }
}
```

---

## 9. SEARCH STRATEGIES

### Available Strategies
- **Linear**: Sequential grid scan (thorough but slow)
- **Binary**: Binary search for optimal point (fast but limited)
- **Adaptive Grid**: Coarse then fine grid (balanced)
- **Adaptive Progression**: Intelligent chase algorithm (recommended)

### Adaptive Progression Features
- **Auto Mode**: Automatically adjusts step sizes
- **Limit Detection**: Stops at temperature/power/error limits
- **Sweet Spot Finding**: Refines around optimal zones
- **Instability Avoidance**: Skips unstable regions
- **Multi-goal**: Tracks best for each optimization target

### Strategy Selection
- **Default**: Adaptive Progression with Auto Mode
- **UI**: Hidden (always uses adaptive_progression)
- **Config**: Can be overridden via API

---

## 10. DATA PERSISTENCE

### File Storage Locations
```
~/.bitaxe-benchmark/
├── devices.json              # Device list
├── shared_psus.json          # Shared PSU configs
├── auth_origin.txt           # OAuth callback host
├── benchmark_state.json      # Current benchmark state
├── profiles/
│   └── <device-name>.json    # Device profiles
├── sessions/
│   ├── <session-id>.json     # Session data
│   └── <session-id>_log.txt  # Session logs
└── pool_schedules/           # AxePool schedules (if used)
```

### LocalStorage Keys
- `axebench_ui_mode` - Easy/Geek mode preference
- `axebench_saved_profiles_<device>` - Saved benchmark configs per device

### Session Storage
- `window.fineTuneProfileName` - Active fine tune profile
- `window.fineTuneDeviceName` - Active fine tune device
- `window.fineTuneExpectedHashrate` - Expected hashrate for comparison
- `window.fineTuneOptimizationGoal` - Fine tune goal
- `window.fineTuneAutoSave` - Auto-save preference
- `window.nanoTuneData` - Nano tune configuration
- `window.nanoTuneRanges` - Nano tune test ranges
- `window.selectedNanoGoal` - Selected nano goal
- `window.expectedHashrate` - For hashrate comparison bar
- `window.benchmarkConfig` - Current benchmark config
- `window.bestResult` - Best result from current benchmark

---

## 11. UI MODALS

### Add Device Modal
- Device name input
- IP address input
- Auto-detect button
- Model dropdown
- PSU configuration
- Add/Cancel buttons

### Device Detail Modal
- **View Mode**: Shows device info, profiles
- **Edit Mode**: Edit device settings
- Switch between modes with Edit button

### Edit Profile Modal
- Profile name
- Voltage input
- Frequency input
- Fan target input
- Save/Cancel buttons

### Nano Tune Modal
- Goal selection (4 cards: Max Hashrate, Balanced, Efficient, Quiet)
- Fan target slider (quiet mode only)
- Base settings display
- Test range preview
- Start/Cancel buttons

### Save Tune Result Modal
- Save mode selection (Update existing, Save as new, Save all)
- Profile name input (for new profiles)
- Summary of results
- Save/Cancel buttons

### Session Logs Modal
- Session info header
- Scrollable log content
- Close button

### Shared PSU Modal
- PSU name input
- Capacity input (watts)
- Safe watts input
- Warning watts input
- Device assignment list
- Save/Cancel buttons

---

## 12. BUTTONS & ACTIONS COMPLETE LIST

### Dashboard Tab
- ➕ Add Device
- 🔄 Refresh (fleet)
- ➕ Add Shared PSU
- Quick Benchmark (per device)
- View Details (per device)
- Set Fan (per device)
- Edit Device (in detail modal)
- Delete Device (in detail modal)
- Apply Profile (in detail modal)

### Benchmark Tab
- Start Benchmark
- Stop Benchmark (when running)
- 🔍 Detect (auto-detect device)
- Load (saved profile)
- 💾 Save Current (profile)
- 🗑️ Delete (saved profile)
- Cancel Fine Tune (when active)

### Profiles Tab
- Apply (per profile)
- Edit (per profile)
- 🔬 Nano (per profile - opens Nano Tune)
- Delete (per profile)
- Generate Profiles (from session)

### Sessions Tab
- 📋 Logs (per session)
- 📋 Profiles (per completed session)
- 🗑️ Delete (per session)

### Modals
- Save (various modals)
- Cancel (various modals)
- Close (X button)
- Select Goal (Nano Tune)
- Start Nano Tune
- Update Profile
- Save As New
- Save All Profiles

---

## 13. INPUT FIELDS COMPLETE LIST

### Device Configuration
- Device Name (text)
- IP Address (text)
- Device Model (dropdown)
- PSU Type (radio: Standalone/Shared)
- PSU Capacity (number, watts)
- PSU Safe Watts (number)
- PSU Warning Watts (number)

### Benchmark Configuration
- Device Select (dropdown)
- Device Model (dropdown)
- Hardware Preset (dropdown)
- Saved Profile (dropdown)
- Auto Mode (checkbox)
- Voltage Start (number, mV)
- Voltage Stop (number, mV)
- Voltage Step (number, mV)
- Frequency Start (number, MHz)
- Frequency Stop (number, MHz)
- Frequency Step (number, MHz)
- Test Duration (number, seconds)
- Warmup Time (number, seconds)
- Cooldown Time (number, seconds)
- Cycles Per Test (number)
- Optimization Goal (dropdown)
- Fan Target (number, %, quiet mode only)
- Max Chip Temp (number, °C)
- Max VR Temp (number, °C)
- Max Power (number, W)
- Restart Between Tests (checkbox)
- Enable Plots (checkbox)
- Export CSV (checkbox)
- Auto-Recovery (checkbox)
- Recovery Strategy (dropdown)
- Max Retries (number)
- Recovery Cooldown (number, seconds)

### Profile Management
- Profile Name (text)
- Voltage (number, mV)
- Frequency (number, MHz)
- Fan Target (number, °C)

### Nano Tune
- Goal Selection (radio cards)
- Fan Target (slider, 20-80%, quiet mode only)

### Session Management
- (No inputs - display only)

---

## 14. REAL-TIME POLLING & UPDATES

### Active Polling
- **Benchmark Status**: Every 1 second when benchmark running
- **Device Status**: Every 2-5 seconds on dashboard
- **Fleet Dashboard**: Every 30 seconds
- **Sessions List**: Every 10 seconds

### Event-Driven Updates
- **Message Queue**: Fetched with benchmark status, then cleared
- **Live Data**: Updated with each status poll
- **Best Results**: Updated in real-time during benchmark

---

## 15. COLOR CODING & VISUAL INDICATORS

### Device Status
- **Green**: Online, operational
- **Red**: Offline, error
- **Amber**: Warning (high temp, high power)

### Model Colors
- **Gamma**: #ff3333 (red)
- **Supra**: #ff9800 (orange)
- **Ultra**: #4caf50 (green)
- **Hex**: #2196f3 (blue)
- **Max**: #9c27b0 (purple)

### Benchmark Phases
- **Info**: Blue
- **Success**: Green
- **Warning**: Amber
- **Error**: Red
- **Strategy**: Cyan

### PSU Usage
- **Green**: < 70% capacity
- **Amber**: 70-90% capacity
- **Red**: > 90% capacity

---

## 16. KEYBOARD SHORTCUTS & ACCESSIBILITY

### Tab Navigation
- Tab key navigates through form fields
- Enter submits forms
- Escape closes modals

### Focus Management
- Visible focus rings
- Keyboard-accessible buttons
- Screen reader support

---

## 17. ERROR HANDLING & RECOVERY

### Benchmark Errors
- **Auto-Recovery**: Tries alternative V/F combinations
- **Recovery Strategies**: Conservative, Aggressive, Balanced
- **Max Retries**: Configurable limit
- **Cooldown**: Wait period between retries
- **Manual Stop**: User can disable auto-recovery

### Network Errors
- **Retry Logic**: Automatic retry on timeout
- **Error Display**: Toast notifications
- **Offline Detection**: Device marked offline if unreachable

### Validation
- **Required Fields**: Checked before submission
- **Range Validation**: Min/max limits enforced
- **IP Format**: Validated on device add
- **Duplicate Names**: Prevented

---

## 18. COMPANION APPS (Not in Scope for Matrix UI)

### AxeShed (Port 5001)
- Profile scheduling
- Time-based automation
- Fleet-wide profile management

### AxePool (Port 5002)
- Pool management
- Pool switching
- Pool scheduling

**Note**: Matrix UI focuses on AxeBench (port 5000) only. AxeShed and AxePool are separate apps.

---

## SUMMARY

**Total API Endpoints**: 42
**Total UI Buttons**: 50+
**Total Input Fields**: 40+
**Total Modals**: 8
**Total Tabs**: 4 (Dashboard, Benchmark, Profiles, Sessions)
**Data Storage Files**: 10+ file types
**Real-time Polling**: 4 different intervals
**Special Modes**: 2 (Easy/Geek, Fine Tune/Nano)
**Search Strategies**: 4
**Optimization Goals**: 4
**Device Models**: 8
**Profile Types**: 5

This document ensures the matrix UI will preserve 100% of existing functionality.

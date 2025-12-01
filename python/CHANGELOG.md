# AxeBench v2.0 - Enhanced Edition

## Major Enhancements

### 1. ✅ Complete Dark Grey Theme
- Changed all light backgrounds (#f5f5f5, #e0e0e0) to dark grey (#1a1a1a, #2d2d2d)
- Cards now use #2d2d2d with subtle borders (#3d3d3d)
- All inputs, selects, and form elements now have dark backgrounds (#1a1a1a) with white text
- Status boxes, progress bars, and stat boxes all darkened
- Modal dialogs updated to dark theme
- Consistent dark aesthetic throughout the entire interface

### 2. 🎯 Device Model Profiles with Stock Values
Enhanced MODEL_CONFIGS in config.py with complete specifications for all Bitaxe models:

**Bitaxe Supra (BM1366)**
- Stock: 1000mV @ 500MHz
- Safe Max: 1150mV @ 575MHz
- Temps: ASIC 65°C | VReg 80°C

**Bitaxe Ultra (BM1366)**
- Stock: 1200mV @ 425MHz
- Safe Max: 1275mV @ 650MHz
- Temps: ASIC 63°C | VReg 78°C

**Bitaxe Hex (BM1366 x6)**
- Stock: 1166mV @ 490MHz
- Safe Max: 1275mV @ 550MHz
- Temps: ASIC 65°C | VReg 80°C

**Bitaxe Gamma (BM1370)**
- Stock: 1150mV @ 525MHz
- Safe Max: 1225mV @ 700MHz
- Temps: ASIC 60°C | VReg 75°C

**Bitaxe Max (BM1397)**
- Stock: 1200mV @ 450MHz
- Safe Max: 1350mV @ 800MHz
- Temps: ASIC 68°C | VReg 80°C

Each profile includes:
- Chip type and count
- Complete frequency ranges (min, max, stock, safe max)
- Complete voltage ranges (min, max, stock, safe max)
- Temperature limits (absolute max and stock safe limits)
- Power specifications (typical, max, stock)
- Expected hashrate values

### 3. ⚠️ Enhanced Safety Warning System
Two-tier warning system:

**Red (Critical) Warnings:**
- Blocks benchmark from starting
- Triggered when exceeding absolute device limits
- Requires manual override checkbox to proceed

**Orange (Caution) Warnings:**
- Allows benchmark but warns user
- Triggered when exceeding stock specifications by >5%
- Shows percentage over stock values
- Warns about potential lifespan/stability issues

Warnings include:
- Voltage deviations from stock
- Frequency deviations from stock
- Exceeding safe maximum recommendations
- Clear messaging about risks

### 4. 📊 Cycles Per Test Parameter
New parameter: `cycles_per_test` (default: 1)
- Allows running multiple cycles at each voltage/frequency combination
- Useful for stability validation
- Range: 1-10 cycles
- Integrated into BenchmarkConfig dataclass
- Added to web interface with helpful tooltip
- Passed to backend through API

### 5. 🔧 Device Model Selector
New dropdown in web interface:
- Manual device model selection (Supra, Ultra, Hex, Gamma, Max)
- Auto-detect option (uses device-reported model)
- Loads appropriate safety profiles
- Updates all constraints dynamically
- Shows comprehensive device information panel with:
  - Device name and chip type
  - Stock voltage and frequency
  - Safe maximum limits
  - Temperature limits for ASIC and VReg

### 6. 🎨 AxeBench Branding
- Professional ASCII banner on startup
- Consistent "AxeBench" naming throughout
- Red/Black/Grey color scheme matching Bitaxe hardware
- Warning about warranty voiding and fire risk

## API Enhancements

### Enhanced /api/device-profile/<model> Endpoint
Now returns complete specifications:
```json
{
  "model": "gamma",
  "name": "Bitaxe Gamma (BM1370)",
  "chip": "BM1370",
  "chip_count": 1,
  "min_voltage": 1100,
  "max_voltage": 1250,
  "stock_voltage": 1150,
  "safe_max_voltage": 1225,
  "min_frequency": 400,
  "max_frequency": 750,
  "stock_frequency": 525,
  "safe_max_frequency": 700,
  "max_chip_temp": 65.0,
  "max_vr_temp": 81.0,
  "stock_max_chip_temp": 60.0,
  "stock_max_vr_temp": 75.0,
  "typical_power": 16.0,
  "max_power": 22.0,
  "stock_power": 13.0,
  "typical_hashrate": 1200,
  "stock_hashrate": 1100
}
```

### /api/benchmark/start Endpoint
Now accepts `cycles_per_test` parameter

## JavaScript Functions

### New: `loadModelProfile()`
- Loads device model specifications
- Updates form constraints dynamically
- Populates stock values
- Sets model-specific temperature limits
- Triggers safety checks

### Enhanced: `checkSafetyRange()`
- Two-tier warning system (critical vs caution)
- Checks against stock specifications
- Calculates percentage deviations
- Color-coded warnings (red vs orange)
- Detailed warning messages

### Enhanced: `loadDeviceProfile()`
- Syncs with manual model selector
- Delegates to loadModelProfile()

### Enhanced: `startBenchmark()`
- Includes cycles_per_test in configuration

## Installation

1. Extract axebench.zip
2. Install dependencies: `./setup.sh` or `pip install --break-system-packages flask flask-cors aiohttp numpy pandas scipy matplotlib seaborn`
3. Run: `python3 web_interface.py`
4. Open browser: http://localhost:5000

## Usage Tips

1. **Select Device Model**: Choose your Bitaxe model from the dropdown
2. **Review Stock Values**: Check the device profile info panel
3. **Configure Test**: Set voltage/frequency ranges
   - Orange warnings: Over stock but within limits (proceed with caution)
   - Red warnings: Exceeds device limits (requires override)
4. **Set Cycles**: Choose how many cycles to run at each setting
5. **Start Benchmark**: System will warn if unsafe

## Safety Features

- Automatic profile loading based on device model
- Stock value awareness
- Two-tier warning system
- Manual override requirement for dangerous settings
- Model-specific temperature limits
- Clear percentage deviation displays

## Files Modified

- `config.py`: Enhanced MODEL_CONFIGS, added cycles_per_test to BenchmarkConfig
- `web_interface.py`: Complete UI overhaul, new functions, enhanced safety checks, dark theme
- All other files remain compatible

## Compatibility

- Works with existing device configurations
- Backward compatible with previous benchmark sessions
- All existing presets still function
- API endpoints enhanced but maintain compatibility

---

**⚠️ WARNING**: Overclocking voids warranties and can damage hardware. Always monitor temperatures and use conservative settings unless you fully understand the risks. Start with stock values and gradually increase while watching for stability issues.

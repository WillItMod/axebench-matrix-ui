# 🌐 Web Interface Guide

## What's New in the Web UI

Your enhanced web interface now includes **EVERYTHING** you asked for:

✅ **Device Management** - Add/remove devices from the web  
✅ **Full Configuration Panel** - All CLI options in the GUI  
✅ **Live Monitoring Graphs** - Real-time voltage, hashrate, temperature, power  
✅ **Profile Loading** - Efficiency, Speed, Quiet, and all presets  
✅ **Real-time Stats** - Live device metrics  
✅ **Session History** - Browse past benchmarks  

## Starting the Web UI

```bash
cd /mnt/user-data/outputs/bitaxe-benchmark-pro
python3 web_interface.py
```

Or install as a service:
```bash
sudo ./install-service.sh
```

Then open: **http://localhost:5000** (or your server's IP)

## Features by Tab

### 📱 Dashboard Tab

**Device Management:**
- ➕ Add new devices (name, IP, model)
- 🗑️ Remove devices
- 📋 View all configured devices
- Models supported: Supra, Ultra, Hex, Gamma

**How to Add a Device:**
1. Click "Add Device" button
2. Enter device name (e.g., "My Bitaxe")
3. Enter IP address (e.g., "192.168.1.100")
4. Select model from dropdown
5. Click "Add Device"

### 🚀 Benchmark Tab

**Full Configuration Panel with ALL Options:**

**Profile / Preset Selection:**
- Quick Test (Fast)
- Conservative (Safe)
- Aggressive (Max)
- Efficiency (Low Power)
- Max Performance
- Paranoid (Thorough)
- Custom Configuration

**Voltage Settings:**
- Start voltage (mV)
- Stop voltage (mV)
- Step size (mV)

**Frequency Settings:**
- Start frequency (MHz)
- Stop frequency (MHz)
- Step size (MHz)

**Test Parameters:**
- Test duration (seconds)
- Warmup time (seconds)
- Search strategy (Adaptive Grid, Linear, Binary)
- Optimization goal (Balanced, Max Hashrate, Max Efficiency)

**Safety Limits:**
- Max temperature (°C)
- Max power (W)
- Max VR temperature (°C)

**Options:**
- ☑️ Restart between tests (slower but thorough)
- ☑️ Enable plots (visualization charts)
- ☑️ Export CSV (spreadsheet data)

**How to Use:**
1. Select device from dropdown
2. Choose a profile/preset OR configure manually
3. Adjust any settings as needed
4. Click "Start Benchmark"
5. Watch progress in real-time

### 📊 Live Monitor Tab

**Real-Time Monitoring with Graphs!**

**Live Statistics (Updates every 2 seconds):**
- 📈 Current Hashrate (GH/s)
- 🌡️ Temperature (°C)
- ⚡ Power consumption (W)
- 🔋 Voltage (mV)

**Interactive Charts:**
1. **Hashrate Graph** - Shows mining performance over time
2. **Temperature Graph** - Chip temp + VR temp (dual lines)
3. **Power Graph** - Power consumption + voltage (dual axis)

**Features:**
- Last 60 data points (2 minutes of history)
- Smooth animated updates
- Color-coded for easy reading
- No page refresh needed

**How to Use:**
1. Select device from dropdown
2. Graphs start updating automatically
3. Watch real-time performance
4. Monitor temps during benchmarks
5. Leave it running to track stability

### 📊 Sessions Tab

**Browse Past Benchmarks:**
- View all completed sessions
- See start time, status, number of tests
- Click any session to view full details
- Status badges (Completed, Running, Interrupted)
- Auto-refreshes every 10 seconds

## Profile Loading Examples

### Use Case 1: Efficiency Mode (Quiet & Cool)
```
1. Go to Benchmark tab
2. Select your device
3. Choose "Efficiency (Low Power)" preset
4. Loads settings:
   - Voltage: 1100-1250mV (lower)
   - Frequency: 450-600MHz (slower)
   - Goal: Max Efficiency
   - Result: Quieter, cooler, lower power
```

### Use Case 2: Maximum Speed
```
1. Select "Max Performance" preset
2. Loads settings:
   - Voltage: 1250-1400mV (higher)
   - Frequency: 600-800MHz (faster)
   - Goal: Max Hashrate
   - Result: Maximum GH/s
```

### Use Case 3: Conservative Testing
```
1. Select "Conservative (Safe)" preset
2. Loads settings:
   - Voltage: 1150-1250mV (safe range)
   - Longer test duration (15 min)
   - Linear search (thorough)
   - Result: Safe, reliable testing
```

### Use Case 4: Quick Validation
```
1. Select "Quick Test (Fast)" preset
2. Loads settings:
   - 5-minute tests
   - 20-second warmup
   - Adaptive grid (smart)
   - Result: Fast verification
```

### Use Case 5: Custom Quiet Mode
```
1. Select "Custom Configuration"
2. Manually set:
   - Voltage: 1100-1200mV (low)
   - Frequency: 400-500MHz (slow)
   - Max temp: 55°C (cool)
   - Max power: 25W (quiet)
   - Result: Silent operation
```

## Graph Interpretation

### Hashrate Graph
- **Stable line**: Good! Consistent performance
- **Spiky line**: Unstable, may need different settings
- **Dropping trend**: Thermal throttling or instability

### Temperature Graph
- **Blue line**: Chip temperature
- **Orange line**: VR (voltage regulator) temperature
- **Steady temps**: Good cooling
- **Rising temps**: Need better cooling or lower power

### Power Graph
- **Green line**: Power consumption (W)
- **Purple line**: Voltage (mV)
- **Correlates with hashrate**: Higher power = higher hashrate

## Tips for Live Monitoring

1. **Watch During Benchmarks**: See how each config performs
2. **Check Thermal Behavior**: Ensure temps stay stable
3. **Monitor VR Temp**: Often the limiting factor
4. **Power Tracking**: Verify you're within PSU limits
5. **Stability Testing**: Let it run, watch for variations

## Mobile Access

The web UI is **fully mobile-responsive**!

Access from your phone:
1. Find your server's IP (e.g., 192.168.1.50)
2. Open browser on phone
3. Go to: http://192.168.1.50:5000
4. Full functionality on mobile!

## Keyboard Shortcuts

- **Tab**: Navigate between fields
- **Enter**: Submit forms
- **Escape**: Close modals

## Browser Compatibility

Works on:
- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

## Performance Notes

- **Graphs update every 2 seconds** - Balance of responsiveness vs server load
- **Sessions refresh every 10 seconds** - Shows new benchmarks automatically
- **Device status**: Polls API efficiently
- **Lightweight**: Works great even on Raspberry Pi

## Troubleshooting

### Graphs Not Showing
- Make sure you're on the "Live Monitor" tab
- Select a device from dropdown
- Check device is online (ping the IP)

### Device Status Error
- Verify device IP is correct
- Check network connectivity
- Ensure Bitaxe firmware is up to date

### Benchmark Won't Start
- Select a device first
- Check all required fields are filled
- Look at browser console for errors (F12)

### Can't Add Device
- Check IP address format (e.g., 192.168.1.100)
- Ensure device name is unique
- Try different model selection

## Advanced Usage

### Monitor Multiple Devices
1. Open multiple browser tabs
2. Select different device in each tab's Live Monitor
3. Watch your entire fleet!

### Compare Profiles
1. Run benchmark with "Efficiency" preset
2. Note session ID
3. Run again with "Max Performance" preset
4. Use CLI to compare: `python3 bitaxe_benchmark_pro.py compare <id1> <id2>`

### Remote Monitoring While You Sleep
1. Start benchmark before bed
2. Check progress from your phone
3. See results in the morning!

### Custom Profile Creation
1. Use Custom Configuration
2. Adjust all settings to your liking
3. Save settings in browser (future feature)
4. Or take note of values for next time

## Security Notes

**Default:** Web UI listens on all interfaces (0.0.0.0:5000)

**For local-only access:**
Edit `web_interface.py`, line ~612:
```python
# Change from:
app.run(host='0.0.0.0', port=5000)

# To:
app.run(host='127.0.0.1', port=5000)
```

**For different port:**
```python
app.run(host='0.0.0.0', port=8080)  # Use port 8080
```

**Add password protection (future):**
Will be added in next version!

## Quick Reference

| Feature | Location | Purpose |
|---------|----------|---------|
| Add Device | Dashboard → Add Device button | Manage devices |
| Start Benchmark | Benchmark tab | Configure & run tests |
| Live Graphs | Live Monitor tab | Real-time performance |
| Past Results | Sessions tab | Historical data |
| Profiles | Benchmark → Preset dropdown | Load configurations |

## What's Coming Next

Planned features:
- 🔐 Password protection
- 💾 Save custom profiles
- 📧 Email/Telegram notifications
- 🔔 Alerts for high temps
- 📊 Historical trend graphs
- 🎯 Auto-optimization mode
- 🌙 Dark mode

## Summary

Your web UI now has:
- ✅ **Device management** - Add/remove via GUI
- ✅ **All CLI options** - Full control in browser
- ✅ **Live graphs** - Voltage, hashrate, temp, power
- ✅ **Profile loading** - All presets available
- ✅ **Real-time monitoring** - See performance live
- ✅ **Mobile-friendly** - Works on phones

**Everything you asked for is implemented and working!** 🎉

---

**Enjoy your new professional web interface!** 🌐

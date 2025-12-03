"""
AxeShed - Bitaxe Fleet Management & Scheduler
Companion app to AxeBench for automated profile scheduling
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import asyncio
import aiohttp
import json
import logging
from pathlib import Path
from datetime import datetime, time as dtime
from threading import Thread
import time
import sys
sys.path.insert(0, str(Path(__file__).parent))
from tier_restrictions import require_feature
from auth_decorator import require_patreon_auth
from licensing import get_licensing

logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
CORS(app)

# Shared config directory with AxeBench
config_dir = Path.home() / ".bitaxe-benchmark"
profiles_dir = config_dir / "profiles"
schedules_dir = config_dir / "schedules"

# Scheduler state
scheduler_running = False
scheduler_thread = None

# HTTP timeout
DEFAULT_TIMEOUT = aiohttp.ClientTimeout(total=10)


def load_devices():
    """Load devices from shared config"""
    devices_file = config_dir / "devices.json"
    if devices_file.exists():
        with open(devices_file, 'r') as f:
            return json.load(f)
    return []


def load_device_profiles(device_name):
    """Load profiles for a device"""
    profile_file = profiles_dir / f"{device_name}.json"
    if profile_file.exists():
        with open(profile_file, 'r') as f:
            return json.load(f)
    return None


def load_schedule(device_name):
    """Load schedule for a device"""
    schedules_dir.mkdir(parents=True, exist_ok=True)
    schedule_file = schedules_dir / f"{device_name}.json"
    if schedule_file.exists():
        with open(schedule_file, 'r') as f:
            return json.load(f)
    return None


def _normalize_time_blocks(blocks):
    """Ensure each block has start/end and sane fields (start-only supported)."""
    if not isinstance(blocks, list):
        return []

    # Sort by start time so we can derive missing end times
    def to_minutes(t):
        try:
            h, m = t.split(":")
            return int(h) * 60 + int(m)
        except Exception:
            return 0

    sorted_blocks = sorted(blocks, key=lambda b: to_minutes(b.get("start", "00:00")))
    normalized = []
    for idx, block in enumerate(sorted_blocks):
        start = block.get("start") or block.get("time") or "00:00"
        end = block.get("end")
        profile = block.get("profile") or block.get("default_profile") or block.get("defaultProfile") or block.get("name")
        days = block.get("days") or ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

        # derive end as next start or end-of-day
        if not end:
            if idx + 1 < len(sorted_blocks):
                end = sorted_blocks[idx + 1].get("start") or "23:59"
            else:
                end = "23:59"

        normalized.append({
            "start": start,
            "end": end,
            "profile": profile,
            "days": days,
        })
    return normalized


def save_schedule(device_name, schedule):
    """Save schedule for a device (accepts start-only blocks)."""
    schedules_dir.mkdir(parents=True, exist_ok=True)
    schedule_file = schedules_dir / f"{device_name}.json"
    if isinstance(schedule, dict):
        schedule = dict(schedule)
        schedule["time_blocks"] = _normalize_time_blocks(schedule.get("time_blocks", []))
    with open(schedule_file, 'w') as f:
        json.dump(schedule, f, indent=2)


async def apply_profile_to_device(ip_address, voltage, frequency, fan_target=None):
    """Apply voltage/frequency settings and optionally fan target to a device"""
    try:
        async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
            # Apply voltage and frequency
            payload = {"coreVoltage": voltage, "frequency": frequency}
            async with session.patch(f"http://{ip_address}/api/system", json=payload) as resp:
                if resp.status != 200:
                    return False
            
            # Apply fan target if specified
            if fan_target:
                fan_payload = {
                    "autofanspeed": 1,
                    "fanspeed": 100,
                    "targettemp": int(fan_target)
                }
                async with session.patch(f"http://{ip_address}/api/system", json=fan_payload) as resp:
                    if resp.status != 200:
                        logger.warning(f"Failed to set fan target on {ip_address}")
            
            return True
    except Exception as e:
        logger.error(f"Error applying profile to {ip_address}: {e}")
        return False


async def get_device_status(ip_address):
    """Get current device status"""
    try:
        async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
            async with session.get(f"http://{ip_address}/api/system/info") as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as e:
        logger.error(f"Error getting status from {ip_address}: {e}")
    return None


def get_active_profile_for_time(schedule, current_time):
    """Determine which profile should be active based on schedule and current time"""
    if not schedule:
        return None
    
    # If no time blocks, use default profile
    if 'time_blocks' not in schedule or not schedule['time_blocks']:
        return schedule.get('default_profile')
    
    current_minutes = current_time.hour * 60 + current_time.minute
    current_day = current_time.strftime('%A').lower()
    
    for block in schedule.get('time_blocks', []):
        # Check if this day applies
        days = block.get('days', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
        if current_day not in days:
            continue
        
        # Parse start/end times
        start_parts = block['start'].split(':')
        end_parts = block['end'].split(':')
        start_minutes = int(start_parts[0]) * 60 + int(start_parts[1])
        end_minutes = int(end_parts[0]) * 60 + int(end_parts[1])
        
        # Handle overnight schedules (e.g., 22:00 - 06:00)
        if end_minutes < start_minutes:
            if current_minutes >= start_minutes or current_minutes < end_minutes:
                return block['profile']
        else:
            if start_minutes <= current_minutes < end_minutes:
                return block['profile']
    
    # Return default if no match
    return schedule.get('default_profile')


def scheduler_loop():
    """Main scheduler loop - runs every minute"""
    global scheduler_running
    
    logger.info("Scheduler started")
    last_applied = {}  # Track what was last applied to avoid repeated calls
    
    while scheduler_running:
        try:
            devices = load_devices()
            current_time = datetime.now()
            
            for device in devices:
                device_name = device['name']
                ip_address = device['ip_address']
                
                # Load schedule
                schedule = load_schedule(device_name)
                if not schedule or not schedule.get('enabled', False):
                    continue
                
                # Get active profile
                profile_name = get_active_profile_for_time(schedule, current_time)
                if not profile_name:
                    continue
                
                # Check if already applied
                last_key = f"{device_name}:{profile_name}"
                if last_applied.get(device_name) == profile_name:
                    continue
                
                # Load profile data
                profiles = load_device_profiles(device_name)
                if not profiles or profile_name not in profiles.get('profiles', {}):
                    continue
                
                profile = profiles['profiles'][profile_name]
                if not profile:
                    continue
                
                # Apply profile
                fan_target = profile.get('fan_target')
                logger.info(f"Applying {profile_name} to {device_name}: {profile['voltage']}mV @ {profile['frequency']}MHz (fan: {fan_target}°C)")
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    success = loop.run_until_complete(
                        apply_profile_to_device(ip_address, profile['voltage'], profile['frequency'], fan_target)
                    )
                    if success:
                        last_applied[device_name] = profile_name
                        logger.info(f"Successfully applied {profile_name} to {device_name}")
                    else:
                        logger.error(f"Failed to apply {profile_name} to {device_name}")
                finally:
                    loop.close()
                
        except Exception as e:
            logger.error(f"Scheduler error: {e}")
        
        # Sleep for 1 minute
        time.sleep(60)
    
    logger.info("Scheduler stopped")


# API Routes
@app.route('/')
def index():
    """Serve the main page"""
    return get_dashboard_html()


@app.route('/api/license/status')
def license_status():
    """Get current license/patron status"""
    licensing = get_licensing()
    return jsonify(licensing.get_status())


@app.route('/api/license/logout', methods=['POST'])
def license_logout():
    """Clear saved license data"""
    licensing = get_licensing()
    licensing.logout()
    return jsonify({'success': True})


@app.route('/api/license/refresh', methods=['POST'])
def license_refresh():
    """Re-verify patron status"""
    licensing = get_licensing()
    success = licensing.verify_patron_status()
    return jsonify({
        'success': success,
        'status': licensing.get_status()
    })


@app.route('/api/devices')
@require_patreon_auth
@require_feature('axeshed')
def api_devices():
    """Get all devices with their profiles and schedules"""
    try:
        devices = load_devices() or []
        result = []
        
        for device in devices:
            if not device or not isinstance(device, dict):
                continue
                
            device_name = device.get('name', 'Unknown')
            ip_address = device.get('ip_address', '')
            
            profiles = load_device_profiles(device_name)
            if profiles is None:
                profiles = {}
            schedule = load_schedule(device_name)
            if schedule is None:
                schedule = {}
            
            # Get current status
            status = None
            if ip_address:
                try:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        status = loop.run_until_complete(get_device_status(ip_address))
                    finally:
                        loop.close()
                except Exception as e:
                    logger.error(f"Error getting device status: {e}")
                    status = None
            
            # Match current device settings to a profile
            active_profile = None
            profiles_dict = profiles.get('profiles') if isinstance(profiles, dict) else {}
            if profiles_dict is None:
                profiles_dict = {}
            
            if status and isinstance(status, dict) and profiles_dict:
                device_voltage = status.get('coreVoltage', 0) or 0
                device_frequency = status.get('frequency', 0) or 0
                
                for profile_name, profile_data in profiles_dict.items():
                    if not isinstance(profile_data, dict):
                        continue
                    profile_voltage = profile_data.get('voltage', 0) or 0
                    profile_frequency = profile_data.get('frequency', 0) or 0
                    
                    if (abs(device_voltage - profile_voltage) <= 5 and 
                        abs(device_frequency - profile_frequency) <= 5):
                        active_profile = profile_name
                        break
            
            result.append({
                'name': device_name,
                'ip': ip_address,
                'model': device.get('model', 'Unknown'),
                'has_profiles': bool(profiles_dict),
                'profiles': list(profiles_dict.keys()) if profiles_dict else [],
                'schedule_enabled': schedule.get('enabled', False) if isinstance(schedule, dict) else False,
                'active_profile': active_profile,
                'status': {
                    'hashrate': (status.get('hashRate', 0) or 0) if status and isinstance(status, dict) else 0,
                    'temp': (status.get('temp', 0) or 0) if status and isinstance(status, dict) else 0,
                    'voltage': (status.get('coreVoltage', 0) or 0) if status and isinstance(status, dict) else 0,
                    'frequency': (status.get('frequency', 0) or 0) if status and isinstance(status, dict) else 0,
                    'online': status is not None
                }
            })
        
        return jsonify(result)
    except Exception as e:
        import traceback
        logger.error(f"api_devices error: {e}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/devices/<device_name>/schedule', methods=['GET', 'POST'])
@require_patreon_auth
@require_feature('axeshed')
def api_device_schedule(device_name):
    """Get or set device schedule"""
    if request.method == 'POST':
        schedule = request.json
        save_schedule(device_name, schedule)
        
        # If schedule is enabled, immediately apply the correct profile
        if schedule.get('enabled'):
            from datetime import datetime
            current_time = datetime.now().time()
            profile_name = get_active_profile_for_time(schedule, current_time)
            
            if profile_name:
                # Load device and profile, apply immediately
                devices = load_devices()
                device = next((d for d in devices if d['name'] == device_name), None)
                profiles = load_device_profiles(device_name)
                
                if device and profiles and profile_name in profiles.get('profiles', {}):
                    profile = profiles['profiles'][profile_name]
                    fan_target = profile.get('fan_target')
                    
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        loop.run_until_complete(
                            apply_profile_to_device(device['ip_address'], profile['voltage'], profile['frequency'], fan_target)
                        )
                        logger.info(f"Immediately applied {profile_name} to {device_name} on schedule save")
                    except Exception as e:
                        logger.error(f"Failed to immediately apply profile: {e}")
                    finally:
                        loop.close()
        
        return jsonify({'status': 'saved'})
    
    schedule = load_schedule(device_name)
    if not schedule:
        # Return default schedule template
        schedule = {
            'device': device_name,
            'enabled': False,
            'default_profile': 'max',
            'time_blocks': []
        }
    return jsonify(schedule)


@app.route('/api/devices/<device_name>/profiles')
@require_patreon_auth
@require_feature('axeshed')
def api_device_profiles(device_name):
    """Get profiles for a device"""
    profiles = load_device_profiles(device_name)
    if profiles:
        return jsonify(profiles)
    return jsonify({'profiles': {}})


@app.route('/api/devices/<device_name>/apply/<profile_name>', methods=['POST'])
@require_patreon_auth
@require_feature('axeshed')
def api_apply_profile(device_name, profile_name):
    """Manually apply a profile to a device"""
    devices = load_devices()
    device = next((d for d in devices if d['name'] == device_name), None)
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    profiles = load_device_profiles(device_name)
    if not profiles or profile_name not in profiles.get('profiles', {}):
        return jsonify({'error': 'Profile not found'}), 404
    
    profile = profiles['profiles'][profile_name]
    if not profile:
        return jsonify({'error': 'Profile is empty'}), 400
    
    fan_target = profile.get('fan_target')
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        success = loop.run_until_complete(
            apply_profile_to_device(device['ip_address'], profile['voltage'], profile['frequency'], fan_target)
        )
    finally:
        loop.close()
    
    if success:
        # Store last applied profile
        schedule = load_schedule(device_name) or {'device': device_name}
        schedule['last_applied_profile'] = profile_name
        save_schedule(device_name, schedule)
        
        return jsonify({
            'status': 'applied',
            'profile': profile_name,
            'voltage': profile['voltage'],
            'frequency': profile['frequency'],
            'fan_target': fan_target
        })
    else:
        return jsonify({'error': 'Failed to apply profile'}), 500


@app.route('/api/profiles/<device_name>/custom', methods=['POST'])
@require_patreon_auth
@require_feature('axeshed')
def api_save_custom_profile(device_name):
    """Save current device settings as a custom profile"""
    devices = load_devices()
    device = next((d for d in devices if d['name'] == device_name), None)
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    # Fetch current device settings
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        import aiohttp
        
        async def get_current_settings():
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
                try:
                    async with session.get(f"http://{device['ip_address']}/api/system/info") as resp:
                        if resp.status != 200:
                            return None
                        data = await resp.json()
                        return {
                            'voltage': int(data.get('coreVoltage', 0)),
                            'frequency': int(data.get('frequency', 0)),
                            'fan_target': int(data.get('fanspeed', 0))
                        }
                except Exception as e:
                    logger.error(f"{device_name}: Error fetching settings: {e}")
                    return None
        
        settings = loop.run_until_complete(get_current_settings())
    finally:
        loop.close()
    
    if not settings:
        return jsonify({'error': 'Failed to fetch current device settings'}), 500
    
    # Generate profile name
    from datetime import datetime
    profile_name = f"Custom_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    # Load existing profiles
    profiles = load_device_profiles(device_name) or {'device': device_name, 'profiles': {}}
    
    # Add new profile
    profiles['profiles'][profile_name] = {
        'voltage': settings['voltage'],
        'frequency': settings['frequency'],
        'fan_target': settings['fan_target'],
        'description': f"Saved on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    }
    
    # Save profiles
    save_device_profiles(device_name, profiles)
    
    return jsonify({
        'status': 'saved',
        'profile_name': profile_name,
        'settings': settings
    })


@app.route('/api/scheduler/status')
@require_patreon_auth
@require_feature('axeshed')
def api_scheduler_status():
    """Get scheduler status"""
    return jsonify({
        'running': scheduler_running
    })


@app.route('/api/scheduler/start', methods=['POST'])
@require_patreon_auth
@require_feature('axeshed')
def api_scheduler_start():
    """Start the scheduler"""
    global scheduler_running, scheduler_thread
    
    if scheduler_running:
        return jsonify({'status': 'already_running'})
    
    scheduler_running = True
    scheduler_thread = Thread(target=scheduler_loop, daemon=True)
    scheduler_thread.start()
    
    return jsonify({'status': 'started'})


@app.route('/api/scheduler/stop', methods=['POST'])
@require_patreon_auth
@require_feature('axeshed')
def api_scheduler_stop():
    """Stop the scheduler"""
    global scheduler_running
    
    scheduler_running = False
    return jsonify({'status': 'stopped'})


def get_dashboard_html():
    """Generate the dashboard HTML"""
    return """
<!DOCTYPE html>
<html>
<head>
    <title>AxeShed - Fleet Manager</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a; 
            color: white; 
            padding: 10px;
            min-height: 100vh;
            font-size: 14px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #333;
            flex-wrap: wrap;
            gap: 10px;
        }
        h1 { color: #4caf50; font-size: 1.4em; }
        h2 { font-size: 1.1em; margin-bottom: 10px; }
        .nav-links {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        }
        .nav-link {
            padding: 8px 12px;
            border-radius: 6px;
            color: white;
            text-decoration: none;
            font-weight: bold;
            font-size: 0.85em;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .nav-link.bench { background: linear-gradient(135deg, #ff3333, #cc0000); }
        .nav-link.pool { background: linear-gradient(135deg, #9c27b0, #7b1fa2); }
        .card {
            background: #2d2d2d;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .card h2 { color: #4caf50; }
        .device-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 10px;
        }
        .device-card {
            background: #333;
            border-radius: 6px;
            padding: 12px;
        }
        .device-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .device-name { font-size: 1em; font-weight: bold; }
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }
        .status-dot.online { background: #4caf50; }
        .status-dot.offline { background: #ff3333; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
            margin-bottom: 10px;
        }
        .stat {
            background: #2d2d2d;
            padding: 6px;
            border-radius: 4px;
            text-align: center;
        }
        .stat-value { font-size: 1em; font-weight: bold; color: #ff3333; }
        .stat-label { font-size: 0.7em; color: #999; }
        .profile-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 10px;
        }
        .profile-btn {
            padding: 6px 10px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            color: white;
            font-size: 0.8em;
            min-height: 32px;
        }
        .profile-btn.quiet { background: #4caf50; }
        .profile-btn.efficient { background: #2196f3; }
        .profile-btn.max { background: #ff9800; }
        .profile-btn.nuclear { background: #ff3333; }
        .profile-btn.custom { background: #9c27b0; }
        .profile-btn:hover { opacity: 0.8; }
        .schedule-section {
            background: #2d2d2d;
            padding: 10px;
            border-radius: 4px;
            margin-top: 10px;
        }
        .schedule-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 0.9em;
        }
        .toggle-switch {
            position: relative;
            width: 44px;
            height: 24px;
        }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #555;
            border-radius: 24px;
            transition: 0.3s;
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            border-radius: 50%;
            transition: 0.3s;
        }
        input:checked + .toggle-slider { background-color: #4caf50; }
        input:checked + .toggle-slider:before { transform: translateX(20px); }
        .time-block {
            background: #333;
            padding: 8px;
            border-radius: 4px;
            margin-bottom: 8px;
        }
        .time-block-row {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .time-block input, .time-block select {
            padding: 6px;
            border-radius: 4px;
            border: 1px solid #555;
            background: #444;
            color: white;
            font-size: 14px;
        }
        .time-block input[type="time"] { width: 100px; }
        .time-block select { flex: 1; min-width: 80px; }
        .scheduler-status {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.85em;
        }
        .scheduler-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .pulse {
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            background: #4caf50;
            color: white;
            font-size: 0.85em;
            min-height: 36px;
            touch-action: manipulation;
        }
        button:hover { opacity: 0.9; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        button.secondary { background: #555; }
        button.danger { background: #d32f2f; }
        .btn-row {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        .btn-row button { flex: 1; min-width: 80px; }
        .modal {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.9);
            z-index: 1000;
            padding: 10px;
            overflow-y: auto;
        }
        .modal-content {
            background: #2d2d2d;
            border-radius: 8px;
            max-width: 450px;
            margin: 20px auto;
            padding: 15px;
            max-height: 90vh;
            overflow-y: auto;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #444;
        }
        .modal-header h3 { font-size: 1em; }
        .close-btn {
            background: none;
            border: none;
            color: #888;
            font-size: 1.5em;
            cursor: pointer;
            padding: 0;
            min-height: auto;
        }
        .active-profile-badge {
            background: #4caf50;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            text-align: center;
            font-size: 0.85em;
            margin-bottom: 8px;
        }
        .add-block-btn {
            background: #444;
            padding: 6px 12px;
            font-size: 0.85em;
        }
        .no-profiles {
            color: #999;
            font-style: italic;
            padding: 8px;
            font-size: 0.85em;
        }
        
        /* Mobile optimizations */
        @media (max-width: 600px) {
            body { padding: 8px; }
            .header { flex-direction: column; align-items: flex-start; }
            .nav-links { width: 100%; justify-content: space-between; }
            .device-grid { grid-template-columns: 1fr; }
            .stats-grid { grid-template-columns: repeat(4, 1fr); }
            .scheduler-status { font-size: 0.8em; }
            #scheduler-text { display: none; }
            .modal-content { margin: 10px; padding: 12px; }
        }
    </style>
</head>
<body>
    <!-- Nag Banner for non-patrons -->
    <div id="nag-banner" style="display: none; background: linear-gradient(135deg, #4caf50, #2e7d32); padding: 8px 12px; text-align: center; font-size: 0.9em;">
        <span style="color: white;">
            ⚡ <strong>Free tier (5 devices)</strong> — Support development!
            <button onclick="loginWithPatreon()" style="background: white; color: #4caf50; border: none; padding: 4px 12px; border-radius: 12px; margin-left: 8px; cursor: pointer; font-weight: bold; font-size: 0.85em;">❤️ Support</button>
            <button onclick="this.parentElement.parentElement.style.display='none'" style="background: transparent; border: none; color: rgba(255,255,255,0.8); cursor: pointer; margin-left: 8px; font-size: 1.1em;">✕</button>
        </span>
    </div>
    
    <div class="header">
        <h1>🏠 AxeShed</h1>
        <div class="nav-links">
            <div class="scheduler-status">
                <div class="scheduler-indicator">
                    <span class="status-dot" id="scheduler-dot"></span>
                    <span id="scheduler-text">Scheduler</span>
                </div>
                <button id="scheduler-btn" onclick="toggleScheduler()">Start</button>
            </div>
            <a onclick="window.location.href = 'http://' + window.location.hostname + ':5000'" class="nav-link bench" style="cursor: pointer;">⚡ AxeBench</a>
            <a onclick="window.location.href = 'http://' + window.location.hostname + ':5002'" class="nav-link pool" style="cursor: pointer;">🎱 AxePool</a>
        </div>
    </div>
    
    <div class="card">
        <h2>📱 Device Fleet</h2>
        <div id="devices" class="device-grid">
            <p style="color: #999;">Loading devices...</p>
        </div>
    </div>
    
    <!-- Schedule Editor Modal -->
    <div id="scheduleModal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1000; padding: 50px;">
        <div style="background: #2d2d2d; border-radius: 10px; max-width: 600px; margin: 0 auto; padding: 20px; max-height: 80vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <h2 id="modal-title">Schedule Editor</h2>
                <button onclick="closeScheduleModal()" class="secondary">✕</button>
            </div>
            
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="checkbox" id="schedule-enabled" style="width: 20px; height: 20px;">
                    <span style="color: #4caf50; font-weight: bold;">Enable Schedule</span>
                </label>
            </div>
            
            <div class="form-group" style="margin-bottom: 15px;">
                <label style="color: #aaa;">Default Profile (when no schedule matches):</label>
                <select id="default-profile" style="width: 100%; padding: 10px; background: #333; border: 1px solid #555; color: white; border-radius: 6px; margin-top: 5px;">
                </select>
            </div>
            
            <h3 style="margin-bottom: 10px; color: #4caf50;">Time Blocks</h3>
            <div id="time-blocks"></div>
            <button onclick="addTimeBlock()" class="add-block-btn" style="margin-bottom: 20px;">+ Add Time Block</button>
            
            <div style="display: flex; gap: 10px;">
                <button onclick="saveSchedule()" style="flex: 1;">💾 Save Schedule</button>
                <button onclick="closeScheduleModal()" class="secondary" style="flex: 1;">Cancel</button>
            </div>
        </div>
    </div>
    
    <script>
        let currentDevice = null;
        let currentSchedule = null;
        let currentProfiles = null;
        
        async function loginWithPatreon() {
            window.location.href = 'http://' + window.location.hostname + ':5000';
        }
        
        async function loadDevices() {
            try {
                const response = await fetch('/api/devices');
                
                const container = document.getElementById('devices');
                const nagBanner = document.getElementById('nag-banner');
                
                // Check license status for nag (not blocking)
                try {
                    const licenseResponse = await fetch('/api/license/status');
                    const licenseStatus = await licenseResponse.json();
                    if (!licenseStatus.is_patron) {
                        nagBanner.style.display = 'block';
                    }
                } catch (e) {
                    nagBanner.style.display = 'block';
                }
                
                const devices = await response.json();
                
                // Check if response is an error
                if (devices.error) {
                    container.innerHTML = `<p style="color: #ff6b6b;">Server error: ${devices.error}</p>`;
                    console.error('Server error:', devices.error);
                    return;
                }
                
                if (!Array.isArray(devices) || devices.length === 0) {
                    container.innerHTML = '<p style="color: #999;">No devices found. Add devices in AxeBench first.</p>';
                    return;
                }
                
                container.innerHTML = devices.map(device => {
                    // Determine active profile display
                    let profileDisplay = '';
                    if (device.active_profile) {
                        profileDisplay = `
                            <div class="active-profile-badge">
                                ▶ Active: <strong>${device.active_profile.toUpperCase()}</strong>
                            </div>`;
                    } else if (device.status.online && (device.status.voltage > 0 || device.status.frequency > 0)) {
                        profileDisplay = `
                            <div class="active-profile-badge" style="background: linear-gradient(135deg, #666, #444);">
                                ▶ Custom: <strong>${device.status.voltage}mV @ ${device.status.frequency}MHz</strong>
                            </div>`;
                    }
                    
                    return `
                    <div class="device-card">
                        <div class="device-header">
                            <span class="device-name">${device.name}</span>
                            <span class="status-dot ${device.status.online ? 'online' : 'offline'}"></span>
                        </div>
                        
                        <div class="stats-grid">
                            <div class="stat">
                                <div class="stat-value">${device.status.hashrate.toFixed(1)}</div>
                                <div class="stat-label">GH/s</div>
                            </div>
                            <div class="stat">
                                <div class="stat-value">${device.status.temp.toFixed(1)}°</div>
                                <div class="stat-label">ASIC Temp</div>
                            </div>
                            <div class="stat">
                                <div class="stat-value">${device.status.voltage}</div>
                                <div class="stat-label">mV</div>
                            </div>
                            <div class="stat">
                                <div class="stat-value">${device.status.frequency}</div>
                                <div class="stat-label">MHz</div>
                            </div>
                        </div>
                        
                        ${profileDisplay}
                        
                        ${device.has_profiles ? `
                            <div class="profile-buttons">
                                ${device.profiles.map(p => `
                                    <button class="profile-btn ${p}" onclick="applyProfile('${device.name}', '${p}')">${p.toUpperCase()}</button>
                                `).join('')}
                            </div>
                        ` : '<p class="no-profiles">No profiles yet</p>'}
                        
                        <div class="schedule-section">
                            <div class="schedule-header">
                                <span>⏰ Schedule</span>
                                <label class="toggle-switch">
                                    <input type="checkbox" ${device.schedule_enabled ? 'checked' : ''} 
                                           onchange="toggleDeviceSchedule('${device.name}', this.checked)"
                                           ${!device.has_profiles ? 'disabled' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                            <button onclick="editSchedule('${device.name}')" class="secondary" style="width: 100%;"
                                    ${!device.has_profiles ? 'disabled' : ''}>
                                Edit Schedule
                            </button>
                        </div>
                    </div>
                `}).join('');
                
            } catch (error) {
                console.error('Error loading devices:', error);
                const container = document.getElementById('devices');
                container.innerHTML = '<p style="color: #ff6b6b;">Error loading devices. Please try again.</p>';
            }
        }
        
        async function applyProfile(deviceName, profileName) {
            if (!confirm(`Apply ${profileName.toUpperCase()} profile to ${deviceName}?`)) return;
            
            try {
                const response = await fetch(`/api/devices/${deviceName}/apply/${profileName}`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    alert(`Applied: ${result.voltage}mV @ ${result.frequency}MHz`);
                    loadDevices();
                } else {
                    alert('Failed to apply profile');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error applying profile');
            }
        }
        
        async function toggleDeviceSchedule(deviceName, enabled) {
            try {
                const response = await fetch(`/api/devices/${deviceName}/schedule`);
                let schedule = await response.json();
                
                schedule.enabled = enabled;
                
                await fetch(`/api/devices/${deviceName}/schedule`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(schedule)
                });
                
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        async function editSchedule(deviceName) {
            currentDevice = deviceName;
            
            // Load profiles
            const profResponse = await fetch(`/api/devices/${deviceName}/profiles`);
            const profiles = await profResponse.json();
            currentProfiles = profiles.profiles || {};
            
            // Load existing schedule
            const schedResponse = await fetch(`/api/devices/${deviceName}/schedule`);
            currentSchedule = await schedResponse.json();
            
            // Populate default profile dropdown
            const defaultSelect = document.getElementById('default-profile');
            defaultSelect.innerHTML = Object.keys(currentProfiles)
                .filter(p => currentProfiles[p])
                .map(p => `<option value="${p}" ${currentSchedule.default_profile === p ? 'selected' : ''}>${p.toUpperCase()}</option>`)
                .join('');
            
            // Set enabled checkbox
            document.getElementById('schedule-enabled').checked = currentSchedule.enabled || false;
            
            // Populate time blocks
            renderTimeBlocks();
            
            document.getElementById('modal-title').textContent = `Schedule: ${deviceName}`;
            document.getElementById('scheduleModal').style.display = 'block';
        }
        
        function renderTimeBlocks() {
            const container = document.getElementById('time-blocks');
            const profileOptions = Object.keys(currentProfiles || {})
                .filter(p => currentProfiles[p])
                .map(p => `<option value="${p}">${p.toUpperCase()}</option>`)
                .join('');
            
            container.innerHTML = (currentSchedule.time_blocks || []).map((block, i) => `
                <div class="time-block">
                    <input type="time" value="${block.start}" onchange="updateBlock(${i}, 'start', this.value)">
                    <span>to</span>
                    <input type="time" value="${block.end}" onchange="updateBlock(${i}, 'end', this.value)">
                    <select onchange="updateBlock(${i}, 'profile', this.value)">
                        ${profileOptions.replace(`value="${block.profile}"`, `value="${block.profile}" selected`)}
                    </select>
                    <button onclick="removeBlock(${i})" class="danger" style="padding: 5px 10px;">✕</button>
                </div>
            `).join('');
        }
        
        function addTimeBlock() {
            if (!currentSchedule.time_blocks) currentSchedule.time_blocks = [];
            currentSchedule.time_blocks.push({
                start: '22:00',
                end: '06:00',
                profile: currentSchedule.default_profile || 'max'
            });
            renderTimeBlocks();
        }
        
        function updateBlock(index, field, value) {
            currentSchedule.time_blocks[index][field] = value;
        }
        
        function removeBlock(index) {
            currentSchedule.time_blocks.splice(index, 1);
            renderTimeBlocks();
        }
        
        async function saveSchedule() {
            currentSchedule.enabled = document.getElementById('schedule-enabled').checked;
            currentSchedule.default_profile = document.getElementById('default-profile').value;
            
            try {
                await fetch(`/api/devices/${currentDevice}/schedule`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(currentSchedule)
                });
                alert('Schedule saved!');
                closeScheduleModal();
                loadDevices();
            } catch (error) {
                console.error('Error:', error);
                alert('Error saving schedule');
            }
        }
        
        function closeScheduleModal() {
            document.getElementById('scheduleModal').style.display = 'none';
            currentDevice = null;
            currentSchedule = null;
            currentProfiles = null;
        }
        
        async function checkSchedulerStatus() {
            try {
                const response = await fetch('/api/scheduler/status');
                const status = await response.json();
                
                const dot = document.getElementById('scheduler-dot');
                const text = document.getElementById('scheduler-text');
                const btn = document.getElementById('scheduler-btn');
                
                if (status.running) {
                    dot.className = 'status-dot online pulse';
                    text.textContent = 'Scheduler: Running';
                    btn.textContent = 'Stop';
                    btn.className = 'danger';
                } else {
                    dot.className = 'status-dot offline';
                    text.textContent = 'Scheduler: Stopped';
                    btn.textContent = 'Start';
                    btn.className = '';
                }
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        async function toggleScheduler() {
            const response = await fetch('/api/scheduler/status');
            const status = await response.json();
            
            if (status.running) {
                await fetch('/api/scheduler/stop', { method: 'POST' });
            } else {
                await fetch('/api/scheduler/start', { method: 'POST' });
            }
            
            setTimeout(checkSchedulerStatus, 500);
        }
        
        // Initial load
        loadDevices();
        checkSchedulerStatus();
        
        // Auto-refresh
        setInterval(loadDevices, 10000);
        setInterval(checkSchedulerStatus, 5000);
    </script>

</body>
</html>
"""


def run_axeshed(host='0.0.0.0', port=5001):
    """Run AxeShed server"""
    print("""
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                   🏠 AxeShed v1.0 🏠                      ║
║                                                           ║
║          Bitaxe Fleet Management & Scheduler              ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   Web Interface: http://localhost:5001                    ║
║                                                           ║
║   Pairs with AxeBench for profile management              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
""")
    
    logging.basicConfig(level=logging.INFO)
    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == '__main__':
    run_axeshed()

"""
AxeBench - Bitaxe Performance Tuning Suite
Version: 3.0.0

Copyright (c) 2024-2025 AxeBench Contributors
Licensed under MIT License

This software is provided "as is" without warranty of any kind.
For support, visit: https://github.com/axebench/axebench

Features:
- Multi-device fleet management
- Automated V/F optimization with adaptive algorithms
- Profile scheduling (AxeShed)
- Pool management (AxePool)
- Real-time monitoring and logging
"""
from flask import Flask, render_template, jsonify, request, send_file, redirect, session, send_from_directory
from flask_cors import CORS
from presets import PRESETS, get_preset_by_id, DEFAULT_PRESET_ID
import secrets
import asyncio
import json
import logging
from pathlib import Path
from threading import Thread
from typing import Optional, Dict
from datetime import datetime
import time

__version__ = "2.1.0"

from config import BenchmarkConfig, SafetyLimits, PRESETS, get_device_profile
from device_manager import DeviceManager
from benchmark_engine import BenchmarkEngine
from licensing import get_licensing
from auth_decorator import require_patreon_auth
from tier_restrictions import TierRestrictions, require_feature

logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # Disable caching
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.secret_key = secrets.token_hex(32)  # Generate a random secret key for sessions
CORS(app)

# Global state
config_dir = Path.home() / ".bitaxe-benchmark"
sessions_dir = config_dir / "sessions"
device_manager = DeviceManager()
current_benchmark: Optional[Thread] = None
current_engine = None  # Reference to current benchmark engine
current_session_id: Optional[str] = None
benchmark_status = {
    'running': False,
    'progress': 0,
    'current_test': '',
    'tests_completed': 0,
    'tests_total': 0,
    'device': '',
    'phase': '',         # warmup, sampling, error, warning, complete
    'message': '',       # Current status message
    'message_queue': [], # Queue of messages for console
    'error': None,       # Error message if stopped due to error
    'warning': None,     # Warning message (non-fatal)
    'recovery_action': None,  # What recovery action was taken, if any
    'live_data': None,   # Current device readings
    'last_safe_settings': None,  # Last known good V/F for recovery
    'config': None,      # Last benchmark config used
    'safety_limits': None,  # Safety limits used for this run
}




config_dir = Path.home() / ".bitaxe-benchmark"
benchmark_state_file = config_dir / "benchmark_state.json"

def save_benchmark_state() -> None:
    """Persist benchmark_status to disk so the UI can restore after refresh/restart."""
    try:
        config_dir.mkdir(parents=True, exist_ok=True)
        # Use a shallow copy to avoid surprises, everything inside should be JSON-serialisable
        state = dict(benchmark_status)
        with open(benchmark_state_file, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, default=str)
    except Exception as e:
        logger.warning(f"Could not save benchmark state: {e}")

def load_benchmark_state() -> None:
    """Load benchmark_status from disk if present."""
    if not benchmark_state_file.exists():
        return
    try:
        with open(benchmark_state_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            benchmark_status.update(data)
            # Never report a running benchmark on fresh process start
            if benchmark_status.get("running") and "live_data" not in benchmark_status:
                benchmark_status["running"] = False
    except Exception as e:
        logger.warning(f"Could not load benchmark state: {e}")

# Attempt to load any previous state at startup
load_benchmark_state()

def load_devices():
    """Load device configurations"""
    devices_file = config_dir / "devices.json"
    if devices_file.exists():
        with open(devices_file, 'r') as f:
            devices_data = json.load(f)
        
        for dev_data in devices_data:
            device_manager.add_device(
                dev_data['name'],
                dev_data['ip_address'],
                dev_data.get('model', 'Unknown')
            )


# Legacy index route removed in favor of static file serving


@app.route('/api/version')
def get_version():
    """Check version"""
    return jsonify({
        'version': '2.0-enhanced',
        'has_tabs': True,
        'template_path': str(Path(__file__).parent / "templates" / "dashboard.html")
    })


# ============================================================================
# System Backup & Restore Routes
# ============================================================================

@app.route('/api/system/backup', methods=['GET'])
@require_patreon_auth
def system_backup():
    """Create a full system backup (devices, profiles, shared PSUs, pools, schedules)"""
    try:
        # Load all data components
        pools = []
        pools_file = config_dir / "pools.json"
        if pools_file.exists():
            with open(pools_file, 'r') as f:
                pools = json.load(f)

        schedules = []
        schedules_file = config_dir / "schedules.json"
        if schedules_file.exists():
            with open(schedules_file, 'r') as f:
                schedules = json.load(f)

        backup_data = {
            'timestamp': datetime.now().isoformat(),
            'version': __version__,
            'devices': load_devices_with_psu(),
            'shared_psus': load_shared_psus(),
            'pools': pools,
            'schedules': schedules,
            'profiles': {}
        }
        
        # Backup profiles for each device
        for device in backup_data['devices']:
            dev_name = device['name']
            profile_path = config_dir / f"profiles_{dev_name}.json"
            if profile_path.exists():
                with open(profile_path, 'r') as f:
                    backup_data['profiles'][dev_name] = json.load(f)
                    
        return jsonify(backup_data)
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/system/restore', methods=['POST'])
@require_patreon_auth
def system_restore():
    """Restore system configuration from backup"""
    try:
        data = request.json
        if not data or 'devices' not in data:
            return jsonify({'error': 'Invalid backup data'}), 400
            
        # Restore Devices & PSU Configs
        devices_file = config_dir / "devices.json"
        with open(devices_file, 'w') as f:
            json.dump(data['devices'], f, indent=2)
            
        # Reload Device Manager
        device_manager.clear()
        for dev in data['devices']:
            device_manager.add_device(dev['name'], dev['ip_address'], dev.get('model', 'Unknown'))
            
        # Restore Shared PSUs
        if 'shared_psus' in data:
            psu_file = config_dir / "shared_psus.json"
            with open(psu_file, 'w') as f:
                json.dump(data['shared_psus'], f, indent=2)

        # Restore Pools
        if 'pools' in data:
            pools_file = config_dir / "pools.json"
            with open(pools_file, 'w') as f:
                json.dump(data['pools'], f, indent=2)

        # Restore Schedules
        if 'schedules' in data:
            schedules_file = config_dir / "schedules.json"
            with open(schedules_file, 'w') as f:
                json.dump(data['schedules'], f, indent=2)
                
        # Restore Profiles
        if 'profiles' in data:
            for dev_name, profiles in data['profiles'].items():
                profile_path = config_dir / f"profiles_{dev_name}.json"
                with open(profile_path, 'w') as f:
                    json.dump(profiles, f, indent=2)
                    
        return jsonify({'success': True, 'message': 'System restored successfully'})
    except Exception as e:
        logger.error(f"Restore failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/device/backup', methods=['GET'])
@require_patreon_auth
def device_backup():
    """Create a backup for a single device (config + profiles)"""
    try:
        dev_name = request.args.get('name')
        if not dev_name:
            return jsonify({'error': 'Device name required'}), 400

        # Find device config
        devices = load_devices_with_psu()
        device_config = next((d for d in devices if d['name'] == dev_name), None)
        
        if not device_config:
            return jsonify({'error': 'Device not found'}), 404

        backup_data = {
            'timestamp': datetime.now().isoformat(),
            'type': 'device_backup',
            'device': device_config,
            'profiles': []
        }
        
        # Load profiles
        profile_path = config_dir / f"profiles_{dev_name}.json"
        if profile_path.exists():
            with open(profile_path, 'r') as f:
                backup_data['profiles'] = json.load(f)
                
        return jsonify(backup_data)
    except Exception as e:
        logger.error(f"Device backup failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/detect', methods=['POST'])
@require_patreon_auth
def detect_device():
    """Auto-detect device info from IP"""
    data = request.json
    ip = data.get('ip')
    if not ip:
        return jsonify({'error': 'IP address required'}), 400
        
    try:
        # Try to fetch system info from the device
        import requests
        resp = requests.get(f"http://{ip}/api/system/info", timeout=3)
        if resp.status_code == 200:
            info = resp.json()
            return jsonify({
                'model': info.get('model', 'Unknown'),
                'hostname': info.get('hostname', ''),
                'version': info.get('version', '')
            })
        else:
            return jsonify({'error': f'Device returned status {resp.status_code}'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/devices', methods=['POST'])
@require_patreon_auth
def add_device():
    try:
        data = request.json
        name = data.get('name')
        ip = data.get('ip')
        model = data.get('model', 'Bitaxe Ultra 1366')
        psu_config = data.get('psu')

        if not name or not ip:
            return jsonify({'error': 'Name and IP required'}), 400

        # Check license limits
        licensing_mgr = get_licensing()
        status = licensing_mgr.get_status()
        tier = status.get('tier', 'free')
        limit = TierRestrictions.get_device_limit(tier)
        
        current_devices = load_devices_with_psu()
        if len(current_devices) >= limit:
            return jsonify({'error': f'Device limit reached for {tier} tier'}), 403

        # Check for duplicate name
        if any(d['name'] == name for d in current_devices):
            return jsonify({'error': 'Device name already exists'}), 400

        new_device = {
            'name': name,
            'ip': ip,
            'model': model,
            'psu': psu_config or {'type': 'standalone', 'standalone_capacity': 20}
        }

        current_devices.append(new_device)
        save_devices_with_psu(current_devices)
        
        # Update device manager
        device_manager.set_device_configs(current_devices)
        device_manager.add_device(name, ip, model)

        return jsonify({'status': 'added', 'device': new_device})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/device/restore', methods=['POST'])
@require_patreon_auth
def restore_device():
    """Restore a single device configuration"""
    try:
        data = request.json
        if not data or 'device' not in data:
            return jsonify({'error': 'Invalid device backup data'}), 400
            
        restored_dev = data['device']
        dev_name = restored_dev['name']
        
        # Update devices.json
        devices = load_devices_with_psu()
        
        # Remove existing entry if present (to replace it)
        devices = [d for d in devices if d['name'] != dev_name]
        devices.append(restored_dev)
        
        devices_file = config_dir / "devices.json"
        with open(devices_file, 'w') as f:
            json.dump(devices, f, indent=2)
            
        # Update Device Manager
        # Check if device exists in manager, if so update, else add
        existing_dev = device_manager.get_device(dev_name)
        if existing_dev:
            existing_dev.ip_address = restored_dev['ip_address']
            existing_dev.model = restored_dev.get('model', 'Unknown')
        else:
            device_manager.add_device(dev_name, restored_dev['ip_address'], restored_dev.get('model', 'Unknown'))
            
        # Restore Profiles
        if 'profiles' in data:
            profile_path = config_dir / f"profiles_{dev_name}.json"
            with open(profile_path, 'w') as f:
                json.dump(data['profiles'], f, indent=2)
                
        return jsonify({'success': True, 'message': f'Device {dev_name} restored successfully'})
    except Exception as e:
        logger.error(f"Device restore failed: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================================================
# Licensing / Patreon OAuth Routes
# ============================================================================

@app.route('/api/auth/prepare', methods=['POST'])
def prepare_auth():
    """Prepare for Patreon auth by storing the origin host"""
    origin_host = request.host
    # Store in a file instead of session (more reliable across requests)
    auth_file = config_dir / 'auth_origin.txt'
    auth_file.write_text(origin_host)
    logger.info(f"Stored origin host: {origin_host}")
    return jsonify({'status': 'prepared', 'origin_host': origin_host})


@app.route('/api/license/status')
def license_status():
    """Get current license/patron status"""
    licensing = get_licensing()
    
    return jsonify(licensing.get_status())


@app.route('/auth/patreon/callback')
def patreon_callback():
    """Handle Patreon OAuth callback"""
    code = request.args.get('code')
    error = request.args.get('error')
    
    if error:
        logger.error(f"Patreon auth error: {error}")
        return redirect('/?auth_error=' + error)
    
    if not code:
        return redirect('/?auth_error=no_code')
    
    licensing = get_licensing()
    success = licensing.exchange_code(code)
    
    # Get the origin host from file
    auth_file = config_dir / 'auth_origin.txt'
    if auth_file.exists():
        origin_host = auth_file.read_text().strip()
        logger.info(f"Retrieved origin host from file: {origin_host}")
    else:
        origin_host = 'localhost:5000'
        logger.warning(f"No origin host file found, using default: {origin_host}")
    
    if success:
        logger.info("Patreon authentication successful")
        # Clear the auth file
        auth_file = config_dir / 'auth_origin.txt'
        auth_file.unlink(missing_ok=True)
        # Redirect back to the original hostname
        logger.info(f"Redirecting to: http://{origin_host}/?auth_success=1")
        return redirect(f'http://{origin_host}/?auth_success=1')
    else:
        logger.error(f"Auth failed, redirecting to: http://{origin_host}/?auth_error=verification_failed")
        return redirect(f'http://{origin_host}/?auth_error=verification_failed')


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


@app.route('/api/tier-info')
@require_patreon_auth
def get_tier_info():
    """Get current user's tier and available features"""
    return jsonify(TierRestrictions.get_tier_info())


@app.route('/api/devices', methods=['GET', 'POST'])
@require_patreon_auth
def devices():
    """Get list of devices or add new device - REQUIRES PATREON LOGIN"""
    if request.method == 'POST':
        # Check device limit
        licensing = get_licensing()
        status = licensing.get_status()
        device_limit = status.get('device_limit', 1)
        
        # Count current devices
        current_device_count = len(device_manager.list_devices())
        
        if current_device_count >= device_limit:
            return jsonify({
                'error': f'Device limit reached ({device_limit} devices)',
                'limit': device_limit,
                'current': current_device_count
            }), 403
        
        # Add new device
        data = request.json
        name = data.get('name')
        ip = data.get('ip')
        model = data.get('model', 'Unknown')
        psu_config = data.get('psu', {
            'type': 'standalone',
            'capacity_watts': 25,
            'safe_watts': 20,
            'warning_watts': 17.5
        })
        
        if not name or not ip:
            return jsonify({'error': 'Name and IP required'}), 400
        
        # Add to device manager
        device_manager.add_device(name, ip, model)
        
        # Ensure config directory exists
        config_dir.mkdir(parents=True, exist_ok=True)
        
        # Save to file with PSU config
        devices_file = config_dir / "devices.json"
        devices_data = load_devices_with_psu()
        
        # Update or add device with PSU config
        device_found = False
        for d in devices_data:
            if d.get('name') == name:
                d['ip_address'] = ip
                d['model'] = model
                d['psu'] = psu_config
                device_found = True
                break
        
        if not device_found:
            devices_data.append({
                'name': name,
                'ip_address': ip,
                'model': model,
                'psu': psu_config
            })
        
        with open(devices_file, 'w') as f:
            json.dump(devices_data, f, indent=2)
        
        return jsonify({'status': 'added', 'device': name})
    
    # GET - list devices with PSU info
    devices_data = load_devices_with_psu()
    devices = []
    for name in device_manager.list_devices():
        device = device_manager.get_device(name)
        if device:
            # Find PSU config for this device
            psu_config = None
            for d in devices_data:
                if d.get('name') == name:
                    psu_config = d.get('psu')
                    break
            
            devices.append({
                'name': device.name,
                'ip': device.ip_address,
                'model': device.model,
                'psu': psu_config or {'type': 'standalone', 'capacity_watts': 25, 'safe_watts': 20, 'warning_watts': 17.5}
            })
    return jsonify(devices)


def load_devices_with_psu():
    """Load devices with PSU config from file"""
    devices_file = config_dir / "devices.json"
    data = []
    if devices_file.exists():
        try:
            with open(devices_file, 'r') as f:
                data = json.load(f)
        except:
            data = []
    
    # Update device manager with configs
    device_manager.set_device_configs(data)
    return data


def save_devices_with_psu(devices):
    """Save devices with PSU config to file"""
    config_dir.mkdir(parents=True, exist_ok=True)
    devices_file = config_dir / "devices.json"
    with open(devices_file, 'w') as f:
        json.dump(devices, f, indent=2)


@app.route('/api/devices/<device_name>', methods=['DELETE'])
@require_patreon_auth
def remove_device(device_name):
    """Remove a device"""
    device_manager.remove_device(device_name)
    
    # Ensure config directory exists
    config_dir.mkdir(parents=True, exist_ok=True)
    
    # Load existing devices and remove the one being deleted
    devices_data = load_devices_with_psu()
    devices_data = [d for d in devices_data if d.get('name') != device_name]
    
    devices_file = config_dir / "devices.json"
    with open(devices_file, 'w') as f:
        json.dump(devices_data, f, indent=2)
    
    return jsonify({'status': 'removed', 'device': device_name})


@app.route('/api/devices/<device_name>', methods=['PUT'])
@require_patreon_auth
def update_device(device_name):
    """Update a device's settings"""
    data = request.json
    new_name = data.get('name', device_name)
    new_ip = data.get('ip')
    new_model = data.get('model')
    new_psu = data.get('psu')
    
    if not new_ip:
        return jsonify({'error': 'IP address required'}), 400
    
    # Ensure config directory exists
    config_dir.mkdir(parents=True, exist_ok=True)
    
    # Load existing devices
    devices_data = load_devices_with_psu()
    
    # Find and update the device
    device_found = False
    for d in devices_data:
        if d.get('name') == device_name:
            # Update device manager if name changed
            if new_name != device_name:
                device_manager.remove_device(device_name)
                device_manager.add_device(new_name, new_ip, new_model or d.get('model', 'unknown'))
            else:
                # Just update IP in device manager
                device = device_manager.get_device(device_name)
                if device:
                    device.ip_address = new_ip
                    device.base_url = f"http://{new_ip}"
                    if new_model:
                        device.model = new_model
            
            # Update stored data
            d['name'] = new_name
            d['ip_address'] = new_ip
            if new_model:
                d['model'] = new_model
            if new_psu:
                d['psu'] = new_psu
            
            device_found = True
            break
    
    if not device_found:
        return jsonify({'error': 'Device not found'}), 404
    
    # Save updated devices
    save_devices_with_psu(devices_data)
    
    # Update device manager with new configs
    device_manager.set_device_configs(devices_data)
    
    return jsonify({'status': 'updated', 'device': new_name})


# PSU Management Endpoints
psus_file = config_dir / "shared_psus.json"

def load_shared_psus():
    """Load shared PSUs from file"""
    data = []
    if psus_file.exists():
        try:
            with open(psus_file, 'r') as f:
                data = json.load(f)
        except:
            data = []
            
    # Update device manager with shared PSUs
    device_manager.set_shared_psus(data)
    return data

def save_shared_psus(psus):
    """Save shared PSUs to file"""
    config_dir.mkdir(parents=True, exist_ok=True)
    with open(psus_file, 'w') as f:
        json.dump(psus, f, indent=2)

@app.route('/api/psus', methods=['GET', 'POST'])
@require_patreon_auth
def manage_psus():
    """Get or create shared PSUs"""
    if request.method == 'POST':
        data = request.json
        name = data.get('name')
        capacity_watts = data.get('capacity_watts', 50)
        
        if not name:
            return jsonify({'error': 'Name required'}), 400
        
        psus = load_shared_psus()
        
        # Generate unique ID
        psu_id = f"psu_{len(psus) + 1}_{int(time.time())}"
        
        new_psu = {
            'id': psu_id,
            'name': name,
            'capacity_watts': capacity_watts,
            'safe_watts': data.get('safe_watts', int(capacity_watts * 0.8)),
            'warning_watts': data.get('warning_watts', int(capacity_watts * 0.7)),
            'created': datetime.now().isoformat()
        }
        
        psus.append(new_psu)
        save_shared_psus(psus)
        
        return jsonify({'status': 'created', 'psu': new_psu})
    
    # GET - list PSUs with device counts
    psus = load_shared_psus()
    devices_data = load_devices_with_psu()
    
    for psu in psus:
        # Count devices using this PSU
        device_count = sum(1 for d in devices_data if d.get('psu', {}).get('shared_psu_id') == psu['id'])
        psu['devices_count'] = device_count
        
        # Calculate current power usage (would need live data)
        psu['current_watts'] = 0  # TODO: Calculate from live device data
    
    return jsonify(psus)

@app.route('/api/psus/<psu_id>', methods=['DELETE'])
@require_patreon_auth  
def delete_psu(psu_id):
    """Delete a shared PSU"""
    psus = load_shared_psus()
    psus = [p for p in psus if p['id'] != psu_id]
    save_shared_psus(psus)
    return jsonify({'status': 'deleted', 'id': psu_id})


# Pool Management Endpoints
pools_file = config_dir / "pools.json"

def load_pools():
    """Load pools from file"""
    if pools_file.exists():
        try:
            with open(pools_file, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_pools(pools):
    """Save pools to file"""
    config_dir.mkdir(parents=True, exist_ok=True)
    with open(pools_file, 'w') as f:
        json.dump(pools, f, indent=2)

@app.route('/api/pools', methods=['GET', 'POST'])
@require_patreon_auth
def manage_pools():
    """Get or create pools"""
    if request.method == 'POST':
        data = request.json
        name = data.get('name')
        url = data.get('url')
        
        if not name or not url:
            return jsonify({'error': 'Name and URL required'}), 400
        
        pools = load_pools()
        
        # Generate unique ID
        pool_id = int(time.time() * 1000)
        
        new_pool = {
            'id': pool_id,
            'name': name,
            'url': url,
            'user': data.get('user', ''),
            'pass': data.get('pass', '')
        }
        
        pools.append(new_pool)
        save_pools(pools)
        
        return jsonify({'status': 'created', 'pool': new_pool})
    
    # GET
    return jsonify(load_pools())

@app.route('/api/pools/<int:pool_id>', methods=['DELETE'])
@require_patreon_auth
def delete_pool(pool_id):
    """Delete a pool"""
    pools = load_pools()
    pools = [p for p in pools if p['id'] != pool_id]
    save_pools(pools)
    return jsonify({'status': 'deleted', 'id': pool_id})


@app.route('/api/psus/<psu_id>', methods=['PUT'])
@require_patreon_auth
def update_psu(psu_id):
    """Update a shared PSU"""
    data = request.json
    psus = load_shared_psus()
    
    psu_found = False
    for psu in psus:
        if psu['id'] == psu_id:
            if 'name' in data:
                psu['name'] = data['name']
            if 'capacity_watts' in data:
                psu['capacity_watts'] = data['capacity_watts']
            if 'safe_watts' in data:
                psu['safe_watts'] = data['safe_watts']
            if 'warning_watts' in data:
                psu['warning_watts'] = data['warning_watts']
            psu['updated'] = datetime.now().isoformat()
            psu_found = True
            break
    
    if not psu_found:
        return jsonify({'error': 'PSU not found'}), 404
    
    save_shared_psus(psus)
    return jsonify({'status': 'updated', 'psu_id': psu_id})


@app.route('/api/psus/<psu_id>/devices')
@require_patreon_auth
def get_psu_devices(psu_id):
    """Get devices assigned to a shared PSU with live power data"""
    devices_data = load_devices_with_psu()
    psu_devices = []
    total_power = 0
    
    for d in devices_data:
        if d.get('psu', {}).get('shared_psu_id') == psu_id:
            device_name = d.get('name')
            device = device_manager.get_device(device_name)
            
            power = 0
            if device:
                # Get live power data
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    info = loop.run_until_complete(device.get_system_info())
                    if info:
                        power = info.power
                finally:
                    loop.close()
            
            psu_devices.append({
                'name': device_name,
                'power': power
            })
            total_power += power
    
    return jsonify({
        'psu_id': psu_id,
        'devices': psu_devices,
        'total_power': total_power
    })


@app.route('/api/models', methods=['GET'])
def get_models():
    """Get available device models and their configurations"""
    from config import MODEL_CONFIGS
    return jsonify(MODEL_CONFIGS)


@app.route('/api/devices/detect', methods=['POST'])
@require_patreon_auth
def detect_devices():
    """Auto-detect device info from IP"""
    data = request.json
    ip = data.get('ip')
    
    if not ip:
        return jsonify({'error': 'IP address required'}), 400
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        from device_manager import BitaxeDevice
        info = loop.run_until_complete(BitaxeDevice.detect_device_info(ip))
    except Exception as e:
        logger.error(f"Error detecting device: {e}")
        info = None
    finally:
        loop.close()
    
    if not info:
        return jsonify({'error': 'Could not connect to device'}), 404
    
    return jsonify(info)


@app.route('/api/devices/<device_name>/fan', methods=['POST'])
@require_patreon_auth
def set_fan_speed(device_name):
    """Set fan mode for a device"""
    device = device_manager.get_device(device_name)
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    data = request.json
    auto_fan = data.get('auto', True)
    target_temp = data.get('target_temp')
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        success = loop.run_until_complete(device.set_fan_mode(auto_fan, target_temp))
    except Exception as e:
        logger.error(f"Error setting fan mode: {e}")
        success = False
    finally:
        loop.close()
    
    if success:
        return jsonify({'status': 'ok', 'auto': auto_fan, 'target_temp': target_temp})
    else:
        return jsonify({'error': 'Failed to set fan mode'}), 500


# Profile management
profiles_dir = config_dir / "profiles"


@app.route('/api/profiles/<device_name>', methods=['GET'])
@require_patreon_auth
def get_profiles(device_name):
    """Get profiles for a device"""
    profiles_dir.mkdir(parents=True, exist_ok=True)
    profile_file = profiles_dir / f"{device_name}.json"
    
    if not profile_file.exists():
        return jsonify({'device': device_name, 'profiles': None, 'exists': False})
    
    with open(profile_file, 'r') as f:
        profiles = json.load(f)
    
    profiles['exists'] = True
    return jsonify(profiles)


@app.route('/api/profiles/<device_name>', methods=['POST'])
@require_patreon_auth
def save_profile(device_name):
    """Save profiles for a device"""
    profiles_dir.mkdir(parents=True, exist_ok=True)
    profile_file = profiles_dir / f"{device_name}.json"
    
    data = request.json
    overwrite = data.get('overwrite', False)
    
    # Check if profiles exist and user hasn't confirmed overwrite
    if profile_file.exists() and not overwrite:
        return jsonify({
            'status': 'confirm_overwrite',
            'message': 'Profiles already exist for this device. Set overwrite=true to replace.'
        }), 409
    
    profiles_data = {
        'device': device_name,
        'created': datetime.now().isoformat(),
        'benchmark_session': data.get('session_id'),
        'profiles': data.get('profiles', {})
    }
    
    with open(profile_file, 'w') as f:
        json.dump(profiles_data, f, indent=2)
    
    return jsonify({'status': 'saved', 'device': device_name})


@app.route('/api/profiles/<device_name>/apply/<profile_name>', methods=['POST'])
@require_patreon_auth
def apply_profile(device_name, profile_name):
    """Apply a profile to a device"""
    device = device_manager.get_device(device_name)
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    profile_file = profiles_dir / f"{device_name}.json"
    if not profile_file.exists():
        return jsonify({'error': 'No profiles found for device'}), 404
    
    with open(profile_file, 'r') as f:
        profiles_data = json.load(f)
    
    profiles = profiles_data.get('profiles', {})
    if profile_name not in profiles or profiles[profile_name] is None:
        return jsonify({'error': f'Profile {profile_name} not found'}), 404
    
    profile = profiles[profile_name]
    voltage = profile.get('voltage')
    frequency = profile.get('frequency')
    fan_target = profile.get('fan_target')
    
    if not voltage or not frequency:
        return jsonify({'error': 'Invalid profile data'}), 400
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Apply voltage and frequency
        success = loop.run_until_complete(device.set_voltage_frequency(voltage, frequency))
        
        # Apply fan target if specified
        fan_success = True
        if fan_target and success:
            fan_success = loop.run_until_complete(device.set_fan_mode(auto_fan=True, target_temp=fan_target))
            if not fan_success:
                logger.warning(f"Failed to set fan target for {device_name}, but V/F applied successfully")
    except Exception as e:
        logger.error(f"Error applying profile: {e}")
        success = False
    finally:
        loop.close()
    
    if success:
        return jsonify({
            'status': 'applied',
            'device': device_name,
            'profile': profile_name,
            'voltage': voltage,
            'frequency': frequency,
            'fan_target': fan_target,
            'fan_applied': fan_success if fan_target else None
        })
    else:
        return jsonify({'error': 'Failed to apply profile'}), 500


@app.route('/api/device/<device_name>/settings', methods=['POST'])
@require_patreon_auth
def apply_device_settings(device_name):
    """Apply voltage and frequency settings directly to a device"""
    device = device_manager.get_device(device_name)
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    voltage = data.get('coreVoltage') or data.get('voltage')
    frequency = data.get('frequency')
    
    if not voltage or not frequency:
        return jsonify({'error': 'Voltage and frequency required'}), 400
    
    try:
        voltage = int(voltage)
        frequency = int(frequency)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid voltage or frequency value'}), 400
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        success = loop.run_until_complete(device.set_voltage_frequency(voltage, frequency))
    except Exception as e:
        logger.error(f"Error applying settings: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        loop.close()
    
    if success:
        return jsonify({
            'status': 'applied',
            'device': device_name,
            'voltage': voltage,
            'frequency': frequency
        })
    else:
        return jsonify({'error': 'Failed to apply settings'}), 500


@app.route('/api/device/<device_name>/restart', methods=['POST'])
@require_patreon_auth
def restart_device_route(device_name):
    """Restart a device"""
    device = device_manager.get_device(device_name)
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        success = loop.run_until_complete(device.restart())
    except Exception as e:
        logger.error(f"Error restarting device: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        loop.close()
    
    if success:
        return jsonify({
            'status': 'restarting',
            'device': device_name
        })
    else:
        return jsonify({'error': 'Failed to restart device'}), 500


@app.route('/api/profiles/<device_name>/custom', methods=['POST'])
@require_patreon_auth
def save_custom_profile(device_name):
    """Save current device settings as custom profile"""
    device = device_manager.get_device(device_name)
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    profiles_dir.mkdir(parents=True, exist_ok=True)
    profile_file = profiles_dir / f"{device_name}.json"
    
    # Get current device settings
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        info = loop.run_until_complete(device.get_system_info())
    except Exception as e:
        logger.error(f"Error getting device info: {e}")
        info = None
    finally:
        loop.close()
    
    if not info:
        return jsonify({'error': 'Could not get device info'}), 500
    
    # Load existing profiles or create new
    if profile_file.exists():
        with open(profile_file, 'r') as f:
            profiles_data = json.load(f)
    else:
        profiles_data = {
            'device': device_name,
            'created': datetime.now().isoformat(),
            'profiles': {}
        }
    
    # Save custom profile
    profiles_data['profiles']['custom'] = {
        'voltage': info.voltage,
        'frequency': info.frequency,
        'expected_hashrate': info.hashrate,
        'expected_power': info.power,
        'expected_temp': info.temperature,
        'saved_at': datetime.now().isoformat()
    }
    profiles_data['updated'] = datetime.now().isoformat()
    
    with open(profile_file, 'w') as f:
        json.dump(profiles_data, f, indent=2)
    
    return jsonify({
        'status': 'saved',
        'profile': 'custom',
        'voltage': info.voltage,
        'frequency': info.frequency
    })


@app.route('/api/profiles/<device_name>/update', methods=['POST'])
@require_patreon_auth
def update_profile(device_name):
    """Update or create a profile for a device"""
    profiles_dir.mkdir(parents=True, exist_ok=True)
    profile_file = profiles_dir / f"{device_name}.json"
    
    data = request.json
    original_name = data.get('original_name', '')  # Empty if creating new
    new_name = data.get('new_name', '').lower().strip()
    profile_data = data.get('profile', {})
    
    if not new_name:
        return jsonify({'error': 'Profile name is required'}), 400
    
    # Load existing profiles or create new
    if profile_file.exists():
        with open(profile_file, 'r') as f:
            profiles_data = json.load(f)
    else:
        profiles_data = {
            'device': device_name,
            'created': datetime.now().isoformat(),
            'profiles': {}
        }
    
    # If renaming, check if new name already exists (unless it's the same)
    if original_name and original_name != new_name and new_name in profiles_data.get('profiles', {}):
        return jsonify({'error': f'Profile "{new_name}" already exists'}), 409
    
    # If renaming, delete the old name
    if original_name and original_name != new_name and original_name in profiles_data.get('profiles', {}):
        del profiles_data['profiles'][original_name]
    
    # Save the profile - preserve all fields sent from frontend
    profiles_data['profiles'][new_name] = {
        # Basic settings
        'voltage': profile_data.get('voltage', 1200),
        'frequency': profile_data.get('frequency', 500),
        'fan_target': profile_data.get('fan_target', 65),
        
        # PSU config
        'stock_psu_watts': profile_data.get('stock_psu_watts', 25),
        'safe_power_stock_psu': profile_data.get('safe_power_stock_psu', 22),
        'psu_upgraded': profile_data.get('psu_upgraded', False),
        
        # Benchmark config
        'max_chip_temp': profile_data.get('max_chip_temp', 65),
        'max_vr_temp': profile_data.get('max_vr_temp', 85),
        'max_power': profile_data.get('max_power', 25),
        'test_duration': profile_data.get('test_duration', 120),
        'warmup_time': profile_data.get('warmup_time', 10),
        
        # Results
        'expected_hashrate': profile_data.get('expected_hashrate'),
        'expected_power': profile_data.get('expected_power'),
        'efficiency': profile_data.get('efficiency'),
        'stability_score': profile_data.get('stability_score'),
        'avg_fan_speed': profile_data.get('avg_fan_speed'),
        'avg_chip_temp': profile_data.get('avg_chip_temp'),
        'avg_vr_temp': profile_data.get('avg_vr_temp'),
        
        # Metadata
        'notes': profile_data.get('notes', ''),
        'source_session_id': profile_data.get('source_session_id'),
        'tested_at': profile_data.get('tested_at'),
        'updated_at': datetime.now().isoformat()
    }
    profiles_data['updated'] = datetime.now().isoformat()
    
    with open(profile_file, 'w') as f:
        json.dump(profiles_data, f, indent=2)
    
    return jsonify({
        'status': 'saved',
        'profile': new_name,
        'device': device_name
    })


@app.route('/api/profiles/<device_name>/delete/<profile_name>', methods=['DELETE'])
@require_patreon_auth
def delete_profile(device_name, profile_name):
    """Delete a profile from a device"""
    profile_file = profiles_dir / f"{device_name}.json"
    
    if not profile_file.exists():
        return jsonify({'error': 'No profiles found for device'}), 404
    
    with open(profile_file, 'r') as f:
        profiles_data = json.load(f)
    
    if profile_name not in profiles_data.get('profiles', {}):
        return jsonify({'error': f'Profile "{profile_name}" not found'}), 404
    
    del profiles_data['profiles'][profile_name]
    profiles_data['updated'] = datetime.now().isoformat()
    
    with open(profile_file, 'w') as f:
        json.dump(profiles_data, f, indent=2)
    
    return jsonify({
        'status': 'deleted',
        'profile': profile_name,
        'device': device_name
    })


@app.route('/api/profiles')
@require_patreon_auth
def get_all_profiles():
    """List all devices with profiles"""
    profiles_dir.mkdir(parents=True, exist_ok=True)
    
    all_profiles = []
    for profile_file in profiles_dir.glob("*.json"):
        try:
            with open(profile_file, 'r') as f:
                data = json.load(f)
            all_profiles.append({
                'device': data.get('device', profile_file.stem),
                'created': data.get('created'),
                'profiles': list(data.get('profiles', {}).keys())
            })
        except Exception as e:
            logger.error(f"Error loading profile {profile_file}: {e}")
    
    return jsonify(all_profiles)



@app.route('/api/devices/<device_name>/status')
@require_patreon_auth
def get_device_status(device_name):
    """Get current device status"""
    device = device_manager.get_device(device_name)
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Create a fresh session for this request - safe to run alongside benchmark
        import aiohttp
        
        async def get_info():
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
                try:
                    async with session.get(f"http://{device.ip_address}/api/system/info") as resp:
                        if resp.status != 200:
                            return None
                        data = await resp.json()
                        return {
                            'hashrate': float(data.get('hashRate', 0)),
                            'temperature': float(data.get('temp', 0)),
                            'vr_temp': float(data.get('vrTemp', 0)) if 'vrTemp' in data else 0,
                            'power': float(data.get('power', 0)),
                            'voltage': int(data.get('coreVoltage', 0)),
                            'frequency': int(data.get('frequency', 0)),
                            'input_voltage': float(data.get('voltage', 0)),
                            'fan_speed': float(data.get('fanspeed', 0)),
                            'error_percentage': float(data.get('errorPercentage', 0)),
                            'best_diff': str(data.get('bestDiff', '0')),
                            'best_session_diff': str(data.get('bestSessionDiff', '0')),
                            'stratum_diff': float(data.get('poolDifficulty') or data.get('stratumDiff') or 0)
                        }
                except Exception as e:
                    logger.error(f"{device_name}: Error in get_info: {e}")
                    return None
        
        info = loop.run_until_complete(get_info())
    except Exception as e:
        logger.error(f"{device_name}: Error getting system info: {e}")
        info = None
    finally:
        loop.close()
    
    if not info:
        return jsonify({'error': 'Failed to get device info'}), 500
    
    return jsonify(info)


@app.route('/api/presets')
@require_patreon_auth
def get_presets():
    """Get available presets"""
    presets = {}
    for name, config in PRESETS.items():
        presets[name] = {
            'strategy': config.strategy.value,
            'goal': config.optimization_goal.value,
            'duration': config.benchmark_duration,
            'voltage_range': f"{config.voltage_start}-{config.voltage_stop}mV",
            'frequency_range': f"{config.frequency_start}-{config.frequency_stop}MHz"
        }
    return jsonify(presets)


@app.route('/api/device-profile/<device_model>')
@require_patreon_auth
def get_device_profile_route(device_model):
    """Get complete device specifications for a model"""
    profile = get_device_profile(device_model)
    return jsonify({
        'model': device_model,
        'name': profile.get('name', device_model.upper()),
        'chip': profile.get('chip', 'Unknown'),
        'chip_count': profile.get('chip_count', 1),
        # Voltage
        'min_voltage': profile.get('min_voltage', 1100),
        'max_voltage': profile.get('max_voltage', 1350),
        'stock_voltage': profile.get('stock_voltage', 1200),
        'safe_max_voltage': profile.get('safe_max_voltage'),
        'recommended_voltage_range': profile.get('recommended_voltage_range', (1150, 1300)),
        # Frequency
        'min_frequency': profile.get('min_frequency', 300),
        'max_frequency': profile.get('max_frequency', 650),
        'stock_frequency': profile.get('stock_frequency', 500),
        'safe_max_frequency': profile.get('safe_max_frequency'),
        # Temperature
        'max_chip_temp': profile.get('max_chip_temp', 70.0),
        'max_vr_temp': profile.get('max_vr_temp', 85.0),
        'stock_max_chip_temp': profile.get('stock_max_chip_temp', 65.0),
        'stock_max_vr_temp': profile.get('stock_max_vr_temp', 80.0),
        # Power & PSU
        'typical_power': profile.get('typical_power', 15.0),
        'max_power': profile.get('max_power', 20.0),
        'stock_power': profile.get('stock_power', 13.0),
        'stock_psu_watts': profile.get('stock_psu_watts', 25),
        'safe_power_stock_psu': profile.get('safe_power_stock_psu', 20),
        # Performance
        'typical_hashrate': profile.get('typical_hashrate', 700),
        'stock_hashrate': profile.get('stock_hashrate', 600),
    })


@app.route('/api/benchmark/start', methods=['POST'])
@require_patreon_auth
def start_benchmark():
    """Start a benchmark"""
    global current_benchmark, current_session_id, benchmark_status
    
    if benchmark_status['running']:
        return jsonify({'error': 'Benchmark already running'}), 400
    
    data = request.json
    device_name = data.get('device')
    preset = data.get('preset')
    run_mode = data.get('mode', 'benchmark')
    
    if not device_name:
        return jsonify({'error': 'Device name required'}), 400
    
    # Get configuration
    if preset and preset in PRESETS:
        config = PRESETS[preset]
    else:
        preset = get_preset_by_id(DEFAULT_PRESET_ID)
    config = BenchmarkConfig()
    if preset:
        for k, v in preset['config'].items():
            setattr(config, k, v)
    
    # Apply custom settings from form
    if data.get('voltage_start'):
        config.voltage_start = int(data['voltage_start'])
    if data.get('voltage_stop'):
        config.voltage_stop = int(data['voltage_stop'])
    if data.get('voltage_step'):
        config.voltage_step = int(data['voltage_step'])
    if data.get('frequency_start'):
        config.frequency_start = int(data['frequency_start'])
    if data.get('frequency_stop'):
        config.frequency_stop = int(data['frequency_stop'])
    if data.get('frequency_step'):
        config.frequency_step = int(data['frequency_step'])
    if data.get('duration'):
        config.benchmark_duration = int(data['duration'])
    if data.get('warmup'):
        config.warmup_time = int(data['warmup'])
    if data.get('cooldown'):
        config.cooldown_time = int(data['cooldown'])
    if data.get('cycles_per_test'):
        config.cycles_per_test = int(data['cycles_per_test'])
    if data.get('strategy'):
        from config import SearchStrategy
        config.strategy = SearchStrategy(data['strategy'])
    # goal already resolved via resolve_optimization_mode above
    if 'restart' in data:
        config.restart_between_tests = bool(data['restart'])
    if 'enable_plotting' in data:
        config.enable_plotting = bool(data['enable_plotting'])
    if 'export_csv' in data:
        config.export_csv = bool(data['export_csv'])
    if data.get('target_error'):
        config.target_error = float(data['target_error'])
    
    safety = SafetyLimits()
    
    # Apply safety limits from form
    if data.get('max_temp'):
        safety.max_chip_temp = float(data['max_temp'])
    if data.get('max_power'):
        safety.max_power = float(data['max_power'])
    if data.get('max_vr_temp'):
        safety.max_vr_temp = float(data['max_vr_temp'])
    # Persist safety limits into benchmark_status for UI restore
    benchmark_status['safety_limits'] = {
        'max_chip_temp': safety.max_chip_temp,
        'max_vr_temp': safety.max_vr_temp,
        'max_power': safety.max_power,
    }
    benchmark_status['mode'] = run_mode
    save_benchmark_state()

    
    # Recovery settings from request
    auto_recovery = data.get('auto_recovery', True)
    recovery_strategy = data.get('recovery_strategy', 'conservative')
    max_retries = data.get('recovery_max_retries', 2)
    cooldown_time = data.get('recovery_cooldown', 10)

    # Persist full config into benchmark_status for UI restore
    try:
        from config import BenchmarkConfig as _BenchmarkConfig, OptimizationGoal as _OptimizationGoal, SearchStrategy as _SearchStrategy
        ui_config = {
            'device': device_name,
            'preset': preset,
            'mode': run_mode,
            'voltage_start': config.voltage_start,
            'voltage_stop': config.voltage_stop,
            'voltage_step': config.voltage_step,
            'frequency_start': config.frequency_start,
            'frequency_stop': config.frequency_stop,
            'frequency_step': config.frequency_step,
            'duration': config.benchmark_duration,
            'warmup': config.warmup_time,
            'cooldown': config.cooldown_time,
            'target_error': config.target_error,
            'cycles_per_test': config.cycles_per_test,
            'strategy': getattr(config.strategy, 'value', str(config.strategy)),
            'goal': data.get('goal') or getattr(getattr(config, 'optimization_goal', None), 'value', 'balanced'),
            'max_temp': safety.max_chip_temp,
            'max_vr_temp': safety.max_vr_temp,
            'max_power': safety.max_power,
            'restart': config.restart_between_tests,
            'enable_plotting': config.enable_plotting,
            'export_csv': config.export_csv,
            'auto_mode': getattr(config, 'auto_mode', False),
            'auto_recovery': bool(auto_recovery),
            'recovery_strategy': recovery_strategy,
            'recovery_max_retries': max_retries,
            'recovery_cooldown': cooldown_time,
            'expected_hashrate': data.get('expected_hashrate'),
        }
        benchmark_status['config'] = ui_config
        save_benchmark_state()
    except Exception as e:
        logger.warning(f"Could not persist benchmark config for UI restore: {e}")

    # Track failed combinations across retries
    failed_combos = []  # List of {'voltage': v, 'frequency': f, 'reason': str}
    
    # Run benchmark in background thread with recovery
    def run_async_benchmark():
        global current_session_id, benchmark_status, current_engine
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        retry_count = 0
        accumulated_results = []
        current_config = config  # May be modified on retries
        
        while retry_count <= max_retries:
            try:
                # Reset status for this attempt
                benchmark_status['running'] = True
                benchmark_status['device'] = device_name
                benchmark_status['mode'] = run_mode
                benchmark_status['session_logs'] = []
                save_benchmark_state()
                benchmark_status['error'] = None
                benchmark_status['warning'] = None
                benchmark_status['phase'] = 'initializing'
                benchmark_status['failed_combos'] = failed_combos
                
                if retry_count > 0:
                    benchmark_status['message'] = f'Recovery attempt {retry_count}/{max_retries}...'
                    benchmark_status['recovery_action'] = f'Retrying with adjusted settings (attempt {retry_count})'
                else:
                    benchmark_status['message'] = 'Initializing device...'
                
                # Fine tune mode settings
                fine_tune_mode = data.get('fine_tune_mode', False)
                expected_hashrate = data.get('expected_hashrate')
                
                # Initialize
                loop.run_until_complete(device_manager.initialize_all())
                
                # Status callback with failure detection
                def update_status(status_dict):
                    global benchmark_status
                    benchmark_status.update(status_dict)
                    save_benchmark_state()
                    
                    # Queue messages for console display
                    if status_dict.get('message'):
                        benchmark_status['message_queue'].append({
                            'phase': status_dict.get('phase', 'info'),
                            'message': status_dict['message']
                        })
                        # Also keep an in-memory session log stream for UI consumption
                        log_entry = {
                            'time': datetime.now().isoformat(),
                            'message': status_dict['message'],
                            'type': status_dict.get('phase', 'info')
                        }
                        benchmark_status.setdefault('session_logs', []).append(log_entry)
                        # Also log to server-side session
                        if current_engine and current_engine.session:
                            log_type = status_dict.get('phase', 'info')
                            if log_type in ['error', 'warning', 'recovery', 'success', 'test_complete', 'strategy']:
                                current_engine.log_event(status_dict['message'], log_type)
                            elif 'LIMIT' in status_dict['message'] or 'ABORT' in status_dict['message'] or 'Best result' in status_dict['message']:
                                current_engine.log_event(status_dict['message'], 'warning' if 'LIMIT' in status_dict['message'] or 'ABORT' in status_dict['message'] else 'success')
                    
                    # Track last safe settings for potential recovery
                    if status_dict.get('phase') == 'sampling' and status_dict.get('live_data'):
                        ld = status_dict['live_data']
                        if ld.get('voltage') and ld.get('frequency'):
                            benchmark_status['last_safe_settings'] = {
                                'voltage': ld['voltage'],
                                'frequency': ld['frequency']
                            }
                
                engine = BenchmarkEngine(current_config, safety, device_manager, sessions_dir, status_callback=update_status)
                
                # Set expected hashrate for fine tune mode
                if fine_tune_mode and expected_hashrate:
                    engine._expected_hashrate = expected_hashrate
                    logger.info(f"Fine tune mode: expecting ~{expected_hashrate:.1f} GH/s")
                
                current_engine = engine
                session = loop.run_until_complete(engine.run_benchmark(device_name))
                
                # Success! Accumulate results and finish
                if hasattr(session, 'results'):
                    accumulated_results.extend(session.results)
                
                current_session_id = session.session_id
                current_engine = None
                
                # Mark successful completion
                benchmark_status['phase'] = 'complete'
                benchmark_status['message'] = f'Benchmark completed successfully ({len(failed_combos)} combos skipped due to failures)'
                benchmark_status['failed_combos'] = failed_combos
                break  # Exit retry loop on success
                
            except asyncio.CancelledError:
                logger.info("Benchmark was cancelled")
                benchmark_status['error'] = 'Benchmark was cancelled'
                benchmark_status['phase'] = 'cancelled'
                break  # Don't retry on cancel
                
            except Exception as e:
                error_msg = str(e)
                logger.error(f"Benchmark error (attempt {retry_count + 1}): {e}", exc_info=True)
                
                # Get the settings that failed
                last_settings = benchmark_status.get('last_safe_settings') or {}
                failed_voltage = last_settings.get('voltage') or current_config.voltage_start
                failed_frequency = last_settings.get('frequency') or current_config.frequency_start
                
                # Parse error type
                error_type = 'unknown'
                if 'temperature' in error_msg.lower() or 'temp' in error_msg.lower():
                    error_type = 'temperature'
                elif 'power' in error_msg.lower():
                    error_type = 'power'
                elif 'hashrate' in error_msg.lower() or 'unstable' in error_msg.lower():
                    error_type = 'hashrate'
                elif 'timeout' in error_msg.lower() or 'connection' in error_msg.lower():
                    error_type = 'connection'
                
                # Record the failed combo
                if failed_voltage and failed_frequency:
                    failed_combos.append({
                        'voltage': failed_voltage,
                        'frequency': failed_frequency,
                        'reason': error_type,
                        'message': error_msg[:100]
                    })
                    logger.info(f"Recorded failed combo: {failed_voltage}mV @ {failed_frequency}MHz ({error_type})")
                
                # Check if we should try recovery
                if not auto_recovery:
                    benchmark_status['error'] = f'Benchmark stopped (auto-recovery disabled): {error_msg}'
                    benchmark_status['phase'] = 'error'
                    break
                
                if retry_count >= max_retries:
                    benchmark_status['error'] = f'Max retries ({max_retries}) exceeded. Last error: {error_msg}'
                    benchmark_status['phase'] = 'error'
                    benchmark_status['failed_combos'] = failed_combos
                    break
                
                # Connection errors are usually not recoverable by changing V/F
                if error_type == 'connection':
                    benchmark_status['error'] = f'Connection lost - cannot recover by adjusting V/F: {error_msg}'
                    benchmark_status['phase'] = 'error'
                    break
                
                # Detect position in range
                at_voltage_min = (failed_voltage <= current_config.voltage_start + current_config.voltage_step)
                at_voltage_max = (failed_voltage >= current_config.voltage_stop - current_config.voltage_step)
                at_freq_min = (failed_frequency <= current_config.frequency_start + current_config.frequency_step)
                at_freq_max = (failed_frequency >= current_config.frequency_stop - current_config.frequency_step)
                
                retry_count += 1
                benchmark_status['phase'] = 'recovery'
                benchmark_status['message'] = f'⚠️ Failed at {failed_voltage}mV/{failed_frequency}MHz ({error_type}). Cooling down {cooldown_time}s...'
                
                logger.info(f"Recovery: Position - V_min:{at_voltage_min} V_max:{at_voltage_max} F_min:{at_freq_min} F_max:{at_freq_max}")
                
                # Cooldown period
                import time as time_module
                time_module.sleep(cooldown_time)
                
                # Smart recovery based on error type and position
                recovery_applied = False
                recovery_msg = ""
                
                if error_type == 'hashrate':
                    # Hashrate drop = ASIC can't handle frequency at this voltage
                    # Solution: Try MORE voltage (if available) or LESS frequency
                    
                    if not at_voltage_max:
                        # Skip low voltage combos - increase voltage_start past the failure
                        new_voltage_start = failed_voltage + current_config.voltage_step
                        if new_voltage_start <= current_config.voltage_stop:
                            current_config.voltage_start = new_voltage_start
                            recovery_msg = f"Hashrate unstable at {failed_voltage}mV - skipping to {new_voltage_start}mV+ (more voltage may stabilize)"
                            recovery_applied = True
                    
                    if not recovery_applied and not at_freq_min:
                        # Can't increase voltage - reduce frequency instead
                        new_freq_stop = failed_frequency - current_config.frequency_step
                        if new_freq_stop >= current_config.frequency_start:
                            current_config.frequency_stop = new_freq_stop
                            # Reset voltage to original range
                            current_config.voltage_start = config.voltage_start
                            recovery_msg = f"Hashrate unstable - reducing max frequency to {new_freq_stop}MHz"
                            recovery_applied = True
                
                elif error_type in ['temperature', 'power']:
                    # Temp/power issues = too much heat from this combo
                    # Solution: Skip this combo and higher - reduce stops OR increase starts
                    
                    if not at_voltage_min:
                        # Reduce voltage stop to avoid high-heat combos
                        new_voltage_stop = failed_voltage - current_config.voltage_step
                        if new_voltage_stop >= current_config.voltage_start:
                            current_config.voltage_stop = new_voltage_stop
                            recovery_msg = f"Thermal limit at {failed_voltage}mV - reducing max voltage to {new_voltage_stop}mV"
                            recovery_applied = True
                    
                    if not recovery_applied and not at_freq_min:
                        # Reduce frequency stop
                        new_freq_stop = failed_frequency - current_config.frequency_step
                        if new_freq_stop >= current_config.frequency_start:
                            current_config.frequency_stop = new_freq_stop
                            current_config.voltage_stop = config.voltage_stop  # Reset voltage
                            recovery_msg = f"Thermal limit - reducing max frequency to {new_freq_stop}MHz"
                            recovery_applied = True
                    
                    if not recovery_applied and at_voltage_min and at_freq_min:
                        # Failed at minimum settings - can't recover
                        benchmark_status['error'] = f'⚠️ Failed at minimum settings ({failed_voltage}mV/{failed_frequency}MHz). Your base profile may be too aggressive for these thermal limits.'
                        benchmark_status['phase'] = 'error'
                        break
                
                else:
                    # Unknown error - try conservative reduction
                    if not at_freq_min:
                        new_freq_stop = failed_frequency - current_config.frequency_step
                        if new_freq_stop >= current_config.frequency_start:
                            current_config.frequency_stop = new_freq_stop
                            recovery_msg = f"Unknown error - reducing frequency range to {new_freq_stop}MHz max"
                            recovery_applied = True
                
                # Check if recovery was possible
                if not recovery_applied:
                    # Check if we've exhausted all options
                    if current_config.voltage_start >= current_config.voltage_stop or current_config.frequency_start >= current_config.frequency_stop:
                        benchmark_status['error'] = f'No more settings to try. {len(failed_combos)} combo(s) failed. Consider: lower base settings, better cooling, or higher thermal limits.'
                        benchmark_status['phase'] = 'error'
                        break
                    else:
                        benchmark_status['error'] = f'Could not determine recovery strategy for: {error_msg}'
                        benchmark_status['phase'] = 'error'
                        break
                
                logger.info(f"Recovery: {recovery_msg}")
                benchmark_status['recovery_action'] = recovery_msg
                benchmark_status['message'] = f'🔄 {recovery_msg}'
                
                # Log the new ranges we'll test
                new_range_msg = f'Continuing with V:{current_config.voltage_start}-{current_config.voltage_stop}mV, F:{current_config.frequency_start}-{current_config.frequency_stop}MHz'
                logger.info(new_range_msg)
                benchmark_status['message'] = f'🔄 {new_range_msg}'
                
            finally:
                current_engine = None
        
        # Final cleanup
        benchmark_status['running'] = False
        benchmark_status['failed_combos'] = failed_combos
        
        try:
            loop.run_until_complete(device_manager.cleanup_all())
        except Exception as cleanup_err:
            logger.error(f"Error during cleanup: {cleanup_err}")
        loop.close()
    
    current_benchmark = Thread(target=run_async_benchmark)
    current_benchmark.start()
    
    return jsonify({'status': 'started'})


@app.route('/api/benchmark/status')
@require_patreon_auth
def get_benchmark_status():
    """Get current benchmark status"""
    status = dict(benchmark_status)  # Copy to avoid modifying global
    
    # Add session logs if we have an active session
    if current_engine and hasattr(current_engine, 'session') and current_engine.session:
        status['session_logs'] = current_engine.session.logs
        status['session_id'] = current_engine.session.session_id
    elif 'session_logs' in benchmark_status:
        status['session_logs'] = benchmark_status.get('session_logs', [])
    
    # If running and we have live_data, try to add fan speed if missing
    if status.get('running') and status.get('live_data') and status.get('device'):
        ld = status['live_data']
        # Check if fan data is missing
        if ld.get('fan_speed') is None:
            # Try to fetch it from device
            device = device_manager.get_device(status['device'])
            if device:
                try:
                    import aiohttp
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                    async def get_fan():
                        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2)) as session:
                            async with session.get(f"http://{device.ip_address}/api/system/info") as resp:
                                if resp.status == 200:
                                    data = await resp.json()
                                    return data.get('fanspeed', 0)
                        return None
                    
                    fan = loop.run_until_complete(get_fan())
                    loop.close()
                    if fan is not None:
                        status['live_data']['fan_speed'] = float(fan)
                except Exception as e:
                    logger.debug(f"Could not fetch fan speed: {e}")
    
    return jsonify(status)


@app.route('/api/benchmark/clear_queue', methods=['POST'])
@require_patreon_auth
def clear_message_queue():
    """Clear the message queue after frontend has processed it"""
    global benchmark_status
    benchmark_status['message_queue'] = []
    save_benchmark_state()
    return jsonify({'status': 'cleared'})


@app.route('/api/benchmark/stop', methods=['POST'])
@require_patreon_auth
def stop_benchmark():
    """Stop current benchmark"""
    global current_benchmark, current_engine, benchmark_status
    
    if current_engine and current_benchmark and current_benchmark.is_alive():
        # Signal the benchmark engine to stop
        current_engine.interrupted = True
        benchmark_status['running'] = False
        benchmark_status['phase'] = 'stopped'
        benchmark_status['message'] = 'Benchmark stopped by user'
        benchmark_status['warning'] = 'Benchmark was manually stopped'
        save_benchmark_state()
        logger.info("Benchmark stop requested")
        return jsonify({'status': 'stop_requested'})
    else:
        return jsonify({'status': 'no_benchmark_running'}), 400


@app.route('/api/benchmark/preset/<device>/<preset>')
@require_patreon_auth
def get_benchmark_preset(device, preset):
    """Get device-specific preset configuration"""
    from config import DEVICE_PRESETS
    
    device = device.lower()
    preset = preset.lower()
    
    if device not in DEVICE_PRESETS or preset not in DEVICE_PRESETS[device]:
        return jsonify({'error': 'Invalid device or preset'}), 400
    
    config = DEVICE_PRESETS[device][preset]
    
    # Return preset configuration as dictionary
    return jsonify({
        'voltage_start': config.voltage_start,
        'voltage_stop': config.voltage_stop,
        'voltage_step': config.voltage_step,
        'frequency_start': config.frequency_start,
        'frequency_stop': config.frequency_stop,
        'frequency_step': config.frequency_step,
        'benchmark_duration': config.benchmark_duration,
        'warmup_time': config.warmup_time,
        'strategy': config.strategy.name,
        'cycles_per_test': config.cycles_per_test,
    })


@app.route('/api/hardware-presets')
@require_patreon_auth
def get_hardware_presets():
    """Get available hardware presets"""
    from config import HARDWARE_PRESETS
    
    presets = {}
    for key, preset in HARDWARE_PRESETS.items():
        presets[key] = {
            'name': preset.name,
            'description': preset.description,
            'voltage_range': preset.voltage_range,
            'frequency_range': preset.frequency_range,
            'temp_range': preset.temp_range,
            'psu_upgraded': preset.psu_upgraded,
            'psu_watts': preset.psu_watts,
            'voltage_step': preset.voltage_step,
            'frequency_step': preset.frequency_step,
            'test_duration': preset.test_duration,
        }
    return jsonify(presets)


@app.route('/api/hardware-preset/<preset_key>/<device_model>')
@require_patreon_auth
def get_hardware_preset_for_device(preset_key, device_model):
    """Get hardware preset limits for a specific device model"""
    from config import HARDWARE_PRESETS, MODEL_CONFIGS
    
    preset_key = preset_key.lower()
    device_model = device_model.lower()
    
    if preset_key not in HARDWARE_PRESETS:
        return jsonify({'error': f'Unknown preset: {preset_key}'}), 400
    
    model_config = MODEL_CONFIGS.get(device_model, MODEL_CONFIGS.get('gamma', {}))
    preset = HARDWARE_PRESETS[preset_key]
    
    # Get limits for this model with this preset
    limits = preset.get_limits_for_model(model_config)
    limits['preset_name'] = preset.name
    limits['preset_description'] = preset.description
    limits['model'] = device_model
    
    return jsonify(limits)


@app.route('/api/optimization-targets')
@require_patreon_auth
def get_optimization_targets():
    """Get available optimization targets"""
    from config import OPTIMIZATION_TARGETS
    
    targets = {}
    for key, target in OPTIMIZATION_TARGETS.items():
        targets[key] = {
            'name': target.name,
            'description': target.description,
            'error_threshold': target.error_threshold,
            'hashrate_tolerance': target.hashrate_tolerance,
            'fan_target': target.fan_target,
            'prioritize': target.prioritize,
        }
    return jsonify(targets)


@app.route('/api/sessions')
@require_patreon_auth
def get_sessions():
    """Get list of benchmark sessions"""
    sessions = []
    
    for session_file in sessions_dir.glob('session_*.json'):
        try:
            with open(session_file, 'r') as f:
                session_data = json.load(f)
            
            # Get device name from device_configs
            device_name = 'Unknown'
            if session_data.get('device_configs'):
                device_name = session_data['device_configs'][0].get('name', 'Unknown')
            
            sessions.append({
                'id': session_data['session_id'],
                'device': device_name,
                'start_time': session_data['start_time'],
                'end_time': session_data.get('end_time'),
                'status': session_data['status'],
                'tests': len(session_data.get('results', [])),
                'stop_reason': session_data.get('stop_reason'),
                'has_logs': bool(session_data.get('logs'))
            })
        except Exception as e:
            logger.error(f"Error loading session {session_file}: {e}")
    
    # Sort by start time, newest first
    sessions.sort(key=lambda x: x['start_time'], reverse=True)
    
    return jsonify(sessions)


@app.route('/api/sessions/<session_id>', methods=['DELETE'])
@require_patreon_auth
def delete_session(session_id):
    """Delete a benchmark session"""
    session_file = sessions_dir / f"session_{session_id}.json"
    plots_dir = sessions_dir / f"plots_{session_id}"
    
    if not session_file.exists():
        return jsonify({'error': 'Session not found'}), 404
    
    try:
        # Delete session file
        session_file.unlink()
        
        # Delete plots directory if exists
        if plots_dir.exists():
            import shutil
            shutil.rmtree(plots_dir)
        
        return jsonify({'status': 'deleted', 'session_id': session_id})
    except Exception as e:
        logger.error(f"Error deleting session {session_id}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/<session_id>')
@require_patreon_auth
def get_session_data(session_id):
    """Get session details"""
    session_file = sessions_dir / f"session_{session_id}.json"
    
    if not session_file.exists():
        return jsonify({'error': 'Session not found'}), 404
    
    with open(session_file, 'r') as f:
        session_data = json.load(f)
    
    return jsonify(session_data)


@app.route('/api/sessions/<session_id>/logs')
@require_patreon_auth
def get_session_logs(session_id):
    """Get logs for a specific session"""
    session_file = sessions_dir / f"session_{session_id}.json"
    
    if not session_file.exists():
        return jsonify({'error': 'Session not found'}), 404
    
    with open(session_file, 'r') as f:
        session_data = json.load(f)
    
    return jsonify({
        'session_id': session_id,
        'logs': session_data.get('logs', []),
        'stop_reason': session_data.get('stop_reason'),
        'status': session_data.get('status')
    })


@app.route('/api/sessions/<session_id>/plot/<plot_type>')
@require_patreon_auth
def get_session_plot(session_id, plot_type):
    """Get plot image"""
    plots_dir = sessions_dir / f"plots_{session_id}"
    plot_files = {
        'hashrate_heatmap': 'hashrate_heatmap.png',
        'efficiency_curve': 'efficiency_curve.png',
        'temperature_analysis': 'temperature_analysis.png',
        'stability_analysis': 'stability_analysis.png',
        'power_curve_3d': 'power_curve_3d.png'
    }
    
    if plot_type not in plot_files:
        return jsonify({'error': 'Invalid plot type'}), 400
    
    plot_file = plots_dir / plot_files[plot_type]
    
    if not plot_file.exists():
        return jsonify({'error': 'Plot not found'}), 404
    
    return send_file(plot_file, mimetype='image/png')


def create_html_template():
    """Create dashboard HTML template"""
    template_dir = Path(__file__).parent / "templates"
    template_dir.mkdir(exist_ok=True)
    
    html = r"""
<!DOCTYPE html>
<html>
<head>
    <title>AxeBench - Bitaxe Benchmark Tool</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #1a1a1a;
            min-height: 100vh;
            padding: 10px;
            color: white;
            font-size: 14px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
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
        .header h1 {
            font-size: 1.5em;
            color: #ff3333;
        }
        .header p {
            color: #888;
            font-size: 0.85em;
        }
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
            cursor: pointer;
        }
        .card {
            background: #2d2d2d;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 12px;
            border: 1px solid #3d3d3d;
        }
        .card h2 {
            color: #ffffff;
            margin-bottom: 12px;
            border-bottom: 2px solid #ff3333;
            padding-bottom: 8px;
            font-size: 1.1em;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 12px;
        }
        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        .form-group {
            margin-bottom: 12px;
        }
        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-weight: bold;
            color: #ccc;
            font-size: 0.9em;
        }
        input, select, button {
            width: 100%;
            padding: 8px 10px;
            border: 2px solid #444;
            border-radius: 6px;
            font-size: 14px;
            background: #1a1a1a;
            color: white;
            min-height: 38px;
        }
        input[type="checkbox"] {
            width: 18px;
            height: 18px;
            min-height: auto;
            cursor: pointer;
            accent-color: #ff3333;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #ff3333;
            background: #222;
        }
        button {
            background: #ff3333;
            color: white;
            border: none;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.2s;
        }
        button:hover {
            background: #cc0000;
        }
        button:disabled {
            background: #555;
            color: #888;
            cursor: not-allowed;
        }
        button.secondary {
            background: #444;
        }
        button.secondary:hover {
            background: #555;
        }
        .device {
            padding: 12px;
            border: 2px solid #444;
            border-radius: 8px;
            transition: all 0.2s;
            position: relative;
            background: #252525;
        }
        .device:hover {
            border-color: #ff3333;
        }
        .device-name {
            font-size: 1.1em;
            font-weight: bold;
            color: #ff3333;
            margin-bottom: 8px;
        }
        .device-info {
            color: #aaa;
            line-height: 1.5;
            font-size: 0.9em;
        }
        .device-actions {
            margin-top: 10px;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .device-actions button {
            width: auto;
            padding: 6px 12px;
            font-size: 0.85em;
            min-height: 32px;
        }
        .status {
            padding: 12px;
            background: #1a1a1a;
            border-radius: 8px;
            margin-top: 12px;
            border: 1px solid #444;
            color: #ccc;
        }
        .status.running {
            background: #1a3d1a;
            border-left: 4px solid #4caf50;
        }
        .progress-bar {
            height: 24px;
            background: #1a1a1a;
            border-radius: 12px;
            overflow: hidden;
            margin: 8px 0;
            border: 1px solid #444;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #ff3333, #cc0000);
            transition: width 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 0.85em;
        }
        .chart-container {
            position: relative;
            height: 250px;
            margin: 15px 0;
        }
        .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 10px;
            font-size: 0.8em;
            font-weight: bold;
            margin-right: 5px;
        }
        .badge.completed { background: #4caf50; color: white; }
        .badge.running { background: #ff3333; color: white; }
        .badge.interrupted { background: #ff9800; color: white; }
        .tabs {
            display: flex;
            gap: 6px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }
        .tab {
            width: auto;
            padding: 8px 14px;
            background: #2d2d2d;
            border: 2px solid #444;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            color: white;
            transition: all 0.2s;
            font-size: 0.9em;
            min-height: auto;
        }
        .tab:hover {
            background: #3d3d3d;
            border-color: #ff3333;
        }
        .tab.active {
            background: #ff3333;
            border-color: #ff3333;
            color: white;
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
        }
        .modal-content {
            background: #2d2d2d;
            margin: 5% auto;
            padding: 20px;
            width: 90%;
            max-width: 550px;
            border-radius: 10px;
            max-height: 85vh;
            overflow-y: auto;
        }
        .close {
            float: right;
            font-size: 24px;
            font-weight: bold;
            cursor: pointer;
            color: #888;
        }
        .close:hover {
            color: #ff3333;
        }
        .stat-box {
            text-align: center;
            padding: 12px;
            background: #1a1a1a;
            border-radius: 8px;
            border: 2px solid #444;
        }
        .stat-value {
            font-size: 1.6em;
            font-weight: bold;
            color: #ff3333;
        }
        .stat-label {
            color: #aaa;
            margin-top: 4px;
            font-size: 0.85em;
        }
        
        /* Toast Notification System */
        #toast-container {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-width: 350px;
        }
        .toast {
            padding: 12px 16px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease-out;
            cursor: pointer;
            font-size: 0.9em;
        }
        .toast:hover { opacity: 0.9; }
        .toast.info { background: #2196f3; }
        .toast.success { background: #4caf50; }
        .toast.warning { background: #ff9800; }
        .toast.error { background: #f44336; }
        .toast .toast-icon { font-size: 1.1em; }
        .toast .toast-message { flex: 1; }
        .toast .toast-close { opacity: 0.7; cursor: pointer; }
        .toast .toast-close:hover { opacity: 1; }
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        /* Event Log Panel */
        .event-log {
            background: #0d0d0d;
            border: 1px solid #333;
            border-radius: 8px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.8em;
            max-height: 400px;
            overflow-y: auto;
        }
        .event-log-entry {
            padding: 5px 10px;
            border-bottom: 1px solid #222;
            display: flex;
            gap: 10px;
        }
        .event-log-entry:last-child { border-bottom: none; }
        .event-log-entry .time { color: #666; min-width: 60px; }
        .event-log-entry .msg { flex: 1; }
        .event-log-entry.info .msg { color: #aaa; }
        .event-log-entry.success .msg { color: #4caf50; }
        .event-log-entry.warning .msg { color: #ff9800; }
        .event-log-entry.error .msg { color: #f44336; }
        .event-log-entry.recovery .msg { color: #03a9f4; }
        
        /* Current Test Display */
        .current-test-display {
            background: linear-gradient(135deg, #1a1a1a, #2d2d2d);
            border: 2px solid #ff3333;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 15px;
            text-align: center;
        }
        .current-test-display .vf-values {
            font-size: 1.8em;
            font-weight: bold;
            color: #ff3333;
            margin: 8px 0;
        }
        .current-test-display .vf-label {
            color: #888;
            font-size: 0.8em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .current-test-display .test-progress {
            margin-top: 10px;
            color: #aaa;
            font-size: 0.9em;
        }
        
        /* Temperature Bars */
        .temp-bar-container {
            background: #1a1a1a;
            border-radius: 6px;
            padding: 8px 12px;
            margin: 4px 0;
        }
        .temp-bar-label {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            font-size: 0.85em;
        }
        .temp-bar {
            height: 6px;
            background: #333;
            border-radius: 3px;
            overflow: hidden;
        }
        .temp-bar-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.3s ease, background 0.3s ease;
        }
        .temp-bar-fill.safe { background: linear-gradient(90deg, #4caf50, #8bc34a); }
        .temp-bar-fill.warm { background: linear-gradient(90deg, #ff9800, #ffc107); }
        .temp-bar-fill.hot { background: linear-gradient(90deg, #f44336, #ff5722); }
        
        /* Error Banner Pulse Animation */
        @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(198, 40, 40, 0.4); }
            50% { box-shadow: 0 0 20px 10px rgba(198, 40, 40, 0.2); }
        }
        
        /* Disabled Form State */
        .benchmark-form-disabled {
            position: relative;
        }
        .benchmark-form-disabled::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            pointer-events: none;
        }
        .benchmark-form-disabled input,
        .benchmark-form-disabled select,
        .benchmark-form-disabled button:not(#stop-btn) {
            opacity: 0.5;
            pointer-events: none;
        }
        
        /* Hashrate bar colors */
        .hashrate-bar-over { background: linear-gradient(90deg, #4caf50, #8bc34a) !important; }
        .hashrate-bar-close { background: linear-gradient(90deg, #ff9800, #ffc107) !important; }
        .hashrate-bar-under { background: linear-gradient(90deg, #f44336, #ff5722) !important; }
        
        /* Completion Modal */
        .completion-modal {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.9);
            z-index: 2000;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 15px;
        }
        .completion-content {
            background: #2d2d2d;
            border-radius: 12px;
            padding: 25px;
            max-width: 450px;
            width: 100%;
            text-align: center;
        }
        .completion-icon { font-size: 3em; margin-bottom: 15px; }
        .completion-title { font-size: 1.3em; margin-bottom: 12px; color: white; }
        .completion-message { color: #aaa; margin-bottom: 15px; line-height: 1.5; font-size: 0.95em; }
        .completion-stats { 
            background: #1a1a1a; 
            border-radius: 8px; 
            padding: 12px; 
            margin-bottom: 15px;
            text-align: left;
        }
        .completion-stat { display: flex; justify-content: space-between; margin: 6px 0; font-size: 0.9em; }
        .completion-stat-label { color: #888; }
        .completion-stat-value { color: #ff3333; font-weight: bold; }
        
        /* Mobile Responsive */
        @media (max-width: 768px) {
            body { padding: 8px; }
            .header { flex-direction: column; align-items: flex-start; }
            .header h1 { font-size: 1.3em; }
            .grid { grid-template-columns: 1fr; }
            .grid-2 { grid-template-columns: 1fr; }
            .tabs { gap: 4px; }
            .tab { padding: 6px 10px; font-size: 0.8em; flex: 1; text-align: center; min-width: 60px; }
            .card { padding: 12px; }
            .card h2 { font-size: 1em; }
            .stat-value { font-size: 1.4em; }
            .modal-content { margin: 10px; padding: 15px; width: calc(100% - 20px); }
            .current-test-display .vf-values { font-size: 1.5em; }
            .chart-container { height: 180px; }
            #toast-container { left: 10px; right: 10px; max-width: none; }
        }
        
        @media (max-width: 480px) {
            body { padding: 5px; }
            .header h1 { font-size: 1.2em; }
            .tab { padding: 5px 8px; font-size: 0.75em; }
            .card h2 { font-size: 0.95em; }
            .stat-value { font-size: 1.2em; }
        }
    
        /* Easy / Geek mode toggle */
        .mode-toggle-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
            padding-top: 4px;
        }
        .mode-label {
            font-weight: 600;
            font-size: 0.95rem;
        }
        .mode-toggle {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            user-select: none;
        }
        .mode-switch {
            position: relative;
            width: 52px;
            height: 24px;
        }
        .mode-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .mode-switch .slider {
            position: absolute;
            inset: 0;
            background-color: #555;
            border-radius: 12px;
            transition: .25s;
        }
        .mode-switch .slider::before {
            content: "";
            position: absolute;
            width: 18px;
            height: 18px;
            left: 3px;
            top: 3px;
            background-color: #fff;
            border-radius: 50%;
            transition: .25s;
        }
        .mode-switch input:checked + .slider {
            background-color: #2679ff;
        }
        .mode-switch input:checked + .slider::before {
            transform: translateX(28px);
        }
        #easy-label, #geek-label {
            font-size: 0.9rem;
            opacity: 0.6;
        }
        body[data-mode="easy"] #easy-label {
            opacity: 1;
            font-weight: 700;
        }
        body[data-mode="geek"] #geek-label {
            opacity: 1;
            font-weight: 700;
        }
        /* Advanced-only controls: hidden only in Easy mode */
        .advanced-only {
        }
        body[data-mode="easy"] .advanced-only {
            display: none;
        }

        /* Special styling for Auto Tune button */
        #auto-tune-btn {
            background: linear-gradient(135deg, #00eaff 0%, #7a3cff 100%);
            border: 1px solid #4d2fbf;
            color: white !important;
            font-weight: 700;
            padding: 10px 18px;
            border-radius: 6px;
            box-shadow: 0 0 12px rgba(122, 60, 255, 0.45);
            transition: all 0.25s ease-in-out;
        }

        #auto-tune-btn:hover {
            transform: scale(1.06);
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.6),
                        0 0 24px rgba(122, 60, 255, 0.5);
        }

    
        /* =========================================================
           AxeBench UI Upgrade Pack v2.11
           - Cosmetic only (tabs, cards, buttons, progress, modals)
           - No JS / layout re-engineering
        ========================================================== */

        :root {
            --ax-primary: #ff3333;
            --ax-primary-soft: #ff5b3c;
            --ax-primary-glow: rgba(255, 90, 90, 0.45);
            --ax-accent: #00eaff;
            --ax-accent-purple: #7a3cff;
            --ax-bg: #050509;
            --ax-surface: #16161d;
            --ax-surface-elevated: #1f2028;
            --ax-border-soft: #343545;
            --ax-success: #4caf50;
            --ax-warning: #ffb74d;
            --ax-danger: #f44336;
        }

        /* Subtle background upgrade */
        body {
            background: radial-gradient(circle at top, #262639 0, #14141c 40%, var(--ax-bg) 100%);
        }

        /* Header polish */
        .header {
            padding: 10px 14px;
            border-radius: 12px;
            background: linear-gradient(135deg, rgba(255,255,255,0.02), rgba(0,0,0,0.6));
            border: 1px solid rgba(255,255,255,0.04);
            box-shadow: 0 18px 40px rgba(0,0,0,0.7);
        }
        .header h1 {
            letter-spacing: 0.02em;
        }
        .header p {
            color: #b0b0c0;
            font-size: 0.9em;
        }

        .nav-links .nav-link {
            border-radius: 999px;
            padding-inline: 18px;
            font-weight: 600;
            box-shadow: 0 0 18px rgba(0,0,0,0.7);
            border: 1px solid rgba(255,255,255,0.12);
        }
        .nav-links .nav-link:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 22px rgba(0,0,0,0.8);
            opacity: 0.95;
        }

        /* Tabs → “floating pills” */
        .tabs {
            margin-top: 18px;
            background: rgba(0,0,0,0.5);
            border-radius: 999px;
            padding: 4px;
            display: inline-flex;
            gap: 6px;
            box-shadow: 0 14px 30px rgba(0,0,0,0.7);
            border: 1px solid rgba(255,255,255,0.05);
        }
        .tabs .tab {
            border-radius: 999px;
            border-color: transparent;
            background: transparent;
            padding: 7px 18px;
            font-weight: 600;
            letter-spacing: 0.02em;
            color: #d0d0dd;
            min-height: 34px;
        }
        .tabs .tab:hover {
            background: rgba(255,255,255,0.04);
            border-color: transparent;
            color: #ffffff;
        }
        .tabs .tab.active {
            background: linear-gradient(135deg, var(--ax-primary-soft), var(--ax-accent-purple));
            color: #ffffff;
            box-shadow:
                0 0 18px var(--ax-primary-glow),
                0 0 28px rgba(0,0,0,0.9);
        }

        /* Card elevation + headers */
        .card {
            background: var(--ax-surface-elevated);
            border-radius: 14px;
            border: 1px solid var(--ax-border-soft);
            box-shadow:
                0 18px 38px rgba(0,0,0,0.85),
                0 0 0 1px rgba(255,255,255,0.02);
        }
        .card h2 {
            border-bottom: none;
            padding-bottom: 6px;
            margin-bottom: 12px;
            position: relative;
        }
        .card h2::after {
            content: "";
            position: absolute;
            left: 0;
            bottom: -4px;
            width: 110px;
            height: 2px;
            border-radius: 999px;
            background: linear-gradient(90deg, var(--ax-accent), var(--ax-accent-purple));
            opacity: 0.7;
        }

        /* Start / Stop / Auto Tune buttons – unified “hero” look */
        #start-btn {
            background: linear-gradient(135deg, #ff4b2b, #ff1e62);
            border: 1px solid rgba(255,255,255,0.12);
            color: white;
            font-weight: 700;
            border-radius: 999px;
            padding-inline: 26px;
            box-shadow:
                0 0 18px rgba(255, 94, 94, 0.6),
                0 8px 22px rgba(0,0,0,0.9);
            transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s;
        }
        #start-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow:
                0 0 22px rgba(255, 120, 120, 0.7),
                0 12px 26px rgba(0,0,0,0.95);
        }

        /* Auto Tune = “magic” cyan→purple */
        #auto-tune-btn {
            background: linear-gradient(135deg, var(--ax-accent) 0%, var(--ax-accent-purple) 100%);
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.12);
            color: #ffffff !important;
            font-weight: 700;
            padding-inline: 24px;
            box-shadow:
                0 0 18px rgba(0, 234, 255, 0.6),
                0 0 26px rgba(122, 60, 255, 0.55);
            transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s;
        }
        #auto-tune-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow:
                0 0 26px rgba(0, 255, 255, 0.8),
                0 0 32px rgba(122, 60, 255, 0.7);
            filter: saturate(1.15);
        }

        /* Secondary / utility buttons */
        button.secondary {
            border-radius: 999px;
            background: #353545;
            border: 1px solid rgba(255,255,255,0.06);
            color: #e0e0ee;
            font-weight: 500;
        }
        button.secondary:hover {
            background: #424257;
        }

        /* Stop button – clearer danger tone */
        #stop-btn {
            background: #3b1a1a;
            border-color: #c62828;
            color: #ffdede;
            border-radius: 999px;
        }
        #stop-btn:hover:not(:disabled) {
            background: #4a1f1f;
            box-shadow: 0 0 12px rgba(244,67,54,0.6);
        }

        /* Progress bars – neon fill */
        .progress-bar {
            background: #08080d;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .progress-fill {
            background: linear-gradient(90deg, var(--ax-accent), var(--ax-accent-purple));
            box-shadow:
                0 0 14px rgba(0, 234, 255, 0.75),
                inset 0 0 4px rgba(0,0,0,0.7);
        }

        /* Stat boxes / quick metrics */
        .stat-box {
            background: radial-gradient(circle at top, rgba(255,255,255,0.06), rgba(0,0,0,0.9));
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow:
                0 14px 26px rgba(0,0,0,0.85),
                0 0 0 1px rgba(255,255,255,0.03);
        }
        .stat-value {
            font-size: 1.7em;
        }

        /* Toasts – more “desktop app” feel */
        .toast {
            border-radius: 12px;
            box-shadow:
                0 16px 32px rgba(0,0,0,0.85),
                0 0 0 1px rgba(0,0,0,0.4);
        }
        .toast .toast-message {
            font-size: 0.92em;
        }

        /* Modals: softer corners + glow */
        .modal-content {
            background: radial-gradient(circle at top, #2b2b3a, #171722);
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow:
                0 22px 44px rgba(0,0,0,0.95),
                0 0 0 1px rgba(0,0,0,0.6);
        }

        /* Completion modal */
        .completion-content {
            background: radial-gradient(circle at top, #2f2f40, #181822);
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.1);
        }

        /* Event log – slightly clearer separation */
        .event-log {
            border-radius: 12px;
            border-color: rgba(255,255,255,0.06);
            background: #050509;
        }

        /* Easy/Geek mode header polish */
        .mode-toggle-row {
            margin-bottom: 18px;
        }
        .mode-toggle-pill {
            box-shadow: 0 10px 24px rgba(0,0,0,0.8);
        }

        /* Small hover micro-interaction for generic buttons */
        button:not(#start-btn):not(#auto-tune-btn):not(#stop-btn) {
            transition: background 0.15s ease, transform 0.12s ease, box-shadow 0.12s ease;
        }
        button:not(#start-btn):not(#auto-tune-btn):not(#stop-btn):hover {
            transform: translateY(-0.5px);
            box-shadow: 0 6px 12px rgba(0,0,0,0.7);
        }

        /* Slightly tighten mobile spacing with new look */
        @media (max-width: 768px) {
            .header {
                padding: 8px 10px;
                box-shadow: 0 10px 22px rgba(0,0,0,0.8);
            }
            .tabs {
                display: flex;
                flex-wrap: wrap;
                border-radius: 14px;
            }
        }


        /* =========================================================
           AxeBench UI Upgrade Pack v2.12
           - Cosmetic only (tabs, cards, buttons, progress, modals)
           - No JS / layout re-engineering
        ========================================================== */

        :root {
            --ax-primary: #ff8a00;
            --ax-primary-soft: #ffb347;
            --ax-primary-glow: rgba(255, 160, 80, 0.55);
            --ax-accent: #00eaff;
            --ax-accent-purple: #7a3cff;
            --ax-bg: #050509;
            --ax-surface: #16161d;
            --ax-surface-elevated: #1f2028;
            --ax-border-soft: #343545;
            --ax-success: #4caf50;
            --ax-warning: #ffb74d;
            --ax-danger: #f44336;
        }

        /* Subtle background upgrade */
        body {
            background: radial-gradient(circle at top, #262639 0, #14141c 40%, var(--ax-bg) 100%);
        }

        /* Header polish */
        .header {
            padding: 10px 14px;
            border-radius: 12px;
            background: linear-gradient(135deg, rgba(255,255,255,0.02), rgba(0,0,0,0.6));
            border: 1px solid rgba(255,255,255,0.04);
            box-shadow: 0 18px 40px rgba(0,0,0,0.7);
        }
        .header h1 {
            letter-spacing: 0.02em;
        }
        .header p {
            color: #b0b0c0;
            font-size: 0.9em;
        }

        .nav-links .nav-link {
            border-radius: 999px;
            padding-inline: 18px;
            font-weight: 600;
            box-shadow: 0 0 18px rgba(0,0,0,0.7);
            border: 1px solid rgba(255,255,255,0.12);
        }
        .nav-links .nav-link:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 22px rgba(0,0,0,0.8);
            opacity: 0.95;
        }

        /* Tabs → “floating pills” */
        .tabs {
            margin-top: 18px;
            background: rgba(0,0,0,0.5);
            border-radius: 999px;
            padding: 4px;
            display: inline-flex;
            gap: 6px;
            box-shadow: 0 14px 30px rgba(0,0,0,0.7);
            border: 1px solid rgba(255,255,255,0.05);
        }
        .tabs .tab {
            border-radius: 999px;
            border-color: transparent;
            background: transparent;
            padding: 7px 18px;
            font-weight: 600;
            letter-spacing: 0.02em;
            color: #d0d0dd;
            min-height: 34px;
        }
        .tabs .tab:hover {
            background: rgba(255,255,255,0.04);
            border-color: transparent;
            color: #ffffff;
        }
        .tabs .tab.active {
            background: linear-gradient(135deg, var(--ax-primary-soft), var(--ax-accent-purple));
            color: #ffffff;
            box-shadow:
                0 0 18px var(--ax-primary-glow),
                0 0 28px rgba(0,0,0,0.9);
        }

        /* Card elevation + headers */
        .card {
            background: var(--ax-surface-elevated);
            border-radius: 14px;
            border: 1px solid var(--ax-border-soft);
            box-shadow:
                0 18px 38px rgba(0,0,0,0.85),
                0 0 0 1px rgba(255,255,255,0.02);
        }
        .card h2 {
            border-bottom: none;
            padding-bottom: 6px;
            margin-bottom: 12px;
            position: relative;
        }
        .card h2::after {
            content: "";
            position: absolute;
            left: 0;
            bottom: -4px;
            width: 110px;
            height: 2px;
            border-radius: 999px;
            background: linear-gradient(90deg, var(--ax-accent), var(--ax-accent-purple));
            opacity: 0.7;
        }

        /* Start / Stop / Auto Tune buttons – unified “hero” look */
        #start-btn {
            background: linear-gradient(135deg, #ff4b2b, #ff1e62);
            border: 1px solid rgba(255,255,255,0.12);
            color: white;
            font-weight: 700;
            border-radius: 999px;
            padding-inline: 26px;
            box-shadow:
                0 0 18px rgba(255, 94, 94, 0.6),
                0 8px 22px rgba(0,0,0,0.9);
            transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s;
        }
        #start-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow:
                0 0 22px rgba(255, 120, 120, 0.7),
                0 12px 26px rgba(0,0,0,0.95);
        }

        /* Auto Tune = “magic” cyan→purple */
        #auto-tune-btn {
            background: linear-gradient(135deg, var(--ax-accent) 0%, var(--ax-accent-purple) 100%);
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.12);
            color: #ffffff !important;
            font-weight: 700;
            padding-inline: 24px;
            box-shadow:
                0 0 18px rgba(0, 234, 255, 0.6),
                0 0 26px rgba(122, 60, 255, 0.55);
            transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s;
        }
        #auto-tune-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow:
                0 0 26px rgba(0, 255, 255, 0.8),
                0 0 32px rgba(122, 60, 255, 0.7);
            filter: saturate(1.15);
        }

        /* Secondary / utility buttons */
        button.secondary {
            border-radius: 999px;
            background: #353545;
            border: 1px solid rgba(255,255,255,0.06);
            color: #e0e0ee;
            font-weight: 500;
        }
        button.secondary:hover {
            background: #424257;
        }

        /* Stop button – clearer danger tone */
        #stop-btn {
            background: #3b1a1a;
            border-color: #c62828;
            color: #ffdede;
            border-radius: 999px;
        }
        #stop-btn:hover:not(:disabled) {
            background: #4a1f1f;
            box-shadow: 0 0 12px rgba(244,67,54,0.6);
        }

        /* Progress bars – neon fill */
        .progress-bar {
            background: #08080d;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .progress-fill {
            background: linear-gradient(90deg, var(--ax-accent), var(--ax-accent-purple));
            box-shadow:
                0 0 14px rgba(0, 234, 255, 0.75),
                inset 0 0 4px rgba(0,0,0,0.7);
        }

        /* Stat boxes / quick metrics */
        .stat-box {
            background: radial-gradient(circle at top, rgba(255,255,255,0.06), rgba(0,0,0,0.9));
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow:
                0 14px 26px rgba(0,0,0,0.85),
                0 0 0 1px rgba(255,255,255,0.03);
        }
        .stat-value {
            font-size: 1.7em;
        }

        /* Toasts – more “desktop app” feel */
        .toast {
            border-radius: 12px;
            box-shadow:
                0 16px 32px rgba(0,0,0,0.85),
                0 0 0 1px rgba(0,0,0,0.4);
        }
        .toast .toast-message {
            font-size: 0.92em;
        }

        /* Modals: softer corners + glow */
        .modal-content {
            background: radial-gradient(circle at top, #2b2b3a, #171722);
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow:
                0 22px 44px rgba(0,0,0,0.95),
                0 0 0 1px rgba(0,0,0,0.6);
        }

        /* Completion modal */
        .completion-content {
            background: radial-gradient(circle at top, #2f2f40, #181822);
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.1);
        }

        /* Event log – slightly clearer separation */
        .event-log {
            border-radius: 12px;
            border-color: rgba(255,255,255,0.06);
            background: #050509;
        }

        /* Easy/Geek mode header polish */
        .mode-toggle-row {
            margin-bottom: 18px;
        }
        .mode-toggle-pill {
            box-shadow: 0 10px 24px rgba(0,0,0,0.8);
        }

        /* Small hover micro-interaction for generic buttons */
        button:not(#start-btn):not(#auto-tune-btn):not(#stop-btn) {
            transition: background 0.15s ease, transform 0.12s ease, box-shadow 0.12s ease;
        }
        button:not(#start-btn):not(#auto-tune-btn):not(#stop-btn):hover {
            transform: translateY(-0.5px);
            box-shadow: 0 6px 12px rgba(0,0,0,0.7);
        }

        /* Slightly tighten mobile spacing with new look */
        @media (max-width: 768px) {
            .header {
                padding: 8px 10px;
                box-shadow: 0 10px 22px rgba(0,0,0,0.8);
            }
            .tabs {
                display: flex;
                flex-wrap: wrap;
                border-radius: 14px;
            }
        }


        /* ============================================
           AxeBench v3.0.0 UI Theme – Hacker / Matrix
           ============================================ */
        :root {
            --ax-bg: #02030a;
            --ax-surface: #0b0f1a;
            --ax-surface-elevated: #111827;
            --ax-border-soft: #243047;
            --ax-primary: #ff8a3c;          /* orange */
            --ax-primary-soft: #ffb347;
            --ax-primary-glow: rgba(255, 162, 80, 0.55);
            --ax-accent: #00f6ff;          /* cyan */
            --ax-accent-2: #15ff87;        /* green */
            --ax-danger: #ff3366;
            --ax-warning: #ffcc66;
            --ax-success: #4ade80;
            --ax-muted: #9ca3af;
        }

        body {
            background: radial-gradient(circle at top, #111827 0, #020617 40%, #000000 100%);
            color: #e5e7eb;
        }

        .header {
            background: radial-gradient(circle at top left, rgba(255,255,255,0.06), rgba(15,23,42,0.95));
            border-radius: 18px;
            border: 1px solid rgba(148,163,184,0.25);
            box-shadow:
                0 25px 55px rgba(0,0,0,0.95),
                0 0 0 1px rgba(15,23,42,0.9);
            padding: 14px 18px;
        }

        .header h1 {
            letter-spacing: 0.06em;
            text-transform: uppercase;
            font-size: 1.3rem;
        }

        .header small {
            color: var(--ax-muted);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.18em;
        }

        .nav-links {
            gap: 8px;
        }

        .nav-links .nav-link {
            border-radius: 999px;
            padding: 6px 18px;
            font-weight: 600;
            border: 1px solid rgba(148,163,184,0.45);
            background: radial-gradient(circle at top, rgba(15,23,42,0.4), rgba(15,23,42,0.9));
            box-shadow: 0 10px 26px rgba(0,0,0,0.85);
            transition: all 0.16s ease-out;
        }

        .nav-links .nav-link:hover {
            transform: translateY(-1px);
            box-shadow: 0 14px 30px rgba(0,0,0,0.95);
            border-color: rgba(248,250,252,0.8);
        }

        .nav-links .nav-link span {
            opacity: 0.9;
        }

        .tabs {
            display: inline-flex;
            padding: 4px;
            border-radius: 999px;
            background: rgba(15,23,42,0.9);
            border: 1px solid rgba(31,41,55,0.9);
            box-shadow:
                0 18px 38px rgba(0,0,0,0.95),
                0 0 0 1px rgba(15,23,42,0.9);
        }

        .tabs .tab {
            border-radius: 999px;
            border: none;
            min-width: 120px;
            padding: 7px 18px;
            font-weight: 600;
            color: #9ca3af;
            background: transparent;
            transition: all 0.16s ease-out;
        }

        .tabs .tab:hover {
            background: rgba(31,41,55,0.8);
            color: #e5e7eb;
        }

        .tabs .tab.active {
            background: linear-gradient(135deg, var(--ax-primary), var(--ax-accent));
            color: #0b1120;
            box-shadow:
                0 0 14px var(--ax-primary-glow),
                0 0 26px rgba(15,23,42,0.8);
        }

        .card {
            background: radial-gradient(circle at top left, rgba(30,64,175,0.12), rgba(15,23,42,0.98));
            border-radius: 16px;
            border: 1px solid rgba(30,64,175,0.35);
            box-shadow:
                0 22px 50px rgba(0,0,0,0.95),
                0 0 0 1px rgba(15,23,42,0.9);
        }

        .card h2 {
            border-bottom: none;
            padding-bottom: 4px;
            margin-bottom: 8px;
            position: relative;
        }

        .card h2::after {
            content: "";
            position: absolute;
            left: 0;
            bottom: -6px;
            width: 130px;
            height: 2px;
            border-radius: 999px;
            background: linear-gradient(90deg, var(--ax-accent), var(--ax-accent-2));
            opacity: 0.8;
        }

        button, .btn {
            border-radius: 999px;
            font-weight: 600;
            font-size: 0.9rem;
            padding: 7px 16px;
            border: 1px solid rgba(148,163,184,0.5);
            background: radial-gradient(circle at top, rgba(15,23,42,0.8), rgba(15,23,42,1));
            color: #e5e7eb;
            box-shadow: 0 10px 24px rgba(0,0,0,0.9);
            cursor: pointer;
            transition: all 0.16s ease-out;
        }

        button:hover, .btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 16px 32px rgba(0,0,0,1);
            border-color: rgba(248,250,252,0.85);
        }

        #start-btn {
            background: linear-gradient(135deg, var(--ax-primary-soft), var(--ax-primary));
            color: #0b1120;
            border-color: rgba(248,250,252,0.9);
            box-shadow:
                0 0 18px var(--ax-primary-glow),
                0 20px 40px rgba(0,0,0,1);
            padding-inline: 24px;
        }

        #start-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow:
                0 0 24px var(--ax-primary-glow),
                0 26px 50px rgba(0,0,0,1);
        }

        #auto-tune-btn {
            background: linear-gradient(135deg, var(--ax-accent), var(--ax-accent-2));
            color: #0b1120 !important;
            border-color: rgba(248,250,252,0.85);
            box-shadow:
                0 0 20px rgba(34,197,94,0.8),
                0 0 36px rgba(59,130,246,0.7);
            padding-inline: 24px;
        }

        #auto-tune-btn:hover:not(:disabled) {
            transform: translateY(-1px) scale(1.02);
            box-shadow:
                0 0 26px rgba(45,212,191,1),
                0 0 44px rgba(59,130,246,0.9);
        }

        #stop-btn {
            background: radial-gradient(circle at top, rgba(248,113,113,0.9), rgba(127,29,29,1));
            border-color: rgba(248,113,113,0.9);
            color: #fef2f2;
        }

        #stop-btn:hover:not(:disabled) {
            box-shadow: 0 0 18px rgba(248,113,113,0.9);
        }

        .progress-bar {
            background: rgba(15,23,42,1);
            border-radius: 999px;
            border: 1px solid rgba(30,64,175,0.7);
        }

        .progress-fill {
            background: linear-gradient(90deg, var(--ax-accent), var(--ax-primary));
            box-shadow:
                0 0 14px rgba(34,197,235,0.7),
                0 0 26px rgba(56,189,248,0.7);
        }

        .stat-box {
            background: radial-gradient(circle at top, rgba(34,197,235,0.18), rgba(15,23,42,1));
            border-radius: 14px;
            border: 1px solid rgba(37,99,235,0.7);
            box-shadow:
                0 18px 40px rgba(0,0,0,1),
                0 0 0 1px rgba(15,23,42,1);
        }

        .toast {
            border-radius: 14px;
            border: 1px solid rgba(148,163,184,0.6);
            box-shadow:
                0 20px 45px rgba(0,0,0,0.98),
                0 0 0 1px rgba(15,23,42,0.9);
            background: radial-gradient(circle at top left, rgba(31,41,55,0.96), rgba(15,23,42,1));
        }

        .modal-content {
            border-radius: 18px;
            border: 1px solid rgba(148,163,184,0.8);
            box-shadow:
                0 30px 70px rgba(0,0,0,1),
                0 0 0 1px rgba(15,23,42,0.95);
            background: radial-gradient(circle at top, rgba(17,24,39,1), rgba(3,7,18,1));
        }

</style>
</head>
<body>
    <!-- Auto Tune global progress banner -->
    <div id="auto-tune-banner" style="
        display: none;
        background: linear-gradient(90deg, #7a3cff, #00eaff);
        padding: 10px 15px;
        color: white;
        font-size: 1.1rem;
        font-weight: 600;
        text-align: center;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        z-index: 9999;
        position: sticky;
        top: 0;
        border-bottom: 2px solid rgba(255,255,255,0.2);
    ">
        🪄 AUTO TUNE IN PROGRESS
    </div>
    <!-- Toast Notification Container -->
    <div id="toast-container"></div>
    
    <!-- Free Tier Nag Modal (shown on load for non-patrons) -->
    <div id="nag-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 9999; justify-content: center; align-items: center;">
        <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 16px; padding: 30px; max-width: 400px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.5); border: 1px solid #f96854; margin: 15px;">
            <div style="font-size: 3em; margin-bottom: 15px;">⚡</div>
            <h2 style="color: #f96854; margin-bottom: 12px; font-size: 1.4em;">Welcome to AxeBench!</h2>
            <p style="color: #ccc; margin-bottom: 20px; line-height: 1.5; font-size: 0.95em;">
                You have access to all features for up to <strong style="color: #4caf50;">5 devices</strong>.<br><br>
                If you find this useful, please consider supporting development!
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button onclick="loginWithPatreon()" style="width: 100%; min-height: auto; background: linear-gradient(135deg, #f96854, #ff424d); color: white; border: none; padding: 12px 24px; border-radius: 20px; font-weight: bold; font-size: 1em; cursor: pointer;">
                    ❤️ Support Development
                </button>
                <button onclick="closeNagModal()" style="width: auto; min-height: auto; background: transparent; border: none; color: #888; cursor: pointer; font-size: 0.95em; padding: 8px;">
                    Continue →
                </button>
            </div>
        </div>
    </div>
    
    <!-- Patreon Support Banner (shown for non-patrons) -->
    <div id="patreon-banner" style="display: none; background: linear-gradient(135deg, #f96854, #ff424d); padding: 8px 12px; text-align: center; font-size: 0.9em;">
        <span style="color: white;">
            ⚡ <strong>Free tier (5 devices)</strong> — Support development!
            <button onclick="loginWithPatreon()" style="width: auto; min-height: auto; background: white; color: #f96854; border: none; padding: 4px 12px; border-radius: 12px; margin-left: 8px; cursor: pointer; font-weight: bold; font-size: 0.85em;">❤️ Support</button>
            <button onclick="this.parentElement.parentElement.style.display='none'" style="width: auto; min-height: auto; background: transparent; border: none; color: rgba(255,255,255,0.8); cursor: pointer; margin-left: 8px; font-size: 1.1em;">✕</button>
        </span>
    </div>
    
    <!-- Patron Welcome (shown for active patrons) -->
    <div id="patron-welcome" style="display: none; background: linear-gradient(135deg, #4caf50, #2e7d32); padding: 8px 12px; text-align: center; font-size: 0.9em;">
        <span style="color: white;">
            ⭐ <strong>Thank you for your support, <span id="patron-name"></span>!</strong> You're awesome!
            <button onclick="licenseLogout()" style="width: auto; min-height: auto; background: transparent; border: none; color: rgba(255,255,255,0.8); cursor: pointer; margin-left: 12px; text-decoration: underline; font-size: 0.85em;">Logout</button>
        </span>
    </div>

    <div class="container">
        <div class="header">
            <div>
                <h1>⚡ AxeBench <span style="font-size: 0.35em; color: #888; font-weight: normal;">Engine v3.0.0 • UI v2.0</span></h1>
                <p>Bitaxe Performance Tuning</p>
            </div>
            <div class="nav-links">
                <a class="nav-link" style="background: linear-gradient(135deg, #4caf50, #2e7d32);" onclick="navigateToApp('axeshed'); return false;">🏠 AxeShed</a>
                <a class="nav-link" style="background: linear-gradient(135deg, #9c27b0, #7b1fa2);" onclick="navigateToApp('axepool'); return false;">🎱 AxePool</a>
            </div>
        </div>
        
        <div class="tabs">
            <button class="tab active" onclick="showTab('dashboard')">Devices</button>
            <button class="tab" onclick="showTab('benchmark')">Benchmark</button>
            <button class="tab" onclick="showTab('monitoring')">Live Monitor</button>
            <button class="tab" onclick="showTab('profiles')">Profiles</button>
            <button class="tab" onclick="showTab('sessions')">Sessions</button>
        </div>
        
        <!-- Dashboard Tab -->
        <div id="dashboard" class="tab-content active">
            <!-- Fleet Overview Stats -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 12px;">
                <div style="background: linear-gradient(135deg, #1a3a1a, #2d5a2d); border: 2px solid #4caf50; border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 0.75em; color: #aaa; margin-bottom: 2px;">🔌 Devices Online</div>
                    <div id="fleet-devices-online" style="font-size: 1.6em; font-weight: bold; color: #4caf50;">--</div>
                    <div style="font-size: 0.7em; color: #666;"><span id="fleet-devices-total">0</span> total</div>
                </div>
                <div style="background: linear-gradient(135deg, #3a2a1a, #5a4a2d); border: 2px solid #ff9800; border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 0.75em; color: #aaa; margin-bottom: 2px;">⚡ Total Hashrate</div>
                    <div id="fleet-hashrate" style="font-size: 1.6em; font-weight: bold; color: #ff9800;">--</div>
                    <div style="font-size: 0.7em; color: #666;">GH/s</div>
                </div>
                <div style="background: linear-gradient(135deg, #1a2a3a, #2d4a5a); border: 2px solid #2196f3; border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 0.75em; color: #aaa; margin-bottom: 2px;">📈 Avg Efficiency</div>
                    <div id="fleet-efficiency" style="font-size: 1.6em; font-weight: bold; color: #2196f3;">--</div>
                    <div style="font-size: 0.7em; color: #666;">J/TH</div>
                </div>
                <div style="background: linear-gradient(135deg, #3a1a1a, #5a2d2d); border: 2px solid #f44336; border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 0.75em; color: #aaa; margin-bottom: 2px;">🌡️ Hottest</div>
                    <div id="fleet-hottest-temp" style="font-size: 1.6em; font-weight: bold; color: #f44336;">--</div>
                    <div id="fleet-hottest-name" style="font-size: 0.7em; color: #666;">°C</div>
                </div>
            </div>
            
            <!-- Device Cards -->
            <div class="card" style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <h2 style="margin: 0; border: none; padding: 0;">📱 Device Fleet</h2>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <span id="fleet-refresh-status" style="font-size: 0.75em; color: #666;">Updated just now</span>
                        <button onclick="refreshFleetDashboard()" style="width: auto; min-height: auto; background: #333; border: 1px solid #555; padding: 5px 10px; border-radius: 6px; cursor: pointer; color: #aaa; font-size: 0.85em;">
                            🔄 Refresh
                        </button>
                        <button onclick="showAddDeviceModal()" style="width: auto; min-height: auto; background: #4caf50; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; color: white; font-size: 0.85em;">
                            ➕ Add Device
                        </button>
                    </div>
                </div>
                <div id="device-cards" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px;">
                    <!-- Device cards will be populated here -->
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <div style="font-size: 3em; margin-bottom: 10px;">📡</div>
                        <div>Loading devices...</div>
                    </div>
                </div>
            </div>
            
            <!-- Shared PSUs Section -->
            <div class="card" id="shared-psus-card" style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h2 style="margin: 0; border: none; padding: 0;">🔌 Shared Power Supplies</h2>
                    <button onclick="openCreateSharedPsuModal()" style="width: auto; min-height: auto; background: #ff9800; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; color: white; font-size: 0.85em;">
                        ➕ Add Shared PSU
                    </button>
                </div>
                <div id="shared-psus-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px;">
                    <div style="text-align: center; padding: 20px; color: #666; font-size: 0.9em;">
                        No shared PSUs configured. Add one to monitor combined power draw across multiple devices.
                    </div>
                </div>
            </div>
            
            <!-- Fleet Alerts -->
            <div class="card" id="fleet-alerts-card" style="display: none; margin-bottom: 20px;">
                <h2 style="margin-bottom: 15px;">⚠️ Fleet Alerts</h2>
                <div id="fleet-alerts" style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- Alerts populated dynamically -->
                </div>
            </div>
            
            <!-- Quick Actions - Export Only -->
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0;">⚡ Quick Actions</h2>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 15px; flex-wrap: wrap;">
                    <button onclick="exportFleetStatus()" style="background: linear-gradient(135deg, #ff9800, #e65100); border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; color: white; font-size: 0.95em; display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.2em;">💾</span>
                        <span>Export Fleet Status</span>
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Benchmark Tab -->
        <div id="benchmark" class="tab-content">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0;">🚀 Start Benchmark</h2>
                    <button id="config-collapse-btn" onclick="toggleConfigForm()" style="background: #444; border: 1px solid #666; padding: 6px 12px; border-radius: 6px; cursor: pointer; color: #aaa; display: none;">▼ Hide Config</button>
                </div>
                
                                <div class="mode-toggle-row">
                    <span class="mode-label">Mode:</span>
                    <label class="mode-toggle">
                        <span id="easy-label">Easy</span>
                        <div class="mode-switch">
                            <input type="checkbox" id="mode-switch">
                            <span class="slider"></span>
                        </div>
                        <span id="geek-label">Geek</span>
                    </label>
                </div>

                <div class="form-group">
                    <label>Device</label>
                    <select id="device-select" onchange="loadDeviceProfile()">
                        <option value="">Select device...</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Device Model</label>
                    <select id="device-model" onchange="loadModelProfile()">
                        <option value="">Auto-detect</option>
                        <option value="supra">Bitaxe Supra (BM1366)</option>
                        <option value="ultra">Bitaxe Ultra (BM1366)</option>
                        <option value="hex">Bitaxe Hex (BM1366 x6)</option>
                        <option value="gamma">Bitaxe Gamma (BM1370)</option>
                        <option value="max">Bitaxe Max (BM1397)</option>
                        <option value="nerdqaxe">NerdQAxe (BM1370 x1)</option>
                        <option value="nerdqaxe_plus">NerdQAxe+ (BM1370 x2)</option>
                        <option value="nerdqaxe_plus_plus">NerdQAxe++ (BM1370 x4)</option>
                    </select>
                </div>
                
                <div id="device-profile-info" style="margin-bottom: 15px; padding: 10px; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; display: none;">
                    <p style="color: #aaa; font-size: 0.9em; margin: 0;"><strong id="model-name"></strong></p>
                    <p style="color: #ff3333; font-size: 0.9em; margin: 5px 0 0 0;">
                        Stock: <span id="profile-stock-voltage"></span>mV @ <span id="profile-stock-frequency"></span>MHz<br>
                        Safe Max: <span id="profile-safe-voltage"></span>mV @ <span id="profile-safe-frequency"></span>MHz<br>
                        Temps: ASIC <span id="profile-chip-temp"></span>°C | VReg <span id="profile-vr-temp"></span>°C
                    </p>
                </div>
                
                <div id="benchmark-config-form">
<div class="form-group advanced-only">
                    <label>Tuning Preset</label>
                    <select id="preset-select" onchange="loadPreset()">
                        <option value="">-- Custom Configuration --</option>
                        <option value="fast">Fast</option>
                        <option value="optimal">Optimal</option>
                        <option value="precision">Precision</option>
                    </select>
                    <small style="color: #aaa; display: block; margin-top: 5px;">Presets auto-populate parameters optimized for your device</small>
                </div>
                
                <!-- Saved Benchmark Profiles -->
                <div class="advanced-only" style="background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <label style="margin: 0; font-weight: bold; color: #4caf50;">📁 Saved Profiles</label>
                        <button type="button" onclick="saveCurrentProfile()" style="background: #4caf50; color: white; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em; width: auto;">
                            💾 Save Current
                        </button>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="saved-profiles" style="flex: 1; padding: 8px; background: #2d2d2d; border: 1px solid #444; border-radius: 4px; color: white;">
                            <option value="">-- Select a saved profile --</option>
                        </select>
                        <button type="button" onclick="loadSavedProfile()" style="background: #2196f3; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; width: auto;">Load</button>
                        <button type="button" onclick="deleteSavedProfile()" style="background: #f44336; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; width: auto;">🗑️</button>
                    </div>
                    <div id="loaded-profile-indicator" style="color: #4caf50; font-size: 0.85em; margin-top: 6px; display: none;">
                        ✓ Loaded: <span id="loaded-profile-name"></span>
                    </div>
                    <small style="color: #666; display: block; margin-top: 6px;">Profiles save V/F ranges, safety limits, and timing settings</small>
                </div>
                
                <!-- Auto Mode Toggle -->
                <div class="advanced-only" style="background: #1a3a1a; border: 1px solid #4caf50; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 1.05em;">
                        <input type="checkbox" id="auto-mode" checked onchange="toggleAutoMode()" style="width: 20px; height: 20px;">
                        <span style="color: #4caf50; font-weight: bold;">🤖 Auto Mode (Intelligent Step Adjustment)</span>
                    </label>
                    <small style="color: #aaa; display: block; margin-top: 8px; margin-left: 30px;">
                        Starts with coarse steps for fast exploration, automatically switches to fine steps when hitting limits or finding optimal zones. Faster and more accurate than fixed steps.
                    </small>
                </div>
                
                <div class="grid-2 advanced-only">
                    <div class="form-group">
                        <label>Voltage Start (mV)</label>
                        <input type="number" id="voltage-start" value="1150" min="1000" max="1400" onchange="checkSafetyRange()">
                    </div>
                    <div class="form-group">
                        <label>Voltage Stop (mV)</label>
                        <input type="number" id="voltage-stop" value="1350" min="1000" max="1400" onchange="checkSafetyRange()">
                    </div>
                    <div class="form-group">
                        <label>Voltage Step (mV) <span id="voltage-step-auto-label" style="color: #4caf50; font-size: 0.85em;">(Auto: 25→5mV)</span></label>
                        <input type="number" id="voltage-step" value="20" min="5" max="100">
                    </div>
                    <div class="form-group">
                        <label>Frequency Start (MHz)</label>
                        <input type="number" id="frequency-start" value="500" min="400" max="1000" onchange="checkSafetyRange()">
                    </div>
                    <div class="form-group">
                        <label>Frequency Stop (MHz)</label>
                        <input type="number" id="frequency-stop" value="700" min="400" max="1000" onchange="checkSafetyRange()">
                    </div>
                    <div class="form-group">
                        <label>Frequency Step (MHz) <span id="frequency-step-auto-label" style="color: #4caf50; font-size: 0.85em;">(Auto: 50→10MHz)</span></label>
                        <input type="number" id="frequency-step" value="25" min="5" max="100">
                    </div>
                </div>
                
                <div class="grid-2">
                    <div class="form-group advanced-only">
                        <label>Sampling Duration (sec)</label>
                        <input type="number" id="duration" value="120" min="60" max="3600">
                        <small style="color: #999;">Min 60s for reliable samples</small>
                    </div>
                    <div class="form-group advanced-only">
                        <label>Stabilisation Time (sec)</label>
                        <input type="number" id="warmup" value="10" min="5" max="300">
                        <small style="color: #999;">Wait time after changing settings before sampling</small>
                    </div>
                    <div class="form-group advanced-only">
                        <label>Cooldown Between Tests (sec)</label>
                        <input type="number" id="cooldown" value="5" min="5" max="120">
                        <small style="color: #999;">Auto-extends after thermal events</small>
                    </div>
                    <div class="form-group advanced-only">
                        <label>Repeat Each Setting</label>
                        <input type="number" id="cycles-per-test" value="1" min="1" max="10">
                        <small style="color: #999;">Run full sampling period multiple times for consistency</small>
                    </div>
                    <div class="form-group advanced-only">
                        <label>Target Error Rate (%)</label>
                        <input type="number" id="target-error" value="0.2" min="0.1" max="1.0" step="0.05">
                        <small style="color: #999;">ASIC error threshold for stability (0.1-1.0%)</small>
                    </div>
                    <div class="form-group">
                        <label>Optimization Goal</label>
                        <select id="goal">
                            <option value="max_hashrate">Max Hashrate</option>
                            <option value="balanced">Balanced</option>
                            <option value="efficient">Efficient</option>
                            <option value="quiet">Quiet</option>
                        </select>
                    </div>
                </div>
                
                <div class="grid-2">
                    <div class="form-group advanced-only">
                        <label>Max ASIC Temperature (°C)</label>
                        <input type="number" id="max-temp" value="65" min="50" max="85" onchange="checkSafetyRange()">
                        <small style="color: #999;">Benchmark will abort if exceeded</small>
                    </div>
                    <div class="form-group advanced-only">
                        <label>Max Power (W)</label>
                        <input type="number" id="max-power" value="22" min="10" max="60" onchange="checkSafetyRange()">
                        <small style="color: #999;">22W safe for stock PSU</small>
                    </div>
                    <div class="form-group advanced-only">
                        <label>Max VR Temperature (°C)</label>
                        <input type="number" id="max-vr-temp" value="80" min="60" max="100" onchange="checkSafetyRange()">
                        <small style="color: #999;">Benchmark will abort if exceeded</small>
                    </div>
                    <div class="form-group advanced-only">
                        <label>Fan Auto-Target (°C)</label>
                        <select id="fan-target" onchange="checkSafetyRange()">
                            <option value="">Don't change</option>
                            <option value="55">55°C (Aggressive cooling)</option>
                            <option value="58">58°C</option>
                            <option value="60" selected>60°C (Recommended)</option>
                            <option value="62">62°C</option>
                            <option value="65">65°C</option>
                            <option value="68">68°C (Warm)</option>
                        </select>
                        <small style="color: #999;">Must be lower than Max ASIC Temp</small>
                    </div>
                </div>
                
                <!-- Auto-Recovery Options -->
                <div class="advanced-only" style="background: #1a3a1a; border: 1px solid #4caf50; border-radius: 8px; padding: 15px; margin: 15px 0;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #4caf50; font-weight: bold;">
                            <input type="checkbox" id="auto-recovery" checked>
                            🔄 Auto-Recovery Mode
                        </label>
                        <span style="color: #888; font-size: 0.85em;">If a test fails, automatically try alternatives instead of stopping</span>
                    </div>
                    
                    <div id="recovery-options" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="font-size: 0.9em;">Recovery Strategy</label>
                            <select id="recovery-strategy">
                                <option value="conservative">Conservative (Voltage first)</option>
                                <option value="aggressive">Aggressive (Both V & F)</option>
                                <option value="frequency_first">Frequency first</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="font-size: 0.9em;">Max Retries per Combo</label>
                            <input type="number" id="recovery-max-retries" value="2" min="1" max="5">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="font-size: 0.9em;">Cooldown Time (s)</label>
                            <input type="number" id="recovery-cooldown" value="10" min="10" max="120">
                        </div>
                    </div>
                    <small style="color: #888; display: block; margin-top: 10px;">
                        💡 When enabled: If temp/power exceeds limits, the benchmark will reduce V/F, wait for cooldown, and continue testing.
                    </small>
                </div>
                
                <div class="grid-2">
                    <div class="form-group advanced-only">
                        <label style="display: block; margin-top: 10px;" title="Some firmware versions require a restart for voltage/frequency changes to apply. Enable if you notice settings not changing.">
                            <input type="checkbox" id="restart"> Restart between tests 
                            <span style="color: #ff9800; cursor: help;" title="Enable if your firmware doesn't apply settings without restart. Adds ~30s per test.">ⓘ</span>
                        </label>
                        <small style="color: #888; display: block; margin-left: 20px; font-size: 0.8em;">Required on some firmware versions if settings don't apply</small>
                        <label style="display: block; margin-top: 8px;">
                            <input type="checkbox" id="plotting" checked> Enable plots
                        </label>
                        <label style="display: block;">
                            <input type="checkbox" id="csv" checked> Export CSV
                        </label>
                    </div>
                </div>
                </div><!-- End benchmark-config-form -->
                
                <!-- Safety Warning - placed near Start button so user sees it -->
                <div id="safety-warning" style="display: none; background-color: #ff6b6b; color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <strong>⚠️ WARNING: Out of Safe Range</strong><br>
                    <span id="warning-message"></span><br><br>
                    <label style="color: white; cursor: pointer;">
                        <input type="checkbox" id="override-safety" onchange="updateStartButton()">
                        I understand the risks and want to proceed anyway
                    </label>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button id="start-btn" onclick="startBenchmark()">Start Benchmark</button>
                    <button id="stop-btn" onclick="stopBenchmark()" style="display: none; background-color: #ff4444;">Stop Benchmark</button>
                    <button id="auto-tune-btn" onclick="startFullAutoTune()" class="secondary">
                        🪄 Auto Tune
                    </button>
                </div>
                <small id="safety-status" style="color: #ff6b6b; display: none; margin-top: 10px;">⚠️ Out of safe range - check warning above</small>
                
                <div id="status" class="status" style="display: none;"></div>
                
                <!-- PROMINENT Error Banner -->
                <div id="error-banner" style="display: none; background: linear-gradient(135deg, #c62828, #b71c1c); border-radius: 12px; padding: 20px; margin: 15px 0; text-align: center; animation: pulse 2s infinite;">
                    <div style="font-size: 2em; margin-bottom: 10px;">⚠️</div>
                    <div style="font-size: 1.3em; font-weight: bold; color: white; margin-bottom: 10px;" id="error-banner-title">Benchmark Error</div>
                    <div style="color: #ffcdd2; font-size: 1em;" id="error-banner-message">Something went wrong</div>
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
                        <div style="color: #ffcdd2; font-size: 0.9em;" id="error-banner-suggestion"></div>
                    </div>
                    <button onclick="dismissErrorBanner()" style="margin-top: 15px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3);">Dismiss</button>
                </div>
                
                <!-- UNIFIED Live Benchmark Panel - All in one compact block (ALWAYS VISIBLE) -->
                <div id="live-benchmark-panel" style="display: block; margin-top: 15px;">
                    <!-- Header Row: V/F + Progress + Time -->
                    <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); border: 2px solid #ff3333; border-radius: 12px; padding: 15px; margin-bottom: 10px;">
                        <div style="display: grid; grid-template-columns: auto 1fr auto; gap: 20px; align-items: center;">
                            <!-- V/F Display -->
                            <div style="text-align: center;">
                                <div style="font-size: 1.8em; font-weight: bold; color: #ff3333;">
                                    <span id="current-voltage">1200</span>mV @ <span id="current-frequency">500</span>MHz
                                    <span id="trend-arrows" style="font-size: 0.5em; margin-left: 5px;"></span>
                                </div>
                                <div style="font-size: 0.75em; color: #888; margin-top: 3px;">
                                    V: <span id="voltage-range-start">1100</span>-<span id="voltage-range-stop">1200</span> | 
                                    F: <span id="freq-range-start">500</span>-<span id="freq-range-stop">600</span>
                                </div>
                            </div>
                            
                            <!-- Progress Bar -->
                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.85em; color: #aaa; margin-bottom: 5px;">
                                    <span id="test-progress-text">Test 0 of 0</span>
                                    <span id="best-so-far-compact" style="color: #4caf50;">🏆 --</span>
                                </div>
                                <div style="background: #333; height: 8px; border-radius: 4px; overflow: hidden;">
                                    <div id="test-progress-bar" style="height: 100%; background: linear-gradient(90deg, #ff3333, #ff6b6b); width: 0%; transition: width 0.3s;"></div>
                                </div>
                            </div>
                            
                            <!-- Time Remaining -->
                            <div style="text-align: right; min-width: 80px;">
                                <div style="font-size: 1.3em; font-weight: bold; color: #03a9f4;" id="time-remaining">--</div>
                                <div style="font-size: 0.7em; color: #666;">remaining</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Stats Row with Integrated Bars -->
                    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 10px;">
                        <!-- Hashrate -->
                        <div style="background: #1a1a1a; padding: 12px 10px; border-radius: 8px; text-align: center;">
                            <div id="bench-live-hashrate" style="font-size: 1.5em; font-weight: bold; color: #ff3333;">--</div>
                            <div style="color: #666; font-size: 0.75em;">GH/s</div>
                        </div>
                        
                        <!-- Power with bar -->
                        <div style="background: #1a1a1a; padding: 12px 10px; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                <span id="bench-live-power" style="font-size: 1.5em; font-weight: bold; color: #2196f3;">--</span>
                                <span style="color: #666; font-size: 0.7em;">/<span id="bench-max-power-display">22</span>W</span>
                            </div>
                            <div style="color: #666; font-size: 0.7em; margin-top: 2px;">Watts</div>
                            <div style="background: #333; height: 4px; border-radius: 2px; margin-top: 4px; overflow: hidden;">
                                <div id="power-bar" class="temp-bar-fill safe" style="height: 100%; width: 0%;"></div>
                            </div>
                        </div>
                        
                        <!-- Chip Temp with bar -->
                        <div style="background: #1a1a1a; padding: 12px 10px; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                <span id="bench-live-temp" style="font-size: 1.5em; font-weight: bold; color: #ff9800;">--</span>
                                <span style="color: #666; font-size: 0.7em;">/<span id="bench-max-temp">65</span>°C</span>
                            </div>
                            <div style="color: #666; font-size: 0.7em; margin-top: 2px;">ASIC Temp</div>
                            <div style="background: #333; height: 4px; border-radius: 2px; margin-top: 4px; overflow: hidden;">
                                <div id="temp-bar-chip" class="temp-bar-fill safe" style="height: 100%; width: 0%;"></div>
                            </div>
                        </div>
                        
                        <!-- Fan with bar -->
                        <div style="background: #1a1a1a; padding: 12px 10px; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                <span id="bench-live-fan" style="font-size: 1.5em; font-weight: bold; color: #03a9f4;">--</span>
                                <span style="color: #666; font-size: 0.7em;">/100%</span>
                            </div>
                            <div style="color: #666; font-size: 0.7em; margin-top: 2px;">Fan Speed</div>
                            <div style="background: #333; height: 4px; border-radius: 2px; margin-top: 4px; overflow: hidden;">
                                <div id="fan-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #03a9f4, #00bcd4); transition: width 0.3s;"></div>
                            </div>
                        </div>
                        
                        <!-- Error Rate with bar -->
                        <div style="background: #1a1a1a; padding: 12px 10px; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                <span id="bench-live-error" style="font-size: 1.5em; font-weight: bold; color: #e91e63;">--</span>
                                <span style="color: #666; font-size: 0.7em;">/5%</span>
                            </div>
                            <div style="color: #666; font-size: 0.7em; margin-top: 2px;">Error Rate</div>
                            <div style="background: #333; height: 4px; border-radius: 2px; margin-top: 4px; overflow: hidden;">
                                <div id="error-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #4caf50, #ff9800, #f44336); transition: width 0.3s;"></div>
                            </div>
                        </div>
                        
                        <!-- Efficiency -->
                        <div style="background: #1a1a1a; padding: 12px 10px; border-radius: 8px; text-align: center;">
                            <div id="bench-live-efficiency" style="font-size: 1.5em; font-weight: bold; color: #4caf50;">--</div>
                            <div style="color: #666; font-size: 0.75em;">J/TH</div>
                        </div>
                    </div>
                    
                    <!-- VR Temp (secondary, smaller) -->
                    <div style="background: #1a1a1a; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                        <span style="color: #666; font-size: 0.8em; white-space: nowrap;">🔥 VR Temp:</span>
                        <div style="flex: 1; background: #333; height: 6px; border-radius: 3px; overflow: hidden;">
                            <div id="temp-bar-vr" class="temp-bar-fill safe" style="height: 100%; width: 0%;"></div>
                        </div>
                        <span style="color: #aaa; font-size: 0.85em; white-space: nowrap;"><span id="bench-live-vr-temp">--</span>°C / <span id="bench-max-vr-temp">85</span>°C</span>
                    </div>
                    
                    <!-- Hashrate Target Comparison (only shown in Fine Tune mode) -->
                    <div id="hashrate-comparison" style="display: none; background: #1a1a1a; padding: 10px 12px; border-radius: 6px; margin-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="color: #666; font-size: 0.8em; white-space: nowrap;">📊 vs Target:</span>
                            <div style="flex: 1; background: #333; height: 12px; border-radius: 6px; overflow: hidden; position: relative;">
                                <div style="position: absolute; left: 83%; top: 0; bottom: 0; width: 2px; background: #fff; z-index: 2;"></div>
                                <div id="hashrate-actual-bar" style="height: 100%; background: linear-gradient(90deg, #4caf50, #8bc34a); width: 100%; transition: width 0.3s;"></div>
                            </div>
                            <span style="min-width: 50px; text-align: right;"><span id="hashrate-percent" style="color: #4caf50; font-weight: bold;">100%</span></span>
                        </div>
                    </div>
                    
                    <!-- Collapsible Event Log -->
                    <div id="event-log-container" style="background: #1a1a1a; border-radius: 8px; overflow: hidden;">
                        <div onclick="toggleEventLog()" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; cursor: pointer; background: #252525;">
                            <span style="color: #aaa; font-size: 0.85em;">
                                <span id="event-log-toggle-icon">▶</span> Event Log 
                                <span id="event-log-count" style="color: #666;">(0 entries)</span>
                            </span>
                            <div style="display: flex; gap: 8px;">
                                <span id="event-log-last" style="color: #666; font-size: 0.8em; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></span>
                                <button onclick="event.stopPropagation(); clearEventLog()" style="padding: 2px 8px; font-size: 0.7em; background: #444;">Clear</button>
                            </div>
                        </div>
                        <div id="event-log-expanded" style="display: none; max-height: 400px; overflow-y: auto;">
                            <div id="event-log" class="event-log" style="padding: 8px 12px;"></div>
                        </div>
                    </div>
                </div>
                
                <!-- Hidden elements for compatibility (IDs still referenced) -->
                <div id="current-test-display" style="display: none;"></div>
                <div id="benchmark-live-stats" style="display: none;"></div>
                <div id="best-so-far" style="display: none;"></div>
                <span id="voltage-position-bar" style="display: none;"></span>
                <span id="voltage-position-marker" style="display: none;"></span>
                <span id="freq-position-bar" style="display: none;"></span>
                <span id="freq-position-marker" style="display: none;"></span>
                <span id="bench-live-power-bar" style="display: none;"></span>
            </div>
        </div>
        
        <!-- Live Monitor Tab -->
        <div id="monitoring" class="tab-content">
            <div class="card">
                <h2>📊 Live Device Monitoring</h2>
                <div class="form-group">
                    <label>Select Device to Monitor</label>
                    <select id="monitor-device-select" onchange="startMonitoring()">
                        <option value="">Select device...</option>
                    </select>
                </div>
                
                <!-- Key Metrics Row (Top Priority) -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                    <div class="stat-box" style="background: linear-gradient(135deg, #1a3a1a, #2d5a2d); border: 2px solid #4caf50;">
                        <div style="font-size: 0.9em; color: #aaa; margin-bottom: 5px;">Hashrate</div>
                        <div class="stat-value" id="live-hashrate" style="font-size: 2.2em;">--</div>
                        <div class="stat-label" style="color: #4caf50;">GH/s</div>
                    </div>
                    <div class="stat-box" style="background: linear-gradient(135deg, #3a1a1a, #5a2d2d); border: 2px solid #ff6b6b;">
                        <div style="font-size: 0.9em; color: #aaa; margin-bottom: 5px;">ASIC Temperature</div>
                        <div class="stat-value" id="live-temp" style="font-size: 2.2em;">--</div>
                        <div class="stat-label" style="color: #ff6b6b;">°C</div>
                    </div>
                    <div class="stat-box" style="background: linear-gradient(135deg, #1a2a3a, #2d4a5a); border: 2px solid #64b5f6;">
                        <div style="font-size: 0.9em; color: #aaa; margin-bottom: 5px;">Fan Speed</div>
                        <div class="stat-value" id="live-fan" style="font-size: 2.2em;">--</div>
                        <div class="stat-label" style="color: #64b5f6;">%</div>
                    </div>
                </div>
                
                <!-- Secondary Metrics Row -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px;">
                    <div class="stat-box" style="background: #2d2d2d; padding: 12px;">
                        <div style="font-size: 0.8em; color: #aaa; margin-bottom: 3px;">Power</div>
                        <div style="font-size: 1.6em; font-weight: bold; color: #ffb74d;" id="live-power">--</div>
                        <div style="font-size: 0.75em; color: #888;">W</div>
                    </div>
                    <div class="stat-box" style="background: #2d2d2d; padding: 12px;">
                        <div style="font-size: 0.8em; color: #aaa; margin-bottom: 3px;">Voltage</div>
                        <div style="font-size: 1.6em; font-weight: bold; color: #81c784;" id="live-voltage">--</div>
                        <div style="font-size: 0.75em; color: #888;">mV</div>
                    </div>
                    <div class="stat-box" style="background: #2d2d2d; padding: 12px;">
                        <div style="font-size: 0.8em; color: #aaa; margin-bottom: 3px;">Core Speed</div>
                        <div style="font-size: 1.6em; font-weight: bold; color: #ba68c8;" id="live-frequency">--</div>
                        <div style="font-size: 0.75em; color: #888;">MHz</div>
                    </div>
                    <div class="stat-box" style="background: #2d2d2d; padding: 12px;">
                        <div style="font-size: 0.8em; color: #aaa; margin-bottom: 3px;">VR Temperature</div>
                        <div style="font-size: 1.6em; font-weight: bold; color: #ff9800;" id="live-vr-temp">--</div>
                        <div style="font-size: 0.75em; color: #888;">°C</div>
                    </div>
                    <div class="stat-box" style="background: #2d2d2d; padding: 12px;">
                        <div style="font-size: 0.8em; color: #aaa; margin-bottom: 3px;">ASIC Error Rate</div>
                        <div style="font-size: 1.6em; font-weight: bold; color: #e91e63;" id="live-error">--</div>
                        <div style="font-size: 0.75em; color: #888;">%</div>
                    </div>
                </div>
                
                <!-- Charts Row (Side by Side) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
                    <div class="chart-container" style="min-height: 300px;">
                        <canvas id="hashrate-chart"></canvas>
                    </div>
                    <div class="chart-container" style="min-height: 300px;">
                        <canvas id="temp-chart"></canvas>
                    </div>
                </div>
                <div class="chart-container" style="min-height: 300px; margin-top: 15px;">
                    <canvas id="power-chart"></canvas>
                </div>
            </div>
        </div>
        
        <!-- Sessions Tab -->
        <div id="sessions" class="tab-content">
            <div class="card">
                <h2>📊 Benchmark Sessions</h2>
                
                <!-- Bulk Actions Bar -->
                <div id="sessions-bulk-bar" style="display: none; background: #2d2d2d; padding: 10px 15px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; color: #aaa;">
                            <input type="checkbox" id="select-all-sessions" onchange="toggleSelectAllSessions()">
                            <span>Select All</span>
                        </label>
                        <span id="sessions-selected-count" style="color: #888;">0 selected</span>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="deleteOldSessions(7)" style="background: #444; padding: 6px 12px;">🗑️ Delete > 7 days</button>
                        <button onclick="deleteSelectedSessions()" id="delete-selected-btn" style="background: #ff3333; padding: 6px 12px;" disabled>🗑️ Delete Selected</button>
                    </div>
                </div>
                
                <div id="sessions-list"></div>
            </div>
        </div>
        
        <!-- Profiles Tab -->
        <div id="profiles" class="tab-content">
            <div class="card">
                <h2>📋 Device Profiles</h2>
                <p style="color: #aaa; margin-bottom: 20px;">Profiles are auto-generated from benchmark results. Apply them here or use them in AxeShed for scheduling.</p>
                <div id="profiles-list"></div>
            </div>
        </div>
    </div>
    
    <!-- Benchmark Completion Modal (Blocking) -->
    <div id="benchmarkCompleteModal" class="completion-modal" style="display: none;">
        <div class="completion-content">
            <div id="completion-icon" class="completion-icon">⚡</div>
            <div id="completion-title" class="completion-title">Benchmark Complete</div>
            
            <div class="completion-stats">
                <div class="completion-stat">
                    <span class="completion-stat-label">Status</span>
                    <span id="completion-status" class="completion-stat-value">--</span>
                </div>
                <div class="completion-stat">
                    <span class="completion-stat-label">Tests Completed</span>
                    <span id="completion-tests" class="completion-stat-value">--</span>
                </div>
                <div class="completion-stat">
                    <span class="completion-stat-label">Duration</span>
                    <span id="completion-duration" class="completion-stat-value">--</span>
                </div>
                <div id="completion-stop-reason-row" class="completion-stat" style="display: none;">
                    <span class="completion-stat-label">Stopped Because</span>
                    <span id="completion-stop-reason" class="completion-stat-value" style="color: #ff9800;">--</span>
                </div>
            </div>
            
            <div id="completion-best-result" style="background: linear-gradient(135deg, #1a3d1a, #2d4a2d); border-radius: 8px; padding: 15px; margin-bottom: 15px; display: none;">
                <div style="font-size: 0.85em; color: #81c784; margin-bottom: 8px;">🏆 Best Result</div>
                <div id="completion-best-hashrate" style="font-size: 1.5em; font-weight: bold; color: #4caf50;">-- GH/s</div>
                <div id="completion-best-vf" style="color: #aaa; font-size: 0.9em;">-- mV @ -- MHz</div>
                <div id="completion-best-efficiency" style="color: #888; font-size: 0.85em;">-- J/TH</div>
            </div>
            
            <div id="completion-suggestion" class="completion-message" style="background: #1a1a1a; border-radius: 6px; padding: 12px; text-align: left; display: none;">
                <span style="color: #ff9800;">💡 Suggestion:</span>
                <span id="completion-suggestion-text" style="color: #ccc;"></span>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 15px; justify-content: center;">
                <button id="completion-logs-btn" onclick="viewCompletionLogs()" style="background: #444; display: none;">📋 View Logs</button>
                <button onclick="closeCompletionModal()" style="background: #4caf50; min-width: 150px;">✓ Continue</button>
            </div>
        </div>
    </div>
    
    <!-- Session Logs Modal -->
    <div id="sessionLogsModal" class="modal">
        <div class="modal-content" style="max-width: 800px; max-height: 90vh; display: flex; flex-direction: column;">
            <span class="close" onclick="closeSessionLogsModal()">&times;</span>
            <h2>📋 Session Logs</h2>
            <div id="session-logs-info" style="margin-bottom: 15px; padding: 10px; background: #252525; border-radius: 6px; flex-shrink: 0;">
                <span id="session-logs-title"></span>
            </div>
            <div id="session-logs-content" style="flex: 1; min-height: 200px; max-height: 60vh; overflow-y: auto; background: #1a1a1a; border-radius: 6px; padding: 10px; font-family: monospace; font-size: 0.85em;">
            </div>
            <div style="margin-top: 15px; display: flex; gap: 10px; flex-shrink: 0;">
                <button onclick="copySessionLogs()" style="background: #444;">📋 Copy to Clipboard</button>
                <button onclick="downloadSessionLogs()" style="background: #2196f3;">💾 Download</button>
                <button onclick="closeSessionLogsModal()" class="secondary">Close</button>
            </div>
        </div>
    
    <!-- Save Tune Result Modal -->
    <div id="saveTuneModal" class="modal">
      <div class="modal-content" style="max-width: 480px;">
        <span class="close" onclick="closeSaveTuneModal()">&times;</span>
        <h2>Save this tuning result?</h2>

        <div id="save-tune-summary" style="font-size: 0.85em; color: #ccc; margin-bottom: 10px;"></div>

        <label for="save-profile-type" style="display:block; margin-top:10px; font-size:0.9em;">Profile type:</label>
        <select id="save-profile-type" style="width: 100%; padding: 6px; margin-top:4px; background:#222; color:#fff; border-radius:4px; border:1px solid #444;">
          <option value="max_hashrate">Max Hashrate</option>
          <option value="balanced">Balanced</option>
          <option value="efficient">Efficient</option>
          <option value="quiet">Quiet</option>
          <option value="custom">Custom Name</option>
        </select>

        <input id="custom-profile-name" placeholder="Enter custom name"
               style="display:none; width: 100%; margin-top:8px; padding:6px; background:#222; color:#fff; border-radius:4px; border:1px solid #444;">

        <label style="display:block; margin-top:14px; font-size:0.9em;">Save mode:</label>
        <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
          <button id="overwrite-preset" onclick="handleSaveTuneClick(true)" style="flex:1; padding:8px; background:#ff9800; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Overwrite preset</button>
          <button id="save-new-preset" onclick="handleSaveTuneClick(false)" style="flex:1; padding:8px; background:#4caf50; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Save as new profile</button>
        </div>
        <button id="cancel-save" onclick="closeSaveTuneModal()" style="margin-top:10px; width:100%; padding:8px; background:#555; border:none; border-radius:4px; cursor:pointer;">Just log result</button>
      </div>
    </div>

</div>
    
    <!-- Device Detail Modal -->
    <div id="deviceDetailModal" class="modal">
        <div class="modal-content" style="max-width: 600px;">
            <span class="close" onclick="closeDeviceDetailModal()">&times;</span>
            
            <!-- View Mode -->
            <div id="device-detail-view">
                <h2 style="display: flex; align-items: center; gap: 10px;">
                    <span>📱</span>
                    <span id="detail-device-name">Device Name</span>
                    <span id="detail-device-status" style="font-size: 0.5em; padding: 4px 8px; border-radius: 4px; background: #4caf50; color: white;">Online</span>
                </h2>
                
                <!-- Live Status -->
                <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <div style="color: #888; font-size: 0.85em; margin-bottom: 10px;">⚡ Live Status</div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                        <div style="text-align: center;">
                            <div id="detail-hashrate" style="font-size: 1.3em; font-weight: bold; color: #ff3333;">--</div>
                            <div style="font-size: 0.75em; color: #666;">GH/s</div>
                        </div>
                        <div style="text-align: center;">
                            <div id="detail-temp" style="font-size: 1.3em; font-weight: bold; color: #ff9800;">--</div>
                            <div style="font-size: 0.75em; color: #666;">°C Chip</div>
                        </div>
                        <div style="text-align: center;">
                            <div id="detail-power" style="font-size: 1.3em; font-weight: bold; color: #2196f3;">--</div>
                            <div style="font-size: 0.75em; color: #666;">Watts</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;">
                        <div style="text-align: center;">
                            <div style="color: #aaa; font-size: 0.9em;"><span id="detail-voltage">--</span>mV</div>
                            <div style="font-size: 0.7em; color: #666;">Voltage</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="color: #aaa; font-size: 0.9em;"><span id="detail-frequency">--</span>MHz</div>
                            <div style="font-size: 0.7em; color: #666;">Frequency</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="color: #aaa; font-size: 0.9em;"><span id="detail-fan">--</span>%</div>
                            <div style="font-size: 0.7em; color: #666;">Fan</div>
                        </div>
                    </div>
                </div>
                
                <!-- Device Settings (Read-only in view mode) -->
                <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <div style="color: #888; font-size: 0.85em; margin-bottom: 10px;">🔧 Device Settings</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9em;">
                        <div style="color: #666;">IP Address:</div>
                        <div id="detail-ip" style="color: #fff;">--</div>
                        <div style="color: #666;">Model:</div>
                        <div id="detail-model" style="color: #fff;">--</div>
                    </div>
                </div>
                
                <!-- PSU Info -->
                <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <div style="color: #888; font-size: 0.85em; margin-bottom: 10px;">🔌 Power Supply</div>
                    <div id="detail-psu-info">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9em;">
                            <div style="color: #666;">Type:</div>
                            <div id="detail-psu-type" style="color: #ff9800;">--</div>
                            <div style="color: #666;">Capacity:</div>
                            <div id="detail-psu-capacity" style="color: #fff;">--</div>
                            <div style="color: #666;">Safe Limit:</div>
                            <div id="detail-psu-safe" style="color: #4caf50;">--</div>
                        </div>
                        <div style="margin-top: 10px;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 4px;">
                                <span style="color: #888;">Current Draw:</span>
                                <span id="detail-psu-current" style="color: #fff;">-- W</span>
                            </div>
                            <div style="background: #333; height: 8px; border-radius: 4px; overflow: hidden;">
                                <div id="detail-psu-bar" style="height: 100%; width: 0%; background: #4caf50; transition: width 0.3s;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Saved Profiles -->
                <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <div style="color: #888; font-size: 0.85em; margin-bottom: 10px;">📋 Saved Profiles</div>
                    <div id="detail-profiles-list" style="font-size: 0.9em;">
                        <div style="color: #666; text-align: center; padding: 10px;">No profiles saved</div>
                    </div>
                </div>
                
                <!-- Actions -->
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="enterDeviceEditMode()" style="flex: 1; background: #2196f3;">✏️ Edit Settings</button>
                    <button onclick="restartDeviceFromModal()" style="background: #ff9800;">🔄 Restart</button>
                    <button onclick="removeDeviceFromModal()" style="background: #f44336;">🗑️ Remove</button>
                </div>
            </div>
            
            <!-- Edit Mode -->
            <div id="device-detail-edit" style="display: none;">
                <h2>✏️ Edit Device</h2>
                
                <div class="form-group">
                    <label>Device Name</label>
                    <input type="text" id="edit-device-name" placeholder="Device name">
                    <small style="color: #ff9800;">⚠️ Changing name may orphan existing profiles and sessions</small>
                </div>
                
                <div class="form-group">
                    <label>IP Address</label>
                    <input type="text" id="edit-device-ip" placeholder="192.168.1.100">
                </div>
                
                <div class="form-group">
                    <label>Model</label>
                    <select id="edit-device-model">
                        <option value="gamma">Gamma (BM1370)</option>
                        <option value="supra">Supra (BM1368)</option>
                        <option value="ultra">Ultra (BM1366)</option>
                        <option value="hex">Hex (BM1366 x6)</option>
                        <option value="max">Max (BM1397)</option>
                        <option value="nerdqaxe">NerdQAxe (BM1370 x1)</option>
                        <option value="nerdqaxe_plus">NerdQAxe+ (BM1370 x2)</option>
                        <option value="nerdqaxe_plus_plus">NerdQAxe++ (BM1370 x4)</option>
                        <option value="unknown">Other/Unknown</option>
                    </select>
                </div>
                
                <!-- PSU Configuration -->
                <div style="background: #252525; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <label style="color: #ff9800; margin-bottom: 10px; display: block;">🔌 Power Supply</label>
                    
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label style="font-size: 0.9em;">PSU Type</label>
                        <select id="edit-device-psu-type" onchange="toggleEditPsuConfig()">
                            <option value="standalone">Standalone (dedicated PSU)</option>
                            <option value="shared">Shared (external multi-device PSU)</option>
                        </select>
                    </div>
                    
                    <!-- Standalone PSU Config -->
                    <div id="edit-standalone-psu-config">
                        <div style="display: flex; gap: 10px; align-items: end;">
                            <div style="flex: 1;">
                                <label style="font-size: 0.85em;">Voltage</label>
                                <select id="edit-device-psu-voltage" onchange="calculateEditPsuLimits()">
                                    <option value="5">5V</option>
                                    <option value="12">12V</option>
                                </select>
                            </div>
                            <div style="flex: 1;">
                                <label style="font-size: 0.85em;">Amperage</label>
                                <select id="edit-device-psu-amps" onchange="calculateEditPsuLimits()">
                                    <option value="4">4A</option>
                                    <option value="5">5A</option>
                                    <option value="6">6A</option>
                                    <option value="7">7A</option>
                                    <option value="8">8A</option>
                                    <option value="10">10A</option>
                                </select>
                            </div>
                            <div style="flex: 1;">
                                <label style="font-size: 0.85em;">Or Direct W</label>
                                <input type="number" id="edit-device-psu-watts" placeholder="W" min="10" max="200" onchange="directEditWattsChanged()">
                            </div>
                        </div>
                        <div style="margin-top: 10px; padding: 10px; background: #1a1a1a; border-radius: 6px; font-size: 0.85em;">
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #888;">Capacity:</span>
                                <span id="edit-psu-capacity" style="color: white;">25W</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #888;">Safe (80%):</span>
                                <span id="edit-psu-safe" style="color: #4caf50;">20W</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Shared PSU Config -->
                    <div id="edit-shared-psu-config" style="display: none;">
                        <div class="form-group">
                            <label style="font-size: 0.85em;">Select Shared PSU</label>
                            <select id="edit-device-shared-psu">
                                <option value="">-- Select --</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Edit Actions -->
                <div style="display: flex; gap: 10px;">
                    <button onclick="saveDeviceEdits()" style="flex: 1; background: #4caf50;">💾 Save Changes</button>
                    <button onclick="cancelDeviceEdit()" style="flex: 1;" class="secondary">Cancel</button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Shared PSU Modal (Add/Edit) -->
    <div id="sharedPsuModal" class="modal">
        <div class="modal-content" style="max-width: 450px;">
            <span class="close" onclick="closeSharedPsuModal()">&times;</span>
            <h2 id="shared-psu-modal-title">🔌 Add Shared PSU</h2>
            
            <div class="form-group">
                <label>PSU Name</label>
                <input type="text" id="shared-psu-name" placeholder="e.g., Main Bench PSU">
            </div>
            
            <div class="form-group">
                <label>Configuration Method</label>
                <select id="shared-psu-method" onchange="toggleSharedPsuMethod()">
                    <option value="va">Voltage × Amperage</option>
                    <option value="watts">Direct Watts</option>
                </select>
            </div>
            
            <!-- V×A Method -->
            <div id="shared-psu-va-config">
                <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <div style="flex: 1;">
                        <label style="font-size: 0.9em;">Voltage</label>
                        <select id="shared-psu-voltage" onchange="calculateSharedPsuLimits()">
                            <option value="5">5V</option>
                            <option value="12">12V</option>
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <label style="font-size: 0.9em;">Amperage</label>
                        <select id="shared-psu-amps" onchange="calculateSharedPsuLimits()">
                            <option value="5">5A</option>
                            <option value="6">6A</option>
                            <option value="8">8A</option>
                            <option value="10">10A</option>
                            <option value="15">15A</option>
                            <option value="20">20A</option>
                            <option value="30">30A</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <!-- Direct Watts Method -->
            <div id="shared-psu-watts-config" style="display: none;">
                <div class="form-group">
                    <label>Capacity (Watts)</label>
                    <input type="number" id="shared-psu-watts" placeholder="e.g., 50" min="10" max="500" onchange="calculateSharedPsuLimits()">
                </div>
            </div>
            
            <!-- Calculated Limits -->
            <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #888;">Total Capacity:</span>
                    <span id="shared-psu-calc-capacity" style="color: white; font-weight: bold;">25W</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #888;">Safe Limit (80%):</span>
                    <span id="shared-psu-calc-safe" style="color: #4caf50; font-weight: bold;">20W</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: #888;">Warning (70%):</span>
                    <span id="shared-psu-calc-warning" style="color: #ff9800;">17.5W</span>
                </div>
            </div>
            
            <!-- Assigned Devices (shown in edit mode) -->
            <div id="shared-psu-devices-section" style="display: none; background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="color: #888; font-size: 0.85em; margin-bottom: 10px;">📱 Assigned Devices</div>
                <div id="shared-psu-devices-list" style="font-size: 0.9em;">
                    <span style="color: #666;">No devices assigned</span>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button onclick="saveSharedPsu()" style="flex: 1; background: #4caf50;">💾 Save</button>
                <button onclick="closeSharedPsuModal()" style="flex: 1;" class="secondary">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Add Device Modal -->
    <div id="addDeviceModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeAddDeviceModal()">&times;</span>
            <h2>Add New Device</h2>
            <div class="form-group">
                <label>IP Address</label>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="new-device-ip" placeholder="192.168.1.100" style="flex: 1;">
                    <button onclick="autoDetectDevice()" style="width: auto; padding: 10px 20px;">🔍 Detect</button>
                </div>
            </div>
            <div id="detected-info" style="display: none; background: #1a3d1a; border: 1px solid #4caf50; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
                <strong style="color: #4caf50;">✓ Device Detected</strong>
                <div style="color: #aaa; margin-top: 10px;">
                    <div>Model: <span id="detected-model" style="color: white;"></span> (<span id="detected-chip"></span>)</div>
                    <div>Hostname: <span id="detected-hostname" style="color: white;"></span></div>
                    <div>Current: <span id="detected-hashrate" style="color: #ff3333;"></span> GH/s @ <span id="detected-temp"></span>°C</div>
                </div>
            </div>
            <div class="form-group">
                <label>Device Name</label>
                <input type="text" id="new-device-name" placeholder="My Bitaxe">
            </div>
            <div class="form-group">
                <label>Model (auto-detected)</label>
                <select id="new-device-model">
                    <option value="gamma">Gamma (BM1370)</option>
                    <option value="supra">Supra (BM1368)</option>
                    <option value="ultra">Ultra (BM1366)</option>
                    <option value="hex">Hex (BM1366 x6)</option>
                    <option value="max">Max (BM1397)</option>
                    <option value="nerdqaxe">NerdQAxe (BM1370 x1)</option>
                    <option value="nerdqaxe_plus">NerdQAxe+ (BM1370 x2)</option>
                    <option value="nerdqaxe_plus_plus">NerdQAxe++ (BM1370 x4)</option>
                    <option value="unknown">Other/Unknown</option>
                </select>
            </div>
            
            <!-- PSU Configuration -->
            <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #333;">
                <label style="color: #ff9800; margin-bottom: 10px; display: block;">🔌 Power Supply Configuration</label>
                
                <div class="form-group" style="margin-bottom: 10px;">
                    <label style="font-size: 0.9em;">PSU Type</label>
                    <select id="new-device-psu-type" onchange="togglePsuConfig()">
                        <option value="standalone">Standalone (dedicated PSU)</option>
                        <option value="shared">Shared (external multi-device PSU)</option>
                    </select>
                </div>
                
                <!-- Standalone PSU Config -->
                <div id="standalone-psu-config">
                    <div style="display: flex; gap: 10px; align-items: end;">
                        <div style="flex: 1;">
                            <label style="font-size: 0.85em;">Voltage</label>
                            <select id="new-device-psu-voltage" onchange="calculatePsuLimits()">
                                <option value="5">5V</option>
                                <option value="12">12V</option>
                            </select>
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 0.85em;">Amperage</label>
                            <select id="new-device-psu-amps" onchange="calculatePsuLimits()">
                                <option value="4">4A</option>
                                <option value="5" selected>5A</option>
                                <option value="6">6A</option>
                                <option value="7">7A</option>
                                <option value="8">8A</option>
                                <option value="10">10A</option>
                            </select>
                        </div>
                        <div style="flex: 1; text-align: center;">
                            <label style="font-size: 0.85em;">Or Direct</label>
                            <input type="number" id="new-device-psu-watts-direct" placeholder="W" min="10" max="200" style="width: 100%;" onchange="directWattsChanged()">
                        </div>
                    </div>
                    <div style="margin-top: 10px; padding: 10px; background: #252525; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
                            <span style="color: #888;">PSU Capacity:</span>
                            <span id="psu-capacity" style="color: white;">25W</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
                            <span style="color: #888;">Safe Limit (80%):</span>
                            <span id="psu-safe-limit" style="color: #4caf50; font-weight: bold;">20W</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
                            <span style="color: #888;">Warning (70%):</span>
                            <span id="psu-warning" style="color: #ff9800;">17.5W</span>
                        </div>
                    </div>
                </div>
                
                <!-- Shared PSU Config -->
                <div id="shared-psu-config" style="display: none;">
                    <div class="form-group" style="margin-bottom: 10px;">
                        <label style="font-size: 0.85em;">Select Shared PSU</label>
                        <select id="new-device-shared-psu">
                            <option value="">-- Select or create --</option>
                        </select>
                    </div>
                    <button type="button" onclick="openCreateSharedPsuModal()" style="width: 100%; background: #444;">+ Create New Shared PSU</button>
                </div>
            </div>
            
            <button onclick="addDevice()">Add Device</button>
        </div>
    </div>
    
    <!-- Profile Generation Modal -->
    <div id="profileModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeProfileModal()">&times;</span>
            <h2>💾 Save Profiles</h2>
            <p style="color: #aaa; margin-bottom: 15px;">Generate optimized profiles from your benchmark results:</p>
            <div id="generated-profiles" style="margin-bottom: 20px;"></div>
            <div id="profile-overwrite-warning" style="display: none; background: #ff9800; color: white; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                ⚠️ Profiles already exist for this device. Saving will overwrite them.
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="saveGeneratedProfiles()" style="flex: 1;">Save Profiles</button>
                <button onclick="closeProfileModal()" class="secondary" style="flex: 1;">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Nano Tune Goal Selection Modal -->
    <div id="nanoTuneModal" class="modal">
        <div class="modal-content" style="max-width: 500px;">
            <span class="close" onclick="closeNanoTuneModal()">&times;</span>
            <h2>🔬 Nano Tune Optimization</h2>
            <p style="color: #aaa; margin-bottom: 15px;">Select your optimization goal for <strong id="nano-tune-profile-name"></strong>:</p>
            
            <div id="nano-tune-goals" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                <div class="nano-goal-option" data-goal="max_hashrate" onclick="selectNanoGoal('max_hashrate')" 
                     style="background: #1a1a1a; border: 2px solid #3d3d3d; border-radius: 8px; padding: 15px; cursor: pointer; transition: all 0.2s;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.5em;">⚡</span>
                        <div>
                            <strong style="color: #ff9800;">Max Hashrate</strong><br>
                            <small style="color: #888;">Push voltage & frequency higher for maximum mining output. Uses more power.</small>
                        </div>
                    </div>
                </div>
                
                <div class="nano-goal-option" data-goal="balanced" onclick="selectNanoGoal('balanced')" 
                     style="background: #1a1a1a; border: 2px solid #9c27b0; border-radius: 8px; padding: 15px; cursor: pointer; transition: all 0.2s;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.5em;">⚖️</span>
                        <div>
                            <strong style="color: #9c27b0;">Balanced</strong><br>
                            <small style="color: #888;">Best hashrate-per-watt ratio. Good performance with reasonable power.</small>
                        </div>
                    </div>
                </div>
                
                <div class="nano-goal-option" data-goal="efficient" onclick="selectNanoGoal('efficient')" 
                     style="background: #1a1a1a; border: 2px solid #3d3d3d; border-radius: 8px; padding: 15px; cursor: pointer; transition: all 0.2s;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.5em;">🌱</span>
                        <div>
                            <strong style="color: #4caf50;">Efficient</strong><br>
                            <small style="color: #888;">Minimize power consumption. Lower voltage & frequency for best J/TH.</small>
                        </div>
                    </div>
                </div>
                
                <div class="nano-goal-option" data-goal="quiet" onclick="selectNanoGoal('quiet')" 
                     style="background: #1a1a1a; border: 2px solid #3d3d3d; border-radius: 8px; padding: 15px; cursor: pointer; transition: all 0.2s;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.5em;">🤫</span>
                        <div>
                            <strong style="color: #03a9f4;">Quiet Mode</strong><br>
                            <small style="color: #888;">Minimize fan noise. Find lowest fan speed while maintaining stability.</small>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Quiet Mode fan target input -->
            <div id="nano-quiet-settings" style="background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 15px; display: none;">
                <label style="color: #03a9f4;">Target Maximum Fan Speed (%)</label>
                <input type="range" id="nano-target-fan" min="20" max="80" value="40" 
                       oninput="document.getElementById('nano-fan-value').textContent = this.value + '%'"
                       style="width: 100%; margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; color: #888; font-size: 0.85em;">
                    <span>20% (Silent)</span>
                    <span id="nano-fan-value" style="color: #03a9f4; font-weight: bold;">40%</span>
                    <span>80% (Loud)</span>
                </div>
            </div>
            
            <div id="nano-tune-info" style="background: #2d2d2d; padding: 10px; border-radius: 6px; margin-bottom: 15px; display: none;">
                <small style="color: #aaa;">
                    <strong>Base Settings:</strong> <span id="nano-base-voltage"></span>mV @ <span id="nano-base-frequency"></span>MHz<br>
                    <strong>Test Range:</strong> <span id="nano-test-range"></span>
                </small>
            </div>
            
            
            
            <div style="display: flex; gap: 10px;">
                <button id="nano-tune-start-btn" onclick="startNanoTune()" style="flex: 1;" disabled>Select a Goal Above</button>
                <button onclick="closeNanoTuneModal()" class="secondary" style="flex: 1;">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Edit Profile Modal -->
    <div id="editProfileModal" class="modal">
        <div class="modal-content" style="max-width: 550px; max-height: 90vh; overflow-y: auto;">
            <span class="close" onclick="closeEditProfileModal()">&times;</span>
            <h2>✏️ <span id="edit-profile-title">Edit Profile</span></h2>
            
            <input type="hidden" id="edit-profile-device" />
            <input type="hidden" id="edit-profile-original-name" />
            
            <!-- Basic Settings -->
            <div style="background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <h3 style="margin: 0 0 10px 0; color: #4caf50; font-size: 1em;">⚙️ Basic Settings</h3>
                
                <div class="form-group" style="margin-bottom: 10px;">
                    <label>Profile Name</label>
                    <input type="text" id="edit-profile-name" placeholder="e.g., quiet, max, custom1" />
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div class="form-group">
                        <label>Voltage (mV)</label>
                        <input type="number" id="edit-profile-voltage" min="1000" max="1500" step="5" />
                    </div>
                    <div class="form-group">
                        <label>Frequency (MHz)</label>
                        <input type="number" id="edit-profile-frequency" min="300" max="900" step="5" />
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Fan Target Temperature</label>
                    <select id="edit-profile-fan-target">
                        <option value="55">55°C (Cool - More Fan)</option>
                        <option value="58">58°C</option>
                        <option value="60">60°C (Normal)</option>
                        <option value="62">62°C</option>
                        <option value="65" selected>65°C (Default)</option>
                        <option value="68">68°C</option>
                        <option value="70">70°C (Warm - Less Fan)</option>
                    </select>
                </div>
            </div>
            
            <!-- Benchmark Config (for Nano Tune) -->
            <div style="background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <h3 style="margin: 0 0 10px 0; color: #ff9800; font-size: 1em;">🔧 Benchmark Config</h3>
                <small style="color: #888; display: block; margin-bottom: 10px;">Used when running Nano Tune on this profile</small>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div class="form-group">
                        <label>PSU Wattage Limit (W)</label>
                        <input type="number" id="edit-profile-psu-wattage" min="15" max="200" step="5" value="22" />
                    </div>
                    <div class="form-group">
                        <label>PSU Type</label>
                        <select id="edit-profile-psu-type">
                            <option value="stock">Stock PSU</option>
                            <option value="upgraded">Upgraded PSU</option>
                        </select>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div class="form-group">
                        <label>Max Chip Temp (°C)</label>
                        <input type="number" id="edit-profile-max-chip-temp" min="50" max="80" step="1" value="65" />
                    </div>
                    <div class="form-group">
                        <label>Max VR Temp (°C)</label>
                        <input type="number" id="edit-profile-max-vr-temp" min="60" max="100" step="1" value="85" />
                    </div>
                    <div class="form-group">
                        <label>Max Power (W)</label>
                        <input type="number" id="edit-profile-max-power" min="10" max="200" step="1" value="22" />
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-group">
                        <label>Test Duration (s)</label>
                        <input type="number" id="edit-profile-test-duration" min="60" max="1800" step="30" value="120" />
                    </div>
                    <div class="form-group">
                        <label>Warmup Time (s)</label>
                        <input type="number" id="edit-profile-warmup" min="5" max="300" step="5" value="10" />
                    </div>
                </div>
            </div>
            
            <!-- Results (from benchmark) -->
            <div style="background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <h3 style="margin: 0 0 10px 0; color: #2196f3; font-size: 1em;">📊 Benchmark Results</h3>
                <small style="color: #888; display: block; margin-bottom: 10px;">Recorded values from testing</small>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div class="form-group">
                        <label>Expected Hashrate (GH/s)</label>
                        <input type="number" id="edit-profile-hashrate" min="0" max="2000" step="0.1" />
                    </div>
                    <div class="form-group">
                        <label>Expected Power (W)</label>
                        <input type="number" id="edit-profile-power" min="0" max="200" step="0.1" />
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div class="form-group">
                        <label>Efficiency (J/TH)</label>
                        <input type="number" id="edit-profile-efficiency" min="0" max="100" step="0.01" />
                    </div>
                    <div class="form-group">
                        <label>Stability Score</label>
                        <input type="number" id="edit-profile-stability" min="0" max="100" step="1" />
                    </div>
                    <div class="form-group">
                        <label>Avg Fan %</label>
                        <input type="number" id="edit-profile-fan-speed" min="0" max="100" step="1" />
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="form-group">
                        <label>Avg Chip Temp (°C)</label>
                        <input type="number" id="edit-profile-avg-chip-temp" min="0" max="100" step="0.1" />
                    </div>
                    <div class="form-group">
                        <label>Avg VR Temp (°C)</label>
                        <input type="number" id="edit-profile-avg-vr-temp" min="0" max="120" step="0.1" />
                    </div>
                </div>
            </div>
            
            <!-- Notes & Metadata -->
            <div style="background: #2d2d2d; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <h3 style="margin: 0 0 10px 0; color: #9c27b0; font-size: 1em;">📝 Notes</h3>
                <textarea id="edit-profile-notes" rows="2" style="width: 100%; background: #1a1a1a; color: white; border: 1px solid #3d3d3d; border-radius: 6px; padding: 10px;" placeholder="e.g., Tested stable for 24 hours, optimized for low power..."></textarea>
                <div id="edit-profile-metadata" style="margin-top: 10px; font-size: 0.85em; color: #666;"></div>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button onclick="saveEditedProfile()" style="flex: 1;">💾 Save Profile</button>
                <button onclick="closeEditProfileModal()" class="secondary" style="flex: 1;">Cancel</button>
            </div>
        </div>
    </div>
    
    <script>
        const API_BASE = '';
        let monitoringInterval = null;
        let hashrateChart, tempChart, powerChart;
        let monitoringData = {
            time: [],
            hashrate: [],
            temp: [],
            power: [],
            voltage: []
        };
        
        
        // ============================================================
        // Easy / Geek mode toggle
        // ============================================================
        const MODE_KEY = "axebench_ui_mode";
        document.addEventListener('DOMContentLoaded', () => {
            const sw = document.getElementById('mode-switch');
            if (sw) {
                sw.addEventListener('change', () => {
                    setUiMode(sw.checked ? 'geek' : 'easy');
                });
            }

            // Restore any persisted AutoTune banner text on reload
            try {
                const saved = localStorage.getItem('axebench_auto_tune_banner');
                if (saved) {
                    updateAutoTuneBanner(saved);
                }
            } catch (e) {
                console.warn('AutoTune banner persistence unavailable:', e);
            }
        });
 // 'easy' or 'geek'

        function getUiMode() {
            const m = localStorage.getItem(MODE_KEY);
            return (m === 'geek' || m === 'easy') ? m : 'easy'; // default EASY
        }

        
function applyUiMode(mode) {
            document.body.dataset.mode = mode;

            // Easy/Geek visibility is handled by CSS using body[data-mode]
            const sw = document.getElementById('mode-switch');
            if (sw) {
                sw.checked = (mode === 'geek');
            }
        }

        function setUiMode(mode) {
            const next = (mode === 'geek') ? 'geek' : 'easy';
            localStorage.setItem(MODE_KEY, next);
            applyUiMode(next);
        }
// ============================================================
        // Toast Notification System
        // ============================================================
        function showToast(message, type = 'info', duration = 5000) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            
            const icons = {
                info: 'ℹ️',
                success: '✅',
                warning: '⚠️',
                error: '❌'
            };
            
            toast.innerHTML = `
                <span class="toast-icon">${icons[type]}</span>
                <span class="toast-message">${message}</span>
                <span class="toast-close" onclick="this.parentElement.remove()">×</span>
            `;
            
            container.appendChild(toast);
            
            // Auto-remove after duration
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease-out forwards';
                setTimeout(() => toast.remove(), 300);
            }, duration);
            
            // Click to dismiss
            toast.onclick = () => {
                toast.style.animation = 'slideOut 0.3s ease-out forwards';
                setTimeout(() => toast.remove(), 300);
            };
        }
        
        // ============================================================
        // ============================================================
        // Event Log System with localStorage persistence
        // ============================================================
        let eventLog = [];
        const EVENT_LOG_STORAGE_KEY = 'axebench_event_log';
        
        // Load logs from localStorage on startup
        function loadEventLogFromStorage() {
            try {
                const stored = localStorage.getItem(EVENT_LOG_STORAGE_KEY);
                if (stored) {
                    eventLog = JSON.parse(stored);
                    updateEventLogDisplay();
                }
            } catch (e) {
                console.warn('Failed to load event log from storage:', e);
                eventLog = [];
            }
        }
        
        // Save logs to localStorage
        function saveEventLogToStorage() {
            try {
                localStorage.setItem(EVENT_LOG_STORAGE_KEY, JSON.stringify(eventLog));
            } catch (e) {
                console.warn('Failed to save event log to storage:', e);
            }
        }
        
        function logEvent(message, type = 'info') {
            const now = new Date();
            const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            eventLog.push({ time, message, type });
            
            // Save to localStorage
            saveEventLogToStorage();
            
            updateEventLogDisplay();
            
            // Also show toast for important events
            if (type === 'error' || type === 'warning') {
                showToast(message, type);
            }
        }
        
        function updateEventLogDisplay() {
            const logDiv = document.getElementById('event-log');
            if (!logDiv) return;
            
            // Show ALL logs, newest first
            logDiv.innerHTML = eventLog.slice().reverse().map(entry => `
                <div class="event-log-entry ${entry.type}">
                    <span class="time">${entry.time}</span>
                    <span class="msg">${entry.message}</span>
                </div>
            `).join('');
            
            // Update count and last entry for collapsed view
            const countSpan = document.getElementById('event-log-count');
            const lastSpan = document.getElementById('event-log-last');
            if (countSpan) countSpan.textContent = `(${eventLog.length} entries)`;
            if (lastSpan && eventLog.length > 0) {
                const last = eventLog[eventLog.length - 1];
                lastSpan.textContent = last.message.substring(0, 40) + (last.message.length > 40 ? '...' : '');
            }
        }
        
        function clearEventLog() {
            eventLog.length = 0;
            saveEventLogToStorage();
            updateEventLogDisplay();
        }
        
        function toggleEventLog() {
            const expanded = document.getElementById('event-log-expanded');
            const icon = document.getElementById('event-log-toggle-icon');
            if (expanded.style.display === 'none') {
                expanded.style.display = 'block';
                icon.textContent = '▼';
            } else {
                expanded.style.display = 'none';
                icon.textContent = '▶';
            }
        }
        
        // ============================================================
        // Temperature/Power Bar Updates
        // ============================================================
        function updateTempBar(barId, current, max, labelId, min = 0) {
            const bar = document.getElementById(barId);
            const label = document.getElementById(labelId);
            if (!bar || !label) return;
            
            label.textContent = current?.toFixed(1) || '--';
            
            if (current === null || current === undefined) {
                bar.style.width = '0%';
                return;
            }
            
            // Calculate percent within range (min to max)
            const range = max - min;
            const percent = Math.min(100, Math.max(0, ((current - min) / range) * 100));
            bar.style.width = percent + '%';
            
            // Color based on how close to limit
            const ratio = (current - min) / range;
            bar.className = 'temp-bar-fill ' + (ratio < 0.7 ? 'safe' : ratio < 0.9 ? 'warm' : 'hot');
        }
        
        // Error Banner Functions
        function showErrorBanner(title, message, suggestion = '') {
            const banner = document.getElementById('error-banner');
            document.getElementById('error-banner-title').textContent = title;
            document.getElementById('error-banner-message').textContent = message;
            document.getElementById('error-banner-suggestion').textContent = suggestion;
            banner.style.display = 'block';
        }
        
        function dismissErrorBanner() {
            document.getElementById('error-banner').style.display = 'none';
        }
        
        // Form Disable/Enable During Benchmark
        function setBenchmarkFormDisabled(disabled) {
            const formContainer = document.getElementById('benchmark-config-form');
            
            if (formContainer) {
                if (disabled) {
                    formContainer.classList.add('benchmark-form-disabled');
                } else {
                    formContainer.classList.remove('benchmark-form-disabled');
                }
            }
            
            // Also disable individual inputs for accessibility
            const inputs = document.querySelectorAll('#benchmark-config-form input, #benchmark-config-form select');
            inputs.forEach(input => {
                input.disabled = disabled;
            });
        }
        
        // V/F Range Position Update
        function updateRangePosition(currentV, currentF, vStart, vStop, fStart, fStop) {
            // Update range labels
            document.getElementById('voltage-range-start').textContent = vStart;
            document.getElementById('voltage-range-stop').textContent = vStop;
            document.getElementById('freq-range-start').textContent = fStart;
            document.getElementById('freq-range-stop').textContent = fStop;
            
            // Calculate positions (0-100%)
            const vRange = vStop - vStart;
            const fRange = fStop - fStart;
            
            const vPercent = vRange > 0 ? Math.max(0, Math.min(100, ((currentV - vStart) / vRange) * 100)) : 50;
            const fPercent = fRange > 0 ? Math.max(0, Math.min(100, ((currentF - fStart) / fRange) * 100)) : 50;
            
            // Update bars and markers
            document.getElementById('voltage-position-bar').style.width = vPercent + '%';
            document.getElementById('voltage-position-marker').style.left = vPercent + '%';
            
            document.getElementById('freq-position-bar').style.width = fPercent + '%';
            document.getElementById('freq-position-marker').style.left = fPercent + '%';
        }
        
        
        // Best So Far Tracking (goal-aware)
        window.bestResult = null;
        window.bestResultGoal = null;
        window.bestSeenHashrate = 0;
        window.previousV = null;
        window.previousF = null;

        
        function getGoalMeta(goal) {
            const key = (goal || '').toLowerCase();
            switch (key) {
                case 'max_hashrate':
                    return { icon: '⚡', label: 'Max Hashrate' };
                case 'balanced':
                    return { icon: '⚖️', label: 'Balanced' };
                case 'efficient':
                    return { icon: '🌱', label: 'Efficient' };
                case 'quiet':
                    return { icon: '🤫', label: 'Quiet' };
                default:
                    return { icon: '', label: '' };
            }
        }

        function updateGoalBadge(goal) {
            const meta = getGoalMeta(goal);
            const iconEl = document.getElementById('goal-icon');
            const nameEl = document.getElementById('goal-name');
            if (iconEl) iconEl.textContent = meta.icon;
            if (nameEl) nameEl.textContent = meta.label || '';
        }

function isBetter(newRes, bestRes, goal, bestSeenHashrate, fanTarget) {
            if (!bestRes) return true;

            switch (goal) {
                case "max_hashrate":
                    return newRes.hashrate > bestRes.hashrate;

                case "efficient":
                    // Reject if hashrate < 50% of best seen so far
                    if (bestSeenHashrate && newRes.hashrate < bestSeenHashrate * 0.50) return false;
                    // Win if efficiency (J/TH) is lower
                    return newRes.efficiency < bestRes.efficiency;

                case "balanced":
                    // Block silly low-hash results
                    if (bestSeenHashrate && newRes.hashrate < bestSeenHashrate * 0.65) return false;

                    // Prefer lower J/TH when throughput decent
                    const effDelta = bestRes.efficiency - newRes.efficiency;

                    if (Math.abs(effDelta) > 1.0) {
                        return newRes.efficiency < bestRes.efficiency;
                    }

                    // If efficiency similar, prefer higher GH/s (TH/s after conversion)
                    return newRes.hashrate > bestRes.hashrate;

                case "quiet":
                    const underCapNew  = newRes.fan <= fanTarget;
                    const underCapBest = bestRes.fan <= fanTarget;

                    if (underCapNew && !underCapBest) return true;
                    if (!underCapNew && underCapBest) return false;

                    // Both under or both over
                    if (newRes.fan !== bestRes.fan) {
                        return newRes.fan < bestRes.fan;
                    }

                    if (newRes.efficiency !== bestRes.efficiency) {
                        return newRes.efficiency < bestRes.efficiency;
                    }

                    return newRes.hashrate > bestRes.hashrate;
            }

            return false;
        }

        function formatTrophy(result, goal) {
            if (!result) return "--";

            // Convert GH/s -> TH/s for display
            const ths = (result.hashrate || 0) / 1000;

            switch (goal) {
                case "max_hashrate":
                    return `${ths.toFixed(2)} TH/s @ ${result.voltage}mV / ${result.frequency}MHz`;

                case "efficient":
                    return `${result.efficiency.toFixed(2)} J/TH @ ${result.voltage}mV / ${result.frequency}MHz`;

                case "balanced":
                    return `${ths.toFixed(2)} TH/s • ${result.efficiency.toFixed(2)} J/TH`;

                case "quiet":
                    return `${ths.toFixed(2)} TH/s • ${result.efficiency.toFixed(2)} J/TH • Fan ${result.fan.toFixed ? result.fan.toFixed(0) : result.fan}%`;

                default:
                    return `${ths.toFixed(2)} TH/s @ ${result.voltage}mV / ${result.frequency}MHz`;
            }
        }

        function updateBestSoFarFromSample(ld, efficiency, goal) {
            if (!ld || !ld.hashrate || !ld.voltage || !ld.frequency) return;

            const hashrate = ld.hashrate;
            const voltage = ld.voltage;
            const frequency = ld.frequency;

            // Track best seen hashrate for gating logic
            if (!window.bestSeenHashrate || hashrate > window.bestSeenHashrate) {
                window.bestSeenHashrate = hashrate;
            }

            const fanSpeed = ld.fan_speed ?? ld.fanSpeed ?? ld.fanspeedpercent ?? ld.fan ?? 0;
            const chipTemp = ld.temp ?? ld.chip_temp ?? null;
            const vrTemp = ld.vr_temp ?? null;
            const power = ld.power ?? null;
            const stability = ld.stability ?? ld.stability_score ?? null;

            let fanTarget = (window.benchmarkConfig && window.benchmarkConfig.fan_target) ||
                              (parseInt(document.getElementById('fan-target')?.value) || 0) || 0;

            // For Quiet goal, prefer the user's "too loud" threshold if set
            const gKey = (goal || (document.getElementById('goal')?.value) || 'max_hashrate').toLowerCase();
            if (gKey === 'quiet') {
                if (typeof window.quietFanThreshold === 'number' && window.quietFanThreshold > 0 && window.quietFanThreshold <= 100) {
                    fanTarget = window.quietFanThreshold;
                } else if (!fanTarget) {
                    fanTarget = 60;
                }
            }

            const newRes = {
                hashrate,
                voltage,
                frequency,
                efficiency: efficiency != null ? efficiency : (power && hashrate ? (power / hashrate) * 1000 : null),
                power,
                fan: fanSpeed || 0,
                chip_temp: chipTemp,
                vr_temp: vrTemp,
                stability: stability
            };

            const bestSeen = window.bestResult;
            const goalKey = goal || (document.getElementById('goal')?.value) || 'max_hashrate';
            const bestHash = window.bestSeenHashrate || hashrate;

            if (!bestSeen || isBetter(newRes, bestSeen, goalKey, bestHash, fanTarget)) {
                window.bestResult = newRes;
                window.bestResultGoal = goalKey;
            }

            const bestDiv = document.getElementById('best-so-far');
            const compactSpan = document.getElementById('best-so-far-compact');

            if (window.bestResult && bestDiv) {
                const r = window.bestResult;
                const ths = (r.hashrate || 0) / 1000;
                const goalLabelMap = {
                    'max_hashrate': 'Max Hashrate',
                    'efficient': 'Efficient',
                    'balanced': 'Balanced',
                    'quiet': 'Quiet'
                };
                const goalLabel = goalLabelMap[window.bestResultGoal] || 'Best Result';

                const headlineMetric = (function() {
                    switch (window.bestResultGoal) {
                        case 'efficient':
                            return `${r.efficiency?.toFixed(2) || '--'} J/TH`;
                        case 'balanced':
                            return `${ths.toFixed(2)} TH/s • ${r.efficiency?.toFixed(2) || '--'} J/TH`;
                        case 'quiet':
                            const cap = (typeof window.quietFanThreshold === 'number' && window.quietFanThreshold > 0 && window.quietFanThreshold <= 100)
                                ? ` (cap ${window.quietFanThreshold}%`
                                : '';
                            return `${ths.toFixed(2)} TH/s • ${r.efficiency?.toFixed(2) || '--'} J/TH • Fan ${r.fan?.toFixed ? r.fan.toFixed(0) : r.fan}%${cap}`;
                        default:
                            return `${ths.toFixed(2)} TH/s`;
                    }
                })();

                bestDiv.style.display = 'block';
                bestDiv.innerHTML = `
                    <div style="font-size: 0.8em; color: #888;">BEST RESULT (${goalLabel})</div>
                    <div style="font-size: 1.2em; font-weight: bold; color: #4caf50;">${headlineMetric}</div>
                    <div style="font-size: 0.85em; color: #ccc; margin-top: 4px;">
                        ${ths.toFixed(2)} TH/s @ ${r.voltage}mV / ${r.frequency}MHz
                    </div>
                    <div style="font-size: 0.75em; color: #aaa; margin-top: 4px;">
                        Fan ${r.fan?.toFixed ? r.fan.toFixed(0) : r.fan || '--'}% | Chip ${r.chip_temp ?? '--'}°C | VR ${r.vr_temp ?? '--'}°C
                    </div>
                    <div style="font-size: 0.75em; color: #aaa;">
                        Power ${r.power?.toFixed ? r.power.toFixed(1) : r.power || '--'}W | Stability ${r.stability != null ? r.stability.toFixed ? r.stability.toFixed(1) : r.stability : '--'}%
                    </div>
                `;
            }

            if (window.bestResult && compactSpan) {
                compactSpan.textContent = `🏆 ${formatTrophy(window.bestResult, window.bestResultGoal || goal)}`;
            }
        }

// Trend Arrows
        function updateTrendArrows(currentV, currentF) {
            const arrows = document.getElementById('trend-arrows');
            if (!arrows) return;
            
            let vArrow = '', fArrow = '';
            
            if (window.previousV !== null) {
                if (currentV > window.previousV) vArrow = '⬆️';
                else if (currentV < window.previousV) vArrow = '⬇️';
                else vArrow = '➡️';
            }
            
            if (window.previousF !== null) {
                if (currentF > window.previousF) fArrow = '⬆️';
                else if (currentF < window.previousF) fArrow = '⬇️';
                else fArrow = '➡️';
            }
            
            window.previousV = currentV;
            window.previousF = currentF;
            
            arrows.innerHTML = `<span title="Voltage trend">${vArrow}</span><span title="Frequency trend">${fArrow}</span>`;
        }
        
        // Time Remaining Estimate
        window.benchmarkStartTime = null;
        window.totalTestsExpected = 0;
        
        function updateTimeRemaining(testsCompleted, testsTotal, durationPerTest) {
            const timeDiv = document.getElementById('time-remaining');
            if (!timeDiv) return;
            
            if (!window.benchmarkStartTime) {
                window.benchmarkStartTime = Date.now();
                window.totalTestsExpected = testsTotal;
            }
            
            if (testsCompleted === 0) {
                timeDiv.textContent = 'Calculating...';
                return;
            }
            
            const elapsed = (Date.now() - window.benchmarkStartTime) / 1000;
            const avgTimePerTest = elapsed / testsCompleted;
            const remaining = (testsTotal - testsCompleted) * avgTimePerTest;
            
            // Format time
            if (remaining > 3600) {
                const hours = Math.floor(remaining / 3600);
                const mins = Math.floor((remaining % 3600) / 60);
                timeDiv.textContent = `~${hours}h ${mins}m`;
            } else if (remaining > 60) {
                const mins = Math.floor(remaining / 60);
                const secs = Math.floor(remaining % 60);
                timeDiv.textContent = `~${mins}m ${secs}s`;
            } else {
                timeDiv.textContent = `~${Math.floor(remaining)}s`;
            }
        }
        
        // Hashrate Comparison Bar
        function updateHashrateComparison(actual, target) {
            const container = document.getElementById('hashrate-comparison');
            const bar = document.getElementById('hashrate-actual-bar');
            const percentSpan = document.getElementById('hashrate-percent');
            const targetSpan = document.getElementById('hashrate-target-value');

            // If any required element is missing, just skip updating
            if (!container || !bar || !percentSpan || !targetSpan) {
                return;
            }

            if (!target || target <= 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';
            targetSpan.textContent = target.toFixed(1);

            const percent = (actual / target) * 100;
            percentSpan.textContent = percent.toFixed(0) + '%';

            // Bar width (capped at 120% for display)
            const barWidth = Math.min(120, percent);
            bar.style.width = barWidth + '%';

            // Color based on performance
            bar.classList.remove('hashrate-bar-over', 'hashrate-bar-close', 'hashrate-bar-under');
            if (percent >= 95) {
                bar.classList.add('hashrate-bar-over');
                percentSpan.style.color = '#4caf50';
            } else if (percent >= 75) {
                bar.classList.add('hashrate-bar-close');
                percentSpan.style.color = '#ff9800';
            } else {
                bar.classList.add('hashrate-bar-under');
                percentSpan.style.color = '#f44336';
            }
        }
        
        // Reset benchmark UI state
        function resetBenchmarkUIState() {
            window.bestResult = null;
            window.bestResultGoal = null;
            window.bestSeenHashrate = 0;
            window.previousV = null;
            window.previousF = null;
            window.benchmarkStartTime = null;
            window.totalTestsExpected = 0;
            window.lastBenchmarkMessage = null;
            window.lastRecoveryAction = null;

            const bestDiv = document.getElementById('best-so-far');
            if (bestDiv) {
                bestDiv.textContent = '--';
                bestDiv.style.display = 'none';
            }
            const compactSpan = document.getElementById('best-so-far-compact');
            if (compactSpan) {
                compactSpan.textContent = '🏆 --';
            }
            document.getElementById('time-remaining').textContent = 'Calculating...';
            document.getElementById('trend-arrows').innerHTML = '';
            document.getElementById('hashrate-comparison').style.display = 'none';
            dismissErrorBanner();
        }
        
        // ============================================================
        // Tab switching
        // ============================================================
        function showTab(tabName) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById(tabName).classList.add('active');
            
            if (tabName === 'monitoring') {
                initCharts();
            }
            if (tabName === 'profiles') {
                loadProfiles();
            }
        }
        
        // Device Management
        function showAddDeviceModal() {
            document.getElementById('addDeviceModal').style.display = 'block';
            document.getElementById('detected-info').style.display = 'none';
            document.getElementById('new-device-name').value = '';
            document.getElementById('new-device-ip').value = '';
        }
        
        function closeAddDeviceModal() {
            document.getElementById('addDeviceModal').style.display = 'none';
        }
        
        // PSU Configuration Functions
        function togglePsuConfig() {
            const psuType = document.getElementById('new-device-psu-type').value;
            document.getElementById('standalone-psu-config').style.display = psuType === 'standalone' ? 'block' : 'none';
            document.getElementById('shared-psu-config').style.display = psuType === 'shared' ? 'block' : 'none';
            if (psuType === 'shared') {
                loadSharedPsus();
            }
        }
        
        function calculatePsuLimits() {
            const voltage = parseInt(document.getElementById('new-device-psu-voltage').value) || 5;
            const amps = parseInt(document.getElementById('new-device-psu-amps').value) || 5;
            const capacity = voltage * amps;
            const safeLimit = Math.round(capacity * 0.8 * 10) / 10;
            const warning = Math.round(capacity * 0.7 * 10) / 10;
            
            document.getElementById('psu-capacity').textContent = capacity + 'W';
            document.getElementById('psu-safe-limit').textContent = safeLimit + 'W';
            document.getElementById('psu-warning').textContent = warning + 'W';
            
            // Clear direct watts input since we're using V*A
            document.getElementById('new-device-psu-watts-direct').value = '';
        }
        
        function directWattsChanged() {
            const directWatts = parseInt(document.getElementById('new-device-psu-watts-direct').value);
            if (directWatts && directWatts > 0) {
                const safeLimit = Math.round(directWatts * 0.8 * 10) / 10;
                const warning = Math.round(directWatts * 0.7 * 10) / 10;
                
                document.getElementById('psu-capacity').textContent = directWatts + 'W';
                document.getElementById('psu-safe-limit').textContent = safeLimit + 'W';
                document.getElementById('psu-warning').textContent = warning + 'W';
            }
        }
        
        function getPsuConfig() {
            const psuType = document.getElementById('new-device-psu-type').value;
            
            if (psuType === 'shared') {
                const sharedPsuId = document.getElementById('new-device-shared-psu').value;
                return {
                    type: 'shared',
                    shared_psu_id: sharedPsuId
                };
            } else {
                const directWatts = parseInt(document.getElementById('new-device-psu-watts-direct').value);
                const voltage = parseInt(document.getElementById('new-device-psu-voltage').value) || 5;
                const amps = parseInt(document.getElementById('new-device-psu-amps').value) || 5;
                const capacity = directWatts || (voltage * amps);
                
                return {
                    type: 'standalone',
                    voltage: voltage,
                    amps: amps,
                    capacity_watts: capacity,
                    safe_watts: Math.round(capacity * 0.8 * 10) / 10,
                    warning_watts: Math.round(capacity * 0.7 * 10) / 10
                };
            }
        }
        
        // Shared PSU Management
        let sharedPsus = [];
        
        async function loadSharedPsus() {
            try {
                const response = await fetch(`${API_BASE}/api/psus`);
                if (response.ok) {
                    sharedPsus = await response.json();
                    const select = document.getElementById('new-device-shared-psu');
                    select.innerHTML = '<option value="">-- Select or create --</option>';
                    sharedPsus.forEach(psu => {
                        select.innerHTML += `<option value="${psu.id}">${psu.name} (${psu.capacity_watts}W, ${psu.devices_count} devices)</option>`;
                    });
                }
            } catch (error) {
                console.error('Error loading shared PSUs:', error);
            }
        }
        
        // Shared PSU Modal Functions
        let editingPsuId = null;
        
        function openCreateSharedPsuModal() {
            editingPsuId = null;
            document.getElementById('shared-psu-modal-title').textContent = '🔌 Add Shared PSU';
            document.getElementById('shared-psu-name').value = '';
            document.getElementById('shared-psu-method').value = 'va';
            document.getElementById('shared-psu-voltage').value = '5';
            document.getElementById('shared-psu-amps').value = '10';
            document.getElementById('shared-psu-watts').value = '';
            document.getElementById('shared-psu-devices-section').style.display = 'none';
            toggleSharedPsuMethod();
            calculateSharedPsuLimits();
            document.getElementById('sharedPsuModal').style.display = 'block';
        }
        
        async function openEditSharedPsuModal(psuId) {
            editingPsuId = psuId;
            document.getElementById('shared-psu-modal-title').textContent = '🔌 Edit Shared PSU';
            
            try {
                const response = await fetch(`${API_BASE}/api/psus`);
                if (response.ok) {
                    const psus = await response.json();
                    const psu = psus.find(p => p.id === psuId);
                    
                    if (psu) {
                        document.getElementById('shared-psu-name').value = psu.name || '';
                        
                        // Determine if it was created via V×A or direct watts
                        // For now, just use direct watts for editing
                        document.getElementById('shared-psu-method').value = 'watts';
                        document.getElementById('shared-psu-watts').value = psu.capacity_watts || 50;
                        toggleSharedPsuMethod();
                        calculateSharedPsuLimits();
                        
                        // Load assigned devices
                        const devicesResp = await fetch(`${API_BASE}/api/psus/${psuId}/devices`);
                        if (devicesResp.ok) {
                            const devicesData = await devicesResp.json();
                            const devicesList = document.getElementById('shared-psu-devices-list');
                            
                            if (devicesData.devices && devicesData.devices.length > 0) {
                                devicesList.innerHTML = devicesData.devices.map(d => 
                                    `<div style="padding: 4px 0; border-bottom: 1px solid #333;">
                                        <span style="color: #fff;">${d.name}</span>
                                        <span style="color: #888; margin-left: 10px;">${d.power.toFixed(1)}W</span>
                                    </div>`
                                ).join('');
                            } else {
                                devicesList.innerHTML = '<span style="color: #666;">No devices assigned</span>';
                            }
                            document.getElementById('shared-psu-devices-section').style.display = 'block';
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading PSU for edit:', error);
                showToast('Error loading PSU', 'error');
                return;
            }
            
            document.getElementById('sharedPsuModal').style.display = 'block';
        }
        
        function closeSharedPsuModal() {
            document.getElementById('sharedPsuModal').style.display = 'none';
            editingPsuId = null;
        }
        
        function toggleSharedPsuMethod() {
            const method = document.getElementById('shared-psu-method').value;
            document.getElementById('shared-psu-va-config').style.display = method === 'va' ? 'block' : 'none';
            document.getElementById('shared-psu-watts-config').style.display = method === 'watts' ? 'block' : 'none';
            calculateSharedPsuLimits();
        }
        
        function calculateSharedPsuLimits() {
            const method = document.getElementById('shared-psu-method').value;
            let capacity;
            
            if (method === 'va') {
                const voltage = parseInt(document.getElementById('shared-psu-voltage').value) || 5;
                const amps = parseInt(document.getElementById('shared-psu-amps').value) || 10;
                capacity = voltage * amps;
            } else {
                capacity = parseInt(document.getElementById('shared-psu-watts').value) || 50;
            }
            
            const safeLimit = Math.round(capacity * 0.8 * 10) / 10;
            const warning = Math.round(capacity * 0.7 * 10) / 10;
            
            document.getElementById('shared-psu-calc-capacity').textContent = capacity + 'W';
            document.getElementById('shared-psu-calc-safe').textContent = safeLimit + 'W';
            document.getElementById('shared-psu-calc-warning').textContent = warning + 'W';
        }
        
        async function saveSharedPsu() {
            const name = document.getElementById('shared-psu-name').value.trim();
            if (!name) {
                alert('Please enter a PSU name');
                return;
            }
            
            const method = document.getElementById('shared-psu-method').value;
            let capacity;
            
            if (method === 'va') {
                const voltage = parseInt(document.getElementById('shared-psu-voltage').value) || 5;
                const amps = parseInt(document.getElementById('shared-psu-amps').value) || 10;
                capacity = voltage * amps;
            } else {
                capacity = parseInt(document.getElementById('shared-psu-watts').value);
                if (!capacity || capacity < 10) {
                    alert('Please enter a valid capacity (minimum 10W)');
                    return;
                }
            }
            
            const psuData = {
                name: name,
                capacity_watts: capacity,
                safe_watts: Math.round(capacity * 0.8),
                warning_watts: Math.round(capacity * 0.7)
            };
            
            try {
                let response;
                if (editingPsuId) {
                    // Update existing PSU
                    response = await fetch(`${API_BASE}/api/psus/${editingPsuId}`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(psuData)
                    });
                } else {
                    // Create new PSU
                    response = await fetch(`${API_BASE}/api/psus`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(psuData)
                    });
                }
                
                if (response.ok) {
                    showToast(editingPsuId ? 'PSU updated' : 'PSU created', 'success');
                    closeSharedPsuModal();
                    loadSharedPsus();  // Update dropdown
                    loadSharedPsusDisplay();  // Update cards display
                } else {
                    const err = await response.json();
                    showToast(err.error || 'Failed to save PSU', 'error');
                }
            } catch (error) {
                console.error('Error saving PSU:', error);
                showToast('Error saving PSU', 'error');
            }
        }
        
        async function createSharedPsu(name, capacityWatts) {
            try {
                const response = await fetch(`${API_BASE}/api/psus`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        name: name,
                        capacity_watts: capacityWatts,
                        safe_watts: Math.round(capacityWatts * 0.8),
                        warning_watts: Math.round(capacityWatts * 0.7)
                    })
                });
                
                if (response.ok) {
                    showToast(`Shared PSU "${name}" created`, 'success');
                    loadSharedPsus();  // Update dropdown
                    loadSharedPsusDisplay();  // Update cards display
                } else {
                    showToast('Failed to create shared PSU', 'error');
                }
            } catch (error) {
                console.error('Error creating shared PSU:', error);
                showToast('Error creating shared PSU', 'error');
            }
        }
        
        // Benchmark Completion Modal Functions
        let completionSessionId = null;
        
        function showCompletionModal(status, type) {
            const modal = document.getElementById('benchmarkCompleteModal');
            
            // Set icon and title based on type
            const iconEl = document.getElementById('completion-icon');
            const titleEl = document.getElementById('completion-title');
            
            if (type === 'completed') {
                iconEl.textContent = '✅';
                titleEl.textContent = 'Benchmark Complete';
                titleEl.style.color = '#4caf50';
            } else if (type === 'stopped') {
                iconEl.textContent = '⏹️';
                titleEl.textContent = 'Benchmark Stopped';
                titleEl.style.color = '#ff9800';
            } else {
                iconEl.textContent = '⚠️';
                titleEl.textContent = 'Benchmark Ended';
                titleEl.style.color = '#f44336';
            }
            
            // Status
            document.getElementById('completion-status').textContent = type === 'completed' ? 'Success' : 'Stopped';
            document.getElementById('completion-status').style.color = type === 'completed' ? '#4caf50' : '#ff9800';
            
            // Tests completed
            const testsTotal = status.tests_total || window.totalTestsExpected || 0;
            document.getElementById('completion-tests').textContent = `${status.tests_completed || 0} of ${testsTotal}`;
            
            // Duration
            if (window.benchmarkStartTime) {
                const duration = Math.floor((Date.now() - window.benchmarkStartTime) / 1000);
                const mins = Math.floor(duration / 60);
                const secs = duration % 60;
                document.getElementById('completion-duration').textContent = `${mins}m ${secs}s`;
            } else {
                document.getElementById('completion-duration').textContent = '--';
            }
            
            // Stop reason
            const stopReasonRow = document.getElementById('completion-stop-reason-row');
            const stopReasonEl = document.getElementById('completion-stop-reason');
            if (status.stop_reason) {
                stopReasonRow.style.display = 'flex';
                stopReasonEl.textContent = status.stop_reason;
            } else if (status.tests_completed < testsTotal) {
                stopReasonRow.style.display = 'flex';
                // Try to determine reason from status
                if (status.failed_combos && status.failed_combos.length > 0) {
                    const lastFail = status.failed_combos[status.failed_combos.length - 1];
                    stopReasonEl.textContent = lastFail.reason || 'Limit reached';
                } else {
                    stopReasonEl.textContent = 'Thermal or power limit reached';
                }
            } else {
                stopReasonRow.style.display = 'none';
            }
            
            // Best result
            const bestResultDiv = document.getElementById('completion-best-result');
            if (window.bestResult) {
                bestResultDiv.style.display = 'block';
                document.getElementById('completion-best-hashrate').textContent = `${window.bestResult.hashrate.toFixed(1)} GH/s`;
                document.getElementById('completion-best-vf').textContent = `${window.bestResult.voltage}mV @ ${window.bestResult.frequency}MHz`;
                document.getElementById('completion-best-efficiency').textContent = `${window.bestResult.efficiency?.toFixed(2) || '--'} J/TH`;
            } else {
                bestResultDiv.style.display = 'none';
            }
            
            // Suggestion
            const suggestionDiv = document.getElementById('completion-suggestion');
            const suggestionText = document.getElementById('completion-suggestion-text');
            let suggestion = '';
            
            if (status.tests_completed === 0) {
                suggestion = 'No tests completed. Check device connectivity and try lowering voltage/frequency ranges.';
            } else if (status.tests_completed < testsTotal) {
                if (stopReasonEl.textContent.toLowerCase().includes('temp')) {
                    suggestion = 'Thermal limit was reached. Try increasing temp limit, improving cooling, or lowering voltage range.';
                } else if (stopReasonEl.textContent.toLowerCase().includes('power')) {
                    suggestion = 'Power limit was reached. Try increasing power limit or lowering voltage range.';
                } else if (stopReasonEl.textContent.toLowerCase().includes('error')) {
                    suggestion = 'High error rate detected. Try lowering frequency or increasing voltage.';
                } else {
                    suggestion = 'Some tests were skipped due to limits. Review the logs for details.';
                }
            } else if (window.bestResult && window.bestResult.efficiency > 20) {
                suggestion = 'Efficiency is high. Consider lowering voltage for better power consumption.';
            }
            
            if (suggestion) {
                suggestionDiv.style.display = 'block';
                suggestionText.textContent = suggestion;
            } else {
                suggestionDiv.style.display = 'none';
            }
            
            // Logs button - show if we have session ID
            completionSessionId = status.session_id || window.currentSessionId;
            const logsBtn = document.getElementById('completion-logs-btn');
            if (completionSessionId) {
                logsBtn.style.display = 'inline-block';
                logsBtn.textContent = `📋 View Logs (${eventLog.length})`;
            } else {
                logsBtn.style.display = 'none';
            }
            
            modal.style.display = 'flex';
        }
        
        function closeCompletionModal() {
            document.getElementById('benchmarkCompleteModal').style.display = 'none';
        }
        
        async function viewCompletionLogs() {
            closeCompletionModal();
            
            if (completionSessionId) {
                // Fetch logs from server
                try {
                    const response = await fetch(`${API_BASE}/api/sessions/${completionSessionId}/logs`);
                    if (response.ok) {
                        const data = await response.json();
                        currentSessionLogs = data.logs || [];
                        currentSessionTitle = `Session ${completionSessionId} - Just Completed`;
                        
                        document.getElementById('session-logs-title').innerHTML = `
                            <strong>${currentSessionTitle}</strong><br>
                            <span style="color: #888; font-size: 0.9em;">${currentSessionLogs.length} log entries</span>
                            ${data.stop_reason ? `<br><span style="color: #ff9800; font-size: 0.85em;">Stop reason: ${data.stop_reason}</span>` : ''}
                        `;
                        
                        const logsContent = document.getElementById('session-logs-content');
                        if (currentSessionLogs.length === 0) {
                            logsContent.innerHTML = '<p style="color: #666; text-align: center;">No logs available for this session</p>';
                        } else {
                            logsContent.innerHTML = currentSessionLogs.map(log => {
                                const color = log.type === 'success' ? '#4caf50' : 
                                              log.type === 'error' ? '#f44336' : 
                                              log.type === 'warning' ? '#ff9800' : 
                                              log.type === 'recovery' ? '#03a9f4' : '#aaa';
                                return `<div style="padding: 4px 0; border-bottom: 1px solid #333;">
                                    <span style="color: #666;">[${log.time}]</span> 
                                    <span style="color: ${color};">${log.message}</span>
                                </div>`;
                            }).join('');
                        }
                        
                        document.getElementById('sessionLogsModal').style.display = 'block';
                    }
                } catch (e) {
                    console.error('Failed to load logs:', e);
                    showToast('Failed to load logs', 'error');
                }
            }
        }
        
        // Session Logs Functions
        let currentSessionLogs = null;
        let currentSessionTitle = '';
        
        function viewSessionLogs(sessionIndex) {
            const sessions = JSON.parse(localStorage.getItem('benchmarkSessions') || '[]');
            if (sessionIndex < 0 || sessionIndex >= sessions.length) {
                alert('Session not found');
                return;
            }
            
            const session = sessions[sessionIndex];
            currentSessionLogs = session.logs || [];
            currentSessionTitle = `Session ${session.session_id?.substring(0, 8) || 'Unknown'} - ${new Date(session.start_time).toLocaleString()}`;
            
            document.getElementById('session-logs-title').innerHTML = `
                <strong>${currentSessionTitle}</strong><br>
                <span style="color: #888; font-size: 0.9em;">${currentSessionLogs.length} log entries</span>
            `;
            
            const logsContent = document.getElementById('session-logs-content');
            if (currentSessionLogs.length === 0) {
                logsContent.innerHTML = '<p style="color: #666; text-align: center;">No logs available for this session</p>';
            } else {
                logsContent.innerHTML = currentSessionLogs.map(log => {
                    const color = log.type === 'success' ? '#4caf50' : 
                                  log.type === 'error' ? '#f44336' : 
                                  log.type === 'warning' ? '#ff9800' : 
                                  log.type === 'recovery' ? '#03a9f4' : '#aaa';
                    return `<div style="padding: 4px 0; border-bottom: 1px solid #333;">
                        <span style="color: #666;">[${log.time}]</span> 
                        <span style="color: ${color};">${log.message}</span>
                    </div>`;
                }).join('');
            }
            
            document.getElementById('sessionLogsModal').style.display = 'block';
        }
        
        function closeSessionLogsModal() {
            document.getElementById('sessionLogsModal').style.display = 'none';
        }
        
        function copySessionLogs() {
            if (!currentSessionLogs || currentSessionLogs.length === 0) {
                alert('No logs to copy');
                return;
            }
            const text = currentSessionLogs.map(log => `[${log.time}] [${log.type}] ${log.message}`).join('\\n');
            navigator.clipboard.writeText(text).then(() => {
                showToast('Logs copied to clipboard', 'success');
            }).catch(() => {
                alert('Failed to copy logs');
            });
        }
        
        function downloadSessionLogs() {
            if (!currentSessionLogs || currentSessionLogs.length === 0) {
                alert('No logs to download');
                return;
            }
            const text = `AxeBench Session Logs\\n${currentSessionTitle}\\n${'='.repeat(50)}\\n\\n` +
                currentSessionLogs.map(log => `[${log.time}] [${log.type.toUpperCase()}] ${log.message}`).join('\\n');
            
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `axebench-logs-${Date.now()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        }
        
        async function autoDetectDevice() {
            const ip = document.getElementById('new-device-ip').value;
            if (!ip) {
                alert('Please enter an IP address first');
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/devices/detect`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ip })
                });
                
                if (response.ok) {
                    const info = await response.json();
                    
                    // Show detected info
                    document.getElementById('detected-info').style.display = 'block';
                    document.getElementById('detected-model').textContent = info.model.toUpperCase();
                    document.getElementById('detected-chip').textContent = info.asic_model || 'Unknown';
                    document.getElementById('detected-hostname').textContent = info.hostname || 'N/A';
                    document.getElementById('detected-hashrate').textContent = info.hashrate.toFixed(1);
                    document.getElementById('detected-temp').textContent = info.temp.toFixed(1);
                    
                    // Auto-fill name and model
                    document.getElementById('new-device-name').value = info.suggested_name;
                    document.getElementById('new-device-model').value = info.model;
                } else {
                    alert('Could not detect device. Check IP address and make sure device is online.');
                }
            } catch (error) {
                console.error('Error detecting device:', error);
                alert('Failed to connect to device');
            }
        }
        
        async function addDevice() {
            const name = document.getElementById('new-device-name').value;
            const ip = document.getElementById('new-device-ip').value;
            const model = document.getElementById('new-device-model').value;
            const psuConfig = getPsuConfig();
            
            if (!name || !ip) {
                alert('Please enter device name and IP address');
                return;
            }
            
            // Validate PSU config
            if (psuConfig.type === 'shared' && !psuConfig.shared_psu_id) {
                alert('Please select a shared PSU or create one');
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/devices`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name, ip, model, psu: psuConfig })
                });
                
                if (response.ok) {
                    closeAddDeviceModal();
                    document.getElementById('new-device-name').value = '';
                    document.getElementById('new-device-ip').value = '';
                    document.getElementById('detected-info').style.display = 'none';
                    showToast(`Device "${name}" added`, 'success', 2000);
                    // Small delay then reload
                    setTimeout(() => loadDevices(), 200);
                } else {
                    const err = await response.json();
                    alert(err.error || 'Failed to add device');
                }
            } catch (error) {
                console.error('Error adding device:', error);
                alert('Failed to add device');
            }
        }
        
        async function removeDevice(deviceName) {
            if (!confirm(`Remove device "${deviceName}"?`)) return;
            
            try {
                const response = await fetch(`${API_BASE}/api/devices/${deviceName}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showToast(`Device "${deviceName}" removed`, 'success', 2000);
                    // Small delay then reload
                    setTimeout(() => loadDevices(), 200);
                } else {
                    showToast('Failed to remove device', 'error', 3000);
                }
            } catch (error) {
                console.error('Error removing device:', error);
                showToast('Error removing device', 'error', 3000);
            }
        }
        
        async function setFanTarget(deviceName, deviceId) {
            // Use deviceId if provided, otherwise sanitize deviceName
            const selectId = deviceId || deviceName.replace(/[^a-zA-Z0-9]/g, '-');
            const select = document.getElementById(`fan-target-${selectId}`);
            
            if (!select) {
                alert('Error: Could not find fan control for this device');
                return;
            }
            
            const targetTemp = select.value;
            
            try {
                const encodedDevice = encodeURIComponent(deviceName);
                const response = await fetch(`${API_BASE}/api/devices/${encodedDevice}/fan`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        auto: targetTemp !== '',
                        target_temp: targetTemp ? parseInt(targetTemp) : null
                    })
                });
                
                if (response.ok) {
                    alert(targetTemp ? `Fan set to auto-target ${targetTemp}°C` : 'Fan set to manual mode');
                } else {
                    const err = await response.json();
                    alert('Failed to set fan mode: ' + (err.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error setting fan:', error);
                alert('Error setting fan mode');
            }
        }
        
        // ============ FLEET DASHBOARD FUNCTIONS ============
        
        let fleetRefreshInterval = null;
        let fleetDeviceData = {};
        
        async function refreshFleetDashboard() {
            try {
                const response = await fetch(`${API_BASE}/api/devices`);
                const devices = await response.json();
                
                document.getElementById('fleet-devices-total').textContent = devices.length;
                
                // Also populate dropdowns
                const deviceSelect = document.getElementById('device-select');
                const monitorSelect = document.getElementById('monitor-device-select');
                deviceSelect.innerHTML = '<option value="">Select device...</option>';
                monitorSelect.innerHTML = '<option value="">Select device...</option>';
                
                if (devices.length === 0) {
                    document.getElementById('device-cards').innerHTML = `
                        <div style="text-align: center; padding: 40px; color: #666; grid-column: 1 / -1;">
                            <div style="font-size: 3em; margin-bottom: 10px;">📡</div>
                            <div>No devices configured</div>
                            <div style="margin-top: 10px;">
                                <button onclick="showAddDeviceModal()" style="background: #4caf50; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; color: white;">
                                    ➕ Add Your First Device
                                </button>
                            </div>
                        </div>
                    `;
                    document.getElementById('fleet-devices-online').textContent = '0';
                    document.getElementById('fleet-hashrate').textContent = '--';
                    document.getElementById('fleet-efficiency').textContent = '--';
                    document.getElementById('fleet-hottest-temp').textContent = '--';
                    document.getElementById('fleet-hottest-name').textContent = '°C';
                    return;
                }
                
                // Fetch live status for each device
                const devicePromises = devices.map(async (device) => {
                    try {
                        const statusResp = await fetch(`${API_BASE}/api/devices/${device.name}/status`);
                        if (statusResp.ok) {
                            const status = await statusResp.json();
                            return { ...device, status, online: true };
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch status for ${device.name}`);
                    }
                    return { ...device, status: null, online: false };
                });
                
                const devicesWithStatus = await Promise.all(devicePromises);
                fleetDeviceData = devicesWithStatus;
                
                // Calculate fleet stats
                let totalHashrate = 0;
                let totalPower = 0;
                let onlineCount = 0;
                let hottestTemp = 0;
                let hottestDevice = '';
                
                devicesWithStatus.forEach(d => {
                    if (d.online && d.status) {
                        onlineCount++;
                        totalHashrate += d.status.hashrate || 0;
                        totalPower += d.status.power || 0;
                        if (d.status.temperature > hottestTemp) {
                            hottestTemp = d.status.temperature;
                            hottestDevice = d.name;
                        }
                    }
                    
                    // Populate dropdowns
                    const opt1 = document.createElement('option');
                    opt1.value = d.name;
                    opt1.textContent = d.name + (d.online ? '' : ' (offline)');
                    opt1.setAttribute('data-model', d.model);
                    deviceSelect.appendChild(opt1);
                    
                    const opt2 = document.createElement('option');
                    opt2.value = d.name;
                    opt2.textContent = d.name;
                    monitorSelect.appendChild(opt2);
                });
                
                // Update fleet stats
                document.getElementById('fleet-devices-online').textContent = onlineCount;
                document.getElementById('fleet-hashrate').textContent = totalHashrate > 0 ? totalHashrate.toFixed(1) : '--';
                
                const avgEfficiency = (totalHashrate > 0 && totalPower > 0) ? 
                    ((totalPower / (totalHashrate / 1000))).toFixed(1) : '--';
                document.getElementById('fleet-efficiency').textContent = avgEfficiency;
                
                document.getElementById('fleet-hottest-temp').textContent = hottestTemp > 0 ? hottestTemp.toFixed(1) : '--';
                document.getElementById('fleet-hottest-name').textContent = hottestDevice ? `${hottestDevice} °C` : '°C';
                
                // Render device cards
                renderDeviceCards(devicesWithStatus);
                
                // Update fleet alerts
                updateFleetAlerts(devicesWithStatus);
                
                // Update refresh timestamp
                document.getElementById('fleet-refresh-status').textContent = 'Updated just now';
                
            } catch (error) {
                console.error('Error refreshing fleet dashboard:', error);
            }
        }
        
        function renderDeviceCards(devices) {
            const container = document.getElementById('device-cards');
            
            const modelColors = {
                'gamma': '#ff3333',
                'supra': '#2196f3', 
                'ultra': '#9c27b0',
                'hex': '#ff9800',
                'max': '#4caf50',
                'nerdqaxe': '#00bcd4',
                'nerdqaxe_plus': '#00bcd4',
                'nerdqaxe_plus_plus': '#00bcd4'
            };
            
            container.innerHTML = devices.map(device => {
                const color = modelColors[device.model?.toLowerCase()] || '#666';
                const safeDeviceName = device.name.replace(/'/g, "\\'");
                const s = device.status || {};
                
                const statusDot = device.online ? 
                    '<span style="color: #4caf50;">🟢</span>' : 
                    '<span style="color: #f44336;">🔴</span>';
                
                const statusText = device.online ? 'Online' : 'Offline';
                
                // Temperature color coding
                let tempColor = '#4caf50';
                if (s.temperature > 65) tempColor = '#f44336';
                else if (s.temperature > 60) tempColor = '#ff9800';
                
                // Error rate color
                let errorColor = '#4caf50';
                if (s.error_percentage > 5) errorColor = '#f44336';
                else if (s.error_percentage > 2) errorColor = '#ff9800';
                
                return `
                    <div onclick="openDeviceDetail('${safeDeviceName}')" style="background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 15px; position: relative; cursor: pointer; transition: border-color 0.2s;" onmouseover="this.style.borderColor='#555'" onmouseout="this.style.borderColor='#333'">
                        <!-- Header -->
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                            <div>
                                <div style="font-weight: bold; font-size: 1.1em; color: white;">${device.name}</div>
                                <div style="display: inline-block; background: ${color}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.7em; font-weight: bold; margin-top: 4px;">
                                    ${(device.model || 'Unknown').toUpperCase()}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div>${statusDot} ${statusText}</div>
                                <div style="font-size: 0.75em; color: #666;">${device.ip}</div>
                            </div>
                        </div>
                        
                        ${device.online ? `
                        <!-- Stats Grid -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                            <div style="background: #2d2d2d; padding: 10px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 1.4em; font-weight: bold; color: #ff9800;">${s.hashrate?.toFixed(1) || '--'}</div>
                                <div style="font-size: 0.7em; color: #888;">GH/s</div>
                            </div>
                            <div style="background: #2d2d2d; padding: 10px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 1.4em; font-weight: bold; color: ${tempColor};">${s.temperature?.toFixed(1) || '--'}</div>
                                <div style="font-size: 0.7em; color: #888;">°C</div>
                            </div>
                            <div style="background: #2d2d2d; padding: 10px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 1.4em; font-weight: bold; color: #2196f3;">${s.power?.toFixed(1) || '--'}</div>
                                <div style="font-size: 0.7em; color: #888;">Watts</div>
                            </div>
                            <div style="background: #2d2d2d; padding: 10px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 1.4em; font-weight: bold; color: ${errorColor};">${s.error_percentage?.toFixed(2) || '--'}</div>
                                <div style="font-size: 0.7em; color: #888;">Err %</div>
                            </div>
                        </div>
                        
                        <!-- V/F Info -->
                        <div style="background: #252525; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85em;">
                            <span style="color: #888;">⚡</span> <span style="color: #81c784;">${s.voltage || '--'}mV</span>
                            <span style="margin: 0 8px; color: #444;">|</span>
                            <span style="color: #888;">🔄</span> <span style="color: #ba68c8;">${s.frequency || '--'}MHz</span>
                            <span style="margin: 0 8px; color: #444;">|</span>
                            <span style="color: #888;">🌀</span> <span style="color: #03a9f4;">${s.fan_speed?.toFixed(0) || '--'}%</span>
                        </div>
                        ` : `
                        <!-- Offline Message -->
                        <div style="text-align: center; padding: 20px; color: #666;">
                            <div style="font-size: 2em; margin-bottom: 5px;">📡</div>
                            <div>Device not responding</div>
                        </div>
                        `}
                        
                        <!-- Actions -->
                        <div style="display: flex; gap: 8px;" onclick="event.stopPropagation()">
                            <button onclick="quickBenchmark('${safeDeviceName}', '${device.model || ''}')" 
                                    style="flex: 1; background: #4caf50; border: none; padding: 8px; border-radius: 6px; cursor: pointer; color: white; font-size: 0.85em;"
                                    ${!device.online ? 'disabled style="opacity: 0.5; flex: 1; background: #333; border: none; padding: 8px; border-radius: 6px; color: #666;"' : ''}>
                                🚀 Benchmark
                            </button>
                            <button onclick="openDeviceDetail('${safeDeviceName}')" 
                                    style="background: #2196f3; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; color: white;">
                                ✏️
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        function quickBenchmark(deviceName, model) {
            showTab('benchmark');
            document.getElementById('device-select').value = deviceName;
            if (model) {
                document.getElementById('device-model').value = model.toLowerCase();
                loadModelProfile();
            }
            showToast(`Selected ${deviceName} for benchmarking`, 'info', 2000);
        }
        
        function quickMonitor(deviceName) {
            showTab('monitoring');
            document.getElementById('monitor-device-select').value = deviceName;
            startMonitoring();
        }
        
        // Device Detail Modal
        let currentDetailDevice = null;
        let currentDetailDeviceData = null;
        
        async function openDeviceDetail(deviceName) {
            currentDetailDevice = deviceName;
            
            // Show modal in view mode
            document.getElementById('device-detail-view').style.display = 'block';
            document.getElementById('device-detail-edit').style.display = 'none';
            document.getElementById('deviceDetailModal').style.display = 'block';
            
            // Set device name
            document.getElementById('detail-device-name').textContent = deviceName;
            
            // Load device data
            try {
                // Get device info from fleet data or fetch fresh
                const devicesResponse = await fetch(`${API_BASE}/api/devices`);
                const devices = await devicesResponse.json();
                const device = devices.find(d => d.name === deviceName);
                
                if (device) {
                    currentDetailDeviceData = device;
                    
                    // Populate settings
                    document.getElementById('detail-ip').textContent = device.ip;
                    document.getElementById('detail-model').textContent = getModelDisplayName(device.model);
                    
                    // Populate PSU info
                    if (device.psu) {
                        if (device.psu.type === 'standalone') {
                            document.getElementById('detail-psu-type').textContent = 'Standalone';
                            document.getElementById('detail-psu-capacity').textContent = `${device.psu.capacity_watts}W`;
                            document.getElementById('detail-psu-safe').textContent = `${device.psu.safe_watts}W`;
                        } else if (device.psu.type === 'shared') {
                            document.getElementById('detail-psu-type').textContent = 'Shared PSU';
                            document.getElementById('detail-psu-capacity').textContent = 'See PSU section';
                            document.getElementById('detail-psu-safe').textContent = '--';
                        }
                    } else {
                        document.getElementById('detail-psu-type').textContent = 'Not configured';
                        document.getElementById('detail-psu-capacity').textContent = '--';
                        document.getElementById('detail-psu-safe').textContent = '--';
                    }
                }
                
                // Get live status
                const statusResponse = await fetch(`${API_BASE}/api/devices/${encodeURIComponent(deviceName)}/status`);
                if (statusResponse.ok) {
                    const status = await statusResponse.json();
                    
                    document.getElementById('detail-device-status').textContent = 'Online';
                    document.getElementById('detail-device-status').style.background = '#4caf50';
                    
                    document.getElementById('detail-hashrate').textContent = status.hashrate?.toFixed(1) || '--';
                    document.getElementById('detail-temp').textContent = status.temp?.toFixed(1) || '--';
                    document.getElementById('detail-power').textContent = status.power?.toFixed(1) || '--';
                    document.getElementById('detail-voltage').textContent = status.voltage || '--';
                    document.getElementById('detail-frequency').textContent = status.frequency || '--';
                    document.getElementById('detail-fan').textContent = status.fan_speed?.toFixed(0) || '--';
                    
                    // Update PSU bar
                    if (device && device.psu && device.psu.safe_watts) {
                        const power = status.power || 0;
                        const percent = (power / device.psu.safe_watts) * 100;
                        const barColor = percent < 70 ? '#4caf50' : percent < 90 ? '#ff9800' : '#f44336';
                        document.getElementById('detail-psu-current').textContent = `${power.toFixed(1)} W`;
                        document.getElementById('detail-psu-bar').style.width = `${Math.min(100, percent)}%`;
                        document.getElementById('detail-psu-bar').style.background = barColor;
                    }
                } else {
                    document.getElementById('detail-device-status').textContent = 'Offline';
                    document.getElementById('detail-device-status').style.background = '#666';
                    
                    document.getElementById('detail-hashrate').textContent = '--';
                    document.getElementById('detail-temp').textContent = '--';
                    document.getElementById('detail-power').textContent = '--';
                    document.getElementById('detail-voltage').textContent = '--';
                    document.getElementById('detail-frequency').textContent = '--';
                    document.getElementById('detail-fan').textContent = '--';
                }
                
                // Load saved profiles
                await loadDeviceProfiles(deviceName);
                
            } catch (error) {
                console.error('Error loading device details:', error);
                showToast('Error loading device details', 'error');
            }
        }
        
        function getModelDisplayName(model) {
            const models = {
                'gamma': 'Gamma (BM1370)',
                'supra': 'Supra (BM1368)',
                'ultra': 'Ultra (BM1366)',
                'hex': 'Hex (BM1366 x6)',
                'max': 'Max (BM1397)',
                'nerdqaxe': 'NerdQAxe (BM1370 x1)',
                'nerdqaxe_plus': 'NerdQAxe+ (BM1370 x2)',
                'nerdqaxe_plus_plus': 'NerdQAxe++ (BM1370 x4)'
            };
            return models[model] || model || 'Unknown';
        }
        
        async function loadDeviceProfiles(deviceName) {
            const container = document.getElementById('detail-profiles-list');
            
            try {
                const response = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(deviceName)}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.profiles) {
                        const profileNames = ['quiet', 'efficient', 'max', 'nuclear', 'custom'];
                        const profileColors = {
                            quiet: '#4caf50',
                            efficient: '#2196f3', 
                            max: '#ff9800',
                            nuclear: '#f44336',
                            custom: '#9c27b0'
                        };
                        
                        let html = '';
                        for (const name of profileNames) {
                            const profile = data.profiles[name];
                            if (profile) {
                                html += `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #252525; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid ${profileColors[name] || '#666'};">
                                        <div>
                                            <strong style="color: ${profileColors[name] || '#fff'};">${name.charAt(0).toUpperCase() + name.slice(1)}</strong>
                                            <span style="color: #aaa; margin-left: 10px;">${profile.voltage}mV @ ${profile.frequency}MHz</span>
                                        </div>
                                        <button onclick="applyProfileFromDetail('${deviceName}', '${name}')" style="width: auto; min-height: auto; padding: 4px 12px; background: #333; font-size: 0.85em;">Apply</button>
                                    </div>
                                `;
                            }
                        }
                        
                        container.innerHTML = html || '<div style="color: #666; text-align: center; padding: 10px;">No profiles saved</div>';
                    } else {
                        container.innerHTML = '<div style="color: #666; text-align: center; padding: 10px;">No profiles saved</div>';
                    }
                } else {
                    container.innerHTML = '<div style="color: #666; text-align: center; padding: 10px;">No profiles saved</div>';
                }
            } catch (error) {
                console.error('Error loading profiles:', error);
                container.innerHTML = '<div style="color: #666; text-align: center; padding: 10px;">Error loading profiles</div>';
            }
        }
        
        async function applyProfileFromDetail(deviceName, profileName) {
            try {
                const response = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(deviceName)}/apply/${profileName}`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    showToast(`Applied ${profileName} profile`, 'success');
                    // Refresh the modal to show updated values
                    setTimeout(() => openDeviceDetail(deviceName), 1500);
                } else {
                    showToast('Failed to apply profile', 'error');
                }
            } catch (error) {
                showToast('Error applying profile', 'error');
            }
        }
        
        function closeDeviceDetailModal() {
            document.getElementById('deviceDetailModal').style.display = 'none';
            currentDetailDevice = null;
            currentDetailDeviceData = null;
        }
        
        function enterDeviceEditMode() {
            if (!currentDetailDeviceData) return;
            
            // Switch to edit mode
            document.getElementById('device-detail-view').style.display = 'none';
            document.getElementById('device-detail-edit').style.display = 'block';
            
            // Populate edit fields
            document.getElementById('edit-device-name').value = currentDetailDeviceData.name;
            document.getElementById('edit-device-ip').value = currentDetailDeviceData.ip;
            document.getElementById('edit-device-model').value = currentDetailDeviceData.model || 'gamma';
            
            // Populate PSU fields
            const psu = currentDetailDeviceData.psu || { type: 'standalone', capacity_watts: 25 };
            document.getElementById('edit-device-psu-type').value = psu.type || 'standalone';
            toggleEditPsuConfig();
            
            if (psu.type === 'standalone') {
                document.getElementById('edit-device-psu-voltage').value = psu.voltage || 5;
                document.getElementById('edit-device-psu-amps').value = psu.amps || 5;
                if (psu.capacity_watts && !psu.voltage) {
                    document.getElementById('edit-device-psu-watts').value = psu.capacity_watts;
                }
                calculateEditPsuLimits();
            } else if (psu.type === 'shared') {
                loadSharedPsusForEdit();
                document.getElementById('edit-device-shared-psu').value = psu.shared_psu_id || '';
            }
        }
        
        function toggleEditPsuConfig() {
            const psuType = document.getElementById('edit-device-psu-type').value;
            document.getElementById('edit-standalone-psu-config').style.display = psuType === 'standalone' ? 'block' : 'none';
            document.getElementById('edit-shared-psu-config').style.display = psuType === 'shared' ? 'block' : 'none';
            
            if (psuType === 'shared') {
                loadSharedPsusForEdit();
            }
        }
        
        async function loadSharedPsusForEdit() {
            try {
                const response = await fetch(`${API_BASE}/api/psus`);
                if (response.ok) {
                    const psus = await response.json();
                    const select = document.getElementById('edit-device-shared-psu');
                    select.innerHTML = '<option value="">-- Select --</option>';
                    psus.forEach(psu => {
                        select.innerHTML += `<option value="${psu.id}">${psu.name} (${psu.capacity_watts}W)</option>`;
                    });
                }
            } catch (error) {
                console.error('Error loading shared PSUs:', error);
            }
        }
        
        function calculateEditPsuLimits() {
            const voltage = parseInt(document.getElementById('edit-device-psu-voltage').value) || 5;
            const amps = parseInt(document.getElementById('edit-device-psu-amps').value) || 5;
            const directWatts = parseInt(document.getElementById('edit-device-psu-watts').value);
            
            const capacity = directWatts || (voltage * amps);
            const safeLimit = Math.round(capacity * 0.8 * 10) / 10;
            
            document.getElementById('edit-psu-capacity').textContent = capacity + 'W';
            document.getElementById('edit-psu-safe').textContent = safeLimit + 'W';
        }
        
        function directEditWattsChanged() {
            calculateEditPsuLimits();
        }
        
        function cancelDeviceEdit() {
            document.getElementById('device-detail-view').style.display = 'block';
            document.getElementById('device-detail-edit').style.display = 'none';
        }
        
        async function saveDeviceEdits() {
            const originalName = currentDetailDevice;
            const newName = document.getElementById('edit-device-name').value.trim();
            const newIp = document.getElementById('edit-device-ip').value.trim();
            const newModel = document.getElementById('edit-device-model').value;
            
            if (!newName || !newIp) {
                alert('Name and IP are required');
                return;
            }
            
            // Build PSU config
            const psuType = document.getElementById('edit-device-psu-type').value;
            let psuConfig;
            
            if (psuType === 'standalone') {
                const directWatts = parseInt(document.getElementById('edit-device-psu-watts').value);
                const voltage = parseInt(document.getElementById('edit-device-psu-voltage').value) || 5;
                const amps = parseInt(document.getElementById('edit-device-psu-amps').value) || 5;
                const capacity = directWatts || (voltage * amps);
                
                psuConfig = {
                    type: 'standalone',
                    voltage: voltage,
                    amps: amps,
                    capacity_watts: capacity,
                    safe_watts: Math.round(capacity * 0.8 * 10) / 10,
                    warning_watts: Math.round(capacity * 0.7 * 10) / 10
                };
            } else {
                psuConfig = {
                    type: 'shared',
                    shared_psu_id: document.getElementById('edit-device-shared-psu').value
                };
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/devices/${encodeURIComponent(originalName)}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        name: newName,
                        ip: newIp,
                        model: newModel,
                        psu: psuConfig
                    })
                });
                
                if (response.ok) {
                    showToast('Device updated', 'success');
                    closeDeviceDetailModal();
                    refreshFleetDashboard();
                    loadSharedPsusDisplay();
                } else {
                    const err = await response.json();
                    alert(err.error || 'Failed to update device');
                }
            } catch (error) {
                console.error('Error updating device:', error);
                alert('Error updating device');
            }
        }
        
        function restartDeviceFromModal() {
            if (currentDetailDevice) {
                restartDevice(currentDetailDevice);
            }
        }
        
        function removeDeviceFromModal() {
            if (currentDetailDevice) {
                if (confirm(`Remove device "${currentDetailDevice}"? This cannot be undone.`)) {
                    removeDevice(currentDetailDevice);
                    closeDeviceDetailModal();
                }
            }
        }
        
        // Legacy function - now opens detail modal
        function showDeviceMenu(deviceName) {
            openDeviceDetail(deviceName);
        }
        
        async function restartDevice(deviceName) {
            if (!confirm(`Restart ${deviceName}?`)) return;
            try {
                const response = await fetch(`${API_BASE}/api/device/${encodeURIComponent(deviceName)}/restart`, { method: 'POST' });
                if (response.ok) {
                    showToast(`${deviceName} restarting...`, 'success', 3000);
                    setTimeout(refreshFleetDashboard, 5000);
                } else {
                    showToast('Failed to restart device', 'error', 3000);
                }
            } catch (e) {
                showToast('Error restarting device', 'error', 3000);
            }
        }
        
        async function loadSharedPsusDisplay() {
            try {
                const response = await fetch(`${API_BASE}/api/psus`);
                if (!response.ok) return;
                
                const psus = await response.json();
                const container = document.getElementById('shared-psus-list');
                
                if (psus.length === 0) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: #666; font-size: 0.9em; grid-column: 1 / -1;">
                            No shared PSUs configured. Add one to monitor combined power draw across multiple devices.
                        </div>
                    `;
                    return;
                }
                
                // Fetch live power data for each PSU
                const psuPromises = psus.map(async (psu) => {
                    try {
                        const devicesResp = await fetch(`${API_BASE}/api/psus/${psu.id}/devices`);
                        if (devicesResp.ok) {
                            const data = await devicesResp.json();
                            return { ...psu, devices: data.devices, total_power: data.total_power };
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch power data for PSU ${psu.id}`);
                    }
                    return { ...psu, devices: [], total_power: 0 };
                });
                
                const psusWithPower = await Promise.all(psuPromises);
                
                container.innerHTML = psusWithPower.map(psu => {
                    const usagePercent = psu.safe_watts > 0 ? (psu.total_power / psu.safe_watts) * 100 : 0;
                    const barColor = usagePercent < 70 ? '#4caf50' : usagePercent < 90 ? '#ff9800' : '#f44336';
                    const statusColor = usagePercent < 70 ? '#4caf50' : usagePercent < 90 ? '#ff9800' : '#f44336';
                    
                    const deviceList = psu.devices && psu.devices.length > 0 
                        ? psu.devices.map(d => `<span style="color: #aaa;">${d.name}: ${d.power.toFixed(1)}W</span>`).join(', ')
                        : '<span style="color: #666;">No devices assigned</span>';
                    
                    const deviceCount = psu.devices_count || (psu.devices ? psu.devices.length : 0);
                    
                    return `
                        <div style="background: #252525; border-radius: 8px; padding: 15px; border: 1px solid #333;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong style="color: #ff9800;">${psu.name}</strong>
                                <div style="display: flex; gap: 4px;">
                                    <button onclick="openEditSharedPsuModal('${psu.id}')" style="background: none; border: none; color: #2196f3; cursor: pointer; padding: 4px;" title="Edit PSU">✏️</button>
                                    <button onclick="deleteSharedPsu('${psu.id}', ${deviceCount})" style="background: none; border: none; color: #666; cursor: pointer; padding: 4px;" title="Delete PSU">🗑️</button>
                                </div>
                            </div>
                            
                            <div style="margin-bottom: 10px;">
                                <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 4px;">
                                    <span style="color: ${statusColor}; font-weight: bold;">${psu.total_power.toFixed(1)}W</span>
                                    <span style="color: #888;">/ ${psu.safe_watts}W safe</span>
                                </div>
                                <div style="background: #333; height: 8px; border-radius: 4px; overflow: hidden;">
                                    <div style="height: 100%; width: ${Math.min(100, usagePercent)}%; background: ${barColor}; transition: width 0.3s;"></div>
                                </div>
                            </div>
                            
                            <div style="font-size: 0.8em; color: #888;">
                                <div>Capacity: ${psu.capacity_watts}W | Devices: ${deviceCount}</div>
                                <div style="margin-top: 4px;">${deviceList}</div>
                            </div>
                        </div>
                    `;
                }).join('');
                
            } catch (error) {
                console.error('Error loading shared PSUs:', error);
            }
        }
        
        async function deleteSharedPsu(psuId, deviceCount = 0) {
            let confirmMsg = 'Delete this shared PSU?';
            if (deviceCount > 0) {
                confirmMsg = `⚠️ Warning: This PSU has ${deviceCount} device(s) assigned to it.\n\nDeleting will leave those devices without a PSU configuration.\n\nAre you sure you want to delete?`;
            }
            
            if (!confirm(confirmMsg)) return;
            
            try {
                const response = await fetch(`${API_BASE}/api/psus/${psuId}`, { method: 'DELETE' });
                if (response.ok) {
                    showToast('Shared PSU deleted', 'success');
                    loadSharedPsusDisplay();
                    loadSharedPsus();  // Update dropdowns
                } else {
                    showToast('Failed to delete PSU', 'error');
                }
            } catch (error) {
                console.error('Error deleting PSU:', error);
                showToast('Error deleting PSU', 'error');
            }
        }
        
        function loadRecentBenchmarks() {
            const sessions = JSON.parse(localStorage.getItem('benchmarkSessions') || '[]');
            const container = document.getElementById('recent-benchmarks');
            
            if (!container) return;  // Element doesn't exist on this page
            
            if (sessions.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #666;">
                        <div>No benchmark history yet</div>
                        <div style="font-size: 0.85em; margin-top: 5px;">Run a benchmark to see results here</div>
                    </div>
                `;
                return;
            }
            
            // Show last 5 benchmarks
            const recent = sessions.slice(-5).reverse();
            const startIndex = sessions.length - recent.length;
            
            container.innerHTML = recent.map((session, idx) => {
                const actualIndex = sessions.length - 1 - idx;  // Get actual index in sessions array
                const date = new Date(session.start_time);
                const timeAgo = getTimeAgo(date);
                const best = session.best_hashrate;
                const hasLogs = session.logs && session.logs.length > 0;
                
                if (!best) {
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #333;">
                            <div>
                                <span style="color: #888;">📊</span>
                                <span style="color: #aaa;">${session.device_configs?.[0]?.name || 'Unknown'}</span>
                                <span style="color: #666; font-size: 0.85em; margin-left: 10px;">${timeAgo}</span>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${hasLogs ? `<button onclick="event.stopPropagation(); viewSessionLogs(${actualIndex})" style="width: auto; min-height: auto; padding: 4px 8px; background: #444; font-size: 0.8em;">📋</button>` : ''}
                                <span style="color: #666; font-size: 0.85em;">No results</span>
                            </div>
                        </div>
                    `;
                }
                
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #333; cursor: pointer;" 
                         onclick="viewBenchmarkSession('${session.session_id}')">
                        <div>
                            <span style="font-weight: bold; color: #ff9800;">${best.avg_hashrate?.toFixed(1) || '--'} GH/s</span>
                            <span style="color: #666; margin: 0 8px;">@</span>
                            <span style="color: #81c784;">${best.voltage}mV</span>
                            <span style="color: #666;">/</span>
                            <span style="color: #ba68c8;">${best.frequency}MHz</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${hasLogs ? `<button onclick="event.stopPropagation(); viewSessionLogs(${actualIndex})" style="width: auto; min-height: auto; padding: 4px 8px; background: #444; font-size: 0.8em;">📋 Logs</button>` : ''}
                            <div style="text-align: right;">
                                <div style="color: #aaa; font-size: 0.9em;">${session.device_configs?.[0]?.name || 'Unknown'}</div>
                                <div style="color: #666; font-size: 0.8em;">${timeAgo}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        function getTimeAgo(date) {
            const seconds = Math.floor((new Date() - date) / 1000);
            if (seconds < 60) return 'just now';
            if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
            if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
            if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
            return date.toLocaleDateString();
        }
        
        function viewBenchmarkSession(sessionId) {
            showTab('results');
            // Could add session selection here
        }
        
        function exportFleetStatus() {
            const data = {
                timestamp: new Date().toISOString(),
                devices: fleetDeviceData.map(d => ({
                    name: d.name,
                    ip: d.ip,
                    model: d.model,
                    online: d.online,
                    status: d.status
                }))
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fleet-status-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Fleet status exported', 'success', 2000);
        }
        
        function updateFleetAlerts(devices) {
            const alerts = [];
            
            devices.forEach(d => {
                if (!d.online) {
                    alerts.push({
                        type: 'warning',
                        icon: '📡',
                        message: `${d.name} is offline`,
                        color: '#ff9800'
                    });
                } else if (d.status) {
                    // High temp alert
                    if (d.status.temperature > 65) {
                        alerts.push({
                            type: 'danger',
                            icon: '🔥',
                            message: `${d.name} running hot: ${d.status.temperature.toFixed(1)}°C`,
                            color: '#f44336'
                        });
                    }
                    // High error rate alert
                    if (d.status.error_percentage > 2) {
                        alerts.push({
                            type: 'warning',
                            icon: '⚠️',
                            message: `${d.name} high error rate: ${d.status.error_percentage.toFixed(2)}%`,
                            color: '#ff9800'
                        });
                    }
                    // Low hashrate alert (if we have expected)
                    if (d.status.hashrate < 100 && d.status.hashrate > 0) {
                        alerts.push({
                            type: 'info',
                            icon: '📉',
                            message: `${d.name} low hashrate: ${d.status.hashrate.toFixed(1)} GH/s`,
                            color: '#2196f3'
                        });
                    }
                }
            });
            
            const alertsCard = document.getElementById('fleet-alerts-card');
            const alertsContainer = document.getElementById('fleet-alerts');
            
            if (alerts.length === 0) {
                alertsCard.style.display = 'none';
            } else {
                alertsCard.style.display = 'block';
                alertsContainer.innerHTML = alerts.map(a => `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 10px 15px; background: ${a.color}22; border-left: 4px solid ${a.color}; border-radius: 4px;">
                        <span style="font-size: 1.2em;">${a.icon}</span>
                        <span style="color: ${a.color};">${a.message}</span>
                    </div>
                `).join('');
            }
        }
        
        async function scanNetwork() {
            showToast('Scanning network for Bitaxe devices...', 'info', 3000);
            
            try {
                // Try to get local IP from a known device to determine subnet
                const currentDevices = fleetDeviceData || [];
                let baseIP = '192.168.1';  // Default
                
                if (currentDevices.length > 0 && currentDevices[0].ip) {
                    const parts = currentDevices[0].ip.split('.');
                    if (parts.length === 4) {
                        baseIP = parts.slice(0, 3).join('.');
                    }
                }
                
                const foundDevices = [];
                const promises = [];
                
                // Scan common IP ranges (1-254)
                for (let i = 1; i <= 254; i++) {
                    const ip = `${baseIP}.${i}`;
                    
                    // Skip already known devices
                    if (currentDevices.some(d => d.ip === ip)) continue;
                    
                    promises.push(
                        fetch(`http://${ip}/api/system/info`, { 
                            signal: AbortSignal.timeout(1500) 
                        })
                        .then(r => r.json())
                        .then(data => {
                            if (data.ASICModel || data.hashRate !== undefined) {
                                foundDevices.push({
                                    ip: ip,
                                    hostname: data.hostname || 'bitaxe',
                                    model: data.ASICModel || 'Unknown',
                                    hashrate: data.hashRate
                                });
                            }
                        })
                        .catch(() => {}) // Ignore timeouts/errors
                    );
                }
                
                // Wait for all scans to complete (with timeout)
                await Promise.race([
                    Promise.all(promises),
                    new Promise(resolve => setTimeout(resolve, 10000))
                ]);
                
                if (foundDevices.length === 0) {
                    showToast('No new Bitaxe devices found on network', 'info', 3000);
                } else {
                    showToast(`Found ${foundDevices.length} new device(s)!`, 'success', 3000);
                    
                    // Show found devices in alert
                    const msg = foundDevices.map(d => 
                        `${d.hostname} (${d.ip}) - ${d.model}`
                    ).join('\\n');
                    
                    if (confirm(`Found ${foundDevices.length} new device(s):\\n\\n${foundDevices.map(d => `${d.hostname} @ ${d.ip}`).join('\\n')}\\n\\nAdd them to your fleet?`)) {
                        for (const device of foundDevices) {
                            await fetch(`${API_BASE}/api/devices`, {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({
                                    name: device.hostname,
                                    ip: device.ip,
                                    model: device.model.toLowerCase().includes('1370') ? 'gamma' : 
                                           device.model.toLowerCase().includes('1366') ? 'supra' : 'unknown'
                                })
                            });
                        }
                        showToast('Devices added! Refreshing...', 'success', 2000);
                        setTimeout(refreshFleetDashboard, 1000);
                    }
                }
            } catch (error) {
                console.error('Network scan error:', error);
                showToast('Network scan failed', 'error', 3000);
            }
        }
        
        // Start auto-refresh when on dashboard
        function startFleetAutoRefresh() {
            if (fleetRefreshInterval) clearInterval(fleetRefreshInterval);
            fleetRefreshInterval = setInterval(() => {
                // Only refresh if dashboard tab is visible
                const dashboardTab = document.getElementById('dashboard');
                if (dashboardTab && dashboardTab.classList.contains('active')) {
                    refreshFleetDashboard();
                }
            }, 30000); // Refresh every 30 seconds
        }
        
        function saveBenchmarkSession(status) {
            try {
                const sessions = JSON.parse(localStorage.getItem('benchmarkSessions') || '[]');
                
                // Create session record
                const session = {
                    session_id: status.session_id || Date.now().toString(),
                    start_time: status.start_time || new Date().toISOString(),
                    end_time: new Date().toISOString(),
                    device_configs: status.device_configs || [{ name: window.benchmarkConfig?.device || 'Unknown' }],
                    tests_completed: status.tests_completed || 0,
                    best_hashrate: window.bestResult ? {
                        avg_hashrate: window.bestResult.hashrate,
                        voltage: window.bestResult.voltage,
                        frequency: window.bestResult.frequency,
                        efficiency: window.bestResult.efficiency
                    } : null,
                    status: 'completed',
                    logs: [...eventLog]  // Save a copy of the event log
                };
                
                // Add to sessions (keep last 50)
                sessions.push(session);
                if (sessions.length > 50) {
                    sessions.splice(0, sessions.length - 50);
                }
                
                localStorage.setItem('benchmarkSessions', JSON.stringify(sessions));
                
                // Refresh recent benchmarks display
                loadRecentBenchmarks();
            } catch (e) {
                console.error('Error saving benchmark session:', e);
            }
        }
        
        // ============ END FLEET DASHBOARD ============
        
        async function loadDevices() {
            try {
                const response = await fetch(`${API_BASE}/api/devices`);
                const devices = await response.json();
                
                const devicesDiv = document.getElementById('devices');
                const deviceSelect = document.getElementById('device-select');
                const monitorSelect = document.getElementById('monitor-device-select');
                
                if (!devicesDiv) return;  // Element doesn't exist
                
                devicesDiv.innerHTML = '';
                if (deviceSelect) deviceSelect.innerHTML = '<option value="">Select device...</option>';
                if (monitorSelect) monitorSelect.innerHTML = '<option value="">Select device...</option>';
                
                if (devices.length === 0) {
                    devicesDiv.innerHTML = '<p style="text-align: center; color: #999;">No devices configured. Click "Add Device" to get started.</p>';
                }
                
                devices.forEach(device => {
                    // Grid display
                    const deviceDiv = document.createElement('div');
                    deviceDiv.className = 'device';
                    const modelColors = {
                        'gamma': '#ff3333',
                        'supra': '#2196f3',
                        'ultra': '#9c27b0',
                        'hex': '#ff9800',
                        'max': '#4caf50'
                    };
                    const modelColor = modelColors[device.model?.toLowerCase()] || '#666';
                    const safeDeviceName = device.name.replace(/'/g, "\\'");
                    const deviceId = device.name.replace(/[^a-zA-Z0-9]/g, '-');
                    deviceDiv.innerHTML = `
                        <div class="device-name">${device.name}</div>
                        <div style="display: inline-block; background: ${modelColor}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-bottom: 10px;">
                            ${(device.model || 'Unknown').toUpperCase()}
                        </div>
                        <div class="device-info">
                            IP: ${device.ip}
                        </div>
                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;">
                            <label style="color: #aaa; font-size: 12px;">Fan Auto-Target:</label>
                            <div style="display: flex; gap: 5px; margin-top: 5px;">
                                <select id="fan-target-${deviceId}" style="flex: 1; padding: 5px;">
                                    <option value="">Manual</option>
                                    <option value="55">55°C</option>
                                    <option value="58">58°C</option>
                                    <option value="60">60°C (Cool)</option>
                                    <option value="62">62°C</option>
                                    <option value="65">65°C (Normal)</option>
                                    <option value="68">68°C</option>
                                    <option value="70">70°C (Warm)</option>
                                </select>
                                <button onclick="setFanTarget('${safeDeviceName}', '${deviceId}')" style="width: auto; padding: 5px 10px;">Set</button>
                            </div>
                        </div>
                        <div class="device-actions" style="margin-top: 10px;">
                            <button class="secondary" onclick="removeDevice('${safeDeviceName}')" style="width: 100%;">Remove</button>
                        </div>
                    `;
                    devicesDiv.appendChild(deviceDiv);
                    
                    // Dropdowns
                    const option1 = document.createElement('option');
                    option1.value = device.name;
                    option1.textContent = device.name;
                    option1.setAttribute('data-model', device.model);
                    deviceSelect.appendChild(option1);
                    
                    const option2 = document.createElement('option');
                    option2.value = device.name;
                    option2.textContent = device.name;
                    monitorSelect.appendChild(option2);
                });
            } catch (error) {
                console.error('Error loading devices:', error);
            }
        }
        
        // Preset loading
        function loadPreset() {
            const preset = document.getElementById('preset-select').value;
            const device = document.getElementById('device-model').value;
            
            if (!preset) return;
            
            // Fetch device-specific preset from backend
            if (device && ['gamma', 'supra', 'ultra', 'hex', 'max'].includes(device)) {
                fetch(`/api/benchmark/preset/${device}/${preset}`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.error) {
                            console.error('Preset error:', data.error);
                            return;
                        }
                        
                        // Populate form with device-specific preset
                        document.getElementById('voltage-start').value = data.voltage_start;
                        document.getElementById('voltage-stop').value = data.voltage_stop;
                        document.getElementById('voltage-step').value = data.voltage_step;
                        document.getElementById('frequency-start').value = data.frequency_start;
                        document.getElementById('frequency-stop').value = data.frequency_stop;
                        document.getElementById('frequency-step').value = data.frequency_step;
                        document.getElementById('duration').value = data.benchmark_duration;
                        document.getElementById('warmup').value = data.warmup_time;
                        document.getElementById('cycles-per-test').value = data.cycles_per_test;
                        
                        console.log('Preset loaded for', device, preset);
                    })
                    .catch(error => console.error('Error loading preset:', error));
                return;
            }
            
            // Fallback to generic presets if no device selected
            const presets = {
                fast: {
                    // FAST: wide sweep, coarse steps, throughput focused
                    voltage_start: 1100, voltage_stop: 1300, voltage_step: 30,
                    frequency_start: 450, frequency_stop: 800, frequency_step: 50,
                    duration: 120, warmup: 5,
                    cycles: 1,
                    goal: 'max_hashrate',
                    max_temp: 65, max_vr_temp: 85, max_power: 28,
                    fan_target: 60,
                    restart: true
                },
                optimal: {
                    // OPTIMAL: moderate window, medium steps, balanced throughput/efficiency
                    voltage_start: 1120, voltage_stop: 1260, voltage_step: 10,
                    frequency_start: 475, frequency_stop: 725, frequency_step: 20,
                    duration: 240, warmup: 10,
                    cycles: 1,
                    goal: 'balanced',
                    max_temp: 65, max_vr_temp: 85, max_power: 26,
                    fan_target: 60,
                    restart: true
                },
                precision: {
                    // PRECISION: narrow range, fine steps, efficiency-focused
                    voltage_start: 1140, voltage_stop: 1240, voltage_step: 5,
                    frequency_start: 500, frequency_stop: 675, frequency_step: 10,
                    duration: 300, warmup: 10,
                    cycles: 1,
                    goal: 'efficient',
                    max_temp: 65, max_vr_temp: 85, max_power: 24,
                    fan_target: 55,
                    restart: true
                }
            };
            
            const config = presets[preset];
            if (config) {
                // Voltage/Frequency ranges
                document.getElementById('voltage-start').value = config.voltage_start;
                document.getElementById('voltage-stop').value = config.voltage_stop;
                document.getElementById('voltage-step').value = config.voltage_step;
                document.getElementById('frequency-start').value = config.frequency_start;
                document.getElementById('frequency-stop').value = config.frequency_stop;
                document.getElementById('frequency-step').value = config.frequency_step;
                
                // Timing
                document.getElementById('duration').value = config.duration;
                document.getElementById('warmup').value = config.warmup;
                document.getElementById('cycles-per-test').value = config.cycles || 1;
                
                // Goal (no direct strategy element in UI)
                if (document.getElementById('goal') && config.goal) {
                    document.getElementById('goal').value = config.goal;
                    updateGoalBadge(config.goal);
                }
                
                // Safety limits
                if (document.getElementById('max-temp')) document.getElementById('max-temp').value = config.max_temp;
                if (document.getElementById('max-vr-temp')) document.getElementById('max-vr-temp').value = config.max_vr_temp;
                if (document.getElementById('max-power')) document.getElementById('max-power').value = config.max_power;
                
                // Fan target
                if (document.getElementById('fan-target')) document.getElementById('fan-target').value = config.fan_target;
                
                // Checkboxes
                if (document.getElementById('restart')) document.getElementById('restart').checked = !!config.restart;
                
                // Run safety check
                checkSafetyRange();
            }
        }
        
        
        // ============ SAVED BENCHMARK PROFILES ============
        
        function loadSavedProfiles() {
            const profiles = JSON.parse(localStorage.getItem('benchmarkProfiles') || '{}');
            const select = document.getElementById('saved-profiles');
            select.innerHTML = '<option value="">-- Select a saved profile --</option>';
            
            Object.keys(profiles).sort().forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            });
        }
        
        function saveCurrentProfile() {
            const name = prompt('Enter a name for this profile:', '');
            if (!name || !name.trim()) return;
            
            const profile = {
                // V/F ranges
                voltage_start: parseInt(document.getElementById('voltage-start').value),
                voltage_stop: parseInt(document.getElementById('voltage-stop').value),
                voltage_step: parseInt(document.getElementById('voltage-step').value),
                frequency_start: parseInt(document.getElementById('frequency-start').value),
                frequency_stop: parseInt(document.getElementById('frequency-stop').value),
                frequency_step: parseInt(document.getElementById('frequency-step').value),
                // Timing
                duration: parseInt(document.getElementById('duration').value),
                warmup: parseInt(document.getElementById('warmup').value),
                cooldown: parseInt(document.getElementById('cooldown').value),
                cycles_per_test: parseInt(document.getElementById('cycles-per-test').value),
                // Goal
                goal: document.getElementById('goal').value,
                quiet_fan_threshold: (typeof window.quietFanThreshold === 'number' ? window.quietFanThreshold : null),
                // Safety
                max_temp: parseInt(document.getElementById('max-temp').value),
                max_vr_temp: parseInt(document.getElementById('max-vr-temp').value),
                max_power: parseInt(document.getElementById('max-power').value),
                // Recovery
                recovery_enabled: document.getElementById('auto-recovery').checked,
                recovery_strategy: document.getElementById('recovery-strategy').value,
                recovery_cooldown: parseInt(document.getElementById('recovery-cooldown').value),
                // Meta
                saved_at: new Date().toISOString(),
                device_model: document.getElementById('device-model').value
            };
            
            const profiles = JSON.parse(localStorage.getItem('benchmarkProfiles') || '{}');
            profiles[name.trim()] = profile;
            localStorage.setItem('benchmarkProfiles', JSON.stringify(profiles));
            
            loadSavedProfiles();
            document.getElementById('saved-profiles').value = name.trim();
            
            // Show saved profile indicator
            document.getElementById('loaded-profile-name').textContent = name.trim();
            document.getElementById('loaded-profile-indicator').style.display = 'block';
            
            showToast(`Profile "${name}" saved`, 'success', 3000);
        }
        
        function loadSavedProfile() {
            const select = document.getElementById('saved-profiles');
            const name = select.value;
            if (!name) return;
            
            const profiles = JSON.parse(localStorage.getItem('benchmarkProfiles') || '{}');
            const profile = profiles[name];
            if (!profile) {
                showToast('Profile not found', 'error', 3000);
                return;
            }
            
            // V/F ranges
            document.getElementById('voltage-start').value = profile.voltage_start || 1100;
            document.getElementById('voltage-stop').value = profile.voltage_stop || 1300;
            document.getElementById('voltage-step').value = profile.voltage_step || 25;
            document.getElementById('frequency-start').value = profile.frequency_start || 500;
            document.getElementById('frequency-stop').value = profile.frequency_stop || 700;
            document.getElementById('frequency-step').value = profile.frequency_step || 25;
            // Timing
            document.getElementById('duration').value = profile.duration || 120;
            document.getElementById('warmup').value = profile.warmup || 10;
            document.getElementById('cooldown').value = profile.cooldown || 5;
            document.getElementById('cycles-per-test').value = profile.cycles_per_test || 1;
            // Goal
            document.getElementById('goal').value = profile.goal || 'balanced';
            // Safety
            document.getElementById('max-temp').value = profile.max_temp || 65;
            document.getElementById('max-vr-temp').value = profile.max_vr_temp || 80;
            document.getElementById('max-power').value = profile.max_power || 22;
            // Recovery
            if (profile.recovery_enabled !== undefined) {
                document.getElementById('auto-recovery').checked = profile.recovery_enabled;
            }
            document.getElementById('recovery-strategy').value = profile.recovery_strategy || 'conservative';
            document.getElementById('recovery-cooldown').value = profile.recovery_cooldown || 10;
            // Device model
            if (profile.device_model) {
                document.getElementById('device-model').value = profile.device_model;
            }
            
            // Show loaded profile indicator
            document.getElementById('loaded-profile-name').textContent = name;
            document.getElementById('loaded-profile-indicator').style.display = 'block';
            
            checkSafetyRange();
            showToast(`Profile "${name}" loaded`, 'success', 3000);
        }
        
        function deleteSavedProfile() {
            const select = document.getElementById('saved-profiles');
            const name = select.value;
            if (!name) {
                showToast('Select a profile to delete', 'warning', 3000);
                return;
            }
            
            if (!confirm(`Delete profile "${name}"?`)) return;
            
            const profiles = JSON.parse(localStorage.getItem('benchmarkProfiles') || '{}');
            delete profiles[name];
            localStorage.setItem('benchmarkProfiles', JSON.stringify(profiles));
            
            // Hide indicator if deleted profile was loaded
            const loadedName = document.getElementById('loaded-profile-name').textContent;
            if (loadedName === name) {
                document.getElementById('loaded-profile-indicator').style.display = 'none';
            }
            
            loadSavedProfiles();
            showToast(`Profile "${name}" deleted`, 'success', 3000);
        }
        
        // Load saved profiles on page load
        document.addEventListener('DOMContentLoaded', function() {
            loadSavedProfiles();
            // Initialize fleet dashboard
            refreshFleetDashboard();
            loadSharedPsusDisplay();
            loadRecentBenchmarks();
            startFleetAutoRefresh();
            
            // Restore localStorage state
            loadEventLogFromStorage();
            restoreConfigCollapseState();
        
            applyUiMode(getUiMode());
});
        
        // ============ END SAVED PROFILES ============
        
        // Check if values are within safe range
        function checkSafetyRange() {
            const voltageStart = parseInt(document.getElementById('voltage-start').value);
            const voltageStop = parseInt(document.getElementById('voltage-stop').value);
            const frequencyStart = parseInt(document.getElementById('frequency-start').value);
            const frequencyStop = parseInt(document.getElementById('frequency-stop').value);
            const maxTemp = parseInt(document.getElementById('max-temp').value);
            const maxVrTemp = parseInt(document.getElementById('max-vr-temp').value);
            const maxPower = parseInt(document.getElementById('max-power').value);
            const fanTarget = parseInt(document.getElementById('fan-target').value) || 0;
            
            // Try to get profile, but use safe defaults if not available
            const profile = window.currentProfile || {};
            
            // Get the safe operating ranges (with sensible defaults if no profile)
            const safeMinVoltage = profile.min_voltage || 1000;  // Absolute minimum
            const safeMaxVoltage = profile.safe_max_voltage || profile.max_voltage || 1300;  // Conservative default
            const safeMinFrequency = profile.min_frequency || 400;
            const safeMaxFrequency = profile.safe_max_frequency || profile.max_frequency || 650;  // Conservative default
            const stockMaxTemp = profile.stock_max_chip_temp || 65;
            const stockMaxVrTemp = profile.stock_max_vr_temp || 80;
            const safePowerStockPsu = profile.safe_power_stock_psu || 20;
            const stockPsuWatts = profile.stock_psu_watts || 22;
            
            let warnings = [];
            let psuWarning = false;
            let criticalError = false;
            
            // Check fan target vs max temp (max temp must be HIGHER than fan target)
            if (fanTarget > 0 && maxTemp <= fanTarget) {
                criticalError = true;
                warnings.push(`🛑 ASIC Abort Temp (${maxTemp}°C) must be HIGHER than Fan Target (${fanTarget}°C)!`);
            } else if (fanTarget > 0 && maxTemp < fanTarget + 5) {
                warnings.push(`⚠️ ASIC Abort Temp (${maxTemp}°C) is very close to Fan Target (${fanTarget}°C) - recommend at least ${fanTarget + 5}°C`);
            }
            
            // Check voltage range
            if (voltageStart < safeMinVoltage) {
                warnings.push(`⚠️ Voltage Start (${voltageStart}mV) is below minimum (${safeMinVoltage}mV)`);
            }
            if (voltageStop > safeMaxVoltage) {
                warnings.push(`⚠️ Voltage Stop (${voltageStop}mV) exceeds safe max (${safeMaxVoltage}mV)`);
            }
            
            // Check frequency range
            if (frequencyStart < safeMinFrequency) {
                warnings.push(`⚠️ Frequency Start (${frequencyStart}MHz) is below minimum (${safeMinFrequency}MHz)`);
            }
            if (frequencyStop > safeMaxFrequency) {
                warnings.push(`⚠️ Frequency Stop (${frequencyStop}MHz) exceeds safe max (${safeMaxFrequency}MHz)`);
            }
            
            // Check temperature limits vs stock
            if (maxTemp > stockMaxTemp) {
                warnings.push(`⚠️ ASIC Temp Limit (${maxTemp}°C) exceeds stock safe (${stockMaxTemp}°C)`);
            }
            if (maxVrTemp > stockMaxVrTemp) {
                warnings.push(`⚠️ VReg Temp Limit (${maxVrTemp}°C) exceeds stock safe (${stockMaxVrTemp}°C)`);
            }
            
            // Check power vs stock PSU capacity
            if (maxPower > safePowerStockPsu) {
                psuWarning = true;
                warnings.push(`🔌 Power Limit (${maxPower}W) exceeds stock PSU safe capacity (${safePowerStockPsu}W)`);
            }
            
            const warningDiv = document.getElementById('safety-warning');
            const warningMsg = document.getElementById('warning-message');
            const safetyStatus = document.getElementById('safety-status');
            const overrideCheckbox = document.getElementById('override-safety');
            
            // Store critical error state globally for updateStartButton
            window.hasCriticalError = criticalError;
            
            if (warnings.length > 0) {
                warningDiv.style.display = 'block';
                
                // Color coding: Critical (dark red) > PSU (red) > Other (orange)
                if (criticalError) {
                    warningDiv.style.backgroundColor = '#8b0000';  // Dark red - cannot proceed
                } else if (psuWarning) {
                    warningDiv.style.backgroundColor = '#d32f2f';  // Red for PSU
                } else {
                    warningDiv.style.backgroundColor = '#ff9800';  // Orange for others
                }
                
                let extraWarning = '';
                if (criticalError) {
                    extraWarning = '<br><br><strong>🛑 CANNOT PROCEED:</strong> Fix the settings above before starting benchmark.';
                } else if (psuWarning) {
                    extraWarning = `<br><br><strong>⚡ PSU WARNING:</strong> Your stock ${stockPsuWatts}W PSU may not handle this power level safely. An upgraded 30W+ PSU is recommended for overclocking. Running beyond PSU capacity risks voltage drops, instability, or damage.`;
                }
                
                warningMsg.innerHTML = warnings.join('<br>') + extraWarning;
                
                if (!criticalError) {
                    warningMsg.innerHTML += '<br><br>These settings are outside the recommended safe operating range for this device.';
                }
                
                // Hide override option for critical errors
                safetyStatus.style.display = criticalError ? 'none' : 'block';
                // Don't reset checkbox - keep user's choice
            } else {
                warningDiv.style.display = 'none';
                safetyStatus.style.display = 'none';
            }
            
            updateStartButton();
        }
        
        function updateStartButton() {
            const warningDiv = document.getElementById('safety-warning');
            const overrideCheckbox = document.getElementById('override-safety');
            const startBtn = document.getElementById('start-btn');
            
            // Critical errors cannot be overridden
            if (window.hasCriticalError) {
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.title = 'Fix critical errors before starting';
            } else if (warningDiv.style.display === 'block' && !overrideCheckbox.checked) {
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.title = 'Check override box to proceed with warnings';
            } else {
                startBtn.disabled = false;
                startBtn.style.opacity = '1';
                startBtn.title = '';
            }
        }
        
        // Load device-specific profile
        async function loadDeviceProfile() {
            const deviceSelect = document.getElementById('device-select');
            const selectedOption = deviceSelect.options[deviceSelect.selectedIndex];
            const deviceModel = selectedOption.getAttribute('data-model') || 'gamma';
            const deviceName = deviceSelect.value;
            
            // Also update the model dropdown
            document.getElementById('device-model').value = deviceModel;
            
            // Load PSU info for this device
            if (deviceName) {
                try {
                    const response = await fetch(`${API_BASE}/api/devices`);
                    if (response.ok) {
                        const devices = await response.json();
                        const device = devices.find(d => d.name === deviceName);
                        if (device && device.psu) {
                            // Store PSU config for benchmark
                            window.currentDevicePsu = device.psu;
                            
                            // Update max power from PSU config
                            const maxPowerInput = document.getElementById('max-power');
                            if (device.psu.type === 'standalone') {
                                // Standalone PSU: use its safe_watts directly (or fall back to 20W)
                                maxPowerInput.value = device.psu.safe_watts || 20;
                            } else if (device.psu.type === 'shared') {
                                // Shared PSU: dynamic per-device allocation with a safe cap (28W by default)
                                try {
                                    const psuResp = await fetch(`${API_BASE}/api/psus`);
                                    if (psuResp.ok) {
                                        const psus = await psuResp.json();
                                        const psu = psus.find(p => p.id === device.psu.shared_psu_id);
                                        if (psu) {
                                            const devicesCount = psu.devices_count || 1;
                                            const safeWatts = psu.safe_watts || device.psu.safe_watts || 20;
                                            let perDevice = safeWatts / Math.max(devicesCount, 1);
                                            // Cap at 28W per device so user must consciously raise it
                                            perDevice = Math.min(perDevice, 28);
                                            maxPowerInput.value = Math.round(perDevice * 10) / 10;
                                        } else {
                                            maxPowerInput.value = device.psu.safe_watts || 20;
                                        }
                                    } else {
                                        maxPowerInput.value = device.psu.safe_watts || 20;
                                    }
                                } catch (err) {
                                    console.warn('Error resolving shared PSU headroom for device:', err);
                                    maxPowerInput.value = device.psu.safe_watts || 20;
                                }
                            }
                            
                            // Show PSU info in benchmark form
                            updatePsuInfoDisplay(device.psu);
                        }
                    }
                } catch (e) {
                    console.warn('Error loading device PSU info:', e);
                }
            }
            
            // Load the model profile
            await loadModelProfile();
        }
        
        function updatePsuInfoDisplay(psu) {
            // Create or update PSU info display in benchmark form
            let psuInfo = document.getElementById('benchmark-psu-info');
            if (!psuInfo) {
                // Find the max-power section and add info after it
                const maxPowerGroup = document.getElementById('max-power')?.closest('.form-group');
                if (maxPowerGroup) {
                    psuInfo = document.createElement('div');
                    psuInfo.id = 'benchmark-psu-info';
                    psuInfo.style.cssText = 'background: #1a1a1a; padding: 10px; border-radius: 6px; margin-top: 8px; font-size: 0.85em;';
                    maxPowerGroup.appendChild(psuInfo);
                }
            }
            
            if (psuInfo) {
                if (psu.type === 'standalone') {
                    psuInfo.innerHTML = `
                        <div style="color: #ff9800; margin-bottom: 4px;">🔌 Standalone PSU</div>
                        <div style="color: #888;">Capacity: ${psu.capacity_watts}W | Safe: ${psu.safe_watts}W</div>
                    `;
                } else if (psu.type === 'shared') {
                    psuInfo.innerHTML = `
                        <div style="color: #ff9800; margin-bottom: 4px;">🔌 Shared PSU</div>
                        <div style="color: #888;">Check Devices tab for combined power usage</div>
                    `;
                }
            }
        }
        
        async function loadModelProfile() {
            const modelSelect = document.getElementById('device-model');
            let deviceModel = modelSelect.value;
            
            // If auto-detect, try to get from device selection
            if (!deviceModel) {
                const deviceSelect = document.getElementById('device-select');
                const selectedOption = deviceSelect.options[deviceSelect.selectedIndex];
                deviceModel = selectedOption.getAttribute('data-model') || 'gamma';
            }
            
            try {
                const response = await fetch(`/api/device-profile/${deviceModel}`);
                const profile = await response.json();
                
                // Store current profile for safety checks
                window.currentProfile = profile;
                
                // Update input field constraints
                document.getElementById('voltage-start').min = profile.min_voltage;
                document.getElementById('voltage-start').max = profile.max_voltage;
                document.getElementById('voltage-stop').min = profile.min_voltage;
                document.getElementById('voltage-stop').max = profile.max_voltage;
                document.getElementById('frequency-start').min = profile.min_frequency;
                document.getElementById('frequency-start').max = profile.max_frequency;
                document.getElementById('frequency-stop').min = profile.min_frequency;
                document.getElementById('frequency-stop').max = profile.max_frequency;
                
                // Pre-populate with stock/recommended settings
                if (profile.stock_voltage) {
                    document.getElementById('voltage-start').value = profile.stock_voltage;
                    const recMax = profile.safe_max_voltage || profile.recommended_voltage_range[1];
                    document.getElementById('voltage-stop').value = recMax;
                }
                if (profile.stock_frequency) {
                    document.getElementById('frequency-start').value = profile.stock_frequency;
                    const maxFreq = profile.safe_max_frequency || profile.max_frequency;
                    document.getElementById('frequency-stop').value = Math.min(maxFreq, profile.stock_frequency + 100);
                }
                
                // Set model-specific temperature limits
                if (profile.stock_max_chip_temp) {
                    document.getElementById('max-temp').value = profile.stock_max_chip_temp;
                }
                if (profile.stock_max_vr_temp) {
                    document.getElementById('max-vr-temp').value = profile.stock_max_vr_temp;
                }
                
                // Show device profile info with all details
                const infoDiv = document.getElementById('device-profile-info');
                document.getElementById('model-name').textContent = profile.name || deviceModel.toUpperCase();
                document.getElementById('profile-stock-voltage').textContent = profile.stock_voltage;
                document.getElementById('profile-stock-frequency').textContent = profile.stock_frequency;
                document.getElementById('profile-safe-voltage').textContent = profile.safe_max_voltage || profile.max_voltage;
                document.getElementById('profile-safe-frequency').textContent = profile.safe_max_frequency || profile.max_frequency;
                document.getElementById('profile-chip-temp').textContent = profile.stock_max_chip_temp || 65;
                document.getElementById('profile-vr-temp').textContent = profile.stock_max_vr_temp || 81;
                infoDiv.style.display = 'block';
                
                // Check safety after loading profile
                checkSafetyRange();
                
            } catch (error) {
                console.error('Error loading device profile:', error);
            }
        }
        
        // Benchmark control
        const CONFIG_COLLAPSED_KEY = 'axebench_config_collapsed';
        
        function toggleConfigForm() {
            const form = document.getElementById('benchmark-config-form');
            const btn = document.getElementById('config-collapse-btn');
            
            if (form.style.display === 'none') {
                form.style.display = 'block';
                btn.textContent = '▼ Hide Config';
                localStorage.setItem(CONFIG_COLLAPSED_KEY, 'false');
            } else {
                form.style.display = 'none';
                btn.textContent = '▶ Show Config';
                localStorage.setItem(CONFIG_COLLAPSED_KEY, 'true');
            }
        }
        
        function restoreConfigCollapseState() {
            const collapsed = localStorage.getItem(CONFIG_COLLAPSED_KEY);
            const form = document.getElementById('benchmark-config-form');
            const btn = document.getElementById('config-collapse-btn');
            
            if (collapsed === 'true' && form && btn) {
                form.style.display = 'none';
                btn.textContent = '▶ Show Config';
                btn.style.display = 'inline-block';
            }
        }
        
        function toggleAutoMode() {
            const autoMode = document.getElementById('auto-mode').checked;
            const voltageStepInput = document.getElementById('voltage-step');
            const frequencyStepInput = document.getElementById('frequency-step');
            const voltageLabel = document.getElementById('voltage-step-auto-label');
            const frequencyLabel = document.getElementById('frequency-step-auto-label');
            
            if (autoMode) {
                // Auto mode ON - disable step inputs and show auto label
                voltageStepInput.disabled = true;
                frequencyStepInput.disabled = true;
                voltageStepInput.style.opacity = '0.5';
                frequencyStepInput.style.opacity = '0.5';
                voltageStepInput.style.cursor = 'not-allowed';
                frequencyStepInput.style.cursor = 'not-allowed';
                
                if (voltageLabel) voltageLabel.style.display = 'inline';
                if (frequencyLabel) frequencyLabel.style.display = 'inline';
            } else {
                // Auto mode OFF - enable step inputs and hide auto label
                voltageStepInput.disabled = false;
                frequencyStepInput.disabled = false;
                voltageStepInput.style.opacity = '1';
                frequencyStepInput.style.opacity = '1';
                voltageStepInput.style.cursor = 'text';
                frequencyStepInput.style.cursor = 'text';
                
                if (voltageLabel) voltageLabel.style.display = 'none';
                if (frequencyLabel) frequencyLabel.style.display = 'none';
            }
        }
        
        // Initialize auto mode state on page load
        document.addEventListener('DOMContentLoaded', function() {
            toggleAutoMode();
        });
        
        async function startBenchmark() {
            const device = document.getElementById('device-select').value;
            
            if (!device) {
                alert('Please select a device');
                return;
            }
            
            // Clear event log for fresh benchmark session
            clearEventLog();
            window.sessionLogsLoaded = false;  // Reset flag for new session
            logEvent(`Starting benchmark on ${device}...`, 'info');
            
            // Set fan target before starting benchmark
            const fanTarget = document.getElementById('fan-target').value;
            if (fanTarget) {
                try {
                    const encodedDevice = encodeURIComponent(device);
                    const response = await fetch(`${API_BASE}/api/devices/${encodedDevice}/fan`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            auto: true,
                            target_temp: parseInt(fanTarget)
                        })
                    });
                    
                    if (response.ok) {
                        console.log(`Fan set to auto-target ${fanTarget}°C`);
                    } else {
                        const err = await response.json();
                        console.error('Failed to set fan:', err);
                        alert(`Warning: Could not set fan to ${fanTarget}°C. Continuing anyway.`);
                    }
                } catch (error) {
                    console.error('Error setting fan:', error);
                    alert(`Warning: Error setting fan. Continuing anyway.`);
                }
            }
            
            const config = {
                device: device,
                preset: document.getElementById('preset-select').value,
                voltage_start: parseInt(document.getElementById('voltage-start').value),
                voltage_stop: parseInt(document.getElementById('voltage-stop').value),
                voltage_step: parseInt(document.getElementById('voltage-step').value),
                frequency_start: parseInt(document.getElementById('frequency-start').value),
                frequency_stop: parseInt(document.getElementById('frequency-stop').value),
                frequency_step: parseInt(document.getElementById('frequency-step').value),
                duration: parseInt(document.getElementById('duration').value),
                warmup: parseInt(document.getElementById('warmup').value),
                cooldown: parseInt(document.getElementById('cooldown').value),
                target_error: parseFloat(document.getElementById('target-error').value) || 0.20,
                cycles_per_test: parseInt(document.getElementById('cycles-per-test').value) || 1,
                strategy: 'adaptive_progression',
                goal: document.getElementById('goal').value,
                quiet_fan_threshold: (typeof window.quietFanThreshold === 'number' ? window.quietFanThreshold : null),
                max_temp: parseFloat(document.getElementById('max-temp').value),
                max_power: parseFloat(document.getElementById('max-power').value),
                max_vr_temp: parseFloat(document.getElementById('max-vr-temp').value),
                restart: document.getElementById('restart').checked,
                enable_plotting: document.getElementById('plotting').checked,
                export_csv: document.getElementById('csv').checked,
                // Auto mode - intelligent step adjustment
                auto_mode: document.getElementById('auto-mode').checked,
                // Auto-recovery settings
                auto_recovery: document.getElementById('auto-recovery').checked,
                recovery_strategy: document.getElementById('recovery-strategy').value,
                recovery_max_retries: parseInt(document.getElementById('recovery-max-retries').value) || 2,
                recovery_cooldown: parseInt(document.getElementById('recovery-cooldown').value) || 10,
                // Fine Tune mode parameters
                fine_tune_mode: !!window.fineTuneProfileName,
                fine_tune_profile: window.fineTuneProfileName || null,
                expected_hashrate: window.fineTuneExpectedHashrate || null
            };
            
            // Clear fine tune mode after starting
            if (window.fineTuneProfileName) {
                const indicator = document.getElementById('fine-tune-indicator');
                if (indicator) {
                    indicator.innerHTML = `
                        <div>
                            <strong>🔬 Fine Tuning ${window.fineTuneProfileName.toUpperCase()}</strong><br>
                            <small>Benchmark running with hashrate drop detection enabled</small>
                        </div>
                    `;
                }
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/benchmark/start`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(config)
                });
                
                if (response.ok) {
                    document.getElementById('start-btn').disabled = true;
                    document.getElementById('stop-btn').style.display = 'inline-block';
                    
                    // Collapse the config form and show collapse button
                    document.getElementById('benchmark-config-form').style.display = 'none';
                    document.getElementById('config-collapse-btn').style.display = 'inline-block';
                    document.getElementById('config-collapse-btn').textContent = '▶ Show Config';
                    
                    // Hide safety warning and info boxes
                    document.getElementById('safety-warning').style.display = 'none';
                    const safetyStatus = document.getElementById('safety-status');
                    if (safetyStatus) safetyStatus.style.display = 'none';
                    
                    // Disable form controls during benchmark
                    setBenchmarkFormDisabled(true);
                    
                    // Reset UI state for new benchmark
                    resetBenchmarkUIState();
                    
                    // Store config for range position updates
                    window.benchmarkConfig = config;
                    
                    // Store expected hashrate for comparison bar (from fine tune mode)
                    window.expectedHashrate = config.expected_hashrate || null;
                    
                    // Show unified benchmark panel and expand the event log
                    document.getElementById('live-benchmark-panel').style.display = 'block';
                    const eventLogExpanded = document.getElementById('event-log-expanded');
                    if (eventLogExpanded) {
                        eventLogExpanded.style.display = 'block';
                        const icon = document.getElementById('event-log-toggle-icon');
                        if (icon) icon.textContent = '▼';
                    }
                    clearEventLog();
                    
                    // Calculate test count for logging
                    const vSteps = Math.floor((config.voltage_stop - config.voltage_start) / config.voltage_step) + 1;
                    const fSteps = Math.floor((config.frequency_stop - config.frequency_start) / config.frequency_step) + 1;
                    const totalTests = vSteps * fSteps;
                    
                    // Store for time estimate
                    window.totalTestsExpected = totalTests;
                    
                    logEvent(`Benchmark started on ${device}`, 'success');
                    logEvent(`Testing ${totalTests} combinations: ${config.voltage_start}-${config.voltage_stop}mV, ${config.frequency_start}-${config.frequency_stop}MHz`, 'info');
                    logEvent(`Safety limits: Chip ${config.max_temp}°C, VR ${config.max_vr_temp}°C, Power ${config.max_power}W`, 'info');
                    
                    if (config.auto_recovery) {
                        logEvent(`🔄 Auto-recovery enabled: ${config.recovery_strategy} strategy, ${config.recovery_max_retries} retries, ${config.recovery_cooldown}s cooldown`, 'info');
                    } else {
                        logEvent(`⚠️ Auto-recovery disabled - benchmark will stop on failures`, 'warning');
                    }
                    
                    showToast('Benchmark started!', 'success');
                    
                    checkBenchmarkStatus();
                } else {
                    const error = await response.json();
                    const errorMsg = error.error || 'Unknown error';
                    logEvent(`Failed to start benchmark: ${errorMsg}`, 'error');
                    showToast(`Failed: ${errorMsg}`, 'error');
                }
            } catch (error) {
                console.error('Error starting benchmark:', error);
                logEvent(`Failed to start benchmark: ${error.message}`, 'error');
                showToast('Failed to start benchmark', 'error');
            }
        }
        
        async function checkBenchmarkStatus() {
            try {
                const response = await fetch(`${API_BASE}/api/benchmark/status`);
                const status = await response.json();

                // Keep a copy of the latest benchmark config in the frontend
                if (status && status.config) {
                    window.benchmarkConfig = status.config;
                    if (status.config.expected_hashrate) {
                        window.expectedHashrate = status.config.expected_hashrate;
                    }
                }

                const statusDiv = document.getElementById('status');
                const livePanel = document.getElementById('live-benchmark-panel');
                
                if (status.running) {
                    statusDiv.style.display = 'block';
                    statusDiv.className = 'status running';
                    
                    // Build status message based on phase
                    let phaseInfo = status.message || status.current_test || 'Working...';
                    let phaseClass = '';
                    let phaseIcon = '🔄';
                    
                    if (status.phase === 'warmup') {
                        phaseClass = 'style="color: #ff9800;"';
                        phaseIcon = '🔥';
                    } else if (status.phase === 'sampling') {
                        phaseClass = 'style="color: #4caf50;"';
                        phaseIcon = '📊';
                    } else if (status.phase === 'sample') {
                        phaseClass = 'style="color: #81c784;"';
                        phaseIcon = '📊';
                    } else if (status.phase === 'setting') {
                        phaseClass = 'style="color: #9c27b0;"';
                        phaseIcon = '⚙️';
                    } else if (status.phase === 'test_complete' || status.phase === 'success') {
                        phaseClass = 'style="color: #4caf50;"';
                        phaseIcon = '✓';
                    } else if (status.phase === 'strategy') {
                        phaseClass = 'style="color: #2196f3;"';
                        phaseIcon = '🎯';
                    } else if (status.phase === 'cooldown') {
                        phaseClass = 'style="color: #03a9f4;"';
                        phaseIcon = '❄️';
                    } else if (status.phase === 'recovery') {
                        phaseClass = 'style="color: #03a9f4;"';
                        phaseIcon = '🔄';
                    } else if (status.phase === 'info') {
                        phaseClass = 'style="color: #aaa;"';
                        phaseIcon = 'ℹ️';
                    } else if (status.phase === 'error' || status.phase === 'warning') {
                        phaseClass = 'style="color: #ff3333;"';
                        phaseIcon = '⚠️';
                    }
                    
                    // Build failed combos display
                    let failedDisplay = '';
                    if (status.failed_combos && status.failed_combos.length > 0) {
                        failedDisplay = `<br><small style="color: #ff9800;">⚠️ ${status.failed_combos.length} failed combo(s)</small>`;
                    }
                    
                    // Recovery action display
                    let recoveryDisplay = '';
                    if (status.recovery_action) {
                        recoveryDisplay = `<br><small style="color: #03a9f4;">🔄 ${status.recovery_action}</small>`;
                    }
                    
                    statusDiv.innerHTML = `
                        <strong>${phaseIcon} Benchmark Running</strong><br>
                        Device: ${status.device}<br>
                        <span ${phaseClass}>${phaseInfo}</span>
                        ${recoveryDisplay}
                        ${failedDisplay}
                    `;
                    
                    // Show unified panel
                    livePanel.style.display = 'block';
                    if (status.phase === 'recovery') {
                        livePanel.style.opacity = '0.7';
                    } else {
                        livePanel.style.opacity = '1';
                    }
                    
                    // Update V/F display
                    if (status.live_data) {
                        const currentV = status.live_data.voltage || 0;
                        const currentF = status.live_data.frequency || 0;
                        
                        document.getElementById('current-voltage').textContent = currentV || '--';
                        document.getElementById('current-frequency').textContent = currentF || '--';
                        
                        // Update trend arrows
                        updateTrendArrows(currentV, currentF);
                        
                        // Update range labels
                        if (window.benchmarkConfig) {
                            const cfg = window.benchmarkConfig;
                            document.getElementById('voltage-range-start').textContent = cfg.voltage_start;
                            document.getElementById('voltage-range-stop').textContent = cfg.voltage_stop;
                            document.getElementById('freq-range-start').textContent = cfg.frequency_start;
                            document.getElementById('freq-range-stop').textContent = cfg.frequency_stop;
                        }
                    }
                    
                    // Update progress
                    const progress = status.progress || 0;
                    document.getElementById('test-progress-bar').style.width = progress + '%';
                    
                    let progressText = `Test ${status.tests_completed || 0} of ${status.tests_total || 0} (${progress}%)`;
                    if (status.failed_combos && status.failed_combos.length > 0) {
                        progressText += ` | ${status.failed_combos.length} skipped`;
                    }
                    document.getElementById('test-progress-text').textContent = progressText;
                    
                    // Update time remaining
                    updateTimeRemaining(status.tests_completed || 0, status.tests_total || window.totalTestsExpected, 
                        window.benchmarkConfig?.duration || 120);
                    
                    // Update live data if available
                    if (status.live_data) {
                        const ld = status.live_data;
                        document.getElementById('bench-live-hashrate').textContent = ld.hashrate?.toFixed(1) || '--';
                        document.getElementById('bench-live-power').textContent = ld.power?.toFixed(1) || '--';
                        
                        // Fan speed - try multiple possible field names
                        const fanSpeed = ld.fan_speed ?? ld.fanSpeed ?? ld.fanspeedpercent ?? ld.fan ?? null;
                        document.getElementById('bench-live-fan').textContent = fanSpeed?.toFixed(0) || '--';
                        
                        // Update fan bar
                        const fanBar = document.getElementById('fan-bar');
                        if (fanBar && fanSpeed !== null) {
                            fanBar.style.width = Math.min(100, fanSpeed) + '%';
                        }
                        
                        // Error percentage from API
                        const errorPct = ld.error_percentage ?? ld.errorPercentage ?? null;
                        document.getElementById('bench-live-error').textContent = errorPct !== null ? errorPct.toFixed(2) : '--';
                        
                        // Update error bar (0-5% is good, >5% is bad)
                        const errorBar = document.getElementById('error-bar');
                        if (errorBar && errorPct !== null) {
                            // Scale to 0-100% where 5% error = 100% bar
                            const errorBarWidth = Math.min(100, (errorPct / 5) * 100);
                            errorBar.style.width = errorBarWidth + '%';
                            // Color based on error rate
                            if (errorPct < 1) {
                                errorBar.style.background = '#4caf50';  // Green - excellent
                            } else if (errorPct < 3) {
                                errorBar.style.background = '#ff9800';  // Orange - acceptable
                            } else {
                                errorBar.style.background = '#f44336';  // Red - high errors
                            }
                        }
                        
                        // Calculate efficiency
                        let efficiency = null;
                        if (ld.hashrate && ld.power && ld.hashrate > 0) {
                            efficiency = (ld.power / ld.hashrate) * 1000;
                            document.getElementById('bench-live-efficiency').textContent = efficiency.toFixed(2);
                        }
                        
                        // Update best so far (goal-aware, hidden card + compact trophy)
                        if (ld.hashrate && ld.voltage && ld.frequency) {
                            const goal = (window.benchmarkConfig && window.benchmarkConfig.optimization_goal) ||
                                         (document.getElementById('goal')?.value) || 'max_hashrate';
                            updateBestSoFarFromSample(ld, efficiency, goal);
                        }

// Update hashrate comparison bar (for fine tune mode)
                        if (window.expectedHashrate) {
                            updateHashrateComparison(ld.hashrate || 0, window.expectedHashrate);
                        }
                        
                        // Update temperature/power bars
                        // Prefer backend safety limits/config for caps, fall back to form values
                        let maxTemp = status.safety_limits?.max_chip_temp;
                        if (maxTemp == null) {
                            maxTemp = parseFloat(document.getElementById('max-temp')?.value) || 65;
                        }
                        let maxVrTemp = status.safety_limits?.max_vr_temp;
                        if (maxVrTemp == null) {
                            maxVrTemp = parseFloat(document.getElementById('max-vr-temp')?.value) || 85;
                        }
                        let maxPower = null;
                        if (status.config && typeof status.config.max_power !== 'undefined' && status.config.max_power !== null) {
                            maxPower = status.config.max_power;
                        } else if (status.safety_limits && typeof status.safety_limits.max_power !== 'undefined' && status.safety_limits.max_power !== null) {
                            maxPower = status.safety_limits.max_power;
                        } else {
                            maxPower = parseFloat(document.getElementById('max-power')?.value) || 22;
                        }

                        document.getElementById('bench-max-temp').textContent = maxTemp;
                        document.getElementById('bench-max-vr-temp').textContent = maxVrTemp;
                        document.getElementById('bench-max-power-display').textContent = typeof maxPower === 'number' ? maxPower.toFixed(0) : maxPower;

                        // Temp bar: min 55°C, max from config
                        updateTempBar('temp-bar-chip', ld.temp, maxTemp, 'bench-live-temp', 55);
                        // VR temp bar: min 55°C, max from config
                        updateTempBar('temp-bar-vr', ld.vr_temp, maxVrTemp, 'bench-live-vr-temp', 55);
                        // Power bar: min 0, max from config
                        updateTempBar('power-bar', ld.power, maxPower, 'bench-live-power', 0);
                    }
                    
                    // Load session logs on first load (restores history after page refresh)
                    if (status.session_logs && !window.sessionLogsLoaded) {
                        window.sessionLogsLoaded = true;
                        const consoleEl = document.getElementById('benchmark-console');
                        if (consoleEl) {
                            consoleEl.innerHTML = '';  // Clear any existing content
                        }
                        // Replay all session logs
                        status.session_logs.forEach(log => {
                            logEvent(`[${log.time}] ${log.message}`, log.type || 'info');
                        });
                    }
                    
                    // Log ALL queued messages from backend
                    if (status.message_queue && status.message_queue.length > 0) {
                        status.message_queue.forEach(msg => {
                            let logType = 'info';
                            if (msg.phase === 'error') logType = 'error';
                            else if (msg.phase === 'warning') logType = 'warning';
                            else if (msg.phase === 'recovery') logType = 'recovery';
                            else if (msg.phase === 'test_complete' || msg.phase === 'success') logType = 'success';
                            else if (msg.phase === 'strategy') logType = 'success';
                            logEvent(msg.message, logType);
                        });
                        // Clear queue after processing
                        fetch(`${API_BASE}/api/benchmark/clear_queue`, { method: 'POST' }).catch(() => {});
                    }
                    
                    // Log recovery actions
                    if (status.recovery_action && status.recovery_action !== window.lastRecoveryAction) {
                        window.lastRecoveryAction = status.recovery_action;
                        logEvent(status.recovery_action, 'recovery');
                    }
                    
                    // Check for errors/warnings that need toast
                    if (status.error) {
                        showToast(status.error, 'error', 8000);
                    }
                    if (status.warning) {
                        showToast(status.warning, 'warning', 6000);
                    }
                    
                    setTimeout(checkBenchmarkStatus, 1000);  // Check more frequently
                } else {
                    // Benchmark stopped - re-enable form controls
                    statusDiv.style.display = 'none';
                    // KEEP the live benchmark panel visible so users can see the console and results
                    // document.getElementById('live-benchmark-panel').style.display = 'none';
                    document.getElementById('start-btn').disabled = false;
                    document.getElementById('stop-btn').style.display = 'none';
                    
                    // Restore the config form
                    document.getElementById('benchmark-config-form').style.display = 'block';
                    document.getElementById('config-collapse-btn').style.display = 'none';
                    
                    // Re-enable form controls
                    setBenchmarkFormDisabled(false);
                    
                    // Check if it stopped due to an error
                    if (status.error) {
                        logEvent(`Benchmark stopped: ${status.error}`, 'error');
                        
                        // Determine error type and suggestion
                        let errorTitle = 'Benchmark Error';
                        let suggestion = '';
                        const errorLower = status.error.toLowerCase();
                        
                        if (errorLower.includes('temperature') || errorLower.includes('temp') || errorLower.includes('thermal')) {
                            errorTitle = '🌡️ Temperature Limit Exceeded';
                            suggestion = 'Try: Increase fan speed, reduce voltage range, use lower max temp limit, or improve cooling';
                        } else if (errorLower.includes('power')) {
                            errorTitle = '⚡ Power Limit Exceeded';
                            suggestion = 'Try: Reduce voltage and frequency ranges, or check PSU capacity';
                        } else if (errorLower.includes('connection') || errorLower.includes('timeout')) {
                            errorTitle = '🔌 Connection Lost';
                            suggestion = 'Try: Check network connection, restart device, or increase timeout settings';
                        } else if (errorLower.includes('hashrate') || errorLower.includes('unstable')) {
                            errorTitle = '📉 Hashrate Unstable';
                            suggestion = 'Try: Use higher voltage for stability, reduce frequency, or give the device recovery time';
                        } else if (errorLower.includes('minimum') || errorLower.includes('base profile')) {
                            errorTitle = '⚠️ Base Settings Failed';
                            suggestion = "Your profile's base settings are unstable. Consider reducing the profile's voltage/frequency first.";
                        } else if (errorLower.includes('no more settings') || errorLower.includes('all combinations')) {
                            errorTitle = '🚫 All Settings Exhausted';
                            suggestion = 'No stable settings found in the test range. Try: Lower frequencies, better cooling, or check hardware.';
                        } else if (errorLower.includes('max retries')) {
                            errorTitle = '🔄 Recovery Failed';
                            suggestion = 'Auto-recovery exceeded max retries. Check the event log for which settings failed and why.';
                        }
                        
                        if (suggestion) {
                            logEvent(`💡 ${suggestion}`, 'info');
                        }
                        
                        // Show prominent error banner
                        showErrorBanner(errorTitle, status.error, suggestion);
                        
                        showToast(`Benchmark stopped: ${status.error}`, 'error', 10000);
                        
                        // Show last safe settings if available for recovery
                        if (status.last_safe_settings) {
                            logEvent(`Last stable: ${status.last_safe_settings.voltage}mV @ ${status.last_safe_settings.frequency}MHz`, 'recovery');
                        }
                        
                    } else if (status.phase === 'stopped' || status.phase === 'cancelled') {
                        logEvent('Benchmark stopped by user', 'warning');
                        showCompletionModal(status, 'stopped');
                    } else if (status.tests_completed > 0) {
                        logEvent(`Benchmark complete: ${status.tests_completed} tests finished`, 'success');
                        
                        // Save session to recent benchmarks
                        saveBenchmarkSession(status);
                        
                        // Show best result with apply button
                        if (window.bestResult) {
                            logEvent(`🏆 Best result: ${window.bestResult.hashrate.toFixed(1)} GH/s @ ${window.bestResult.voltage}mV/${window.bestResult.frequency}MHz`, 'success');
                            
                            // Show apply button in event log
                            const applyBtn = document.createElement('div');
                            applyBtn.innerHTML = `
                                <button onclick="applyBestSettings()" style="background: #4caf50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin: 8px 0; font-weight: bold;">
                                    ⚡ Apply Best Settings to Device
                                </button>
                                <button onclick="copyBestSettings()" style="background: #2196f3; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin: 8px 0 8px 8px;">
                                    📋 Copy
                                </button>
                            `;
                            const eventLog = document.getElementById('event-log-content');
                            if (eventLog) {
                                eventLog.insertBefore(applyBtn, eventLog.firstChild);
                            }
                        }
                        
                        // Show blocking completion modal
                        const autoState = window.autoTuneState;
                        if (autoState && autoState.running && autoState.phase === 'precision') {
                            autoTuneHandlePrecisionCompleted(status);
                        } else {
                            showCompletionModal(status, 'completed');
                            if (window.bestResult && !window.saveModalShown) {
                                const source = (window.fineTuneProfileName && window.fineTuneDeviceName) ? 'nano_tune' : 'benchmark';
                                openSaveTuneModalFromStatus(status, source);
                            }
                        }
                    }


// Show failed combos summary if any
                    if (status.failed_combos && status.failed_combos.length > 0) {
                        logEvent(`📋 Failed combinations (${status.failed_combos.length} total):`, 'warning');
                        status.failed_combos.forEach(fc => {
                            logEvent(`  ❌ ${fc.voltage}mV @ ${fc.frequency}MHz - ${fc.reason}`, 'error');
                        });
                    }
                    
                    loadSessions();
                    
                    // Check if this was a Nano Tune run and offer to save results
                    if (window.fineTuneProfileName && window.fineTuneDeviceName) {
                        setTimeout(async () => {
                            await handleNanoTuneComplete();
                        }, 500);
                    }
                }
            } catch (error) {
                console.error('Error checking status:', error);
            }
        
                // If benchmark is no longer running, clear any persisted UI state
                if (!status.running) {
                    clearBenchmarkUiState();
                }
}
        
        // Apply best settings from benchmark to the device
        async function applyBestSettings() {
            if (!window.bestResult) {
                showToast('No best result available', 'error');
                return;
            }
            
            const deviceSelect = document.getElementById('device-select');
            const deviceName = deviceSelect.value;
            
            if (!deviceName) {
                showToast('No device selected', 'error');
                return;
            }
            
            const voltage = window.bestResult.voltage;
            const frequency = window.bestResult.frequency;
            
            if (!confirm(`Apply ${voltage}mV @ ${frequency}MHz to ${deviceName}?`)) {
                return;
            }
            
            try {
                showToast('Applying settings...', 'info');
                
                const response = await fetch(`${API_BASE}/api/device/${encodeURIComponent(deviceName)}/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        coreVoltage: voltage,
                        frequency: frequency
                    })
                });
                
                if (response.ok) {
                    logEvent(`✓ Applied ${voltage}mV @ ${frequency}MHz to ${deviceName}`, 'success');
                    showToast(`Settings applied to ${deviceName}!`, 'success');
                } else {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to apply settings');
                }
            } catch (error) {
                logEvent(`Failed to apply settings: ${error.message}`, 'error');
                showToast(`Error: ${error.message}`, 'error');
            }
        }
        
        // Copy best settings to clipboard
        function copyBestSettings() {
            if (!window.bestResult) {
                showToast('No best result available', 'error');
                return;
            }
            
            const text = `${window.bestResult.voltage}mV @ ${window.bestResult.frequency}MHz (${window.bestResult.hashrate.toFixed(1)} GH/s, ${window.bestResult.efficiency?.toFixed(2) || '--'} J/TH)`;
            
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copied to clipboard!', 'success', 2000);
            }).catch(() => {
                // Fallback for older browsers
                const input = document.createElement('input');
                input.value = text;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                showToast('Copied to clipboard!', 'success', 2000);
            });
        }
        
        async function stopBenchmark() {
            if (!confirm('Are you sure you want to stop the benchmark?')) {
                return;
            }
            
            try {
                logEvent('Stop requested by user...', 'warning');
                
                const response = await fetch(`${API_BASE}/api/benchmark/stop`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    document.getElementById('stop-btn').style.display = 'none';
                    document.getElementById('start-btn').disabled = false;
                    logEvent('Benchmark stopped', 'warning');
                    showToast('Benchmark stopped', 'warning');
                    clearBenchmarkUiState();
                    checkBenchmarkStatus();
                } else {
                    logEvent('Failed to stop benchmark', 'error');
                    showToast('Failed to stop benchmark', 'error');
                }
            } catch (error) {
                console.error('Error stopping benchmark:', error);
                logEvent(`Error stopping: ${error.message}`, 'error');
                showToast('Error stopping benchmark', 'error');
            }
        }
        
        // Live monitoring
        function initCharts() {
            if (hashrateChart) return; // Already initialized
            
            const chartConfig = {
                type: 'line',
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        x: { display: true },
                        y: { beginAtZero: false }
                    }
                }
            };
            
            hashrateChart = new Chart(document.getElementById('hashrate-chart'), {
                ...chartConfig,
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Hashrate (GH/s)',
                        data: [],
                        borderColor: '#ff3333',
                        backgroundColor: 'rgba(255, 51, 51, 0.1)',
                        tension: 0.4
                    }]
                }
            });
            
            tempChart = new Chart(document.getElementById('temp-chart'), {
                ...chartConfig,
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Temperature (°C)',
                        data: [],
                        borderColor: '#ff3333',
                        backgroundColor: 'rgba(255, 51, 51, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'VR Temp (°C)',
                        data: [],
                        borderColor: '#1a1a1a',
                        backgroundColor: 'rgba(26, 26, 26, 0.1)',
                        tension: 0.4
                    }]
                }
            });
            
            powerChart = new Chart(document.getElementById('power-chart'), {
                ...chartConfig,
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Power (W)',
                        data: [],
                        borderColor: '#ff3333',
                        backgroundColor: 'rgba(255, 51, 51, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'Voltage (mV)',
                        data: [],
                        borderColor: '#1a1a1a',
                        backgroundColor: 'rgba(26, 26, 26, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y1'
                    }]
                },
                options: {
                    ...chartConfig.options,
                    scales: {
                        x: { display: true },
                        y: { beginAtZero: false, position: 'left' },
                        y1: { beginAtZero: false, position: 'right', grid: { drawOnChartArea: false } }
                    }
                }
            });
        }
        
        function startMonitoring() {
            const device = document.getElementById('monitor-device-select').value;
            
            if (monitoringInterval) {
                clearInterval(monitoringInterval);
                monitoringInterval = null;
            }
            
            if (!device) return;
            
            // Reset data
            monitoringData = {
                time: [],
                hashrate: [],
                temp: [],
                vrTemp: [],
                power: [],
                voltage: [],
                frequency: [],
                fanSpeed: []
            };
            
            monitoringInterval = setInterval(async () => {
                try {
                    const response = await fetch(`${API_BASE}/api/devices/${device}/status`);
                    if (!response.ok) return;
                    
                    const data = await response.json();
                    const now = new Date().toLocaleTimeString();
                    
                    // Update stats
                    document.getElementById('live-hashrate').textContent = data.hashrate.toFixed(1);
                    document.getElementById('live-temp').textContent = data.temperature.toFixed(1);
                    document.getElementById('live-power').textContent = data.power.toFixed(1);
                    document.getElementById('live-voltage').textContent = data.voltage;
                    document.getElementById('live-frequency').textContent = data.frequency || '--';
                    document.getElementById('live-fan').textContent = (data.fan_speed !== undefined && data.fan_speed !== null) ? data.fan_speed.toFixed(1) : '--';
                    document.getElementById('live-vr-temp').textContent = (data.vr_temp !== undefined && data.vr_temp !== null) ? data.vr_temp.toFixed(1) : '--';
                    document.getElementById('live-error').textContent = (data.error_percentage !== undefined && data.error_percentage !== null) ? data.error_percentage.toFixed(2) : '--';
                    
                    // Update charts
                    monitoringData.time.push(now);
                    monitoringData.hashrate.push(data.hashrate);
                    monitoringData.temp.push(data.temperature);
                    monitoringData.vrTemp.push(data.vr_temp || 0);
                    monitoringData.power.push(data.power);
                    monitoringData.voltage.push(data.voltage);
                    monitoringData.frequency.push(data.frequency || 0);
                    monitoringData.fanSpeed.push(data.fan_speed || 0);
                    
                    // Keep only last 60 points
                    if (monitoringData.time.length > 60) {
                        monitoringData.time.shift();
                        monitoringData.hashrate.shift();
                        monitoringData.temp.shift();
                        monitoringData.vrTemp.shift();
                        monitoringData.power.shift();
                        monitoringData.voltage.shift();
                        monitoringData.frequency.shift();
                        monitoringData.fanSpeed.shift();
                    }
                    
                    // Update charts
                    hashrateChart.data.labels = monitoringData.time;
                    hashrateChart.data.datasets[0].data = monitoringData.hashrate;
                    hashrateChart.update('none');
                    
                    tempChart.data.labels = monitoringData.time;
                    tempChart.data.datasets[0].data = monitoringData.temp;
                    tempChart.data.datasets[1].data = monitoringData.vrTemp;
                    tempChart.update('none');
                    
                    powerChart.data.labels = monitoringData.time;
                    powerChart.data.datasets[0].data = monitoringData.power;
                    powerChart.data.datasets[1].data = monitoringData.voltage;
                    powerChart.update('none');
                    
                } catch (error) {
                    console.error('Error fetching device status:', error);
                }
            }, 2000);
        }
        
        // Sessions
        async function loadSessions() {
            try {
                const response = await fetch(`${API_BASE}/api/sessions`);
                const sessions = await response.json();
                
                const sessionsDiv = document.getElementById('sessions-list');
                const bulkBar = document.getElementById('sessions-bulk-bar');
                sessionsDiv.innerHTML = '';
                
                if (sessions.length === 0) {
                    sessionsDiv.innerHTML = '<p style="text-align: center; color: #999;">No sessions yet. Run a benchmark to get started.</p>';
                    bulkBar.style.display = 'none';
                    return;
                }
                
                // Show bulk bar when there are sessions
                bulkBar.style.display = 'flex';
                
                // Store sessions for bulk operations
                window.allSessions = sessions;
                
                sessions.forEach(session => {
                    const sessionDiv = document.createElement('div');
                    sessionDiv.className = 'device';
                    sessionDiv.style.cursor = 'pointer';
                    const stopReasonHtml = session.stop_reason ? 
                        `<br><span style="color: #ff9800; font-size: 0.85em;">⚠️ ${session.stop_reason}</span>` : '';
                    sessionDiv.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="display: flex; align-items: flex-start; gap: 12px;">
                                <input type="checkbox" class="session-checkbox" data-session-id="${session.id}" 
                                       onclick="event.stopPropagation(); updateSessionSelection()" 
                                       style="width: 18px; height: 18px; margin-top: 3px; cursor: pointer;">
                                <div>
                                    <strong>Session ${session.id.substring(0, 8)}</strong>
                                    <span style="background: #444; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; margin-left: 10px;">${session.device || 'Unknown'}</span><br>
                                    <small style="color: #999;">${new Date(session.start_time).toLocaleString()}</small><br>
                                    <span style="color: #aaa;">Tests: ${session.tests}</span>
                                    ${stopReasonHtml}
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span class="badge ${session.status}">${session.status}</span>
                                ${session.has_logs ? `<button onclick="event.stopPropagation(); viewServerSessionLogs('${session.id}')" style="width: auto; min-height: auto; padding: 5px 10px; background: #444;">📋 Logs</button>` : ''}
                                ${session.status === 'completed' && session.tests > 0 ? `<button onclick="event.stopPropagation(); generateProfilesFromSession('${session.id}')" style="width: auto; min-height: auto; padding: 5px 10px; background: #4caf50;">📋 Profiles</button>` : ''}
                                <button onclick="event.stopPropagation(); deleteSession('${session.id}')" style="width: auto; min-height: auto; padding: 5px 10px; background: #ff3333;">🗑️</button>
                            </div>
                        </div>
                    `;
                    sessionDiv.onclick = (e) => {
                        if (e.target.type !== 'checkbox') {
                            window.open(`/api/sessions/${session.id}`, '_blank');
                        }
                    };
                    sessionsDiv.appendChild(sessionDiv);
                });
                
                updateSessionSelection();
            } catch (error) {
                console.error('Error loading sessions:', error);
            }
        }
        
        async function viewServerSessionLogs(sessionId) {
            try {
                const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/logs`);
                if (response.ok) {
                    const data = await response.json();
                    currentSessionLogs = data.logs || [];
                    currentSessionTitle = `Session ${sessionId}`;
                    
                    document.getElementById('session-logs-title').innerHTML = `
                        <strong>${currentSessionTitle}</strong><br>
                        <span style="color: #888; font-size: 0.9em;">${currentSessionLogs.length} log entries</span>
                        ${data.stop_reason ? `<br><span style="color: #ff9800; font-size: 0.85em;">Stop reason: ${data.stop_reason}</span>` : ''}
                    `;
                    
                    const logsContent = document.getElementById('session-logs-content');
                    if (currentSessionLogs.length === 0) {
                        logsContent.innerHTML = '<p style="color: #666; text-align: center;">No logs available for this session</p>';
                    } else {
                        logsContent.innerHTML = currentSessionLogs.map(log => {
                            const color = log.type === 'success' ? '#4caf50' : 
                                          log.type === 'error' ? '#f44336' : 
                                          log.type === 'warning' ? '#ff9800' : 
                                          log.type === 'recovery' ? '#03a9f4' : '#aaa';
                            return `<div style="padding: 4px 0; border-bottom: 1px solid #333;">
                                <span style="color: #666;">[${log.time}]</span> 
                                <span style="color: ${color};">${log.message}</span>
                            </div>`;
                        }).join('');
                    }
                    
                    document.getElementById('sessionLogsModal').style.display = 'block';
                } else {
                    showToast('Failed to load logs', 'error');
                }
            } catch (e) {
                console.error('Failed to load logs:', e);
                showToast('Failed to load logs', 'error');
            }
        }
        
        function toggleSelectAllSessions() {
            const selectAll = document.getElementById('select-all-sessions');
            const checkboxes = document.querySelectorAll('.session-checkbox');
            checkboxes.forEach(cb => cb.checked = selectAll.checked);
            updateSessionSelection();
        }
        
        function updateSessionSelection() {
            const checkboxes = document.querySelectorAll('.session-checkbox:checked');
            const count = checkboxes.length;
            document.getElementById('sessions-selected-count').textContent = `${count} selected`;
            document.getElementById('delete-selected-btn').disabled = count === 0;
            
            // Update select all checkbox state
            const allCheckboxes = document.querySelectorAll('.session-checkbox');
            const selectAll = document.getElementById('select-all-sessions');
            selectAll.checked = allCheckboxes.length > 0 && checkboxes.length === allCheckboxes.length;
            selectAll.indeterminate = checkboxes.length > 0 && checkboxes.length < allCheckboxes.length;
        }
        
        async function deleteSelectedSessions() {
            const checkboxes = document.querySelectorAll('.session-checkbox:checked');
            const ids = Array.from(checkboxes).map(cb => cb.dataset.sessionId);
            
            if (ids.length === 0) return;
            
            if (!confirm(`Delete ${ids.length} session(s)? This cannot be undone.`)) return;
            
            let deleted = 0;
            for (const id of ids) {
                try {
                    const response = await fetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' });
                    if (response.ok) deleted++;
                } catch (e) {
                    console.error(`Failed to delete ${id}:`, e);
                }
            }
            
            showToast(`Deleted ${deleted} of ${ids.length} sessions`, deleted === ids.length ? 'success' : 'warning');
            loadSessions();
        }
        
        async function deleteOldSessions(days) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            
            const oldSessions = (window.allSessions || []).filter(s => new Date(s.start_time) < cutoff);
            
            if (oldSessions.length === 0) {
                showToast(`No sessions older than ${days} days`, 'info');
                return;
            }
            
            if (!confirm(`Delete ${oldSessions.length} session(s) older than ${days} days?`)) return;
            
            let deleted = 0;
            for (const session of oldSessions) {
                try {
                    const response = await fetch(`${API_BASE}/api/sessions/${session.id}`, { method: 'DELETE' });
                    if (response.ok) deleted++;
                } catch (e) {
                    console.error(`Failed to delete ${session.id}:`, e);
                }
            }
            
            showToast(`Deleted ${deleted} old sessions`, 'success');
            loadSessions();
        }
        
        async function deleteSession(sessionId) {
            if (!confirm('Delete this session? This cannot be undone.')) return;
            
            try {
                const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    loadSessions();
                } else {
                    alert('Failed to delete session');
                }
            } catch (error) {
                console.error('Error deleting session:', error);
                alert('Error deleting session');
            }
        }
        
        // Profile Management
        let pendingProfiles = null;
        let pendingDeviceName = null;
        
        async function loadProfiles() {
            try {
                const devResponse = await fetch(`${API_BASE}/api/devices`);
                const devices = await devResponse.json();
                
                const profilesDiv = document.getElementById('profiles-list');
                profilesDiv.innerHTML = '';
                
                if (devices.length === 0) {
                    profilesDiv.innerHTML = '<p style="text-align: center; color: #999;">No devices configured. Add devices first.</p>';
                    return;
                }
                
                for (const device of devices) {
                    const profResponse = await fetch(`${API_BASE}/api/profiles/${device.name}`);
                    const profData = await profResponse.json();
                    
                    const deviceDiv = document.createElement('div');
                    deviceDiv.className = 'device';
                    deviceDiv.style.marginBottom = '15px';
                    
                    if (!profData.exists || !profData.profiles) {
                        deviceDiv.innerHTML = `
                            <div class="device-name">${device.name}</div>
                            <p style="color: #999;">No profiles yet. Run a benchmark to generate profiles, or create one manually.</p>
                            <button onclick="createNewProfile('${device.name}')" 
                                    style="background: #4caf50; padding: 8px 15px; margin-top: 10px;">
                                ➕ Create New Profile
                            </button>
                        `;
                    } else {
                        const profiles = profData.profiles;
                        const profileCards = Object.keys(profiles).map(name => {
                            const p = profiles[name];
                            if (!p) return '';
                            const color = name === 'nuclear' ? '#ff3333' : name === 'max' ? '#ff9800' : name === 'quiet' ? '#4caf50' : '#2196f3';
                            const safeDeviceName = device.name.replace(/'/g, "\\'");
                            const safeProfileData = JSON.stringify(p).replace(/'/g, "\\'").replace(/"/g, '&quot;');
                            return `
                                <div style="background: #1a1a1a; border-radius: 8px; padding: 10px; margin: 5px; border-left: 4px solid ${color}; min-width: 170px;">
                                    <div style="display: flex; justify-content: space-between; align-items: start;">
                                        <strong style="color: ${color};">${name.toUpperCase()}</strong>
                                        <div style="display: flex; gap: 3px;">
                                            <button onclick="editProfile('${safeDeviceName}', '${name}', JSON.parse(this.dataset.profile))" 
                                                    data-profile='${JSON.stringify(p)}'
                                                    style="padding: 2px 6px; font-size: 0.7em; background: #666;" title="Edit profile">✏️</button>
                                            <button onclick="deleteProfile('${safeDeviceName}', '${name}')" 
                                                    style="padding: 2px 6px; font-size: 0.7em; background: #c62828;" title="Delete profile">🗑️</button>
                                        </div>
                                    </div>
                                    <span style="color: white; font-size: 0.9em;">${p.voltage}mV @ ${p.frequency}MHz</span><br>
                                    <small style="color: #888;">${p.expected_hashrate?.toFixed(1) || '?'} GH/s | ${p.expected_power?.toFixed(1) || '?'}W</small><br>
                                    <small style="color: #666;">Fan: ${p.fan_target || 65}°C</small>
                                    ${p.notes ? `<br><small style="color: #666; font-style: italic;">"${p.notes.substring(0, 30)}${p.notes.length > 30 ? '...' : ''}"</small>` : ''}
                                    <div style="display: flex; gap: 5px; margin-top: 8px;">
                                        <button onclick="applyProfile('${safeDeviceName}', '${name}')" 
                                                style="flex: 1; padding: 5px 8px; font-size: 0.8em;">
                                            ▶ Apply
                                        </button>
                        <button onclick="fineTuneProfile('${safeDeviceName}', '${name}', JSON.parse(this.dataset.profile))" 
                                data-profile='${JSON.stringify(p)}'
                                style="flex: 1; padding: 5px 8px; font-size: 0.8em; background: #9c27b0;"
                                title="Fine tune this profile with Nano Tune optimization">
                            🔬 Nano
                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('');
                        
                        deviceDiv.innerHTML = `
                            <div class="device-name">${device.name}</div>
                            <div style="color: #aaa; margin-bottom: 10px;">
                                Created: ${new Date(profData.created).toLocaleDateString()}
                            </div>
                            <div style="display: flex; flex-wrap: wrap;">
                                ${profileCards}
                                <div style="background: #333; border-radius: 8px; padding: 10px; margin: 5px; min-width: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                                    <button onclick="createNewProfile('${device.name}')" 
                                            style="background: #4caf50; padding: 8px 15px; width: 100%;">
                                        ➕ New Profile
                                    </button>
                                    <button onclick="saveCustomProfile('${device.name}')" 
                                            style="background: #666; padding: 8px 15px; width: 100%;">
                                        💾 Save Current
                                    </button>
                                </div>
                            </div>
                        `;
                    }
                    
                    profilesDiv.appendChild(deviceDiv);
                }
            } catch (error) {
                console.error('Error loading profiles:', error);
            }
        }
        
        async function applyProfile(deviceName, profileName) {
            if (!confirm(`Apply ${profileName.toUpperCase()} profile to ${deviceName}?`)) return;
            
            try {
                const response = await fetch(`${API_BASE}/api/profiles/${deviceName}/apply/${profileName}`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    alert(`Applied ${profileName}: ${result.voltage}mV @ ${result.frequency}MHz`);
                } else {
                    alert('Failed to apply profile');
                }
            } catch (error) {
                console.error('Error applying profile:', error);
                alert('Error applying profile');
            }
        }
        
        async function saveCustomProfile(deviceName) {
            try {
                const response = await fetch(`${API_BASE}/api/profiles/${deviceName}/custom`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    alert(`Saved custom profile: ${result.voltage}mV @ ${result.frequency}MHz`);
                    loadProfiles();
                } else {
                    alert('Failed to save custom profile');
                }
            } catch (error) {
                console.error('Error saving custom profile:', error);
            }
        }
        
        function fineTuneProfile(deviceName, profileName, profileData) {
            console.log('Nano Tune: Opening goal selection for', profileName, profileData);
            
            // Store the FULL profile data for later use (including benchmark config)
            window.nanoTuneData = {
                deviceName: deviceName,
                profileName: profileName,
                voltage: profileData.voltage,
                frequency: profileData.frequency,
                expectedHashrate: profileData.expected_hashrate,
                // Include all benchmark config from the profile
                psuWattage: profileData.psu_wattage || 22,
                psuUpgraded: profileData.psu_upgraded || false,
                maxChipTemp: profileData.max_chip_temp || 65,
                maxVrTemp: profileData.max_vr_temp || 85,
                maxPower: profileData.max_power || 22,
                testDuration: profileData.test_duration || 120,
                warmupTime: profileData.warmup_time || 10,
                fanTarget: profileData.fan_target || 65,
                targetError: (typeof profileData.target_error === 'number' ? profileData.target_error : 0.20),
                // Store original profile for reference
                fullProfile: profileData
            };
            
            // Update modal content
            document.getElementById('nano-tune-profile-name').textContent = profileName.toUpperCase();
            document.getElementById('nano-base-voltage').textContent = profileData.voltage;
            document.getElementById('nano-base-frequency').textContent = profileData.frequency;
            
            // Reset goal selection
            document.querySelectorAll('.nano-goal-option').forEach(opt => {
                opt.style.borderColor = '#3d3d3d';
                opt.style.background = '#1a1a1a';
            });
            document.getElementById('nano-tune-info').style.display = 'none';
            document.getElementById('nano-quiet-settings').style.display = 'none';
            document.getElementById('nano-tune-start-btn').disabled = true;
            document.getElementById('nano-tune-start-btn').textContent = 'Select a Goal Above';
            window.selectedNanoGoal = null;
            
            // Show the modal
            document.getElementById('nanoTuneModal').style.display = 'block';
        }
        
        function selectNanoGoal(goal) {
            const data = window.nanoTuneData;
            window.selectedNanoGoal = goal;
            
            // Update visual selection
            document.querySelectorAll('.nano-goal-option').forEach(opt => {
                const colors = { max_hashrate: '#ff9800', balanced: '#9c27b0', efficient: '#4caf50', quiet: '#03a9f4' };
                if (opt.dataset.goal === goal) {
                    opt.style.borderColor = colors[goal];
                    opt.style.background = '#2d2d2d';
                } else {
                    opt.style.borderColor = '#3d3d3d';
                    opt.style.background = '#1a1a1a';
                }
            });
            
            // Show/hide quiet mode settings
            document.getElementById('nano-quiet-settings').style.display = goal === 'quiet' ? 'block' : 'none';
            
            // Calculate ranges based on goal
            let vRange, fRange, vStep, fStep, description;
            
            if (goal === 'max_hashrate') {
                // Push higher - test above current settings
                vRange = { start: data.voltage, stop: data.voltage + 30 };
                fRange = { start: data.frequency, stop: data.frequency + 30 };
                vStep = 5;
                fStep = 5;
                description = `Voltage: ${vRange.start}-${vRange.stop}mV (${vStep}mV steps) | Frequency: ${fRange.start}-${fRange.stop}MHz (${fStep}MHz steps)`;
            } else if (goal === 'efficient') {
                // Pull lower - test below current settings
                vRange = { start: data.voltage - 30, stop: data.voltage };
                fRange = { start: data.frequency - 30, stop: data.frequency };
                vStep = 5;
                fStep = 5;
                description = `Voltage: ${vRange.start}-${vRange.stop}mV (${vStep}mV steps) | Frequency: ${fRange.start}-${fRange.stop}MHz (${fStep}MHz steps)`;
            } else if (goal === 'quiet') {
                // Quiet mode - test lower settings to reduce heat/fan
                vRange = { start: data.voltage - 50, stop: data.voltage };
                fRange = { start: data.frequency - 50, stop: data.frequency };
                vStep = 10;
                fStep = 10;
                const targetFan = document.getElementById('nano-target-fan').value;
                description = `Target: Fan ≤${targetFan}% | Testing lower V/F combinations to reduce heat`;
            } else {
                // Balanced - test around current settings
                vRange = { start: data.voltage - 10, stop: data.voltage + 10 };
                fRange = { start: data.frequency - 10, stop: data.frequency + 10 };
                vStep = 2;
                fStep = 2;
                description = `Voltage: ${vRange.start}-${vRange.stop}mV (${vStep}mV steps) | Frequency: ${fRange.start}-${fRange.stop}MHz (${fStep}MHz steps)`;
            }
            
            // Store the calculated ranges
            window.nanoTuneRanges = { vRange, fRange, vStep, fStep, goal };
            
            // Update info display
            document.getElementById('nano-test-range').textContent = description;
            document.getElementById('nano-tune-info').style.display = 'block';
            
            // Enable start button
            const goalNames = { 
                max_hashrate: '⚡ Start Max Hashrate Tune', 
                balanced: '⚖️ Start Balanced Tune', 
                efficient: '🌱 Start Efficient Tune',
                quiet: '🤫 Start Quiet Tune'
            };
            document.getElementById('nano-tune-start-btn').textContent = goalNames[goal];
            document.getElementById('nano-tune-start-btn').disabled = false;
        }
        
        function closeNanoTuneModal() {
            document.getElementById('nanoTuneModal').style.display = 'none';
            window.nanoTuneData = null;
            window.nanoTuneRanges = null;
            window.selectedNanoGoal = null;
        }
        
        function startNanoTune() {
            const data = window.nanoTuneData;
            const ranges = window.nanoTuneRanges;
            
            if (!data || !ranges) {
                alert('Error: No tune data available');
                return;
            }
            
            // Get auto-save preference (optional) and quiet mode target
            let autoSave = false;
            const autoSaveEl = document.getElementById('nano-auto-save');
            if (autoSaveEl) {
                autoSave = !!autoSaveEl.checked;
            }
            const quietTargetFan = ranges.goal === 'quiet' ? parseInt(document.getElementById('nano-target-fan').value) : null;
            
            closeNanoTuneModal();
            
            try {
                // First, select the device
                const deviceSelect = document.getElementById('device-select');
                for (let i = 0; i < deviceSelect.options.length; i++) {
                    if (deviceSelect.options[i].value === data.deviceName) {
                        deviceSelect.selectedIndex = i;
                        console.log('Selected device:', data.deviceName);
                        break;
                    }
                }
                
                // Load the device profile
                loadDeviceProfile().then(() => {
                    console.log('Device profile loaded');
                    
                    // Switch to Benchmark tab
                    const benchmarkButton = Array.from(document.querySelectorAll('.tab')).find(btn => btn.textContent.includes('Benchmark'));
                    if (benchmarkButton) {
                        benchmarkButton.click();
                    }
                    
                    // Set tuning ranges based on selected goal
                    document.getElementById('voltage-start').value = ranges.vRange.start;
                    document.getElementById('voltage-stop').value = ranges.vRange.stop;
                    document.getElementById('voltage-step').value = ranges.vStep;
                    
                    document.getElementById('frequency-start').value = ranges.fRange.start;
                    document.getElementById('frequency-stop').value = ranges.fRange.stop;
                    document.getElementById('frequency-step').value = ranges.fStep;
                    
                    // Set test parameters FROM PROFILE'S BENCHMARK CONFIG
                    document.getElementById('duration').value = data.testDuration || 120;
                    document.getElementById('warmup').value = data.warmupTime || 10;
                    document.getElementById('cycles-per-test').value = 1;
                    
                    // Set safety limits FROM PROFILE'S BENCHMARK CONFIG
                    document.getElementById('max-temp').value = data.maxChipTemp || 65;
                    document.getElementById('max-vr-temp').value = data.maxVrTemp || 85;
                    document.getElementById('max-power').value = data.maxPower || 22;

                    // Set benchmark optimization goal to match Nano Tune goal
                    const goalSelect = document.getElementById('goal');
                    if (goalSelect && ranges && ranges.goal) {
                        goalSelect.value = ranges.goal;
                    }

                    // Set ASIC error target from profile if available
                    if (typeof data.targetError === 'number') {
                        document.getElementById('target-error').value = data.targetError;
                    } else {
                        document.getElementById('target-error').value = 0.20;
                    }

                    // Store metadata for saving back to profile
                    window.fineTuneExpectedHashrate = data.expectedHashrate;
                    window.fineTuneProfileName = data.profileName;
                    window.fineTuneDeviceName = data.deviceName;
                    window.fineTuneOptimizationGoal = ranges.goal;
                    window.fineTuneAutoSave = autoSave;
                    window.fineTuneQuietTarget = quietTargetFan;
                    window.fineTuneFullProfile = data.fullProfile;  // Store full profile for later
                    
                    console.log('Nano Tune parameters set for', ranges.goal, 'mode');
                    console.log('Using profile benchmark config:', {
                        maxChipTemp: data.maxChipTemp,
                        maxVrTemp: data.maxVrTemp,
                        maxPower: data.maxPower,
                        testDuration: data.testDuration,
                        warmupTime: data.warmupTime
                    });
                    if (quietTargetFan) console.log('Quiet mode target fan:', quietTargetFan + '%');
                    
                    // Auto-start the benchmark
                    setTimeout(() => {
                        startBenchmark();
                    }, 500);
                    
                }).catch(err => {
                    console.error('Error loading device profile:', err);
                    alert('Error loading device profile. Please select the device manually.');
                });
                
            } catch (err) {
                console.error('Error in Nano Tune:', err);
                alert('Error starting Nano Tune: ' + err.message);
            }
        }
        
        // ============================================================
        // Profile Editing Functions
        // ============================================================
        
        function editProfile(deviceName, profileName, profileData) {
            console.log('Edit profile:', deviceName, profileName, profileData);
            
            // Basic settings
            document.getElementById('edit-profile-device').value = deviceName;
            document.getElementById('edit-profile-original-name').value = profileName;
            document.getElementById('edit-profile-name').value = profileName;
            document.getElementById('edit-profile-voltage').value = profileData.voltage || 1200;
            document.getElementById('edit-profile-frequency').value = profileData.frequency || 500;
            document.getElementById('edit-profile-fan-target').value = profileData.fan_target || 65;
            
            // Benchmark config
            document.getElementById('edit-profile-psu-wattage').value = profileData.stock_psu_watts || profileData.psu_wattage || 22;
            document.getElementById('edit-profile-psu-type').value = profileData.psu_upgraded ? 'upgraded' : 'stock';
            document.getElementById('edit-profile-max-chip-temp').value = profileData.max_chip_temp || 65;
            document.getElementById('edit-profile-max-vr-temp').value = profileData.max_vr_temp || 85;
            document.getElementById('edit-profile-max-power').value = profileData.max_power || 22;
            document.getElementById('edit-profile-test-duration').value = profileData.test_duration || 120;
            document.getElementById('edit-profile-warmup').value = profileData.warmup_time || 10;
            
            // Results
            document.getElementById('edit-profile-hashrate').value = profileData.expected_hashrate || '';
            document.getElementById('edit-profile-power').value = profileData.expected_power || '';
            document.getElementById('edit-profile-efficiency').value = profileData.efficiency || '';
            document.getElementById('edit-profile-stability').value = profileData.stability_score || '';
            document.getElementById('edit-profile-fan-speed').value = profileData.avg_fan_speed || '';
            document.getElementById('edit-profile-avg-chip-temp').value = profileData.avg_chip_temp || '';
            document.getElementById('edit-profile-avg-vr-temp').value = profileData.avg_vr_temp || '';
            
            // Notes
            document.getElementById('edit-profile-notes').value = profileData.notes || '';
            
            // Metadata display
            let metadataHtml = '';
            if (profileData.tested_at) {
                metadataHtml += `<span>Tested: ${new Date(profileData.tested_at).toLocaleDateString()}</span>`;
            }
            if (profileData.source_session_id) {
                metadataHtml += ` | <span>Session: ${profileData.source_session_id.substring(0, 8)}...</span>`;
            }
            document.getElementById('edit-profile-metadata').innerHTML = metadataHtml;
            
            document.getElementById('edit-profile-title').textContent = 'Edit Profile: ' + profileName.toUpperCase();
            
            document.getElementById('editProfileModal').style.display = 'block';
        }
        
        function createNewProfile(deviceName) {
            console.log('Create new profile for:', deviceName);
            
            // Basic settings - defaults
            document.getElementById('edit-profile-device').value = deviceName;
            document.getElementById('edit-profile-original-name').value = '';  // Empty means new profile
            document.getElementById('edit-profile-name').value = '';
            document.getElementById('edit-profile-voltage').value = 1200;
            document.getElementById('edit-profile-frequency').value = 500;
            document.getElementById('edit-profile-fan-target').value = 65;
            
            // Benchmark config - sensible defaults
            document.getElementById('edit-profile-psu-wattage').value = 25;
            document.getElementById('edit-profile-psu-type').value = 'stock';
            document.getElementById('edit-profile-max-chip-temp').value = 65;
            document.getElementById('edit-profile-max-vr-temp').value = 85;
            document.getElementById('edit-profile-max-power').value = 22;
            document.getElementById('edit-profile-test-duration').value = 120;
            document.getElementById('edit-profile-warmup').value = 15;
            
            // Results - empty for new profile
            document.getElementById('edit-profile-hashrate').value = '';
            document.getElementById('edit-profile-power').value = '';
            document.getElementById('edit-profile-efficiency').value = '';
            document.getElementById('edit-profile-stability').value = '';
            document.getElementById('edit-profile-fan-speed').value = '';
            document.getElementById('edit-profile-avg-chip-temp').value = '';
            document.getElementById('edit-profile-avg-vr-temp').value = '';
            
            // Notes
            document.getElementById('edit-profile-notes').value = '';
            document.getElementById('edit-profile-metadata').innerHTML = '';
            
            document.getElementById('edit-profile-title').textContent = 'Create New Profile';
            
            document.getElementById('editProfileModal').style.display = 'block';
        }
        
        function closeEditProfileModal() {
            document.getElementById('editProfileModal').style.display = 'none';
        }
        
        async function saveEditedProfile() {
            const deviceName = document.getElementById('edit-profile-device').value;
            const originalName = document.getElementById('edit-profile-original-name').value;
            const newName = document.getElementById('edit-profile-name').value.toLowerCase().trim();
            
            if (!newName) {
                alert('Please enter a profile name');
                return;
            }
            
            // Validate name - alphanumeric and underscores only
            if (!/^[a-z0-9_]+$/.test(newName)) {
                alert('Profile name can only contain lowercase letters, numbers, and underscores');
                return;
            }
            
            const profileData = {
                // Basic settings (what to apply)
                voltage: parseInt(document.getElementById('edit-profile-voltage').value) || 1200,
                frequency: parseInt(document.getElementById('edit-profile-frequency').value) || 500,
                fan_target: parseInt(document.getElementById('edit-profile-fan-target').value) || 65,
                
                // PSU config
                stock_psu_watts: parseInt(document.getElementById('edit-profile-psu-wattage').value) || 22,
                safe_power_stock_psu: parseInt(document.getElementById('edit-profile-psu-wattage').value) - 3 || 22,
                psu_upgraded: document.getElementById('edit-profile-psu-type').value === 'upgraded',
                
                // Benchmark config (how to re-test)
                max_chip_temp: parseInt(document.getElementById('edit-profile-max-chip-temp').value) || 65,
                max_vr_temp: parseInt(document.getElementById('edit-profile-max-vr-temp').value) || 85,
                max_power: parseInt(document.getElementById('edit-profile-max-power').value) || 22,
                test_duration: parseInt(document.getElementById('edit-profile-test-duration').value) || 120,
                warmup_time: parseInt(document.getElementById('edit-profile-warmup').value) || 10,
                
                // Results (what was measured)
                expected_hashrate: parseFloat(document.getElementById('edit-profile-hashrate').value) || null,
                expected_power: parseFloat(document.getElementById('edit-profile-power').value) || null,
                efficiency: parseFloat(document.getElementById('edit-profile-efficiency').value) || null,
                stability_score: parseInt(document.getElementById('edit-profile-stability').value) || null,
                avg_fan_speed: parseInt(document.getElementById('edit-profile-fan-speed').value) || null,
                avg_chip_temp: parseFloat(document.getElementById('edit-profile-avg-chip-temp').value) || null,
                avg_vr_temp: parseFloat(document.getElementById('edit-profile-avg-vr-temp').value) || null,
                
                // Metadata
                notes: document.getElementById('edit-profile-notes').value.trim(),
                updated_at: new Date().toISOString()
            };
            
            try {
                const response = await fetch(`${API_BASE}/api/profiles/${deviceName}/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        original_name: originalName,
                        new_name: newName,
                        profile: profileData
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    closeEditProfileModal();
                    loadProfiles();
                    alert(originalName ? `Profile "${newName}" updated!` : `Profile "${newName}" created!`);
                } else {
                    const error = await response.json();
                    alert('Error: ' + (error.error || 'Failed to save profile'));
                }
            } catch (err) {
                console.error('Error saving profile:', err);
                alert('Error saving profile: ' + err.message);
            }
        }
        
        async function deleteProfile(deviceName, profileName) {
            if (!confirm(`Delete profile "${profileName.toUpperCase()}" from ${deviceName}?\\n\\nThis cannot be undone.`)) {
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/profiles/${deviceName}/delete/${profileName}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    loadProfiles();
                    alert(`Profile "${profileName}" deleted`);
                } else {
                    const error = await response.json();
                    alert('Error: ' + (error.error || 'Failed to delete profile'));
                }
            } catch (err) {
                console.error('Error deleting profile:', err);
                alert('Error deleting profile: ' + err.message);
            }
        }
        
        function showFineTuneIndicator(profileName, voltage, frequency) {
            // Remove existing indicator if any
            const existing = document.getElementById('fine-tune-indicator');
            if (existing) existing.remove();
            
            // Create indicator
            const indicator = document.createElement('div');
            indicator.id = 'fine-tune-indicator';
            indicator.style.cssText = 'background: linear-gradient(135deg, #9c27b0, #673ab7); padding: 12px 20px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;';
            indicator.innerHTML = `
                <div>
                    <strong>🔬 Fine Tune Mode</strong><br>
                    <small>Refining ${profileName.toUpperCase()} profile: ${voltage}mV @ ${frequency}MHz (±25mV, ±20MHz @ 5mV/5MHz steps)</small>
                </div>
                <button onclick="cancelFineTune()" style="background: rgba(255,255,255,0.2); padding: 5px 15px;">✕ Cancel</button>
            `;
            
            // Insert before the form
            const form = document.querySelector('#benchmark-tab .card');
            form.insertBefore(indicator, form.firstChild);
        }
        
        function cancelFineTune() {
            const indicator = document.getElementById('fine-tune-indicator');
            if (indicator) indicator.remove();
            
            window.fineTuneExpectedHashrate = null;
            window.fineTuneProfileName = null;
            window.fineTuneDeviceName = null;
            window.fineTuneOptimizationGoal = null;
            window.fineTuneAutoSave = null;
            window.fineTuneQuietTarget = null;
            window.fineTuneFullProfile = null;
            
            // Reset to default ranges
            document.getElementById('voltage-step').value = 25;
            document.getElementById('frequency-step').value = 25;
        }
        
        async function handleNanoTuneComplete() {
            const profileName = window.fineTuneProfileName;
            const deviceName = window.fineTuneDeviceName;
            const goal = window.fineTuneOptimizationGoal || 'efficient';
            const autoSave = window.fineTuneAutoSave;
            const quietTarget = window.fineTuneQuietTarget;
            const originalProfile = window.fineTuneFullProfile || {};
            
            if (!profileName || !deviceName) {
                cancelFineTune();
                return;
            }
            
            try {
                // Get the most recent session
                const sessionsResponse = await fetch(`${API_BASE}/api/sessions`);
                const sessions = await sessionsResponse.json();
                
                if (!sessions || sessions.length === 0) {
                    alert('No benchmark session found');
                    cancelFineTune();
                    return;
                }
                
                // Find the most recent completed session
                const latestSession = sessions[0];
                if (!latestSession || latestSession.status !== 'completed') {
                    cancelFineTune();
                    return;
                }
                
                // Get full session data
                const sessionResponse = await fetch(`${API_BASE}/api/sessions/${latestSession.id}`);
                const session = await sessionResponse.json();
                
                if (!session.results || session.results.length === 0) {
                    alert('No results in benchmark session');
                    cancelFineTune();
                    return;
                }
                
                // Find best result based on optimization goal
                let bestResult;
                const goalLabels = {
                    'hashrate': '⚡ Max Hashrate',
                    'balanced': '⚖️ Balanced',
                    'efficiency': '🌱 Efficient',
                    'quiet': '🤫 Quiet Mode'
                };
                
                if (goal === 'max_hashrate') {
                    bestResult = session.results.reduce((best, r) => 
                        (!best || r.avg_hashrate > best.avg_hashrate) ? r : best, null);
                } else if (goal === 'efficient') {
                    bestResult = session.results.reduce((best, r) => 
                        (!best || r.efficiency < best.efficiency) ? r : best, null);
                } else if (goal === 'quiet') {
                    // Quiet mode: find result with lowest fan speed, filtering those below target
                    const belowTarget = session.results.filter(r => (r.avg_fan_speed || 100) <= quietTarget);
                    if (belowTarget.length > 0) {
                        // Got results below target - pick the one with best hashrate among them
                        bestResult = belowTarget.reduce((best, r) => 
                            (!best || r.avg_hashrate > best.avg_hashrate) ? r : best, null);
                    } else {
                        // No results below target - pick lowest fan speed overall
                        bestResult = session.results.reduce((best, r) => 
                            (!best || (r.avg_fan_speed || 100) < (best.avg_fan_speed || 100)) ? r : best, null);
                    }
                } else {
                    // Balanced: best hashrate/power ratio with stability consideration
                    bestResult = session.results.reduce((best, r) => {
                        const score = (r.avg_hashrate / r.avg_power) * (r.stability_score || 80);
                        const bestScore = best ? (best.avg_hashrate / best.avg_power) * (best.stability_score || 80) : 0;
                        return score > bestScore ? r : best;
                    }, null);
                }
                
                if (!bestResult) {
                    alert('Could not determine best result');
                    cancelFineTune();
                    return;
                }
                
                // Build the complete profile data with benchmark config preserved
                const updatedProfile = {
                    // Basic settings (from best result)
                    voltage: bestResult.voltage,
                    frequency: bestResult.frequency,
                    fan_target: originalProfile.fan_target || 65,
                    
                    // PSU info (preserved from original profile)
                    stock_psu_watts: originalProfile.stock_psu_watts || 22,
                    safe_power_stock_psu: originalProfile.safe_power_stock_psu || 20,
                    psu_upgraded: originalProfile.psu_upgraded || false,
                    
                    // Benchmark config (preserved from original profile)
                    max_chip_temp: originalProfile.max_chip_temp || 65,
                    max_vr_temp: originalProfile.max_vr_temp || 85,
                    max_power: originalProfile.max_power || 22,
                    test_duration: originalProfile.test_duration || 120,
                    warmup_time: originalProfile.warmup_time || 10,
                    
                    // Results (from best result)
                    expected_hashrate: bestResult.avg_hashrate,
                    expected_power: bestResult.avg_power,
                    efficiency: bestResult.efficiency,
                    stability_score: bestResult.stability_score,
                    avg_fan_speed: bestResult.avg_fan_speed,
                    avg_chip_temp: bestResult.avg_chip_temp,
                    avg_vr_temp: bestResult.avg_vr_temp,
                    
                    // Metadata
                    source_session_id: session.id,
                    tested_at: new Date().toISOString(),
                    notes: `Nano Tune ${goalLabels[goal]} - ${new Date().toLocaleDateString()}` +
                           (goal === 'quiet' ? ` (target: ${quietTarget}%)` : '')
                };
                
                // Build the message
                let message = `Nano Tune Complete! (${goalLabels[goal]})\n\n` +
                    `Best result found:\n` +
                    `  Voltage: ${bestResult.voltage}mV\n` +
                    `  Frequency: ${bestResult.frequency}MHz\n` +
                    `  Hashrate: ${bestResult.avg_hashrate?.toFixed(1)} GH/s\n` +
                    `  Power: ${bestResult.avg_power?.toFixed(1)}W\n` +
                    `  Efficiency: ${bestResult.efficiency?.toFixed(2)} J/TH\n`;
                
                if (goal === 'quiet') {
                    message += `  Fan Speed: ${bestResult.avg_fan_speed?.toFixed(0) || '?'}%\n`;
                    if ((bestResult.avg_fan_speed || 100) <= quietTarget) {
                        message += `  ✅ Below target (${quietTarget}%)\n`;
                    } else {
                        message += `  ⚠️ Could not reach target (${quietTarget}%)\n`;
                    }
                }
                
                message += `\nSave to profile "${profileName.toUpperCase()}"?`;
                
                // Auto-save or ask
                const shouldSave = autoSave || confirm(message);
                
                if (shouldSave) {
                    if (!autoSave) {
                        // User already saw the confirm dialog
                    } else {
                        // Auto-save - just log it
                        console.log('Auto-saving Nano Tune result to profile:', profileName);
                    }
                    
                    // Save to the original profile with complete data
                    const response = await fetch(`${API_BASE}/api/profiles/${deviceName}/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            original_name: profileName,
                            new_name: profileName,
                            profile: updatedProfile
                        })
                    });
                    
                    if (response.ok) {
                        alert(`Profile "${profileName}" updated with optimized settings!`);
                        loadProfiles();
                    } else {
                        const error = await response.json();
                        alert('Error saving profile: ' + (error.error || 'Unknown error'));
                    }
                }
                
            } catch (err) {
                console.error('Error handling Nano Tune completion:', err);
            } finally {
                cancelFineTune();

                const state = window.autoTuneState;
                if (state && state.running && state.phase === 'nano_sequence') {
                    setTimeout(() => {
                        runNextAutoNanoStep();
                    }, 1000);
                }
            }
        }
        
        

        // ============================================================
        // AUTO TUNE ORCHESTRATOR (Precision sweep + 4 Nano tunes)
        // ============================================================

        function updateAutoTuneBanner(text) {
            const banner = document.getElementById('auto-tune-banner');
            if (!banner) return;

            try {
                if (text === null) {
                    banner.style.display = 'none';
                    banner.textContent = '🪄 AUTO TUNE IN PROGRESS';
                    localStorage.removeItem('axebench_auto_tune_banner');
                } else {
                    banner.textContent = text;
                    banner.style.display = 'block';
                    localStorage.setItem('axebench_auto_tune_banner', text);
                }
            } catch (e) {
                // localStorage not available or blocked; ignore persistence
                if (text === null) {
                    banner.style.display = 'none';
                    banner.textContent = '🪄 AUTO TUNE IN PROGRESS';
                } else {
                    banner.textContent = text;
                    banner.style.display = 'block';
                }
            }
        }


        // ============================================================

        window.autoTuneState = null;

        const AUTO_TUNE_STEPS = [
            { goal: 'max_hashrate', profileName: 'MAX_AUTO' },
            { goal: 'balanced',     profileName: 'BALANCED_AUTO' },
            { goal: 'efficient',    profileName: 'EFFICIENT_AUTO' },
            { goal: 'quiet',        profileName: 'QUIET_AUTO', quietTarget: 60 }
        ];

        function getAutoTuneState() {
            if (!window.autoTuneState) {
                window.autoTuneState = {
                    running: false,
                    phase: null,          // 'precision' | 'nano_sequence'
                    deviceName: null,
                    quietTarget: 60,
                    nanoQueue: []
                };
            }
            return window.autoTuneState;
        }

        async function startFullAutoTune() {
            const state = getAutoTuneState();
            if (state.running) {
                alert('Auto Tune is already running.');
                return;
            }

            const deviceSelect = document.getElementById('device-select');
            const device = deviceSelect ? deviceSelect.value : '';
            if (!device) {
                alert('Please select a device first.');
                return;
            }

            const confirmed = confirm(
                'This will run a Precision benchmark, generate 4 AUTO profiles\n' +
                '(MAX_AUTO, BALANCED_AUTO, EFFICIENT_AUTO, QUIET_AUTO)\n' +
                'and then run 4 Nano tunes in sequence.\n\n' +
                'This may take a while and will stress the hardware.\n\n' +
                'Continue?'
            );
            if (!confirmed) return;

            // Set PRECISION preset
            const presetSelect = document.getElementById('preset-select');
            if (presetSelect) {
                presetSelect.value = 'precision';
                try {
                    loadPreset();
                } catch (e) {
                    console.warn('Auto Tune: loadPreset() failed, continuing with current config', e);
                }
            }

            // For Precision we bias toward efficient goal
            const goalSelect = document.getElementById('goal');
            if (goalSelect) {
                goalSelect.value = 'efficient';
                try {
                    updateGoalBadge('efficient');
                } catch (e) {
                    console.warn('Auto Tune: updateGoalBadge failed', e);
                }
            }

            const quietCap = 60;
            window.quietFanThreshold = quietCap;

            state.running = true;
            state.phase = 'precision';
            state.deviceName = device;
            state.quietTarget = quietCap;
            state.nanoQueue = [];

            updateAutoTuneBanner('🪄 AUTO TUNE IN PROGRESS — Phase 1/2: Precision Sweep Running…');

            logEvent('🪄 Auto Tune: starting Precision sweep...', 'info');

            try {
                startBenchmark();
            } catch (err) {
                console.error('Auto Tune: failed to start Precision benchmark', err);
                alert('Auto Tune failed to start: ' + err.message);
                updateAutoTuneBanner(null);
                state.running = false;
            }
        }

        async function autoTuneHandlePrecisionCompleted(status) {
            const state = getAutoTuneState();
            if (!state.running || state.phase !== 'precision') {
                return;
            }

            try {
                const deviceName = state.deviceName || status.device;
                if (!deviceName) {
                    console.warn('Auto Tune: missing device name after Precision phase');
                    state.running = false;
                    return;
                }

                const sessionsResponse = await fetch(`${API_BASE}/api/sessions`);
                const sessions = await sessionsResponse.json().catch(() => null);

                if (!Array.isArray(sessions) || sessions.length === 0) {
                    alert('Auto Tune: no benchmark sessions found to generate profiles.');
                    state.running = false;
                    return;
                }

                const latestSession = sessions[0];
                if (!latestSession || !latestSession.id) {
                    alert('Auto Tune: latest session has no ID.');
                    state.running = false;
                    return;
                }

                logEvent(`🪄 Auto Tune: generating AUTO profiles from session ${latestSession.id}...`, 'info');

                await autoTuneGenerateAutoProfilesFromSession(latestSession.id, deviceName);

                // Prepare Nano sequence
                state.phase = 'nano_sequence';
                state.nanoQueue = AUTO_TUNE_STEPS.slice();

                logEvent('🪄 Auto Tune: AUTO profiles saved. Starting Nano tune sequence...', 'success');

                updateAutoTuneBanner('🪄 AUTO TUNE IN PROGRESS — Phase 2/2: Running Nano Tune Sequence…');

                runNextAutoNanoStep();

            } catch (err) {
                console.error('Auto Tune: error in Precision completion handler', err);
                showToast('Auto Tune failed during Precision sweep: ' + (err.message || err), 'error', 8000);
                updateAutoTuneBanner(null);
                state.running = false;
            }
        }

        async function autoTuneGenerateAutoProfilesFromSession(sessionId, deviceNameOverride) {
            try {
                const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
                const session = await response.json();

                if (!session.results || session.results.length === 0) {
                    alert('Auto Tune: no results in Precision session.');
                    return;
                }

                const deviceName = deviceNameOverride || (session.device_configs && session.device_configs[0] && session.device_configs[0].name);
                const benchConfig = session.benchmark_config || {};

                if (!deviceName) {
                    alert('Auto Tune: could not determine device name from session.');
                    return;
                }

                const results = session.results;

                const byHashrate = [...results].sort((a, b) => b.avg_hashrate - a.avg_hashrate);
                const byEfficiency = [...results].sort((a, b) => a.efficiency - b.efficiency);
                const byPower = [...results].sort((a, b) => a.avg_power - b.avg_power);

                const balanced = results.reduce((best, r) => {
                    const score = (r.avg_hashrate / r.avg_power) * (r.stability_score || 80);
                    const bestScore = best
                        ? (best.avg_hashrate / best.avg_power) * (best.stability_score || 80)
                        : 0;
                    return score > bestScore ? r : best;
                }, null);

                const profileResults = {
                    quiet: selectProfile(byPower, results, 0.8),
                    efficient: byEfficiency[0],
                    max: selectStableHighPerf(byHashrate),
                    balanced: balanced || byHashrate[0]
                };

                const modelProfile = window.currentProfile || {};

                function buildFullProfile(result, fanTarget, profileType) {
                    if (!result) return null;

                    const quietThreshold = profileType === 'quiet' ? 60 : undefined;

                    return {
                        voltage: result.voltage,
                        frequency: result.frequency,
                        fan_target: fanTarget,

                        stock_psu_watts: modelProfile.stock_psu_watts || 22,
                        safe_power_stock_psu: modelProfile.safe_power_stock_psu || 20,
                        psu_upgraded: modelProfile.psu_upgraded || false,

                        max_chip_temp: benchConfig.max_chip_temp || modelProfile.stock_max_chip_temp || 65,
                        max_vr_temp: benchConfig.max_vr_temp || modelProfile.stock_max_vr_temp || 85,
                        max_power: benchConfig.max_power || 22,
                        test_duration: benchConfig.test_duration || 120,
                        warmup_time: benchConfig.warmup_time || 10,

                        expected_hashrate: result.avg_hashrate,
                        expected_power: result.avg_power,
                        efficiency: result.efficiency,
                        stability_score: result.stability_score,
                        avg_fan_speed: result.avg_fan_speed,
                        avg_chip_temp: result.avg_chip_temp,
                        avg_vr_temp: result.avg_vr_temp,

                        quiet_fan_threshold: quietThreshold,

                        source_session_id: session.id,
                        tested_at: new Date().toISOString(),
                        notes: `Auto-generated ${profileType} AUTO profile from Precision benchmark`
                    };
                }

                const autoProfiles = {
                    QUIET_AUTO: buildFullProfile(profileResults.quiet, 68, 'quiet'),
                    EFFICIENT_AUTO: buildFullProfile(profileResults.efficient, 65, 'efficient'),
                    MAX_AUTO: buildFullProfile(profileResults.max, 60, 'max'),
                    BALANCED_AUTO: buildFullProfile(profileResults.balanced, 62, 'balanced')
                };

                let savedCount = 0;

                for (const [name, profile] of Object.entries(autoProfiles)) {
                    if (!profile) continue;

                    const resp = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(deviceName)}/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            original_name: name,
                            new_name: name,
                            profile: profile
                        })
                    });

                    if (resp.ok) {
                        savedCount += 1;
                        console.log(`Auto Tune: saved profile ${name} for ${deviceName}`);
                    } else {
                        const errData = await resp.json().catch(() => ({}));
                        console.warn(`Auto Tune: failed to save profile ${name}:`, errData);
                    }
                }

                if (savedCount > 0) {
                    showToast(`Auto Tune: ${savedCount} AUTO profiles updated for ${deviceName}`, 'success', 6000);
                    if (typeof loadProfiles === 'function') {
                        loadProfiles();
                    }
                } else {
                    showToast('Auto Tune: no AUTO profiles were saved.', 'warning', 6000);
                }

            } catch (error) {
                console.error('Auto Tune: error generating AUTO profiles from session', error);
                alert('Auto Tune: error generating profiles from Precision result.');
            }
        }

        async function runNextAutoNanoStep() {
            const state = getAutoTuneState();
            if (!state.running || state.phase !== 'nano_sequence') {
                return;
            }

            const step = state.nanoQueue.shift();
            if (!step) {
                state.running = false;
                updateAutoTuneBanner(null);
                showToast('🪄 Auto Tune complete: MAX_AUTO, BALANCED_AUTO, EFFICIENT_AUTO, QUIET_AUTO updated.', 'success', 8000);
                logEvent('🪄 Auto Tune: all Nano tunes completed.', 'success');

                const deviceName = state.deviceName;
                if (deviceName) {
                    try {
                        fetch(`${API_BASE}/api/profiles/${encodeURIComponent(deviceName)}/apply/EFFICIENT_AUTO`, {
                            method: 'POST'
                        })
                        .then(response => {
                            if (!response.ok) {
                                throw new Error('Failed to apply EFFICIENT_AUTO profile');
                            }
                            return response.json();
                        })
                        .then(result => {
                            showToast(`EFFICIENT_AUTO applied to ${deviceName} (${result.voltage}mV @ ${result.frequency}MHz)`, 'success', 9000);
                            logEvent(`🪄 Auto Tune: EFFICIENT_AUTO applied to ${deviceName}`, 'success');
                            try {
                                if (typeof loadProfiles === 'function') {
                                    loadProfiles();
                                }
                            } catch (e) {
                                console.warn('Auto Tune: loadProfiles() after apply failed', e);
                            }
                        })
                        .catch(err => {
                            console.error('Auto Tune: failed to apply EFFICIENT_AUTO after completion', err);
                            showToast('Auto Tune complete, but failed to auto-apply EFFICIENT_AUTO profile.', 'warning', 8000);
                        });
                    } catch (e) {
                        console.error('Auto Tune: unexpected error when applying EFFICIENT_AUTO', e);
                    }
                }

                return;
            }

            const deviceName = state.deviceName;
            if (!deviceName) {
                console.warn('Auto Tune: missing device name during Nano sequence.');
                state.running = false;
                return;
            }
            const stepIndex = AUTO_TUNE_STEPS.length - state.nanoQueue.length;
            updateAutoTuneBanner(
                `🪄 AUTO TUNE IN PROGRESS — Phase 2/2: Nano Tune (${step.goal.toUpperCase()} ${stepIndex}/${AUTO_TUNE_STEPS.length})`
            );



            try {
                const profilesResp = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(deviceName)}`);
                const profData = await profilesResp.json().catch(() => ({}));
                const profiles = (profData && profData.profiles) || {};

                const baseProfile = profiles[step.profileName];
                if (!baseProfile) {
                    console.warn(`Auto Tune: profile ${step.profileName} not found for ${deviceName}, skipping.`);
                    runNextAutoNanoStep();
                    return;
                }

                window.quietFanThreshold = step.quietTarget || state.quietTarget || 60;

                fineTuneProfile(deviceName, step.profileName, baseProfile);

                setTimeout(() => {
                    try {
                        selectNanoGoal(step.goal);

                        if (step.goal === 'quiet') {
                            const quietInput = document.getElementById('nano-target-fan');
                            if (quietInput) {
                                quietInput.value = step.quietTarget || 60;
                                const quietLabel = document.getElementById('nano-fan-value');
                                if (quietLabel) quietLabel.textContent = quietInput.value + '%';
                            }
                        }

                        const autoSaveEl = document.getElementById('nano-auto-save');
                        if (autoSaveEl) {
                            autoSaveEl.checked = true;
                        }

                        startNanoTune();
                    } catch (err) {
                        console.error('Auto Tune: error starting Nano step', err);
                        showToast('Auto Tune: error starting Nano step: ' + (err.message || err), 'error', 8000);
                        updateAutoTuneBanner(null);
                        state.running = false;
                    }
                }, 500);

            } catch (err) {
                console.error('Auto Tune: error preparing Nano step', err);
                showToast('Auto Tune: error preparing Nano tune: ' + (err.message || err), 'error', 8000);
                updateAutoTuneBanner(null);
                state.running = false;
            }
        }

async function generateProfilesFromSession(sessionId) {
            try {
                const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
                const session = await response.json();
                
                if (!session.results || session.results.length === 0) {
                    alert('No results in this session');
                    return;
                }
                
                // Get device name and benchmark config from session
                const deviceName = session.device_configs[0]?.name;
                const benchConfig = session.benchmark_config || {};
                
                if (!deviceName) {
                    alert('Could not determine device name');
                    return;
                }
                
                // Calculate profiles from results
                const results = session.results;
                
                // Sort by different metrics
                const byHashrate = [...results].sort((a, b) => b.avg_hashrate - a.avg_hashrate);
                const byEfficiency = [...results].sort((a, b) => a.efficiency - b.efficiency);
                const byPower = [...results].sort((a, b) => a.avg_power - b.avg_power);
                
                // Generate profiles - find the best result for each category
                const profileResults = {
                    quiet: selectProfile(byPower, results, 0.8),  // Lowest power, at least 80% hashrate
                    efficient: byEfficiency[0],  // Best J/TH
                    max: selectStableHighPerf(byHashrate),  // Highest stable hashrate
                    nuclear: byHashrate[0]  // Absolute max
                };
                
                // Helper to build complete profile from result
                function buildFullProfile(result, fanTarget, profileType) {
                    if (!result) return null;
                    
                    // Get PSU info from model profile if available
                    const modelProfile = window.currentProfile || {};
                    
                    return {
                        // Basic settings
                        voltage: result.voltage,
                        frequency: result.frequency,
                        fan_target: fanTarget,
                        
                        // PSU info (from model profile)
                        stock_psu_watts: modelProfile.stock_psu_watts || 22,
                        safe_power_stock_psu: modelProfile.safe_power_stock_psu || 20,
                        psu_upgraded: false,
                        
                        // Benchmark config (from session)
                        max_chip_temp: benchConfig.max_chip_temp || modelProfile.stock_max_chip_temp || 65,
                        max_vr_temp: benchConfig.max_vr_temp || modelProfile.stock_max_vr_temp || 85,
                        max_power: benchConfig.max_power || 22,
                        test_duration: benchConfig.test_duration || 120,
                        warmup_time: benchConfig.warmup_time || 10,
                        
                        // Results
                        expected_hashrate: result.avg_hashrate,
                        expected_power: result.avg_power,
                        efficiency: result.efficiency,
                        stability_score: result.stability_score,
                        avg_fan_speed: result.avg_fan_speed,
                        avg_chip_temp: result.avg_chip_temp,
                        avg_vr_temp: result.avg_vr_temp,
                        
                        // Metadata
                        source_session_id: session.id,
                        tested_at: new Date().toISOString(),
                        notes: `Auto-generated ${profileType} profile from benchmark`
                    };
                }
                
                // Fan targets: quieter profiles = warmer target (less fan noise)
                pendingProfiles = {
                    quiet: buildFullProfile(profileResults.quiet, 68, 'quiet'),
                    efficient: buildFullProfile(profileResults.efficient, 65, 'efficient'),
                    max: buildFullProfile(profileResults.max, 60, 'max'),
                    nuclear: buildFullProfile(profileResults.nuclear, 55, 'nuclear'),
                    custom: null
                };
                pendingDeviceName = deviceName;
                
                // Check if profiles exist
                const existingResponse = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(deviceName)}`);
                const existing = await existingResponse.json();
                
                document.getElementById('profile-overwrite-warning').style.display = existing.exists ? 'block' : 'none';
                
                // Show profile modal
                const generatedDiv = document.getElementById('generated-profiles');
                generatedDiv.innerHTML = `
                    <div style="color: #aaa; margin-bottom: 10px;">Device: <strong style="color: white;">${deviceName}</strong></div>
                    ${formatProfilePreview('Quiet', pendingProfiles.quiet, '#4caf50')}
                    ${formatProfilePreview('Efficient', pendingProfiles.efficient, '#2196f3')}
                    ${formatProfilePreview('Max', pendingProfiles.max, '#ff9800')}
                    ${formatProfilePreview('Nuclear', pendingProfiles.nuclear, '#ff3333')}
                `;
                
                document.getElementById('profileModal').style.display = 'block';
                
            } catch (error) {
                console.error('Error generating profiles:', error);
                alert('Error generating profiles');
            }
        }
        
        function selectProfile(sortedResults, allResults, minHashrateRatio) {
            const maxHashrate = Math.max(...allResults.map(r => r.avg_hashrate));
            const threshold = maxHashrate * minHashrateRatio;
            return sortedResults.find(r => r.avg_hashrate >= threshold) || sortedResults[0];
        }
        
        function selectStableHighPerf(sortedByHashrate) {
            // Find highest hashrate with good stability (variance < 5%)
            for (const r of sortedByHashrate) {
                if (r.hashrate_variance < 5 && r.stability_score > 80) {
                    return r;
                }
            }
            // Fallback to top 3 average
            return sortedByHashrate[Math.min(2, sortedByHashrate.length - 1)];
        }
        
        function formatProfilePreview(name, profile, color) {
            if (!profile) return '';
            return `
                <div style="background: #1a1a1a; padding: 10px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid ${color};">
                    <strong style="color: ${color};">${name}</strong><br>
                    <span style="color: white;">${profile.voltage}mV @ ${profile.frequency}MHz</span><br>
                    <small style="color: #aaa;">~${profile.expected_hashrate?.toFixed(1) || '?'} GH/s | ~${profile.expected_power?.toFixed(1) || '?'}W${profile.efficiency ? ` | ${profile.efficiency.toFixed(2)} J/TH` : ''}</small><br>
                    <small style="color: #888;">Fan target: ${profile.fan_target || 65}°C</small>
                </div>
            `;
        }
        
        function closeProfileModal() {
            document.getElementById('profileModal').style.display = 'none';
            pendingProfiles = null;
            pendingDeviceName = null;
        }
        
        async function saveGeneratedProfiles() {
            if (!pendingProfiles || !pendingDeviceName) return;
            
            try {
                const response = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(pendingDeviceName)}`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        profiles: pendingProfiles,
                        overwrite: true
                    })
                });
                
                if (response.ok) {
                    showToast('Profiles saved successfully!', 'success');
                    closeProfileModal();
                    loadProfiles();
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    alert('Failed to save profiles: ' + (errorData.message || response.statusText));
                }
            } catch (error) {
                console.error('Error saving profiles:', error);
                alert('Error saving profile: ' + error.message);
            }
        }
        
        // ====================================================================
        // Navigation Functions
        // ====================================================================
        
        function navigateToApp(app) {
            const host = window.location.hostname;
            const protocol = window.location.protocol;
            const port = app === 'axeshed' ? 5001 : 5002;
            const url = `${protocol}//${host}:${port}`;
            window.location.href = url;
        }
        
        // Licensing / Patreon Functions
        // ====================================================================
        
        let licenseStatus = null;
        // REMOVED: Banner dismissal opt-out - users must subscribe to use the app
        // const BANNER_DISMISS_KEY = 'axebench_banner_dismissed';
        // const BANNER_DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours
        
        async function checkLicenseStatus() {
            try {
                const response = await fetch('/api/license/status');
                licenseStatus = await response.json();
                
                const banner = document.getElementById('patreon-banner');
                const patronWelcome = document.getElementById('patron-welcome');
                const patronName = document.getElementById('patron-name');
                const nagModal = document.getElementById('nag-modal');
                
                if (licenseStatus.is_patron) {
                    // Active patron - show welcome, hide banner and nag
                    banner.style.display = 'none';
                    nagModal.style.display = 'none';
                    patronWelcome.style.display = 'block';
                    patronName.textContent = licenseStatus.patron_name || 'Patron';
                } else {
                    // Not a patron - show nag on first visit, banner always
                    patronWelcome.style.display = 'none';
                    banner.style.display = 'block';
                    
                    // Show nag modal once per session
                    const nagShown = sessionStorage.getItem('axebench_nag_shown');
                    if (!nagShown) {
                        nagModal.style.display = 'flex';
                        sessionStorage.setItem('axebench_nag_shown', 'true');
                    }
                }
                
                // Check for auth callback results
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.has('auth_success')) {
                    showNotification('✅ Patreon login successful! Thank you for your support!', 'success');
                    window.history.replaceState({}, '', '/');
                    nagModal.style.display = 'none';
                } else if (urlParams.has('auth_error')) {
                    const error = urlParams.get('auth_error');
                    showNotification('❌ Patreon login failed: ' + error, 'error');
                    window.history.replaceState({}, '', '/');
                }
                
            } catch (error) {
                console.error('License check failed:', error);
            }
        }
        
        function closeNagModal() {
            document.getElementById('nag-modal').style.display = 'none';
        }
        
        async function loginWithPatreon() {
            if (licenseStatus && licenseStatus.auth_url) {
                try {
                    // Prepare auth by storing origin host
                    await fetch('/api/auth/prepare', {method: 'POST'});
                    // Now redirect to Patreon
                    window.location.href = licenseStatus.auth_url;
                } catch (error) {
                    console.error('Auth preparation failed:', error);
                    showNotification('Failed to prepare authentication', 'error');
                }
            } else {
                showNotification('Patreon integration not configured', 'error');
            }
        }
        
        function dismissBanner() {
            document.getElementById('patreon-banner').style.display = 'none';
        }
        
        async function licenseLogout() {
            try {
                await fetch('/api/license/logout', { method: 'POST' });
                showNotification('Logged out from Patreon', 'info');
                checkLicenseStatus();
            } catch (error) {
                console.error('Logout failed:', error);
            }
        }
        
        function showNotification(message, type = 'info') {
            // Create notification element
            const notif = document.createElement('div');
            notif.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                padding: 15px 25px;
                border-radius: 8px;
                color: white;
                font-weight: bold;
                z-index: 10000;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                animation: slideIn 0.3s ease;
            `;
            
            if (type === 'success') {
                notif.style.background = 'linear-gradient(135deg, #4caf50, #2e7d32)';
            } else if (type === 'error') {
                notif.style.background = 'linear-gradient(135deg, #f44336, #c62828)';
            } else {
                notif.style.background = 'linear-gradient(135deg, #2196f3, #1565c0)';
            }
            
            notif.textContent = message;
            document.body.appendChild(notif);
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                notif.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => notif.remove(), 300);
            }, 5000);
        }
        
        // Add notification animations
        const notifStyle = document.createElement('style');
        notifStyle.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(notifStyle);
        
        // Set dynamic links for AxeShed and AxePool
        function setDynamicLinks() {
            const host = window.location.hostname;
            const protocol = window.location.protocol;
            const axeshedLink = document.getElementById('axeshed-link');
            const axepoolLink = document.getElementById('axepool-link');
            
            if (axeshedLink) {
                axeshedLink.href = `${protocol}//${host}:5001`;
            }
            if (axepoolLink) {
                axepoolLink.href = `${protocol}//${host}:5002`;
            }
        }
        
        // Initial load
        setDynamicLinks();
        loadDevices();
        loadSessions();
        checkLicenseStatus();
        
        // Check if a benchmark is already running (e.g., after page refresh)
        
// ---------- Persistent benchmark UI state (localStorage) ----------
function saveBenchmarkUiState(state) {
    try {
        localStorage.setItem('axebench_benchmark_state', JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save benchmark UI state', e);
    }
}

function loadBenchmarkUiState() {
    try {
        const raw = localStorage.getItem('axebench_benchmark_state');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to load benchmark UI state', e);
        return null;
    }
}

function clearBenchmarkUiState() {
    try {
        localStorage.removeItem('axebench_benchmark_state');
    } catch (e) {
        console.warn('Failed to clear benchmark UI state', e);
    }
}

// Apply a saved config back onto the benchmark form
function applyBenchmarkConfigToForm(state) {
    if (!state || !state.config) return;
    const cfg = state.config;

    const setValue = (id, key) => {
        const el = document.getElementById(id);
        if (!el || cfg[key] === undefined || cfg[key] === null) return;
        el.value = cfg[key];
    };

    const setChecked = (id, key) => {
        const el = document.getElementById(id);
        if (!el || cfg[key] === undefined || cfg[key] === null) return;
        el.checked = !!cfg[key];
    };

    setValue('voltage-start', 'voltage_start');
    setValue('voltage-stop', 'voltage_stop');
    setValue('voltage-step', 'voltage_step');
    setValue('frequency-start', 'frequency_start');
    setValue('frequency-stop', 'frequency_stop');
    setValue('frequency-step', 'frequency_step');
    setValue('duration', 'duration');
    setValue('warmup', 'warmup');
    setValue('cooldown', 'cooldown');
    setValue('target-error', 'target_error');
    setValue('cycles-per-test', 'cycles_per_test');
    setValue('max-temp', 'max_temp');
    setValue('max-vr-temp', 'max_vr_temp');
    setValue('max-power', 'max_power');

    setChecked('restart', 'restart');
    setChecked('plotting', 'enable_plotting');
    setChecked('csv', 'export_csv');
    setChecked('auto-mode', 'auto_mode');

    const goalEl = document.getElementById('goal');
    if (goalEl && state.goal) {
        goalEl.value = state.goal;
    }
}


async function checkBenchmarkOnLoad() {
            try {
                const response = await fetch(`${API_BASE}/api/benchmark/status`);
                const status = await response.json();

                // If backend has a persisted config, restore it into the form
                if (status && status.config && typeof applyBenchmarkConfigToForm === 'function') {
                    try {
                        applyBenchmarkConfigToForm({
                            config: status.config,
                            goal: status.config.goal || status.config.optimization_goal || null
                        });
                    } catch (e) {
                        console.warn('Failed to apply benchmark config from status', e);
                    }
                }

                if (status && status.running) {
                    // Benchmark is running - show the panel and start monitoring
                    console.log('Benchmark detected on page load - resuming monitoring');
                    const livePanel = document.getElementById('live-benchmark-panel');
                    const stopBtn = document.getElementById('stop-btn');
                    const startBtn = document.getElementById('start-btn');
                    if (livePanel) livePanel.style.display = 'block';
                    if (stopBtn) stopBtn.style.display = 'inline-block';
                    if (startBtn) startBtn.disabled = true;

                    // Optionally collapse and lock the config form while running
                    const form = document.getElementById('benchmark-config-form');
                    const collapseBtn = document.getElementById('config-collapse-btn');
                    if (form && collapseBtn) {
                        form.style.display = 'none';
                        collapseBtn.style.display = 'inline-block';
                        collapseBtn.textContent = '▶ Show Config';
                    }
                    if (typeof setBenchmarkFormDisabled === 'function') {
                        setBenchmarkFormDisabled(true);
                    }

                    // Resume benchmark status checking
                    checkBenchmarkStatus();
                }
            } catch (error) {
                console.error('Error checking benchmark status on load:', error);
            }
        }
        
        // Check on page load
        checkBenchmarkOnLoad();
        
        // Auto-refresh
        setInterval(loadSessions, 10000);
        setInterval(checkLicenseStatus, 300000); // Re-check license every 5 minutes
    
        // ============================================================
        // Save-after-Tune Modal (Benchmark + Nano)
        // ============================================================
        window.saveModalShown = false;
        window.pendingTuneSave = null;

        function openSaveTuneModalFromStatus(status, source) {
            if (!window.bestResult) return;

            const deviceName = status.device || document.getElementById('device-select')?.value || '';
            if (!deviceName) {
                console.warn('No device name available for save-tune modal');
            }

            const goal = (status.config && (status.config.optimization_goal || status.config.goal)) ||
                         (document.getElementById('goal')?.value) || 'max_hashrate';

            const fanTarget = (status.config && status.config.fan_target) ||
                              (parseInt(document.getElementById('fan-target')?.value) || 0);

            const maxChip = (status.config && status.config.max_chip_temp) ||
                            (parseInt(document.getElementById('max-temp')?.value) || 65);
            const maxVr = (status.config && status.config.max_vr_temp) ||
                          (parseInt(document.getElementById('max-vr-temp')?.value) || 85);
            const maxPower = (status.config && status.config.max_power) ||
                             (parseFloat(document.getElementById('max-power')?.value) || 25);

            const ths = (window.bestResult.hashrate || 0) / 1000;

            window.pendingTuneSave = {
                source: source || 'benchmark',
                deviceName,
                goal,
                fanTarget,
                maxChip,
                maxVr,
                maxPower,
                bestResult: Object.assign({}, window.bestResult)
            };

            // Populate summary text
            const summaryEl = document.getElementById('save-tune-summary');
            if (summaryEl) {
                const r = window.bestResult;
                summaryEl.innerHTML =
                    `Device: <strong>${deviceName || 'Unknown'}</strong><br>` +
                    `Goal: <strong>${goal}</strong><br>` +
                    `Best: <strong>${ths.toFixed(2)} TH/s</strong> @ ${r.voltage}mV / ${r.frequency}MHz<br>` +
                    (goal === 'quiet' && typeof window.quietFanThreshold === 'number'
                        ? `Quiet cap: <strong>${window.quietFanThreshold}% fan</strong><br>`
                        : '') +
                    `Eff: ${r.efficiency?.toFixed ? r.efficiency.toFixed(2) : r.efficiency || '--'} J/TH &nbsp;·&nbsp;` +
                    `Fan ${r.fan?.toFixed ? r.fan.toFixed(0) : r.fan || '--'}% &nbsp;·&nbsp;` +
                    `Chip ${r.chip_temp ?? '--'}°C &nbsp;·&nbsp; VR ${r.vr_temp ?? '--'}°C`;
            }

            // Default profile type to current goal
            const typeSelect = document.getElementById('save-profile-type');
            const customNameInput = document.getElementById('custom-profile-name');
            if (typeSelect) {
                typeSelect.value = goal;
            }
            if (customNameInput) {
                customNameInput.style.display = 'none';
                customNameInput.value = '';
            }

            const modal = document.getElementById('saveTuneModal');
            if (modal) {
                modal.style.display = 'block';
                window.saveModalShown = true;
            }
        }

        // Toggle custom name field when profile type changes and wire goal badge updates
        document.addEventListener('DOMContentLoaded', function () {
            const typeSelect = document.getElementById('save-profile-type');
            const customNameInput = document.getElementById('custom-profile-name');
            if (typeSelect && customNameInput) {
                typeSelect.onchange = function () {
                    customNameInput.style.display = this.value === 'custom' ? 'block' : 'none';
                };
            }

            const goalEl = document.getElementById('goal');
            if (goalEl) {
                // Initialise badge and wire change handler
                updateGoalBadge(goalEl.value);
                goalEl.addEventListener('change', () => {
                    updateGoalBadge(goalEl.value);

                    // If switching into Quiet mode, ask user where it gets "too loud"
                    const key = (goalEl.value || '').toLowerCase();
                    if (key === 'quiet') {
                        let defaultVal = (typeof window.quietFanThreshold === 'number' && window.quietFanThreshold >= 0 && window.quietFanThreshold <= 100)
                            ? window.quietFanThreshold
                            : 60;
                        const answer = prompt('At what fan % does your Bitaxe get "too loud"? (0-100)', String(defaultVal));
                        let parsed = parseInt(answer, 10);
                        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
                            parsed = 60;
                        }
                        window.quietFanThreshold = parsed;
                        try {
                            showToast(`Quiet mode cap set to ${parsed}% fan`, 'info', 2500);
                        } catch (e) {
                            // Toast helper might not exist on all pages; ignore
                            console.log('Quiet fan threshold set to', parsed);
                        }
                    }
                });
            }
        });

        function closeSaveTuneModal() {
            const modal = document.getElementById('saveTuneModal');
            if (modal) {
                modal.style.display = 'none';
            }
            window.saveModalShown = false;
            window.pendingTuneSave = null;
        }

        function getProfileNameFromType(type, customName) {
            if (type === 'custom') {
                if (!customName) return null;
                return customName.trim().toLowerCase().replace(/\s+/g, '_');
            }
            return type; // Use goal key as profile name
        }

        async function handleSaveTuneClick(overwriteExisting) {
            if (!window.pendingTuneSave || !window.bestResult) {
                closeSaveTuneModal();
                return;
            }

            const deviceName = window.pendingTuneSave.deviceName ||
                               document.getElementById('device-select')?.value;
            if (!deviceName) {
                alert('No device selected to save profile');
                closeSaveTuneModal();
                return;
            }

            const typeSelect = document.getElementById('save-profile-type');
            const customNameInput = document.getElementById('custom-profile-name');
            const selectedType = typeSelect ? typeSelect.value : (window.pendingTuneSave.goal || 'max_hashrate');
            const customName = customNameInput ? customNameInput.value : '';

            const profileKey = getProfileNameFromType(selectedType, customName);
            if (!profileKey) {
                alert('Please enter a name for the custom profile');
                return;
            }

            const baseProfile = window.currentProfile || {};
            const br = window.pendingTuneSave.bestResult || window.bestResult;

            // Compose profile payload similar to update_profile backend
            const profilePayload = {
                // Basic settings
                voltage: br.voltage ?? baseProfile.voltage ?? window.benchmarkConfig?.voltage ?? 1200,
                frequency: br.frequency ?? baseProfile.frequency ?? window.benchmarkConfig?.frequency ?? 500,
                fan_target: window.pendingTuneSave.fanTarget ?? baseProfile.fan_target ?? window.benchmarkConfig?.fan_target ?? 65,
                quiet_fan_threshold: (typeof window.quietFanThreshold === 'number' ? window.quietFanThreshold : (baseProfile.quiet_fan_threshold ?? null)),


                // PSU config
                stock_psu_watts: baseProfile.stock_psu_watts ?? baseProfile.psu_wattage ?? window.benchmarkConfig?.stock_psu_watts ?? 25,
                safe_power_stock_psu: baseProfile.safe_power_stock_psu ?? window.benchmarkConfig?.safe_power_stock_psu ?? 22,
                psu_upgraded: baseProfile.psu_upgraded ?? window.benchmarkConfig?.psu_upgraded ?? false,

                // Benchmark config
                max_chip_temp: window.pendingTuneSave.maxChip ?? baseProfile.max_chip_temp ?? window.benchmarkConfig?.max_chip_temp ?? 65,
                max_vr_temp: window.pendingTuneSave.maxVr ?? baseProfile.max_vr_temp ?? window.benchmarkConfig?.max_vr_temp ?? 85,
                max_power: window.pendingTuneSave.maxPower ?? baseProfile.max_power ?? window.benchmarkConfig?.max_power ?? 25,
                test_duration: window.benchmarkConfig?.duration ?? baseProfile.test_duration ?? 120,
                warmup_time: window.benchmarkConfig?.warmup_time ?? baseProfile.warmup_time ?? 10,

                // Results
                expected_hashrate: br.hashrate ?? baseProfile.expected_hashrate,
                expected_power: br.power ?? baseProfile.expected_power,
                efficiency: br.efficiency ?? baseProfile.efficiency,
                stability_score: br.stability ?? baseProfile.stability_score,
                avg_fan_speed: br.fan ?? baseProfile.avg_fan_speed,
                avg_chip_temp: br.chip_temp ?? baseProfile.avg_chip_temp,
                avg_vr_temp: br.vr_temp ?? baseProfile.avg_vr_temp,

                // Metadata
                notes: baseProfile.notes || `Saved from ${window.pendingTuneSave.source || 'benchmark'} (${window.pendingTuneSave.goal})`,
                source_session_id: window.benchmarkConfig?.session_id ?? baseProfile.source_session_id,
                tested_at: new Date().toISOString()
            };

            const originalName = overwriteExisting ? profileKey : '';

            try {
                const response = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(deviceName)}/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        original_name: originalName,
                        new_name: profileKey,
                        profile: profilePayload
                    })
                });

                if (response.ok) {
                    showToast(`Profile "${profileKey}" saved for ${deviceName}`, 'success');
                    if (typeof loadProfiles === 'function') {
                        loadProfiles();
                    }
                } else {
                    const err = await response.json().catch(() => ({}));
                    alert('Error saving profile: ' + (err.error || 'Unknown error'));
                }
            } catch (e) {
                console.error('Error saving tune result', e);
                alert('Error saving tune result');
            } finally {
                closeSaveTuneModal();
            }
        }

</script>
</body>
</html>
    """
    
    template_path = template_dir / "dashboard.html"
    # Force UTF-8 so Windows can write emojis correctly
    with open(template_path, 'w', encoding='utf-8') as f:
        f.write(html)

def run_web_server(host='0.0.0.0', port=5000):
    """Run the web server"""
    # Print banner
    print("""
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                    ⚡ AxeBench v2.8 ⚡                    ║
║                                                           ║
║          Professional Bitaxe Benchmark Tool               ║
║                                                           ║
║   ⚠️  WARNING: May void warranties and cause fires 🔥     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    """)
    
    # Ensure directories exist
    config_dir.mkdir(parents=True, exist_ok=True)
    sessions_dir.mkdir(parents=True, exist_ok=True)
    
    load_devices()
    
    # FORCE regenerate template every time
    template_dir = Path(__file__).parent / "templates"
    if template_dir.exists():
        import shutil
        shutil.rmtree(template_dir)
    
    # Serve React Frontend
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path != "" and (Path(app.static_folder) / path).exists():
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, 'index.html')

    logger.info(f"Starting web server on http://{host}:{port}")
    app.run(host=host, port=port, debug=False)


if __name__ == '__main__':
    run_web_server()

# ============================================================================
# Firmware Management Routes
# ============================================================================

@app.route('/api/firmware/upload', methods=['POST'])
@require_patreon_auth
def upload_firmware():
    """Upload a firmware file to the server"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
            
        if file and (file.filename.endswith('.bin') or file.filename.endswith('.tar.gz')):
            filename = secure_filename(file.filename)
            firmware_dir = config_dir / "firmware"
            firmware_dir.mkdir(exist_ok=True)
            file_path = firmware_dir / filename
            file.save(file_path)
            return jsonify({'success': True, 'filename': filename})
        else:
            return jsonify({'error': 'Invalid file type. Allowed: .bin, .tar.gz'}), 400
    except Exception as e:
        logger.error(f"Firmware upload failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/firmware/flash', methods=['POST'])
@require_patreon_auth
def flash_firmware():
    """Flash firmware to a specific device"""
    try:
        data = request.json
        device_name = data.get('device_name')
        filename = data.get('filename')
        
        if not device_name or not filename:
            return jsonify({'error': 'Device name and filename required'}), 400
            
        device = device_manager.get_device(device_name)
        if not device:
            return jsonify({'error': 'Device not found'}), 404
            
        firmware_path = config_dir / "firmware" / filename
        if not firmware_path.exists():
            return jsonify({'error': 'Firmware file not found'}), 404
            
        # In a real implementation, this would trigger the OTA update process on the ESP32
        # For now, we'll simulate the process
        # device.update_firmware(firmware_path)
        
        return jsonify({'success': True, 'message': f'Firmware update initiated for {device_name}'})
    except Exception as e:
        logger.error(f"Firmware flash failed: {e}")
        return jsonify({'error': str(e)}), 500

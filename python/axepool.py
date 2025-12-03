"""
AxePool - Bitaxe Pool Management & Switching
Like DeadPool but for your mining pools 🎱
Companion app to AxeBench and AxeShed
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import asyncio
import aiohttp
import json
import logging
from pathlib import Path
from datetime import datetime
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

# Shared config directory with AxeBench/AxeShed
config_dir = Path.home() / ".bitaxe-benchmark"
pools_dir = config_dir / "pools"
pool_schedules_dir = config_dir / "pool_schedules"

# Scheduler state
scheduler_running = False
scheduler_thread = None

# HTTP timeout
DEFAULT_TIMEOUT = aiohttp.ClientTimeout(total=10)

# Common pool presets
POOL_PRESETS = {
    "public-pool-solo": {
        "name": "Public Pool (Solo)",
        "url": "public-pool.io",
        "port": 21496,
        "password": "x"
    },
    "ocean-solo": {
        "name": "Ocean.xyz (Solo)",
        "url": "mine.ocean.xyz",
        "port": 3334,
        "password": "x"
    },
    "braiins": {
        "name": "Braiins Pool",
        "url": "stratum.braiins.com",
        "port": 3333,
        "password": "x"
    },
    "ckpool-solo": {
        "name": "CKPool (Solo)",
        "url": "solo.ckpool.org",
        "port": 3333,
        "password": "x"
    },
    "noderunners": {
        "name": "Noderunners",
        "url": "stratum.noderunners.network",
        "port": 3333,
        "password": "x"
    }
}


def load_devices():
    """Load devices from shared config"""
    devices_file = config_dir / "devices.json"
    if devices_file.exists():
        with open(devices_file, 'r') as f:
            return json.load(f)
    return []


def load_pools():
    """Load saved pool configurations"""
    pools_dir.mkdir(parents=True, exist_ok=True)
    pools_file = pools_dir / "pools.json"
    if pools_file.exists():
        with open(pools_file, 'r') as f:
            return json.load(f)
    return {}


def save_pools(pools):
    """Save pool configurations"""
    pools_dir.mkdir(parents=True, exist_ok=True)
    pools_file = pools_dir / "pools.json"
    with open(pools_file, 'w') as f:
        json.dump(pools, f, indent=2)



def load_pool_schedule(device_name):
    """Load pool schedule for a device"""
    pool_schedules_dir.mkdir(parents=True, exist_ok=True)
    schedule_file = pool_schedules_dir / f"{device_name}.json"
    if schedule_file.exists():
        with open(schedule_file, 'r') as f:
            return json.load(f)
    return None


def _normalize_pool_blocks(blocks):
    """Ensure blocks have start/end and support fallback with start-only entries."""
    if not isinstance(blocks, list):
        return []

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
        pool = block.get("pool") or block.get("default_pool") or block.get("defaultPool") or block.get("name")
        fallback = block.get("fallback") or block.get("fallback_pool") or block.get("fallbackPool")
        days = block.get("days") or [
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
        ]

        if not end:
            if idx + 1 < len(sorted_blocks):
                end = sorted_blocks[idx + 1].get("start") or "23:59"
            else:
                end = "23:59"

        entry = {"start": start, "end": end, "pool": pool, "days": days}
        if fallback:
            entry["fallback_pool"] = fallback
        normalized.append(entry)
    return normalized


def save_pool_schedule(device_name, schedule):
    """Save pool schedule for a device (accepts start-only blocks)."""
    pool_schedules_dir.mkdir(parents=True, exist_ok=True)
    schedule_file = pool_schedules_dir / f"{device_name}.json"
    if isinstance(schedule, dict):
        schedule = dict(schedule)
        schedule["time_blocks"] = _normalize_pool_blocks(schedule.get("time_blocks", []))
    with open(schedule_file, 'w') as f:
        json.dump(schedule, f, indent=2)


async def get_device_pool(ip_address):
    """Get current pool info from device"""
    try:
        async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
            async with session.get(f"http://{ip_address}/api/system/info") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return {
                        'url': data.get('stratumURL', ''),
                        'port': data.get('stratumPort', 0),
                        'user': data.get('stratumUser', ''),
                        'password': data.get('stratumPassword', 'x'),
                        'fallback_url': data.get('fallbackStratumURL', ''),
                        'fallback_port': data.get('fallbackStratumPort', 0),
                        'fallback_user': data.get('fallbackStratumUser', ''),
                        'fallback_password': data.get('fallbackStratumPassword', 'x'),
                        'is_using_fallback': data.get('isUsingFallback', False),
                        'pool_connected': data.get('sharesAccepted', 0) > 0 or data.get('bestDiff', 0) > 0
                    }
    except Exception as e:
        logger.error(f"Error getting pool info from {ip_address}: {e}")
    return None


async def set_device_pool(ip_address, url, port, user, password="x"):
    """Set pool on device"""
    try:
        async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
            payload = {
                "stratumURL": url,
                "stratumPort": int(port),
                "stratumUser": user,
                "stratumPassword": password
            }
            async with session.patch(f"http://{ip_address}/api/system", json=payload) as resp:
                return resp.status == 200
    except Exception as e:
        logger.error(f"Error setting pool on {ip_address}: {e}")
        return False


async def set_device_fallback_pool(ip_address, url, port, user, password="x"):
    """Set fallback pool on device"""
    try:
        async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
            payload = {
                "fallbackStratumURL": url,
                "fallbackStratumPort": int(port),
                "fallbackStratumUser": user,
                "fallbackStratumPassword": password
            }
            async with session.patch(f"http://{ip_address}/api/system", json=payload) as resp:
                return resp.status == 200
    except Exception as e:
        logger.error(f"Error setting fallback pool on {ip_address}: {e}")
        return False


async def restart_device(ip_address):
    """Restart device to apply pool changes"""
    try:
        async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
            async with session.post(f"http://{ip_address}/api/system/restart") as resp:
                return resp.status == 200
    except Exception as e:
        logger.error(f"Error restarting {ip_address}: {e}")
        return False



def get_active_pool_for_time(schedule, current_time):
    """Determine which pool should be active based on schedule (returns main,fallback)."""
    if not schedule or 'time_blocks' not in schedule:
        return None, None
    current_minutes = current_time.hour * 60 + current_time.minute
    current_day = current_time.strftime('%A').lower()
    default_pool = schedule.get('default_pool')

    for block in schedule.get('time_blocks', []):
        days = block.get('days', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
        if current_day not in days:
            continue

        start = block.get('start', '00:00')
        end = block.get('end', '23:59')
        try:
            start_parts = start.split(':')
            end_parts = end.split(':')
            start_minutes = int(start_parts[0]) * 60 + int(start_parts[1])
            end_minutes = int(end_parts[0]) * 60 + int(end_parts[1])
        except Exception:
            start_minutes = 0
            end_minutes = 24 * 60 - 1

        def is_in_window():
            if end_minutes < start_minutes:
                return current_minutes >= start_minutes or current_minutes < end_minutes
            return start_minutes <= current_minutes < end_minutes

        if is_in_window():
            pool_id = block.get('pool') or default_pool
            fallback_id = block.get('fallback_pool') or block.get('fallback')
            return pool_id, fallback_id

    return default_pool, None


def scheduler_loop():
    """Main pool scheduler loop - runs every minute"""
    global scheduler_running
    
    logger.info("Pool Scheduler started")
    last_applied = {}  # Track what was last applied to avoid repeated switches
    
    while scheduler_running:
        try:
            devices = load_devices()
            pools = load_pools()
            current_time = datetime.now()
            
            for device in devices:
                device_name = device['name']
                ip_address = device['ip_address']
                
                # Load schedule
                schedule = load_pool_schedule(device_name)
                if not schedule or not schedule.get('enabled', False):
                    continue
                
                # Get active pool
                pool_id, fallback_id = get_active_pool_for_time(schedule, current_time)
                if not pool_id or pool_id not in pools:
                    continue

                # Check if already applied
                last_applied_key = f"{device_name}:{pool_id}:{fallback_id or 'none'}"
                if last_applied.get(device_name) == last_applied_key:
                    continue

                pool = pools[pool_id]
                fallback_pool = pools.get(fallback_id) if fallback_id else None

                logger.info(f"Switching {device_name} to pool: {pool['name']}")

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    success = loop.run_until_complete(
                        set_device_pool(ip_address, pool['url'], pool['port'], pool['user'], pool.get('password', 'x'))
                    )

                    if fallback_pool:
                        loop.run_until_complete(
                            set_device_fallback_pool(
                                ip_address,
                                fallback_pool['url'],
                                fallback_pool['port'],
                                fallback_pool['user'],
                                fallback_pool.get('password', 'x')
                            )
                        )

                    if success:
                        loop.run_until_complete(restart_device(ip_address))
                        last_applied[device_name] = last_applied_key
                        logger.info(f"Successfully switched {device_name} to {pool['name']}")
                    else:
                        logger.error(f"Failed to switch {device_name} to {pool['name']}")
                finally:
                    loop.close()

        except Exception as e:
            logger.error(f"Pool Scheduler error: {e}")

        # Sleep for 1 minute
        time.sleep(60)

    logger.info("Pool Scheduler stopped")


# API Routes
@require_patreon_auth
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
@require_feature('axepool')
def api_devices():
    """Get all devices with their current pool info"""
    devices = load_devices()
    pools = load_pools()
    result = []
    
    for device in devices:
        device_name = device['name']
        schedule = load_pool_schedule(device_name)
        
        # Get current pool from device
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            pool_info = loop.run_until_complete(get_device_pool(device['ip_address']))
        except:
            pool_info = None
        finally:
            loop.close()
        
        # Match current pool URL to a saved pool
        active_pool = None
        active_pool_name = None
        if pool_info and pool_info.get('url'):
            device_url = pool_info.get('url', '').lower()
            device_port = pool_info.get('port', 0)
            
            for pool_id, pool_data in pools.items():
                pool_url = pool_data.get('url', '').lower()
                pool_port = pool_data.get('port', 0)
                
                # Match URL and port
                if device_url == pool_url and device_port == pool_port:
                    active_pool = pool_id
                    active_pool_name = pool_data.get('name', pool_id)
                    break
        
        result.append({
            'name': device_name,
            'ip': device['ip_address'],
            'model': device.get('model', 'Unknown'),
            'current_pool': pool_info,
            'schedule_enabled': schedule.get('enabled', False) if schedule else False,
            'active_pool': active_pool,
            'active_pool_name': active_pool_name
        })
    
    return jsonify(result)


@app.route('/api/pools', methods=['GET', 'POST'])
@require_patreon_auth
@require_feature('axepool')
def api_pools():
    """Get or add pools"""
    if request.method == 'POST':
        data = request.json
        pools = load_pools()
        
        # Generate ID from name
        pool_id = data.get('id') or data['name'].lower().replace(' ', '-')
        
        pools[pool_id] = {
            'name': data['name'],
            'url': data['url'],
            'port': int(data['port']),
            'user': data['user'],
            'password': data.get('password', 'x')
        }
        
        save_pools(pools)
        return jsonify({'status': 'saved', 'id': pool_id})
    
    return jsonify(load_pools())


@app.route('/api/pools/<pool_id>', methods=['DELETE'])
@require_patreon_auth
@require_feature('axepool')
def api_delete_pool(pool_id):
    """Delete a pool"""
    pools = load_pools()
    if pool_id in pools:
        del pools[pool_id]
        save_pools(pools)
        return jsonify({'status': 'deleted'})
    return jsonify({'error': 'Pool not found'}), 404


@app.route('/api/pools/<pool_id>', methods=['GET', 'PUT'])
@require_patreon_auth
@require_feature('axepool')
def api_edit_pool(pool_id):
    """Get or edit a pool"""
    pools = load_pools()
    
    if pool_id not in pools:
        return jsonify({'error': 'Pool not found'}), 404
    
    if request.method == 'GET':
        return jsonify(pools[pool_id])
    
    elif request.method == 'PUT':
        data = request.json
        pool = pools[pool_id]
        if 'name' in data:
            pool['name'] = data['name']
        if 'url' in data:
            pool['url'] = data['url']
        if 'port' in data:
            pool['port'] = data['port']
        if 'user' in data:
            pool['user'] = data['user']
        if 'password' in data:
            pool['password'] = data['password']
        save_pools(pools)
        return jsonify({'status': 'updated', 'pool': pool})


@app.route('/api/pools/presets')
@require_patreon_auth
@require_feature('axepool')
def api_pool_presets():
    """Get pool presets"""
    return jsonify(POOL_PRESETS)


@app.route('/api/devices/<device_name>/pool', methods=['GET', 'POST'])
@require_patreon_auth
@require_feature('axepool')
def api_device_pool(device_name):
    """Get or set device pool"""
    devices = load_devices()
    device = next((d for d in devices if d['name'] == device_name), None)
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    if request.method == 'POST':
        data = request.json
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            success = loop.run_until_complete(
                set_device_pool(
                    device['ip_address'],
                    data['url'],
                    data['port'],
                    data['user'],
                    data.get('password', 'x')
                )
            )
            
            # Restart device if requested
            if success and data.get('restart', True):
                loop.run_until_complete(restart_device(device['ip_address']))
                return jsonify({'status': 'applied_and_restarting'})
            elif success:
                return jsonify({'status': 'applied_no_restart'})
            else:
                return jsonify({'error': 'Failed to set pool'}), 500
        finally:
            loop.close()
    
    # GET - return current pool
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        pool_info = loop.run_until_complete(get_device_pool(device['ip_address']))
        return jsonify(pool_info or {})
    finally:
        loop.close()


@app.route('/api/devices/<device_name>/pool/apply/<pool_id>', methods=['POST'])
@require_patreon_auth
@require_feature('axepool')
def api_apply_pool(device_name, pool_id):
    """Apply a saved pool to a device"""
    devices = load_devices()
    device = next((d for d in devices if d['name'] == device_name), None)
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    pools = load_pools()
    if pool_id not in pools:
        return jsonify({'error': 'Pool not found'}), 404
    
    pool = pools[pool_id]
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        success = loop.run_until_complete(
            set_device_pool(
                device['ip_address'],
                pool['url'],
                pool['port'],
                pool['user'],
                pool.get('password', 'x')
            )
        )
        
        if success:
            # Restart to apply
            loop.run_until_complete(restart_device(device['ip_address']))
            return jsonify({
                'status': 'applied',
                'pool': pool['name']
            })
        else:
            return jsonify({'error': 'Failed to apply pool'}), 500
    finally:
        loop.close()


@app.route('/api/devices/<device_name>/pool/apply-fallback/<pool_id>', methods=['POST'])
@require_patreon_auth
@require_feature('axepool')
def api_apply_pool_as_fallback(device_name, pool_id):
    """Apply a saved pool as the fallback pool"""
    devices = load_devices()
    device = next((d for d in devices if d['name'] == device_name), None)
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    pools = load_pools()
    if pool_id not in pools:
        return jsonify({'error': 'Pool not found'}), 404
    
    pool = pools[pool_id]
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        success = loop.run_until_complete(
            set_device_fallback_pool(
                device['ip_address'],
                pool['url'],
                pool['port'],
                pool['user'],
                pool.get('password', 'x')
            )
        )
        
        if success:
            return jsonify({
                'status': 'applied_as_fallback',
                'pool': pool['name']
            })
        else:
            return jsonify({'error': 'Failed to apply fallback pool'}), 500
    finally:
        loop.close()


@app.route('/api/devices/<device_name>/pool/swap', methods=['POST'])
@require_patreon_auth
@require_feature('axepool')
def api_swap_pools(device_name):
    """Swap main and fallback pools on a device"""
    devices = load_devices()
    device = next((d for d in devices if d['name'] == device_name), None)
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        # Get current pools
        pool_info = loop.run_until_complete(get_device_pool(device['ip_address']))
        
        if not pool_info or not pool_info.get('fallback_url'):
            return jsonify({'error': 'No fallback pool configured to swap'}), 400
        
        # Set main to old fallback
        success1 = loop.run_until_complete(
            set_device_pool(
                device['ip_address'],
                pool_info['fallback_url'],
                pool_info['fallback_port'],
                pool_info.get('fallback_user', pool_info.get('user', '')),
                'x'
            )
        )
        
        # Set fallback to old main
        success2 = loop.run_until_complete(
            set_device_fallback_pool(
                device['ip_address'],
                pool_info['url'],
                pool_info['port'],
                pool_info['user'],
                'x'
            )
        )
        
        if success1 and success2:
            # Restart to apply
            loop.run_until_complete(restart_device(device['ip_address']))
            return jsonify({
                'status': 'swapped',
                'new_main': pool_info['fallback_url'],
                'new_fallback': pool_info['url']
            })
        else:
            return jsonify({'error': 'Failed to swap pools'}), 500
    finally:
        loop.close()


@app.route('/api/devices/<device_name>/pool/import', methods=['POST'])
@require_patreon_auth
@require_feature('axepool')
def api_import_pool_from_device(device_name):
    """Import current pool(s) from device into library"""
    devices = load_devices()
    device = next((d for d in devices if d['name'] == device_name), None)
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    data = request.json
    import_main = data.get('main', True)
    import_fallback = data.get('fallback', False)
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        pool_info = loop.run_until_complete(get_device_pool(device['ip_address']))
        
        if not pool_info:
            return jsonify({'error': 'Could not read pool info from device'}), 500
        
        pools = load_pools()
        imported = []
        
        if import_main and pool_info.get('url'):
            pool_id = f"{device_name}-main".lower().replace(' ', '-')
            pools[pool_id] = {
                'name': f"{device_name} Main Pool",
                'url': pool_info['url'],
                'port': pool_info['port'],
                'user': pool_info['user'],
                'password': pool_info.get('password', 'x')
            }
            imported.append('main')
        
        if import_fallback and pool_info.get('fallback_url'):
            pool_id = f"{device_name}-fallback".lower().replace(' ', '-')
            pools[pool_id] = {
                'name': f"{device_name} Fallback Pool",
                'url': pool_info['fallback_url'],
                'port': pool_info['fallback_port'],
                'user': pool_info.get('fallback_user', pool_info.get('user', '')),
                'password': pool_info.get('fallback_password', pool_info.get('password', 'x'))
            }
            imported.append('fallback')
        
        save_pools(pools)
        
        return jsonify({
            'status': 'imported',
            'imported': imported
        })
    finally:
        loop.close()


@app.route('/api/devices/<device_name>/schedule', methods=['GET', 'POST'])
@require_patreon_auth
@require_feature('axepool')
def api_device_pool_schedule(device_name):
    """Get or set device pool schedule"""
    if request.method == 'POST':
        schedule = request.json
        save_pool_schedule(device_name, schedule)
        
        # If schedule is enabled, immediately apply the correct pool
        if schedule.get('enabled'):
            from datetime import datetime
            current_time = datetime.now()
            pool_id, fallback_id = get_active_pool_for_time(schedule, current_time)
            
            if pool_id:
                pools = load_pools()
                if pool_id in pools:
                    pool = pools[pool_id]
                    fallback_pool = pools.get(fallback_id) if fallback_id else None
                    devices = load_devices()
                    device = next((d for d in devices if d['name'] == device_name), None)
                    
                    if device:
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        try:
                            loop.run_until_complete(
                                set_device_pool(device['ip_address'], pool['url'], pool['port'], pool['user'], pool.get('password', 'x'))
                            )
                            if fallback_pool:
                                loop.run_until_complete(
                                    set_device_fallback_pool(
                                        device['ip_address'],
                                        fallback_pool['url'],
                                        fallback_pool['port'],
                                        fallback_pool['user'],
                                        fallback_pool.get('password', 'x')
                                    )
                                )
                            logger.info(f"Immediately applied pool {pool['name']} to {device_name} on schedule save")
                        except Exception as e:
                            logger.error(f"Failed to immediately apply pool: {e}")
                        finally:
                            loop.close()
        
        return jsonify({'status': 'saved'})
    
    schedule = load_pool_schedule(device_name)
    if not schedule:
        # Return default schedule template
        schedule = {
            'device': device_name,
            'enabled': False,
            'default_pool': None,
            'time_blocks': []
        }
    return jsonify(schedule)


@app.route('/api/scheduler/status')
@require_patreon_auth
@require_feature('axepool')
def api_scheduler_status():
    """Get pool scheduler status"""
    return jsonify({
        'running': scheduler_running
    })


@app.route('/api/scheduler/start', methods=['POST'])
@require_patreon_auth
@require_feature('axepool')
def api_scheduler_start():
    """Start the pool scheduler"""
    global scheduler_running, scheduler_thread
    
    if scheduler_running:
        return jsonify({'status': 'already_running'})
    
    scheduler_running = True
    scheduler_thread = Thread(target=scheduler_loop, daemon=True)
    scheduler_thread.start()
    
    return jsonify({'status': 'started'})


@app.route('/api/scheduler/stop', methods=['POST'])
@require_patreon_auth
@require_feature('axepool')
def api_scheduler_stop():
    """Stop the pool scheduler"""
    global scheduler_running
    
    scheduler_running = False
    return jsonify({'status': 'stopped'})


def get_dashboard_html():
    """Generate the dashboard HTML"""
    return """
<!DOCTYPE html>
<html>
<head>
    <title>AxePool - Pool Manager</title>
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
        h1 { color: #9c27b0; font-size: 1.4em; }
        h2 { font-size: 1.1em; margin-bottom: 10px; }
        h3 { font-size: 1em; }
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
        .nav-link.shed { background: linear-gradient(135deg, #4caf50, #2e7d32); }
        .card {
            background: #2d2d2d;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .card h2 { color: #9c27b0; }
        .grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); 
            gap: 10px; 
        }
        .pool-card, .device-card {
            background: #333;
            border-radius: 6px;
            padding: 12px;
        }
        .pool-card h3 { color: #9c27b0; margin-bottom: 8px; font-size: 0.95em; }
        .pool-info { color: #aaa; font-size: 0.8em; margin-bottom: 8px; }
        .pool-info code { 
            background: #444; 
            padding: 2px 4px; 
            border-radius: 3px; 
            color: #fff;
            font-size: 0.85em;
            word-break: break-all;
        }
        .device-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .device-name { font-size: 0.95em; font-weight: bold; }
        .current-pool {
            background: #444;
            padding: 8px;
            border-radius: 4px;
            margin-bottom: 8px;
            font-size: 0.8em;
        }
        .current-pool .label { color: #888; font-size: 0.85em; }
        .current-pool .value { color: #9c27b0; font-weight: bold; word-break: break-all; }
        .current-pool .pool-name { color: #4caf50; font-weight: bold; }
        button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            background: #9c27b0;
            color: white;
            font-size: 0.85em;
            min-height: 36px;
            touch-action: manipulation;
        }
        button:hover { opacity: 0.9; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        button.secondary { background: #555; }
        button.danger { background: #d32f2f; }
        button.success { background: #388e3c; }
        input, select {
            width: 100%;
            padding: 8px;
            border: 1px solid #555;
            border-radius: 4px;
            background: #444;
            color: white;
            margin-bottom: 8px;
            font-size: 14px;
            min-height: 36px;
        }
        .form-group { margin-bottom: 12px; }
        .form-group label { display: block; margin-bottom: 4px; color: #aaa; font-size: 0.85em; }
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
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }
        .status-dot.online { background: #4caf50; }
        .status-dot.offline { background: #ff3333; }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
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
        input:checked + .toggle-slider { background-color: #9c27b0; }
        input:checked + .toggle-slider:before { transform: translateX(20px); }
        .time-block {
            background: #444;
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
        .time-block input[type="time"] { width: 100px; flex: none; }
        .time-block select { width: auto; flex: 1; min-width: 80px; }
        .device-list-item {
            display: flex;
            align-items: center;
            padding: 10px;
            background: #3a3a3a;
            border-radius: 4px;
            margin-bottom: 6px;
            gap: 10px;
        }
        .device-list-item label {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }
        .device-list-item input[type="checkbox"] {
            width: 18px;
            height: 18px;
            margin: 0;
        }
        .slot-select {
            display: flex;
            gap: 8px;
        }
        .slot-select label {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 0.85em;
            color: #aaa;
        }
        .slot-select input[type="radio"] {
            width: 16px;
            height: 16px;
            margin: 0;
        }
        .btn-row {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        .btn-row button { flex: 1; min-width: 80px; }
        
        /* Mobile optimizations */
        @media (max-width: 600px) {
            body { padding: 8px; }
            .header { flex-direction: column; align-items: flex-start; }
            .nav-links { width: 100%; justify-content: space-between; }
            .grid { grid-template-columns: 1fr; }
            .scheduler-status { font-size: 0.8em; }
            #scheduler-text { display: none; }
            .modal-content { margin: 10px; padding: 12px; }
        }
    </style>
</head>
<body>
    <!-- Nag Banner for non-patrons -->
    <div id="nag-banner" style="display: none; background: linear-gradient(135deg, #9c27b0, #7b1fa2); padding: 8px 12px; text-align: center; font-size: 0.9em;">
        <span style="color: white;">
            ⚡ <strong>Free tier (5 devices)</strong> — Support development!
            <button onclick="loginWithPatreon()" style="background: white; color: #9c27b0; border: none; padding: 4px 12px; border-radius: 12px; margin-left: 8px; cursor: pointer; font-weight: bold; font-size: 0.85em;">❤️ Support</button>
            <button onclick="this.parentElement.parentElement.style.display='none'" style="background: transparent; border: none; color: rgba(255,255,255,0.8); cursor: pointer; margin-left: 8px; font-size: 1.1em;">✕</button>
        </span>
    </div>
    
    <div class="header">
        <h1>🎱 AxePool</h1>
        <div class="nav-links">
            <div class="scheduler-status">
                <div class="scheduler-indicator">
                    <span class="status-dot" id="scheduler-dot"></span>
                    <span id="scheduler-text">Scheduler: Checking...</span>
                </div>
                <button id="scheduler-btn" onclick="toggleScheduler()">Start</button>
            </div>
            <a onclick="window.location.href = 'http://' + window.location.hostname + ':5000'" style="cursor: pointer;" class="nav-link bench">⚡ AxeBench</a>
            <a onclick="window.location.href = 'http://' + window.location.hostname + ':5001'" style="cursor: pointer;" class="nav-link shed">🏠 AxeShed</a>
        </div>
    </div>
    
    <div class="card">
        <h2>🏊 Pool Library</h2>
        <button onclick="showAddPoolModal()">➕ Add Pool</button>
        <button onclick="showPresetsModal()" class="secondary">📋 Import Preset</button>
        <div id="pools" class="grid" style="margin-top: 15px;">
            <p style="color: #999;">Loading pools...</p>
        </div>
    </div>
    
    <div class="card">
        <h2>📱 Devices</h2>
        <div id="devices" class="grid">
            <p style="color: #999;">Loading devices...</p>
        </div>
    </div>
    
    <!-- Add Pool Modal -->
    <div id="addPoolModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add Pool</h2>
                <button onclick="closeModal('addPoolModal')" class="secondary">✕</button>
            </div>
            <div class="form-group">
                <label>Pool Name</label>
                <input type="text" id="pool-name" placeholder="My Solo Pool">
            </div>
            <div class="form-group">
                <label>Stratum URL</label>
                <input type="text" id="pool-url" placeholder="public-pool.io">
            </div>
            <div class="form-group">
                <label>Port</label>
                <input type="number" id="pool-port" placeholder="21496">
            </div>
            <div class="form-group">
                <label>User / Wallet Address</label>
                <input type="text" id="pool-user" placeholder="bc1q...">
            </div>
            <div class="form-group">
                <label>Password (usually 'x')</label>
                <input type="text" id="pool-password" value="x">
            </div>
            <button onclick="savePool()" class="success">💾 Save Pool</button>
        </div>
    </div>
    
    <!-- Presets Modal -->
    <div id="presetsModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Pool Presets</h2>
                <button onclick="closeModal('presetsModal')" class="secondary">✕</button>
            </div>
            <div id="presets-list"></div>
        </div>
    </div>
    
    <!-- Schedule Modal -->
    <div id="scheduleModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="schedule-title">Pool Schedule</h2>
                <button onclick="closeModal('scheduleModal')" class="secondary">✕</button>
            </div>
            <div class="form-group">
                <label>Default Pool (when no schedule matches)</label>
                <select id="default-pool"></select>
            </div>
            <h3 style="margin: 15px 0 10px; color: #9c27b0;">Time Blocks</h3>
            <div id="schedule-blocks"></div>
            <button onclick="addScheduleBlock()" class="secondary" style="margin-bottom: 15px;">+ Add Time Block</button>
            <div style="display: flex; gap: 10px;">
                <button onclick="saveSchedule()" class="success" style="flex: 1;">💾 Save Schedule</button>
                <button onclick="closeModal('scheduleModal')" class="secondary" style="flex: 1;">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Edit Pool Modal -->
    <div id="editPoolModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Edit Pool</h3>
                <button onclick="closeModal('editPoolModal')" class="close-btn">✕</button>
            </div>
            <div class="form-group">
                <label>Pool Name</label>
                <input type="text" id="edit-pool-name" placeholder="My Solo Pool">
            </div>
            <div class="form-group">
                <label>Stratum URL</label>
                <input type="text" id="edit-pool-url" placeholder="public-pool.io">
            </div>
            <div class="form-group">
                <label>Port</label>
                <input type="number" id="edit-pool-port" placeholder="21496">
            </div>
            <div class="form-group">
                <label>User / Wallet Address</label>
                <input type="text" id="edit-pool-user" placeholder="bc1q...">
            </div>
            <div class="form-group">
                <label>Password (usually 'x')</label>
                <input type="text" id="edit-pool-password" value="x">
            </div>
            <div class="btn-row">
                <button onclick="updatePool()" class="success">💾 Save</button>
                <button onclick="closeModal('editPoolModal')" class="secondary">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Apply Pool Modal -->
    <div id="applyPoolModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Apply Pool: <span id="apply-pool-name"></span></h3>
                <button onclick="closeModal('applyPoolModal')" class="close-btn">✕</button>
            </div>
            <p style="color: #aaa; margin-bottom: 12px; font-size: 0.85em;">Select devices and slot to apply this pool:</p>
            <div id="apply-device-list" style="max-height: 300px; overflow-y: auto; margin-bottom: 12px;">
                <!-- Device checkboxes will be inserted here -->
            </div>
            <div class="btn-row" style="margin-bottom: 10px;">
                <button onclick="selectAllDevices(true)" class="secondary">Select All</button>
                <button onclick="selectAllDevices(false)" class="secondary">Clear All</button>
            </div>
            <div class="btn-row">
                <button onclick="closeModal('applyPoolModal')" class="secondary">Cancel</button>
                <button onclick="applyPoolToSelected()" id="apply-pool-btn">Apply to 0 devices</button>
            </div>
        </div>
    </div>
    
    <script>
        let pools = {};
        let devices = [];
        let currentApplyPoolId = null;
        let currentScheduleDevice = null;
        let currentSchedule = null;
        
        async function loginWithPatreon() {
            window.location.href = 'http://' + window.location.hostname + ':5000';
        }
        
        async function loadPools() {
            try {
                const response = await fetch('/api/pools');
                
                const container = document.getElementById('pools');
                
                pools = await response.json();
                
                if (Object.keys(pools).length === 0) {
                    container.innerHTML = '<p style="color: #999;">No pools configured. Add a pool or import a preset.</p>';
                    return;
                }
                
                container.innerHTML = Object.entries(pools).map(([id, pool]) => `
                    <div class="pool-card">
                        <h3>${pool.name}</h3>
                        <div class="pool-info">
                            <code>${pool.url}:${pool.port}</code><br>
                            User: <code>${pool.user.substring(0, 20)}${pool.user.length > 20 ? '...' : ''}</code>
                        </div>
                        <div class="btn-row">
                            <button onclick="showApplyPoolModal('${id}')" class="success">▶ Apply</button>
                            <button onclick="editPool('${id}')" class="secondary">✏️</button>
                            <button onclick="deletePool('${id}')" class="danger">🗑️</button>
                        </div>
                    </div>
                `).join('');
                
            } catch (error) {
                console.error('Error loading pools:', error);
                const container = document.getElementById('pools');
                container.innerHTML = '<p style="color: #ff6b6b;">Error loading pools. Please try again.</p>';
            }
        }
        
        function getPoolNameByUrl(url, port) {
            for (const [id, pool] of Object.entries(pools)) {
                if (pool.url.toLowerCase() === url.toLowerCase() && pool.port === port) {
                    return pool.name;
                }
            }
            return null;
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
                
                devices = await response.json();
                
                if (devices.length === 0) {
                    container.innerHTML = '<p style="color: #999;">No devices found. Add devices in AxeBench first.</p>';
                    return;
                }
                
                container.innerHTML = devices.map(device => {
                    // Get pool info and match to library
                    const mainUrl = device.current_pool?.url || '';
                    const mainPort = device.current_pool?.port || 0;
                    const mainPoolName = getPoolNameByUrl(mainUrl, mainPort);
                    const mainDisplay = mainPoolName 
                        ? `<span class="pool-name">${mainPoolName}</span>` 
                        : (mainUrl ? `<span class="value">Unsaved: ${mainUrl}:${mainPort}</span>` : '<span class="value">Not set</span>');
                    
                    const fallbackUrl = device.current_pool?.fallback_url || '';
                    const fallbackPort = device.current_pool?.fallback_port || 0;
                    const fallbackPoolName = getPoolNameByUrl(fallbackUrl, fallbackPort);
                    const fallbackDisplay = fallbackPoolName
                        ? `<span class="pool-name">${fallbackPoolName}</span>`
                        : (fallbackUrl ? `<span class="value">Unsaved: ${fallbackUrl}:${fallbackPort}</span>` : '<span class="value">Not set</span>');
                    
                    const hasFallback = device.current_pool?.fallback_url;
                    const safeDeviceName = device.name.replace(/'/g, "\\'");
                    const isUsingFallback = device.current_pool?.is_using_fallback || false;
                    
                    // Determine currently running pool display
                    const runningPoolName = isUsingFallback 
                        ? (fallbackPoolName || `${fallbackUrl}:${fallbackPort}`)
                        : (mainPoolName || `${mainUrl}:${mainPort}`);
                    const runningSlot = isUsingFallback ? 'Fallback' : 'Main';
                    const runningColor = isUsingFallback ? '#ff9800' : '#4caf50';
                    
                    return `
                    <div class="device-card">
                        <div class="device-header">
                            <span class="device-name">${device.name}</span>
                            <label class="toggle-switch" title="Enable pool schedule">
                                <input type="checkbox" ${device.schedule_enabled ? 'checked' : ''} 
                                       onchange="toggleDeviceSchedule('${safeDeviceName}', this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        
                        ${mainUrl ? `
                        <div class="running-pool-badge" style="background: linear-gradient(135deg, ${runningColor}, ${runningColor}dd); padding: 8px 12px; border-radius: 8px; margin-bottom: 10px; text-align: center;">
                            <div style="font-size: 0.75em; opacity: 0.9;">▶ Currently Running (${runningSlot})</div>
                            <div style="font-weight: bold; font-size: 1.1em;">${runningPoolName || 'Unknown'}</div>
                        </div>
                        ` : ''}
                        
                        <div class="current-pool">
                            <span class="label">Main:</span> ${mainDisplay} ${!isUsingFallback && mainUrl ? '<span style="color: #4caf50;">●</span>' : ''}
                        </div>
                        <div class="current-pool" style="opacity: 0.8;">
                            <span class="label">Fallback:</span> ${fallbackDisplay} ${isUsingFallback ? '<span style="color: #ff9800;">●</span>' : ''}
                        </div>
                        
                        <div class="btn-row" style="margin-top: 8px;">
                            <button onclick="swapPools('${safeDeviceName}')" class="secondary" ${!hasFallback ? 'disabled' : ''}>🔄 Swap</button>
                            <button onclick="importPools('${safeDeviceName}')" class="secondary">📥 Import</button>
                            <button onclick="editSchedule('${safeDeviceName}')" class="secondary">⏰ Schedule</button>
                        </div>
                    </div>
                `}).join('');
                
            } catch (error) {
                console.error('Error loading devices:', error);
                const container = document.getElementById('devices');
                container.innerHTML = '<p style="color: #ff6b6b;">Error loading devices. Please try again.</p>';
            }
        }
        
        function showApplyPoolModal(poolId) {
            currentApplyPoolId = poolId;
            const pool = pools[poolId];
            document.getElementById('apply-pool-name').textContent = pool.name;
            
            // Build device list with checkboxes
            const listDiv = document.getElementById('apply-device-list');
            listDiv.innerHTML = devices.map(d => {
                const safeId = d.name.replace(/[^a-zA-Z0-9]/g, '-');
                return `
                    <div class="device-list-item">
                        <label>
                            <input type="checkbox" class="apply-device-cb" data-device="${d.name}" onchange="updateApplyButton()">
                            <span>${d.name}</span>
                        </label>
                        <div class="slot-select">
                            <label><input type="radio" name="slot-${safeId}" value="main" checked> Main</label>
                            <label><input type="radio" name="slot-${safeId}" value="fallback"> Fallback</label>
                        </div>
                    </div>
                `;
            }).join('');
            
            updateApplyButton();
            document.getElementById('applyPoolModal').style.display = 'block';
        }
        
        function selectAllDevices(checked) {
            document.querySelectorAll('.apply-device-cb').forEach(cb => cb.checked = checked);
            updateApplyButton();
        }
        
        function updateApplyButton() {
            const count = document.querySelectorAll('.apply-device-cb:checked').length;
            const btn = document.getElementById('apply-pool-btn');
            btn.textContent = `Apply to ${count} device${count !== 1 ? 's' : ''}`;
            btn.disabled = count === 0;
        }
        
        async function applyPoolToSelected() {
            const pool = pools[currentApplyPoolId];
            const checkboxes = document.querySelectorAll('.apply-device-cb:checked');
            
            if (checkboxes.length === 0) return;
            
            const results = [];
            for (const cb of checkboxes) {
                const deviceName = cb.dataset.device;
                const safeId = deviceName.replace(/[^a-zA-Z0-9]/g, '-');
                const slot = document.querySelector(`input[name="slot-${safeId}"]:checked`).value;
                
                const endpoint = slot === 'fallback'
                    ? `/api/devices/${encodeURIComponent(deviceName)}/pool/apply-fallback/${currentApplyPoolId}`
                    : `/api/devices/${encodeURIComponent(deviceName)}/pool/apply/${currentApplyPoolId}`;
                
                try {
                    const response = await fetch(endpoint, { method: 'POST' });
                    if (response.ok) {
                        results.push(`✓ ${deviceName} (${slot})`);
                    } else {
                        results.push(`✗ ${deviceName} - failed`);
                    }
                } catch (e) {
                    results.push(`✗ ${deviceName} - error`);
                }
            }
            
            closeModal('applyPoolModal');
            alert(`Applied ${pool.name}:\\n${results.join('\\n')}`);
            setTimeout(loadDevices, 2000);
        }
        
        async function applyPoolWithSlot(deviceName, poolId) {
            const deviceId = deviceName.replace(/[^a-zA-Z0-9]/g, '-');
            const slot = document.getElementById(`apply-slot-${deviceId}`)?.value || 'main';
            const endpoint = slot === 'fallback' 
                ? `/api/devices/${encodeURIComponent(deviceName)}/pool/apply-fallback/${poolId}`
                : `/api/devices/${encodeURIComponent(deviceName)}/pool/apply/${poolId}`;
            
            const action = slot === 'fallback' ? 'set as fallback' : 'switch to';
            if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${pools[poolId].name}?`)) return;
            
            try {
                const response = await fetch(endpoint, { method: 'POST' });
                
                if (response.ok) {
                    const result = await response.json();
                    alert(`${pools[poolId].name} ${slot === 'fallback' ? 'set as fallback' : 'applied'}!`);
                    setTimeout(loadDevices, 2000);
                } else {
                    alert('Failed to apply pool');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error applying pool');
            }
        }
        
        async function swapPools(deviceName) {
            if (!confirm(`Swap main and fallback pools on ${deviceName}? Device will restart.`)) return;
            
            try {
                const response = await fetch(`/api/devices/${encodeURIComponent(deviceName)}/pool/swap`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    alert(`Pools swapped! New main: ${result.new_main}`);
                    setTimeout(loadDevices, 5000);
                } else {
                    const err = await response.json();
                    alert('Failed to swap: ' + (err.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error swapping pools');
            }
        }
        
        async function importPools(deviceName) {
            const choice = prompt('Import pools to library:\\n1 = Main pool only\\n2 = Fallback pool only\\n3 = Both\\n\\nEnter 1, 2, or 3:');
            
            if (!choice || !['1', '2', '3'].includes(choice)) return;
            
            const importMain = choice === '1' || choice === '3';
            const importFallback = choice === '2' || choice === '3';
            
            try {
                const response = await fetch(`/api/devices/${encodeURIComponent(deviceName)}/pool/import`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ main: importMain, fallback: importFallback })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    alert(`Imported: ${result.imported.join(', ')}`);
                    loadPools().then(() => loadDevices());
                } else {
                    alert('Failed to import pools');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error importing pools');
            }
        }
        
        // Legacy function for backwards compatibility
        async function applyPool(deviceName, poolId) {
            return applyPoolWithSlot(deviceName, poolId);
        }
        
        function showAddPoolModal() {
            document.getElementById('pool-name').value = '';
            document.getElementById('pool-url').value = '';
            document.getElementById('pool-port').value = '';
            document.getElementById('pool-user').value = '';
            document.getElementById('pool-password').value = 'x';
            document.getElementById('addPoolModal').style.display = 'block';
        }
        
        async function savePool() {
            const pool = {
                name: document.getElementById('pool-name').value,
                url: document.getElementById('pool-url').value,
                port: document.getElementById('pool-port').value,
                user: document.getElementById('pool-user').value,
                password: document.getElementById('pool-password').value
            };
            
            if (!pool.name || !pool.url || !pool.port || !pool.user) {
                alert('Please fill in all fields');
                return;
            }
            
            try {
                const response = await fetch('/api/pools', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(pool)
                });
                
                if (response.ok) {
                    closeModal('addPoolModal');
                    loadPools();
                    loadDevices();
                } else {
                    alert('Failed to save pool');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error saving pool');
            }
        }
        
        let currentEditPoolId = null;
        
        async function editPool(poolId) {
            currentEditPoolId = poolId;
            try {
                const response = await fetch(`/api/pools/${poolId}`);
                const pool = await response.json();
                
                document.getElementById('edit-pool-name').value = pool.name;
                document.getElementById('edit-pool-url').value = pool.url;
                document.getElementById('edit-pool-port').value = pool.port;
                document.getElementById('edit-pool-user').value = pool.user;
                document.getElementById('edit-pool-password').value = pool.password || 'x';
                
                document.getElementById('editPoolModal').style.display = 'block';
            } catch (error) {
                console.error('Error:', error);
                alert('Failed to load pool details');
            }
        }
        
        async function updatePool() {
            if (!currentEditPoolId) return;
            
            const pool = {
                name: document.getElementById('edit-pool-name').value,
                url: document.getElementById('edit-pool-url').value,
                port: parseInt(document.getElementById('edit-pool-port').value),
                user: document.getElementById('edit-pool-user').value,
                password: document.getElementById('edit-pool-password').value
            };
            
            try {
                const response = await fetch(`/api/pools/${currentEditPoolId}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(pool)
                });
                
                if (response.ok) {
                    closeModal('editPoolModal');
                    loadPools();
                    loadDevices();
                    alert('Pool updated successfully');
                } else {
                    alert('Failed to update pool');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error updating pool');
            }
        }
        
        async function deletePool(poolId) {
            if (!confirm('Delete this pool?')) return;
            
            try {
                await fetch(`/api/pools/${poolId}`, { method: 'DELETE' });
                loadPools();
                loadDevices();
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        async function showPresetsModal() {
            try {
                const response = await fetch('/api/pools/presets');
                const presets = await response.json();
                
                document.getElementById('presets-list').innerHTML = Object.entries(presets).map(([id, preset]) => `
                    <div class="pool-card" style="margin-bottom: 10px;">
                        <h3>${preset.name}</h3>
                        <div class="pool-info">
                            <code>${preset.url}:${preset.port}</code>
                        </div>
                        <button onclick="importPreset('${id}')" class="success">Import</button>
                    </div>
                `).join('');
                
                document.getElementById('presetsModal').style.display = 'block';
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        async function importPreset(presetId) {
            const user = prompt('Enter your wallet address or username for this pool:');
            if (!user) return;
            
            try {
                const presetsResponse = await fetch('/api/pools/presets');
                const presets = await presetsResponse.json();
                const preset = presets[presetId];
                
                const response = await fetch('/api/pools', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        id: presetId,
                        name: preset.name,
                        url: preset.url,
                        port: preset.port,
                        user: user,
                        password: preset.password
                    })
                });
                
                if (response.ok) {
                    closeModal('presetsModal');
                    loadPools();
                    loadDevices();
                }
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        async function toggleDeviceSchedule(deviceName, enabled) {
            try {
                const response = await fetch(`/api/devices/${encodeURIComponent(deviceName)}/schedule`);
                let schedule = await response.json();
                schedule.enabled = enabled;
                
                await fetch(`/api/devices/${encodeURIComponent(deviceName)}/schedule`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(schedule)
                });
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        async function editSchedule(deviceName) {
            currentScheduleDevice = deviceName;
            
            try {
                const response = await fetch(`/api/devices/${encodeURIComponent(deviceName)}/schedule`);
                currentSchedule = await response.json();
                
                // Populate default pool dropdown
                const defaultSelect = document.getElementById('default-pool');
                defaultSelect.innerHTML = '<option value="">None</option>' + 
                    Object.entries(pools).map(([id, pool]) => 
                        `<option value="${id}" ${currentSchedule.default_pool === id ? 'selected' : ''}>${pool.name}</option>`
                    ).join('');
                
                // Render time blocks
                renderScheduleBlocks();
                
                document.getElementById('schedule-title').textContent = `Pool Schedule: ${deviceName}`;
                document.getElementById('scheduleModal').style.display = 'block';
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        function renderScheduleBlocks() {
            const container = document.getElementById('schedule-blocks');
            const poolOptions = Object.entries(pools).map(([id, pool]) => 
                `<option value="${id}">${pool.name}</option>`
            ).join('');
            
            container.innerHTML = (currentSchedule.time_blocks || []).map((block, i) => `
                <div class="time-block">
                    <input type="time" value="${block.start}" onchange="updateScheduleBlock(${i}, 'start', this.value)">
                    <span>to</span>
                    <input type="time" value="${block.end}" onchange="updateScheduleBlock(${i}, 'end', this.value)">
                    <select onchange="updateScheduleBlock(${i}, 'pool', this.value)">
                        ${poolOptions.replace(`value="${block.pool}"`, `value="${block.pool}" selected`)}
                    </select>
                    <button onclick="removeScheduleBlock(${i})" class="danger" style="padding: 5px 10px;">✕</button>
                </div>
            `).join('');
        }
        
        function addScheduleBlock() {
            if (!currentSchedule.time_blocks) currentSchedule.time_blocks = [];
            const firstPoolId = Object.keys(pools)[0];
            currentSchedule.time_blocks.push({
                start: '22:00',
                end: '06:00',
                pool: firstPoolId || ''
            });
            renderScheduleBlocks();
        }
        
        function updateScheduleBlock(index, field, value) {
            currentSchedule.time_blocks[index][field] = value;
        }
        
        function removeScheduleBlock(index) {
            currentSchedule.time_blocks.splice(index, 1);
            renderScheduleBlocks();
        }
        
        async function saveSchedule() {
            currentSchedule.default_pool = document.getElementById('default-pool').value || null;
            
            try {
                await fetch(`/api/devices/${encodeURIComponent(currentScheduleDevice)}/schedule`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(currentSchedule)
                });
                
                alert('Schedule saved!');
                closeModal('scheduleModal');
                loadDevices();
            } catch (error) {
                console.error('Error:', error);
                alert('Error saving schedule');
            }
        }
        
        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
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
        loadPools().then(() => loadDevices());
        checkSchedulerStatus();
        
        // Auto-refresh
        setInterval(() => {
            loadDevices();
        }, 15000);
        setInterval(checkSchedulerStatus, 5000);
    </script>

</body>
</html>
"""


def run_axepool(host='0.0.0.0', port=5002):
    """Run AxePool server"""
    print("""
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                   🎱 AxePool v1.0 🎱                      ║
║                                                           ║
║          Bitaxe Pool Management & Switching               ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   Web Interface: http://localhost:5002                    ║
║                                                           ║
║   Solo mine at night, pool mine by day!                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
""")
    
    logging.basicConfig(level=logging.INFO)
    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == '__main__':
    run_axepool()



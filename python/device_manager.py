"""
Device manager for Bitaxe miners with API communication
Uses fresh HTTP sessions per request to avoid async lifecycle issues
"""
import asyncio
import aiohttp
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import logging
import time

logger = logging.getLogger(__name__)

# Default timeout for all HTTP requests
DEFAULT_TIMEOUT = aiohttp.ClientTimeout(total=10)


@dataclass
class SystemInfo:
    """System information from Bitaxe API"""
    hashrate: float
    temperature: float
    vr_temp: Optional[float]
    power: float
    voltage: int
    frequency: int
    input_voltage: float
    shares_accepted: int
    shares_rejected: int
    best_diff: str
    uptime: int
    timestamp: float
    fan_speed: float = 0.0
    error_percentage: float = 0.0  # ASIC error rate from API
    expected_hashrate: float = 0.0  # Expected hashrate based on frequency/cores
    
    def is_valid(self) -> bool:
        """Check if data is valid"""
        return (
            self.temperature > 5.0 and
            self.hashrate > 0 and
            self.power > 0
        )


class BitaxeDevice:
    """Interface for a single Bitaxe device"""
    
    # Chip to model mapping
    CHIP_MODEL_MAP = {
        "BM1370": "gamma",
        "BM1368": "supra",
        "BM1366": "ultra",  # Could also be Hex (check chip count) or Supra
        "BM1397": "max",
    }
    
    def __init__(self, name: str, ip_address: str, model: str = "Unknown"):
        self.name = name
        self.ip_address = ip_address
        self.base_url = f"http://{ip_address}"
        self.model = model
        self._default_voltage: Optional[int] = None
        self._default_frequency: Optional[int] = None
        self._initial_shares_accepted = 0
        self._initial_shares_rejected = 0
    
    @classmethod
    async def detect_device_info(cls, ip_address: str) -> Optional[Dict[str, Any]]:
        """Auto-detect device info from API"""
        try:
            async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
                async with session.get(f"http://{ip_address}/api/system/info") as resp:
                    if resp.status != 200:
                        return None
                    
                    data = await resp.json()
                    
                    # Extract model from ASIC type
                    asic_model = data.get('ASICModel', data.get('asicModel', ''))
                    chip_count = data.get('asicCount', 1)
                    hostname = data.get('hostname', '')
                    board_version = data.get('boardVersion', data.get('board_version', ''))
                    
                    # Determine model
                    model = cls.CHIP_MODEL_MAP.get(asic_model, 'unknown')
                    
                    # Special cases for multi-chip variants
                    if asic_model == "BM1366" and chip_count >= 6:
                        # BM1366 with 6 chips = Hex
                        model = "hex"
                    elif asic_model == "BM1370":
                        # NerdQAxe variants are distinguished by chip count
                        if chip_count >= 4:
                            model = "nerdqaxe_plus_plus"  # NerdQAxe++ (4 chips)
                        elif chip_count >= 2:
                            model = "nerdqaxe_plus"  # NerdQAxe+ (2 chips)
                        elif chip_count == 1:
                            # Single BM1370 - could be Gamma or NerdQAxe
                            # Check hostname or board version to distinguish
                            if 'nerd' in hostname.lower() or 'nerdq' in board_version.lower():
                                model = "nerdqaxe"  # NerdQAxe (1 chip)
                            else:
                                model = "gamma"  # Bitaxe Gamma (1 chip)
                    
                    # Try to get a sensible name
                    suggested_name = hostname if hostname else f"Bitaxe-{ip_address.split('.')[-1]}"
                    
                    return {
                        'ip': ip_address,
                        'suggested_name': suggested_name,
                        'model': model,
                        'asic_model': asic_model,
                        'chip_count': chip_count,
                        'board_version': board_version,
                        'hostname': hostname,
                        'hashrate': float(data.get('hashRate', 0)),
                        'temp': float(data.get('temp', 0)),
                        'voltage': int(data.get('coreVoltage', 0)),
                        'frequency': int(data.get('frequency', 0)),
                        'fan_speed': int(data.get('fanspeed', data.get('fanSpeed', 0))),
                        'fan_rpm': int(data.get('fanrpm', data.get('fanRpm', 0))),
                    }
        except Exception as e:
            logger.error(f"Error detecting device at {ip_address}: {e}")
            return None
    
    async def set_fan_mode(self, auto_fan: bool, target_temp: Optional[float] = None) -> bool:
        """Set fan mode - auto with target temp or manual"""
        try:
            payload = {}
            if auto_fan and target_temp:
                payload = {
                    "autofanspeed": 1,
                    "fanspeed": 100,  # Max as fallback
                    "targettemp": int(target_temp)  # Target temperature for auto mode
                }
            else:
                payload = {
                    "autofanspeed": 0 if not auto_fan else 1
                }
            
            logger.info(f"{self.name}: Setting fan mode: auto={auto_fan}, target={target_temp}")
            
            async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
                async with session.patch(
                    f"{self.base_url}/api/system",
                    json=payload
                ) as resp:
                    if resp.status != 200:
                        logger.error(f"{self.name}: Failed to set fan mode: {resp.status}")
                        return False
                    return True
                    
        except Exception as e:
            logger.error(f"{self.name}: Error setting fan mode: {e}")
            return False
    
    async def get_system_info(self) -> Optional[SystemInfo]:
        """Fetch current system information"""
        try:
            async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
                async with session.get(f"{self.base_url}/api/system/info") as resp:
                    if resp.status != 200:
                        logger.error(f"{self.name}: Failed to get system info: {resp.status}")
                        return None
                    
                    data = await resp.json()
                    
                    return SystemInfo(
                        hashrate=float(data.get('hashRate', 0)),
                        temperature=float(data.get('temp', 0)),
                        vr_temp=float(data.get('vrTemp', 0)) if 'vrTemp' in data else None,
                        power=float(data.get('power', 0)),
                        voltage=int(data.get('coreVoltage', 0)),
                        frequency=int(data.get('frequency', 0)),
                        input_voltage=float(data.get('voltage', 0)),
                        shares_accepted=int(data.get('sharesAccepted', 0)),
                        shares_rejected=int(data.get('sharesRejected', 0)),
                        best_diff=data.get('bestDiff', '0'),
                        uptime=int(data.get('uptimeSeconds', 0)),
                        timestamp=time.time(),
                        fan_speed=float(data.get('fanspeed', 0)),
                        error_percentage=float(data.get('errorPercentage', 0)),
                        expected_hashrate=float(data.get('expectedHashrate', 0))
                    )
        except asyncio.TimeoutError:
            logger.error(f"{self.name}: Timeout getting system info")
            return None
        except aiohttp.ClientError as e:
            logger.error(f"{self.name}: Connection error getting system info: {e}")
            return None
        except Exception as e:
            logger.error(f"{self.name}: Error getting system info: {e}")
            return None
    
    async def set_voltage_frequency(self, voltage: int, frequency: int) -> bool:
        """Set voltage and frequency"""
        try:
            payload = {
                "coreVoltage": voltage,
                "frequency": frequency
            }
            
            logger.info(f"{self.name}: Setting voltage={voltage}mV, frequency={frequency}MHz")
            
            async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
                async with session.patch(
                    f"{self.base_url}/api/system",
                    json=payload
                ) as resp:
                    if resp.status != 200:
                        logger.error(f"{self.name}: Failed to set voltage/frequency: {resp.status}")
                        return False
                    
                    logger.info(f"{self.name}: Successfully set voltage={voltage}mV, frequency={frequency}MHz")
                    return True
                
        except asyncio.TimeoutError:
            logger.error(f"{self.name}: Timeout setting voltage/frequency")
            return False
        except aiohttp.ClientError as e:
            logger.error(f"{self.name}: Connection error setting voltage/frequency: {e}")
            return False
        except Exception as e:
            logger.error(f"{self.name}: Error setting voltage/frequency: {e}")
            return False
    
    async def restart(self) -> bool:
        """Restart the device"""
        try:
            async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
                async with session.post(f"{self.base_url}/api/system/restart") as resp:
                    if resp.status != 200:
                        logger.error(f"{self.name}: Failed to restart: {resp.status}")
                        return False
                    
                    logger.info(f"{self.name}: Restart initiated")
            
            # Wait for device to come back online
            await asyncio.sleep(30)
            return await self.wait_for_online()
                
        except asyncio.TimeoutError:
            logger.error(f"{self.name}: Timeout restarting")
            return False
        except aiohttp.ClientError as e:
            logger.error(f"{self.name}: Connection error restarting: {e}")
            return False
        except Exception as e:
            logger.error(f"{self.name}: Error restarting: {e}")
            return False
    
    async def wait_for_online(self, timeout: int = 60) -> bool:
        """Wait for device to come online"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            info = await self.get_system_info()
            if info and info.is_valid():
                logger.info(f"{self.name}: Device online")
                return True
            await asyncio.sleep(5)
        
        logger.error(f"{self.name}: Timeout waiting for device to come online")
        return False
    
    async def save_defaults(self) -> bool:
        """Save current settings as defaults"""
        try:
            info = await self.get_system_info()
            if info:
                self._default_voltage = info.voltage
                self._default_frequency = info.frequency
                logger.info(f"{self.name}: Saved defaults: {info.voltage}mV @ {info.frequency}MHz")
                return True
            return False
        except Exception as e:
            logger.error(f"{self.name}: Error saving defaults: {e}")
            return False
    
    async def restore_defaults(self) -> bool:
        """Restore default settings"""
        if self._default_voltage and self._default_frequency:
            return await self.set_voltage_frequency(
                self._default_voltage,
                self._default_frequency
            )
        logger.warning(f"{self.name}: No defaults saved")
        return False
    
    async def reset_share_counters(self):
        """Reset share counter baseline"""
        info = await self.get_system_info()
        if info:
            self._initial_shares_accepted = info.shares_accepted
            self._initial_shares_rejected = info.shares_rejected
    
    def get_reject_rate(self, info: SystemInfo) -> float:
        """Calculate reject rate since baseline"""
        accepted = info.shares_accepted - self._initial_shares_accepted
        rejected = info.shares_rejected - self._initial_shares_rejected
        total = accepted + rejected
        
        if total == 0:
            return 0.0
        
        return (rejected / total) * 100.0


class DeviceManager:
    """Manage multiple Bitaxe devices"""
    
    def __init__(self):
        self.devices: Dict[str, BitaxeDevice] = {}
        
    def add_device(self, name: str, ip_address: str, model: str = "Unknown"):
        """Add a device to the manager"""
        device = BitaxeDevice(name, ip_address, model)
        self.devices[name] = device
        logger.info(f"Added device: {name} ({ip_address})")
    
    def remove_device(self, name: str):
        """Remove a device from the manager"""
        if name in self.devices:
            del self.devices[name]
            logger.info(f"Removed device: {name}")
    
    def get_device(self, name: str) -> Optional[BitaxeDevice]:
        """Get a device by name"""
        return self.devices.get(name)
    
    def list_devices(self) -> List[str]:
        """List all device names"""
        return list(self.devices.keys())
    
    async def initialize_all(self) -> Dict[str, bool]:
        """Initialize all devices - check online status and save defaults"""
        results = {}
        for name, device in self.devices.items():
            online = await device.wait_for_online(timeout=30)
            if online:
                await device.save_defaults()
            results[name] = online
        return results
    
    async def cleanup_all(self):
        """Cleanup - nothing to do with fresh sessions per request"""
        logger.info("Cleanup complete (no persistent sessions)")
    
    async def get_all_system_info(self) -> Dict[str, Optional[SystemInfo]]:
        """Get system info from all devices"""
        results = {}
        tasks = []
        names = []
        
        for name, device in self.devices.items():
            tasks.append(device.get_system_info())
            names.append(name)
        
        infos = await asyncio.gather(*tasks, return_exceptions=True)
        
        for name, info in zip(names, infos):
            if isinstance(info, Exception):
                logger.error(f"{name}: Error getting info: {info}")
                results[name] = None
            else:
                results[name] = info
        
        return results
    
    async def set_all_voltage_frequency(
        self,
        voltage: int,
        frequency: int
    ) -> Dict[str, bool]:
        """Set voltage/frequency on all devices"""
        results = {}
        tasks = []
        names = []
        
        for name, device in self.devices.items():
            tasks.append(device.set_voltage_frequency(voltage, frequency))
            names.append(name)
        
        success_list = await asyncio.gather(*tasks, return_exceptions=True)
        
        for name, success in zip(names, success_list):
            if isinstance(success, Exception):
                logger.error(f"{name}: Error setting voltage/frequency: {success}")
                results[name] = False
            else:
                results[name] = success
        
        return results
    
    async def restart_all(self) -> Dict[str, bool]:
        """Restart all devices"""
        results = {}
        for name, device in self.devices.items():
            results[name] = await device.restart()
        return results
    
    async def restore_all_defaults(self) -> Dict[str, bool]:
        """Restore defaults on all devices"""
        results = {}
        for name, device in self.devices.items():
            results[name] = await device.restore_defaults()
        return results

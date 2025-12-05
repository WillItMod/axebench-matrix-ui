"""
Configuration management and data models for Bitaxe Benchmark Pro
"""
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
from pathlib import Path
from enum import Enum


class SearchStrategy(Enum):
    """Benchmark search strategies"""
    LINEAR = "linear"
    BINARY = "binary"
    ADAPTIVE_GRID = "adaptive_grid"
    ADAPTIVE_PROGRESSION = "adaptive_progression"
    ML_PREDICTED = "ml_predicted"


class OptimizationGoal(Enum):
    """Optimization objectives"""
    # Primary unified tuning personalities
    MAX_HASHRATE = "max_hashrate"
    EFFICIENT = "efficient"
    BALANCED = "balanced"
    QUIET = "quiet"
    # Backward-compatible aliases (legacy presets / saved configs)
    MAX_EFFICIENCY = "max_efficiency"
    STABLE = "stable"


@dataclass
class SafetyLimits:
    """Safety thresholds for operation"""
    max_chip_temp: float = 70.0  # Allow higher for benchmarking, throttle before damage
    max_vr_temp: float = 85.0   # Allow higher for benchmarking
    max_voltage: int = 1400
    min_voltage: int = 1000
    max_frequency: int = 1200
    min_frequency: int = 400
    max_power: float = 40.0
    min_input_voltage: int = 4800
    max_input_voltage: int = 5500
    temp_margin: float = 3.0  # NOT USED - kept for backward compatibility (predictive throttling is now intelligent)
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class BenchmarkConfig:
    """Configuration for benchmark runs"""
    # Search strategy
    strategy: SearchStrategy = SearchStrategy.ADAPTIVE_GRID
    optimization_goal: OptimizationGoal = OptimizationGoal.BALANCED
    
    # Test parameters
    benchmark_duration: int = 600  # seconds (10 minutes)
    sample_interval: int = 15  # seconds
    warmup_time: int = 10  # seconds - reduced from 90s (Bitaxe stabilizes quickly)
    cooldown_time: int = 5  # seconds
    min_samples: int = 7
    restart_between_tests: bool = False  # Bitaxe applies changes without reboot
    cycles_per_test: int = 1  # Number of cycles to run at each setting for consistency
    
    # Search parameters
    voltage_start: int = 1150
    voltage_stop: int = 1350
    voltage_step: int = 20
    frequency_start: int = 500
    frequency_stop: int = 800
    frequency_step: int = 25
    
    # Auto mode - adaptive step sizing
    auto_mode: bool = True  # Enable intelligent step adjustment (default ON)
    
    # Adaptive parameters
    coarse_step_multiplier: int = 2  # First pass uses 2x step size
    refinement_range: int = 2  # Refine ±2 steps around best
    
    # Stability validation
    stability_test_duration: int = 1800  # 30 minutes for winner
    reject_rate_threshold: float = 2.0  # percent
    target_error: float = 0.20  # ASIC error rate threshold for stability
    hashrate_variance_threshold: float = 5.0  # percent
    
    # Thermal management
    thermal_predict_window: int = 5  # samples to predict thermal trend
    thermal_throttle_buffer: float = 2.0  # degrees below limit
    adaptive_duration: bool = True  # Shorten tests if thermal stable
    
    # Resume capability
    enable_checkpoints: bool = True
    checkpoint_interval: int = 1  # Save after each test
    
    # Multi-device
    parallel_devices: bool = False
    
    # Data analysis
    enable_plotting: bool = True
    export_csv: bool = True
    calculate_confidence: bool = True
    
    def to_dict(self) -> Dict[str, Any]:
        result = asdict(self)
        result['strategy'] = self.strategy.value
        result['optimization_goal'] = self.optimization_goal.value
        return result
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'BenchmarkConfig':
        if 'strategy' in data and isinstance(data['strategy'], str):
            data['strategy'] = SearchStrategy(data['strategy'])
        if 'optimization_goal' in data and isinstance(data['optimization_goal'], str):
            data['optimization_goal'] = OptimizationGoal(data['optimization_goal'])
        return cls(**data)
    
    def save(self, filepath: Path):
        """Save configuration to file"""
        with open(filepath, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)
    
    @classmethod
    def load(cls, filepath: Path) -> 'BenchmarkConfig':
        """Load configuration from file"""
        with open(filepath, 'r') as f:
            data = json.load(f)
        return cls.from_dict(data)


@dataclass
class DeviceConfig:
    """Configuration for a single Bitaxe device"""
    name: str
    ip_address: str
    model: str = "Unknown"  # Supra, Ultra, Hex, Gamma, etc.
    pool_url: Optional[str] = None
    pool_user: Optional[str] = None
    enabled: bool = True
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TestResult:
    """Result from a single benchmark test"""
    timestamp: str
    device_name: str
    voltage: int
    frequency: int
    avg_hashrate: float
    hashrate_variance: float
    avg_temp: float
    max_temp: float
    avg_vr_temp: Optional[float]
    max_vr_temp: Optional[float]
    avg_power: float
    max_power: float
    efficiency: float  # J/TH
    avg_input_voltage: float
    samples_collected: int
    test_duration: int
    rejected_samples: int
    stability_score: float  # 0-100
    error_percentage: float = 0.0  # ASIC error rate
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TestResult':
        return cls(**data)


@dataclass
class BenchmarkSession:
    """Complete benchmark session data"""
    session_id: str
    start_time: str
    end_time: Optional[str]
    device_configs: List[Dict[str, Any]]
    benchmark_config: Dict[str, Any]
    safety_limits: Dict[str, Any]
    results: List[Dict[str, Any]]
    best_hashrate: Optional[Dict[str, Any]]
    best_efficiency: Optional[Dict[str, Any]]
    best_balanced: Optional[Dict[str, Any]]
    status: str  # running, completed, interrupted
    mode: str = "benchmark"  # benchmark, auto_tune, etc.
    tune_type: Optional[str] = None
    auto_mode: Optional[bool] = None  # true for auto_tune runs
    logs: List[Dict[str, Any]] = None  # Event logs from benchmark
    stop_reason: Optional[str] = None  # Why benchmark stopped
    
    def __post_init__(self):
        if self.logs is None:
            self.logs = []
    
    def add_log(self, time: str, message: str, log_type: str = 'info'):
        """Add a log entry"""
        if self.logs is None:
            self.logs = []
        self.logs.append({
            'time': time,
            'message': message,
            'type': log_type
        })
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    def save(self, filepath: Path):
        """Save session to file"""
        with open(filepath, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)
    
    @classmethod
    def load(cls, filepath: Path) -> 'BenchmarkSession':
        """Load session from file"""
        with open(filepath, 'r') as f:
            data = json.load(f)
        return cls(**data)


# Preset configurations for different scenarios
PRESETS = {
    "quick_test": BenchmarkConfig(
        strategy=SearchStrategy.ADAPTIVE_GRID,
        benchmark_duration=300,  # 5 minutes
        warmup_time=10,  # Fast warmup
        coarse_step_multiplier=3,
        refinement_range=1,
        stability_test_duration=600,  # 10 minutes
        restart_between_tests=False,  # Fast mode
        cycles_per_test=1,  # Speed over accuracy
    ),
    "conservative": BenchmarkConfig(
        strategy=SearchStrategy.LINEAR,
        voltage_start=1150,
        voltage_stop=1250,
        voltage_step=25,
        frequency_start=500,
        frequency_stop=650,
        frequency_step=25,
        benchmark_duration=900,  # 15 minutes
        warmup_time=10,
        stability_test_duration=3600,  # 1 hour
        restart_between_tests=False,
        cycles_per_test=2,  # Good confidence
    ),
    "aggressive": BenchmarkConfig(
        strategy=SearchStrategy.BINARY,
        voltage_start=1200,
        voltage_stop=1400,
        voltage_step=20,
        frequency_start=600,
        frequency_stop=900,
        frequency_step=20,
        benchmark_duration=600,
        warmup_time=10,
        stability_test_duration=1800,
        restart_between_tests=False,
        cycles_per_test=2,
    ),
    "efficiency": BenchmarkConfig(
        strategy=SearchStrategy.ADAPTIVE_GRID,
        optimization_goal=OptimizationGoal.MAX_EFFICIENCY,
        voltage_start=1100,
        voltage_stop=1250,
        voltage_step=15,
        benchmark_duration=900,
        warmup_time=10,
        restart_between_tests=False,
        cycles_per_test=2,
    ),
    "max_performance": BenchmarkConfig(
        strategy=SearchStrategy.ADAPTIVE_GRID,
        optimization_goal=OptimizationGoal.MAX_HASHRATE,
        voltage_start=1250,
        voltage_stop=1400,
        voltage_step=15,
        benchmark_duration=600,
        warmup_time=10,
        restart_between_tests=False,
        cycles_per_test=2,
    ),
    "paranoid": BenchmarkConfig(
        strategy=SearchStrategy.LINEAR,
        voltage_start=1150,
        voltage_stop=1300,
        voltage_step=25,
        frequency_start=500,
        frequency_stop=650,
        frequency_step=25,
        benchmark_duration=1200,  # 20 minutes
        stability_test_duration=3600,
        restart_between_tests=True,  # Full restart for maximum stability validation
        warmup_time=60,  # Longer warmup only when restarting
        cycles_per_test=3,  # Full statistical confidence
    ),
}


# ============================================================================
# HARDWARE PRESETS - Set limits based on hardware capability
# These define the BOUNDARIES for tuning - never exceeded
# ============================================================================

class HardwarePreset:
    """Hardware preset that sets tuning boundaries based on PSU/cooling capability"""
    
    def __init__(
        self,
        name: str,
        description: str,
        # Multipliers applied to model's stock/safe/max values
        voltage_range: str = "stock",  # "stock", "safe", "max"
        frequency_range: str = "stock",  # "stock", "safe", "max"
        temp_range: str = "stock",  # "stock", "max"
        power_headroom: float = 1.0,  # multiplier on PSU limit
        psu_upgraded: bool = False,
        psu_watts: int = 25,  # PSU capacity
        # Tuning parameters
        voltage_step: int = 25,
        frequency_step: int = 25,
        test_duration: int = 120,
    ):
        self.name = name
        self.description = description
        self.voltage_range = voltage_range
        self.frequency_range = frequency_range
        self.temp_range = temp_range
        self.power_headroom = power_headroom
        self.psu_upgraded = psu_upgraded
        self.psu_watts = psu_watts
        self.voltage_step = voltage_step
        self.frequency_step = frequency_step
        self.test_duration = test_duration
    
    def get_limits_for_model(self, model_config: Dict[str, Any]) -> Dict[str, Any]:
        """Get actual limits for a specific device model"""
        
        # Voltage limits
        if self.voltage_range == "stock":
            v_start = model_config.get('min_voltage', 1100)
            v_stop = model_config.get('stock_voltage', 1200)
        elif self.voltage_range == "safe":
            v_start = model_config.get('min_voltage', 1100)
            v_stop = model_config.get('safe_max_voltage', model_config.get('stock_voltage', 1200) + 50)
        else:  # max
            v_start = model_config.get('min_voltage', 1100)
            v_stop = model_config.get('max_voltage', 1350)
        
        # Frequency limits
        if self.frequency_range == "stock":
            f_start = model_config.get('min_frequency', 400)
            f_stop = model_config.get('stock_frequency', 500)
        elif self.frequency_range == "safe":
            f_start = model_config.get('min_frequency', 400)
            f_stop = model_config.get('safe_max_frequency', model_config.get('stock_frequency', 500) + 75)
        else:  # max
            f_start = model_config.get('min_frequency', 400)
            f_stop = model_config.get('max_frequency', 750)
        
        # Temperature limits
        if self.temp_range == "stock":
            max_chip_temp = model_config.get('stock_max_chip_temp', 65.0)
            max_vr_temp = model_config.get('stock_max_vr_temp', 80.0)
        else:  # max
            max_chip_temp = model_config.get('max_chip_temp', 70.0)
            max_vr_temp = model_config.get('max_vr_temp', 85.0)
        
        # Power limits - based on PSU
        if self.psu_upgraded:
            max_power = min(self.psu_watts - 3, model_config.get('max_power', 30.0))
        else:
            max_power = model_config.get('safe_power_stock_psu', 20.0) * self.power_headroom
        
        return {
            'voltage_start': v_start,
            'voltage_stop': v_stop,
            'voltage_step': self.voltage_step,
            'frequency_start': f_start,
            'frequency_stop': f_stop,
            'frequency_step': self.frequency_step,
            'max_chip_temp': max_chip_temp,
            'max_vr_temp': max_vr_temp,
            'max_power': max_power,
            'psu_upgraded': self.psu_upgraded,
            'psu_watts': self.psu_watts,
            'test_duration': self.test_duration,
        }


HARDWARE_PRESETS = {
    "stock": HardwarePreset(
        name="Stock",
        description="Within manufacturer specifications. Safe for all hardware.",
        voltage_range="stock",
        frequency_range="stock",
        temp_range="stock",
        power_headroom=0.9,  # 90% of stock PSU limit
        psu_upgraded=False,
        psu_watts=25,
        voltage_step=25,
        frequency_step=25,
        test_duration=120,
    ),
    "quick": HardwarePreset(
        name="Quick Tune",
        description="Fast tuning with larger steps. Good for initial exploration.",
        voltage_range="safe",
        frequency_range="safe",
        temp_range="stock",
        power_headroom=0.95,
        psu_upgraded=False,
        psu_watts=25,
        voltage_step=50,  # Larger steps = faster
        frequency_step=50,
        test_duration=90,
    ),
    "upgraded_psu": HardwarePreset(
        name="Upgraded PSU",
        description="For 30W+ PSU. Allows higher power draw.",
        voltage_range="safe",
        frequency_range="safe",
        temp_range="stock",
        power_headroom=1.0,
        psu_upgraded=True,
        psu_watts=30,
        voltage_step=25,
        frequency_step=25,
        test_duration=120,
    ),
    "psu_cooling": HardwarePreset(
        name="PSU + Cooling",
        description="Upgraded PSU and improved cooling. Higher temps OK.",
        voltage_range="max",
        frequency_range="safe",
        temp_range="max",
        power_headroom=1.0,
        psu_upgraded=True,
        psu_watts=35,
        voltage_step=20,
        frequency_step=25,
        test_duration=180,
    ),
    "beast": HardwarePreset(
        name="Beast Mode",
        description="Maximum limits. Requires external PSU and excellent cooling.",
        voltage_range="max",
        frequency_range="max",
        temp_range="max",
        power_headroom=1.0,
        psu_upgraded=True,
        psu_watts=45,
        voltage_step=15,
        frequency_step=20,
        test_duration=240,
    ),
}


# ============================================================================
# OPTIMIZATION TARGETS - What we're optimizing FOR
# ============================================================================

class OptimizationTarget:
    """Defines what the tuning is optimizing for"""
    
    def __init__(
        self,
        name: str,
        description: str,
        error_threshold: float = 0.20,  # Max acceptable ASIC error %
        hashrate_tolerance: float = 0.94,  # Min hashrate vs expected
        fan_target: Optional[int] = None,  # For quiet mode
        prioritize: str = "balanced",  # "hashrate", "efficiency", "quiet", "balanced"
    ):
        self.name = name
        self.description = description
        self.error_threshold = error_threshold
        self.hashrate_tolerance = hashrate_tolerance
        self.fan_target = fan_target
        self.prioritize = prioritize


OPTIMIZATION_TARGETS = {
    "efficient": OptimizationTarget(
        name="Most Efficient",
        description="Lowest J/TH - best for long-term mining profitability",
        error_threshold=0.15,  # Stricter error tolerance
        hashrate_tolerance=0.96,  # Higher hashrate expectation
        prioritize="efficiency",
    ),
"eco": OptimizationTarget(
    name="Eco",
    description="Sweet-spot power with strong efficiency and usable hashrate",
    error_threshold=0.18,
    hashrate_tolerance=0.95,
    prioritize="eco",
),

    "balanced": OptimizationTarget(
        name="Balanced",
        description="Good hashrate with reasonable efficiency",
        error_threshold=0.20,
        hashrate_tolerance=0.94,
        prioritize="balanced",
    ),
    "max_hashrate": OptimizationTarget(
        name="Maximum Hashrate",
        description="Highest GH/s - push to the limits",
        error_threshold=0.20,
        hashrate_tolerance=0.92,  # More tolerant of hashrate variance
        prioritize="hashrate",
    ),
    "quiet": OptimizationTarget(
        name="Quiet",
        description="Keep fan speed low - prioritize silence",
        error_threshold=0.15,
        hashrate_tolerance=0.94,
        fan_target=65,  # Max fan %
        prioritize="quiet",
    ),
}

def resolve_optimization_mode(goal: str):
    """Resolve a UI goal string into (OptimizationGoal, optimization_target_key, default_error_threshold, default_fan_target).

    This helper accepts both the new canonical names ("max_hashrate", "efficient", "balanced", "quiet")
    and legacy labels used by older UIs or saved presets ("balanced", "max_efficiency", "normal", "nuclear", etc.).
    """
    if not goal:
        target_key = "balanced"
    else:
        g = str(goal).strip().lower()

        # Map various UI / legacy labels to canonical optimization_target keys
        alias_map = {
            # Max hashrate / performance modes
            "max": "max_hashrate",
            "max_hashrate": "max_hashrate",
            "hashrate": "max_hashrate",
            "performance": "max_hashrate",
            "nuclear": "max_hashrate",
            "nuke": "max_hashrate",
            "turbo": "max_hashrate",
            # Efficiency-focused modes
            "max_efficiency": "efficient",
            "efficiency": "efficient",
            "efficient": "efficient",
            # Eco / sweet-spot
            "eco": "eco",
            "sweetspot": "eco",
            # Balanced / normal / default
            "balanced": "balanced",
            "normal": "balanced",
            "default": "balanced",
            # Quiet / silent
            "quiet": "quiet",
            "silent": "quiet",
            "low_noise": "quiet",
        }

        target_key = alias_map.get(g, g)

    # Fallback if we don't have a matching optimization target
    if target_key not in OPTIMIZATION_TARGETS:
        target_key = "balanced"

    # Map optimization_target key to OptimizationGoal enum
    if target_key == "max_hashrate":
        enum_goal = OptimizationGoal.MAX_HASHRATE
    elif target_key == "efficient":
        # Prefer the unified EFFICIENT enum if available
        enum_goal = getattr(OptimizationGoal, "EFFICIENT", OptimizationGoal.MAX_EFFICIENCY)
    elif target_key == "eco":
        # Legacy alias - treat like balanced
        enum_goal = OptimizationGoal.BALANCED
    elif target_key == "quiet":
        enum_goal = getattr(OptimizationGoal, "QUIET", OptimizationGoal.BALANCED)
    elif target_key == "balanced":
        enum_goal = OptimizationGoal.BALANCED
    else:
        # Unknown key - be conservative
        enum_goal = OptimizationGoal.BALANCED

    opt = OPTIMIZATION_TARGETS[target_key]
    return enum_goal, target_key, opt.error_threshold, opt.fan_target




# Model-specific configurations with safety limits
MODEL_CONFIGS = {
    "supra": {
        "name": "Bitaxe Supra (BM1368)",
        "chip": "BM1368",
        "chip_count": 1,
        # Frequency
        "max_frequency": 625,
        "min_frequency": 450,
        "stock_frequency": 500,
        "safe_max_frequency": 575,  # Conservative safe limit
        # Voltage
        "min_voltage": 950,
        "max_voltage": 1175,
        "stock_voltage": 1000,
        "safe_max_voltage": 1150,  # Conservative safe limit
        "recommended_voltage_range": (950, 1175),
        # Temperature limits
        "max_chip_temp": 70.0,
        "max_vr_temp": 85.0,
        "stock_max_chip_temp": 65.0,
        "stock_max_vr_temp": 80.0,
        # Power - Based on BitaxeGamma GitHub: stock PSU needs >20W capacity
        "typical_power": 15.0,
        "stock_power": 13.0,
        "stock_psu_watts": 25,      # Stock PSU capacity
        "safe_power_stock_psu": 22, # Safe max on stock PSU
        "max_power": 35.0,          # Requires upgraded 30W+ PSU
        # Performance
        "typical_hashrate": 700,
        "stock_hashrate": 600,
    },
    "ultra": {
        "name": "Bitaxe Ultra (BM1366)",
        "chip": "BM1366",
        "chip_count": 1,
        # Frequency
        "max_frequency": 720,
        "min_frequency": 350,
        "stock_frequency": 425,
        "safe_max_frequency": 650,
        # Voltage
        "min_voltage": 1100,
        "max_voltage": 1300,
        "stock_voltage": 1200,
        "safe_max_voltage": 1275,
        "recommended_voltage_range": (1100, 1300),
        # Temperature limits
        "max_chip_temp": 68.0,
        "max_vr_temp": 83.0,
        "stock_max_chip_temp": 63.0,
        "stock_max_vr_temp": 78.0,
        # Power
        "typical_power": 14.0,
        "stock_power": 11.0,
        "stock_psu_watts": 25,
        "safe_power_stock_psu": 18,
        "max_power": 30.0,
        # Performance
        "typical_hashrate": 500,
        "stock_hashrate": 400,
    },
    "hex": {
        "name": "Bitaxe Hex (BM1366 x6)",
        "chip": "BM1366",
        "chip_count": 6,
        # Frequency
        "max_frequency": 575,
        "min_frequency": 400,
        "stock_frequency": 490,
        "safe_max_frequency": 550,
        # Voltage
        "min_voltage": 1100,
        "max_voltage": 1300,
        "stock_voltage": 1166,
        "safe_max_voltage": 1275,
        "recommended_voltage_range": (1100, 1300),
        # Temperature limits
        "max_chip_temp": 70.0,
        "max_vr_temp": 85.0,
        "stock_max_chip_temp": 65.0,
        "stock_max_vr_temp": 80.0,
        # Power - Hex uses 12V, higher wattage
        "typical_power": 80.0,
        "stock_power": 70.0,
        "stock_psu_watts": 120,     # 12V 10A PSU
        "safe_power_stock_psu": 100,
        "max_power": 120.0,
        # Performance
        "typical_hashrate": 4200,
        "stock_hashrate": 3600,
    },
    "gamma": {
        "name": "Bitaxe Gamma (BM1370)",
        "chip": "BM1370",
        "chip_count": 1,
        # Frequency
        "max_frequency": 750,
        "min_frequency": 400,
        "stock_frequency": 525,
        "safe_max_frequency": 700,
        # Voltage
        "min_voltage": 1100,
        "max_voltage": 1250,
        "stock_voltage": 1150,
        "safe_max_voltage": 1225,
        "recommended_voltage_range": (1100, 1250),
        # Temperature limits
        "max_chip_temp": 70.0,      # Allow up to 70°C for benchmarking
        "max_vr_temp": 85.0,        # Allow up to 85°C for benchmarking
        "stock_max_chip_temp": 65.0,  # Default UI limit for daily operation
        "stock_max_vr_temp": 80.0,    # Default UI limit for daily operation
        # Power - GitHub says: "PSU needs to supply in excess of 4A (20W)"
        "typical_power": 18.0,
        "stock_power": 15.0,
        "stock_psu_watts": 25,      # Stock PSU typically 25W
        "safe_power_stock_psu": 20, # Safe max on stock PSU (GitHub: >20W needed)
        "max_power": 45.0,          # Aggressive OC needs 35-45W PSU
        # Performance
        "typical_hashrate": 1200,
        "stock_hashrate": 1100,
    },
    "max": {
        "name": "Bitaxe Max (BM1397)",
        "chip": "BM1397",
        "chip_count": 1,
        # Frequency
        "max_frequency": 900,
        "min_frequency": 300,
        "stock_frequency": 450,
        "safe_max_frequency": 800,
        # Voltage
        "min_voltage": 1100,
        "max_voltage": 1400,
        "stock_voltage": 1200,
        "safe_max_voltage": 1350,
        "recommended_voltage_range": (1100, 1400),
        # Temperature limits
        "max_chip_temp": 75.0,
        "max_vr_temp": 88.0,
        "stock_max_chip_temp": 68.0,
        "stock_max_vr_temp": 80.0,
        # Power
        "typical_power": 10.0,
        "stock_power": 8.5,
        "stock_psu_watts": 25,
        "safe_power_stock_psu": 15,
        "max_power": 25.0,
        # Performance
        "typical_hashrate": 350,
        "stock_hashrate": 300,
    },
    # NerdQAxe devices - AxeOS firmware variant (BitAxe-compatible)
    "nerdqaxe": {
        "name": "NerdQAxe (BM1370 x1)",
        "chip": "BM1370",
        "chip_count": 1,
        # Frequency
        "max_frequency": 750,
        "min_frequency": 350,
        "stock_frequency": 525,
        "safe_max_frequency": 650,
        # Voltage
        "min_voltage": 1050,
        "max_voltage": 1300,
        "stock_voltage": 1165,
        "safe_max_voltage": 1220,
        "recommended_voltage_range": (1100, 1260),
        # Temperature limits
        "max_chip_temp": 70.0,
        "max_vr_temp": 85.0,
        "stock_max_chip_temp": 65.0,
        "stock_max_vr_temp": 80.0,
        # Power - Similar to Gamma
        "typical_power": 18.0,
        "stock_power": 15.0,
        "stock_psu_watts": 25,
        "safe_power_stock_psu": 20,
        "max_power": 45.0,
        # Performance
        "typical_hashrate": 1400,
        "stock_hashrate": 1150,
    },
    "nerdqaxe_plus": {
        "name": "NerdQAxe+ (BM1370 x2)",
        "chip": "BM1370",
        "chip_count": 2,
        # Frequency - Conservative for dual chips
        "max_frequency": 700,
        "min_frequency": 400,
        "stock_frequency": 500,
        "safe_max_frequency": 650,
        # Voltage - Conservative for dual chips
        "min_voltage": 1100,
        "max_voltage": 1225,
        "stock_voltage": 1150,
        "safe_max_voltage": 1200,
        "recommended_voltage_range": (1100, 1225),
        # Temperature limits
        "max_chip_temp": 70.0,
        "max_vr_temp": 85.0,
        "stock_max_chip_temp": 65.0,
        "stock_max_vr_temp": 80.0,
        # Power - Dual chips require more power
        "typical_power": 35.0,
        "stock_power": 30.0,
        "stock_psu_watts": 60,
        "safe_power_stock_psu": 50,
        "max_power": 80.0,
        # Performance
        "typical_hashrate": 2400,
        "stock_hashrate": 2200,
    },
    "nerdqaxe_plus_plus": {
        "name": "NerdQAxe++ (BM1370 x4)",
        "chip": "BM1370",
        "chip_count": 4,
        # Frequency - Conservative for quad chips
        "max_frequency": 650,
        "min_frequency": 400,
        "stock_frequency": 475,
        "safe_max_frequency": 600,
        # Voltage - Conservative for quad chips
        "min_voltage": 1100,
        "max_voltage": 1200,
        "stock_voltage": 1150,
        "safe_max_voltage": 1180,
        "recommended_voltage_range": (1100, 1200),
        # Temperature limits
        "max_chip_temp": 70.0,
        "max_vr_temp": 85.0,
        "stock_max_chip_temp": 65.0,
        "stock_max_vr_temp": 80.0,
        # Power - Quad chips require significant power
        "typical_power": 70.0,
        "stock_power": 60.0,
        "stock_psu_watts": 120,
        "safe_power_stock_psu": 100,
        "max_power": 150.0,
        # Performance - ~4.8 TH/s according to specs
        "typical_hashrate": 4800,
        "stock_hashrate": 4320,
    },
}


def get_device_profile(device_model: str) -> Dict[str, Any]:
    """Get safe voltage/frequency ranges for device model"""
    model_key = device_model.lower() if device_model else "gamma"
    if model_key in MODEL_CONFIGS:
        return MODEL_CONFIGS[model_key]
    return {
        "max_frequency": 650,
        "min_frequency": 300,
        "recommended_voltage_range": (1150, 1300),
        "min_voltage": 1100,
        "max_voltage": 1350,
        "typical_hashrate": 500,
    }


# Device-specific benchmark presets
DEVICE_PRESETS = {
    "gamma": {
        "baseline": BenchmarkConfig(
            voltage_start=1100, voltage_stop=1150, voltage_step=25,
            frequency_start=475, frequency_stop=550, frequency_step=25,
            benchmark_duration=120, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
        "tuned": BenchmarkConfig(
            voltage_start=1100, voltage_stop=1200, voltage_step=25,
            frequency_start=500, frequency_stop=650, frequency_step=25,
            benchmark_duration=120, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
        "precision": BenchmarkConfig(
            voltage_start=1100, voltage_stop=1250, voltage_step=10,
            frequency_start=475, frequency_stop=750, frequency_step=10,
            benchmark_duration=300, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
    },
    "supra": {
        "baseline": BenchmarkConfig(
            voltage_start=1150, voltage_stop=1200, voltage_step=25,
            frequency_start=450, frequency_stop=525, frequency_step=25,
            benchmark_duration=120, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
        "tuned": BenchmarkConfig(
            voltage_start=1150, voltage_stop=1250, voltage_step=25,
            frequency_start=475, frequency_stop=600, frequency_step=25,
            benchmark_duration=120, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
        "precision": BenchmarkConfig(
            voltage_start=1100, voltage_stop=1300, voltage_step=10,
            frequency_start=450, frequency_stop=650, frequency_step=10,
            benchmark_duration=300, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
    },
    "ultra": {
        "baseline": BenchmarkConfig(
            voltage_start=1150, voltage_stop=1200, voltage_step=25,
            frequency_start=400, frequency_stop=500, frequency_step=25,
            benchmark_duration=120, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
        "tuned": BenchmarkConfig(
            voltage_start=1150, voltage_stop=1275, voltage_step=25,
            frequency_start=425, frequency_stop=575, frequency_step=25,
            benchmark_duration=120, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
        "precision": BenchmarkConfig(
            voltage_start=1100, voltage_stop=1300, voltage_step=10,
            frequency_start=400, frequency_stop=650, frequency_step=10,
            benchmark_duration=300, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
    },
    "hex": {
        "baseline": BenchmarkConfig(
            voltage_start=1150, voltage_stop=1200, voltage_step=25,
            frequency_start=400, frequency_stop=475, frequency_step=25,
            benchmark_duration=120, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
        "tuned": BenchmarkConfig(
            voltage_start=1150, voltage_stop=1250, voltage_step=25,
            frequency_start=425, frequency_stop=525, frequency_step=25,
            benchmark_duration=120, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
        "precision": BenchmarkConfig(
            voltage_start=1100, voltage_stop=1300, voltage_step=10,
            frequency_start=400, frequency_stop=575, frequency_step=10,
            benchmark_duration=300, warmup_time=10, cooldown_time=5,
            strategy=SearchStrategy.ADAPTIVE_PROGRESSION, cycles_per_test=1
        ),
    },
}

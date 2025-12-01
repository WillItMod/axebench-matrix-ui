"""
Search strategies for efficient benchmark parameter exploration.
Includes integration with AdaptiveProgression for smart tuning.
"""
from typing import List, Tuple, Set, Optional, Dict, Any
from abc import ABC, abstractmethod
import logging
from config import SearchStrategy, BenchmarkConfig, SafetyLimits

# Import the AdaptiveProgression strategy
try:
    from adaptive_progression import AdaptiveProgression
    ADAPTIVE_AVAILABLE = True
except ImportError:
    ADAPTIVE_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("AdaptiveProgression not available")

logger = logging.getLogger(__name__)


class SearchStrategyBase(ABC):
    """Base class for search strategies"""
    
    def __init__(self, config: BenchmarkConfig, safety: SafetyLimits):
        self.config = config
        self.safety = safety
        self.tested_combinations: Set[Tuple[int, int]] = set()
        self.results: List[Tuple[int, int, float, float]] = []  # voltage, freq, hashrate, efficiency
        self.unstable_points: Set[Tuple[int, int]] = set()
        self.max_stable_freq: Dict[int, int] = {}  # voltage -> max stable frequency
    
    @abstractmethod
    def get_next_combination(self) -> Optional[Tuple[int, int]]:
        """Get next voltage/frequency combination to test"""
        pass
    
    @abstractmethod
    def is_complete(self) -> bool:
        """Check if search is complete"""
        pass
    
    def add_result(self, voltage: int, frequency: int, hashrate: float, efficiency: float):
        """Add a test result"""
        self.tested_combinations.add((voltage, frequency))
        self.results.append((voltage, frequency, hashrate, efficiency))
        
        if voltage not in self.max_stable_freq or frequency > self.max_stable_freq[voltage]:
            self.max_stable_freq[voltage] = frequency
    
    def mark_unstable(self, voltage: int, frequency: int):
        """Mark a voltage/frequency combination as unstable"""
        self.unstable_points.add((voltage, frequency))
        self.tested_combinations.add((voltage, frequency))
        
        if voltage not in self.max_stable_freq:
            self.max_stable_freq[voltage] = frequency - self.config.frequency_step
        else:
            self.max_stable_freq[voltage] = min(
                self.max_stable_freq[voltage], 
                frequency - self.config.frequency_step
            )
        
        logger.info(f"Marked {voltage}mV @ {frequency}MHz as unstable")
    
    def should_skip(self, voltage: int, frequency: int) -> bool:
        """Check if a combination should be skipped"""
        if (voltage, frequency) in self.tested_combinations:
            return True
        
        if voltage in self.max_stable_freq:
            if frequency > self.max_stable_freq[voltage]:
                return True
        
        return False
    
    def get_best_result(self, metric: str = "hashrate") -> Optional[Tuple[int, int, float]]:
        """Get best result by metric"""
        if not self.results:
            return None
        
        if metric == "hashrate":
            best = max(self.results, key=lambda x: x[2])
            return (best[0], best[1], best[2])
        elif metric == "efficiency":
            best = min(self.results, key=lambda x: x[3])
            return (best[0], best[1], best[3])
        
        return None
    
    def estimate_total_tests(self) -> int:
        """Estimate total number of tests - override in subclass"""
        return 0


class AdaptiveProgressionWrapper(SearchStrategyBase):
    """
    Wrapper that integrates AdaptiveProgression with the benchmark engine.
    
    VOLTAGE-FIRST LOGIC:
    1. Start at base V/F
    2. If error < threshold → stable, push frequency higher
    3. If error >= threshold → bump voltage, retest same frequency
    4. If voltage maxed → back off frequency
    5. Track best stable result throughout
    6. HARD STOP on any limit hit - never exceed configured limits
    """
    
    def __init__(self, config: BenchmarkConfig, safety: SafetyLimits):
        super().__init__(config, safety)
        
        # Create the underlying AdaptiveProgression instance with limits
        self.adaptive = AdaptiveProgression(
            voltage_start=config.voltage_start,
            voltage_stop=min(config.voltage_stop, safety.max_voltage),
            voltage_step=config.voltage_step,
            frequency_start=config.frequency_start,
            frequency_stop=min(config.frequency_stop, safety.max_frequency),
            frequency_step=config.frequency_step,
            target_error=getattr(config, 'target_error', 0.25),
            # Pass optimization target
            optimization_target=getattr(config, 'optimization_target', 'balanced'),
            fan_target=getattr(config, 'fan_target', None),
            # Auto mode - adaptive step sizing
            auto_mode=getattr(config, 'auto_mode', True),
            # Pass hard limits
            max_chip_temp=safety.max_chip_temp,
            max_vr_temp=safety.max_vr_temp,
            max_power=safety.max_power,
        )
        
        logger.info(f"AdaptiveProgression: V={config.voltage_start}-{config.voltage_stop}mV, "
                   f"F={config.frequency_start}-{config.frequency_stop}MHz, "
                   f"limits: {safety.max_chip_temp}°C/{safety.max_power}W")
    
    def set_status_callback(self, callback):
        """Pass status callback to adaptive strategy for logging"""
        self.adaptive.set_status_callback(callback)
    
    def estimate_total_tests(self) -> int:
        """Estimate - adaptive is usually much fewer than grid"""
        v_steps = (self.adaptive.voltage_stop - self.adaptive.voltage_start) // self.adaptive.voltage_step + 1
        f_steps = (self.adaptive.frequency_stop - self.adaptive.frequency_start) // self.adaptive.frequency_step + 1
        # Adaptive typically tests about 30-50% of grid
        return max(5, (v_steps * f_steps) // 3)
    
    def get_next_combination(self) -> Optional[Tuple[int, int]]:
        """Get next combination from adaptive strategy"""
        return self.adaptive.get_next_combination()
    
    def is_complete(self) -> bool:
        """Check if adaptive tuning is complete"""
        return self.adaptive.completed
    
    def record_result(self, voltage: int, frequency: int, hashrate: float, 
                     error_pct: float, stable: bool,
                     efficiency: float = None, fan_speed: int = None,
                     chip_temp: float = None, vr_temp: float = None,
                     power: float = None):
        """
        Record result using AdaptiveProgression's method.
        Passes all data for limit checking and optimization decisions.
        """
        self.adaptive.record_result(
            voltage, frequency, hashrate, error_pct, stable,
            efficiency=efficiency, fan_speed=fan_speed,
            chip_temp=chip_temp, vr_temp=vr_temp, power=power
        )
        
        # Also track in base class
        eff = efficiency if efficiency else ((power / (hashrate / 1000)) if hashrate > 0 and power else 999)
        self.results.append((voltage, frequency, hashrate, eff))
        self.tested_combinations.add((voltage, frequency))
    
    @property
    def limit_hit(self):
        """Check if strategy hit a limit"""
        return self.adaptive.limit_hit
    
    @property
    def limit_type(self):
        """Get type of limit hit"""
        return self.adaptive.limit_type
    
    @property
    def stop_message(self):
        """Get stop message"""
        return self.adaptive.stop_message
    
    def record_limit_hit(self, limit_type: str, message: str, voltage: int, frequency: int):
        """Forward limit hit to adaptive strategy"""
        self.adaptive.record_limit_hit(limit_type, message, voltage, frequency)
    
    def get_completion_summary(self):
        """Get completion summary from adaptive strategy"""
        return self.adaptive.get_completion_summary()
    
    def add_result(self, voltage: int, frequency: int, hashrate: float, efficiency: float):
        """Legacy add_result - convert to record_result format"""
        # Assume stable if using legacy method
        self.record_result(voltage, frequency, hashrate, 0.1, True)
    
    def mark_unstable(self, voltage: int, frequency: int):
        """Mark unstable and notify adaptive strategy"""
        super().mark_unstable(voltage, frequency)
        # Record as unstable result
        self.adaptive.record_result(voltage, frequency, 0, 100.0, False)
    
    def get_best_result(self, metric: str = "hashrate") -> Optional[Tuple[int, int, float]]:
        """Get best result from adaptive strategy"""
        return self.adaptive.get_best_result()
    
    def get_status(self) -> dict:
        """Get current tuning status"""
        return self.adaptive.get_status()


class LinearSearch(SearchStrategyBase):
    """Linear grid search - tests all combinations"""
    
    def __init__(self, config: BenchmarkConfig, safety: SafetyLimits):
        super().__init__(config, safety)
        self.voltages = list(range(
            config.voltage_start,
            min(config.voltage_stop + 1, safety.max_voltage),
            config.voltage_step
        ))
        self.frequencies = list(range(
            config.frequency_start,
            min(config.frequency_stop + 1, safety.max_frequency),
            config.frequency_step
        ))
        self.current_v_idx = 0
        self.current_f_idx = 0
        
        total = len(self.voltages) * len(self.frequencies)
        logger.info(f"Linear search: {len(self.voltages)} voltages x {len(self.frequencies)} frequencies = {total} tests")
    
    def estimate_total_tests(self) -> int:
        return len(self.voltages) * len(self.frequencies)
    
    def get_next_combination(self) -> Optional[Tuple[int, int]]:
        while self.current_v_idx < len(self.voltages):
            while self.current_f_idx < len(self.frequencies):
                voltage = self.voltages[self.current_v_idx]
                frequency = self.frequencies[self.current_f_idx]
                self.current_f_idx += 1
                
                if not self.should_skip(voltage, frequency):
                    return (voltage, frequency)
            
            self.current_v_idx += 1
            self.current_f_idx = 0
        
        return None
    
    def is_complete(self) -> bool:
        return self.current_v_idx >= len(self.voltages)


class BinarySearch(SearchStrategyBase):
    """Binary search for optimal voltage at each frequency"""
    
    def __init__(self, config: BenchmarkConfig, safety: SafetyLimits):
        super().__init__(config, safety)
        self.frequencies = list(range(
            config.frequency_start,
            min(config.frequency_stop + 1, safety.max_frequency),
            config.frequency_step
        ))
        self.current_freq_idx = 0
        self.voltage_min = config.voltage_start
        self.voltage_max = min(config.voltage_stop, safety.max_voltage)
        self.binary_state: Dict[int, Tuple[int, int]] = {}
        
        logger.info(f"Binary search: {len(self.frequencies)} frequencies")
    
    def estimate_total_tests(self) -> int:
        import math
        voltage_range = (self.voltage_max - self.voltage_min) // self.config.voltage_step
        tests_per_freq = max(1, int(math.log2(voltage_range + 1)))
        return len(self.frequencies) * tests_per_freq
    
    def get_next_combination(self) -> Optional[Tuple[int, int]]:
        while self.current_freq_idx < len(self.frequencies):
            freq = self.frequencies[self.current_freq_idx]
            
            if freq not in self.binary_state:
                self.binary_state[freq] = (self.voltage_min, self.voltage_max)
            
            low, high = self.binary_state[freq]
            
            if high - low <= self.config.voltage_step:
                self.current_freq_idx += 1
                continue
            
            mid = (low + high) // 2
            mid = (mid // self.config.voltage_step) * self.config.voltage_step
            
            if self.should_skip(mid, freq):
                self.binary_state[freq] = (low, mid)
                continue
            
            if self.results:
                last_v, last_f, last_hr, last_eff = self.results[-1]
                if last_f == freq:
                    if last_hr > 0:
                        self.binary_state[freq] = (mid, high)
                    else:
                        self.binary_state[freq] = (low, mid)
            
            return (mid, freq)
        
        return None
    
    def is_complete(self) -> bool:
        return self.current_freq_idx >= len(self.frequencies)


class AdaptiveGridSearch(SearchStrategyBase):
    """Adaptive grid search - coarse first, then refine around best"""
    
    def __init__(self, config: BenchmarkConfig, safety: SafetyLimits):
        super().__init__(config, safety)
        self.phase = "coarse"
        
        coarse_v_step = config.voltage_step * config.coarse_step_multiplier
        coarse_f_step = config.frequency_step * config.coarse_step_multiplier
        
        self.coarse_voltages = list(range(
            config.voltage_start,
            min(config.voltage_stop + 1, safety.max_voltage),
            coarse_v_step
        ))
        self.coarse_frequencies = list(range(
            config.frequency_start,
            min(config.frequency_stop + 1, safety.max_frequency),
            coarse_f_step
        ))
        
        self.refined_voltages = []
        self.refined_frequencies = []
        
        self.current_v_idx = 0
        self.current_f_idx = 0
        
        coarse_total = len(self.coarse_voltages) * len(self.coarse_frequencies)
        logger.info(f"Adaptive grid: {coarse_total} coarse tests, refinement TBD")
    
    def estimate_total_tests(self) -> int:
        coarse_total = len(self.coarse_voltages) * len(self.coarse_frequencies)
        refine_size = (2 * self.config.refinement_range + 1) ** 2
        return coarse_total + refine_size
    
    def get_next_combination(self) -> Optional[Tuple[int, int]]:
        if self.phase == "coarse":
            return self._get_coarse_combination()
        else:
            return self._get_refined_combination()
    
    def _get_coarse_combination(self) -> Optional[Tuple[int, int]]:
        while self.current_v_idx < len(self.coarse_voltages):
            while self.current_f_idx < len(self.coarse_frequencies):
                voltage = self.coarse_voltages[self.current_v_idx]
                frequency = self.coarse_frequencies[self.current_f_idx]
                self.current_f_idx += 1
                
                if not self.should_skip(voltage, frequency):
                    return (voltage, frequency)
            
            self.current_v_idx += 1
            self.current_f_idx = 0
        
        self._setup_refinement()
        return self._get_refined_combination()
    
    def _setup_refinement(self):
        self.phase = "refined"
        
        if not self.results:
            return
        
        best = max(self.results, key=lambda x: x[2])
        best_v, best_f = best[0], best[1]
        
        logger.info(f"Best coarse: {best_v}mV @ {best_f}MHz = {best[2]:.1f} GH/s")
        
        v_range = self.config.refinement_range
        f_range = self.config.refinement_range
        
        v_start = max(self.config.voltage_start, best_v - v_range * self.config.voltage_step)
        v_stop = min(self.safety.max_voltage, best_v + v_range * self.config.voltage_step)
        f_start = max(self.config.frequency_start, best_f - f_range * self.config.frequency_step)
        f_stop = min(self.safety.max_frequency, best_f + f_range * self.config.frequency_step)
        
        self.refined_voltages = list(range(v_start, v_stop + 1, self.config.voltage_step))
        self.refined_frequencies = list(range(f_start, f_stop + 1, self.config.frequency_step))
        
        self.current_v_idx = 0
        self.current_f_idx = 0
    
    def _get_refined_combination(self) -> Optional[Tuple[int, int]]:
        while self.current_v_idx < len(self.refined_voltages):
            while self.current_f_idx < len(self.refined_frequencies):
                voltage = self.refined_voltages[self.current_v_idx]
                frequency = self.refined_frequencies[self.current_f_idx]
                self.current_f_idx += 1
                
                if not self.should_skip(voltage, frequency):
                    return (voltage, frequency)
            
            self.current_v_idx += 1
            self.current_f_idx = 0
        
        return None
    
    def is_complete(self) -> bool:
        if self.phase == "coarse":
            return False
        return self.current_v_idx >= len(self.refined_voltages)


def create_search_strategy(
    strategy_type: SearchStrategy,
    config: BenchmarkConfig,
    safety: SafetyLimits
) -> SearchStrategyBase:
    """Factory function to create search strategy"""
    
    # Handle both enum and string strategy types
    if hasattr(strategy_type, 'value'):
        strategy_name = strategy_type.value.lower()
    else:
        strategy_name = str(strategy_type).lower()
    
    logger.info(f"Creating search strategy: {strategy_name}")
    
    # Match strategy name
    if strategy_name in ('linear', 'grid'):
        return LinearSearch(config, safety)
    
    elif strategy_name in ('binary', 'binary_search'):
        return BinarySearch(config, safety)
    
    elif strategy_name in ('adaptive_grid', 'adaptive-grid', 'coarse_fine'):
        return AdaptiveGridSearch(config, safety)
    
    elif strategy_name in ('adaptive_progression', 'adaptive-progression', 'smart', 'chase'):
        if ADAPTIVE_AVAILABLE:
            return AdaptiveProgressionWrapper(config, safety)
        else:
            logger.warning("AdaptiveProgression not available, falling back to Linear")
            return LinearSearch(config, safety)
    
    else:
        logger.warning(f"Unknown strategy '{strategy_name}', defaulting to AdaptiveProgression")
        if ADAPTIVE_AVAILABLE:
            return AdaptiveProgressionWrapper(config, safety)
        else:
            return LinearSearch(config, safety)

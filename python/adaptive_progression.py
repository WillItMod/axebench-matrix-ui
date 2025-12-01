"""
Adaptive Progression Strategy for Bitaxe Tuning

Algorithm (from proven Python benchmarking script):
1. Calculate expected hashrate from frequency × (cores/1000)
2. Check if actual hashrate ≥ 94% of expected
3. If STABLE (hashrate OK) → Increase frequency, keep voltage
4. If UNSTABLE (hashrate low) → Back off frequency AND bump voltage, retry
5. HARD STOP on any limit hit - never exceed configured limits

AUTO MODE:
- Starts with coarse steps for fast exploration
- Switches to fine steps when hitting limits or finding optimal zones
- Intelligently refines around thermal/power boundaries
"""

import logging
from typing import Optional, Tuple, List, Dict, Any
from enum import Enum

logger = logging.getLogger(__name__)


class TuningMode(Enum):
    """Tuning step granularity modes"""
    MANUAL = "manual"          # User-specified fixed steps
    AUTO_COARSE = "auto_coarse"  # Auto mode: exploration phase
    AUTO_FINE = "auto_fine"      # Auto mode: refinement phase


class StopReason(Enum):
    """Reasons why tuning stopped"""
    NONE = "none"
    FREQUENCY_LIMIT = "frequency_limit"
    VOLTAGE_LIMIT = "voltage_limit"
    TEMP_LIMIT = "temp_limit"
    POWER_LIMIT = "power_limit"
    ERROR_LIMIT = "error_limit"
    FAN_LIMIT = "fan_limit"
    COMPLETED = "completed"
    USER_STOPPED = "user_stopped"


class AdaptiveProgression:
    """
    Smart frequency-climbing with voltage-bump-on-failure.
    
    This mirrors manual tuning: push frequency until hashrate drops,
    then back off frequency and add voltage to stabilize.
    
    CRITICAL: Never exceeds configured limits. Hard stops on any limit.
    """
    
    # Hashrate tolerance - if actual >= this % of expected, it's stable
    HASHRATE_TOLERANCE = 0.94
    
    def __init__(
        self,
        voltage_start: int = 1100,
        voltage_stop: int = 1300,
        voltage_step: int = 25,
        frequency_start: int = 500,
        frequency_stop: int = 800,
        frequency_step: int = 50,
        small_core_count: int = 2040,  # Default for Gamma
        target_error: float = 0.25,  # ASIC error threshold
        # Optimization target
        optimization_target: str = "balanced",  # "efficient", "balanced", "max_hashrate", "quiet"
        fan_target: Optional[int] = None,  # For quiet mode
        # Auto mode
        auto_mode: bool = False,  # Enable adaptive step sizing
        # Hard limits - NEVER exceeded
        max_chip_temp: float = 70.0,
        max_vr_temp: float = 85.0,
        max_power: float = 25.0,
        **kwargs
    ):
        self.voltage_start = voltage_start
        self.voltage_stop = voltage_stop
        self.frequency_start = frequency_start
        self.frequency_stop = frequency_stop
        self.small_core_count = small_core_count
        self.target_error = target_error
        
        # Optimization target
        self.optimization_target = optimization_target
        self.fan_target = fan_target
        
        # Auto mode settings
        self.auto_mode = auto_mode
        
        if auto_mode:
            # AUTO MODE: Set initial coarse steps based on optimization target
            self.tuning_mode = TuningMode.AUTO_COARSE
            
            if optimization_target == "max_hashrate":
                # Aggressive exploration for max hashrate
                self.voltage_step = 50  # Big jumps
                self.frequency_step = 100
                self.fine_voltage_step = 5   # Precise refinement
                self.fine_frequency_step = 10
            elif optimization_target == "efficient":
                # Quick sweep for efficiency mapping
                self.voltage_step = 25
                self.frequency_step = 50
                self.fine_voltage_step = 5
                self.fine_frequency_step = 10
            else:  # balanced or quiet
                # Moderate exploration
                self.voltage_step = 25
                self.frequency_step = 50
                self.fine_voltage_step = 10
                self.fine_frequency_step = 20
                
            logger.info(f"AUTO MODE: Starting coarse exploration ({self.voltage_step}mV, {self.frequency_step}MHz)")
        else:
            # MANUAL MODE: Use user-specified fixed steps
            self.tuning_mode = TuningMode.MANUAL
            self.voltage_step = voltage_step
            self.frequency_step = frequency_step
            self.fine_voltage_step = voltage_step  # Same as coarse in manual mode
            self.fine_frequency_step = frequency_step
        
        # Hard limits
        self.max_chip_temp = max_chip_temp
        self.max_vr_temp = max_vr_temp
        self.max_power = max_power
        
        # Adjust thresholds based on optimization target
        if optimization_target == "efficient":
            self.target_error = min(target_error, 0.15)
            self.HASHRATE_TOLERANCE = 0.96
        elif optimization_target == "max_hashrate":
            self.target_error = max(target_error, 0.25)
            self.HASHRATE_TOLERANCE = 0.92
        elif optimization_target == "quiet":
            self.target_error = min(target_error, 0.15)
            self.HASHRATE_TOLERANCE = 0.94
        
        # Current position
        self.current_voltage = voltage_start
        self.current_frequency = frequency_start
        
        # Best result tracking - separate for each optimization type
        self.best_hashrate = 0.0
        self.best_hashrate_voltage = voltage_start
        self.best_hashrate_frequency = frequency_start
        
        self.best_efficiency = 999.0
        self.best_efficiency_voltage = voltage_start
        self.best_efficiency_frequency = frequency_start
        self.best_efficiency_hashrate = 0.0
        
        self.best_quiet_hashrate = 0.0
        self.best_quiet_voltage = voltage_start
        self.best_quiet_frequency = frequency_start
        
        # Last known good (before limit hit)
        self.last_good_voltage = voltage_start
        self.last_good_frequency = frequency_start
        self.last_good_hashrate = 0.0
        
        # State
        self.completed = False
        self.stop_reason = StopReason.NONE
        self.stop_message = ""
        self.test_count = 0
        self.tested_combinations = set()
        self.failed_combinations = set()  # Blacklist for thermal/power failures
        self.results: List[Dict[str, Any]] = []
        
        # Limit hit tracking
        self.limit_hit = False
        self.limit_type = None
        
        # Status callback for UI
        self.status_callback = None
        
        mode_str = f"AUTO ({self.tuning_mode.value})" if auto_mode else "MANUAL"
        logger.info(f"AdaptiveProgression [{mode_str}]: V={voltage_start}-{voltage_stop}mV (step: {self.voltage_step}mV), "
                   f"F={frequency_start}-{frequency_stop}MHz (step: {self.frequency_step}MHz), "
                   f"target={optimization_target}, error<{self.target_error}%")
    
    def set_status_callback(self, callback):
        """Set callback for status updates to UI"""
        self.status_callback = callback
    
    def _switch_to_fine_mode(self, reason: str):
        """Switch from coarse to fine-grain tuning in auto mode"""
        if not self.auto_mode or self.tuning_mode == TuningMode.AUTO_FINE:
            return  # Already in fine mode or not in auto mode
        
        self.tuning_mode = TuningMode.AUTO_FINE
        self.voltage_step = self.fine_voltage_step
        self.frequency_step = self.fine_frequency_step
        
        self._log(f"🔍 SWITCHING TO FINE MODE ({self.voltage_step}mV, {self.frequency_step}MHz): {reason}", 'info')
    
    def _log(self, message: str, phase: str = 'strategy'):
        """Log message to console and UI"""
        logger.info(message)
        if self.status_callback:
            self.status_callback({
                'phase': phase,
                'message': message
            })
    
    def _calculate_expected_hashrate(self, frequency: int) -> float:
        """Calculate expected hashrate for given frequency"""
        # Formula: frequency * (cores / 1000)
        return frequency * (self.small_core_count / 1000)
    
    def record_limit_hit(self, limit_type: str, message: str, voltage: int, frequency: int):
        """
        Record that a hard limit was hit - MUST STOP.
        Blacklist the failing V/F combo and back down to last known good.
        
        In AUTO MODE: Switch to fine-grain tuning to precisely find the limit edge.
        """
        # Use current values if not provided
        if voltage is None:
            voltage = self.current_voltage
        if frequency is None:
            frequency = self.current_frequency
        
        self.failed_combinations.add((voltage, frequency))
        self._log(f"🚫 Blacklisted {voltage}mV @ {frequency}MHz ({limit_type} limit)", 'warning')
        
        # AUTO MODE: Switch to fine tuning near limits
        if self.auto_mode and self.tuning_mode == TuningMode.AUTO_COARSE:
            self._switch_to_fine_mode(f"Hit {limit_type} limit - refining around edge")
        
        self.limit_hit = True
        self.limit_type = limit_type
        
        if limit_type == "temp":
            self.stop_reason = StopReason.TEMP_LIMIT
        elif limit_type == "power":
            self.stop_reason = StopReason.POWER_LIMIT
        elif limit_type == "fan":
            self.stop_reason = StopReason.FAN_LIMIT
        elif limit_type == "error":
            self.stop_reason = StopReason.ERROR_LIMIT
        else:
            self.stop_reason = StopReason.VOLTAGE_LIMIT
        
        self.stop_message = message
        self._log(f"🛑 LIMIT HIT: {message}", 'error')
        
        # Show last known good with actual hashrate (or indicate none found)
        if self.last_good_hashrate > 0:
            self._log(f"↩️ Reverting to last good: {self.last_good_voltage}mV @ {self.last_good_frequency}MHz ({self.last_good_hashrate:.1f} GH/s)")
        else:
            # Use best hashrate if no "last good" was recorded
            if self.best_hashrate > 0:
                self._log(f"↩️ Reverting to best result: {self.best_hashrate_voltage}mV @ {self.best_hashrate_frequency}MHz ({self.best_hashrate:.1f} GH/s)")
            else:
                self._log(f"⚠️ No stable results recorded before limit hit. Reverting to start: {self.voltage_start}mV @ {self.frequency_start}MHz", 'warning')
        
        # Mark as completed - don't continue
        self.completed = True
    
    def get_next_combination(self) -> Optional[Tuple[int, int]]:
        """Get next V/F combination to test"""
        if self.completed:
            return None
        
        # Check if limit was hit externally
        if self.limit_hit:
            return None
        
        combo = (self.current_voltage, self.current_frequency)
        
        # Skip blacklisted combinations (thermal/power failures)
        if combo in self.failed_combinations:
            self._log(f"⏭️ Skipping blacklisted combo {combo[0]}mV @ {combo[1]}MHz")
            # Try to find next valid combo
            self._advance_to_next_valid_combo()
            if self.completed:
                return None
            combo = (self.current_voltage, self.current_frequency)
        
        # Avoid retesting
        if combo in self.tested_combinations:
            self._log(f"🏁 COMPLETE: Already tested {combo}")
            self.completed = True
            self.stop_reason = StopReason.COMPLETED
            return None
        
        # Check bounds - HARD LIMITS
        if self.current_voltage > self.voltage_stop:
            self._log(f"🛑 VOLTAGE LIMIT: Reached {self.voltage_stop}mV maximum")
            self.completed = True
            self.stop_reason = StopReason.VOLTAGE_LIMIT
            self.stop_message = f"Voltage limit ({self.voltage_stop}mV) reached"
            return None
        
        if self.current_frequency > self.frequency_stop:
            self._log(f"🏁 COMPLETE: Reached frequency limit ({self.frequency_stop}MHz)")
            self.completed = True
            self.stop_reason = StopReason.FREQUENCY_LIMIT
            self.stop_message = f"Frequency limit ({self.frequency_stop}MHz) reached with stable results"
            return None
        
        self.tested_combinations.add(combo)
        self.test_count += 1
        
        expected = self._calculate_expected_hashrate(self.current_frequency)
        self._log(f"▶ TEST {self.test_count}: {self.current_voltage}mV @ {self.current_frequency}MHz (expecting ~{expected:.0f} GH/s)")
        
        return combo
    
    def _advance_to_next_valid_combo(self):
        """Advance to next V/F combo that isn't blacklisted or already tested"""
        max_attempts = 100  # Prevent infinite loop
        attempts = 0
        
        while attempts < max_attempts:
            attempts += 1
            
            # Try increasing frequency first
            next_freq = self.current_frequency + self.frequency_step
            if next_freq <= self.frequency_stop:
                next_combo = (self.current_voltage, next_freq)
                if next_combo not in self.failed_combinations and next_combo not in self.tested_combinations:
                    self.current_frequency = next_freq
                    return
            
            # Try increasing voltage
            next_volt = self.current_voltage + self.voltage_step
            if next_volt <= self.voltage_stop:
                # Reset frequency and bump voltage
                next_combo = (next_volt, self.frequency_start)
                if next_combo not in self.failed_combinations and next_combo not in self.tested_combinations:
                    self.current_voltage = next_volt
                    self.current_frequency = self.frequency_start
                    return
            else:
                # Can't go higher, we're done
                break
        
        # No valid combinations left
        self._log(f"🏁 COMPLETE: No more valid V/F combinations to test")
        self.completed = True
        self.stop_reason = StopReason.COMPLETED
        self.stop_message = "All valid V/F combinations tested or blacklisted"
    
    def record_result(self, voltage: int, frequency: int, hashrate: float, 
                     error_pct: float, stable: bool,
                     efficiency: float = None, fan_speed: int = None,
                     chip_temp: float = None, vr_temp: float = None,
                     power: float = None) -> None:
        """
        Record test result and decide next action.
        
        Checks ALL limits and stops immediately if any exceeded.
        """
        # Check hard limits FIRST - before any other logic
        if chip_temp is not None and chip_temp >= self.max_chip_temp:
            self.record_limit_hit("temp", f"Chip temp {chip_temp:.1f}°C >= limit {self.max_chip_temp}°C")
            return
        
        if vr_temp is not None and vr_temp >= self.max_vr_temp:
            self.record_limit_hit("temp", f"VR temp {vr_temp:.1f}°C >= limit {self.max_vr_temp}°C")
            return
        
        if power is not None and power >= self.max_power:
            self.record_limit_hit("power", f"Power {power:.1f}W >= limit {self.max_power}W")
            return
        
        # Check fan limit for quiet mode
        if self.optimization_target == "quiet" and self.fan_target and fan_speed is not None:
            if fan_speed > self.fan_target:
                self.record_limit_hit("fan", f"Fan {fan_speed}% > target {self.fan_target}%")
                return
        
        expected = self._calculate_expected_hashrate(frequency)
        hashrate_ratio = hashrate / expected if expected > 0 else 0
        hashrate_ok = hashrate_ratio >= self.HASHRATE_TOLERANCE
        error_ok = error_pct < self.target_error
        is_stable = hashrate_ok and error_ok
        
        # Store result
        result_data = {
            'voltage': voltage,
            'frequency': frequency,
            'hashrate': hashrate,
            'expected': expected,
            'ratio': hashrate_ratio,
            'error_pct': error_pct,
            'stable': is_stable,
            'efficiency': efficiency,
            'fan_speed': fan_speed,
            'chip_temp': chip_temp,
            'vr_temp': vr_temp,
            'power': power,
        }
        self.results.append(result_data)
        
        # Log result
        pct = hashrate_ratio * 100
        if is_stable:
            self._log(f"✓ STABLE: {hashrate:.1f} GH/s ({pct:.1f}% of expected), err: {error_pct:.2f}%")
            
            # Update last known good
            self.last_good_voltage = voltage
            self.last_good_frequency = frequency
            self.last_good_hashrate = hashrate
        elif not hashrate_ok:
            self._log(f"⚠️ UNSTABLE: {hashrate:.1f} GH/s ({pct:.1f}% of expected) - below {self.HASHRATE_TOLERANCE*100:.0f}% threshold", 'warning')
        else:
            self._log(f"⚠️ HIGH ERROR: {hashrate:.1f} GH/s OK but err: {error_pct:.2f}% (needs <{self.target_error}%)", 'warning')
        
        # Update best results based on optimization target
        if is_stable:
            # Best hashrate
            if hashrate > self.best_hashrate:
                self.best_hashrate = hashrate
                self.best_hashrate_voltage = voltage
                self.best_hashrate_frequency = frequency
                if self.optimization_target == "max_hashrate":
                    self._log(f"🏆 NEW BEST HASHRATE: {hashrate:.1f} GH/s @ {voltage}mV/{frequency}MHz")
            
            # Best efficiency
            if efficiency is not None and efficiency < self.best_efficiency and hashrate > 0:
                old_best = self.best_efficiency
                self.best_efficiency = efficiency
                self.best_efficiency_voltage = voltage
                self.best_efficiency_frequency = frequency
                self.best_efficiency_hashrate = hashrate
                if self.optimization_target == "efficient":
                    self._log(f"🏆 NEW BEST EFFICIENCY: {efficiency:.2f} J/TH @ {voltage}mV/{frequency}MHz")
                    
                    # AUTO MODE: If we found a much better efficiency, switch to fine mode to map the sweet spot
                    if self.auto_mode and self.tuning_mode == TuningMode.AUTO_COARSE:
                        improvement = ((old_best - efficiency) / old_best) * 100 if old_best < 999 else 0
                        if improvement > 5.0:  # >5% improvement found
                            self._switch_to_fine_mode(f"Found efficiency sweet spot ({improvement:.1f}% better)")
            
            # Best quiet (hashrate with fan under target)
            if self.optimization_target == "quiet":
                if fan_speed is None or (self.fan_target and fan_speed <= self.fan_target):
                    if hashrate > self.best_quiet_hashrate:
                        self.best_quiet_hashrate = hashrate
                        self.best_quiet_voltage = voltage
                        self.best_quiet_frequency = frequency
                        self._log(f"🏆 NEW BEST QUIET: {hashrate:.1f} GH/s @ {voltage}mV/{frequency}MHz (fan: {fan_speed}%)")
        
        # DECISION LOGIC
        if is_stable:
            # Stable → Try increasing frequency
            next_freq = frequency + self.frequency_step
            if next_freq <= self.frequency_stop:
                self.current_frequency = next_freq
                self._log(f"→ NEXT: Pushing frequency {frequency} → {next_freq}MHz (voltage stays {self.current_voltage}mV)")
            else:
                self._log(f"🏁 COMPLETE: Reached max frequency ({self.frequency_stop}MHz) with stable results")
                self.completed = True
                self.stop_reason = StopReason.COMPLETED
                self.stop_message = f"Successfully reached frequency limit with stable operation"
        else:
            # Unstable → Back off frequency AND bump voltage
            
            # AUTO MODE: Switch to fine mode when hitting instability
            # This lets us precisely find the stability boundary
            if self.auto_mode and self.tuning_mode == TuningMode.AUTO_COARSE:
                self._switch_to_fine_mode(f"Instability detected at {voltage}mV/{frequency}MHz")
            
            next_voltage = voltage + self.voltage_step
            prev_freq = frequency - self.frequency_step
            
            # Check voltage limit BEFORE trying to bump
            if next_voltage > self.voltage_stop:
                self._log(f"🛑 VOLTAGE LIMIT: Cannot increase beyond {self.voltage_stop}mV")
                self.completed = True
                self.stop_reason = StopReason.VOLTAGE_LIMIT
                self.stop_message = f"Unstable at {voltage}mV/{frequency}MHz, cannot increase voltage further"
                return
            
            if prev_freq >= self.frequency_start:
                # Can back off frequency - do that AND bump voltage
                self.current_voltage = next_voltage
                self.current_frequency = prev_freq
                self._log(f"→ NEXT: Backing off to {prev_freq}MHz AND bumping voltage to {next_voltage}mV")
            else:
                # At minimum frequency - try bumping voltage at SAME frequency
                self.current_voltage = next_voltage
                # Keep same frequency - retry with more voltage
                self._log(f"→ NEXT: At min freq, bumping voltage to {next_voltage}mV (retrying {frequency}MHz)")
    
    def is_complete(self) -> bool:
        return self.completed
    
    def get_best_result(self) -> Tuple[int, int, float]:
        """Get best result based on optimization target"""
        if self.optimization_target == "efficient":
            return (self.best_efficiency_voltage, self.best_efficiency_frequency, self.best_efficiency_hashrate)
        elif self.optimization_target == "quiet":
            return (self.best_quiet_voltage, self.best_quiet_frequency, self.best_quiet_hashrate)
        else:  # max_hashrate or balanced
            return (self.best_hashrate_voltage, self.best_hashrate_frequency, self.best_hashrate)
    
    def get_completion_summary(self) -> Dict[str, Any]:
        """Get summary of tuning completion for UI display"""
        best_v, best_f, best_h = self.get_best_result()
        
        return {
            'completed': self.completed,
            'stop_reason': self.stop_reason.value,
            'stop_message': self.stop_message,
            'tests_run': self.test_count,
            'optimization_target': self.optimization_target,
            'auto_mode': self.auto_mode,
            'tuning_mode': self.tuning_mode.value if self.auto_mode else 'manual',
            'best_result': {
                'voltage': best_v,
                'frequency': best_f,
                'hashrate': best_h,
            },
            'best_hashrate': {
                'voltage': self.best_hashrate_voltage,
                'frequency': self.best_hashrate_frequency,
                'hashrate': self.best_hashrate,
            },
            'best_efficiency': {
                'voltage': self.best_efficiency_voltage,
                'frequency': self.best_efficiency_frequency,
                'efficiency': self.best_efficiency,
                'hashrate': self.best_efficiency_hashrate,
            },
            'last_good': {
                'voltage': self.last_good_voltage,
                'frequency': self.last_good_frequency,
                'hashrate': self.last_good_hashrate,
            },
            'limits': {
                'voltage_stop': self.voltage_stop,
                'frequency_stop': self.frequency_stop,
                'max_chip_temp': self.max_chip_temp,
                'max_vr_temp': self.max_vr_temp,
                'max_power': self.max_power,
            }
        }
    
    def estimate_total_tests(self) -> int:
        v_steps = (self.voltage_stop - self.voltage_start) // self.voltage_step + 1
        f_steps = (self.frequency_stop - self.frequency_start) // self.frequency_step + 1
        return max(5, (v_steps + f_steps))  # Usually linear, not grid
    
    def mark_unstable(self, voltage: int, frequency: int) -> None:
        """Mark point as unstable (external failure)"""
        self._log(f"⚠️ EXTERNAL FAILURE at {voltage}mV @ {frequency}MHz", 'warning')
        self.record_result(voltage, frequency, 0, 100.0, False)
    
    def add_result(self, voltage: int, frequency: int, hashrate: float, efficiency: float) -> None:
        """Compatibility method"""
        self.record_result(voltage, frequency, hashrate, 0, True, efficiency=efficiency)

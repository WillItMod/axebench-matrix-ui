"""
Main benchmark engine with smart algorithms and multi-device support
"""
import asyncio
import time
import logging
import statistics
from typing import List, Optional, Dict, Tuple
from datetime import datetime
from pathlib import Path
import uuid

from config import (
    BenchmarkConfig, SafetyLimits, TestResult, BenchmarkSession,
    DeviceConfig, OptimizationGoal
)
from device_manager import DeviceManager, SystemInfo, BitaxeDevice
from data_analyzer import DataAnalyzer
from search_strategies import create_search_strategy, SearchStrategyBase

logger = logging.getLogger(__name__)


class BenchmarkEngine:
    """Main benchmark engine"""
    
    def __init__(
        self,
        config: BenchmarkConfig,
        safety: SafetyLimits,
        device_manager: DeviceManager,
        session_dir: Path,
        status_callback=None
    ):
        self.config = config
        self.safety = safety
        self.device_manager = device_manager
        self.session_dir = session_dir
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self._original_status_callback = status_callback
        self.status_callback = self._wrapped_status_callback
        
        self.session_id = str(uuid.uuid4())[:8]
        self.session: Optional[BenchmarkSession] = None
        self.analyzer = DataAnalyzer()
        
        self.interrupted = False
        self.checkpoint_file = self.session_dir / f"checkpoint_{self.session_id}.json"
    
    def _wrapped_status_callback(self, status: dict):
        """Wrapper that logs messages to session AND sends to UI"""
        # Call original UI callback
        if self._original_status_callback:
            self._original_status_callback(status)
        
        # Also log to session if there's a message
        message = status.get('message')
        if message and self.session:
            phase = status.get('phase', 'info')
            # Map phase to log type
            log_type = 'info'
            if phase in ['error', 'limit']:
                log_type = 'error'
            elif phase in ['warning']:
                log_type = 'warning'
            elif phase in ['success', 'complete']:
                log_type = 'success'
            elif phase in ['strategy']:
                log_type = 'strategy'
            elif phase in ['test_complete']:
                log_type = 'test_complete'
            elif phase in ['recovery']:
                log_type = 'recovery'
            else:
                log_type = phase
            
            time_str = datetime.now().strftime('%H:%M:%S')
            self.session.add_log(time_str, message, log_type)
    
    def log_event(self, message: str, log_type: str = 'info'):
        """Log an event to the session"""
        if self.session:
            time_str = datetime.now().strftime('%H:%M:%S')
            self.session.add_log(time_str, message, log_type)
        
    async def run_benchmark(self, device_name: str) -> BenchmarkSession:
        """Run complete benchmark for a device"""
        device = self.device_manager.get_device(device_name)
        if not device:
            raise ValueError(f"Device {device_name} not found")
        
        logger.info(f"Starting benchmark for {device_name}")
        
        # Initialize session
        self.session = BenchmarkSession(
            session_id=self.session_id,
            start_time=datetime.now().isoformat(),
            end_time=None,
            device_configs=[{
                'name': device_name,
                'ip': device.ip_address,
                'model': device.model
            }],
            benchmark_config=self.config.to_dict(),
            safety_limits=self.safety.to_dict(),
            results=[],
            best_hashrate=None,
            best_efficiency=None,
            best_balanced=None,
            status="running",
            logs=[],
            stop_reason=None
        )
        
        # Clear any existing checkpoint to start fresh
        # (Only load checkpoint if explicitly resuming, not on new benchmark start)
        if self.checkpoint_file.exists():
            logger.info("Clearing old checkpoint file for fresh start")
            self.checkpoint_file.unlink()
        
        try:
            # Save device defaults
            await device.save_defaults()
            
            # Create search strategy
            strategy = create_search_strategy(
                self.config.strategy,
                self.config,
                self.safety
            )
            
            # Pass status callback to strategy for logging
            if hasattr(strategy, 'set_status_callback'):
                strategy.set_status_callback(self.status_callback)
            
            # Store strategy reference for instability marking
            self._current_strategy = strategy
            
            # Log benchmark initialization details
            if self.status_callback:
                self.status_callback({
                    'phase': 'info',
                    'message': f'📋 Strategy: {self.config.strategy.value if hasattr(self.config.strategy, "value") else self.config.strategy}'
                })
                self.status_callback({
                    'phase': 'info',
                    'message': f'⚡ Voltage range: {self.config.voltage_start}-{self.config.voltage_stop}mV (step {self.config.voltage_step}mV)'
                })
                self.status_callback({
                    'phase': 'info',
                    'message': f'🔄 Frequency range: {self.config.frequency_start}-{self.config.frequency_stop}MHz (step {self.config.frequency_step}MHz)'
                })
                self.status_callback({
                    'phase': 'info',
                    'message': f'🎯 Error threshold: <{self.config.target_error}% for stability'
                })
            
            # Add existing results to strategy
            for result in self.session.results:
                result_obj = TestResult.from_dict(result)
                strategy.add_result(
                    result_obj.voltage,
                    result_obj.frequency,
                    result_obj.avg_hashrate,
                    result_obj.efficiency
                )
            
            # Calculate total tests estimate (including cycles)
            base_tests = strategy.estimate_total_tests() if hasattr(strategy, 'estimate_total_tests') else 0
            total_tests = base_tests * self.config.cycles_per_test
            if self.status_callback:
                self.status_callback({
                    'tests_total': total_tests, 
                    'tests_completed': len(self.session.results),
                    'current_test': 'Initializing...',
                    'progress': 0
                })
            
            # Run benchmark loop
            while not strategy.is_complete() and not self.interrupted:
                combo = strategy.get_next_combination()
                if not combo:
                    break
                
                voltage, frequency = combo
                
                # Run multiple cycles at each setting for consistency
                cycle_results = []
                for cycle in range(self.config.cycles_per_test):
                    if self.interrupted:
                        break
                    
                    cycle_label = f" (cycle {cycle + 1}/{self.config.cycles_per_test})" if self.config.cycles_per_test > 1 else ""
                    logger.info(f"Testing: {voltage}mV @ {frequency}MHz{cycle_label}")
                    
                    # Update status before running test
                    tests_done = len(self.session.results)
                    progress = int((tests_done / max(total_tests, 1)) * 100) if total_tests > 0 else 0
                    if self.status_callback:
                        self.status_callback({
                            'phase': 'setting',
                            'message': f'▶ Starting test: {voltage}mV @ {frequency}MHz{cycle_label}',
                            'current_test': f'{voltage}mV @ {frequency}MHz{cycle_label}',
                            'tests_completed': tests_done,
                            'tests_total': total_tests,
                            'progress': progress
                        })
                    
                    # Run test
                    result = await self._run_single_test(
                        device,
                        voltage,
                        frequency
                    )
                    
                    if result:
                        cycle_results.append(result)
                        # Add to results
                        self.session.results.append(result.to_dict())
                        tests_done = len(self.session.results)
                        progress = int((tests_done / max(total_tests, 1)) * 100) if total_tests > 0 else 0
                        if self.status_callback:
                            self.status_callback({
                                'tests_completed': tests_done, 
                                'tests_total': total_tests,
                                'current_test': f'{voltage}mV @ {frequency}MHz{cycle_label} - {result.avg_hashrate:.1f} GH/s',
                                'progress': progress
                            })
                        
                        # Save checkpoint
                        if self.config.enable_checkpoints:
                            self._save_checkpoint()
                    else:
                        # Test failed - notify UI and mark as failed for strategy
                        logger.warning(f"Test failed at {voltage}mV @ {frequency}MHz")
                        if self.status_callback:
                            self.status_callback({
                                'phase': 'warning',
                                'message': f'⚠️ Test failed at {voltage}mV @ {frequency}MHz - skipping'
                            })
                        # Mark as unstable so strategy knows to skip/adjust
                        if hasattr(strategy, 'record_result'):
                            strategy.record_result(voltage, frequency, 0, 100.0, False)
                        elif hasattr(strategy, 'mark_unstable'):
                            strategy.mark_unstable(voltage, frequency)
                        # Don't run more cycles at this failed setting
                        break
                    
                    # Brief pause between cycles at same V/F (no real cooldown needed)
                    if cycle < self.config.cycles_per_test - 1:
                        inter_cycle_pause = 5  # Just 5 seconds between cycles at same settings
                        logger.info(f"Brief pause between cycles ({inter_cycle_pause}s)...")
                        if self.status_callback:
                            self.status_callback({
                                'phase': 'cooldown',
                                'message': f'Pause between cycles... {inter_cycle_pause}s'
                            })
                        await asyncio.sleep(inter_cycle_pause)
                
                # Report average to strategy (use best result from cycles for optimization)
                if cycle_results:
                    best_cycle = max(cycle_results, key=lambda r: r.avg_hashrate)
                    avg_hashrate = sum(r.avg_hashrate for r in cycle_results) / len(cycle_results)
                    avg_efficiency = sum(r.efficiency for r in cycle_results) / len(cycle_results)
                    avg_error_pct = sum(getattr(r, 'error_percentage', 0) for r in cycle_results) / len(cycle_results)
                    max_error_pct = max(getattr(r, 'error_percentage', 0) for r in cycle_results)
                    
                    # Get error percentage from best cycle
                    error_pct = getattr(best_cycle, 'error_percentage', 0.0)
                    
                    # Log test completion with all stats
                    if self.status_callback:
                        self.status_callback({
                            'phase': 'test_complete',
                            'message': f'✓ TEST COMPLETE: {avg_hashrate:.1f} GH/s, {avg_efficiency:.1f} J/TH, err: {avg_error_pct:.2f}% avg ({max_error_pct:.2f}% max)'
                        })
                    
                    logger.info(f"Test complete: {voltage}mV @ {frequency}MHz: {avg_hashrate:.1f} GH/s, error: {error_pct:.2f}%")
                    
                    # Strategy makes the stability decision
                    # Use target_error from config as stable threshold
                    stable = error_pct < self.config.target_error
                    
                    # Call appropriate method based on strategy type
                    if hasattr(strategy, 'record_result'):
                        # Pass all data for limit checking and optimization
                        strategy.record_result(
                            voltage, frequency, best_cycle.avg_hashrate, error_pct, stable,
                            efficiency=best_cycle.efficiency,
                            fan_speed=getattr(best_cycle, 'fan_speed', None),
                            chip_temp=best_cycle.max_temp if hasattr(best_cycle, 'max_temp') else None,
                            vr_temp=best_cycle.max_vr_temp if hasattr(best_cycle, 'max_vr_temp') else None,
                            power=best_cycle.max_power if hasattr(best_cycle, 'max_power') else None,
                        )
                        
                        # Check if strategy hit a limit and should stop
                        if hasattr(strategy, 'limit_hit') and strategy.limit_hit:
                            logger.warning(f"Strategy hit limit: {strategy.limit_type}")
                            if self.status_callback:
                                self.status_callback({
                                    'phase': 'limit_hit',
                                    'message': f'🛑 LIMIT REACHED: {strategy.stop_message}'
                                })
                            break  # Exit the test loop
                    else:
                        strategy.add_result(
                            voltage,
                            frequency,
                            best_cycle.avg_hashrate,
                            best_cycle.efficiency
                        )
                
                # Smart cooldown - adapt based on what happened
                # Default short cooldown for normal progression
                actual_cooldown = min(self.config.cooldown_time, 15)  # Cap normal cooldown at 15s
                
                # Check if we need longer cooldown based on test result
                if cycle_results:
                    last_result = cycle_results[-1]
                    max_temp_seen = last_result.max_temp if hasattr(last_result, 'max_temp') else 0
                    
                    # Longer cooldown if we got close to thermal limits
                    if max_temp_seen > (self.safety.max_chip_temp + 1):
                        actual_cooldown = max(15, self.config.cooldown_time)
                        logger.info(f"Extended cooldown ({actual_cooldown}s) - temps were high ({max_temp_seen:.1f}°C)")
                elif not cycle_results:
                    # Test failed/aborted - use configured cooldown (likely needs recovery time)
                    actual_cooldown = self.config.cooldown_time
                    logger.info(f"Full cooldown ({actual_cooldown}s) - test failed or aborted")
                
                # Apply cooldown
                if actual_cooldown > 0:
                    logger.info(f"Cooling down for {actual_cooldown}s...")
                    cooldown_remaining = actual_cooldown
                    # Show initial cooldown message
                    if self.status_callback:
                        self.status_callback({
                            'phase': 'cooldown',
                            'message': f'Cooling down... {cooldown_remaining}s remaining'
                        })
                    while cooldown_remaining > 0 and not self.interrupted:
                        await asyncio.sleep(1)  # Check interrupt every 1s
                        cooldown_remaining -= 1
                        if cooldown_remaining > 0 and cooldown_remaining % 5 == 0 and self.status_callback:
                            self.status_callback({
                                'phase': 'cooldown',
                                'message': f'Cooling down... {cooldown_remaining}s remaining'
                            })
            
            # Find best results
            self._find_best_results()
            
            # Run stability test on winner
            if self.session.best_hashrate:
                logger.info("Running stability validation on best settings...")
                best = TestResult.from_dict(self.session.best_hashrate)
                await self._run_stability_test(device, best.voltage, best.frequency)
            
            # Apply best settings
            if self.session.best_hashrate:
                best = TestResult.from_dict(self.session.best_hashrate)
                logger.info(f"Applying best settings: {best.voltage}mV @ {best.frequency}MHz")
                await device.set_voltage_frequency(best.voltage, best.frequency)
            
            # Set stop reason based on strategy state
            if hasattr(strategy, 'limit_hit') and strategy.limit_hit:
                self.session.stop_reason = f"{strategy.limit_type}: {strategy.stop_message}"
            elif hasattr(strategy, 'stop_message') and strategy.stop_message:
                self.session.stop_reason = strategy.stop_message
            elif self.interrupted:
                self.session.stop_reason = "User stopped benchmark"
            else:
                self.session.stop_reason = "Completed all planned tests"
            
            self.session.status = "completed"
            self.session.end_time = datetime.now().isoformat()
            
            # Log final summary
            self.log_event(f"Benchmark finished: {len(self.session.results)} tests completed", 'success')
            if self.session.stop_reason:
                self.log_event(f"Stop reason: {self.session.stop_reason}", 'info')
            
        except KeyboardInterrupt:
            logger.warning("Benchmark interrupted by user")
            self.session.status = "interrupted"
            self.session.stop_reason = "User interrupted (Ctrl+C)"
            self.interrupted = True
            
            # Restore defaults
            await device.restore_defaults()
            
        except Exception as e:
            logger.error(f"Benchmark error: {e}", exc_info=True)
            self.session.status = "error"
            self.session.stop_reason = f"Error: {str(e)}"
            
            # Restore defaults
            await device.restore_defaults()
            
        finally:
            # Save final session
            session_file = self.session_dir / f"session_{self.session_id}.json"
            self.session.save(session_file)
            logger.info(f"Session saved to {session_file}")
            
            # Export CSV if enabled
            if self.config.export_csv and self.session.results:
                csv_file = self.session_dir / f"results_{self.session_id}.csv"
                self.analyzer.export_to_csv(self.session.results, str(csv_file))
        
        return self.session
    
    async def _run_single_test(
        self,
        device: BitaxeDevice,
        voltage: int,
        frequency: int
    ) -> Optional[TestResult]:
        """Run a single benchmark test"""
        
        # Update status - setting voltage/frequency
        if self.status_callback:
            self.status_callback({
                'phase': 'setting',
                'message': f'Applying {voltage}mV @ {frequency}MHz...'
            })
        
        # Set voltage and frequency
        success = await device.set_voltage_frequency(voltage, frequency)
        if not success:
            logger.error("Failed to set voltage/frequency")
            if self.status_callback:
                self.status_callback({
                    'phase': 'error',
                    'message': f'ERROR: Failed to set {voltage}mV @ {frequency}MHz'
                })
            return None
        
        # Optional restart (usually not needed - Bitaxe applies changes immediately)
        if self.config.restart_between_tests:
            if self.status_callback:
                self.status_callback({'phase': 'restart', 'message': 'Restarting device...'})
            logger.info("Restarting device (optional - for stability)...")
            await device.restart()
        
        # Wait for stabilization with countdown updates
        logger.info(f"Waiting for device to stabilize ({self.config.warmup_time}s)...")
        warmup_remaining = self.config.warmup_time
        # Show initial warmup message
        if self.status_callback:
            self.status_callback({
                'phase': 'warmup',
                'message': f'Stabilizing... {warmup_remaining}s remaining',
                'warmup_remaining': warmup_remaining
            })
        while warmup_remaining > 0 and not self.interrupted:
            await asyncio.sleep(1)  # Check interrupt every 1s
            warmup_remaining -= 1
            if warmup_remaining > 0 and warmup_remaining % 5 == 0 and self.status_callback:
                self.status_callback({
                    'phase': 'warmup',
                    'message': f'Stabilizing... {warmup_remaining}s remaining',
                    'warmup_remaining': warmup_remaining
                })
        
        if self.interrupted:
            return None
        
        # Verify settings were applied
        info = await device.get_system_info()
        if info:
            actual_voltage = info.voltage
            actual_frequency = info.frequency
            voltage_diff = abs(actual_voltage - voltage)
            frequency_diff = abs(actual_frequency - frequency)
            
            if voltage_diff > 20 or frequency_diff > 10:
                warning_msg = f'Settings may not have applied. Requested: {voltage}mV/{frequency}MHz, Actual: {actual_voltage}mV/{actual_frequency}MHz'
                logger.warning(warning_msg)
                if self.status_callback:
                    self.status_callback({
                        'phase': 'warning',
                        'message': f'⚠️ {warning_msg}. Try enabling "Restart between tests".'
                    })
        
        # Reset share counters
        await device.reset_share_counters()
        
        # Collect samples
        hashrate_samples = []
        temp_samples = []
        vr_temp_samples = []
        power_samples = []
        input_voltage_samples = []
        error_percentage_samples = []  # Track ASIC error rate
        error_window: list[float] = []  # Rolling error history for adaptive cap
        error_abort_threshold: Optional[float] = None  # Dynamic early-exit cap based on baseline
        error_cap_floor = max(self.config.target_error * 1.5, 0.2)  # Never cap tighter than this
        error_cap_multiplier = 1.75  # Slope factor vs. baseline
        spike_cap_multiplier = 1.6  # Allow brief spikes up to this factor
        min_samples_before_abort = max(4, self.config.min_samples // 2)  # Grace window before aborting
        over_cap_streak = 0
        sustained_over_cap = 0
        severe_spike_seen = False
        max_temp = 0.0
        max_vr_temp = 0.0
        max_power = 0.0
        max_error_percentage = 0.0
        
        start_time = time.time()
        end_time = start_time + self.config.benchmark_duration
        sample_count = 0
        total_samples = self.config.benchmark_duration // self.config.sample_interval
        
        logger.info(f"Collecting samples for {self.config.benchmark_duration}s...")
        
        while time.time() < end_time and not self.interrupted:
            info = await device.get_system_info()
            
            elapsed = int(time.time() - start_time)
            remaining = self.config.benchmark_duration - elapsed
            
            if not info or not info.is_valid():
                logger.warning("Invalid system info, skipping sample")
                if self.status_callback:
                    self.status_callback({
                        'phase': 'warning',
                        'message': f'Warning: Invalid sample at {elapsed}s (skipped)'
                    })
                # Sleep with interrupt check
                for _ in range(self.config.sample_interval):
                    if self.interrupted:
                        break
                    await asyncio.sleep(1)
                continue
            
            # Check safety limits
            if not self._check_safety(info, voltage, frequency):
                logger.error("Safety limits exceeded, aborting test")
                if self.status_callback:
                    self.status_callback({
                        'phase': 'error',
                        'message': f'SAFETY ABORT: Temp {info.temperature:.1f}°C or Power {info.power:.1f}W exceeded limits'
                    })
                return None
            
            # Collect data
            hashrate_samples.append(info.hashrate)
            temp_samples.append(info.temperature)
            power_samples.append(info.power)
            input_voltage_samples.append(info.input_voltage)
            
            # Track error percentage
            error_pct = getattr(info, 'error_percentage', 0)
            error_percentage_samples.append(error_pct)
            max_error_percentage = max(max_error_percentage, error_pct)

            # Dynamic ASIC error early-exit:
            # - Build a small rolling baseline from recent non-zero samples
            # - Cap is softer: max(floor, baseline * multiplier, baseline + 2*std)
            # - Only abort after a short grace window and repeated breaches (or a large spike)
            if error_pct > 0:
                error_window.append(error_pct)
                if len(error_window) > 6:
                    error_window.pop(0)

                if len(error_window) >= 3:
                    baseline = statistics.mean(error_window)
                    stdev = statistics.pstdev(error_window) if len(error_window) > 1 else 0.0
                    dynamic_cap = max(
                        error_cap_floor,
                        baseline * error_cap_multiplier,
                        baseline + (stdev * 2),
                    )
                    if error_abort_threshold is None or abs(dynamic_cap - error_abort_threshold) > 1e-3:
                        error_abort_threshold = dynamic_cap
                        logger.info(
                            "Dynamic ASIC error cap initialised: "
                            f"baseline={baseline:.3f}%%, std={stdev:.3f}%%, cap={error_abort_threshold:.3f}%%"
                        )

                if error_abort_threshold is not None and sample_count >= min_samples_before_abort:
                    cap = error_abort_threshold
                    spike_cap = cap * spike_cap_multiplier

                    if error_pct > cap:
                        over_cap_streak += 1
                        sustained_over_cap += 1
                        if error_pct >= spike_cap:
                            severe_spike_seen = True
                    else:
                        over_cap_streak = 0
                        sustained_over_cap = max(0, sustained_over_cap - 1)

                    should_abort = False
                    if severe_spike_seen and error_pct >= spike_cap:
                        should_abort = True
                        reason = f"spike {error_pct:.3f}%% > {spike_cap:.3f}%%"
                    elif over_cap_streak >= 2:
                        should_abort = True
                        reason = f"over-cap streak ({over_cap_streak} samples > {cap:.3f}%%)"
                    elif sustained_over_cap >= 3:
                        should_abort = True
                        reason = f"repeated over-cap ({sustained_over_cap} samples > {cap:.3f}%%)"

                    if should_abort:
                        logger.warning(
                            f"ASIC error {error_pct:.3f}%% exceeded cap {cap:.3f}%% "
                            f"at {voltage}mV/{frequency}MHz - aborting test point ({reason})"
                        )
                        if self.status_callback:
                            self.status_callback({
                                'phase': 'warning',
                                'message': (
                                    f'⚠️ ASIC error {error_pct:.3f}%% exceeded cap '
                                    f'{cap:.3f}%% at {voltage}mV/{frequency}MHz - aborting point ({reason})'
                                )
                            })
                        if hasattr(self, '_current_strategy') and self._current_strategy:
                            self._current_strategy.mark_unstable(voltage, frequency)
                        return None

            
            if info.vr_temp:
                vr_temp_samples.append(info.vr_temp)
                max_vr_temp = max(max_vr_temp, info.vr_temp)
            
            max_temp = max(max_temp, info.temperature)
            max_power = max(max_power, info.power)
            
            sample_count += 1
            
            # Log EVERY sample with detailed data
            if self.status_callback:
                # Detailed sample log entry
                self.status_callback({
                    'phase': 'sample',
                    'message': f'📊 Sample {sample_count}/{total_samples}: {info.hashrate:.1f} GH/s, {info.temperature:.1f}°C, {info.power:.1f}W, err: {error_pct:.2f}%'
                })
                
                # Also update the progress display
                self.status_callback({
                    'phase': 'sampling',
                    'message': f'Sampling... {remaining}s remaining ({sample_count}/{total_samples} samples)',
                    'sampling_remaining': remaining,
                    'sample_count': sample_count,
                    'total_samples': total_samples,
                    'live_data': {
                        'hashrate': info.hashrate if info else 0,
                        'temp': info.temperature if info else 0,
                        'vr_temp': info.vr_temp if info else 0,
                        'power': info.power if info else 0,
                        'voltage': info.voltage if info else voltage,
                        'frequency': info.frequency if info else frequency,
                        'fan_speed': getattr(info, 'fan_speed', 0) if info else 0,
                        'error_percentage': error_pct
                    } if info else None
                })
            
            # Check for hashrate drop (instability detection)
            if len(hashrate_samples) >= 3:
                initial_hashrate = sum(hashrate_samples[:3]) / 3
                current_hashrate = info.hashrate
                
                # Also check expected hashrate if provided
                expected = getattr(self, '_expected_hashrate', None)
                reference_hashrate = expected if expected else initial_hashrate
                
                if reference_hashrate > 0 and current_hashrate > 0:
                    variance_percent = ((reference_hashrate - current_hashrate) / reference_hashrate) * 100
                    
                    if variance_percent > 15:
                        logger.warning(f"Hashrate dropped {variance_percent:.1f}% ({reference_hashrate:.1f} → {current_hashrate:.1f} GH/s) - marking as unstable")
                        if self.status_callback:
                            self.status_callback({
                                'phase': 'warning',
                                'message': f'⚠️ Hashrate dropped {variance_percent:.0f}% at {voltage}mV/{frequency}MHz - unstable, trying lower settings'
                            })
                        
                        # Mark this point as unstable so strategy avoids higher settings
                        if hasattr(self, '_current_strategy') and self._current_strategy:
                            self._current_strategy.mark_unstable(voltage, frequency)
                        
                        return None  # Abort this test point
                    elif variance_percent > 0.3:
                        # Minor variance - log as info but continue testing
                        logger.info(f"Hashrate variance {variance_percent:.2f}% at {voltage}mV/{frequency}MHz - acceptable")
            
            # Check for stuck readings
            if len(hashrate_samples) >= 5:
                if self.analyzer.detect_stuck_readings(hashrate_samples[-5:]):
                    logger.error("Stuck hashrate readings detected, aborting test")
                    await device.restart()
                    return None
            
            # Intelligent Thermal Prediction
            if self.config.adaptive_duration and len(temp_samples) >= 5:
                slope, is_heating = self.analyzer.predict_thermal_trend(temp_samples)
                
                # Calculate predicted final temperature
                samples_remaining = total_samples - sample_count
                temp_rise_per_sample = slope if is_heating else 0
                predicted_final_temp = info.temperature + (temp_rise_per_sample * samples_remaining)
                
                # Check if we'll exceed limit if we continue
                if predicted_final_temp > self.safety.max_chip_temp:
                    logger.warning(f"Predicted final temp {predicted_final_temp:.1f}°C would exceed limit {self.safety.max_chip_temp}°C")
                    if self.status_callback:
                        self.status_callback({
                            'phase': 'warning',
                            'message': f'⚠️ Thermal limit predicted: {info.temperature:.1f}°C now, would reach {predicted_final_temp:.1f}°C (limit {self.safety.max_chip_temp}°C). Ending test early with {sample_count} samples.'
                        })
                    break
                
                # Also check if already at/over limit
                if info.temperature >= self.safety.max_chip_temp:
                    logger.error(f"Temperature {info.temperature:.1f}°C at/above limit {self.safety.max_chip_temp}°C")
                    if self.status_callback:
                        self.status_callback({
                            'phase': 'error',
                            'message': f'🛑 Thermal limit exceeded: {info.temperature:.1f}°C >= {self.safety.max_chip_temp}°C'
                        })
                    break
            
            # Log progress
            elapsed = time.time() - start_time
            remaining = end_time - time.time()
            logger.info(
                f"Sample {sample_count}: {info.hashrate:.1f} GH/s, "
                f"{info.temperature:.1f}°C, {info.power:.1f}W "
                f"({remaining:.0f}s remaining)"
            )
            
            # Sleep with interrupt check
            for _ in range(self.config.sample_interval):
                if self.interrupted:
                    break
                await asyncio.sleep(1)
        
        # Update status - sampling complete
        if self.status_callback:
            self.status_callback({
                'phase': 'sampling',
                'message': f'Sampling complete ({sample_count}/{total_samples} samples)',
                'sampling_remaining': 0,
                'sample_count': sample_count,
                'total_samples': total_samples
            })
        
        # Check minimum samples
        if sample_count < self.config.min_samples:
            logger.warning(f"Insufficient samples: {sample_count} < {self.config.min_samples}")
            if self.status_callback:
                self.status_callback({
                    'phase': 'warning',
                    'message': f'⚠️ Test aborted: Only {sample_count} samples collected (need {self.config.min_samples})'
                })
            return None
        
        # Process data with outlier removal
        clean_hashrate, _ = self.analyzer.remove_outliers_iqr(hashrate_samples)
        clean_temp, _ = self.analyzer.remove_outliers_iqr(temp_samples[6:])  # Skip warmup
        clean_power, _ = self.analyzer.remove_outliers_iqr(power_samples)
        
        if not clean_hashrate or not clean_temp:
            logger.warning("No valid samples after outlier removal")
            return None
        
        # Calculate statistics
        hashrate_stats = self.analyzer.calculate_statistics(clean_hashrate)
        
        # Calculate efficiency (J/TH)
        avg_hashrate = hashrate_stats.mean if hashrate_stats else 0
        avg_power = sum(clean_power) / len(clean_power) if clean_power else 0
        efficiency = (avg_power / (avg_hashrate / 1000)) if avg_hashrate > 0 else float('inf')
        
        # Calculate stability score
        stability_score = self.analyzer.calculate_stability_score(
            clean_hashrate,
            clean_temp,
            clean_power
        )
        
        # Get final info for reject rate
        final_info = await device.get_system_info()
        reject_rate = device.get_reject_rate(final_info) if final_info else 0.0
        
        # Calculate average error percentage from samples
        avg_error_percentage = sum(error_percentage_samples) / len(error_percentage_samples) if error_percentage_samples else 0.0
        
        # Create result
        result = TestResult(
            timestamp=datetime.now().isoformat(),
            device_name=device.name,
            voltage=voltage,
            frequency=frequency,
            avg_hashrate=avg_hashrate,
            hashrate_variance=hashrate_stats.variance if hashrate_stats else 0,
            avg_temp=sum(clean_temp) / len(clean_temp) if clean_temp else 0,
            max_temp=max_temp,
            avg_vr_temp=sum(vr_temp_samples) / len(vr_temp_samples) if vr_temp_samples else None,
            max_vr_temp=max_vr_temp if vr_temp_samples else None,
            avg_power=avg_power,
            max_power=max_power,
            efficiency=efficiency,
            avg_input_voltage=sum(input_voltage_samples) / len(input_voltage_samples),
            samples_collected=sample_count,
            test_duration=int(time.time() - start_time),
            rejected_samples=len(hashrate_samples) - len(clean_hashrate),
            stability_score=stability_score,
            error_percentage=avg_error_percentage
        )
        
        # Store error metrics for strategy to use
        result.reject_rate = reject_rate
        result.error_percentage = avg_error_percentage
        result.max_error_percentage = max_error_percentage
        
        # Update status - test complete with results
        if self.status_callback:
            self.status_callback({
                'phase': 'test_complete',
                'message': f'✓ Test complete: {result.avg_hashrate:.1f} GH/s, {result.efficiency:.2f} J/TH, error: {avg_error_percentage:.2f}%',
                'result': {
                    'hashrate': result.avg_hashrate,
                    'efficiency': result.efficiency,
                    'error_percentage': avg_error_percentage
                }
            })
        
        logger.info(
            f"Test complete: {result.avg_hashrate:.1f} GH/s, "
            f"{result.efficiency:.2f} J/TH, "
            f"error_rate: {avg_error_percentage:.2f}% (max: {max_error_percentage:.2f}%)"
        )
        
        return result
    
    def _check_safety(self, info: SystemInfo, voltage: int = None, frequency: int = None) -> bool:
        """Check if system info is within safety limits. Notifies strategy on limit hit."""
        limit_hit = False
        limit_type = None
        limit_message = None
        
        if info.temperature > self.safety.max_chip_temp:
            logger.error(f"Chip temperature too high: {info.temperature}°C (limit: {self.safety.max_chip_temp}°C)")
            limit_hit = True
            limit_type = "temp"
            limit_message = f"Chip temp {info.temperature:.1f}°C exceeded limit {self.safety.max_chip_temp}°C"
        
        elif info.vr_temp and info.vr_temp > self.safety.max_vr_temp:
            logger.error(f"VR temperature too high: {info.vr_temp}°C (limit: {self.safety.max_vr_temp}°C)")
            limit_hit = True
            limit_type = "temp"
            limit_message = f"VR temp {info.vr_temp:.1f}°C exceeded limit {self.safety.max_vr_temp}°C"
        
        elif info.power > self.safety.max_power:
            logger.error(f"Power consumption too high: {info.power}W (limit: {self.safety.max_power}W)")
            limit_hit = True
            limit_type = "power"
            limit_message = f"Power {info.power:.1f}W exceeded limit {self.safety.max_power}W"
        
        elif info.input_voltage < self.safety.min_input_voltage:
            logger.error(f"Input voltage too low: {info.input_voltage}mV (limit: {self.safety.min_input_voltage}mV)")
            limit_hit = True
            limit_type = "voltage"
            limit_message = f"Input voltage {info.input_voltage}mV below minimum {self.safety.min_input_voltage}mV"
        
        elif info.input_voltage > self.safety.max_input_voltage:
            logger.error(f"Input voltage too high: {info.input_voltage}mV (limit: {self.safety.max_input_voltage}mV)")
            limit_hit = True
            limit_type = "voltage"
            limit_message = f"Input voltage {info.input_voltage}mV above maximum {self.safety.max_input_voltage}mV"
        
        if limit_hit:
            # Notify strategy about the limit hit with V/F info for blacklisting
            if hasattr(self, '_current_strategy') and hasattr(self._current_strategy, 'record_limit_hit'):
                self._current_strategy.record_limit_hit(limit_type, limit_message, voltage, frequency)
            
            # Update status for UI
            if self.status_callback:
                self.status_callback({
                    'phase': 'limit_hit',
                    'message': f'🛑 {limit_message}',
                    'limit_type': limit_type,
                    'limit_message': limit_message,
                })
            return False
        
        return True
    
    def _find_best_results(self):
        """Find and rank best results - prioritize low error rate"""
        if not self.session.results:
            return
        
        # Use configured target_error as the baseline
        target_error = self.config.target_error  # e.g., 0.25%
        
        # Filter by error rate tiers relative to target
        optimal = [r for r in self.session.results if r.get('error_percentage', 100) <= target_error]
        acceptable = [r for r in self.session.results if r.get('error_percentage', 100) <= target_error * 2]
        usable = [r for r in self.session.results if r.get('error_percentage', 100) <= target_error * 3]
        
        # Pick best pool (prefer optimal, fallback to acceptable, then usable)
        pool = optimal or acceptable or usable or self.session.results
        
        # Best hashrate from clean results
        best_hr = max(pool, key=lambda x: x['avg_hashrate'])
        self.session.best_hashrate = best_hr
        
        # Best efficiency from clean results
        best_eff = min(pool, key=lambda x: x['efficiency'])
        self.session.best_efficiency = best_eff
        
        # Best balanced
        def balanced_score(r):
            hr_norm = r['avg_hashrate'] / best_hr['avg_hashrate']
            eff_norm = best_eff['efficiency'] / r['efficiency']
            stab_norm = r['stability_score'] / 100.0
            # Penalize high error rates
            error_penalty = max(0, 1 - (r.get('error_percentage', 0) / target_error) * 0.1)
            return (0.4 * hr_norm + 0.3 * eff_norm + 0.3 * stab_norm) * error_penalty
        
        best_bal = max(pool, key=balanced_score)
        self.session.best_balanced = best_bal
        
        tier = f"optimal (<={target_error}%)" if optimal else f"acceptable (<={target_error*2}%)" if acceptable else f"usable (<={target_error*3}%)" if usable else "all results (no stable results found)"
        logger.info("=" * 60)
        logger.info(f"BEST RESULTS (from {tier} error pool):")
        logger.info(f"  Hashrate: {best_hr['voltage']}mV @ {best_hr['frequency']}MHz = {best_hr['avg_hashrate']:.1f} GH/s (err: {best_hr.get('error_percentage', 0):.2f}%)")
        logger.info(f"  Efficiency: {best_eff['voltage']}mV @ {best_eff['frequency']}MHz = {best_eff['efficiency']:.2f} J/TH")
        logger.info(f"  Balanced: {best_bal['voltage']}mV @ {best_bal['frequency']}MHz")
        logger.info("=" * 60)
        
        # Log warning if best results have high error
        if best_hr.get('error_percentage', 0) > target_error:
            self.log_event(f"⚠️ Best result has error rate {best_hr.get('error_percentage', 0):.2f}% (target: {target_error}%)", 'warning')
    
    async def _run_stability_test(
        self,
        device: BitaxeDevice,
        voltage: int,
        frequency: int
    ) -> bool:
        """Run extended stability test"""
        logger.info(f"Stability test: {self.config.stability_test_duration}s")
        
        result = await self._run_single_test(device, voltage, frequency)
        
        if not result:
            logger.error("Stability test failed")
            return False
        
        # Check stability criteria
        if result.stability_score < 80:
            logger.warning(f"Low stability score: {result.stability_score:.1f}/100")
        
        final_info = await device.get_system_info()
        if final_info:
            reject_rate = device.get_reject_rate(final_info)
            if reject_rate > self.config.reject_rate_threshold:
                logger.warning(f"High reject rate: {reject_rate:.2f}%")
        
        logger.info("Stability test complete")
        return True
    
    def _save_checkpoint(self):
        """Save checkpoint"""
        if self.session:
            self.session.save(self.checkpoint_file)
            logger.debug(f"Checkpoint saved: {len(self.session.results)} results")

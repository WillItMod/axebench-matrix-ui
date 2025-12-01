"""
Bitaxe Benchmark Pro - Main CLI Application
"""
import asyncio
import argparse
import logging
import sys
from pathlib import Path
from typing import List, Optional
import json

from config import (
    BenchmarkConfig, SafetyLimits, DeviceConfig,
    SearchStrategy, OptimizationGoal, PRESETS, MODEL_CONFIGS
)
from device_manager import DeviceManager
from benchmark_engine import BenchmarkEngine
from visualizer import Visualizer
from data_analyzer import DataAnalyzer

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('bitaxe_benchmark.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class BitaxeBenchmarkPro:
    """Main application class"""
    
    def __init__(self):
        self.config_dir = Path.home() / ".bitaxe-benchmark"
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        self.devices_file = self.config_dir / "devices.json"
        self.sessions_dir = self.config_dir / "sessions"
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        
        self.device_manager = DeviceManager()
    
    def load_devices(self):
        """Load device configurations"""
        if not self.devices_file.exists():
            logger.warning("No devices configured. Use 'add-device' command.")
            return
        
        try:
            with open(self.devices_file, 'r') as f:
                devices_data = json.load(f)
            
            for dev_data in devices_data:
                self.device_manager.add_device(
                    dev_data['name'],
                    dev_data['ip_address'],
                    dev_data.get('model', 'Unknown')
                )
            
            logger.info(f"Loaded {len(devices_data)} devices")
            
        except Exception as e:
            logger.error(f"Error loading devices: {e}")
    
    def save_devices(self):
        """Save device configurations"""
        devices_data = []
        
        for name in self.device_manager.list_devices():
            device = self.device_manager.get_device(name)
            if device:
                devices_data.append({
                    'name': device.name,
                    'ip_address': device.ip_address,
                    'model': device.model
                })
        
        try:
            with open(self.devices_file, 'w') as f:
                json.dump(devices_data, f, indent=2)
            
            logger.info(f"Saved {len(devices_data)} devices")
            
        except Exception as e:
            logger.error(f"Error saving devices: {e}")
    
    async def run_benchmark(
        self,
        device_name: str,
        config: BenchmarkConfig,
        safety: SafetyLimits
    ):
        """Run benchmark on a device"""
        try:
            # Initialize devices
            await self.device_manager.initialize_all()
            
            # Create engine
            engine = BenchmarkEngine(
                config,
                safety,
                self.device_manager,
                self.sessions_dir
            )
            
            # Run benchmark
            session = await engine.run_benchmark(device_name)
            
            logger.info("=" * 60)
            logger.info(f"Benchmark Complete! Session ID: {session.session_id}")
            logger.info("=" * 60)
            
            # Generate visualizations if enabled
            if config.enable_plotting and session.results:
                plots_dir = self.sessions_dir / f"plots_{session.session_id}"
                Visualizer.create_all_plots(session.results, plots_dir)
            
            # Print summary
            self._print_summary(session)
            
        except Exception as e:
            logger.error(f"Benchmark failed: {e}", exc_info=True)
            
        finally:
            await self.device_manager.cleanup_all()
    
    def _print_summary(self, session):
        """Print benchmark summary"""
        print("\n" + "=" * 60)
        print("BENCHMARK SUMMARY")
        print("=" * 60)
        print(f"Total tests: {len(session.results)}")
        
        if session.best_hashrate:
            best_hr = session.best_hashrate
            print(f"\nBest Hashrate:")
            print(f"  {best_hr['voltage']}mV @ {best_hr['frequency']}MHz")
            print(f"  Hashrate: {best_hr['avg_hashrate']:.1f} GH/s")
            print(f"  Efficiency: {best_hr['efficiency']:.2f} J/TH")
            print(f"  Temperature: {best_hr['avg_temp']:.1f}°C")
            print(f"  Stability: {best_hr['stability_score']:.1f}/100")
        
        if session.best_efficiency:
            best_eff = session.best_efficiency
            print(f"\nBest Efficiency:")
            print(f"  {best_eff['voltage']}mV @ {best_eff['frequency']}MHz")
            print(f"  Hashrate: {best_eff['avg_hashrate']:.1f} GH/s")
            print(f"  Efficiency: {best_eff['efficiency']:.2f} J/TH")
            print(f"  Temperature: {best_eff['avg_temp']:.1f}°C")
        
        if session.best_balanced:
            best_bal = session.best_balanced
            print(f"\nBest Balanced:")
            print(f"  {best_bal['voltage']}mV @ {best_bal['frequency']}MHz")
            print(f"  Hashrate: {best_bal['avg_hashrate']:.1f} GH/s")
            print(f"  Efficiency: {best_bal['efficiency']:.2f} J/TH")
            print(f"  Temperature: {best_bal['avg_temp']:.1f}°C")
            print(f"  Stability: {best_bal['stability_score']:.1f}/100")
        
        print("=" * 60)
        print(f"Results saved to: {self.sessions_dir / f'session_{session.session_id}.json'}")
        print("=" * 60 + "\n")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Bitaxe Benchmark Pro - Advanced benchmarking tool',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Add device command
    add_device_parser = subparsers.add_parser('add-device', help='Add a Bitaxe device')
    add_device_parser.add_argument('name', help='Device name')
    add_device_parser.add_argument('ip', help='IP address')
    add_device_parser.add_argument('--model', default='Unknown', help='Device model')
    
    # List devices command
    subparsers.add_parser('list-devices', help='List configured devices')
    
    # Remove device command
    remove_device_parser = subparsers.add_parser('remove-device', help='Remove a device')
    remove_device_parser.add_argument('name', help='Device name')
    
    # Benchmark command
    bench_parser = subparsers.add_parser('benchmark', help='Run benchmark')
    bench_parser.add_argument('device', help='Device name')
    bench_parser.add_argument('--preset', choices=list(PRESETS.keys()),
                             help='Use preset configuration')
    bench_parser.add_argument('--strategy', choices=['linear', 'binary', 'adaptive_grid'],
                             default='adaptive_grid', help='Search strategy')
    bench_parser.add_argument('--goal', choices=['max_hashrate', 'max_efficiency', 'balanced'],
                             default='balanced', help='Optimization goal')
    bench_parser.add_argument('--voltage-start', type=int, help='Starting voltage (mV)')
    bench_parser.add_argument('--voltage-stop', type=int, help='Ending voltage (mV)')
    bench_parser.add_argument('--voltage-step', type=int, help='Voltage step (mV)')
    bench_parser.add_argument('--frequency-start', type=int, help='Starting frequency (MHz)')
    bench_parser.add_argument('--frequency-stop', type=int, help='Ending frequency (MHz)')
    bench_parser.add_argument('--frequency-step', type=int, help='Frequency step (MHz)')
    bench_parser.add_argument('--duration', type=int, help='Test duration (seconds)')
    bench_parser.add_argument('--no-plots', action='store_true', help='Disable plotting')
    bench_parser.add_argument('--no-csv', action='store_true', help='Disable CSV export')
    bench_parser.add_argument('--restart', action='store_true', 
                             help='Restart device between tests (slower but more thorough)')
    bench_parser.add_argument('--warmup', type=int, help='Warmup time (seconds)')
    
    # List presets command
    subparsers.add_parser('list-presets', help='List available presets')
    
    # Analyze command
    analyze_parser = subparsers.add_parser('analyze', help='Analyze benchmark results')
    analyze_parser.add_argument('session_id', help='Session ID')
    
    # Compare command
    compare_parser = subparsers.add_parser('compare', help='Compare two benchmark sessions')
    compare_parser.add_argument('session1', help='First session ID')
    compare_parser.add_argument('session2', help='Second session ID')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    app = BitaxeBenchmarkPro()
    
    # Handle commands
    if args.command == 'add-device':
        app.load_devices()
        app.device_manager.add_device(args.name, args.ip, args.model)
        app.save_devices()
        print(f"Added device: {args.name} ({args.ip})")
    
    elif args.command == 'list-devices':
        app.load_devices()
        devices = app.device_manager.list_devices()
        if not devices:
            print("No devices configured.")
        else:
            print("Configured devices:")
            for name in devices:
                device = app.device_manager.get_device(name)
                print(f"  - {name}: {device.ip_address} ({device.model})")
    
    elif args.command == 'remove-device':
        app.load_devices()
        app.device_manager.remove_device(args.name)
        app.save_devices()
        print(f"Removed device: {args.name}")
    
    elif args.command == 'list-presets':
        print("Available presets:")
        for name, config in PRESETS.items():
            print(f"\n  {name}:")
            print(f"    Strategy: {config.strategy.value}")
            print(f"    Goal: {config.optimization_goal.value}")
            print(f"    Duration: {config.benchmark_duration}s")
    
    elif args.command == 'benchmark':
        app.load_devices()
        
        # Get configuration
        if args.preset:
            config = PRESETS[args.preset]
        else:
            config = BenchmarkConfig()
        
        # Override with command line args
        if args.strategy:
            config.strategy = SearchStrategy(args.strategy)
        if args.goal:
            config.optimization_goal = OptimizationGoal(args.goal)
        if args.voltage_start:
            config.voltage_start = args.voltage_start
        if args.voltage_stop:
            config.voltage_stop = args.voltage_stop
        if args.voltage_step:
            config.voltage_step = args.voltage_step
        if args.frequency_start:
            config.frequency_start = args.frequency_start
        if args.frequency_stop:
            config.frequency_stop = args.frequency_stop
        if args.frequency_step:
            config.frequency_step = args.frequency_step
        if args.duration:
            config.benchmark_duration = args.duration
        if args.no_plots:
            config.enable_plotting = False
        if args.no_csv:
            config.export_csv = False
        if args.restart:
            config.restart_between_tests = True
        if args.warmup:
            config.warmup_time = args.warmup
        
        safety = SafetyLimits()
        
        # Run benchmark
        asyncio.run(app.run_benchmark(args.device, config, safety))
    
    elif args.command == 'analyze':
        # Load session
        session_file = app.sessions_dir / f"session_{args.session_id}.json"
        if not session_file.exists():
            print(f"Session not found: {args.session_id}")
            return
        
        with open(session_file, 'r') as f:
            session_data = json.load(f)
        
        print(f"\nSession {args.session_id}:")
        print(f"  Status: {session_data['status']}")
        print(f"  Tests: {len(session_data['results'])}")
        
        if session_data['results']:
            analyzer = DataAnalyzer()
            
            # Calculate statistics
            hashrates = [r['avg_hashrate'] for r in session_data['results']]
            efficiencies = [r['efficiency'] for r in session_data['results']]
            
            hr_stats = analyzer.calculate_statistics(hashrates)
            eff_stats = analyzer.calculate_statistics(efficiencies)
            
            print(f"\nHashrate Statistics:")
            print(f"  Mean: {hr_stats.mean:.1f} GH/s")
            print(f"  Std Dev: {hr_stats.std_dev:.1f}")
            print(f"  Range: {hr_stats.min_value:.1f} - {hr_stats.max_value:.1f}")
            
            print(f"\nEfficiency Statistics:")
            print(f"  Mean: {eff_stats.mean:.2f} J/TH")
            print(f"  Std Dev: {eff_stats.std_dev:.2f}")
            print(f"  Range: {eff_stats.min_value:.2f} - {eff_stats.max_value:.2f}")
    
    elif args.command == 'compare':
        # Load both sessions
        session1_file = app.sessions_dir / f"session_{args.session1}.json"
        session2_file = app.sessions_dir / f"session_{args.session2}.json"
        
        if not session1_file.exists():
            print(f"Session not found: {args.session1}")
            return
        if not session2_file.exists():
            print(f"Session not found: {args.session2}")
            return
        
        with open(session1_file, 'r') as f:
            session1 = json.load(f)
        with open(session2_file, 'r') as f:
            session2 = json.load(f)
        
        # Create comparison plot
        output_path = app.sessions_dir / f"comparison_{args.session1}_vs_{args.session2}.png"
        Visualizer.plot_comparison(
            session1['results'],
            session2['results'],
            f"Session {args.session1}",
            f"Session {args.session2}",
            output_path
        )
        
        print(f"Comparison plot saved to: {output_path}")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)

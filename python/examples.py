#!/usr/bin/env python3
"""
Example usage script demonstrating Bitaxe Benchmark Pro features

NOTE: All examples use fast mode by default (no restarts between tests).
The Bitaxe applies voltage/frequency changes instantly, making benchmarks ~80% faster!
Use --restart flag or 'paranoid' preset if you want restarts for maximum validation.
"""
import asyncio
from pathlib import Path

from config import (
    BenchmarkConfig, SafetyLimits, SearchStrategy, OptimizationGoal, PRESETS
)
from device_manager import DeviceManager
from benchmark_engine import BenchmarkEngine
from visualizer import Visualizer
from data_analyzer import DataAnalyzer


async def example_basic_benchmark():
    """Example 1: Basic benchmark with default settings"""
    print("=" * 60)
    print("Example 1: Basic Benchmark")
    print("=" * 60)
    
    # Setup
    device_manager = DeviceManager()
    device_manager.add_device("Test Bitaxe", "192.168.1.100", "supra")
    
    config = BenchmarkConfig()
    safety = SafetyLimits()
    sessions_dir = Path("./example_sessions")
    
    # Initialize devices
    await device_manager.initialize_all()
    
    # Create engine and run
    engine = BenchmarkEngine(config, safety, device_manager, sessions_dir)
    session = await engine.run_benchmark("Test Bitaxe")
    
    print(f"\nCompleted! Session ID: {session.session_id}")
    print(f"Best hashrate: {session.best_hashrate['avg_hashrate']:.1f} GH/s")
    
    # Cleanup
    await device_manager.cleanup_all()


async def example_quick_test():
    """Example 2: Quick test with preset"""
    print("=" * 60)
    print("Example 2: Quick Test (5-minute samples)")
    print("=" * 60)
    
    device_manager = DeviceManager()
    device_manager.add_device("Test Bitaxe", "192.168.1.100", "supra")
    
    # Use quick_test preset
    config = PRESETS['quick_test']
    safety = SafetyLimits()
    sessions_dir = Path("./example_sessions")
    
    await device_manager.initialize_all()
    
    engine = BenchmarkEngine(config, safety, device_manager, sessions_dir)
    session = await engine.run_benchmark("Test Bitaxe")
    
    print(f"\nQuick test complete!")
    await device_manager.cleanup_all()


async def example_efficiency_focused():
    """Example 3: Efficiency-focused optimization"""
    print("=" * 60)
    print("Example 3: Efficiency-Focused Optimization")
    print("=" * 60)
    
    device_manager = DeviceManager()
    device_manager.add_device("Test Bitaxe", "192.168.1.100", "supra")
    
    # Create custom efficiency config
    config = BenchmarkConfig(
        strategy=SearchStrategy.ADAPTIVE_GRID,
        optimization_goal=OptimizationGoal.MAX_EFFICIENCY,
        voltage_start=1100,
        voltage_stop=1250,
        voltage_step=15,
        frequency_start=450,
        frequency_stop=600,
        frequency_step=20,
        benchmark_duration=900  # 15 minutes per test
    )
    
    safety = SafetyLimits()
    sessions_dir = Path("./example_sessions")
    
    await device_manager.initialize_all()
    
    engine = BenchmarkEngine(config, safety, device_manager, sessions_dir)
    session = await engine.run_benchmark("Test Bitaxe")
    
    if session.best_efficiency:
        best = session.best_efficiency
        print(f"\nBest efficiency found:")
        print(f"  {best['voltage']}mV @ {best['frequency']}MHz")
        print(f"  {best['efficiency']:.2f} J/TH")
        print(f"  {best['avg_hashrate']:.1f} GH/s")
    
    await device_manager.cleanup_all()


async def example_multi_device():
    """Example 4: Multi-device testing"""
    print("=" * 60)
    print("Example 4: Multi-Device Testing")
    print("=" * 60)
    
    device_manager = DeviceManager()
    
    # Add multiple devices
    device_manager.add_device("Bitaxe 1", "192.168.1.100", "supra")
    device_manager.add_device("Bitaxe 2", "192.168.1.101", "supra")
    device_manager.add_device("Bitaxe 3", "192.168.1.102", "gamma")
    
    config = PRESETS['quick_test']
    safety = SafetyLimits()
    sessions_dir = Path("./example_sessions")
    
    await device_manager.initialize_all()
    
    engine = BenchmarkEngine(config, safety, device_manager, sessions_dir)
    
    # Test each device
    for device_name in device_manager.list_devices():
        print(f"\nTesting {device_name}...")
        session = await engine.run_benchmark(device_name)
        print(f"  Best: {session.best_hashrate['avg_hashrate']:.1f} GH/s")
    
    await device_manager.cleanup_all()


async def example_custom_search():
    """Example 5: Custom search strategy"""
    print("=" * 60)
    print("Example 5: Custom Binary Search")
    print("=" * 60)
    
    device_manager = DeviceManager()
    device_manager.add_device("Test Bitaxe", "192.168.1.100", "supra")
    
    # Custom config with binary search
    config = BenchmarkConfig(
        strategy=SearchStrategy.BINARY,
        voltage_start=1150,
        voltage_stop=1350,
        voltage_step=20,
        frequency_start=500,
        frequency_stop=700,
        frequency_step=25,
        benchmark_duration=600
    )
    
    safety = SafetyLimits()
    sessions_dir = Path("./example_sessions")
    
    await device_manager.initialize_all()
    
    engine = BenchmarkEngine(config, safety, device_manager, sessions_dir)
    session = await engine.run_benchmark("Test Bitaxe")
    
    print(f"\nBinary search complete!")
    print(f"Tests performed: {len(session.results)}")
    
    await device_manager.cleanup_all()


def example_data_analysis():
    """Example 6: Analyzing existing results"""
    print("=" * 60)
    print("Example 6: Data Analysis")
    print("=" * 60)
    
    # Load example session
    session_file = Path("./example_sessions/session_abc123.json")
    
    if not session_file.exists():
        print("No session file found for analysis")
        return
    
    import json
    with open(session_file, 'r') as f:
        session = json.load(f)
    
    analyzer = DataAnalyzer()
    
    # Extract data
    hashrates = [r['avg_hashrate'] for r in session['results']]
    efficiencies = [r['efficiency'] for r in session['results']]
    temps = [r['avg_temp'] for r in session['results']]
    
    # Calculate statistics
    hr_stats = analyzer.calculate_statistics(hashrates)
    eff_stats = analyzer.calculate_statistics(efficiencies)
    temp_stats = analyzer.calculate_statistics(temps)
    
    print("\nHashrate Statistics:")
    print(f"  Mean: {hr_stats.mean:.1f} GH/s")
    print(f"  Std Dev: {hr_stats.std_dev:.1f}")
    print(f"  Range: {hr_stats.min_value:.1f} - {hr_stats.max_value:.1f}")
    print(f"  95% CI: {hr_stats.confidence_interval_95}")
    print(f"  CV: {hr_stats.coefficient_of_variation:.2f}%")
    
    print("\nEfficiency Statistics:")
    print(f"  Mean: {eff_stats.mean:.2f} J/TH")
    print(f"  Best: {eff_stats.min_value:.2f} J/TH")
    print(f"  Worst: {eff_stats.max_value:.2f} J/TH")
    
    print("\nTemperature Statistics:")
    print(f"  Mean: {temp_stats.mean:.1f}°C")
    print(f"  Range: {temp_stats.min_value:.1f} - {temp_stats.max_value:.1f}°C")


def example_visualization():
    """Example 7: Creating visualizations"""
    print("=" * 60)
    print("Example 7: Generating Visualizations")
    print("=" * 60)
    
    session_file = Path("./example_sessions/session_abc123.json")
    
    if not session_file.exists():
        print("No session file found for visualization")
        return
    
    import json
    with open(session_file, 'r') as f:
        session = json.load(f)
    
    output_dir = Path("./example_plots")
    
    # Generate all plots
    Visualizer.create_all_plots(session['results'], output_dir)
    
    print(f"\nPlots saved to {output_dir}:")
    print("  - hashrate_heatmap.png")
    print("  - efficiency_curve.png")
    print("  - temperature_analysis.png")
    print("  - stability_analysis.png")
    print("  - power_curve_3d.png")


def example_comparison():
    """Example 8: Comparing two sessions"""
    print("=" * 60)
    print("Example 8: Session Comparison")
    print("=" * 60)
    
    session1_file = Path("./example_sessions/session_abc123.json")
    session2_file = Path("./example_sessions/session_def456.json")
    
    if not session1_file.exists() or not session2_file.exists():
        print("Session files not found for comparison")
        return
    
    import json
    with open(session1_file, 'r') as f:
        session1 = json.load(f)
    with open(session2_file, 'r') as f:
        session2 = json.load(f)
    
    # Compare
    analyzer = DataAnalyzer()
    comparison = analyzer.compare_configurations(
        session1['benchmark_config'],
        session2['benchmark_config'],
        session1['results'],
        session2['results']
    )
    
    print("\nComparison Results:")
    print(f"Winner: {comparison['winner']}")
    print("\nSession 1 Stats:")
    for key, value in comparison['stats1'].items():
        print(f"  {key}: {value:.2f}")
    print("\nSession 2 Stats:")
    for key, value in comparison['stats2'].items():
        print(f"  {key}: {value:.2f}")
    
    # Generate comparison plot
    output_file = Path("./comparison_plot.png")
    Visualizer.plot_comparison(
        session1['results'],
        session2['results'],
        "Session 1",
        "Session 2",
        output_file
    )
    print(f"\nComparison plot saved to {output_file}")


async def example_conservative_safe():
    """Example 9: Conservative safe testing"""
    print("=" * 60)
    print("Example 9: Conservative Safe Testing")
    print("=" * 60)
    
    device_manager = DeviceManager()
    device_manager.add_device("Test Bitaxe", "192.168.1.100", "supra")
    
    # Use conservative preset with tighter safety limits
    config = PRESETS['conservative']
    safety = SafetyLimits(
        max_chip_temp=60.0,    # Lower temp limit
        max_vr_temp=80.0,       # Lower VR temp
        max_voltage=1300,       # Lower max voltage
        max_power=35.0          # Lower power limit
    )
    
    sessions_dir = Path("./example_sessions")
    
    await device_manager.initialize_all()
    
    engine = BenchmarkEngine(config, safety, device_manager, sessions_dir)
    session = await engine.run_benchmark("Test Bitaxe")
    
    print(f"\nConservative test complete - all settings within safe limits")
    
    await device_manager.cleanup_all()


def print_menu():
    """Print example menu"""
    print("\n" + "=" * 60)
    print("Bitaxe Benchmark Pro - Examples")
    print("=" * 60)
    print()
    print("1. Basic Benchmark (default settings)")
    print("2. Quick Test (fast validation)")
    print("3. Efficiency-Focused Optimization")
    print("4. Multi-Device Testing")
    print("5. Custom Binary Search")
    print("6. Data Analysis (existing results)")
    print("7. Generate Visualizations")
    print("8. Compare Sessions")
    print("9. Conservative Safe Testing")
    print("0. Exit")
    print()


async def main():
    """Main menu"""
    while True:
        print_menu()
        choice = input("Select example (0-9): ").strip()
        
        if choice == '0':
            print("Goodbye!")
            break
        elif choice == '1':
            await example_basic_benchmark()
        elif choice == '2':
            await example_quick_test()
        elif choice == '3':
            await example_efficiency_focused()
        elif choice == '4':
            await example_multi_device()
        elif choice == '5':
            await example_custom_search()
        elif choice == '6':
            example_data_analysis()
        elif choice == '7':
            example_visualization()
        elif choice == '8':
            example_comparison()
        elif choice == '9':
            await example_conservative_safe()
        else:
            print("Invalid choice!")
        
        input("\nPress Enter to continue...")


if __name__ == '__main__':
    print("\n⚠️  WARNING: These examples will actually run benchmarks!")
    print("Make sure to update IP addresses before running.")
    print()
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")

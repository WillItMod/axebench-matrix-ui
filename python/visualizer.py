"""
Visualization and plotting for benchmark results
"""
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
from typing import List, Dict, Optional
from pathlib import Path
import logging
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)
sns.set_theme(style="whitegrid")


class Visualizer:
    """Create visualizations for benchmark data"""
    
    @staticmethod
    def plot_hashrate_heatmap(
        results: List[Dict],
        output_path: Path
    ):
        """Create heatmap of hashrate across voltage/frequency"""
        try:
            df = pd.DataFrame(results)
            
            # Pivot for heatmap
            pivot = df.pivot_table(
                values='avg_hashrate',
                index='frequency',
                columns='voltage',
                aggfunc='mean'
            )
            
            plt.figure(figsize=(12, 8))
            sns.heatmap(
                pivot,
                annot=True,
                fmt='.1f',
                cmap='RdYlGn',
                cbar_kws={'label': 'Hashrate (GH/s)'}
            )
            plt.title('Hashrate Heatmap: Voltage vs Frequency')
            plt.xlabel('Voltage (mV)')
            plt.ylabel('Frequency (MHz)')
            plt.tight_layout()
            plt.savefig(output_path, dpi=150)
            plt.close()
            
            logger.info(f"Saved hashrate heatmap to {output_path}")
            
        except Exception as e:
            logger.error(f"Error creating heatmap: {e}")
    
    @staticmethod
    def plot_efficiency_curve(
        results: List[Dict],
        output_path: Path
    ):
        """Plot efficiency (J/TH) vs hashrate"""
        try:
            df = pd.DataFrame(results)
            df = df.sort_values('avg_hashrate')
            
            fig, ax = plt.subplots(figsize=(12, 8))
            
            # Create scatter with color based on temperature
            scatter = ax.scatter(
                df['avg_hashrate'],
                df['efficiency'],
                c=df['avg_temp'],
                s=100,
                alpha=0.6,
                cmap='coolwarm'
            )
            
            # Add colorbar
            cbar = plt.colorbar(scatter, ax=ax)
            cbar.set_label('Temperature (°C)')
            
            # Add labels for best points
            best_eff_idx = df['efficiency'].idxmin()
            best_hr_idx = df['avg_hashrate'].idxmax()
            
            ax.annotate(
                'Best Efficiency',
                xy=(df.loc[best_eff_idx, 'avg_hashrate'], df.loc[best_eff_idx, 'efficiency']),
                xytext=(10, 10),
                textcoords='offset points',
                bbox=dict(boxstyle='round', facecolor='green', alpha=0.5),
                arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=0')
            )
            
            ax.annotate(
                'Best Hashrate',
                xy=(df.loc[best_hr_idx, 'avg_hashrate'], df.loc[best_hr_idx, 'efficiency']),
                xytext=(10, -20),
                textcoords='offset points',
                bbox=dict(boxstyle='round', facecolor='blue', alpha=0.5),
                arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=0')
            )
            
            ax.set_xlabel('Hashrate (GH/s)')
            ax.set_ylabel('Efficiency (J/TH)')
            ax.set_title('Power Efficiency Curve')
            ax.grid(True, alpha=0.3)
            
            plt.tight_layout()
            plt.savefig(output_path, dpi=150)
            plt.close()
            
            logger.info(f"Saved efficiency curve to {output_path}")
            
        except Exception as e:
            logger.error(f"Error creating efficiency curve: {e}")
    
    @staticmethod
    def plot_temperature_analysis(
        results: List[Dict],
        output_path: Path
    ):
        """Plot temperature vs performance metrics"""
        try:
            df = pd.DataFrame(results)
            
            fig, axes = plt.subplots(2, 2, figsize=(15, 12))
            
            # Temp vs Hashrate
            axes[0, 0].scatter(df['avg_temp'], df['avg_hashrate'], alpha=0.6)
            axes[0, 0].set_xlabel('Average Temperature (°C)')
            axes[0, 0].set_ylabel('Hashrate (GH/s)')
            axes[0, 0].set_title('Temperature vs Hashrate')
            axes[0, 0].grid(True, alpha=0.3)
            
            # Temp vs Power
            axes[0, 1].scatter(df['avg_temp'], df['avg_power'], alpha=0.6, color='orange')
            axes[0, 1].set_xlabel('Average Temperature (°C)')
            axes[0, 1].set_ylabel('Power (W)')
            axes[0, 1].set_title('Temperature vs Power')
            axes[0, 1].grid(True, alpha=0.3)
            
            # Temp vs Efficiency
            axes[1, 0].scatter(df['avg_temp'], df['efficiency'], alpha=0.6, color='green')
            axes[1, 0].set_xlabel('Average Temperature (°C)')
            axes[1, 0].set_ylabel('Efficiency (J/TH)')
            axes[1, 0].set_title('Temperature vs Efficiency')
            axes[1, 0].grid(True, alpha=0.3)
            
            # Temperature distribution
            axes[1, 1].hist(df['avg_temp'], bins=20, alpha=0.7, color='red')
            axes[1, 1].axvline(df['avg_temp'].mean(), color='black', linestyle='--', label='Mean')
            axes[1, 1].set_xlabel('Temperature (°C)')
            axes[1, 1].set_ylabel('Frequency')
            axes[1, 1].set_title('Temperature Distribution')
            axes[1, 1].legend()
            axes[1, 1].grid(True, alpha=0.3)
            
            plt.tight_layout()
            plt.savefig(output_path, dpi=150)
            plt.close()
            
            logger.info(f"Saved temperature analysis to {output_path}")
            
        except Exception as e:
            logger.error(f"Error creating temperature analysis: {e}")
    
    @staticmethod
    def plot_stability_analysis(
        results: List[Dict],
        output_path: Path
    ):
        """Plot stability scores and variance"""
        try:
            df = pd.DataFrame(results)
            
            fig, axes = plt.subplots(2, 2, figsize=(15, 12))
            
            # Stability score distribution
            axes[0, 0].hist(df['stability_score'], bins=20, alpha=0.7, color='blue')
            axes[0, 0].axvline(df['stability_score'].mean(), color='red', linestyle='--', label='Mean')
            axes[0, 0].set_xlabel('Stability Score')
            axes[0, 0].set_ylabel('Frequency')
            axes[0, 0].set_title('Stability Score Distribution')
            axes[0, 0].legend()
            axes[0, 0].grid(True, alpha=0.3)
            
            # Hashrate variance vs average
            axes[0, 1].scatter(df['avg_hashrate'], df['hashrate_variance'], alpha=0.6)
            axes[0, 1].set_xlabel('Average Hashrate (GH/s)')
            axes[0, 1].set_ylabel('Hashrate Variance')
            axes[0, 1].set_title('Hashrate Stability')
            axes[0, 1].grid(True, alpha=0.3)
            
            # Stability vs Efficiency
            axes[1, 0].scatter(df['stability_score'], df['efficiency'], alpha=0.6, color='green')
            axes[1, 0].set_xlabel('Stability Score')
            axes[1, 0].set_ylabel('Efficiency (J/TH)')
            axes[1, 0].set_title('Stability vs Efficiency')
            axes[1, 0].grid(True, alpha=0.3)
            
            # Top configurations by stability
            top_stable = df.nlargest(10, 'stability_score')
            labels = [f"{row['voltage']}mV@{row['frequency']}MHz" 
                     for _, row in top_stable.iterrows()]
            axes[1, 1].barh(range(len(top_stable)), top_stable['stability_score'])
            axes[1, 1].set_yticks(range(len(top_stable)))
            axes[1, 1].set_yticklabels(labels)
            axes[1, 1].set_xlabel('Stability Score')
            axes[1, 1].set_title('Top 10 Most Stable Configurations')
            axes[1, 1].grid(True, alpha=0.3)
            
            plt.tight_layout()
            plt.savefig(output_path, dpi=150)
            plt.close()
            
            logger.info(f"Saved stability analysis to {output_path}")
            
        except Exception as e:
            logger.error(f"Error creating stability analysis: {e}")
    
    @staticmethod
    def plot_power_curve_3d(
        results: List[Dict],
        output_path: Path
    ):
        """Create 3D plot of voltage, frequency, hashrate"""
        try:
            from mpl_toolkits.mplot3d import Axes3D
            
            df = pd.DataFrame(results)
            
            fig = plt.figure(figsize=(12, 9))
            ax = fig.add_subplot(111, projection='3d')
            
            scatter = ax.scatter(
                df['voltage'],
                df['frequency'],
                df['avg_hashrate'],
                c=df['efficiency'],
                s=100,
                alpha=0.6,
                cmap='viridis'
            )
            
            ax.set_xlabel('Voltage (mV)')
            ax.set_ylabel('Frequency (MHz)')
            ax.set_zlabel('Hashrate (GH/s)')
            ax.set_title('3D Performance Landscape')
            
            cbar = plt.colorbar(scatter, ax=ax, pad=0.1)
            cbar.set_label('Efficiency (J/TH)')
            
            plt.tight_layout()
            plt.savefig(output_path, dpi=150)
            plt.close()
            
            logger.info(f"Saved 3D power curve to {output_path}")
            
        except Exception as e:
            logger.error(f"Error creating 3D plot: {e}")
    
    @staticmethod
    def plot_comparison(
        results1: List[Dict],
        results2: List[Dict],
        label1: str,
        label2: str,
        output_path: Path
    ):
        """Compare two benchmark sessions"""
        try:
            df1 = pd.DataFrame(results1)
            df2 = pd.DataFrame(results2)
            
            fig, axes = plt.subplots(2, 2, figsize=(15, 12))
            
            # Hashrate comparison
            axes[0, 0].hist(df1['avg_hashrate'], alpha=0.5, label=label1, bins=20)
            axes[0, 0].hist(df2['avg_hashrate'], alpha=0.5, label=label2, bins=20)
            axes[0, 0].set_xlabel('Hashrate (GH/s)')
            axes[0, 0].set_ylabel('Frequency')
            axes[0, 0].set_title('Hashrate Distribution')
            axes[0, 0].legend()
            axes[0, 0].grid(True, alpha=0.3)
            
            # Efficiency comparison
            axes[0, 1].hist(df1['efficiency'], alpha=0.5, label=label1, bins=20)
            axes[0, 1].hist(df2['efficiency'], alpha=0.5, label=label2, bins=20)
            axes[0, 1].set_xlabel('Efficiency (J/TH)')
            axes[0, 1].set_ylabel('Frequency')
            axes[0, 1].set_title('Efficiency Distribution')
            axes[0, 1].legend()
            axes[0, 1].grid(True, alpha=0.3)
            
            # Temperature comparison
            axes[1, 0].hist(df1['avg_temp'], alpha=0.5, label=label1, bins=20)
            axes[1, 0].hist(df2['avg_temp'], alpha=0.5, label=label2, bins=20)
            axes[1, 0].set_xlabel('Temperature (°C)')
            axes[1, 0].set_ylabel('Frequency')
            axes[1, 0].set_title('Temperature Distribution')
            axes[1, 0].legend()
            axes[1, 0].grid(True, alpha=0.3)
            
            # Summary statistics
            stats_text = f"""
            {label1}:
              Avg Hashrate: {df1['avg_hashrate'].mean():.1f} GH/s
              Avg Efficiency: {df1['efficiency'].mean():.2f} J/TH
              Avg Temp: {df1['avg_temp'].mean():.1f}°C
            
            {label2}:
              Avg Hashrate: {df2['avg_hashrate'].mean():.1f} GH/s
              Avg Efficiency: {df2['efficiency'].mean():.2f} J/TH
              Avg Temp: {df2['avg_temp'].mean():.1f}°C
            """
            
            axes[1, 1].text(0.1, 0.5, stats_text, fontsize=12, family='monospace')
            axes[1, 1].axis('off')
            axes[1, 1].set_title('Summary Statistics')
            
            plt.tight_layout()
            plt.savefig(output_path, dpi=150)
            plt.close()
            
            logger.info(f"Saved comparison plot to {output_path}")
            
        except Exception as e:
            logger.error(f"Error creating comparison plot: {e}")
    
    @staticmethod
    def create_all_plots(results: List[Dict], output_dir: Path):
        """Create all visualization types"""
        output_dir.mkdir(parents=True, exist_ok=True)
        
        if not results or len(results) < 2:
            logger.warning("Insufficient results for plotting")
            return
        
        Visualizer.plot_hashrate_heatmap(results, output_dir / "hashrate_heatmap.png")
        Visualizer.plot_efficiency_curve(results, output_dir / "efficiency_curve.png")
        Visualizer.plot_temperature_analysis(results, output_dir / "temperature_analysis.png")
        Visualizer.plot_stability_analysis(results, output_dir / "stability_analysis.png")
        Visualizer.plot_power_curve_3d(results, output_dir / "power_curve_3d.png")
        
        logger.info(f"All plots saved to {output_dir}")

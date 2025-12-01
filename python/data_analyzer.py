"""
Data analysis and statistics for benchmark results
"""
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional
from scipy import stats
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class StatisticalSummary:
    """Statistical summary of benchmark data"""
    mean: float
    median: float
    std_dev: float
    variance: float
    min_value: float
    max_value: float
    q25: float
    q75: float
    iqr: float
    confidence_interval_95: Tuple[float, float]
    coefficient_of_variation: float  # CV = std_dev / mean


class DataAnalyzer:
    """Advanced data analysis for benchmark results"""
    
    @staticmethod
    def remove_outliers_iqr(
        data: List[float],
        multiplier: float = 1.5
    ) -> Tuple[List[float], List[int]]:
        """
        Remove outliers using Interquartile Range method
        
        Returns: (cleaned_data, outlier_indices)
        """
        if len(data) < 4:
            return data, []
        
        arr = np.array(data)
        q1 = np.percentile(arr, 25)
        q3 = np.percentile(arr, 75)
        iqr = q3 - q1
        
        lower_bound = q1 - multiplier * iqr
        upper_bound = q3 + multiplier * iqr
        
        mask = (arr >= lower_bound) & (arr <= upper_bound)
        outlier_indices = [i for i, m in enumerate(mask) if not m]
        cleaned = arr[mask].tolist()
        
        logger.debug(f"Removed {len(outlier_indices)} outliers using IQR method")
        return cleaned, outlier_indices
    
    @staticmethod
    def remove_outliers_zscore(
        data: List[float],
        threshold: float = 3.0
    ) -> Tuple[List[float], List[int]]:
        """
        Remove outliers using Z-score method
        
        Returns: (cleaned_data, outlier_indices)
        """
        if len(data) < 4:
            return data, []
        
        arr = np.array(data)
        z_scores = np.abs(stats.zscore(arr))
        
        mask = z_scores < threshold
        outlier_indices = [i for i, m in enumerate(mask) if not m]
        cleaned = arr[mask].tolist()
        
        logger.debug(f"Removed {len(outlier_indices)} outliers using Z-score method")
        return cleaned, outlier_indices
    
    @staticmethod
    def calculate_statistics(data: List[float]) -> Optional[StatisticalSummary]:
        """Calculate comprehensive statistics"""
        if not data or len(data) < 2:
            return None
        
        arr = np.array(data)
        mean = np.mean(arr)
        median = np.median(arr)
        std_dev = np.std(arr, ddof=1)
        variance = np.var(arr, ddof=1)
        
        q25 = np.percentile(arr, 25)
        q75 = np.percentile(arr, 75)
        iqr = q75 - q25
        
        # Calculate 95% confidence interval
        sem = stats.sem(arr)
        ci = stats.t.interval(0.95, len(arr)-1, loc=mean, scale=sem)
        
        # Coefficient of variation
        cv = (std_dev / mean * 100) if mean != 0 else 0
        
        return StatisticalSummary(
            mean=float(mean),
            median=float(median),
            std_dev=float(std_dev),
            variance=float(variance),
            min_value=float(np.min(arr)),
            max_value=float(np.max(arr)),
            q25=float(q25),
            q75=float(q75),
            iqr=float(iqr),
            confidence_interval_95=ci,
            coefficient_of_variation=float(cv)
        )
    
    @staticmethod
    def detect_stuck_readings(
        data: List[float],
        consecutive_threshold: int = 5,
        tolerance: float = 0.01
    ) -> bool:
        """
        Detect if readings are stuck (same value repeated)
        
        Returns: True if stuck readings detected
        """
        if len(data) < consecutive_threshold:
            return False
        
        for i in range(len(data) - consecutive_threshold + 1):
            window = data[i:i + consecutive_threshold]
            if all(abs(x - window[0]) < tolerance for x in window):
                logger.warning(f"Stuck readings detected: {window[0]} repeated {consecutive_threshold} times")
                return True
        
        return False
    
    @staticmethod
    def calculate_stability_score(
        hashrate_data: List[float],
        temperature_data: List[float],
        power_data: List[float]
    ) -> float:
        """
        Calculate overall stability score (0-100)
        
        Higher score = more stable
        """
        scores = []
        
        # Hashrate stability (CV)
        if hashrate_data:
            hr_stats = DataAnalyzer.calculate_statistics(hashrate_data)
            if hr_stats:
                # Lower CV = more stable, normalize to 0-100
                hr_score = max(0, 100 - hr_stats.coefficient_of_variation * 10)
                scores.append(hr_score)
        
        # Temperature stability
        if temperature_data:
            temp_stats = DataAnalyzer.calculate_statistics(temperature_data)
            if temp_stats:
                # Lower variance = more stable
                temp_score = max(0, 100 - temp_stats.variance * 2)
                scores.append(temp_score)
        
        # Power stability
        if power_data:
            power_stats = DataAnalyzer.calculate_statistics(power_data)
            if power_stats:
                power_score = max(0, 100 - power_stats.coefficient_of_variation * 10)
                scores.append(power_score)
        
        if not scores:
            return 0.0
        
        return float(np.mean(scores))
    
    @staticmethod
    def predict_thermal_trend(
        temperature_data: List[float],
        window_size: int = 5
    ) -> Tuple[float, bool]:
        """
        Predict thermal trend using linear regression
        
        Returns: (predicted_slope, is_heating_up)
        """
        if len(temperature_data) < window_size:
            return 0.0, False
        
        recent_temps = temperature_data[-window_size:]
        x = np.arange(len(recent_temps))
        y = np.array(recent_temps)
        
        # Linear regression
        slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
        
        is_heating = slope > 0.1  # Increasing more than 0.1°C per sample
        
        return float(slope), is_heating
    
    @staticmethod
    def calculate_efficiency_score(
        hashrate: float,
        power: float,
        target_efficiency: float = 20.0
    ) -> float:
        """
        Calculate efficiency score compared to target
        
        Returns: Score 0-100 (100 = meets target)
        """
        if power <= 0:
            return 0.0
        
        # J/TH = W / (GH/s) = W / (TH/s * 1000)
        j_per_th = (power / (hashrate / 1000)) if hashrate > 0 else float('inf')
        
        # Lower J/TH is better
        score = (target_efficiency / j_per_th) * 100 if j_per_th > 0 else 0
        return min(100.0, max(0.0, score))
    
    @staticmethod
    def rank_results(
        results: List[Dict],
        primary_metric: str = "avg_hashrate",
        secondary_metric: str = "efficiency",
        ascending_primary: bool = False,
        ascending_secondary: bool = True
    ) -> List[Dict]:
        """
        Rank results by multiple metrics
        
        Returns: Sorted list of results
        """
        if not results:
            return []
        
        df = pd.DataFrame(results)
        
        # Sort by primary then secondary
        df_sorted = df.sort_values(
            by=[primary_metric, secondary_metric],
            ascending=[ascending_primary, ascending_secondary]
        )
        
        return df_sorted.to_dict('records')
    
    @staticmethod
    def calculate_power_curve(
        results: List[Dict]
    ) -> pd.DataFrame:
        """
        Calculate power curve (hashrate vs efficiency)
        
        Returns: DataFrame with curve data
        """
        if not results:
            return pd.DataFrame()
        
        df = pd.DataFrame(results)
        
        # Add efficiency if not present
        if 'efficiency' not in df.columns and 'avg_hashrate' in df.columns and 'avg_power' in df.columns:
            df['efficiency'] = df.apply(
                lambda row: (row['avg_power'] / (row['avg_hashrate'] / 1000))
                if row['avg_hashrate'] > 0 else float('inf'),
                axis=1
            )
        
        # Sort by hashrate
        df_sorted = df.sort_values('avg_hashrate')
        
        return df_sorted[['voltage', 'frequency', 'avg_hashrate', 'efficiency', 'avg_temp']]
    
    @staticmethod
    def export_to_csv(
        results: List[Dict],
        filepath: str,
        include_raw_data: bool = False
    ):
        """Export results to CSV"""
        if not results:
            logger.warning("No results to export")
            return
        
        df = pd.DataFrame(results)
        
        # Select columns to export
        base_columns = [
            'timestamp', 'device_name', 'voltage', 'frequency',
            'avg_hashrate', 'hashrate_variance', 'avg_temp', 'max_temp',
            'avg_power', 'efficiency', 'stability_score'
        ]
        
        export_columns = [col for col in base_columns if col in df.columns]
        
        df[export_columns].to_csv(filepath, index=False)
        logger.info(f"Exported {len(df)} results to {filepath}")
    
    @staticmethod
    def compare_configurations(
        config1: Dict,
        config2: Dict,
        results1: List[Dict],
        results2: List[Dict]
    ) -> Dict:
        """
        Compare two configuration results
        
        Returns: Comparison statistics
        """
        comparison = {
            'config1': config1,
            'config2': config2,
            'stats1': {},
            'stats2': {},
            'winner': None
        }
        
        # Calculate average metrics for each
        for key, results in [('stats1', results1), ('stats2', results2)]:
            if results:
                df = pd.DataFrame(results)
                comparison[key] = {
                    'avg_hashrate': df['avg_hashrate'].mean(),
                    'avg_efficiency': df['efficiency'].mean(),
                    'avg_stability': df['stability_score'].mean(),
                    'max_hashrate': df['avg_hashrate'].max(),
                    'best_efficiency': df['efficiency'].min(),
                }
        
        # Determine winner
        if comparison['stats1'] and comparison['stats2']:
            score1 = (
                comparison['stats1']['avg_hashrate'] * 0.4 +
                (1 / comparison['stats1']['avg_efficiency']) * 0.3 +
                comparison['stats1']['avg_stability'] * 0.3
            )
            score2 = (
                comparison['stats2']['avg_hashrate'] * 0.4 +
                (1 / comparison['stats2']['avg_efficiency']) * 0.3 +
                comparison['stats2']['avg_stability'] * 0.3
            )
            
            comparison['winner'] = 'config1' if score1 > score2 else 'config2'
        
        return comparison

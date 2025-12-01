/**
 * Format difficulty value with M/G/T units
 * @param difficulty - Raw difficulty number
 * @returns Formatted string with appropriate unit (e.g., "292M", "1.5G", "2.3T")
 */
export function formatDifficulty(difficulty: number): string {
  if (difficulty === 0) return '0';
  
  const trillion = 1_000_000_000_000;
  const billion = 1_000_000_000;
  const million = 1_000_000;
  
  if (difficulty >= trillion) {
    return `${(difficulty / trillion).toFixed(1)}T`;
  } else if (difficulty >= billion) {
    return `${(difficulty / billion).toFixed(1)}G`;
  } else if (difficulty >= million) {
    return `${(difficulty / million).toFixed(0)}M`;
  } else {
    return difficulty.toLocaleString();
  }
}

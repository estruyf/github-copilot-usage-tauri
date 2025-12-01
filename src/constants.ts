// Usage percentage thresholds for color changes
export const USAGE_THRESHOLD_ORANGE = 75;
export const USAGE_THRESHOLD_RED = 95;

// Tray icon color values
export type TrayIconColor = 'default' | 'orange' | 'red';

export function getUsageColor(percent: number): TrayIconColor {
  if (percent > USAGE_THRESHOLD_RED) return 'red';
  if (percent > USAGE_THRESHOLD_ORANGE) return 'orange';
  return 'default';
}

export function getUsageColorClass(percent: number): string {
  if (percent > USAGE_THRESHOLD_RED) return 'usage-red';
  if (percent > USAGE_THRESHOLD_ORANGE) return 'usage-orange';
  return '';
}

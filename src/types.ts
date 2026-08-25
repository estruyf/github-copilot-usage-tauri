export interface CopilotUsage {
  premium_requests_used: number;
  premium_requests_limit: number;
  standard_requests_used: number;
  standard_requests_limit: number;
  billing_cycle_start: string;
  billing_cycle_end: string;
  /** Raw `copilot_plan` from the API, e.g. `individual_max`, `business`. */
  plan: string | null;
  /** Raw `access_type_sku`, the more specific entitlement behind the plan. */
  plan_sku: string | null;
  /** Organisations the seat comes from, for business/enterprise plans. */
  organizations: string[];
}

export interface UsagePercentage {
  premium: number;
  standard: number;
}

/** Which service the tray icon and window are currently showing. */
export type UsageSource = 'copilot' | 'claude';

export const USAGE_SOURCE_LABELS: Record<UsageSource, string> = {
  copilot: 'GitHub Copilot',
  claude: 'Claude',
};

/** One Claude rate-limit window, e.g. the 5-hour session or the weekly allowance. */
export interface ClaudeUsageWindow {
  /** Stable key from the API, e.g. `session`, `weekly_all`, `weekly_scoped`. */
  key: string;
  /** Human readable name, e.g. "Session (5h)". */
  label: string;
  /** 0-100. */
  percent: number;
  /** ISO timestamp of when this window resets, when the API reports one. */
  resets_at: string | null;
}

export interface ClaudeUsage {
  windows: ClaudeUsageWindow[];
}

export interface ClaudeStatus {
  available: boolean;
  subscription_type: string | null;
  expired: boolean;
  reason: string | null;
}

import { invoke } from "@tauri-apps/api/core";
import type { CopilotUsage } from "../types";

function toNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toStringOrNull(value: any): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function toIsoString(value: any): string {
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  } catch {
    return "";
  }
}

export async function fetchCopilotUsage(token: string): Promise<CopilotUsage> {
  const response = await invoke<string>("fetch_copilot_usage", { token });
  const parsed = JSON.parse(response);

  const quotaSnapshots =
    parsed?.userInfo?.quota_snapshots ??
    parsed?.quota_snapshots ??
    parsed?.user_info?.quota_snapshots ??
    null;

  const premium = quotaSnapshots?.premium_interactions ?? null;
  const standard = quotaSnapshots?.completions ?? null;

  const premium_entitlement = premium
    ? toNumber(
        premium.entitlement ?? premium.remaining ?? premium.quota_remaining ?? 0
      )
    : 0;
  const premium_remaining = premium
    ? toNumber(premium.remaining ?? premium.quota_remaining ?? 0)
    : 0;

  const standard_entitlement = standard
    ? toNumber(
        standard.entitlement ??
          standard.remaining ??
          standard.quota_remaining ??
          0
      )
    : 0;
  const standard_remaining = standard
    ? toNumber(standard.remaining ?? standard.quota_remaining ?? 0)
    : 0;

  // `credits_used` is the exact consumed count; the entitlement/remaining pair is rounded,
  // so it can be off by one. Fall back to it for accounts without token based billing.
  const premium_used = premium?.credits_used != null
    ? toNumber(premium.credits_used)
    : Math.max(0, premium_entitlement - premium_remaining);
  const standard_used = standard?.credits_used != null
    ? toNumber(standard.credits_used)
    : Math.max(0, standard_entitlement - standard_remaining);

  const info = parsed?.userInfo ?? parsed?.user_info ?? parsed;

  const plan = toStringOrNull(info?.copilot_plan ?? parsed?.copilot_plan);
  const plan_sku = toStringOrNull(info?.access_type_sku ?? parsed?.access_type_sku);
  const organizationList =
    info?.organization_login_list ?? parsed?.organization_login_list ?? [];
  const organizations = Array.isArray(organizationList)
    ? organizationList.map((org: any) => String(org)).filter(Boolean)
    : [];

  const billing_cycle_start =
    parsed?.billing_cycle_start ?? parsed?.userInfo?.billing_cycle_start ?? "";
  const billing_cycle_end =
    parsed?.quota_reset_date ??
    parsed?.userInfo?.quota_reset_date ??
    parsed?.quota_reset_date_utc ??
    "";

  return {
    premium_requests_used: premium_used,
    premium_requests_limit: premium_entitlement,
    standard_requests_used: standard_used,
    standard_requests_limit: standard_entitlement,
    billing_cycle_start: toIsoString(billing_cycle_start),
    billing_cycle_end: toIsoString(billing_cycle_end),
    plan,
    plan_sku,
    organizations,
  };
}

/** Friendly names for the `copilot_plan` values the API reports. */
const PLAN_LABELS: Record<string, string> = {
  free: "Copilot Free",
  individual: "Copilot Pro",
  individual_pro: "Copilot Pro",
  individual_max: "Copilot Pro+",
  business: "Copilot Business",
  enterprise: "Copilot Enterprise",
};

/**
 * The licence to show in the UI. Unknown plan values are title-cased rather than hidden,
 * since GitHub adds new ones from time to time.
 */
export function formatCopilotPlan(usage: CopilotUsage | null): string | null {
  if (!usage) return null;

  const plan = usage.plan;
  if (!plan) return usage.plan_sku ? titleCase(usage.plan_sku) : null;

  return PLAN_LABELS[plan] ?? `Copilot ${titleCase(plan)}`;
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function calculatePercentage(used: number, limit: number): number {
  if (!limit || limit === 0) return 0;
  return Math.round((used / limit) * 100);
}

export function getStoredToken(): string | null {
  return localStorage.getItem("github_token");
}

export function storeToken(token: string): void {
  localStorage.setItem("github_token", token);
}

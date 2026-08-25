import { invoke } from "@tauri-apps/api/core";
import type { ClaudeStatus, ClaudeUsage, ClaudeUsageWindow } from "../types";

/** Friendly names for the limit kinds the usage endpoint reports. */
const WINDOW_LABELS: Record<string, string> = {
  session: "Session (5h)",
  weekly_all: "Weekly",
  weekly_scoped: "Weekly (model)",
};

function toPercent(value: any): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toResetsAt(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * The endpoint reports the same numbers twice: a modern `limits` array and the older
 * `five_hour` / `seven_day` objects. Prefer `limits` (it carries the scoped model windows
 * too) and fall back to the legacy fields when it is missing or empty.
 */
function parseWindows(parsed: any): ClaudeUsageWindow[] {
  const limits = Array.isArray(parsed?.limits) ? parsed.limits : [];

  const fromLimits: ClaudeUsageWindow[] = limits
    .filter((limit: any) => limit && limit.percent !== null && limit.percent !== undefined)
    .map((limit: any) => {
      const kind = String(limit.kind ?? "");
      // Scoped windows name the model they apply to, e.g. "Weekly (Opus)".
      const scopeName = limit?.scope?.model?.display_name;
      const label =
        kind === "weekly_scoped" && scopeName
          ? `Weekly (${scopeName})`
          : WINDOW_LABELS[kind] ?? kind.replace(/_/g, " ");

      return {
        key: kind || label,
        label,
        percent: toPercent(limit.percent),
        resets_at: toResetsAt(limit.resets_at),
      };
    });

  if (fromLimits.length > 0) return fromLimits;

  const legacy: Array<[string, string, any]> = [
    ["session", "Session (5h)", parsed?.five_hour],
    ["weekly_all", "Weekly", parsed?.seven_day],
  ];

  return legacy
    .filter(([, , window]) => window && window.utilization !== null && window.utilization !== undefined)
    .map(([key, label, window]) => ({
      key,
      label,
      percent: toPercent(window.utilization),
      resets_at: toResetsAt(window.resets_at),
    }));
}

export async function fetchClaudeUsage(): Promise<ClaudeUsage> {
  const response = await invoke<string>("fetch_claude_usage");
  const parsed = JSON.parse(response);

  return { windows: parseWindows(parsed) };
}

export async function getClaudeStatus(): Promise<ClaudeStatus> {
  return await invoke<ClaudeStatus>("claude_status");
}

/**
 * The number shown in the menu bar: the window closest to its limit, since that is the
 * one that will actually cut you off. The dropdown breaks every window out individually.
 */
export function primaryWindow(usage: ClaudeUsage | null): ClaudeUsageWindow | null {
  if (!usage || usage.windows.length === 0) return null;
  return usage.windows.reduce((highest, window) =>
    window.percent > highest.percent ? window : highest
  );
}

export function formatResetsAt(resetsAt: string | null): string | null {
  if (!resetsAt) return null;

  const reset = new Date(resetsAt);
  const hoursAway = (reset.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursAway < 0) return "now";

  // Within a day the clock time is what matters; beyond that, the day is.
  return hoursAway < 24
    ? reset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : reset.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

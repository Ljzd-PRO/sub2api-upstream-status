import type {
  HealthStatus,
  PanelAccountStatus,
  PanelAccountTotals,
  PanelConcurrency,
  PanelSummary,
  PanelUsageWindow,
  PanelWindowTotals,
  Sub2APIAccount,
  Sub2APIAccountStats,
  Sub2APIWindowStats,
  Sub2APIUsageInfo,
  Sub2APIUsageProgress,
  UsageSource,
  WindowState
} from "@/lib/types";

const FIVE_HOUR_SECONDS = 5 * 60 * 60;
const SEVEN_DAY_SECONDS = 7 * 24 * 60 * 60;

export function shouldFetchPassiveUsage(account: Sub2APIAccount): boolean {
  const platform = account.platform.toLowerCase();
  const type = account.type.toLowerCase();
  return platform === "anthropic" && (type === "oauth" || type === "setup-token");
}

export function shouldFetchActiveUsage(account: Sub2APIAccount): boolean {
  return account.platform.toLowerCase() === "openai" && account.type.toLowerCase() === "oauth";
}

export function buildOpenAIUsageFromExtra(
  account: Sub2APIAccount,
  now: Date = new Date()
): Sub2APIUsageInfo | null {
  if (account.platform.toLowerCase() !== "openai" || account.type.toLowerCase() !== "oauth") {
    return null;
  }

  const extra = account.extra ?? {};
  const fiveHour = buildCodexProgress(extra, "5h", now);
  const sevenDay = buildCodexProgress(extra, "7d", now);

  if (!fiveHour && !sevenDay) return null;

  return {
    source: "passive",
    updated_at: parseDateLike(extra.codex_usage_updated_at)?.toISOString() ?? account.updated_at ?? null,
    five_hour: fiveHour,
    seven_day: sevenDay
  };
}

export function normalizeAccount(
  account: Sub2APIAccount,
  usage: Sub2APIUsageInfo | null,
  usageError: string | null,
  now: Date = new Date(),
  todayStats: Sub2APIAccountStats | null = null
): PanelAccountStatus {
  const source: UsageSource =
    account.platform.toLowerCase() === "openai" && usage && usage.source !== "active"
      ? "account-extra"
      : usage?.source ?? "none";

  const fiveHour = normalizeWindow("5h", "5h window", usage?.five_hour ?? null, source, now);
  const sevenDay = normalizeWindow("7d", "7d window", usage?.seven_day ?? null, source, now);
  const { health, reason } = deriveHealth(account, fiveHour, sevenDay, usageError, now);

  return {
    id: account.id,
    name: account.name || `Account ${account.id}`,
    platform: account.platform,
    type: account.type,
    status: account.status,
    schedulable: Boolean(account.schedulable),
    health,
    healthReason: reason,
    errorMessage: account.error_message || null,
    lastUsedAt: account.last_used_at || null,
    updatedAt: usage?.updated_at || account.updated_at || null,
    rateLimitResetAt: account.rate_limit_reset_at || null,
    concurrency: normalizeConcurrency(account),
    windows: {
      fiveHour,
      sevenDay
    },
    today: normalizeTotals(todayStats),
    usageError: usage?.error || usageError
  };
}

export function buildSummary(accounts: PanelAccountStatus[]): PanelSummary {
  const fiveHour = summarizeWindow(accounts, "fiveHour");
  const sevenDay = summarizeWindow(accounts, "sevenDay");

  return {
    total: accounts.length,
    active: accounts.filter((account) => account.status === "active").length,
    schedulable: accounts.filter((account) => account.schedulable).length,
    warning: accounts.filter((account) => account.health === "warning").length,
    exhausted: accounts.filter((account) => account.health === "exhausted").length,
    unavailable: accounts.filter((account) => account.health === "unavailable").length,
    partialErrors: accounts.filter((account) => account.usageError).length,
    requests: accounts.reduce((sum, account) => sum + account.today.requests, 0),
    tokens: accounts.reduce((sum, account) => sum + account.today.tokens, 0),
    fiveHour,
    sevenDay
  };
}

function summarizeWindow(
  accounts: PanelAccountStatus[],
  key: "fiveHour" | "sevenDay"
): PanelWindowTotals {
  return accounts.reduce<PanelWindowTotals>(
    (totals, account) => {
      const stats = account.windows[key].stats;
      if (!stats) return totals;

      return {
        availableAccounts: totals.availableAccounts + 1,
        requests: totals.requests + Math.max(0, Math.floor(numberFromUnknown(stats.requests) ?? 0)),
        tokens: totals.tokens + Math.max(0, Math.floor(numberFromUnknown(stats.tokens ?? stats.total_tokens) ?? 0)),
        cost: totals.cost + (numberFromUnknown(stats.cost) ?? 0),
        standardCost: totals.standardCost + (numberFromUnknown(stats.standard_cost) ?? 0),
        userCost: totals.userCost + (numberFromUnknown(stats.user_cost) ?? 0)
      };
    },
    {
      availableAccounts: 0,
      requests: 0,
      tokens: 0,
      cost: 0,
      standardCost: 0,
      userCost: 0
    }
  );
}

function normalizeTotals(stats: Sub2APIAccountStats | null): PanelAccountTotals {
  if (!stats) {
    return {
      available: false,
      requests: 0,
      tokens: 0,
      cost: 0,
      standardCost: 0,
      userCost: 0
    };
  }

  return {
    available: true,
    requests: Math.max(0, Math.floor(numberFromUnknown(stats.requests) ?? 0)),
    tokens: Math.max(0, Math.floor(numberFromUnknown(stats.tokens) ?? 0)),
    cost: numberFromUnknown(stats.cost) ?? 0,
    standardCost: numberFromUnknown(stats.standard_cost) ?? 0,
    userCost: numberFromUnknown(stats.user_cost) ?? 0
  };
}

export function normalizeConcurrency(account: Sub2APIAccount): PanelConcurrency {
  const record = account as unknown as Record<string, unknown>;
  const extra = (account.extra ?? {}) as Record<string, unknown>;
  const limit = integerFromFirst(
    account.concurrency,
    record.concurrency_limit,
    record.max_concurrency,
    record.parallel_limit,
    record.max_parallel_requests,
    extra.concurrency,
    extra.concurrency_limit,
    extra.max_concurrency
  );
  const used = integerFromFirst(
    account.current_concurrency,
    account.used_concurrency,
    account.active_concurrency,
    account.in_flight_requests,
    account.running_requests,
    record.current_requests,
    record.active_requests,
    record.busy_requests,
    record.inflight_requests,
    extra.current_concurrency,
    extra.used_concurrency,
    extra.active_concurrency,
    extra.in_flight_requests,
    extra.running_requests
  );

  if (limit == null && used == null) {
    return {
      available: false,
      used: null,
      limit: null,
      utilization: null,
      state: "unknown"
    };
  }

  const safeLimit = limit == null ? null : Math.max(0, limit);
  const safeUsed = used == null ? null : Math.max(0, used);
  const utilization =
    safeLimit && safeLimit > 0 && safeUsed != null
      ? roundOne(Math.min(100, (safeUsed / safeLimit) * 100))
      : null;

  return {
    available: true,
    used: safeUsed,
    limit: safeLimit,
    utilization,
    state: utilization == null ? "unknown" : utilizationState(utilization)
  };
}

function normalizeWindow(
  key: "5h" | "7d",
  label: string,
  progress: Sub2APIUsageProgress | null,
  source: UsageSource,
  now: Date
): PanelUsageWindow {
  const stats = normalizeWindowStats(progress?.window_stats ?? null);
  const hasUtilization = progress?.utilization != null && Number.isFinite(Number(progress.utilization));

  if (!progress || (!hasUtilization && !stats)) {
    return {
      key,
      label,
      available: false,
      utilization: null,
      recommendedUtilization: null,
      state: "unknown",
      resetsAt: null,
      remainingSeconds: null,
      source: "none",
      stats
    };
  }

  const resetAt = parseDateLike(progress.resets_at);
  const remainingSeconds = computeRemainingSeconds(progress.remaining_seconds, resetAt, now);
  const expired = resetAt ? resetAt.getTime() <= now.getTime() : false;
  const utilization = hasUtilization ? (expired ? 0 : roundOne(Math.max(0, Number(progress.utilization)))) : null;
  const recommendedUtilization = expired ? 0 : computeRecommendedUtilization(key, remainingSeconds);

  return {
    key,
    label,
    available: true,
    utilization,
    recommendedUtilization,
    state: utilization == null ? "unknown" : utilizationState(utilization),
    resetsAt: resetAt?.toISOString() ?? null,
    remainingSeconds: expired ? 0 : remainingSeconds,
    source,
    stats
  };
}

function normalizeWindowStats(stats: Sub2APIWindowStats | null): Sub2APIWindowStats | null {
  if (!stats) return null;

  return {
    requests: Math.max(0, Math.floor(numberFromUnknown(stats.requests) ?? 0)),
    tokens: Math.max(0, Math.floor(numberFromUnknown(stats.tokens ?? stats.total_tokens) ?? 0)),
    cost: numberFromUnknown(stats.cost) ?? 0,
    standard_cost: numberFromUnknown(stats.standard_cost) ?? 0,
    user_cost: numberFromUnknown(stats.user_cost) ?? 0
  };
}

function computeRecommendedUtilization(key: "5h" | "7d", remainingSeconds: number | null): number | null {
  if (remainingSeconds == null) return null;

  const windowSeconds = key === "5h" ? FIVE_HOUR_SECONDS : SEVEN_DAY_SECONDS;
  const boundedRemaining = Math.max(0, Math.min(windowSeconds, remainingSeconds));
  return roundOne((1 - boundedRemaining / windowSeconds) * 100);
}

function deriveHealth(
  account: Sub2APIAccount,
  fiveHour: PanelUsageWindow,
  sevenDay: PanelUsageWindow,
  usageError: string | null,
  now: Date
): { health: HealthStatus; reason: string } {
  if (account.status !== "active") {
    return { health: "unavailable", reason: `status: ${account.status}` };
  }

  if (!account.schedulable) {
    return { health: "unavailable", reason: "not schedulable" };
  }

  const resetAt = parseDateLike(account.rate_limit_reset_at);
  if (resetAt && resetAt.getTime() > now.getTime()) {
    return { health: "exhausted", reason: "rate limited" };
  }

  if (account.error_message) {
    return { health: "unavailable", reason: "account error" };
  }

  if (fiveHour.state === "exhausted" || sevenDay.state === "exhausted") {
    return { health: "exhausted", reason: "usage exhausted" };
  }

  if (fiveHour.state === "danger" || sevenDay.state === "danger") {
    return { health: "warning", reason: "usage high" };
  }

  if (fiveHour.state === "warning" || sevenDay.state === "warning") {
    return { health: "warning", reason: "usage elevated" };
  }

  if (usageError) {
    return { health: "warning", reason: "usage unavailable" };
  }

  return { health: "ok", reason: "ready" };
}

function buildCodexProgress(
  extra: Record<string, unknown>,
  window: "5h" | "7d",
  now: Date
): Sub2APIUsageProgress | null {
  const prefix = window === "5h" ? "codex_5h" : "codex_7d";
  const used = numberFromUnknown(extra[`${prefix}_used_percent`]);
  if (used == null) return null;

  let resetAt = parseDateLike(extra[`${prefix}_reset_at`]);
  if (!resetAt) {
    const resetAfterSeconds = numberFromUnknown(extra[`${prefix}_reset_after_seconds`]);
    if (resetAfterSeconds != null && resetAfterSeconds > 0) {
      const updatedAt = parseDateLike(extra.codex_usage_updated_at) ?? now;
      resetAt = new Date(updatedAt.getTime() + resetAfterSeconds * 1000);
    }
  }

  const expired = resetAt ? resetAt.getTime() <= now.getTime() : false;
  return {
    utilization: expired ? 0 : used,
    resets_at: resetAt?.toISOString() ?? null,
    remaining_seconds: resetAt ? Math.max(0, Math.floor((resetAt.getTime() - now.getTime()) / 1000)) : 0,
    window_stats: buildCodexWindowStatsFromExtra(extra, prefix)
  };
}

function buildCodexWindowStatsFromExtra(
  extra: Record<string, unknown>,
  prefix: "codex_5h" | "codex_7d"
): Sub2APIWindowStats | null {
  const requests =
    numberFromUnknown(extra[`${prefix}_requests`]) ??
    numberFromUnknown(extra[`${prefix}_used_requests`]) ??
    numberFromUnknown(extra[`${prefix}_window_requests`]);
  const tokens =
    numberFromUnknown(extra[`${prefix}_tokens`]) ??
    numberFromUnknown(extra[`${prefix}_total_tokens`]) ??
    numberFromUnknown(extra[`${prefix}_window_tokens`]);
  const cost =
    numberFromUnknown(extra[`${prefix}_cost`]) ??
    numberFromUnknown(extra[`${prefix}_window_cost`]);
  const standardCost =
    numberFromUnknown(extra[`${prefix}_standard_cost`]) ??
    numberFromUnknown(extra[`${prefix}_window_standard_cost`]);
  const userCost =
    numberFromUnknown(extra[`${prefix}_user_cost`]) ??
    numberFromUnknown(extra[`${prefix}_window_user_cost`]);

  if (
    requests == null &&
    tokens == null &&
    cost == null &&
    standardCost == null &&
    userCost == null
  ) {
    return null;
  }

  return {
    requests: Math.max(0, Math.floor(requests ?? 0)),
    tokens: Math.max(0, Math.floor(tokens ?? 0)),
    cost: cost ?? 0,
    standard_cost: standardCost ?? 0,
    user_cost: userCost ?? 0
  };
}

function utilizationState(utilization: number): WindowState {
  if (utilization >= 100) return "exhausted";
  if (utilization >= 90) return "danger";
  if (utilization >= 70) return "warning";
  return "normal";
}

function computeRemainingSeconds(raw: unknown, resetAt: Date | null, now: Date): number | null {
  const parsed = numberFromUnknown(raw);
  if (parsed != null) return Math.max(0, Math.floor(parsed));
  if (!resetAt) return null;
  return Math.max(0, Math.floor((resetAt.getTime() - now.getTime()) / 1000));
}

function parseDateLike(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;

  const text = String(value).trim();
  if (!text) return null;

  const date = /^\d+$/.test(text)
    ? new Date(Number(text) * (text.length <= 10 ? 1000 : 1))
    : new Date(text);

  return Number.isFinite(date.getTime()) ? date : null;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function integerFromFirst(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = numberFromUnknown(value);
    if (parsed != null) return Math.floor(parsed);
  }
  return null;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export const WINDOW_SECONDS = {
  fiveHour: FIVE_HOUR_SECONDS,
  sevenDay: SEVEN_DAY_SECONDS
} as const;

export type HealthStatus = "ok" | "warning" | "exhausted" | "unavailable";
export type WindowState = "normal" | "warning" | "danger" | "exhausted" | "unknown";
export type UsageSource = "passive" | "active" | "account-extra" | "none";

export interface Sub2APIAccount {
  id: number;
  name: string;
  notes?: string | null;
  platform: string;
  type: string;
  extra?: Record<string, unknown> | null;
  concurrency?: number;
  priority?: number;
  status: string;
  error_message?: string | null;
  last_used_at?: string | null;
  created_at?: string;
  updated_at?: string;
  schedulable?: boolean;
  rate_limited_at?: string | null;
  rate_limit_reset_at?: string | null;
  overload_until?: string | null;
  temp_unschedulable_until?: string | null;
  temp_unschedulable_reason?: string | null;
}

export interface Sub2APIWindowStats {
  requests?: number;
  tokens?: number;
  cost?: number;
  standard_cost?: number;
  user_cost?: number;
}

export interface Sub2APIUsageProgress {
  utilization?: number;
  resets_at?: string | null;
  remaining_seconds?: number;
  window_stats?: Sub2APIWindowStats | null;
  used_requests?: number;
  limit_requests?: number;
}

export interface Sub2APIUsageInfo {
  source?: "passive" | "active";
  updated_at?: string | null;
  five_hour?: Sub2APIUsageProgress | null;
  seven_day?: Sub2APIUsageProgress | null;
  seven_day_sonnet?: Sub2APIUsageProgress | null;
  error?: string;
  error_code?: string;
}

export interface Sub2APIAccountStats {
  requests?: number;
  tokens?: number;
  cost?: number;
  standard_cost?: number;
  user_cost?: number;
}

export interface Sub2APIAccountStatsSummary {
  total_cost?: number;
  total_user_cost?: number;
  total_standard_cost?: number;
  total_requests?: number;
  total_tokens?: number;
}

export interface Sub2APIAccountUsageStats {
  summary?: Sub2APIAccountStatsSummary | null;
}

export interface Sub2APIBatchTodayStats {
  stats?: Record<string, Sub2APIAccountStats>;
}

export interface PanelAccountTotals {
  available: boolean;
  requests: number;
  tokens: number;
  cost: number;
  standardCost: number;
  userCost: number;
}

export interface PanelUsageWindow {
  key: "5h" | "7d";
  label: string;
  available: boolean;
  utilization: number | null;
  state: WindowState;
  resetsAt: string | null;
  remainingSeconds: number | null;
  source: UsageSource;
  stats: Sub2APIWindowStats | null;
}

export interface PanelAccountStatus {
  id: number;
  name: string;
  platform: string;
  type: string;
  status: string;
  schedulable: boolean;
  health: HealthStatus;
  healthReason: string;
  errorMessage: string | null;
  lastUsedAt: string | null;
  updatedAt: string | null;
  rateLimitResetAt: string | null;
  windows: {
    fiveHour: PanelUsageWindow;
    sevenDay: PanelUsageWindow;
  };
  today: PanelAccountTotals;
  usageError: string | null;
}

export interface PanelSummary {
  total: number;
  active: number;
  schedulable: number;
  warning: number;
  exhausted: number;
  unavailable: number;
  partialErrors: number;
  requests: number;
  tokens: number;
}

export interface PanelPayload {
  generatedAt: string;
  refreshIntervalSeconds: number;
  title: string;
  summary: PanelSummary;
  accounts: PanelAccountStatus[];
}

export interface AccountFetchResult {
  id: number;
  account: PanelAccountStatus | null;
  error: string | null;
}

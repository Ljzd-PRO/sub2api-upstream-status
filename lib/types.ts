export type HealthStatus = "ok" | "warning" | "exhausted" | "unavailable";
export type WindowState = "normal" | "warning" | "danger" | "exhausted" | "unknown";
export type UsageSource = "passive" | "active" | "account-extra" | "none";
export type UsageWindowKey = "5h" | "7d";
export type CodexResetForecastSourceId =
  | "codex-runway"
  | "codex-reset"
  | "save-me-tibo";
export type CodexResetForecastState =
  | "unavailable"
  | "baseline"
  | "possible"
  | "likely"
  | "scheduled";
export type CodexResetForecastConfidence = "low" | "medium" | "high";
export type CodexResetForecastSourceStatus = "ok" | "stale" | "invalid" | "error";

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
  current_concurrency?: number;
  used_concurrency?: number;
  active_concurrency?: number;
  in_flight_requests?: number;
  running_requests?: number;
  rate_limited_at?: string | null;
  rate_limit_reset_at?: string | null;
  overload_until?: string | null;
  temp_unschedulable_until?: string | null;
  temp_unschedulable_reason?: string | null;
}

export interface Sub2APIWindowStats {
  requests?: number;
  tokens?: number;
  total_tokens?: number;
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

export interface Sub2APIRateLimitResetCredits {
  available_count?: number;
}

export interface Sub2APIOpenAIQuotaUsage {
  plan_type?: string | null;
  rate_limit_reset_credits?: Sub2APIRateLimitResetCredits | null;
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

export interface Sub2APIAnnouncement {
  id: number;
  title: string;
  content: string;
  status: string;
  notify_mode?: string;
  targeting?: {
    any_of?: unknown[];
  } | null;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sub2APIAnnouncementList {
  items: Sub2APIAnnouncement[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface PanelAccountTotals {
  available: boolean;
  requests: number;
  tokens: number;
  cost: number;
  standardCost: number;
  userCost: number;
}

export interface PanelWindowTotals {
  availableAccounts: number;
  requests: number;
  tokens: number;
  cost: number;
  standardCost: number;
  userCost: number;
}

export interface PanelConcurrency {
  available: boolean;
  used: number | null;
  limit: number | null;
  utilization: number | null;
  state: WindowState;
}

export interface PanelResetCredits {
  supported: boolean;
  availableCount: number | null;
}

export interface PanelUsageWindow {
  key: UsageWindowKey;
  label: string;
  available: boolean;
  utilization: number | null;
  timeProgressUtilization: number | null;
  recommendedUtilization: number | null;
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
  planType: string | null;
  status: string;
  schedulable: boolean;
  health: HealthStatus;
  healthReason: string;
  errorMessage: string | null;
  lastUsedAt: string | null;
  updatedAt: string | null;
  rateLimitResetAt: string | null;
  concurrency: PanelConcurrency;
  resetCredits: PanelResetCredits;
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
  fiveHour: PanelWindowTotals;
  sevenDay: PanelWindowTotals;
}

export interface PanelPayload {
  generatedAt: string;
  refreshIntervalSeconds: number;
  title: string;
  visibleUsageWindows: UsageWindowKey[];
  summary: PanelSummary;
  accounts: PanelAccountStatus[];
}

export interface AccountFetchResult {
  id: number;
  account: PanelAccountStatus | null;
  error: string | null;
}

export interface LiveConcurrencyAccount {
  id: number;
  concurrency: PanelConcurrency | null;
}

export interface LiveConcurrencyPayload {
  generatedAt: string;
  accounts: LiveConcurrencyAccount[];
}

export type OpenAIStatusIndicator =
  | "none"
  | "minor"
  | "major"
  | "critical"
  | "maintenance"
  | "unknown";

export type OpenAIIncidentStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "unknown";

export interface OpenAIStatusUpdate {
  body: string;
  status: OpenAIIncidentStatus;
  updatedAt: string | null;
}

export interface OpenAIStatusIncident {
  id: string;
  name: string;
  impact: OpenAIStatusIndicator;
  status: OpenAIIncidentStatus;
  updatedAt: string | null;
  latestUpdate: OpenAIStatusUpdate | null;
  url: string;
}

export interface OpenAIStatusPayload {
  fetchedAt: string;
  refreshIntervalSeconds: number;
  stale: boolean;
  overall: {
    indicator: OpenAIStatusIndicator;
    description: string;
  };
  incidents: OpenAIStatusIncident[];
}

export interface CodexResetForecastExpectedWindow {
  startAt: string;
  endAt: string;
  precision: "datetime" | "date" | "horizon";
}

export interface CodexResetForecastScope {
  plans: string[];
  windows: UsageWindowKey[];
  uncertain: boolean;
}

export interface CodexResetForecastSource {
  id: CodexResetForecastSourceId;
  label: string;
  status: CodexResetForecastSourceStatus;
  updatedAt: string | null;
  probability24h: number | null;
  probability48h: number | null;
  eventAt: string | null;
  confidence: CodexResetForecastConfidence;
  detail: string;
  evidenceUrl: string | null;
}

export interface CodexResetForecastPayload {
  enabled: boolean;
  fetchedAt: string;
  refreshIntervalSeconds: number;
  stale: boolean;
  state: CodexResetForecastState;
  probability24h: number | null;
  probability48h: number | null;
  confidence: CodexResetForecastConfidence;
  expectedWindow: CodexResetForecastExpectedWindow | null;
  scope: CodexResetForecastScope;
  agreement: {
    healthySources: number;
    contributingSources: number;
    totalSources: number;
    independentEvidence: number;
  };
  sources: CodexResetForecastSource[];
}

export interface ForecastRecommendation {
  timeProgressUtilization: number | null;
  recommendedUtilization: number | null;
  forecastApplied: boolean;
  forecastProbability: number | null;
}

export interface PanelAnnouncement {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  version: string;
}

export interface AnnouncementPayload {
  enabled: boolean;
  fetchedAt: string;
  refreshIntervalSeconds: number;
  stale: boolean;
  announcement: PanelAnnouncement | null;
}

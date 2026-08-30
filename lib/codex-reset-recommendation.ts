import type {
  CodexResetForecastPayload,
  ForecastRecommendation,
  PanelUsageWindow
} from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_DURATION_MS = {
  "5h": 5 * HOUR_MS,
  "7d": 7 * 24 * HOUR_MS
} as const;
const KNOWN_PAID_PLANS = new Set([
  "plus",
  "pro",
  "team",
  "business",
  "enterprise"
]);

export function computeForecastRecommendation(
  window: PanelUsageWindow,
  planType: string | null,
  forecast: CodexResetForecastPayload | null,
  now: number = Date.now()
): ForecastRecommendation {
  const fallbackBase = window.timeProgressUtilization ?? window.recommendedUtilization;
  const resetAt = dateValue(window.resetsAt);
  const duration = WINDOW_DURATION_MS[window.key];
  const windowStart = resetAt == null ? null : resetAt - duration;
  const timeProgress = resetAt != null && resetAt <= now
    ? 0
    : windowStart == null || resetAt == null
    ? fallbackBase
    : roundOne(clamp((now - windowStart) / duration, 0, 1) * 100);
  const baseline = timeProgress == null ? null : clamp(timeProgress, 0, 100);
  const baselineResult: ForecastRecommendation = {
    timeProgressUtilization: baseline,
    recommendedUtilization: baseline,
    forecastApplied: false,
    forecastProbability: null
  };

  if (
    baseline == null ||
    resetAt == null ||
    windowStart == null ||
    resetAt <= now ||
    !forecast ||
    !forecast.enabled ||
    forecast.stale ||
    forecast.state === "unavailable" ||
    !forecast.scope.windows.includes(window.key) ||
    !planMatchesScope(planType, forecast.scope.plans)
  ) {
    return baselineResult;
  }

  const probability24h = clamp(forecast.probability24h ?? 0, 0, 1);
  const probability48h = clamp(
    Math.max(probability24h, forecast.probability48h ?? probability24h),
    0,
    1
  );
  if (probability48h <= 0) return baselineResult;

  const expectedAt = expectedWindowMidpoint(forecast);
  if (
    expectedAt != null &&
    forecast.expectedWindow?.precision !== "horizon" &&
    expectedAt >= resetAt
  ) {
    return baselineResult;
  }

  const hoursUntilExpected = expectedAt == null ? null : (expectedAt - now) / HOUR_MS;
  const target24h = expectedAt != null && hoursUntilExpected != null && hoursUntilExpected > 0 && hoursUntilExpected <= 24
    ? expectedAt
    : now + 12 * HOUR_MS;
  const target48h = expectedAt != null && hoursUntilExpected != null && hoursUntilExpected > 24 && hoursUntilExpected <= 48
    ? expectedAt
    : now + 36 * HOUR_MS;
  const baselineFraction = baseline / 100;
  const deadline24h = deadlineUtilization(now, windowStart, resetAt, target24h, baselineFraction);
  const deadline48h = deadlineUtilization(now, windowStart, resetAt, target48h, baselineFraction);
  const mass24h = probability24h;
  const mass48h = Math.max(0, probability48h - probability24h);
  const noResetMass = 1 - probability48h;
  const recommendation = clamp(
    noResetMass * baselineFraction + mass24h * deadline24h + mass48h * deadline48h,
    baselineFraction,
    1
  );
  const recommendedUtilization = roundOne(recommendation * 100);

  return {
    timeProgressUtilization: roundOne(baseline),
    recommendedUtilization,
    forecastApplied: recommendedUtilization > baseline + 0.05,
    forecastProbability: roundOne(probability48h * 100)
  };
}

function planMatchesScope(planType: string | null, plans: string[]): boolean {
  const plan = planType?.trim().toLowerCase();
  if (!plan) return false;
  if (plans.includes(plan)) return true;
  return plans.includes("all") && KNOWN_PAID_PLANS.has(plan);
}

function expectedWindowMidpoint(forecast: CodexResetForecastPayload): number | null {
  const start = dateValue(forecast.expectedWindow?.startAt ?? null);
  const end = dateValue(forecast.expectedWindow?.endAt ?? null);
  if (start == null && end == null) return null;
  if (start == null) return end;
  if (end == null) return start;
  return start + (end - start) / 2;
}

function deadlineUtilization(
  now: number,
  windowStart: number,
  normalResetAt: number,
  targetResetAt: number,
  baseline: number
): number {
  if (targetResetAt <= now || targetResetAt >= normalResetAt) return baseline;
  const targetDuration = targetResetAt - windowStart;
  if (targetDuration <= 0) return 1;
  return clamp((now - windowStart) / targetDuration, baseline, 1);
}

function dateValue(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

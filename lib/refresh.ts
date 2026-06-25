export const autoRefreshStorageKey = "sub2api-upstream-status.auto-refresh";
export const liveRefreshIntervalSeconds = 10;

export function normalizeRefreshIntervalSeconds(value: number | null | undefined): number {
  return Math.max(15, value ?? 60);
}

export function secondsUntil(timestamp: number | null, now = Date.now()): number | null {
  if (timestamp === null) return null;
  return Math.max(0, Math.ceil((timestamp - now) / 1000));
}

export function shouldAutoRefresh(enabled: boolean, nextRefreshAt: number | null, now = Date.now()): boolean {
  return enabled && nextRefreshAt !== null && nextRefreshAt <= now;
}

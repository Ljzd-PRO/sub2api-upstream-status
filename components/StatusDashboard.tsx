"use client";

import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Clock3,
  Database,
  Eye,
  Hash,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AccountCard } from "@/components/AccountCard";
import { formatCompactNumber, formatDateTime, platformLabel } from "@/lib/format";
import { appLocales, useI18n, type AppLocale, type LocaleChoice } from "@/lib/i18n";
import {
  autoRefreshStorageKey,
  normalizeRefreshIntervalSeconds,
  secondsUntil,
  shouldAutoRefresh
} from "@/lib/refresh";
import { useTimeZone, type TimeZoneChoice } from "@/lib/timezone";
import type { HealthStatus, PanelPayload } from "@/lib/types";

type HealthFilter = "all" | HealthStatus;

interface ApiError {
  error?: string;
}

export function StatusDashboard() {
  const [data, setData] = useState<PanelPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [health, setHealth] = useState<HealthFilter>("all");
  const [autoRefreshEnabled, setAutoRefreshEnabledState] = useState(true);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const inFlight = useRef(false);
  const dataRef = useRef<PanelPayload | null>(null);
  const autoRefreshEnabledRef = useRef(true);
  const { choice: localeChoice, locale, setChoice: setLocaleChoice, t } = useI18n();
  const {
    choice: timeZoneChoice,
    detectedTimeZone,
    options: timeZoneOptions,
    setChoice: setTimeZoneChoice,
    timeZone
  } = useTimeZone();

  const scheduleNextRefresh = useCallback((intervalSeconds: number | null | undefined) => {
    if (!autoRefreshEnabledRef.current) {
      setNextRefreshAt(null);
      setRemainingSeconds(null);
      return;
    }

    const next = Date.now() + normalizeRefreshIntervalSeconds(intervalSeconds) * 1000;
    setNextRefreshAt(next);
    setRemainingSeconds(secondsUntil(next));
  }, []);

  const load = useCallback(async (background = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    if (background) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch("/api/upstream-status", { cache: "no-store" });
      const payload = (await response.json()) as PanelPayload | ApiError;
      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "status request failed");
      }
      const nextData = payload as PanelPayload;
      dataRef.current = nextData;
      setData(nextData);
      scheduleNextRefresh(nextData.refreshIntervalSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "status request failed");
      scheduleNextRefresh(dataRef.current?.refreshIntervalSeconds);
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [scheduleNextRefresh]);

  useEffect(() => {
    const stored = window.localStorage.getItem(autoRefreshStorageKey);
    if (stored === "false") {
      autoRefreshEnabledRef.current = false;
      setAutoRefreshEnabledState(false);
      setNextRefreshAt(null);
      setRemainingSeconds(null);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!autoRefreshEnabled || nextRefreshAt === null) {
      setRemainingSeconds(null);
      return;
    }

    const updateCountdown = () => {
      setRemainingSeconds(secondsUntil(nextRefreshAt));
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);

    return () => window.clearInterval(interval);
  }, [autoRefreshEnabled, nextRefreshAt]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && shouldAutoRefresh(autoRefreshEnabled, nextRefreshAt)) {
        void load(true);
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [autoRefreshEnabled, load, nextRefreshAt]);

  useEffect(() => {
    const onVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        shouldAutoRefresh(autoRefreshEnabledRef.current, nextRefreshAt)
      ) {
        void load(true);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load, nextRefreshAt]);

  const setAutoRefreshEnabled = useCallback(
    (enabled: boolean) => {
      autoRefreshEnabledRef.current = enabled;
      setAutoRefreshEnabledState(enabled);
      window.localStorage.setItem(autoRefreshStorageKey, enabled ? "true" : "false");

      if (enabled) {
        scheduleNextRefresh(dataRef.current?.refreshIntervalSeconds ?? data?.refreshIntervalSeconds);
      } else {
        setNextRefreshAt(null);
        setRemainingSeconds(null);
      }
    },
    [data?.refreshIntervalSeconds, scheduleNextRefresh]
  );

  const platforms = useMemo(() => {
    const values = new Set(data?.accounts.map((account) => account.platform).filter(Boolean) ?? []);
    return Array.from(values).sort((a, b) => platformLabel(a).localeCompare(platformLabel(b)));
  }, [data]);

  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.accounts ?? [])
      .filter((account) => platform === "all" || account.platform === platform)
      .filter((account) => health === "all" || account.health === health)
      .filter((account) => {
        if (!query) return true;
        return (
          account.name.toLowerCase().includes(query) ||
          String(account.id).includes(query) ||
          account.platform.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => healthRank(a.health) - healthRank(b.health) || b.id - a.id);
  }, [data, health, platform, search]);

  const title =
    data?.title && data.title !== "sub2api upstream status"
      ? data.title
      : t("app.title");

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <div className="eyebrow">
            <Eye size={15} aria-hidden />
            {t("app.eyebrow")}
          </div>
          <h1>{title}</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label={t("action.refresh")}
          title={t("action.refresh")}
        >
          <RefreshCw size={18} aria-hidden className={refreshing ? "spin" : undefined} />
          <span>{t("action.refresh")}</span>
        </button>
      </header>

      {error ? (
        <div className="global-alert" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="summary-grid" aria-label={t("common.accounts")}>
        <SummaryTile label={t("summary.accounts")} value={data?.summary.total ?? 0} icon={<Activity size={18} />} />
        <SummaryTile label={t("summary.schedulable")} value={data?.summary.schedulable ?? 0} icon={<ShieldCheck size={18} />} />
        <SummaryTile label={t("summary.calls5h")} value={formatCompactNumber(data?.summary.fiveHour.requests ?? 0, locale)} icon={<Clock3 size={18} />} />
        <SummaryTile label={t("summary.tokens5h")} value={formatCompactNumber(data?.summary.fiveHour.tokens ?? 0, locale)} icon={<Database size={18} />} />
        <SummaryTile label={t("summary.calls7d")} value={formatCompactNumber(data?.summary.sevenDay.requests ?? 0, locale)} icon={<CalendarDays size={18} />} />
        <SummaryTile label={t("summary.tokens7d")} value={formatCompactNumber(data?.summary.sevenDay.tokens ?? 0, locale)} icon={<Hash size={18} />} />
        <SummaryTile label={t("summary.warning")} value={data?.summary.warning ?? 0} icon={<AlertTriangle size={18} />} />
        <SummaryTile label={t("summary.unavailable")} value={data?.summary.unavailable ?? 0} icon={<SlidersHorizontal size={18} />} />
      </section>

      <section className="toolbar" aria-label={t("filters.label")}>
        <label className="search-box">
          <Search size={17} aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("filters.search")}
          />
        </label>

        <select value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label={t("filters.platform")}>
          <option value="all">{t("filters.allPlatforms")}</option>
          {platforms.map((item) => (
            <option key={item} value={item}>
              {platformLabel(item)}
            </option>
          ))}
        </select>

        <select value={health} onChange={(event) => setHealth(event.target.value as HealthFilter)} aria-label={t("filters.health")}>
          <option value="all">{t("filters.allHealth")}</option>
          <option value="ok">{t("health.ok")}</option>
          <option value="warning">{t("health.warning")}</option>
          <option value="exhausted">{t("health.exhausted")}</option>
          <option value="unavailable">{t("health.unavailable")}</option>
        </select>

        <select
          value={localeChoice}
          onChange={(event) => setLocaleChoice(event.target.value as LocaleChoice)}
          aria-label={t("filters.language")}
        >
          <option value="auto">{t("language.auto")}</option>
          {appLocales.map((item) => (
            <option key={item} value={item}>
              {languageLabel(item)}
            </option>
          ))}
        </select>

        <select
          className="time-zone-select"
          value={timeZoneChoice}
          onChange={(event) => setTimeZoneChoice(event.target.value as TimeZoneChoice)}
          aria-label={t("filters.timeZone")}
        >
          <option value="auto">{t("timezone.auto")} ({detectedTimeZone})</option>
          {timeZoneOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <label className="auto-refresh-control">
          <input
            type="checkbox"
            checked={autoRefreshEnabled}
            onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
            aria-label={t("refresh.auto")}
          />
          <span>{t("refresh.auto")}</span>
          <strong>
            {autoRefreshEnabled
              ? `${t("refresh.nextIn")} ${formatRefreshCountdown(remainingSeconds, t)}`
              : t("refresh.paused")}
          </strong>
        </label>

        <div className="toolbar__timestamp">
          {t("common.updated")} {formatDateTime(data?.generatedAt ?? null, locale, t("common.unknown"), timeZone)}
        </div>
      </section>

      {loading ? (
        <section className="account-grid" aria-label={t("common.loadingAccounts")}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="account-card account-card--skeleton" key={index} />
          ))}
        </section>
      ) : filteredAccounts.length > 0 ? (
        <section className="account-grid" aria-label={t("common.accounts")}>
          {filteredAccounts.map((account) => (
            <AccountCard key={account.id} account={account} locale={locale} timeZone={timeZone} t={t} />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <Search size={20} aria-hidden />
          <span>{t("common.noMatchingAccounts")}</span>
        </section>
      )}
    </main>
  );
}

function formatRefreshCountdown(seconds: number | null, t: ReturnType<typeof useI18n>["t"]): string {
  if (seconds === null) return t("common.unknown");
  return `${seconds}${t("refresh.seconds")}`;
}

function languageLabel(locale: AppLocale): string {
  switch (locale) {
    case "zh-CN":
      return "简体中文";
    case "zh-TW":
      return "繁體中文";
    default:
      return "English";
  }
}

function SummaryTile({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="summary-tile">
      <div className="summary-tile__icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function healthRank(health: HealthStatus): number {
  switch (health) {
    case "exhausted":
      return 0;
    case "unavailable":
      return 1;
    case "warning":
      return 2;
    default:
      return 3;
  }
}

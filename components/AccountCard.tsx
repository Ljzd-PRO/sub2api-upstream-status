"use client";

import { AlertTriangle, Ban, CheckCircle2, CircleOff, Gauge, TimerReset } from "lucide-react";

import { WindowMeter } from "@/components/WindowMeter";
import { formatDateTime, formatPercent, platformLabel } from "@/lib/format";
import type { AppLocale, TFunction } from "@/lib/i18n";
import type { HealthStatus, PanelAccountStatus, PanelConcurrency } from "@/lib/types";

interface AccountCardProps {
  account: PanelAccountStatus;
  locale: AppLocale;
  timeZone: string;
  t: TFunction;
}

export function AccountCard({ account, locale, timeZone, t }: AccountCardProps) {
  const HealthIcon = healthIcon(account.health);

  return (
    <article className="account-card" data-health={account.health}>
      <header className="account-card__header">
        <div className="account-card__title">
          <span className="platform-badge">{platformLabel(account.platform)}</span>
          <h2 title={account.name}>{account.name}</h2>
          <span className="account-card__id">#{account.id}</span>
        </div>
        <span className="health-pill" data-health={account.health}>
          <HealthIcon size={14} aria-hidden />
          {healthLabel(account.health, t)}
        </span>
      </header>

      <div className="account-card__meta">
        <span>{typeLabel(account.type, t)}</span>
        <span>{statusLabel(account.status, t)}</span>
        <span>{account.schedulable ? t("account.schedulable") : t("account.notSchedulable")}</span>
      </div>

      {account.concurrency.available ? (
        <ConcurrencyMeter concurrency={account.concurrency} t={t} />
      ) : null}

      <div className="window-list">
        <WindowMeter window={account.windows.fiveHour} locale={locale} timeZone={timeZone} t={t} />
        <WindowMeter window={account.windows.sevenDay} locale={locale} timeZone={timeZone} t={t} />
      </div>

      <footer className="account-card__footer">
        <span>{t("common.updated")} {formatDateTime(account.updatedAt, locale, t("common.unknown"), timeZone)}</span>
        <span>{t("common.lastUsed")} {formatDateTime(account.lastUsedAt, locale, t("common.unknown"), timeZone)}</span>
      </footer>

      {account.rateLimitResetAt ? (
        <div className="account-card__notice">
          <TimerReset size={14} aria-hidden />
          {t("account.rateLimitResets")} {formatDateTime(account.rateLimitResetAt, locale, t("common.unknown"), timeZone)}
        </div>
      ) : null}

      {account.errorMessage || account.usageError ? (
        <div className="account-card__notice account-card__notice--error">
          <AlertTriangle size={14} aria-hidden />
          <span>{account.errorMessage || account.usageError}</span>
        </div>
      ) : null}
    </article>
  );
}

function ConcurrencyMeter({ concurrency, t }: { concurrency: PanelConcurrency; t: TFunction }) {
  const value =
    concurrency.utilization == null
      ? concurrency.limit != null
        ? 100
        : 0
      : Math.max(0, Math.min(100, concurrency.utilization));

  return (
    <section className="concurrency-meter" data-state={concurrency.state}>
      <div className="concurrency-meter__top">
        <div className="concurrency-meter__label">
          <Gauge size={15} aria-hidden />
          <span>{t("account.concurrencyCapacity")}</span>
        </div>
        <strong>{formatConcurrencyText(concurrency, t)}</strong>
      </div>
      <div className="meter-track" aria-label={t("account.concurrencyCapacity")}>
        <div className="meter-track__fill" style={{ width: `${value}%` }} />
      </div>
      <small>{t(concurrency.utilization == null ? "account.concurrencyCapacityHelp" : "account.concurrencyUsageHelp")}</small>
    </section>
  );
}

function formatConcurrencyText(concurrency: PanelConcurrency, t: TFunction): string {
  if (concurrency.used != null && concurrency.limit != null) {
    return `${concurrency.used} / ${concurrency.limit} · ${formatPercent(concurrency.utilization, t("common.noData"))}`;
  }

  if (concurrency.limit != null) {
    return `${concurrency.limit} ${t("account.concurrencySlots")}`;
  }

  if (concurrency.used != null) {
    return `${concurrency.used} ${t("account.concurrencyUsed")}`;
  }

  return t("common.noData");
}

function healthLabel(health: HealthStatus, t: TFunction): string {
  switch (health) {
    case "ok":
      return t("health.ok");
    case "warning":
      return t("health.warning");
    case "exhausted":
      return t("health.exhausted");
    default:
      return t("health.unavailable");
  }
}

function statusLabel(status: string, t: TFunction): string {
  switch (status) {
    case "active":
      return t("status.active");
    case "inactive":
      return t("status.inactive");
    case "error":
      return t("status.error");
    default:
      return status;
  }
}

function typeLabel(type: string, t: TFunction): string {
  switch (type) {
    case "oauth":
      return t("type.oauth");
    case "setup-token":
      return t("type.setup-token");
    case "apikey":
      return t("type.apikey");
    case "upstream":
      return t("type.upstream");
    case "bedrock":
      return t("type.bedrock");
    case "service_account":
      return t("type.service_account");
    default:
      return type;
  }
}

function healthIcon(health: HealthStatus) {
  switch (health) {
    case "ok":
      return CheckCircle2;
    case "warning":
      return AlertTriangle;
    case "exhausted":
      return CircleOff;
    default:
      return Ban;
  }
}

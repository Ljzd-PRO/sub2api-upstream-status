"use client";

import { AlertTriangle, Ban, CheckCircle2, CircleOff, TimerReset } from "lucide-react";

import { WindowMeter } from "@/components/WindowMeter";
import { formatCompactNumber, formatDateTime, platformLabel } from "@/lib/format";
import type { AppLocale, TFunction } from "@/lib/i18n";
import type { HealthStatus, PanelAccountStatus } from "@/lib/types";

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

      <div className="account-card__window-totals" aria-label={t("account.windowUsageTotals")}>
        <WindowUsageTotals
          label={t("window.5h")}
          requests={account.windows.fiveHour.stats?.requests}
          tokens={account.windows.fiveHour.stats?.tokens}
          locale={locale}
          t={t}
        />
        <WindowUsageTotals
          label={t("window.7d")}
          requests={account.windows.sevenDay.stats?.requests}
          tokens={account.windows.sevenDay.stats?.tokens}
          locale={locale}
          t={t}
        />
      </div>

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

function WindowUsageTotals({
  label,
  requests,
  tokens,
  locale,
  t
}: {
  label: string;
  requests: number | undefined;
  tokens: number | undefined;
  locale: AppLocale;
  t: TFunction;
}) {
  const available = requests !== undefined || tokens !== undefined;

  return (
    <div className="window-total">
      <span className="window-total__label">{label}</span>
      <div className="window-total__values">
        <span>{t("account.windowRequests")}</span>
        <strong>{available ? formatCompactNumber(requests ?? 0, locale) : t("common.noData")}</strong>
      </div>
      <div className="window-total__values">
        <span>{t("account.windowTokens")}</span>
        <strong>{available ? formatCompactNumber(tokens ?? 0, locale) : t("common.noData")}</strong>
      </div>
    </div>
  );
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

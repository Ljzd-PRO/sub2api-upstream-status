"use client";

import { CalendarDays, Clock } from "lucide-react";

import { formatCompactNumber, formatCountdown, formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import type { AppLocale, TFunction } from "@/lib/i18n";
import type { PanelUsageWindow } from "@/lib/types";

interface WindowMeterProps {
  window: PanelUsageWindow;
  locale: AppLocale;
  timeZone: string;
  t: TFunction;
}

export function WindowMeter({ window, locale, timeZone, t }: WindowMeterProps) {
  const value = Math.max(0, Math.min(100, window.utilization ?? 0));
  const hasStats = window.stats && (window.stats.requests || window.stats.tokens || window.stats.cost);
  const label = window.key === "5h" ? t("window.5h") : t("window.7d");

  return (
    <section className="window-meter" data-state={window.state}>
      <div className="window-meter__top">
        <div className="window-meter__label">
          {window.key === "5h" ? <Clock size={15} aria-hidden /> : <CalendarDays size={15} aria-hidden />}
          <span>{label}</span>
        </div>
        <strong>{formatPercent(window.utilization, t("common.noData"))}</strong>
      </div>

      <div className="meter-track" aria-label={`${label} ${t("window.usage")}`}>
        <div className="meter-track__fill" style={{ width: `${value}%` }} />
      </div>

      <div className="window-meter__meta">
        <span>{t("common.ends")} {formatDateTime(window.resetsAt, locale, t("common.unknown"), timeZone)}</span>
        <span>{formatCountdown(window.remainingSeconds, t)}</span>
      </div>

      {hasStats ? (
        <div className="window-meter__stats">
          <span>{formatCompactNumber(window.stats?.requests, locale)} {t("unit.requestShort")}</span>
          <span>{formatCompactNumber(window.stats?.tokens, locale)} {t("unit.tokenShort")}</span>
          <span>{formatMoney(window.stats?.cost)}</span>
        </div>
      ) : null}
    </section>
  );
}

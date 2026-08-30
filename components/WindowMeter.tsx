"use client";

import { CalendarDays, Clock } from "lucide-react";

import { computeForecastRecommendation } from "@/lib/codex-reset-recommendation";
import { formatCompactNumber, formatCountdown, formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import type { AppLocale, TFunction } from "@/lib/i18n";
import type { CodexResetForecastPayload, PanelUsageWindow } from "@/lib/types";

interface WindowMeterProps {
  window: PanelUsageWindow;
  planType: string | null;
  resetForecast: CodexResetForecastPayload | null;
  locale: AppLocale;
  timeZone: string;
  t: TFunction;
}

export function WindowMeter({
  window,
  planType,
  resetForecast,
  locale,
  timeZone,
  t
}: WindowMeterProps) {
  const value = Math.max(0, Math.min(100, window.utilization ?? 0));
  const recommendation = computeForecastRecommendation(window, planType, resetForecast);
  const recommendedValue = Math.max(
    0,
    Math.min(100, recommendation.recommendedUtilization ?? 0)
  );
  const hasStats = window.stats !== null;
  const label = window.key === "5h" ? t("window.5h") : t("window.7d");

  return (
    <section className="window-meter" data-state={window.state}>
      <div className="window-meter__top">
        <div className="window-meter__label">
          {window.key === "5h" ? <Clock size={15} aria-hidden /> : <CalendarDays size={15} aria-hidden />}
          <span>{label}</span>
        </div>
        <strong>
          {t("window.consumed")} {formatPercent(window.utilization, t("common.noData"))}
        </strong>
      </div>

      <div className="meter-track" aria-label={`${label} ${t("window.usage")}`}>
        {recommendation.recommendedUtilization !== null ? (
          <div className="meter-track__recommended" style={{ width: `${recommendedValue}%` }} />
        ) : null}
        <div className="meter-track__fill" style={{ width: `${value}%` }} />
      </div>

      <div className="window-meter__recommendation">
        <span>
          {t("window.recommended")} {formatPercent(recommendation.recommendedUtilization, t("common.noData"))}
        </span>
        <small className="window-meter__recommendation-text">
          {formatRecommendationText(recommendation, t)}
        </small>
        <small>
          {t(recommendation.forecastApplied
            ? "window.recommendedForecastHelp"
            : "window.recommendedHelp")}
        </small>
      </div>

      <div className="window-meter__meta">
        <span>{t("common.ends")} {formatDateTime(window.resetsAt, locale, t("common.unknown"), timeZone)}</span>
        <span>{formatCountdown(window.remainingSeconds, t)}</span>
      </div>

      {hasStats ? (
        <div className="window-meter__stats">
          <span>{t("account.windowRequests")} {formatCompactNumber(window.stats?.requests, locale)}</span>
          <span>{t("account.windowTokens")} {formatCompactNumber(window.stats?.tokens, locale)}</span>
          <span>{formatMoney(window.stats?.cost)}</span>
        </div>
      ) : null}
    </section>
  );
}

function formatRecommendationText(
  recommendation: ReturnType<typeof computeForecastRecommendation>,
  t: TFunction
): string {
  const elapsed = formatPercent(
    recommendation.timeProgressUtilization,
    t("common.noData")
  );
  const recommended = formatPercent(
    recommendation.recommendedUtilization,
    t("common.noData")
  );
  const template = t(recommendation.forecastApplied
    ? "window.recommendationForecast"
    : "window.recommendationBaseline");
  return template
    .replace("{elapsed}", elapsed)
    .replace("{recommended}", recommended);
}

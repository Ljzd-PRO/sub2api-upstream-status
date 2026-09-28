"use client";

import {
  CalendarClock,
  ChevronDown,
  CircleGauge,
  Clock3,
  CloudOff,
  ExternalLink,
  Radar,
  TriangleAlert
} from "lucide-react";

import { formatDateTime, formatPercent } from "@/lib/format";
import type { AppLocale, TFunction, TranslationKey } from "@/lib/i18n";
import type {
  CodexResetForecastPayload,
  CodexResetForecastSource,
  CodexResetForecastState
} from "@/lib/types";

interface CodexResetForecastBannerProps {
  data: CodexResetForecastPayload | null;
  loading: boolean;
  locale: AppLocale;
  timeZone: string;
  t: TFunction;
}

export function CodexResetForecastBanner({
  data,
  loading,
  locale,
  timeZone,
  t
}: CodexResetForecastBannerProps) {
  if (data?.enabled === false) return null;

  const state = data?.state ?? "unavailable";
  const StateIcon = stateIcon(state);
  const title = loading && !data ? t("forecast.loading") : t(stateTitleKey(state));

  return (
    <section
      className="reset-forecast"
      data-state={state}
      aria-label={t("forecast.label")}
      aria-live="polite"
    >
      <header className="reset-forecast__header">
        <div className="reset-forecast__heading">
          <StateIcon size={19} strokeWidth={2.2} aria-hidden />
          <div>
            <span className="reset-forecast__brand">{t("forecast.label")}</span>
            <strong>{title}</strong>
          </div>
        </div>
        <div className="reset-forecast__actions">
          {data?.stale ? (
            <span className="reset-forecast__stale" role="status" aria-label={t("forecast.stale")} title={t("forecast.stale")}>
              <Clock3 size={14} aria-hidden />
              <span>{t("forecast.stale")}</span>
            </span>
          ) : null}
          <a
            className="reset-forecast__site-link"
            href="https://codex-reset.com/"
            target="_blank"
            rel="noopener noreferrer"
            title={t("forecast.openSite")}
          >
            <span className="reset-forecast__site-link-long">{t("forecast.openSite")}</span>
            <span className="reset-forecast__site-link-short">{t("forecast.openSiteShort")}</span>
            <ExternalLink size={14} aria-hidden />
          </a>
        </div>
      </header>

      <div className="reset-forecast__body">
        {loading && !data ? (
          <p className="reset-forecast__message">{t("forecast.loadingDetail")}</p>
        ) : state === "unavailable" ? (
          <p className="reset-forecast__message">{t("forecast.unavailableDetail")}</p>
        ) : (
          <div className="reset-forecast__metrics">
            <ForecastMetric
              label={t("forecast.probability24h")}
              value={formatProbability(data?.probability24h ?? null, t)}
            />
            <ForecastMetric
              label={t("forecast.probability48h")}
              value={formatProbability(data?.probability48h ?? null, t)}
            />
            <ForecastMetric
              label={t("forecast.lastReset")}
              value={formatDateTime(data?.lastResetAt ?? null, locale, t("common.unknown"), timeZone)}
              dateTime={data?.lastResetAt}
              wide
            />
          </div>
        )}

        {data && data.sources.length > 0 ? (
          <details className="reset-forecast__details">
            <summary>
              <span>
                {t("forecast.evidence")}
                <small>
                  {t("forecast.confidence")} {t(confidenceKey(data.confidence))}
                </small>
              </span>
              <ChevronDown size={17} aria-hidden />
            </summary>
            <div className="reset-forecast__sources">
              {data.sources.map((source) => (
                <ForecastSourceRow
                  key={source.id}
                  source={source}
                  locale={locale}
                  timeZone={timeZone}
                  t={t}
                />
              ))}
            </div>
          </details>
        ) : null}

        <footer className="reset-forecast__footer">
          <span className="reset-forecast__disclaimer">{t("forecast.disclaimer")}</span>
          <span>
            {t("common.updated")} {formatDateTime(
              data?.fetchedAt ?? null,
              locale,
              t("common.unknown"),
              timeZone
            )}
          </span>
        </footer>
      </div>
    </section>
  );
}

function ForecastMetric({
  label,
  value,
  dateTime,
  wide = false
}: {
  label: string;
  value: string;
  dateTime?: string | null;
  wide?: boolean;
}) {
  return (
    <div className="reset-forecast__metric" data-wide={wide || undefined}>
      <span>{label}</span>
      <strong title={value}>
        {dateTime ? <time dateTime={dateTime}>{value}</time> : value}
      </strong>
    </div>
  );
}

function ForecastSourceRow({
  source,
  locale,
  timeZone,
  t
}: {
  source: CodexResetForecastSource;
  locale: AppLocale;
  timeZone: string;
  t: TFunction;
}) {
  const probability = source.probability48h ?? source.probability24h;
  const probabilityLabel = source.probability48h == null
    ? t("forecast.probability24h")
    : t("forecast.probability48h");
  return (
    <article className="reset-forecast-source" data-status={source.status}>
      <div className="reset-forecast-source__lead">
        <strong>{t("forecast.sourceName")}</strong>
        <span>{t(sourceStatusKey(source.status))}</span>
      </div>
      <p>{source.status === "error"
        ? t("forecast.sourceRequestFailed")
        : source.detail || t("forecast.noSourceDetail")}</p>
      <div className="reset-forecast-source__meta">
        <span>
          {probability == null
            ? t("common.noData")
            : `${probabilityLabel} ${formatPercent(probability * 100)}`}
        </span>
        <time dateTime={source.updatedAt ?? undefined}>
          {formatDateTime(source.updatedAt, locale, t("common.unknown"), timeZone)}
        </time>
        {source.evidenceUrl ? (
          <a href={source.evidenceUrl} target="_blank" rel="noreferrer">
            {t("forecast.viewSource")}
            <ExternalLink size={13} aria-hidden />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function formatProbability(value: number | null, t: TFunction): string {
  return value == null ? t("common.noData") : formatPercent(value * 100);
}

function stateIcon(state: CodexResetForecastState) {
  switch (state) {
    case "scheduled":
      return CalendarClock;
    case "likely":
      return TriangleAlert;
    case "possible":
      return Radar;
    case "baseline":
      return CircleGauge;
    default:
      return CloudOff;
  }
}

function stateTitleKey(state: CodexResetForecastState): TranslationKey {
  switch (state) {
    case "scheduled":
      return "forecast.scheduled";
    case "likely":
      return "forecast.likely";
    case "possible":
      return "forecast.possible";
    case "baseline":
      return "forecast.baseline";
    default:
      return "forecast.unavailable";
  }
}

function confidenceKey(
  confidence: CodexResetForecastPayload["confidence"]
): TranslationKey {
  switch (confidence) {
    case "high":
      return "forecast.confidence.high";
    case "medium":
      return "forecast.confidence.medium";
    default:
      return "forecast.confidence.low";
  }
}

function sourceStatusKey(
  status: CodexResetForecastSource["status"]
): TranslationKey {
  switch (status) {
    case "ok":
      return "forecast.sourceStatus.ok";
    case "stale":
      return "forecast.sourceStatus.stale";
    case "invalid":
      return "forecast.sourceStatus.invalid";
    default:
      return "forecast.sourceStatus.error";
  }
}

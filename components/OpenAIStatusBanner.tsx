"use client";

import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CloudOff,
  ExternalLink,
  OctagonAlert,
  TriangleAlert
} from "lucide-react";

import { formatDateTime } from "@/lib/format";
import type { AppLocale, TFunction, TranslationKey } from "@/lib/i18n";
import type {
  OpenAIIncidentStatus,
  OpenAIStatusIncident,
  OpenAIStatusIndicator,
  OpenAIStatusPayload
} from "@/lib/types";

interface OpenAIStatusBannerProps {
  data: OpenAIStatusPayload | null;
  loading: boolean;
  locale: AppLocale;
  timeZone: string;
  t: TFunction;
}

export function OpenAIStatusBanner({
  data,
  loading,
  locale,
  timeZone,
  t
}: OpenAIStatusBannerProps) {
  const indicator = data?.overall.indicator ?? "unknown";
  const incidents = data?.incidents ?? [];
  const StatusIcon = indicatorIcon(indicator);
  const title = loading && !data
    ? t("openai.loading")
    : t(indicatorTitleKey(indicator));

  return (
    <section
      className="openai-status"
      data-indicator={indicator}
      aria-label={t("openai.label")}
      aria-live="polite"
    >
      <header className="openai-status__header">
        <div className="openai-status__heading">
          <StatusIcon size={18} strokeWidth={2.25} aria-hidden />
          <div>
            <span className="openai-status__brand">{t("openai.label")}</span>
            <strong>{title}</strong>
          </div>
        </div>
        <div className="openai-status__summary">
          {data?.stale ? (
            <span className="openai-status__stale">{t("openai.stale")}</span>
          ) : null}
          {incidents.length > 0 ? (
            <span>
              {incidents.length} {t("openai.activeIncidents")}
            </span>
          ) : null}
        </div>
      </header>

      <div className="openai-status__body">
        {loading && !data ? (
          <p className="openai-status__message">{t("openai.loadingDetail")}</p>
        ) : incidents.length > 0 ? (
          <div className="openai-incident-list">
            {incidents.map((incident) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                locale={locale}
                timeZone={timeZone}
                t={t}
              />
            ))}
          </div>
        ) : (
          <p className="openai-status__message">
            {indicator === "none"
              ? t("openai.operationalDetail")
              : data?.overall.description || t("openai.unavailableDetail")}
          </p>
        )}

        <footer className="openai-status__footer">
          <span>
            {t("common.updated")}{" "}
            {formatDateTime(
              data?.fetchedAt ?? null,
              locale,
              t("common.unknown"),
              timeZone
            )}
          </span>
          <a
            href="https://status.openai.com/"
            target="_blank"
            rel="noreferrer"
          >
            {t("openai.source")}
            <ExternalLink size={13} aria-hidden />
          </a>
        </footer>
      </div>
    </section>
  );
}

function IncidentRow({
  incident,
  locale,
  timeZone,
  t
}: {
  incident: OpenAIStatusIncident;
  locale: AppLocale;
  timeZone: string;
  t: TFunction;
}) {
  const IncidentIcon = indicatorIcon(incident.impact);
  const updateText = incident.latestUpdate?.body || t("openai.noUpdate");
  const updatedAt = incident.latestUpdate?.updatedAt ?? incident.updatedAt;

  return (
    <article className="openai-incident" data-impact={incident.impact}>
      <div className="openai-incident__lead">
        <IncidentIcon size={18} strokeWidth={2.2} aria-hidden />
        <div>
          <h3>{incident.name}</h3>
          <div className="openai-incident__badges">
            <span>{t(impactLabelKey(incident.impact))}</span>
            <span>{t(statusLabelKey(incident.status))}</span>
          </div>
        </div>
      </div>

      <p className="openai-incident__update">{updateText}</p>

      <div className="openai-incident__meta">
        <time dateTime={updatedAt ?? undefined}>
          {t("common.updated")}{" "}
          {formatDateTime(updatedAt, locale, t("common.unknown"), timeZone)}
        </time>
        <a href={incident.url} target="_blank" rel="noreferrer">
          {t("openai.viewDetails")}
          <ExternalLink size={13} aria-hidden />
        </a>
      </div>
    </article>
  );
}

function indicatorIcon(indicator: OpenAIStatusIndicator) {
  switch (indicator) {
    case "none":
      return CircleCheck;
    case "minor":
      return TriangleAlert;
    case "major":
      return CircleAlert;
    case "critical":
      return OctagonAlert;
    case "maintenance":
      return CalendarClock;
    default:
      return CloudOff;
  }
}

function indicatorTitleKey(indicator: OpenAIStatusIndicator): TranslationKey {
  switch (indicator) {
    case "none":
      return "openai.operational";
    case "minor":
      return "openai.minor";
    case "major":
      return "openai.major";
    case "critical":
      return "openai.critical";
    case "maintenance":
      return "openai.maintenance";
    default:
      return "openai.unavailable";
  }
}

function impactLabelKey(indicator: OpenAIStatusIndicator): TranslationKey {
  switch (indicator) {
    case "none":
      return "openai.impact.none";
    case "minor":
      return "openai.impact.minor";
    case "major":
      return "openai.impact.major";
    case "critical":
      return "openai.impact.critical";
    case "maintenance":
      return "openai.impact.maintenance";
    default:
      return "openai.impact.unknown";
  }
}

function statusLabelKey(status: OpenAIIncidentStatus): TranslationKey {
  switch (status) {
    case "investigating":
      return "openai.status.investigating";
    case "identified":
      return "openai.status.identified";
    case "monitoring":
      return "openai.status.monitoring";
    case "resolved":
      return "openai.status.resolved";
    default:
      return "openai.status.unknown";
  }
}

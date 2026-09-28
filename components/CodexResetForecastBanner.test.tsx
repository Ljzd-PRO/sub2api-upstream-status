import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CodexResetForecastBanner } from "@/components/CodexResetForecastBanner";
import { aggregateForecastSource, normalizeForecastSource } from "@/lib/codex-reset-forecast";
import { translate } from "@/lib/i18n";

const now = Date.parse("2026-09-28T08:00:00Z");
const data = aggregateForecastSource(
  normalizeForecastSource({
    updated_at: "2026-09-28T07:58:00Z",
    last_reset_at: "2026-09-26T18:17:54Z",
    probabilities: { rounded_24h: 42, rounded_48h: 66 },
    confidence_note: "Experimental forecast."
  }, now, 1800),
  now,
  { enabled: true, refreshIntervalSeconds: 120 }
);

describe("CodexResetForecastBanner", () => {
  it("shows the official site, localized labels, and last reset in the selected time zone", () => {
    const shanghai = renderToStaticMarkup(
      <CodexResetForecastBanner data={data} loading={false} locale="zh-CN" timeZone="Asia/Shanghai" t={(key) => translate("zh-CN", key)} />
    );
    const newYork = renderToStaticMarkup(
      <CodexResetForecastBanner data={data} loading={false} locale="zh-CN" timeZone="America/New_York" t={(key) => translate("zh-CN", key)} />
    );

    expect(shanghai).toContain('href="https://codex-reset.com/"');
    expect(shanghai).toContain("预测网站");
    expect(shanghai).toContain("上次全局重置");
    expect(shanghai).toContain('dateTime="2026-09-26T18:17:54.000Z"');
    expect(shanghai).toContain("9月27日");
    expect(newYork).toContain("9月26日");
    expect(shanghai).toContain("Experimental forecast.");
  });

  it("retains a compact accessible stale indicator", () => {
    const html = renderToStaticMarkup(
      <CodexResetForecastBanner data={{ ...data, stale: true }} loading={false} locale="zh-CN" timeZone="Asia/Shanghai" t={(key) => translate("zh-CN", key)} />
    );
    expect(html).toContain('class="reset-forecast__stale"');
    expect(html).toContain('role="status"');
    expect(html).toContain("上次有效预测");
  });
});

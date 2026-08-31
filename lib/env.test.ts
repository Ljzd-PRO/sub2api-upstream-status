import { describe, expect, it } from "vitest";

import {
  getCodexResetForecastConfig,
  getOpenAIStatusConfig,
  getServerConfig,
  parseBooleanFlag,
  parseCodexResetForecastSources,
  parseUsageWindows
} from "@/lib/env";

describe("parseBooleanFlag", () => {
  it("accepts common true values", () => {
    expect(parseBooleanFlag("true")).toBe(true);
    expect(parseBooleanFlag("1")).toBe(true);
    expect(parseBooleanFlag("yes")).toBe(true);
    expect(parseBooleanFlag("on")).toBe(true);
  });

  it("treats all other values as false", () => {
    expect(parseBooleanFlag(undefined)).toBe(false);
    expect(parseBooleanFlag("false")).toBe(false);
    expect(parseBooleanFlag("0")).toBe(false);
  });
});

describe("getServerConfig", () => {
  it("reads the account name masking switch", () => {
    const config = getServerConfig({
      NODE_ENV: "test",
      SUB2API_BASE_URL: "https://sub2api.example",
      SUB2API_ADMIN_API_KEY: "secret",
      SUB2API_ACCOUNT_IDS: "1",
      MASK_ACCOUNT_NAMES: "true"
    });

    expect(config.maskAccountNames).toBe(true);
  });

  it("reads the visible usage window filter", () => {
    const config = getServerConfig({
      NODE_ENV: "test",
      SUB2API_BASE_URL: "https://sub2api.example",
      SUB2API_ADMIN_API_KEY: "secret",
      SUB2API_ACCOUNT_IDS: "1",
      DISPLAY_USAGE_WINDOWS: "7d"
    });

    expect(config.visibleUsageWindows).toEqual(["7d"]);
  });

  it("enables announcements by default and supports disabling them", () => {
    const baseEnv: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      SUB2API_BASE_URL: "https://sub2api.example",
      SUB2API_ADMIN_API_KEY: "secret",
      SUB2API_ACCOUNT_IDS: "1"
    };

    expect(getServerConfig(baseEnv).announcementsEnabled).toBe(true);
    expect(getServerConfig({ ...baseEnv, ENABLE_ANNOUNCEMENTS: "false" }).announcementsEnabled).toBe(false);
    expect(getServerConfig({ ...baseEnv, ENABLE_ANNOUNCEMENTS: "invalid" }).announcementsEnabled).toBe(true);
  });
});

describe("parseUsageWindows", () => {
  it("shows both usage windows by default", () => {
    expect(parseUsageWindows(undefined)).toEqual(["5h", "7d"]);
    expect(parseUsageWindows(" ")).toEqual(["5h", "7d"]);
  });

  it("accepts a comma or space separated subset in canonical order", () => {
    expect(parseUsageWindows("7D, 5H, 7d")).toEqual(["5h", "7d"]);
    expect(parseUsageWindows("7d")).toEqual(["7d"]);
    expect(parseUsageWindows("5h unknown")).toEqual(["5h"]);
  });

  it("falls back to both windows when no supported value is present", () => {
    expect(parseUsageWindows("daily,monthly")).toEqual(["5h", "7d"]);
  });
});

describe("getOpenAIStatusConfig", () => {
  it("uses the official status page refresh interval by default", () => {
    expect(getOpenAIStatusConfig({ NODE_ENV: "test" })).toEqual({
      refreshIntervalSeconds: 10,
      requestTimeoutMs: 8000
    });
  });

  it("reads configured values and clamps them to supported bounds", () => {
    expect(
      getOpenAIStatusConfig({
        NODE_ENV: "test",
        OPENAI_STATUS_REFRESH_INTERVAL_SECONDS: "30",
        OPENAI_STATUS_REQUEST_TIMEOUT_MS: "12000"
      })
    ).toEqual({
      refreshIntervalSeconds: 30,
      requestTimeoutMs: 12000
    });

    expect(
      getOpenAIStatusConfig({
        NODE_ENV: "test",
        OPENAI_STATUS_REFRESH_INTERVAL_SECONDS: "1",
        OPENAI_STATUS_REQUEST_TIMEOUT_MS: "100"
      })
    ).toEqual({
      refreshIntervalSeconds: 10,
      requestTimeoutMs: 1000
    });

    expect(
      getOpenAIStatusConfig({
        NODE_ENV: "test",
        OPENAI_STATUS_REFRESH_INTERVAL_SECONDS: "99999",
        OPENAI_STATUS_REQUEST_TIMEOUT_MS: "99999"
      })
    ).toEqual({
      refreshIntervalSeconds: 3600,
      requestTimeoutMs: 30000
    });
  });

  it("falls back for invalid values", () => {
    expect(
      getOpenAIStatusConfig({
        NODE_ENV: "test",
        OPENAI_STATUS_REFRESH_INTERVAL_SECONDS: "invalid",
        OPENAI_STATUS_REQUEST_TIMEOUT_MS: "invalid"
      })
    ).toEqual({
      refreshIntervalSeconds: 10,
      requestTimeoutMs: 8000
    });
  });
});

describe("getCodexResetForecastConfig", () => {
  it("uses safe defaults for the public forecast sources", () => {
    expect(getCodexResetForecastConfig({ NODE_ENV: "test" })).toEqual({
      enabled: true,
      sources: ["codex-runway", "codex-reset", "save-me-tibo"],
      refreshIntervalSeconds: 120,
      requestTimeoutMs: 8000,
      maxAgeSeconds: 1800
    });
  });

  it("reads configured values and clamps all numeric bounds", () => {
    expect(
      getCodexResetForecastConfig({
        NODE_ENV: "test",
        CODEX_RESET_FORECAST_ENABLED: "false",
        CODEX_RESET_FORECAST_SOURCES: "save-me-tibo,codex-runway",
        CODEX_RESET_FORECAST_REFRESH_INTERVAL_SECONDS: "5",
        CODEX_RESET_FORECAST_REQUEST_TIMEOUT_MS: "99999",
        CODEX_RESET_FORECAST_MAX_AGE_SECONDS: "120"
      })
    ).toEqual({
      enabled: false,
      sources: ["codex-runway", "save-me-tibo"],
      refreshIntervalSeconds: 30,
      requestTimeoutMs: 30000,
      maxAgeSeconds: 300
    });

    expect(
      getCodexResetForecastConfig({
        NODE_ENV: "test",
        CODEX_RESET_FORECAST_REFRESH_INTERVAL_SECONDS: "99999",
        CODEX_RESET_FORECAST_REQUEST_TIMEOUT_MS: "20",
        CODEX_RESET_FORECAST_MAX_AGE_SECONDS: "999999"
      })
    ).toMatchObject({
      refreshIntervalSeconds: 3600,
      requestTimeoutMs: 1000,
      maxAgeSeconds: 86400
    });
  });

  it("falls back when numeric values or source names are invalid", () => {
    expect(
      getCodexResetForecastConfig({
        NODE_ENV: "test",
        CODEX_RESET_FORECAST_REFRESH_INTERVAL_SECONDS: "invalid",
        CODEX_RESET_FORECAST_REQUEST_TIMEOUT_MS: "invalid",
        CODEX_RESET_FORECAST_MAX_AGE_SECONDS: "invalid",
        CODEX_RESET_FORECAST_SOURCES: "unknown"
      })
    ).toMatchObject({
      refreshIntervalSeconds: 120,
      requestTimeoutMs: 8000,
      maxAgeSeconds: 1800,
      sources: ["codex-runway", "codex-reset", "save-me-tibo"]
    });
  });
});

describe("parseCodexResetForecastSources", () => {
  it("deduplicates supported names in canonical order", () => {
    expect(
      parseCodexResetForecastSources("SAVE-ME-TIBO codex-runway save-me-tibo")
    ).toEqual(["codex-runway", "save-me-tibo"]);
  });
});

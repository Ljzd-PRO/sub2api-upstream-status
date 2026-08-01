import { describe, expect, it } from "vitest";

import {
  getOpenAIStatusConfig,
  getServerConfig,
  parseBooleanFlag,
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

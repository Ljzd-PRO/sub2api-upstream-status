import { describe, expect, it } from "vitest";

import { getServerConfig, parseBooleanFlag } from "@/lib/env";

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
});

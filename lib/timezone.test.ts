import { describe, expect, it } from "vitest";

import {
  getTimeZoneOptions,
  isValidTimeZone,
  normalizeTimeZoneChoice,
  resolveTimeZoneChoice
} from "@/lib/timezone";

describe("isValidTimeZone", () => {
  it("accepts IANA time zones and UTC", () => {
    expect(isValidTimeZone("Asia/Shanghai")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

describe("normalizeTimeZoneChoice", () => {
  it("keeps auto and valid manual choices", () => {
    expect(normalizeTimeZoneChoice("auto")).toBe("auto");
    expect(normalizeTimeZoneChoice("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("falls back to auto for invalid stored values", () => {
    expect(normalizeTimeZoneChoice("bad-zone")).toBe("auto");
  });
});

describe("resolveTimeZoneChoice", () => {
  it("uses detected time zone for auto", () => {
    expect(resolveTimeZoneChoice("auto", "Asia/Shanghai")).toBe("Asia/Shanghai");
  });

  it("uses manual time zone when valid", () => {
    expect(resolveTimeZoneChoice("UTC", "Asia/Shanghai")).toBe("UTC");
  });
});

describe("getTimeZoneOptions", () => {
  it("includes UTC and the detected time zone", () => {
    const options = getTimeZoneOptions("Asia/Shanghai");
    expect(options).toContain("UTC");
    expect(options).toContain("Asia/Shanghai");
  });
});


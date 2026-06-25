import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/format";

describe("formatDateTime", () => {
  it("formats in the requested time zone", () => {
    const value = "2026-03-16T12:00:00Z";

    expect(formatDateTime(value, "en", "Unknown", "UTC")).toBe("Mar 16, 12:00 PM");
    expect(formatDateTime(value, "en", "Unknown", "Asia/Shanghai")).toBe("Mar 16, 08:00 PM");
  });

  it("returns the unknown label for invalid dates or time zones", () => {
    expect(formatDateTime("not-a-date", "en", "Unknown", "UTC")).toBe("Unknown");
    expect(formatDateTime("2026-03-16T12:00:00Z", "en", "Unknown", "bad-zone")).toBe("Unknown");
  });
});


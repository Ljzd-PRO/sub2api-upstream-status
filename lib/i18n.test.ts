import { describe, expect, it } from "vitest";

import { detectLocale, isLocaleChoice, translate } from "@/lib/i18n";

describe("detectLocale", () => {
  it("detects simplified Chinese", () => {
    expect(detectLocale(["zh-CN", "en-US"])).toBe("zh-CN");
  });

  it("detects traditional Chinese variants", () => {
    expect(detectLocale(["zh-Hant-HK", "en-US"])).toBe("zh-TW");
    expect(detectLocale(["zh-TW"])).toBe("zh-TW");
  });

  it("falls back to English", () => {
    expect(detectLocale(["fr-FR"])).toBe("en");
  });
});

describe("isLocaleChoice", () => {
  it("accepts supported choices only", () => {
    expect(isLocaleChoice("auto")).toBe(true);
    expect(isLocaleChoice("zh-CN")).toBe(true);
    expect(isLocaleChoice("zh-TW")).toBe(true);
    expect(isLocaleChoice("en")).toBe(true);
    expect(isLocaleChoice("fr")).toBe(false);
  });
});

describe("translate", () => {
  it("returns localized strings", () => {
    expect(translate("zh-CN", "summary.accounts")).toBe("账号");
    expect(translate("zh-TW", "summary.accounts")).toBe("帳號");
    expect(translate("en", "summary.accounts")).toBe("Accounts");
  });
});

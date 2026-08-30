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
    expect(translate("zh-CN", "openai.operational")).toBe("OpenAI 系统运行正常");
    expect(translate("zh-CN", "openai.label")).toBe("上游 OpenAI 状态");
    expect(translate("zh-TW", "openai.stale")).toBe("上次已知狀態");
    expect(translate("zh-TW", "openai.label")).toBe("上游 OpenAI 狀態");
    expect(translate("en", "openai.label")).toBe("Upstream OpenAI status");
    expect(translate("en", "openai.status.monitoring")).toBe("Monitoring");
    expect(translate("zh-CN", "filters.show")).toBe("展开筛选");
    expect(translate("zh-TW", "filters.hide")).toBe("收起篩選");
    expect(translate("en", "filters.show")).toBe("Show filters");
    expect(translate("zh-CN", "forecast.label")).toBe("Codex 提前重置预测");
    expect(translate("zh-TW", "forecast.unofficial")).toBe("社群預測 · 非官方");
    expect(translate("en", "account.planUnknown")).toBe("Plan unknown");
  });
});

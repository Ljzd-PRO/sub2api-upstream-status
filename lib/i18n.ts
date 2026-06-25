"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export const appLocales = ["zh-CN", "en", "zh-TW"] as const;
export type AppLocale = (typeof appLocales)[number];
export type LocaleChoice = "auto" | AppLocale;

const storageKey = "sub2api-upstream-status.locale";

const translations = {
  en: {
    "app.title": "sub2api upstream status",
    "app.eyebrow": "Public upstream usage",
    "action.refresh": "Refresh",
    "refresh.auto": "Auto refresh",
    "refresh.nextIn": "Next in",
    "refresh.paused": "Paused",
    "refresh.seconds": "s",
    "summary.accounts": "Accounts",
    "summary.schedulable": "Schedulable",
    "summary.calls": "Calls",
    "summary.tokens": "Tokens",
    "summary.calls5h": "5h calls",
    "summary.tokens5h": "5h tokens",
    "summary.calls7d": "7d calls",
    "summary.tokens7d": "7d tokens",
    "summary.health": "Health",
    "summary.warning": "Warning",
    "summary.unavailable": "Unavailable",
    "filters.label": "Filters",
    "filters.search": "Search account or ID",
    "filters.platform": "Platform",
    "filters.allPlatforms": "All platforms",
    "filters.health": "Health",
    "filters.allHealth": "All health",
    "filters.language": "Language",
    "filters.timeZone": "Time zone",
    "language.auto": "Auto",
    "language.zh-CN": "简体中文",
    "language.en": "English",
    "language.zh-TW": "繁體中文",
    "timezone.auto": "Auto timezone",
    "common.updated": "Updated",
    "common.lastUsed": "Last used",
    "common.unknown": "Unknown",
    "common.now": "Now",
    "common.noData": "No data",
    "common.ends": "Ends",
    "common.loadingAccounts": "Loading accounts",
    "common.accounts": "Accounts",
    "common.noMatchingAccounts": "No matching accounts",
    "health.ok": "Ok",
    "health.warning": "Warning",
    "health.exhausted": "Exhausted",
    "health.unavailable": "Unavailable",
    "status.active": "active",
    "status.inactive": "inactive",
    "status.error": "error",
    "account.schedulable": "schedulable",
    "account.notSchedulable": "not schedulable",
    "account.callsToday": "Calls",
    "account.tokensToday": "Token usage",
    "account.todayUsageTotals": "Usage totals",
    "account.windowUsageTotals": "Window usage totals",
    "account.windowRequests": "Requests",
    "account.windowTokens": "Tokens",
    "account.rateLimitResets": "Rate limit resets",
    "window.5h": "5h window",
    "window.7d": "7d window",
    "window.usage": "usage",
    "window.recommended": "Recommended",
    "window.recommendedHelp": "Linear target from elapsed time in this usage window.",
    "unit.requestShort": "req",
    "unit.tokenShort": "tok",
    "time.day": "d",
    "time.hour": "h",
    "time.minute": "m",
    "type.oauth": "oauth",
    "type.setup-token": "setup-token",
    "type.apikey": "apikey",
    "type.upstream": "upstream",
    "type.bedrock": "bedrock",
    "type.service_account": "service account"
  },
  "zh-CN": {
    "app.title": "sub2api 上游状态",
    "app.eyebrow": "公开上游用量",
    "action.refresh": "刷新",
    "refresh.auto": "自动刷新",
    "refresh.nextIn": "下次刷新",
    "refresh.paused": "已暂停",
    "refresh.seconds": "秒",
    "summary.accounts": "账号",
    "summary.schedulable": "可调度",
    "summary.calls": "调用",
    "summary.tokens": "Token",
    "summary.calls5h": "5h 调用",
    "summary.tokens5h": "5h Token",
    "summary.calls7d": "7d 调用",
    "summary.tokens7d": "7d Token",
    "summary.health": "健康",
    "summary.warning": "预警",
    "summary.unavailable": "不可用",
    "filters.label": "筛选",
    "filters.search": "搜索账号或 ID",
    "filters.platform": "平台",
    "filters.allPlatforms": "全部平台",
    "filters.health": "健康状态",
    "filters.allHealth": "全部状态",
    "filters.language": "语言",
    "filters.timeZone": "时区",
    "language.auto": "自动",
    "language.zh-CN": "简体中文",
    "language.en": "English",
    "language.zh-TW": "繁體中文",
    "timezone.auto": "自动时区",
    "common.updated": "更新于",
    "common.lastUsed": "上次使用",
    "common.unknown": "未知",
    "common.now": "现在",
    "common.noData": "无数据",
    "common.ends": "结束于",
    "common.loadingAccounts": "正在加载账号",
    "common.accounts": "账号",
    "common.noMatchingAccounts": "没有匹配账号",
    "health.ok": "正常",
    "health.warning": "预警",
    "health.exhausted": "耗尽",
    "health.unavailable": "不可用",
    "status.active": "活跃",
    "status.inactive": "停用",
    "status.error": "错误",
    "account.schedulable": "可调度",
    "account.notSchedulable": "不可调度",
    "account.callsToday": "调用次数",
    "account.tokensToday": "Token 消耗",
    "account.todayUsageTotals": "使用统计",
    "account.windowUsageTotals": "窗口使用统计",
    "account.windowRequests": "请求数",
    "account.windowTokens": "Token",
    "account.rateLimitResets": "限速重置于",
    "window.5h": "5h 窗口",
    "window.7d": "7d 窗口",
    "window.usage": "用量",
    "window.recommended": "推荐",
    "window.recommendedHelp": "按本周期已过时间线性估算，浅绿色为建议进度。",
    "unit.requestShort": "次",
    "unit.tokenShort": "tok",
    "time.day": "天",
    "time.hour": "小时",
    "time.minute": "分钟",
    "type.oauth": "OAuth",
    "type.setup-token": "Setup Token",
    "type.apikey": "API Key",
    "type.upstream": "上游",
    "type.bedrock": "Bedrock",
    "type.service_account": "服务账号"
  },
  "zh-TW": {
    "app.title": "sub2api 上游狀態",
    "app.eyebrow": "公開上游用量",
    "action.refresh": "重新整理",
    "refresh.auto": "自動重新整理",
    "refresh.nextIn": "下次重新整理",
    "refresh.paused": "已暫停",
    "refresh.seconds": "秒",
    "summary.accounts": "帳號",
    "summary.schedulable": "可調度",
    "summary.calls": "呼叫",
    "summary.tokens": "Token",
    "summary.calls5h": "5h 呼叫",
    "summary.tokens5h": "5h Token",
    "summary.calls7d": "7d 呼叫",
    "summary.tokens7d": "7d Token",
    "summary.health": "健康",
    "summary.warning": "預警",
    "summary.unavailable": "不可用",
    "filters.label": "篩選",
    "filters.search": "搜尋帳號或 ID",
    "filters.platform": "平台",
    "filters.allPlatforms": "全部平台",
    "filters.health": "健康狀態",
    "filters.allHealth": "全部狀態",
    "filters.language": "語言",
    "filters.timeZone": "時區",
    "language.auto": "自動",
    "language.zh-CN": "简体中文",
    "language.en": "English",
    "language.zh-TW": "繁體中文",
    "timezone.auto": "自動時區",
    "common.updated": "更新於",
    "common.lastUsed": "上次使用",
    "common.unknown": "未知",
    "common.now": "現在",
    "common.noData": "無資料",
    "common.ends": "結束於",
    "common.loadingAccounts": "正在載入帳號",
    "common.accounts": "帳號",
    "common.noMatchingAccounts": "沒有符合的帳號",
    "health.ok": "正常",
    "health.warning": "預警",
    "health.exhausted": "耗盡",
    "health.unavailable": "不可用",
    "status.active": "啟用",
    "status.inactive": "停用",
    "status.error": "錯誤",
    "account.schedulable": "可調度",
    "account.notSchedulable": "不可調度",
    "account.callsToday": "呼叫次數",
    "account.tokensToday": "Token 消耗",
    "account.todayUsageTotals": "使用統計",
    "account.windowUsageTotals": "視窗使用統計",
    "account.windowRequests": "請求數",
    "account.windowTokens": "Token",
    "account.rateLimitResets": "限速重置於",
    "window.5h": "5h 視窗",
    "window.7d": "7d 視窗",
    "window.usage": "用量",
    "window.recommended": "建議",
    "window.recommendedHelp": "按本週期已過時間線性估算，淡綠色為建議進度。",
    "unit.requestShort": "次",
    "unit.tokenShort": "tok",
    "time.day": "天",
    "time.hour": "小時",
    "time.minute": "分鐘",
    "type.oauth": "OAuth",
    "type.setup-token": "Setup Token",
    "type.apikey": "API Key",
    "type.upstream": "上游",
    "type.bedrock": "Bedrock",
    "type.service_account": "服務帳號"
  }
} satisfies Record<AppLocale, Record<string, string>>;

export type TranslationKey = keyof (typeof translations)["en"];
export type TFunction = (key: TranslationKey) => string;

export function detectLocale(languages: readonly string[] | undefined): AppLocale {
  for (const language of languages ?? []) {
    const normalized = language.toLowerCase();
    if (!normalized) continue;
    if (normalized.startsWith("zh")) {
      if (
        normalized.includes("tw") ||
        normalized.includes("hk") ||
        normalized.includes("mo") ||
        normalized.includes("hant")
      ) {
        return "zh-TW";
      }
      return "zh-CN";
    }
    if (normalized.startsWith("en")) return "en";
  }
  return "en";
}

export function isLocaleChoice(value: string | null): value is LocaleChoice {
  return value === "auto" || appLocales.includes(value as AppLocale);
}

export function translate(locale: AppLocale, key: TranslationKey): string {
  return translations[locale][key] ?? translations.en[key] ?? key;
}

export function useI18n() {
  const [choice, setChoiceState] = useState<LocaleChoice>("auto");
  const [locale, setLocale] = useState<AppLocale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const nextChoice = isLocaleChoice(stored) ? stored : "auto";
    setChoiceState(nextChoice);
    setLocale(resolveChoice(nextChoice));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setChoice = useCallback((nextChoice: LocaleChoice) => {
    setChoiceState(nextChoice);
    window.localStorage.setItem(storageKey, nextChoice);
    setLocale(resolveChoice(nextChoice));
  }, []);

  const t = useCallback<TFunction>((key) => translate(locale, key), [locale]);

  return useMemo(
    () => ({
      choice,
      locale,
      setChoice,
      t
    }),
    [choice, locale, setChoice, t]
  );
}

function resolveChoice(choice: LocaleChoice): AppLocale {
  if (choice !== "auto") return choice;
  return detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

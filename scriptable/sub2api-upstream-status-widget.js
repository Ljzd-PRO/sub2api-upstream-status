// Scriptable widget for sub2api-upstream-status.
// Optional widget parameter: a deployment URL, for example 

const DEFAULT_BASE_URL = "";
const REFRESH_MINUTES = 5;

const WIDGET_FAMILY = config.widgetFamily || "medium";
const BASE_URL = normalizeBaseUrl(args.widgetParameter || DEFAULT_BASE_URL);
const STATUS_API_URL = `${BASE_URL}/api/upstream-status`;
const LIVE_API_URL = `${BASE_URL}/api/upstream-status/live`;

const palette = {
  bgTop: new Color("#111827"),
  bgBottom: new Color("#0f766e"),
  surface: new Color("#ffffff", 0.14),
  surfaceStrong: new Color("#ffffff", 0.22),
  text: Color.white(),
  muted: new Color("#d1d5db"),
  dim: new Color("#9ca3af"),
  green: new Color("#34d399"),
  greenSoft: new Color("#bbf7d0", 0.45),
  amber: new Color("#f59e0b"),
  red: new Color("#fb7185"),
  gray: new Color("#94a3b8"),
  track: new Color("#ffffff", 0.16)
};

const data = await loadPanelData();
const widget = await createWidget(data);
Script.setWidget(widget);

if (!config.runsInWidget) {
  await presentPreview(widget, WIDGET_FAMILY);
}

Script.complete();

async function loadPanelData() {
  try {
    const status = await fetchJSON(STATUS_API_URL);
    const live = await fetchJSON(LIVE_API_URL).catch(() => null);
    return normalizePayload(mergeLiveConcurrency(status, live));
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      generatedAt: new Date().toISOString()
    };
  }
}

async function createWidget(data) {
  if (WIDGET_FAMILY === "accessoryInline") return createAccessoryInline(data);
  if (WIDGET_FAMILY === "accessoryCircular") return createAccessoryCircular(data);
  if (WIDGET_FAMILY === "accessoryRectangular") return createAccessoryRectangular(data);
  if (WIDGET_FAMILY === "small") return createSmallWidget(data);
  if (WIDGET_FAMILY === "large") return createLargeWidget(data);
  if (WIDGET_FAMILY === "extraLarge") return createExtraLargeWidget(data);
  return createMediumWidget(data);
}

function createBaseWidget(padding = 14) {
  const widget = new ListWidget();
  widget.url = BASE_URL;
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  widget.setPadding(padding, padding, padding, padding);

  const gradient = new LinearGradient();
  gradient.colors = [palette.bgTop, palette.bgBottom];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;
  return widget;
}

function createAccessoryBase() {
  const widget = new ListWidget();
  widget.url = BASE_URL;
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  widget.addAccessoryWidgetBackground = true;
  return widget;
}

function createAccessoryInline(data) {
  const widget = createAccessoryBase();
  const text = data.ok
    ? `${healthText(data)} - 5h ${formatPercent(data.fiveHour.utilization)} - 7d ${formatPercent(data.sevenDay.utilization)}`
    : "sub2api - unavailable";
  const line = widget.addText(text);
  line.font = Font.semiboldSystemFont(12);
  return widget;
}

function createAccessoryCircular(data) {
  const widget = createAccessoryBase();
  widget.setPadding(4, 4, 4, 4);
  const stack = widget.addStack();
  stack.layoutVertically();
  stack.centerAlignContent();
  stack.addSpacer();

  const primary = data.ok ? formatPercent(data.fiveHour.utilization) : "ERR";
  const value = stack.addText(primary);
  value.font = Font.boldSystemFont(data.ok ? 16 : 13);
  value.centerAlignText();

  const label = stack.addText(data.ok ? "5h" : "API");
  label.font = Font.mediumSystemFont(10);
  label.centerAlignText();
  stack.addSpacer();
  return widget;
}

function createAccessoryRectangular(data) {
  const widget = createAccessoryBase();
  widget.setPadding(4, 6, 4, 6);

  if (!data.ok) {
    addText(widget, "sub2api unavailable", 12, "semibold", palette.text, 1);
    addText(widget, data.error || "request failed", 10, "regular", palette.dim, 1);
    return widget;
  }

  addText(widget, `${healthText(data)} - ${data.accountName}`, 12, "semibold", palette.text, 1);
  addText(
    widget,
    `5h ${formatPercent(data.fiveHour.utilization)} - 7d ${formatPercent(data.sevenDay.utilization)} - C ${formatConcurrency(data.concurrency)}`,
    11,
    "regular",
    palette.dim,
    1
  );
  return widget;
}

function createSmallWidget(data) {
  const widget = createBaseWidget(13);

  if (!data.ok) {
    renderError(widget, data, "small");
    return widget;
  }

  renderHeader(widget, data, "small");
  widget.addSpacer(10);
  renderWindowCompact(widget, "5h", data.fiveHour);
  widget.addSpacer(8);
  renderWindowCompact(widget, "7d", data.sevenDay);
  widget.addSpacer();
  renderConcurrencyLine(widget, data.concurrency);
  return widget;
}

function createMediumWidget(data) {
  const widget = createBaseWidget(15);

  if (!data.ok) {
    renderError(widget, data, "medium");
    return widget;
  }

  renderHeader(widget, data, "medium");
  widget.addSpacer(12);

  const row = widget.addStack();
  row.layoutHorizontally();
  row.spacing = 10;
  renderMetricCard(row, "5h", data.fiveHour, true, 106);
  renderMetricCard(row, "7d", data.sevenDay, true, 106);
  widget.addSpacer(10);
  renderFooter(widget, data);
  return widget;
}

function createLargeWidget(data) {
  const widget = createBaseWidget(16);

  if (!data.ok) {
    renderError(widget, data, "large");
    return widget;
  }

  renderHeader(widget, data, "large");
  widget.addSpacer(12);
  renderWindowDetailed(widget, "5h", data.fiveHour);
  widget.addSpacer(12);
  renderWindowDetailed(widget, "7d", data.sevenDay);
  widget.addSpacer();
  renderTodayRow(widget, data);
  widget.addSpacer(8);
  renderFooter(widget, data);
  return widget;
}

function createExtraLargeWidget(data) {
  const widget = createBaseWidget(18);

  if (!data.ok) {
    renderError(widget, data, "large");
    return widget;
  }

  renderHeader(widget, data, "large");
  widget.addSpacer(14);

  const top = widget.addStack();
  top.layoutHorizontally();
  top.spacing = 12;
  renderMetricCard(top, "5h", data.fiveHour, true, 120);
  renderMetricCard(top, "7d", data.sevenDay, true, 120);
  renderConcurrencyCard(top, data.concurrency);

  widget.addSpacer(14);
  renderWindowDetailed(widget, "5h", data.fiveHour);
  widget.addSpacer(12);
  renderWindowDetailed(widget, "7d", data.sevenDay);
  widget.addSpacer();
  renderTodayRow(widget, data);
  widget.addSpacer(8);
  renderFooter(widget, data);
  return widget;
}

function renderHeader(parent, data, size) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const left = row.addStack();
  left.layoutVertically();

  const title = addText(left, "LMSC Sub2API", size === "small" ? 13 : 14, "bold", palette.text, 1);
  title.minimumScaleFactor = 0.75;
  const account = addText(left, data.accountName, size === "small" ? 10 : 11, "medium", palette.muted, 1);
  account.minimumScaleFactor = 0.65;

  row.addSpacer();
  const pill = row.addStack();
  pill.layoutHorizontally();
  pill.centerAlignContent();
  pill.setPadding(4, 7, 4, 7);
  pill.backgroundColor = stateColorSoft(data.healthState);
  pill.cornerRadius = 9;

  const dot = pill.addText("*");
  dot.font = Font.boldSystemFont(9);
  dot.textColor = stateColor(data.healthState);
  pill.addSpacer(4);
  addText(pill, healthText(data), 10, "semibold", palette.text, 1);
}

function renderWindowCompact(parent, label, windowData) {
  const top = parent.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  addText(top, label, 11, "bold", palette.muted, 1);
  top.addSpacer();
  addText(top, formatPercent(windowData.utilization), 18, "bold", palette.text, 1);

  parent.addSpacer(4);
  addProgressBar(parent, windowData.utilization, windowData.recommendedUtilization, windowData.state, 118, 8);

  const meta = parent.addStack();
  meta.layoutHorizontally();
  addText(meta, `left ${formatCountdown(windowData.remainingSeconds)}`, 9, "medium", palette.dim, 1);
  meta.addSpacer();
  addText(meta, `rec ${formatPercent(windowData.recommendedUtilization)}`, 9, "medium", palette.dim, 1);
}

function renderMetricCard(parent, label, windowData, showMeta, barWidth) {
  const card = parent.addStack();
  card.layoutVertically();
  card.setPadding(10, 10, 10, 10);
  card.backgroundColor = palette.surface;
  card.cornerRadius = 14;

  const top = card.addStack();
  top.layoutHorizontally();
  addText(top, label, 12, "bold", palette.muted, 1);
  top.addSpacer();
  addText(top, formatPercent(windowData.utilization), 22, "bold", palette.text, 1);

  card.addSpacer(8);
  addProgressBar(card, windowData.utilization, windowData.recommendedUtilization, windowData.state, barWidth || 112, 8);

  if (showMeta) {
    card.addSpacer(8);
    addText(card, `left ${formatCountdown(windowData.remainingSeconds)}`, 10, "medium", palette.dim, 1);
    addText(card, `${formatCompactNumber(windowData.tokens)} tok - ${formatCompactNumber(windowData.requests)} req`, 10, "medium", palette.dim, 1);
  }
  return card;
}

function renderWindowDetailed(parent, label, windowData) {
  const card = parent.addStack();
  card.layoutVertically();
  card.setPadding(10, 11, 10, 11);
  card.backgroundColor = palette.surface;
  card.cornerRadius = 15;

  const row = card.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  addText(row, `${label} window`, 12, "bold", palette.muted, 1);
  row.addSpacer();
  addText(row, formatPercent(windowData.utilization), 24, "bold", palette.text, 1);

  card.addSpacer(8);
  addProgressBar(card, windowData.utilization, windowData.recommendedUtilization, windowData.state, 280, 9);

  card.addSpacer(7);
  const meta = card.addStack();
  meta.layoutHorizontally();
  addText(meta, `left ${formatCountdown(windowData.remainingSeconds)}`, 10, "medium", palette.dim, 1);
  meta.addSpacer();
  addText(meta, `recommended ${formatPercent(windowData.recommendedUtilization)}`, 10, "medium", palette.dim, 1);

  const stats = card.addStack();
  stats.layoutHorizontally();
  addText(stats, `${formatCompactNumber(windowData.requests)} req`, 11, "semibold", palette.text, 1);
  stats.addSpacer(10);
  addText(stats, `${formatCompactNumber(windowData.tokens)} tok`, 11, "semibold", palette.text, 1);
  stats.addSpacer();
  addText(stats, formatMoney(windowData.cost), 11, "semibold", palette.text, 1);
}

function renderConcurrencyLine(parent, concurrency) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  addText(row, "Live concurrency", 9, "medium", palette.dim, 1);
  row.addSpacer();
  addText(row, formatConcurrency(concurrency), 11, "bold", palette.text, 1);
}

function renderConcurrencyCard(parent, concurrency) {
  const card = parent.addStack();
  card.layoutVertically();
  card.setPadding(10, 10, 10, 10);
  card.backgroundColor = palette.surface;
  card.cornerRadius = 14;

  addText(card, "Live concurrency", 11, "bold", palette.muted, 1);
  card.addSpacer(6);
  addText(card, formatConcurrency(concurrency), 22, "bold", palette.text, 1);
  card.addSpacer(8);
  addProgressBar(card, concurrency.utilization, null, concurrency.state, 110, 8);
}

function renderTodayRow(parent, data) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  addText(row, `${formatCompactNumber(data.todayRequests)} requests`, 11, "semibold", palette.text, 1);
  row.addSpacer(12);
  addText(row, `${formatCompactNumber(data.todayTokens)} tokens today`, 11, "semibold", palette.text, 1);
  row.addSpacer();
  addText(row, formatConcurrency(data.concurrency), 11, "semibold", palette.text, 1);
}

function renderFooter(parent, data) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  addText(row, `Updated ${formatTime(data.generatedAt)}`, 10, "medium", palette.dim, 1);
  row.addSpacer();
  addText(row, `Last ${formatTime(data.lastUsedAt)}`, 10, "medium", palette.dim, 1);
}

function renderError(widget, data, size) {
  widget.addSpacer();
  addText(widget, "sub2api", size === "small" ? 18 : 22, "bold", palette.text, 1);
  widget.addSpacer(6);
  addText(widget, "Status unavailable", size === "small" ? 12 : 14, "semibold", palette.red, 2);
  widget.addSpacer(4);
  addText(widget, data.error || "request failed", size === "small" ? 10 : 11, "regular", palette.dim, 3);
  widget.addSpacer();
  addText(widget, formatTime(data.generatedAt), 10, "medium", palette.dim, 1);
}

function addProgressBar(parent, currentPercent, recommendedPercent, state, width, height) {
  const actualWidth = Math.max(72, width || 120);
  const actualHeight = Math.max(5, height || 8);
  const image = makeProgressImage(actualWidth, actualHeight, currentPercent, recommendedPercent, state);
  const bar = parent.addImage(image);
  bar.imageSize = new Size(actualWidth, actualHeight);
}

function makeProgressImage(width, height, currentPercent, recommendedPercent, state) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const radius = Math.floor(height / 2);
  ctx.setFillColor(palette.track);
  ctx.fillRoundedRect(new Rect(0, 0, width, height), radius, radius);

  if (Number.isFinite(recommendedPercent)) {
    const recommendedWidth = Math.max(0, Math.min(width, width * recommendedPercent / 100));
    ctx.setFillColor(palette.greenSoft);
    ctx.fillRoundedRect(new Rect(0, 0, recommendedWidth, height), radius, radius);
  }

  if (Number.isFinite(currentPercent)) {
    const fillWidth = Math.max(0, Math.min(width, width * currentPercent / 100));
    ctx.setFillColor(stateColor(state));
    ctx.fillRoundedRect(new Rect(0, 0, fillWidth, height), radius, radius);
  }

  return ctx.getImage();
}

function addText(parent, value, size, weight, color, lineLimit) {
  const text = parent.addText(String(value));
  text.font = font(size, weight);
  text.textColor = color || palette.text;
  if (lineLimit) text.lineLimit = lineLimit;
  text.minimumScaleFactor = 0.7;
  return text;
}

function font(size, weight) {
  if (weight === "bold") return Font.boldSystemFont(size);
  if (weight === "semibold") return Font.semiboldSystemFont(size);
  if (weight === "medium") return Font.mediumSystemFont(size);
  return Font.systemFont(size);
}

async function fetchJSON(url) {
  const request = new Request(url);
  request.method = "GET";
  request.headers = { Accept: "application/json" };
  request.timeoutInterval = 10;
  return await request.loadJSON();
}

function mergeLiveConcurrency(status, live) {
  if (!status || !live || !Array.isArray(status.accounts) || !Array.isArray(live.accounts)) return status;

  const concurrencyById = {};
  for (const item of live.accounts) {
    if (item && item.concurrency) concurrencyById[item.id] = item.concurrency;
  }

  status.accounts = status.accounts.map((account) => {
    const concurrency = concurrencyById[account.id];
    return concurrency ? { ...account, concurrency } : account;
  });
  return status;
}

function normalizePayload(payload) {
  const account = Array.isArray(payload.accounts) && payload.accounts.length > 0 ? payload.accounts[0] : {};
  const fiveHour = account.windows && account.windows.fiveHour ? account.windows.fiveHour : {};
  const sevenDay = account.windows && account.windows.sevenDay ? account.windows.sevenDay : {};
  const summary = payload.summary || {};

  return {
    ok: true,
    title: payload.title || "sub2api upstream status",
    generatedAt: payload.generatedAt || new Date().toISOString(),
    accountName: account.name || "Account",
    healthState: account.health || "unknown",
    lastUsedAt: account.lastUsedAt || null,
    concurrency: normalizeConcurrency(account.concurrency),
    fiveHour: normalizeWindow(fiveHour),
    sevenDay: normalizeWindow(sevenDay),
    todayRequests: numberOrZero(summary.requests),
    todayTokens: numberOrZero(summary.tokens)
  };
}

function normalizeWindow(windowData) {
  const stats = windowData.stats || {};
  return {
    state: windowData.state || "unknown",
    utilization: toNumber(windowData.utilization),
    recommendedUtilization: toNumber(windowData.recommendedUtilization),
    remainingSeconds: toNumber(windowData.remainingSeconds),
    requests: numberOrZero(stats.requests),
    tokens: numberOrZero(stats.tokens || stats.total_tokens),
    cost: numberOrZero(stats.cost)
  };
}

function normalizeConcurrency(concurrency) {
  const data = concurrency || {};
  return {
    available: Boolean(data.available),
    used: toNumber(data.used),
    limit: toNumber(data.limit),
    utilization: toNumber(data.utilization),
    state: data.state || "unknown"
  };
}

function healthText(data) {
  if (!data.ok) return "ERR";
  if (data.healthState === "ok") return "OK";
  if (data.healthState === "warning") return "WARN";
  if (data.healthState === "exhausted") return "FULL";
  return "DOWN";
}

function stateColor(state) {
  if (state === "warning") return palette.amber;
  if (state === "danger" || state === "exhausted" || state === "unavailable") return palette.red;
  if (state === "unknown") return palette.gray;
  return palette.green;
}

function stateColorSoft(state) {
  if (state === "warning") return new Color("#f59e0b", 0.18);
  if (state === "danger" || state === "exhausted" || state === "unavailable") return new Color("#fb7185", 0.18);
  if (state === "unknown") return new Color("#94a3b8", 0.18);
  return new Color("#34d399", 0.18);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function formatCountdown(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  if (seconds <= 0) return "now";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatCompactNumber(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1e9) return `${trimDecimal(value / 1e9)}B`;
  if (Math.abs(value) >= 1e6) return `${trimDecimal(value / 1e6)}M`;
  if (Math.abs(value) >= 1e3) return `${trimDecimal(value / 1e3)}K`;
  return String(Math.round(value));
}

function formatConcurrency(concurrency) {
  const used = concurrency.used;
  const limit = concurrency.limit;
  if (Number.isFinite(used) && Number.isFinite(limit)) return `${used}/${limit}`;
  if (Number.isFinite(limit)) return `${limit} cap`;
  if (Number.isFinite(used)) return `${used} used`;
  return "--";
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "$0";
  if (value >= 100) return `$${Math.round(value)}`;
  return `$${value.toFixed(1)}`;
}

function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  const formatter = new DateFormatter();
  formatter.dateFormat = "HH:mm";
  return formatter.string(date);
}

function trimDecimal(value) {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

async function presentPreview(widget, family) {
  if (family === "small") return await widget.presentSmall();
  if (family === "large") return await widget.presentLarge();
  if (family === "extraLarge") return await widget.presentExtraLarge();
  if (family === "accessoryInline") return await widget.presentAccessoryInline();
  if (family === "accessoryCircular") return await widget.presentAccessoryCircular();
  if (family === "accessoryRectangular") return await widget.presentAccessoryRectangular();
  return await widget.presentMedium();
}

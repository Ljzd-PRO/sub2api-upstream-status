//
// ScriptWidget package for sub2api-upstream-status.
// widget-param: required panel base URL.
//

const COLORS = {
  bg: "#0f172a",
  panel: "#172033",
  panelAlt: "#1e293b",
  text: "#f8fafc",
  muted: "#cbd5e1",
  dim: "#94a3b8",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  blue: "#38bdf8",
  line: "#334155"
};

const widgetSize = String($getenv("widget-size") || "medium").toLowerCase();
const baseUrl = normalizeBaseUrl($getenv("widget-param"));
const model = baseUrl ? await loadModel(baseUrl) : missingParameterModel();

if (widgetSize.indexOf("accessory") === 0) {
  $render(<AccessoryWidget model={model} />);
} else if (widgetSize === "small") {
  $render(<SmallWidget model={model} />);
} else if (widgetSize === "large") {
  $render(<LargeWidget model={model} />);
} else {
  $render(<MediumWidget model={model} />);
}

async function loadModel(root) {
  try {
    const statusText = await fetch(`${root}/api/upstream-status`);
    const payload = JSON.parse(statusText);
    if (payload.error) throw new Error(payload.error);
    await mergeLiveConcurrency(root, payload);

    return {
      ok: true,
      baseUrl: root,
      payload,
      account: firstAccount(payload),
      generatedAt: payload.generatedAt || new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl: root,
      error: error instanceof Error ? error.message : String(error),
      generatedAt: new Date().toISOString()
    };
  }
}

async function mergeLiveConcurrency(root, payload) {
  try {
    const liveText = await fetch(`${root}/api/upstream-status/live`);
    const live = JSON.parse(liveText);
    if (!live || !live.accounts || !payload.accounts) return;

    const byId = {};
    for (let index = 0; index < live.accounts.length; index++) {
      const account = live.accounts[index];
      if (account && account.concurrency) byId[String(account.id)] = account.concurrency;
    }

    for (let index = 0; index < payload.accounts.length; index++) {
      const account = payload.accounts[index];
      const liveConcurrency = byId[String(account.id)];
      if (liveConcurrency) account.concurrency = liveConcurrency;
    }
  } catch (_) {
    // Keep the main status payload when the best-effort live endpoint fails.
  }
}

function missingParameterModel() {
  return {
    ok: false,
    baseUrl: "",
    error: "Set widget-param to your panel base URL.",
    generatedAt: new Date().toISOString()
  };
}

function firstAccount(payload) {
  return payload && payload.accounts && payload.accounts.length > 0 ? payload.accounts[0] : null;
}

const AccessoryWidget = ({ model }) => {
  if (!model.ok) {
    return (
      <vstack frame="max" background={COLORS.bg} padding="6">
        <text font="caption2" color={COLORS.red}>sub2api unavailable</text>
      </vstack>
    );
  }

  const account = model.account;
  return (
    <vstack frame="max" background={COLORS.bg} padding="6" linkurl={model.baseUrl}>
      <text font="caption2" color={healthColor(account)}>{healthText(account)}</text>
      <text font="caption2" color={COLORS.text}>5h {windowPercent(account, "fiveHour")} / 7d {windowPercent(account, "sevenDay")}</text>
    </vstack>
  );
};

const SmallWidget = ({ model }) => {
  if (!model.ok || !model.account) return <ErrorWidget model={model} compact="1" />;
  const account = model.account;

  return (
    <vstack frame="max,topLeading" background={COLORS.bg} padding="12" spacing="8" linkurl={model.baseUrl}>
      <Header model={model} account={account} compact="1" />
      <WindowLine label="5h" window={account.windows.fiveHour} compact="1" />
      <WindowLine label="7d" window={account.windows.sevenDay} compact="1" />
      <spacer />
      <ConcurrencyLine concurrency={account.concurrency} compact="1" />
      <text font="caption2" color={COLORS.dim}>Updated {timeText(model.generatedAt)}</text>
    </vstack>
  );
};

const MediumWidget = ({ model }) => {
  if (!model.ok || !model.account) return <ErrorWidget model={model} />;
  const account = model.account;

  return (
    <vstack frame="max,topLeading" background={COLORS.bg} padding="14" spacing="10" linkurl={model.baseUrl}>
      <Header model={model} account={account} />
      <hstack spacing="10" frame="max">
        <MetricCard label="5h" window={account.windows.fiveHour} />
        <MetricCard label="7d" window={account.windows.sevenDay} />
      </hstack>
      <ConcurrencyLine concurrency={account.concurrency} />
      <Footer model={model} account={account} />
    </vstack>
  );
};

const LargeWidget = ({ model }) => {
  if (!model.ok || !model.account) return <ErrorWidget model={model} />;
  const account = model.account;
  const summary = model.payload.summary || {};

  return (
    <vstack frame="max,topLeading" background={COLORS.bg} padding="16" spacing="12" linkurl={model.baseUrl}>
      <Header model={model} account={account} />
      <hstack spacing="10" frame="max">
        <SummaryTile label="Accounts" value={safeNumber(summary.total)} sub={`${safeNumber(summary.schedulable)} schedulable`} />
        <SummaryTile label="Warnings" value={safeNumber(summary.warning)} sub={`${safeNumber(summary.unavailable)} unavailable`} />
      </hstack>
      <WindowLine label="5h" window={account.windows.fiveHour} />
      <WindowLine label="7d" window={account.windows.sevenDay} />
      <ConcurrencyLine concurrency={account.concurrency} />
      <hstack spacing="10" frame="max">
        <SummaryTile label="5h requests" value={formatCompact(statsValue(account, "fiveHour", "requests"))} sub={`${formatTokens(statsValue(account, "fiveHour", "tokens"))} tokens`} />
        <SummaryTile label="7d requests" value={formatCompact(statsValue(account, "sevenDay", "requests"))} sub={`${formatTokens(statsValue(account, "sevenDay", "tokens"))} tokens`} />
      </hstack>
      <Footer model={model} account={account} />
    </vstack>
  );
};

const Header = ({ model, account, compact }) => {
  const title = model.payload && model.payload.title ? model.payload.title : "sub2api upstream";
  return (
    <hstack frame="max" spacing="8">
      <vstack alignment="leading" spacing="2">
        <text font={compact ? "caption" : "caption"} color={COLORS.dim}>Public upstream usage</text>
        <text font={compact ? "headline" : "title3"} color={COLORS.text}>{title}</text>
        <text font="caption2" color={COLORS.muted}>{account.name || `Account ${account.id}`}</text>
      </vstack>
      <spacer />
      <vstack alignment="trailing" spacing="2">
        <text font="caption" color={healthColor(account)}>{healthText(account)}</text>
        <text font="caption2" color={COLORS.dim}>#{account.id}</text>
      </vstack>
    </hstack>
  );
};

const MetricCard = ({ label, window }) => {
  return (
    <vstack frame="max,topLeading" background={COLORS.panel} corner="14" padding="10" spacing="7">
      <hstack frame="max">
        <text font="caption" color={COLORS.dim}>{label} window</text>
        <spacer />
        <text font="caption" color={stateColor(window.state)}>{formatPercent(window.utilization)}</text>
      </hstack>
      <progress value={ratio(window.utilization)} total="1" color={stateColor(window.state)} />
      <text font="caption2" color={COLORS.muted}>Suggested {formatPercent(window.recommendedUtilization)}</text>
      <text font="caption2" color={COLORS.dim}>{formatCompact(statsField(window, "requests"))} req / {formatTokens(statsField(window, "tokens"))}</text>
    </vstack>
  );
};

const WindowLine = ({ label, window, compact }) => {
  return (
    <vstack frame="max,topLeading" background={compact ? COLORS.bg : COLORS.panel} corner="12" padding={compact ? "0" : "10"} spacing="6">
      <hstack frame="max">
        <text font={compact ? "caption" : "headline"} color={COLORS.text}>{label} window</text>
        <spacer />
        <text font={compact ? "caption" : "headline"} color={stateColor(window.state)}>{formatPercent(window.utilization)}</text>
      </hstack>
      <progress value={ratio(window.utilization)} total="1" color={stateColor(window.state)} />
      <hstack frame="max">
        <text font="caption2" color={COLORS.muted}>Rec {formatPercent(window.recommendedUtilization)}</text>
        <spacer />
        <text font="caption2" color={COLORS.dim}>{remainingText(window.remainingSeconds)}</text>
      </hstack>
      <hstack frame="max">
        <text font="caption2" color={COLORS.dim}>{formatCompact(statsField(window, "requests"))} req</text>
        <spacer />
        <text font="caption2" color={COLORS.dim}>{formatTokens(statsField(window, "tokens"))} tokens</text>
      </hstack>
    </vstack>
  );
};

const ConcurrencyLine = ({ concurrency, compact }) => {
  const value = concurrency && concurrency.utilization != null ? concurrency.utilization : null;
  return (
    <vstack frame="max,topLeading" background={compact ? COLORS.bg : COLORS.panelAlt} corner="12" padding={compact ? "0" : "10"} spacing="6">
      <hstack frame="max">
        <text font={compact ? "caption" : "headline"} color={COLORS.text}>Live concurrency</text>
        <spacer />
        <text font={compact ? "caption" : "headline"} color={stateColor(concurrency ? concurrency.state : "unknown")}>{concurrencyText(concurrency)}</text>
      </hstack>
      <progress value={ratio(value)} total="1" color={stateColor(concurrency ? concurrency.state : "unknown")} />
    </vstack>
  );
};

const SummaryTile = ({ label, value, sub }) => {
  return (
    <vstack frame="max,topLeading" background={COLORS.panel} corner="12" padding="10" spacing="3">
      <text font="caption2" color={COLORS.dim}>{label}</text>
      <text font="title3" color={COLORS.text}>{value}</text>
      <text font="caption2" color={COLORS.muted}>{sub}</text>
    </vstack>
  );
};

const Footer = ({ model, account }) => {
  return (
    <hstack frame="max">
      <text font="caption2" color={COLORS.dim}>Updated {timeText(model.generatedAt)}</text>
      <spacer />
      <text font="caption2" color={COLORS.dim}>Last {timeText(account.lastUsedAt)}</text>
    </hstack>
  );
};

const ErrorWidget = ({ model, compact }) => {
  return (
    <vstack frame="max,center" background={COLORS.bg} padding={compact ? "12" : "16"} spacing="8">
      <text font={compact ? "headline" : "title3"} color={COLORS.text}>sub2api</text>
      <text font="caption" color={COLORS.red}>Status unavailable</text>
      <text font="caption2" color={COLORS.dim}>{model.error || "Request failed"}</text>
      <text font="caption2" color={COLORS.dim}>{timeText(model.generatedAt)}</text>
    </vstack>
  );
};

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function healthText(account) {
  if (!account) return "Unknown";
  if (account.health === "ok") return "Healthy";
  if (account.health === "warning") return "Warning";
  if (account.health === "exhausted") return "Exhausted";
  return "Unavailable";
}

function healthColor(account) {
  return stateColor(account ? account.health : "unknown");
}

function stateColor(state) {
  if (state === "warning") return COLORS.amber;
  if (state === "danger" || state === "exhausted" || state === "unavailable") return COLORS.red;
  if (state === "ok" || state === "normal") return COLORS.green;
  return COLORS.dim;
}

function ratio(percent) {
  if (percent == null || !isFinite(Number(percent))) return 0;
  return Math.max(0, Math.min(1, Number(percent) / 100));
}

function formatPercent(value) {
  if (value == null || !isFinite(Number(value))) return "--";
  return `${trimDecimal(Math.max(0, Math.min(100, Number(value))))}%`;
}

function windowPercent(account, key) {
  if (!account || !account.windows || !account.windows[key]) return "--";
  return formatPercent(account.windows[key].utilization);
}

function statsField(window, field) {
  return window && window.stats && window.stats[field] != null ? Number(window.stats[field]) : 0;
}

function statsValue(account, key, field) {
  return account && account.windows && account.windows[key] ? statsField(account.windows[key], field) : 0;
}

function concurrencyText(concurrency) {
  if (!concurrency || !concurrency.available) return "--";
  if (concurrency.used != null && concurrency.limit != null) {
    return `${concurrency.used}/${concurrency.limit} ${formatPercent(concurrency.utilization)}`;
  }
  if (concurrency.limit != null) return `${concurrency.limit} slots`;
  if (concurrency.used != null) return `${concurrency.used} used`;
  return "--";
}

function remainingText(seconds) {
  if (seconds == null || !isFinite(Number(seconds))) return "No reset";
  const value = Math.max(0, Number(seconds));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function formatCompact(value) {
  const number = Math.max(0, Number(value) || 0);
  if (number >= 1000000) return `${trimDecimal(number / 1000000)}M`;
  if (number >= 1000) return `${trimDecimal(number / 1000)}K`;
  return String(Math.round(number));
}

function formatTokens(value) {
  return formatCompact(value);
}

function safeNumber(value) {
  return String(Math.max(0, Math.round(Number(value) || 0)));
}

function trimDecimal(value) {
  if (value >= 10) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, "");
}

function timeText(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (!isFinite(date.getTime())) return "--";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

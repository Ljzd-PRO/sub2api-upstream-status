# sub2api upstream status

[English](README.md) | [简体中文](README.zh-CN.md)

面向指定 sub2api 上游账号的公开只读 Next.js 面板，用于查看额度窗口和窗口内使用量。

## 展示图

![sub2api 上游状态面板展示图](docs/images/dashboard-preview.png)

## 功能

- 公开只读面板，无需登录即可查看选定上游账号状态
- 展示 `5 小时` 与 `7 天` 用量窗口、窗口结束时间和倒计时
- 展示 `5 小时` 与 `7 天` 两个窗口内的请求数和 Token 消耗，包含账号级和顶部汇总
- 每个账号的实时并发容量同步
- 显示每个 OpenAI OAuth 账号可用的 Codex 用量窗口重置次数
- 前端自动刷新，显示剩余刷新时间，并支持按浏览器单独暂停
- 自动检测用户语言，支持简体中文、英文、繁体中文
- 自动检测用户时区，并支持按浏览器手动切换时区
- 支持通过环境变量对公开面板中的账号名做模糊处理
- 支持通过环境变量筛选显示 5 小时和 7 天用量窗口

## Scriptable 小组件

iOS Scriptable 小组件脚本位于 [`scriptable/sub2api-upstream-status-widget.js`](scriptable/sub2api-upstream-status-widget.js)，支持主屏幕和锁屏各尺寸。必须在 Scriptable 小组件配置的“参数”中填写面板基础 URL；脚本内不内置站点地址。

## ScriptWidget 小组件

ScriptWidget 小组件包位于 [`scriptwidget/sub2api-upstream-status`](scriptwidget/sub2api-upstream-status)。将该包导入 ScriptWidget 后，需要在小组件配置中将 `widget-param` 设置为面板基础 URL；包内不内置站点地址。

## 配置

基于 `.env.example` 创建 `.env`。

- `SUB2API_BASE_URL`：sub2api 地址，可以带或不带 `/api/v1`
- `SUB2API_ADMIN_API_KEY`：服务端请求 sub2api admin API 时使用的 `x-api-key`
- `SUB2API_ACCOUNT_IDS`：要展示的上游账号 ID，支持逗号或空格分隔
- `MASK_ACCOUNT_NAMES`：设为 `true` 时，在公开 API 和前端 UI 中模糊账号名
- `DISPLAY_USAGE_WINDOWS`：显示的用量窗口，可设为 `5h`、`7d` 或默认的 `5h,7d`
- `REFRESH_INTERVAL_SECONDS`：浏览器轮询刷新间隔，默认 `60`
- `OPENAI_STATUS_REFRESH_INTERVAL_SECONDS`：OpenAI 状态轮询及服务端缓存间隔，默认 `10`
- `OPENAI_STATUS_REQUEST_TIMEOUT_MS`：OpenAI 状态请求超时时间，默认 `8000`
- `NEXT_PUBLIC_PANEL_TITLE`：面板标题

admin key 只在 Next.js 服务端路由中读取，不会返回给浏览器。

## 本地开发

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 检查

```bash
npm run typecheck
npm test
npm run build
```

## Docker

```bash
docker compose up -d --build
```

容器监听 `3000` 端口。如果与 sub2api 部署在同一个 Docker 网络中，`SUB2API_BASE_URL` 可以直接指向 sub2api 的内部服务地址。

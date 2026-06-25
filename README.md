# sub2api upstream status

Public read-only Next.js panel for selected sub2api upstream account usage windows.

## Features

- Read-only public dashboard for selected upstream accounts
- 5h and 7d usage windows with reset time and countdown
- Per-account daily calls and token totals
- Frontend auto refresh countdown with a per-browser pause switch
- Automatic language detection with Simplified Chinese, English, and Traditional Chinese
- Automatic time zone detection with a per-browser manual time zone selector

## Configuration

Create `.env` from `.env.example`.

- `SUB2API_BASE_URL`: sub2api host, with or without `/api/v1`
- `SUB2API_ADMIN_API_KEY`: admin API key sent server-side as `x-api-key`
- `SUB2API_ACCOUNT_IDS`: comma or space separated upstream account IDs to show
- `MASK_ACCOUNT_NAMES`: set to `true` to mask account names in the public API and UI
- `REFRESH_INTERVAL_SECONDS`: browser polling interval, default `60`
- `NEXT_PUBLIC_PANEL_TITLE`: dashboard title

The admin key is only read by the Next.js server route. It is not returned to the browser.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Docker

```bash
docker compose up -d --build
```

The container listens on port `3000`. If deployed on the same Docker network as sub2api, `SUB2API_BASE_URL` can point at the internal service URL.

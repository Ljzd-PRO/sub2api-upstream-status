import { describe, expect, it, vi } from "vitest";

import {
  createAnnouncementService,
  selectLatestAnnouncement
} from "@/lib/announcement";
import type { ServerConfig } from "@/lib/env";
import type { Sub2APIAnnouncement, Sub2APIAnnouncementList } from "@/lib/types";

const now = new Date("2026-08-18T12:00:00.000Z");
const config: ServerConfig = {
  apiBaseUrl: "https://sub2api.example/api/v1",
  adminApiKey: "secret",
  accountIds: [1],
  maskAccountNames: false,
  refreshIntervalSeconds: 60,
  requestTimeoutMs: 15000,
  panelTitle: "status",
  visibleUsageWindows: ["5h", "7d"],
  announcementsEnabled: true
};

describe("selectLatestAnnouncement", () => {
  it("returns the newest currently active global announcement", () => {
    const result = selectLatestAnnouncement([
      announcement({ id: 1, created_at: "2026-08-16T12:00:00Z" }),
      announcement({ id: 2, created_at: "2026-08-17T12:00:00Z" }),
      announcement({ id: 3, status: "draft", created_at: "2026-08-18T11:00:00Z" }),
      announcement({ id: 4, starts_at: "2026-08-19T00:00:00Z" }),
      announcement({ id: 5, ends_at: "2026-08-18T11:59:59Z" }),
      announcement({ id: 6, targeting: { any_of: [{ all_of: [] }] } })
    ], now);

    expect(result).toMatchObject({ id: 2, title: "Announcement 2" });
  });

  it("changes the version when an existing announcement is edited", () => {
    const original = selectLatestAnnouncement([announcement({ id: 7 })], now);
    const edited = selectLatestAnnouncement([
      announcement({ id: 7, content: "Updated **content**", updated_at: "2026-08-18T11:30:00Z" })
    ], now);

    expect(original?.version).not.toBe(edited?.version);
  });

  it("ignores malformed records", () => {
    expect(selectLatestAnnouncement([
      announcement({ id: 0 }),
      announcement({ id: 2, title: " " }),
      announcement({ id: 3, created_at: "not-a-date" })
    ], now)).toBeNull();
  });
});

describe("createAnnouncementService", () => {
  it("caches results for the panel refresh interval", async () => {
    let timestamp = now.getTime();
    const client = clientReturning([announcement({ id: 1 })]);
    const service = createAnnouncementService({
      config,
      client,
      now: () => timestamp
    });

    await service.getLatest();
    await service.getLatest();
    timestamp += 59999;
    await service.getLatest();
    expect(client.getAnnouncements).toHaveBeenCalledTimes(1);

    timestamp += 2;
    await service.getLatest();
    expect(client.getAnnouncements).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const client = {
      getAnnouncements: vi.fn(async () => {
        await gate;
        return list([announcement({ id: 1 })]);
      })
    };
    const service = createAnnouncementService({ config, client });

    const first = service.getLatest();
    const second = service.getLatest();
    expect(client.getAnnouncements).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
  });

  it("keeps the last successful announcement when upstream fails", async () => {
    let timestamp = now.getTime();
    let fails = false;
    const client = {
      getAnnouncements: vi.fn(async () => {
        if (fails) throw new Error("network error");
        return list([announcement({ id: 1 })]);
      })
    };
    const service = createAnnouncementService({ config, client, now: () => timestamp });

    const first = await service.getLatest();
    fails = true;
    timestamp += 60001;
    const stale = await service.getLatest();

    expect(stale).toMatchObject({ stale: true, announcement: { id: 1 } });
    expect(stale.fetchedAt).toBe(first.fetchedAt);
  });

  it("returns an empty stale payload on the first failure", async () => {
    const service = createAnnouncementService({
      config,
      client: { getAnnouncements: vi.fn(async () => { throw new Error("network error"); }) },
      now: () => now.getTime()
    });

    await expect(service.getLatest()).resolves.toMatchObject({
      enabled: true,
      stale: true,
      announcement: null
    });
  });
});

function announcement(overrides: Partial<Sub2APIAnnouncement> = {}): Sub2APIAnnouncement {
  const id = overrides.id ?? 1;
  return {
    id,
    title: `Announcement ${id}`,
    content: "Hello **world**",
    status: "active",
    targeting: {},
    created_at: "2026-08-18T10:00:00Z",
    updated_at: "2026-08-18T10:00:00Z",
    ...overrides
  };
}

function list(items: Sub2APIAnnouncement[]): Sub2APIAnnouncementList {
  return { items, total: items.length, page: 1, page_size: 100, pages: 1 };
}

function clientReturning(items: Sub2APIAnnouncement[]) {
  return { getAnnouncements: vi.fn(async () => list(items)) };
}

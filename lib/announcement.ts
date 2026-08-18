import { createHash } from "node:crypto";

import type { ServerConfig } from "@/lib/env";
import { Sub2APIClient } from "@/lib/sub2api";
import type {
  AnnouncementPayload,
  PanelAnnouncement,
  Sub2APIAnnouncement,
  Sub2APIAnnouncementList
} from "@/lib/types";

interface AnnouncementClient {
  getAnnouncements: () => Promise<Sub2APIAnnouncementList>;
}

interface AnnouncementServiceOptions {
  config: ServerConfig;
  client?: AnnouncementClient;
  now?: () => number;
}

interface CacheEntry {
  expiresAt: number;
  payload: AnnouncementPayload;
}

export interface AnnouncementService {
  getLatest: () => Promise<AnnouncementPayload>;
}

export function createAnnouncementService(
  options: AnnouncementServiceOptions
): AnnouncementService {
  const now = options.now ?? Date.now;
  const client = options.client ?? new Sub2APIClient(options.config);
  const refreshIntervalMs = options.config.refreshIntervalSeconds * 1000;
  let cache: CacheEntry | null = null;
  let inFlight: Promise<AnnouncementPayload> | null = null;

  const getLatest = async (): Promise<AnnouncementPayload> => {
    const requestTime = now();
    if (cache && requestTime < cache.expiresAt) return cache.payload;
    if (inFlight) return inFlight;

    inFlight = client.getAnnouncements()
      .then((result) => {
        const fetchedAt = new Date(now()).toISOString();
        const payload: AnnouncementPayload = {
          enabled: true,
          fetchedAt,
          refreshIntervalSeconds: options.config.refreshIntervalSeconds,
          stale: false,
          announcement: selectLatestAnnouncement(result.items, new Date(fetchedAt))
        };
        cache = {
          expiresAt: now() + refreshIntervalMs,
          payload
        };
        return payload;
      })
      .catch(() => {
        const payload: AnnouncementPayload = cache
          ? { ...cache.payload, stale: true }
          : {
              enabled: true,
              fetchedAt: new Date(now()).toISOString(),
              refreshIntervalSeconds: options.config.refreshIntervalSeconds,
              stale: true,
              announcement: null
            };
        cache = {
          expiresAt: now() + refreshIntervalMs,
          payload
        };
        return payload;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };

  return { getLatest };
}

let sharedService: AnnouncementService | null = null;
let sharedConfigKey = "";

export function getAnnouncementService(config: ServerConfig): AnnouncementService {
  const configKey = [
    config.apiBaseUrl,
    config.adminApiKey,
    config.requestTimeoutMs,
    config.refreshIntervalSeconds
  ].join(":");

  if (!sharedService || sharedConfigKey !== configKey) {
    sharedService = createAnnouncementService({ config });
    sharedConfigKey = configKey;
  }
  return sharedService;
}

export function selectLatestAnnouncement(
  announcements: Sub2APIAnnouncement[],
  now: Date
): PanelAnnouncement | null {
  const nowValue = now.getTime();
  if (!Number.isFinite(nowValue)) return null;

  const latest = announcements
    .filter((announcement) => isPublicAndActive(announcement, nowValue))
    .sort((a, b) => {
      const createdDifference = dateValue(b.created_at) - dateValue(a.created_at);
      return createdDifference || b.id - a.id;
    })[0];

  if (!latest) return null;

  const title = latest.title.trim();
  const content = latest.content.trim();
  const createdAt = normalizedDate(latest.created_at);
  const updatedAt = normalizedDate(latest.updated_at) ?? createdAt;
  if (!title || !content || !createdAt || !updatedAt) return null;

  return {
    id: latest.id,
    title,
    content,
    createdAt,
    updatedAt,
    version: createHash("sha256")
      .update(`${latest.id}\0${title}\0${content}\0${updatedAt}`)
      .digest("hex")
  };
}

function isPublicAndActive(announcement: Sub2APIAnnouncement, now: number): boolean {
  if (!Number.isSafeInteger(announcement.id) || announcement.id <= 0) return false;
  if (announcement.status !== "active") return false;
  if (!announcement.title?.trim() || !announcement.content?.trim()) return false;
  if (!normalizedDate(announcement.created_at) || !normalizedDate(announcement.updated_at)) {
    return false;
  }

  const targetingGroups = announcement.targeting?.any_of;
  if (Array.isArray(targetingGroups) && targetingGroups.length > 0) return false;

  const startsAt = dateValue(announcement.starts_at);
  const endsAt = dateValue(announcement.ends_at);
  if (announcement.starts_at && !startsAt) return false;
  if (announcement.ends_at && !endsAt) return false;
  if (startsAt && now < startsAt) return false;
  if (endsAt && now >= endsAt) return false;
  return true;
}

function normalizedDate(value: string | null | undefined): string | null {
  const timestamp = dateValue(value);
  return timestamp ? new Date(timestamp).toISOString() : null;
}

function dateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

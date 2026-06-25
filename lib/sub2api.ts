import type { ServerConfig } from "@/lib/env";
import type {
  Sub2APIAccount,
  Sub2APIAccountUsageStats,
  Sub2APIBatchTodayStats,
  Sub2APIUsageInfo
} from "@/lib/types";

interface Sub2APIEnvelope<T> {
  code: number | string;
  message?: string;
  reason?: string;
  data?: T;
}

export class Sub2APIClientError extends Error {
  status: number;
  code?: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "Sub2APIClientError";
    this.status = status;
    this.code = code;
  }
}

export class Sub2APIClient {
  private readonly apiBaseUrl: string;
  private readonly adminApiKey: string;
  private readonly timeoutMs: number;

  constructor(config: ServerConfig) {
    this.apiBaseUrl = config.apiBaseUrl;
    this.adminApiKey = config.adminApiKey;
    this.timeoutMs = config.requestTimeoutMs;
  }

  getAccount(id: number): Promise<Sub2APIAccount> {
    return this.request<Sub2APIAccount>(`/admin/accounts/${id}`);
  }

  getAccountStats(id: number): Promise<Sub2APIAccountUsageStats> {
    return this.request<Sub2APIAccountUsageStats>(`/admin/accounts/${id}/stats`);
  }

  getPassiveUsage(id: number): Promise<Sub2APIUsageInfo> {
    return this.request<Sub2APIUsageInfo>(`/admin/accounts/${id}/usage?source=passive`);
  }

  getActiveUsage(id: number): Promise<Sub2APIUsageInfo> {
    return this.request<Sub2APIUsageInfo>(`/admin/accounts/${id}/usage?source=active`);
  }

  getBatchTodayStats(ids: number[]): Promise<Sub2APIBatchTodayStats> {
    return this.request<Sub2APIBatchTodayStats>("/admin/accounts/today-stats/batch", {
      method: "POST",
      body: JSON.stringify({ account_ids: ids })
    });
  }

  private async request<T>(
    path: string,
    options: { method?: "GET" | "POST"; body?: string } = {}
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`;
    let response: Response;
    const method = options.method ?? "GET";

    try {
      response = await fetch(url, {
        method,
        cache: "no-store",
        headers: {
          accept: "application/json",
          ...(options.body ? { "content-type": "application/json" } : {}),
          "x-api-key": this.adminApiKey
        },
        body: options.body,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      throw new Sub2APIClientError(message, 0);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");

    if (!response.ok) {
      throw new Sub2APIClientError(errorMessageFromBody(body), response.status);
    }

    if (body && typeof body === "object" && "code" in body) {
      const envelope = body as Sub2APIEnvelope<T>;
      if (envelope.code !== 0) {
        throw new Sub2APIClientError(
          envelope.message || envelope.reason || "sub2api returned an error",
          response.status,
          typeof envelope.code === "number" ? envelope.code : undefined
        );
      }
      return envelope.data as T;
    }

    return body as T;
  }
}

function errorMessageFromBody(body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message ?? record.reason ?? record.error;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof body === "string" && body.trim()) return body.slice(0, 180);
  return "sub2api request failed";
}

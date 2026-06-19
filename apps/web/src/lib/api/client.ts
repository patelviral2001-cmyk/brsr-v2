/**
 * Production-grade axios client for the NestJS backend.
 * On 401 we try a single token refresh, then fail through to logout +
 * /login redirect. 5xx responses are retried up to 2 times with exponential
 * backoff. Errors are normalized to the backend envelope
 * `{error, message, statusCode, traceId}` so callers can show meaningful copy.
 */
import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { API_BASE_URL } from "../constants";
import { ENDPOINTS } from "./endpoints";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

// ---------------------------------------------------------------------
// Request-Id helper. We attach one per outgoing request so the backend
// trace + our browser logs can be correlated 1:1.
// ---------------------------------------------------------------------
function newRequestId(): string {
  // Crypto API is available in modern browsers + Node 19+.
  try {
    return (globalThis.crypto?.randomUUID?.() ??
      `req_${Math.random().toString(36).slice(2)}_${Date.now()}`);
  } catch {
    return `req_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
}

// ---------------------------------------------------------------------
// Token + refresh wiring. The auth layer (NextAuth session bridge or
// the Zustand auth store, when present) calls `registerTokenProvider`
// once at boot, giving us a synchronous getter for the access token
// and an async refresher.
// ---------------------------------------------------------------------
type TokenGetter = () => string | null | undefined;
type RefreshFn = () => Promise<string | null>;
type LogoutFn = () => void;

let getAccessToken: TokenGetter | null = null;
let refreshAccessToken: RefreshFn | null = null;
let onAuthFailure: LogoutFn | null = null;

export function registerTokenProvider(
  fn: TokenGetter,
  refresh?: RefreshFn,
  onFail?: LogoutFn,
) {
  getAccessToken = fn;
  if (refresh) refreshAccessToken = refresh;
  if (onFail) onAuthFailure = onFail;
}

// ---------------------------------------------------------------------
// Normalized API error. Matches the NestJS HttpException envelope.
// ---------------------------------------------------------------------
export interface ApiError {
  status: number;
  message: string;
  error?: string;
  traceId?: string;
  original?: AxiosError;
}

function isApiError(e: unknown): e is ApiError {
  return !!e && typeof e === "object" && "status" in e && "message" in e;
}

export class ApiClientError extends Error implements ApiError {
  status: number;
  error?: string;
  traceId?: string;
  original?: AxiosError;
  constructor(init: ApiError) {
    super(init.message);
    this.name = "ApiClientError";
    this.status = init.status;
    this.error = init.error;
    this.traceId = init.traceId;
    this.original = init.original;
  }
}

// ---------------------------------------------------------------------
// Compute the runtime baseURL. In prod NEXT_PUBLIC_API_URL already
// includes `/api/v1`; endpoint paths intentionally omit it. To keep the
// older endpoint strings (which used `/api/v1/...`) compatible during
// the migration we strip a duplicate leading prefix per request.
// ---------------------------------------------------------------------
const BASE_URL = (API_BASE_URL || "").replace(/\/+$/, "");
const BASE_HAS_VERSION = /\/api\/v1$/.test(BASE_URL);

function normalizePath(rawPath: string): string {
  if (!rawPath) return rawPath;
  if (BASE_HAS_VERSION && rawPath.startsWith("/api/v1/")) {
    return rawPath.slice("/api/v1".length);
  }
  return rawPath;
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

// ---------------------------------------------------------------------
// Request interceptor: auth + tracing headers.
// ---------------------------------------------------------------------
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Normalize URL so the legacy `/api/v1/*` prefix doesn't double up.
  if (config.url) config.url = normalizePath(config.url);

  // Bearer token (from NextAuth session via the bridge in providers.tsx).
  const token = getAccessToken?.();
  const headers = (config.headers ??= new AxiosHeaders());
  if (token) {
    if (typeof (headers as AxiosHeaders).set === "function") {
      (headers as AxiosHeaders).set("Authorization", `Bearer ${token}`);
    } else {
      (headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }

  // Per-request id for log correlation.
  const reqId = newRequestId();
  if (typeof (headers as AxiosHeaders).set === "function") {
    (headers as AxiosHeaders).set("X-Request-Id", reqId);
  } else {
    (headers as Record<string, string>)["X-Request-Id"] = reqId;
  }

  return config;
});

// ---------------------------------------------------------------------
// Response interceptor: 401 refresh, 5xx retry, error normalization.
// ---------------------------------------------------------------------
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
  _refreshAttempted?: boolean;
}

let inflightRefresh: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (!refreshAccessToken) return null;
  inflightRefresh ??= refreshAccessToken().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Unwrap the backend response envelope `{data, meta, traceId, requestId}`
// so every caller sees the payload directly. We only unwrap when the body
// looks like the envelope (has a `data` key alongside one of the metadata
// keys); plain payloads pass through untouched so endpoints that return
// raw shapes (e.g. file URLs) still work.
function looksLikeEnvelope(body: unknown): body is { data: unknown } {
  if (!body || typeof body !== "object") return false;
  const keys = Object.keys(body as Record<string, unknown>);
  if (!keys.includes("data")) return false;
  return (
    keys.includes("meta") ||
    keys.includes("traceId") ||
    keys.includes("requestId")
  );
}

apiClient.interceptors.response.use(
  (r) => {
    if (looksLikeEnvelope(r.data)) {
      r.data = (r.data as { data: unknown }).data;
    }
    return r;
  },
  async (error: AxiosError) => {
    const config = (error.config ?? {}) as RetryableConfig;
    const status = error.response?.status ?? 0;
    const body = error.response?.data as
      | { error?: string; message?: string; statusCode?: number; traceId?: string }
      | undefined;

    // ---- 401: try a single refresh ----
    if (status === 401 && !config._refreshAttempted) {
      config._refreshAttempted = true;
      const next = await tryRefresh();
      if (next) {
        const headers = (config.headers ??= new AxiosHeaders());
        if (typeof (headers as AxiosHeaders).set === "function") {
          (headers as AxiosHeaders).set("Authorization", `Bearer ${next}`);
        } else {
          (headers as Record<string, string>).Authorization = `Bearer ${next}`;
        }
        return apiClient.request(config);
      }
      onAuthFailure?.();
    }

    // ---- 5xx / network: exponential backoff up to MAX_RETRIES ----
    const transient = status >= 500 || error.code === "ECONNABORTED" || !error.response;
    if (transient && (config._retryCount ?? 0) < MAX_RETRIES && config.method) {
      config._retryCount = (config._retryCount ?? 0) + 1;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, config._retryCount - 1);
      await sleep(delay);
      return apiClient.request(config);
    }

    // ---- Normalize and reject ----
    const rawMessage: unknown = body?.message;
    const message: string = Array.isArray(rawMessage)
      ? String(rawMessage[0] ?? "Request failed")
      : typeof rawMessage === "string"
        ? rawMessage
        : (error.message ?? "Network error");

    throw new ApiClientError({
      status: body?.statusCode ?? status,
      message,
      error: body?.error,
      traceId: body?.traceId,
      original: error,
    });
  },
);

// ---------------------------------------------------------------------
// Public surface. apiFetch is the single funnel — every helper goes
// through it so DEMO_MODE + error normalization apply uniformly.
// ---------------------------------------------------------------------
export async function apiFetch<T = unknown>(
  path: string,
  config: AxiosRequestConfig = {},
): Promise<T> {
  const res = await apiClient.request<T>({ url: path, ...config });
  return res.data;
}

/**
 * GET — accepts either ({ params }) or just (params) for back-compat.
 */
export async function apiGet<T>(
  path: string,
  opts?: { params?: Record<string, unknown> } | Record<string, unknown>,
) {
  const params = opts && typeof opts === "object" && "params" in (opts as object)
    ? (opts as { params?: Record<string, unknown> }).params
    : (opts as Record<string, unknown> | undefined);
  return apiFetch<T>(path, { method: "GET", params });
}

/** Multipart POST with a prebuilt FormData. */
export async function apiPostFormData<T>(path: string, fd: FormData) {
  const res = await apiClient.request<T>({
    url: path,
    method: "POST",
    data: fd,
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 5 * 60 * 1000,
  });
  return res.data;
}

export async function apiPost<T>(path: string, data?: unknown, config?: AxiosRequestConfig) {
  return apiFetch<T>(path, { method: "POST", data, ...config });
}

export async function apiPut<T>(path: string, data?: unknown) {
  return apiFetch<T>(path, { method: "PUT", data });
}

export async function apiPatch<T>(path: string, data?: unknown) {
  return apiFetch<T>(path, { method: "PATCH", data });
}

export async function apiDelete<T>(path: string) {
  return apiFetch<T>(path, { method: "DELETE" });
}

/**
 * Multipart upload with progress callback. Bypasses apiFetch so we can
 * surface streaming progress events. In DEMO_MODE we simulate progress
 * and return a fake FileObject so the UI grid still updates.
 */
export async function apiUpload<T>(
  path: string,
  file: File,
  fields: Record<string, string | undefined> = {},
  onProgress?: (pct: number) => void,
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) form.append(k, v);
  }

  const res: AxiosResponse<T> = await apiClient.request<T>({
    url: path,
    method: "POST",
    data: form,
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (!onProgress || !e.total) return;
      onProgress(Math.round((e.loaded / e.total) * 100));
    },
    timeout: 5 * 60 * 1000, // uploads get 5min
  });
  return res.data;
}

export { ENDPOINTS };
export { ApiClientError as ApiErrorClass };
export type { ApiError as ApiErrorShape };
export const __isApiError = isApiError;

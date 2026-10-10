import { useAuth } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import { useEffect, useMemo, useRef } from "react";
import {
  clearAllCache,
  clearInflight,
  inflightFor,
  invalidateForWrite,
  readCache,
  trackInflight,
  writeCache,
} from "./cache";

/** Port the local backend dev server listens on (log-app-backend/.env PORT). */
const DEV_BACKEND_PORT = 4000;

/**
 * The host Metro is served from, e.g. "192.168.0.103:8081". In development
 * that is the dev machine's current LAN IP, so the API follows DHCP changes
 * instead of a hardcoded address.
 */
function devServerHost(): string | null {
  const expoConfig = Constants.expoConfig as { hostUri?: string } | null;
  const hostUri =
    expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0]?.trim();
  return host ? host : null;
}

/**
 * Dev builds reach the backend on the same machine that serves Metro; release
 * builds use the EXPO_PUBLIC_API_BASE_URL baked in at build time.
 */
function resolveApiBaseUrl(): string {
  if (__DEV__) {
    const host = devServerHost();
    if (host) return `http://${host}:${DEV_BACKEND_PORT}`;
  }
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
}

export const API_BASE_URL = resolveApiBaseUrl();
export const REQUEST_TIMEOUT_MS = 15000;
const PDF_UPLOAD_TIMEOUT_MS = 120000;

/**
 * GETs are served from a small resource-aware cache (see ./cache): remounts and
 * tab switches within the TTL are instant with no loading flash. Mutations drop
 * only the resources they made stale and notify the screens that read them, so
 * freshness comes from the invalidation map rather than a short TTL.
 */
if (!__DEV__ && API_BASE_URL.startsWith("http://")) {
  throw new Error(
    `Refusing to use insecure API base URL in production: ${API_BASE_URL}. Set EXPO_PUBLIC_API_BASE_URL to an https:// URL.`,
  );
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  getToken: () => Promise<string | null>,
  options?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Signed out. Please sign in again.");
  }
  const { timeoutMs, ...fetchOptions } = options ?? {};
  const isFormData =
    typeof FormData !== "undefined" && fetchOptions?.body instanceof FormData;
  const url = `${API_BASE_URL}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs ?? REQUEST_TIMEOUT_MS,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        ...fetchOptions?.headers,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(0, "NETWORK_ERROR", "Request timed out. Check your connection.");
    }
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = (body as { error?: { code?: string; message?: string } })?.error ?? {};
    throw new ApiError(
      res.status,
      error.code ?? "SERVER_ERROR",
      error.message ?? "Request failed",
    );
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(0, "SERVER_ERROR", "Request failed");
  }
}

export function useApiClient() {
  const { getToken, signOut } = useAuth();
  const getTokenRef = useRef(getToken);
  const signOutRef = useRef(signOut);
  useEffect(() => {
    getTokenRef.current = getToken;
    signOutRef.current = signOut;
  }, [getToken, signOut]);

  const wrap = useMemo(
    () => async <T = unknown>(run: () => Promise<T>): Promise<T> => {
      try {
        return await run();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // The signed-out user's data must not be handed to the next one.
          clearAllCache();
          try {
            await signOutRef.current();
          } catch {}
        }
        throw err;
      }
    },
    [],
  );

  return useMemo(
    () => ({
      get: <T = unknown>(path: string, opts?: { ttlMs?: number; force?: boolean }) => {
        if (!opts?.force) {
          const hit = readCache<T>(path);
          if (hit !== undefined) return Promise.resolve(hit);
          // Already in flight (two hooks mounting together) — join the same request.
          const pending = inflightFor(path);
          if (pending) return pending as Promise<T>;
        }
        const request = wrap(() =>
          apiFetch<T>(path, () => getTokenRef.current()).then((data) => {
            writeCache(path, data, opts?.ttlMs);
            return data;
          }),
        ).finally(() => clearInflight(path));
        return trackInflight(path, request);
      },
      put: <T = unknown>(path: string, body: unknown) =>
        wrap(() =>
          apiFetch<T>(path, () => getTokenRef.current(), {
            method: "PUT",
            body: JSON.stringify(body),
          }).then((data) => {
            invalidateForWrite(path);
            return data;
          }),
        ),
      post: <T = unknown>(path: string, body: unknown) =>
        wrap(() =>
          apiFetch<T>(path, () => getTokenRef.current(), {
            method: "POST",
            body: JSON.stringify(body),
          }).then((data) => {
            invalidateForWrite(path);
            return data;
          }),
        ),
      postFormData: <T = unknown>(
        path: string,
        formData: FormData,
        timeoutMs = PDF_UPLOAD_TIMEOUT_MS,
      ) =>
        wrap(() =>
          apiFetch<T>(path, () => getTokenRef.current(), {
            method: "POST",
            body: formData,
            timeoutMs,
          }).then((data) => {
            invalidateForWrite(path);
            return data;
          }),
        ),
      del: <T = unknown>(path: string) =>
        wrap(() =>
          apiFetch<T>(path, () => getTokenRef.current(), { method: "DELETE" }).then((data) => {
            invalidateForWrite(path);
            return data;
          }),
        ),
    }),
    [wrap],
  );
}

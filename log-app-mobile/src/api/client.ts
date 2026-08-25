import { useAuth } from "@clerk/clerk-expo";
import { useMemo, useRef } from "react";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

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
  options?: RequestInit,
): Promise<T> {
  const token = await getToken();
  const isFormData =
    typeof FormData !== "undefined" && options?.body instanceof FormData;

  const url = `${API_BASE_URL}${path}`;
  console.log("[apiFetch]", options?.method ?? "GET", url, {
    isFormData,
    hasToken: !!token,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
  } catch (err) {
    console.error("[apiFetch] network error:", err);
    throw err;
  }

  console.log("[apiFetch] response:", res.status, res.statusText);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = body?.error ?? {};
    console.error("[apiFetch] error body:", body);
    throw new ApiError(
      res.status,
      error.code ?? "SERVER_ERROR",
      error.message ?? "Request failed",
    );
  }

  return res.json();
}

export function useApiClient() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  return useMemo(
    () => ({
      get: <T = unknown>(path: string) =>
        apiFetch<T>(path, () => getTokenRef.current()),
      put: <T = unknown>(path: string, body: unknown) =>
        apiFetch<T>(path, () => getTokenRef.current(), {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      post: <T = unknown>(path: string, body: unknown) =>
        apiFetch<T>(path, () => getTokenRef.current(), {
          method: "POST",
          body: JSON.stringify(body),
        }),
      postFormData: <T = unknown>(path: string, formData: FormData) =>
        apiFetch<T>(path, () => getTokenRef.current(), {
          method: "POST",
          body: formData,
        }),
    }),
    [],
  );
}

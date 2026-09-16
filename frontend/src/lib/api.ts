// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.
const BASE = "/api";

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  // Auth rides the httpOnly session cookie automatically — never add auth headers here.
  // GETs are retried because a transient proxy/browser connection failure should not
  // leave detail pages stuck on an error state when the API itself is healthy.
  const maxAttempts = method === "GET" ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: method === "GET" ? "no-store" : undefined,
      });

      // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        // Retry transient server/proxy errors, but do not retry normal 4xx responses.
        if (method === "GET" && res.status >= 500 && attempt < maxAttempts) {
          await new Promise((resolve) => window.setTimeout(resolve, 250 * attempt));
          continue;
        }
        throw new ApiError(res.status, errBody);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError || attempt >= maxAttempts) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 250 * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
/**
 * Defensive JSON helpers for client-side `fetch` calls.
 *
 * `Response.json()` throws `SyntaxError: Failed to execute 'json' on
 * 'Response': Unexpected end of JSON input` whenever the body is not valid
 * JSON. That happens routinely in production and is *not* a bug in our route:
 *
 *   - Next.js returns an HTML error page on an unhandled 500.
 *   - A platform proxy or CDN returns its own HTML error page (502/503).
 *   - A route replies with an empty body (204/304) or a truncated response.
 *   - An aborted or failed request yields an empty or partial body.
 *
 * Because that throw happens inside an async handler it surfaces as an
 * unhandled promise rejection — an alarming red `Uncaught (in promise)
 * SyntaxError` in the console and, worse, a handler that silently stops
 * halfway through. Every UI call site must therefore read JSON through
 * `readJson`, which can never throw.
 */

/** Reads a JSON body, returning `null` instead of throwing on anything else. */
export async function readJson<T = unknown>(response: Response): Promise<T | null> {
  // Read as text first: `response.json()` raises a DOMException on non-JSON,
  // whereas `JSON.parse` on the text lets us swallow the failure ourselves.
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Reads JSON, falling back to an empty object. Use when the call site only
 * reads optional fields and a missing body should behave like `{}`.
 */
export async function readJsonObject<T extends Record<string, unknown> = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await readJson<T>(response)) ?? ({} as T);
}

/**
 * Builds a user-facing error message from a failed response.
 *
 * Prefers the server's `error` field; falls back to the HTTP status so the
 * UI never shows a blank failure.
 */
export function responseError(
  data: unknown,
  response: Response,
  fallback = "Something went wrong",
): string {
  const message =
    data && typeof data === "object" && "error" in data
      ? (data as { error?: unknown }).error
      : undefined;
  if (typeof message === "string" && message.trim()) return message;
  return `${fallback} (HTTP ${response.status})`;
}

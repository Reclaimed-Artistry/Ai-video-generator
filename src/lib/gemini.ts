/**
 * Gemini key-format handling.
 *
 * Google is rolling out a new Gemini key format prefixed `AQ.` — the
 * "Authentication Key" — alongside (and increasingly instead of) the legacy
 * `AIza...` API key. The two are NOT interchangeable: an `AQ.` key sent as a
 * bearer token is rejected with
 *
 *   401 UNAUTHENTICATED — ACCESS_TOKEN_TYPE_UNSUPPORTED
 *   "Expected OAuth 2 access token"
 *
 * and must travel in the `x-goog-api-key` header instead. Legacy `AIza` keys
 * keep working with `Authorization: Bearer` (OpenAI-compatible endpoint) or
 * `?key=` (native endpoint), so we branch on the prefix rather than forcing
 * one style on both.
 *
 * See https://discuss.ai.google.dev/t/aq-prefix-api-key-returns-401-requesting-aiza-key-restoration/170835
 */

export const GOOGLE_AUTH_KEY_PREFIX = "AQ.";

export function isGoogleAuthKey(key: string): boolean {
  return key.startsWith(GOOGLE_AUTH_KEY_PREFIX);
}

/** Auth headers for a Gemini request, for either key generation. */
export function geminiAuthHeaders(key: string): Record<string, string> {
  return isGoogleAuthKey(key)
    ? { "x-goog-api-key": key }
    : { authorization: `Bearer ${key}` };
}

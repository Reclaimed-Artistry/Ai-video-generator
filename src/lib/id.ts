/**
 * Postgres raises `22P02 invalid input syntax for type uuid` when a malformed id
 * reaches a `uuid` column. That surfaces as an unhandled HTTP 500 (and, on a page,
 * as an error screen) instead of a clean 404, so validate ids before querying.
 */
export function isUuidLike(id: string | null | undefined): boolean {
  if (typeof id !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

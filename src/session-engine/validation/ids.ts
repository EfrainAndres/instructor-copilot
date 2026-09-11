/**
 * Authored ids double as filesystem lookups (Training.sessionRefs -> sessions/<id>.json),
 * so the allowed charset excludes "/", "\", "." entirely — not just "..". A slug made only
 * of letters/digits/hyphens can never traverse outside its intended directory.
 */
export const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

export function isSafeId(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && ID_PATTERN.test(value);
}

/** MVP cap on displayed command output per execution, to avoid unbounded renderer memory growth from a noisy command. */
export const DEFAULT_OUTPUT_CAP_CHARS = 500_000; // ~500 KB of text

const TRUNCATION_MARKER = "[earlier output truncated]\n";

/**
 * Appends `addition` to `existing`, trimming from the front once the combined
 * text exceeds `maxLength`, and prefixing a truncation marker when it does.
 */
export function appendWithCap(existing: string, addition: string, maxLength: number = DEFAULT_OUTPUT_CAP_CHARS): string {
  const combined = existing + addition;
  if (combined.length <= maxLength) {
    return combined;
  }
  const keep = Math.max(maxLength - TRUNCATION_MARKER.length, 0);
  return TRUNCATION_MARKER + combined.slice(combined.length - keep);
}

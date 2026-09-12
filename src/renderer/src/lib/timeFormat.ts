/** Formats a duration given in minutes as MM:SS, or H:MM:SS once it reaches an hour. */
export function formatMinutesAsClock(totalMinutes: number): string {
  const totalSeconds = Math.max(0, Math.round(totalMinutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export interface ScheduleDeltaDisplay {
  status: "ON PLAN" | "BEHIND";
  detail: string;
}

/**
 * delta <= 0 means still at/ahead of the planned checkpoint (ON PLAN); delta > 0
 * means behind it. See docs/architecture.md -> Timing and Navigation Semantics.
 */
export function formatScheduleDelta(deltaMinutes: number): ScheduleDeltaDisplay {
  const clock = formatMinutesAsClock(Math.abs(deltaMinutes));
  if (deltaMinutes <= 0) {
    return { status: "ON PLAN", detail: `${clock} before checkpoint` };
  }
  return { status: "BEHIND", detail: `${clock} behind` };
}

/** A signed MM:SS string, e.g. "+02:10" / "-01:18" / "00:00" - never clamped to zero. */
export function formatSignedMinutesAsClock(deltaMinutes: number): string {
  if (deltaMinutes === 0) {
    return formatMinutesAsClock(0);
  }
  const sign = deltaMinutes > 0 ? "+" : "-";
  return `${sign}${formatMinutesAsClock(Math.abs(deltaMinutes))}`;
}

export interface SignedDeltaDisplay {
  label: "OVER" | "UNDER" | "ON TIME";
  clock: string;
}

/** Run Report's overall-delta wording: OVER/UNDER/ON TIME, distinct from Instructor Mode's live ON PLAN/BEHIND drift wording. */
export function formatSignedDelta(deltaMinutes: number): SignedDeltaDisplay {
  if (deltaMinutes > 0) {
    return { label: "OVER", clock: formatSignedMinutesAsClock(deltaMinutes) };
  }
  if (deltaMinutes < 0) {
    return { label: "UNDER", clock: formatSignedMinutesAsClock(deltaMinutes) };
  }
  return { label: "ON TIME", clock: formatMinutesAsClock(0) };
}

/** Human-readable clock time (24-hour, HH:MM) for an instructor note's timestamp. */
export function formatNoteTimestamp(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

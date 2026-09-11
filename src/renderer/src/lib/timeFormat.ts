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

/**
 * Coordinates Electron's synchronous "before-quit" event with async shutdown
 * preparation, with no Electron dependency of its own so the race it exists to
 * prevent can be unit-tested directly (Electron's real app/event objects can't
 * be constructed outside a running app).
 *
 * Guarantees:
 * - repeated before-quit events while preparation is running never call
 *   `quit` early - they stay prevented and join the one preparation already
 *   under way;
 * - `quit` is called exactly once, only after preparation settles (success or
 *   failure - persistence failure must not block quitting indefinitely);
 * - once preparation has completed, a subsequent before-quit passes through
 *   (does not call preventDefault) so Electron's own quit proceeds normally.
 */
export interface BeforeQuitEvent {
  preventDefault(): void;
}

export function createQuitCoordinator(prepare: () => Promise<void>, quit: () => void) {
  let complete = false;
  let inFlight: Promise<void> | null = null;

  return function handleBeforeQuit(event: BeforeQuitEvent): void {
    if (complete) {
      return;
    }
    event.preventDefault();

    if (inFlight) {
      return;
    }

    inFlight = prepare()
      .catch((error) => {
        console.error("Failed to suspend the active run before quitting:", error);
      })
      .finally(() => {
        complete = true;
        quit();
      });
  };
}

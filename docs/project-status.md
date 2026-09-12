# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 6 — Evidence Staging

**Status:** READY FOR REVIEW

**Completed:**
- Phase 5 secure resource launcher, content roots, and structured command runner (see prior entries)
- Phase 6A: pure evidence-release engine operation (`releaseEvidenceStage`), current-Step-only `run.releaseEvidenceStage(evidenceStageId)` capability, and an Instructor Mode EvidenceStage panel whose `deriveEvidenceStageDisplay` helper structurally strips `detail` from any stage not yet released
- Phase 6B — Active Run Recovery / Restart Survival:
  - A single-purpose active-run pointer (`~/.instructor-copilot/active-run.json`, its own independent schema version, `{schemaVersion, runId}` only — no Training/Session paths, content roots, or timing data) is the sole source of recovery candidates; recovery never scans `runs/` or picks a "latest incomplete run"
  - `startRun` persists the SessionRun, then the pointer, and only then commits in-memory state — a pointer-save failure means the run is never established as active
  - `complete()` clears the pointer as a non-rolling-back post-commit step: a completed SessionRun is authoritative even if pointer cleanup fails
  - A reentrancy-guarded, async `before-quit` handler calls `prepareActiveRunForShutdown()` (no-op if no active run, already completed, or already paused; otherwise pauses the run - opening a pause interval that spans the downtime - and persists it) before allowing the app to quit; it waits for any in-flight mutation to settle rather than racing it
  - Startup calls the single `run.restore()` capability once: it loads the pointer, loads exactly that SessionRun, treats a completed run as a stale pointer (cleared, no recovery), rejects an incomplete-but-unpaused run with a clear message rather than silently recovering it (this is the crash/kill -9 case - explicitly not supported), then re-derives the Training/Session from the registered `TrainingRegistration` and validates full structural compatibility (`validateSessionRunRecoveryCompatibility`: Training id, Session id/title/duration, Step count/order/id/title/type/duration, checklist ids, evidence-stage ids) before restoring any in-memory state
  - Renderer shows a neutral loading state during the startup check, then either the normal Home screen (no run to recover), Instructor Mode still PAUSED with a dismissible "Session recovered after restart" banner, or a non-fatal recovery-error banner
  - Timer math correctly excludes the offline window (worked example: active 10:00-10:20, quit, still paused at 10:30 restart, elapsed = 20 min not 30; Resume at 10:31 closes the old pause interval and opens a fresh one)

**Current architecture:** `releaseEvidenceStage`, `prepareRunForShutdown`, the active-run pointer functions, and `validateSessionRunRecoveryCompatibility` all live in `session-engine/run/` as pure, Electron-independent functions. `src/main/recoveryController.ts` separates a pure, appDataRoot-parameterized `evaluateActiveRunRecovery` (no Electron dependency, directly unit-testable against a temp directory) from the thin `restoreActiveRunOnStartup` wrapper that resolves the real appDataRoot and applies the recovered state as controller side effects.

**Validation:**
- `npm run typecheck` passes
- `npm test` — 180/180 passing (148 pre-existing from Phase 6A + 32 new: active-run pointer persistence/round-trip/schema-version rejection/idempotent clear, recovery-compatibility validation for every mismatch category, shutdown-suspension pause-interval creation and no-op cases, timer correctness across the worked restart example, evidence/checklist/navigation state preserved through shutdown, save-reset-load round-trip, and `recoveryController`-level tests covering stale-completed-pointer cleanup, exact-pointed-run recovery in the presence of other incomplete run files, unpaused-run rejection, and missing registration/Training/Session failures)
- `npm run build` passes
- Manual validation: launched the built app under CDP and confirmed the renderer still has no `require`/`process`/`ipcRenderer`, that `run.restore` is present in the capability shape, and that calling it with no prior run returns `{ok: true, value: null}`, correctly leaving the app at the Home screen. Sent the running Electron process `SIGTERM` and confirmed it quit cleanly (no hang from the async `before-quit` handler, no error logged, all helper processes exited). The native OS folder picker still can't be driven headlessly, so a full UI click-through of "start a run, quit mid-run, relaunch" was not literally exercised; instead the exact exported controller functions (`startRun`, `prepareActiveRunForShutdown`, `restoreActiveRunOnStartup`, `resume`, `complete`) were driven directly across simulated process restarts (`vi.resetModules()` between each, with `HOME` repointed at one temp directory so both "processes" agree on disk state), proving: a paused run with released evidence recovers exactly on the next "launch," a second same-process restore call is idempotent, resuming and completing then clears the pointer so a further relaunch recovers nothing, and a run left unpaused (simulated crash) is rejected rather than silently recovered.

**Next proposed work:** Phase 7 — Run Report (not started)

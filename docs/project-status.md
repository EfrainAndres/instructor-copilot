# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 4 — Instructor Mode + Timing + Checklists

**Status:** READY FOR REVIEW

**Completed:**
- Phase 4A deterministic run engine (schemas, engine, timing, persistence, run-state integrity checks) — see prior entries
- Main-owned `runController.ts`: holds the single in-memory `ActiveRunContext` (run + authored Session), generates every transition timestamp (`new Date().toISOString()`) and the run id (`run-${randomUUID()}`), persists before committing each transition (a failed `saveSessionRun` never becomes the new in-memory state), and serializes mutations against concurrent double-clicks
- Capability-based run IPC: `run.start(sessionId)`, `run.next()`, `run.previous()`, `run.skip()`, `run.pause()`, `run.resume()`, `run.setChecklistItem(stepId, itemId, value)`, `run.complete()` — no generic transition/save channel; renderer never sends timestamps, ids, or a `SessionRun` object
- Instructor Mode screen (`InstructorModeScreen.tsx`): live Session/Step timers and schedule drift (via a lightweight 1s display tick, no ticking state persisted), current-Step content (objective, guidance, actions, questions, do-not-reveal, checklist), read-only Resource/Command previews ("Launching available in Phase 5"), Previous/Pause-Resume/Skip/Next↔Complete controls with correct enablement, PAUSED badge, confirmed Complete, and a simple completed-run summary
- Pure display-state derivation (`lib/instructorModeState.ts`) and a time/schedule-delta formatter (`lib/timeFormat.ts`), both unit-tested
- App view wired: Training Detail → Start Session → Instructor Mode → (Complete) → back to Training Detail

**Current architecture:** Renderer imports run-engine/timing runtime code from the Node-independent `session-engine/run/{engine,timing}.ts` leaf modules (never the barrel, which also exports Node-based persistence) — same pattern established in Phase 3B for `model/schema`.

**Validation:**
- `npm run typecheck` passes
- `npm test` — 76/76 passing (67 pre-existing + 9 new: time formatter and Instructor Mode display-state derivation, including the Next-vs-Complete labeling staying stable while paused)
- `npm run build` passes
- Manual validation: launched the built app and confirmed via CDP no `require`/`process`/`ipcRenderer`/`dialog` in the renderer, and the exposed `run.*` capability set matches exactly what was implemented (no widened surface). The native OS folder picker used by Open/Create Training can't be driven headlessly, so the full start→checklist→next→previous(revisit)→pause→resume→skip→complete lifecycle was verified by exercising the identical session-engine calls `runController` makes, against a temporary app-data root (deleted after, nothing committed) — confirmed correct Step-revisit timing exclusion, frozen elapsed time while paused, and a persisted run JSON with all intervals closed, the pause interval closed, checklist state intact, and `completedAt` set

**Next proposed phase:** Phase 5 — Resources / Launcher / Command Runner

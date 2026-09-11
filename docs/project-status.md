# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 5 — Resources / Launcher / Command Runner

**Status:** PHASE 5A READY FOR REVIEW

**Completed:**
- AppSettings persistence (`~/.instructor-copilot/settings.json`): `loadAppSettings`/`saveAppSettings`/`loadOrCreateAppSettings`, schema-version enforcement, unique-`trainingId` validation, atomic writes; a missing file returns a valid empty settings object without ever being silently created/overwritten on read
- Per-Training registration: Open/Create Training now upserts a `TrainingRegistration` (definitionRoot + contentRoots), refreshing `definitionRoot` while preserving existing content roots
- Content-root configuration: `training.getContentRootStatus()` (derived from the Training's referenced Resources/Command, via the pure `collectRequiredContentRootIds` helper), `training.configureContentRoot(rootId)` (native picker in main, renderer sends only the root name), `training.clearContentRoot(rootId)` — absolute paths never cross into the renderer
- **Resource model correction:** `file`/`folder`/`presentation` now require `root`; `application`/`url` must omit it; `url` must be an absolute `http`/`https` URL (validated via `URL` parsing, not `startsWith`)
- Secure path containment (`resolveWithinRoot`): relative-path based (not string-prefix), rejects `../` escapes, sibling-prefix escapes, and absolute-path inputs
- Main-owned resource launcher (`resourceController.ts`): `resource.openPresentation()` and `resource.openCurrentStepResource(resourceId)` — id-only from the renderer; main resolves the exact authored Resource from the active run's Session, resolves filesystem kinds through the configured content root, opens via `shell.openPath`/`shell.openExternal` only (no `child_process`, no shell string execution)
- Instructor Mode: real "Open" buttons for current-Step Resources and a standing "Open Presentation" button; launch failures surface in the existing error banner without mutating `SessionRun` state
- Training Detail: new "Content Roots" section listing required roots with Configure/Change/Clear

**Current architecture:** `getAppDataRoot()` extracted to `src/main/appData.ts`, shared by run persistence and settings persistence. No command execution exists yet (`CommandAction` remains read-only, per the roadmap's Phase 5B split).

**Validation:**
- `npm run typecheck` passes
- `npm test` — 99/99 passing (76 pre-existing + 23 new: AppSettings persistence/semantics, registration upsert/content-root pure logic, content-root discovery, path-containment resolver including the sibling-prefix and absolute-path escape cases, and the corrected Resource kind/URL invariants)
- `npm run build` passes
- Manual validation: launched the built app and confirmed via CDP the renderer still has no `require`/`process`/`ipcRenderer`/`dialog`, the new `training.*`/`resource.*` capability shapes match exactly what was implemented, and a content-root lookup with no Training open fails with a clear message. The native OS folder picker can't be driven headlessly, so registration → content-root configure/clear → path resolution (including a `../` escape attempt and the "not configured" failure) was verified by exercising the identical session-engine calls `trainingController`/`resourceController` make, against temporary directories (deleted after, nothing committed) — `shell.openPath`/`shell.openExternal` themselves were not invoked outside Electron, but everything up to that call boundary was proven correct

**Next proposed phase:** Phase 5B — Structured Command Runner

# Instructor Copilot — Architecture

See `product-spec.md` for product scope and `data-model.md` for entities. This document covers the technical baseline only.

## Desktop Architecture
Electron shell, React + TypeScript renderer, Vite build. Chosen for cross-platform (macOS/Windows) desktop delivery with local filesystem/process access, which a browser app cannot provide without a companion backend.

## Main vs Renderer Responsibilities
- **Main process**: filesystem access (read/write Training/Run JSON), launching external files/apps/folders, command execution, IPC handlers, app lifecycle. Owns all Node/OS capability.
- **Renderer process**: UI only (pages, components, state). No direct Node/filesystem/child_process access.

## Security Boundary
Electron `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` in renderer. A `preload` script exposes a **narrow, explicit API** via `contextBridge` — e.g. `trainings.list()`, `session.openResource(id)`, `commands.run(actionId)` — never a generic `ipcRenderer.invoke` passthrough, and never one that accepts a raw executable/args/path from the renderer. The renderer submits only an authored id (a `Resource.id` or `CommandAction.id`); main looks up the corresponding entry in the current Session's own definition, resolves its `root`-relative path/cwd against that Training's own registered content root (see Content Roots below), and rejects anything that escapes it. This matters specifically because the app can execute local commands: the renderer must never be able to construct an arbitrary command or path and have main execute it blindly.

## IPC Strategy
Request/response over `ipcMain.handle` / `ipcRenderer.invoke`, one channel per capability (e.g. `training:list`, `resource:open`, `command:run`, `run:save`). No generic "eval this" channel. Long-running command execution streams stdout/stderr via `webContents.send` events keyed by a run id.

## Filesystem Access
All access goes through main. Two roots matter:
- **App data dir** (`~/.instructor-copilot/`): settings, training registry, run history — owned/written by the app.
- **Training directories**: user-authored/imported, referenced by path, not copied into app data (see Training Import/Reference Model).

## Application/File Launching
Main uses Electron's `shell.openPath()` / `shell.openExternal()` to open files, folders, and applications with the OS default handler (e.g., open a `.pptx` in PowerPoint, a folder in Finder/Explorer). No custom app-detection logic needed for MVP.

## Command Execution Architecture (implemented in Phase 5B)
A `CommandAction` is a **structured** command — `executable` + `args[]` + a `root`-relative `cwd` — authored at Step-authoring time, never a single shell string. At run time the instructor explicitly clicks "Run Command"; the renderer sends only the `CommandAction.id`, never raw executable/args/cwd. Main resolves that id against the *active run's* authored Session and current active Step only (`resolveCurrentStepCommand` — a mismatched or non-current-Step id is rejected), resolves `cwd` against the content root registered for `SessionRun.trainingId` specifically (never "whichever Training happens to be open" — see Content Roots below), rejecting anything that escapes it, and spawns with `child_process.spawn(executable, args, { cwd, shell: false, windowsHide: true })`. `shell: false` is deliberate: it avoids shell-quoting ambiguity and shell-injection risk entirely, since there is no shell parsing the string — `executable`/`args` are passed to the OS process call directly. stdout/stderr stream live to the initiating renderer only (never broadcast); a nonzero exit code is a normal completion, not an error. Commands marked `sensitive` require an extra native confirmation dialog before spawn. Only one execution is allowed in flight; command execution never mutates `SessionRun` and never auto-runs.

## Timing and Navigation Semantics
Instructor Mode supports Next, Previous, Skip, and Pause/Resume, without letting navigation distort reported timing. Each `StepRun` tracks time as a list of `activeIntervals` rather than a single start/end pair: moving to a step opens a new interval on its `StepRun`; moving away closes it. Revisiting a step via Previous simply opens another interval on the same `StepRun` — its actual duration is always the sum of its own closed intervals (plus the currently open one, measured against "now"), so time spent on other steps in between is never attributed to it. Session-level Pause/Resume works the same way at the `SessionRun` level via `pauseIntervals`: while paused, no `StepRun` interval is open, and reporting subtracts total paused time from session elapsed and schedule-drift calculations. This interval model was chosen over a single-timestamp-per-step model specifically because the product requires reliable Previous/Skip navigation; the trade-off is a few extra bytes per run file, which is negligible at MVP scale. No timer implementation happens in Phase 0 — this section fixes the semantics so Phase 4 doesn't have to redesign the run data shape.

**Phase 4A implementation notes:** Next prefers a Step's explicit `nextStepId`, falling back to the following Step in authored `Session.steps` order; Previous always uses the immediately preceding Step in authored `Session.steps` order (ignoring `nextStepId`) — there is no separate navigation-history stack. The live schedule delta for the current Step is `sessionActiveElapsed - plannedCheckpoint`, where `plannedCheckpoint` is the sum of `plannedDurationMinutesSnapshot` for every Step from index 0 through the current Step's index, inclusive; negative means at/ahead of schedule, positive means behind.

## Instructor Notes and Run Report (implemented in Phase 7)
Instructor Mode has a compact Notes panel scoped to the *current* active Step: the renderer submits only note text via `run.addNote({text})`; main generates the note id (`note-${randomUUID()}`), timestamp, and resolves the current active Step itself, mirroring how `releaseCurrentEvidenceStage` restricts evidence release to the current Step only. Notes append to `SessionRun.notes` (a pure `addInstructorNote` engine operation) and persist/recover exactly like the rest of `SessionRun` — no separate note store, no edit/delete in the MVP.

Completing a run (`run.complete()`) transitions the renderer straight to a dedicated **Run Report** screen (the MVP's fifth screen, not a subsection of Instructor Mode) built from the already-returned `InstructorRunContext` with no extra filesystem read. The report itself (`buildRunReport`, pure/Node-and-browser-safe) reads only `SessionRun`'s historical snapshots/intervals/notes — never the live authored Session/Step — so a later Session edit can never rewrite a completed run's numbers. Per-Step status distinguishes `skipped` (final StepRun status is `"skipped"`) from `not_reached` (final status is still `"pending"` because the run completed before that Step was ever visited) — these are deliberately different states, not interchangeable "didn't happen" cases.

## Active Run Recovery and Clean-Restart Survival (implemented in Phase 6B)
Instructor Copilot supports recovering a live, incomplete run across a **clean application restart** — quitting the app while a run is paused-or-about-to-be-paused, then relaunching. It explicitly does **not** promise correct recovery after a crash, `kill -9`, power loss, or any other termination that skips the app's own shutdown handling.

- `~/.instructor-copilot/active-run.json` holds a minimal, independently-versioned pointer (`{schemaVersion, runId}` only — never a Training/Session path, content root, or timing data). It is the **only** source of recovery candidates; recovery never scans `runs/` or picks a "latest incomplete" file. It is written only when a run starts (after the SessionRun itself is persisted) and cleared only when a run completes.
- On quit, an async, reentrancy-guarded `before-quit` handler suspends the active run if it is incomplete and not already paused — this opens a `pauseInterval` spanning the downtime and persists it — before allowing the app to actually terminate.
- On startup, the renderer calls a single `run.restore()` capability. It loads the pointer, loads exactly that SessionRun, and requires it to be already paused; an incomplete-but-unpaused run (the crash case) is rejected with a clear message rather than silently recovered using the current time, since that would corrupt its timing. A pointer to an already-completed run is treated as stale, cleared, and produces no recovery. Once the run passes that check, its Training/Session are re-derived through the registered `TrainingRegistration` and validated for full structural compatibility (same Step count/order/ids/titles/types/durations, same checklist and evidence-stage ids) before anything is restored — this guards against recovering a run against a Session that has since been edited.
- A recovered run stays paused; the instructor must explicitly click Resume, which closes the shutdown-spanning pause interval and opens a fresh one, so time spent offline is never counted as active.

## Local Persistence Approach
Plain JSON files, no SQLite/database for MVP:
- `~/.instructor-copilot/settings.json` — app settings, including one `TrainingRegistration` per imported Training (its definition path plus its own `contentRoots` mapping — named root → absolute path; see Content Roots below).
- `~/.instructor-copilot/runs/<runId>.json` — SessionRun history (active/pause intervals, checklist state, notes, evidence state, per-step authoring snapshots) for Run Reports.
- `~/.instructor-copilot/active-run.json` — the active-run pointer described above (Phase 6B).

Each Training itself is a self-contained directory the app *references*, not a database record:
```
training/
  training.json
  sessions/
    session-1.json
    session-2.json
  assets/           (optional, for training-owned files)
```
Rationale for plain JSON over SQLite: MVP data volume is small (one instructor, dozens of steps, occasional runs), human-readable files are easy to inspect/debug/version-control, and no query complexity justifies a database yet. Revisit only if run history search/reporting grows non-trivial.

## Training Import/Reference Model
**Decision: reference, don't copy.** A Training's `training.json`/session files live wherever the instructor keeps them (typically inside the Instructor Copilot repo itself, e.g. `examples/backend-testing-mindset/`, since they're the portable *definition*). Instructor Copilot stores only the Training directory's path (`TrainingRegistration.definitionRoot`) in `AppSettings.trainings` ("Import Training" = pick a folder). Copying course assets into the Training directory was rejected: it would duplicate potentially large presentation/lab files and create sync drift with the source project.

## Content Roots
A Training *definition* (steps, resources, commands) must stay portable and machine-independent, but the actual content it points at — e.g. the Backend-Testing-Mindset-Training repo's presentations, worksheets, and lab scripts — lives at an arbitrary, machine-specific absolute path that must never be baked into portable JSON. Instructor Copilot resolves this with a level of indirection called a **content root**: a short logical name (e.g. `"content"`) that `Resource`/`CommandAction` entries reference (`root: "content"`), scoped to that Training only. Each Training's `TrainingRegistration.contentRoots` (in `AppSettings.trainings`, keyed by `trainingId`) maps its own root names to absolute paths on the current machine (`"content" → "/Users/efrain.vergara/Documents/Unosquare/Backend-Testing-Mindset-Training"`) — since roots are namespaced per Training, two different Trainings can each safely register a root called `"content"` without colliding. Configuring that mapping ("point 'content' at this folder") is a one-time, per-machine setup step when a Training is imported — it is not stored in the Training's own files. This is exactly what lets the Instructor Copilot Training definition live in this repo, under version control, while referencing the Backend Testing Mindset repo's real files **without ever modifying that repo or embedding its absolute path in portable JSON**. A Training may declare more than one named root if it draws on more than one external content location; keep the set minimal (one root per Training is the common case).

Main enforces the security boundary here: `cwd`/`path` resolution always starts from the current Training's `TrainingRegistration.contentRoots[root]`, and any resolved path that would escape that root's directory tree (e.g. via `..` segments) is rejected before the file is opened or the command is spawned.

## Portability Considerations
Because resources/commands reference a Training-scoped content root rather than an absolute path, a Training *definition* directory can be committed, moved, or shared across machines — only that Training's `contentRoots` entry in `AppSettings` needs reconfiguring on a new machine. Absolute paths are never stored in Training/Session JSON — only in the per-machine `AppSettings.trainings` registry.

## macOS and Windows Considerations
- `shell.openPath` and `child_process.spawn` behave consistently via Electron's cross-platform abstraction; avoid shell-specific syntax in stored commands (document that commands should be cross-platform-neutral, e.g. Node scripts, where the instructor intends to reuse a Training on both OSes).
- Path separators: always store/join paths with Node's `path` module, never hardcoded `/` or `\`.
- No OS-specific automation (e.g., no AppleScript/PowerPoint COM) in MVP — this is exactly why slide-sync is deferred to v0.2+.

## Why No Backend/Cloud Is Needed
Single-user, single-machine, offline-first tool. All state (settings, training registry, run history) fits comfortably in local JSON. Introducing a backend would add deployment/auth/sync complexity with no MVP benefit.

## Adaptive Facilitation Console (Phase 9B-A)
Following the Phase 9A real-dry-run audit (`/Users/efrain.vergara/Documents/Unosquare/instructor-copilot-phase-9a-ux-audit.md`, external to this repo), the product relationship changed: **PowerPoint remains the participant-facing content surface; Instructor Copilot is the instructor's private operational/facilitation surface.** Instructor Mode must therefore be quiet whenever the slide already carries everything the instructor needs, and more active exactly when the instructor must coordinate questions, participant activity, time, private information, resources, Postman/commands, or evidence. This did not change the run engine, timing/drift math, navigation semantics, or persistence - only what Instructor Mode renders and how Session 1 ES is authored.

- **Derived display model**: `src/renderer/src/lib/facilitationDisplay.ts` is a pure function of the authored `Step` (`deriveFacilitationSections`) plus the `Session`'s ordered Steps (`deriveNextPreview`). It never mutates and never invents instructions - `NOW` is `actions[0]` when authored, `undefined` otherwise; every other section (`ASK`/`FOLLOW-UP`/`LISTEN FOR`/`TRANSITION`/`FALLBACK`) simply mirrors its corresponding optional Step field, omitted when absent so Instructor Mode never renders an empty heading. `Step.type` selects an `emphasis` (`discussion` | `activity` | `demo` | `investigation` | `debrief` | `closing` | `quiet`) that only affects visual weighting in `InstructorModeScreen.tsx`/`styles.css`, never which data is shown.
- **Safety-first rendering**: any populated `doNotReveal` renders as a dedicated safety strip above all other Step content (crimson border, first DOM position) - this is what makes the Slide 13/16 reveal-choreography warnings ("NO AVANZAR A LA DIAPOSITIVA 13/16 TODAVÍA") visually impossible to miss before the instructor advances the participant-facing slide.
- **NEXT preview**: every non-final Step shows the next Step's slide reference/title/type, resolved through the existing `resolveNextStepId` (nextStepId override, else authored array order) - no new navigation concept, no new authored "next" field. The final Step (no resolvable next Step) shows "Finish when ready" instead.
- **Collapsed by default**: Notes and the Objective/Facilitator-guidance "Context" drawer are collapsed on every Step, reset whenever the active Step changes (local component state, never persisted) - Notes persistence/add-note IPC is unchanged, only its default visibility.
- **Localization**: `src/renderer/src/lib/i18n.ts` is a small built-in typed dictionary (`en`/`es`), selected by `Session.locale` (absent = `en`). No i18n library, no runtime translation of authored content - only Instructor Mode's own UI chrome (labels, button text, status wording) is looked up through it. Authored Session/Step prose (objective, guidance, questions, etc.) is translated once, at authoring time, by whoever writes the Training - Instructor Copilot never machine-translates it.
- **Layout**: `InstructorModeScreen.tsx` uses a two-column grid at desktop widths (operational content + a compact sticky NEXT/status side panel), collapsing to one column under ~52rem so nothing requires horizontal scrolling. This is the same screen/IPC surface as before - Open Presentation, Previous/Next/Skip/Pause/Resume, resource Open, Run Command, checklist toggling, and evidence release are all unchanged.

Explicitly **not** part of this phase (see `docs/project-status.md` for the full list): Restart Session/Discard Run and any other run-lifecycle change, explicit Session buffer/timing-checkpoint realignment, activity checkpoint alerts, keyboard shortcuts, AI, or PowerPoint slide detection - all deferred to Phase 9B-B.

## Major Architectural Risks
- **Command execution safety**: renderer-triggered process execution is the largest attack surface; mitigated by the id-only IPC boundary, structured (`shell: false`) execution, and explicit-confirmation UX, but must be reviewed carefully at implementation time.
- **JSON schema drift**: `Training`, `AppSettings`, and `SessionRun` files evolve independently and each need their own migration path (see `data-model.md` → Versioning).
- **Content root misconfiguration**: a content root pointing at a moved/renamed/missing folder breaks every Resource/CommandAction that references it; the app must surface this clearly (e.g. "content root not found") rather than fail silently.
- **No file locking**: concurrent writes (e.g., editing a Session while a Run is active) are out of scope for MVP; assume single active window/session.

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

## Command Execution Architecture (data model only in Phase 0)
A `CommandAction` is a **structured** command — `executable` + `args[]` + a `root`-relative `cwd` — authored at Step-authoring time, never a single shell string. At run time the instructor explicitly clicks "Run command"; the renderer sends only the `CommandAction.id`, never raw executable/args. Main looks up that id in the current Session's own definition, resolves `cwd` against the approved content root (see Content Roots below, rejecting anything that escapes it), and spawns with `child_process.spawn(executable, args, { cwd, shell: false })`. `shell: false` is deliberate: it avoids shell-quoting ambiguity and shell-injection risk entirely, since there is no shell parsing the string — `executable`/`args` are passed to the OS process call directly. Streams stdout/stderr/exit code back and never auto-executes. Commands marked sensitive require an extra confirmation dialog. No implementation in Phase 0 — this section exists so the data model (`CommandAction`, `ExecutionResult`) is designed correctly up front.

## Timing and Navigation Semantics
Instructor Mode supports Next, Previous, Skip, and Pause/Resume, without letting navigation distort reported timing. Each `StepRun` tracks time as a list of `activeIntervals` rather than a single start/end pair: moving to a step opens a new interval on its `StepRun`; moving away closes it. Revisiting a step via Previous simply opens another interval on the same `StepRun` — its actual duration is always the sum of its own closed intervals (plus the currently open one, measured against "now"), so time spent on other steps in between is never attributed to it. Session-level Pause/Resume works the same way at the `SessionRun` level via `pauseIntervals`: while paused, no `StepRun` interval is open, and reporting subtracts total paused time from session elapsed and schedule-drift calculations. This interval model was chosen over a single-timestamp-per-step model specifically because the product requires reliable Previous/Skip navigation; the trade-off is a few extra bytes per run file, which is negligible at MVP scale. No timer implementation happens in Phase 0 — this section fixes the semantics so Phase 4 doesn't have to redesign the run data shape.

**Phase 4A implementation notes:** Next prefers a Step's explicit `nextStepId`, falling back to the following Step in authored `Session.steps` order; Previous always uses the immediately preceding Step in authored `Session.steps` order (ignoring `nextStepId`) — there is no separate navigation-history stack. The live schedule delta for the current Step is `sessionActiveElapsed - plannedCheckpoint`, where `plannedCheckpoint` is the sum of `plannedDurationMinutesSnapshot` for every Step from index 0 through the current Step's index, inclusive; negative means at/ahead of schedule, positive means behind.

## Local Persistence Approach
Plain JSON files, no SQLite/database for MVP:
- `~/.instructor-copilot/settings.json` — app settings, including one `TrainingRegistration` per imported Training (its definition path plus its own `contentRoots` mapping — named root → absolute path; see Content Roots below).
- `~/.instructor-copilot/runs/<runId>.json` — SessionRun history (active/pause intervals, checklist state, notes, evidence state, per-step authoring snapshots) for Run Reports.

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

## Major Architectural Risks
- **Command execution safety**: renderer-triggered process execution is the largest attack surface; mitigated by the id-only IPC boundary, structured (`shell: false`) execution, and explicit-confirmation UX, but must be reviewed carefully at implementation time.
- **JSON schema drift**: `Training`, `AppSettings`, and `SessionRun` files evolve independently and each need their own migration path (see `data-model.md` → Versioning).
- **Content root misconfiguration**: a content root pointing at a moved/renamed/missing folder breaks every Resource/CommandAction that references it; the app must surface this clearly (e.g. "content root not found") rather than fail silently.
- **No file locking**: concurrent writes (e.g., editing a Session while a Run is active) are out of scope for MVP; assume single active window/session.

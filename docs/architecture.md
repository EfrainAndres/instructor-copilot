# Instructor Copilot — Architecture

See `product-spec.md` for product scope and `data-model.md` for entities. This document covers the technical baseline only.

## Desktop Architecture
Electron shell, React + TypeScript renderer, Vite build. Chosen for cross-platform (macOS/Windows) desktop delivery with local filesystem/process access, which a browser app cannot provide without a companion backend.

## Main vs Renderer Responsibilities
- **Main process**: filesystem access (read/write Training/Run JSON), launching external files/apps/folders, command execution, IPC handlers, app lifecycle. Owns all Node/OS capability.
- **Renderer process**: UI only (pages, components, state). No direct Node/filesystem/child_process access.

## Security Boundary
Electron `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` in renderer. A `preload` script exposes a **narrow, explicit API** via `contextBridge` — e.g. `trainings.list()`, `session.openResource(id)`, `commands.run(actionId)` — never a generic `ipcRenderer.invoke` passthrough. Every IPC handler in main validates its input (path is inside a known training/asset root, command is one defined in the session's `CommandAction` list) before acting. This matters specifically because the app can execute local shell commands: the renderer must never be able to construct an arbitrary command or path and have main execute it blindly.

## IPC Strategy
Request/response over `ipcMain.handle` / `ipcRenderer.invoke`, one channel per capability (e.g. `training:list`, `resource:open`, `command:run`, `run:save`). No generic "eval this" channel. Long-running command execution streams stdout/stderr via `webContents.send` events keyed by a run id.

## Filesystem Access
All access goes through main. Two roots matter:
- **App data dir** (`~/.instructor-copilot/`): settings, training registry, run history — owned/written by the app.
- **Training directories**: user-authored/imported, referenced by path, not copied into app data (see Training Import/Reference Model).

## Application/File Launching
Main uses Electron's `shell.openPath()` / `shell.openExternal()` to open files, folders, and applications with the OS default handler (e.g., open a `.pptx` in PowerPoint, a folder in Finder/Explorer). No custom app-detection logic needed for MVP.

## Command Execution Architecture (data model only in Phase 0)
A `CommandAction` (command string + working directory) is defined at authoring time in a Step. At run time the instructor explicitly clicks "Run command"; main spawns it (`child_process.spawn`) with the working directory resolved relative to the training root, streams stdout/stderr/exit code back, and never auto-executes. Commands marked sensitive require an extra confirmation dialog. No implementation in Phase 0 — this section exists so the data model (`CommandAction`, `ExecutionResult`) is designed correctly up front.

## Local Persistence Approach
Plain JSON files, no SQLite/database for MVP:
- `~/.instructor-copilot/settings.json` — app settings.
- `~/.instructor-copilot/trainings.json` — registry of known Training root paths (not the Trainings themselves).
- `~/.instructor-copilot/runs/<runId>.json` — SessionRun history (timers, checklist state, notes, evidence state) for Run Reports.

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
**Decision: reference, don't copy.** A Training's `training.json`/session files live wherever the instructor keeps their course materials (e.g., inside the existing Backend-Testing-Mindset-Training repo). Instructor Copilot stores only the root path in `trainings.json` ("Import Training" = pick a folder). `Resource` entries inside sessions store paths **relative to the training root**, so the training directory stays portable and independent of Instructor Copilot's own app-data location. Copying assets was rejected: it would duplicate potentially large presentation/lab files and create sync drift with the source project.

## Portability Considerations
Because resources are relative paths, a Training directory can be moved, zipped, or shared as long as its internal relative structure is preserved. Absolute paths are never stored in training JSON — only in the per-machine `trainings.json` registry.

## macOS and Windows Considerations
- `shell.openPath` and `child_process.spawn` behave consistently via Electron's cross-platform abstraction; avoid shell-specific syntax in stored commands (document that commands should be cross-platform-neutral, e.g. Node scripts, where the instructor intends to reuse a Training on both OSes).
- Path separators: always store/join paths with Node's `path` module, never hardcoded `/` or `\`.
- No OS-specific automation (e.g., no AppleScript/PowerPoint COM) in MVP — this is exactly why slide-sync is deferred to v0.2+.

## Why No Backend/Cloud Is Needed
Single-user, single-machine, offline-first tool. All state (settings, training registry, run history) fits comfortably in local JSON. Introducing a backend would add deployment/auth/sync complexity with no MVP benefit.

## Major Architectural Risks
- **Command execution safety**: renderer-triggered process execution is the largest attack surface; mitigated by the preload allowlist boundary and explicit-confirmation UX, but must be reviewed carefully at implementation time.
- **JSON schema drift**: as Training/Session/Step shapes evolve, existing Training directories on disk need a migration/versioning story (see `data-model.md`).
- **Relative path resolution**: moving a Training directory without moving referenced external assets (if any live outside it) will break resource launches; document this as an instructor responsibility for MVP.
- **No file locking**: concurrent writes (e.g., editing a Session while a Run is active) are out of scope for MVP; assume single active window/session.

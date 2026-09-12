# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 5 — Resources / Launcher / Command Runner

**Status:** READY FOR REVIEW

**Completed:**
- Phase 5A secure resource launcher, content-root registry, and path containment (see prior entries)
- Structured command runner: `command.runCurrentStep(commandId)` — renderer sends only `commandId`; main resolves the trusted `CommandAction` via `resolveCurrentStepCommand` (current active Step only, id must match exactly)
- cwd resolution bound to `SessionRun.trainingId` via the Phase 5A trainingId-keyed registry, confined to the configured content root via `resolveWithinRoot` (`buildCommandExecutionPlan`)
- Structured `child_process.spawn(executable, args, { cwd, shell: false, windowsHide: true })` — no shell string, no caller-provided spawn options, no interactive terminal/PTY
- Sensitive commands (`command.sensitive === true`) require a native `dialog.showMessageBox` confirmation (label/executable/args) before spawn; Cancel returns a normal `{canceled: true}`, never an error
- One command execution in flight at a time, enforced in main (`commandController.ts`), independent of renderer button state
- Live `stdout`/`stderr` streamed to the initiating renderer only via narrow one-way events (`command.onOutput`/`command.onCompleted`, each returning an unsubscribe function) — no raw `ipcRenderer` exposed
- Exit code / spawn-failure completion shown in Instructor Mode; a nonzero exit code is a normal completion, never an IPC error
- Instructor Mode: real Command block (label, executable/args preview, Sensitive badge, Run Command button) plus a live Command Output panel (capped at ~500 KB per execution with front-truncation) that persists in component state across Step navigation until a new command starts
- Command execution never mutates `SessionRun` (no pause/resume/status/checklist/timing side effects, no output persisted) and never auto-runs

**Current architecture:** `src/main/{commandController,commandProcess}.ts` (Electron orchestration vs. low-level spawn kept separate); pure `resolveCurrentStepCommand` (session-engine `run/engine.ts`) and `buildCommandExecutionPlan` (session-engine `resources/`) extracted so the security-relevant lookup/path logic is testable without mocking Electron.

**Validation:**
- `npm run typecheck` passes
- `npm test` — 126/126 passing (108 pre-existing + 18 new: current-Step command lookup/rejection, execution-plan cwd containment incl. `../`/absolute escapes, process runner stdout/stderr/exit-code/nonexistent-executable/single-completion/`shell:false` behavior via `process.execPath -e`, and output-buffer truncation)
- `npm run build` passes
- Manual validation: launched the built app and confirmed via CDP no `require`/`process`/`ipcRenderer`/`child_process` in the renderer, and the `command.*` capability shape (`runCurrentStep`/`onOutput`/`onCompleted`) matches exactly what was implemented, with a clean "No session run is active" error when invoked with nothing open. The native OS folder picker still can't be driven headlessly, so a full live click-through (Start Session → Run Command → confirm sensitive dialog) was **not** exercised in this session; instead the complete pipeline — current-Step lookup, trainingId-bound content-root resolution, `../` cwd-escape rejection, structured spawn, live stdout/stderr, nonzero exit code, and nonexistent-executable failure — was proven end to end by exercising the exact functions `commandController` calls, against a temporary content root (deleted after, nothing committed). The native sensitive-command confirmation dialog itself was not invoked outside Electron.

**Next proposed phase:** Phase 6 — Evidence Staging

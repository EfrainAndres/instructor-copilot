# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 3 — Session Editor

**Status:** READY FOR REVIEW

**Completed:**
- Phase 3A foundation (open/create Training, Training Detail, Session Editor, core Step CRUD/reordering, narrow typed IPC)
- Phase 3A hardening: Create Training now refuses to overwrite a directory that already has a `training.json` (concise error, no silent overwrite); duration inputs no longer offer 0 as valid (`min` set just above zero, fractions still allowed)
- Session Presentation association editor (`Session.presentation`, fixed `kind: "presentation"`)
- Checklist authoring (add/edit label/remove/reorder, duplicate-id guard)
- Resource authoring — any number per Step, all kinds, enforcing the `root` invariant (auto-cleared for `"application"`, required otherwise) directly from the switch handler
- Structured CommandAction authoring (`executable` + repeatable `args[]`, never a shell string; `root`/`cwd`/`sensitive`)
- EvidenceStage authoring with `order` kept auto-synced to display position
- All nested fields (checklist/resources/command/evidenceStages/presentation) round-trip through save/reload without being erased by unrelated edits

**Current architecture:** Renderer components import runtime enums (`StepTypeSchema`, `ResourceKindSchema`) from the Node-independent `session-engine/model/schema` leaf, never the barrel — avoids pulling Node persistence code into the browser bundle (a real bundling bug hit and fixed in Phase 3A). No new IPC surface was added; `session.save(session)` remains sufficient for all nested authoring.

**Validation:**
- `npm run typecheck` passes
- `npm test` — 28/28 passing (2 new, covering the create-Training overwrite guard's `trainingDefinitionExists` helper)
- `npm run build` passes
- Manual validation: launched the built app and confirmed via CDP the renderer still has no `require`/`process`/`ipcRenderer`/`dialog` and the exposed API surface is unchanged. The native OS folder picker can't be driven headlessly, so it was not exercised by automation — the full nested-authoring workflow (presentation, 5 steps, checklist/resources/command/evidence on one step, reordering at every level, step deletion with `nextStepId` cleanup, command removal, save/reload) was verified by exercising the exact session-engine calls the editor's IPC layer uses, against a temporary directory (deleted after, nothing committed).

**Next proposed phase:** Phase 4 — Instructor Mode + Timing + Checklists

# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 3 — Session Editor

**Status:** PHASE 3A READY FOR REVIEW

**Completed:**
- Open/Create Training via native directory selection (main-owned dialog; renderer never sends a filesystem path)
- Training Detail screen: editable metadata, ordered session list, Create Session, Reload
- Session Editor: metadata editing, full Step CRUD (add/edit/delete/reorder), dangling `nextStepId` auto-cleared on delete
- Core Step field editor: type, title, slideRef, plannedDurationMinutes, objective, facilitatorGuidance, actions/questions/doNotReveal (repeatable string lists), nextStepId (dropdown of sibling steps)
- Narrow typed editor IPC (`training.open/create/getCurrent/saveMetadata`, `session.create/save`) — no raw `ipcRenderer`, no arbitrary-path methods, all renderer-submitted data re-validated by session-engine
- Validation/error handling: domain errors surfaced as concise messages, no raw stack traces
- Unsaved-change protection in Session Editor (confirm before leaving a dirty session)
- Nested Phase 3B-owned fields (checklist, resources, command, evidenceStages) are preserved through unrelated edits — not yet editable

**Current architecture:** `src/main/trainingController.ts` owns the single active Training root and all dialog/filesystem access; `src/shared/ipc.ts` defines the channel/result contract; renderer imports session-engine's leaf `model/schema` module (not the Node-dependent barrel) to reuse `StepTypeSchema` safely in the browser bundle.

**Validation:**
- `npm run typecheck` passes
- `npm test` — 26/26 tests passing (all pre-existing; no regressions)
- `npm run build` passes
- Manual validation: launched the app and confirmed via CDP the renderer has no `require`/`process`/`ipcRenderer`/`dialog`, the typed `instructorCopilot` bridge exposes exactly `getAppInfo`/`training.{open,create,getCurrent,saveMetadata}`/`session.{create,save}`, and Home/Create-Training UI renders correctly. The native OS directory-picker can't be driven headlessly, so the full create→session→steps→reorder→delete→save→reload workflow was additionally verified by exercising the exact session-engine calls the IPC layer uses, against a temporary directory (deleted after, nothing committed) — order and nested-field preservation confirmed correct.

**Next proposed work:** Phase 3B — Full Step Authoring (checklist, resource, command, evidence-stage editors)

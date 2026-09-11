# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 2 — Training / Session / Step Model

**Status:** READY FOR REVIEW

**Completed:**
- Canonical authored TypeScript model (`src/session-engine/model/schema.ts`), Zod schemas as single source of truth, types inferred from them
- Runtime JSON validation, safe-slug id validation, independent Training/Session schema-version checks, safe bundle load/save, generic sample fixture, unit tests (see prior entry for details)
- Phase 2 persistence-invariant corrections: `saveTraining`/`saveSession` now reject an unsupported `schemaVersion` before writing; `saveSession` verifies `Session.trainingId` matches the Training already at `trainingRoot` before writing; `Training.sessionRefs`/`Session.steps` may be empty (supports authoring a Training/Session before content is added); `Resource.root` is now enforced as required for every kind except `"application"`, where it must be omitted

**Current architecture:** `session-engine` remains a plain TypeScript module (no Electron/React imports), not yet wired into the Electron app's IPC/UI.

**Validation:**
- `npm run typecheck` passes (main, renderer, session-engine)
- `npm test` — 26/26 tests passing
- `npm run build` passes; Phase 1 Electron shell unaffected (no main/preload/renderer files changed in this fix)
- Backend Testing Mindset untouched

**Next proposed phase:** Phase 3 — Session Editor

# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 4 — Instructor Mode + Timing + Checklists

**Status:** PHASE 4A READY FOR REVIEW

**Completed:**
- `SessionRun`/`StepRun`/`TimeInterval`/`InstructorNote` runtime schemas (`src/session-engine/run/schema.ts`), independently versioned (`SESSION_RUN_SCHEMA_VERSION = 1`)
- Deterministic, pure run engine (`run/engine.ts`): create run (with Session/Step snapshots, first-Step auto-activation), Next/Previous/manual navigation, Skip, Pause/Resume, Complete, checklist toggling — all interval-based per `architecture.md` → Timing and Navigation Semantics
- Step revisit timing verified correct: reopening a Step's interval never attributes time spent on other Steps to it
- Pause/Resume: paused time never enters Step actual duration or session active elapsed; double-pause, resume-while-not-paused, and navigation-while-paused are all rejected with clear errors
- Timing/drift helpers (`run/timing.ts`): Step actual duration, session wall/active elapsed, paused duration, live schedule delta (cumulative planned checkpoint), and a completed-run total schedule delta — all derived from intervals + `now`, nothing ticking is persisted
- Run-state semantic validation (impossible states: duplicate StepRun ids, >1 active StepRun, >1 open pause interval, open Step interval while paused, backwards intervals/`completedAt`, completed run with open state)
- Strengthened run-state integrity: `createSessionRun` now rejects a `trainingId` that doesn't match `Session.trainingId`; only the active StepRun may ever hold an open interval — a non-active StepRun with an open interval, more than one open interval on a single StepRun, or more than one open Step interval across the whole (unpaused) run are all rejected
- Run persistence (`run/persistence.ts`): `loadSessionRun`/`saveSessionRun` against a caller-supplied app-data root, mirroring Training persistence (atomic writes, schema-version enforcement, no hardcoded path)

**Current architecture:** `session-engine/run/` is Electron/React-independent, exported from the barrel alongside the authored model; no IPC or UI added — Phase 4B will wire `run.*` capabilities.

**Validation:**
- `npm run typecheck` passes
- `npm test` — 67/67 passing (60 pre-existing + 7 new: Training/Session ownership rejection at run creation, and the strengthened open-interval invariants), all with fixed ISO timestamps, no clock/sleep dependence
- `npm run build` passes; Phase 3 Session Editor and Electron shell relaunched and confirmed working via CDP

**Next proposed work:** Phase 4B — Instructor Mode UI

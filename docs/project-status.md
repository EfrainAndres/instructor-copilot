# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 6 — Evidence Staging

**Status:** PHASE 6A READY FOR REVIEW

**Completed:**
- Phase 5 secure resource launcher, content roots, and structured command runner (see prior entries)
- Pure evidence-release engine operation (`releaseEvidenceStage`): one-way `locked -> released` per `StepRun.evidenceState` entry, idempotent on an already-released stage, rejects a completed run or an unknown/wrong-Step EvidenceStage id, and touches only that one evidence entry — timing/status/checklist/notes and every other StepRun are untouched
- Current-Step-only main capability `run.releaseEvidenceStage(evidenceStageId)`: renderer sends only the stage id (never a `stepId`, `StepRun`, or desired state); main resolves the current active Step and persists the updated `SessionRun` before committing it in memory, reusing the existing persist-then-commit mutation pattern
- Instructor Mode: current-Step EvidenceStage panel showing order/label/LOCKED-or-RELEASED status with a Release button per locked stage; a pure `deriveEvidenceStageDisplay` helper is the single boundary that strips `detail` from any stage not yet released, so a locked stage's authored detail is structurally never rendered
- Release works in any order, survives Next/Previous revisit and Pause/Resume (state lives on `StepRun`, not the authored Step), and never auto-releases (no release tied to Step entry, navigation, command execution, resource opening, checklist completion, or timers)

**Current architecture:** `releaseEvidenceStage` lives in `session-engine/run/engine.ts` alongside the other pure per-Step run operations; `deriveEvidenceStageDisplay` lives in `renderer/src/lib/`, mirroring the existing display-helper pattern (`instructorModeState.ts`, `commandExecutionState.ts`).

**Validation:**
- `npm run typecheck` passes
- `npm test` — 148/148 passing (133 pre-existing + 15 new: locked initialization, single-stage release with others untouched, out-of-order release, idempotent re-release, unknown/wrong-Step id rejection, paused release without timing/pause-state change, rejection after completion, revisit persistence, save/load round-trip, and the renderer display helper's locked-detail suppression/ordering/no-mutation guarantees)
- `npm run build` passes
- Manual validation: launched the built app and confirmed via CDP no `require`/`process`/`ipcRenderer` in the renderer, and `run.releaseEvidenceStage` is present in the `run.*` capability shape with a clean "No session run is active" error when invoked with nothing open. The native OS folder picker still can't be driven headlessly, so a full live click-through (Start Session → release stages out of order → Next/Previous → Pause → release while paused → Resume) was **not** exercised in this session; instead the identical sequence was proven end to end by exercising the exact engine/persistence calls `runController` uses, against a temporary app-data root (deleted after, nothing committed) — confirmed out-of-order release, revisit persistence, paused release with pause/timing state unchanged, and a persisted run JSON with all three evidence entries correctly released.

**Phase 6 is NOT closed.** The roadmap's Phase 6 stop condition explicitly requires evidence state to survive an app restart mid-run; that (active-run recovery / restart survival) is Phase 6B, not yet implemented.

**Next proposed work:** Phase 6B — Active Run Recovery / Restart Survival

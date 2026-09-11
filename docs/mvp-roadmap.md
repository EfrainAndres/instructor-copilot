# Instructor Copilot — MVP Roadmap

Each phase should be small enough to implement and validate in isolation. Do not start a phase until the previous one's stop condition is met. Do not expand scope mid-phase — see `product-spec.md` for non-goals.

## Phase 0 — Foundation
**Goal:** Durable product/architecture/data-model baseline so future sessions don't re-derive requirements.
**Deliverable:** `docs/product-spec.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/mvp-roadmap.md`, `CLAUDE.md`, git repo initialized.
**Validation:** Docs are internally consistent; no app code/dependencies exist.
**Stop condition:** Docs committed. No Electron/React/package.json created.

## Phase 1 — Desktop Shell
**Goal:** Minimal Electron + React + TS + Vite app that opens a window with the security boundary in place.
**Deliverable:** Empty shell app: main process, preload with `contextBridge`, renderer showing a placeholder screen. `contextIsolation`/`sandbox` verified on.
**Validation:** App launches on dev machine; renderer has no direct `require`/Node access (manually verify via devtools).
**Stop condition:** Blank window renders; no Training/Session logic yet.

## Phase 2 — Training / Session / Step Model
**Goal:** Implement the `session-engine` data model and JSON load/save (main process) per `data-model.md`.
**Deliverable:** Pure TS module: types, JSON (de)serialization, schema version check, one hand-written sample Training fixture.
**Validation:** Unit tests: load fixture, round-trip save, reject/migrate a wrong schema version.
**Stop condition:** Sample Training loads correctly in a Node test; no UI yet.

## Phase 3 — Session Editor
**Goal:** GUI to create/edit a Training's Sessions and Steps without hand-editing JSON.
**Deliverable:** Training Detail + Session Editor screens; CRUD on Steps and their fields (objective, actions, questions, checklist, resources, command, evidence stages).
**Validation:** Instructor can build the Phase-2 sample Training from scratch through the UI and it matches the fixture shape.
**Stop condition:** A non-trivial Session (5+ steps) can be authored and reopened correctly.

## Phase 4 — Instructor Mode + Timing + Checklists
**Goal:** Live single-step runner view with deterministic timers/drift and checklist state.
**Deliverable:** Instructor Mode screen: current step display, session/step timers, schedule drift, checklist toggling, manual next/previous.
**Validation:** Start a run, let it progress through steps, verify timer math (session elapsed, step elapsed, drift) against manual calculation.
**Stop condition:** A full session can be run start-to-finish with correct timing and persisted `SessionRun`/`StepRun` state.

## Phase 5 — Resources / Launcher / Command Runner
**Goal:** Implement resource launching (`shell.openPath`) and the command runner (manual trigger, confirmation, stdout/stderr/exit code).
**Deliverable:** "Open" buttons for Resources; "Run command" button with confirmation for sensitive commands and live output.
**Validation:** Open a file/folder/app from a Step; run a benign test command and confirm output/exit code display; verify sensitive command requires confirmation.
**Stop condition:** No command auto-executes; renderer cannot construct arbitrary commands (spot-check IPC boundary).

## Phase 6 — Evidence Staging
**Goal:** Manual progressive reveal of `EvidenceStage`s during a run.
**Deliverable:** Evidence panel in Instructor Mode showing locked/released state per stage, with a release action.
**Validation:** Define a Step with 3+ evidence stages, release them out of default order, verify `StepRun.evidenceState` persists correctly.
**Stop condition:** Evidence state survives app restart mid-run.

## Phase 7 — Run Report
**Goal:** Post-session summary screen.
**Deliverable:** Run Report screen: planned vs actual per step, delta, status (on time/over/under/skipped), instructor notes.
**Validation:** Complete a run with intentionally mistimed steps and skipped notes; verify report numbers match `StepRun` timestamps.
**Stop condition:** Report renders correctly for both a clean run and one with a skipped/orphaned step.

## Phase 8 — Backend Testing Mindset Integration
**Goal:** Author a real Instructor Copilot Training pointing at the existing Backend-Testing-Mindset-Training project (Session 1 ES first).
**Deliverable:** A Training directory (in `examples/` or referencing the external repo per the reference-not-copy model) with Session 1 fully modeled: steps, resources (presentation, worksheets, Postman collection, C# lab paths), commands (Node helper scripts), evidence stages.
**Validation:** Every Resource/CommandAction path resolves and opens/runs correctly against the real project, **without modifying that project**.
**Stop condition:** Session 1 ES is fully authored and loads cleanly in the Session Editor.

## Phase 9 — Real Session 1 Dry Run
**Goal:** Validate the MVP acceptance criterion end-to-end.
**Deliverable:** A full, live dry-run of Backend Testing Mindset Session 1 using Instructor Mode: presentation opened, worksheets opened, Postman used, commands run, notes taken, Run Report produced.
**Validation:** Instructor completes the full acceptance-criterion checklist in `product-spec.md` and can honestly agree the app helped more than it distracted.
**Stop condition:** Acceptance criterion met, or a documented list of gaps blocking it (informs v0.2 planning).

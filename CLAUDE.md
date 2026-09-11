# Instructor Copilot — Project Rules

Read `docs/product-spec.md`, `docs/architecture.md`, `docs/data-model.md`, and `docs/mvp-roadmap.md` before implementing anything — do not rediscover product requirements from scratch.

**Product:** Instructor Copilot — a desktop companion that helps instructors execute a prepared training session (current step, timing, resources, commands, evidence reveal). It assists; it does not teach autonomously.

**MVP:** Local desktop app, offline-capable after install.

**Default architecture:** Electron (main/renderer split) + React + TypeScript + Vite. Plain JSON persistence (`~/.instructor-copilot/` + per-training JSON directories referenced by path, not copied). No SQLite, no backend, no microservices unless a concrete MVP need forces it.

## Principles
- The instructor remains in control at all times — no autonomous progression, no auto-executed commands.
- Deterministic behavior before AI. No AI/API integration in the MVP.
- Local-first: no cloud sync, accounts, or auth in the MVP.
- Security boundary: renderer gets `contextIsolation: true`, `sandbox: true`, no direct Node/`child_process` access — only a narrow `contextBridge` API. The renderer submits only authored ids (never raw paths/executables/args); main resolves them against the current Training's own definitions before acting.
- Commands are structured (`executable` + `args[]`), spawned with `shell: false` — never a single shell string.
- Training definitions are portable and reference named **content roots**, scoped per Training (see `architecture.md` → Content Roots), not absolute paths; each machine maps a given Training's roots to absolute paths locally, so two Trainings can each safely use a root named "content". Training content itself is referenced, never copied into app data.
- Don't over-engineer: no plugin systems, event buses, DI frameworks, or speculative abstractions without a concrete MVP reason.
- Build in small, testable phases per `docs/mvp-roadmap.md`; don't start a phase before the prior one's stop condition is met.
- Preserve cross-platform intent (macOS + Windows) — use Node's `path` module, avoid shell-specific command syntax in stored commands.
- Tests required for `session-engine` business logic (timing math, schema migration, run-state transitions).
- Do not change product scope (see non-goals in `product-spec.md`) without explicit user approval.
- Never modify `/Users/efrain.vergara/Documents/Unosquare/Backend-Testing-Mindset-Training` — it's a separate project, referenced only as the Phase 8/9 validation target.
- At the end of each phase, update `docs/project-status.md` (current phase, status, key completed items, validation result, commit SHA, next proposed phase). Keep it short.

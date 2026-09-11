# Instructor Copilot — Project Rules

Read `docs/product-spec.md`, `docs/architecture.md`, `docs/data-model.md`, and `docs/mvp-roadmap.md` before implementing anything — do not rediscover product requirements from scratch.

**Product:** Instructor Copilot — a desktop companion that helps instructors execute a prepared training session (current step, timing, resources, commands, evidence reveal). It assists; it does not teach autonomously.

**MVP:** Local desktop app, offline-capable after install.

**Default architecture:** Electron (main/renderer split) + React + TypeScript + Vite. Plain JSON persistence (`~/.instructor-copilot/` + per-training JSON directories referenced by path, not copied). No SQLite, no backend, no microservices unless a concrete MVP need forces it.

## Principles
- The instructor remains in control at all times — no autonomous progression, no auto-executed commands.
- Deterministic behavior before AI. No AI/API integration in the MVP.
- Local-first: no cloud sync, accounts, or auth in the MVP.
- Security boundary: renderer gets `contextIsolation: true`, `sandbox: true`, no direct Node/`child_process` access — only a narrow `contextBridge` API. Every IPC handler in main validates paths/commands against the current Training's own definitions before acting.
- Training content is referenced by path, not copied into app data; resource/command paths are relative to the training root.
- Don't over-engineer: no plugin systems, event buses, DI frameworks, or speculative abstractions without a concrete MVP reason.
- Build in small, testable phases per `docs/mvp-roadmap.md`; don't start a phase before the prior one's stop condition is met.
- Preserve cross-platform intent (macOS + Windows) — use Node's `path` module, avoid shell-specific command syntax in stored commands.
- Tests required for `session-engine` business logic (timing math, schema migration, run-state transitions).
- Do not change product scope (see non-goals in `product-spec.md`) without explicit user approval.
- Never modify `/Users/efrain.vergara/Documents/Unosquare/Backend-Testing-Mindset-Training` — it's a separate project, referenced only as the Phase 8/9 validation target.

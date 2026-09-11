# Instructor Copilot

A session orchestration companion for instructors and mentors — helps run a prepared training session (timing, resources, commands, evidence reveal) without teaching it for you.

Phase 3A: Session Editor foundation — open/create a Training, edit Sessions and Steps — on top of the secure Electron + React + TypeScript + Vite shell and the Electron-independent `session-engine` (Training/Session/Step model and JSON persistence). See `docs/product-spec.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/mvp-roadmap.md`, `docs/project-status.md`, and `CLAUDE.md`.

## Development

```
npm install
npm run dev        # launch the desktop app in development
npm run typecheck  # type-check main/preload, renderer, and session-engine
npm test           # run session-engine unit tests (vitest)
npm run build      # production build (out/main, out/preload, out/renderer)
```

# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 1 — Desktop Shell

**Status:** READY FOR REVIEW

**Completed:**
- Phase 0 docs (product spec, architecture, data model, roadmap, Claude rules)
- Electron + React + TypeScript + Vite desktop shell (via electron-vite)
- Secure main/preload/renderer boundary (`contextIsolation`, `sandbox`, `nodeIntegration: false`)
- Minimal typed `contextBridge` API (`window.instructorCopilot.getAppInfo()`) over a single `app:get-info` IPC channel
- Window-open/navigation hardening (deny new windows, block off-app navigation)

**Current architecture:** Electron main/renderer/preload split under `src/`, structured (`shell:false`) command execution and Training-scoped content roots remain data-model/architecture decisions only — not yet implemented.

**Validation:**
- `npm run typecheck` passes
- `npm run build` (electron-vite) passes
- App launches in dev and from production build; renderer displays shell UI and resolved app info via preload IPC
- Confirmed at runtime (CDP inspection): `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — renderer has no `require`/`process`/`ipcRenderer`
- No Training/Session/Step/business logic implemented
- Backend Testing Mindset untouched

**Next proposed phase:** Phase 2 — Training / Session / Step Model

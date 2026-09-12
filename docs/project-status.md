# Project Status

**Project:** Instructor Copilot

**Current phase:** Phase 8 — Backend Testing Mindset Integration

**Status:** READY FOR REVIEW

**Completed:**
- Phase 7 Instructor Notes + Run Report (see prior entries) — approved and closed
- Portable `examples/backend-testing-mindset/` Training definition (`training.json` + `sessions/session-1-es.json` + `README.md`), derived from the real Backend-Testing-Mindset-Training project's authoritative sources (`docs/session-1/session-1-design.md`, the Session 1 ES presentation, participant worksheet, instructor answer key, Postman Starter/Solution Collections, Petstore v3 environment, and the `newman/` README/package.json) — no source asset copied into this repository
- Session 1 ES: `session-1-es`, title `De la Historia a la Evidencia — ¿Qué debería probar?`, exactly 17 Steps (`slideRef` 1..17, one per slide), 90 minutes total (fallback allocation from the task spec, matching the deck's own printed "12 MINUTOS" label on slide 12; the deck also prints "7 MIN" on slide 6 where the approved fallback uses 5 min to keep the total at exactly 90 — documented conflict, fallback total kept)
- One logical content root (`content`) used by every Resource/CommandAction; no absolute path anywhere in the committed JSON
- Presentation mapped to `presentations/Backend_Testing_Mindset_Session_1_ES.pptx`; participant worksheet and instructor answer key referenced (never copied) on the Steps where each is actually used; Postman Starter Collection + Petstore v3 environment referenced starting at the Slide 9–12 Postman block
- Solution Collection referenced only at Slide 15 (the Newman teaser), with `doNotReveal` reminders on every earlier Step not to expose it or the expected 404 finding prematurely
- Slide 15's `run-newman-teaser` CommandAction uses the exact existing validated workflow from `newman/package.json`/`newman/README.md` (`npx newman run ../postman/collections/...-solution... -e ../postman/environments/petstore-v3....`, `cwd: "newman"`, `sensitive: false`) — not invented
- Slide 13 modeled as `type: "investigation"` for the unknown-numeric-ID → 404 scenario, distinct from `not_reached`; Slide 16 preserves the "Todo está en verde. ¿Terminamos?" confidence-boundary bridge without teaching Session 2 content
- EvidenceStage decision: none authored. Every reveal in Session 1 is either a live Postman/Newman response (external to Instructor Copilot) or a plain Step transition — there is no case requiring Instructor Copilot's own locked/released reveal mechanism, so no `EvidenceStage` was added
- Investigated (read-only) whether a portable `postman://` application URI could be authored: Postman.app's `Info.plist` on this machine registers a `postman` URL scheme, but launching it was not verified in this session, so per the "do not assume" rule no `application` Resource was authored — Steps instruct "Open Postman" via guidance text and rely on the file Resources instead
- No product/schema/IPC/Instructor Mode/Command Runner/Resource Launcher/recovery/Run Report code was changed — this phase added only data, one committed example-validation test, and this doc

**Current architecture:** No architectural change. `examples/` now holds the real portable integration example (distinct from `fixtures/`, which remains test-only data), following exactly the existing Training/Session/Step/Resource/CommandAction schema with no modification.

**Validation:**
- `npm run typecheck` passes
- `npm test` — 224/224 passing (218 pre-existing from Phase 7 + 6 new in `backendTestingMindsetExample.test.ts`, resolved relative to the test file so it passes on a clean clone with no dependency on the external repo: canonical-loader shape, Steps' `slideRef` 1..17 in order with durations summing to 90, single `content` root used everywhere, no absolute/escaping path in any authored Resource/CommandAction (verified with the real `resolveWithinRoot` containment primitive), no real local absolute path embedded in the committed JSON, and no real training asset file present under `examples/`)
- `npm run build` passes
- Real-root validation (scratch test against the actual external repo, deleted after): every authored presentation/file-Resource path and every CommandAction `cwd` resolved via `resolveWithinRoot` against the real `Backend-Testing-Mindset-Training` checkout and exists on disk; `startRun("session-1-es")` was driven through the real `runController`/`trainingController` flow with a local-only (uncommitted) content-root mapping and produced exactly 17 `StepRun`s, Slide 1 (`slide-01-opening`) active, and valid checklist/evidence initialization, with no model/runtime error
- Newman real validation: ran the exact authored command (`npx newman run ../postman/collections/...-solution... -e ../postman/environments/petstore-v3....` from `newman/`) directly against the live Petstore v3 API — result: **3 requests, 11 assertions, 0 failures**, matching the established baseline exactly; no training-project file or dependency was modified to make this pass
- Resource-open validation: path resolution and on-disk existence were verified for every authored Resource/CommandAction (above); a literal GUI-level open of the presentation/worksheet was not clicked through in this session — the native OS folder picker still can't be driven headlessly, consistent with every prior phase's documented limitation
- External training repository: not a git repository (`git status` there reports "not a git repository"); spot-checked modification timestamps on every file this phase read (presentation, both Postman collections, the environment file, `newman/package.json`/`package-lock.json`) and all predate this session — read-only access confirmed, nothing was edited, formatted, or installed there

**Next proposed work:** Phase 9 — Real Session 1 Dry Run (not started)

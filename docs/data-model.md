# Instructor Copilot — Data Model

Conceptual TypeScript-oriented entities. See `architecture.md` for where each is persisted. "Persisted" = stored in a training's JSON files or `~/.instructor-copilot/`; "runtime" = held in renderer/main memory only, derived at run time.

```ts
type Id = string; // stable, human-readable slug where practical, e.g. "postman-demo"

interface Training {
  id: Id;
  schemaVersion: number;
  title: string;
  description?: string;
  sessionRefs: Id[];       // ordered; each resolves to sessions/<id>.json
}

interface Session {
  id: Id;
  schemaVersion: number;          // sessions/<id>.json is loaded/migrated independently of training.json
  trainingId: Id;
  title: string;
  plannedDurationMinutes: number;
  presentation?: Resource;      // the PPTX/PDF for this session; kind is necessarily "presentation" (enforced at the schema level)
  locale?: "en" | "es";          // Instructor Mode UI/content locale (Phase 9B-A); absent means "en" - backward compatible with every Session authored before this field existed
  steps: Step[];                 // ordered
}

type StepType =
  | "introduction" | "discussion" | "pair_work"
  | "live_demo" | "investigation" | "debrief"
  | "break" | "closing";

interface Step {
  id: Id;
  type: StepType;
  title: string;
  slideRef?: number;             // slide number in the session's presentation
  objective?: string;
  plannedDurationMinutes: number;
  facilitatorGuidance?: string;  // free text: what to say/do
  actions?: string[];            // short imperative bullets
  questions?: string[];
  doNotReveal?: string[];        // warnings shown only to instructor
  checklist?: ChecklistItem[];
  resources?: Resource[];
  command?: CommandAction;
  evidenceStages?: EvidenceStage[];
  nextStepId?: Id;                // explicit override; default is array order

  // Facilitation Console fields (Phase 9B-A) - all optional, deterministic, never
  // AI-generated. See architecture.md -> Adaptive Facilitation Console.
  sayFrame?: string;               // one concise framing/transition cue, not a script
  followUpQuestions?: string[];    // authored probes shown after `questions` for discussion-oriented Steps
  listenFor?: string[];            // concepts/answer patterns the instructor should notice, not participant-visible "correct answers"
  transition?: string;             // how to close this moment naturally, shown near NEXT
  fallback?: string;               // what to do when a required resource/demo/external service fails
}

type ResourceKind = "file" | "folder" | "presentation" | "application" | "url";

interface Resource {
  id: Id;
  kind: ResourceKind;
  label: string;                 // "Open Starter Collection"
  root?: Id;                     // named content root (see architecture.md → Content Roots); required for "file"/"folder"/"presentation", omitted for "application"/"url"
  path: string;                  // relative to `root` (or an OS app identifier for kind="application")
}

interface CommandAction {
  id: Id;
  label: string;
  executable: string;            // e.g. "node" — never a full shell string
  args?: string[];                // e.g. ["lab/session-2/scripts/instructor-reset.mjs", "defect-a"]
  root: Id;                       // named content root the cwd resolves against
  cwd: string;                    // relative to `root`
  sensitive?: boolean;            // requires extra confirmation before run
}

interface EvidenceStage {
  id: Id;
  label: string;                 // "HTTP evidence", "Database evidence"
  order: number;                 // release sequence hint; instructor can override
  detail?: string;               // what this stage reveals, shown once released
}

interface ChecklistItem {
  id: Id;
  label: string;
}

// --- Runtime / run-history state below (persisted per-run, not part of authoring model) ---

interface SessionRun {
  id: Id;                        // e.g. timestamp-based
  schemaVersion: number;          // run files evolve independently of Training/Session schema
  sessionId: Id;
  trainingId: Id;
  startedAt: string;              // ISO timestamp
  completedAt?: string;
  pauseIntervals: TimeInterval[]; // session-level pauses; excluded from elapsed/drift math
  stepRuns: StepRun[];
  notes: InstructorNote[];

  // Minimal authoring snapshot, captured once when the SessionRun is created.
  // Lets Run Reports remain usable if the Session is later retitled/rescoped/deleted.
  sessionTitleSnapshot: string;
  plannedDurationMinutesSnapshot: number;
}

interface TimeInterval {
  startedAt: string;              // ISO
  endedAt?: string;                // ISO; absent while the interval is still open
}

interface StepRun {
  stepId: Id;
  status: "pending" | "active" | "done" | "skipped";
  activeIntervals: TimeInterval[]; // one interval per visit while this step was the active step; actual duration = sum of closed intervals (+ open interval vs. now)
  checklistState: Record<Id /* ChecklistItem.id */, boolean>;
  evidenceState: Record<Id /* EvidenceStage.id */, "locked" | "released">;

  // Authoring snapshot, captured once when the StepRun is created (session start).
  // Run Reports read these, never the live Session/Step definition, so edits made
  // after the run don't retroactively rewrite history.
  stepTitleSnapshot: string;
  stepTypeSnapshot: StepType;
  plannedDurationMinutesSnapshot: number;
  stepOrderSnapshot: number;      // index of the step within the Session at run start
}

interface InstructorNote {
  id: Id;
  runId: Id;
  sessionId: Id;
  stepId: Id;
  timestamp: string;              // ISO
  text: string;
}
// Notes are Step-scoped run-time history, added only via the current active
// Step (Phase 7): main generates id/timestamp/stepId, never the renderer. No
// edit/delete in the MVP. `validateSessionRunSemantics` enforces id uniqueness
// within the run, runId/sessionId consistency, that stepId exists among the
// run's own StepRuns, and that timestamp falls within [startedAt, completedAt]
// once the run is completed - the same "structurally impossible state is
// rejected everywhere" posture as the timing-interval checks above.

interface TrainingRegistration {
  trainingId: Id;
  definitionRoot: string;          // absolute path to this Training's definition directory, machine-local
  contentRoots: Record<Id, string>; // this Training's named content root -> absolute path, machine-local (see architecture.md → Content Roots)
}

interface AppSettings {
  schemaVersion: number;
  trainings: TrainingRegistration[]; // one entry per imported Training; each owns its own content-root names
  // future: theme, default confirmation behavior, etc.
}

// ~/.instructor-copilot/active-run.json (Phase 6B) — the sole recovery pointer.
// Independently versioned from every other schema; deliberately minimal so it
// never itself needs Training/Session/content-root/timing data to stay valid.
interface ActiveRunPointer {
  schemaVersion: number;
  runId: Id;
}
```

## IDs
Slugs (`postman-demo`, `session-1`) for Training/Session/Step/Resource/CommandAction/EvidenceStage/ChecklistItem — authored, stable, human-readable, referenced by `nextStepId`/relations. `SessionRun`/`StepRun`/`InstructorNote` use generated (timestamp or uuid) ids since they're run-instance data, not authored content.

## Relationships
`Training` → ordered `sessionRefs` → each `Session` owns its `steps` inline (steps are not shared across sessions, so no separate step registry). A `SessionRun` references a `Session`/`Training` by id and carries one `StepRun` per `Step` at run start. `InstructorNote` denormalizes `sessionId`/`stepId` onto itself for simple Run Report grouping without joining back through `SessionRun.stepRuns`. `Resource`/`CommandAction` reference a named content `root` (resolved via the current Training's own `TrainingRegistration.contentRoots`, keyed by `trainingId`) rather than embedding an absolute path — so two different Trainings may each safely define a root named `"content"` without collision.

## Persisted vs Runtime State
- **Authoring data** (`Training`, `Session`, `Step` and everything nested in `Step`) is persisted in the Training's own JSON files, edited via the Session Editor.
- **Run state** (`SessionRun`, `StepRun`, `InstructorNote`) is persisted separately in `~/.instructor-copilot/runs/<runId>.json` — it must survive independently of the authored Session content evolving later, which is why `SessionRun` carries a minimal Session snapshot (title/planned duration) and each `StepRun` carries its own Step snapshot (title/type/planned duration/order) rather than re-reading the live `Session`/`Step`.
- **Timers and drift** (session elapsed, step elapsed, schedule drift) are **not persisted as ticking state** — they're computed deterministically at any moment from `StepRun.activeIntervals` / `SessionRun.pauseIntervals` and each `StepRun`'s `plannedDurationMinutesSnapshot`. Only interval timestamps are persisted; the countdown itself is a pure function of "now." Revisiting a prior Step (Previous) opens a new interval on its existing `StepRun` rather than mutating `startedAt`, so time spent elsewhere is never counted twice; pausing the session opens an interval in `SessionRun.pauseIntervals`, which reporting subtracts from elapsed/drift math.

## Run Report (Phase 7)
`buildRunReport(run: SessionRun)` is a pure function that rejects an incomplete run and otherwise derives its entire output from `SessionRun`'s own snapshots/intervals/notes - it never reads the current authored `Session`/`Step`, so editing the Session after a run completes can never change that run's report. Per-Step status is one of `on_time` / `over` / `under` (derived from `actual - planned`, normalized only for floating-point noise below `1e-9` - no ±30s/±1min "close enough" tolerance), `skipped` (the StepRun's *final* status is `"skipped"` - a Step that was skipped and later revisited/finished reports its real timing status instead), or `not_reached` (the StepRun's final status is still `"pending"` because the run completed before ever visiting it - genuinely distinct from `skipped`). Steps are reported in `stepOrderSnapshot` order and notes are grouped by `stepId` and sorted chronologically, both from a sorted copy - `SessionRun.stepRuns`/`SessionRun.notes` themselves are never mutated.

## Active Run Recovery (Phase 6B)
`ActiveRunPointer` is written only when a run starts (after the `SessionRun` itself is saved) and cleared only when a run completes; it is the single source of truth for "is there a run to recover," never a directory scan over `runs/`. Recovering it requires the pointed-to `SessionRun` to already be paused — a clean-shutdown `before-quit` handler guarantees this for a normal quit by pausing any incomplete run first — and requires the recovered run to still be structurally compatible with its authored `Session` (same Step count/order/ids/titles/types/durations, same checklist/evidence-stage id sets). An incomplete-but-unpaused pointed run (a crash, not a clean quit) is rejected rather than recovered, since there is no safe way to attribute the offline time.

## Phase 9B-A: Session.locale and Step facilitation fields
`locale` and the five Step facilitation fields (`sayFrame`, `followUpQuestions`, `listenFor`, `transition`, `fallback`) are purely additive and optional, so they did not require a `SESSION_SCHEMA_VERSION` bump or a migration function: a Session/Step authored before Phase 9B-A simply has these fields `undefined`, which the schema already accepts, and Instructor Mode's derived display model (`deriveFacilitationSections`) treats an absent field exactly like an empty one - it never invents content. `locale` absent means `"en"` everywhere a locale is read (see architecture.md -> Adaptive Facilitation Console).

## Versioning / Schema Migration
`Training`, `Session`, `AppSettings`, `SessionRun`, and `ActiveRunPointer` are each persisted as independent files that evolve on separate timelines and each carry their own `schemaVersion` integer — editing a Training doesn't touch its Sessions' version, and neither touches old run files. On load, main checks the version of whichever file it's reading and applies that file type's own migration function chain (`v1→v2`, `v2→v3`, …) before handing the object to the renderer — there is no shared/global schema version. `Step` does not carry its own version; it migrates as part of its owning `Session` file. Run Reports must tolerate a `StepRun` whose `stepId` no longer exists in the current `Session`, or a `SessionRun` whose `Session`/`Training` has since been edited or deleted entirely, by falling back to the snapshot fields (`sessionTitleSnapshot`/`plannedDurationMinutesSnapshot` on `SessionRun`; the Step-level snapshot fields on `StepRun`) — this is the normal case for historical accuracy, not an error path.

## External Resource Path Strategy
All `Resource.path` and `CommandAction.cwd` values are relative to a named content **root** (see `architecture.md` → Content Roots), not to an absolute path. Main resolves `root` via the current Training's `TrainingRegistration.contentRoots[root]` at open/run time, so root names are scoped per-Training and never collide across Trainings; nothing in `Training`/`Session`/`Step` JSON contains an absolute, machine-specific path, which is what keeps a Training definition portable independent of where its actual content lives on a given machine. `kind: "application"` and `kind: "url"` are the two `Resource` exceptions where `path` isn't a root-relative file — an OS application identifier and an absolute `http`/`https` URL respectively — so `root` is omitted for both.

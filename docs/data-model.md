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
}

type ResourceKind = "file" | "folder" | "presentation" | "application" | "url";

interface Resource {
  id: Id;
  kind: ResourceKind;
  label: string;                 // "Open Starter Collection"
  root?: Id;                     // named content root (see architecture.md → Content Roots); omitted for kind="application"
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
```

## IDs
Slugs (`postman-demo`, `session-1`) for Training/Session/Step/Resource/CommandAction/EvidenceStage/ChecklistItem — authored, stable, human-readable, referenced by `nextStepId`/relations. `SessionRun`/`StepRun`/`InstructorNote` use generated (timestamp or uuid) ids since they're run-instance data, not authored content.

## Relationships
`Training` → ordered `sessionRefs` → each `Session` owns its `steps` inline (steps are not shared across sessions, so no separate step registry). A `SessionRun` references a `Session`/`Training` by id and carries one `StepRun` per `Step` at run start. `InstructorNote` denormalizes `sessionId`/`stepId` onto itself for simple Run Report grouping without joining back through `SessionRun.stepRuns`. `Resource`/`CommandAction` reference a named content `root` (resolved via the current Training's own `TrainingRegistration.contentRoots`, keyed by `trainingId`) rather than embedding an absolute path — so two different Trainings may each safely define a root named `"content"` without collision.

## Persisted vs Runtime State
- **Authoring data** (`Training`, `Session`, `Step` and everything nested in `Step`) is persisted in the Training's own JSON files, edited via the Session Editor.
- **Run state** (`SessionRun`, `StepRun`, `InstructorNote`) is persisted separately in `~/.instructor-copilot/runs/<runId>.json` — it must survive independently of the authored Session content evolving later, which is why `SessionRun` carries a minimal Session snapshot (title/planned duration) and each `StepRun` carries its own Step snapshot (title/type/planned duration/order) rather than re-reading the live `Session`/`Step`.
- **Timers and drift** (session elapsed, step elapsed, schedule drift) are **not persisted as ticking state** — they're computed deterministically at any moment from `StepRun.activeIntervals` / `SessionRun.pauseIntervals` and each `StepRun`'s `plannedDurationMinutesSnapshot`. Only interval timestamps are persisted; the countdown itself is a pure function of "now." Revisiting a prior Step (Previous) opens a new interval on its existing `StepRun` rather than mutating `startedAt`, so time spent elsewhere is never counted twice; pausing the session opens an interval in `SessionRun.pauseIntervals`, which reporting subtracts from elapsed/drift math.

## Versioning / Schema Migration
`Training`, `Session`, `AppSettings`, and `SessionRun` are each persisted as independent files that evolve on separate timelines and each carry their own `schemaVersion` integer — editing a Training doesn't touch its Sessions' version, and neither touches old run files. On load, main checks the version of whichever file it's reading and applies that file type's own migration function chain (`v1→v2`, `v2→v3`, …) before handing the object to the renderer — there is no shared/global schema version. `Step` does not carry its own version; it migrates as part of its owning `Session` file. Run Reports must tolerate a `StepRun` whose `stepId` no longer exists in the current `Session`, or a `SessionRun` whose `Session`/`Training` has since been edited or deleted entirely, by falling back to the snapshot fields (`sessionTitleSnapshot`/`plannedDurationMinutesSnapshot` on `SessionRun`; the Step-level snapshot fields on `StepRun`) — this is the normal case for historical accuracy, not an error path.

## External Resource Path Strategy
All `Resource.path` and `CommandAction.cwd` values are relative to a named content **root** (see `architecture.md` → Content Roots), not to an absolute path. Main resolves `root` via the current Training's `TrainingRegistration.contentRoots[root]` at open/run time, so root names are scoped per-Training and never collide across Trainings; nothing in `Training`/`Session`/`Step` JSON contains an absolute, machine-specific path, which is what keeps a Training definition portable independent of where its actual content lives on a given machine. `kind: "application"` is the one `Resource` exception where `path` is an OS application identifier rather than a root-relative file, so `root` is omitted for it.

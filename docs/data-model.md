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
  trainingId: Id;
  title: string;
  plannedDurationMinutes: number;
  presentation?: Resource;      // e.g. the PPTX/PDF for this session
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
  path: string;                  // relative to training root (or app path for kind="application")
}

interface CommandAction {
  id: Id;
  label: string;
  command: string;
  cwd: string;                   // relative to training root
  sensitive?: boolean;           // requires extra confirmation before run
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
  sessionId: Id;
  trainingId: Id;
  startedAt: string;              // ISO timestamp
  completedAt?: string;
  stepRuns: StepRun[];
  notes: InstructorNote[];
}

interface StepRun {
  stepId: Id;
  startedAt?: string;
  completedAt?: string;
  status: "pending" | "active" | "done" | "skipped";
  checklistState: Record<Id /* ChecklistItem.id */, boolean>;
  evidenceState: Record<Id /* EvidenceStage.id */, "locked" | "released">;
}

interface InstructorNote {
  id: Id;
  runId: Id;
  sessionId: Id;
  stepId: Id;
  timestamp: string;              // ISO
  text: string;
}

interface AppSettings {
  schemaVersion: number;
  knownTrainingRoots: string[];   // absolute paths, machine-local
  // future: theme, default confirmation behavior, etc.
}
```

## IDs
Slugs (`postman-demo`, `session-1`) for Training/Session/Step/Resource/CommandAction/EvidenceStage/ChecklistItem — authored, stable, human-readable, referenced by `nextStepId`/relations. `SessionRun`/`StepRun`/`InstructorNote` use generated (timestamp or uuid) ids since they're run-instance data, not authored content.

## Relationships
`Training` → ordered `sessionRefs` → each `Session` owns its `steps` inline (steps are not shared across sessions, so no separate step registry). A `SessionRun` references a `Session`/`Training` by id and carries one `StepRun` per `Step` at run start. `InstructorNote` denormalizes `sessionId`/`stepId` onto itself for simple Run Report grouping without joining back through `SessionRun.stepRuns`.

## Persisted vs Runtime State
- **Authoring data** (`Training`, `Session`, `Step` and everything nested in `Step`) is persisted in the Training's own JSON files, edited via the Session Editor.
- **Run state** (`SessionRun`, `StepRun`, `InstructorNote`) is persisted separately in `~/.instructor-copilot/runs/<runId>.json` — it must survive independently of the authored Session content evolving later.
- **Timers and drift** (session elapsed, step elapsed, schedule drift) are **not persisted as ticking state** — they're computed deterministically at any moment from `StepRun.startedAt`/`completedAt` timestamps and each Step's `plannedDurationMinutes`. Only the timestamps are persisted; the countdown itself is a pure function of "now."

## Versioning / Schema Migration
Both `Training` and `AppSettings` carry a `schemaVersion` integer. On load, main checks the version; a version below current triggers a migration function chain (`v1→v2`, `v2→v3`, …) before the object is handed to the renderer. `SessionRun`/`StepRun` files are versioned implicitly by the `Session`/`Step` shape at capture time — Run Reports must tolerate a `StepRun.stepId` that no longer exists in the current `Session` (the Step may have been edited/removed since the run), showing it as an orphaned/historical step rather than erroring.

## External Resource Path Strategy
All `Resource.path` and `CommandAction.cwd` values are relative to the owning Training's root directory (see `architecture.md` → Training Import/Reference Model). Main resolves them against the training root registered in `AppSettings.knownTrainingRoots` at open-time; nothing in `Session`/`Step` JSON contains an absolute, machine-specific path. `kind: "application"` is the one exception where `path` may be an OS application identifier/path rather than a training-relative file.

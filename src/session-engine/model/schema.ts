import { z } from "zod";
import { ID_PATTERN } from "../validation/ids";

/**
 * Canonical authored data model (see docs/data-model.md). Zod schemas are the single
 * source of truth; TypeScript types are inferred from them so shape and runtime
 * validation can never drift apart.
 */

export const TRAINING_SCHEMA_VERSION = 1;
export const SESSION_SCHEMA_VERSION = 1;
export const APP_SETTINGS_SCHEMA_VERSION = 1;

export const IdSchema = z
  .string()
  .min(1, "id must not be empty")
  .max(200, "id must be 200 characters or fewer")
  .regex(ID_PATTERN, "id must be a safe slug (letters, digits, hyphens only)");

export const ResourceKindSchema = z.enum(["file", "folder", "presentation", "application", "url"]);

// `root` is omitted only for kind="application" (an OS app identifier, not a content-root-relative
// path); every other Resource kind must resolve through a named content root (see docs/data-model.md
// -> External Resource Path Strategy).
export const ResourceSchema = z
  .object({
    id: IdSchema,
    kind: ResourceKindSchema,
    label: z.string().min(1),
    root: IdSchema.optional(),
    path: z.string().min(1)
  })
  .refine((resource) => (resource.kind === "application" ? resource.root === undefined : resource.root !== undefined), {
    message: 'root must be omitted when kind is "application", and is required for every other kind',
    path: ["root"]
  });

// Session.presentation is a dedicated Resource slot: it must carry kind="presentation"
// (the Presentation editor never shows a kind selector). Derived from ResourceSchema
// rather than duplicated, so the root invariant above still applies.
export const PresentationResourceSchema = ResourceSchema.refine((resource) => resource.kind === "presentation", {
  message: 'Session.presentation must have kind "presentation"',
  path: ["kind"]
});

export const CommandActionSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  executable: z.string().min(1),
  args: z.array(z.string()).optional(),
  root: IdSchema,
  cwd: z.string().min(1),
  sensitive: z.boolean().optional()
});

export const EvidenceStageSchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  order: z.number().int(),
  detail: z.string().optional()
});

export const ChecklistItemSchema = z.object({
  id: IdSchema,
  label: z.string().min(1)
});

export const StepTypeSchema = z.enum([
  "introduction",
  "discussion",
  "pair_work",
  "live_demo",
  "investigation",
  "debrief",
  "break",
  "closing"
]);

// A planned duration must be a positive, finite number of minutes; zero/negative/NaN/Infinity
// values would silently break future timing and drift calculations.
const PlannedDurationMinutesSchema = z.number().finite().positive();

export const StepSchema = z.object({
  id: IdSchema,
  type: StepTypeSchema,
  title: z.string().min(1),
  slideRef: z.number().int().nonnegative().optional(),
  objective: z.string().optional(),
  plannedDurationMinutes: PlannedDurationMinutesSchema,
  facilitatorGuidance: z.string().optional(),
  actions: z.array(z.string()).optional(),
  questions: z.array(z.string()).optional(),
  doNotReveal: z.array(z.string()).optional(),
  checklist: z.array(ChecklistItemSchema).optional(),
  resources: z.array(ResourceSchema).optional(),
  command: CommandActionSchema.optional(),
  evidenceStages: z.array(EvidenceStageSchema).optional(),
  nextStepId: IdSchema.optional()
});

export const SessionSchema = z.object({
  id: IdSchema,
  schemaVersion: z.number().int(),
  trainingId: IdSchema,
  title: z.string().min(1),
  plannedDurationMinutes: PlannedDurationMinutesSchema,
  presentation: PresentationResourceSchema.optional(),
  steps: z.array(StepSchema)
});

export const TrainingSchema = z.object({
  id: IdSchema,
  schemaVersion: z.number().int(),
  title: z.string().min(1),
  description: z.string().optional(),
  sessionRefs: z.array(IdSchema)
});

export const TrainingRegistrationSchema = z.object({
  trainingId: IdSchema,
  definitionRoot: z.string().min(1),
  contentRoots: z.record(IdSchema, z.string().min(1))
});

export const AppSettingsSchema = z.object({
  schemaVersion: z.number().int(),
  trainings: z.array(TrainingRegistrationSchema)
});

export type Id = z.infer<typeof IdSchema>;
export type ResourceKind = z.infer<typeof ResourceKindSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type CommandAction = z.infer<typeof CommandActionSchema>;
export type EvidenceStage = z.infer<typeof EvidenceStageSchema>;
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type StepType = z.infer<typeof StepTypeSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Training = z.infer<typeof TrainingSchema>;
export type TrainingRegistration = z.infer<typeof TrainingRegistrationSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;

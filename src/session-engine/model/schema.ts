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

// Filesystem kinds (file/folder/presentation) resolve through a named content root
// and require one; application/url identify a non-filesystem target (an OS app
// identifier or a web URL) and must omit root (see docs/data-model.md -> External
// Resource Path Strategy).
const FILESYSTEM_RESOURCE_KINDS = new Set(["file", "folder", "presentation"]);

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const ResourceSchema = z
  .object({
    id: IdSchema,
    kind: ResourceKindSchema,
    label: z.string().min(1),
    root: IdSchema.optional(),
    path: z.string().min(1)
  })
  .refine((resource) => FILESYSTEM_RESOURCE_KINDS.has(resource.kind) === (resource.root !== undefined), {
    message: 'root is required for kind "file"/"folder"/"presentation", and must be omitted for "application"/"url"',
    path: ["root"]
  })
  .refine((resource) => resource.kind !== "url" || isAbsoluteHttpUrl(resource.path), {
    message: 'a "url" Resource path must be an absolute http or https URL',
    path: ["path"]
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
  nextStepId: IdSchema.optional(),
  // Facilitation Console fields (Phase 9B-A, all optional/deterministic - see
  // docs/architecture.md -> Adaptive Facilitation Console). Never AI-generated.
  sayFrame: z.string().optional(),
  followUpQuestions: z.array(z.string()).optional(),
  listenFor: z.array(z.string()).optional(),
  transition: z.string().optional(),
  fallback: z.string().optional()
});

// Session-level UI/content locale (Phase 9B-A). Absent means "en" for backward
// compatibility with every Session authored before this field existed.
export const SessionLocaleSchema = z.enum(["en", "es"]);

export const SessionSchema = z.object({
  id: IdSchema,
  schemaVersion: z.number().int(),
  trainingId: IdSchema,
  title: z.string().min(1),
  plannedDurationMinutes: PlannedDurationMinutesSchema,
  presentation: PresentationResourceSchema.optional(),
  locale: SessionLocaleSchema.optional(),
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
export type SessionLocale = z.infer<typeof SessionLocaleSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Training = z.infer<typeof TrainingSchema>;
export type TrainingRegistration = z.infer<typeof TrainingRegistrationSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;

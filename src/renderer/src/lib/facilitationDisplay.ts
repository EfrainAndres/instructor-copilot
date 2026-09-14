import type { Session, Step, StepType } from "../../../session-engine/model/schema";
import { resolveNextStepId } from "../../../session-engine/run/engine";

/**
 * Pure derived display model for the adaptive Facilitation Console (Phase 9B-A).
 * Turns an authored Step into the operational sections Instructor Mode actually
 * renders, hiding sections with no authored content and adapting emphasis by
 * Step.type - see docs/architecture.md -> Adaptive Facilitation Console. Never
 * mutates the Session/Step and never invents content: every field here is a
 * direct, deterministic read of authored data.
 */

export interface NextPreview {
  isFinish: boolean;
  slideRef: number | undefined;
  title: string | undefined;
  stepType: StepType | undefined;
}

/**
 * Derives what "comes next" for the current Step: resolved via the Step's own
 * nextStepId when present, otherwise authored array order (mirrors
 * resolveNextStepId - never a separate/parallel navigation rule). A Step with no
 * resolvable next Step is the Session's final Step, so the caller should render
 * "Finish when ready" instead of a Next preview.
 */
export function deriveNextPreview(session: Session, currentStepId: string): NextPreview {
  const nextStepId = resolveNextStepId(session, currentStepId);
  if (!nextStepId) {
    return { isFinish: true, slideRef: undefined, title: undefined, stepType: undefined };
  }
  const nextStep = session.steps.find((step) => step.id === nextStepId);
  if (!nextStep) {
    return { isFinish: true, slideRef: undefined, title: undefined, stepType: undefined };
  }
  return { isFinish: false, slideRef: nextStep.slideRef, title: nextStep.title, stepType: nextStep.type };
}

export interface FacilitationSections {
  /** Populated doNotReveal warnings - rendered above everything else when non-empty. */
  safety: string[];
  /** The immediate instruction: actions[0] when authored, otherwise undefined (never invented). */
  now: string | undefined;
  /** Remaining actions beyond the first, still useful as an ordered checklist-style cue. */
  remainingActions: string[];
  sayFrame: string | undefined;
  ask: string[];
  followUpQuestions: string[];
  listenFor: string[];
  transition: string | undefined;
  fallback: string | undefined;
  hasChecklist: boolean;
  hasResources: boolean;
  hasCommand: boolean;
  hasEvidence: boolean;
  hasTools: boolean; // resources, command, or evidence - drives whether a TOOLS section renders at all
  hasContext: boolean; // objective and/or facilitatorGuidance
  /** Step.type-driven emphasis: which cluster of sections should read as visually primary. */
  emphasis: "discussion" | "activity" | "demo" | "investigation" | "debrief" | "closing" | "quiet";
}

const EMPHASIS_BY_TYPE: Record<StepType, FacilitationSections["emphasis"]> = {
  introduction: "quiet",
  discussion: "discussion",
  pair_work: "activity",
  live_demo: "demo",
  investigation: "investigation",
  debrief: "debrief",
  break: "quiet",
  closing: "closing"
};

export function deriveFacilitationSections(step: Step): FacilitationSections {
  const actions = step.actions ?? [];
  const [now, ...remainingActions] = actions;

  return {
    safety: step.doNotReveal ?? [],
    now,
    remainingActions,
    sayFrame: step.sayFrame,
    ask: step.questions ?? [],
    followUpQuestions: step.followUpQuestions ?? [],
    listenFor: step.listenFor ?? [],
    transition: step.transition,
    fallback: step.fallback,
    hasChecklist: (step.checklist ?? []).length > 0,
    hasResources: (step.resources ?? []).length > 0,
    hasCommand: step.command !== undefined,
    hasEvidence: (step.evidenceStages ?? []).length > 0,
    hasTools: (step.resources ?? []).length > 0 || step.command !== undefined || (step.evidenceStages ?? []).length > 0,
    hasContext: Boolean(step.objective || step.facilitatorGuidance),
    emphasis: EMPHASIS_BY_TYPE[step.type]
  };
}

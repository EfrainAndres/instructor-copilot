import type { Step } from "../../../session-engine/model/schema";
import type { StepRun } from "../../../session-engine/run/schema";

export interface EvidenceStageDisplay {
  id: string;
  label: string;
  order: number;
  released: boolean;
  /** Only ever populated for a released stage - a locked stage's authored detail is never exposed here. */
  detail?: string;
}

/**
 * Renders the display-safe view of a Step's evidence stages: for any stage whose
 * StepRun.evidenceState is still "locked", `detail` is dropped entirely, even
 * though the authored Step carries it - this is the one boundary that prevents
 * an accidental reveal of not-yet-released evidence. Sorted deterministically by
 * EvidenceStage.order; never mutates the authored array.
 */
export function deriveEvidenceStageDisplay(step: Step, stepRun: StepRun | undefined): EvidenceStageDisplay[] {
  const stages = step.evidenceStages ?? [];
  return [...stages]
    .sort((a, b) => a.order - b.order)
    .map((stage) => {
      const released = stepRun?.evidenceState[stage.id] === "released";
      return {
        id: stage.id,
        label: stage.label,
        order: stage.order,
        released,
        detail: released ? stage.detail : undefined
      };
    });
}

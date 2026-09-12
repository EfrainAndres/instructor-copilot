import { describe, expect, it } from "vitest";
import type { Step } from "../../../session-engine/model/schema";
import type { StepRun } from "../../../session-engine/run/schema";
import { deriveEvidenceStageDisplay } from "./evidenceStageDisplay";

function step(): Step {
  return {
    id: "a",
    type: "live_demo",
    title: "Step A",
    plannedDurationMinutes: 5,
    evidenceStages: [
      { id: "logs", label: "Logs", order: 3, detail: "No errors logged." },
      { id: "http", label: "HTTP response", order: 1, detail: "200 OK" },
      { id: "db", label: "Database state", order: 2, detail: "Order persisted correctly." }
    ]
  };
}

function stepRun(evidenceState: Record<string, "locked" | "released">): StepRun {
  return {
    stepId: "a",
    status: "active",
    activeIntervals: [],
    checklistState: {},
    evidenceState,
    stepTitleSnapshot: "Step A",
    stepTypeSnapshot: "live_demo",
    plannedDurationMinutesSnapshot: 5,
    stepOrderSnapshot: 0
  };
}

describe("deriveEvidenceStageDisplay", () => {
  it("hides detail for a locked stage", () => {
    const display = deriveEvidenceStageDisplay(step(), stepRun({ logs: "locked", http: "locked", db: "locked" }));
    const http = display.find((s) => s.id === "http")!;
    expect(http.released).toBe(false);
    expect(http.detail).toBeUndefined();
  });

  it("includes detail for a released stage", () => {
    const display = deriveEvidenceStageDisplay(step(), stepRun({ logs: "locked", http: "released", db: "locked" }));
    const http = display.find((s) => s.id === "http")!;
    expect(http.released).toBe(true);
    expect(http.detail).toBe("200 OK");
  });

  it("orders stages by EvidenceStage.order without mutating the authored array", () => {
    const authoredStep = step();
    const originalOrder = authoredStep.evidenceStages!.map((s) => s.id);
    const display = deriveEvidenceStageDisplay(authoredStep, stepRun({ logs: "locked", http: "locked", db: "locked" }));
    expect(display.map((s) => s.id)).toEqual(["http", "db", "logs"]);
    expect(authoredStep.evidenceStages!.map((s) => s.id)).toEqual(originalOrder);
  });

  it("treats a missing StepRun as fully locked with no detail", () => {
    const display = deriveEvidenceStageDisplay(step(), undefined);
    expect(display.every((s) => !s.released && s.detail === undefined)).toBe(true);
  });

  it("returns an empty array for a Step with no evidence stages", () => {
    const bare: Step = { id: "b", type: "closing", title: "B", plannedDurationMinutes: 5 };
    expect(deriveEvidenceStageDisplay(bare, undefined)).toEqual([]);
  });
});

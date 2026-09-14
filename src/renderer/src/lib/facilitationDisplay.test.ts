import { describe, expect, it } from "vitest";
import type { Session } from "../../../session-engine/model/schema";
import { deriveFacilitationSections, deriveNextPreview } from "./facilitationDisplay";

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Test Session",
    plannedDurationMinutes: 20,
    steps: [
      { id: "a", type: "introduction", title: "A", slideRef: 1, plannedDurationMinutes: 5 },
      { id: "b", type: "discussion", title: "B", slideRef: 2, plannedDurationMinutes: 10 },
      { id: "c", type: "closing", title: "C", slideRef: 3, plannedDurationMinutes: 5 }
    ],
    ...overrides
  };
}

describe("deriveNextPreview", () => {
  it("derives the next Step via authored array order when nextStepId is absent", () => {
    const preview = deriveNextPreview(session(), "a");
    expect(preview).toEqual({ isFinish: false, slideRef: 2, title: "B", stepType: "discussion" });
  });

  it("honors an explicit nextStepId override even if it skips array order", () => {
    const withOverride = session({
      steps: [
        { id: "a", type: "introduction", title: "A", slideRef: 1, plannedDurationMinutes: 5, nextStepId: "c" },
        { id: "b", type: "discussion", title: "B", slideRef: 2, plannedDurationMinutes: 10 },
        { id: "c", type: "closing", title: "C", slideRef: 3, plannedDurationMinutes: 5 }
      ]
    });
    const preview = deriveNextPreview(withOverride, "a");
    expect(preview).toEqual({ isFinish: false, slideRef: 3, title: "C", stepType: "closing" });
  });

  it("derives Finish rather than Next for the final Step", () => {
    const preview = deriveNextPreview(session(), "c");
    expect(preview.isFinish).toBe(true);
    expect(preview.title).toBeUndefined();
  });
});

describe("deriveFacilitationSections", () => {
  it("omits empty facilitation sections for a Step authored with none of them", () => {
    const sections = deriveFacilitationSections({
      id: "s",
      type: "introduction",
      title: "S",
      plannedDurationMinutes: 5
    });
    expect(sections.safety).toEqual([]);
    expect(sections.now).toBeUndefined();
    expect(sections.ask).toEqual([]);
    expect(sections.followUpQuestions).toEqual([]);
    expect(sections.listenFor).toEqual([]);
    expect(sections.transition).toBeUndefined();
    expect(sections.fallback).toBeUndefined();
    expect(sections.hasTools).toBe(false);
    expect(sections.hasContext).toBe(false);
  });

  it("promotes Ask/Follow-up/Listen-for for a discussion Step", () => {
    const sections = deriveFacilitationSections({
      id: "s",
      type: "discussion",
      title: "S",
      plannedDurationMinutes: 5,
      questions: ["¿Qué probaría?"],
      followUpQuestions: ["¿Y qué más?"],
      listenFor: ["Happy path"]
    });
    expect(sections.emphasis).toBe("discussion");
    expect(sections.ask).toEqual(["¿Qué probaría?"]);
    expect(sections.followUpQuestions).toEqual(["¿Y qué más?"]);
    expect(sections.listenFor).toEqual(["Happy path"]);
  });

  it("derives NOW from actions[0] and keeps the rest as remaining actions", () => {
    const sections = deriveFacilitationSections({
      id: "s",
      type: "live_demo",
      title: "S",
      plannedDurationMinutes: 5,
      actions: ["Primera acción", "Segunda acción"]
    });
    expect(sections.now).toBe("Primera acción");
    expect(sections.remainingActions).toEqual(["Segunda acción"]);
  });

  it("remains quiet (no facilitation sections) for a simple Step with only objective/guidance", () => {
    const sections = deriveFacilitationSections({
      id: "s",
      type: "introduction",
      title: "S",
      plannedDurationMinutes: 5,
      objective: "Some context",
      facilitatorGuidance: "Some guidance"
    });
    expect(sections.hasContext).toBe(true);
    expect(sections.now).toBeUndefined();
    expect(sections.emphasis).toBe("quiet");
  });

  it("produces the safety section as the highest-priority signal when doNotReveal is present", () => {
    const sections = deriveFacilitationSections({
      id: "s",
      type: "investigation",
      title: "S",
      plannedDurationMinutes: 5,
      doNotReveal: ["NO AVANZAR TODAVÍA"]
    });
    expect(sections.safety).toEqual(["NO AVANZAR TODAVÍA"]);
  });

  it("represents resources/command as tools for an operational Step", () => {
    const sections = deriveFacilitationSections({
      id: "s",
      type: "live_demo",
      title: "S",
      plannedDurationMinutes: 5,
      resources: [{ id: "r1", kind: "file", label: "Open thing", root: "content", path: "thing.md" }],
      command: { id: "c1", label: "Run it", executable: "npx", root: "content", cwd: "." }
    });
    expect(sections.hasResources).toBe(true);
    expect(sections.hasCommand).toBe(true);
    expect(sections.hasTools).toBe(true);
  });
});

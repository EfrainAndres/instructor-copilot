import { describe, expect, it } from "vitest";
import { SessionSchema, StepSchema, type Session } from "../schema";

function validSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-a",
    schemaVersion: 1,
    trainingId: "training-a",
    title: "Session A",
    plannedDurationMinutes: 10,
    steps: [{ id: "step-1", type: "introduction", title: "Step One", plannedDurationMinutes: 10 }],
    ...overrides
  };
}

describe("Session.locale (Phase 9B-A)", () => {
  it("accepts a Session with no locale field (pre-9B-A authoring)", () => {
    const result = SessionSchema.safeParse(validSession());
    expect(result.success).toBe(true);
    expect(result.success && result.data.locale).toBeUndefined();
  });

  it("accepts locale 'es'", () => {
    const result = SessionSchema.safeParse(validSession({ locale: "es" }));
    expect(result.success).toBe(true);
    expect(result.success && result.data.locale).toBe("es");
  });

  it("accepts locale 'en'", () => {
    const result = SessionSchema.safeParse(validSession({ locale: "en" }));
    expect(result.success).toBe(true);
  });

  it("rejects an unsupported locale value", () => {
    const result = SessionSchema.safeParse(validSession({ locale: "fr" as never }));
    expect(result.success).toBe(false);
  });
});

describe("Step facilitation fields (Phase 9B-A)", () => {
  it("accepts a Step with no facilitation fields (pre-9B-A authoring)", () => {
    const result = StepSchema.safeParse({ id: "s", type: "discussion", title: "S", plannedDurationMinutes: 5 });
    expect(result.success).toBe(true);
  });

  it("accepts a Step with all optional facilitation fields populated", () => {
    const result = StepSchema.safeParse({
      id: "s",
      type: "discussion",
      title: "S",
      plannedDurationMinutes: 5,
      sayFrame: "Un enmarque breve.",
      followUpQuestions: ["¿Y si...?"],
      listenFor: ["Concepto clave"],
      transition: "Sigamos con lo siguiente.",
      fallback: "Si algo falla, haga esto en su lugar."
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-string followUpQuestions entry", () => {
    const result = StepSchema.safeParse({
      id: "s",
      type: "discussion",
      title: "S",
      plannedDurationMinutes: 5,
      followUpQuestions: [42 as never]
    });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { Session } from "../../model/schema";
import { SessionSchema } from "../../model/schema";
import { SessionEngineError } from "../errors";
import { validateSessionSemantics } from "../semantic";

function session(overrides: Partial<Session> = {}): Session {
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

describe("Session.facilitationBufferMinutes schema (Phase 9B-B)", () => {
  it("accepts a Session with no facilitationBufferMinutes (legacy/no explicit buffer)", () => {
    const result = SessionSchema.safeParse(session());
    expect(result.success).toBe(true);
    expect(result.success && result.data.facilitationBufferMinutes).toBeUndefined();
  });

  it("accepts a non-negative finite buffer", () => {
    const result = SessionSchema.safeParse(session({ facilitationBufferMinutes: 5 }));
    expect(result.success).toBe(true);
  });

  it("accepts a zero buffer", () => {
    const result = SessionSchema.safeParse(session({ facilitationBufferMinutes: 0 }));
    expect(result.success).toBe(true);
  });

  it("rejects a negative buffer", () => {
    const result = SessionSchema.safeParse(session({ facilitationBufferMinutes: -1 }));
    expect(result.success).toBe(false);
  });

  it("rejects a non-finite buffer", () => {
    const result = SessionSchema.safeParse(session({ facilitationBufferMinutes: Infinity }));
    expect(result.success).toBe(false);
  });
});

describe("validateSessionSemantics - facilitationBufferMinutes (Phase 9B-B)", () => {
  it("does not check Step-duration totals for a Session with no explicit buffer, even if they mismatch plannedDurationMinutes", () => {
    const legacyMismatch = session({
      plannedDurationMinutes: 999,
      steps: [{ id: "step-1", type: "introduction", title: "Step One", plannedDurationMinutes: 10 }]
    });
    expect(() => validateSessionSemantics(legacyMismatch)).not.toThrow();
  });

  it("validates when Step-duration sum + facilitationBufferMinutes equals plannedDurationMinutes", () => {
    const withBuffer = session({
      plannedDurationMinutes: 15,
      facilitationBufferMinutes: 5,
      steps: [
        { id: "step-1", type: "introduction", title: "Step One", plannedDurationMinutes: 5 },
        { id: "step-2", type: "closing", title: "Step Two", plannedDurationMinutes: 5 }
      ]
    });
    expect(() => validateSessionSemantics(withBuffer)).not.toThrow();
  });

  it("tolerates floating-point noise in the sum", () => {
    const withBuffer = session({
      plannedDurationMinutes: 0.3,
      facilitationBufferMinutes: 0.1,
      steps: [
        { id: "step-1", type: "introduction", title: "Step One", plannedDurationMinutes: 0.1 },
        { id: "step-2", type: "closing", title: "Step Two", plannedDurationMinutes: 0.1 }
      ]
    });
    expect(() => validateSessionSemantics(withBuffer)).not.toThrow();
  });

  it("rejects an explicit buffer that does not reconcile with plannedDurationMinutes", () => {
    const mismatched = session({
      plannedDurationMinutes: 20,
      facilitationBufferMinutes: 5,
      steps: [
        { id: "step-1", type: "introduction", title: "Step One", plannedDurationMinutes: 5 },
        { id: "step-2", type: "closing", title: "Step Two", plannedDurationMinutes: 5 }
      ]
    });
    expect(() => validateSessionSemantics(mismatched)).toThrow(SessionEngineError);
  });
});

import { describe, expect, it } from "vitest";
import { getDictionary, type Dictionary } from "./i18n";

const LIVE_INSTRUCTOR_MODE_KEYS: (keyof Dictionary)[] = [
  "session",
  "step",
  "status",
  "slide",
  "onPlan",
  "behind",
  "beforeCheckpoint",
  "openPresentation",
  "now",
  "frame",
  "ask",
  "followUp",
  "listenFor",
  "doNotReveal",
  "transition",
  "next",
  "finishWhenReady",
  "fallback",
  "checklist",
  "resources",
  "command",
  "evidence",
  "notes",
  "context",
  "open",
  "runCommand",
  "commandOutput",
  "addNote",
  "previous",
  "nextButton",
  "skip",
  "pause",
  "resume",
  "completeSession",
  "sessionActions",
  "restartSession",
  "discardRun",
  "restartConfirm",
  "discardConfirm",
  "inBuffer",
  "remaining",
  "facilitationBuffer"
];

describe("getDictionary", () => {
  it("defaults to English when locale is undefined", () => {
    const dictionary = getDictionary(undefined);
    expect(dictionary.now).toBe("NOW");
    expect(dictionary.doNotReveal).toBe("DO NOT REVEAL");
  });

  it("selects the Spanish dictionary for locale 'es'", () => {
    const dictionary = getDictionary("es");
    expect(dictionary.now).toBe("AHORA");
    expect(dictionary.doNotReveal).toBe("NO REVELAR");
    expect(dictionary.ask).toBe("PREGUNTE");
    expect(dictionary.followUp).toBe("PROFUNDICE");
    expect(dictionary.listenFor).toBe("ESCUCHE");
    expect(dictionary.transition).toBe("TRANSICIÓN");
    expect(dictionary.next).toBe("SIGUE");
  });

  it("includes every live Instructor Mode string in both locales, non-empty", () => {
    for (const locale of ["en", "es"] as const) {
      const dictionary = getDictionary(locale);
      for (const key of LIVE_INSTRUCTOR_MODE_KEYS) {
        expect(typeof dictionary[key]).toBe("string");
        expect((dictionary[key] as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("has a distinct Spanish translation (not a copy of English) for every live key", () => {
    const en = getDictionary("en");
    const es = getDictionary("es");
    for (const key of LIVE_INSTRUCTOR_MODE_KEYS) {
      expect(es[key]).not.toBe(en[key]);
    }
  });

  it("never uses the same Spanish word for dismissing the recovery banner and for the destructive Discard Run action", () => {
    const es = getDictionary("es");
    expect(es.dismiss).not.toBe(es.discardRun);
    expect(es.dismiss.toLowerCase()).not.toContain("descartar");
  });

  it("provides a Step-type label for every StepType in both locales", () => {
    const en = getDictionary("en");
    const es = getDictionary("es");
    const stepTypes: (keyof Dictionary["stepTypeLabels"])[] = [
      "introduction",
      "discussion",
      "pair_work",
      "live_demo",
      "investigation",
      "debrief",
      "break",
      "closing"
    ];
    for (const type of stepTypes) {
      expect(en.stepTypeLabels[type].length).toBeGreaterThan(0);
      expect(es.stepTypeLabels[type].length).toBeGreaterThan(0);
    }
  });
});

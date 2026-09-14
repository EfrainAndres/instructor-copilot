import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTrainingBundle } from "../persistence/trainingRepository";
import { resolveNextStepId } from "../run/engine";
import type { Step } from "../model/schema";

// Resolved relative to this test file so it passes on any machine/clean clone -
// see backendTestingMindsetExample.test.ts for the same convention.
const EXAMPLE_ROOT = join(__dirname, "..", "..", "..", "examples", "backend-testing-mindset");

function findStep(steps: Step[], id: string): Step {
  const step = steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Step "${id}" not found in fixture`);
  return step;
}

// A conservative allowlist of common English instructional words. Session 1 ES's
// authored prose is expected to contain none of these outside technical identifiers
// (Postman, Newman, API names, file paths, etc.), which are excluded before matching.
// "instructor"/"session" are excluded: they are valid Spanish cognates spelled
// identically to their English counterparts, so they are not useful signals here.
const ENGLISH_PROSE_PATTERN = /\b(the|and|should|must|open|complete|before|after|only|question|answer|guidance)\b/i;

// Technical identifiers/snippets legitimately present in Spanish authored prose -
// stripped out before running the English-prose check so they never produce a
// false positive.
const TECHNICAL_ALLOWLIST = [
  "pm.collectionVariables.set('createdPetId', body.id)",
  "createdPetId",
  "Postman",
  "Newman",
  "Petstore",
  "Solution Collection",
  "Starter Collection",
  "npx",
  "HTTP",
  "PET-142",
  "H/A/N/E"
];

function stripTechnicalTerms(text: string): string {
  let stripped = text;
  for (const term of TECHNICAL_ALLOWLIST) {
    stripped = stripped.split(term).join(" ");
  }
  return stripped;
}

function collectAuthoredProse(step: Step): string[] {
  const values: string[] = [];
  if (step.objective) values.push(step.objective);
  if (step.facilitatorGuidance) values.push(step.facilitatorGuidance);
  if (step.sayFrame) values.push(step.sayFrame);
  if (step.transition) values.push(step.transition);
  if (step.fallback) values.push(step.fallback);
  values.push(...(step.actions ?? []));
  values.push(...(step.questions ?? []));
  values.push(...(step.followUpQuestions ?? []));
  values.push(...(step.listenFor ?? []));
  values.push(...(step.doNotReveal ?? []));
  values.push(...(step.checklist ?? []).map((item) => item.label));
  values.push(...(step.resources ?? []).map((resource) => resource.label));
  return values;
}

describe("Session 1 ES facilitation content (Phase 9B-A)", () => {
  it("declares locale 'es' at Session level", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    expect(bundle.sessions[0]!.locale).toBe("es");
  });

  it("Slide 2 has deterministic Follow-up and Listen-for cues", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    const slide2 = findStep(bundle.sessions[0]!.steps, "slide-02-what-would-you-test");
    expect(slide2.followUpQuestions?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(slide2.listenFor?.length ?? 0).toBeGreaterThan(0);
  });

  it("Slide 3 has a Transition and its derived NEXT target is Slide 4", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    const session = bundle.sessions[0]!;
    const slide3 = findStep(session.steps, "slide-03-jira-story");
    expect(slide3.transition).toBeTruthy();
    expect(slide3.sayFrame).toBeTruthy();

    const nextId = resolveNextStepId(session, "slide-03-jira-story");
    expect(nextId).toBe("slide-04-acceptance-criteria");
    expect(findStep(session.steps, nextId!).slideRef).toBe(4);
  });

  it("Slide 13 contains explicit hold-before-reveal choreography", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    const slide13 = findStep(bundle.sessions[0]!.steps, "slide-13-negative-scenario");
    const safety = (slide13.doNotReveal ?? []).join(" ");
    expect(safety).toMatch(/NO AVANZAR A LA DIAPOSITIVA 13/);
  });

  it("Slide 16 contains explicit ask-before-reveal choreography", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    const slide16 = findStep(bundle.sessions[0]!.steps, "slide-16-all-green");
    const safety = (slide16.doNotReveal ?? []).join(" ");
    expect(safety).toMatch(/NO AVANZAR A LA DIAPOSITIVA 16/);
    expect(slide16.followUpQuestions).toContain("¿Qué evidencia no observamos?");
  });

  it("Slide 15 retains the exact structured Newman command", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    const slide15 = findStep(bundle.sessions[0]!.steps, "slide-15-newman-teaser");
    expect(slide15.command).toEqual({
      id: "run-newman-teaser",
      label: "Run Newman teaser (Solution Collection)",
      executable: "npx",
      args: [
        "newman",
        "run",
        "../postman/collections/backend-testing-mindset-session-1-solution.postman_collection.json",
        "-e",
        "../postman/environments/petstore-v3.postman_environment.json"
      ],
      root: "content",
      cwd: "newman",
      sensitive: false
    });
  });

  it("contains no unintended English operational prose outside approved technical identifiers", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    for (const step of bundle.sessions[0]!.steps) {
      for (const text of collectAuthoredProse(step)) {
        const stripped = stripTechnicalTerms(text);
        expect(stripped).not.toMatch(ENGLISH_PROSE_PATTERN);
      }
    }
  });
});

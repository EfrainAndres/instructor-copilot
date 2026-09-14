import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTrainingBundle } from "../persistence/trainingRepository";
import { resolveWithinRoot } from "../resources/pathContainment";
import type { Resource } from "../model/schema";

// Resolved relative to this test file so it passes on any machine/clean clone -
// it never depends on the separate Backend-Testing-Mindset-Training project
// actually existing locally (see docs/architecture.md -> Content Roots).
const EXAMPLE_ROOT = join(__dirname, "..", "..", "..", "examples", "backend-testing-mindset");

function collectResources(steps: { resources?: Resource[] }[]): Resource[] {
  return steps.flatMap((step) => step.resources ?? []);
}

describe("examples/backend-testing-mindset portability", () => {
  it("loads through the canonical loader with the expected shape", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);

    expect(bundle.training.id).toBe("backend-testing-mindset");
    expect(bundle.training.sessionRefs).toEqual(["session-1-es"]);
    expect(bundle.sessions).toHaveLength(1);

    const session = bundle.sessions[0]!;
    expect(session.id).toBe("session-1-es");
    expect(session.trainingId).toBe("backend-testing-mindset");
    expect(session.plannedDurationMinutes).toBe(90);
    expect(session.steps).toHaveLength(17);
  });

  it("has exactly Steps slideRef 1..17 in order, matching the approved 85-minute instructional schedule plus a 5-minute facilitation buffer (Phase 9B-B)", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    const session = bundle.sessions[0]!;

    expect(session.steps.map((step) => step.slideRef)).toEqual(
      Array.from({ length: 17 }, (_, index) => index + 1)
    );

    // The authoritative per-slide schedule from the Phase 9A UX audit / Phase
    // 9B-B task spec - not merely "sums to 90" (that alone previously masked a
    // checkpoint misalignment against the approved delivery schedule).
    const approvedSchedule = [1, 4, 2, 3, 2, 7, 4, 5, 5, 5, 4, 12, 8, 6, 5, 7, 5];
    expect(session.steps.map((step) => step.plannedDurationMinutes)).toEqual(approvedSchedule);

    const totalStepMinutes = session.steps.reduce((sum, step) => sum + step.plannedDurationMinutes, 0);
    expect(totalStepMinutes).toBe(85);
    expect(session.facilitationBufferMinutes).toBe(5);
    expect(totalStepMinutes + (session.facilitationBufferMinutes ?? 0)).toBe(session.plannedDurationMinutes);
    expect(session.plannedDurationMinutes).toBe(90);
  });

  it("uses the single logical content root everywhere", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    const session = bundle.sessions[0]!;

    expect(session.presentation?.root).toBe("content");

    for (const resource of collectResources(session.steps)) {
      if (resource.kind === "file" || resource.kind === "folder" || resource.kind === "presentation") {
        expect(resource.root).toBe("content");
      }
    }

    for (const step of session.steps) {
      if (step.command) {
        expect(step.command.root).toBe("content");
      }
    }
  });

  it("never contains an absolute filesystem path or an escaping relative path", async () => {
    const bundle = await loadTrainingBundle(EXAMPLE_ROOT);
    const session = bundle.sessions[0]!;
    const fakeRoot = join(__dirname, "fake-content-root");

    const allFilesystemPaths: string[] = [];
    if (session.presentation) {
      allFilesystemPaths.push(session.presentation.path);
    }
    for (const resource of collectResources(session.steps)) {
      if (resource.kind === "file" || resource.kind === "folder" || resource.kind === "presentation") {
        allFilesystemPaths.push(resource.path);
      }
    }
    for (const step of session.steps) {
      if (step.command) {
        allFilesystemPaths.push(step.command.cwd);
      }
    }

    expect(allFilesystemPaths.length).toBeGreaterThan(0);
    for (const relativePath of allFilesystemPaths) {
      expect(relativePath.startsWith("/")).toBe(false);
      expect(/^[a-zA-Z]:[\\/]/.test(relativePath)).toBe(false);
      // resolveWithinRoot is the same containment primitive main uses at
      // runtime - if any authored path could escape a configured root, this
      // throws exactly as it would for a real Resource/CommandAction.
      expect(() => resolveWithinRoot(fakeRoot, relativePath)).not.toThrow();
    }
  });

  it("never embeds the real local absolute training path in the committed JSON", async () => {
    const trainingRaw = await readFile(join(EXAMPLE_ROOT, "training.json"), "utf-8");
    const sessionRaw = await readFile(join(EXAMPLE_ROOT, "sessions", "session-1-es.json"), "utf-8");

    for (const raw of [trainingRaw, sessionRaw]) {
      expect(raw).not.toMatch(/\/Users\//);
      expect(raw).not.toMatch(/^[A-Za-z]:\\/m);
    }
  });

  it("does not contain any real training asset files under examples/", async () => {
    const entries = await readdir(EXAMPLE_ROOT, { recursive: true, withFileTypes: true } as never);
    const disallowedExtensions = [".pptx", ".pdf", ".docx", ".postman_collection.json", ".postman_environment.json"];

    for (const entry of entries as unknown as { name: string; isFile(): boolean }[]) {
      if (!entry.isFile()) continue;
      for (const ext of disallowedExtensions) {
        expect(entry.name.endsWith(ext)).toBe(false);
      }
    }
  });
});

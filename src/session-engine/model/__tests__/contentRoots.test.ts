import { describe, expect, it } from "vitest";
import type { Session } from "../schema";
import { collectRequiredContentRootIds } from "../contentRoots";

function session(overrides: Partial<Session>): Session {
  return {
    id: "session-1",
    schemaVersion: 1,
    trainingId: "training-1",
    title: "Session",
    plannedDurationMinutes: 10,
    steps: [],
    ...overrides
  };
}

describe("collectRequiredContentRootIds", () => {
  it("collects root ids from presentation, step resources, and step commands, deduplicated", () => {
    const sessions: Session[] = [
      session({
        presentation: { id: "slides", kind: "presentation", label: "Slides", root: "content", path: "s.pptx" },
        steps: [
          {
            id: "step-1",
            type: "live_demo",
            title: "Demo",
            plannedDurationMinutes: 5,
            resources: [
              { id: "r1", kind: "file", label: "Worksheet", root: "content", path: "w.pdf" },
              { id: "r2", kind: "folder", label: "Assets", root: "examples", path: "." },
              { id: "r3", kind: "application", label: "Postman", path: "Postman" },
              { id: "r4", kind: "url", label: "Docs", path: "https://example.com" }
            ],
            command: { id: "cmd", label: "Reset", executable: "node", root: "scripts-root", cwd: "." }
          }
        ]
      })
    ];

    const ids = collectRequiredContentRootIds(sessions);
    expect(ids).toEqual(["content", "examples", "scripts-root"]);
  });

  it("returns an empty array when no filesystem-rooted resources are referenced", () => {
    const sessions: Session[] = [
      session({
        steps: [{ id: "step-1", type: "closing", title: "Close", plannedDurationMinutes: 5 }]
      })
    ];
    expect(collectRequiredContentRootIds(sessions)).toEqual([]);
  });

  it("deduplicates the same root id referenced across multiple sessions/steps", () => {
    const sessions: Session[] = [
      session({
        id: "session-1",
        steps: [
          {
            id: "step-1",
            type: "live_demo",
            title: "A",
            plannedDurationMinutes: 5,
            resources: [{ id: "r1", kind: "file", label: "F1", root: "content", path: "a.pdf" }]
          }
        ]
      }),
      session({
        id: "session-2",
        steps: [
          {
            id: "step-2",
            type: "live_demo",
            title: "B",
            plannedDurationMinutes: 5,
            resources: [{ id: "r2", kind: "file", label: "F2", root: "content", path: "b.pdf" }]
          }
        ]
      })
    ];
    expect(collectRequiredContentRootIds(sessions)).toEqual(["content"]);
  });
});

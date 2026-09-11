import type { Session } from "./schema";

/**
 * Collects the distinct, machine-local content-root ids referenced anywhere in
 * the given Sessions (Session.presentation, Step.resources, Step.command),
 * deterministically ordered by first appearance. Resource kinds that don't use a
 * filesystem root ("application", "url") never contribute an id.
 */
export function collectRequiredContentRootIds(sessions: Session[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  function add(rootId: string | undefined): void {
    if (rootId && !seen.has(rootId)) {
      seen.add(rootId);
      ids.push(rootId);
    }
  }

  for (const session of sessions) {
    add(session.presentation?.root);
    for (const step of session.steps) {
      for (const resource of step.resources ?? []) {
        add(resource.root);
      }
      add(step.command?.root);
    }
  }

  return ids;
}

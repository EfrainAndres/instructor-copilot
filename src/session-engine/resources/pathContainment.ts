import { isAbsolute, relative, resolve, sep } from "node:path";
import { SessionEngineError } from "../validation/errors";

function escapeMessage(label?: string): string {
  return `${label ? `Resource "${label}"` : "Resource"} path escapes its configured content root`;
}

/**
 * Resolves `targetPath` under `root`, rejecting any attempt to leave the root -
 * including a leading ".." segment, an absolute `targetPath` (which would make
 * Node's path.resolve ignore `root` entirely), and a sibling directory that only
 * shares a string prefix with `root` (e.g. "/trusted/root-other"). Uses relative-
 * path containment via node:path rather than a startsWith() string check, which
 * a shared-prefix sibling could otherwise defeat.
 *
 * MVP scope: lexical containment only, no realpath/symlink resolution - see
 * docs/architecture.md for the accepted trade-off.
 */
export function resolveWithinRoot(root: string, targetPath: string, label?: string): string {
  const normalizedRoot = resolve(root);

  if (isAbsolute(targetPath)) {
    throw new SessionEngineError(escapeMessage(label));
  }

  const candidate = resolve(normalizedRoot, targetPath);
  const rel = relative(normalizedRoot, candidate);

  if (rel !== "" && (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`))) {
    throw new SessionEngineError(escapeMessage(label));
  }

  return candidate;
}

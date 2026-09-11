import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The single machine-local application data root, shared by run persistence
 * (`runs/`) and AppSettings persistence (`settings.json`) so both always agree
 * on where they live. Never exposed to the renderer.
 */
export function getAppDataRoot(): string {
  return join(homedir(), ".instructor-copilot");
}

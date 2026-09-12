import type { CommandAction } from "../model/schema";
import { resolveWithinRoot } from "./pathContainment";

/**
 * The trusted, structured shape actually handed to child_process.spawn - never a
 * shell string. cwd is already confined to its configured content root via
 * resolveWithinRoot before this plan is returned.
 */
export interface CommandExecutionPlan {
  executable: string;
  args: string[];
  cwd: string;
}

/**
 * Builds the execution plan for an authored CommandAction. `absoluteContentRoot`
 * must already be resolved (by trainingId, not by "whichever Training is open")
 * via the Phase 5A content-root registry.
 */
export function buildCommandExecutionPlan(
  command: CommandAction,
  absoluteContentRoot: string
): CommandExecutionPlan {
  const cwd = resolveWithinRoot(absoluteContentRoot, command.cwd, command.label);
  return {
    executable: command.executable,
    args: command.args ?? [],
    cwd
  };
}

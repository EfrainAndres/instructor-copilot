import { randomUUID } from "node:crypto";
import { dialog, type BrowserWindow, type WebContents } from "electron";
import { buildCommandExecutionPlan, resolveCurrentStepCommand, SessionEngineError, type CommandAction } from "../session-engine";
import { IPC_CHANNELS, type CommandCompletedEvent, type CommandOutputEvent, type CommandStartResult } from "../shared/ipc";
import { runCommandProcess } from "./commandProcess";
import { getCurrentActiveStepId, requireActiveRunTrainingId, requireActiveSession } from "./runController";
import { resolveContentRootPathForTraining } from "./trainingController";

/**
 * MVP allows only one command execution in flight, enforced here regardless of
 * renderer button state.
 */
let runningExecutionId: string | null = null;

/**
 * Resolves the trusted CommandAction for the current active Step, requiring the
 * renderer-submitted commandId to match it exactly - never trusting a Resource
 * id/path/executable/args/cwd from the renderer. Thin wrapper over the pure
 * resolveCurrentStepCommand lookup.
 */
function requireCurrentStepCommand(commandId: string): CommandAction {
  const session = requireActiveSession();
  const stepId = getCurrentActiveStepId();
  return resolveCurrentStepCommand(session, stepId, commandId);
}

async function confirmSensitiveCommand(window: BrowserWindow | null, command: CommandAction): Promise<boolean> {
  if (!command.sensitive) {
    return true;
  }

  const options: Electron.MessageBoxOptions = {
    type: "warning",
    buttons: ["Run Command", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Sensitive command",
    message: command.label,
    detail: `Executable:\n${command.executable}\n\nArguments:\n${
      (command.args ?? []).join("\n") || "(none)"
    }\n\nRun this command?`
  };

  const { response } = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
  return response === 0;
}

function safeSend(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload);
  }
}

export async function runCurrentStepCommand(
  window: BrowserWindow | null,
  sender: WebContents,
  commandId: string
): Promise<CommandStartResult> {
  if (runningExecutionId) {
    throw new SessionEngineError("A command is already running.");
  }

  const command = requireCurrentStepCommand(commandId);
  const trainingId = requireActiveRunTrainingId();

  const confirmed = await confirmSensitiveCommand(window, command);
  if (!confirmed) {
    return { canceled: true };
  }

  // Re-check after the (user-driven, potentially slow) confirmation dialog, in
  // case another command started while this one was awaiting confirmation.
  if (runningExecutionId) {
    throw new SessionEngineError("A command is already running.");
  }

  const absoluteRoot = await resolveContentRootPathForTraining(trainingId, command.root);
  const plan = buildCommandExecutionPlan(command, absoluteRoot);

  const executionId = `command-${randomUUID()}`;
  runningExecutionId = executionId;

  runCommandProcess(plan, {
    onStdout: (text) => {
      const event: CommandOutputEvent = { executionId, stream: "stdout", text };
      safeSend(sender, IPC_CHANNELS.commandOutput, event);
    },
    onStderr: (text) => {
      const event: CommandOutputEvent = { executionId, stream: "stderr", text };
      safeSend(sender, IPC_CHANNELS.commandOutput, event);
    },
    onCompleted: (result) => {
      if (runningExecutionId === executionId) {
        runningExecutionId = null;
      }
      const event: CommandCompletedEvent = {
        executionId,
        exitCode: result.exitCode,
        signal: result.signal,
        error: result.error
      };
      safeSend(sender, IPC_CHANNELS.commandCompleted, event);
    }
  });

  return { canceled: false, executionId, commandId: command.id, label: command.label };
}

import { shell } from "electron";
import { resolveWithinRoot, SessionEngineError, type Resource } from "../session-engine";
import { getCurrentActiveStepId, requireActiveSession } from "./runController";
import { resolveContentRootPath } from "./trainingController";

async function resolveFilesystemResourcePath(resource: Resource): Promise<string> {
  if (!resource.root) {
    // Should be unreachable given the canonical schema invariant, but defends against
    // ever launching a filesystem-kind Resource with no root instead of failing loudly.
    throw new SessionEngineError(`Resource "${resource.label}" is missing a content root`);
  }
  const absoluteRoot = await resolveContentRootPath(resource.root);
  return resolveWithinRoot(absoluteRoot, resource.path, resource.label);
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Application Resources aren't resolved through a content root - `path` is either
 * a custom app URI (opened via shell.openExternal) or an OS-openable target such
 * as an .app bundle path (opened via shell.openPath). No child_process, no shell
 * string construction, no app-name discovery/registry.
 */
async function openApplicationResource(resource: Resource): Promise<void> {
  const parsed = tryParseUrl(resource.path);
  if (parsed && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    await shell.openExternal(resource.path);
    return;
  }
  const errorMessage = await shell.openPath(resource.path);
  if (errorMessage) {
    throw new SessionEngineError(`Failed to open "${resource.label}": ${errorMessage}`);
  }
}

async function openResource(resource: Resource): Promise<void> {
  switch (resource.kind) {
    case "file":
    case "folder":
    case "presentation": {
      const absolutePath = await resolveFilesystemResourcePath(resource);
      const errorMessage = await shell.openPath(absolutePath);
      if (errorMessage) {
        throw new SessionEngineError(`Failed to open "${resource.label}": ${errorMessage}`);
      }
      return;
    }
    case "url":
      // Schema already guarantees an absolute http/https URL for kind="url".
      await shell.openExternal(resource.path);
      return;
    case "application":
      await openApplicationResource(resource);
      return;
  }
}

export async function openPresentation(): Promise<null> {
  const session = requireActiveSession();
  if (!session.presentation) {
    throw new SessionEngineError("This Session has no presentation configured");
  }
  await openResource(session.presentation);
  return null;
}

export async function openCurrentStepResource(resourceId: string): Promise<null> {
  const session = requireActiveSession();
  const stepId = getCurrentActiveStepId();
  if (!stepId) {
    throw new SessionEngineError("No Step is currently active");
  }
  const step = session.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new SessionEngineError(`Step "${stepId}" does not exist in this Session`);
  }
  const resource = (step.resources ?? []).find((candidate) => candidate.id === resourceId);
  if (!resource) {
    throw new SessionEngineError(`Resource "${resourceId}" does not exist on the current Step`);
  }
  await openResource(resource);
  return null;
}

/**
 * Domain error for session-engine load/save failures. Carries the file/context
 * involved so callers get an actionable message instead of a raw stack trace.
 */
export class SessionEngineError extends Error {
  readonly file?: string;

  constructor(message: string, file?: string) {
    super(file ? `${message} (${file})` : message);
    this.name = "SessionEngineError";
    this.file = file;
  }
}

import type { InstructorCopilotApi } from "./index";

declare global {
  interface Window {
    instructorCopilot: InstructorCopilotApi;
  }
}

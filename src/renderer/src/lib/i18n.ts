import type { SessionLocale, StepType } from "../../../session-engine/model/schema";

/**
 * Minimal built-in Instructor Mode UI dictionary (Phase 9B-A). No i18n library -
 * the MVP only needs two locales and a small, fixed string set (see
 * docs/architecture.md -> Adaptive Facilitation Console). Session.locale selects
 * the dictionary; absent locale defaults to "en" for backward compatibility.
 * Technical identifiers (Postman, Newman, API, HTTP, npx, file names, commands,
 * status codes) are never translated - they simply aren't in this dictionary.
 */

export const DEFAULT_LOCALE: SessionLocale = "en";

export interface Dictionary {
  session: string;
  step: string;
  status: string;
  slide: string;
  onPlan: string;
  behind: string;
  beforeCheckpoint: string;
  minBehind: string;
  openPresentation: string;
  now: string;
  frame: string;
  ask: string;
  followUp: string;
  listenFor: string;
  doNotReveal: string;
  transition: string;
  next: string;
  finishWhenReady: string;
  fallback: string;
  checklist: string;
  resources: string;
  command: string;
  evidence: string;
  notes: string;
  context: string;
  open: string;
  runCommand: string;
  commandOutput: string;
  addNote: string;
  previous: string;
  nextButton: string;
  skip: string;
  pause: string;
  resume: string;
  completeSession: string;
  completeSessionConfirm: string;
  recoveredBanner: string;
  dismiss: string;
  paused: string;
  sessionComplete: string;
  totalActiveElapsed: string;
  runId: string;
  backToTraining: string;
  noActiveStep: string;
  noStepsInSession: string;
  running: string;
  failedToStartCommand: string;
  exitCode: string;
  stdout: string;
  stderr: string;
  released: string;
  locked: string;
  release: string;
  sensitive: string;
  notesPlaceholder: string;
  stepTypeLabels: Record<StepType, string>;
}

const en: Dictionary = {
  session: "SESSION",
  step: "STEP",
  status: "STATUS",
  slide: "Slide",
  onPlan: "ON PLAN",
  behind: "BEHIND",
  beforeCheckpoint: "before checkpoint",
  minBehind: "min behind",
  openPresentation: "Open Presentation",
  now: "NOW",
  frame: "FRAME / SAY",
  ask: "ASK",
  followUp: "FOLLOW-UP",
  listenFor: "LISTEN FOR",
  doNotReveal: "DO NOT REVEAL",
  transition: "TRANSITION",
  next: "NEXT",
  finishWhenReady: "FINISH WHEN READY",
  fallback: "FALLBACK",
  checklist: "Checklist",
  resources: "Resources",
  command: "Command",
  evidence: "Evidence",
  notes: "Notes",
  context: "Context",
  open: "Open",
  runCommand: "Run Command",
  commandOutput: "Command Output",
  addNote: "Add Note",
  previous: "Previous",
  nextButton: "Next",
  skip: "Skip",
  pause: "Pause",
  resume: "Resume",
  completeSession: "Complete Session",
  completeSessionConfirm: "Complete this session?",
  recoveredBanner: "Session recovered after restart. Review the current Step and press Resume when ready.",
  dismiss: "Dismiss",
  paused: "PAUSED",
  sessionComplete: "Session complete",
  totalActiveElapsed: "Total active elapsed",
  runId: "Run id",
  backToTraining: "Back to Training",
  noActiveStep: "No active Step.",
  noStepsInSession: "No steps in this session.",
  running: "Running…",
  failedToStartCommand: "Failed to start command",
  exitCode: "Exit code",
  stdout: "stdout",
  stderr: "stderr",
  released: "RELEASED",
  locked: "LOCKED",
  release: "Release",
  sensitive: "Sensitive",
  notesPlaceholder: "Quick note for this Step…",
  stepTypeLabels: {
    introduction: "introduction",
    discussion: "discussion",
    pair_work: "pair work",
    live_demo: "live demo",
    investigation: "investigation",
    debrief: "debrief",
    break: "break",
    closing: "closing"
  }
};

const es: Dictionary = {
  session: "SESIÓN",
  step: "PASO",
  status: "ESTADO",
  slide: "Diapositiva",
  onPlan: "EN PLAN",
  behind: "ATRASADO",
  beforeCheckpoint: "antes del punto de control",
  minBehind: "min de atraso",
  openPresentation: "Abrir presentación",
  now: "AHORA",
  frame: "ENMARQUE / DIGA",
  ask: "PREGUNTE",
  followUp: "PROFUNDICE",
  listenFor: "ESCUCHE",
  doNotReveal: "NO REVELAR",
  transition: "TRANSICIÓN",
  next: "SIGUE",
  finishWhenReady: "FINALICE CUANDO ESTÉ LISTO",
  fallback: "PLAN B",
  checklist: "Lista de verificación",
  resources: "Recursos",
  command: "Comando",
  evidence: "Evidencia",
  notes: "Notas",
  context: "Contexto",
  open: "Abrir",
  runCommand: "Ejecutar comando",
  commandOutput: "Salida del comando",
  addNote: "Agregar nota",
  previous: "Anterior",
  nextButton: "Siguiente",
  skip: "Omitir",
  pause: "Pausar",
  resume: "Reanudar",
  completeSession: "Finalizar sesión",
  completeSessionConfirm: "¿Finalizar esta sesión?",
  recoveredBanner: "Sesión recuperada tras reinicio. Revise el Paso actual y presione Reanudar cuando esté listo.",
  dismiss: "Descartar",
  paused: "PAUSADO",
  sessionComplete: "Sesión finalizada",
  totalActiveElapsed: "Tiempo activo total",
  runId: "Id de ejecución",
  backToTraining: "Volver al Training",
  noActiveStep: "No hay un Paso activo.",
  noStepsInSession: "Esta sesión no tiene pasos.",
  running: "Ejecutando…",
  failedToStartCommand: "No se pudo iniciar el comando",
  exitCode: "Código de salida",
  stdout: "stdout",
  stderr: "stderr",
  released: "LIBERADA",
  locked: "BLOQUEADA",
  release: "Liberar",
  sensitive: "Sensible",
  notesPlaceholder: "Nota rápida para este Paso…",
  stepTypeLabels: {
    introduction: "introducción",
    discussion: "discusión",
    pair_work: "trabajo en parejas",
    live_demo: "demo en vivo",
    investigation: "investigación",
    debrief: "puesta en común",
    break: "receso",
    closing: "cierre"
  }
};

const DICTIONARIES: Record<SessionLocale, Dictionary> = { en, es };

export function getDictionary(locale: SessionLocale | undefined): Dictionary {
  return DICTIONARIES[locale ?? DEFAULT_LOCALE];
}

export function formatStepTypeLabel(dictionary: Dictionary, type: StepType): string {
  return dictionary.stepTypeLabels[type];
}

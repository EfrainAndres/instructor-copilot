# Instructor Copilot — Product Spec

## Problem Statement
Instructors delivering hands-on technical training must simultaneously track slide position, talking points, timing, files/apps to open, commands to run, information to withhold, and whether the session is on schedule. This cognitive load causes rushed pacing, forgotten steps, and premature reveals of intended-to-be-discovered information.

## Target User
An instructor or mentor running a prepared, structured training session (workshop, bootcamp module, technical demo) — solo, on their own machine, often without reliable internet.

## Product Goal
Give the instructor a single, glanceable "current step" view that keeps them oriented in a prepared session, without taking over the teaching itself.

## MVP Value Proposition
Instructor Copilot assists; it does not teach autonomously. It shows exactly one step at a time, tracks timing/drift deterministically, and lets the instructor launch resources/commands and reveal evidence on their own explicit action.

## Primary Workflow
1. Open a Training (e.g., "Backend Testing Mindset").
2. Select a Session within it.
3. Start Instructor Mode.
4. Follow steps one at a time: read objective/guidance, open resources, run commands, ask questions, check off items, advance.
5. Take quick notes as needed.
6. Complete the session and review the Run Report.

## Five MVP Screens
1. **Home / Training Library** — list/import Trainings.
2. **Training Detail** — list of Sessions in a Training.
3. **Session Editor** — GUI to author/edit Steps (no manual JSON editing required).
4. **Instructor Mode** — live session runner, current-step view, timers, checklist, notes.
5. **Run Report** — post-session summary of planned vs actual timing per step.

## Core Capabilities
- Training → Session → Step model.
- Step guidance: objective, actions, questions, do-not-reveal warnings, checklist, resources, optional command, next-step link.
- Deterministic session/step timers and schedule drift calculation.
- Resource references (file/folder/presentation/app) opened via the OS, not rendered in-app.
- Command runner architecture (manual trigger only, confirmation for sensitive commands) — data model only in Phase 0.
- Evidence staging: named stages that can be manually released during a run, in any order the Step defines.
- Session notes tied to run/session/step/timestamp.
- Run Report: per-step planned vs actual duration, delta, status, notes.

## Explicit Non-Goals (MVP v0.1)
No cloud sync, accounts, auth, or multi-user collaboration. No Zoom/Meet/Teams/LMS integration. No PowerPoint rendering or automatic slide detection. No screen/voice recognition. No AI assistant or any paid AI API. No participant app, student tracking, mobile/web app, marketplace, or advanced analytics. No automatic command execution. No cloud backend or microservices. Must run fully offline once installed.

## MVP Acceptance Criterion
The instructor can open Instructor Copilot, select Backend Testing Mindset → Session 1, start the session, follow every step (opening the presentation, worksheets, and Postman as instructed), run instructor commands explicitly, take notes, complete the session, and view the Run Report — and can truthfully say: **"The application helped me conduct the session more than it distracted me."**

## Initial Validation Strategy
The first real integration/test case is the existing **Backend Testing Mindset** training (`/Users/efrain.vergara/Documents/Unosquare/Backend-Testing-Mindset-Training`, delivered in Spanish; includes ES presentations, speaker notes, worksheets, Postman collections, a C# lab, Node helper scripts, and progressive evidence staging). This project is **not** touched during Phase 0 — it is referenced only as the Phase 8/9 validation target (see `mvp-roadmap.md`).

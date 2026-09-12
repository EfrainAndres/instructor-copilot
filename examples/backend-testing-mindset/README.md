# Backend Testing Mindset — Instructor Copilot Training

This directory contains only the **portable Instructor Copilot Training definition** for the Backend Testing Mindset course — `training.json` and `sessions/session-1-es.json`. It does not contain any real training assets.

The actual presentations, worksheets, instructor answer key, and Postman/Newman artifacts live in the separate `Backend-Testing-Mindset-Training` project. That project is the source of truth for all content; nothing from it is copied into this repository.

## Configuring the content root

Every `Resource`/`CommandAction` in this Training references the logical content root `content` (never an absolute path). To run this Training locally:

1. Open this Training in Instructor Copilot.
2. From Training Detail, configure the `content` root and point it at your local checkout of `Backend-Testing-Mindset-Training`.

That mapping is stored in your local `AppSettings` (`~/.instructor-copilot/settings.json`), not in this repository — no absolute path ever belongs in these JSON files.

## Scope

Only Session 1 ES (`session-1-es`, 17 Steps, 90 minutes) is modeled here. Session 2 is not yet integrated.

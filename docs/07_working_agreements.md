# Working Agreements (How we build)

- Docs are authoritative. If code conflicts, docs win.
- Keep each chat focused on one feature.
- Record decisions in `/docs/06_decision_log.md`.
- Record open questions / TODOs in `/docs/08_current_task.md`.
- Prefer minimal, PR-sized changes.
- When a change requires >2 steps, generate the whole file (to avoid partial-edit drift).
- Avoid introducing schema exports that don’t exist (e.g., don’t import non-existent validators).

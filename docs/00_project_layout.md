# Project Layout

This document describes the current folder structure and responsibilities of the project.

---

## Root

```text
/
## Admin Planning & Events

app/
├─ admin/
│  ├─ plan-lesson/          # Convert virtual occurrence → Event
│  ├─ events/
│  │  └─ [id]/              # Event Planner (lessons, cancellation, substitute)
│  └─ page.tsx              # Lesson Plans dashboard
│
├─ api/
│  ├─ events/
│  │  ├─ route.ts           # Create / list events
│  │  └─ [id]/route.ts      # Get / update a single event
│  └─ dances/               # Search LDCO dance database
│
├─ docs/                   # Project documentation (source of truth)
├─ lib/                    # Shared utilities (db, api helpers)
├─ public/                 # Static assets
├─ package.json
├─ tsconfig.json
└─ next.config.js

lib/
├─ mongo.ts                # MongoDB connection helpers
├─ api.ts                  # client-side fetch helpers
├─ time.ts                 # shared time parsing / formatting helpers
└─ validators.ts           # validator helpers

docs/
├─ 00_project_layout.md
├─ 01_system_overview.md
├─ 02_data_model.md
├─ 03_domain_rules.md
├─ 04_api_contracts.md
├─ 05_ui_flows.md
├─ 06_decision_log.md
├─ 07_working_agreements.md
└─ 08_current_task.md

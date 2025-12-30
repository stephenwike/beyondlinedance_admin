# Project Layout

This document describes the current folder structure and responsibilities of the project.

Docs in `/docs` are the **source of truth**. If code conflicts with docs, docs win.

---

## Root

```text
/
├─ app/                    # Next.js App Router (UI + API)
├─ docs/                   # Project documentation (source of truth)
├─ lib/                    # Shared utilities (db, api helpers)
├─ public/                 # Static assets
├─ package.json
├─ tsconfig.json
└─ next.config.js
```

---

## Admin Planning & Events

### app/

```text
app/
├─ admin/
│  ├─ layout.tsx           # Admin shell (sidebar + content)
│  ├─ page.tsx             # Lesson Plans dashboard
│  │
│  ├─ add-event/           # Create one-off / special events
│  │  └─ page.tsx
│  │
│  ├─ events/
│  │  └─ [id]/
│  │     └─ page.tsx       # Event Planner (lessons, cancellation, substitute)
│  │
│  ├─ event-types/         # Event Type admin (list/edit)
│  │
│  ├─ venues/              # Venue admin (list/edit)
│  │
│  └─ generate/            # Legacy / experimental tools (not core)
│
├─ api/
│  ├─ events/
│  │  ├─ route.ts          # GET events by date range
│  │  └─ [id]/route.ts     # GET / PATCH single event
│  │
│  ├─ event-types/
│  │  └─ route.ts          # GET event types (must include endDayOffset)
│  │
│  ├─ frequencies/
│  │  └─ route.ts          # GET frequencies (virtual occurrences)
│  │
│  ├─ venues/
│  │  └─ route.ts          # GET venues
│  │
│  ├─ dances/
│  │  └─ route.ts          # Search LDCO dance database
│  │
│  └─ admin/
│     ├─ one-off-event/
│     │  └─ route.ts       # POST create a single event occurrence
│     │
│     └─ event-types/
│        └─ route.ts       # POST create new event type (inline workflow)
```

---

## Responsibilities (High Level)

### Admin Dashboard (`/admin`)
- Shows upcoming occurrences in a date range
- Combines:
  - Persisted Events from MongoDB
  - Virtual occurrences derived from Frequencies
- Default view focuses on **unplanned** occurrences
- Entry point for planning lessons or adding one-off events

### One-off / Special Events (`/admin/add-event`)
- Used to create events **not covered by virtual occurrences**
- Admin can:
  - Select an existing Event Type (dropdown includes venue)
  - Create a new Event Type inline
- Occurrence fields auto-populate from Event Type defaults:
  - startTime
  - endTime
  - endDayOffset (after midnight)
- Creates an Event doc and redirects to Event Planner

### Event Planner (`/admin/events/[id]`)
- Primary screen for planning lessons
- Supports:
  - Editing start/end times
  - After-midnight handling via `endDayOffset`
  - Cancellation + cancel note
  - Substitute + name
  - Lesson planning:
    - lesson time
    - dance
    - level
    - link
    - dance search via `/api/dances`
- Save persists changes and redirects back to `/admin`

---

## API Design Notes

- **Events are only created manually**
- Frequencies generate **virtual occurrences only**
- API routes are thin:
  - Validate input
  - Read/write MongoDB
  - Return normalized JSON
- `/api/event-types` must return all fields needed by the UI,
  including `endDayOffset` for correct default behavior

---

## lib/

```text
lib/
├─ mongo.ts                # MongoDB connection helpers (canonical DB names)
├─ api.ts                  # Client-side fetch helpers
├─ time.ts                 # Shared time parsing / formatting helpers
└─ validators.ts           # Validator helpers (only actual exports)
```

---

## docs/

```text
docs/
├─ 00_project_layout.md    # This file
├─ 01_system_overview.md
├─ 02_data_model.md
├─ 03_domain_rules.md
├─ 04_api_contracts.md
├─ 05_ui_flows.md
├─ 06_decision_log.md
├─ 07_working_agreements.md
├─ 08_current_task.md
```

---

## Key Architecture Rules (Summary)

- Events are created manually only
- Frequencies never auto-create Events
- Event Types define defaults; Events store overrides
- After-midnight is represented using `endDayOffset: 0 | 1`
- Save actions return the admin to `/admin`

# Decision Log

This document records significant architectural and product decisions for BeyondLineDance.

---

## Event Planning & Lessons

- Events are **only created manually** through the admin Plan Lesson flow.
- Recurring schedules generate **virtual occurrences only**; no Event documents are auto-generated.
- Converting a virtual occurrence into a real event:
  - Creates or upserts a single `events` document
  - Deterministic key: `eventTypeId + date + startTime`
- Lesson planning happens **at the time of event creation or editing**, not separately.

---

## Lessons

- Lessons are embedded directly inside the Event document.
- Lessons are **not seeded automatically**; admins add lessons explicitly.
- Each lesson may include:
  - `time` (string, e.g. `"7:00 PM"`)
  - `dance` (string)
  - `level` (string)
  - `link` (string, e.g. stepsheet URL)
- All lesson fields are nullable to allow partial planning.
- Lessons can be defined by:
  - Searching the LDCO database
  - Manual text entry
- Selecting a dance locks the search for that lesson until cleared.

---

## Cancellation & Substitutes

- Event occurrences may be marked as **cancelled**.
- Cancelled events:
  - Persist as Event documents
  - May include an optional cancellation note
  - Ignore lessons (stored but not required)
- Events may optionally include a **substitute instructor**, stored as a simple name string.

---

## Admin Workflow

- The Plan Lesson page creates the Event document.
- The Event Planner page edits lessons and event overrides.
- Saving an event from the planner **redirects back to `/admin`** to complete the flow.

---

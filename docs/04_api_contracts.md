# API Contracts

This doc describes the API surface used by admin flows.

---

## GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD
Purpose:
- Return Event docs in date range (planned or partially planned).

Inputs:
- `from`, `to` inclusive, YYYY-MM-DD

Behavior:
- Sort by `{ date: 1, startTime: 1 }` (string-safe if time strings are consistent)

Returns:
- Array of Event documents (raw or enriched depending on endpoint; dashboard may enrich elsewhere)

Errors:
- 400 if from/to missing or invalid
- 400 if from > to

---

## GET /api/events/:id
Purpose:
- Return a single Event doc for editing in the Event Planner.

Returns (recommended):
- Event fields
- Expanded `eventType` summary
- Expanded `venue` summary

---

## PATCH /api/events/:id
Purpose:
- Update the Event occurrence overrides + lesson plan.

Payload (typical):
- `startTime`: string
- `endTime`: string
- `endDayOffset`: 0 | 1
- `isCancelled`: boolean
- `cancelNote`: string | null
- `substitute`: string | null
- `lessons`: LessonSlot[]

LessonSlot:
- `time`: string | null
- `dance`: string | null
- `level`: string | null
- `link`: string | null

Returns:
- `{ ok: true }` or updated event

---

## GET /api/event-types
Purpose:
- Return event types for admin dropdown selection.

Important:
- Must include `endDayOffset` so UI can default “Ends after midnight”.

Returns (minimum):
- `_id`, `title`, `venueId`
- `defaultStartTime`, `defaultDurationMinutes`
- `endDayOffset`
- `isActive`, `level`, `price`

---

## POST /api/admin/event-types
Purpose:
- Create a new Event Type from the one-off event workflow.

Payload (typical):
- `title` (required)
- `venueId` (required)
- `level` (optional)
- `price` (optional)
- `isActive` (boolean)

Returns:
- `{ ok: true, eventTypeId: string }`

---

## GET /api/venues
Purpose:
- Lookup venues for admin selection.

Returns:
- `_id`, `name`, `address`, `city`, `state`

---

## POST /api/admin/one-off-event
Purpose:
- Create a single Event occurrence for a special/one-off event (not from virtual occurrences).

Payload:
- `eventTypeId` (required)
- `date` (required, YYYY-MM-DD)
- `startTime` (required, "6:30 PM")
- `endTime` (required, "8:00 PM")
- `endDayOffset` (0|1, optional; default 0)

Behavior:
- Validates times, including endDayOffset semantics.
- Inserts a new Event doc with empty lessons by default.

Returns:
- `{ ok: true, eventId: string }`

---

## GET /api/dances?q=...
Purpose:
- Type-ahead dance search against `ldco.dances` by `danceName`.

Inputs:
- `q` (string, minimum length 2)

Returns:
- array of matches, each:
  - `_id`
  - `danceName`
  - `stepsheet` (url|null)
  - `difficulty` (string|null)

Usage:
- Used by Event Planner dance picker to fill dance + stepsheet link.

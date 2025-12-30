# Domain Rules (Ground Truth)

## 1) Planned vs Unplanned vs Cancelled
An occurrence is considered:

### UNPLANNED
- No Event doc exists yet, OR
- Event exists but has **zero lesson slots**, OR
- Event exists and has lesson slots, but **any lesson slot is missing a dance name** (empty or null)

### PLANNED
- Event doc exists AND
- Event is NOT cancelled AND
- Every lesson slot has a non-empty dance name

### CANCELLED
- Event doc exists AND
- `isCancelled === true`
- Cancellation note is optional (`cancelNote`)

Cancelled events are treated as “handled” (not “unplanned”).

---

## 2) Events are created manually
- The system never bulk-generates Event docs for occurrences.
- Frequencies generate **virtual occurrences**.
- Admin converts a virtual occurrence into an Event doc via planning workflows.

---

## 3) Virtual occurrences
Virtual occurrences are derived from:
- active Event Types + active Frequencies

Deterministic identity for a virtual occurrence:
- `eventTypeId + date`

If an Event doc exists for the same `eventTypeId + date`, the persisted Event wins.

---

## 4) Event occurrence overrides
Event occurrence fields (`startTime`, `endTime`, `endDayOffset`) can override defaults from the Event Type.

Defaults:
- New occurrences should populate `startTime` and derived `endTime` from:
  - `event_types.defaultStartTime`
  - `event_types.defaultDurationMinutes`
- `endDayOffset` defaults from:
  - `event_types.endDayOffset` (default 0)

---

## 5) After midnight (endDayOffset)
- `endDayOffset: 0` means `endTime` is on the same date
- `endDayOffset: 1` means `endTime` is on the next day

Validation rule:
- If `endDayOffset === 0`, `endTime` must be after `startTime` (same-day range).
- If `endDayOffset === 1`, `endTime` can be earlier than `startTime` (next-day range).

---

## 6) Lessons
- Lessons are authored on the Event Planner.
- Lesson slots may be blank (dance/level/link/time can be null).
- Dance search can populate:
  - `dance` (danceName)
  - `link` (stepsheet)
  - `level` can be manually set (difficulty may be used optionally later)

Lesson label is **Time** (not “Start Time”).

---

## 7) Cancellation and substitute rules
- If `isCancelled === true`, event is considered “handled”.
- Cancelled events may still have lessons stored, but they do not affect “planned” status.
- Substitute:
  - If a substitute is used, store the name in `substitute` (string).
  - Substitute is independent of cancellation.

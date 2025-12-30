# Domain Rules

This document defines core business rules for BeyondLineDance.

---

## Event Types vs Events

- **Event Types**
  - Define recurring schedules and defaults
  - Do not represent specific dates
- **Events**
  - Represent a single, planned occurrence
  - Are created manually by an admin
  - Override Event Type defaults as needed

---

## Virtual Occurrences

- Future occurrences derived from Event Type frequencies are virtual.
- Virtual occurrences:
  - Are displayed in the admin dashboard
  - Do not exist in the database
- A virtual occurrence becomes real only when planned.

---

## Event Documents

- Each Event document represents one occurrence.
- Identity is defined by:
  - `eventTypeId`
  - `date`
  - `startTime`
- Event documents may include:
  - `startTime` (override)
  - `endTime` (override)
  - `isCancelled`
  - `cancelNote`
  - `substitute`
  - `lessons[]`

---

## Lessons

- Lessons belong exclusively to an Event.
- Lessons are optional unless the event is planned and not cancelled.
- Lesson fields:
  - `time` — explicit start time for the lesson
  - `dance` — name of the dance
  - `level` — difficulty level
  - `link` — stepsheet or reference URL
- Lesson times are independent and not auto-derived.
- Empty or partially filled lessons are allowed during planning.

---

## Cancellation

- Cancelled events:
  - Must persist as Event documents
  - May include a cancellation note
  - Are considered “planned” even without lessons

---

## Substitutes

- Substitute instructors are optional.
- Stored as a freeform name string.
- No instructor entity is required at this time.

---

# BeyondLineDance – System Overview

## Purpose
Manage line dance lessons across venues.

The system shows:
- **Planned events**: persisted `events` documents in MongoDB with lesson plans (and optional cancellation/substitute info)
- **Unplanned occurrences**: **virtual** occurrences derived from active Frequencies when no matching Event exists yet

## Stack
- Next.js (App Router)
- MongoDB
- Admin UI under `/admin/*`
- API routes under `/api/*` and `/api/admin/*`
- Canonical DB names (domain model): `bld`, `ldco`, `ldco-reviews`

## Core concepts
### Venue
A physical place where events happen (stored in `bld.venues`).

### Event Type
A reusable definition of an event (stored in `bld.event_types`):
- Title, level, price
- Venue reference (`venueId`)
- Default times (defaultStartTime, defaultDurationMinutes)
- Optional default `endDayOffset` (0 or 1) for events that commonly end after midnight
- Active vs inactive (active types usually have frequencies; inactive are typically special/one-off)

### Frequency
A recurrence definition for an Event Type (stored in `bld.frequencies`).
Used only to generate **virtual occurrences** (no database event created automatically).

### Event (Occurrence)
A specific scheduled occurrence (stored in `bld.events`), created manually via admin workflows.
An Event can be:
- Unplanned (exists but missing lesson dances)
- Planned (all lesson dances present)
- Cancelled (explicitly marked; still considered “handled”)

### Lessons
A planned sequence of lesson slots within an Event.
Each lesson slot includes:
- `time` (string like “7:00 PM”, label is **Time**)
- `dance` (string or null)
- `level` (string or null)
- `link` (string URL or null)

Lessons can be authored manually or with dance search via `/api/dances`.

## Time model: after midnight
Some events end after midnight. We represent this with:
- `endDayOffset: 0 | 1`

Meaning:
- `0` = end time is same calendar day as `date`
- `1` = end time is on the next day (after midnight)

`event_types.endDayOffset` is a **default**. `events.endDayOffset` is the persisted value per occurrence.

## Admin overview
- `/admin` shows lesson planning dashboard across a date range.
- Unplanned occurrences come from Frequencies (virtual) and from Events missing lesson dances.
- Admin can:
  - Plan an unplanned occurrence (creates an Event doc)
  - Edit an Event (lessons, cancel/substitute, time overrides)
  - Add a one-off event not covered by Frequencies

## Definition of done (current)
- Virtual occurrences exist; no bulk event generation required
- Admin can convert virtual occurrence → Event doc and plan lessons
- Lesson planner supports:
  - Dance search + selection
  - Manual overrides (dance, level, link)
  - Cancellation + note
  - Substitute + name
- One-off event workflow exists from the admin dashboard
- End-after-midnight supported using endDayOffset (Option A)

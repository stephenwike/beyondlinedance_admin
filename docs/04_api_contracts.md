# API Contracts

## GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD
Returns planned Events within range.
Sorting: ascending by date then time.

## GET /api/event-types?isActive=true
Returns active EventTypes (with frequency info needed to generate occurrences).

## POST /api/events
Creates a planned Event.
Validations:
- eventTypeId must be valid ObjectId
- date required
- startTime required
- durationMinutes required
- avoid duplicates for same (eventTypeId, date, startTime) unless intentionally allowed

## PATCH /api/events/:id
Updates an Event.
Note: In Next.js App Router, params may need to be awaited/unwrapped depending on version.

## GET /api/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD
Returns virtual occurrences derived from Frequencies.

Each occurrence includes:
- date
- eventType metadata

Notes:
- Used by admin lesson overview
- Works even if events collection is empty

## POST /api/events
Creates or upserts a planned Event from a virtual occurrence.

Inputs:
- eventTypeId
- date

Behavior:
- Uses (eventTypeId + date) as a deterministic key
- Creates the Event only when planning begins

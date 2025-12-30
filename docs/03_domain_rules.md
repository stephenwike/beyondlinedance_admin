# Domain Rules (Ground Truth)

## Planned vs Unplanned
An occurrence is considered:

- UNPLANNED if:
  - No Event document exists yet, OR
  - The Event has zero lesson slots, OR
  - Any lesson slot is missing a dance name

- PLANNED if:
  - An Event document exists AND
  - All lesson slots have a dance name

- CANCELLED if:
  - The Event exists and is marked cancelled
  - Event Occurances can be cancelled, not event types.

## Virtual occurrence generation
Given:
- Active EventTypes
- Defined Frequencies
- Valid date range [from, to]
- Undefined [from, to] are inclusive.

Generate:
- Virtual occurrences from Frequencies
- Each occurrence is identified by:
  - eventTypeId + date

## Admin planning flow
- Admin sees virtual occurrences (planned + unplanned)
- Unplanned occurrences show a "Plan lesson" action
- Plan lesson opens /admin/plan-lesson with editable fields
- Saving creates (or upserts) an Event document
- Admin is redirected to the Event Planner to add lessons
- In /admin/plan-lesson event-type information is uneditable.

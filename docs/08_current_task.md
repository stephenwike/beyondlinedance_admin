# Current Task

## Goal
Complete and harden the admin workflow for adding one-off / special events, including after-midnight support.

## Definition of done
- Admin can create a one-off Event occurrence from `/admin/add-event`
- Event Type dropdown options include venue label for identification
- Selecting an Event Type auto-fills:
  - startTime / endTime from Event Type defaults
  - endDayOffset checkbox from Event Type endDayOffset
- Event creation persists endDayOffset onto the Event doc
- Event Planner can edit and persist endDayOffset, cancellation, substitute, and lessons
- Save from Event Planner redirects to `/admin`

## TODOs / Open questions
- Ensure `/api/event-types` always returns `endDayOffset` (and normalizes it to 0|1).
- Dashboard display:
  - show “(+1 day)” when endDayOffset=1
  - ensure sorting still behaves correctly for after-midnight events
- Decide whether to add a “Bar close” helper (UI shortcut) without adding a sentinel string value.
- Event Type admin edit UI:
  - allow setting `endDayOffset` on event_types (defaults), rather than manual Mongo edits.
- Data consistency:
  - decide whether to always store `durationMinutes` on events (or derive it on-demand).

# Current Task

## Status
Event planning and lesson definition workflow is functionally complete.

---

## Completed

- Manual creation of Event documents from virtual occurrences
- Lesson planning UI with add/remove functionality
- Lesson time support per lesson
- Dance search via `/api/dances`
- Manual dance entry and clearing
- Event cancellation with optional note
- Substitute instructor support
- Admin save → redirect to dashboard
- Robust handling of schema drift between API and UI

---

## Open Questions / Future Enhancements

- Should lesson `time` be validated server-side (format and bounds)?
- Should cancelled events hide lesson UI entirely?
- Should lesson times auto-snap to configurable intervals (e.g. 15/30 minutes)?
- Should lesson rows be reorderable (drag & drop)?
- Should substitute instructors become first-class entities?
- Should the admin dashboard visually differentiate:
  - Cancelled events
  - Fully planned vs partially planned events

---

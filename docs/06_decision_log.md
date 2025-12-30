# UI Flows

## 1) Admin dashboard: /admin
Purpose:
- Show upcoming occurrences (planned + unplanned)
- Default filter: Only unplanned

Flow:
- Admin selects date range
- System lists occurrences:
  - Planned / partially planned from `events`
  - Virtual occurrences from frequencies where no event exists
- Admin clicks an occurrence:
  - If it exists as an Event doc → goes to Event Planner
  - If it’s virtual/unplanned → “Plan lesson” converts it into an Event doc then goes to Event Planner

---

## 2) Event Planner: /admin/events/:id
Purpose:
- Primary lesson-planning screen for an Event occurrence.

Features:
- Header shows:
  - Event Type title
  - Date and time range (include “+1 day” if endDayOffset=1)
  - Venue name/address

Event controls:
- Start time (override)
- End time (override)
- Checkbox: “Ends after midnight (next day)” (endDayOffset)
- Cancelled toggle + cancel note
- Substitute name

Lessons:
- Add lesson (adds a slot including a suggested time)
- Remove lesson
- Edit lesson fields:
  - Time
  - Level
  - Dance
  - Link
- Pick dance:
  - Search `/api/dances?q=...`
  - Selecting a result populates dance + link
  - Once selected, search UI is disabled for that lesson until “Clear” is used

Save behavior:
- Save persists changes (PATCH /api/events/:id)
- Save redirects back to `/admin`

---

## 3) One-off / special events: /admin/add-event
Purpose:
- Create a new single event occurrence not covered by virtual occurrences.

Flow:
- Admin selects an Event Type from a dropdown
  - Option labels include Venue: `{title} — {venue}`
- If needed, admin creates a new Event Type inline
- Occurrence form auto-populates:
  - Start time / End time from Event Type defaults
  - Ends after midnight checkbox from Event Type `endDayOffset`
- Admin creates event → redirects to Event Planner

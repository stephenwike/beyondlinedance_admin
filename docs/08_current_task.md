# Current Task

## Goal
Implement "unplanned occurrences" derived from EventType frequency and display them alongside planned Events.

## Definition of done
- Unplanned occurrences appear when no Event doc exists
- "Plan lesson" button creates Event doc
- Correct sorting (2pm before 5pm)
- Plan lesson page loads (no 404) and is editable

## Known issues
- Next.js route params promise issue in /api/events/[id]/route.ts
- Sorting bug: 5pm appears before 2pm

## Open questions:
- Should lesson times be auto-seeded when creating events?
- Should frequencies provide default lesson templates?

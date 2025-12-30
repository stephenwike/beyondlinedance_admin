# Data Model (MongoDB)

## venues
Fields (example):
- _id: ObjectId
- name: string
- address: string
- city: string
- state: string

## event_types
Fields (example):
- _id: ObjectId
- title: string
- level: string
- price: string
- venueId: ObjectId
- defaultStartTime: string ("6:30 PM")
- defaultDurationMinutes: number
- isActive: boolean

## frequencies
Fields (weekly example):
- _id: ObjectId
- eventTypeId: ObjectId
- kind: string ("WEEKLY")
- byDay": string array (["SU","MO","TU","WE","TH","FR","SA"])
- startTime: string ("6:30 PM"),
- durationMinutes: number
- startDate: string (optional) ("2026-01-03")
- endDate: string (optional) ("2027-01-03")
Notes:
- Frequencies define expected occurrences.
- Times may vary between frequencies for the same EventType.

Fields (monthly example):
- _id: ObjectId
- eventTypeId: ObjectId
- kind: ("MONTHLY_NTH_WEEKDAY")
- weekday: string ("FR")
- nth: number (1),
- startTime: string ("6:00 PM")
- durationMinutes: number
- startDate: string (optional) ("2026-01-02")
- endDate: string (optional) ("2027-01-02")

## events
Fields (typical):
- _id: ObjectId
- eventTypeId: ObjectId
- date: string (YYYY-MM-DD)
- lessons: Object[] (optional)
    - time: string ("6:45 PM")
    - dance: string
    - level: string (optional)
    - link: url (optional)
Notes:
- Represents an event occurrence.
- Events may exist with zero lessons (early planning state).
- Events are created manually via admin planning flows.


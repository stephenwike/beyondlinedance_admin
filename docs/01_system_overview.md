# BeyondLineDance – System Overview

## Purpose
Manage recurring line dance lessons across venues. Show both:
- Planned lessons (Event documents with complete lesson plans)
- Unplanned lessons (virtual occurrences derived from active Frequencies)

## Stack
- Next.js (App Router)
- MongoDB
- Admin pages under /admin/*
- API routes under /api/*
- API routes with admin interactions under /api/admin/*

## Core objects
- Venue: a physical place
- EventType: definition of a recurring class (title, level, venue)
- Frequency: recurrence rules (days, times, duration) for an EventType
- Event: a planned lesson instance (lessons and state)

## Key user experiences
- Public: view upcoming lessons (planned + unplanned)
- Admin: see virtual occurrences and explicitly convert them into planned Events

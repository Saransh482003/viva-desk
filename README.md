# VivaFlow — Multi-Page Warm Obsidian Next.js 14 + FastAPI + PostgreSQL Suite

An ergonomic, multi-page ML Viva evaluation platform designed for **12–13 hour examiner shifts** with a warm carbon-black & amber palette, fluid page transitions, unclutted workspace tabs, and live PostgreSQL (`FOR UPDATE SKIP LOCKED`) synchronization.

## Multi-Page Next.js App Router Routes

- `/cockpit` — **Examiner Viva Cockpit**: Spacious zero-clutter grading interface split cleanly into `Rubric`, `Feedback Notes`, and `Smart Viva Probes` tabs, with 1-tap `0–10` pills, animated Meet recording equalizer, 30-min smooth pacing bar, `50/50 Meet Dock` mode, and mouse-free hotkeys (`1–9/0`, `[ ]`, `G`, `M`, `⌘↵`).
- `/calendar` — **Schedule & Activity Bars**: Monthly calendar displaying **embedded horizontal completion & scheduled bars** inside every date box, marathon-day flame badges, shift-density spark-bars (Morning / Midday / Afternoon / Evening), and a 2-click Availability Slot Publisher.
- `/statistics` — **Analytics & Exports**: Dedicated Recharts velocity curves, score band distributions, criterion mastery bars, and 1-click `.csv` / `.xlsx` exports.
- `/command` — **Instructor Command Center**: Tabbed operations hub for Live Google Meet Telemetry, Score Approvals & 1-Click Result Emails, Safe Rubric Re-Weighting / `v+1` Versioning, and IITM Reschedule Unlocks.
- `/portal` — **Student Booking Portal**: Pooled 30-minute time-window reservations (`SKIP LOCKED`) and reschedule requests.

## Quickstart

```bash
docker compose up --build
```

- **Next.js Multi-Page App**: `http://localhost:3000/cockpit`
- **FastAPI Swagger Docs**: `http://localhost:8000/docs`

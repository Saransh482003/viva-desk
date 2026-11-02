# IITM ML Viva Management Platform — FastAPI + PostgreSQL MVP

A Postman-ready backend MVP built with **FastAPI**, **SQLAlchemy 2.0**, and **PostgreSQL 16 (Docker Compose)** featuring native `FOR UPDATE SKIP LOCKED` concurrency, mocked `X-User-Email` role switching, simulated Google Meet provisioning & live join/recording telemetry, non-destructive rubric versioning/re-weighting, L1->L2 state transitions, and CSV/Excel exports.

## 1. Start the Backend in One Command

```bash
docker compose up --build
```

- **API Base URL**: `http://localhost:8000`
- **Interactive Swagger UI**: `http://localhost:8000/docs`
- **PostgreSQL 16**: `localhost:5432` (`viva_admin` / `viva_secret`, DB `viva_desk_db`)

On startup, the backend automatically creates all tables and seeds a sample term (`MLP Project Viva — Nov 2026 Term`), L1 & L2 rubrics, initial pooled slots on `2026-11-10`, and 7 test accounts.

## 2. Pre-Seeded Mock Personas (`X-User-Email` Header)

Pass any of these emails in the `X-User-Email` HTTP header in Postman to switch roles instantly:

| Persona | `X-User-Email` Header Value | Role / Initial State |
| :--- | :--- | :--- |
| Course Instructor | `instructor@iitm.ac.in` | `INSTRUCTOR` (Full control, Meet provisioning, approvals) |
| Saransh Saini | `saransh.l1@iitm.ac.in` | `EXAMINER` (`L1`) — pre-seeded 10:00 & 10:30 AM IST slots |
| Priya Nair | `priya.l1@iitm.ac.in` | `EXAMINER` (`L1`) — pre-seeded 10:00 AM IST slot |
| Rohan Mehta | `rohan.l2@iitm.ac.in` | `EXAMINER` (`L2`) — pre-seeded 11:00 AM IST slot |
| Aarav Sharma | `student1@ds.study.iitm.ac.in` | `STUDENT` (`ELIGIBLE_L1`) |
| Diya Verma | `student2@ds.study.iitm.ac.in` | `STUDENT` (`ELIGIBLE_L1`) |
| Kabir Iyer | `student3@ds.study.iitm.ac.in` | `STUDENT` (`ELIGIBLE_L2`) |

## 3. Import into Postman

Import `postman/ML_Viva_Platform.postman_collection.json` into Postman and run folders `1` through `6` in order to experience the full pitch demo flow!

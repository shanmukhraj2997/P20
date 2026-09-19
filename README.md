# P20 — Unified Campus Resource, Laboratory & Facility Booking Platform

Centralized university platform for booking classrooms, laboratories, specialized equipment, seminar halls, sports facilities, meeting rooms, and campus vehicles.

---

## 🏗️ Architecture & Technology Stack

* **Frontend**: Next.js 14 (App Router), React, FullCalendar (`@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`), iCalendar export, Vanilla CSS / Tailwind UI styling.
* **Backend**: Python 3.13, Django 5.1, Django REST Framework, CORS headers, Token Authentication.
* **Database Invariant**: PostgreSQL 18+ with `btree_gist` extension, PostgreSQL range types (`DateTimeRangeField` / `tstzrange`), and `EXCLUDE USING gist` constraints for database-enforced conflict-safe booking.
* **Background Processing**: Celery, Celery Beat, Redis (configured for upcoming background workflows).
* **Testing**: Django Testing Framework, DRF API Test Client.

---

## 👥 Application User Roles & Permissions

Backend enforces 6 distinct application roles across all endpoints:
1. **Student** (`student`) — Browse resource catalogue, view resource specs & availability, submit bookings, cancel owned bookings.
2. **Faculty / Staff** (`faculty`) — Browse resource catalogue, view specs & lab schedules, submit bookings, cancel owned bookings.
3. **Resource Custodian** (`custodian`) — Manage assigned campus resources & equipment, review all reservations for owned resources.
4. **Department Head** (`dept_head`) — View department resources, review department booking schedules & usage reports.
5. **Facility Manager** (`facility_mgr`) — Manage global campus infrastructure, blackout periods, and all facility reservations.
6. **Administrator** (`admin`) — Full system administration, complete resource control, and booking management.

---

## 📦 Functional Modules Status

| Module | Description | Status |
| :--- | :--- | :--- |
| **M1** | **Resource Catalogue & Category Management** | **Sprint 2 Completed** |
| **M2** | **Availability & Rules Engine** | **Sprint 3 Completed** |
| **M3** | **Conflict-Safe Booking Engine (PostgreSQL `btree_gist`)** | **Sprint 3 Completed** |
| **M4** | Timetable Integration | *Sprint 4 Pending* |
| **M5** | Approval Workflows | *Sprint 5 Pending* |
| **M6** | Check-in & Auto-Release | *Sprint 6 Pending* |
| **M7** | Maintenance & Downtime Management | *Sprint 7 Pending* |
| **M8** | Consumables & Accessories | *Sprint 8 Pending* |
| **M9** | Analytics & Reporting | *Sprint 9 Pending* |

---

## 🛡️ Database-Level Conflict Prevention Mechanism

Overlapping bookings for the same resource are strictly prevented at the **PostgreSQL database level** via a GiST range exclusion constraint on the `bookings_bookingslot` table:

```sql
ALTER TABLE "bookings_bookingslot" 
ADD CONSTRAINT "prevent_overlapping_booking_slots" 
EXCLUDE USING gist ("resource_id" WITH =, "period" WITH &&) 
WHERE ("is_active");
```

### Conflict Handling & HTTP 409 Mapping
1. When a user submits a booking, the backend creates the `Booking` and `BookingSlot` inside a Django `db.transaction.atomic()` block.
2. If two users attempt to book overlapping time slots for the same resource simultaneously, PostgreSQL rejects the second insertion and raises an `ExclusionViolation` (`IntegrityError`).
3. The API view catches this database exception and returns a clean, user-friendly response with **`HTTP 409 Conflict`**:
   ```json
   {
       "error": "booking_conflict",
       "message": "The selected time slot is no longer available. Please choose another slot."
   }
   ```
4. When a booking is cancelled, setting `BookingSlot.is_active = False` immediately releases the PostgreSQL range constraint for that resource and period.

---

## 🔌 API Endpoints (Sprint 3)

### Authentication (`/api/accounts/`)
- `POST /api/accounts/register/` — Register new user.
- `POST /api/accounts/login/` — Authenticate user & issue auth token.
- `POST /api/accounts/logout/` — Invalidate user token.
- `GET /api/accounts/me/` — Retrieve active user profile & role.

### Resource Catalogue (`/api/resources/`)
- `GET /api/resources/types/` — List resource categories.
- `GET /api/resources/` — Search & multi-filter campus resources (`search`, `resource_type`, `location`, `min_capacity`, `status`).
- `GET /api/resources/<id>/` — View resource details.
- `GET /api/resources/<id>/availability/` — Retrieve FullCalendar events for booked, blackout, and unavailable periods.

### Booking Engine (`/api/bookings/`)
- `POST /api/bookings/` — Create new booking slot. Returns `201 Created` or `409 Conflict`.
- `GET /api/bookings/` — List bookings for authenticated user.
- `GET /api/bookings/<id>/` — View booking details.
- `POST /api/bookings/<id>/cancel/` — Cancel booking and release PostgreSQL exclusion range slot.
- `GET /api/bookings/manage/` — Staff & custodian booking management view.

---

## 🌐 Frontend Routes & Component Architecture

- `/login` — Authentication page with one-click demo presets for all 6 roles.
- `/dashboard` — Role-aware dashboard shell displaying active role, system status, metrics, and module shells.
- `/resources` — Resource Catalogue page featuring live search, filter panel, and resource cards.
- `/resources/[id]` — Resource Details page with specs, features list, custodian contact card, and "View Availability" action.
- `/resources/[id]/availability` — Interactive FullCalendar scheduling screen with week/day views, time slot selection, booking form panel, and `HTTP 409` conflict notifications.
- `/my-bookings` — My Bookings page with status tabs (`Approved`, `Pending`, `Cancelled`), cancellation action, and staff management view.

---

## 🚀 Environment Setup & Seed Commands

### 1. Seed Demo Resources & Availability Rules
```cmd
cd backend
..\.venv\Scripts\python.exe manage.py seed_resources
..\.venv\Scripts\python.exe manage.py seed_availability
```

### 2. Run Backend Server
```cmd
cd backend
..\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

### 3. Run Frontend Server
```cmd
cd frontend
npm run dev
```

---

## 🧪 Testing Commands

Execute complete backend test suite (25 tests covering auth, resources, availability, bookings, exclusion constraints, and concurrency):
```cmd
cd backend
..\.venv\Scripts\python.exe manage.py test --noinput bookings availability resources accounts config
```

Verify Next.js production build:
```cmd
cd frontend
npm run build
```

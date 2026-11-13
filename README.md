# P20 — Unified Campus Resource, Laboratory & Facility Booking Platform

Centralized university platform for booking classrooms, laboratories, specialized equipment, seminar halls, sports facilities, meeting rooms, and campus vehicles.

---

## 🏗️ Architecture & Technology Stack

* **Frontend**: Next.js 16.3 (App Router), React 19, Recharts (`recharts`), FullCalendar (`@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`), iCalendar export, Tailwind UI styling.
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
| **M4** | **Timetable Integration & Academic Holds** | **Phase 4 Completed** |
| **M5** | **Approval Workflows & Authorization Queue** | **Phase 1 Completed** |
| **M6** | **Check-in & Automatic No-Show Release (QR / Celery Beat)** | **Phase 2 Completed** |
| **M7** | **Maintenance & Downtime Management (Blackout Windows, Overlap Cancellation)** | **Phase 3 Completed** |
| **M4/Recurrence** | **Recurring Bookings & iCalendar Export (.ics)** | **Phase 4 Completed** |
| **M8** | **Consumables & Equipment Stock Management (Non-negative DB CheckConstraint)** | **Phase 5 Completed** |
| **Notifications** | **In-App Notifications & Pre-Booking Celery Reminders** | **Phase 5 Completed** |
| **M9** | **Analytics & Reporting (Utilization %, Peak Hours, Attendance KPIs, CSV Exports)** | **Phase 6 Completed** |
| **Phase 7** | **Performance, CI/CD & Delivery (Locust 500-User Contention, GitHub Actions, Role Matrix)** | **Phase 7 Completed** |

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
- `POST /api/accounts/register/` — Register new user (always provisions student role; faculty/staff provisioned via admin).
- `POST /api/accounts/login/` — Authenticate user & issue auth token.
- `POST /api/accounts/logout/` — Invalidate user token.
- `GET /api/accounts/me/` — Retrieve active user profile & role.
- `PATCH /api/accounts/users/<id>/role/` — Update user role (Administrator only).

### Resource Catalogue (`/api/resources/`)
- `GET /api/resources/types/` — List resource categories.
- `POST /api/resources/types/` — Create resource category (Admin or Facility Manager only).
- `GET /api/resources/` — Search & multi-filter campus resources (`search`, `resource_type`, `location`, `min_capacity`, `status`).
- `POST /api/resources/` — Create campus resource (Admin or Facility Manager only; max booking duration default: 4 hours).
- `GET /api/resources/<id>/` — View resource details.
- `GET /api/resources/<id>/availability/` — Retrieve FullCalendar events for booked, blackout, and unavailable periods.

### Booking Engine, Approvals, Check-In & Recurring (`/api/bookings/`)
- `POST /api/bookings/` — Create new booking slot. Supports optional `recurrence: {frequency: "weekly", interval, count/until}` (max 52 occurrences) and `skip_conflicts: true|false`. Atomic series creation. Returns `201 Created` or `409 Conflict`.
- `GET /api/bookings/` — List bookings for authenticated user.
- `GET /api/bookings/<id>/` — View booking details (scoped by role/department/custodian).
- `POST /api/bookings/<id>/cancel/` — Cancel booking and release PostgreSQL exclusion range slot. Supports optional `{"cancel_series": true}` to cancel all future occurrences of a recurring series.
- `GET /api/bookings/manage/?status=pending` — Filter managed bookings in staff jurisdiction by status.
- `POST /api/bookings/<id>/approve/` — Approve pending booking (custodian, dept_head, facility_mgr, admin).
- `POST /api/bookings/<id>/reject/` — Reject pending booking with mandatory reason note and release exclusion slot.
- `GET /api/bookings/<id>/qr/` — Retrieve PNG binary QR code encoding the cryptographic check-in token (Owner only, approved bookings). Pass `?format=json` for JSON payload.
- `POST /api/bookings/check-in/` — Perform session check-in using UUID token (`{"token": "<uuid>"}`). Allowed for owner, resource custodian, facility manager, and administrator within configured check-in window (opens 15 min prior, closes at end of grace period).
- `GET /api/bookings/export.ics` — Export all authenticated user bookings as an iCalendar (`.ics`, RFC 5545) feed.
- `GET /api/bookings/<id>/export.ics` — Export a single booking as an iCalendar file (UID, UTC DTSTART/DTEND, summary, location).
- `POST /api/bookings/timetable/import/` (or `/api/timetable/import/`) — Administrator CSV import of recurring academic timetable allocations with row-level validation and clash detection.
- `GET /api/bookings/timetable/` — List active timetable course allocations.

### In-App Notifications (`/api/accounts/notifications/` or `/api/notifications/`)
- `GET /api/accounts/notifications/` — List notifications for authenticated user with `unread_count` (supports `?unread_only=true`).
- `POST /api/accounts/notifications/<id>/read/` — Mark a specific notification as read.
- `POST /api/accounts/notifications/mark-all-read/` — Mark all unread notifications as read.

### Consumables & Inventory (`/api/resources/consumables/` or `/api/consumables/`)
- `GET /api/resources/consumables/` — List consumables inventory with `is_low_stock` indicator (filters: `resource`, `low_stock`, `search`).
- `POST /api/resources/consumables/` — Create new consumable item (Custodian for assigned resource, Admin/Facility Manager for all).
- `GET /api/resources/consumables/<id>/` — View consumable details.
- `PATCH /api/resources/consumables/<id>/` — Update consumable name, unit, stock, reorder level.
- `POST /api/resources/consumables/<id>/adjust-stock/` — Atomically adjust (+/-) or set direct stock level (non-negative DB check constraint).
- `DELETE /api/resources/consumables/<id>/` — Remove consumable item.

### Analytics & Utilization Reporting (`/api/analytics/`)
- `GET /api/analytics/dashboard/` — Retrieve aggregated analytics metrics scoped by user role (`start_date`, `end_date`, `resource_id`). Computes resource utilization % against operating schedule, bookings by category, peak hours (08:00 - 21:00), peak weekdays (Monday - Sunday), cancellation & no-show performance rates, and top bookers. Scoped by role: `admin`/`facility_mgr` = all campus resources; `dept_head` = department resources; `custodian` = assigned resources; `student`/`faculty` = `403 Forbidden`.
- `GET /api/analytics/reports/bookings/export-csv/` — Download detailed bookings report CSV (Booking ID, Resource, Category, User, Start/End UTC, Duration Hours, Status, Approval info, Check-in info) scoped by role permissions.
- `GET /api/analytics/reports/usage/export-csv/` — Download resource usage and capacity summary CSV (Resource ID, Name, Code, Category, Department, Total Bookings, Booked Hours, Available Operating Hours, Utilization %).

### Maintenance & Downtime Windows (`/api/availability/blackouts/`)
- `GET /api/availability/blackouts/` — List blackout windows (scoped by role: custodians see assigned resources; admin/facility_mgr see all including campus-wide).
- `POST /api/availability/blackouts/` — Schedule downtime window (`kind: maintenance | downtime | holiday`). Detects conflicting bookings; supports `cancel_conflicting: true` to cancel overlapping active reservations and release slots atomically.
- `DELETE /api/availability/blackouts/<id>/` — Delete downtime window.

---

## 🌐 Frontend Routes & Component Architecture

- `/login` — Authentication page with one-click demo presets for all 6 roles.
- `/dashboard` — Role-aware dashboard shell displaying active role, system status, metrics, and module shells.
- `/approvals` — Dedicated pending approvals queue with approve/reject-with-note actions and status badges.
- `/check-in` — Custodian Check-in Desk with live QR scanner/token input and manual booking roster lookup.
- `/maintenance` — Downtime and maintenance schedule management with conflict detection and auto-cancellation.
- `/timetable` — Academic timetable CSV bulk import portal, row validation, conflict reporting, and schedule viewer.
- `/consumables` — Consumables and equipment stock management portal with low-stock alerts, add/edit/adjust modals, and filtering.
- `/resources` — Resource Catalogue page featuring live search, filter panel, and resource cards.
- `/resources/[id]` — Resource Details page with specs, features list, custodian contact card, and "View Availability" action.
- `/resources/[id]/availability` — Interactive FullCalendar scheduling screen with week/day views, time slot selection, timetable blocks, and `HTTP 409` conflict notifications.
- `/my-bookings` — My Bookings page with iCalendar export (.ics), QR access pass modal, recurring series indicators, status filters, series-aware cancellation action, and staff view.
- `/analytics` — Institutional Analytics & Utilization Reporting dashboard with Recharts visualizations (operating utilization bar chart, category donut chart, hourly peak demand, weekday intensity), date range filters, KPI cards, top bookers leaderboard, and CSV export.

---

## 🚀 Environment Setup & Background Workers

### 1. Redis Service (via Docker Compose)
```cmd
docker compose up -d redis
```

### 2. Celery Asynchronous Worker
- **Windows** (requires `-P solo` execution pool):
  ```cmd
  cd backend
  ..\.venv\Scripts\celery.exe -A config worker -l info -P solo
  ```
- **Linux / macOS**:
  ```bash
  cd backend
  celery -A config worker -l info
  ```

### 3. Celery Beat Scheduler (Periodic No-Show Release & Pre-Booking Reminders)
```cmd
cd backend
..\.venv\Scripts\celery.exe -A config beat -l info
```

### 4. Seed Demo Resources & Users
```cmd
cd backend
..\.venv\Scripts\python.exe manage.py seed_demo_users
..\.venv\Scripts\python.exe manage.py seed_resources
..\.venv\Scripts\python.exe manage.py seed_availability
```

### 5. Run Backend Server
```cmd
cd backend
..\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

### 6. Run Frontend Server
```cmd
cd frontend
npm run dev
```

---

## 🧪 Testing & Quality Assurance

### 1. Backend Full Test Suite
Execute the complete backend test suite (113 tests covering authentication, resource catalog, operating hours rules, PostgreSQL exclusion constraints, approval workflows, QR check-in, Celery no-show auto-release, recurring series, stock check constraints, analytics calculations, role security matrix, and threaded concurrency):
```cmd
cd backend
..\.venv\Scripts\python.exe manage.py test --noinput accounts resources bookings availability config
```

### 2. Frontend Unit Testing
Execute the frontend test runner covering booking form validation and HTTP 409 PostgreSQL GiST exclusion conflict message formatting:
```cmd
cd frontend
npm test
```

### 3. Frontend Code Quality & ESLint
```cmd
cd frontend
npm run lint
```

### 4. Next.js Production Build
Verify all 14 routes compile and optimize successfully:
```cmd
cd frontend
npm run build
```

---

## ⚡ High-Contention Load Testing (Locust)

The system includes a load testing suite (`locustfile.py`) designed to stress the booking engine under extreme concurrent demand and verify database invariant safety.

### Workflows Tested
1. **User Authentication**: Automated student login (`POST /api/accounts/login/`).
2. **Resource Catalogue Browsing**: Filtered catalogue querying (`GET /api/resources/`).
3. **Availability Calendar Checking**: High-frequency schedule queries (`GET /api/resources/<id>/availability/`).
4. **Contested Shared Slot Booking**: Hundreds of concurrent users simultaneously attempting to reserve the exact same resource time slot (`2027-02-01T10:00:00Z` to `2027-02-01T12:00:00Z` on Resource 1).

### Running Headless Load Test (500 Concurrent Users)
```cmd
locust -f locustfile.py --headless -u 500 -r 50 --run-time 30s --host http://127.0.0.1:8000 --csv docs/locust_500_run
```

### Invariant Verification Result
- **Benchmark Report**: Full latency percentiles, requests/sec, and error handling breakdown are documented in [docs/performance.md](file:///d:/Django%20Rpl/docs/performance.md).
- **PostgreSQL GiST Guarantee**: Under 500 concurrent users generating over 1,000 requests against a single slot, exactly **1** booking succeeds (`201 Created`). All concurrent overlapping attempts are cleanly rolled back by PostgreSQL `btree_gist` exclusion constraint violations (`409 Conflict`). Auditing the database confirms **0** double-bookings and exactly **1** active slot.

---

## 🔄 CI/CD Pipeline (GitHub Actions)

A comprehensive CI/CD workflow is located in `.github/workflows/ci.yml` running on every push to `master` and pull requests.

### Parallel Job Architecture:
1. **`backend-test`**:
   - Spawns PostgreSQL 16 (with `btree_gist`) and Redis 7 service containers.
   - Installs backend dependencies from `requirements.txt`.
   - Runs `python manage.py makemigrations --check` (enforces migration hygiene).
   - Runs `python manage.py migrate`.
   - Executes the full 113-test Django test suite across all 5 applications.
2. **`frontend-pipeline`**:
   - Provisions Node.js 20 environment.
   - Executes clean dependency installation via `npm ci`.
   - Enforces linting standards via `npm run lint`.
   - Runs frontend unit tests via `npm test`.
   - Compiles and verifies the production build via `npm run build`.

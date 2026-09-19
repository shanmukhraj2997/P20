# P20 — Unified Campus Resource, Laboratory & Facility Booking Platform

Centralized university platform for booking classrooms, laboratories, specialized equipment, seminar halls, sports facilities, meeting rooms, and campus vehicles.

---

## 🏗️ Architecture & Technology Stack

* **Frontend**: Next.js 14 (App Router), React, FullCalendar, iCalendar export, Vanilla CSS / Tailwind UI styling.
* **Backend**: Python 3.13, Django 5.1, Django REST Framework, CORS headers, Token Authentication.
* **Database**: PostgreSQL 18+ with `btree_gist` extension, PostgreSQL range types (`tstzrange`), and `EXCLUDE USING gist` constraints for database-enforced conflict prevention.
* **Background Processing**: Celery, Celery Beat, Redis (configured for upcoming background workflows).
* **Testing**: Django Testing Framework, DRF API Test Client.

---

## 👥 Application User Roles & Permissions

Backend enforces 6 distinct application roles across all endpoints:
1. **Student** (`student`) — Browse resource catalogue, view resource specs & availability.
2. **Faculty / Staff** (`faculty`) — Browse resource catalogue, view specs & lab schedules.
3. **Resource Custodian** (`custodian`) — Manage & update assigned campus resources & equipment.
4. **Department Head** (`dept_head`) — View department resources & usage overview.
5. **Facility Manager** (`facility_mgr`) — Manage global campus infrastructure & maintenance logs.
6. **Administrator** (`admin`) — Full system administration & complete resource control.

---

## 📦 Functional Modules Status

| Module | Description | Status |
| :--- | :--- | :--- |
| **M1** | **Resource Catalogue & Category Management** | **Sprint 2 Completed** |
| **M2** | **Availability & Rules Engine** | **Sprint 2 Prepared** |
| **M3** | **Conflict-Safe Booking Engine (PostgreSQL `btree_gist`)** | *Sprint 3 Pending* |
| **M4** | Timetable Integration | *Sprint 4 Pending* |
| **M5** | Approval Workflows | *Sprint 5 Pending* |
| **M6** | Check-in & Auto-Release | *Sprint 6 Pending* |
| **M7** | Maintenance & Downtime Management | *Sprint 7 Pending* |
| **M8** | Consumables & Accessories | *Sprint 8 Pending* |
| **M9** | Analytics & Reporting | *Sprint 9 Pending* |

---

## 🔌 API Endpoints (Sprint 2)

### Authentication (`/api/accounts/`)
- `POST /api/accounts/register/` — Register new user.
- `POST /api/accounts/login/` — Authenticate user & issue auth token.
- `POST /api/accounts/logout/` — Invalidate user token.
- `GET /api/accounts/me/` — Retrieve active user profile & role.
- `GET /api/accounts/roles/` — List all 6 application roles.

### Resource Catalogue (`/api/resources/`)
- `GET /api/resources/types/` — List all resource categories (Computer Lab, Classroom, Seminar Hall, etc.).
- `GET /api/resources/` — Search & multi-filter campus resources.
  - Query Parameters:
    - `search`: Case-insensitive search across name, location, and description.
    - `resource_type`: Filter by category ID or name.
    - `location`: Filter by building or room location.
    - `min_capacity` / `max_capacity`: Filter by seating capacity range.
    - `status`: Filter by operational status (`available`, `maintenance`, `reserved`, `decommissioned`).
- `GET /api/resources/<id>/` — View complete details for a single resource.
- `POST /api/resources/` — Create new resource (Assigned Custodian or Admin only).
- `PUT/PATCH /api/resources/<id>/` — Update resource details (Assigned Custodian or Admin only).
- `DELETE /api/resources/<id>/` — Delete resource (Assigned Custodian or Admin only).

### Health API
- `GET /api/health/` — Health status check (`{"status": "ok"}`).

---

## 🌐 Frontend Routes & Component Architecture

- `/login` — Authentication page with one-click demo presets for all 6 roles.
- `/dashboard` — Role-aware dashboard shell displaying active role, system status, metrics, and module shells.
- `/resources` — Interactive Resource Catalogue page featuring live search bar, category & capacity filter panel, and resource grid.
- `/resources/[id]` — Detailed view page showcasing image banner, specs, features checklist, custodian contact card, and "View Availability" action.

---

## 🚀 Environment Setup & Seed Data

### 1. Seed Realistic Campus Resources
Populate computer labs, AI clusters, seminar halls, executive conference rooms, sports arena, and confocal microscope units:
```cmd
cd backend
..\.venv\Scripts\python.exe manage.py seed_resources
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

Execute full Django backend test suite (20 tests):
```cmd
cd backend
..\.venv\Scripts\python.exe manage.py test resources accounts config
```

Verify Next.js production build:
```cmd
cd frontend
npm run build
```

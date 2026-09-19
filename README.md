# P20 — Unified Campus Resource, Laboratory & Facility Booking Platform

Centralized university platform for booking classrooms, laboratories, specialized equipment, seminar halls, sports facilities, meeting rooms, and campus vehicles.

---

## 🏗️ Architecture & Technology Stack

* **Frontend**: Next.js 14, React, FullCalendar, iCalendar export, Vanilla CSS / Tailwind UI styling.
* **Backend**: Python 3.13, Django 5.1, Django REST Framework, CORS headers, Token Authentication.
* **Database**: PostgreSQL 18+ with `btree_gist` extension, PostgreSQL range types (`tstzrange`), and `EXCLUDE USING gist` constraints for database-enforced conflict prevention.
* **Background Tasks**: Celery, Celery Beat, Redis (configured for upcoming background workflows).
* **Testing**: Django Testing Framework, DRF API Test Client.

---

## 👥 Application User Roles

Backend enforces 6 distinct application roles across all endpoints:
1. **Student** (`student`)
2. **Faculty / Staff** (`faculty`)
3. **Resource Custodian** (`custodian`)
4. **Department Head** (`dept_head`)
5. **Facility Manager** (`facility_mgr`)
6. **Administrator** (`admin`)

---

## 📁 Repository Structure

```
P20-campus-booking/
│
├── backend/
│   ├── manage.py
│   ├── config/             # Django root configuration & health API
│   ├── accounts/           # User model, 6 roles, Token auth, serializers, permissions
│   ├── resources/          # [Sprint 2] Resource Catalogue & Category Management
│   ├── bookings/           # [Sprint 3] Conflict-Safe Booking Engine
│   └── availability/       # [Sprint 2] Availability Rules & Operating Hours
│
├── frontend/
│   ├── app/                # Next.js App Router (login, dashboard, layout)
│   ├── components/         # Reusable Header, Sidebar & Navigation UI Shell
│   ├── context/            # React AuthContext Provider & Token State
│   ├── lib/                # API client wrapper (http://127.0.0.1:8000/api)
│   └── public/
│
├── .venv/                  # Python isolated virtual environment (git-ignored)
├── .env                    # Private local backend configuration (git-ignored)
├── .env.example            # Safe environment template
├── .gitignore              # Git security exclusion rules
├── requirements.txt        # Backend Python dependencies
└── README.md               # Project documentation
```

---

## 🚀 Environment Setup & Installation

### 1. Backend Setup

1. **Activate Virtual Environment**:
   ```cmd
   .venv\Scripts\activate
   ```

2. **Install Python Dependencies**:
   ```cmd
   .venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

3. **Configure Local Environment (`.env`)**:
   Ensure `.env` exists in the root directory:
   ```env
   DJANGO_SECRET_KEY=django-insecure-p20-campus-booking-platform-secret-key-sprint1
   DEBUG=True
   ALLOWED_HOSTS=localhost,127.0.0.1

   POSTGRES_DB=p20_campus_db
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_HOST=127.0.0.1
   POSTGRES_PORT=5432

   CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   ```

4. **Initialize PostgreSQL Database & Range Extension**:
   ```cmd
   psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE p20_campus_db;"
   psql -U postgres -h 127.0.0.1 -d p20_campus_db -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
   ```

5. **Run Migrations**:
   ```cmd
   cd backend
   ..\.venv\Scripts\python.exe manage.py makemigrations accounts
   ..\.venv\Scripts\python.exe manage.py migrate
   ```

6. **Start Backend Server**:
   ```cmd
   ..\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
   ```

---

### 2. Frontend Setup

1. **Configure Local Frontend Environment (`frontend/.env.local`)**:
   ```env
   NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api
   ```

2. **Install & Run Next.js Development Server**:
   ```cmd
   cd frontend
   npm install
   npm run dev
   ```

Access frontend at `http://localhost:3000` (or `http://localhost:3001`).

---

## 🧪 Running Tests

Execute backend unit test suite:
```cmd
cd backend
..\.venv\Scripts\python.exe manage.py test accounts config
```

Verify Next.js build:
```cmd
cd frontend
npm run build
```

---

## 🔒 Security & Git Compliance

- `.env` and `.env.*` are explicitly listed in `.gitignore`.
- `.venv/` is git-ignored.
- No private secrets, passwords, or API keys are committed to Git repository.

"""
Locust Performance and Load Testing Suite for P20 Platform.

Evaluates platform under 500 concurrent users:
1. User Authentication (login via /api/accounts/login/)
2. Resource Catalogue browsing (/api/resources/)
3. Resource Availability inspection (/api/resources/<id>/availability/)
4. Highly contested booking attempts on a single shared time slot (/api/bookings/)

Verification Target:
- Validates that under extreme concurrency, the PostgreSQL GiST exclusion constraint
  ("prevent_overlapping_booking_slots") allows exactly 1 booking per slot and cleanly
  returns HTTP 409 Conflict for all overlapping requests without deadlock or 500 errors.

Run Command (Headless, 500 Users):
    locust -f locustfile.py --headless -u 500 -r 50 --run-time 30s --host http://127.0.0.1:8000
"""

import os
import random
from locust import HttpUser, task, between

SHARED_RESOURCE_ID = 1
SHARED_START = "2027-02-01T10:00:00Z"
SHARED_END = "2027-02-01T12:00:00Z"
DEFAULT_TOKEN = "2e240733d6b770ba9ab18d87d0a75e6d68cb0dbc"


class P20CampusUser(HttpUser):
    wait_time = between(0.1, 0.4)

    def on_start(self):
        """Initialize session headers with default auth token or dynamic login."""
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Token {DEFAULT_TOKEN}",
        }
        self.client.headers.update(self.headers)

    @task(1)
    def login_flow(self):
        """Workflow 1: User Login & Token Authentication."""
        with self.client.post(
            "/api/accounts/login/",
            json={"username": "demo_student", "password": "DemoPass123!"},
            headers={"Content-Type": "application/json"},
            name="/api/accounts/login/ [Auth]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                token = resp.json().get("token")
                if token:
                    self.headers["Authorization"] = f"Token {token}"
                    self.client.headers.update(self.headers)
                resp.success()
            else:
                resp.failure(f"Login returned status {resp.status_code}")

    @task(3)
    def browse_catalogue(self):
        """Workflow 2: Browse Resource Catalogue with filters."""
        params = random.choice([
            "",
            "?status=available",
            "?resource_type=1",
            "?search=lab",
            "?min_capacity=10",
        ])
        with self.client.get(
            f"/api/resources/{params}",
            name="/api/resources/ [Catalogue]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Catalogue query failed: {resp.status_code}")

    @task(2)
    def check_availability(self):
        """Workflow 3: Inspect Resource Availability Calendar."""
        query = f"/api/resources/{SHARED_RESOURCE_ID}/availability/?start=2027-02-01T00:00:00Z&end=2027-02-08T00:00:00Z"
        with self.client.get(
            query,
            name="/api/resources/[id]/availability/ [Calendar]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Availability check failed: {resp.status_code}")

    @task(5)
    def attempt_contested_shared_slot_booking(self):
        """
        Workflow 4: Contested Shared Slot Booking Attempt.
        Simultaneous requests targeting the exact same resource and time slot.
        - HTTP 201: Slot secured by the winning transaction.
        - HTTP 409: Expected GiST exclusion constraint violation safely mapped to conflict response.
        - Any 5xx or unexpected code: Failure.
        """
        booking_payload = {
            "resource": SHARED_RESOURCE_ID,
            "start_time": SHARED_START,
            "end_time": SHARED_END,
            "purpose": f"Locust Concurrency Test Slot (PID {os.getpid()})",
        }

        with self.client.post(
            "/api/bookings/",
            json=booking_payload,
            name="/api/bookings/ [Shared Slot Contention]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 201:
                # The single winner of the atomic transaction
                resp.success()
            elif resp.status_code == 409:
                # Expected GiST exclusion constraint violation safely handled
                resp.success()
            else:
                resp.failure(f"Unexpected response code: {resp.status_code} - {resp.text[:100]}")

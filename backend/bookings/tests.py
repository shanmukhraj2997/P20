from datetime import datetime, time, timedelta
from django.db import IntegrityError, transaction
from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
from accounts.models import User
from resources.models import ResourceType, Resource
from availability.models import AvailabilityRule, Blackout
from bookings.models import Booking, BookingSlot, BookingSeries, TimetableEntry, BookingConsumable

class BookingEngineTests(TestCase):
    def setUp(self):
        self.client_user1 = APIClient()
        self.client_user2 = APIClient()

        self.res_type = ResourceType.objects.create(name="Computer Lab", icon="monitor")
        self.custodian = User.objects.create_user(username="custodian1", password="Password123!", role=User.ROLE_CUSTODIAN)

        self.resource = Resource.objects.create(
            name="Turing AI Lab",
            resource_type=self.res_type,
            description="Testing AI Lab",
            capacity=50,
            location="Turing 301",
            custodian=self.custodian,
            status=Resource.STATUS_AVAILABLE
        )

        self.user1 = User.objects.create_user(username="student1", password="Password123!", role=User.ROLE_STUDENT)
        self.token1 = Token.objects.create(user=self.user1)
        self.client_user1.credentials(HTTP_AUTHORIZATION='Token ' + self.token1.key)

        self.user2 = User.objects.create_user(username="student2", password="Password123!", role=User.ROLE_STUDENT)
        self.token2 = Token.objects.create(user=self.user2)
        self.client_user2.credentials(HTTP_AUTHORIZATION='Token ' + self.token2.key)

    def test_valid_booking_creation(self):
        url = reverse('booking-list-create')
        now = timezone.now()
        start_time = now + timedelta(days=1, hours=10)
        end_time = now + timedelta(days=1, hours=12)

        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Study session for Machine Learning exam"
        }

        response = self.client_user1.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(response.data["status"], "approved")

        # Verify database record
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.slots.count(), 1)
        self.assertTrue(booking.slots.first().is_active)

    def test_overlapping_booking_conflict_prevention(self):
        url = reverse('booking-list-create')
        now = timezone.now()

        # User 1 books 10:00 to 12:00 tomorrow
        start1 = now + timedelta(days=1, hours=10)
        end1 = now + timedelta(days=1, hours=12)
        payload1 = {
            "resource": self.resource.id,
            "start_time": start1.isoformat(),
            "end_time": end1.isoformat(),
            "purpose": "User 1 AI Project"
        }
        resp1 = self.client_user1.post(url, payload1, format='json')
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)

        # User 2 attempts overlapping booking 11:00 to 13:00 tomorrow
        start2 = now + timedelta(days=1, hours=11)
        end2 = now + timedelta(days=1, hours=13)
        payload2 = {
            "resource": self.resource.id,
            "start_time": start2.isoformat(),
            "end_time": end2.isoformat(),
            "purpose": "User 2 Overlapping Attempt"
        }

        resp2 = self.client_user2.post(url, payload2, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp2.data["error"], "booking_conflict")
        self.assertIn("no longer available", resp2.data["message"])

        # Assert only 1 active slot exists in database
        self.assertEqual(BookingSlot.objects.filter(resource=self.resource, is_active=True).count(), 1)

    def test_blackout_period_restriction(self):
        url = reverse('booking-list-create')
        now = timezone.now()

        # Create blackout period tomorrow 14:00 to 18:00
        blackout_start = now + timedelta(days=1, hours=14)
        blackout_end = now + timedelta(days=1, hours=18)
        Blackout.objects.create(
            resource=self.resource,
            start_datetime=blackout_start,
            end_datetime=blackout_end,
            reason="Hardware Upgrade"
        )

        # Attempt booking during blackout
        start_time = now + timedelta(days=1, hours=15)
        end_time = now + timedelta(days=1, hours=17)
        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Blackout conflict attempt"
        }

        response = self.client_user1.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)

    def test_availability_endpoint(self):
        now = timezone.now()
        start1 = now + timedelta(days=1, hours=10)
        end1 = now + timedelta(days=1, hours=12)

        # Create valid booking
        Booking.objects.create(requester=self.user1, resource=self.resource, purpose="Test")
        b = Booking.objects.first()
        from psycopg2.extras import DateTimeTZRange
        BookingSlot.objects.create(booking=b, resource=self.resource, period=DateTimeTZRange(start1, end1), is_active=True)

        url = reverse('resource-availability', kwargs={'pk': self.resource.pk})
        response = self.client_user1.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("events", response.data)
        self.assertGreaterEqual(len(response.data["events"]), 1)

    def test_cancellation_releases_range_slot(self):
        url_create = reverse('booking-list-create')
        now = timezone.now()
        start1 = now + timedelta(days=1, hours=10)
        end1 = now + timedelta(days=1, hours=12)

        # User 1 creates booking
        resp_create = self.client_user1.post(url_create, {
            "resource": self.resource.id,
            "start_time": start1.isoformat(),
            "end_time": end1.isoformat(),
            "purpose": "To be cancelled"
        }, format='json')
        booking_id = resp_create.data["id"]

        # Cancel booking
        url_cancel = reverse('booking-cancel', kwargs={'pk': booking_id})
        resp_cancel = self.client_user1.post(url_cancel)
        self.assertEqual(resp_cancel.status_code, status.HTTP_200_OK)

        # User 2 now books the exact same slot -> should succeed with 201 Created!
        resp_user2 = self.client_user2.post(url_create, {
            "resource": self.resource.id,
            "start_time": start1.isoformat(),
            "end_time": end1.isoformat(),
            "purpose": "User 2 after slot release"
        }, format='json')
        self.assertEqual(resp_user2.status_code, status.HTTP_201_CREATED)

    def test_qr_code_generation_and_valid_checkin(self):
        """Test valid QR generation and successful check-in within window."""
        now = timezone.now()
        # Active slot starts in 5 minutes (within 15-minute check-in window)
        start = now + timedelta(minutes=5)
        end = now + timedelta(hours=1)

        b = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="AI Project Work",
            status=Booking.STATUS_APPROVED
        )
        from psycopg2.extras import DateTimeTZRange
        BookingSlot.objects.create(booking=b, resource=self.resource, period=DateTimeTZRange(start, end), is_active=True)

        # 1. Fetch QR Code endpoint
        url_qr = reverse('booking-qr', kwargs={'pk': b.pk})
        resp_qr = self.client_user1.get(url_qr)
        self.assertEqual(resp_qr.status_code, status.HTTP_200_OK)
        self.assertIn("qr_svg", resp_qr.data)
        self.assertIn("qr_data_url", resp_qr.data)
        self.assertEqual(resp_qr.data["checkin_token"], str(b.checkin_token))
        self.assertTrue(resp_qr.data["can_check_in"])

        # 2. Check-In via booking ID endpoint
        url_checkin = reverse('booking-check-in', kwargs={'pk': b.pk})
        resp_checkin = self.client_user1.post(url_checkin, {"resource_id": self.resource.id}, format='json')
        self.assertEqual(resp_checkin.status_code, status.HTTP_200_OK)
        self.assertIn("Check-in successful", resp_checkin.data["message"])

        # Verify database update
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.STATUS_CHECKED_IN)
        self.assertIsNotNone(b.checked_in_at)
        self.assertEqual(b.checked_in_by, self.user1)

    def test_invalid_qr_token_checkin(self):
        """Test scanning an invalid or non-existent QR token."""
        url = reverse('booking-token-check-in')
        fake_token = "00000000-0000-0000-0000-000000000000"
        resp = self.client_user1.post(url, {"token": fake_token}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.data["error"], "invalid_qr")

    def test_duplicate_checkin_prevention(self):
        """Test that already checked-in bookings cannot be checked in a second time."""
        now = timezone.now()
        start = now - timedelta(minutes=5)
        end = now + timedelta(hours=1)

        b = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="Duplicate Checkin Test",
            status=Booking.STATUS_CHECKED_IN,
            checked_in_at=now - timedelta(minutes=4)
        )
        from psycopg2.extras import DateTimeTZRange
        BookingSlot.objects.create(booking=b, resource=self.resource, period=DateTimeTZRange(start, end), is_active=True)

        url = reverse('booking-check-in', kwargs={'pk': b.pk})
        resp = self.client_user1.post(url, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["error"], "already_checked_in")

    def test_expired_booking_checkin_rejection(self):
        """Test check-in rejection for reservations that have already ended."""
        now = timezone.now()
        # Slot ended 1 hour ago
        start = now - timedelta(hours=2)
        end = now - timedelta(hours=1)

        b = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="Expired Slot Test",
            status=Booking.STATUS_APPROVED
        )
        from psycopg2.extras import DateTimeTZRange
        BookingSlot.objects.create(booking=b, resource=self.resource, period=DateTimeTZRange(start, end), is_active=True)

        url = reverse('booking-check-in', kwargs={'pk': b.pk})
        resp = self.client_user1.post(url, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["error"], "checkin_expired")

    def test_wrong_resource_mismatch_checkin(self):
        """Test check-in rejection when scanned resource does not match booking."""
        now = timezone.now()
        start = now + timedelta(minutes=5)
        end = now + timedelta(hours=1)

        other_resource = Resource.objects.create(
            name="Chemistry Lab 2",
            resource_type=self.res_type,
            capacity=40,
            location="Block B 202",
            custodian=self.custodian,
            status=Resource.STATUS_AVAILABLE
        )

        b = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="Resource Mismatch Test",
            status=Booking.STATUS_APPROVED
        )
        from psycopg2.extras import DateTimeTZRange
        BookingSlot.objects.create(booking=b, resource=self.resource, period=DateTimeTZRange(start, end), is_active=True)

        url = reverse('booking-check-in', kwargs={'pk': b.pk})
        # Student scans Chemistry Lab 2, but booking is for Turing AI Lab
        resp = self.client_user1.post(url, {"resource_id": other_resource.id}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["error"], "resource_mismatch")

    def test_unauthorized_user_checkin_rejection(self):
        """Test that another student cannot check in someone else's booking."""
        now = timezone.now()
        start = now + timedelta(minutes=5)
        end = now + timedelta(hours=1)

        b = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="Unauthorized Test",
            status=Booking.STATUS_APPROVED
        )
        from psycopg2.extras import DateTimeTZRange
        BookingSlot.objects.create(booking=b, resource=self.resource, period=DateTimeTZRange(start, end), is_active=True)

        url = reverse('booking-check-in', kwargs={'pk': b.pk})
        # user2 attempts to check in user1's booking
        resp = self.client_user2.post(url, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data["error"], "unauthorized_checkin")

    def test_no_show_automation_foundation(self):
        """Test that the no-show logic flags unattended bookings and releases slots."""
        from bookings.tasks import check_no_shows
        from psycopg2.extras import DateTimeTZRange

        now = timezone.now()
        # Started 30 minutes ago, never checked in
        start = now - timedelta(minutes=30)
        end = now + timedelta(minutes=30)

        b = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="No Show Test",
            status=Booking.STATUS_APPROVED
        )
        slot = BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(start, end),
            is_active=True
        )

        released = check_no_shows(grace_minutes=15)
        self.assertEqual(released, 1)

        b.refresh_from_db()
        slot.refresh_from_db()
        self.assertEqual(b.status, Booking.STATUS_NO_SHOW)
        self.assertIsNotNone(b.no_show_at)
        self.assertFalse(slot.is_active)

    def test_json_scanner_payload_checkin(self):
        """Test that hardware/mobile scanner JSON payload is automatically parsed and verified."""
        import json
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        start = now + timedelta(minutes=5)
        end = now + timedelta(hours=1)

        b = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="JSON Scanner Test",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(booking=b, resource=self.resource, period=DateTimeTZRange(start, end), is_active=True)

        url = reverse('booking-token-check-in')
        payload = json.dumps({
            "booking_id": b.id,
            "token": str(b.checkin_token),
            "resource_id": self.resource.id
        })
        resp = self.client_user1.post(url, {"token": payload}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.STATUS_CHECKED_IN)

    def test_cancel_noshow_and_checkedin_rejected(self):
        """Test that cancelling checked-in or no-show bookings is disallowed."""
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()

        b1 = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="Checked In Cancel Test",
            status=Booking.STATUS_CHECKED_IN
        )
        BookingSlot.objects.create(booking=b1, resource=self.resource, period=DateTimeTZRange(now, now + timedelta(hours=1)), is_active=True)

        url_cancel_1 = reverse('booking-cancel', kwargs={'pk': b1.pk})
        resp1 = self.client_user1.post(url_cancel_1)
        self.assertEqual(resp1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp1.data["error"], "cannot_cancel")

        b2 = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="No Show Cancel Test",
            status=Booking.STATUS_NO_SHOW
        )
        url_cancel_2 = reverse('booking-cancel', kwargs={'pk': b2.pk})
        resp2 = self.client_user1.post(url_cancel_2)
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp2.data["error"], "cannot_cancel")

    def test_dept_head_authorized_checkin(self):
        """Test that Department Head can check in bookings within their department."""
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        start = now + timedelta(minutes=5)
        end = now + timedelta(hours=1)

        self.custodian.department = "Computer Science"
        self.custodian.save()

        dept_head = User.objects.create_user(
            username="depthead_cs",
            password="Password123!",
            role=User.ROLE_DEPT_HEAD,
            department="Computer Science"
        )
        token_dh = Token.objects.create(user=dept_head)
        client_dh = APIClient()
        client_dh.credentials(HTTP_AUTHORIZATION='Token ' + token_dh.key)

        b = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="Dept Head Checkin Test",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(booking=b, resource=self.resource, period=DateTimeTZRange(start, end), is_active=True)

        url_qr = reverse('booking-qr', kwargs={'pk': b.pk})
        resp_qr = client_dh.get(url_qr)
        self.assertEqual(resp_qr.status_code, status.HTTP_200_OK)

        url_checkin = reverse('booking-check-in', kwargs={'pk': b.pk})
        resp_ci = client_dh.post(url_checkin, format='json')
        self.assertEqual(resp_ci.status_code, status.HTTP_200_OK)
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.STATUS_CHECKED_IN)

    def test_anonymous_booking_creation_rejected(self):
        url = reverse('booking-list-create')
        anon_client = APIClient()
        now = timezone.now()
        payload = {
            "resource": self.resource.id,
            "start_time": (now + timedelta(days=2, hours=10)).isoformat(),
            "end_time": (now + timedelta(days=2, hours=12)).isoformat(),
            "purpose": "Anonymous attempt"
        }
        resp = anon_client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_max_booking_duration_enforcement(self):
        url = reverse('booking-list-create')
        now = timezone.now()
        # Set resource max duration to 3 hours
        self.resource.max_duration_hours = 3
        self.resource.save()

        # Student attempts 5 hour booking (exceeds 3 hr limit) -> Rejected
        start_time = now + timedelta(days=2, hours=10)
        end_time = now + timedelta(days=2, hours=15)
        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Long session"
        }
        resp_student = self.client_user1.post(url, payload, format='json')
        self.assertEqual(resp_student.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_time", resp_student.data)
        self.assertIn("exceeds the maximum allowed limit", str(resp_student.data["end_time"]))

        # Staff/custodian attempts 5 hour booking -> Allowed by override
        client_staff = APIClient()
        token_cust = Token.objects.create(user=self.custodian)
        client_staff.credentials(HTTP_AUTHORIZATION='Token ' + token_cust.key)
        resp_staff = client_staff.post(url, payload, format='json')
        self.assertEqual(resp_staff.status_code, status.HTTP_201_CREATED)

    def test_operating_hours_rejection_and_success(self):
        url = reverse('booking-list-create')
        now = timezone.now()
        target_day = (now + timedelta(days=3))
        day_of_week = target_day.weekday()

        # Define operating hours rule: 08:00 to 18:00 for target day
        AvailabilityRule.objects.create(
            resource=self.resource,
            day_of_week=day_of_week,
            start_time=time(8, 0),
            end_time=time(18, 0),
            active=True
        )

        # 1. Booking before opening (06:00 to 07:30) -> Rejected
        early_start = target_day.replace(hour=6, minute=0, second=0, microsecond=0)
        early_end = target_day.replace(hour=7, minute=30, second=0, microsecond=0)
        payload_early = {
            "resource": self.resource.id,
            "start_time": early_start.isoformat(),
            "end_time": early_end.isoformat(),
            "purpose": "Early morning workout"
        }
        resp_early = self.client_user1.post(url, payload_early, format='json')
        self.assertEqual(resp_early.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("operating hours", str(resp_early.data))

        # 2. Booking after closing (18:30 to 20:00) -> Rejected
        late_start = target_day.replace(hour=18, minute=30, second=0, microsecond=0)
        late_end = target_day.replace(hour=20, minute=0, second=0, microsecond=0)
        payload_late = {
            "resource": self.resource.id,
            "start_time": late_start.isoformat(),
            "end_time": late_end.isoformat(),
            "purpose": "Late night coding"
        }
        resp_late = self.client_user1.post(url, payload_late, format='json')
        self.assertEqual(resp_late.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("operating hours", str(resp_late.data))

        # 3. Booking strictly within operating hours (10:00 to 12:00) -> Accepted
        valid_start = target_day.replace(hour=10, minute=0, second=0, microsecond=0)
        valid_end = target_day.replace(hour=12, minute=0, second=0, microsecond=0)
        payload_valid = {
            "resource": self.resource.id,
            "start_time": valid_start.isoformat(),
            "end_time": valid_end.isoformat(),
            "purpose": "Valid hours lab session"
        }
        resp_valid = self.client_user1.post(url, payload_valid, format='json')
        self.assertEqual(resp_valid.status_code, status.HTTP_201_CREATED)

    def test_booking_detail_role_scope_permissions(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        start = now + timedelta(days=4, hours=10)
        end = now + timedelta(days=4, hours=12)

        # Set custodian department
        self.custodian.department = "Physics & Computing"
        self.custodian.save()

        # User 1 creates a booking on self.resource
        b = Booking.objects.create(
            requester=self.user1,
            resource=self.resource,
            purpose="Scope check booking",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(booking=b, resource=self.resource, period=DateTimeTZRange(start, end), is_active=True)

        url = reverse('booking-detail', kwargs={'pk': b.pk})

        # 1. Owner (User 1) can view
        resp_owner = self.client_user1.get(url)
        self.assertEqual(resp_owner.status_code, status.HTTP_200_OK)

        # 2. Other student (User 2) cannot view
        resp_other = self.client_user2.get(url)
        self.assertEqual(resp_other.status_code, status.HTTP_404_NOT_FOUND)

        # 3. Resource Custodian can view
        client_cust = APIClient()
        token_cust = Token.objects.get_or_create(user=self.custodian)[0]
        client_cust.credentials(HTTP_AUTHORIZATION='Token ' + token_cust.key)
        resp_cust = client_cust.get(url)
        self.assertEqual(resp_cust.status_code, status.HTTP_200_OK)

        # 4. Custodian of another resource cannot view
        other_cust = User.objects.create_user(username="other_custodian", password="Password123!", role=User.ROLE_CUSTODIAN)
        client_other_cust = APIClient()
        token_other_cust = Token.objects.create(user=other_cust)
        client_other_cust.credentials(HTTP_AUTHORIZATION='Token ' + token_other_cust.key)
        resp_other_cust = client_other_cust.get(url)
        self.assertEqual(resp_other_cust.status_code, status.HTTP_404_NOT_FOUND)

        # 5. Department Head of custodian's department can view
        dh_match = User.objects.create_user(username="dh_physics", password="Password123!", role=User.ROLE_DEPT_HEAD, department="Physics & Computing")
        client_dh = APIClient()
        token_dh = Token.objects.create(user=dh_match)
        client_dh.credentials(HTTP_AUTHORIZATION='Token ' + token_dh.key)
        resp_dh = client_dh.get(url)
        self.assertEqual(resp_dh.status_code, status.HTTP_200_OK)

        # 6. Department Head of different department cannot view
        dh_diff = User.objects.create_user(username="dh_chemistry", password="Password123!", role=User.ROLE_DEPT_HEAD, department="Chemistry")
        client_dh_diff = APIClient()
        token_dh_diff = Token.objects.create(user=dh_diff)
        client_dh_diff.credentials(HTTP_AUTHORIZATION='Token ' + token_dh_diff.key)
        resp_dh_diff = client_dh_diff.get(url)
        self.assertEqual(resp_dh_diff.status_code, status.HTTP_404_NOT_FOUND)

        # 7. Administrator can view
        admin_user = User.objects.create_user(username="admin_viewer", password="Password123!", role=User.ROLE_ADMIN)
        client_admin = APIClient()
        token_admin = Token.objects.create(user=admin_user)
        client_admin.credentials(HTTP_AUTHORIZATION='Token ' + token_admin.key)
        resp_admin = client_admin.get(url)
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)


class BookingConcurrencyThreadedTest(TransactionTestCase):
    """
    Multi-threaded PostgreSQL exclusion constraint concurrency test:
    20 simultaneous identical booking attempts must yield exactly ONE 201 Created
    and NINETEEN 409 Conflicts.
    """
    def setUp(self):
        self.res_type = ResourceType.objects.create(name="Concurrency Testing Lab", icon="cpu")
        self.custodian = User.objects.create_user(username="conc_custodian", password="Password123!", role=User.ROLE_CUSTODIAN)
        self.resource = Resource.objects.create(
            name="High-Concurrency Cluster",
            resource_type=self.res_type,
            description="Testing concurrent database exclusion locks",
            capacity=100,
            location="Server Farm Rack 9",
            custodian=self.custodian,
            status=Resource.STATUS_AVAILABLE,
            max_duration_hours=4
        )

        self.users = []
        self.tokens = []
        for i in range(20):
            user = User.objects.create_user(
                username=f"conc_user_{i}",
                password="Password123!",
                role=User.ROLE_STUDENT
            )
            token = Token.objects.create(user=user)
            self.users.append(user)
            self.tokens.append(token)

    def test_threaded_concurrency_20_simultaneous_bookings(self):
        import threading
        from django.db import connection

        url = reverse('booking-list-create')
        now = timezone.now()
        start_time = now + timedelta(days=5, hours=10)
        end_time = now + timedelta(days=5, hours=12)

        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Concurrent race condition test"
        }

        results = []
        barrier = threading.Barrier(20)

        def attempt_booking(token_key):
            # Close existing connection to ensure each thread gets its own PostgreSQL connection
            connection.close()
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION='Token ' + token_key)
            try:
                barrier.wait(timeout=10)
                resp = client.post(url, payload, format='json')
                results.append(resp.status_code)
            except Exception as e:
                results.append(type(e).__name__)
            finally:
                connection.close()

        threads = [
            threading.Thread(target=attempt_booking, args=(self.tokens[i].key,))
            for i in range(20)
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Strict assertion: Exactly one 201 Created and exactly nineteen 409 Conflicts
        created_count = results.count(status.HTTP_201_CREATED)
        conflict_count = results.count(status.HTTP_409_CONFLICT)

        self.assertEqual(len(results), 20, f"Expected 20 results, got: {results}")
        self.assertEqual(created_count, 1, f"Expected exactly 1 success (201), got {created_count}. Results: {results}")
        self.assertEqual(conflict_count, 19, f"Expected exactly 19 conflicts (409), got {conflict_count}. Results: {results}")

        # Assert exactly one active booking slot exists in database
        active_slots = BookingSlot.objects.filter(resource=self.resource, is_active=True).count()
        self.assertEqual(active_slots, 1)


class BookingApprovalWorkflowTests(TestCase):
    def setUp(self):
        self.res_type = ResourceType.objects.create(name="Optics & Laser Lab", icon="laser")
        self.custodian = User.objects.create_user(
            username="cust_laser",
            password="Password123!",
            role=User.ROLE_CUSTODIAN,
            department="Physics Department"
        )
        self.resource = Resource.objects.create(
            name="Femtosecond Laser Facility",
            resource_type=self.res_type,
            description="High precision optical research lab",
            capacity=10,
            location="Nobel Block B-12",
            custodian=self.custodian,
            department="Physics Department",
            status=Resource.STATUS_AVAILABLE,
            requires_approval=True,
            max_duration_hours=4
        )

        self.student = User.objects.create_user(username="student_optics", password="Password123!", role=User.ROLE_STUDENT)
        self.token_student = Token.objects.create(user=self.student)
        self.client_student = APIClient()
        self.client_student.credentials(HTTP_AUTHORIZATION='Token ' + self.token_student.key)

        self.token_custodian = Token.objects.create(user=self.custodian)
        self.client_custodian = APIClient()
        self.client_custodian.credentials(HTTP_AUTHORIZATION='Token ' + self.token_custodian.key)

        self.admin = User.objects.create_user(username="admin_approver", password="Password123!", role=User.ROLE_ADMIN)
        self.token_admin = Token.objects.create(user=self.admin)
        self.client_admin = APIClient()
        self.client_admin.credentials(HTTP_AUTHORIZATION='Token ' + self.token_admin.key)

        self.fac_mgr = User.objects.create_user(username="facmgr_approver", password="Password123!", role=User.ROLE_FACILITY_MGR)
        self.token_fac_mgr = Token.objects.create(user=self.fac_mgr)
        self.client_fac_mgr = APIClient()
        self.client_fac_mgr.credentials(HTTP_AUTHORIZATION='Token ' + self.token_fac_mgr.key)

        self.dept_head_physics = User.objects.create_user(
            username="depthead_physics",
            password="Password123!",
            role=User.ROLE_DEPT_HEAD,
            department="Physics Department"
        )
        self.token_dept_head_physics = Token.objects.create(user=self.dept_head_physics)
        self.client_dept_head_physics = APIClient()
        self.client_dept_head_physics.credentials(HTTP_AUTHORIZATION='Token ' + self.token_dept_head_physics.key)

        self.dept_head_chemistry = User.objects.create_user(
            username="depthead_chem",
            password="Password123!",
            role=User.ROLE_DEPT_HEAD,
            department="Chemistry Department"
        )
        self.token_dept_head_chemistry = Token.objects.create(user=self.dept_head_chemistry)
        self.client_dept_head_chemistry = APIClient()
        self.client_dept_head_chemistry.credentials(HTTP_AUTHORIZATION='Token ' + self.token_dept_head_chemistry.key)

        self.other_custodian = User.objects.create_user(
            username="cust_other",
            password="Password123!",
            role=User.ROLE_CUSTODIAN,
            department="Chemistry Department"
        )
        self.token_other_cust = Token.objects.create(user=self.other_custodian)
        self.client_other_cust = APIClient()
        self.client_other_cust.credentials(HTTP_AUTHORIZATION='Token ' + self.token_other_cust.key)

    def test_resource_requires_approval_creates_pending_and_holds_slot(self):
        url = reverse('booking-list-create')
        now = timezone.now()
        start = now + timedelta(days=2, hours=10)
        end = now + timedelta(days=2, hours=12)

        # 1. Booking creation on requires_approval=True starts as pending
        payload = {
            "resource": self.resource.id,
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "purpose": "Laser spectroscopy research"
        }
        resp = self.client_student.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "pending")

        booking = Booking.objects.get(pk=resp.data["id"])
        self.assertEqual(booking.status, Booking.STATUS_PENDING)
        self.assertEqual(booking.slots.count(), 1)
        self.assertTrue(booking.slots.first().is_active)

        # 2. Another user attempting to book the overlapping slot is blocked by PostgreSQL exclusion constraint (409)
        student2 = User.objects.create_user(username="student2_optics", password="Password123!", role=User.ROLE_STUDENT)
        token2 = Token.objects.create(user=student2)
        client2 = APIClient()
        client2.credentials(HTTP_AUTHORIZATION='Token ' + token2.key)

        overlap_payload = {
            "resource": self.resource.id,
            "start_time": (start + timedelta(minutes=30)).isoformat(),
            "end_time": (end + timedelta(minutes=30)).isoformat(),
            "purpose": "Double booking attempt"
        }
        resp2 = client2.post(url, overlap_payload, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp2.data["error"], "booking_conflict")

    def test_resource_without_approval_creates_approved(self):
        self.resource.requires_approval = False
        self.resource.save()

        url = reverse('booking-list-create')
        now = timezone.now()
        payload = {
            "resource": self.resource.id,
            "start_time": (now + timedelta(days=3, hours=10)).isoformat(),
            "end_time": (now + timedelta(days=3, hours=12)).isoformat(),
            "purpose": "Auto approved booking"
        }
        resp = self.client_student.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["status"], "approved")

    def test_approve_endpoint_permissions_and_audit(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        b = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Pending review test",
            status=Booking.STATUS_PENDING
        )
        BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(now + timedelta(days=2, hours=10), now + timedelta(days=2, hours=12)),
            is_active=True
        )
        url_approve = reverse('booking-approve', kwargs={'pk': b.pk})

        # 1. Requester cannot approve (403)
        resp_req = self.client_student.post(url_approve, {"decision_note": "Self approve"}, format='json')
        self.assertEqual(resp_req.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Custodian of different resource cannot approve (403)
        resp_other_cust = self.client_other_cust.post(url_approve, format='json')
        self.assertEqual(resp_other_cust.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Dept Head of different department cannot approve (403)
        resp_other_dh = self.client_dept_head_chemistry.post(url_approve, format='json')
        self.assertEqual(resp_other_dh.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Dept Head of matching department CAN approve (200)
        resp_dh = self.client_dept_head_physics.post(url_approve, {"decision_note": "Approved by Physics HOD"}, format='json')
        self.assertEqual(resp_dh.status_code, status.HTTP_200_OK)
        b.refresh_from_db()
        self.assertEqual(b.status, Booking.STATUS_APPROVED)
        self.assertEqual(b.reviewed_by, self.dept_head_physics)
        self.assertIsNotNone(b.reviewed_at)
        self.assertEqual(b.decision_note, "Approved by Physics HOD")

    def test_double_approval_rejected(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        b = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Double approve check",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(now + timedelta(days=2, hours=10), now + timedelta(days=2, hours=12)),
            is_active=True
        )
        url_approve = reverse('booking-approve', kwargs={'pk': b.pk})
        resp = self.client_admin.post(url_approve, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["error"], "invalid_status")

    def test_reject_endpoint_requires_note(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        b = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Reject note check",
            status=Booking.STATUS_PENDING
        )
        BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(now + timedelta(days=2, hours=10), now + timedelta(days=2, hours=12)),
            is_active=True
        )
        url_reject = reverse('booking-reject', kwargs={'pk': b.pk})

        # Reject without note returns 400
        resp_no_note = self.client_custodian.post(url_reject, {}, format='json')
        self.assertEqual(resp_no_note.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp_no_note.data["error"], "note_required")

        # Reject with empty whitespace string returns 400
        resp_blank = self.client_custodian.post(url_reject, {"decision_note": "   "}, format='json')
        self.assertEqual(resp_blank.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp_blank.data["error"], "note_required")

    def test_rejection_releases_slot_and_allows_rebooking(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        start = now + timedelta(days=4, hours=10)
        end = now + timedelta(days=4, hours=12)

        b = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Slot release check",
            status=Booking.STATUS_PENDING
        )
        slot = BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(start, end),
            is_active=True
        )

        url_reject = reverse('booking-reject', kwargs={'pk': b.pk})
        resp_reject = self.client_custodian.post(
            url_reject,
            {"decision_note": "Laser maintenance scheduled on this day"},
            format='json'
        )
        self.assertEqual(resp_reject.status_code, status.HTTP_200_OK)
        b.refresh_from_db()
        slot.refresh_from_db()

        self.assertEqual(b.status, Booking.STATUS_REJECTED)
        self.assertFalse(slot.is_active)
        self.assertEqual(b.reviewed_by, self.custodian)
        self.assertEqual(b.decision_note, "Laser maintenance scheduled on this day")

        # Now student 2 can book the exact same slot without conflict
        student2 = User.objects.create_user(username="student2_rebook", password="Password123!", role=User.ROLE_STUDENT)
        token2 = Token.objects.create(user=student2)
        client2 = APIClient()
        client2.credentials(HTTP_AUTHORIZATION='Token ' + token2.key)

        url_create = reverse('booking-list-create')
        rebook_payload = {
            "resource": self.resource.id,
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "purpose": "Rebooking released slot"
        }
        resp_rebook = client2.post(url_create, rebook_payload, format='json')
        self.assertEqual(resp_rebook.status_code, status.HTTP_201_CREATED)

    def test_manage_pending_status_filter(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()

        # Create 1 pending and 1 approved booking
        b_pending = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Pending filter check",
            status=Booking.STATUS_PENDING
        )
        BookingSlot.objects.create(
            booking=b_pending,
            resource=self.resource,
            period=DateTimeTZRange(now + timedelta(days=6, hours=10), now + timedelta(days=6, hours=12)),
            is_active=True
        )

        b_approved = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Approved filter check",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_approved,
            resource=self.resource,
            period=DateTimeTZRange(now + timedelta(days=7, hours=10), now + timedelta(days=7, hours=12)),
            is_active=True
        )

        url_manage = reverse('booking-manage-list') + '?status=pending'
        resp = self.client_custodian.get(url_manage)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        statuses = [item["status"] for item in resp.data]
        self.assertTrue(all(st == "pending" for st in statuses))
        self.assertIn(b_pending.id, [item["id"] for item in resp.data])
        self.assertNotIn(b_approved.id, [item["id"] for item in resp.data])


class Phase2QRCheckInAndNoShowTests(TestCase):
    def setUp(self):
        from psycopg2.extras import DateTimeTZRange
        self.client = APIClient()
        self.res_type = ResourceType.objects.create(name="Conference Hall", icon="users")

        self.custodian = User.objects.create_user(username="custodian_p2", password="Password123!", role=User.ROLE_CUSTODIAN)
        self.other_custodian = User.objects.create_user(username="other_custodian_p2", password="Password123!", role=User.ROLE_CUSTODIAN)
        self.facility_mgr = User.objects.create_user(username="fm_p2", password="Password123!", role=User.ROLE_FACILITY_MGR)
        self.admin = User.objects.create_user(username="admin_p2", password="Password123!", role=User.ROLE_ADMIN)
        self.owner = User.objects.create_user(username="owner_student_p2", password="Password123!", role=User.ROLE_STUDENT)
        self.other_student = User.objects.create_user(username="other_student_p2", password="Password123!", role=User.ROLE_STUDENT)

        for u in [self.custodian, self.other_custodian, self.facility_mgr, self.admin, self.owner, self.other_student]:
            Token.objects.create(user=u)

        self.resource = Resource.objects.create(
            name="Auditorium Magna",
            resource_type=self.res_type,
            capacity=150,
            location="Block 38",
            custodian=self.custodian,
            status=Resource.STATUS_AVAILABLE
        )

        now = timezone.now()
        self.booking_current = Booking.objects.create(
            requester=self.owner,
            resource=self.resource,
            purpose="Phase 2 Live Verification Check",
            status=Booking.STATUS_APPROVED
        )
        self.slot_current = BookingSlot.objects.create(
            booking=self.booking_current,
            resource=self.resource,
            period=DateTimeTZRange(now - timedelta(minutes=5), now + timedelta(minutes=55)),
            is_active=True
        )

    def create_resource(self, name="Unique Room"):
        return Resource.objects.create(
            name=name,
            resource_type=self.res_type,
            capacity=50,
            location="Block 38",
            custodian=self.custodian,
            status=Resource.STATUS_AVAILABLE
        )

    def auth(self, user):
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + user.auth_token.key)

    def test_qr_endpoint_owner_success_returns_png(self):
        self.auth(self.owner)
        url = reverse('booking-qr', kwargs={'pk': self.booking_current.pk})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'image/png')
        self.assertTrue(resp.content.startswith(b'\x89PNG\r\n\x1a\n'))

    def test_qr_endpoint_json_format_support(self):
        self.auth(self.owner)
        url = reverse('booking-qr', kwargs={'pk': self.booking_current.pk}) + '?format=json'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["token"], str(self.booking_current.checkin_token))
        self.assertTrue(resp.data["qr_png_base64"].startswith("data:image/png;base64,"))

    def test_qr_endpoint_unauthorized_student_forbidden(self):
        url = reverse('booking-qr', kwargs={'pk': self.booking_current.pk})
        self.auth(self.other_student)
        resp_student = self.client.get(url)
        self.assertEqual(resp_student.status_code, status.HTTP_403_FORBIDDEN)

    def test_qr_endpoint_non_approved_booking_rejected(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        res_pending = self.create_resource("Pending Resource")
        b_pending = Booking.objects.create(
            requester=self.owner,
            resource=res_pending,
            purpose="Pending QR Check",
            status=Booking.STATUS_PENDING
        )
        BookingSlot.objects.create(
            booking=b_pending,
            resource=res_pending,
            period=DateTimeTZRange(now + timedelta(days=1), now + timedelta(days=1, hours=2)),
            is_active=True
        )

        self.auth(self.owner)
        url_pending = reverse('booking-qr', kwargs={'pk': b_pending.pk})
        resp = self.client.get(url_pending)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_checkin_permissions_allowed_roles(self):
        url = reverse('booking-token-check-in')
        payload = {"token": str(self.booking_current.checkin_token)}

        self.auth(self.owner)
        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.booking_current.refresh_from_db()
        self.assertEqual(self.booking_current.status, Booking.STATUS_CHECKED_IN)
        self.assertEqual(self.booking_current.checked_in_by, self.owner)
        self.assertIsNotNone(self.booking_current.checked_in_at)

    def test_checkin_by_custodian_facility_mgr_and_admin(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        url = reverse('booking-token-check-in')

        # Test Custodian of that resource
        res_cust = self.create_resource("Custodian Test Room")
        b_cust = Booking.objects.create(
            requester=self.owner,
            resource=res_cust,
            purpose="Custodian Check-in Test",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_cust,
            resource=res_cust,
            period=DateTimeTZRange(now - timedelta(minutes=2), now + timedelta(minutes=58)),
            is_active=True
        )
        self.auth(self.custodian)
        resp_cust = self.client.post(url, {"token": str(b_cust.checkin_token)}, format='json')
        self.assertEqual(resp_cust.status_code, status.HTTP_200_OK)
        b_cust.refresh_from_db()
        self.assertEqual(b_cust.status, Booking.STATUS_CHECKED_IN)
        self.assertEqual(b_cust.checked_in_by, self.custodian)

        # Test Facility Manager
        res_fm = self.create_resource("FM Test Room")
        b_fm = Booking.objects.create(
            requester=self.owner,
            resource=res_fm,
            purpose="FM Check-in Test",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_fm,
            resource=res_fm,
            period=DateTimeTZRange(now - timedelta(minutes=2), now + timedelta(minutes=58)),
            is_active=True
        )
        self.auth(self.facility_mgr)
        resp_fm = self.client.post(url, {"token": str(b_fm.checkin_token)}, format='json')
        self.assertEqual(resp_fm.status_code, status.HTTP_200_OK)
        b_fm.refresh_from_db()
        self.assertEqual(b_fm.status, Booking.STATUS_CHECKED_IN)
        self.assertEqual(b_fm.checked_in_by, self.facility_mgr)

        # Test Admin
        res_admin = self.create_resource("Admin Test Room")
        b_admin = Booking.objects.create(
            requester=self.owner,
            resource=res_admin,
            purpose="Admin Check-in Test",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_admin,
            resource=res_admin,
            period=DateTimeTZRange(now - timedelta(minutes=2), now + timedelta(minutes=58)),
            is_active=True
        )
        self.auth(self.admin)
        resp_admin = self.client.post(url, {"token": str(b_admin.checkin_token)}, format='json')
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        b_admin.refresh_from_db()
        self.assertEqual(b_admin.status, Booking.STATUS_CHECKED_IN)
        self.assertEqual(b_admin.checked_in_by, self.admin)

    def test_checkin_denied_for_unauthorized_users(self):
        url = reverse('booking-token-check-in')
        payload = {"token": str(self.booking_current.checkin_token)}

        self.auth(self.other_student)
        resp_student = self.client.post(url, payload, format='json')
        self.assertEqual(resp_student.status_code, status.HTTP_403_FORBIDDEN)

        self.auth(self.other_custodian)
        resp_other_cust = self.client.post(url, payload, format='json')
        self.assertEqual(resp_other_cust.status_code, status.HTTP_403_FORBIDDEN)

    def test_checkin_window_validations(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now()
        url = reverse('booking-token-check-in')
        self.auth(self.owner)

        # 1. Too early (booking starts in 30 minutes, window opens at 15 minutes)
        res_early = self.create_resource("Early Test Room")
        b_early = Booking.objects.create(
            requester=self.owner,
            resource=res_early,
            purpose="Too Early Test",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_early,
            resource=res_early,
            period=DateTimeTZRange(now + timedelta(minutes=30), now + timedelta(minutes=90)),
            is_active=True
        )
        resp_early = self.client.post(url, {"token": str(b_early.checkin_token)}, format='json')
        self.assertEqual(resp_early.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp_early.data["error"], "checkin_too_early")

        # 2. Window closed (booking started 45 minutes ago, grace period is 30 minutes)
        res_late = self.create_resource("Late Test Room")
        b_late = Booking.objects.create(
            requester=self.owner,
            resource=res_late,
            purpose="Window Closed Test",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_late,
            resource=res_late,
            period=DateTimeTZRange(now - timedelta(minutes=45), now + timedelta(minutes=60)),
            is_active=True
        )
        resp_late = self.client.post(url, {"token": str(b_late.checkin_token)}, format='json')
        self.assertEqual(resp_late.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp_late.data["error"], "checkin_window_closed")

        # 3. Reservation already expired (ended in past)
        res_exp = self.create_resource("Expired Test Room")
        b_expired = Booking.objects.create(
            requester=self.owner,
            resource=res_exp,
            purpose="Expired Test",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_expired,
            resource=res_exp,
            period=DateTimeTZRange(now - timedelta(hours=2), now - timedelta(hours=1)),
            is_active=True
        )
        resp_expired = self.client.post(url, {"token": str(b_expired.checkin_token)}, format='json')
        self.assertEqual(resp_expired.status_code, status.HTTP_400_BAD_REQUEST)

    def test_token_misuse_and_status_checks(self):
        import uuid
        url = reverse('booking-token-check-in')
        self.auth(self.owner)

        fake_token = str(uuid.uuid4())
        resp_fake = self.client.post(url, {"token": fake_token}, format='json')
        self.assertEqual(resp_fake.status_code, status.HTTP_404_NOT_FOUND)

        resp_missing = self.client.post(url, {}, format='json')
        self.assertEqual(resp_missing.status_code, status.HTTP_400_BAD_REQUEST)

        # Double check-in rejection
        self.booking_current.status = Booking.STATUS_CHECKED_IN
        self.booking_current.checked_in_at = timezone.now()
        self.booking_current.save()

        resp_dup = self.client.post(url, {"token": str(self.booking_current.checkin_token)}, format='json')
        self.assertEqual(resp_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp_dup.data["error"], "already_checked_in")

        # Cancelled booking rejection
        self.booking_current.status = Booking.STATUS_CANCELLED
        self.booking_current.save()
        resp_cancelled = self.client.post(url, {"token": str(self.booking_current.checkin_token)}, format='json')
        self.assertEqual(resp_cancelled.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp_cancelled.data["error"], "booking_cancelled")

    def test_celery_release_no_shows_task_releases_slot_and_allows_rebooking(self):
        from psycopg2.extras import DateTimeTZRange
        from bookings.tasks import release_no_shows
        now = timezone.now()

        res_celery = self.create_resource("Celery NoShow Room")
        start_time = now - timedelta(minutes=45)
        end_time = now + timedelta(minutes=45)

        b_overdue = Booking.objects.create(
            requester=self.owner,
            resource=res_celery,
            purpose="Overdue No-Show Test",
            status=Booking.STATUS_APPROVED
        )
        slot_overdue = BookingSlot.objects.create(
            booking=b_overdue,
            resource=res_celery,
            period=DateTimeTZRange(start_time, end_time),
            is_active=True
        )

        released_count = release_no_shows(grace_minutes=30)
        self.assertGreaterEqual(released_count, 1)

        b_overdue.refresh_from_db()
        slot_overdue.refresh_from_db()

        self.assertEqual(b_overdue.status, Booking.STATUS_NO_SHOW)
        self.assertIsNotNone(b_overdue.no_show_at)
        self.assertFalse(slot_overdue.is_active)

        self.auth(self.other_student)
        url_create = reverse('booking-list-create')
        rebook_payload = {
            "resource": res_celery.id,
            "start_time": (now + timedelta(minutes=5)).isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Taking released capacity after no-show"
        }
        resp_rebook = self.client.post(url_create, rebook_payload, format='json')
        self.assertEqual(resp_rebook.status_code, status.HTTP_201_CREATED)

    def test_celery_release_no_shows_idempotency_and_eager_mode(self):
        from psycopg2.extras import DateTimeTZRange
        from bookings.tasks import release_no_shows
        from django.conf import settings
        now = timezone.now()

        res_idem = self.create_resource("Idempotency Room")
        b_overdue = Booking.objects.create(
            requester=self.owner,
            resource=res_idem,
            purpose="Idempotency Test",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_overdue,
            resource=res_idem,
            period=DateTimeTZRange(now - timedelta(minutes=50), now + timedelta(minutes=30)),
            is_active=True
        )

        # First run: should release
        res1 = release_no_shows(grace_minutes=30)
        self.assertGreaterEqual(res1, 1)

        # Second run: must be idempotent, release 0 additional bookings, cause no errors
        res2 = release_no_shows(grace_minutes=30)
        self.assertEqual(res2, 0)

        # Third run via Celery delay() in eager mode
        old_eager = getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False)
        settings.CELERY_TASK_ALWAYS_EAGER = True
        try:
            async_res = release_no_shows.delay(grace_minutes=30)
            self.assertEqual(async_res.get(), 0)
        finally:
            settings.CELERY_TASK_ALWAYS_EAGER = old_eager


class AdvancedBookingFeaturesPhase4Tests(TestCase):
    def setUp(self):
        from bookings.models import BookingSeries, TimetableEntry
        self.res_type = ResourceType.objects.create(name="Lecture Hall", icon="building")
        self.admin = User.objects.create_user(username="admin_p4", password="Password123!", role=User.ROLE_ADMIN)
        self.custodian = User.objects.create_user(username="custodian_p4", password="Password123!", role=User.ROLE_CUSTODIAN)
        self.student = User.objects.create_user(username="student_p4", password="Password123!", role=User.ROLE_STUDENT)
        self.other_student = User.objects.create_user(username="other_student_p4", password="Password123!", role=User.ROLE_STUDENT)

        self.resource = Resource.objects.create(
            name="Hall A",
            resource_type=self.res_type,
            location="Block 30, Room 101",
            capacity=100,
            custodian=self.custodian,
            status=Resource.STATUS_AVAILABLE
        )

        self.client_admin = APIClient()
        self.client_admin.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")

        self.client_student = APIClient()
        self.client_student.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.student).key}")

        self.client_other = APIClient()
        self.client_other.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.other_student).key}")

        self.client_custodian = APIClient()
        self.client_custodian.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.custodian).key}")

    def test_recurring_booking_success_count(self):
        from bookings.models import BookingSeries
        url = reverse('booking-list-create')
        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=10, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Weekly Study Group",
            "recurrence": {
                "frequency": "weekly",
                "interval": 1,
                "count": 4
            }
        }

        resp = self.client_student.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["created_count"], 4)
        self.assertEqual(len(resp.data["skipped_dates"]), 0)
        self.assertIn("series_id", resp.data)

        series = BookingSeries.objects.get(pk=resp.data["series_id"])
        self.assertEqual(series.requester, self.student)
        self.assertEqual(series.resource, self.resource)
        self.assertEqual(series.bookings.count(), 4)
        self.assertEqual(BookingSlot.objects.filter(booking__series=series, is_active=True).count(), 4)

    def test_recurring_booking_conflict_rollback_everything(self):
        from psycopg2.extras import DateTimeTZRange
        from bookings.models import BookingSeries
        url = reverse('booking-list-create')
        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=10, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        # Pre-book week 2 by another student
        week2_start = start_time + timedelta(weeks=1)
        week2_end = end_time + timedelta(weeks=1)
        conflicting_booking = Booking.objects.create(
            requester=self.other_student,
            resource=self.resource,
            purpose="Conflicting Booking",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=conflicting_booking,
            resource=self.resource,
            period=DateTimeTZRange(week2_start, week2_end),
            is_active=True
        )

        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Weekly Machine Learning",
            "recurrence": {
                "frequency": "weekly",
                "interval": 1,
                "count": 4
            },
            "skip_conflicts": False
        }

        resp = self.client_student.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("conflicting_dates", resp.data)
        self.assertEqual(len(resp.data["conflicting_dates"]), 1)
        # Ensure zero bookings or series were persisted (full rollback)
        self.assertEqual(BookingSeries.objects.count(), 0)
        self.assertEqual(Booking.objects.filter(requester=self.student).count(), 0)

    def test_recurring_booking_skip_conflicts_creates_rest(self):
        from psycopg2.extras import DateTimeTZRange
        from bookings.models import BookingSeries
        url = reverse('booking-list-create')
        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=10, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        # Pre-book week 2
        week2_start = start_time + timedelta(weeks=1)
        week2_end = end_time + timedelta(weeks=1)
        b_clash = Booking.objects.create(
            requester=self.other_student,
            resource=self.resource,
            purpose="Occupied Slot",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_clash,
            resource=self.resource,
            period=DateTimeTZRange(week2_start, week2_end),
            is_active=True
        )

        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Weekly Machine Learning with Skips",
            "recurrence": {
                "frequency": "weekly",
                "interval": 1,
                "count": 4
            },
            "skip_conflicts": True
        }

        resp = self.client_student.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["created_count"], 3)
        self.assertEqual(len(resp.data["skipped_dates"]), 1)

        series = BookingSeries.objects.get(pk=resp.data["series_id"])
        self.assertEqual(series.bookings.count(), 3)
        self.assertEqual(BookingSlot.objects.filter(booking__series=series, is_active=True).count(), 3)

    def test_recurring_booking_max_52_limit(self):
        url = reverse('booking-list-create')
        now = timezone.now() + timedelta(days=1)
        start_time = now.replace(hour=10, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Exceeding Max Occurrences",
            "recurrence": {
                "frequency": "weekly",
                "interval": 1,
                "count": 53
            }
        }

        resp = self.client_student.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recurrence", resp.data)

    def test_cancel_single_occurrence_vs_entire_series(self):
        url_create = reverse('booking-list-create')
        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=10, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Series to cancel",
            "recurrence": {
                "frequency": "weekly",
                "interval": 1,
                "count": 3
            }
        }

        resp = self.client_student.post(url_create, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        bookings = resp.data["bookings"]
        first_b_id = bookings[0]["id"]
        second_b_id = bookings[1]["id"]

        # 1. Cancel single occurrence (cancel_series=False)
        url_cancel = reverse('booking-cancel', kwargs={'pk': first_b_id})
        resp_cancel_one = self.client_student.post(url_cancel, {"cancel_series": False}, format='json')
        self.assertEqual(resp_cancel_one.status_code, status.HTTP_200_OK)

        b1 = Booking.objects.get(pk=first_b_id)
        b2 = Booking.objects.get(pk=second_b_id)
        self.assertEqual(b1.status, Booking.STATUS_CANCELLED)
        self.assertFalse(b1.slots.first().is_active)
        self.assertEqual(b2.status, Booking.STATUS_APPROVED)
        self.assertTrue(b2.slots.first().is_active)

        # 2. Cancel entire series via second booking
        url_cancel_two = reverse('booking-cancel', kwargs={'pk': second_b_id})
        resp_cancel_series = self.client_student.post(url_cancel_two, {"cancel_series": True}, format='json')
        self.assertEqual(resp_cancel_series.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_cancel_series.data["target"], "series")

        b2.refresh_from_db()
        self.assertEqual(b2.status, Booking.STATUS_CANCELLED)
        self.assertFalse(b2.slots.first().is_active)
        self.assertEqual(BookingSlot.objects.filter(booking__series=b2.series, is_active=True).count(), 0)

    def test_icalendar_user_export(self):
        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=9, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        b = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Robotics Workshop",
            status=Booking.STATUS_APPROVED
        )
        from psycopg2.extras import DateTimeTZRange
        BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(start_time, end_time),
            is_active=True
        )

        url = reverse('booking-export-ics')
        resp = self.client_student.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'text/calendar; charset=utf-8')
        content = resp.content.decode('utf-8')
        self.assertIn("BEGIN:VCALENDAR", content)
        self.assertIn("BEGIN:VEVENT", content)
        self.assertIn("Robotics Workshop", content)
        self.assertIn("Block 30", content)
        self.assertIn("UID:", content)

    def test_icalendar_single_booking_export_permissions(self):
        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=9, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        b = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="AI Ethics Seminar",
            status=Booking.STATUS_APPROVED
        )
        from psycopg2.extras import DateTimeTZRange
        BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(start_time, end_time),
            is_active=True
        )

        url = reverse('booking-detail-export-ics', kwargs={'pk': b.id})

        # Owner export -> 200
        resp_owner = self.client_student.get(url)
        self.assertEqual(resp_owner.status_code, status.HTTP_200_OK)
        self.assertIn("AI Ethics Seminar", resp_owner.content.decode('utf-8'))

        # Custodian export -> 200
        resp_cust = self.client_custodian.get(url)
        self.assertEqual(resp_cust.status_code, status.HTTP_200_OK)

        # Admin export -> 200
        resp_admin = self.client_admin.get(url)
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)

        # Unrelated student export -> 403
        resp_other = self.client_other.get(url)
        self.assertEqual(resp_other.status_code, status.HTTP_403_FORBIDDEN)

    def test_timetable_csv_import_admin_only(self):
        url = reverse('timetable-import')
        csv_data = f"""course_code,resource_id,weekday,start_time,end_time,semester_start,semester_end
CSE301,{self.resource.id},Monday,09:00,11:00,2026-08-01,2026-08-15"""

        # Student denied -> 403
        resp_student = self.client_student.post(url, {"csv_data": csv_data}, format='json')
        self.assertEqual(resp_student.status_code, status.HTTP_403_FORBIDDEN)

        # Custodian denied -> 403
        resp_cust = self.client_custodian.post(url, {"csv_data": csv_data}, format='json')
        self.assertEqual(resp_cust.status_code, status.HTTP_403_FORBIDDEN)

        # Admin allowed -> 201
        resp_admin = self.client_admin.post(url, {"csv_data": csv_data}, format='json')
        self.assertIn(resp_admin.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertTrue(resp_admin.data["success"])
        self.assertGreater(resp_admin.data["bookings_generated"], 0)

    def test_timetable_row_level_validation_errors(self):
        url = reverse('timetable-import')
        invalid_csv = f"""course_code,resource_id,weekday,start_time,end_time,semester_start,semester_end
,{self.resource.id},Monday,09:00,11:00,2026-08-01,2026-08-15
ECE202,99999,Wednesday,14:00,16:00,2026-08-01,2026-08-15
MEC105,{self.resource.id},Funday,10:00,12:00,2026-08-01,2026-08-15
CIV303,{self.resource.id},Friday,14:00,10:00,2026-08-01,2026-08-15"""

        resp = self.client_admin.post(url, {"csv_data": invalid_csv}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        errors = resp.data["errors"]
        self.assertEqual(len(errors), 4)
        self.assertEqual(errors[0]["row"], 2)
        self.assertIn("course_code is required", errors[0]["error"])
        self.assertEqual(errors[1]["row"], 3)
        self.assertIn("Resource '99999' not found", errors[1]["error"])
        self.assertEqual(errors[2]["row"], 4)
        self.assertIn("Invalid weekday", errors[2]["error"])
        self.assertEqual(errors[3]["row"], 5)
        self.assertIn("start_time", errors[3]["error"])

    def test_timetable_held_booking_generation_and_clash_reporting(self):
        from psycopg2.extras import DateTimeTZRange
        from bookings.models import BookingSeries, TimetableEntry

        # Semester from 2026-09-07 (Mon) to 2026-09-21 (Mon) - 3 Mondays: Sep 7, Sep 14, Sep 21
        # Pre-book Sep 14, 09:00-11:00 with student
        clash_start = timezone.make_aware(datetime(2026, 9, 14, 9, 0, 0))
        clash_end = timezone.make_aware(datetime(2026, 9, 14, 11, 0, 0))
        b_pre = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Student pre-booking",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b_pre,
            resource=self.resource,
            period=DateTimeTZRange(clash_start, clash_end),
            is_active=True
        )

        url = reverse('timetable-import')
        csv_data = f"""course_code,resource_id,weekday,start_time,end_time,semester_start,semester_end
CSE401,{self.resource.id},Monday,09:00,11:00,2026-09-07,2026-09-21"""

        resp = self.client_admin.post(url, {"csv_data": csv_data}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["bookings_generated"], 2)  # Sep 7 and Sep 21 generated
        self.assertEqual(resp.data["clashes_count"], 1)  # Sep 14 clashed
        self.assertIn("2026-09-14", resp.data["clashes"][0]["date"])

        # Verify held bookings have kind="timetable"
        held_bookings = Booking.objects.filter(kind=Booking.KIND_TIMETABLE)
        self.assertEqual(held_bookings.count(), 2)
        for hb in held_bookings:
            self.assertEqual(hb.status, Booking.STATUS_APPROVED)
            self.assertIsNotNone(hb.timetable_entry)

    def test_availability_feed_displays_timetable_blocks(self):
        from psycopg2.extras import DateTimeTZRange
        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=9, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        b_tt = Booking.objects.create(
            requester=self.admin,
            resource=self.resource,
            purpose="Timetable Hold: CSE301",
            status=Booking.STATUS_APPROVED,
            kind=Booking.KIND_TIMETABLE
        )
        BookingSlot.objects.create(
            booking=b_tt,
            resource=self.resource,
            period=DateTimeTZRange(start_time, end_time),
            is_active=True
        )

        url = reverse('resource-availability', kwargs={'pk': self.resource.id})
        resp = self.client_student.get(f"{url}?start={start_time.date().isoformat()}&end={(end_time.date() + timedelta(days=1)).isoformat()}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        events = resp.data["events"]
        tt_events = [e for e in events if e.get("type") == "timetable"]
        self.assertEqual(len(tt_events), 1)
        self.assertEqual(tt_events[0]["color"], "#0284c7")
        self.assertIn("CSE301", tt_events[0]["title"])


class ConsumablesAndNotificationsPhase5Tests(TransactionTestCase):
    """
    Comprehensive verification for Phase 5 (Consumables M8 & Notifications):
    - Consumable inventory, stock CheckConstraint (non-negative), low-stock flag
    - Booking creation with consumables deduction & select_for_update locking
    - Threaded concurrency race test for last unit of consumable
    - Stock restoration across: cancellation, rejection, no-show release, maintenance blackout
    - In-app Notification creation on approval, rejection, cancellation, no-show, maintenance
    - Celery Beat 1-hour pre-booking reminder task with idempotency
    - Notifications API: list, unread count, mark read, mark all read, and user isolation
    - Consumable CRUD & permission enforcement for custodian, admin, and student
    """

    def setUp(self):
        self.student = User.objects.create_user(
            username="student_p5",
            email="student_p5@campus.edu",
            password="password123",
            role=User.ROLE_STUDENT
        )
        self.other_student = User.objects.create_user(
            username="student_p5_other",
            email="other_p5@campus.edu",
            password="password123",
            role=User.ROLE_STUDENT
        )
        self.custodian = User.objects.create_user(
            username="custodian_p5",
            email="custodian_p5@campus.edu",
            password="password123",
            role=User.ROLE_CUSTODIAN,
            department="Computer Science"
        )
        self.other_custodian = User.objects.create_user(
            username="custodian_p5_other",
            email="custodian_other@campus.edu",
            password="password123",
            role=User.ROLE_CUSTODIAN,
            department="Physics"
        )
        self.admin = User.objects.create_user(
            username="admin_p5",
            email="admin_p5@campus.edu",
            password="password123",
            role=User.ROLE_ADMIN
        )

        self.res_type = ResourceType.objects.create(name="Robotics Lab Category", icon="cpu")
        self.resource = Resource.objects.create(
            name="Robotics Lab 101",
            resource_type=self.res_type,
            custodian=self.custodian,
            capacity=30,
            location="Engineering Block C",
            status=Resource.STATUS_AVAILABLE,
            requires_approval=False,
            department="Computer Science"
        )
        self.approval_resource = Resource.objects.create(
            name="Advanced AI Supercomputer Pod",
            resource_type=self.res_type,
            custodian=self.custodian,
            capacity=10,
            location="Engineering Block C",
            status=Resource.STATUS_AVAILABLE,
            requires_approval=True,
            department="Computer Science"
        )

        from availability.models import AvailabilityRule
        for d in range(7):
            AvailabilityRule.objects.create(
                resource=None,
                day_of_week=d,
                start_time=time(6, 0),
                end_time=time(23, 0),
                active=True
            )

        from rest_framework.test import APIClient
        self.client_student = APIClient()
        self.client_student.force_authenticate(user=self.student)

        self.client_other = APIClient()
        self.client_other.force_authenticate(user=self.other_student)

        self.client_custodian = APIClient()
        self.client_custodian.force_authenticate(user=self.custodian)

        self.client_other_cust = APIClient()
        self.client_other_cust.force_authenticate(user=self.other_custodian)

        self.client_admin = APIClient()
        self.client_admin.force_authenticate(user=self.admin)

    def test_consumable_stock_and_low_stock_flag(self):
        from resources.models import Consumable
        c = Consumable.objects.create(
            name="3D Printing Filament",
            unit="spool",
            stock=5,
            reorder_level=5,
            resource=self.resource
        )
        self.assertTrue(c.is_low_stock)

        c.stock = 6
        c.save()
        self.assertFalse(c.is_low_stock)

        # CheckConstraint enforces non-negative stock at DB level
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                c.stock = -1
                c.save()

    def test_booking_creation_with_consumables_success(self):
        from resources.models import Consumable
        c = Consumable.objects.create(
            name="Solder Wire",
            unit="meters",
            stock=20,
            reorder_level=5,
            resource=self.resource
        )

        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=10, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        url = reverse('booking-list-create')
        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Hardware Soldering Lab",
            "consumables": [
                {"consumable_id": c.id, "quantity": 5}
            ]
        }
        resp = self.client_student.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        c.refresh_from_db()
        self.assertEqual(c.stock, 15)

        booking = Booking.objects.get(id=resp.data["id"])
        self.assertEqual(booking.consumables.count(), 1)
        alloc = booking.consumables.first()
        self.assertEqual(alloc.quantity, 5)
        self.assertEqual(alloc.consumable_id, c.id)

    def test_booking_creation_insufficient_stock_fails(self):
        from resources.models import Consumable
        c = Consumable.objects.create(
            name="Rare Microcontroller",
            unit="pcs",
            stock=2,
            reorder_level=1,
            resource=self.resource
        )

        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=10, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        url = reverse('booking-list-create')
        payload = {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Robotics Prototype",
            "consumables": [
                {"consumable_id": c.id, "quantity": 5}
            ]
        }
        resp = self.client_student.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["error"], "insufficient_stock")

        c.refresh_from_db()
        self.assertEqual(c.stock, 2)  # Unaltered
        self.assertEqual(Booking.objects.filter(purpose="Robotics Prototype").count(), 0)

    def test_stock_race_concurrency_two_requests_for_last_unit(self):
        """
        Threaded concurrency test: Two simultaneous requests compete for the last 1 remaining unit
        of a consumable. Exactly ONE must succeed (201 Created), the other must receive 400 Bad Request,
        and stock must cleanly land at 0 (never negative).
        """
        import threading
        from django.db import connection
        from resources.models import Consumable

        headset = Consumable.objects.create(
            name="VR HMD Kit",
            unit="kit",
            stock=1,
            reorder_level=1,
            resource=self.resource
        )

        now = timezone.now() + timedelta(days=3)
        # Choose two distinct non-overlapping time windows so exclusion constraint does not interfere
        slot1_start = now.replace(hour=9, minute=0, second=0, microsecond=0)
        slot1_end = slot1_start + timedelta(hours=1)

        slot2_start = now.replace(hour=11, minute=0, second=0, microsecond=0)
        slot2_end = slot2_start + timedelta(hours=1)

        results = []
        barrier = threading.Barrier(2)

        def make_booking_attempt(user, s_time, e_time):
            # Close existing connection to ensure clean thread-local DB connection
            connection.close()
            from rest_framework.test import APIClient
            client = APIClient()
            client.force_authenticate(user=user)
            payload = {
                "resource": self.resource.id,
                "start_time": s_time.isoformat(),
                "end_time": e_time.isoformat(),
                "purpose": f"Threaded VR Test by {user.username}",
                "consumables": [{"consumable_id": headset.id, "quantity": 1}]
            }
            barrier.wait()
            resp = client.post(reverse('booking-list-create'), payload, format='json')
            results.append(resp.status_code)
            connection.close()

        t1 = threading.Thread(target=make_booking_attempt, args=(self.student, slot1_start, slot1_end))
        t2 = threading.Thread(target=make_booking_attempt, args=(self.other_student, slot2_start, slot2_end))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        headset.refresh_from_db()
        self.assertEqual(headset.stock, 0)
        self.assertIn(status.HTTP_201_CREATED, results)
        self.assertIn(status.HTTP_400_BAD_REQUEST, results)
        self.assertEqual(results.count(status.HTTP_201_CREATED), 1)
        self.assertEqual(results.count(status.HTTP_400_BAD_REQUEST), 1)

    def test_cancellation_restores_stock_and_notifies(self):
        from resources.models import Consumable
        c = Consumable.objects.create(
            name="Oscilloscope Probe",
            unit="pair",
            stock=10,
            reorder_level=2,
            resource=self.resource
        )

        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=10, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        # Create booking reserving 3 probes
        resp = self.client_student.post(reverse('booking-list-create'), {
            "resource": self.resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Circuit Testing",
            "consumables": [{"consumable_id": c.id, "quantity": 3}]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        b_id = resp.data["id"]

        c.refresh_from_db()
        self.assertEqual(c.stock, 7)

        # Cancel booking
        cancel_resp = self.client_student.post(reverse('booking-cancel', kwargs={'pk': b_id}))
        self.assertEqual(cancel_resp.status_code, status.HTTP_200_OK)

        # Stock restored
        c.refresh_from_db()
        self.assertEqual(c.stock, 10)

        # Notification generated
        from accounts.models import Notification
        notif = Notification.objects.filter(user=self.student, type=Notification.TYPE_CANCELLATION).first()
        self.assertIsNotNone(notif)
        self.assertIn(str(b_id), notif.message)

    def test_rejection_restores_stock_and_notifies(self):
        from resources.models import Consumable
        c = Consumable.objects.create(
            name="GPU Compute Credits Token",
            unit="units",
            stock=50,
            reorder_level=10,
            resource=self.approval_resource
        )

        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=14, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        # Student books approval-required resource reserving 20 credits
        resp = self.client_student.post(reverse('booking-list-create'), {
            "resource": self.approval_resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Deep Learning Training",
            "consumables": [{"consumable_id": c.id, "quantity": 20}]
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        b_id = resp.data["id"]

        c.refresh_from_db()
        self.assertEqual(c.stock, 30)

        # Custodian rejects booking with note
        reject_url = reverse('booking-reject', kwargs={'pk': b_id})
        reject_resp = self.client_custodian.post(reject_url, {"decision_note": "Quota reserved for PhD defense."}, format='json')
        self.assertEqual(reject_resp.status_code, status.HTTP_200_OK)

        # Stock restored
        c.refresh_from_db()
        self.assertEqual(c.stock, 50)

        # Notification received by student
        from accounts.models import Notification
        notif = Notification.objects.filter(user=self.student, type=Notification.TYPE_REJECTION).first()
        self.assertIsNotNone(notif)
        self.assertIn("PhD defense", notif.message)

    def test_approval_generates_notification(self):
        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=14, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        resp = self.client_student.post(reverse('booking-list-create'), {
            "resource": self.approval_resource.id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "purpose": "Neural Net Experiments"
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        b_id = resp.data["id"]

        approve_url = reverse('booking-approve', kwargs={'pk': b_id})
        appr_resp = self.client_custodian.post(approve_url, {"decision_note": "Approved for research."}, format='json')
        self.assertEqual(appr_resp.status_code, status.HTTP_200_OK)

        from accounts.models import Notification
        notif = Notification.objects.filter(user=self.student, type=Notification.TYPE_APPROVAL).first()
        self.assertIsNotNone(notif)
        self.assertIn("approved", notif.message.lower())

    def test_no_show_auto_release_restores_stock_and_notifies(self):
        from resources.models import Consumable
        from bookings.tasks import release_no_shows
        from psycopg2.extras import DateTimeTZRange

        c = Consumable.objects.create(
            name="Drone Battery Pack",
            unit="pack",
            stock=4,
            reorder_level=1,
            resource=self.resource
        )

        now = timezone.now()
        past_start = now - timedelta(hours=2)
        past_end = now - timedelta(hours=1)

        b = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Drone Flight Practice",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(past_start, past_end),
            is_active=True
        )
        BookingConsumable.objects.create(
            booking=b,
            consumable=c,
            quantity=2
        )
        c.stock -= 2
        c.save()

        # Run Celery auto no-show task
        released = release_no_shows(grace_minutes=30)
        self.assertEqual(released, 1)

        b.refresh_from_db()
        self.assertEqual(b.status, Booking.STATUS_NO_SHOW)
        self.assertFalse(b.slots.filter(is_active=True).exists())

        c.refresh_from_db()
        self.assertEqual(c.stock, 4)  # Restored

        from accounts.models import Notification
        notif = Notification.objects.filter(user=self.student, type=Notification.TYPE_NO_SHOW).first()
        self.assertIsNotNone(notif)
        self.assertIn("no-show", notif.message.lower())

    def test_maintenance_blackout_cancellation_restores_stock_and_notifies(self):
        from resources.models import Consumable
        from psycopg2.extras import DateTimeTZRange

        c = Consumable.objects.create(
            name="Chemistry Reagent Bottle",
            unit="bottles",
            stock=10,
            reorder_level=2,
            resource=self.resource
        )

        now = timezone.now() + timedelta(days=2)
        start_time = now.replace(hour=10, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(hours=2)

        b = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Titration Experiment",
            status=Booking.STATUS_APPROVED
        )
        BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(start_time, end_time),
            is_active=True
        )
        BookingConsumable.objects.create(
            booking=b,
            consumable=c,
            quantity=3
        )
        c.stock -= 3
        c.save()

        # Create blackout with cancel_conflicting=True
        url = reverse('resource-maintenance-list')
        resp = self.client_admin.post(url, {
            "resource": self.resource.id,
            "start_datetime": (start_time - timedelta(hours=1)).isoformat(),
            "end_datetime": (end_time + timedelta(hours=1)).isoformat(),
            "reason": "Emergency fume hood duct repair",
            "cancel_conflicting": True,
            "kind": "maintenance"
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        b.refresh_from_db()
        self.assertEqual(b.status, Booking.STATUS_CANCELLED)
        self.assertFalse(b.slots.filter(is_active=True).exists())

        c.refresh_from_db()
        self.assertEqual(c.stock, 10)  # Restored

        from accounts.models import Notification
        notif = Notification.objects.filter(user=self.student, type=Notification.TYPE_MAINTENANCE_CANCELLATION).first()
        self.assertIsNotNone(notif)
        self.assertIn("fume hood", notif.message)

    def test_celery_reminder_task_dispatches_one_hour_before(self):
        from bookings.tasks import send_booking_reminders
        from psycopg2.extras import DateTimeTZRange

        now = timezone.now()
        upcoming_start = now + timedelta(minutes=60)
        upcoming_end = upcoming_start + timedelta(hours=1)

        b = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Upcoming Lab Session",
            status=Booking.STATUS_APPROVED,
            reminder_sent=False
        )
        BookingSlot.objects.create(
            booking=b,
            resource=self.resource,
            period=DateTimeTZRange(upcoming_start, upcoming_end),
            is_active=True
        )

        reminded = send_booking_reminders(lead_minutes=60)
        self.assertEqual(reminded, 1)

        b.refresh_from_db()
        self.assertTrue(b.reminder_sent)

        from accounts.models import Notification
        notif = Notification.objects.filter(user=self.student, type=Notification.TYPE_REMINDER).first()
        self.assertIsNotNone(notif)
        self.assertIn("1 hour", notif.message)

        # Idempotency check: running again dispatches 0 reminders
        reminded_again = send_booking_reminders(lead_minutes=60)
        self.assertEqual(reminded_again, 0)

    def test_consumable_crud_and_permissions(self):
        from resources.models import Consumable

        # 1. Custodian creates consumable for their own resource -> 201
        url = reverse('consumable-list-create')
        resp = self.client_custodian.post(url, {
            "name": "Ethernet Cables",
            "unit": "pcs",
            "stock": 15,
            "reorder_level": 3,
            "resource": self.resource.id
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        c_id = resp.data["id"]

        # 2. Other custodian tries to edit/delete -> 403
        detail_url = reverse('consumable-detail', kwargs={'pk': c_id})
        resp_forbidden = self.client_other_cust.patch(detail_url, {"stock": 50}, format='json')
        self.assertEqual(resp_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Student tries to edit -> 403
        resp_student = self.client_student.patch(detail_url, {"stock": 50}, format='json')
        self.assertEqual(resp_student.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Custodian adjusts stock -> 200
        adjust_url = reverse('consumable-adjust-stock', kwargs={'pk': c_id})
        resp_adj = self.client_custodian.post(adjust_url, {"adjustment": -5}, format='json')
        self.assertEqual(resp_adj.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_adj.data["consumable"]["stock"], 10)

        # 5. Reducing stock below 0 -> 400 negative_stock
        resp_neg = self.client_custodian.post(adjust_url, {"adjustment": -100}, format='json')
        self.assertEqual(resp_neg.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp_neg.data["error"], "negative_stock")

    def test_notifications_api_and_isolation(self):
        from accounts.models import Notification

        # Create notifications for student
        n1 = Notification.objects.create(
            user=self.student,
            type=Notification.TYPE_APPROVAL,
            title="Lab Approved",
            message="Your reservation was confirmed.",
            read=False
        )
        n2 = Notification.objects.create(
            user=self.student,
            type=Notification.TYPE_REMINDER,
            title="Starts Soon",
            message="Check in shortly.",
            read=False
        )

        # Create notification for other student
        n_other = Notification.objects.create(
            user=self.other_student,
            type=Notification.TYPE_APPROVAL,
            title="Private Notice",
            message="Notice for other student.",
            read=False
        )

        # 1. Student lists notifications -> sees only their 2
        list_url = reverse('notification-list')
        resp = self.client_student.get(list_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["unread_count"], 2)
        self.assertEqual(len(resp.data["results"]), 2)
        notif_ids = [n["id"] for n in resp.data["results"]]
        self.assertIn(n1.id, notif_ids)
        self.assertNotIn(n_other.id, notif_ids)

        # 2. Student marks single notification as read
        read_url = reverse('notification-mark-read', kwargs={'pk': n1.id})
        resp_read = self.client_student.post(read_url)
        self.assertEqual(resp_read.status_code, status.HTTP_200_OK)
        n1.refresh_from_db()
        self.assertTrue(n1.read)

        # Unread count should now be 1
        resp2 = self.client_student.get(list_url)
        self.assertEqual(resp2.data["unread_count"], 1)

        # 3. Student tries to mark other student's notification -> 404
        other_read_url = reverse('notification-mark-read', kwargs={'pk': n_other.id})
        resp_cross = self.client_student.post(other_read_url)
        self.assertEqual(resp_cross.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Student marks all as read
        mark_all_url = reverse('notification-mark-all-read')
        resp_all = self.client_student.post(mark_all_url)
        self.assertEqual(resp_all.status_code, status.HTTP_200_OK)
        n2.refresh_from_db()
        self.assertTrue(n2.read)

        resp3 = self.client_student.get(list_url)
        self.assertEqual(resp3.data["unread_count"], 0)


class AnalyticsAndReportingPhase6Tests(TestCase):
    """
    Phase 6 Verification:
    - Scoping per role: admin/facility_mgr (all), dept_head (dept only), custodian (assigned only), student/faculty (403)
    - Calculation correctness on known data: utilization %, bookings by category, peak hours/weekdays, cancellation & no-show rates, top users
    - CSV export endpoints for bookings and resource usage
    """

    def setUp(self):
        from psycopg2.extras import DateTimeTZRange
        from availability.models import AvailabilityRule

        # Users
        self.admin = User.objects.create_user(username="admin_p6", password="password123", role=User.ROLE_ADMIN)
        self.facility_mgr = User.objects.create_user(username="fm_p6", password="password123", role=User.ROLE_FACILITY_MGR)
        self.dept_head_cs = User.objects.create_user(username="head_cs", password="password123", role=User.ROLE_DEPT_HEAD, department="Computer Science")
        self.dept_head_ee = User.objects.create_user(username="head_ee", password="password123", role=User.ROLE_DEPT_HEAD, department="Electrical Engineering")
        self.custodian_cs = User.objects.create_user(username="cust_cs", password="password123", role=User.ROLE_CUSTODIAN, department="Computer Science")
        self.custodian_ee = User.objects.create_user(username="cust_ee", password="password123", role=User.ROLE_CUSTODIAN, department="Electrical Engineering")
        self.student = User.objects.create_user(username="student_p6", password="password123", role=User.ROLE_STUDENT)
        self.faculty = User.objects.create_user(username="faculty_p6", password="password123", role=User.ROLE_FACULTY)

        # Clients
        self.client_admin = APIClient()
        self.client_admin.force_authenticate(user=self.admin)
        self.client_fm = APIClient()
        self.client_fm.force_authenticate(user=self.facility_mgr)
        self.client_head_cs = APIClient()
        self.client_head_cs.force_authenticate(user=self.dept_head_cs)
        self.client_head_ee = APIClient()
        self.client_head_ee.force_authenticate(user=self.dept_head_ee)
        self.client_cust_cs = APIClient()
        self.client_cust_cs.force_authenticate(user=self.custodian_cs)
        self.client_student = APIClient()
        self.client_student.force_authenticate(user=self.student)
        self.client_faculty = APIClient()
        self.client_faculty.force_authenticate(user=self.faculty)

        # Resources
        self.type_lab = ResourceType.objects.create(name="Computer Laboratory", icon="monitor")
        self.type_hall = ResourceType.objects.create(name="Lecture Hall", icon="video")

        self.res_cs = Resource.objects.create(
            name="CS AI Lab",
            resource_type=self.type_lab,
            custodian=self.custodian_cs,
            capacity=40,
            location="Block 34, Room 201",
            department="Computer Science",
            status=Resource.STATUS_AVAILABLE
        )
        self.res_ee = Resource.objects.create(
            name="EE Robotics Lab",
            resource_type=self.type_hall,
            custodian=self.custodian_ee,
            capacity=60,
            location="Block 38, Room 101",
            department="Electrical Engineering",
            status=Resource.STATUS_AVAILABLE
        )

        # Operating hours: 09:00 to 17:00 (8 hours/day) for all days
        for d in range(7):
            AvailabilityRule.objects.create(
                resource=None,
                day_of_week=d,
                start_time=time(9, 0),
                end_time=time(17, 0),
                active=True
            )

        # Date range for known data: Day 1 and Day 2 (fixed dates in future to ensure clean boundaries)
        self.day1 = (timezone.now() + timedelta(days=10)).date()
        self.day2 = self.day1 + timedelta(days=1)
        self.start_date_str = self.day1.isoformat()
        self.end_date_str = self.day2.isoformat()

        tz = timezone.get_current_timezone()
        # Booking 1 on CS Lab: Day 1, 09:00 to 13:00 (4 hours) -> Approved
        dt1_s = timezone.make_aware(datetime.combine(self.day1, time(9, 0)), tz)
        dt1_e = timezone.make_aware(datetime.combine(self.day1, time(13, 0)), tz)
        b1 = Booking.objects.create(
            requester=self.student,
            resource=self.res_cs,
            purpose="AI Neural Net Training",
            status=Booking.STATUS_APPROVED
        )
        b1.created_at = dt1_s
        b1.save(update_fields=['created_at'])
        BookingSlot.objects.create(booking=b1, resource=self.res_cs, period=DateTimeTZRange(dt1_s, dt1_e), is_active=True)

        # Booking 2 on CS Lab: Day 2, 14:00 to 16:00 (2 hours) -> Approved
        dt2_s = timezone.make_aware(datetime.combine(self.day2, time(14, 0)), tz)
        dt2_e = timezone.make_aware(datetime.combine(self.day2, time(16, 0)), tz)
        b2 = Booking.objects.create(
            requester=self.faculty,
            resource=self.res_cs,
            purpose="Deep Learning Lecture",
            status=Booking.STATUS_APPROVED
        )
        b2.created_at = dt2_s
        b2.save(update_fields=['created_at'])
        BookingSlot.objects.create(booking=b2, resource=self.res_cs, period=DateTimeTZRange(dt2_s, dt2_e), is_active=True)

        # Booking 3 on CS Lab: Day 1, 13:00 to 14:00 (1 hour) -> Cancelled
        dt3_s = timezone.make_aware(datetime.combine(self.day1, time(13, 0)), tz)
        dt3_e = timezone.make_aware(datetime.combine(self.day1, time(14, 0)), tz)
        b3 = Booking.objects.create(
            requester=self.student,
            resource=self.res_cs,
            purpose="Cancelled Study Session",
            status=Booking.STATUS_CANCELLED
        )
        b3.created_at = dt3_s
        b3.save(update_fields=['created_at'])
        BookingSlot.objects.create(booking=b3, resource=self.res_cs, period=DateTimeTZRange(dt3_s, dt3_e), is_active=False)

        # Booking 4 on CS Lab: Day 2, 10:00 to 11:00 (1 hour) -> No Show
        dt4_s = timezone.make_aware(datetime.combine(self.day2, time(10, 0)), tz)
        dt4_e = timezone.make_aware(datetime.combine(self.day2, time(11, 0)), tz)
        b4 = Booking.objects.create(
            requester=self.student,
            resource=self.res_cs,
            purpose="Missed Experiment",
            status=Booking.STATUS_NO_SHOW
        )
        b4.created_at = dt4_s
        b4.save(update_fields=['created_at'])
        BookingSlot.objects.create(booking=b4, resource=self.res_cs, period=DateTimeTZRange(dt4_s, dt4_e), is_active=False)

        # Booking 5 on EE Lab: Day 1, 10:00 to 14:00 (4 hours) -> Approved
        dt5_s = timezone.make_aware(datetime.combine(self.day1, time(10, 0)), tz)
        dt5_e = timezone.make_aware(datetime.combine(self.day1, time(14, 0)), tz)
        b5 = Booking.objects.create(
            requester=self.student,
            resource=self.res_ee,
            purpose="Robotics Arm Calibration",
            status=Booking.STATUS_APPROVED
        )
        b5.created_at = dt5_s
        b5.save(update_fields=['created_at'])
        BookingSlot.objects.create(booking=b5, resource=self.res_ee, period=DateTimeTZRange(dt5_s, dt5_e), is_active=True)

    def test_analytics_calculation_correctness(self):
        """
        Tests mathematical accuracy of:
        - Operating hours: 2 days * 8 hrs = 16.0 hrs
        - Booked hours for CS Lab: 4 hrs + 2 hrs = 6.0 hrs
        - Utilization % for CS Lab: (6 / 16) * 100 = 37.5%
        - Booked hours for EE Lab: 4.0 hrs -> (4 / 16) * 100 = 25.0%
        - Peak hours & weekdays
        - Cancellation & no-show rates
        - Top users
        """
        url = reverse('booking-analytics-dashboard')
        resp = self.client_admin.get(f"{url}?start_date={self.start_date_str}&end_date={self.end_date_str}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data

        # 1. Summary
        summary = data["summary"]
        self.assertEqual(summary["total_resources"], 2)
        self.assertEqual(summary["total_bookings"], 3)  # Active slots
        self.assertEqual(summary["total_booked_hours"], 10.0)  # 6.0 + 4.0
        self.assertEqual(summary["total_operating_hours"], 32.0)  # 16 + 16
        self.assertAlmostEqual(summary["overall_utilization_rate"], 31.25, places=2)  # (10/32)*100

        # 2. Per-resource utilization
        util = {r["resource_name"]: r for r in data["utilization_per_resource"]}
        self.assertIn("CS AI Lab", util)
        self.assertIn("EE Robotics Lab", util)

        cs_stat = util["CS AI Lab"]
        self.assertEqual(cs_stat["booked_hours"], 6.0)
        self.assertEqual(cs_stat["operating_hours"], 16.0)
        self.assertAlmostEqual(cs_stat["utilization_rate"], 37.5, places=1)
        self.assertEqual(cs_stat["booking_count"], 2)

        ee_stat = util["EE Robotics Lab"]
        self.assertEqual(ee_stat["booked_hours"], 4.0)
        self.assertEqual(ee_stat["operating_hours"], 16.0)
        self.assertAlmostEqual(ee_stat["utilization_rate"], 25.0, places=1)
        self.assertEqual(ee_stat["booking_count"], 1)

        # 3. Bookings by type
        by_type = {t["type_name"]: t["count"] for t in data["bookings_by_type"]}
        self.assertEqual(by_type.get("Computer Laboratory"), 2)
        self.assertEqual(by_type.get("Lecture Hall"), 1)

        # 4. Cancellation & No-Show Performance
        perf = data["cancellation_no_show_stats"]
        self.assertEqual(perf["total_bookings"], 5)
        self.assertEqual(perf["cancelled"], 1)
        self.assertEqual(perf["no_show"], 1)
        self.assertEqual(perf["approved"], 3)
        self.assertAlmostEqual(perf["cancellation_rate"], 20.0, places=1)  # (1/5)*100
        self.assertAlmostEqual(perf["no_show_rate"], 20.0, places=1)      # (1/5)*100

        # 5. Top Users
        top_u = {u["username"]: u for u in data["top_users"]}
        self.assertIn("student_p6", top_u)
        self.assertEqual(top_u["student_p6"]["bookings_count"], 2)  # b1 and b5 active
        self.assertEqual(top_u["student_p6"]["hours_booked"], 8.0)  # 4 + 4

    def test_analytics_role_scoping(self):
        """
        Verify strict role-based access control and scoping:
        - Admin: sees all resources
        - Facility Manager: sees all resources
        - Department Head CS: sees CS Lab only
        - Custodian CS: sees CS Lab only
        - Student/Faculty: 403 Forbidden
        """
        url = reverse('booking-analytics-dashboard')
        query = f"?start_date={self.start_date_str}&end_date={self.end_date_str}"

        # 1. Admin -> 2 resources
        resp_admin = self.client_admin.get(f"{url}{query}")
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_admin.data["utilization_per_resource"]), 2)

        # 2. Facility Manager -> 2 resources
        resp_fm = self.client_fm.get(f"{url}{query}")
        self.assertEqual(resp_fm.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_fm.data["utilization_per_resource"]), 2)

        # 3. Dept Head CS -> only CS Lab
        resp_head_cs = self.client_head_cs.get(f"{url}{query}")
        self.assertEqual(resp_head_cs.status_code, status.HTTP_200_OK)
        res_names_cs = [r["resource_name"] for r in resp_head_cs.data["utilization_per_resource"]]
        self.assertEqual(res_names_cs, ["CS AI Lab"])

        # 4. Custodian CS -> only CS Lab
        resp_cust_cs = self.client_cust_cs.get(f"{url}{query}")
        self.assertEqual(resp_cust_cs.status_code, status.HTTP_200_OK)
        res_names_cust = [r["resource_name"] for r in resp_cust_cs.data["utilization_per_resource"]]
        self.assertEqual(res_names_cust, ["CS AI Lab"])

        # 5. Student -> 403 Forbidden
        resp_student = self.client_student.get(f"{url}{query}")
        self.assertEqual(resp_student.status_code, status.HTTP_403_FORBIDDEN)

        # 6. Faculty -> 403 Forbidden
        resp_faculty = self.client_faculty.get(f"{url}{query}")
        self.assertEqual(resp_faculty.status_code, status.HTTP_403_FORBIDDEN)

    def test_bookings_csv_export(self):
        """
        Verify CSV export of bookings:
        - Admin gets CSV containing both CS and EE bookings
        - Custodian CS gets CSV containing CS bookings only
        - Student receives 403 Forbidden
        """
        url = reverse('booking-reports-bookings-csv')
        query = f"?start_date={self.start_date_str}&end_date={self.end_date_str}"

        # Admin export
        resp_admin = self.client_admin.get(f"{url}{query}")
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_admin['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('attachment; filename=', resp_admin['Content-Disposition'])
        content_admin = resp_admin.content.decode('utf-8')
        self.assertIn("Booking ID", content_admin)
        self.assertIn("CS AI Lab", content_admin)
        self.assertIn("EE Robotics Lab", content_admin)

        # Custodian CS export -> scoped to CS Lab only
        resp_cust = self.client_cust_cs.get(f"{url}{query}")
        self.assertEqual(resp_cust.status_code, status.HTTP_200_OK)
        content_cust = resp_cust.content.decode('utf-8')
        self.assertIn("CS AI Lab", content_cust)
        self.assertNotIn("EE Robotics Lab", content_cust)

        # Student export -> 403
        resp_student = self.client_student.get(f"{url}{query}")
        self.assertEqual(resp_student.status_code, status.HTTP_403_FORBIDDEN)

    def test_usage_csv_export(self):
        """
        Verify CSV export of resource usage and capacity metrics:
        - Admin gets CSV with all resources and utilization percentages
        - Student receives 403 Forbidden
        """
        url = reverse('booking-reports-usage-csv')
        query = f"?start_date={self.start_date_str}&end_date={self.end_date_str}"

        resp_admin = self.client_admin.get(f"{url}{query}")
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_admin['Content-Type'], 'text/csv; charset=utf-8')
        content = resp_admin.content.decode('utf-8')
        self.assertIn("Resource ID", content)
        self.assertIn("Utilization Rate (%)", content)
        self.assertIn("37.5%", content)
        self.assertIn("25.0%", content)

        # Student export -> 403
        resp_student = self.client_student.get(f"{url}{query}")
        self.assertEqual(resp_student.status_code, status.HTTP_403_FORBIDDEN)







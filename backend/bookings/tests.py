from datetime import timedelta
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
from accounts.models import User
from resources.models import ResourceType, Resource
from availability.models import Blackout
from bookings.models import Booking, BookingSlot

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



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

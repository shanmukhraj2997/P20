from datetime import timedelta
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from psycopg2.extras import DateTimeTZRange
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token

from accounts.models import User
from resources.models import ResourceType, Resource
from availability.models import Blackout
from bookings.models import Booking, BookingSlot


class MaintenanceAndDowntimeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.res_type = ResourceType.objects.create(name="Laboratories", icon="flask")

        # Create distinct users across roles
        self.custodian = User.objects.create_user(
            username="custodian_maint", password="Password123!", role=User.ROLE_CUSTODIAN
        )
        self.other_custodian = User.objects.create_user(
            username="other_custodian_maint", password="Password123!", role=User.ROLE_CUSTODIAN
        )
        self.facility_mgr = User.objects.create_user(
            username="fm_maint", password="Password123!", role=User.ROLE_FACILITY_MGR
        )
        self.admin = User.objects.create_user(
            username="admin_maint", password="Password123!", role=User.ROLE_ADMIN
        )
        self.student = User.objects.create_user(
            username="student_maint", password="Password123!", role=User.ROLE_STUDENT
        )
        self.faculty = User.objects.create_user(
            username="faculty_maint", password="Password123!", role=User.ROLE_FACULTY
        )

        for u in [self.custodian, self.other_custodian, self.facility_mgr, self.admin, self.student, self.faculty]:
            Token.objects.create(user=u)

        # Create resources
        self.resource = Resource.objects.create(
            name="Robotics Lab Alpha",
            resource_type=self.res_type,
            capacity=30,
            location="Engineering Block E-101",
            custodian=self.custodian,
            status=Resource.STATUS_AVAILABLE
        )

        self.other_resource = Resource.objects.create(
            name="Fluid Mechanics Lab",
            resource_type=self.res_type,
            capacity=25,
            location="Engineering Block E-205",
            custodian=self.other_custodian,
            status=Resource.STATUS_AVAILABLE
        )

    def auth(self, user):
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + user.auth_token.key)

    # -------------------------------------------------------------
    # 1. PERMISSIONS & SCOPE
    # -------------------------------------------------------------
    def test_custodian_can_create_maintenance_for_own_resource(self):
        self.auth(self.custodian)
        url = reverse('maintenance-list-create')
        now = timezone.now()
        payload = {
            "resource": self.resource.id,
            "kind": "maintenance",
            "start_datetime": (now + timedelta(days=2)).isoformat(),
            "end_datetime": (now + timedelta(days=2, hours=4)).isoformat(),
            "reason": "Robotic Arm Servo Calibration",
            "notes": "Technician team visiting on-site."
        }
        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("blackout", resp.data)
        self.assertEqual(resp.data["blackout"]["reason"], "Robotic Arm Servo Calibration")
        self.assertEqual(resp.data["blackout"]["kind"], "maintenance")

    def test_custodian_forbidden_for_other_custodians_resource(self):
        self.auth(self.custodian)
        url = reverse('maintenance-list-create')
        now = timezone.now()
        payload = {
            "resource": self.other_resource.id,
            "kind": "maintenance",
            "start_datetime": (now + timedelta(days=2)).isoformat(),
            "end_datetime": (now + timedelta(days=2, hours=4)).isoformat(),
            "reason": "Unauthorized Calibration Attempt"
        }
        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Permission denied", resp.data["detail"])

    def test_custodian_forbidden_from_creating_campus_wide_blackout(self):
        self.auth(self.custodian)
        url = reverse('maintenance-list-create')
        now = timezone.now()
        payload = {
            "resource": None,
            "kind": "holiday",
            "start_datetime": (now + timedelta(days=5)).isoformat(),
            "end_datetime": (now + timedelta(days=6)).isoformat(),
            "reason": "Custodian Attempted Campus Holiday"
        }
        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("campus-wide", resp.data["detail"].lower())

    def test_facility_mgr_and_admin_can_create_campus_wide_blackout(self):
        url = reverse('maintenance-list-create')
        now = timezone.now()

        # Facility Manager
        self.auth(self.facility_mgr)
        payload_fm = {
            "resource": None,
            "kind": "downtime",
            "start_datetime": (now + timedelta(days=10)).isoformat(),
            "end_datetime": (now + timedelta(days=10, hours=8)).isoformat(),
            "reason": "Campus Grid Transformer Servicing"
        }
        resp_fm = self.client.post(url, payload_fm, format='json')
        self.assertEqual(resp_fm.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(resp_fm.data["blackout"]["resource"])

        # Administrator
        self.auth(self.admin)
        payload_admin = {
            "resource": None,
            "kind": "holiday",
            "start_datetime": (now + timedelta(days=15)).isoformat(),
            "end_datetime": (now + timedelta(days=16)).isoformat(),
            "reason": "University Convocation Day"
        }
        resp_admin = self.client.post(url, payload_admin, format='json')
        self.assertEqual(resp_admin.status_code, status.HTTP_201_CREATED)

    def test_student_and_faculty_forbidden_from_maintenance_crud(self):
        now = timezone.now()
        payload = {
            "resource": self.resource.id,
            "kind": "maintenance",
            "start_datetime": (now + timedelta(days=3)).isoformat(),
            "end_datetime": (now + timedelta(days=3, hours=2)).isoformat(),
            "reason": "Student Servicing Attempt"
        }
        url = reverse('maintenance-list-create')

        # Student denied
        self.auth(self.student)
        resp_student = self.client.post(url, payload, format='json')
        self.assertEqual(resp_student.status_code, status.HTTP_403_FORBIDDEN)

        # Faculty denied
        self.auth(self.faculty)
        resp_faculty = self.client.post(url, payload, format='json')
        self.assertEqual(resp_faculty.status_code, status.HTTP_403_FORBIDDEN)

    def test_custodian_delete_permissions(self):
        now = timezone.now()
        b_own = Blackout.objects.create(
            resource=self.resource,
            start_datetime=now + timedelta(days=4),
            end_datetime=now + timedelta(days=4, hours=2),
            reason="Own Window",
            created_by=self.custodian
        )
        b_other = Blackout.objects.create(
            resource=self.other_resource,
            start_datetime=now + timedelta(days=4),
            end_datetime=now + timedelta(days=4, hours=2),
            reason="Other Window",
            created_by=self.other_custodian
        )

        self.auth(self.custodian)
        # Deleting own succeeds
        resp_del_own = self.client.delete(reverse('maintenance-detail', kwargs={'pk': b_own.pk}))
        self.assertEqual(resp_del_own.status_code, status.HTTP_204_NO_CONTENT)

        # Deleting other custodian's window fails
        resp_del_other = self.client.delete(reverse('maintenance-detail', kwargs={'pk': b_other.pk}))
        self.assertEqual(resp_del_other.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------
    # 2. OVERLAP HANDLING & CONFLICTING BOOKINGS CANCELLATION
    # -------------------------------------------------------------
    def test_overlap_detection_without_cancel_conflicting_returns_409(self):
        now = timezone.now()
        start_bk = now + timedelta(days=7, hours=10)
        end_bk = now + timedelta(days=7, hours=12)

        # Create active approved booking
        booking = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Autonomous Robotics Experiment",
            status=Booking.STATUS_APPROVED
        )
        slot = BookingSlot.objects.create(
            booking=booking,
            resource=self.resource,
            period=DateTimeTZRange(start_bk, end_bk),
            is_active=True
        )

        self.auth(self.custodian)
        url = reverse('maintenance-list-create')
        # Propose maintenance window covering 09:00 to 13:00 on the same day
        payload = {
            "resource": self.resource.id,
            "kind": "maintenance",
            "start_datetime": (now + timedelta(days=7, hours=9)).isoformat(),
            "end_datetime": (now + timedelta(days=7, hours=13)).isoformat(),
            "reason": "Emergency Hydraulic Servicing",
            "cancel_conflicting": False
        }
        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp.data["error"], "overlapping_bookings")
        self.assertEqual(resp.data["count"], 1)
        self.assertIn("affected_bookings", resp.data)
        self.assertEqual(resp.data["affected_bookings"][0]["id"], booking.id)

        # Ensure booking was NOT modified and slot remains active
        booking.refresh_from_db()
        slot.refresh_from_db()
        self.assertEqual(booking.status, Booking.STATUS_APPROVED)
        self.assertTrue(slot.is_active)

    def test_overlap_with_cancel_conflicting_true_cancels_and_releases_slot(self):
        now = timezone.now()
        start_bk = now + timedelta(days=8, hours=10)
        end_bk = now + timedelta(days=8, hours=12)

        booking = Booking.objects.create(
            requester=self.student,
            resource=self.resource,
            purpose="Drone Flight Navigation Test",
            status=Booking.STATUS_APPROVED
        )
        slot = BookingSlot.objects.create(
            booking=booking,
            resource=self.resource,
            period=DateTimeTZRange(start_bk, end_bk),
            is_active=True
        )

        self.auth(self.custodian)
        url = reverse('maintenance-list-create')
        payload = {
            "resource": self.resource.id,
            "kind": "maintenance",
            "start_datetime": (now + timedelta(days=8, hours=9)).isoformat(),
            "end_datetime": (now + timedelta(days=8, hours=13)).isoformat(),
            "reason": "Emergency Hydraulic Servicing",
            "cancel_conflicting": True
        }
        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("blackout", resp.data)
        self.assertEqual(resp.data["count"], 1)

        # Verify booking was cancelled and slot was released in single transaction
        booking.refresh_from_db()
        slot.refresh_from_db()
        self.assertEqual(booking.status, Booking.STATUS_CANCELLED)
        self.assertFalse(slot.is_active)
        self.assertIn("Emergency Hydraulic Servicing", booking.decision_note)

    # -------------------------------------------------------------
    # 3. BOOKING ATTEMPTS DURING MAINTENANCE ARE REJECTED
    # -------------------------------------------------------------
    def test_booking_attempt_during_resource_blackout_rejected(self):
        now = timezone.now()
        maint_start = now + timedelta(days=12, hours=8)
        maint_end = now + timedelta(days=12, hours=16)

        Blackout.objects.create(
            resource=self.resource,
            kind=Blackout.KIND_MAINTENANCE,
            start_datetime=maint_start,
            end_datetime=maint_end,
            reason="HVAC Air Purge",
            created_by=self.custodian
        )

        # Student attempts to book during maintenance window
        self.auth(self.student)
        url_book = reverse('booking-list-create')
        payload = {
            "resource": self.resource.id,
            "start_time": (now + timedelta(days=12, hours=10)).isoformat(),
            "end_time": (now + timedelta(days=12, hours=12)).isoformat(),
            "purpose": "Trying to book during scheduled maintenance"
        }
        resp = self.client.post(url_book, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts with blackout", str(resp.data))

    def test_booking_attempt_during_campus_wide_blackout_rejected(self):
        now = timezone.now()
        holiday_start = now + timedelta(days=20, hours=0)
        holiday_end = now + timedelta(days=21, hours=0)

        Blackout.objects.create(
            resource=None, # Campus-wide
            kind=Blackout.KIND_HOLIDAY,
            start_datetime=holiday_start,
            end_datetime=holiday_end,
            reason="National Holiday",
            created_by=self.admin
        )

        self.auth(self.student)
        url_book = reverse('booking-list-create')
        payload = {
            "resource": self.resource.id,
            "start_time": (now + timedelta(days=20, hours=10)).isoformat(),
            "end_time": (now + timedelta(days=20, hours=12)).isoformat(),
            "purpose": "Booking on campus holiday"
        }
        resp = self.client.post(url_book, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts with blackout", str(resp.data))

    # -------------------------------------------------------------
    # 4. DYNAMIC RESOURCE STATUS UNDER MAINTENANCE
    # -------------------------------------------------------------
    def test_resource_status_automatically_reads_under_maintenance_during_active_window(self):
        now = timezone.now()
        # Create active window (started 1 hour ago, ends in 2 hours)
        b = Blackout.objects.create(
            resource=self.resource,
            kind=Blackout.KIND_MAINTENANCE,
            start_datetime=now - timedelta(hours=1),
            end_datetime=now + timedelta(hours=2),
            reason="Active Live Calibration",
            created_by=self.custodian
        )

        # Model properties
        self.assertTrue(self.resource.is_under_maintenance)
        self.assertEqual(self.resource.status, Resource.STATUS_MAINTENANCE)
        self.assertEqual(self.resource.get_status_display(), "Under Maintenance")

        # Serialized endpoint
        self.auth(self.student)
        url_detail = reverse('resource-detail', kwargs={'pk': self.resource.pk})
        resp = self.client.get(url_detail)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "maintenance")
        self.assertEqual(resp.data["status_display"], "Under Maintenance")

        # Once deleted or expired, status reverts to available
        b.delete()
        self.assertFalse(self.resource.is_under_maintenance)
        self.assertEqual(self.resource.status, Resource.STATUS_AVAILABLE)

    # -------------------------------------------------------------
    # 5. AVAILABILITY ENDPOINT BACKGROUND EVENTS
    # -------------------------------------------------------------
    def test_availability_endpoint_returns_blackouts_as_background_events(self):
        now = timezone.now()
        start_w = now + timedelta(days=3, hours=8)
        end_w = now + timedelta(days=3, hours=14)

        Blackout.objects.create(
            resource=self.resource,
            kind=Blackout.KIND_DOWNTIME,
            start_datetime=start_w,
            end_datetime=end_w,
            reason="Cooling System Overhaul",
            created_by=self.custodian
        )

        self.auth(self.student)
        url_avail = reverse('resource-availability', kwargs={'pk': self.resource.pk})
        resp = self.client.get(url_avail)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        blackout_events = [e for e in resp.data["events"] if e.get("type") == "blackout"]
        self.assertGreaterEqual(len(blackout_events), 1)
        target = next(e for e in blackout_events if "Cooling System Overhaul" in e["title"])
        self.assertEqual(target["display"], "background")
        self.assertEqual(target["kind"], "downtime")

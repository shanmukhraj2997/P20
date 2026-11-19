import io
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from psycopg2.extras import DateTimeTZRange
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User, Notification
from resources.models import Resource, ResourceType, Consumable
from bookings.models import Booking, BookingSlot, BookingConsumable
from permissionslips.models import PermissionSlip, PermissionSlipAuditLog

class PermissionSlipTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users across roles
        self.admin = User.objects.create_superuser(
            username="admin_user", password="Password123!", email="admin@campus.edu", role=User.ROLE_ADMIN
        )
        self.facility_mgr = User.objects.create_user(
            username="facility_mgr", password="Password123!", email="fm@campus.edu", role=User.ROLE_FACILITY_MGR
        )
        self.dept_head_cs = User.objects.create_user(
            username="hod_cs", password="Password123!", email="hod_cs@campus.edu", role=User.ROLE_DEPT_HEAD, department="Computer Science"
        )
        self.dept_head_ee = User.objects.create_user(
            username="hod_ee", password="Password123!", email="hod_ee@campus.edu", role=User.ROLE_DEPT_HEAD, department="Electrical Engineering"
        )
        self.faculty_cs = User.objects.create_user(
            username="prof_smith", password="Password123!", email="smith@campus.edu", role=User.ROLE_FACILITY_MGR if False else User.ROLE_FACULTY, department="Computer Science"
        )
        self.student = User.objects.create_user(
            username="student_alice", password="Password123!", email="alice@campus.edu", role=User.ROLE_STUDENT, department="Computer Science"
        )

        # Resource
        self.res_type = ResourceType.objects.create(name="Lecture Halls", icon="chalkboard")
        self.room = Resource.objects.create(
            name="Auditorium A101",
            location="Block 3, Floor 1",
            capacity=250,
            resource_type=self.res_type,
            department="Computer Science",
            status=Resource.STATUS_AVAILABLE
        )

        # Dummy document
        self.dummy_pdf = SimpleUploadedFile(
            "official_order.pdf",
            b"%PDF-1.4 dummy pdf binary stream for testing permissions",
            content_type="application/pdf"
        )

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def test_submit_permission_slip_success(self):
        self.auth(self.faculty_cs)
        url = reverse('permission-slip-list-create')
        now = timezone.now()
        payload = {
            "reference_number": "UNIV/2026/CS/001",
            "resource": self.room.id,
            "department": "Computer Science",
            "purpose": "Annual University Tech Symposium",
            "start_datetime": (now + timedelta(days=5, hours=9)).isoformat(),
            "end_datetime": (now + timedelta(days=5, hours=17)).isoformat(),
            "issuing_authority_name": "Dr. Robert Dean",
            "issuing_authority_designation": "Dean of Academic Affairs",
            "issue_date": (now - timedelta(days=2)).date().isoformat(),
            "uploaded_document": self.dummy_pdf
        }

        resp = self.client.post(url, payload, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["reference_number"], "UNIV/2026/CS/001")
        self.assertEqual(resp.data["verification_status"], PermissionSlip.STATUS_SUBMITTED)

        slip = PermissionSlip.objects.get(reference_number="UNIV/2026/CS/001")
        self.assertEqual(slip.requester, self.faculty_cs)
        self.assertEqual(slip.audit_logs.count(), 1)
        self.assertEqual(slip.audit_logs.first().action, "submitted")

    def test_submit_permission_slip_invalid_file_extension_fails(self):
        self.auth(self.faculty_cs)
        url = reverse('permission-slip-list-create')
        now = timezone.now()
        bad_file = SimpleUploadedFile("malicious.exe", b"executable code", content_type="application/octet-stream")
        payload = {
            "reference_number": "UNIV/2026/CS/002",
            "resource": self.room.id,
            "department": "Computer Science",
            "purpose": "Symposium",
            "start_datetime": (now + timedelta(days=5, hours=9)).isoformat(),
            "end_datetime": (now + timedelta(days=5, hours=17)).isoformat(),
            "issuing_authority_name": "Dean",
            "issuing_authority_designation": "Dean",
            "issue_date": (now - timedelta(days=1)).date().isoformat(),
            "uploaded_document": bad_file
        }
        resp = self.client.post(url, payload, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_permission_slip_role_visibility_scoping(self):
        now = timezone.now()
        # Slip 1: CS Dept
        s1 = PermissionSlip.objects.create(
            reference_number="CS-001",
            requester=self.faculty_cs,
            resource=self.room,
            department="Computer Science",
            purpose="CS Hackathon",
            start_datetime=now + timedelta(days=2, hours=9),
            end_datetime=now + timedelta(days=2, hours=13),
            uploaded_document=self.dummy_pdf,
            issuing_authority_name="Registrar",
            issuing_authority_designation="Registrar",
            issue_date=(now - timedelta(days=1)).date()
        )
        # Slip 2: EE Dept
        s2 = PermissionSlip.objects.create(
            reference_number="EE-001",
            requester=self.student,
            resource=self.room,
            department="Electrical Engineering",
            purpose="Robotics Workshop",
            start_datetime=now + timedelta(days=3, hours=9),
            end_datetime=now + timedelta(days=3, hours=13),
            uploaded_document=self.dummy_pdf,
            issuing_authority_name="Dean EE",
            issuing_authority_designation="Dean",
            issue_date=(now - timedelta(days=1)).date()
        )

        url = reverse('permission-slip-list-create')

        # 1. Faculty CS only sees their own slip
        self.auth(self.faculty_cs)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ref_numbers = [item["reference_number"] for item in resp.data]
        self.assertIn("CS-001", ref_numbers)
        self.assertNotIn("EE-001", ref_numbers)

        # 2. Dept Head EE sees EE-001
        self.auth(self.dept_head_ee)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ref_numbers = [item["reference_number"] for item in resp.data]
        self.assertIn("EE-001", ref_numbers)

        # 3. Admin sees both
        self.auth(self.admin)
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ref_numbers = [item["reference_number"] for item in resp.data]
        self.assertIn("CS-001", ref_numbers)
        self.assertIn("EE-001", ref_numbers)

    def test_verification_workflow(self):
        now = timezone.now()
        slip = PermissionSlip.objects.create(
            reference_number="VERIFY-001",
            requester=self.faculty_cs,
            resource=self.room,
            department="Computer Science",
            purpose="Guest Lecture Series",
            start_datetime=now + timedelta(days=4, hours=10),
            end_datetime=now + timedelta(days=4, hours=12),
            uploaded_document=self.dummy_pdf,
            issuing_authority_name="Dean",
            issuing_authority_designation="Dean",
            issue_date=(now - timedelta(days=1)).date()
        )

        # Unauthorized user (student) cannot verify -> 403
        self.auth(self.student)
        url_verify = reverse('permission-slip-verify', kwargs={'pk': slip.pk})
        resp = self.client.post(url_verify, {"verification_notes": "All looks good"})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # Authorized user (Dept Head CS) verifies -> 200
        self.auth(self.dept_head_cs)
        resp = self.client.post(url_verify, {"verification_notes": "Official signature verified with Registrar."})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["verification_status"], PermissionSlip.STATUS_VERIFIED)

        slip.refresh_from_db()
        self.assertEqual(slip.verification_status, PermissionSlip.STATUS_VERIFIED)
        self.assertEqual(slip.verified_by, self.dept_head_cs)
        self.assertIsNotNone(slip.verified_at)
        self.assertEqual(slip.audit_logs.filter(action="verified").count(), 1)

    def test_rejection_workflow(self):
        now = timezone.now()
        slip = PermissionSlip.objects.create(
            reference_number="REJECT-001",
            requester=self.faculty_cs,
            resource=self.room,
            department="Computer Science",
            purpose="Unapproved Event",
            start_datetime=now + timedelta(days=4, hours=10),
            end_datetime=now + timedelta(days=4, hours=12),
            uploaded_document=self.dummy_pdf,
            issuing_authority_name="Unknown",
            issuing_authority_designation="Unknown",
            issue_date=(now - timedelta(days=1)).date()
        )

        self.auth(self.dept_head_cs)
        url_reject = reverse('permission-slip-reject', kwargs={'pk': slip.pk})

        # Missing reason -> 400
        resp = self.client.post(url_reject, {})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # With reason -> 200
        resp = self.client.post(url_reject, {"rejection_reason": "Authority signature could not be verified by Registrar office."})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["verification_status"], PermissionSlip.STATUS_REJECTED)

        slip.refresh_from_db()
        self.assertEqual(slip.verification_status, PermissionSlip.STATUS_REJECTED)

    def test_conflict_detection_and_override_allocation(self):
        now = timezone.now()
        start_time = now + timedelta(days=6, hours=10)
        end_time = now + timedelta(days=6, hours=14)

        # 1. Create conflicting website booking by student
        web_booking = Booking.objects.create(
            requester=self.student,
            resource=self.room,
            purpose="Student Study Group",
            status=Booking.STATUS_CONFIRMED,
            source=Booking.SOURCE_WEBSITE
        )
        slot = BookingSlot.objects.create(
            booking=web_booking,
            resource=self.room,
            period=DateTimeTZRange(start_time, end_time),
            is_active=True
        )

        # Add consumable to booking to test restoration
        consumable = Consumable.objects.create(
            name="Projector Mic",
            unit="piece",
            resource=self.room,
            stock=5,
            reorder_level=1
        )
        BookingConsumable.objects.create(
            booking=web_booking,
            consumable=consumable,
            quantity=2
        )
        consumable.stock -= 2
        consumable.save()

        # 2. Create verified permission slip for the same time window
        slip = PermissionSlip.objects.create(
            reference_number="ALLOC-001",
            requester=self.faculty_cs,
            resource=self.room,
            department="Computer Science",
            purpose="National Conference Keynote",
            start_datetime=start_time,
            end_datetime=end_time,
            uploaded_document=self.dummy_pdf,
            issuing_authority_name="Registrar",
            issuing_authority_designation="Registrar",
            issue_date=(now - timedelta(days=1)).date(),
            verification_status=PermissionSlip.STATUS_VERIFIED,
            verified_by=self.dept_head_cs,
            verified_at=now
        )

        # 3. Check conflicts endpoint
        self.auth(self.facility_mgr)
        url_conflicts = reverse('permission-slip-conflicts', kwargs={'pk': slip.pk})
        resp_conflicts = self.client.get(url_conflicts)
        self.assertEqual(resp_conflicts.status_code, status.HTTP_200_OK)
        self.assertTrue(resp_conflicts.data["has_conflicts"])
        self.assertTrue(resp_conflicts.data["can_override"])
        self.assertEqual(len(resp_conflicts.data["website_conflicts"]), 1)
        self.assertEqual(resp_conflicts.data["website_conflicts"][0]["booking_id"], web_booking.id)

        # 4. Attempt allocation without override -> 400 Bad Request
        url_allocate = reverse('permission-slip-allocate', kwargs={'pk': slip.pk})
        resp_no_override = self.client.post(url_allocate, {"override": False})
        self.assertEqual(resp_no_override.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp_no_override.data["error"], "conflict_detected")

        # 5. Non-admin attempting override -> 403 Forbidden
        self.auth(self.dept_head_cs)
        resp_unauth_override = self.client.post(url_allocate, {
            "override": True,
            "override_reason": "High priority conference"
        })
        self.assertEqual(resp_unauth_override.status_code, status.HTTP_403_FORBIDDEN)

        # 6. Facility Manager executes atomic override -> 201 Created
        self.auth(self.facility_mgr)
        resp_override = self.client.post(url_allocate, {
            "override": True,
            "override_reason": "Priority University Event: National Conference Keynote sanctioned by Registrar"
        })
        self.assertEqual(resp_override.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_override.data["displaced_bookings_count"], 1)

        # Verify old booking state
        web_booking.refresh_from_db()
        self.assertEqual(web_booking.status, Booking.STATUS_CANCELLED)
        self.assertIn("Displaced by Official University Permission Slip", web_booking.decision_note)
        slot.refresh_from_db()
        self.assertFalse(slot.is_active)  # Slot freed!

        # Verify consumables restored
        consumable.refresh_from_db()
        self.assertEqual(consumable.stock, 5)

        # Verify notification sent to displaced student
        notif = Notification.objects.filter(user=self.student, type=Notification.TYPE_CANCELLATION).first()
        self.assertIsNotNone(notif)
        self.assertIn("National Conference Keynote", notif.message)

        # Verify new official booking created
        slip.refresh_from_db()
        self.assertEqual(slip.verification_status, PermissionSlip.STATUS_ALLOCATED)
        self.assertIsNotNone(slip.linked_booking)
        new_booking = slip.linked_booking
        self.assertEqual(new_booking.source, Booking.SOURCE_OFFICIAL_PERMISSION)
        self.assertEqual(new_booking.status, Booking.STATUS_CONFIRMED)

        # Verify new active slot exists
        new_slot = new_booking.slots.filter(is_active=True).first()
        self.assertIsNotNone(new_slot)
        self.assertEqual(new_slot.period.lower, start_time)
        self.assertEqual(new_slot.period.upper, end_time)

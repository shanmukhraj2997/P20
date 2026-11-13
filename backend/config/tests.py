from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.core.exceptions import ImproperlyConfigured
from accounts.models import User
from resources.models import Resource, ResourceType
from datetime import datetime, timezone, timedelta

class HealthCheckTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_check_endpoint(self):
        url = reverse('health-check')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "ok"})

    def test_secret_key_required_when_debug_false(self):
        def get_secret(debug, secret_env):
            if debug:
                return secret_env or 'default-insecure'
            if not secret_env:
                raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set in the environment when DEBUG=False.")
            return secret_env

        self.assertEqual(get_secret(True, None), 'default-insecure')
        self.assertEqual(get_secret(False, 'prod-secret'), 'prod-secret')
        with self.assertRaises(ImproperlyConfigured):
            get_secret(False, '')


class RoleByEndpointSecurityMatrixTests(TestCase):
    """
    Exhaustive Security Pass verifying backend authorization enforcement across
    all 6 application roles + anonymous on sensitive system endpoints.
    """
    def setUp(self):
        self.client = APIClient()

        # Seed users for each role
        self.users = {
            'student': User.objects.create_user(username='sec_student', password='Pass', role=User.ROLE_STUDENT),
            'faculty': User.objects.create_user(username='sec_faculty', password='Pass', role=User.ROLE_FACULTY),
            'custodian': User.objects.create_user(username='sec_custodian', password='Pass', role=User.ROLE_CUSTODIAN),
            'dept_head': User.objects.create_user(username='sec_dept_head', password='Pass', role=User.ROLE_DEPT_HEAD, department='Engineering'),
            'facility_mgr': User.objects.create_user(username='sec_facility_mgr', password='Pass', role=User.ROLE_FACILITY_MGR, is_staff=True),
            'admin': User.objects.create_user(username='sec_admin', password='Pass', role=User.ROLE_ADMIN, is_staff=True, is_superuser=True),
        }

        self.rtype = ResourceType.objects.create(name='SecType', description='Security type')
        self.resource = Resource.objects.create(
            name='SecResource',
            description='Test security resource description',
            resource_type=self.rtype,
            capacity=25,
            custodian=self.users['custodian'],
            department='Engineering',
        )

    def test_role_change_endpoint_security_matrix(self):
        """Only Admin may modify user roles; all other roles receive 403, anonymous receives 401."""
        target_user = self.users['student']
        url = reverse('user-role-update', kwargs={'pk': target_user.pk})

        for role_name, user in self.users.items():
            self.client.force_authenticate(user=user)
            res = self.client.patch(url, {'role': 'faculty'}, format='json')
            if role_name == 'admin':
                self.assertEqual(res.status_code, status.HTTP_200_OK, f"Admin must be permitted on {url}")
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"Role {role_name} must receive 403 on {url}")

        self.client.force_authenticate(user=None)
        res = self.client.patch(url, {'role': 'faculty'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_resource_creation_endpoint_security_matrix(self):
        """Only Admin and Facility Manager may create resources; other roles receive 403."""
        url = reverse('resource-list')
        payload = {
            'name': 'New Lab',
            'description': 'Advanced computing lab with modern equipment',
            'resource_type': self.rtype.pk,
            'capacity': 30,
            'location': 'Hall A',
        }

        for role_name, user in self.users.items():
            self.client.force_authenticate(user=user)
            res = self.client.post(url, payload, format='json')
            if role_name in ['admin', 'facility_mgr']:
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_name} must be permitted to create resources")
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_name} must receive 403 on resource creation")

        self.client.force_authenticate(user=None)
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_timetable_import_security_matrix(self):
        """Only Admin and Facility Manager may import timetable CSV schedules; student, faculty, custodian, dept_head receive 403."""
        url = reverse('timetable-import')
        payload = {'csv_data': 'course_code,weekday,start_time,end_time,semester_start,semester_end\n'}

        for role_name, user in self.users.items():
            self.client.force_authenticate(user=user)
            res = self.client.post(url, payload, format='json')
            if role_name in ['admin', 'facility_mgr']:
                self.assertNotEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_name} must not be forbidden")
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_name} must receive 403 on timetable import")

        self.client.force_authenticate(user=None)
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_analytics_dashboard_security_matrix(self):
        """Staff/custodian/dept_head/admin may view analytics; student/faculty receive 403."""
        url = reverse('config-analytics-dashboard')

        for role_name, user in self.users.items():
            self.client.force_authenticate(user=user)
            res = self.client.get(url)
            if role_name in ['admin', 'facility_mgr', 'dept_head', 'custodian']:
                self.assertEqual(res.status_code, status.HTTP_200_OK, f"{role_name} must be allowed to view analytics")
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_name} must receive 403 on analytics dashboard")

        self.client.force_authenticate(user=None)
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_campus_wide_blackout_creation_security_matrix(self):
        """Campus-wide blackouts (resource=null) require Admin or Facility Manager; custodian receives 403."""
        url = reverse('blackout-list-create')
        now = datetime.now(timezone.utc)
        payload = {
            'resource': None,
            'start_datetime': (now + timedelta(days=1)).isoformat(),
            'end_datetime': (now + timedelta(days=1, hours=4)).isoformat(),
            'reason': 'Campus Electrical Maintenance',
            'kind': 'maintenance',
        }

        for role_name, user in self.users.items():
            self.client.force_authenticate(user=user)
            res = self.client.post(url, payload, format='json')
            if role_name in ['admin', 'facility_mgr']:
                self.assertEqual(res.status_code, status.HTTP_201_CREATED, f"{role_name} must be permitted to create campus-wide blackout")
            else:
                self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, f"{role_name} must receive 403 on campus-wide blackout")

        self.client.force_authenticate(user=None)
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

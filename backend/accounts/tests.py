from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
from accounts.models import User
from accounts.permissions import (
    IsStudent, IsFaculty, IsCustodian, IsDepartmentHead, IsFacilityManager, IsAdminRole
)

class UserModelTests(TestCase):
    def test_user_creation_with_roles(self):
        roles = [
            (User.ROLE_STUDENT, 'is_student_role'),
            (User.ROLE_FACULTY, 'is_faculty_role'),
            (User.ROLE_CUSTODIAN, 'is_custodian_role'),
            (User.ROLE_DEPT_HEAD, 'is_dept_head_role'),
            (User.ROLE_FACILITY_MGR, 'is_facility_mgr_role'),
            (User.ROLE_ADMIN, 'is_admin_role'),
        ]
        for role_code, attr_name in roles:
            user = User.objects.create_user(
                username=f"user_{role_code}",
                password="Password123!",
                role=role_code
            )
            self.assertEqual(user.role, role_code)
            self.assertTrue(getattr(user, attr_name))

class AuthenticationAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.register_url = reverse('auth-register')
        self.login_url = reverse('auth-login')
        self.logout_url = reverse('auth-logout')
        self.me_url = reverse('auth-me')
        self.roles_url = reverse('auth-roles')

    def test_user_registration(self):
        payload = {
            "username": "new_student",
            "password": "Password123!",
            "email": "student@campus.edu",
            "department": "Computer Science"
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["username"], "new_student")
        self.assertEqual(response.data["user"]["role"], "student")

    def test_registration_cannot_set_role(self):
        # Even if a malicious client sends role='admin' or 'faculty', registration forces role='student'
        payload = {
            "username": "sneaky_admin_attempt",
            "password": "Password123!",
            "email": "sneaky@campus.edu",
            "role": "admin",
            "department": "IT"
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["user"]["role"], "student")

        user = User.objects.get(username="sneaky_admin_attempt")
        self.assertEqual(user.role, User.ROLE_STUDENT)

    def test_admin_can_update_user_role(self):
        admin = User.objects.create_user(username="admin_user", password="Password123!", role=User.ROLE_ADMIN)
        admin_token = Token.objects.create(user=admin)
        target = User.objects.create_user(username="target_user", password="Password123!", role=User.ROLE_STUDENT)

        url = reverse('user-role-update', kwargs={'pk': target.id})
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + admin_token.key)
        response = self.client.patch(url, {"role": "faculty"}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        target.refresh_from_db()
        self.assertEqual(target.role, User.ROLE_FACULTY)

    def test_non_admin_cannot_update_user_role(self):
        student = User.objects.create_user(username="regular_student", password="Password123!", role=User.ROLE_STUDENT)
        student_token = Token.objects.create(user=student)
        target = User.objects.create_user(username="another_user", password="Password123!", role=User.ROLE_STUDENT)

        url = reverse('user-role-update', kwargs={'pk': target.id})

        # Anonymous request rejected with 401
        self.client.credentials()
        res_anon = self.client.patch(url, {"role": "admin"}, format='json')
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        # Student request rejected with 403
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + student_token.key)
        res_forbidden = self.client.patch(url, {"role": "admin"}, format='json')
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)
        target.refresh_from_db()
        self.assertEqual(target.role, User.ROLE_STUDENT)

    def test_user_login(self):
        user = User.objects.create_user(
            username="login_user",
            password="Password123!",
            role="faculty"
        )
        payload = {"username": "login_user", "password": "Password123!"}
        response = self.client.post(self.login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["user"]["role"], "faculty")

    def test_protected_me_endpoint(self):
        user = User.objects.create_user(
            username="me_user",
            password="Password123!",
            role="custodian"
        )
        token = Token.objects.create(user=user)

        # Unauthenticated request fails
        response_unauth = self.client.get(self.me_url)
        self.assertEqual(response_unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        # Authenticated request succeeds
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)
        response_auth = self.client.get(self.me_url)
        self.assertEqual(response_auth.status_code, status.HTTP_200_OK)
        self.assertEqual(response_auth.data["username"], "me_user")
        self.assertEqual(response_auth.data["role"], "custodian")

    def test_logout(self):
        user = User.objects.create_user(
            username="logout_user",
            password="Password123!",
            role="dept_head"
        )
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

        response = self.client.post(self.logout_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Token.objects.filter(key=token.key).exists())

    def test_roles_endpoint(self):
        response = self.client.get(self.roles_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 6)

    def test_dashboard_stats_endpoint(self):
        user = User.objects.create_user(username="stats_user", password="Password123!", role="student")
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

        url = reverse('dashboard-stats')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("total_resources", response.data)
        self.assertIn("available_resources", response.data)
        self.assertIn("my_bookings", response.data)
        self.assertIn("upcoming_bookings", response.data)

class PermissionClassTests(TestCase):
    def test_role_permission_classes(self):
        perm_map = [
            (User.ROLE_STUDENT, IsStudent()),
            (User.ROLE_FACULTY, IsFaculty()),
            (User.ROLE_CUSTODIAN, IsCustodian()),
            (User.ROLE_DEPT_HEAD, IsDepartmentHead()),
            (User.ROLE_FACILITY_MGR, IsFacilityManager()),
            (User.ROLE_ADMIN, IsAdminRole()),
        ]

        class DummyRequest:
            def __init__(self, user):
                self.user = user

        for role_code, perm_obj in perm_map:
            user = User.objects.create_user(
                username=f"perm_user_{role_code}",
                password="Password123!",
                role=role_code
            )
            request = DummyRequest(user)
            self.assertTrue(perm_obj.has_permission(request, None))

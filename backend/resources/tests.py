from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework.authtoken.models import Token
from accounts.models import User
from resources.models import ResourceType, Resource

class ResourceModelTests(TestCase):
    def setUp(self):
        self.res_type = ResourceType.objects.create(name="Computer Lab", icon="monitor")
        self.custodian = User.objects.create_user(username="custodian1", password="Password123!", role=User.ROLE_CUSTODIAN)

    def test_resource_type_creation(self):
        self.assertEqual(str(self.res_type), "Computer Lab")

    def test_resource_creation(self):
        res = Resource.objects.create(
            name="Lab 101",
            resource_type=self.res_type,
            description="Testing Lab",
            capacity=30,
            location="Building A, Room 101",
            custodian=self.custodian,
            features=["Wi-Fi", "Projector"],
            status=Resource.STATUS_AVAILABLE
        )
        self.assertEqual(res.name, "Lab 101")
        self.assertEqual(res.capacity, 30)
        self.assertEqual(res.custodian, self.custodian)

class ResourceAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.res_type_1 = ResourceType.objects.create(name="Computer Lab", icon="monitor")
        self.res_type_2 = ResourceType.objects.create(name="Classroom", icon="book-open")

        self.student = User.objects.create_user(username="student1", password="Password123!", role=User.ROLE_STUDENT)
        self.custodian = User.objects.create_user(username="custodian1", password="Password123!", role=User.ROLE_CUSTODIAN)
        self.admin = User.objects.create_user(username="admin1", password="Password123!", role=User.ROLE_ADMIN)

        self.res1 = Resource.objects.create(
            name="Turing AI Lab",
            resource_type=self.res_type_1,
            description="Advanced GPU workstations",
            capacity=60,
            location="Turing Block 301",
            custodian=self.custodian,
            status=Resource.STATUS_AVAILABLE
        )

        self.res2 = Resource.objects.create(
            name="Raman Lecture Hall",
            resource_type=self.res_type_2,
            description="Physics lectures",
            capacity=120,
            location="Raman Wing 101",
            custodian=self.custodian,
            status=Resource.STATUS_MAINTENANCE
        )

    def test_get_resource_types(self):
        url = reverse('resource-type-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_list_all_resources(self):
        url = reverse('resource-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_search_resources(self):
        url = reverse('resource-list') + '?search=Turing'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Turing AI Lab")

    def test_filter_by_type(self):
        url = reverse('resource-list') + f'?resource_type={self.res_type_2.id}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Raman Lecture Hall")

    def test_filter_by_status(self):
        url = reverse('resource-list') + '?status=maintenance'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Raman Lecture Hall")

    def test_filter_by_min_capacity(self):
        url = reverse('resource-list') + '?min_capacity=100'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Raman Lecture Hall")

    def test_get_resource_detail(self):
        url = reverse('resource-detail', kwargs={'pk': self.res1.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Turing AI Lab")
        self.assertEqual(response.data["custodian_name"], "custodian1")

    def test_unauthorized_update_prevention(self):
        url = reverse('resource-detail', kwargs={'pk': self.res1.pk})
        token = Token.objects.create(user=self.student)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

        response = self.client.put(url, {'name': 'Hacked Name'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_custodian_authorized_update(self):
        url = reverse('resource-detail', kwargs={'pk': self.res1.pk})
        token = Token.objects.create(user=self.custodian)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

        payload = {
            'name': 'Updated Turing AI Lab',
            'resource_type': self.res_type_1.id,
            'description': 'Updated description',
            'capacity': 65,
            'location': 'Turing Block 301',
            'status': 'available'
        }
        response = self.client.put(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Updated Turing AI Lab")
        self.assertEqual(response.data["capacity"], 65)

    def test_admin_authorized_update(self):
        url = reverse('resource-detail', kwargs={'pk': self.res2.pk})
        token = Token.objects.create(user=self.admin)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

        payload = {
            'name': 'Admin Updated Hall',
            'resource_type': self.res_type_2.id,
            'description': 'Admin edit',
            'capacity': 150,
            'location': 'Raman Wing 101',
            'status': 'available'
        }
        response = self.client.put(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Admin Updated Hall")

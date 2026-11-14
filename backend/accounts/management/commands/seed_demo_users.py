from django.core.management.base import BaseCommand
from accounts.models import User

class Command(BaseCommand):
    help = 'Seeds standard demo users for all 6 platform roles with known credentials.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Starting demo users seed process...'))

        demo_users = [
            {
                'username': 'demo_student',
                'email': 'demo_student@campus.edu',
                'role': User.ROLE_STUDENT,
                'first_name': 'Alex',
                'last_name': 'Student',
                'department': 'Computer Science',
                'is_staff': False,
                'is_superuser': False,
            },
            {
                'username': 'demo_faculty',
                'email': 'demo_faculty@campus.edu',
                'role': User.ROLE_FACULTY,
                'first_name': 'Prof. Robert',
                'last_name': 'Langdon',
                'department': 'Computer Science',
                'is_staff': False,
                'is_superuser': False,
            },
            {
                'username': 'demo_custodian',
                'email': 'demo_custodian@campus.edu',
                'role': User.ROLE_CUSTODIAN,
                'first_name': 'Sarah',
                'last_name': 'Jenkins',
                'department': 'Campus Infrastructure & Facilities',
                'is_staff': False,
                'is_superuser': False,
            },
            {
                'username': 'demo_dept_head',
                'email': 'demo_dept_head@campus.edu',
                'role': User.ROLE_DEPT_HEAD,
                'first_name': 'Dr. Eleanor',
                'last_name': 'Vance',
                'department': 'Computer Science',
                'is_staff': False,
                'is_superuser': False,
            },
            {
                'username': 'demo_facility_mgr',
                'email': 'demo_facility_mgr@campus.edu',
                'role': User.ROLE_FACILITY_MGR,
                'first_name': 'Marcus',
                'last_name': 'Vance',
                'department': 'Campus Infrastructure & Facilities',
                'is_staff': True,
                'is_superuser': False,
            },
            {
                'username': 'demo_admin',
                'email': 'demo_admin@campus.edu',
                'role': User.ROLE_ADMIN,
                'first_name': 'System',
                'last_name': 'Administrator',
                'department': 'Central IT Administration',
                'is_staff': True,
                'is_superuser': True,
            },
        ]

        count = 0
        password = 'DemoPass123!'
        for udata in demo_users:
            for uname in [udata['username'], udata['role']]:
                user, created = User.objects.get_or_create(
                    username=uname,
                    defaults={**udata, 'username': uname}
                )
                user.role = udata['role']
                user.email = udata['email']
                user.first_name = udata['first_name']
                user.last_name = udata['last_name']
                user.department = udata['department']
                user.is_staff = udata['is_staff']
                user.is_superuser = udata['is_superuser']
                user.set_password(password)
                user.save()
                count += 1
                status_text = 'Created' if created else 'Updated'
                self.stdout.write(f"  - [{status_text}] {user.username} (Role: {user.get_role_display()})")

        self.stdout.write(self.style.SUCCESS(f'Successfully seeded {count} platform users.'))

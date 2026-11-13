from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    ROLE_STUDENT = 'student'
    ROLE_FACULTY = 'faculty'
    ROLE_CUSTODIAN = 'custodian'
    ROLE_DEPT_HEAD = 'dept_head'
    ROLE_FACILITY_MGR = 'facility_mgr'
    ROLE_ADMIN = 'admin'

    ROLE_CHOICES = [
        (ROLE_STUDENT, 'Student'),
        (ROLE_FACULTY, 'Faculty / Staff'),
        (ROLE_CUSTODIAN, 'Resource Custodian'),
        (ROLE_DEPT_HEAD, 'Department Head'),
        (ROLE_FACILITY_MGR, 'Facility Manager'),
        (ROLE_ADMIN, 'Administrator'),
    ]

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default=ROLE_STUDENT,
        help_text="Role governing platform permissions."
    )
    department = models.CharField(max_length=100, blank=True, null=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    @property
    def is_student_role(self):
        return self.role == self.ROLE_STUDENT

    @property
    def is_faculty_role(self):
        return self.role == self.ROLE_FACULTY

    @property
    def is_custodian_role(self):
        return self.role == self.ROLE_CUSTODIAN

    @property
    def is_dept_head_role(self):
        return self.role == self.ROLE_DEPT_HEAD

    @property
    def is_facility_mgr_role(self):
        return self.role == self.ROLE_FACILITY_MGR

    @property
    def is_admin_role(self):
        return self.role == self.ROLE_ADMIN or self.is_superuser

class Notification(models.Model):
    TYPE_APPROVAL = 'approval'
    TYPE_REJECTION = 'rejection'
    TYPE_CANCELLATION = 'cancellation'
    TYPE_NO_SHOW = 'no_show'
    TYPE_MAINTENANCE_CANCELLATION = 'maintenance_cancellation'
    TYPE_REMINDER = 'reminder'
    TYPE_GENERAL = 'general'

    TYPE_CHOICES = [
        (TYPE_APPROVAL, 'Booking Approved'),
        (TYPE_REJECTION, 'Booking Rejected'),
        (TYPE_CANCELLATION, 'Booking Cancelled'),
        (TYPE_NO_SHOW, 'No-Show Released'),
        (TYPE_MAINTENANCE_CANCELLATION, 'Maintenance Cancellation'),
        (TYPE_REMINDER, 'Booking Reminder'),
        (TYPE_GENERAL, 'General Notification'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='notifications',
        help_text="User receiving the notification."
    )
    type = models.CharField(
        max_length=50,
        choices=TYPE_CHOICES,
        default=TYPE_GENERAL,
        help_text="Notification classification."
    )
    title = models.CharField(max_length=200, blank=True, default='')
    message = models.TextField(help_text="Notification message content.")
    read = models.BooleanField(default=False, help_text="Whether notification has been marked as read.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'

    def __str__(self):
        return f"[{self.type}] {self.user.username}: {self.message[:40]}"


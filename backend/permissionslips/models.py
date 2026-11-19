import os
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from accounts.models import User
from resources.models import Resource
from bookings.models import Booking

def validate_slip_document(file_obj):
    """
    Validates uploaded permission slip documents.
    Enforces maximum 10MB size and allowed file extensions (PDF, JPG, PNG).
    """
    max_size = 10 * 1024 * 1024  # 10MB
    if file_obj.size > max_size:
        raise ValidationError("File size exceeds maximum permitted limit of 10MB.")

    valid_extensions = ['.pdf', '.jpg', '.jpeg', '.png']
    ext = os.path.splitext(file_obj.name)[1].lower()
    if ext not in valid_extensions:
        raise ValidationError(f"Unsupported file format '{ext}'. Allowed formats: PDF, JPG, PNG.")

class PermissionSlip(models.Model):
    STATUS_SUBMITTED = 'submitted'
    STATUS_UNDER_REVIEW = 'under_review'
    STATUS_VERIFIED = 'verified'
    STATUS_REJECTED = 'rejected'
    STATUS_ALLOCATED = 'allocated'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_SUBMITTED, 'Submitted'),
        (STATUS_UNDER_REVIEW, 'Under Review'),
        (STATUS_VERIFIED, 'Verified & Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_ALLOCATED, 'Allocated (Room Booked)'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    reference_number = models.CharField(
        max_length=100,
        unique=True,
        help_text="Official university permission slip reference number."
    )
    requester = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='permission_slips',
        help_text="Faculty or staff member submitting the permission slip."
    )
    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name='permission_slips',
        help_text="Classroom, laboratory or facility requested for official allocation."
    )
    department = models.CharField(
        max_length=100,
        help_text="Department of the requesting teacher/staff."
    )
    purpose = models.TextField(
        help_text="Official purpose or academic event details."
    )
    start_datetime = models.DateTimeField(
        help_text="Requested allocation start date and time."
    )
    end_datetime = models.DateTimeField(
        help_text="Requested allocation end date and time."
    )
    uploaded_document = models.FileField(
        upload_to='permission_slips/%Y/%m/',
        validators=[validate_slip_document],
        help_text="Scanned copy of official signed permission slip (PDF, JPG, PNG)."
    )
    issuing_authority_name = models.CharField(
        max_length=150,
        help_text="Name of the official signing/issuing the permission (e.g. Dean, HOD, Registrar)."
    )
    issuing_authority_designation = models.CharField(
        max_length=150,
        help_text="Official designation of the issuing authority."
    )
    issue_date = models.DateField(
        help_text="Date on which the official permission slip was issued."
    )
    verification_status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default=STATUS_SUBMITTED,
        help_text="Current state of official verification workflow."
    )
    verification_notes = models.TextField(
        blank=True,
        default='',
        help_text="Notes recorded by the verifying university official."
    )
    verified_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_permission_slips',
        help_text="University authority who certified this permission slip."
    )
    verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the slip was verified."
    )
    linked_booking = models.OneToOneField(
        Booking,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='permission_slip',
        help_text="Official booking created in the system once allocated."
    )
    conflict_override_reason = models.TextField(
        blank=True,
        default='',
        help_text="Justification recorded if an existing website booking was overridden."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Official Permission Slip'
        verbose_name_plural = 'Official Permission Slips'

    def __str__(self):
        return f"Permission Slip [{self.reference_number}] - {self.resource.name} ({self.get_verification_status_display()})"

    def clean(self):
        if self.start_datetime and self.end_datetime:
            if self.end_datetime <= self.start_datetime:
                raise ValidationError("End date & time must be strictly after start date & time.")

    def log_action(self, action, performed_by=None, previous_status=None, new_status=None, notes=''):
        """
        Creates an immutable audit log record for this permission slip.
        """
        return PermissionSlipAuditLog.objects.create(
            slip=self,
            action=action,
            previous_status=previous_status or self.verification_status,
            new_status=new_status or self.verification_status,
            performed_by=performed_by,
            notes=notes
        )

class PermissionSlipAuditLog(models.Model):
    slip = models.ForeignKey(
        PermissionSlip,
        on_delete=models.CASCADE,
        related_name='audit_logs',
        help_text="Associated permission slip."
    )
    action = models.CharField(
        max_length=50,
        help_text="Action performed (e.g., submitted, under_review, verified, rejected, allocated, conflict_override)."
    )
    previous_status = models.CharField(max_length=30)
    new_status = models.CharField(max_length=30)
    performed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="User who executed this action."
    )
    notes = models.TextField(blank=True, default='')
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Permission Slip Audit Log'
        verbose_name_plural = 'Permission Slip Audit Logs'

    def __str__(self):
        actor = self.performed_by.username if self.performed_by else "System"
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M')}] {self.slip.reference_number}: {self.action} by {actor}"

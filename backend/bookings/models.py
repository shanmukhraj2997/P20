from django.db import models
from django.contrib.postgres.fields import DateTimeRangeField
from django.contrib.postgres.constraints import ExclusionConstraint
from accounts.models import User
from resources.models import Resource

class Booking(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending Approval'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    requester = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='bookings',
        help_text="User submitting the booking request."
    )
    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name='bookings',
        help_text="Resource requested for booking."
    )
    purpose = models.TextField(help_text="Reason/purpose for booking this campus resource.")
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_APPROVED,
        help_text="Booking status."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Booking'
        verbose_name_plural = 'Bookings'

    def __str__(self):
        return f"Booking #{self.id} - {self.resource.name} by {self.requester.username} [{self.get_status_display()}]"

class BookingSlot(models.Model):
    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name='slots',
        help_text="Associated parent booking."
    )
    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name='booking_slots',
        help_text="Target resource for range overlap enforcement."
    )
    period = DateTimeRangeField(help_text="PostgreSQL timestamp range [start, end).")
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this range slot is active for overlap enforcement."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['period']
        verbose_name = 'Booking Slot'
        verbose_name_plural = 'Booking Slots'
        constraints = [
            ExclusionConstraint(
                name='prevent_overlapping_booking_slots',
                expressions=[
                    ('resource', '='),
                    ('period', '&&'),
                ],
                condition=models.Q(is_active=True),
            )
        ]

    def __str__(self):
        return f"Slot #{self.id} for Resource #{self.resource_id} (Active: {self.is_active})"

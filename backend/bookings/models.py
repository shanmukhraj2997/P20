import uuid
import json
import urllib.parse
from django.db import models
from django.contrib.postgres.fields import DateTimeRangeField
from django.contrib.postgres.constraints import ExclusionConstraint
from django.utils import timezone
from accounts.models import User
from resources.models import Resource

class Booking(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_CONFIRMED = 'confirmed'
    STATUS_CHECKED_IN = 'checked_in'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_REJECTED = 'rejected'
    STATUS_NO_SHOW = 'no_show'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending Approval'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_CHECKED_IN, 'Checked In'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_NO_SHOW, 'No Show'),
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
    checkin_token = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True,
        null=True,
        help_text="Unique cryptographic token encoded inside QR code for secure verification."
    )
    checked_in_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when check-in was successfully completed."
    )
    checked_in_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='checkins_performed',
        help_text="User who authorized or performed check-in (self or desk staff)."
    )
    no_show_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when booking was flagged as no-show."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Booking'
        verbose_name_plural = 'Bookings'

    def save(self, *args, **kwargs):
        if not self.checkin_token:
            self.checkin_token = uuid.uuid4()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Booking #{self.id} - {self.resource.name} by {self.requester.username} [{self.get_status_display()}]"

    def get_primary_slot(self):
        slots = getattr(self, '_prefetched_objects_cache', {}).get('slots')
        if slots is not None:
            active = next((s for s in slots if s.is_active), None)
            return active or (slots[0] if slots else None)
        active = self.slots.filter(is_active=True).first()
        return active or self.slots.first()

    def get_checkin_window(self):
        """
        Returns (window_start, window_end, slot_start, slot_end).
        Check-in opens 15 minutes before slot start, and closes at 30 minutes
        after start time (or earlier if the slot itself ends before 30 minutes).
        """
        slot = self.get_primary_slot()
        if not slot or not slot.period or not slot.period.lower:
            return None, None, None, None
        slot_start = slot.period.lower
        slot_end = slot.period.upper
        window_start = slot_start - timezone.timedelta(minutes=15)
        window_end = min(slot_start + timezone.timedelta(minutes=30), slot_end)
        return window_start, window_end, slot_start, slot_end

    def generate_qr_svg(self):
        """
        Generates clean SVG markup encoding the check-in verification payload.
        """
        import qrcode
        import qrcode.image.svg

        payload = json.dumps({
            "booking_id": self.id,
            "token": str(self.checkin_token),
            "resource_id": self.resource_id,
            "resource_name": self.resource.name,
            "requester": self.requester.username,
        })
        factory = qrcode.image.svg.SvgImage
        qr_img = qrcode.make(payload, image_factory=factory, box_size=10, border=2)
        return qr_img.to_string(encoding='unicode')

    def generate_qr_data_url(self):
        """
        Returns data:image/svg+xml;utf8,... URL for direct frontend image rendering.
        """
        svg_str = self.generate_qr_svg()
        return f"data:image/svg+xml;utf8,{urllib.parse.quote(svg_str)}"

    def mark_as_no_show(self):
        """
        Atomically marks booking as no-show and releases active reservation slots.
        """
        from django.db import transaction
        with transaction.atomic():
            self.status = self.STATUS_NO_SHOW
            self.no_show_at = timezone.now()
            self.save()
            self.slots.update(is_active=False)

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

import uuid
import json
import urllib.parse
from django.db import models
from django.contrib.postgres.fields import DateTimeRangeField
from django.contrib.postgres.constraints import ExclusionConstraint
from django.utils import timezone
from django.conf import settings
from accounts.models import User
from resources.models import Resource

class BookingSeries(models.Model):
    FREQUENCY_WEEKLY = 'weekly'
    FREQUENCY_CHOICES = [
        (FREQUENCY_WEEKLY, 'Weekly'),
    ]

    requester = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='booking_series',
        help_text="User submitting the recurring booking request."
    )
    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name='booking_series',
        help_text="Resource reserved for the recurring series."
    )
    frequency = models.CharField(
        max_length=20,
        choices=FREQUENCY_CHOICES,
        default=FREQUENCY_WEEKLY,
        help_text="Recurrence frequency (e.g. weekly)."
    )
    interval = models.PositiveIntegerField(
        default=1,
        help_text="Recurrence interval (e.g., 1 for every week, 2 for bi-weekly)."
    )
    until = models.DateField(
        null=True,
        blank=True,
        help_text="End date for the recurring series."
    )
    count = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of occurrences in this series."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Booking Series'
        verbose_name_plural = 'Booking Series'

    def __str__(self):
        return f"Series #{self.id} ({self.frequency}, int={self.interval}) - {self.resource.name} by {self.requester.username}"

class TimetableEntry(models.Model):
    WEEKDAY_CHOICES = [
        (0, 'Monday'),
        (1, 'Tuesday'),
        (2, 'Wednesday'),
        (3, 'Thursday'),
        (4, 'Friday'),
        (5, 'Saturday'),
        (6, 'Sunday'),
    ]

    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name='timetable_entries',
        help_text="Target classroom, lab or facility."
    )
    course_code = models.CharField(
        max_length=50,
        help_text="Course or batch code (e.g. CSE301, MEC101)."
    )
    weekday = models.IntegerField(
        choices=WEEKDAY_CHOICES,
        help_text="Day of the week (0=Monday, 6=Sunday)."
    )
    start_time = models.TimeField(help_text="Class start time.")
    end_time = models.TimeField(help_text="Class end time.")
    semester_start = models.DateField(help_text="Start date of academic semester.")
    semester_end = models.DateField(help_text="End date of academic semester.")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['semester_start', 'weekday', 'start_time']
        verbose_name = 'Timetable Entry'
        verbose_name_plural = 'Timetable Entries'

    def __str__(self):
        return f"{self.course_code} ({self.get_weekday_display()} {self.start_time}-{self.end_time}) in {self.resource.name}"

class Booking(models.Model):
    KIND_STANDARD = 'standard'
    KIND_TIMETABLE = 'timetable'
    KIND_CHOICES = [
        (KIND_STANDARD, 'Standard Booking'),
        (KIND_TIMETABLE, 'Timetable Hold'),
    ]

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

    series = models.ForeignKey(
        BookingSeries,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bookings',
        help_text="Associated recurring series if part of a recurring schedule."
    )
    timetable_entry = models.ForeignKey(
        TimetableEntry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='held_bookings',
        help_text="Associated timetable entry if generated via timetable hold."
    )
    kind = models.CharField(
        max_length=20,
        choices=KIND_CHOICES,
        default=KIND_STANDARD,
        help_text="Booking classification: standard user booking or timetable hold."
    )

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
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_bookings',
        help_text="Staff member or custodian who approved or rejected this booking."
    )
    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the booking was approved or rejected."
    )
    decision_note = models.TextField(
        blank=True,
        default='',
        help_text="Reviewer comments or mandatory reason for rejection."
    )
    reminder_sent = models.BooleanField(
        default=False,
        help_text="Whether 1-hour pre-booking reminder has been dispatched."
    )
    consumables_restored = models.BooleanField(
        default=False,
        help_text="Whether allocated consumables have been restored upon cancellation/release."
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

    @property
    def check_in_token(self):
        return self.checkin_token

    @check_in_token.setter
    def check_in_token(self, value):
        self.checkin_token = value

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
        Check-in opens 15 minutes before slot start, and closes at grace period
        (default 30 mins) after start time (or earlier if the slot ends before then).
        """
        slot = self.get_primary_slot()
        if not slot or not slot.period or not slot.period.lower:
            return None, None, None, None
        slot_start = slot.period.lower
        slot_end = slot.period.upper
        grace_minutes = getattr(settings, 'CHECKIN_GRACE_PERIOD_MINUTES', 30)
        window_start = slot_start - timezone.timedelta(minutes=15)
        window_end = min(slot_start + timezone.timedelta(minutes=grace_minutes), slot_end)
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

class BookingConsumable(models.Model):
    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name='consumables',
        help_text="The booking to which consumables are allocated."
    )
    consumable = models.ForeignKey(
        'resources.Consumable',
        on_delete=models.CASCADE,
        related_name='booking_allocations',
        help_text="The consumable reserved."
    )
    quantity = models.PositiveIntegerField(
        default=1,
        help_text="Quantity allocated to this booking."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        verbose_name = 'Booking Consumable'
        verbose_name_plural = 'Booking Consumables'
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gt=0),
                name='booking_consumable_quantity_positive'
            ),
            models.UniqueConstraint(
                fields=['booking', 'consumable'],
                name='unique_booking_consumable'
            ),
        ]

    def __str__(self):
        return f"{self.quantity} x {self.consumable.name} for Booking #{self.booking_id}"

def restore_booking_consumables(booking):
    """
    Safely restores reserved consumables for a cancelled/rejected/no-show booking.
    Guaranteed idempotent via booking.consumables_restored flag and atomic select_for_update.
    """
    from resources.models import Consumable
    from django.db import transaction

    with transaction.atomic():
        # Re-fetch booking with select_for_update to avoid race conditions
        b = Booking.objects.select_for_update().get(id=booking.id)
        if b.consumables_restored:
            return 0
        
        allocations = b.consumables.select_related('consumable').all()
        restored_count = 0
        for alloc in allocations:
            c = Consumable.objects.select_for_update().get(id=alloc.consumable_id)
            c.stock += alloc.quantity
            c.save(update_fields=['stock'])
            restored_count += alloc.quantity
        
        b.consumables_restored = True
        b.save(update_fields=['consumables_restored'])
        return restored_count


"""
Celery Background Tasks for Automated Booking Operations.
"""
import logging
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from celery import shared_task
from bookings.models import Booking, restore_booking_consumables
from accounts.models import Notification
from accounts.notifications import send_notification

logger = logging.getLogger(__name__)


@shared_task(name="bookings.tasks.release_no_shows")
def release_no_shows(grace_minutes=None):
    """
    Identifies approved bookings where start + grace has passed without check-in.
    Atomically updates booking status to no_show and deactivates slots (is_active=False)
    so capacity is released for other users.
    Restores any reserved consumables and sends a notification.
    Idempotent and concurrency-safe using select_for_update inside transaction.atomic().
    """
    if grace_minutes is None:
        grace_minutes = getattr(settings, 'CHECKIN_GRACE_PERIOD_MINUTES', 30)

    now = timezone.now()
    threshold = now - timedelta(minutes=grace_minutes)

    candidate_ids = list(
        Booking.objects.filter(
            status__in=[Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED],
            checked_in_at__isnull=True,
            slots__is_active=True,
            slots__period__startswith__lte=threshold
        ).values_list('id', flat=True).distinct()
    )

    released_count = 0
    for booking_id in candidate_ids:
        try:
            with transaction.atomic():
                booking = Booking.objects.select_for_update().select_related('requester', 'resource').get(id=booking_id)
                if (booking.status in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]
                        and booking.checked_in_at is None):
                    booking.status = Booking.STATUS_NO_SHOW
                    booking.no_show_at = now
                    booking.save(update_fields=['status', 'no_show_at', 'updated_at'])
                    booking.slots.filter(is_active=True).update(is_active=False)
                    
                    # Restore reserved consumables
                    restore_booking_consumables(booking)

                    # Send notification to requester
                    send_notification(
                        user=booking.requester,
                        notification_type=Notification.TYPE_NO_SHOW,
                        title="Booking Flagged as No-Show",
                        message=f"Your booking #{booking.id} for {booking.resource.name} was marked as a no-show because check-in grace period expired. The slot and any allocated consumables have been released."
                    )

                    released_count += 1
                    logger.info(f"[Auto-NoShow] Booking #{booking.id} marked as NO_SHOW. Slot and consumables released.")
        except Exception as exc:
            logger.error(f"[Auto-NoShow] Error processing booking #{booking_id}: {exc}")

    return released_count


@shared_task(name="bookings.tasks.send_booking_reminders")
def send_booking_reminders(lead_minutes=60):
    """
    Identifies approved bookings scheduled to start in ~1 hour (lead_minutes).
    Dispatches in-app Notification and email to requester.
    Guaranteed idempotent via booking.reminder_sent flag and select_for_update.
    """
    now = timezone.now()
    window_start = now + timedelta(minutes=max(1, lead_minutes - 10))
    window_end = now + timedelta(minutes=lead_minutes + 10)

    candidate_ids = list(
        Booking.objects.filter(
            status=Booking.STATUS_APPROVED,
            reminder_sent=False,
            slots__is_active=True,
            slots__period__startswith__gte=window_start,
            slots__period__startswith__lte=window_end,
        ).values_list('id', flat=True).distinct()
    )

    reminded_count = 0
    for booking_id in candidate_ids:
        try:
            with transaction.atomic():
                booking = Booking.objects.select_for_update().select_related('requester', 'resource').get(id=booking_id)
                if booking.status != Booking.STATUS_APPROVED or booking.reminder_sent:
                    continue
                booking.reminder_sent = True
                booking.save(update_fields=['reminder_sent', 'updated_at'])

                slot = booking.get_primary_slot()
                start_str = slot.period.lower.strftime('%H:%M') if (slot and slot.period and slot.period.lower) else 'in 1 hour'
                
                send_notification(
                    user=booking.requester,
                    notification_type=Notification.TYPE_REMINDER,
                    title="Upcoming Booking Reminder",
                    message=f"Reminder: Your booking #{booking.id} for {booking.resource.name} starts at {start_str} (in approximately 1 hour). Please remember to check in on time!"
                )
                reminded_count += 1
                logger.info(f"[Reminder] Dispatched reminder for Booking #{booking.id} to {booking.requester.username}")
        except Exception as exc:
            logger.error(f"[Reminder] Error sending reminder for booking #{booking_id}: {exc}")

    return reminded_count


# Backwards compatibility aliases
check_no_shows = release_no_shows
check_no_shows_task = release_no_shows

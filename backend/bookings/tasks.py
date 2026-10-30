"""
Celery Background Tasks Foundation for Automated Booking Operations.

This module provides scheduled background tasks intended to run with Celery Beat
for automated release of unclaimed campus resources (no-shows) and auto-completion
of finished sessions.
"""
import logging
from django.utils import timezone
from datetime import timedelta
from bookings.models import Booking

logger = logging.getLogger(__name__)

def check_no_shows(grace_minutes=15):
    """
    Core business logic to identify expired check-in windows, flag bookings
    as NO_SHOW, and release the active exclusion constraint slots so other
    students/faculty can book the freed capacity immediately.
    """
    now = timezone.now()
    threshold = now - timedelta(minutes=grace_minutes)

    candidates = Booking.objects.filter(
        status__in=[Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED],
        checked_in_at__isnull=True,
        slots__is_active=True,
        slots__period__startswith__lte=threshold
    ).distinct()

    released_count = 0
    for booking in candidates:
        try:
            booking.mark_as_no_show()
            released_count += 1
            logger.info(
                f"[Auto-NoShow] Booking #{booking.id} for '{booking.resource.name}' marked as NO_SHOW. Slot released."
            )
        except Exception as exc:
            logger.error(f"[Auto-NoShow] Error processing booking #{booking.id}: {exc}")

    return released_count

try:
    from celery import shared_task

    @shared_task(name="bookings.tasks.check_no_shows_task")
    def check_no_shows_task(grace_minutes=15):
        """
        Periodic Celery task executed via Celery Beat (e.g. every 5 minutes).
        """
        count = check_no_shows(grace_minutes=grace_minutes)
        return f"Processed {count} no-show bookings."

except ImportError:
    # If celery package is not installed or enabled in current lightweight mode,
    # provide a safe fallback so normal operations and tests do not break.
    def check_no_shows_task(grace_minutes=15):
        return check_no_shows(grace_minutes=grace_minutes)


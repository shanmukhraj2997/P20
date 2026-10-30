from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from bookings.models import Booking

class Command(BaseCommand):
    help = "Scan approved bookings past grace period without check-in and mark as no-show."

    def add_arguments(self, parser):
        parser.add_argument(
            '--grace-minutes',
            type=int,
            default=15,
            help='Grace period in minutes after start time before marking no-show (default: 15).'
        )

    def handle(self, *args, **options):
        grace_minutes = options['grace_minutes']
        now = timezone.now()
        threshold = now - timedelta(minutes=grace_minutes)

        self.stdout.write(f"Scanning for unattended reservations older than {threshold.isoformat()}...")

        # Find eligible active bookings
        candidates = Booking.objects.filter(
            status__in=[Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED],
            checked_in_at__isnull=True,
            slots__is_active=True,
            slots__period__startswith__lte=threshold
        ).distinct()

        processed_count = 0
        for booking in candidates:
            booking.mark_as_no_show()
            processed_count += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"Marked Booking #{booking.id} ({booking.resource.name}) as NO-SHOW. Released slot."
                )
            )

        self.stdout.write(
            self.style.SUCCESS(f"Completed: {processed_count} booking(s) marked as no-show.")
        )


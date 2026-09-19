from datetime import time, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from availability.models import AvailabilityRule, Blackout
from resources.models import Resource

class Command(BaseCommand):
    help = 'Seeds default availability operating rules and blackout periods.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Seeding availability rules and blackouts...'))

        # Seed default operating rules (Monday through Sunday, 08:00 to 20:00)
        rule_count = 0
        for day in range(7):
            rule, created = AvailabilityRule.objects.get_or_create(
                resource=None, # Global fallback rule
                day_of_week=day,
                defaults={
                    'start_time': time(8, 0),
                    'end_time': time(20, 0),
                    'active': True,
                }
            )
            if created:
                rule_count += 1

        # Seed sample blackout period (Campus Maintenance Holiday next month)
        now = timezone.now()
        start_blackout = now + timedelta(days=14)
        end_blackout = start_blackout + timedelta(days=2)

        blackout, b_created = Blackout.objects.get_or_create(
            reason='Campus Annual Electrical Maintenance',
            defaults={
                'resource': None, # Campus-wide blackout
                'start_datetime': start_blackout,
                'end_datetime': end_blackout,
            }
        )

        self.stdout.write(self.style.SUCCESS(f'Successfully seeded {rule_count} availability rules and campus blackout.'))

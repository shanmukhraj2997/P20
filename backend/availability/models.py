from django.db import models
from resources.models import Resource
from accounts.models import User

class AvailabilityRule(models.Model):
    DAY_CHOICES = [
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
        related_name='availability_rules',
        null=True,
        blank=True,
        help_text="Target resource (or null for global default operating hours)."
    )
    day_of_week = models.IntegerField(choices=DAY_CHOICES, help_text="Day of the week (0=Monday, 6=Sunday).")
    start_time = models.TimeField(help_text="Operating start time (e.g., 08:00).")
    end_time = models.TimeField(help_text="Operating end time (e.g., 20:00).")
    active = models.BooleanField(default=True, help_text="Whether this availability rule is active.")

    class Meta:
        ordering = ['resource', 'day_of_week', 'start_time']
        verbose_name = 'Availability Rule'
        verbose_name_plural = 'Availability Rules'

    def __str__(self):
        res_name = self.resource.name if self.resource else "Global Default"
        day_name = dict(self.DAY_CHOICES).get(self.day_of_week, self.day_of_week)
        return f"{res_name} — {day_name} ({self.start_time.strftime('%H:%M')} - {self.end_time.strftime('%H:%M')})"

class Blackout(models.Model):
    KIND_MAINTENANCE = 'maintenance'
    KIND_DOWNTIME = 'downtime'
    KIND_HOLIDAY = 'holiday'

    KIND_CHOICES = [
        (KIND_MAINTENANCE, 'Maintenance'),
        (KIND_DOWNTIME, 'Downtime'),
        (KIND_HOLIDAY, 'Campus Holiday'),
    ]

    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name='blackouts',
        null=True,
        blank=True,
        help_text="Resource under blackout (or null for campus-wide blackout)."
    )
    start_datetime = models.DateTimeField(help_text="Start date & time of blackout.")
    end_datetime = models.DateTimeField(help_text="End date & time of blackout.")
    reason = models.CharField(max_length=255, help_text="Reason for blackout (e.g., Maintenance, University Holiday).")
    kind = models.CharField(
        max_length=20,
        choices=KIND_CHOICES,
        default=KIND_MAINTENANCE,
        help_text="Classification of downtime: maintenance, downtime, or holiday."
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_blackouts',
        help_text="Staff member or custodian who scheduled this blackout/maintenance."
    )
    notes = models.TextField(
        blank=True,
        default='',
        help_text="Operational notes or instructions regarding this downtime."
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        ordering = ['-start_datetime']
        verbose_name = 'Blackout Period'
        verbose_name_plural = 'Blackout Periods'

    def __str__(self):
        res_name = self.resource.name if self.resource else "Campus-Wide"
        return f"[{self.get_kind_display()}] {res_name}: {self.reason} ({self.start_datetime.strftime('%Y-%m-%d %H:%M')} to {self.end_datetime.strftime('%Y-%m-%d %H:%M')})"

# Model alias for semantic convenience
MaintenanceWindow = Blackout

from django.db import models
from accounts.models import User

class ResourceType(models.Model):
    name = models.CharField(max_length=100, unique=True, help_text="Resource category name.")
    description = models.TextField(blank=True, help_text="Details about this resource type.")
    icon = models.CharField(max_length=50, blank=True, default='box', help_text="Lucide icon identifier for UI.")

    class Meta:
        ordering = ['name']
        verbose_name = 'Resource Type'
        verbose_name_plural = 'Resource Types'

    def __str__(self):
        return self.name

class Resource(models.Model):
    STATUS_AVAILABLE = 'available'
    STATUS_MAINTENANCE = 'maintenance'
    STATUS_RESERVED = 'reserved'
    STATUS_DECOMMISSIONED = 'decommissioned'

    STATUS_CHOICES = [
        (STATUS_AVAILABLE, 'Available'),
        (STATUS_MAINTENANCE, 'Under Maintenance'),
        (STATUS_RESERVED, 'Reserved'),
        (STATUS_DECOMMISSIONED, 'Decommissioned'),
    ]

    name = models.CharField(max_length=150, help_text="Resource name (e.g. Computer Lab 1).")
    resource_type = models.ForeignKey(
        ResourceType,
        on_delete=models.CASCADE,
        related_name='resources',
        help_text="Category of resource."
    )
    description = models.TextField(help_text="Detailed description of features, equipment, and rules.")
    capacity = models.PositiveIntegerField(default=1, help_text="Maximum seating/user capacity.")
    location = models.CharField(max_length=200, help_text="Physical building, floor, room number.")
    custodian = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_resources',
        help_text="Resource custodian in charge."
    )
    features = models.JSONField(default=list, blank=True, help_text="List of feature tags.")
    image_url = models.CharField(
        max_length=500,
        blank=True,
        default='',
        help_text="URL or path to resource image."
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_AVAILABLE,
        help_text="Current operational status."
    )
    max_duration_hours = models.PositiveIntegerField(
        default=4,
        help_text="Maximum allowed booking duration in hours for standard users (overridable by staff)."
    )
    requires_approval = models.BooleanField(
        default=False,
        help_text="Whether new bookings for this resource start as pending approval."
    )
    department = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="Academic or administrative department owning this resource."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_under_maintenance(self):
        from django.utils import timezone
        from availability.models import Blackout
        now = timezone.now()
        return Blackout.objects.filter(
            models.Q(resource=self) | models.Q(resource__isnull=True),
            start_datetime__lte=now,
            end_datetime__gte=now
        ).exists()

    @property
    def effective_status(self):
        base_status = self.__dict__.get('status', self.STATUS_AVAILABLE)
        if base_status == self.STATUS_DECOMMISSIONED:
            return self.STATUS_DECOMMISSIONED
        if self.is_under_maintenance:
            return self.STATUS_MAINTENANCE
        return base_status

    def __getattribute__(self, name):
        val = super().__getattribute__(name)
        if name == 'status':
            import sys
            caller = sys._getframe(1).f_code.co_name
            if caller in ('pre_save', 'get_db_prep_save', '_save_table', '_do_insert', '_do_update'):
                return val
            try:
                if val != 'decommissioned' and self.is_under_maintenance:
                    return 'maintenance'
            except Exception:
                pass
        return val

    def get_status_display(self):
        st = getattr(self, 'status', self.STATUS_AVAILABLE)
        return dict(self.STATUS_CHOICES).get(st, st.capitalize())

    class Meta:
        ordering = ['name']
        verbose_name = 'Resource'
        verbose_name_plural = 'Resources'

    def __str__(self):
        return f"{self.name} ({self.location})"

class Consumable(models.Model):
    name = models.CharField(max_length=150, help_text="Item name (e.g. Dry Erase Markers, 3D Printer Filament).")
    unit = models.CharField(max_length=50, default='pcs', help_text="Measurement unit (e.g. pcs, pack, roll, ml).")
    stock = models.IntegerField(default=0, help_text="Current available inventory quantity.")
    reorder_level = models.PositiveIntegerField(default=5, help_text="Threshold under which item is flagged as low stock.")
    resource = models.ForeignKey(
        Resource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='consumables',
        help_text="Specific resource this consumable belongs to, or null if general campus inventory."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Consumable'
        verbose_name_plural = 'Consumables'
        constraints = [
            models.CheckConstraint(
                check=models.Q(stock__gte=0),
                name='consumable_stock_non_negative'
            )
        ]

    @property
    def is_low_stock(self):
        return self.stock <= self.reorder_level

    def __str__(self):
        return f"{self.name} ({self.stock} {self.unit})"


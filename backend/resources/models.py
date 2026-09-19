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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Resource'
        verbose_name_plural = 'Resources'

    def __str__(self):
        return f"{self.name} ({self.location})"

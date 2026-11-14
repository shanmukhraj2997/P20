from django.contrib import admin
from django.db import models
from resources.models import ResourceType, Resource, Consumable

@admin.register(ResourceType)
class ResourceTypeAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'icon', 'description')
    search_fields = ('name', 'description')
    ordering = ('name',)

@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'resource_type', 'capacity', 'location', 'custodian', 'requires_approval', 'max_duration_hours', 'status', 'maintenance_status', 'created_at')
    list_filter = ('resource_type', 'requires_approval', 'status', 'created_at')
    search_fields = ('name', 'location', 'description')
    raw_id_fields = ('custodian',)
    readonly_fields = ('active_maintenance_notice', 'created_at', 'updated_at')
    ordering = ('name',)

    def maintenance_status(self, obj):
        from django.utils.html import format_html
        if obj.is_under_maintenance:
            return format_html('<span style="color: #d97706; font-weight: bold;">⚠️ Active Blackout</span>')
        return format_html('<span style="color: #059669;">Normal</span>')
    maintenance_status.short_description = 'Blackout State'

    def active_maintenance_notice(self, obj):
        if not obj or not obj.pk:
            return "N/A"
        from django.utils import timezone
        from availability.models import Blackout
        now = timezone.now()
        active_b = Blackout.objects.filter(
            models.Q(resource=obj) | models.Q(resource__isnull=True),
            start_datetime__lte=now,
            end_datetime__gte=now
        ).first()
        if active_b:
            scope = "Campus-wide" if active_b.resource is None else f"Resource #{obj.pk}"
            return f"⚠️ ACTIVE BLACKOUT ({scope}): '{active_b.reason}' from {active_b.start_datetime.strftime('%Y-%m-%d %H:%M')} to {active_b.end_datetime.strftime('%Y-%m-%d %H:%M')}. To clear or reschedule, go to Availability -> Blackout Periods."
        return "No scheduled blackout is currently active for this resource."
    active_maintenance_notice.short_description = 'Maintenance Window Schedule'

@admin.register(Consumable)
class ConsumableAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'resource', 'stock', 'unit', 'reorder_level', 'is_low_stock')
    list_filter = ('unit', 'resource')
    search_fields = ('name',)
    raw_id_fields = ('resource',)
    ordering = ('name',)

    def is_low_stock(self, obj):
        return obj.is_low_stock
    is_low_stock.boolean = True

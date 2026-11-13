from django.contrib import admin
from resources.models import ResourceType, Resource, Consumable

@admin.register(ResourceType)
class ResourceTypeAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'icon', 'description')
    search_fields = ('name', 'description')
    ordering = ('name',)

@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'resource_type', 'capacity', 'location', 'custodian', 'requires_approval', 'max_duration_hours', 'status', 'created_at')
    list_filter = ('resource_type', 'requires_approval', 'status', 'created_at')
    search_fields = ('name', 'location', 'description')
    raw_id_fields = ('custodian',)
    ordering = ('name',)

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

from django.contrib import admin
from resources.models import ResourceType, Resource

@admin.register(ResourceType)
class ResourceTypeAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'icon', 'description')
    search_fields = ('name', 'description')
    ordering = ('name',)

@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'resource_type', 'capacity', 'location', 'custodian', 'status', 'created_at')
    list_filter = ('resource_type', 'status', 'created_at')
    search_fields = ('name', 'location', 'description')
    raw_id_fields = ('custodian',)
    ordering = ('name',)

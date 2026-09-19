from django.contrib import admin
from availability.models import AvailabilityRule, Blackout

@admin.register(AvailabilityRule)
class AvailabilityRuleAdmin(admin.ModelAdmin):
    list_display = ('id', 'resource', 'day_of_week', 'start_time', 'end_time', 'active')
    list_filter = ('day_of_week', 'active', 'resource')
    search_fields = ('resource__name',)
    ordering = ('resource', 'day_of_week')

@admin.register(Blackout)
class BlackoutAdmin(admin.ModelAdmin):
    list_display = ('id', 'resource', 'start_datetime', 'end_datetime', 'reason')
    list_filter = ('resource', 'start_datetime')
    search_fields = ('reason', 'resource__name')
    ordering = ('-start_datetime',)

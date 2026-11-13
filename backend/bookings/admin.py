from django.contrib import admin
from bookings.models import Booking, BookingSlot, BookingSeries, TimetableEntry, BookingConsumable

class BookingSlotInline(admin.TabularInline):
    model = BookingSlot
    extra = 0
    fields = ('id', 'resource', 'period', 'is_active', 'created_at')
    readonly_fields = ('created_at',)

class BookingConsumableInline(admin.TabularInline):
    model = BookingConsumable
    extra = 0
    fields = ('id', 'consumable', 'quantity', 'created_at')
    readonly_fields = ('created_at',)

@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ('id', 'resource', 'requester', 'status', 'kind', 'series', 'created_at')
    list_filter = ('status', 'kind', 'resource', 'created_at')
    search_fields = ('requester__username', 'resource__name', 'purpose')
    raw_id_fields = ('requester', 'resource', 'series', 'reviewed_by', 'checked_in_by')
    inlines = [BookingSlotInline, BookingConsumableInline]
    ordering = ('-created_at',)

@admin.register(BookingSlot)
class BookingSlotAdmin(admin.ModelAdmin):
    list_display = ('id', 'booking', 'resource', 'period', 'is_active', 'created_at')
    list_filter = ('is_active', 'resource')
    search_fields = ('booking__requester__username', 'resource__name')
    raw_id_fields = ('booking', 'resource')
    ordering = ('-created_at',)

@admin.register(BookingSeries)
class BookingSeriesAdmin(admin.ModelAdmin):
    list_display = ('id', 'resource', 'requester', 'frequency', 'interval', 'until', 'count', 'created_at')
    list_filter = ('frequency', 'resource', 'created_at')
    search_fields = ('requester__username', 'resource__name', 'purpose')
    raw_id_fields = ('requester', 'resource')
    ordering = ('-created_at',)

@admin.register(TimetableEntry)
class TimetableEntryAdmin(admin.ModelAdmin):
    list_display = ('id', 'course_code', 'resource', 'weekday', 'start_time', 'end_time', 'semester_start', 'semester_end')
    list_filter = ('weekday', 'resource')
    search_fields = ('course_code', 'resource__name')
    ordering = ('course_code', 'weekday')

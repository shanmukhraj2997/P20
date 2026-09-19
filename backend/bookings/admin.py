from django.contrib import admin
from bookings.models import Booking, BookingSlot

class BookingSlotInline(admin.TabularInline):
    model = BookingSlot
    extra = 0
    fields = ('id', 'resource', 'period', 'is_active', 'created_at')
    readonly_fields = ('created_at',)

@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ('id', 'resource', 'requester', 'status', 'created_at')
    list_filter = ('status', 'resource', 'created_at')
    search_fields = ('requester__username', 'resource__name', 'purpose')
    raw_id_fields = ('requester', 'resource')
    inlines = [BookingSlotInline]
    ordering = ('-created_at',)

@admin.register(BookingSlot)
class BookingSlotAdmin(admin.ModelAdmin):
    list_display = ('id', 'booking', 'resource', 'period', 'is_active', 'created_at')
    list_filter = ('is_active', 'resource')
    search_fields = ('booking__requester__username', 'resource__name')
    raw_id_fields = ('booking', 'resource')
    ordering = ('-created_at',)

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from accounts.models import User, Notification

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('id', 'username', 'email', 'role', 'department', 'is_staff', 'is_superuser', 'is_active')
    list_filter = ('role', 'is_staff', 'is_superuser', 'is_active', 'department')
    search_fields = ('username', 'email', 'first_name', 'last_name', 'department')
    ordering = ('id',)

    fieldsets = BaseUserAdmin.fieldsets + (
        ('Custom Profile Information', {'fields': ('role', 'department', 'phone_number')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Custom Profile Information', {'fields': ('role', 'department', 'phone_number')}),
    )

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'type', 'title', 'read', 'created_at')
    list_filter = ('type', 'read', 'created_at')
    search_fields = ('user__username', 'title', 'message')
    ordering = ('-created_at',)

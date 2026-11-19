from django.contrib import admin
from permissionslips.models import PermissionSlip, PermissionSlipAuditLog

class PermissionSlipAuditLogInLine(admin.TabularInline):
    model = PermissionSlipAuditLog
    extra = 0
    readonly_fields = ['action', 'previous_status', 'new_status', 'performed_by', 'notes', 'timestamp']
    can_delete = False

@admin.register(PermissionSlip)
class PermissionSlipAdmin(admin.ModelAdmin):
    list_display = [
        'reference_number', 'requester', 'resource', 'department',
        'start_datetime', 'end_datetime', 'verification_status', 'verified_by', 'created_at'
    ]
    list_filter = ['verification_status', 'department', 'resource__resource_type']
    search_fields = ['reference_number', 'requester__username', 'purpose', 'issuing_authority_name']
    readonly_fields = ['created_at', 'updated_at', 'verified_at']
    inlines = [PermissionSlipAuditLogInLine]

@admin.register(PermissionSlipAuditLog)
class PermissionSlipAuditLogAdmin(admin.ModelAdmin):
    list_display = ['slip', 'action', 'previous_status', 'new_status', 'performed_by', 'timestamp']
    list_filter = ['action', 'new_status']
    search_fields = ['slip__reference_number', 'performed_by__username', 'notes']
    readonly_fields = ['slip', 'action', 'previous_status', 'new_status', 'performed_by', 'notes', 'timestamp']

from rest_framework import serializers
from django.utils import timezone
from permissionslips.models import PermissionSlip, PermissionSlipAuditLog
from resources.models import Resource
from bookings.models import Booking

class PermissionSlipAuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PermissionSlipAuditLog
        fields = [
            'id', 'action', 'previous_status', 'new_status',
            'performed_by', 'performed_by_name', 'notes', 'timestamp'
        ]

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            return obj.performed_by.get_full_name() or obj.performed_by.username
        return "System"

class PermissionSlipSerializer(serializers.ModelSerializer):
    requester_name = serializers.SerializerMethodField()
    resource_name = serializers.CharField(source='resource.name', read_only=True)
    resource_location = serializers.CharField(source='resource.location', read_only=True)
    status_display = serializers.CharField(source='get_verification_status_display', read_only=True)
    verified_by_name = serializers.SerializerMethodField()
    audit_logs = PermissionSlipAuditLogSerializer(many=True, read_only=True)
    document_url = serializers.SerializerMethodField()

    class Meta:
        model = PermissionSlip
        fields = [
            'id', 'reference_number', 'requester', 'requester_name',
            'resource', 'resource_name', 'resource_location', 'department',
            'purpose', 'start_datetime', 'end_datetime', 'uploaded_document',
            'document_url', 'issuing_authority_name', 'issuing_authority_designation',
            'issue_date', 'verification_status', 'status_display',
            'verification_notes', 'verified_by', 'verified_by_name', 'verified_at',
            'linked_booking', 'conflict_override_reason', 'created_at', 'updated_at',
            'audit_logs'
        ]
        read_only_fields = [
            'id', 'verification_status', 'verified_by', 'verified_at',
            'linked_booking', 'conflict_override_reason', 'created_at', 'updated_at'
        ]

    def get_requester_name(self, obj):
        return obj.requester.get_full_name() or obj.requester.username

    def get_verified_by_name(self, obj):
        if obj.verified_by:
            return obj.verified_by.get_full_name() or obj.verified_by.username
        return None

    def get_document_url(self, obj):
        if obj.uploaded_document:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.uploaded_document.url)
            return obj.uploaded_document.url
        return None

class PermissionSlipCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PermissionSlip
        fields = [
            'reference_number', 'resource', 'department', 'purpose',
            'start_datetime', 'end_datetime', 'uploaded_document',
            'issuing_authority_name', 'issuing_authority_designation', 'issue_date'
        ]

    def validate_reference_number(self, value):
        val = value.strip()
        if PermissionSlip.objects.filter(reference_number__iexact=val).exists():
            raise serializers.ValidationError(f"A permission slip with reference number '{val}' has already been submitted.")
        return val

    def validate(self, data):
        start = data.get('start_datetime')
        end = data.get('end_datetime')
        if start and end:
            if end <= start:
                raise serializers.ValidationError({"end_datetime": "End time must be strictly after start time."})
            if start < timezone.now() - timezone.timedelta(days=1):
                raise serializers.ValidationError({"start_datetime": "Cannot submit permission slip for dates more than 24 hours in the past."})
        return data

class PermissionSlipRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=True, min_length=5, help_text="Mandatory reason for rejecting official slip.")

class PermissionSlipVerifySerializer(serializers.Serializer):
    verification_notes = serializers.CharField(required=False, allow_blank=True, default='')

class PermissionSlipAllocateSerializer(serializers.Serializer):
    override = serializers.BooleanField(default=False, help_text="Whether to forcefully override and displace conflicting website bookings.")
    override_reason = serializers.CharField(required=False, allow_blank=True, default='', help_text="Mandatory justification when override is enabled.")

    def validate(self, data):
        if data.get('override') and not data.get('override_reason', '').strip():
            raise serializers.ValidationError({"override_reason": "An explicit override justification reason is mandatory when displacing confirmed bookings."})
        return data

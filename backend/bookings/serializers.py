from django.db import models
from rest_framework import serializers
from django.utils import timezone
from bookings.models import Booking, BookingSlot
from resources.models import Resource
from availability.models import Blackout

class BookingSlotSerializer(serializers.ModelSerializer):
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()

    class Meta:
        model = BookingSlot
        fields = ['id', 'resource', 'start_time', 'end_time', 'is_active']

    def get_start_time(self, obj):
        return obj.period.lower.isoformat() if obj.period and obj.period.lower else None

    def get_end_time(self, obj):
        return obj.period.upper.isoformat() if obj.period and obj.period.upper else None

class BookingCreateSerializer(serializers.Serializer):
    resource = serializers.PrimaryKeyRelatedField(queryset=Resource.objects.all())
    start_time = serializers.DateTimeField()
    end_time = serializers.DateTimeField()
    purpose = serializers.CharField(max_length=1000)

    def validate(self, data):
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        resource = data.get('resource')

        # 1. Start time must be before end time
        if start_time >= end_time:
            raise serializers.ValidationError({"end_time": "End time must be strictly after start time."})

        # 2. Cannot book in the past
        if start_time < timezone.now() - timezone.timedelta(minutes=5):
            raise serializers.ValidationError({"start_time": "Cannot book a time slot in the past."})

        # 3. Resource operational status check
        if resource.status != Resource.STATUS_AVAILABLE:
            raise serializers.ValidationError({
                "resource": f"Resource '{resource.name}' is currently {resource.get_status_display().lower()} and unavailable for bookings."
            })

        # 4. Check for blackout period overlap
        blackouts = Blackout.objects.filter(
            models.Q(resource=resource) | models.Q(resource__isnull=True),
            start_datetime__lt=end_time,
            end_datetime__gt=start_time
        )
        if blackouts.exists():
            blackout = blackouts.first()
            raise serializers.ValidationError({
                "non_field_errors": f"Selected slot conflicts with blackout: '{blackout.reason}'."
            })

        return data

class BookingSerializer(serializers.ModelSerializer):
    resource_name = serializers.CharField(source='resource.name', read_only=True)
    resource_location = serializers.CharField(source='resource.location', read_only=True)
    resource_type_name = serializers.CharField(source='resource.resource_type.name', read_only=True)
    requester_name = serializers.SerializerMethodField()
    requester_role = serializers.CharField(source='requester.get_role_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()
    checked_in_by_name = serializers.SerializerMethodField()
    can_check_in = serializers.SerializerMethodField()
    checkin_window_start = serializers.SerializerMethodField()
    checkin_window_end = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'resource', 'resource_name', 'resource_location', 'resource_type_name',
            'requester', 'requester_name', 'requester_role', 'purpose', 'status', 'status_display',
            'start_time', 'end_time', 'checkin_token', 'checked_in_at', 'checked_in_by_name',
            'no_show_at', 'can_check_in', 'checkin_window_start', 'checkin_window_end',
            'created_at', 'updated_at'
        ]

    def get_requester_name(self, obj):
        return obj.requester.get_full_name() or obj.requester.username

    def get_start_time(self, obj):
        slot = obj.get_primary_slot()
        if slot and slot.period and slot.period.lower:
            return slot.period.lower.isoformat()
        return None

    def get_end_time(self, obj):
        slot = obj.get_primary_slot()
        if slot and slot.period and slot.period.upper:
            return slot.period.upper.isoformat()
        return None

    def get_checked_in_by_name(self, obj):
        if obj.checked_in_by:
            return obj.checked_in_by.get_full_name() or obj.checked_in_by.username
        return None

    def get_can_check_in(self, obj):
        if obj.status not in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]:
            return False
        w_start, w_end, _, _ = obj.get_checkin_window()
        if not w_start or not w_end:
            return False
        now = timezone.now()
        return w_start <= now <= w_end

    def get_checkin_window_start(self, obj):
        w_start, _, _, _ = obj.get_checkin_window()
        return w_start.isoformat() if w_start else None

    def get_checkin_window_end(self, obj):
        _, w_end, _, _ = obj.get_checkin_window()
        return w_end.isoformat() if w_end else None

class BookingCheckInSerializer(serializers.Serializer):
    token = serializers.CharField(required=False, allow_blank=True)
    resource_id = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate(self, data):
        token_val = data.get('token', '')
        if isinstance(token_val, str):
            token_val = token_val.strip()
            if token_val.startswith('{') and token_val.endswith('}'):
                try:
                    import json
                    parsed = json.loads(token_val)
                    if isinstance(parsed, dict):
                        if 'token' in parsed:
                            data['token'] = parsed['token']
                        if 'resource_id' in parsed and data.get('resource_id') is None:
                            data['resource_id'] = parsed['resource_id']
                except Exception:
                    pass
        return data

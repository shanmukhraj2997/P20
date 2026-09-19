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

    class Meta:
        model = Booking
        fields = [
            'id', 'resource', 'resource_name', 'resource_location', 'resource_type_name',
            'requester', 'requester_name', 'requester_role', 'purpose', 'status', 'status_display',
            'start_time', 'end_time', 'created_at', 'updated_at'
        ]

    def get_requester_name(self, obj):
        return obj.requester.get_full_name() or obj.requester.username

    def get_start_time(self, obj):
        active_slot = obj.slots.filter(is_active=True).first()
        if active_slot and active_slot.period and active_slot.period.lower:
            return active_slot.period.lower.isoformat()
        return None

    def get_end_time(self, obj):
        active_slot = obj.slots.filter(is_active=True).first()
        if active_slot and active_slot.period and active_slot.period.upper:
            return active_slot.period.upper.isoformat()
        return None

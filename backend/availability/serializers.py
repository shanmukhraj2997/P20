from rest_framework import serializers
from availability.models import Blackout, AvailabilityRule
from resources.models import Resource
from accounts.models import User

class BlackoutSerializer(serializers.ModelSerializer):
    resource_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)
    cancel_conflicting = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Blackout
        fields = [
            'id', 'resource', 'resource_name', 'start_datetime', 'end_datetime',
            'reason', 'kind', 'kind_display', 'created_by', 'created_by_name',
            'notes', 'cancel_conflicting', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_resource_name(self, obj):
        return obj.resource.name if obj.resource else "Campus-Wide (All Resources)"

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return "System"

    def validate(self, data):
        start = data.get('start_datetime', getattr(self.instance, 'start_datetime', None))
        end = data.get('end_datetime', getattr(self.instance, 'end_datetime', None))
        if start and end and start >= end:
            raise serializers.ValidationError({
                "end_datetime": "End datetime must be strictly after start datetime."
            })
        return data

    def create(self, validated_data):
        validated_data.pop('cancel_conflicting', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('cancel_conflicting', None)
        return super().update(instance, validated_data)


class AvailabilityRuleSerializer(serializers.ModelSerializer):
    resource_name = serializers.CharField(source='resource.name', read_only=True, default='Global Default')
    day_name = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = AvailabilityRule
        fields = [
            'id', 'resource', 'resource_name', 'day_of_week', 'day_name',
            'start_time', 'end_time', 'active'
        ]

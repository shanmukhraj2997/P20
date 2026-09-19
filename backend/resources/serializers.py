from rest_framework import serializers
from resources.models import ResourceType, Resource
from accounts.models import User

class ResourceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceType
        fields = ['id', 'name', 'description', 'icon']

class ResourceListSerializer(serializers.ModelSerializer):
    resource_type_name = serializers.CharField(source='resource_type.name', read_only=True)
    resource_type_icon = serializers.CharField(source='resource_type.icon', read_only=True)
    custodian_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Resource
        fields = [
            'id', 'name', 'resource_type', 'resource_type_name', 'resource_type_icon',
            'capacity', 'location', 'custodian', 'custodian_name', 'image_url',
            'status', 'status_display', 'features', 'created_at'
        ]

    def get_custodian_name(self, obj):
        if obj.custodian:
            return obj.custodian.get_full_name() or obj.custodian.username
        return "Unassigned"

class ResourceDetailSerializer(serializers.ModelSerializer):
    resource_type_detail = ResourceTypeSerializer(source='resource_type', read_only=True)
    custodian_name = serializers.SerializerMethodField()
    custodian_email = serializers.SerializerMethodField()
    custodian_phone = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Resource
        fields = [
            'id', 'name', 'resource_type', 'resource_type_detail', 'description',
            'capacity', 'location', 'custodian', 'custodian_name', 'custodian_email',
            'custodian_phone', 'features', 'image_url', 'status', 'status_display',
            'created_at', 'updated_at'
        ]

    def get_custodian_name(self, obj):
        if obj.custodian:
            return obj.custodian.get_full_name() or obj.custodian.username
        return "Unassigned"

    def get_custodian_email(self, obj):
        return obj.custodian.email if obj.custodian else ""

    def get_custodian_phone(self, obj):
        return obj.custodian.phone_number if obj.custodian else ""

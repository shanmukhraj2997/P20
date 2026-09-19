from django.db.models import Q
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from resources.models import ResourceType, Resource
from resources.serializers import (
    ResourceTypeSerializer, ResourceListSerializer, ResourceDetailSerializer
)
from resources.permissions import IsCustodianOrAdminForResource

class ResourceTypeListView(generics.ListCreateAPIView):
    queryset = ResourceType.objects.all()
    serializer_class = ResourceTypeSerializer
    permission_classes = [AllowAny]

class ResourceListCreateView(generics.ListCreateAPIView):
    queryset = Resource.objects.all().select_related('resource_type', 'custodian')
    permission_classes = [AllowAny]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ResourceDetailSerializer
        return ResourceListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        # Search parameter across name, location, and description
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(location__icontains=search) |
                Q(description__icontains=search)
            )

        # Resource Type filter (by ID or Name)
        resource_type = params.get('resource_type', '').strip()
        if resource_type:
            if resource_type.isdigit():
                qs = qs.filter(resource_type_id=int(resource_type))
            else:
                qs = qs.filter(resource_type__name__icontains=resource_type)

        # Location filter
        location = params.get('location', '').strip()
        if location:
            qs = qs.filter(location__icontains=location)

        # Capacity range filters
        min_capacity = params.get('min_capacity', '').strip()
        if min_capacity and min_capacity.isdigit():
            qs = qs.filter(capacity__gte=int(min_capacity))

        max_capacity = params.get('max_capacity', '').strip()
        if max_capacity and max_capacity.isdigit():
            qs = qs.filter(capacity__lte=int(max_capacity))

        # Status filter
        res_status = params.get('status', '').strip()
        if res_status:
            qs = qs.filter(status=res_status)

        # Custodian filter
        custodian_id = params.get('custodian_id', '').strip()
        if custodian_id and custodian_id.isdigit():
            qs = qs.filter(custodian_id=int(custodian_id))

        return qs

class ResourceDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Resource.objects.all().select_related('resource_type', 'custodian')
    serializer_class = ResourceDetailSerializer
    permission_classes = [IsCustodianOrAdminForResource]
    lookup_field = 'pk'

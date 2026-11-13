from django.db import models, transaction
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, SAFE_METHODS
from rest_framework.exceptions import PermissionDenied
from resources.models import ResourceType, Resource, Consumable
from resources.serializers import (
    ResourceTypeSerializer, ResourceListSerializer, ResourceDetailSerializer, ConsumableSerializer
)
from resources.permissions import IsCustodianOrAdminForResource, CanCreateResource

class ResourceTypeListView(generics.ListCreateAPIView):
    queryset = ResourceType.objects.all()
    serializer_class = ResourceTypeSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [CanCreateResource()]
        return [AllowAny()]

class ResourceListCreateView(generics.ListCreateAPIView):
    queryset = Resource.objects.all().select_related('resource_type', 'custodian')

    def get_permissions(self):
        if self.request.method == 'POST':
            return [CanCreateResource()]
        return [AllowAny()]

    def perform_create(self, serializer):
        if not serializer.validated_data.get('custodian') and self.request.user.is_authenticated:
            serializer.save(custodian=self.request.user)
        else:
            serializer.save()

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

class ConsumableListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ConsumableSerializer

    def get_queryset(self):
        qs = Consumable.objects.select_related('resource').all()
        resource_id = self.request.query_params.get('resource')
        if resource_id:
            if resource_id in ['none', 'null', 'general']:
                qs = qs.filter(resource__isnull=True)
            else:
                qs = qs.filter(models.Q(resource_id=resource_id) | models.Q(resource__isnull=True))

        low_stock = self.request.query_params.get('low_stock')
        if low_stock in ['true', '1']:
            qs = qs.filter(stock__lte=models.F('reorder_level'))

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search.strip())

        return qs.order_by('name')

    def perform_create(self, serializer):
        user = self.request.user
        resource = serializer.validated_data.get('resource')
        is_admin_or_fm = (user.is_admin_role or user.is_facility_mgr_role or user.is_superuser)
        if resource is None:
            if not is_admin_or_fm:
                raise PermissionDenied("Only administrators and facility managers can create campus-wide consumables.")
        else:
            if not is_admin_or_fm:
                if not (user.is_custodian_role and resource.custodian == user):
                    raise PermissionDenied(f"You do not have permission to manage consumables for resource '{resource.name}'.")
        serializer.save()

class ConsumableDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ConsumableSerializer
    queryset = Consumable.objects.select_related('resource').all()
    lookup_field = 'pk'

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method not in SAFE_METHODS:
            user = request.user
            is_admin_or_fm = (user.is_admin_role or user.is_facility_mgr_role or user.is_superuser)
            if not is_admin_or_fm:
                if not (user.is_custodian_role and obj.resource and obj.resource.custodian == user):
                    raise PermissionDenied("Permission denied. You can only manage consumables for your assigned resources.")

class ConsumableStockAdjustView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        try:
            consumable = Consumable.objects.select_related('resource').get(pk=pk)
        except Consumable.DoesNotExist:
            return Response({"detail": "Consumable not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_admin_or_fm = (user.is_admin_role or user.is_facility_mgr_role or user.is_superuser)
        if not is_admin_or_fm:
            if not (user.is_custodian_role and consumable.resource and consumable.resource.custodian == user):
                return Response({"detail": "Permission denied to adjust stock for this consumable."}, status=status.HTTP_403_FORBIDDEN)

        adjustment = request.data.get('adjustment')
        new_stock = request.data.get('stock')

        if adjustment is None and new_stock is None:
            return Response({"detail": "Either 'adjustment' (+/- delta) or 'stock' (absolute value) must be provided."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            c = Consumable.objects.select_for_update().get(pk=pk)
            if adjustment is not None:
                try:
                    adj = int(adjustment)
                except (ValueError, TypeError):
                    return Response({"detail": "'adjustment' must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
                target_stock = c.stock + adj
            else:
                try:
                    target_stock = int(new_stock)
                except (ValueError, TypeError):
                    return Response({"detail": "'stock' must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

            if target_stock < 0:
                return Response({
                    "error": "negative_stock",
                    "detail": f"Stock cannot be reduced below zero. Current stock: {c.stock}, attempted: {target_stock}."
                }, status=status.HTTP_400_BAD_REQUEST)

            c.stock = target_stock
            c.save(update_fields=['stock', 'updated_at'])

        return Response({
            "message": f"Stock for '{c.name}' successfully updated to {c.stock} {c.unit}.",
            "consumable": ConsumableSerializer(c).data
        }, status=status.HTTP_200_OK)


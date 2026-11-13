from django.db import models, transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError

from availability.models import Blackout, AvailabilityRule
from availability.serializers import BlackoutSerializer, AvailabilityRuleSerializer
from resources.models import Resource
from bookings.models import Booking, restore_booking_consumables
from accounts.models import Notification
from accounts.notifications import send_notification


def get_conflicting_active_bookings(resource, start_dt, end_dt):
    """
    Finds existing active bookings overlapping the proposed blackout window.
    If resource is None (campus-wide), checks all campus resources.
    """
    q = models.Q(
        status__in=[
            Booking.STATUS_PENDING,
            Booking.STATUS_APPROVED,
            Booking.STATUS_CONFIRMED,
            Booking.STATUS_CHECKED_IN,
        ],
        slots__is_active=True,
        slots__period__startswith__lt=end_dt,
        slots__period__endswith__gt=start_dt
    )
    if resource is not None:
        q &= models.Q(resource=resource)

    return Booking.objects.filter(q).distinct().select_related('resource', 'requester')


class BlackoutListCreateView(generics.ListCreateAPIView):
    serializer_class = BlackoutSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Blackout.objects.select_related('resource', 'created_by').all()

        # Scope filters by role
        if user.is_admin_role or user.is_facility_mgr_role or user.is_superuser:
            pass  # Full campus visibility
        elif user.is_custodian_role:
            # Custodians see blackouts for their managed resources and campus-wide blackouts
            qs = qs.filter(models.Q(resource__custodian=user) | models.Q(resource__isnull=True))
        else:
            # Students and faculty can view blackouts to know resource availability
            pass

        # Optional query filters
        resource_id = self.request.query_params.get('resource')
        if resource_id:
            qs = qs.filter(models.Q(resource_id=resource_id) | models.Q(resource__isnull=True))

        kind = self.request.query_params.get('kind')
        if kind:
            qs = qs.filter(kind=kind)

        return qs

    def create(self, request, *args, **kwargs):
        user = request.user
        is_admin = getattr(user, 'is_admin_role', False) or user.is_superuser or user.role == 'admin'
        is_fm = getattr(user, 'is_facility_mgr_role', False) or user.role == 'facility_mgr'
        is_custodian = getattr(user, 'is_custodian_role', False) or user.role == 'custodian'

        if not (is_admin or is_fm or is_custodian):
            return Response({
                "detail": "Permission denied. Only custodians, facility managers, and administrators can schedule maintenance/blackouts."
            }, status=status.HTTP_403_FORBIDDEN)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resource = serializer.validated_data.get('resource')
        start_dt = serializer.validated_data.get('start_datetime')
        end_dt = serializer.validated_data.get('end_datetime')
        cancel_conflicting = bool(
            serializer.validated_data.get('cancel_conflicting', False)
            or request.data.get('cancel_conflicting', False)
        )

        # 1. Enforce campus-wide vs resource-specific permissions
        if resource is None:
            if not (is_admin or is_fm):
                return Response({
                    "detail": "Permission denied. Only administrators and facility managers can schedule campus-wide maintenance/blackouts."
                }, status=status.HTTP_403_FORBIDDEN)
        else:
            if is_custodian and not (is_admin or is_fm):
                if resource.custodian != user:
                    return Response({
                        "detail": f"Permission denied. You can only schedule maintenance for your own managed resources ('{resource.name}' is managed by another custodian)."
                    }, status=status.HTTP_403_FORBIDDEN)

        # 2. Check for overlapping active bookings
        conflicting = get_conflicting_active_bookings(resource, start_dt, end_dt)

        if conflicting.exists():
            affected_data = [
                {
                    "id": b.id,
                    "resource_id": b.resource_id,
                    "resource_name": b.resource.name,
                    "requester_id": b.requester_id,
                    "requester_name": b.requester.get_full_name() or b.requester.username,
                    "start_time": b.get_primary_slot().period.lower.isoformat() if b.get_primary_slot() and b.get_primary_slot().period else None,
                    "end_time": b.get_primary_slot().period.upper.isoformat() if b.get_primary_slot() and b.get_primary_slot().period else None,
                    "status": b.status,
                    "status_display": b.get_status_display(),
                    "purpose": b.purpose,
                }
                for b in conflicting
            ]

            if not cancel_conflicting:
                return Response({
                    "error": "overlapping_bookings",
                    "message": f"This maintenance window overlaps with {len(affected_data)} existing active booking(s). Pass 'cancel_conflicting': true to cancel them and release their slots.",
                    "affected_bookings": affected_data,
                    "conflicting_bookings": affected_data,
                    "count": len(affected_data),
                }, status=status.HTTP_409_CONFLICT)

            # Atomically create blackout and cancel all conflicting bookings in a single transaction
            with transaction.atomic():
                blackout = serializer.save(created_by=user)
                now = timezone.now()
                cancellation_note = f"Cancelled due to {blackout.get_kind_display().lower()}: {blackout.reason}"

                for b in conflicting:
                    locked_b = Booking.objects.select_for_update().select_related('requester', 'resource').get(pk=b.pk)
                    locked_b.status = Booking.STATUS_CANCELLED
                    locked_b.decision_note = cancellation_note
                    locked_b.reviewed_by = user
                    locked_b.reviewed_at = now
                    locked_b.save()
                    # Release active booking slot
                    locked_b.slots.filter(is_active=True).update(is_active=False)
                    # Restore reserved consumables
                    restore_booking_consumables(locked_b)
                    # Notify requester
                    send_notification(
                        user=locked_b.requester,
                        notification_type=Notification.TYPE_MAINTENANCE_CANCELLATION,
                        title="Booking Cancelled for Maintenance",
                        message=f"Your booking #{locked_b.id} for {locked_b.resource.name} was cancelled due to scheduled {blackout.get_kind_display().lower()}: {blackout.notes or blackout.reason}."
                    )

            headers = self.get_success_headers(serializer.data)
            return Response({
                "message": f"Maintenance window created successfully. {len(affected_data)} conflicting booking(s) were cancelled and their slots released.",
                "blackout": BlackoutSerializer(blackout).data,
                "affected_bookings": affected_data,
                "cancelled_bookings": affected_data,
                "count": len(affected_data),
            }, status=status.HTTP_201_CREATED, headers=headers)

        # No conflicts -> standard creation
        blackout = serializer.save(created_by=user)
        headers = self.get_success_headers(serializer.data)
        return Response({
            "message": "Maintenance window created successfully.",
            "blackout": BlackoutSerializer(blackout).data,
            "affected_bookings": [],
            "count": 0,
        }, status=status.HTTP_201_CREATED, headers=headers)


class BlackoutDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BlackoutSerializer
    permission_classes = [IsAuthenticated]
    queryset = Blackout.objects.select_related('resource', 'created_by').all()
    lookup_field = 'pk'

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        user = request.user
        if request.method in ('PUT', 'PATCH', 'DELETE'):
            is_admin = getattr(user, 'is_admin_role', False) or user.is_superuser or user.role == 'admin'
            is_fm = getattr(user, 'is_facility_mgr_role', False) or user.role == 'facility_mgr'
            if not (is_admin or is_fm):
                if obj.resource is None:
                    raise PermissionDenied("Only administrators and facility managers can modify campus-wide blackouts.")
                if obj.resource.custodian != user:
                    raise PermissionDenied("You can only modify maintenance windows for your own resources.")

    def perform_update(self, serializer):
        user = self.request.user
        is_admin = getattr(user, 'is_admin_role', False) or user.is_superuser or user.role == 'admin'
        is_fm = getattr(user, 'is_facility_mgr_role', False) or user.role == 'facility_mgr'
        instance = self.get_object()

        # Permission check
        if instance.resource is None:
            if not (is_admin or is_fm):
                raise PermissionDenied("Only administrators and facility managers can update campus-wide maintenance/blackouts.")
        else:
            if not (is_admin or is_fm):
                if instance.resource.custodian != user:
                    raise PermissionDenied("You can only modify maintenance windows for your own resources.")

        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        is_admin = getattr(user, 'is_admin_role', False) or user.is_superuser or user.role == 'admin'
        is_fm = getattr(user, 'is_facility_mgr_role', False) or user.role == 'facility_mgr'

        if instance.resource is None:
            if not (is_admin or is_fm):
                raise PermissionDenied("Only administrators and facility managers can delete campus-wide maintenance/blackouts.")
        else:
            if not (is_admin or is_fm):
                if instance.resource.custodian != user:
                    raise PermissionDenied("You can only delete maintenance windows for your own resources.")

        instance.delete()

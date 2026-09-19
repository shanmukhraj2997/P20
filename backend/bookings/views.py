from datetime import datetime, time, timedelta
from psycopg2.extras import DateTimeTZRange
from django.db import transaction, IntegrityError, DatabaseError
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from bookings.models import Booking, BookingSlot
from bookings.serializers import (
    BookingSerializer, BookingCreateSerializer, BookingSlotSerializer
)
from resources.models import Resource
from availability.models import AvailabilityRule, Blackout

class ResourceAvailabilityView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk, *args, **kwargs):
        try:
            resource = Resource.objects.get(pk=pk)
        except Resource.DoesNotExist:
            return Response({"detail": "Resource not found."}, status=status.HTTP_404_NOT_FOUND)

        start_str = request.query_params.get('start')
        end_str = request.query_params.get('end')

        now = timezone.now()
        if start_str:
            try:
                start_dt = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                if timezone.is_naive(start_dt):
                    start_dt = timezone.make_aware(start_dt)
            except Exception:
                start_dt = now - timedelta(days=7)
        else:
            start_dt = now - timedelta(days=7)

        if end_str:
            try:
                end_dt = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
                if timezone.is_naive(end_dt):
                    end_dt = timezone.make_aware(end_dt)
            except Exception:
                end_dt = now + timedelta(days=30)
        else:
            end_dt = now + timedelta(days=30)

        events = []

        # 1. Existing Active Booking Slots
        active_slots = BookingSlot.objects.filter(
            resource=resource,
            is_active=True,
            booking__status__in=[Booking.STATUS_PENDING, Booking.STATUS_APPROVED]
        ).select_related('booking', 'booking__requester')

        for slot in active_slots:
            if slot.period and slot.period.lower and slot.period.upper:
                s_lower = slot.period.lower
                s_upper = slot.period.upper
                if s_upper > start_dt and s_lower < end_dt:
                    is_own = request.user and request.user.is_authenticated and slot.booking.requester_id == request.user.id
                    events.append({
                        "id": f"booking-{slot.booking_id}",
                        "title": "My Booking" if is_own else "Reserved",
                        "start": s_lower.isoformat(),
                        "end": s_upper.isoformat(),
                        "type": "booking",
                        "color": "#4f46e5" if is_own else "#64748b",
                        "status": slot.booking.status,
                    })

        # 2. Blackout Periods
        blackouts = Blackout.objects.filter(
            resource=resource,
            start_datetime__lt=end_dt,
            end_datetime__gt=start_dt
        )
        for b in blackouts:
            events.append({
                "id": f"blackout-{b.id}",
                "title": f"Blackout: {b.reason}",
                "start": b.start_datetime.isoformat(),
                "end": b.end_datetime.isoformat(),
                "type": "blackout",
                "color": "#ef4444",
                "display": "background",
            })

        # 3. Non-available Resource Status
        if resource.status != Resource.STATUS_AVAILABLE:
            events.append({
                "id": f"status-{resource.id}",
                "title": f"Resource {resource.get_status_display()}",
                "start": start_dt.isoformat(),
                "end": end_dt.isoformat(),
                "type": "status_block",
                "color": "#f59e0b",
                "display": "background",
            })

        return Response({
            "resource_id": resource.id,
            "resource_name": resource.name,
            "status": resource.status,
            "events": events
        }, status=status.HTTP_200_OK)

class BookingListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        bookings = Booking.objects.filter(requester=request.user).prefetch_related('slots', 'resource', 'requester')
        serializer = BookingSerializer(bookings, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resource = serializer.validated_data['resource']
        start_time = serializer.validated_data['start_time']
        end_time = serializer.validated_data['end_time']
        purpose = serializer.validated_data['purpose']

        # Atomic transaction + PostgreSQL Exclusion Constraint Check
        try:
            with transaction.atomic():
                booking = Booking.objects.create(
                    requester=request.user,
                    resource=resource,
                    purpose=purpose,
                    status=Booking.STATUS_APPROVED
                )

                period_range = DateTimeTZRange(start_time, end_time)
                BookingSlot.objects.create(
                    booking=booking,
                    resource=resource,
                    period=period_range,
                    is_active=True
                )

            # Return created booking
            output_serializer = BookingSerializer(booking)
            return Response(output_serializer.data, status=status.HTTP_201_CREATED)

        except (IntegrityError, DatabaseError) as exc:
            # Clean user-facing 409 Conflict response on database overlap exception
            return Response({
                "error": "booking_conflict",
                "message": "The selected time slot is no longer available. Please choose another slot."
            }, status=status.HTTP_409_CONFLICT)

class BookingDetailView(generics.RetrieveAPIView):
    queryset = Booking.objects.all().prefetch_related('slots', 'resource', 'requester')
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin_role or user.is_facility_mgr_role:
            return Booking.objects.all()
        return Booking.objects.filter(requester=user)

class BookingCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        try:
            booking = Booking.objects.get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permissions: requester, resource custodian, or admin
        user = request.user
        is_owner = booking.requester == user
        is_custodian = booking.resource.custodian == user
        is_admin = user.is_admin_role or user.is_facility_mgr_role

        if not (is_owner or is_custodian or is_admin):
            return Response({"detail": "Permission denied to cancel this booking."}, status=status.HTTP_403_FORBIDDEN)

        if booking.status == Booking.STATUS_CANCELLED:
            return Response({"message": "Booking is already cancelled."}, status=status.HTTP_200_OK)

        with transaction.atomic():
            booking.status = Booking.STATUS_CANCELLED
            booking.save()

            # Set slots inactive to immediately release PostgreSQL range exclusion constraint
            booking.slots.update(is_active=False)

        return Response({
            "message": "Booking successfully cancelled. Time slot has been released.",
            "booking": BookingSerializer(booking).data
        }, status=status.HTTP_200_OK)

class BookingManageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        if user.is_admin_role or user.is_facility_mgr_role:
            qs = Booking.objects.all()
        elif user.is_custodian_role:
            qs = Booking.objects.filter(resource__custodian=user)
        elif user.is_dept_head_role:
            qs = Booking.objects.filter(resource__custodian__department=user.department)
        else:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        qs = qs.prefetch_related('slots', 'resource', 'requester')
        serializer = BookingSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

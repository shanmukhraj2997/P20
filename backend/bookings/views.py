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
    BookingSerializer, BookingCreateSerializer, BookingSlotSerializer, BookingCheckInSerializer
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
            booking__status__in=[
                Booking.STATUS_PENDING,
                Booking.STATUS_APPROVED,
                Booking.STATUS_CONFIRMED,
                Booking.STATUS_CHECKED_IN,
            ]
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

        if booking.status in [Booking.STATUS_CHECKED_IN, Booking.STATUS_COMPLETED, Booking.STATUS_NO_SHOW, Booking.STATUS_REJECTED]:
            return Response(
                {"error": "cannot_cancel", "detail": f"Cannot cancel a booking with status '{booking.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

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

def execute_booking_checkin(booking, user, resource_id=None, force=False):
    """
    Core validation and check-in transaction workflow.
    Validates:
    - User authorization (requester, resource custodian, facility manager, admin, superuser)
    - Booking status (must be approved or confirmed; cannot be cancelled, rejected, no_show, or duplicate)
    - Resource match (if resource_id provided by scanner)
    - Check-in time window (opens 15 min prior, closes at end of slot / 30 min after start; staff can force)
    """
    is_owner = booking.requester == user
    is_custodian = booking.resource.custodian == user
    is_dept_head = bool(
        user.is_dept_head_role
        and user.department
        and (
            (booking.resource.custodian and booking.resource.custodian.department == user.department)
            or (getattr(booking.resource, 'department', None) == user.department)
        )
    )
    is_staff = user.is_admin_role or user.is_facility_mgr_role or user.is_superuser

    if not (is_owner or is_custodian or is_dept_head or is_staff):
        return Response({
            "error": "unauthorized_checkin",
            "detail": "You do not have permission to check in this booking."
        }, status=status.HTTP_403_FORBIDDEN)

    # 1. Prevent duplicate check-in
    if booking.status == Booking.STATUS_CHECKED_IN:
        checkin_time_str = booking.checked_in_at.strftime('%I:%M %p') if booking.checked_in_at else "previously"
        return Response({
            "error": "already_checked_in",
            "message": f"This booking has already been checked in at {checkin_time_str}."
        }, status=status.HTTP_400_BAD_REQUEST)

    # 2. Check active lifecycle status
    if booking.status == Booking.STATUS_CANCELLED:
        return Response({
            "error": "booking_cancelled",
            "message": "Cannot check in: This booking has been cancelled."
        }, status=status.HTTP_400_BAD_REQUEST)

    if booking.status == Booking.STATUS_REJECTED:
        return Response({
            "error": "booking_rejected",
            "message": "Cannot check in: This booking was rejected."
        }, status=status.HTTP_400_BAD_REQUEST)

    if booking.status == Booking.STATUS_NO_SHOW:
        return Response({
            "error": "booking_no_show",
            "message": "Cannot check in: This booking was marked as a no-show."
        }, status=status.HTTP_400_BAD_REQUEST)

    if booking.status not in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]:
        return Response({
            "error": "invalid_status",
            "message": f"Booking status '{booking.get_status_display()}' cannot be checked in."
        }, status=status.HTTP_400_BAD_REQUEST)

    # 3. Resource matching verification
    if resource_id is not None and str(resource_id).strip() != "":
        try:
            res_id = int(resource_id)
            if res_id != booking.resource_id:
                return Response({
                    "error": "resource_mismatch",
                    "message": f"Resource mismatch: Booking #{booking.id} is for '{booking.resource.name}' (#{booking.resource_id}), but scanned room is #{res_id}."
                }, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return Response({
                "error": "invalid_resource_id",
                "message": "Invalid resource ID provided."
            }, status=status.HTTP_400_BAD_REQUEST)

    # 4. Check-in window validation
    slot = booking.get_primary_slot()
    if not slot or not slot.period or not slot.period.lower:
        return Response({
            "error": "no_active_slot",
            "message": "No active reservation slot found for this booking."
        }, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    window_start, window_end, slot_start, slot_end = booking.get_checkin_window()

    bypass_window = force and (is_custodian or is_dept_head or is_staff)
    if not bypass_window:
        if now < window_start:
            return Response({
                "error": "checkin_too_early",
                "message": f"Check-in is not yet open. Window opens 15 minutes prior to start time (at {window_start.strftime('%I:%M %p')})."
            }, status=status.HTTP_400_BAD_REQUEST)

        if now > slot_end:
            return Response({
                "error": "checkin_expired",
                "message": "Cannot check in: This booking reservation period has already expired."
            }, status=status.HTTP_400_BAD_REQUEST)

        if now > window_end:
            return Response({
                "error": "checkin_window_closed",
                "message": "Check-in window has expired. Check-in must be completed within 30 minutes of start time."
            }, status=status.HTTP_400_BAD_REQUEST)

    # 5. Atomic state update with row-level locking
    with transaction.atomic():
        locked = Booking.objects.select_for_update().select_related('resource', 'requester').get(pk=booking.pk)
        if locked.status == Booking.STATUS_CHECKED_IN:
            checkin_time_str = locked.checked_in_at.strftime('%I:%M %p') if locked.checked_in_at else "previously"
            return Response({
                "error": "already_checked_in",
                "message": f"This booking has already been checked in at {checkin_time_str}."
            }, status=status.HTTP_400_BAD_REQUEST)

        if locked.status not in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]:
            return Response({
                "error": "invalid_status",
                "message": f"Booking status '{locked.get_status_display()}' cannot be checked in."
            }, status=status.HTTP_400_BAD_REQUEST)

        locked.status = Booking.STATUS_CHECKED_IN
        locked.checked_in_at = now
        locked.checked_in_by = user
        locked.save()
        booking = locked

    return Response({
        "message": f"Check-in successful! Welcome to {booking.resource.name}.",
        "booking": BookingSerializer(booking).data
    }, status=status.HTTP_200_OK)

class BookingQRCodeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        try:
            booking = Booking.objects.select_related('resource', 'requester').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_owner = booking.requester == user
        is_custodian = booking.resource.custodian == user
        is_dept_head = bool(
            user.is_dept_head_role
            and user.department
            and (
                (booking.resource.custodian and booking.resource.custodian.department == user.department)
                or (getattr(booking.resource, 'department', None) == user.department)
            )
        )
        is_staff = user.is_admin_role or user.is_facility_mgr_role or user.is_superuser

        if not (is_owner or is_custodian or is_dept_head or is_staff):
            return Response({"detail": "Permission denied to access this booking's QR code."}, status=status.HTTP_403_FORBIDDEN)

        w_start, w_end, s_start, s_end = booking.get_checkin_window()
        now = timezone.now()
        can_checkin = (
            w_start is not None
            and w_end is not None
            and (w_start <= now <= w_end)
            and booking.status in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]
        )

        return Response({
            "booking_id": booking.id,
            "checkin_token": str(booking.checkin_token),
            "resource_id": booking.resource_id,
            "resource_name": booking.resource.name,
            "resource_location": booking.resource.location,
            "requester": booking.requester.username,
            "requester_name": booking.requester.get_full_name() or booking.requester.username,
            "status": booking.status,
            "status_display": booking.get_status_display(),
            "checked_in_at": booking.checked_in_at.isoformat() if booking.checked_in_at else None,
            "start_time": s_start.isoformat() if s_start else None,
            "end_time": s_end.isoformat() if s_end else None,
            "checkin_window_start": w_start.isoformat() if w_start else None,
            "checkin_window_end": w_end.isoformat() if w_end else None,
            "can_check_in": can_checkin,
            "qr_svg": booking.generate_qr_svg(),
            "qr_data_url": booking.generate_qr_data_url(),
        }, status=status.HTTP_200_OK)

class BookingCheckInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        try:
            booking = Booking.objects.select_related('resource', 'requester').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"error": "not_found", "detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        resource_id = request.data.get('resource_id')
        force = bool(request.data.get('force', False))
        return execute_booking_checkin(booking, request.user, resource_id=resource_id, force=force)

class BookingTokenCheckInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = BookingCheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data.get('token')
        if not token:
            return Response({"error": "missing_token", "detail": "QR check-in token is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            booking = Booking.objects.select_related('resource', 'requester').get(checkin_token=token)
        except Booking.DoesNotExist:
            return Response({
                "error": "invalid_qr",
                "message": "Invalid QR code or check-in token. No matching booking found."
            }, status=status.HTTP_404_NOT_FOUND)

        resource_id = serializer.validated_data.get('resource_id')
        force = bool(request.data.get('force', False))
        return execute_booking_checkin(booking, request.user, resource_id=resource_id, force=force)


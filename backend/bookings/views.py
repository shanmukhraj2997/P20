from datetime import datetime, time, timedelta, timezone as dt_timezone
from psycopg2.extras import DateTimeTZRange
from psycopg2.errors import ExclusionViolation
from django.db import models, transaction, IntegrityError, DatabaseError
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.http import HttpResponse
from bookings.models import (
    Booking, BookingSlot, BookingSeries, TimetableEntry, BookingConsumable, restore_booking_consumables
)
from bookings.serializers import (
    BookingSerializer, BookingCreateSerializer, BookingSlotSerializer,
    BookingCheckInSerializer, BookingSeriesSerializer, TimetableEntrySerializer,
    BookingConsumableSerializer
)
from icalendar import Calendar, Event
from resources.models import Resource, Consumable
from availability.models import AvailabilityRule, Blackout
from accounts.models import Notification
from accounts.notifications import send_notification

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
                    is_timetable = slot.booking.kind == Booking.KIND_TIMETABLE
                    course_label = slot.booking.purpose.replace('Timetable Hold: ', '').replace('Timetable: ', '')
                    events.append({
                        "id": f"booking-{slot.booking_id}",
                        "title": f"Class: {course_label}" if is_timetable else ("My Booking" if is_own else "Reserved"),
                        "start": s_lower.isoformat(),
                        "end": s_upper.isoformat(),
                        "type": "timetable" if is_timetable else "booking",
                        "color": "#0284c7" if is_timetable else ("#F58220" if is_own else "#444444"),
                        "status": slot.booking.status,
                        "kind": slot.booking.kind,
                    })

        # 2. Blackout / Maintenance Periods (Resource-specific & Campus-wide)
        blackouts = Blackout.objects.filter(
            models.Q(resource=resource) | models.Q(resource__isnull=True),
            start_datetime__lt=end_dt,
            end_datetime__gt=start_dt
        )
        for b in blackouts:
            kind_title = b.get_kind_display() if hasattr(b, 'get_kind_display') else "Maintenance"
            events.append({
                "id": f"blackout-{b.id}",
                "title": f"{kind_title}: {b.reason}",
                "start": b.start_datetime.isoformat(),
                "end": b.end_datetime.isoformat(),
                "type": "blackout",
                "kind": getattr(b, 'kind', 'maintenance'),
                "color": "#b91c1c",
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
                "color": "#b91c1c",
                "display": "background",
            })

        return Response({
            "resource_id": resource.id,
            "resource_name": resource.name,
            "status": resource.status,
            "events": events
        }, status=status.HTTP_200_OK)

def reserve_booking_consumables(booking, consumables_data, resource):
    """
    Validates, locks (select_for_update), deducts stock, and creates BookingConsumables.
    Must be called inside an active transaction.atomic().
    Returns (True, None) on success or (False, error_dict) on validation/stock failure.
    """
    if not consumables_data:
        return True, None

    needed = {}
    for item in consumables_data:
        cid = item.get('consumable_id')
        qty = item.get('quantity', 1)
        try:
            cid = int(cid)
            qty = int(qty)
            if qty < 1:
                return False, {"error": "invalid_quantity", "message": "Quantity must be at least 1."}
        except (ValueError, TypeError):
            return False, {"error": "invalid_quantity", "message": "Invalid consumable ID or quantity."}
        needed[cid] = needed.get(cid, 0) + qty

    sorted_cids = sorted(needed.keys())
    locked_consumables = {
        c.id: c for c in Consumable.objects.select_for_update().filter(id__in=sorted_cids)
    }

    for cid in sorted_cids:
        if cid not in locked_consumables:
            return False, {
                "error": "consumable_not_found",
                "message": f"Consumable with ID {cid} was not found."
            }
        c = locked_consumables[cid]
        if c.resource_id and c.resource_id != resource.id:
            return False, {
                "error": "invalid_consumable_resource",
                "message": f"Consumable '{c.name}' is only available for resource '{c.resource.name}'."
            }
        qty = needed[cid]
        if c.stock < qty:
            return False, {
                "error": "insufficient_stock",
                "message": f"Insufficient stock for consumable '{c.name}'. Available: {c.stock}, requested: {qty}."
            }

    for cid in sorted_cids:
        qty = needed[cid]
        c = locked_consumables[cid]
        c.stock -= qty
        c.save(update_fields=['stock'])
        BookingConsumable.objects.create(
            booking=booking,
            consumable=c,
            quantity=qty
        )

    return True, None

class BookingListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        bookings = Booking.objects.filter(requester=request.user).prefetch_related('slots', 'resource', 'requester')
        serializer = BookingSerializer(bookings, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        serializer = BookingCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        resource = serializer.validated_data['resource']
        start_time = serializer.validated_data['start_time']
        end_time = serializer.validated_data['end_time']
        purpose = serializer.validated_data['purpose']
        recurrence = serializer.validated_data.get('recurrence')
        skip_conflicts = (
            serializer.validated_data.get('skip_conflicts', False) or
            request.data.get('skip_conflicts') in [True, 'true', 1, '1']
        )
        consumables_data = serializer.validated_data.get('consumables', [])

        initial_status = Booking.STATUS_PENDING if getattr(resource, 'requires_approval', False) else Booking.STATUS_APPROVED

        # --- A) Single Booking Flow ---
        if not recurrence:
            try:
                with transaction.atomic():
                    booking = Booking.objects.create(
                        requester=request.user,
                        resource=resource,
                        purpose=purpose,
                        status=initial_status
                    )
                    period_range = DateTimeTZRange(start_time, end_time)
                    BookingSlot.objects.create(
                        booking=booking,
                        resource=resource,
                        period=period_range,
                        is_active=True
                    )

                    if consumables_data:
                        success, err = reserve_booking_consumables(booking, consumables_data, resource)
                        if not success:
                            transaction.set_rollback(True)
                            return Response(err, status=status.HTTP_400_BAD_REQUEST)

                output_serializer = BookingSerializer(booking)
                return Response(output_serializer.data, status=status.HTTP_201_CREATED)

            except IntegrityError as exc:
                cause = getattr(exc, '__cause__', None)
                if isinstance(cause, ExclusionViolation) or (cause and getattr(cause, 'pgcode', None) == '23P01'):
                    return Response({
                        "error": "booking_conflict",
                        "message": "The selected time slot is no longer available. Please choose another slot."
                    }, status=status.HTTP_409_CONFLICT)
                raise

        # --- B) Recurring Booking Flow (Atomic) ---
        occurrences = recurrence.get('occurrences', [])

        def check_occ_conflict(occ_s, occ_e):
            # 1. Blackouts
            if Blackout.objects.filter(
                models.Q(resource=resource) | models.Q(resource__isnull=True),
                start_datetime__lt=occ_e,
                end_datetime__gt=occ_s
            ).exists():
                return "Maintenance or downtime window conflict"
            # 2. Operating hours
            rules = AvailabilityRule.objects.filter(resource=resource, active=True)
            if not rules.exists():
                rules = AvailabilityRule.objects.filter(resource__isnull=True, active=True)
            if rules.exists():
                day_rules = rules.filter(day_of_week=occ_s.weekday())
                if not day_rules.exists():
                    return f"Resource '{resource.name}' is closed on this day"
                within = any(r.start_time <= occ_s.time() and occ_e.time() <= r.end_time for r in day_rules)
                if not within:
                    return "Outside resource operating hours"
            # 3. Existing active booking slot overlap
            if BookingSlot.objects.filter(
                resource=resource,
                is_active=True,
                period__overlap=DateTimeTZRange(occ_s, occ_e)
            ).exists():
                return "Slot already booked"
            return None

        # Mode 1: Strict atomic transaction (skip_conflicts = False)
        if not skip_conflicts:
            conflicting_dates = []
            for occ_s, occ_e in occurrences:
                conflict_reason = check_occ_conflict(occ_s, occ_e)
                if conflict_reason:
                    conflicting_dates.append(occ_s.isoformat())

            if conflicting_dates:
                return Response({
                    "error": "conflict",
                    "message": "One or more recurring dates conflict with existing bookings or maintenance windows.",
                    "conflicting_dates": conflicting_dates
                }, status=status.HTTP_409_CONFLICT)

            # All clear: execute in ONE atomic transaction
            try:
                with transaction.atomic():
                    series = BookingSeries.objects.create(
                        requester=request.user,
                        resource=resource,
                        frequency=recurrence.get('frequency', 'weekly'),
                        interval=recurrence.get('interval', 1),
                        until=recurrence.get('until'),
                        count=recurrence.get('count') or len(occurrences)
                    )
                    created_bookings = []
                    for occ_s, occ_e in occurrences:
                        b = Booking.objects.create(
                            series=series,
                            requester=request.user,
                            resource=resource,
                            purpose=purpose,
                            status=initial_status
                        )
                        BookingSlot.objects.create(
                            booking=b,
                            resource=resource,
                            period=DateTimeTZRange(occ_s, occ_e),
                            is_active=True
                        )
                        created_bookings.append(b)

                return Response({
                    "message": f"Successfully created recurring series with {len(created_bookings)} bookings.",
                    "series_id": series.id,
                    "total_requested": len(occurrences),
                    "created_count": len(created_bookings),
                    "skipped_dates": [],
                    "bookings": BookingSerializer(created_bookings, many=True).data
                }, status=status.HTTP_201_CREATED)

            except IntegrityError as exc:
                cause = getattr(exc, '__cause__', None)
                if isinstance(cause, ExclusionViolation) or (cause and getattr(cause, 'pgcode', None) == '23P01'):
                    return Response({
                        "error": "conflict",
                        "message": "One or more recurring dates conflict with existing bookings.",
                        "conflicting_dates": [occ_s.isoformat() for occ_s, _ in occurrences]
                    }, status=status.HTTP_409_CONFLICT)
                raise

        # Mode 2: Permissive atomic transaction with skip_conflicts = True
        try:
            with transaction.atomic():
                series = BookingSeries.objects.create(
                    requester=request.user,
                    resource=resource,
                    frequency=recurrence.get('frequency', 'weekly'),
                    interval=recurrence.get('interval', 1),
                    until=recurrence.get('until'),
                    count=recurrence.get('count') or len(occurrences)
                )
                created_bookings = []
                skipped_dates = []

                for occ_s, occ_e in occurrences:
                    conflict_reason = check_occ_conflict(occ_s, occ_e)
                    if conflict_reason:
                        skipped_dates.append(occ_s.isoformat())
                        continue

                    # Insert with savepoint to catch any race-condition exclusion violation
                    try:
                        with transaction.atomic():
                            b = Booking.objects.create(
                                series=series,
                                requester=request.user,
                                resource=resource,
                                purpose=purpose,
                                status=initial_status
                            )
                            BookingSlot.objects.create(
                                booking=b,
                                resource=resource,
                                period=DateTimeTZRange(occ_s, occ_e),
                                is_active=True
                            )
                            created_bookings.append(b)
                    except IntegrityError as exc:
                        cause = getattr(exc, '__cause__', None)
                        if isinstance(cause, ExclusionViolation) or (cause and getattr(cause, 'pgcode', None) == '23P01'):
                            skipped_dates.append(occ_s.isoformat())
                        else:
                            raise

                if not created_bookings:
                    # Everything conflicted
                    transaction.set_rollback(True)
                    return Response({
                        "error": "conflict",
                        "message": "All requested recurring dates conflict with existing reservations or maintenance.",
                        "conflicting_dates": skipped_dates,
                        "skipped_dates": skipped_dates
                    }, status=status.HTTP_409_CONFLICT)

            return Response({
                "message": f"Created {len(created_bookings)} recurring bookings ({len(skipped_dates)} skipped due to conflict).",
                "series_id": series.id,
                "total_requested": len(occurrences),
                "created_count": len(created_bookings),
                "skipped_dates": skipped_dates,
                "bookings": BookingSerializer(created_bookings, many=True).data
            }, status=status.HTTP_201_CREATED)

        except IntegrityError:
            raise

class BookingDetailView(generics.RetrieveAPIView):
    queryset = Booking.objects.all().prefetch_related('slots', 'resource', 'requester')
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin_role or user.is_facility_mgr_role or user.is_superuser:
            return Booking.objects.all()
        if user.is_custodian_role:
            return Booking.objects.filter(
                models.Q(requester=user) | models.Q(resource__custodian=user)
            )
        if user.is_dept_head_role:
            return Booking.objects.filter(
                models.Q(requester=user) | models.Q(resource__custodian__department=user.department)
            )
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

        cancel_series = (
            request.data.get('cancel_series') in [True, 'true', 1, '1'] or
            request.query_params.get('cancel_series') in ['true', '1']
        )
        if cancel_series and booking.series_id:
            series = booking.series
            with transaction.atomic():
                active_bookings = list(series.bookings.filter(
                    status__in=[Booking.STATUS_PENDING, Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]
                ).select_related('requester', 'resource'))
                cancelled_count = len(active_bookings)
                for ab in active_bookings:
                    ab.status = Booking.STATUS_CANCELLED
                    ab.save(update_fields=['status'])
                    ab.slots.update(is_active=False)
                    restore_booking_consumables(ab)

                BookingSlot.objects.filter(booking__in=series.bookings.all()).update(is_active=False)

                send_notification(
                    user=booking.requester,
                    notification_type=Notification.TYPE_CANCELLATION,
                    title="Booking Series Cancelled",
                    message=f"All {cancelled_count} active bookings in series #{series.id} for {series.resource.name} have been cancelled."
                )

            return Response({
                "message": f"Successfully cancelled all {cancelled_count} active bookings in series #{series.id}.",
                "cancelled_count": cancelled_count,
                "series_id": series.id,
                "target": "series"
            }, status=status.HTTP_200_OK)

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

            # Restore reserved consumables
            restore_booking_consumables(booking)

            send_notification(
                user=booking.requester,
                notification_type=Notification.TYPE_CANCELLATION,
                title="Booking Cancelled",
                message=f"Your booking #{booking.id} for {booking.resource.name} has been cancelled."
            )

        return Response({
            "message": "Booking successfully cancelled. Time slot has been released.",
            "booking": BookingSerializer(booking).data
        }, status=status.HTTP_200_OK)

class BookingManageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        if user.is_admin_role or user.is_facility_mgr_role or user.is_superuser:
            qs = Booking.objects.all()
        elif user.is_custodian_role:
            qs = Booking.objects.filter(resource__custodian=user)
        elif user.is_dept_head_role and user.department:
            qs = Booking.objects.filter(
                models.Q(resource__department__iexact=user.department) |
                models.Q(resource__custodian__department__iexact=user.department)
            )
        else:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.strip().lower())

        qs = qs.prefetch_related('slots', 'resource', 'requester').order_by('-created_at')
        serializer = BookingSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

def can_review_booking(user, booking):
    """
    Check if a user is authorized to approve or reject a booking.
    Allowed:
    - Administrator, Facility Manager, Superuser (global scope)
    - Resource Custodian (assigned resource)
    - Department Head (resource within their academic/admin department)
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_admin_role or user.is_facility_mgr_role or user.is_superuser:
        return True
    if user.is_custodian_role and booking.resource.custodian == user:
        return True
    if user.is_dept_head_role and user.department:
        res_dept = booking.resource.department or (booking.resource.custodian.department if booking.resource.custodian else None)
        if res_dept and res_dept.strip().lower() == user.department.strip().lower():
            return True
    return False

class BookingApproveView(APIView):
    """
    POST /api/bookings/<id>/approve/
    Approves a pending booking.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        try:
            booking = Booking.objects.select_related('resource', 'resource__custodian', 'requester').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        if not can_review_booking(request.user, booking):
            return Response(
                {"detail": "Permission denied to review this booking."},
                status=status.HTTP_403_FORBIDDEN
            )

        if booking.status != Booking.STATUS_PENDING:
            return Response(
                {
                    "error": "invalid_status",
                    "detail": f"Only pending bookings can be approved. Current status is '{booking.get_status_display()}'."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        note = request.data.get('decision_note') or request.data.get('note') or ''
        with transaction.atomic():
            booking.status = Booking.STATUS_APPROVED
            booking.reviewed_by = request.user
            booking.reviewed_at = timezone.now()
            booking.decision_note = note.strip()
            booking.save()

            send_notification(
                user=booking.requester,
                notification_type=Notification.TYPE_APPROVAL,
                title="Booking Approved",
                message=f"Your booking #{booking.id} for {booking.resource.name} has been approved."
            )

        return Response({
            "message": "Booking has been approved successfully.",
            "booking": BookingSerializer(booking).data
        }, status=status.HTTP_200_OK)

class BookingRejectView(APIView):
    """
    POST /api/bookings/<id>/reject/
    Rejects a pending booking. Requires a mandatory decision note/reason.
    Sets status=rejected and releases the slot (is_active=False).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        try:
            booking = Booking.objects.select_related('resource', 'resource__custodian', 'requester').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        if not can_review_booking(request.user, booking):
            return Response(
                {"detail": "Permission denied to review this booking."},
                status=status.HTTP_403_FORBIDDEN
            )

        if booking.status != Booking.STATUS_PENDING:
            return Response(
                {
                    "error": "invalid_status",
                    "detail": f"Only pending bookings can be rejected. Current status is '{booking.get_status_display()}'."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        note = request.data.get('decision_note') or request.data.get('note') or ''
        if not note or not str(note).strip():
            return Response(
                {
                    "error": "note_required",
                    "detail": "A decision note/reason is required when rejecting a booking."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            booking.status = Booking.STATUS_REJECTED
            booking.reviewed_by = request.user
            booking.reviewed_at = timezone.now()
            booking.decision_note = str(note).strip()
            booking.save()

            # Rejection releases the slot so other students can book it
            booking.slots.update(is_active=False)

            # Restore reserved consumables
            restore_booking_consumables(booking)

            send_notification(
                user=booking.requester,
                notification_type=Notification.TYPE_REJECTION,
                title="Booking Rejected",
                message=f"Your booking #{booking.id} for {booking.resource.name} was rejected. Reason: {note.strip()}"
            )

        return Response({
            "message": "Booking has been rejected and the time slot released.",
            "booking": BookingSerializer(booking).data
        }, status=status.HTTP_200_OK)

def execute_booking_checkin(booking, user, resource_id=None, force=False):
    """
    Validates check-in eligibility and executes state transition to STATUS_CHECKED_IN.
    Allowed for:
    - Resource custodian of that resource
    - Facility manager
    - Admin / Superuser
    - Department head for resources in their department
    - The booking owner (requester) via their own session
    """
    is_owner = (booking.requester_id == user.id)
    is_custodian = (booking.resource.custodian_id == user.id)
    is_dept_head = bool(
        getattr(user, 'is_dept_head_role', False)
        and user.department
        and (
            (booking.resource.custodian and booking.resource.custodian.department == user.department)
            or (getattr(booking.resource, 'department', None) == user.department)
        )
    )
    is_staff = (
        getattr(user, 'is_admin_role', False)
        or getattr(user, 'is_facility_mgr_role', False)
        or user.is_superuser
        or getattr(user, 'role', None) in ['admin', 'facility_mgr']
    )

    if not (is_owner or is_custodian or is_dept_head or is_staff):
        return Response({
            "error": "unauthorized_checkin",
            "detail": "You do not have permission to check in this booking.",
            "message": "You do not have permission to check in this booking."
        }, status=status.HTTP_403_FORBIDDEN)

    # 1. Prevent duplicate check-in
    if booking.status == Booking.STATUS_CHECKED_IN:
        checkin_time_str = booking.checked_in_at.strftime('%I:%M %p') if booking.checked_in_at else "previously"
        return Response({
            "error": "already_checked_in",
            "detail": f"This booking has already been checked in at {checkin_time_str}.",
            "message": f"This booking has already been checked in at {checkin_time_str}."
        }, status=status.HTTP_400_BAD_REQUEST)

    # 2. Check active lifecycle status
    if booking.status == Booking.STATUS_CANCELLED:
        return Response({
            "error": "booking_cancelled",
            "detail": "Cannot check in: This booking has been cancelled.",
            "message": "Cannot check in: This booking has been cancelled."
        }, status=status.HTTP_400_BAD_REQUEST)

    if booking.status == Booking.STATUS_REJECTED:
        return Response({
            "error": "booking_rejected",
            "detail": "Cannot check in: This booking was rejected.",
            "message": "Cannot check in: This booking was rejected."
        }, status=status.HTTP_400_BAD_REQUEST)

    if booking.status == Booking.STATUS_NO_SHOW:
        return Response({
            "error": "booking_no_show",
            "detail": "Cannot check in: This booking was marked as a no-show.",
            "message": "Cannot check in: This booking was marked as a no-show."
        }, status=status.HTTP_400_BAD_REQUEST)

    if booking.status not in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]:
        return Response({
            "error": "invalid_status",
            "detail": f"Booking status '{booking.get_status_display()}' cannot be checked in.",
            "message": f"Booking status '{booking.get_status_display()}' cannot be checked in."
        }, status=status.HTTP_400_BAD_REQUEST)

    # 3. Resource matching verification
    if resource_id is not None and str(resource_id).strip() != "":
        try:
            res_id = int(resource_id)
            if res_id != booking.resource_id:
                return Response({
                    "error": "resource_mismatch",
                    "detail": f"Resource mismatch: Booking #{booking.id} is for '{booking.resource.name}' (#{booking.resource_id}), but scanned room is #{res_id}.",
                    "message": f"Resource mismatch: Booking #{booking.id} is for '{booking.resource.name}' (#{booking.resource_id}), but scanned room is #{res_id}."
                }, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return Response({
                "error": "invalid_resource_id",
                "detail": "Invalid resource ID provided.",
                "message": "Invalid resource ID provided."
            }, status=status.HTTP_400_BAD_REQUEST)

    # 4. Check-in window validation
    slot = booking.get_primary_slot()
    if not slot or not slot.period or not slot.period.lower:
        return Response({
            "error": "no_active_slot",
            "detail": "No active reservation slot found for this booking.",
            "message": "No active reservation slot found for this booking."
        }, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    window_start, window_end, slot_start, slot_end = booking.get_checkin_window()

    bypass_window = force and (is_custodian or is_dept_head or is_staff)
    if not bypass_window:
        if now < window_start:
            return Response({
                "error": "checkin_too_early",
                "detail": f"Check-in is not yet open. Window opens 15 minutes prior to start time (at {window_start.strftime('%I:%M %p')}).",
                "message": f"Check-in is not yet open. Window opens 15 minutes prior to start time (at {window_start.strftime('%I:%M %p')})."
            }, status=status.HTTP_400_BAD_REQUEST)

        if now > slot_end:
            return Response({
                "error": "checkin_expired",
                "detail": "Cannot check in: This booking reservation period has already expired.",
                "message": "Cannot check in: This booking reservation period has already expired."
            }, status=status.HTTP_400_BAD_REQUEST)

        if now > window_end:
            from django.conf import settings
            grace = getattr(settings, 'CHECKIN_GRACE_PERIOD_MINUTES', 30)
            return Response({
                "error": "checkin_window_closed",
                "detail": f"Check-in window has expired. Check-in must be completed within {grace} minutes of start time.",
                "message": f"Check-in window has expired. Check-in must be completed within {grace} minutes of start time."
            }, status=status.HTTP_400_BAD_REQUEST)

    # 5. Atomic state update with row-level locking
    with transaction.atomic():
        locked = Booking.objects.select_for_update().select_related('resource', 'requester').get(pk=booking.pk)
        if locked.status == Booking.STATUS_CHECKED_IN:
            checkin_time_str = locked.checked_in_at.strftime('%I:%M %p') if locked.checked_in_at else "previously"
            return Response({
                "error": "already_checked_in",
                "detail": f"This booking has already been checked in at {checkin_time_str}.",
                "message": f"This booking has already been checked in at {checkin_time_str}."
            }, status=status.HTTP_400_BAD_REQUEST)

        if locked.status not in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]:
            return Response({
                "error": "invalid_status",
                "detail": f"Booking status '{locked.get_status_display()}' cannot be checked in.",
                "message": f"Booking status '{locked.get_status_display()}' cannot be checked in."
            }, status=status.HTTP_400_BAD_REQUEST)

        locked.status = Booking.STATUS_CHECKED_IN
        locked.checked_in_at = now
        locked.checked_in_by = user
        locked.save()
        booking = locked

    return Response({
        "message": f"Check-in successful! Welcome to {booking.resource.name}.",
        "detail": f"Check-in successful! Welcome to {booking.resource.name}.",
        "booking": BookingSerializer(booking).data
    }, status=status.HTTP_200_OK)


class BookingQRCodeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        try:
            booking = Booking.objects.select_related('resource', 'resource__custodian', 'requester').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_owner = (booking.requester_id == user.id)
        is_custodian = (booking.resource.custodian_id == user.id)
        is_dept_head = bool(
            getattr(user, 'is_dept_head_role', False)
            and user.department
            and (
                (booking.resource.custodian and booking.resource.custodian.department == user.department)
                or (getattr(booking.resource, 'department', None) == user.department)
            )
        )
        is_staff = (
            getattr(user, 'is_admin_role', False)
            or getattr(user, 'is_facility_mgr_role', False)
            or user.is_superuser
            or getattr(user, 'role', None) in ['admin', 'facility_mgr']
        )

        if not (is_owner or is_custodian or is_dept_head or is_staff):
            return Response(
                {"detail": "Permission denied to access this booking's QR code."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Requirement: approved bookings only
        if booking.status not in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]:
            return Response(
                {"detail": f"QR code is only available for approved bookings (current status: {booking.status})."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generate PNG QR using qrcode library encoding the check-in token
        import io
        import qrcode
        from django.http import HttpResponse

        token_str = str(booking.checkin_token) if booking.checkin_token else ""
        qr = qrcode.QRCode(
            version=1,
            box_size=10,
            border=4,
        )
        qr.add_data(token_str)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        png_bytes = buffer.getvalue()

        w_start, w_end, s_start, s_end = booking.get_checkin_window()
        now = timezone.now()
        can_checkin = (
            w_start is not None
            and w_end is not None
            and (w_start <= now <= w_end)
        )

        import base64
        data_payload = {
            "booking_id": booking.id,
            "token": token_str,
            "checkin_token": token_str,
            "check_in_token": token_str,
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
            "qr_png_base64": f"data:image/png;base64,{base64.b64encode(png_bytes).decode('utf-8')}",
        }

        if request.query_params.get('format') == 'json':
            return Response(data_payload, status=status.HTTP_200_OK)

        response = HttpResponse(png_bytes, content_type='image/png')
        response.data = data_payload
        return response


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

        token = serializer.validated_data.get('token') or request.data.get('check_in_token') or request.data.get('token')
        if not token:
            return Response({
                "error": "missing_token",
                "detail": "QR check-in token is required.",
                "message": "QR check-in token is required."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Lookup booking by token (supporting raw token or UUID string)
        import uuid
        booking = Booking.objects.select_related('resource', 'resource__custodian', 'requester').filter(
            checkin_token=token
        ).first()

        if not booking:
            try:
                parsed_uuid = uuid.UUID(str(token).strip())
                booking = Booking.objects.select_related('resource', 'resource__custodian', 'requester').filter(
                    checkin_token=parsed_uuid
                ).first()
            except Exception:
                booking = None

        if not booking:
            return Response({
                "error": "invalid_qr",
                "detail": "Invalid QR code or check-in token. No matching booking found.",
                "message": "Invalid QR code or check-in token. No matching booking found."
            }, status=status.HTTP_404_NOT_FOUND)

        resource_id = serializer.validated_data.get('resource_id')
        force = bool(request.data.get('force', False))
        return execute_booking_checkin(booking, request.user, resource_id=resource_id, force=force)

def generate_ics_calendar(bookings, calendar_name="Campus Bookings"):
    cal = Calendar()
    cal.add('prodid', '-//P20 Unified Campus Booking Platform//campus.edu//EN')
    cal.add('version', '2.0')
    cal.add('calscale', 'GREGORIAN')
    cal.add('x-wr-calname', calendar_name)

    for b in bookings:
        slot = b.get_primary_slot()
        if not slot or not slot.period or not slot.period.lower or not slot.period.upper:
            continue
        event = Event()
        uid = f"p20-booking-{b.id}-{b.checkin_token or b.id}@campus.edu"
        event.add('uid', uid)
        event.add('summary', f"{b.resource.name} - {b.purpose[:60]}")
        event.add('location', b.resource.location or 'Campus Facility')
        event.add('dtstart', slot.period.lower.astimezone(dt_timezone.utc))
        event.add('dtend', slot.period.upper.astimezone(dt_timezone.utc))
        event.add('dtstamp', b.created_at.astimezone(dt_timezone.utc))
        event.add('description', f"Resource: {b.resource.name}\nStatus: {b.get_status_display()}\nRequester: {b.requester.get_full_name() or b.requester.username}\nPurpose: {b.purpose}")
        cal.add_component(event)

    return cal.to_ical()

class UserBookingsIcsExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        bookings = Booking.objects.filter(
            requester=request.user,
            status__in=[Booking.STATUS_PENDING, Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED, Booking.STATUS_CHECKED_IN]
        ).select_related('resource', 'requester').prefetch_related('slots')

        ics_bytes = generate_ics_calendar(bookings, calendar_name=f"{request.user.username}'s Campus Bookings")
        response = HttpResponse(ics_bytes, content_type='text/calendar; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="campus_bookings_{request.user.username}.ics"'
        return response

class BookingIcsExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        try:
            booking = Booking.objects.select_related('resource', 'requester').prefetch_related('slots').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({"detail": "Booking not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_owner = booking.requester == user
        is_custodian = booking.resource.custodian == user
        is_admin = user.is_admin_role or user.is_facility_mgr_role or user.is_superuser
        is_dept_head = user.is_dept_head_role and user.department and (
            (booking.resource.department and booking.resource.department.lower() == user.department.lower()) or
            (booking.resource.custodian and booking.resource.custodian.department and booking.resource.custodian.department.lower() == user.department.lower())
        )

        if not (is_owner or is_custodian or is_admin or is_dept_head):
            return Response({"detail": "Permission denied to export this booking."}, status=status.HTTP_403_FORBIDDEN)

        ics_bytes = generate_ics_calendar([booking], calendar_name=f"Booking #{booking.id}")
        response = HttpResponse(ics_bytes, content_type='text/calendar; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="booking_{booking.id}.ics"'
        return response

class TimetableImportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        import csv
        import io
        from datetime import datetime, date, time

        user = request.user
        if not (user.is_admin_role or user.is_facility_mgr_role or user.is_superuser):
            return Response({"detail": "Only administrators and facility managers can import timetable schedules."}, status=status.HTTP_403_FORBIDDEN)

        csv_file = request.FILES.get('file')
        csv_text = None
        if csv_file:
            try:
                csv_text = csv_file.read().decode('utf-8-sig')
            except UnicodeDecodeError:
                return Response({"error": "invalid_encoding", "detail": "CSV file must be UTF-8 encoded."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            csv_text = request.data.get('csv_data') or request.data.get('csv_content')

        if not csv_text or not csv_text.strip():
            return Response({"error": "missing_csv", "detail": "Please provide a valid CSV file or csv_data string."}, status=status.HTTP_400_BAD_REQUEST)

        f = io.StringIO(csv_text.strip())
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return Response({"error": "empty_csv", "detail": "CSV header is empty or invalid."}, status=status.HTTP_400_BAD_REQUEST)

        field_map = {fn.strip().lower(): fn for fn in reader.fieldnames}
        res_col = None
        for cand in ['resource_id', 'resource', 'resource_name', 'resource_code']:
            if cand in field_map:
                res_col = field_map[cand]
                break
        if not res_col:
            return Response({
                "error": "missing_column",
                "detail": "CSV must contain a 'resource_id' or 'resource_name' column."
            }, status=status.HTTP_400_BAD_REQUEST)

        weekday_names = {
            'monday': 0, 'mon': 0, '0': 0,
            'tuesday': 1, 'tue': 1, '1': 1,
            'wednesday': 2, 'wed': 2, '2': 2,
            'thursday': 3, 'thu': 3, '3': 3,
            'friday': 4, 'fri': 4, '4': 4,
            'saturday': 5, 'sat': 5, '5': 5,
            'sunday': 6, 'sun': 6, '6': 6,
        }

        row_errors = []
        clashes = []
        created_entries_count = 0
        generated_bookings_count = 0
        total_rows = 0

        for row_idx, row in enumerate(reader, start=2):
            total_rows += 1
            c_code = (row.get(field_map.get('course_code', 'course_code')) or '').strip()
            r_val = (row.get(res_col) or '').strip()
            w_val = (row.get(field_map.get('weekday', 'weekday')) or '').strip().lower()
            s_time_val = (row.get(field_map.get('start_time', 'start_time')) or '').strip()
            e_time_val = (row.get(field_map.get('end_time', 'end_time')) or '').strip()
            sem_start_val = (row.get(field_map.get('semester_start', 'semester_start')) or '').strip()
            sem_end_val = (row.get(field_map.get('semester_end', 'semester_end')) or '').strip()

            if not any([c_code, r_val, w_val, s_time_val, e_time_val]):
                continue

            if not c_code:
                row_errors.append({"row": row_idx, "course_code": "", "error": "course_code is required."})
                continue

            resource_obj = None
            if r_val.isdigit():
                resource_obj = Resource.objects.filter(pk=int(r_val)).first()
            if not resource_obj:
                resource_obj = Resource.objects.filter(name__iexact=r_val).first()
            if not resource_obj:
                row_errors.append({"row": row_idx, "course_code": c_code, "error": f"Resource '{r_val}' not found."})
                continue

            if w_val not in weekday_names:
                row_errors.append({"row": row_idx, "course_code": c_code, "error": f"Invalid weekday '{w_val}'. Expected Monday-Sunday or 0-6."})
                continue
            weekday_int = weekday_names[w_val]

            start_t = None
            end_t = None
            for fmt in ['%H:%M:%S', '%H:%M']:
                try:
                    start_t = datetime.strptime(s_time_val, fmt).time()
                    break
                except ValueError:
                    pass
            for fmt in ['%H:%M:%S', '%H:%M']:
                try:
                    end_t = datetime.strptime(e_time_val, fmt).time()
                    break
                except ValueError:
                    pass

            if not start_t or not end_t:
                row_errors.append({"row": row_idx, "course_code": c_code, "error": "Invalid time format. Expected HH:MM."})
                continue
            if start_t >= end_t:
                row_errors.append({"row": row_idx, "course_code": c_code, "error": f"start_time ({s_time_val}) must be strictly before end_time ({e_time_val})."})
                continue

            sem_start_d = None
            sem_end_d = None
            for fmt in ['%Y-%m-%d', '%d-%m-%Y', '%Y/%m/%d']:
                try:
                    sem_start_d = datetime.strptime(sem_start_val, fmt).date()
                    break
                except ValueError:
                    pass
            for fmt in ['%Y-%m-%d', '%d-%m-%Y', '%Y/%m/%d']:
                try:
                    sem_end_d = datetime.strptime(sem_end_val, fmt).date()
                    break
                except ValueError:
                    pass

            if not sem_start_d or not sem_end_d:
                row_errors.append({"row": row_idx, "course_code": c_code, "error": "Invalid date format for semester. Expected YYYY-MM-DD."})
                continue
            if sem_start_d > sem_end_d:
                row_errors.append({"row": row_idx, "course_code": c_code, "error": f"semester_start ({sem_start_val}) must be on or before semester_end ({sem_end_val})."})
                continue

            entry, _ = TimetableEntry.objects.get_or_create(
                resource=resource_obj,
                course_code=c_code,
                weekday=weekday_int,
                start_time=start_t,
                end_time=end_t,
                semester_start=sem_start_d,
                semester_end=sem_end_d
            )
            created_entries_count += 1

            curr_date = sem_start_d
            while curr_date <= sem_end_d:
                if curr_date.weekday() == weekday_int:
                    slot_start = timezone.make_aware(datetime.combine(curr_date, start_t))
                    slot_end = timezone.make_aware(datetime.combine(curr_date, end_t))
                    period_range = DateTimeTZRange(slot_start, slot_end)

                    blackouts = Blackout.objects.filter(
                        models.Q(resource=resource_obj) | models.Q(resource__isnull=True),
                        start_datetime__lt=slot_end,
                        end_datetime__gt=slot_start
                    )
                    if blackouts.exists():
                        b_first = blackouts.first()
                        clashes.append({
                            "row": row_idx,
                            "course_code": c_code,
                            "resource": resource_obj.name,
                            "date": curr_date.isoformat(),
                            "time": f"{start_t.strftime('%H:%M')}-{end_t.strftime('%H:%M')}",
                            "clashing_with": f"Blackout: {b_first.reason}",
                            "reason": "Overlaps with campus/resource downtime"
                        })
                        curr_date += timezone.timedelta(days=1)
                        continue

                    try:
                        with transaction.atomic():
                            b = Booking.objects.create(
                                requester=request.user,
                                resource=resource_obj,
                                purpose=f"Timetable Hold: {c_code}",
                                status=Booking.STATUS_APPROVED,
                                kind=Booking.KIND_TIMETABLE,
                                timetable_entry=entry
                            )
                            BookingSlot.objects.create(
                                booking=b,
                                resource=resource_obj,
                                period=period_range,
                                is_active=True
                            )
                            generated_bookings_count += 1
                    except IntegrityError as exc:
                        cause = getattr(exc, '__cause__', None)
                        if isinstance(cause, ExclusionViolation) or (cause and getattr(cause, 'pgcode', None) == '23P01'):
                            clashing_slot = BookingSlot.objects.filter(
                                resource=resource_obj,
                                is_active=True,
                                period__overlap=period_range
                            ).select_related('booking').first()
                            clashing_info = f"Booking #{clashing_slot.booking_id} ({clashing_slot.booking.purpose})" if clashing_slot else "Existing reservation"
                            clashes.append({
                                "row": row_idx,
                                "course_code": c_code,
                                "resource": resource_obj.name,
                                "date": curr_date.isoformat(),
                                "time": f"{start_t.strftime('%H:%M')}-{end_t.strftime('%H:%M')}",
                                "clashing_with": clashing_info,
                                "reason": "Overlaps with active booking slot"
                            })
                        else:
                            raise

                curr_date += timezone.timedelta(days=1)

        return Response({
            "success": True,
            "total_rows": total_rows,
            "entries_created": created_entries_count,
            "bookings_generated": generated_bookings_count,
            "clashes_count": len(clashes),
            "clashes": clashes,
            "errors_count": len(row_errors),
            "errors": row_errors,
        }, status=status.HTTP_201_CREATED if generated_bookings_count > 0 or not row_errors else status.HTTP_200_OK)

class TimetableListView(generics.ListAPIView):
    queryset = TimetableEntry.objects.all().select_related('resource')
    serializer_class = TimetableEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        res_id = self.request.query_params.get('resource')
        course = self.request.query_params.get('course_code')
        if res_id:
            qs = qs.filter(resource_id=res_id)
        if course:
            qs = qs.filter(course_code__icontains=course)
        return qs


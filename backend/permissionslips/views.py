from django.db import transaction
from django.utils import timezone
from django.db.models import Q
from psycopg2.extras import DateTimeTZRange
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from accounts.models import Notification, User
from resources.models import Resource
from bookings.models import Booking, BookingSlot, restore_booking_consumables
from permissionslips.models import PermissionSlip, PermissionSlipAuditLog
from permissionslips.serializers import (
    PermissionSlipSerializer,
    PermissionSlipCreateSerializer,
    PermissionSlipVerifySerializer,
    PermissionSlipRejectSerializer,
    PermissionSlipAllocateSerializer,
)

def is_authorized_verifier(user, resource_department=None, slip_department=None):
    """
    Checks whether a user is authorized to review, verify or reject permission slips.
    Authorized roles:
    - Superuser / Admin
    - Facility Manager
    - Department Head (for matching department)
    """
    if user.is_superuser or getattr(user, 'is_admin_role', False) or user.role in ['admin', 'facility_mgr'] or getattr(user, 'is_facility_mgr_role', False):
        return True

    if getattr(user, 'is_dept_head_role', False) or user.role == 'dept_head':
        user_dept = getattr(user, 'department', '')
        if user_dept:
            if resource_department and user_dept.lower() == resource_department.lower():
                return True
            if slip_department and user_dept.lower() == slip_department.lower():
                return True
    return False


def is_authorized_allocator(user):
    """
    Checks whether a user has authority to allocate rooms and execute conflict overrides.
    Only Facility Managers and Administrators have high-level conflict override authority.
    """
    if user.is_superuser or getattr(user, 'is_admin_role', False) or user.role in ['admin', 'facility_mgr'] or getattr(user, 'is_facility_mgr_role', False):
        return True
    return False


class PermissionSlipListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        role = getattr(user, 'role', '')
        is_admin_or_fm = (
            user.is_superuser
            or getattr(user, 'is_admin_role', False)
            or getattr(user, 'is_facility_mgr_role', False)
            or role in ['admin', 'facility_mgr']
        )
        is_dept_head = getattr(user, 'is_dept_head_role', False) or role == 'dept_head'

        queryset = PermissionSlip.objects.select_related(
            'requester', 'resource', 'verified_by', 'linked_booking'
        ).prefetch_related('audit_logs', 'audit_logs__performed_by')

        if is_admin_or_fm:
            # Full visibility
            pass
        elif is_dept_head and user.department:
            # Department visibility: departmental resources, slips with their dept, or submitted by user
            queryset = queryset.filter(
                Q(department__iexact=user.department)
                | Q(resource__department__iexact=user.department)
                | Q(requester=user)
            )
        else:
            # Regular user / student / faculty / custodian: own submitted slips
            queryset = queryset.filter(requester=user)

        # Query Filters
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(verification_status=status_filter)

        resource_filter = request.query_params.get('resource_id')
        if resource_filter:
            queryset = queryset.filter(resource_id=resource_filter)

        dept_filter = request.query_params.get('department')
        if dept_filter:
            queryset = queryset.filter(department__icontains=dept_filter)

        search_query = request.query_params.get('search')
        if search_query:
            queryset = queryset.filter(
                Q(reference_number__icontains=search_query)
                | Q(purpose__icontains=search_query)
                | Q(issuing_authority_name__icontains=search_query)
                | Q(requester__first_name__icontains=search_query)
                | Q(requester__last_name__icontains=search_query)
                | Q(requester__username__icontains=search_query)
            )

        serializer = PermissionSlipSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        serializer = PermissionSlipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            slip = serializer.save(
                requester=request.user,
                verification_status=PermissionSlip.STATUS_SUBMITTED
            )
            slip.log_action(
                action='submitted',
                performed_by=request.user,
                notes='Official University Permission Slip submitted for administrative verification.'
            )

        # Notify facility managers and relevant department heads
        dept_name = slip.department or (slip.resource.department if slip.resource else "")
        reviewers = User.objects.filter(
            Q(role__in=['admin', 'facility_mgr'])
            | (Q(role='dept_head') & Q(department__iexact=dept_name))
        ).distinct()
        for reviewer in reviewers:
            Notification.objects.create(
                user=reviewer,
                type=Notification.TYPE_GENERAL,
                title="New Official Permission Slip Submitted",
                message=f"New permission slip [{slip.reference_number}] submitted by {request.user.get_full_name() or request.user.username} for {slip.resource.name} ({slip.start_datetime.strftime('%Y-%m-%d %H:%M')})."
            )

        detail_serializer = PermissionSlipSerializer(slip, context={'request': request})
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)


class PermissionSlipDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        try:
            slip = PermissionSlip.objects.select_related(
                'requester', 'resource', 'verified_by', 'linked_booking'
            ).prefetch_related('audit_logs', 'audit_logs__performed_by').get(pk=pk)
        except PermissionSlip.DoesNotExist:
            return Response({"detail": "Permission slip not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        can_view = (
            slip.requester_id == user.id
            or is_authorized_verifier(user, slip.resource.department, slip.department)
        )
        if not can_view:
            return Response({"detail": "You do not have permission to view this permission slip."}, status=status.HTTP_403_FORBIDDEN)

        serializer = PermissionSlipSerializer(slip, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PermissionSlipReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        try:
            slip = PermissionSlip.objects.select_related('resource', 'requester').get(pk=pk)
        except PermissionSlip.DoesNotExist:
            return Response({"detail": "Permission slip not found."}, status=status.HTTP_404_NOT_FOUND)

        if not is_authorized_verifier(request.user, slip.resource.department, slip.department):
            return Response({"detail": "Only authorized university officials may review permission slips."}, status=status.HTTP_403_FORBIDDEN)

        if slip.verification_status in [PermissionSlip.STATUS_ALLOCATED, PermissionSlip.STATUS_CANCELLED]:
            return Response({
                "detail": f"Cannot change review status of a slip that is {slip.get_verification_status_display()}."
            }, status=status.HTTP_400_BAD_REQUEST)

        prev_status = slip.verification_status
        slip.verification_status = PermissionSlip.STATUS_UNDER_REVIEW
        slip.save(update_fields=['verification_status', 'updated_at'])

        slip.log_action(
            action='under_review',
            performed_by=request.user,
            previous_status=prev_status,
            new_status=PermissionSlip.STATUS_UNDER_REVIEW,
            notes='Permission slip moved to Under Review.'
        )

        serializer = PermissionSlipSerializer(slip, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PermissionSlipVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        try:
            slip = PermissionSlip.objects.select_related('resource', 'requester').get(pk=pk)
        except PermissionSlip.DoesNotExist:
            return Response({"detail": "Permission slip not found."}, status=status.HTTP_404_NOT_FOUND)

        if not is_authorized_verifier(request.user, slip.resource.department, slip.department):
            return Response({"detail": "Only authorized university officials may verify permission slips."}, status=status.HTTP_403_FORBIDDEN)

        if slip.verification_status in [PermissionSlip.STATUS_ALLOCATED, PermissionSlip.STATUS_CANCELLED]:
            return Response({
                "detail": f"Cannot re-verify a slip that is already {slip.get_verification_status_display()}."
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer = PermissionSlipVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        notes = serializer.validated_data.get('verification_notes', '').strip()

        prev_status = slip.verification_status
        now = timezone.now()
        slip.verification_status = PermissionSlip.STATUS_VERIFIED
        slip.verified_by = request.user
        slip.verified_at = now
        slip.verification_notes = notes
        slip.save(update_fields=['verification_status', 'verified_by', 'verified_at', 'verification_notes', 'updated_at'])

        slip.log_action(
            action='verified',
            performed_by=request.user,
            previous_status=prev_status,
            new_status=PermissionSlip.STATUS_VERIFIED,
            notes=notes or 'Certified and verified by official authority.'
        )

        Notification.objects.create(
            user=slip.requester,
            type=Notification.TYPE_APPROVAL,
            title="Permission Slip Verified",
            message=f"Your permission slip [{slip.reference_number}] for {slip.resource.name} has been verified and approved by {request.user.get_full_name() or request.user.username}. Ready for room allocation."
        )

        return Response(PermissionSlipSerializer(slip, context={'request': request}).data, status=status.HTTP_200_OK)


class PermissionSlipRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        try:
            slip = PermissionSlip.objects.select_related('resource', 'requester').get(pk=pk)
        except PermissionSlip.DoesNotExist:
            return Response({"detail": "Permission slip not found."}, status=status.HTTP_404_NOT_FOUND)

        if not is_authorized_verifier(request.user, slip.resource.department, slip.department):
            return Response({"detail": "Only authorized university officials may reject permission slips."}, status=status.HTTP_403_FORBIDDEN)

        if slip.verification_status == PermissionSlip.STATUS_ALLOCATED:
            return Response({"detail": "Cannot reject an already allocated permission slip."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PermissionSlipRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data['rejection_reason'].strip()

        prev_status = slip.verification_status
        now = timezone.now()
        slip.verification_status = PermissionSlip.STATUS_REJECTED
        slip.verified_by = request.user
        slip.verified_at = now
        slip.verification_notes = reason
        slip.save(update_fields=['verification_status', 'verified_by', 'verified_at', 'verification_notes', 'updated_at'])

        slip.log_action(
            action='rejected',
            performed_by=request.user,
            previous_status=prev_status,
            new_status=PermissionSlip.STATUS_REJECTED,
            notes=reason
        )

        Notification.objects.create(
            user=slip.requester,
            type=Notification.TYPE_REJECTION,
            title="Permission Slip Rejected",
            message=f"Your permission slip [{slip.reference_number}] for {slip.resource.name} was rejected. Reason: {reason}"
        )

        return Response(PermissionSlipSerializer(slip, context={'request': request}).data, status=status.HTTP_200_OK)


class PermissionSlipConflictCheckView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, *args, **kwargs):
        try:
            slip = PermissionSlip.objects.select_related('resource', 'requester').get(pk=pk)
        except PermissionSlip.DoesNotExist:
            return Response({"detail": "Permission slip not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        if not (slip.requester_id == user.id or is_authorized_verifier(user, slip.resource.department, slip.department)):
            return Response({"detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        # Check overlapping active booking slots
        target_range = DateTimeTZRange(slip.start_datetime, slip.end_datetime)
        overlapping_slots = BookingSlot.objects.filter(
            resource=slip.resource,
            is_active=True,
            period__overlap=target_range
        ).select_related('booking', 'booking__requester')

        website_conflicts = []
        official_conflicts = []

        for slot in overlapping_slots:
            b = slot.booking
            start_str = slot.period.lower.isoformat() if slot.period and slot.period.lower else None
            end_str = slot.period.upper.isoformat() if slot.period and slot.period.upper else None
            conflict_data = {
                "booking_id": b.id,
                "title": b.title if hasattr(b, 'title') and b.title else b.purpose[:50],
                "purpose": b.purpose,
                "source": b.source,
                "status": b.status,
                "requester": {
                    "id": b.requester.id,
                    "name": b.requester.get_full_name() or b.requester.username,
                    "email": b.requester.email,
                    "role": b.requester.role,
                },
                "start_time": start_str,
                "end_time": end_str,
            }
            if b.source == Booking.SOURCE_OFFICIAL_PERMISSION:
                official_conflicts.append(conflict_data)
            else:
                website_conflicts.append(conflict_data)

        has_conflicts = bool(website_conflicts or official_conflicts)
        can_override = (
            has_conflicts
            and not official_conflicts
            and is_authorized_allocator(user)
        )

        return Response({
            "has_conflicts": has_conflicts,
            "can_override": can_override,
            "total_conflicts": len(website_conflicts) + len(official_conflicts),
            "website_conflicts": website_conflicts,
            "official_conflicts": official_conflicts,
            "message": "Conflicts detected. Overriding website bookings requires administrator or facility manager authorization." if has_conflicts else "No conflicts detected for requested time window."
        }, status=status.HTTP_200_OK)


class PermissionSlipAllocateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        try:
            slip = PermissionSlip.objects.select_related('resource', 'requester').get(pk=pk)
        except PermissionSlip.DoesNotExist:
            return Response({"detail": "Permission slip not found."}, status=status.HTTP_404_NOT_FOUND)

        if not is_authorized_verifier(request.user, slip.resource.department, slip.department):
            return Response({"detail": "Only authorized officials can allocate rooms."}, status=status.HTTP_403_FORBIDDEN)

        if slip.verification_status == PermissionSlip.STATUS_ALLOCATED:
            return Response({
                "error": "already_allocated",
                "detail": f"This permission slip is already allocated to Booking #{slip.linked_booking_id}."
            }, status=status.HTTP_400_BAD_REQUEST)

        if slip.verification_status != PermissionSlip.STATUS_VERIFIED:
            return Response({
                "error": "not_verified",
                "detail": "Permission slip must be verified before room allocation can proceed."
            }, status=status.HTTP_400_BAD_REQUEST)

        serializer = PermissionSlipAllocateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        override = serializer.validated_data.get('override', False)
        override_reason = serializer.validated_data.get('override_reason', '').strip()

        if override and not is_authorized_allocator(request.user):
            return Response({
                "error": "unauthorized_override",
                "detail": "Only Facility Managers and Administrators possess authority to override and displace existing bookings."
            }, status=status.HTTP_403_FORBIDDEN)

        target_range = DateTimeTZRange(slip.start_datetime, slip.end_datetime)

        with transaction.atomic():
            # Lock the slip and resource
            slip_locked = PermissionSlip.objects.select_for_update().get(pk=pk)

            # Check for overlapping active slots with row-level locks
            overlapping_slots = list(
                BookingSlot.objects.select_for_update().filter(
                    resource=slip_locked.resource,
                    is_active=True,
                    period__overlap=target_range
                ).select_related('booking', 'booking__requester')
            )

            if overlapping_slots:
                # Check for another official allocation
                official_slots = [s for s in overlapping_slots if s.booking.source == Booking.SOURCE_OFFICIAL_PERMISSION]
                if official_slots:
                    conflict_ids = [str(s.booking_id) for s in official_slots]
                    return Response({
                        "error": "official_conflict",
                        "detail": f"Cannot allocate: Another official university allocation already occupies this slot (Booking #{', #'.join(conflict_ids)})."
                    }, status=status.HTTP_400_BAD_REQUEST)

                if not override:
                    conflict_ids = [str(s.booking_id) for s in overlapping_slots]
                    return Response({
                        "error": "conflict_detected",
                        "detail": f"Conflicting website booking(s) found (#{', #'.join(conflict_ids)}). Review conflicts and specify an override reason with administrative authority to displace them.",
                        "conflicts": [
                            {
                                "booking_id": s.booking.id,
                                "requester": s.booking.requester.get_full_name() or s.booking.requester.username,
                                "status": s.booking.status,
                                "start": s.period.lower.isoformat() if s.period and s.period.lower else None,
                                "end": s.period.upper.isoformat() if s.period and s.period.upper else None,
                            }
                            for s in overlapping_slots
                        ]
                    }, status=status.HTTP_400_BAD_REQUEST)

                # Execute Override & Displacement
                displaced_count = 0
                now = timezone.now()
                for slot in overlapping_slots:
                    cb = slot.booking
                    # Deactivate slot first so GiST exclusion constraint frees the range
                    slot.is_active = False
                    slot.save(update_fields=['is_active'])

                    # Mark booking cancelled with displacement reason
                    cb.status = Booking.STATUS_CANCELLED
                    cb.reviewed_by = request.user
                    cb.reviewed_at = now
                    cb.decision_note = f"Displaced by Official University Permission Slip [{slip_locked.reference_number}]: {override_reason}"
                    cb.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'decision_note', 'updated_at'])

                    # Restore any allocated consumables
                    restore_booking_consumables(cb)

                    # Send notification to displaced user
                    time_range_fmt = f"{slot.period.lower.strftime('%Y-%m-%d %H:%M')} - {slot.period.upper.strftime('%H:%M')}" if slot.period and slot.period.lower else ""
                    Notification.objects.create(
                        user=cb.requester,
                        type=Notification.TYPE_CANCELLATION,
                        title="Booking Displaced by Official University Allocation",
                        message=f"Your booking #{cb.id} for {slip_locked.resource.name} ({time_range_fmt}) was displaced by Official University Permission Slip [{slip_locked.reference_number}]. Reason: {override_reason}"
                    )
                    displaced_count += 1

            # Create the official Booking
            new_booking = Booking.objects.create(
                requester=slip_locked.requester,
                resource=slip_locked.resource,
                purpose=slip_locked.purpose,
                status=Booking.STATUS_CONFIRMED,
                kind=Booking.KIND_STANDARD,
                source=Booking.SOURCE_OFFICIAL_PERMISSION,
                reviewed_by=request.user,
                reviewed_at=timezone.now(),
                decision_note=f"Officially allocated via Permission Slip [{slip_locked.reference_number}]. Issuing Authority: {slip_locked.issuing_authority_name} ({slip_locked.issuing_authority_designation}).",
            )

            # Create the active BookingSlot (GiST range constraint validated by PostgreSQL)
            BookingSlot.objects.create(
                booking=new_booking,
                resource=slip_locked.resource,
                period=target_range,
                is_active=True
            )

            # Update PermissionSlip
            prev_status = slip_locked.verification_status
            slip_locked.verification_status = PermissionSlip.STATUS_ALLOCATED
            slip_locked.linked_booking = new_booking
            if override and override_reason:
                slip_locked.conflict_override_reason = override_reason
            slip_locked.save(update_fields=['verification_status', 'linked_booking', 'conflict_override_reason', 'updated_at'])

            # Log audit
            slip_locked.log_action(
                action='allocated',
                performed_by=request.user,
                previous_status=prev_status,
                new_status=PermissionSlip.STATUS_ALLOCATED,
                notes=f"Room {slip_locked.resource.name} officially allocated as Booking #{new_booking.id}." + (f" Displaced {displaced_count} booking(s)." if override else "")
            )

            # Send notification to requester
            Notification.objects.create(
                user=slip_locked.requester,
                type=Notification.TYPE_APPROVAL,
                title="Official University Room Allocation Confirmed",
                message=f"Room {slip_locked.resource.name} has been officially allocated for your permission slip [{slip_locked.reference_number}] from {slip_locked.start_datetime.strftime('%Y-%m-%d %H:%M')} to {slip_locked.end_datetime.strftime('%H:%M')}. Booking ID: #{new_booking.id}."
            )

        return Response({
            "message": f"Room {slip.resource.name} successfully allocated for Permission Slip [{slip.reference_number}].",
            "booking_id": new_booking.id,
            "displaced_bookings_count": displaced_count if override else 0,
            "slip": PermissionSlipSerializer(slip_locked, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)

from django.db import models
from rest_framework import serializers
from django.utils import timezone
from bookings.models import Booking, BookingSlot, BookingSeries, TimetableEntry, BookingConsumable
from resources.models import Resource
from availability.models import AvailabilityRule, Blackout

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
    recurrence = serializers.DictField(required=False, allow_null=True, default=None)
    skip_conflicts = serializers.BooleanField(required=False, default=False)
    consumables = serializers.ListField(child=serializers.DictField(), required=False, default=list)

    def validate(self, data):
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        resource = data.get('resource')
        recurrence = data.get('recurrence')

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

        # 4. Recurrence validation if provided
        if recurrence:
            frequency = str(recurrence.get('frequency', 'weekly')).lower()
            if frequency != 'weekly':
                raise serializers.ValidationError({"recurrence": "Only 'weekly' recurrence is supported."})

            interval = recurrence.get('interval', 1)
            try:
                interval = int(interval)
                if interval < 1:
                    raise ValueError()
            except (ValueError, TypeError):
                raise serializers.ValidationError({"recurrence": "Interval must be a positive integer >= 1."})

            count = recurrence.get('count')
            until = recurrence.get('until')

            if count is None and not until:
                raise serializers.ValidationError({"recurrence": "Either 'count' or 'until' must be provided for recurrence."})

            max_count = 52
            if count is not None:
                try:
                    count = int(count)
                    if count < 1:
                        raise ValueError()
                    if count > 52:
                        raise serializers.ValidationError({"recurrence": "Maximum 52 occurrences allowed for a recurring booking."})
                    max_count = count
                except (ValueError, TypeError):
                    raise serializers.ValidationError({"recurrence": "Count must be a positive integer <= 52."})

            until_date = None
            if until:
                if isinstance(until, str):
                    from datetime import date, datetime
                    try:
                        until_date = datetime.fromisoformat(until.replace('Z', '+00:00')).date()
                    except ValueError:
                        try:
                            until_date = date.fromisoformat(until)
                        except ValueError:
                            raise serializers.ValidationError({"recurrence": "Invalid date format for 'until'. Expected YYYY-MM-DD."})
                elif hasattr(until, 'date'):
                    until_date = until.date()
                else:
                    until_date = until

            occurrences = []
            curr_s = start_time
            dur = end_time - start_time
            idx = 0
            while idx < max_count:
                curr_e = curr_s + dur
                if until_date and curr_s.date() > until_date:
                    break
                occurrences.append((curr_s, curr_e))
                idx += 1
                curr_s = curr_s + timezone.timedelta(weeks=interval)

            if len(occurrences) > 52:
                raise serializers.ValidationError({"recurrence": "Maximum 52 occurrences allowed for a recurring booking."})
            if len(occurrences) == 0:
                raise serializers.ValidationError({"recurrence": "No occurrences generated within the specified recurrence window."})

            rec_dict = dict(recurrence)
            rec_dict['frequency'] = frequency
            rec_dict['interval'] = interval
            rec_dict['count'] = count
            rec_dict['until'] = until_date
            rec_dict['occurrences'] = occurrences
            data['recurrence'] = rec_dict

        # 5. Check for blackout period overlap (for single booking; recurring handles conflicts returning 409)
        if not recurrence:
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

        # 6. Check maximum booking duration (overridable by staff)
        request = self.context.get('request')
        user = request.user if request and hasattr(request, 'user') else None
        is_staff_override = bool(
            user and user.is_authenticated and (
                user.is_staff or
                user.is_admin_role or
                user.is_facility_mgr_role or
                user.is_custodian_role or
                user.is_superuser
            )
        )
        if not is_staff_override:
            duration_hours = (end_time - start_time).total_seconds() / 3600.0
            max_allowed = getattr(resource, 'max_duration_hours', 4) or 4
            if duration_hours > max_allowed:
                raise serializers.ValidationError({
                    "end_time": f"Booking duration ({duration_hours:.1f} hours) exceeds the maximum allowed limit of {max_allowed} hours for this resource."
                })

        # 7. Check AvailabilityRule operating hours (for single booking)
        if not recurrence:
            rules = AvailabilityRule.objects.filter(resource=resource, active=True)
            if not rules.exists():
                rules = AvailabilityRule.objects.filter(resource__isnull=True, active=True)

            if rules.exists():
                day_of_week = start_time.weekday()
                day_rules = rules.filter(day_of_week=day_of_week)
                if not day_rules.exists():
                    raise serializers.ValidationError({
                        "non_field_errors": f"Resource '{resource.name}' is not open for bookings on this day."
                    })

                booking_start_time = start_time.time()
                booking_end_time = end_time.time()
                is_single_day = start_time.date() == end_time.date()

                within_hours = False
                if is_single_day:
                    for rule in day_rules:
                        if rule.start_time <= booking_start_time and booking_end_time <= rule.end_time:
                            within_hours = True
                            break

                if not within_hours:
                    hours_str = ", ".join([f"{r.start_time.strftime('%H:%M')}-{r.end_time.strftime('%H:%M')}" for r in day_rules])
                    raise serializers.ValidationError({
                        "non_field_errors": f"Booking times fall outside operating hours ({hours_str})."
                    })

        return data

class BookingConsumableSerializer(serializers.ModelSerializer):
    consumable_id = serializers.IntegerField(source='consumable.id', read_only=True)
    consumable_name = serializers.CharField(source='consumable.name', read_only=True)
    unit = serializers.CharField(source='consumable.unit', read_only=True)

    class Meta:
        model = BookingConsumable
        fields = ['id', 'consumable_id', 'consumable_name', 'unit', 'quantity']

class BookingSerializer(serializers.ModelSerializer):
    resource_name = serializers.CharField(source='resource.name', read_only=True)
    resource_location = serializers.CharField(source='resource.location', read_only=True)
    resource_type_name = serializers.CharField(source='resource.resource_type.name', read_only=True)
    requester_name = serializers.SerializerMethodField()
    requester_role = serializers.CharField(source='requester.get_role_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    start_time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()
    checked_in_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    can_check_in = serializers.SerializerMethodField()
    checkin_window_start = serializers.SerializerMethodField()
    checkin_window_end = serializers.SerializerMethodField()
    consumables = BookingConsumableSerializer(many=True, read_only=True)

    class Meta:
        model = Booking
        fields = [
            'id', 'resource', 'resource_name', 'resource_location', 'resource_type_name',
            'requester', 'requester_name', 'requester_role', 'purpose', 'status', 'status_display',
            'kind', 'series', 'timetable_entry', 'consumables',
            'start_time', 'end_time', 'checkin_token', 'checked_in_at', 'checked_in_by_name',
            'no_show_at', 'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'decision_note',
            'can_check_in', 'checkin_window_start', 'checkin_window_end',
            'created_at', 'updated_at'
        ]

    def get_requester_name(self, obj):
        return obj.requester.get_full_name() or obj.requester.username

    def get_start_time(self, obj):
        slot = obj.get_primary_slot()
        if slot and slot.period and slot.period.lower:
            return slot.period.lower.isoformat()
        return None

    def get_end_time(self, obj):
        slot = obj.get_primary_slot()
        if slot and slot.period and slot.period.upper:
            return slot.period.upper.isoformat()
        return None

    def get_checked_in_by_name(self, obj):
        if obj.checked_in_by:
            return obj.checked_in_by.get_full_name() or obj.checked_in_by.username
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username
        return None

    def get_can_check_in(self, obj):
        if obj.status not in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED]:
            return False
        w_start, w_end, _, _ = obj.get_checkin_window()
        if not w_start or not w_end:
            return False
        now = timezone.now()
        return w_start <= now <= w_end

    def get_checkin_window_start(self, obj):
        w_start, _, _, _ = obj.get_checkin_window()
        return w_start.isoformat() if w_start else None

    def get_checkin_window_end(self, obj):
        _, w_end, _, _ = obj.get_checkin_window()
        return w_end.isoformat() if w_end else None

class BookingSeriesSerializer(serializers.ModelSerializer):
    resource_name = serializers.CharField(source='resource.name', read_only=True)
    requester_name = serializers.SerializerMethodField()
    bookings_count = serializers.IntegerField(source='bookings.count', read_only=True)

    class Meta:
        model = BookingSeries
        fields = [
            'id', 'requester', 'requester_name', 'resource', 'resource_name',
            'frequency', 'interval', 'until', 'count', 'bookings_count',
            'created_at', 'updated_at'
        ]

    def get_requester_name(self, obj):
        return obj.requester.get_full_name() or obj.requester.username

class TimetableEntrySerializer(serializers.ModelSerializer):
    resource_name = serializers.CharField(source='resource.name', read_only=True)
    weekday_display = serializers.CharField(source='get_weekday_display', read_only=True)
    held_bookings_count = serializers.IntegerField(source='held_bookings.count', read_only=True)

    class Meta:
        model = TimetableEntry
        fields = [
            'id', 'resource', 'resource_name', 'course_code',
            'weekday', 'weekday_display', 'start_time', 'end_time',
            'semester_start', 'semester_end', 'held_bookings_count',
            'created_at', 'updated_at'
        ]

class BookingCheckInSerializer(serializers.Serializer):
    token = serializers.CharField(required=False, allow_blank=True)
    check_in_token = serializers.CharField(required=False, allow_blank=True)
    resource_id = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate(self, data):
        token_val = data.get('token') or data.get('check_in_token') or ''
        if isinstance(token_val, str):
            token_val = token_val.strip()
            if token_val.startswith('{') and token_val.endswith('}'):
                try:
                    import json
                    parsed = json.loads(token_val)
                    if isinstance(parsed, dict):
                        if 'token' in parsed:
                            token_val = parsed['token']
                        elif 'check_in_token' in parsed:
                            token_val = parsed['check_in_token']
                        if 'resource_id' in parsed and data.get('resource_id') is None:
                            data['resource_id'] = parsed['resource_id']
                except Exception:
                    pass
        data['token'] = token_val
        return data

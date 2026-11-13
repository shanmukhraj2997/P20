"""
Analytics and Reporting Engine for Campus Resource Booking Platform.
Provides scoped calculations for:
- Resource Utilization Rate (%)
- Bookings by Resource Category
- Peak Hours & Weekdays Distribution
- Cancellation & No-Show Performance Rates
- Top Users & Activity
- CSV Export generation for Bookings and Resource Usage
"""
import csv
import io
from datetime import datetime, time, timedelta
from django.db import models
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from accounts.models import User
from resources.models import Resource
from bookings.models import Booking, BookingSlot
from availability.models import AvailabilityRule


def parse_date_range(request):
    """
    Parses start_date and end_date from query parameters.
    Defaults to last 30 days up to today.
    Returns (start_datetime, end_datetime, start_date, end_date).
    """
    now = timezone.now()
    start_str = request.query_params.get('start_date')
    end_str = request.query_params.get('end_date')

    if start_str:
        try:
            start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
        except ValueError:
            start_date = (now - timedelta(days=30)).date()
    else:
        start_date = (now - timedelta(days=30)).date()

    if end_str:
        try:
            end_date = datetime.strptime(end_str, '%Y-%m-%d').date()
        except ValueError:
            end_date = now.date()
    else:
        end_date = now.date()

    if start_date > end_date:
        start_date, end_date = end_date, start_date

    # Build timezone-aware start and end datetime bounds
    current_tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start_date, time.min), current_tz)
    end_dt = timezone.make_aware(datetime.combine(end_date, time.max), current_tz)

    return start_dt, end_dt, start_date, end_date


def get_scoped_resources(user, resource_id=None):
    """
    Returns queryset of Resources scoped to the user's role:
    - admin, facility_mgr, superuser: all resources
    - dept_head: resources matching user's department
    - custodian: resources assigned to user as custodian
    - student, faculty: PermissionDenied
    """
    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    is_admin = bool(user.is_admin_role or user.is_facility_mgr_role or user.is_superuser)
    is_dept_head = bool(user.is_dept_head_role)
    is_custodian = bool(user.is_custodian_role)

    if not (is_admin or is_dept_head or is_custodian):
        raise PermissionDenied("Permission denied. Analytics is reserved for staff (Custodians, Department Heads, Facility Managers, Administrators).")

    if is_admin:
        qs = Resource.objects.select_related('resource_type', 'custodian').all()
    elif is_dept_head and user.department:
        dept = user.department.strip()
        qs = Resource.objects.select_related('resource_type', 'custodian').filter(
            models.Q(department__iexact=dept) |
            models.Q(custodian__department__iexact=dept)
        )
    elif is_custodian:
        qs = Resource.objects.select_related('resource_type', 'custodian').filter(custodian=user)
    else:
        qs = Resource.objects.none()

    if resource_id:
        try:
            rid = int(resource_id)
            qs = qs.filter(id=rid)
        except (ValueError, TypeError):
            pass

    return qs.distinct()


def calculate_analytics_data(user, request):
    start_dt, end_dt, start_date, end_date = parse_date_range(request)
    resource_id = request.query_params.get('resource_id')
    resources = list(get_scoped_resources(user, resource_id=resource_id))
    resource_ids = [r.id for r in resources]

    if not resource_ids:
        return {
            "summary": {
                "date_range": {
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "days_count": (end_date - start_date).days + 1
                },
                "total_resources": 0,
                "total_bookings": 0,
                "total_booked_hours": 0.0,
                "total_operating_hours": 0.0,
                "overall_utilization_rate": 0.0,
                "cancellation_rate": 0.0,
                "no_show_rate": 0.0,
            },
            "utilization_per_resource": [],
            "bookings_by_type": [],
            "peak_hours": [{"hour": f"{h:02d}:00", "hour_num": h, "count": 0} for h in range(8, 22)],
            "peak_weekdays": [{"weekday": d, "day": name, "count": 0} for d, name in enumerate(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])],
            "cancellation_no_show_stats": {
                "total_bookings": 0, "cancelled": 0, "no_show": 0, "approved": 0,
                "checked_in": 0, "completed": 0, "pending": 0, "rejected": 0,
                "cancellation_rate": 0.0, "no_show_rate": 0.0
            },
            "top_users": []
        }

    # Pre-fetch availability rules to compute operating hours per day
    rules_by_resource = {}
    for r in AvailabilityRule.objects.filter(active=True):
        rules_by_resource.setdefault(r.resource_id, []).append(r)
    global_rules = rules_by_resource.get(None, [])

    # Filter all bookings in the date range for scoped resources
    slots = BookingSlot.objects.filter(
        resource_id__in=resource_ids,
        is_active=True,
        period__overlap=models.Value(f"[{start_dt.isoformat()}, {end_dt.isoformat()}]")
    ).select_related(
        'booking', 'booking__requester', 'booking__resource', 'booking__resource__resource_type'
    ).prefetch_related('booking__consumables', 'booking__consumables__consumable')

    all_period_bookings = Booking.objects.filter(
        resource_id__in=resource_ids,
        created_at__gte=start_dt,
        created_at__lte=end_dt
    ).select_related('resource', 'requester', 'resource__resource_type')

    # 1. Utilization per resource
    num_days = max(1, (end_date - start_date).days + 1)
    booked_hours_by_res = {r.id: 0.0 for r in resources}
    bookings_count_by_res = {r.id: 0 for r in resources}

    for slot in slots:
        b = slot.booking
        if b.status in [Booking.STATUS_APPROVED, Booking.STATUS_CONFIRMED, Booking.STATUS_CHECKED_IN, Booking.STATUS_COMPLETED]:
            s_low = max(slot.period.lower, start_dt)
            s_high = min(slot.period.upper, end_dt)
            if s_high > s_low:
                dur_hours = (s_high - s_low).total_seconds() / 3600.0
                booked_hours_by_res[slot.resource_id] = booked_hours_by_res.get(slot.resource_id, 0.0) + dur_hours
                bookings_count_by_res[slot.resource_id] = bookings_count_by_res.get(slot.resource_id, 0) + 1

    utilization_list = []
    total_booked_hours = 0.0
    total_operating_hours = 0.0

    for r in resources:
        res_rules = rules_by_resource.get(r.id, global_rules)
        res_op_hours = 0.0
        cur_d = start_date
        while cur_d <= end_date:
            weekday = cur_d.weekday()
            day_rules = [rl for rl in res_rules if rl.day_of_week == weekday]
            if day_rules:
                for rl in day_rules:
                    st_mins = rl.start_time.hour * 60 + rl.start_time.minute
                    et_mins = rl.end_time.hour * 60 + rl.end_time.minute
                    res_op_hours += max(0, (et_mins - st_mins) / 60.0)
            else:
                res_op_hours += 12.0
            cur_d += timedelta(days=1)

        b_hours = round(booked_hours_by_res.get(r.id, 0.0), 2)
        total_booked_hours += b_hours
        total_operating_hours += res_op_hours

        rate = round((b_hours / res_op_hours) * 100.0, 2) if res_op_hours > 0 else 0.0
        rate = min(100.0, rate)

        utilization_list.append({
            "resource_id": r.id,
            "resource_name": r.name,
            "resource_type": r.resource_type.name,
            "capacity": r.capacity,
            "location": r.location,
            "department": r.department or "General",
            "booked_hours": b_hours,
            "operating_hours": round(res_op_hours, 1),
            "utilization_rate": rate,
            "booking_count": bookings_count_by_res.get(r.id, 0),
        })

    utilization_list.sort(key=lambda x: x["utilization_rate"], reverse=True)

    # 2. Bookings by resource type
    type_counts = {}
    total_slots_count = len(slots)
    for slot in slots:
        tname = slot.resource.resource_type.name
        type_counts[tname] = type_counts.get(tname, 0) + 1

    bookings_by_type = [
        {
            "type_name": tname,
            "count": cnt,
            "percentage": round((cnt / total_slots_count) * 100.0, 1) if total_slots_count > 0 else 0.0
        }
        for tname, cnt in sorted(type_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # 3. Peak hours & peak weekdays
    hour_counts = {h: 0 for h in range(8, 22)}
    weekday_counts = {d: 0 for d in range(7)}

    for slot in slots:
        start_local = slot.period.lower.astimezone(timezone.get_current_timezone())
        h = start_local.hour
        if 8 <= h <= 21:
            hour_counts[h] += 1
        w = start_local.weekday()
        if 0 <= w <= 6:
            weekday_counts[w] += 1

    peak_hours = [
        {"hour": f"{h:02d}:00", "hour_num": h, "count": hour_counts[h]}
        for h in range(8, 22)
    ]

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    peak_weekdays = [
        {"weekday": d, "day": day_names[d], "count": weekday_counts[d]}
        for d in range(7)
    ]

    # 4. Cancellation & No-Show Rates
    total_period_bookings = all_period_bookings.count()
    status_counts = {}
    for b in all_period_bookings:
        status_counts[b.status] = status_counts.get(b.status, 0) + 1

    cancelled_count = status_counts.get(Booking.STATUS_CANCELLED, 0)
    no_show_count = status_counts.get(Booking.STATUS_NO_SHOW, 0)
    approved_count = status_counts.get(Booking.STATUS_APPROVED, 0)
    checked_in_count = status_counts.get(Booking.STATUS_CHECKED_IN, 0)
    completed_count = status_counts.get(Booking.STATUS_COMPLETED, 0)
    pending_count = status_counts.get(Booking.STATUS_PENDING, 0)
    rejected_count = status_counts.get(Booking.STATUS_REJECTED, 0)

    cancellation_rate = round((cancelled_count / total_period_bookings) * 100.0, 2) if total_period_bookings > 0 else 0.0
    no_show_rate = round((no_show_count / total_period_bookings) * 100.0, 2) if total_period_bookings > 0 else 0.0

    cancellation_no_show_stats = {
        "total_bookings": total_period_bookings,
        "cancelled": cancelled_count,
        "no_show": no_show_count,
        "approved": approved_count,
        "checked_in": checked_in_count,
        "completed": completed_count,
        "pending": pending_count,
        "rejected": rejected_count,
        "cancellation_rate": cancellation_rate,
        "no_show_rate": no_show_rate,
    }

    # 5. Top Users
    user_stats = {}
    for slot in slots:
        u = slot.booking.requester
        if u.id not in user_stats:
            user_stats[u.id] = {
                "user_id": u.id,
                "username": u.username,
                "full_name": u.get_full_name() or u.username,
                "role": u.get_role_display(),
                "department": u.department or "General",
                "bookings_count": 0,
                "hours_booked": 0.0,
            }
        dur = (slot.period.upper - slot.period.lower).total_seconds() / 3600.0
        user_stats[u.id]["bookings_count"] += 1
        user_stats[u.id]["hours_booked"] += dur

    top_users = sorted(user_stats.values(), key=lambda x: x["bookings_count"], reverse=True)[:10]
    for tu in top_users:
        tu["hours_booked"] = round(tu["hours_booked"], 1)

    # 6. Overall Summary
    overall_utilization = round((total_booked_hours / total_operating_hours) * 100.0, 2) if total_operating_hours > 0 else 0.0
    overall_utilization = min(100.0, overall_utilization)

    summary = {
        "date_range": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days_count": num_days
        },
        "total_resources": len(resources),
        "total_bookings": total_slots_count,
        "total_booked_hours": round(total_booked_hours, 1),
        "total_operating_hours": round(total_operating_hours, 1),
        "overall_utilization_rate": overall_utilization,
        "cancellation_rate": cancellation_rate,
        "no_show_rate": no_show_rate,
    }

    return {
        "summary": summary,
        "utilization_per_resource": utilization_list,
        "bookings_by_type": bookings_by_type,
        "peak_hours": peak_hours,
        "peak_weekdays": peak_weekdays,
        "cancellation_no_show_stats": cancellation_no_show_stats,
        "top_users": top_users,
    }


def generate_bookings_csv(user, request):
    """
    Generates a CSV string containing detailed bookings in the given date range,
    strictly scoped to user's permissions.
    """
    start_dt, end_dt, start_date, end_date = parse_date_range(request)
    resource_id = request.query_params.get('resource_id')
    resources = get_scoped_resources(user, resource_id=resource_id)

    bookings = Booking.objects.filter(
        resource__in=resources,
        slots__is_active=True,
        slots__period__overlap=models.Value(f"[{start_dt.isoformat()}, {end_dt.isoformat()}]")
    ).select_related(
        'resource', 'requester', 'resource__resource_type'
    ).prefetch_related('slots', 'consumables', 'consumables__consumable').order_by('-created_at').distinct()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Booking ID", "Resource Name", "Category", "Location",
        "Department", "Requester Username", "Requester Name", "Role",
        "Status", "Booking Type", "Start Time", "End Time",
        "Duration (Hours)", "Purpose", "Consumables Allocated", "Created At"
    ])

    for b in bookings:
        slot = b.get_primary_slot()
        start_str = slot.period.lower.strftime('%Y-%m-%d %H:%M') if slot and slot.period else ""
        end_str = slot.period.upper.strftime('%Y-%m-%d %H:%M') if slot and slot.period else ""
        duration = round((slot.period.upper - slot.period.lower).total_seconds() / 3600.0, 2) if slot and slot.period else 0.0

        consumables_summary = "; ".join([
            f"{c.quantity}x {c.consumable.name}" for c in b.consumables.all()
        ]) or "None"

        writer.writerow([
            b.id,
            b.resource.name,
            b.resource.resource_type.name,
            b.resource.location,
            b.resource.department or "General",
            b.requester.username,
            b.requester.get_full_name() or b.requester.username,
            b.requester.get_role_display(),
            b.get_status_display(),
            b.get_kind_display(),
            start_str,
            end_str,
            duration,
            b.purpose,
            consumables_summary,
            b.created_at.strftime('%Y-%m-%d %H:%M:%S')
        ])

    return output.getvalue(), f"bookings_report_{start_date}_{end_date}.csv"


def generate_usage_csv(user, request):
    """
    Generates a CSV string containing resource utilization and metrics in the given date range,
    strictly scoped to user's permissions.
    """
    data = calculate_analytics_data(user, request)
    utilization_list = data["utilization_per_resource"]
    start_date = data["summary"]["date_range"]["start_date"]
    end_date = data["summary"]["date_range"]["end_date"]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Resource ID", "Resource Name", "Category", "Location",
        "Department", "Capacity", "Total Bookings", "Booked Hours",
        "Operating Hours", "Utilization Rate (%)"
    ])

    for r in utilization_list:
        writer.writerow([
            r["resource_id"],
            r["resource_name"],
            r["resource_type"],
            r["location"],
            r["department"],
            r["capacity"],
            r["booking_count"],
            r["booked_hours"],
            r["operating_hours"],
            f"{r['utilization_rate']}%"
        ])

    return output.getvalue(), f"resource_usage_report_{start_date}_{end_date}.csv"

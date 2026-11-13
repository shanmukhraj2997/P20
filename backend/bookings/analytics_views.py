"""
Analytics and Reporting Views.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.http import HttpResponse

from bookings.analytics import (
    calculate_analytics_data,
    generate_bookings_csv,
    generate_usage_csv
)


class AnalyticsDashboardView(APIView):
    """
    GET /api/analytics/dashboard/
    Retrieves aggregated utilization %, bookings by category, peak hours/weekdays,
    cancellation/no-show rates, and top users scoped to user role.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        data = calculate_analytics_data(request.user, request)
        return Response(data, status=status.HTTP_200_OK)


class BookingsCsvExportView(APIView):
    """
    GET /api/analytics/reports/bookings/export-csv/
    Generates and downloads a CSV export of bookings in the specified date range.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        csv_data, filename = generate_bookings_csv(request.user, request)
        response = HttpResponse(csv_data, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class UsageCsvExportView(APIView):
    """
    GET /api/analytics/reports/usage/export-csv/
    Generates and downloads a CSV export of resource utilization and capacity metrics.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        csv_data, filename = generate_usage_csv(request.user, request)
        response = HttpResponse(csv_data, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

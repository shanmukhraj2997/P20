from django.urls import path
from bookings.views import (
    BookingListCreateView, BookingDetailView, BookingCancelView,
    BookingManageListView, BookingCheckInView, BookingCheckOutView,
    CheckInDashboardView, BookingApproveView, BookingRejectView,
    UserBookingsIcsExportView, BookingIcsExportView,
    TimetableImportView, TimetableListView
)
from bookings.analytics_views import (
    AnalyticsDashboardView, BookingsCsvExportView, UsageCsvExportView
)

urlpatterns = [
    path('', BookingListCreateView.as_view(), name='booking-list-create'),
    path('export.ics', UserBookingsIcsExportView.as_view(), name='booking-export-ics'),
    path('manage/', BookingManageListView.as_view(), name='booking-manage-list'),
    path('check-in-dashboard/', CheckInDashboardView.as_view(), name='booking-check-in-dashboard'),
    path('timetable/import/', TimetableImportView.as_view(), name='timetable-import'),
    path('timetable/', TimetableListView.as_view(), name='timetable-list'),
    path('analytics/dashboard/', AnalyticsDashboardView.as_view(), name='booking-analytics-dashboard'),
    path('reports/bookings/export-csv/', BookingsCsvExportView.as_view(), name='booking-reports-bookings-csv'),
    path('reports/usage/export-csv/', UsageCsvExportView.as_view(), name='booking-reports-usage-csv'),
    path('<int:pk>/', BookingDetailView.as_view(), name='booking-detail'),
    path('<int:pk>/export.ics', BookingIcsExportView.as_view(), name='booking-detail-export-ics'),
    path('<int:pk>/cancel/', BookingCancelView.as_view(), name='booking-cancel'),
    path('<int:pk>/check-in/', BookingCheckInView.as_view(), name='booking-check-in'),
    path('<int:pk>/check-out/', BookingCheckOutView.as_view(), name='booking-check-out'),
    path('<int:pk>/approve/', BookingApproveView.as_view(), name='booking-approve'),
    path('<int:pk>/reject/', BookingRejectView.as_view(), name='booking-reject'),
]


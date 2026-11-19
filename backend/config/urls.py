from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from config.views import health_check, api_root
from bookings.views import TimetableImportView, TimetableListView
from bookings.analytics_views import AnalyticsDashboardView, BookingsCsvExportView, UsageCsvExportView
from resources.views import ConsumableListCreateView, ConsumableDetailView, ConsumableStockAdjustView
from accounts.views import NotificationListView, NotificationMarkReadView, NotificationMarkAllReadView

urlpatterns = [
    path('', api_root, name='api-root'),
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health-check'),
    path('api/accounts/', include('accounts.urls')),
    path('api/resources/', include('resources.urls')),
    path('api/bookings/', include('bookings.urls')),
    path('api/availability/', include('availability.urls')),
    path('api/permission-slips/', include('permissionslips.urls')),
    path('api/timetable/import/', TimetableImportView.as_view(), name='config-timetable-import'),
    path('api/timetable/', TimetableListView.as_view(), name='config-timetable-list'),
    path('api/consumables/', ConsumableListCreateView.as_view(), name='config-consumable-list'),
    path('api/consumables/<int:pk>/', ConsumableDetailView.as_view(), name='config-consumable-detail'),
    path('api/consumables/<int:pk>/adjust-stock/', ConsumableStockAdjustView.as_view(), name='config-consumable-adjust-stock'),
    path('api/notifications/', NotificationListView.as_view(), name='config-notification-list'),
    path('api/notifications/<int:pk>/read/', NotificationMarkReadView.as_view(), name='config-notification-mark-read'),
    path('api/notifications/mark-all-read/', NotificationMarkAllReadView.as_view(), name='config-notification-mark-all-read'),
    path('api/analytics/dashboard/', AnalyticsDashboardView.as_view(), name='config-analytics-dashboard'),
    path('api/analytics/reports/bookings/export-csv/', BookingsCsvExportView.as_view(), name='config-analytics-bookings-csv'),
    path('api/analytics/reports/usage/export-csv/', UsageCsvExportView.as_view(), name='config-analytics-usage-csv'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


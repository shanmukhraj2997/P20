from django.contrib import admin
from django.urls import path, include
from config.views import health_check

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health-check'),
    path('api/accounts/', include('accounts.urls')),
    path('api/resources/', include('resources.urls')),
    path('api/bookings/', include('bookings.urls')),
]

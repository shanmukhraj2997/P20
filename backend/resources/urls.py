from django.urls import path
from resources.views import (
    ResourceTypeListView, ResourceListCreateView, ResourceDetailView
)

from bookings.views import ResourceAvailabilityView

urlpatterns = [
    path('types/', ResourceTypeListView.as_view(), name='resource-type-list'),
    path('', ResourceListCreateView.as_view(), name='resource-list'),
    path('<int:pk>/', ResourceDetailView.as_view(), name='resource-detail'),
    path('<int:pk>/availability/', ResourceAvailabilityView.as_view(), name='resource-availability'),
]

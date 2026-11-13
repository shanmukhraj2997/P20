from django.urls import path
from resources.views import (
    ResourceTypeListView, ResourceListCreateView, ResourceDetailView,
    ConsumableListCreateView, ConsumableDetailView, ConsumableStockAdjustView
)

from bookings.views import ResourceAvailabilityView

from availability.views import BlackoutListCreateView, BlackoutDetailView

urlpatterns = [
    path('types/', ResourceTypeListView.as_view(), name='resource-type-list'),
    path('consumables/', ConsumableListCreateView.as_view(), name='consumable-list-create'),
    path('consumables/<int:pk>/', ConsumableDetailView.as_view(), name='consumable-detail'),
    path('consumables/<int:pk>/adjust-stock/', ConsumableStockAdjustView.as_view(), name='consumable-adjust-stock'),
    path('maintenance/', BlackoutListCreateView.as_view(), name='resource-maintenance-list'),
    path('maintenance/<int:pk>/', BlackoutDetailView.as_view(), name='resource-maintenance-detail'),
    path('', ResourceListCreateView.as_view(), name='resource-list'),
    path('<int:pk>/', ResourceDetailView.as_view(), name='resource-detail'),
    path('<int:pk>/availability/', ResourceAvailabilityView.as_view(), name='resource-availability'),
]

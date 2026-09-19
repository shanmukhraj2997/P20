from django.urls import path
from bookings.views import (
    BookingListCreateView, BookingDetailView, BookingCancelView, BookingManageListView
)

urlpatterns = [
    path('', BookingListCreateView.as_view(), name='booking-list-create'),
    path('manage/', BookingManageListView.as_view(), name='booking-manage-list'),
    path('<int:pk>/', BookingDetailView.as_view(), name='booking-detail'),
    path('<int:pk>/cancel/', BookingCancelView.as_view(), name='booking-cancel'),
]

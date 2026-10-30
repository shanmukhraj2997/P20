from django.urls import path
from bookings.views import (
    BookingListCreateView, BookingDetailView, BookingCancelView,
    BookingManageListView, BookingQRCodeView, BookingCheckInView,
    BookingTokenCheckInView
)

urlpatterns = [
    path('', BookingListCreateView.as_view(), name='booking-list-create'),
    path('manage/', BookingManageListView.as_view(), name='booking-manage-list'),
    path('check-in/', BookingTokenCheckInView.as_view(), name='booking-token-check-in'),
    path('<int:pk>/', BookingDetailView.as_view(), name='booking-detail'),
    path('<int:pk>/cancel/', BookingCancelView.as_view(), name='booking-cancel'),
    path('<int:pk>/qr/', BookingQRCodeView.as_view(), name='booking-qr'),
    path('<int:pk>/check-in/', BookingCheckInView.as_view(), name='booking-check-in'),
]

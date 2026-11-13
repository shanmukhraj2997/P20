from django.urls import path
from availability.views import BlackoutListCreateView, BlackoutDetailView

urlpatterns = [
    path('blackouts/', BlackoutListCreateView.as_view(), name='blackout-list-create'),
    path('blackouts/<int:pk>/', BlackoutDetailView.as_view(), name='blackout-detail'),
    path('maintenance/', BlackoutListCreateView.as_view(), name='maintenance-list-create'),
    path('maintenance/<int:pk>/', BlackoutDetailView.as_view(), name='maintenance-detail'),
]

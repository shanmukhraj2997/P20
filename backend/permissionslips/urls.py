from django.urls import path
from permissionslips.views import (
    PermissionSlipListCreateView,
    PermissionSlipDetailView,
    PermissionSlipReviewView,
    PermissionSlipVerifyView,
    PermissionSlipRejectView,
    PermissionSlipConflictCheckView,
    PermissionSlipAllocateView,
)

urlpatterns = [
    path('', PermissionSlipListCreateView.as_view(), name='permission-slip-list-create'),
    path('<int:pk>/', PermissionSlipDetailView.as_view(), name='permission-slip-detail'),
    path('<int:pk>/review/', PermissionSlipReviewView.as_view(), name='permission-slip-review'),
    path('<int:pk>/verify/', PermissionSlipVerifyView.as_view(), name='permission-slip-verify'),
    path('<int:pk>/reject/', PermissionSlipRejectView.as_view(), name='permission-slip-reject'),
    path('<int:pk>/conflicts/', PermissionSlipConflictCheckView.as_view(), name='permission-slip-conflicts'),
    path('<int:pk>/allocate/', PermissionSlipAllocateView.as_view(), name='permission-slip-allocate'),
]

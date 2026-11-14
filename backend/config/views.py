from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Health check API endpoint.
    Returns {"status": "ok"} when Django backend is operating normally.
    """
    return Response({"status": "ok"})

@api_view(['GET'])
@permission_classes([AllowAny])
def api_root(request):
    """
    Root entry point displaying API status and available endpoints.
    """
    return Response({
        "project": "P20 Campus Resource, Laboratory & Facility Booking Platform",
        "status": "online",
        "institution": "Lovely Professional University (LPU)",
        "admin_portal": "/admin/",
        "endpoints": {
            "health": "/api/health/",
            "resources": "/api/resources/",
            "bookings": "/api/bookings/",
            "availability": "/api/availability/",
            "timetable": "/api/timetable/",
            "consumables": "/api/consumables/",
            "notifications": "/api/notifications/",
            "analytics": "/api/analytics/dashboard/",
        }
    })

from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from accounts.models import User
from accounts.serializers import UserSerializer, RegisterSerializer, LoginSerializer

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            "message": "User registered successfully.",
            "token": token.key,
            "user": UserSerializer(user).data
        }, status=status.HTTP_201_CREATED)

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            "token": token.key,
            "user": UserSerializer(user).data
        }, status=status.HTTP_200_OK)

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            request.user.auth_token.delete()
        except Exception:
            pass
        return Response({"message": "Successfully logged out."}, status=status.HTTP_200_OK)

class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

class RoleListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        roles = [{"code": code, "label": label} for code, label in User.ROLE_CHOICES]
        return Response(roles, status=status.HTTP_200_OK)

class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        from resources.models import Resource
        from bookings.models import Booking, BookingSlot
        from bookings.serializers import BookingSerializer
        from django.utils import timezone

        now = timezone.now()
        total_resources = Resource.objects.count()
        available_resources = Resource.objects.filter(status=Resource.STATUS_AVAILABLE).count()

        user_bookings = Booking.objects.filter(requester=request.user)
        my_bookings_count = user_bookings.count()

        # Count active upcoming bookings for this user using database filtering
        upcoming_count = Booking.objects.filter(
            requester=request.user,
            status__in=[Booking.STATUS_APPROVED, Booking.STATUS_PENDING],
            slots__is_active=True,
            slots__period__endswith__gte=now
        ).distinct().count()

        system_active_slots = BookingSlot.objects.filter(is_active=True).count()
        pending_bookings = user_bookings.filter(status=Booking.STATUS_PENDING).count()

        pending_approvals = 0
        if request.user.is_admin_role or request.user.is_facility_mgr_role or request.user.is_superuser:
            pending_approvals = Booking.objects.filter(status=Booking.STATUS_PENDING).count()
        elif request.user.is_custodian_role:
            pending_approvals = Booking.objects.filter(resource__custodian=request.user, status=Booking.STATUS_PENDING).count()
        elif request.user.is_dept_head_role and request.user.department:
            pending_approvals = Booking.objects.filter(resource__department=request.user.department, status=Booking.STATUS_PENDING).count()

        recent_bookings = user_bookings.select_related('resource', 'requester').prefetch_related('slots').order_by('-created_at')[:3]
        recent_data = BookingSerializer(recent_bookings, many=True).data

        return Response({
            "total_resources": total_resources,
            "available_resources": available_resources,
            "my_bookings": my_bookings_count,
            "upcoming_bookings": upcoming_count,
            "pending_bookings": pending_bookings,
            "pending_approvals": pending_approvals,
            "system_active_reservations": system_active_slots,
            "recent_bookings": recent_data,
        }, status=status.HTTP_200_OK)


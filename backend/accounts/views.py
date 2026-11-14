from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from django.db import models
from django.shortcuts import get_object_or_404
from accounts.models import User, Notification
from accounts.serializers import (
    UserSerializer, RegisterSerializer, LoginSerializer, UserRoleUpdateSerializer,
    NotificationSerializer
)

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
            status__in=[
                Booking.STATUS_APPROVED,
                Booking.STATUS_CONFIRMED,
                Booking.STATUS_CHECKED_IN,
                Booking.STATUS_PENDING,
            ],
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
            pending_approvals = Booking.objects.filter(
                models.Q(resource__department__iexact=request.user.department) |
                models.Q(resource__custodian__department__iexact=request.user.department),
                status=Booking.STATUS_PENDING
            ).count()

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

class UserRoleUpdateView(APIView):
    """
    Admin-only endpoint to update a user's role.
    PATCH /api/accounts/users/<id>/role/
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, *args, **kwargs):
        if not (request.user.is_admin_role or request.user.is_superuser):
            return Response(
                {"detail": "Only administrators can modify user roles."},
                status=status.HTTP_403_FORBIDDEN
            )
        target_user = get_object_or_404(User, pk=pk)
        serializer = UserRoleUpdateSerializer(target_user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(target_user).data, status=status.HTTP_200_OK)

class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        qs = Notification.objects.filter(user=request.user)
        unread_only = request.query_params.get('unread_only') in ['true', '1']
        if unread_only:
            qs = qs.filter(read=False)

        unread_count = Notification.objects.filter(user=request.user, read=False).count()
        serializer = NotificationSerializer(qs[:50], many=True)
        return Response({
            "unread_count": unread_count,
            "results": serializer.data
        }, status=status.HTTP_200_OK)

class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, *args, **kwargs):
        notification = get_object_or_404(Notification, pk=pk, user=request.user)
        notification.read = True
        notification.save(update_fields=['read'])
        return Response({
            "message": "Notification marked as read.",
            "notification": NotificationSerializer(notification).data
        }, status=status.HTTP_200_OK)

class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        updated_count = Notification.objects.filter(user=request.user, read=False).update(read=True)
        return Response({
            "message": f"All {updated_count} unread notifications marked as read.",
            "marked_count": updated_count
        }, status=status.HTTP_200_OK)

class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        identifier = (request.data.get('email_or_username') or request.data.get('email') or request.data.get('username') or '').strip()
        if not identifier:
            return Response({"detail": "Please provide your registered username or email."}, status=status.HTTP_400_BAD_REQUEST)

        # Lookup user by username or email (case-insensitive)
        user = User.objects.filter(models.Q(username__iexact=identifier) | models.Q(email__iexact=identifier)).first()
        if not user:
            # Fallback check for demo_<identifier>
            user = User.objects.filter(username__iexact=f"demo_{identifier}").first()

        if not user:
            return Response({"detail": f"No account found with username or email '{identifier}'."}, status=status.HTTP_404_NOT_FOUND)

        token = default_token_generator.make_token(user)

        # Attempt sending email if SMTP is configured
        try:
            if getattr(settings, 'EMAIL_HOST_USER', None):
                send_mail(
                    subject="LPU Campus Booking - Password Reset Request",
                    message=f"Hello {user.first_name or user.username},\n\nYour password reset verification code is: {token}\n\nUse this code to set a new password on the portal.",
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@lpu.co.in'),
                    recipient_list=[user.email] if user.email else [],
                    fail_silently=True,
                )
        except Exception:
            pass

        return Response({
            "message": "Password reset token generated successfully.",
            "username": user.username,
            "email": user.email,
            "reset_token": token
        }, status=status.HTTP_200_OK)

class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        username = (request.data.get('username') or '').strip()
        token = (request.data.get('token') or '').strip()
        new_password = (request.data.get('new_password') or '').strip()

        if not username or not new_password:
            return Response({"detail": "Username and new password are required."}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 6:
            return Response({"detail": "Password must be at least 6 characters long."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(username__iexact=username).first()
        if not user:
            user = User.objects.filter(username__iexact=f"demo_{username}").first()

        if not user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        # Validate token if provided
        if token and not default_token_generator.check_token(user, token):
            return Response({"detail": "Invalid or expired reset token."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        try:
            # Delete old auth token so user logs in afresh
            Token.objects.filter(user=user).delete()
        except Exception:
            pass

        Notification.objects.create(
            user=user,
            type=Notification.TYPE_GENERAL,
            title="Password Changed",
            message="Your account password was successfully reset."
        )

        return Response({
            "message": "Password has been successfully reset! You can now log in with your new password."
        }, status=status.HTTP_200_OK)



